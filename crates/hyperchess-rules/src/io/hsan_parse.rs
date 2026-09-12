// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-rules
// File: crates/hyperchess-rules/src/io/hsan_parse.rs
// Version: 2.0.0
// Copyright (c) 2026 HyperChess Developer Team

//! HSAN parser and HSAN-to-HyperMove converter.
//!
//! **Self-contained law.** Everything needed to resolve the move is read from
//! the string: the piece letter constrains the piece type, the disambiguators
//! constrain the source square, and the destination is parsed by *anchoring at
//! the end of the string*, never by a fixed character offset.
//!
//! Two properties of this board make the orthodox-SAN shortcuts wrong here,
//! and both are handled explicitly:
//!
//! - **Ranks 10, 11 and 12 are two digits.** A parser that takes "the last two
//!   characters" as the destination cannot address a third of the board, and
//!   one that reads a single digit left-to-right silently turns `e10` into
//!   `e1`. Destination and disambiguator ranks are matched as `1[0-2]|[1-9]`.
//! - **Eagle (`E`) and Hawk (`H`) are piece letters.** Omitting them makes
//!   `Ed4` parse as a pawn move to d4, which then resolves to whatever else
//!   happens to be legal there.
//!
//! See [`crate::io::hsan_export`] for the grammar this accepts.

use crate::board::Board;
use crate::core::piece_move::HyperMove;
use crate::core::sq::SQ;
use crate::core::PieceType;

/// Which castling move a HSAN castling token named.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CastleSide {
    /// `O-O` — king-side.
    King,
    /// `O-O-O` — queen-side.
    Queen,
}

/// Parsed HSAN move components.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HsanMove {
    /// Piece character (`K`, `Q`, `R`, `B`, `N`, `E`, `H`), or `None` for a pawn.
    pub piece: Option<char>,
    /// Source file disambiguation (0-11 for a-l).
    pub src_file: Option<u8>,
    /// Source rank disambiguation (0-11 for ranks 1-12).
    pub src_rank: Option<u8>,
    /// Destination file (0-11).
    pub dst_file: u8,
    /// Destination rank (0-11).
    pub dst_rank: u8,
    /// Capture marker.
    pub is_capture: bool,
    /// Promotion piece (`Q`, `R`, `B`, `N`, `E`, `H`) or `None`.
    pub promotion: Option<char>,
    /// Check or checkmate marker.
    pub check_marker: CheckMarker,
    /// Set when the token was `O-O` / `O-O-O`; the coordinate fields are then
    /// meaningless and must not be read.
    pub castle: Option<CastleSide>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
/// The trailing annotation on a HSAN move.
pub enum CheckMarker {
    /// No marker.
    None,
    /// Trailing `+`.
    Check,
    /// Trailing `#`.
    Checkmate,
}

/// Every legal HSAN piece letter. `E` and `H` belong here — they are this
/// variant's two extra piece types, not decoration.
const PIECE_LETTERS: &str = "KQRBNEH";

/// Split a trailing rank (`1`..`12`) off the end of `s`.
///
/// Returns `(rest, rank_index)` where `rank_index` is 0-based. Two digits are
/// preferred over one so `e10` reads as rank 10, not rank 0 — but only when
/// they form 10, 11 or 12, so `e1` followed by nothing still reads as rank 1.
fn split_trailing_rank(s: &str) -> Option<(&str, u8)> {
    let bytes = s.as_bytes();
    if bytes.len() >= 2 {
        let two = &s[s.len() - 2..];
        if matches!(two, "10" | "11" | "12") {
            let rank: u8 = two.parse().ok()?;
            return Some((&s[..s.len() - 2], rank - 1));
        }
    }
    let last = *bytes.last()? as char;
    if last.is_ascii_digit() && last != '0' {
        let rank = last.to_digit(10)? as u8;
        return Some((&s[..s.len() - 1], rank - 1));
    }
    None
}

