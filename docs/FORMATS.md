# HFEN, HFEN-I, HSAN, and HPGN-I formats

HyperChess uses several complementary text formats, all designed for a 12×12 board,
reproducible replay, and — for the `-I` variants — pieces whose identity persists through
promotion. `hyperchess-rules::notation`, `hyperchess-rules::board::hfen` and
`hyperchess-rules::io` are the canonical implementation of all of them — do not hand-write a
parser or exporter elsewhere.

## The law

> **A HyperChess notation string is self-contained.**
> Everything needed to reconstruct the position, or to resolve the move, is inside the string.
> **No side table. No lookup. No defaulting of a field that could not be read.**

Three consequences, and every rule below is one of them applied to a field:

1. **Completeness** — a position carries both *which* piece is on a square and *what* it
   currently is; a move carries every constraint needed to pick exactly one legal move.
2. **No silent repair** — a field that cannot be read is an **error**. Substituting a default
   produces a different, legal-*looking* string the caller cannot detect. `KQkq` mistyped as
   `XYZ` must never quietly become "no castling rights".
3. **Round-trip integrity** — `serialize(parse(s)) == s`, byte for byte, promoted positions
   included.

**Ranks 10, 11 and 12 are two characters long.** No parser may locate a rank at a fixed offset
from either end of a token, and no serializer may place a character by counting back from the
end of a string. Every rank matches `1[0-2]|[1-9]`.

