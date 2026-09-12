// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-rules
// File: crates/hyperchess-rules/src/board/hfen.rs
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

//! HyperChess HFEN parser and generator.
//!
//! HFEN format: `<position> <side> <castling> <ep> <halfmove> <fullmove>`
//!
//! Position has 12 ranks separated by `/`, top rank first.
//! Multi-digit empty square counts (e.g., "12" = 12 empty squares).
//!
//! **Promotions (HFEN-I)** are written inline in the position field as an
//! `id:Type` pair on the square itself: `M:Q` means "the square holds the
//! piece with stable identity `M`, currently a white queen". The pair still
//! describes exactly one square. It is emitted only when a square's identity
//! character would not parse back to its current piece — in practice after a
//! promotion, where the pawn keeps its stable identity character but changes
//! type. Unpromoted positions look like classic FEN.

use super::Board;
use crate::core::piece_identity::{
    is_promotion_type_char, piece_from_identity, position_uses_identity,
};
use crate::core::sq::SQ;
use crate::core::{Piece, PieceType, Player};

/// Parse a HFEN string into board components.
/// Returns identity-aware board data.
pub fn parse_hfen(hfen: &str) -> Result<HfenData, String> {
    let parts: Vec<&str> = hfen.split_whitespace().collect();
    if parts.len() < 4 {
        return Err(format!("HFEN needs at least 4 parts, got {}", parts.len()));
    }

    let position = parts[0];
    let turn = match parts[1] {
        "w" => Player::White,
        "b" => Player::Black,
        _ => return Err(format!("Invalid turn: {}", parts[1])),
    };
    // Castling and en-passant are validated here, not swallowed. A HFEN
    // string is self-contained: if a field cannot be read it must be an
    // error, because silently substituting a default ("no castling rights",
    // "no en-passant target") produces a *different, legal-looking* position
    // that the caller has no way to detect.
    super::CastleRights::from_hfen_checked(parts[2])
        .map_err(|e| format!("HFEN castling field: {e}"))?;
    let castling = parts[2].to_string();

    parse_ep_square_checked(parts[3]).map_err(|e| format!("HFEN en-passant field: {e}"))?;
    let ep = parts[3].to_string();

    let rule50 = if parts.len() > 4 {
        parts[4]
            .parse::<u16>()
            .map_err(|_| format!("Invalid HFEN half-move clock: {:?}", parts[4]))?
    } else {
        0
    };
    let fullmove = if parts.len() > 5 {
        let n = parts[5]
            .parse::<u16>()
            .map_err(|_| format!("Invalid HFEN full-move number: {:?}", parts[5]))?;
        if n == 0 {
            return Err("HFEN full-move number starts at 1, got 0".to_string());
        }
        n
    } else {
        1
    };

    // Parse position: ranks separated by '/', from rank 12 (top) down to rank 1 (bottom)
    let ranks: Vec<&str> = position.split('/').collect();
    if ranks.len() != 12 {
        return Err(format!("HFEN position needs 12 ranks, got {}", ranks.len()));
    }

    let mut pieces = Vec::new();
    let identity_mode = position_uses_identity(position);

    for (rank_from_top, rank_str) in ranks.iter().enumerate() {
        let rank_idx = 11 - rank_from_top; // rank 12 is first, rank 1 is last
        let mut file = 0usize;
        let mut chars = rank_str.chars().peekable();

        while let Some(&c) = chars.peek() {
            if c.is_ascii_digit() {
                // Accumulate multi-digit number
                let mut num = 0usize;
                while let Some(&d) = chars.peek() {
                    if d.is_ascii_digit() {
                        num = num * 10 + (d as usize - '0' as usize);
                        chars.next();
                    } else {
                        break;
                    }
                }
                file += num;
            } else {
                // A piece: a single character, optionally followed by an inline
                // `:Type` promotion pair — `M:Q` is ONE square whose identity is
                // `M` and whose current type is a white queen.
                chars.next();
                let piece = if identity_mode {
                    piece_from_identity(c).or_else(|| Piece::from_char(c))
                } else {
                    Piece::from_char(c).or_else(|| piece_from_identity(c))
                };

                if let Some(mut piece) = piece {
                    if file >= 12 {
                        return Err(format!("Too many squares on rank {}", rank_idx + 1));
                    }
                    if chars.peek() == Some(&':') {
                        chars.next();
                        let t = chars
                            .next()
                            .ok_or_else(|| format!("Dangling type override after {c}:"))?;
                        if !is_promotion_type_char(t) {
                            return Err(format!(
                                "Invalid `id:Type` type letter {t:?} in {c}:{t} — the type half \
                                 must be one of Q R B N E H (the promotion set), because \
                                 promotion is the only way a piece's type can differ from its \
                                 identity's starting type"
                            ));
                        }
                        let overridden = Piece::from_char(t)
                            .ok_or_else(|| format!("Invalid override piece character: {t}"))?;
                        if overridden.player_piece_lossy().0 != piece.player_piece_lossy().0 {
                            return Err(format!("Type override {c}:{t} changes piece color"));
                        }
                        piece = overridden;
                    }
                    let sq = SQ::make(file as u8, rank_idx as u8);
                    let identity = if identity_mode {
                        c
                    } else {
                        piece.character_lossy()
                    };
                    pieces.push((sq, piece, identity));
                    file += 1;
                } else {
                    return Err(format!("Invalid piece character: {}", c));
                }
            }
        }

        if file != 12 {
            return Err(format!(
                "Rank {} has {} squares, expected 12",
                rank_idx + 1,
                file
            ));
        }
    }

    Ok(HfenData {
        pieces,
        turn,
        castling,
        ep,
        rule50,
        fullmove,
    })
}

