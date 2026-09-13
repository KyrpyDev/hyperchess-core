// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-rules
// File: crates/hyperchess-rules/src/io/mod.rs
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

//! HyperChess I/O module: HPGN-I parsing, HSAN conversion, game import/export.

pub mod hsan_export;
pub mod hsan_parse;

pub use hsan_export::hypermove_to_hsan;
pub use hsan_parse::{hsan_to_hypermove, parse_hsan, CastleSide, CheckMarker, HsanMove};
