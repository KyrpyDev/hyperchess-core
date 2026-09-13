// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-rules
// File: crates/hyperchess-rules/src/core/piece_move.rs
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

//! HyperMove — a 32-bit encoded move for the 12x12 board.
//!
//! Bit layout:
//! - bits  0-7:  source square (0-143)
//! - bits  8-15: destination square (0-143)
//! - bits 16-19: flags
//! - bits 20-23: promotion piece type (PieceType as u8)
//!
//! Flag encoding:
//! - 0x0: quiet move
//! - 0x1: double pawn push
//! - 0x2: king-side castle
//! - 0x3: queen-side castle
//! - 0x4: capture
//! - 0x5: en passant capture
//! - 0x8: promotion (quiet)
//! - 0xC: promotion + capture

use super::sq::SQ;
use super::*;
use std::cmp::{Ord, Ordering, PartialEq, PartialOrd};
use std::fmt;

/// Bits 0-7 — source square. 8 bits is exactly enough for 0..=143.
const SRC_MASK: u32 = 0x0000_00FF;
/// Bits 8-15 — destination square.
const DST_MASK: u32 = 0x0000_FF00;
/// Bits 16-19 — move flag, one of the `FLAG_*` constants.
const FLAG_MASK: u32 = 0x000F_0000;
/// Bits 20-23 — promotion piece type; meaningful only when the promotion bit
/// of the flag nibble is set.
const PROMO_MASK: u32 = 0x00F0_0000;

/// A 32-bit encoded move for HyperChess.
#[derive(Copy, Clone, PartialEq, Eq, Hash)]
#[repr(transparent)]
pub struct HyperMove {
    data: u32,
}

/// Move flag constants.
impl HyperMove {
    /// Non-capturing, non-special move.
    pub const FLAG_QUIET: u32 = 0x0;
    /// Pawn advancing two squares; sets an en-passant target.
    pub const FLAG_DOUBLE_PAWN: u32 = 0x1;
    /// King-side castle. Source/destination are the *king's* squares.
    pub const FLAG_KING_CASTLE: u32 = 0x2;
    /// Queen-side castle. Source/destination are the *king's* squares.
    pub const FLAG_QUEEN_CASTLE: u32 = 0x3;
    /// Ordinary capture. Bit 0x4 is the capture bit — every capturing flag has
    /// it set, so `flag & FLAG_CAPTURE != 0` tests capture-ness in one step.
    pub const FLAG_CAPTURE: u32 = 0x4;
    /// En-passant capture; the captured pawn is not on the destination square.
    pub const FLAG_EP: u32 = 0x5;
    /// Promotion without capture. Bit 0x8 is the promotion bit, orthogonal to
    /// the capture bit above.
    pub const FLAG_PROMO: u32 = 0x8;
    /// Promotion with capture — promotion and capture bits together, which is
    /// why this value is `0x8 | 0x4` rather than the next number in sequence.
    pub const FLAG_PROMO_CAPTURE: u32 = 0xC;

    /// Creates a move from raw bits.
    #[inline(always)]
    pub const fn new(data: u32) -> HyperMove {
        HyperMove { data }
    }

    /// Null move (src == dst == 0).
    #[inline(always)]
    pub const fn null() -> HyperMove {
        HyperMove { data: 0 }
    }

    /// Returns true if this is a null move.
    #[inline(always)]
    pub const fn is_null(self) -> bool {
        self.data == 0
    }

    /// Creates a move from components.
    #[inline(always)]
    pub const fn make(flags: u32, src: SQ, dst: SQ) -> HyperMove {
        HyperMove {
            data: (src.0 as u32) | ((dst.0 as u32) << 8) | (flags << 16),
        }
    }

    /// Creates a quiet move.
    #[inline(always)]
    pub const fn make_quiet(src: SQ, dst: SQ) -> HyperMove {
        HyperMove::make(Self::FLAG_QUIET, src, dst)
    }

    /// Creates a capture move.
    #[inline(always)]
    pub const fn make_capture(src: SQ, dst: SQ) -> HyperMove {
        HyperMove::make(Self::FLAG_CAPTURE, src, dst)
    }

    /// Creates a double pawn push.
    #[inline(always)]
    pub const fn make_pawn_push(src: SQ, dst: SQ) -> HyperMove {
        HyperMove::make(Self::FLAG_DOUBLE_PAWN, src, dst)
    }

