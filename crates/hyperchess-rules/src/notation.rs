// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-rules
// File: crates/hyperchess-rules/src/notation.rs
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

//! HFEN-I / HPGN-I game file import & export.
//!
//! This is the single, canonical entry point for reading and writing
//! HyperChess games. Standard chess FEN/PGN compatibility is intentionally
//! **not** provided: HyperChess is a 12×12 variant with two extra piece
//! types (Eagle, Hawk) and identity-tracked promotions, none of which have a
//! faithful encoding in the classic formats.
//!
//! **Self-contained law.** A notation string carries everything needed to
//! reconstruct the position or resolve the move — no side table, no lookup,
//! and no defaulting of a field that could not be read. In particular the
//! identity prefix on an HPGN-I move is *verified* against the piece on the
//! source square during replay, not merely carried.
//!
//! Reference: `docs/FORMATS.md` in this repository, and the normative
//! `docs/baremetal-hyperchess-notations-v01.md` in the workspace.
//!
//! [`GameRecord`] is the class every crate under `src/` should use to
//! import/export a game:
//! - `.hpgni` — tag pairs + numbered HPGN-I movetext (`to_hpgni`/`from_hpgni`).
//! - `.hfeni` — every HFEN-I position of the game, one per line, produced by
//!   replaying `start_hfen` through `moves` (`to_hfeni`/`positions`).

use crate::board::Board;
use crate::core::piece_move::{split_identity, HyperMove};
use std::fs;
use std::io;

/// A full HyperChess game: metadata tags, the starting HFEN-I position, and
/// the HPGN-I move list (one entry per ply).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameRecord {
    /// HPGN `Event` tag.
    pub event: String,
    /// HPGN `Site` tag.
    pub site: String,
    /// HPGN `Date` tag, conventionally `YYYY.MM.DD`.
    pub date: String,
    /// White player or engine name.
    pub white: String,
    /// Black player or engine name.
    pub black: String,
    /// `"1-0"` | `"0-1"` | `"1/2-1/2"` | `"*"` (in progress / unknown).
    pub result: String,
    /// Position the move list starts from. Stored rather than assumed so
    /// analysis fragments and non-standard starts round-trip correctly.
    pub start_hfen: String,
    /// One HPGN-I string per ply, e.g. `"M:a3a4"`, or plain UCI (`"a3a4"`) if
    /// no identity was tracked at the source square.
    pub moves: Vec<String>,
}

impl GameRecord {
    /// A new, empty game starting from the standard HyperChess position.
    pub fn new(white: &str, black: &str) -> Self {
        GameRecord {
            event: "HyperChess".to_string(),
            site: "-".to_string(),
            date: "-".to_string(),
            white: white.to_string(),
            black: black.to_string(),
            result: "*".to_string(),
            start_hfen: Board::start_pos().get_hfen(),
            moves: Vec::new(),
        }
    }

    /// Append one ply. Takes the move already rendered as HPGN-I — the record
    /// is a container and does no legality checking here; that only happens on
    /// replay in [`GameRecord::positions`].
    pub fn push_move(&mut self, hpgn_i_move: impl Into<String>) {
        self.moves.push(hpgn_i_move.into());
    }

    // ── HPGN-I (movetext) ──────────────────────────────────────────────────

    /// Serialize to the canonical `.hpgni` text: tag pairs, a blank line,
    /// then numbered HPGN-I movetext (not SAN) terminated by the result.
    pub fn to_hpgni(&self) -> String {
        let mut out = String::new();
        out.push_str(&format!("[Event \"{}\"]\n", escape(&self.event)));
        out.push_str(&format!("[Site \"{}\"]\n", escape(&self.site)));
        out.push_str(&format!("[Date \"{}\"]\n", escape(&self.date)));
        out.push_str(&format!("[White \"{}\"]\n", escape(&self.white)));
        out.push_str(&format!("[Black \"{}\"]\n", escape(&self.black)));
        out.push_str(&format!("[Result \"{}\"]\n", escape(&self.result)));
        out.push_str(&format!("[HFEN \"{}\"]\n", escape(&self.start_hfen)));
        out.push('\n');
        for (i, mv) in self.moves.iter().enumerate() {
            if i % 2 == 0 {
                out.push_str(&format!("{}. ", i / 2 + 1));
            }
            out.push_str(mv);
            out.push(' ');
        }
        out.push_str(&self.result);
        out.push('\n');
        out
    }

