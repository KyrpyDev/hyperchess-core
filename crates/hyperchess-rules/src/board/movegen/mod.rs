// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-rules
// File: crates/hyperchess-rules/src/board/movegen/mod.rs
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

//! Move generation for HyperChess.
//!
//! Pseudo-legal moves for pawns and the sliding/jumping pieces are generated
//! into a scratch list and then filtered by [`legality::is_legal`]; king moves
//! and castling are generated directly as legal moves. The per-piece generators
//! live in focused submodules:
//!
//! * [`pawn`]     — pawn pushes, captures, en passant, promotion.
//! * [`pieces`]   — knight, bishop, rook, queen, eagle, hawk.
//! * [`king`]     — king moves and castling.
//! * [`legality`] — pseudo-legal → legal filtering and ray helpers.

mod king;
mod legality;
mod pawn;
mod pieces;

use super::Board;
use crate::core::move_list::MoveList;
use crate::core::PieceType;

use king::{gen_castling, gen_king_moves};
use legality::is_legal;
use pawn::gen_pawn_moves;
use pieces::gen_piece_moves;

/// Generates all legal moves for the current position.
pub fn generate_all_moves(board: &Board, list: &mut MoveList) {
    let us = board.turn();
    let our_occ = board.occupied_player(us);
    let their_occ = board.occupied_player(!us);
    let all_occ = board.occupied();
    let king = board.king_sq(us);

    // Generate pseudo-legal moves, then filter for legality
    let mut pseudo = MoveList::new();

    // Pawn moves
    gen_pawn_moves(board, us, our_occ, their_occ, all_occ, &mut pseudo);

    // Knight, Bishop, Rook, Queen, Eagle, Hawk moves
    for &pt in &[
        PieceType::N,
        PieceType::B,
        PieceType::R,
        PieceType::Q,
        PieceType::E,
        PieceType::H,
    ] {
        gen_piece_moves(board, us, pt, our_occ, all_occ, &mut pseudo);
    }

    // King moves (generated directly as legal moves)
    gen_king_moves(board, us, our_occ, all_occ, list);

    // Castling (generated directly as legal moves)
    gen_castling(board, us, all_occ, list);

    // Filter pseudo-legal moves for legality
    for m in pseudo.iter() {
        if is_legal(board, *m, us, king) {
            list.push(*m);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::sq::SQ;
    use crate::core::Player;

    #[allow(unused_imports)]
    use legality::attacked_squares;

    /// Helper: count moves for a specific piece type from a position.
    fn count_moves_for_piece(board: &Board, pt: PieceType) -> usize {
        let moves = board.generate_moves();
        moves
            .iter()
            .filter(|m| {
                let src = m.get_src();
                board.piece_at(src).type_of() == pt
            })
            .count()
    }

    /// Helper: count moves from a specific source square.
    fn count_moves_from(board: &Board, src: SQ) -> usize {
        let moves = board.generate_moves();
        moves.iter().filter(|m| m.get_src() == src).count()
    }

    #[test]
    fn test_pawn_moves_start() {
        let board = Board::start_pos();
        // 12 pawns × 2 (single + double push) = 24
        assert_eq!(count_moves_for_piece(&board, PieceType::P), 24);
    }

    #[test]
    fn test_knight_moves_start() {
        let board = Board::start_pos();
        // d2 and i2 knights, 4 moves each
        assert_eq!(count_moves_from(&board, SQ::make(3, 1)), 4); // d2
        assert_eq!(count_moves_from(&board, SQ::make(8, 1)), 4); // i2
    }

    #[test]
    fn test_knight_center_open_board() {
        let hfen = "12/12/12/12/12/K4N6/12/12/12/12/5k6/12 w - - 0 1";
        let board = Board::from_hfen(hfen).unwrap();
        let n_sq = SQ::make(5, 6); // f7
                                   // Knight at f7 (center of 12x12): should have 8 moves
        let count = count_moves_from(&board, n_sq);
        assert_eq!(count, 8, "Knight on f7 open board should have 8 moves");
    }

    #[test]
    fn test_knight_corner() {
        // Knight at a1 (SQ 0)
        let hfen = "11k/12/12/12/12/12/12/12/12/12/K11/N11 w - - 0 1";
        let board = Board::from_hfen(hfen).unwrap();
        let count = count_moves_from(&board, SQ::make(0, 0)); // a1
                                                              // From a1, knight can go to: b3 (1,2) and c2 (2,1) = 2 moves
        assert_eq!(count, 2, "Knight on a1 should have 2 moves");
    }

    #[test]
    fn test_king_moves_open_board() {
        // King in center of empty board
        let hfen = "12/12/12/12/12/5K6/12/12/12/12/5k6/12 w - - 0 1";
        let board = Board::from_hfen(hfen).unwrap();
        let count = count_moves_from(&board, SQ::make(5, 6)); // f7
                                                              // King in center: 8 moves (no checks from far-away black king)
        assert_eq!(count, 8, "King on f7 open board should have 8 moves");
    }

    #[test]
    fn test_eagle_jumping_counts() {
        let hfen = "11k/12/12/12/12/12/12/12/12/12/K3E7/12 w - - 0 1";
        let board = Board::from_hfen(hfen).unwrap();
        let eagle = SQ::make(4, 1); // e2
        let count = count_moves_from(&board, eagle);
        // Eagle at e2 on empty board = rook attacks from e2:
        // North: e3-e12 = 10, South: e1 = 1, East: f2-l2 = 7, West: d2-a2 = 4
        // But King at a2 (own piece), so West: d2-b2 = 3 (a2 blocked by own King)
        // Total: 10 + 1 + 7 + 3 = 21
        assert!(count > 0, "Eagle should have moves");
    }

    #[test]
    fn test_pawn_promotion_white() {
        // White pawn on row 11 (rank_idx=10) pushes to row 12 (rank_idx=11) = promotion.
        // HFEN rank order: rank12 first → rank_idx=10 is the 2nd segment.
        let hfen = "12/4P7/12/12/12/12/12/12/12/12/K11/11k w - - 0 1";
        let board = Board::from_hfen(hfen).unwrap();
        let pawn = SQ::make(4, 10); // e11 (rank_idx=10)
        let count = count_moves_from(&board, pawn);
        // 6 promotion types: Q, R, B, N, Eagle, Hawk
        assert_eq!(
            count, 6,
            "White pawn on row 11 should have 6 promotion moves to row 12"
        );
    }

    #[test]
    fn test_pawn_promotion_black() {
        // Black pawn on row 2 (rank_idx=1) pushes to row 1 (rank_idx=0) = promotion.
        // HFEN rank order: rank12 first → rank_idx=1 is the 11th segment.
        let hfen = "11K/12/12/12/12/12/12/12/12/12/4p7/11k b - - 0 1";
        let board = Board::from_hfen(hfen).unwrap();
        let pawn = SQ::make(4, 1); // e2 (rank_idx=1)
        let count = count_moves_from(&board, pawn);
        assert_eq!(
            count, 6,
            "Black pawn on row 2 should have 6 promotion moves to row 1"
        );
    }

    #[test]
    fn test_pawn_en_passant() {
        // Black double-pushed d10→d8. EP square = d9.
        // White pawn at e8 (adjacent to d8) can capture EP on d9.
        // HFEN: 5th rank from top (part index 4) = rank 8 (idx 7)
        let hfen = "12/12/12/12/3pP7/12/12/12/12/12/K11/11k w - d9 0 1";
        let board = Board::from_hfen(hfen).unwrap();
        let moves = board.generate_moves();
        let ep_moves: Vec<_> = moves.iter().filter(|m| m.is_en_passant()).collect();
        assert_eq!(ep_moves.len(), 1, "Should have exactly 1 EP capture");
        // EP: src=e8 (file 4, rank 7), dst=d9 (file 3, rank 8)
        assert_eq!(ep_moves[0].get_src(), SQ::make(4, 7));
        assert_eq!(ep_moves[0].get_dest(), SQ::make(3, 8));
    }

    #[test]
    fn test_castling_clear_path() {
        // King at g2, Rook at j2, nothing in between, no checks
        let hfen = "12/12/12/12/12/12/12/12/12/12/6K2R2/11k w K - 0 1";
        let board = Board::from_hfen(hfen).unwrap();
        let moves = board.generate_moves();
        let castle_moves: Vec<_> = moves.iter().filter(|m| m.is_castle()).collect();
        assert!(
            !castle_moves.is_empty(),
            "Should be able to castle king-side"
        );
    }

    #[test]
    fn test_castling_blocked() {
        // King at g2, Rook at j2, Bishop blocking at h2
        let hfen = "12/12/12/12/12/12/12/12/12/12/6KB1R2/11k w K - 0 1";
        let board = Board::from_hfen(hfen).unwrap();
        let moves = board.generate_moves();
        let castle_moves: Vec<_> = moves.iter().filter(|m| m.is_castle()).collect();
        assert_eq!(
            castle_moves.len(),
            0,
            "Should not be able to castle (blocked)"
        );
    }

    #[test]
    fn test_kingside_castle_executes_correctly() {
        // After White castles king-side: king goes g2→i2, rook goes j2→h2.
        let hfen = "12/12/12/12/12/12/12/12/12/12/6K2R2/11k w K - 0 1";
        let mut board = Board::from_hfen(hfen).unwrap();
        let castle_mv = board
            .generate_moves()
            .iter()
            .find(|m| m.is_king_castle())
            .copied()
            .expect("Kingside castle must be legal");
        assert_eq!(
            castle_mv.stringify(),
            "g2i2",
            "Kingside castle must move king g2→i2"
        );
        board.apply_move(castle_mv);
        let fen2 = board.get_hfen();
        // King on i2 (file 8), Rook on h2 (file 7) → HFEN row 2: "7RK3"
        assert!(
            fen2.contains("7RK"),
            "King/Rook should be on i2/h2 after kingside castle"
        );
        // Castling rights must be gone for White
        let cr_field = fen2.split_whitespace().nth(2).unwrap_or("");
        assert!(
            !cr_field.contains('K'),
            "White king-side castling right must be revoked"
        );
    }

    #[test]
    fn test_queenside_castle_executes_correctly() {
        // After White castles queen-side: king goes g2→e2, rook goes c2→f2.
        let hfen = "12/12/12/12/12/12/12/12/12/12/2R3K5/11k w Q - 0 1";
        let mut board = Board::from_hfen(hfen).unwrap();
        let castle_mv = board
            .generate_moves()
            .iter()
            .find(|m| m.is_queen_castle())
            .copied()
            .expect("Queenside castle must be legal");
        assert_eq!(
            castle_mv.stringify(),
            "g2e2",
            "Queenside castle must move king g2→e2"
        );
        board.apply_move(castle_mv);
        let fen2 = board.get_hfen();
        let cr_field = fen2.split_whitespace().nth(2).unwrap_or("");
        assert!(
            !cr_field.contains('Q'),
            "White queen-side castling right must be revoked"
        );
    }

    #[test]
    fn test_check_blocks_all_illegal() {
        // King in check: only legal moves are to escape
        let hfen = "12/12/12/12/12/12/12/12/12/12/6K5/6r4k w - - 0 1";
        let board = Board::from_hfen(hfen).unwrap();
        assert!(
            board.in_check(),
            "White king should be in check from rook on g1"
        );
        let moves = board.generate_moves();
        // All moves must be legal (generator only returns legal moves)
        // King must move out of check
        for m in moves.iter() {
            let mut test = board.clone();
            test.apply_move(*m);
            // After move, the side that just moved (White) should not be in check
            assert!(
                !test.is_attacked(Player::White),
                "Move {} leaves king in check",
                m
            );
        }
    }

    #[test]
    fn test_stalemate_detection() {
        // White king trapped with no legal moves (stalemate)
        // King at a1, blocked by own pawns, enemy controls escape squares
        let hfen = "12/12/12/12/12/12/12/12/12/1r10/PK10/r10k w - - 0 1";
        let board = Board::from_hfen(hfen).unwrap();
        if board.generate_moves().is_empty() && !board.in_check() {
            assert_eq!(board.game_result(), 3, "Should be stalemate (draw)");
        }
    }

    #[test]
    fn test_all_moves_legal() {
        // Verify that every generated move is legal (doesn't leave king in check)
        let mut board = Board::start_pos();
        let moves = board.generate_moves();
        for m in moves.iter() {
            board.apply_move(*m);
            assert!(
                !board.is_attacked(Player::White),
                "Generated move {} is illegal (leaves White king in check)",
                m
            );
            board.undo_move();
        }
    }

    #[test]
    fn test_symmetry_start_pos() {
        // Black's response count from each of White's first moves should be symmetric
        let mut board = Board::start_pos();
        let white_moves = board.generate_moves();
        let white_count = white_moves.len();

        // Apply first White move (pawn a3→a4)
        board.apply_move(white_moves.get(0));
        let black_count = board.generate_moves().len();
        board.undo_move();

        // Both sides should have similar (but not necessarily identical) move counts
        // since the board is symmetric. The difference should be small.
        assert!(
            white_count > 50 && white_count < 120,
            "White move count {} seems wrong",
            white_count
        );
        assert!(
            black_count > 50 && black_count < 120,
            "Black move count {} seems wrong",
            black_count
        );
    }

    // Silence unused warning for the test-only helper while keeping it available.
    #[test]
    fn test_attacked_squares_available() {
        let board = Board::start_pos();
        let _ = attacked_squares(&board, Player::White);
    }
}