/// Split a trailing file letter (`a`..`l`) off the end of `s`.
fn split_trailing_file(s: &str) -> Option<(&str, u8)> {
    let last = s.chars().last()?;
    if ('a'..='l').contains(&last) {
        Some((&s[..s.len() - last.len_utf8()], (last as u8) - b'a'))
    } else {
        None
    }
}

/// Parse a HSAN move string (e.g. `"e4"`, `"Nf3"`, `"Qxe5"`, `"a12=Q"`,
/// `"Rxd10"`, `"Ede8+"`, `"O-O"`).
pub fn parse_hsan(hsan: &str) -> Result<HsanMove, String> {
    let s = hsan.trim();
    if s.is_empty() {
        return Err("Empty HSAN move".to_string());
    }

    let base = HsanMove {
        piece: None,
        src_file: None,
        src_rank: None,
        dst_file: 0,
        dst_rank: 0,
        is_capture: false,
        promotion: None,
        check_marker: CheckMarker::None,
        castle: None,
    };

    // Castling. The marker is allowed here too, so `O-O#` parses.
    let (body, check_marker) = match s.strip_suffix('#') {
        Some(rest) => (rest, CheckMarker::Checkmate),
        None => match s.strip_suffix('+') {
            Some(rest) => (rest, CheckMarker::Check),
            None => (s, CheckMarker::None),
        },
    };

    // Queen-side must be tested first: "O-O-O" also starts with "O-O".
    if matches!(body, "O-O-O" | "0-0-0") {
        return Ok(HsanMove {
            piece: Some('K'),
            check_marker,
            castle: Some(CastleSide::Queen),
            ..base
        });
    }
    if matches!(body, "O-O" | "0-0") {
        return Ok(HsanMove {
            piece: Some('K'),
            check_marker,
            castle: Some(CastleSide::King),
            ..base
        });
    }

    // Promotion suffix, e.g. "=Q". Restricted to the promotion set, so "=K"
    // is rejected rather than silently accepted.
    let (body, promotion) = match body.rfind('=') {
        Some(pos) => {
            let promo_str = &body[pos + 1..];
            let mut promo_chars = promo_str.chars();
            let promo = promo_chars
                .next()
                .ok_or_else(|| format!("Dangling promotion marker in {hsan:?}"))?;
            if promo_chars.next().is_some() {
                return Err(format!("Trailing text after promotion in {hsan:?}"));
            }
            if !"QRBNEH".contains(promo) {
                return Err(format!("Invalid promotion piece {promo:?} in {hsan:?}"));
            }
            (&body[..pos], Some(promo))
        }
        None => (body, None),
    };

    // Leading piece letter.
    let mut rest = body;
    let piece = match rest.chars().next() {
        Some(c) if PIECE_LETTERS.contains(c) => {
            rest = &rest[c.len_utf8()..];
            Some(c)
        }
        _ => None,
    };

    // Destination, anchored at the end: rank first, then file.
    let (rest, dst_rank) = split_trailing_rank(rest)
        .ok_or_else(|| format!("Missing or invalid destination rank in {hsan:?}"))?;
    let (rest, dst_file) = split_trailing_file(rest)
        .ok_or_else(|| format!("Missing or invalid destination file in {hsan:?}"))?;

    // Capture marker, immediately before the destination.
    let (rest, is_capture) = match rest.strip_suffix('x') {
        Some(head) => (head, true),
        None => (rest, false),
    };

    // Whatever is left is disambiguation: an optional file then an optional
    // rank, in that order.
    let mut src_file = None;
    let mut src_rank = None;
    let mut disamb = rest;
    if let Some((head, rank)) = split_trailing_rank(disamb) {
        src_rank = Some(rank);
        disamb = head;
    }
    if let Some((head, file)) = split_trailing_file(disamb) {
        src_file = Some(file);
        disamb = head;
    }
    if !disamb.is_empty() {
        return Err(format!("Unparsed text {disamb:?} in HSAN move {hsan:?}"));
    }

    Ok(HsanMove {
        piece,
        src_file,
        src_rank,
        dst_file,
        dst_rank,
        is_capture,
        promotion,
        check_marker,
        castle: None,
    })
}