/// Verify that `pieces` holds exactly one king per side.
///
/// This is *position legality*, not syntax, which is why it lives here rather
/// than inside [`parse_hfen`]: `parse_hfen` answers "is this a well-formed
/// HFEN string", and is legitimately used on board fragments by the engine's
/// own movegen tests, while [`Board::from_hfen`](super::Board::from_hfen)
/// answers "is this a position a game can actually be in".
///
/// It is load-bearing for identity decoding, too: `G`/`g` are identity-only
/// characters, so any position carrying both kings dispatches to identity
/// mode correctly. King-less fragments are exactly the case where a position
/// written with identity letters can be silently read as a legacy type-only
/// one.
pub fn validate_king_count(pieces: &[(SQ, Piece, char)]) -> Result<(), String> {
    let mut kings = [0usize; 2];
    for &(_, piece, _) in pieces {
        let (player, pt) = piece.player_piece_lossy();
        if pt == PieceType::K {
            kings[player as usize] += 1;
        }
    }
    if kings[0] != 1 || kings[1] != 1 {
        return Err(format!(
            "HFEN must have exactly one king per side, found {} white and {} black",
            kings[0], kings[1]
        ));
    }
    Ok(())
}

/// Parsed HFEN data.
pub struct HfenData {
    pub pieces: Vec<(SQ, Piece, char)>,
    pub turn: Player,
    pub castling: String,
    pub ep: String,
    pub rule50: u16,
    pub fullmove: u16,
}

/// Render the position field from a 144-cell grid of serialized square tokens
/// (a single identity/type character, or an inline `id:Type` promotion pair).
fn render_position(cells: &[Option<String>]) -> String {
    let mut out = String::new();
    for rank_idx in (0..12usize).rev() {
        if rank_idx < 11 {
            out.push('/');
        }
        let mut empty = 0u32;
        for file in 0..12usize {
            match &cells[rank_idx * 12 + file] {
                None => empty += 1,
                Some(s) => {
                    if empty > 0 {
                        out.push_str(&empty.to_string());
                        empty = 0;
                    }
                    out.push_str(s);
                }
            }
        }
        if empty > 0 {
            out.push_str(&empty.to_string());
        }
    }
    out
}

