// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-rules
// File: crates/hyperchess-rules/tests/test_notation_law.rs
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

//! Regression tests for the **self-contained notation law**:
//!
//! > A HyperChess notation string is self-contained. Everything needed to
//! > reconstruct the position or the move is inside the string. No side table,
//! > no lookup, no defaulting of a field that could not be read.
//!
//! Each test below pins a concrete way the law used to be broken. See
//! `docs/baremetal-hyperchess-notations-v01.md` for the normative definition.

use hyperchess_rules::board::Board;
use hyperchess_rules::core::masks::START_HFEN;
use hyperchess_rules::core::piece_move::split_identity;
use hyperchess_rules::notation::GameRecord;

const CANONICAL_START: &str =
    "12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1";

// ── HFEN-I: a field that cannot be read is an error, never a default ───────

#[test]
fn the_start_constant_is_the_canonical_string() {
    assert_eq!(START_HFEN, CANONICAL_START);
    // ... and it round-trips byte-identically.
    let board = Board::from_hfen(START_HFEN).expect("start parses");
    assert_eq!(board.get_hfen(), CANONICAL_START);
}

#[test]
fn the_start_position_can_castle() {
    // Regression: the constant once carried `-` here, and because castling
    // rights are only ever cleared, never set, no game begun from it could
    // castle for the rest of time.
    let board = Board::from_hfen(START_HFEN).expect("start parses");
    assert_eq!(board.state.castling.to_hfen(), "KQkq");
}

#[test]
fn an_unreadable_halfmove_clock_is_rejected() {
    let hfen = format!("{} w KQkq - banana 1", position_of(CANONICAL_START));
    assert!(
        Board::from_hfen(&hfen).is_err(),
        "a non-numeric half-move clock must not silently become 0"
    );
}

#[test]
fn an_unreadable_fullmove_number_is_rejected() {
    let position = position_of(CANONICAL_START);
    assert!(Board::from_hfen(&format!("{position} w KQkq - 0 later")).is_err());
    assert!(
        Board::from_hfen(&format!("{position} w KQkq - 0 0")).is_err(),
        "the full-move number starts at 1"
    );
}

#[test]
fn a_malformed_en_passant_field_is_rejected() {
    let position = position_of(CANONICAL_START);
    for ep in ["zz9", "m4", "e0", "e13", "e", "4"] {
        assert!(
            Board::from_hfen(&format!("{position} w KQkq {ep} 0 1")).is_err(),
            "en-passant field {ep:?} must not silently become `-`"
        );
    }
    // The legal forms still work.
    assert!(Board::from_hfen(&format!("{position} w KQkq - 0 1")).is_ok());
    assert!(Board::from_hfen(&format!("{position} w KQkq e4 0 1")).is_ok());
    assert!(Board::from_hfen(&format!("{position} w KQkq l12 0 1")).is_ok());
}

#[test]
fn a_malformed_castling_field_is_rejected() {
    let position = position_of(CANONICAL_START);
    for castling in ["XYZ", "KQkqK", "kqKQx", ""] {
        assert!(
            Board::from_hfen(&format!("{position} w {castling} - 0 1")).is_err(),
            "castling field {castling:?} must not silently become `-` (no rights)"
        );
    }
    for castling in ["-", "K", "KQ", "KQkq", "kq", "Qk"] {
        assert!(
            Board::from_hfen(&format!("{position} w {castling} - 0 1")).is_ok(),
            "castling field {castling:?} is legal"
        );
    }
}

// ── HFEN-I: the inline `id:Type` pair ──────────────────────────────────────

/// A one-pawn-from-promotion position: white pawn identity `M` on a11.
const ONE_PROMOTION: &str = "M:Q11/12/6g5/12/12/12/12/12/12/12/6G5/12 b - - 0 1";

#[test]
fn a_promotion_pair_round_trips_byte_identically() {
    let board = Board::from_hfen(ONE_PROMOTION).expect("promoted position parses");
    assert_eq!(board.get_hfen(), ONE_PROMOTION);
}

