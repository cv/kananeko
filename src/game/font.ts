/**
 * 8x8 monochrome font for the Game Boy.
 * Each character is defined as 8 rows of 8 pixels using '#' and '.'.
 * Converted to 2bpp GB tile format (color 3 = black on color 0 = white).
 */

type PixelRow = string;
type Glyph = [PixelRow, PixelRow, PixelRow, PixelRow, PixelRow, PixelRow, PixelRow, PixelRow];

function glyphToTile(glyph: Glyph): Uint8Array {
  const tile = new Uint8Array(16);
  for (let row = 0 as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; row < 8; row++) {
    let byte = 0;
    const line = glyph[row];
    for (let col = 0; col < 8; col++) {
      if (line[col] === '#') {
        byte |= 0x80 >> col;
      }
    }
    // 2bpp: both planes identical = color 3 (darkest)
    tile[row * 2] = byte;
    tile[row * 2 + 1] = byte;
  }
  return tile;
}

// ---------------------------------------------------------------------------
// Character definitions — tile index 0 is always blank
// ---------------------------------------------------------------------------

const GLYPHS = {
  A: [
    '..##....',
    '.#..#...',
    '#....#..',
    '#....#..',
    '######..',
    '#....#..',
    '#....#..',
    '........',
  ],
  E: [
    '#####...',
    '#.......',
    '#.......',
    '####....',
    '#.......',
    '#.......',
    '#####...',
    '........',
  ],
  G: [
    '.####...',
    '#....#..',
    '#.......',
    '#..###..',
    '#....#..',
    '#....#..',
    '.####...',
    '........',
  ],
  J: [
    '..####..',
    '....#...',
    '....#...',
    '....#...',
    '....#...',
    '#...#...',
    '.###....',
    '........',
  ],
  N: [
    '#....#..',
    '##...#..',
    '#.#..#..',
    '#..#.#..',
    '#...##..',
    '#....#..',
    '#....#..',
    '........',
  ],
  P: [
    '#####...',
    '#....#..',
    '#....#..',
    '#####...',
    '#.......',
    '#.......',
    '#.......',
    '........',
  ],
  R: [
    '#####...',
    '#....#..',
    '#....#..',
    '#####...',
    '#..#....',
    '#...#...',
    '#....#..',
    '........',
  ],
  S: [
    '.####...',
    '#....#..',
    '#.......',
    '.####...',
    '.....#..',
    '#....#..',
    '.####...',
    '........',
  ],
  T: [
    '#####...',
    '..#.....',
    '..#.....',
    '..#.....',
    '..#.....',
    '..#.....',
    '..#.....',
    '........',
  ],
  // Hiragana
  は: [
    '.#...#..',
    '.#..#.#.',
    '.#..#.#.',
    '.##.#.#.',
    '.#..#.#.',
    '.#...#..',
    '.#....#.',
    '........',
  ],
  じ: [
    '..#.....',
    '..#..#..',
    '######..',
    '..#.....',
    '..#.....',
    '...#....',
    '....###.',
    '........',
  ],
  め: [
    '........',
    '.#..#...',
    '.#.#.#..',
    '.##..#..',
    '.##..#..',
    '.#.#.#..',
    '....#...',
    '........',
  ],
} as const satisfies Record<string, Glyph>;

type GlyphChar = keyof typeof GLYPHS;

// Ordered list of characters — index+1 is the tile number (0 = blank)
const CHAR_ORDER: GlyphChar[] = ['J', 'R', 'P', 'G', 'E', 'N', 'S', 'T', 'A', 'は', 'じ', 'め'];

/** Map from character to tile index */
export const CHAR_MAP: Record<string, number> = { ' ': 0 };
CHAR_ORDER.forEach((ch, i) => {
  CHAR_MAP[ch] = i + 1;
});

/** Number of tiles (excluding the blank tile 0) */
export const TILE_COUNT = CHAR_ORDER.length;

/** All tile data as a flat byte array, starting with tile 0 (blank) */
export function buildTileData(): Uint8Array {
  const blank = new Uint8Array(16); // tile 0: all zeros
  const tiles = [blank, ...CHAR_ORDER.map((ch) => glyphToTile(GLYPHS[ch]))];
  const data = new Uint8Array(tiles.length * 16);
  tiles.forEach((tile, i) => {
    data.set(tile, i * 16);
  });
  return data;
}

/** Convert a text string to an array of tile indices */
export function textToTiles(text: string): number[] {
  return Array.from(text).map((ch) => CHAR_MAP[ch] ?? 0);
}