/// Resolve a parsed HSAN move against the legal moves of `board`.
///
/// Every constraint carried by the string is applied — including the piece
/// letter, which older revisions parsed and then ignored, so that `Rd4` and
/// `Nd4` resolved identically.
pub fn hsan_to_hypermove(board: &Board, hsan_move: &HsanMove) -> Result<HyperMove, String> {
    let legal = board.generate_moves();

    if let Some(side) = hsan_move.castle {
        let found = legal.iter().find(|m| match side {
            CastleSide::King => m.is_king_castle(),
            CastleSide::Queen => m.is_queen_castle(),
        });
        return found.copied().ok_or_else(|| {
            match side {
                CastleSide::King => "No legal king-side castling move",
                CastleSide::Queen => "No legal queen-side castling move",
            }
            .to_string()
        });
    }

    let dst = SQ::make(hsan_move.dst_file, hsan_move.dst_rank);

    // The piece letter names a type; its absence names a pawn.
    let want_type = match hsan_move.piece {
        Some(c) => {
            PieceType::from_char(c).ok_or_else(|| format!("Invalid HSAN piece letter {c:?}"))?
        }
        None => PieceType::P,
    };

    let matches: Vec<HyperMove> = legal
        .iter()
        .filter(|m| m.get_dest() == dst)
        .filter(|m| board.piece_at(m.get_src()).player_piece_lossy().1 == want_type)
        .filter(|m| m.is_capture() == hsan_move.is_capture)
        .filter(|m| match hsan_move.promotion {
            Some(promo) => m.is_promo() && PieceType::from_char(promo) == Some(m.promo_piece()),
            None => !m.is_promo(),
        })
        .filter(|m| match hsan_move.src_file {
            Some(f) => m.get_src().0 % 12 == f,
            None => true,
        })
        .filter(|m| match hsan_move.src_rank {
            Some(r) => m.get_src().0 / 12 == r,
            None => true,
        })
        .copied()
        .collect();

    match matches.len() {
        1 => Ok(matches[0]),
        0 => Err(format!(
            "No legal move matches HSAN constraints (dest {}{}, type {:?})",
            (hsan_move.dst_file + b'a') as char,
            hsan_move.dst_rank + 1,
            want_type
        )),
        n => Err(format!("Ambiguous HSAN move: {n} legal moves match")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::io::hsan_export::hypermove_to_hsan;

    const ROOK_TAKES_ON_RANK_10: &str = "6g5/12/3c8/12/12/12/12/12/3C8/12/12/6G5 w - - 0 1";
    const TWO_KNIGHTS: &str = "6g5/12/12/12/12/12/3D1I6/12/12/12/12/6G5 w - - 0 1";
    const PROMOTING: &str = "12/M11/6g5/12/12/12/12/12/12/12/6G5/12 w - - 0 1";

    #[test]
    fn parses_two_digit_destination_ranks() {
        for (s, file, rank) in [
            ("d10", 3u8, 9u8),
            ("d11", 3, 10),
            ("d12", 3, 11),
            ("Nd10", 3, 9),
            ("Rxd10", 3, 9),
            ("a12", 0, 11),
        ] {
            let m = parse_hsan(s).unwrap_or_else(|e| panic!("{s} should parse: {e}"));
            assert_eq!((m.dst_file, m.dst_rank), (file, rank), "{s}");
        }
    }

    #[test]
    fn single_digit_ranks_still_parse() {
        let m = parse_hsan("e4").unwrap();
        assert_eq!((m.dst_file, m.dst_rank), (4, 3));
        assert_eq!(m.piece, None);
        let m = parse_hsan("Nf3").unwrap();
        assert_eq!(m.piece, Some('N'));
        assert_eq!((m.dst_file, m.dst_rank), (5, 2));
    }

    #[test]
    fn eagle_and_hawk_are_piece_letters() {
        assert_eq!(parse_hsan("Ed4").unwrap().piece, Some('E'));
        assert_eq!(parse_hsan("Hf7").unwrap().piece, Some('H'));
        assert_eq!(parse_hsan("Exd10").unwrap().piece, Some('E'));
    }

    #[test]
    fn castling_sides_are_distinguishable() {
        assert_eq!(parse_hsan("O-O").unwrap().castle, Some(CastleSide::King));
        assert_eq!(parse_hsan("O-O-O").unwrap().castle, Some(CastleSide::Queen));
        assert_ne!(parse_hsan("O-O").unwrap(), parse_hsan("O-O-O").unwrap());
        assert_eq!(
            parse_hsan("O-O-O#").unwrap().check_marker,
            CheckMarker::Checkmate
        );
    }

    #[test]
    fn capture_and_check_markers() {
        let m = parse_hsan("Qxe5+").unwrap();
        assert!(m.is_capture);
        assert_eq!(m.check_marker, CheckMarker::Check);
        let m = parse_hsan("Qh5#").unwrap();
        assert_eq!(m.check_marker, CheckMarker::Checkmate);
    }

    #[test]
    fn promotion_is_restricted_to_the_promotion_set() {
        assert_eq!(parse_hsan("a12=Q").unwrap().promotion, Some('Q'));
        assert_eq!(parse_hsan("a12=E").unwrap().promotion, Some('E'));
        assert!(parse_hsan("a12=K").is_err());
        assert!(parse_hsan("a12=P").is_err());
        assert!(parse_hsan("a12=").is_err());
    }

    #[test]
    fn disambiguation_round_trips_with_two_digit_ranks() {
        let m = parse_hsan("Nd10e12").unwrap();
        assert_eq!(m.src_file, Some(3));
        assert_eq!(m.src_rank, Some(9));
        assert_eq!((m.dst_file, m.dst_rank), (4, 11));
    }

    #[test]
    fn garbage_is_rejected() {
        for s in ["", "ZZ", "d0", "Nd13", "xx", "Nq4"] {
            assert!(parse_hsan(s).is_err(), "{s:?} should not parse");
        }
    }

    #[test]
    fn the_piece_letter_constrains_resolution() {
        let board = Board::from_hfen(TWO_KNIGHTS).expect("parses");
        // A rook move to e8 does not exist here; the knights' does.
        assert!(hsan_to_hypermove(&board, &parse_hsan("Rde8").unwrap()).is_err());
        let m = hsan_to_hypermove(&board, &parse_hsan("Nde8").unwrap()).expect("resolves");
        assert_eq!(m.stringify(), "d6e8");
    }

    #[test]
    fn every_legal_move_round_trips_through_hsan() {
        for hfen in [
            crate::core::masks::START_HFEN,
            ROOK_TAKES_ON_RANK_10,
            TWO_KNIGHTS,
            PROMOTING,
        ] {
            let board = Board::from_hfen(hfen).expect("test HFEN parses");
            for m in board.generate_moves().iter() {
                let hsan = hypermove_to_hsan(&board, *m);
                let parsed = parse_hsan(&hsan)
                    .unwrap_or_else(|e| panic!("exported {hsan:?} must re-parse: {e}"));
                let resolved = hsan_to_hypermove(&board, &parsed)
                    .unwrap_or_else(|e| panic!("exported {hsan:?} must resolve: {e}"));
                assert_eq!(
                    resolved.stringify(),
                    m.stringify(),
                    "HSAN {hsan:?} resolved to the wrong move in {hfen}"
                );
            }
        }
    }
}