    /// Creates an en passant capture.
    #[inline(always)]
    pub const fn make_ep_capture(src: SQ, dst: SQ) -> HyperMove {
        HyperMove::make(Self::FLAG_EP, src, dst)
    }

    /// Creates a king-side castle.
    #[inline(always)]
    pub const fn make_king_castle(src: SQ, dst: SQ) -> HyperMove {
        HyperMove::make(Self::FLAG_KING_CASTLE, src, dst)
    }

    /// Creates a queen-side castle.
    #[inline(always)]
    pub const fn make_queen_castle(src: SQ, dst: SQ) -> HyperMove {
        HyperMove::make(Self::FLAG_QUEEN_CASTLE, src, dst)
    }

    /// Creates a promotion move.
    #[inline(always)]
    pub fn make_promotion(src: SQ, dst: SQ, promo: PieceType, capture: bool) -> HyperMove {
        let flags = if capture {
            Self::FLAG_PROMO_CAPTURE
        } else {
            Self::FLAG_PROMO
        };
        HyperMove {
            data: (src.0 as u32) | ((dst.0 as u32) << 8) | (flags << 16) | ((promo as u32) << 20),
        }
    }

    /// Returns the source square.
    #[inline(always)]
    pub const fn get_src(self) -> SQ {
        SQ((self.data & SRC_MASK) as u8)
    }

    /// Returns the destination square.
    #[inline(always)]
    pub const fn get_dest(self) -> SQ {
        SQ(((self.data & DST_MASK) >> 8) as u8)
    }

    /// Returns the 4-bit flag.
    #[inline(always)]
    pub const fn flag(self) -> u32 {
        (self.data >> 16) & 0xF
    }

    /// Returns true if this is a capture.
    #[inline(always)]
    pub const fn is_capture(self) -> bool {
        (self.flag() & 0x4) != 0
    }

    /// Returns true if this is a promotion.
    #[inline(always)]
    pub const fn is_promo(self) -> bool {
        (self.flag() & 0x8) != 0
    }

    /// Returns true if this is a castle.
    #[inline(always)]
    pub fn is_castle(self) -> bool {
        self.flag() == Self::FLAG_KING_CASTLE || self.flag() == Self::FLAG_QUEEN_CASTLE
    }

    /// Returns true if this is a king-side castle.
    #[inline(always)]
    pub fn is_king_castle(self) -> bool {
        self.flag() == Self::FLAG_KING_CASTLE
    }

    /// Returns true if this is a queen-side castle.
    #[inline(always)]
    pub fn is_queen_castle(self) -> bool {
        self.flag() == Self::FLAG_QUEEN_CASTLE
    }

    /// Returns true if this is an en passant capture.
    #[inline(always)]
    pub fn is_en_passant(self) -> bool {
        self.flag() == Self::FLAG_EP
    }

    /// Returns true if this is a double pawn push.
    #[inline(always)]
    pub fn is_double_push(self) -> bool {
        self.flag() == Self::FLAG_DOUBLE_PAWN
    }

    /// Returns true if this is a quiet move (not capture, not promo, not castle, not special).
    #[inline(always)]
    pub fn is_quiet(self) -> bool {
        self.flag() == Self::FLAG_QUIET
    }

    /// Returns the promotion piece type.
    #[inline(always)]
    pub fn promo_piece(self) -> PieceType {
        let idx = ((self.data & PROMO_MASK) >> 20) as u8;
        match idx {
            1 => PieceType::P,
            2 => PieceType::N,
            3 => PieceType::B,
            4 => PieceType::R,
            5 => PieceType::Q,
            6 => PieceType::K,
            7 => PieceType::E,
            8 => PieceType::H,
            _ => PieceType::None,
        }
    }

    /// Returns the raw u32 data.
    #[inline(always)]
    pub const fn get_raw(self) -> u32 {
        self.data
    }

    /// Returns true if src != dest.
    #[inline(always)]
    pub fn is_okay(self) -> bool {
        self.get_src() != self.get_dest()
    }

    /// String representation (e.g., "g2i2", "a3a4", "a10a11q").
    pub fn stringify(self) -> String {
        let src = self.get_src().notation();
        let dst = self.get_dest().notation();
        let mut s = format!("{}{}", src, dst);
        if self.is_promo() {
            s.push(self.promo_piece().char_lower());
        }
        s
    }