#[test]
fn the_pair_type_half_is_restricted_to_the_promotion_set() {
    let tail = "11/12/6g5/12/12/12/12/12/12/12/6G5/12 b - - 0 1";
    // A promoted piece: legal.
    for ty in ["Q", "R", "B", "N", "E", "H"] {
        assert!(
            Board::from_hfen(&format!("M:{ty}{tail}")).is_ok(),
            "M:{ty} is a legal promotion pair"
        );
    }
    // `K` would smuggle a second king in; `P` says nothing; `q` changes colour.
    for ty in ["K", "P", "q", "Z"] {
        assert!(
            Board::from_hfen(&format!("M:{ty}{tail}")).is_err(),
            "M:{ty} must be rejected"
        );
    }
}

#[test]
fn a_dangling_colon_is_rejected() {
    assert!(Board::from_hfen("11M:/12/6g5/12/12/12/12/12/12/12/6G5/12 w - - 0 1").is_err());
}

// ── HFEN-I: a position, not a fragment ─────────────────────────────────────

#[test]
fn a_position_must_have_exactly_one_king_per_side() {
    // No kings at all — the old parser accepted this, and a king-less
    // fragment is exactly where identity letters can be silently read as
    // legacy type letters.
    assert!(Board::from_hfen("12/12/12/12/12/12/12/12/12/12/12/12 w - - 0 1").is_err());
    // One side only.
    assert!(Board::from_hfen("12/12/12/12/12/12/12/12/12/12/6G5/12 w - - 0 1").is_err());
    // Two white kings.
    assert!(Board::from_hfen("6g5/12/12/12/12/12/12/12/12/12/5GG5/12 w - - 0 1").is_err());
    // One each: fine.
    assert!(Board::from_hfen("6g5/12/12/12/12/12/12/12/12/12/6G5/12 w - - 0 1").is_ok());
}

// ── HPGN-I: the identity prefix is verified, not decorative ────────────────

#[test]
fn split_identity_separates_the_prefix() {
    assert_eq!(split_identity("M:a3a4"), (Some('M'), "a3a4"));
    assert_eq!(split_identity("a3a4"), (None, "a3a4"));
    assert_eq!(split_identity("a11a12q"), (None, "a11a12q"));
}

fn record_with(moves: &[&str]) -> GameRecord {
    let mut rec = GameRecord::new("White", "Black");
    rec.start_hfen = START_HFEN.to_string();
    for m in moves {
        rec.push_move(*m);
    }
    rec
}

#[test]
fn a_truthful_identity_prefix_replays() {
    // `M` is the white pawn that starts on a3.
    let rec = record_with(&["M:a3a4"]);
    assert!(rec.final_hfen().is_ok());
}

#[test]
fn a_lying_identity_prefix_is_rejected() {
    // Same legal move, wrong identity: `N` is the pawn from b3, not a3.
    let rec = record_with(&["N:a3a4"]);
    let err = rec
        .final_hfen()
        .expect_err("a wrong identity must not replay");
    assert!(err.contains("claims identity"), "unexpected error: {err}");
}

#[test]
fn an_impossible_identity_prefix_is_rejected() {
    // `Z` is not an identity character at all.
    let rec = record_with(&["Z:a3a4"]);
    assert!(rec.final_hfen().is_err());
}

#[test]
fn a_plain_uci_movetext_still_replays() {
    // Identity is optional in HPGN-I; a tool that does not track it may omit
    // the prefix, and that must keep working.
    let rec = record_with(&["a3a4", "a10a9"]);
    assert!(rec.final_hfen().is_ok());
}

#[test]
fn hpgn_round_trip_preserves_the_identity_prefix() {
    let rec = record_with(&["M:a3a4", "m:a10a9"]);
    let text = rec.to_hpgni();
    let back = GameRecord::from_hpgni(&text).expect("round-trips");
    assert_eq!(
        back.moves,
        vec!["M:a3a4".to_string(), "m:a10a9".to_string()]
    );
    assert_eq!(back.start_hfen, rec.start_hfen);
    assert!(back.final_hfen().is_ok());
}

/// The position field of a full HFEN string.
fn position_of(hfen: &str) -> &str {
    hfen.split_whitespace().next().expect("non-empty HFEN")
}
