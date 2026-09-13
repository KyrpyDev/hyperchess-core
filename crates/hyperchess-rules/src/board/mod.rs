// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-rules
// File: crates/hyperchess-rules/src/board/mod.rs
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

//! Board representation for HyperChess.
//!
//! The `Board` type and its core accessors live here; behaviorally distinct
//! concerns are split into focused submodules:
//!
//! * [`move_apply`] — `apply_move` / `undo_move` / null moves.
//! * [`attacks`]    — attacker queries and check detection.
//! * [`draw_rules`] — checkmate/stalemate, repetition, insufficient material.
//! * [`display`]    — human-readable rendering.
//! * [`movegen`]    — legal move generation.

pub mod attacks;
pub mod board_state;
pub mod castle_rights;
pub mod display;
pub mod draw_rules;
pub mod hfen;
pub mod move_apply;
pub mod movegen;
pub mod perft;
pub mod piece_locations;

use crate::core::bitboard::BitBoard;
use crate::core::masks::*;
use crate::core::move_list::MoveList;
use crate::core::piece_identity::NO_PIECE_ID;
use crate::core::piece_move::HyperMove;
use crate::core::sq::{NO_SQ, SQ};
use crate::core::{Piece, PieceType, Player};
use crate::helper::prelude::*;
use crate::helper::zobrist::ZOBRIST;

use board_state::BoardState;
use castle_rights::CastleRights;
use piece_locations::PieceLocations;

/// The HyperChess board.
#[derive(Clone)]
pub struct Board {
    /// Bitboards per piece type per player: [player][piece_type]
    /// PieceType indices: None=0, P=1, N=2, B=3, R=4, Q=5, K=6, E=7, H=8, All=9
    piece_bbs: [[BitBoard; PIECE_TYPE_CNT]; PLAYER_CNT],
    /// Occupancy per player.
    occ_player: [BitBoard; PLAYER_CNT],
    /// Total occupancy.
    occ_all: BitBoard,
    /// Square-to-piece map.
    piece_locs: PieceLocations,
    /// Square-to-HFEN-I identity map. `NO_PIECE_ID` means no identity is tracked.
    piece_ids: [char; SQ_CNT],
    /// Side to move.
    turn: Player,
    /// Current game state (castling, ep, zobrist, etc.).
    pub state: BoardState,
    /// King squares per player.
    king_sq: [SQ; PLAYER_CNT],
    /// Ply count from root.
    ply: u16,
    /// Zobrist hashes of positions seen this game (for repetition detection).
    pub history: Vec<u64>,
}

impl Board {
    /// Creates a board from the starting position.
    pub fn start_pos() -> Self {
        Self::from_hfen(START_HFEN).expect("Invalid start HFEN")
    }

    /// Creates a board from a HFEN string.
    pub fn from_hfen(hfen_str: &str) -> Result<Self, String> {
        init_statics();

        let data = hfen::parse_hfen(hfen_str)?;
        hfen::validate_king_count(&data.pieces)?;

        let mut board = Board {
            piece_bbs: [[BitBoard::EMPTY; PIECE_TYPE_CNT]; PLAYER_CNT],
            occ_player: [BitBoard::EMPTY; PLAYER_CNT],
            occ_all: BitBoard::EMPTY,
            piece_locs: PieceLocations::new(),
            piece_ids: [NO_PIECE_ID; SQ_CNT],
            turn: data.turn,
            state: BoardState::new(),
            king_sq: [NO_SQ; PLAYER_CNT],
            ply: 0,
            history: Vec::new(),
        };

        for &(sq, piece, identity) in &data.pieces {
            let (player, pt) = piece.player_piece_lossy();
            board.place_piece_with_id(sq, piece, player, pt, identity);
            if pt == PieceType::K {
                board.king_sq[player as usize] = sq;
            }
        }

        board.state.castling = CastleRights::from_hfen(&data.castling);
        board.state.ep_square = hfen::parse_ep_square(&data.ep);
        board.state.rule50 = data.rule50;
        board.state.fullmove = data.fullmove;

        board.state.zobrist = board.compute_zobrist();
        board.state.checkers = board.compute_checkers();

        Ok(board)
    }

    /// Returns the current HFEN string.
    pub fn get_hfen(&self) -> String {
        hfen::to_hfen(self)
    }

    /// Returns the side to move.
    #[inline(always)]
    pub fn turn(&self) -> Player {
        self.turn
    }

    /// Returns the piece at a square.
    #[inline(always)]
    pub fn piece_at(&self, sq: SQ) -> Piece {
        self.piece_locs.piece_at(sq)
    }

    /// Returns the piece a (pseudo-)legal move of the side to move captures,
    /// or `Piece::None` for non-captures.
    ///
    /// Unlike `piece_at(m.get_dest())`, this resolves **en passant** correctly:
    /// an EP capture lands on an empty square and takes the pawn *behind* it.
    /// MVV-LVA ordering and SEE must use this instead of reading the destination.
    #[inline]
    pub fn captured_piece_for_move(&self, m: HyperMove) -> Piece {
        if m.is_en_passant() {
            self.piece_at(self.ep_captured_sq(m))
        } else {
            self.piece_at(m.get_dest())
        }
    }

