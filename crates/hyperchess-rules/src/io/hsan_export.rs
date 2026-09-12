// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-rules
// File: crates/hyperchess-rules/src/io/hsan_export.rs
// Version: 2.0.0
// Copyright (c) 2026 HyperChess Developer Team

//! Export HyperMove to HSAN (HyperChess Standard Algebraic Notation).
//!
//! **Self-contained law.** An HSAN string must identify exactly one legal move
//! in the position it was produced for, using only the characters in the
//! string — no side table, no lookup. On a 12×12 board with two Eagles, two
//! Hawks, two Rooks, two Knights, two Bishops and twelve promotable pawns per
//! side, that means disambiguation is mandatory, not optional: whenever two
//! same-type pieces can reach the same square, the source file (or rank, when
//! the file is shared) is written into the string.
//!
//! Grammar produced by [`hypermove_to_hsan`]:
//!
//! ```text
//! hsan     := castle | normal
//! castle   := ( "O-O" | "O-O-O" ) marker?
//! normal   := piece? disamb? "x"? dest promo? marker?
//! piece    := "K" | "Q" | "R" | "B" | "N" | "E" | "H"     (omitted for pawns)
//! disamb   := file | rank | file rank
//! dest     := file rank
//! file     := "a".."l"
//! rank     := "1".."9" | "10" | "11" | "12"
//! promo    := "=" ( "Q" | "R" | "B" | "N" | "E" | "H" )
//! marker   := "+" | "#"
//! ```
//!
//! Note that ranks 10–12 are **two digits**. Nothing in this module may locate
//! the destination by a fixed offset from the end of the string; the capture
//! marker is placed by construction, never by `insert`.

use crate::board::Board;
use crate::core::piece_move::HyperMove;
use crate::core::sq::SQ;
use crate::core::{Piece, PieceType};

/// Render `sq` as a HSAN coordinate (`a1` … `l12`).
fn square_notation(sq: SQ) -> String {
    format!("{}{}", (b'a' + sq.0 % 12) as char, sq.0 / 12 + 1)
}

/// The `+` / `#` suffix for the position `m` leads to, or `""`.
///
/// Computed on a clone so the caller's board is never mutated; `Board` is
/// `Clone`, and this is the only correct way to learn whether a move gives
/// check or mate without an already-applied position.
fn check_marker(board: &Board, m: HyperMove) -> &'static str {
    let mut next = board.clone();
    next.apply_move(m);
    if !next.in_check() {
        return "";
    }
    if next.generate_moves().iter().count() == 0 {
        "#"
    } else {
        "+"
    }
}

/// The disambiguation infix for `m`: `""`, a source file, a source rank, or
/// both.
///
/// Mirrors orthodox SAN's rule, but over this board's piece set: consider
/// every *other* legal move by a piece of the same type to the same
/// destination. If none exists, no disambiguation is needed. Otherwise prefer
/// the source file; if a rival shares that file, use the source rank; if
/// rivals share both individually, write file and rank together.
fn disambiguation(board: &Board, m: HyperMove, piece: Piece) -> String {
    let (_, pt) = piece.player_piece_lossy();
    let src = m.get_src();
    let dest = m.get_dest();

    let rivals: Vec<SQ> = board
        .generate_moves()
        .iter()
        .filter(|other| other.get_dest() == dest && other.get_src() != src)
        .filter(|other| board.piece_at(other.get_src()).player_piece_lossy().1 == pt)
        .map(|other| other.get_src())
        .collect();

    if rivals.is_empty() {
        return String::new();
    }

    let src_file = src.0 % 12;
    let src_rank = src.0 / 12;
    let file_is_unique = !rivals.iter().any(|r| r.0 % 12 == src_file);
    let rank_is_unique = !rivals.iter().any(|r| r.0 / 12 == src_rank);

    if file_is_unique {
        ((b'a' + src_file) as char).to_string()
    } else if rank_is_unique {
        (src_rank + 1).to_string()
    } else {
        format!("{}{}", (b'a' + src_file) as char, src_rank + 1)
    }
}