    /// Parse `.hpgni` text back into a `GameRecord`. Movetext tokens may be
    /// HPGN-I (`M:a3a4`) or plain UCI (`a3a4`) — both round-trip.
    pub fn from_hpgni(text: &str) -> Result<Self, String> {
        let mut rec = GameRecord::new("?", "?");

        let mut movetext_lines = Vec::new();
        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix('[') {
                let rest = rest.strip_suffix(']').unwrap_or(rest);
                if let Some((key, value)) = parse_tag(rest) {
                    match key {
                        "Event" => rec.event = value,
                        "Site" => rec.site = value,
                        "Date" => rec.date = value,
                        "White" => rec.white = value,
                        "Black" => rec.black = value,
                        "Result" => rec.result = value,
                        "HFEN" => rec.start_hfen = value,
                        _ => {}
                    }
                }
            } else {
                movetext_lines.push(trimmed);
            }
        }

        let text_joined = movetext_lines.join(" ");
        for tok in text_joined.split_whitespace() {
            if is_move_number(tok) {
                continue;
            }
            if matches!(tok, "1-0" | "0-1" | "1/2-1/2" | "*") {
                rec.result = tok.to_string();
                continue;
            }
            rec.moves.push(tok.to_string());
        }
        Ok(rec)
    }

    /// Write the game as HPGN-I movetext to `path`.
    pub fn save_hpgni(&self, path: &str) -> io::Result<()> {
        fs::write(path, self.to_hpgni())
    }

    /// Read an HPGN-I file back into a record. Does not validate that the
    /// moves are legal; call [`GameRecord::positions`] for that.
    pub fn load_hpgni(path: &str) -> Result<Self, String> {
        let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
        Self::from_hpgni(&text)
    }

    // ── HFEN-I (position replay) ───────────────────────────────────────────

    /// Replay `start_hfen` through `moves` and return every HFEN-I position
    /// in the game. `positions()[0]` is the start; `positions()[i]` is the
    /// position after ply `i`.
    pub fn positions(&self) -> Result<Vec<String>, String> {
        let mut board = Board::from_hfen(&self.start_hfen)?;
        let mut out = Vec::with_capacity(self.moves.len() + 1);
        out.push(board.get_hfen());
        for (i, mv) in self.moves.iter().enumerate() {
            let (claimed_identity, uci) = split_identity(mv);
            let legal = board.generate_moves();
            let found = legal
                .iter()
                .find(|m| m.stringify() == uci)
                .copied()
                .ok_or_else(|| format!("move {}: '{}' is not legal", i + 1, mv))?;

            // The identity prefix is a claim about *which piece* moved, and it
            // is checked, not trusted. Read it from the source square before
            // the move is applied — afterwards the square is empty.
            if let Some(claimed) = claimed_identity {
                let actual = board.piece_identity_at(found.get_src());
                if actual != Some(claimed) {
                    return Err(format!(
                        "move {}: '{}' claims identity '{}' on {}, but that square holds {}",
                        i + 1,
                        mv,
                        claimed,
                        found.get_src().notation(),
                        match actual {
                            Some(c) => format!("'{c}'"),
                            None => "no tracked identity".to_string(),
                        }
                    ));
                }
            }

            board.apply_move(found);
            out.push(board.get_hfen());
        }
        Ok(out)
    }

    /// Replay the full game and return the final HFEN-I position.
    pub fn final_hfen(&self) -> Result<String, String> {
        self.positions()?
            .pop()
            .ok_or_else(|| "empty position list".to_string())
    }

    /// Serialize every position of the game as HFEN-I, one per line (start
    /// position first).
    pub fn to_hfeni(&self) -> Result<String, String> {
        Ok(self.positions()?.join("\n") + "\n")
    }

    /// Replay the game and write every position to `path`, one HFEN-I per
    /// line. Fails if any recorded move turns out to be illegal.
    pub fn save_hfeni(&self, path: &str) -> Result<(), String> {
        let text = self.to_hfeni()?;
        fs::write(path, text).map_err(|e| e.to_string())
    }

    /// Load a `.hfeni` file back into its list of HFEN-I position strings.
    pub fn load_hfeni_positions(path: &str) -> Result<Vec<String>, String> {
        let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
        Ok(text
            .lines()
            .filter(|l| !l.is_empty())
            .map(|l| l.to_string())
            .collect())
    }
}

