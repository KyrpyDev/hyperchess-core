# The Laws of HyperChess

HyperChess extends the FIDE Laws of Chess to a 12×12 board with two new jumping pieces. Anything
not listed here follows the classical rules. This document is the normative reference the engine
in this repository implements; each law links the classical article it extends.

## 1. Board

- The board is a **12×12** grid of 144 squares — files `a` through `l`, ranks `1` through `12`.
- Square colouring alternates as in classical chess, with `a1` dark.

## 2. Pieces and starting position

- Each side has **20 pieces**: the classical 16 plus **2 Eagles** and **2 Hawks**.
- **White** sets up on ranks **2 and 3**; **Black** on ranks **10 and 11**. Ranks 1 and 12 start
  empty.
- The kings start on **g2** (White) and **g11** (Black).

## 3. Movement

- King, Queen, Rook, Bishop, Knight, and Pawn move exactly as in classical chess (FIDE Art. 3).
- **Eagle (E)** — moves and captures by *jumping* up to **4 squares orthogonally** (along a rank
  or file). Pieces in between do not block it.
- **Hawk (H)** — moves and captures by *jumping* up to **4 squares diagonally**. Pieces in
  between do not block it.

### 3.1 Pawns

- The initial double-step is available from rank **3** (White) and rank **10** (Black)
  (extends FIDE Art. 3.7.b).
- **En passant** applies after an opponent's double-step exactly as in classical chess
  (FIDE Art. 3.7.d).
- Pawns promote on rank **12** (White) / rank **1** (Black), to Queen, Rook, Bishop, Knight,
  **Eagle, or Hawk** (extends FIDE Art. 3.7.e).

### 3.2 Castling

The king starts on the g-file, so the geometry differs from classical castling
(extends FIDE Art. 3.8.a):

- **King-side:** king `g → i`, rook `j → h`.
- **Queen-side:** king `g → e`, rook `c → f`.
- The usual conditions apply: neither piece has moved, the squares between them are empty, the
  king is not in check, and the king does not pass through or land on an attacked square.

## 4. Check

- A check by an **Eagle or Hawk cannot be blocked by interposition** — the raptors jump over
  interposed pieces (extends FIDE Art. 3.9). The only answers are capturing the checking piece or
  moving the king.
- All other check rules follow the classical laws.

## 5. Draws

- The 50-move rule scales with the larger board: the game is drawn after **112 moves**
  (224 half-moves) by each side without a pawn move or capture (extends FIDE Art. 5.2.e).
- **Insufficient material** additionally includes king + lone Eagle vs king and king + lone Hawk
  vs king (extends FIDE Art. 5.2.b).
- Threefold repetition and stalemate follow the classical laws.

## 6. Notation

- **HFEN / HFEN-I** — HyperChess FEN: FEN's structure with 12 rank groups, `E`/`H` piece
  letters, and the half-move clock counting toward 224. The `-I` variant additionally carries
  each piece's stable **identity** character, with promoted pieces written as an inline
  `id:Type` pair (`M:Q`).
- **HSAN** — HyperChess Standard Algebraic Notation: SAN extended with `E`/`H` piece letters
  and 12-rank coordinates. Moves in engine I/O use UCI-style coordinate notation instead
  (`g3g5`, `c11b11`).
- **HPGN-I** — the identity-aware game record: tag pairs plus movetext of `identity:uci` moves.

Ranks 10-12 are two characters wide, which every parser and serializer must handle explicitly.

**The full grammar and the rules governing all four formats are in
[`docs/FORMATS.md`](FORMATS.md)** — this section is a summary, not the specification. The
normative definition is the workspace's `docs/baremetal-hyperchess-notations-v01.md`.

---

*This document mirrors the comparison table in the source workspace's
`Hyperchess-Basic-Laws.md` and is kept in sync with `crates/hyperchess-rules`, whose test suite
(perft golden values, rules integration games) is the executable form of these laws.*