/// Convert a [`HyperMove`] to its HSAN string, as played in `board`.
///
/// `m` must be legal in `board`; the identity of the moving piece is read from
/// `m.get_src()` before anything is applied.
pub fn hypermove_to_hsan(board: &Board, m: HyperMove) -> String {
    if m.is_king_castle() {
        return format!("O-O{}", check_marker(board, m));
    }
    if m.is_queen_castle() {
        return format!("O-O-O{}", check_marker(board, m));
    }

    let src = m.get_src();
    let piece = board.piece_at(src);
    let (_, pt) = piece.player_piece_lossy();
    let is_pawn = pt == PieceType::P;

    let mut hsan = String::new();

    // Piece letter — always uppercase, omitted for pawns (as in orthodox SAN).
    if !is_pawn && piece != Piece::None {
        hsan.push(pt.char_lower().to_ascii_uppercase());
    }

    // Disambiguation. A capturing pawn always writes its source file (`axb3`),
    // which is orthodox SAN's rule and also all the disambiguation a pawn
    // capture can need.
    if is_pawn {
        if m.is_capture() {
            hsan.push((b'a' + src.0 % 12) as char);
        }
    } else {
        hsan.push_str(&disambiguation(board, m, piece));
    }

    // Capture marker — immediately before the destination, by construction.
    if m.is_capture() {
        hsan.push('x');
    }

    hsan.push_str(&square_notation(m.get_dest()));

    if m.is_promo() {
        hsan.push('=');
        hsan.push(m.promo_piece().char_lower().to_ascii_uppercase());
    }

    hsan.push_str(check_marker(board, m));

    hsan
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::masks::START_HFEN;

    // Ranks are listed 12 (first) down to 1 (last). Identity letters, not type
    // letters: `C`/`c` are the rooks from c2/c11, `D`/`I` the knights from
    // d2/i2, `A` the eagle from a2, `B` the hawk from b2, `G`/`g` the kings.
    const ROOK_TAKES_ON_RANK_10: &str = "6g5/12/3c8/12/12/12/12/12/3C8/12/12/6G5 w - - 0 1";
    const TWO_KNIGHTS: &str = "6g5/12/12/12/12/12/3D1I6/12/12/12/12/6G5 w - - 0 1";

    fn hsan_for(hfen: &str, uci: &str) -> String {
        let board = Board::from_hfen(hfen).expect("test HFEN parses");
        let m = board
            .generate_moves()
            .iter()
            .find(|m| m.stringify() == uci)
            .copied()
            .unwrap_or_else(|| panic!("{uci} is not legal in {hfen}"));
        hypermove_to_hsan(&board, m)
    }

    #[test]
    fn capture_marker_precedes_a_two_digit_destination() {
        // The bug this replaced produced "Rdx10" by inserting 'x' two chars
        // from the end of "Rd10".
        assert_eq!(hsan_for(ROOK_TAKES_ON_RANK_10, "d4d10"), "Rxd10");
    }

    #[test]
    fn quiet_move_to_a_two_digit_rank() {
        assert_eq!(hsan_for(ROOK_TAKES_ON_RANK_10, "d4d9"), "Rd9");
    }

    #[test]
    fn same_type_pieces_are_disambiguated() {
        // Knights on d6 and f6 both reach e8; each must say which one moved.
        assert_eq!(hsan_for(TWO_KNIGHTS, "d6e8"), "Nde8");
        assert_eq!(hsan_for(TWO_KNIGHTS, "f6e8"), "Nfe8");
    }

    #[test]
    fn no_two_legal_moves_share_a_hsan_string() {
        for hfen in [START_HFEN, ROOK_TAKES_ON_RANK_10, TWO_KNIGHTS] {
            let board = Board::from_hfen(hfen).expect("test HFEN parses");
            let mut seen = std::collections::HashMap::<String, String>::new();
            for m in board.generate_moves().iter() {
                let hsan = hypermove_to_hsan(&board, *m);
                if let Some(prev) = seen.insert(hsan.clone(), m.stringify()) {
                    panic!("HSAN {hsan:?} is ambiguous in {hfen}: {prev} and {}", m.stringify());
                }
            }
        }
    }

    #[test]
    fn pawn_capture_writes_its_source_file() {
        // Black pawn `n` on b10 is captured by the white pawn `M` from a9.
        let hfen = "6g5/12/1n10/M11/12/12/12/12/12/12/12/6G5 w - - 0 1";
        assert_eq!(hsan_for(hfen, "a9b10"), "axb10");
    }

    #[test]
    fn promotion_writes_the_target_type() {
        // White pawn `M` on a11 promotes on a12.
        let hfen = "12/M11/6g5/12/12/12/12/12/12/12/6G5/12 w - - 0 1";
        assert_eq!(hsan_for(hfen, "a11a12q"), "a12=Q");
        assert_eq!(hsan_for(hfen, "a11a12e"), "a12=E");
        assert_eq!(hsan_for(hfen, "a11a12h"), "a12=H");
    }

    #[test]
    fn eagle_and_hawk_get_their_own_letters() {
        // `A` is the eagle from a2, `B` the hawk from b2.
        let eagle = "6g5/12/12/12/12/12/12/12/A11/12/12/6G5 w - - 0 1";
        assert_eq!(hsan_for(eagle, "a4a8"), "Ea8");
        let hawk = "6g5/12/12/12/12/12/12/12/B11/12/12/6G5 w - - 0 1";
        assert_eq!(hsan_for(hawk, "a4d7"), "Hd7");
    }
}