    /// The square of the pawn removed by an en-passant capture `m` (the square
    /// directly behind the destination, from the mover's perspective).
    #[inline]
    pub fn ep_captured_sq(&self, m: HyperMove) -> SQ {
        SQ((m.get_dest().0 as i16 - self.turn.pawn_push()) as u8)
    }

    /// Returns the stable HFEN-I identity at a square, if one is tracked.
    #[inline(always)]
    pub fn piece_identity_at(&self, sq: SQ) -> Option<char> {
        let id = self.piece_ids[sq.0 as usize];
        if id == NO_PIECE_ID {
            None
        } else {
            Some(id)
        }
    }

    /// Returns the character to serialize for a square in HFEN/HFEN-I.
    #[inline(always)]
    pub fn piece_hfen_char_at(&self, sq: SQ) -> Option<char> {
        self.piece_identity_at(sq)
            .or_else(|| self.piece_at(sq).character())
    }

    /// Returns the king square for a player.
    #[inline(always)]
    pub fn king_sq(&self, player: Player) -> SQ {
        self.king_sq[player as usize]
    }

    /// Returns the bitboard of a piece type for a player.
    #[inline(always)]
    pub fn piece_bb(&self, player: Player, pt: PieceType) -> BitBoard {
        self.piece_bbs[player as usize][pt as usize]
    }

    /// Returns the combined bitboard for two piece types for a player.
    #[inline(always)]
    pub fn piece_bb2(&self, player: Player, pt1: PieceType, pt2: PieceType) -> BitBoard {
        self.piece_bbs[player as usize][pt1 as usize]
            | self.piece_bbs[player as usize][pt2 as usize]
    }

    /// Returns occupancy for a player.
    #[inline(always)]
    pub fn occupied_player(&self, player: Player) -> BitBoard {
        self.occ_player[player as usize]
    }

    /// Returns total occupancy.
    #[inline(always)]
    pub fn occupied(&self) -> BitBoard {
        self.occ_all
    }

    /// Returns the bitboard of checkers to the side to move.
    #[inline(always)]
    pub fn checkers(&self) -> BitBoard {
        self.state.checkers
    }

    /// Returns true if the side to move is in check.
    #[inline(always)]
    pub fn in_check(&self) -> bool {
        self.state.checkers.is_not_empty()
    }

    /// Returns the ply count.
    #[inline(always)]
    pub fn ply(&self) -> u16 {
        self.ply
    }

    /// Generate all legal moves.
    pub fn generate_moves(&self) -> MoveList {
        let mut list = MoveList::new();
        movegen::generate_all_moves(self, &mut list);
        list
    }

    // === Internal piece placement ===

    fn place_piece(&mut self, sq: SQ, piece: Piece, player: Player, pt: PieceType) {
        self.place_piece_with_id(sq, piece, player, pt, piece.character_lossy());
    }

    fn place_piece_with_id(
        &mut self,
        sq: SQ,
        piece: Piece,
        player: Player,
        pt: PieceType,
        identity: char,
    ) {
        self.piece_bbs[player as usize][pt as usize].set_bit(sq);
        self.occ_player[player as usize].set_bit(sq);
        self.occ_all.set_bit(sq);
        self.piece_locs.place(sq, piece);
        self.piece_ids[sq.0 as usize] = identity;
        self.state.zobrist ^= ZOBRIST.piece_at(piece, sq);
    }

    fn remove_piece(&mut self, sq: SQ, piece: Piece, player: Player, pt: PieceType) {
        self.remove_piece_with_id(sq, piece, player, pt);
    }

    fn remove_piece_with_id(
        &mut self,
        sq: SQ,
        piece: Piece,
        player: Player,
        pt: PieceType,
    ) -> char {
        self.piece_bbs[player as usize][pt as usize].clear_bit(sq);
        self.occ_player[player as usize].clear_bit(sq);
        self.occ_all.clear_bit(sq);
        self.piece_locs.remove(sq);
        let identity = self.piece_ids[sq.0 as usize];
        self.piece_ids[sq.0 as usize] = NO_PIECE_ID;
        self.state.zobrist ^= ZOBRIST.piece_at(piece, sq);
        identity
    }