| Format | Purpose | Identity-aware? |
| --- | --- | --- |
| **HFEN** | One position, complete state | No |
| **HFEN-I** | One position, complete state, with piece identity | Yes |
| **HSAN** | One move, familiar algebraic style — grammar in [HSAN](#hsan-hyperchess-standard-algebraic-notation) below | No |
| **HPGN-I** | A full game record | Yes |

Standard chess FEN/PGN compatibility is intentionally **not** provided — HyperChess's 12×12
board, its two extra piece types, and identity-tracked promotions have no faithful encoding in
the classic formats. Don't feed HFEN to an orthodox-FEN parser, or vice versa.

## HFEN and HFEN-I

HFEN is the canonical single-position encoding: like orthodox FEN, slash-separated board ranks
followed by side to move, castling rights, en-passant information, the half-move clock, and the
full-move number, extended to a 12×12 board (see
[`docs/hyperchess-laws.md#1-board`](hyperchess-laws.md#1-board)).

**HFEN-I** is the identity-aware variant: every one of the 24 starting pieces per side gets its
own stable letter, which follows that piece through movement, capture history, and promotion —
rather than a type-only letter. The parser (`hyperchess-rules::core::piece_identity`) detects
HFEN-I automatically: a position is treated as identity-aware the moment it contains any
identity-only character (one that isn't also a valid legacy piece letter, per
`is_identity_char`/`is_legacy_piece_char`). Both styles parse into the same `Board` type and are
subject to exactly the same legality rules — identity is metadata carried alongside the board,
never an input to move generation.

The inline pair `M:Q` is **one square**: left character the stable identity, right character
the current type, restricted to the promotion set `Q R B N E H` with a matching colour. `M:K`
and `M:P` are rejected — promotion is the only way a piece's type can differ from its identity's
starting type. Pairs are emitted only when identity and current type disagree, so unpromoted
positions contain none. A **position** (as opposed to a well-formed string) must have exactly
one king per side; `Board::from_hfen` enforces this, while the lower-level `parse_hfen` does not,
so the engine's own movegen tests can still use board fragments.

The canonical start is
`12/abcdefghijkl/mnopqrstuvwx/12/12/12/12/12/12/MNOPQRSTUVWX/ABCDEFGHIJKL/12 w KQkq - 0 1`
(`core::masks::START_HFEN`). The castling field is `KQkq`, not `-`: rights are only ever
cleared, never granted, so a start written with `-` could never castle again.

Why keep identity at all, when a type-only HFEN is sufficient for legality? See
[Why HyperChess uses identity-bearing pieces](IDENTITY-PIECES.md) — in short: faithful game
history (which original pawn became an Eagle?), research-quality replay (tracing one piece
across a whole game), and unambiguous analysis on a board with more pieces and more promotion
options than orthodox chess.

## HSAN (HyperChess Standard Algebraic Notation)

The familiar, human-readable per-move notation — HyperChess's analogue of orthodox SAN — for
contexts where readability matters more than machine round-tripping. Engine I/O (UCI, the REST
API, CLI exports) generally uses coordinate notation instead (`g3g5`, `c11b11`). HSAN carries
**no piece identity**; for a durable, identity-preserving record use HPGN-I.

### Grammar

```text
hsan     := castle | normal
castle   := ( "O-O" | "O-O-O" ) marker?
normal   := piece? disamb? "x"? dest promo? marker?
piece    := "K" | "Q" | "R" | "B" | "N" | "E" | "H"      ; omitted for pawns
disamb   := file | rank | file rank
dest     := file rank
file     := "a".."l"
rank     := "1".."9" | "10" | "11" | "12"
promo    := "=" ( "Q" | "R" | "B" | "N" | "E" | "H" )
marker   := "+" | "#"
```

`0-0` / `0-0-0` are accepted as input aliases; output always uses the letter form.

### Rules

- **`E` and `H` are piece letters.** Eagle and Hawk are the variant's whole point; leaving them
  out of the alphabet makes `Ed4` parse as a pawn move and resolve to whatever else is legal there.
- **Disambiguation is mandatory.** Whenever another piece of the same type could reach the
  destination, the string names the source — file if unique, else rank, else both. With two
  Rooks, Knights, Bishops, Eagles and Hawks plus up to twelve promoted pieces a side, ambiguity
  is the normal case.
- **A capturing pawn always writes its source file** (`axb10`).
- **The capture marker is placed by construction**, immediately before the destination — never
  inserted at an offset from the end of the string.
- **`O-O` and `O-O-O` stay distinguishable** end to end, so a recorded queen-side castle can
  never replay as king-side.
- **Every constraint in the string is applied on resolution**, the piece letter included.
  Resolution yields exactly one legal move, or an error — never a guess.

Round-trip guarantee, asserted over the full legal-move set of several positions in
`io/hsan_parse.rs`: `resolve(parse(export(m, p)), p) == m`, and no two legal moves in a position
share a HSAN string.

## HPGN-I (identity-aware game record)

`GameRecord` (`hyperchess-rules::notation`) is the canonical entry point for reading and
writing a full HyperChess game. A move is ordinary coordinate UCI, optionally prefixed by the
one-character identity held by the source piece:

```text
1. M:a3a4 m:a10a9 2. N:b3b4 n:b10b9 *
```

`M:a3a4` and plain `a3a4` execute identically — the prefix preserves *which individual piece*
moved, not whether the move was a capture. That makes it possible to follow a single pawn across
the whole game, including through promotion, or to tell two otherwise-identical pieces apart
during replay or analysis.

**When a prefix is present it is verified against the piece actually standing on the source
square, and a mismatch is an error** — an unchecked prefix is a comment, not a record, and
cannot detect a corrupted file, a bad merge, or a hand edit.

Promotion appends the target piece letter to the coordinate
move (`a11a12q`, `a11a12e` for Eagle, `a11a12h` for Hawk). Standard result markers terminate the
game: `1-0`, `0-1`, `1/2-1/2`, `*`.

Both HPGN-I movetext (`M:a3a4`) and plain UCI (`a3a4`) round-trip through `GameRecord::from_hpgni`
— a parser or downstream tool that doesn't care about identity can simply ignore the prefix.

### File extensions

- **`.hpgni`** — tag pairs plus numbered HPGN-I movetext (`GameRecord::to_hpgni`/`from_hpgni`).
- **`.hfeni`** — every HFEN-I position of the game, one per line, produced by replaying the
  start position through the move list (`GameRecord::to_hfeni`/`positions`) — ideal for training
  data and deterministic replay checks.

`hyperchess play` writes both for every completed game; `--format nnue-plain` additionally
appends a line-oriented `fen`/`move`/`score`/`ply`/`result` record per half-move to a shared
`training.plain` file for neural-network training pipelines.

## Compatibility promise

Formats are versioned by documented behavior, not by wishful compatibility with orthodox chess
notations. Consumers should retain original text where possible, validate everything through
`hyperchess-rules` rather than a hand-rolled parser, and pin an exact engine commit SHA for
research datasets. Propose a format extension publicly (see
[`GOVERNANCE.md`](../GOVERNANCE.md#rfc--design-note-process)) before depending on it downstream.

## Normative reference

The consolidated, normative definition — including the identity alphabet in full, the overlap
between the identity and type alphabets, worked examples, and a conformance checklist — lives in
the workspace at `docs/baremetal-hyperchess-notations-v01.md`. This file is its in-repo summary
and is kept in sync with it; where they disagree, that document wins.

Regression suites: `crates/hyperchess-rules/tests/test_notation_law.rs`, the `io::hsan_*` module
tests, and `packages/core/src/__tests__/identity.test.ts`.