// ── Free functions ──────────────────────────────────────────────────────────

/// Parse an HFEN-I position string into a `Board`.
pub fn parse_hfen_i(hfen: &str) -> Result<Board, String> {
    Board::from_hfen(hfen)
}

/// Serialize a `Board` to its canonical HFEN-I position string.
pub fn serialize_hfen_i(board: &Board) -> String {
    board.get_hfen()
}

/// Build the HPGN-I string for `m`. Identity must be read from the source
/// square on `board` *before* `m` is applied.
pub fn move_to_hpgn_i(board: &Board, m: HyperMove) -> String {
    m.stringify_with_identity(board.piece_identity_at(m.get_src()))
}

fn escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn parse_tag(s: &str) -> Option<(&str, String)> {
    let (key, rest) = s.split_once(' ')?;
    let value = rest.trim().trim_matches('"').to_string();
    Some((key, value))
}

fn is_move_number(tok: &str) -> bool {
    tok.strip_suffix('.')
        .map(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::masks::START_HFEN;

    #[test]
    fn hpgni_round_trip_preserves_tags_and_moves() {
        let mut rec = GameRecord::new("Alice", "Bob");
        rec.result = "1-0".to_string();
        rec.push_move("M:a3a4");
        rec.push_move("m:a10a9");

        let text = rec.to_hpgni();
        let parsed = GameRecord::from_hpgni(&text).unwrap();

        assert_eq!(parsed.white, "Alice");
        assert_eq!(parsed.black, "Bob");
        assert_eq!(parsed.result, "1-0");
        assert_eq!(parsed.start_hfen, rec.start_hfen);
        assert_eq!(parsed.moves, vec!["M:a3a4", "m:a10a9"]);
    }

    #[test]
    fn hpgni_file_round_trip() {
        let mut rec = GameRecord::new("W", "B");
        rec.push_move("M:a3a4");
        let path = std::env::temp_dir().join(format!(
            "hyperchess_notation_test_{}.hpgni",
            std::process::id()
        ));
        let path_str = path.to_str().unwrap();

        rec.save_hpgni(path_str).unwrap();
        let loaded = GameRecord::load_hpgni(path_str).unwrap();
        assert_eq!(loaded.moves, rec.moves);

        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn positions_replays_moves_into_hfen_i() {
        let mut rec = GameRecord::new("W", "B");
        assert_eq!(rec.start_hfen, START_HFEN);
        rec.push_move("a3a4");

        let positions = rec.positions().unwrap();
        assert_eq!(positions.len(), 2);
        assert_eq!(positions[0], rec.start_hfen);
        assert_ne!(positions[1], positions[0]);

        let final_fen = rec.final_hfen().unwrap();
        assert_eq!(final_fen, positions[1]);
    }

    #[test]
    fn positions_rejects_illegal_move() {
        let mut rec = GameRecord::new("W", "B");
        rec.push_move("a1a2"); // a1 is empty at the start
        assert!(rec.positions().is_err());
    }

    #[test]
    fn hfeni_save_and_load_round_trips_positions() {
        let mut rec = GameRecord::new("W", "B");
        rec.push_move("a3a4");
        rec.push_move("a10a9");

        let path = std::env::temp_dir().join(format!(
            "hyperchess_notation_test_{}.hfeni",
            std::process::id()
        ));
        let path_str = path.to_str().unwrap();

        rec.save_hfeni(path_str).unwrap();
        let loaded = GameRecord::load_hfeni_positions(path_str).unwrap();
        let expected = rec.positions().unwrap();
        assert_eq!(loaded, expected);

        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn move_to_hpgn_i_reads_identity_before_applying() {
        let board = Board::from_hfen(START_HFEN).unwrap();
        let m = board
            .generate_moves()
            .iter()
            .find(|m| m.stringify() == "a3a4")
            .copied()
            .unwrap();
        let hpgn_i = move_to_hpgn_i(&board, m);
        assert!(hpgn_i.ends_with(":a3a4") || hpgn_i == "a3a4");
    }
}