    /// HPGN-I string: `<identity>:<uci>` when a stable per-piece identity is
    /// tracked at the move's source square, else plain UCI (this `stringify()`'s
    /// output, unchanged). No cosmetic suffixes (capture/check/mate) — those are
    /// optional and not computed here; see docs/HPGN-I-FORMAT.md.
    pub fn stringify_with_identity(self, identity: Option<char>) -> String {
        match identity {
            Some(id) => format!("{}:{}", id, self.stringify()),
            None => self.stringify(),
        }
    }
}

/// Strips an HPGN-I identity prefix (`<identity>:`) back to plain UCI. A
/// no-op on strings that never had a prefix, so it's safe to call
/// unconditionally on any move string, HPGN-I or plain UCI alike.
pub fn strip_identity(hpgn: &str) -> &str {
    hpgn.rsplit(':').next().unwrap_or(hpgn)
}

/// Split an HPGN-I token into its optional identity prefix and its UCI tail.
///
/// `"M:a3a4"` -> `(Some('M'), "a3a4")`; `"a3a4"` -> `(None, "a3a4")`.
///
/// The identity half is returned so callers can *verify* it against the piece
/// actually standing on the source square. HPGN-I's whole reason to exist is
/// that the record says which individual piece moved; a prefix that is never
/// checked is a comment, not a record, and cannot detect a corrupted or
/// hand-edited game file.
pub fn split_identity(hpgn: &str) -> (Option<char>, &str) {
    match hpgn.split_once(':') {
        Some((id, uci)) => {
            let mut chars = id.chars();
            match (chars.next(), chars.next()) {
                (Some(c), None) => (Some(c), uci),
                // Not a single-character prefix: not an identity prefix.
                _ => (None, hpgn),
            }
        }
        None => (None, hpgn),
    }
}

impl fmt::Display for HyperMove {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.stringify())
    }
}

impl fmt::Debug for HyperMove {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "HyperMove({})", self.stringify())
    }
}

/// A move with an associated score for move ordering.
#[derive(Copy, Clone, Eq)]
pub struct ScoringMove {
    pub hyper_move: HyperMove,
    pub score: i32,
}

impl Default for ScoringMove {
    fn default() -> Self {
        ScoringMove {
            hyper_move: HyperMove::null(),
            score: 0,
        }
    }
}

impl ScoringMove {
    /// Wrap a move with a zero score, for a list that will be scored later.
    #[inline(always)]
    pub fn new(m: HyperMove) -> Self {
        ScoringMove {
            hyper_move: m,
            score: 0,
        }
    }

    /// Wrap a move together with an already-known score.
    #[inline(always)]
    pub fn new_score(m: HyperMove, score: i32) -> Self {
        ScoringMove {
            hyper_move: m,
            score,
        }
    }

    /// A null move with score 0 — the fill value for unused list slots.
    #[inline(always)]
    pub fn null() -> Self {
        ScoringMove::default()
    }

    /// Flip the score's sign for the negamax convention, leaving the move
    /// itself untouched.
    ///
    /// Uses `wrapping_neg` so that `i32::MIN` — which a search may use as its
    /// initial alpha — negates instead of overflow-panicking in debug builds.
    #[inline(always)]
    pub fn negate(mut self) -> Self {
        self.score = self.score.wrapping_neg();
        self
    }
}

impl Ord for ScoringMove {
    fn cmp(&self, other: &ScoringMove) -> Ordering {
        self.score.cmp(&other.score)
    }
}

