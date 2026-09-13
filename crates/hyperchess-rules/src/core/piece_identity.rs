// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-rules
// File: crates/hyperchess-rules/src/core/piece_identity.rs
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

//! Identity-HFEN piece characters.
//!
//! HFEN-I assigns a stable character to every original starting piece. The
//! character is identity, not piece type: for example `Q` is the white pawn
//! that starts on e3, while `F` is the white queen that starts on f2.

use super::piece::Piece;

/// No identity is present on this square.
pub const NO_PIECE_ID: char = '\0';

/// Starting position in HyperChess Identity-HFEN (HFEN-I).
///
/// Castling field is `KQkq` (all four rights available) — the JS/TS layer's
/// own starting-position literals (`packages/board/src/web-component/hyperchess-board.ts`,
/// the `packages/store`/`packages/core` test fixtures) already encode this
/// correctly. This constant previously wrote `-` here, which meant
/// `Board::start_pos()` began every game with zero castling rights; since
/// `CastleRights::update_for_move` only ever clears bits, never sets them,
/// no game started from this constant could ever castle.
pub const START_HFEN_I: &str =
    "12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1";

/// Returns true when `c` is a legal HFEN-I identity character.
pub fn is_identity_char(c: char) -> bool {
    matches!(c, 'A'..='X' | 'a'..='x')
}

/// Returns true when `c` is a legal **inline promotion type** letter for an
/// `id:Type` pair — the promotion set `Q R B N E H` in either case.
///
/// HFEN-I law: the string is self-contained. The type half of an `id:Type`
/// pair is the piece's *current* type, and the only way a piece's type can
/// differ from its identity's starting type is promotion — so the type half
/// is restricted to the promotion set. Accepting `K` or `P` here would let a
/// string describe a position no game can reach (a second king, or a pair
/// that says nothing).
pub fn is_promotion_type_char(c: char) -> bool {
    matches!(
        c,
        'Q' | 'R' | 'B' | 'N' | 'E' | 'H' | 'q' | 'r' | 'b' | 'n' | 'e' | 'h'
    )
}

/// Returns true when `c` is an ordinary type-based HyperChess HFEN character.
pub fn is_legacy_piece_char(c: char) -> bool {
    matches!(
        c,
        'P' | 'N'
            | 'B'
            | 'R'
            | 'Q'
            | 'K'
            | 'E'
            | 'H'
            | 'p'
            | 'n'
            | 'b'
            | 'r'
            | 'q'
            | 'k'
            | 'e'
            | 'h'
    )
}

/// A position field is considered HFEN-I when it contains at least one
/// identity-only character. This keeps old tactical/test FENs parseable.
pub fn position_uses_identity(position: &str) -> bool {
    position
        .chars()
        .any(|c| c.is_ascii_alphabetic() && is_identity_char(c) && !is_legacy_piece_char(c))
}

/// Maps an HFEN-I identity character to the piece type it starts as.
pub fn piece_from_identity(c: char) -> Option<Piece> {
    match c {
        'A' | 'L' => Some(Piece::WhiteEagle),
        'B' | 'K' => Some(Piece::WhiteHawk),
        'C' | 'J' => Some(Piece::WhiteRook),
        'D' | 'I' => Some(Piece::WhiteKnight),
        'E' | 'H' => Some(Piece::WhiteBishop),
        'F' => Some(Piece::WhiteQueen),
        'G' => Some(Piece::WhiteKing),
        'M'..='X' => Some(Piece::WhitePawn),
        'a' | 'l' => Some(Piece::BlackEagle),
        'b' | 'k' => Some(Piece::BlackHawk),
        'c' | 'j' => Some(Piece::BlackRook),
        'd' | 'i' => Some(Piece::BlackKnight),
        'e' | 'h' => Some(Piece::BlackBishop),
        'f' => Some(Piece::BlackQueen),
        'g' => Some(Piece::BlackKing),
        'm'..='x' => Some(Piece::BlackPawn),
        _ => None,
    }
}

/// Material value for an HFEN-I identity character, using its starting type.
pub fn identity_material_value(c: char) -> Option<i32> {
    piece_from_identity(c).map(|piece| match piece {
        Piece::WhitePawn | Piece::BlackPawn => 100,
        Piece::WhiteKnight | Piece::BlackKnight => 320,
        Piece::WhiteBishop | Piece::BlackBishop => 330,
        Piece::WhiteRook | Piece::BlackRook => 500,
        Piece::WhiteQueen | Piece::BlackQueen => 900,
        Piece::WhiteEagle | Piece::BlackEagle => 700,
        Piece::WhiteHawk | Piece::BlackHawk => 550,
        Piece::WhiteKing | Piece::BlackKing | Piece::None => 0,
    })
}