    /// Compute Zobrist hash from scratch.
    pub fn compute_zobrist(&self) -> u64 {
        let mut z = ZOBRIST.version_salt;
        for sq_idx in 0..144u8 {
            let sq = SQ(sq_idx);
            let piece = self.piece_locs.piece_at(sq);
            if piece != Piece::None {
                z ^= ZOBRIST.piece_at(piece, sq);
            }
        }
        z ^= ZOBRIST.castle(self.state.castling.0);
        if self.state.ep_square.is_okay() {
            z ^= ZOBRIST.ep_file(self.state.ep_square.file_idx());
        }
        if self.turn == Player::Black {
            z ^= ZOBRIST.side;
        }
        z
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_start_position() {
        let board = Board::start_pos();
        assert_eq!(board.turn(), Player::White);

        // White king at g2
        assert_eq!(board.king_sq(Player::White), SQ(18));
        assert_eq!(board.piece_at(SQ(18)).type_of(), PieceType::K);

        // Black king at g11
        assert_eq!(board.king_sq(Player::Black), SQ(126));

        // White pawns on rank 3 (indices 24-35)
        for file in 0..12u8 {
            let sq = SQ::make(file, 2);
            assert_eq!(board.piece_at(sq).type_of(), PieceType::P);
        }

        // Black pawns on rank 10 (indices 108-119)
        for file in 0..12u8 {
            let sq = SQ::make(file, 9);
            assert_eq!(board.piece_at(sq).type_of(), PieceType::P);
        }

        // Rank 1 and 12 are empty
        for file in 0..12u8 {
            assert_eq!(board.piece_at(SQ::make(file, 0)), Piece::None);
            assert_eq!(board.piece_at(SQ::make(file, 11)), Piece::None);
        }
    }

    #[test]
    fn test_hfen_round_trip() {
        let board = Board::start_pos();
        let hfen = board.get_hfen();
        let board2 = Board::from_hfen(&hfen).unwrap();
        let hfen2 = board2.get_hfen();
        assert_eq!(hfen, hfen2);
    }

    #[test]
    fn test_apply_undo_move() {
        let mut board = Board::start_pos();
        let original_hfen = board.get_hfen();
        let moves = board.generate_moves();
        assert!(!moves.is_empty());

        let m = moves.get(0);
        board.apply_move(m);
        assert_eq!(board.turn(), Player::Black);

        board.undo_move();
        assert_eq!(board.turn(), Player::White);
        assert_eq!(board.get_hfen(), original_hfen);
    }

    #[test]
    fn test_random_games_terminate() {
        // Play 10 random games and verify:
        // 1. All generated moves are legal
        // 2. Games terminate within a reasonable number of moves
        // 3. No panics or inconsistencies
        use rand::Rng;
        let mut rng = rand::thread_rng();

        for game_num in 0..10 {
            let mut board = Board::start_pos();
            let mut move_count = 0u32;
            let max_moves = 500;

            while !board.is_game_over() && move_count < max_moves {
                let moves = board.generate_moves();
                if moves.is_empty() {
                    break;
                }

                // Verify all moves are legal (don't leave king in check)
                for m in moves.iter() {
                    let mut test = board.clone();
                    test.apply_move(*m);
                    let us = if board.turn() == Player::White {
                        Player::White
                    } else {
                        Player::Black
                    };
                    assert!(
                        !test.is_attacked(us),
                        "Game {}, move {}: Generated move {} is illegal",
                        game_num,
                        move_count,
                        m
                    );
                }

                // Pick a random move
                let idx = rng.gen_range(0..moves.len());
                let m = moves.get(idx);
                board.apply_move(m);
                move_count += 1;
            }

            // Verify game ended properly
            let result = board.game_result();
            if move_count >= max_moves {
                // Hit move limit, OK (draw by rule)
            } else {
                // Game ended naturally: must be checkmate, stalemate, or 50-move draw
                assert!(
                    result != 0 || board.is_game_over(),
                    "Game {} ended at move {} but result is ongoing",
                    game_num,
                    move_count
                );
            }

            println!("Game {}: {} moves, result={}", game_num, move_count, result);
        }
    }

    #[test]
    fn test_zobrist_consistency() {
        // Verify that Zobrist hash computed incrementally matches full recomputation
        let mut board = Board::start_pos();
        use rand::Rng;
        let mut rng = rand::thread_rng();

        for _ in 0..50 {
            let moves = board.generate_moves();
            if moves.is_empty() {
                break;
            }
            let idx = rng.gen_range(0..moves.len());
            board.apply_move(moves.get(idx));

            let incremental = board.state.zobrist;
            let recomputed = board.compute_zobrist();
            assert_eq!(
                incremental,
                recomputed,
                "Zobrist mismatch after move: incremental={:#x}, recomputed={:#x}\nHFEN: {}",
                incremental,
                recomputed,
                board.get_hfen()
            );
        }
    }
}

// `hfen_consistency_tests` and `engine_integrity_tests` (both exercised
// Board rules correctness via AlphaBetaSearcher — verifying best_move()
// doesn't mutate the board, and a fixed-move fullmove-counter regression)
// deliberately NOT copied here: they need hyperchess-search, which depends on
// this crate, not the other way around. Deferred to Phase 3
// (docs/hyperchess-core-extraction-plan.md) — reinstate them in
// hyperchess-search's own test suite once it exists, reading the original
// content from kyrpy-hyperchess-rust's src/hyperchess/src/board/mod.rs
// (git history, lines ~436-518 as of the Phase 1 extraction).
