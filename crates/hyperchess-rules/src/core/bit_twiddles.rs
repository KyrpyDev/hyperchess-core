// SPDX-License-Identifier: GPL-3.0-or-later
// HyperChess Core — hyperchess-rules
// File: crates/hyperchess-rules/src/core/bit_twiddles.rs
// Version: 1.0.0
// Copyright (c) 2026 HyperChess Developer Team

//! Bit manipulation helpers.

/// Returns the number of set bits in a u64.
#[inline(always)]
pub fn popcount64(b: u64) -> u8 {
    b.count_ones() as u8
}

/// Returns the index of the least significant bit.
///
/// # Safety
/// Undefined behavior if `b` is 0.
#[inline(always)]
pub fn bit_scan_forward(b: u64) -> u8 {
    debug_assert!(b != 0);
    b.trailing_zeros() as u8
}

/// Returns the index of the most significant bit.
///
/// # Safety
/// Undefined behavior if `b` is 0.
#[inline(always)]
pub fn bit_scan_reverse(b: u64) -> u8 {
    debug_assert!(b != 0);
    63 - b.leading_zeros() as u8
}

/// Returns the least significant bit as a u64.
//
// Clippy 1.98+ suggests `b.isolate_lowest_one()` here (manual_isolate_lowest_one).
// That method is still unstable on 1.96 (`isolate_most_least_significant_one`), so
// taking the suggestion would raise this crate's effective minimum toolchain just to
// satisfy a lint. The `unknown_lints` allow keeps the attribute harmless on older
// clippy versions, which do not know the lint name at all.
#[allow(unknown_lints)]
#[allow(clippy::manual_isolate_lowest_one)]
#[inline(always)]
pub fn lsb(b: u64) -> u64 {
    b & b.wrapping_neg()
}

/// Returns the most significant bit as a u64.
#[inline(always)]
pub fn msb(b: u64) -> u64 {
    if b == 0 {
        return 0;
    }
    1u64 << (63 - b.leading_zeros())
}

/// Returns true if more than one bit is set.
#[inline(always)]
pub fn more_than_one(b: u64) -> bool {
    b & b.wrapping_sub(1) != 0
}

/// Reverses the byte order of a u64 (for display).
#[inline(always)]
pub fn reverse_bytes(b: u64) -> u64 {
    b.swap_bytes()
}

/// Formats a u64 as a 8x8 grid string (for debugging).
pub fn string_u64(b: u64) -> String {
    let mut s = String::with_capacity(72);
    for rank in (0..8).rev() {
        for file in 0..8 {
            let bit = rank * 8 + file;
            if (b >> bit) & 1 == 1 {
                s.push('1');
            } else {
                s.push('.');
            }
            s.push(' ');
        }
        s.push('\n');
    }
    s
}