impl PartialOrd for ScoringMove {
    fn partial_cmp(&self, other: &ScoringMove) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialEq for ScoringMove {
    fn eq(&self, other: &ScoringMove) -> bool {
        self.score == other.score
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quiet_move() {
        let m = HyperMove::make_quiet(SQ(18), SQ(30));
        assert_eq!(m.get_src(), SQ(18));
        assert_eq!(m.get_dest(), SQ(30));
        assert!(m.is_quiet());
        assert!(!m.is_capture());
        assert!(!m.is_promo());
    }

    #[test]
    fn test_capture_move() {
        let m = HyperMove::make_capture(SQ(50), SQ(100));
        assert_eq!(m.get_src(), SQ(50));
        assert_eq!(m.get_dest(), SQ(100));
        assert!(m.is_capture());
        assert!(!m.is_promo());
    }

    #[test]
    fn test_promotion() {
        let m = HyperMove::make_promotion(SQ(120), SQ(132), PieceType::Q, false);
        assert!(m.is_promo());
        assert!(!m.is_capture());
        assert_eq!(m.promo_piece(), PieceType::Q);

        let m2 = HyperMove::make_promotion(SQ(120), SQ(133), PieceType::E, true);
        assert!(m2.is_promo());
        assert!(m2.is_capture());
        assert_eq!(m2.promo_piece(), PieceType::E);
    }

    #[test]
    fn test_castle() {
        let m = HyperMove::make_king_castle(SQ(18), SQ(20));
        assert!(m.is_castle());
        assert!(m.is_king_castle());
        assert!(!m.is_queen_castle());
    }

    #[test]
    fn test_en_passant() {
        let m = HyperMove::make_ep_capture(SQ(52), SQ(65));
        assert!(m.is_en_passant());
        assert!(m.is_capture());
    }

    #[test]
    fn test_stringify() {
        let m = HyperMove::make_quiet(SQ(0), SQ(12));
        assert_eq!(m.stringify(), "a1a2");

        let m2 = HyperMove::make_promotion(SQ(120), SQ(132), PieceType::Q, false);
        let s = m2.stringify();
        assert!(s.ends_with('q'));
    }

    #[test]
    fn test_large_square_encoding() {
        let m = HyperMove::make_quiet(SQ(143), SQ(131));
        assert_eq!(m.get_src(), SQ(143));
        assert_eq!(m.get_dest(), SQ(131));
    }

    #[test]
    fn test_stringify_with_identity_prefixes_when_present() {
        let m = HyperMove::make_quiet(SQ(0), SQ(12));
        assert_eq!(m.stringify_with_identity(Some('M')), "M:a1a2");
    }

    #[test]
    fn test_stringify_with_identity_falls_back_without_identity() {
        let m = HyperMove::make_quiet(SQ(0), SQ(12));
        assert_eq!(m.stringify_with_identity(None), "a1a2");
    }

    #[test]
    fn test_stringify_with_identity_promotion() {
        let m = HyperMove::make_promotion(SQ(120), SQ(132), PieceType::Q, false);
        let s = m.stringify_with_identity(Some('R'));
        assert!(s.starts_with("R:"));
        assert!(s.ends_with('q'));
    }

    #[test]
    fn test_strip_identity_round_trips() {
        let m = HyperMove::make_quiet(SQ(0), SQ(12));
        let with_id = m.stringify_with_identity(Some('M'));
        let without_id = m.stringify_with_identity(None);
        assert_eq!(strip_identity(&with_id), m.stringify());
        assert_eq!(strip_identity(&without_id), m.stringify());
    }

    #[test]
    fn test_strip_identity_is_total_on_plain_uci() {
        // A bare UCI string with no colon must pass through unchanged.
        assert_eq!(strip_identity("a3a4"), "a3a4");
        assert_eq!(strip_identity("a10a11q"), "a10a11q");
    }

    /// HPGN-I Coverage: Castling
    /// Castling is recorded as a king move; the identity of the king is prefixed.
    #[test]
    fn test_hpgn_i_king_side_castle() {
        let m = HyperMove::make_king_castle(SQ::make(6, 0), SQ::make(7, 0)); // g1h1
        assert!(m.is_king_castle());
        assert_eq!(m.stringify(), "g1h1");
        assert_eq!(m.stringify_with_identity(Some('G')), "G:g1h1");
        assert_eq!(strip_identity("G:g1h1"), "g1h1");
    }

    #[test]
    fn test_hpgn_i_queen_side_castle() {
        let m = HyperMove::make_queen_castle(SQ::make(6, 0), SQ::make(5, 0)); // g1f1
        assert!(m.is_queen_castle());
        assert_eq!(m.stringify(), "g1f1");
        assert_eq!(m.stringify_with_identity(Some('G')), "G:g1f1");
        assert_eq!(strip_identity("G:g1f1"), "g1f1");
    }

    /// HPGN-I Coverage: En Passant
    /// En passant is recorded as a pawn move to the en passant square.
    #[test]
    fn test_hpgn_i_en_passant() {
        let m = HyperMove::make_ep_capture(SQ::make(4, 4), SQ::make(5, 5)); // e5f6 (diagonal capture)
        assert!(m.is_en_passant());
        assert!(m.is_capture());
        assert_eq!(m.stringify(), "e5f6");
        assert_eq!(m.stringify_with_identity(Some('R')), "R:e5f6");
        assert_eq!(strip_identity("R:e5f6"), "e5f6");
    }

    /// HPGN-I Coverage: Double Pawn Push
    /// Double pawn push is recorded as a regular quiet move (the flag is internal state).
    #[test]
    fn test_hpgn_i_double_pawn_push() {
        let m = HyperMove::make_pawn_push(SQ::make(0, 2), SQ::make(0, 4)); // a3a5
        assert!(m.is_double_push());
        assert_eq!(m.stringify(), "a3a5");
        assert_eq!(m.stringify_with_identity(Some('M')), "M:a3a5");
        assert_eq!(strip_identity("M:a3a5"), "a3a5");
    }

    /// HPGN-I Coverage: Capture (regular)
    /// Capture is not marked in HPGN-I; it's derivable from board state.
    #[test]
    fn test_hpgn_i_capture() {
        let m = HyperMove::make_capture(SQ::make(3, 4), SQ::make(4, 5)); // d5e6
        assert!(m.is_capture());
        assert!(!m.is_promo());
        assert_eq!(m.stringify(), "d5e6");
        // Capture marker 'x' is NOT appended in HPGN-I; only identity prefix.
        assert_eq!(m.stringify_with_identity(Some('D')), "D:d5e6");
        assert_eq!(strip_identity("D:d5e6"), "d5e6");
    }

    /// HPGN-I Coverage: Promotion with Capture
    /// Promotion + capture: pawn identity persists through promotion.
    #[test]
    fn test_hpgn_i_promotion_capture() {
        let m = HyperMove::make_promotion(SQ(120), SQ(121), PieceType::R, true);
        assert!(m.is_promo());
        assert!(m.is_capture());
        let s = m.stringify_with_identity(Some('R'));
        assert!(s.starts_with("R:"));
        // Suffix is the promotion piece, lowercase.
        assert!(s.ends_with('r'));
        assert_eq!(strip_identity(&s), m.stringify());
    }

    /// HPGN-I Coverage: All Six Promotion Types
    #[test]
    fn test_hpgn_i_all_promotion_types() {
        let promo_types = [
            (PieceType::Q, 'q'),
            (PieceType::R, 'r'),
            (PieceType::B, 'b'),
            (PieceType::N, 'n'),
            (PieceType::E, 'e'),
            (PieceType::H, 'h'),
        ];
        for (piece, suffix) in &promo_types {
            let m = HyperMove::make_promotion(SQ(120), SQ(132), *piece, false);
            let s = m.stringify();
            assert_eq!(
                s.chars().last(),
                Some(*suffix),
                "promo to {:?} failed",
                piece
            );
            let s_id = m.stringify_with_identity(Some('R'));
            assert!(
                s_id.starts_with("R:"),
                "identity prefix failed for {:?}",
                piece
            );
            assert_eq!(
                s_id.chars().last(),
                Some(*suffix),
                "suffix lost in identity mode for {:?}",
                piece
            );
        }
    }

    /// HPGN-I Round-Trip: Full move life cycle
    /// Create a move with identity, strip it, verify it equals plain UCI.
    #[test]
    fn test_hpgn_i_full_round_trip() {
        let test_cases = vec![
            (HyperMove::make_quiet(SQ(0), SQ(12)), "M", "a1a2"),
            (HyperMove::make_capture(SQ(50), SQ(100)), "D", "c5e9"),
            (HyperMove::make_pawn_push(SQ(30), SQ(54)), "R", "g3g5"), // rank 3 to rank 5
            (
                HyperMove::make_king_castle(SQ::make(6, 0), SQ::make(7, 0)),
                "G",
                "g1h1",
            ),
            (
                HyperMove::make_queen_castle(SQ::make(6, 0), SQ::make(5, 0)),
                "G",
                "g1f1",
            ),
            (HyperMove::make_ep_capture(SQ(52), SQ(65)), "R", "e5f6"),
        ];
        for (m, id, expected_uci) in test_cases {
            let hpgn = m.stringify_with_identity(Some(id.chars().next().unwrap()));
            assert!(hpgn.starts_with(&format!("{}:", id)));
            assert_eq!(strip_identity(&hpgn), expected_uci);
            assert_eq!(m.stringify(), expected_uci);
        }
    }
}