/// Generate a HFEN string from a Board.
///
/// Guarantees `parse_hfen(to_hfen(b))` reconstructs every square's **current
/// piece type** as well as its identity: when a square's serialized character
/// (its stable HFEN-I identity) would parse back to a different type — i.e.
/// after a promotion — the square is written as an inline `id:Type` pair (in
/// identity mode) or as the plain type character (legacy mode).
pub fn to_hfen(board: &Board) -> String {
    let mut hfen = String::new();

    // Pass 1: the character each occupied square serializes as.
    let mut grid: [Option<(char, Piece)>; 144] = [None; 144];
    for idx in 0..144usize {
        let sq = SQ(idx as u8);
        let piece = board.piece_at(sq);
        if piece != Piece::None {
            let c = board
                .piece_hfen_char_at(sq)
                .unwrap_or_else(|| piece.character_lossy());
            grid[idx] = Some((c, piece));
        }
    }

    // Identity mode is decided by the square characters alone; the type chars
    // inside `id:Type` pairs are all legacy piece letters and never flip it.
    let char_cells: Vec<Option<String>> = grid
        .iter()
        .map(|cell| cell.map(|(c, _)| c.to_string()))
        .collect();
    let identity_mode = position_uses_identity(&render_position(&char_cells));

    // Pass 2: any square whose character would not parse back to its current
    // piece — a promoted piece — gets an inline `id:Type` pair (identity mode)
    // or is written as its plain type character (legacy mode).
    let cells: Vec<Option<String>> = grid
        .iter()
        .map(|cell| {
            cell.map(|(c, piece)| {
                let parsed = if identity_mode {
                    piece_from_identity(c).or_else(|| Piece::from_char(c))
                } else {
                    Piece::from_char(c).or_else(|| piece_from_identity(c))
                };
                if parsed == Some(piece) {
                    c.to_string()
                } else if identity_mode {
                    format!("{c}:{}", piece.character_lossy())
                } else {
                    piece.character_lossy().to_string()
                }
            })
        })
        .collect();

    hfen.push_str(&render_position(&cells));

    // Turn
    hfen.push(' ');
    hfen.push(match board.turn() {
        Player::White => 'w',
        Player::Black => 'b',
    });

    // Castling
    hfen.push(' ');
    hfen.push_str(&board.state.castling.to_hfen());

    // En passant
    hfen.push(' ');
    let ep = board.state.ep_square;
    if ep.is_okay() {
        hfen.push_str(&ep.notation());
    } else {
        hfen.push('-');
    }

    // Half-move clock
    hfen.push(' ');
    hfen.push_str(&board.state.rule50.to_string());

    // Full-move number
    hfen.push(' ');
    hfen.push_str(&board.state.fullmove.to_string());

    hfen
}

/// Parse an en-passant square string, rejecting anything malformed.
///
/// Files are `a`-`l` and ranks `1`-`12`; `-` means no target. Returns
/// [`crate::core::sq::NO_SQ`] only for an explicit `-`.
pub fn parse_ep_square_checked(s: &str) -> Result<SQ, String> {
    if s == "-" {
        return Ok(super::super::core::sq::NO_SQ);
    }
    let mut chars = s.chars();
    let file_char = chars
        .next()
        .ok_or_else(|| "empty en-passant field; use \"-\" for none".to_string())?;
    let file = match file_char {
        'a'..='l' => (file_char as u8) - b'a',
        _ => return Err(format!("invalid file {file_char:?} (expected a-l)")),
    };
    let rank_str: String = chars.collect();
    if rank_str.is_empty() {
        return Err(format!("missing rank in en-passant square {s:?}"));
    }
    let rank = match rank_str.parse::<u8>() {
        Ok(r) if (1..=12).contains(&r) => r - 1,
        _ => return Err(format!("invalid rank {rank_str:?} (expected 1-12)")),
    };
    Ok(SQ::make(file, rank))
}

/// Parse an en passant square string (e.g., "e4", "-").
///
/// Lenient: returns `NO_SQ` for malformed input. Kept for callers that have
/// already validated the field; new code should use
/// [`parse_ep_square_checked`].
pub fn parse_ep_square(s: &str) -> SQ {
    if s == "-" {
        return super::super::core::sq::NO_SQ;
    }
    let chars: Vec<char> = s.chars().collect();
    if chars.len() < 2 {
        return super::super::core::sq::NO_SQ;
    }
    let file = match chars[0] {
        'a'..='l' => (chars[0] as u8) - b'a',
        _ => return super::super::core::sq::NO_SQ,
    };
    let rank_str: String = chars[1..].iter().collect();
    let rank: u8 = match rank_str.parse::<u8>() {
        Ok(r) if (1..=12).contains(&r) => r - 1,
        _ => return super::super::core::sq::NO_SQ,
    };
    SQ::make(file, rank)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::masks::START_HFEN;

    #[test]
    fn test_parse_start_hfen() {
        let hfen = START_HFEN;
        let data = parse_hfen(hfen).unwrap();
        assert_eq!(data.turn, Player::White);
        assert_eq!(data.castling, "KQkq");
        assert_eq!(data.ep, "-");
        // Count pieces: 12+12 = 24 per side = 48 total
        assert_eq!(data.pieces.len(), 48);
        assert_eq!(data.pieces[0].2, 'a');
    }

    #[test]
    fn test_parse_empty_ranks() {
        // A HFEN with many empty ranks
        let hfen = "12/12/12/12/12/12/12/12/12/12/12/12 w - - 0 1";
        let data = parse_hfen(hfen).unwrap();
        assert_eq!(data.pieces.len(), 0);
    }

    #[test]
    fn test_parse_multi_digit() {
        // "12" means 12 empty squares on one rank
        let hfen = "12/12/12/12/12/12/12/12/12/12/12/12 w - - 0 1";
        let data = parse_hfen(hfen).unwrap();
        assert!(data.pieces.is_empty());
    }

    #[test]
    fn test_promotion_round_trip_identity_mode() {
        use crate::core::PieceType;
        // White pawn with identity 'M' on a11, one step from promotion.
        // Kings via identity chars ('G' white, 'g' black) → identity mode.
        let hfen = "12/M11/6g5/12/12/12/12/12/12/12/6G5/12 w - - 0 1";
        let mut board = Board::from_hfen(hfen).expect("test HFEN should parse");

        let promo = board
            .generate_moves()
            .iter()
            .copied()
            .find(|m| m.is_promo() && m.promo_piece() == PieceType::Q)
            .expect("queen promotion should be legal");
        board.apply_move(promo);

        let out = board.get_hfen();
        // The square keeps identity 'M', written as an inline `M:Q` pair on
        // the promotion square itself; the HFEN stays six fields.
        assert!(
            out.starts_with("M:Q11/"),
            "expected an inline 'M:Q' pair on a12, got: {out}"
        );
        assert_eq!(
            out.split_whitespace().count(),
            6,
            "inline pairs must not add extra fields: {out}"
        );

        let reparsed = Board::from_hfen(&out).expect("promoted HFEN-I should parse");
        let a12 = SQ::make(0, 11);
        assert_eq!(reparsed.piece_at(a12), Piece::WhiteQueen);
        assert_eq!(reparsed.piece_identity_at(a12), Some('M'));
        // Stable round-trip and identical position hash.
        assert_eq!(reparsed.get_hfen(), out);
        assert_eq!(reparsed.state.zobrist, board.state.zobrist);
        // The reparsed queen must move like a queen (same legal move count).
        assert_eq!(
            reparsed.generate_moves().len(),
            board.generate_moves().len()
        );
    }

    #[test]
    fn test_promotion_round_trip_all_types() {
        use crate::core::PieceType;
        let hfen = "12/M11/6g5/12/12/12/12/12/12/12/6G5/12 w - - 0 1";
        let base = Board::from_hfen(hfen).expect("test HFEN should parse");
        let promos: Vec<_> = base
            .generate_moves()
            .iter()
            .copied()
            .filter(|m| m.is_promo() && !m.is_capture())
            .collect();
        assert!(!promos.is_empty());
        for m in promos {
            let mut board = base.clone();
            board.apply_move(m);
            let out = board.get_hfen();
            let reparsed = Board::from_hfen(&out).expect("promoted HFEN-I should parse");
            let a12 = SQ::make(0, 11);
            assert_eq!(
                reparsed.piece_at(a12).player_piece_lossy().1,
                m.promo_piece(),
                "promotion to {:?} did not round-trip: {out}",
                m.promo_piece()
            );
            assert_eq!(reparsed.piece_identity_at(a12), Some('M'));
            assert_eq!(reparsed.get_hfen(), out);
        }
        // Sanity: a promotion move exists for the queen at minimum.
        assert!(base
            .generate_moves()
            .iter()
            .any(|m| m.is_promo() && m.promo_piece() == PieceType::Q));
    }

    /// The canonical multi-promotion sample from the rules doc: two promoted
    /// pieces per side, written as inline `id:Type` pairs, six fields total.
    #[test]
    fn test_multi_promotion_inline_pairs_round_trip() {
        let hfen = "M:Q10N:E/6g5/2o9/12/12/12/12/12/12/2O9/6G5/m:q10x:h w - - 3 40";
        let board = Board::from_hfen(hfen).expect("multi-promotion HFEN-I should parse");

        // Promoted current types.
        assert_eq!(board.piece_at(SQ::make(0, 11)), Piece::WhiteQueen); // a12 = M:Q
        assert_eq!(board.piece_at(SQ::make(11, 11)), Piece::WhiteEagle); // l12 = N:E
        assert_eq!(board.piece_at(SQ::make(0, 0)), Piece::BlackQueen); // a1 = m:q
        assert_eq!(board.piece_at(SQ::make(11, 0)), Piece::BlackHawk); // l1 = x:h

        // Identities preserved through the pairs.
        assert_eq!(board.piece_identity_at(SQ::make(0, 11)), Some('M'));
        assert_eq!(board.piece_identity_at(SQ::make(11, 11)), Some('N'));
        assert_eq!(board.piece_identity_at(SQ::make(0, 0)), Some('m'));
        assert_eq!(board.piece_identity_at(SQ::make(11, 0)), Some('x'));

        // Unpromoted pawns in the same position stay pawns.
        assert_eq!(board.piece_at(SQ::make(2, 2)), Piece::WhitePawn); // c3 = O
        assert_eq!(board.piece_at(SQ::make(2, 9)), Piece::BlackPawn); // c10 = o

        // Byte-stable round-trip: the input already is the canonical form.
        assert_eq!(board.get_hfen(), hfen);
    }

    /// Malformed inline pairs are rejected, not coerced.
    #[test]
    fn test_inline_pair_rejects_malformed() {
        // Color change: white identity, black type.
        assert!(Board::from_hfen("M:q11/6g5/12/12/12/12/12/12/12/12/6G5/12 w - - 0 1").is_err());
        // Invalid type character.
        assert!(Board::from_hfen("M:Z11/6g5/12/12/12/12/12/12/12/12/6G5/12 w - - 0 1").is_err());
        // Dangling colon at end of rank.
        assert!(Board::from_hfen("11M:/6g5/12/12/12/12/12/12/12/12/6G5/12 w - - 0 1").is_err());
    }

    #[test]
    fn test_promotion_round_trip_legacy_mode() {
        // Legacy (type-character) HFEN: the promoted square serializes as its
        // current type directly — no override field needed.
        let hfen = "12/P11/6k5/12/12/12/12/12/12/12/6K5/12 w - - 0 1";
        let mut board = Board::from_hfen(hfen).expect("test HFEN should parse");
        let promo = board
            .generate_moves()
            .iter()
            .copied()
            .find(|m| m.is_promo() && m.promo_piece() == crate::core::PieceType::Q)
            .expect("queen promotion should be legal");
        board.apply_move(promo);
        let out = board.get_hfen();
        assert_eq!(
            out.split_whitespace().count(),
            6,
            "legacy HFEN should not need an override field: {out}"
        );
        let reparsed = Board::from_hfen(&out).expect("legacy HFEN should parse");
        assert_eq!(reparsed.piece_at(SQ::make(0, 11)), Piece::WhiteQueen);
        assert_eq!(reparsed.get_hfen(), out);
    }

    #[test]
    fn test_ep_parse() {
        assert_eq!(parse_ep_square("-"), super::super::super::core::sq::NO_SQ);
        assert_eq!(parse_ep_square("e4"), SQ::make(4, 3));
        assert_eq!(parse_ep_square("l12"), SQ::make(11, 11));
    }
}
