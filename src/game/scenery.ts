/**
 * Scenery for the backdrops, by map character (see scenes/backdrops.ts).
 *
 * The style: plum ink outlines, at most three shades per object, rounded
 * shapes, and flat fills instead of dither. Shades: '.' the scene's paper (sky,
 * wall), '-' light, '+' mid, '#' ink; each map character's colors come from the
 * scene's ColorScheme.
 *
 * A texture is one 8x8 tile, repeated. A prop is a bigger picture: a rectangle
 * of its character in the map draws it, repeating it if the rectangle is bigger
 * (so 'YYYY' is two trees side by side).
 */

import type { Glyph } from './font-data';

type Shade = '.' | '-' | '+' | '#';

export interface Prop {
  /** Pixel art, a multiple of 8 in both directions */
  readonly art: readonly string[];
}

export type Scenery = Glyph | Prop;

export function isProp(scenery: Scenery): scenery is Prop {
  return 'art' in scenery;
}

/** A small drawing surface for props */
export class Canvas {
  readonly width: number;
  readonly height: number;
  private readonly pixels: Shade[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = Array.from({ length: height }, () => Array<Shade>(width).fill('.'));
  }

  set(x: number, y: number, shade: Shade): this {
    const row = this.pixels[y];
    if (row !== undefined && x >= 0 && x < this.width) row[x] = shade;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, shade: Shade): this {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, shade);
    return this;
  }

  /**
   * Fill every pixel `inside` says is in the shape, and outline it in ink: shape
   * pixels with a neighbor outside the shape (up, down, left, right).
   */
  shape(inside: (x: number, y: number) => boolean, fill: Shade, ink: Shade | null = '#'): this {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!inside(x, y)) continue;
        const edge =
          !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        this.set(x, y, edge && ink !== null ? ink : fill);
      }
    }
    return this;
  }

  /** An outlined box, its corners rounded off by a pixel */
  box(x: number, y: number, w: number, h: number, fill: Shade, ink: Shade | null = '#'): this {
    const corner = (px: number, py: number): boolean =>
      (px === x || px === x + w - 1) && (py === y || py === y + h - 1);
    return this.shape(
      (px, py) => px >= x && px < x + w && py >= y && py < y + h && !corner(px, py),
      fill,
      ink,
    );
  }

  /** An outlined disc around (cx, cy), in pixel-center coordinates */
  disc(cx: number, cy: number, r: number, fill: Shade, ink: Shade | null = '#'): this {
    return this.shape((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, fill, ink);
  }

  rows(): string[] {
    return this.pixels.map((row) => row.join(''));
  }
}

/** A prop drawn on a canvas of `cols` x `rows` tiles */
function prop(cols: number, rows: number, draw: (c: Canvas) => void): Prop {
  const canvas = new Canvas(cols * 8, rows * 8);
  draw(canvas);
  return { art: canvas.rows() };
}

/** A texture tile, checked for size */
export function tile(rows: readonly string[]): Glyph {
  if (rows.length !== 8 || rows.some((row) => row.length !== 8)) {
    throw new RangeError(`A texture is 8x8: ${rows.join('/')}`);
  }
  return rows as Glyph;
}

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------

/** A puffy cloud: three overlapping puffs on a flat, shaded bottom */
const CLOUD = prop(4, 2, (c) => {
  const inPuff = (x: number, y: number): boolean =>
    y <= 13 &&
    ((y >= 10 && x >= 7 && x <= 25) ||
      (x - 9) ** 2 + (y - 10) ** 2 <= 16 ||
      (x - 16) ** 2 + (y - 8) ** 2 <= 36 ||
      (x - 23) ** 2 + (y - 10) ** 2 <= 16);
  c.shape(inPuff, '-', null);
  for (let x = 0; x < 32; x++) if (inPuff(x, 13)) c.set(x, 13, '+');
});

/** Sun or moon: a disc with a soft rim */
const ORB = prop(2, 2, (c) => {
  c.disc(7.5, 7.5, 6.5, '-');
  c.shape((x, y) => (x - 7.5) ** 2 + (y - 7.5) ** 2 <= 30 && x + y > 17, '+', null);
});

const STAR = tile([
  '........',
  '...-....',
  '..---...',
  '...-....',
  '........',
  '........',
  '......-.',
  '........',
]);

// ---------------------------------------------------------------------------
// Station
// ---------------------------------------------------------------------------

/** Distant building top: a roof line over the wall */
const ROOFTOP = tile([
  '........',
  '........',
  '........',
  '........',
  '########',
  '--------',
  '--------',
  '---++---',
]);

/** Distant building wall with windows */
const BUILDING = tile([
  '---++---',
  '--------',
  '--------',
  '--------',
  '---++---',
  '---++---',
  '--------',
  '--------',
]);

/** A train car, repeated along the platform: windows, a door, a stripe, wheels */
const TRAIN = prop(4, 2, (c) => {
  c.box(0, 1, 32, 12, '-');
  for (const x of [3, 11, 19]) c.box(x, 3, 6, 5, '.');
  c.box(26, 3, 4, 9, '+');
  c.rect(1, 9, 25, 2, '+');
  for (const x of [7, 24]) c.disc(x, 13.5, 1.6, '#');
});

/** Platform edge: a ink line, a tactile strip, then the platform */
const PLATFORM_EDGE = tile([
  '########',
  '++++++++',
  '+-+-+-+-',
  '++++++++',
  '--------',
  '--------',
  '--------',
  '--------',
]);

/** Platform paving */
const PLATFORM = tile([
  '-------+',
  '-------+',
  '-------+',
  '-------+',
  '-------+',
  '-------+',
  '-------+',
  '++++++++',
]);

// ---------------------------------------------------------------------------
// Street and park
// ---------------------------------------------------------------------------

/** A round tree: a leafy disc shaded on its lower right, on a thin trunk */
const TREE = prop(2, 3, (c) => {
  c.rect(7, 13, 2, 11, '#');
  c.disc(7.5, 7.5, 7, '-');
  c.shape((x, y) => (x - 7.5) ** 2 + (y - 7.5) ** 2 <= 30 && x + y > 17, '+', null);
});

/** A little house: pink roof, cream walls, a door and two windows */
const HOUSE = prop(3, 3, (c) => {
  c.box(3, 10, 18, 14, '-');
  c.shape((x, y) => y >= 1 && y <= 11 && Math.abs(x - 11.5) <= y + 1.5, '+');
  c.box(10, 15, 5, 9, '+');
  c.box(5, 13, 4, 4, '.');
  c.box(16, 13, 4, 4, '.');
});

/** Grass verge: tufts on top */
const GRASS_EDGE = tile([
  '........',
  '...+....',
  '..+-+..+',
  '+.+-+.+-',
  '-+---+--',
  '--------',
  '--------',
  '++++++++',
]);

/** Sidewalk paving */
const SIDEWALK = tile([
  '-------+',
  '-------+',
  '-------+',
  '-------+',
  '-------+',
  '-------+',
  '-------+',
  '++++++++',
]);

/** Curb and road */
const CURB = tile([
  '########',
  '++++++++',
  '++++++++',
  '++++++++',
  '--..--..',
  '++++++++',
  '++++++++',
  '++++++++',
]);

/** Park lawn with a few tufts */
const LAWN = tile([
  '--------',
  '--------',
  '---+----',
  '--+-+---',
  '--------',
  '------+-',
  '-----+-+',
  '--------',
]);

/** Wooden fence: a post and two rails */
const FENCE = tile([
  '........',
  '..####..',
  '..#-+#..',
  '########',
  '+-++++-+',
  '########',
  '..#-+#..',
  '..#++#..',
]);

// ---------------------------------------------------------------------------
// Restaurant
// ---------------------------------------------------------------------------

/** Wooden beam along the top of the wall */
const BEAM = tile([
  '########',
  '++++++++',
  '+-++++-+',
  '++++++++',
  '########',
  '........',
  '........',
  '........',
]);

/** Paper lantern */
const LANTERN = tile([
  '...#....',
  '..###...',
  '.#+++#..',
  '.#+-+#..',
  '.#+++#..',
  '.#+-+#..',
  '..###...',
  '...#....',
]);

/** Noren curtain over the kitchen door: panels with slits */
const NOREN = tile([
  '########',
  '+++++++.',
  '+++++++.',
  '+++++++.',
  '+++++++.',
  '+++++++.',
  '-------.',
  '........',
]);

/** Kitchen wall: square tiles */
const KITCHEN = tile([
  '-------+',
  '-------+',
  '-------+',
  '++++++++',
  '---+----',
  '---+----',
  '---+----',
  '++++++++',
]);

/** A bowl of ramen with steam rising */
const RAMEN = prop(2, 2, (c) => {
  for (const [x, y] of [
    [5, 1],
    [6, 2],
    [5, 3],
    [6, 4],
    [10, 0],
    [9, 1],
    [10, 2],
    [9, 3],
    [10, 4],
  ] as const) {
    c.set(x, y, '-');
  }
  c.shape((x, y) => y >= 8 && y <= 14 && (x - 7.5) ** 2 + (y - 8) ** 2 <= 49, '+');
  c.rect(2, 8, 12, 1, '#');
  c.rect(3, 9, 10, 1, '-');
  c.rect(5, 14, 6, 2, '#');
});

/** Wooden counter */
const COUNTER = tile([
  '########',
  '--------',
  '++++++++',
  '+++-+++-',
  '+++-+++-',
  '+++-+++-',
  '+++-+++-',
  '########',
]);

/** Wooden floor: long planks */
const WOOD_FLOOR = tile([
  '++++++++',
  '--------',
  '----..--',
  '--------',
  '++++++++',
  '--------',
  '..------',
  '--------',
]);

// ---------------------------------------------------------------------------
// Conbini
// ---------------------------------------------------------------------------

/** The shop's sign band: diagonal stripes (they scroll, see animations.ts) */
export const SIGN = tile([
  '########',
  '--------',
  '++--++--',
  '+--++--+',
  '--++--++',
  '-++--++-',
  '--------',
  '########',
]);

/** A shelf unit: three shelves of boxes and bottles */
const SHELF = prop(5, 3, (c) => {
  c.box(0, 0, 40, 24, '.');
  for (const y of [7, 15]) c.rect(1, y, 38, 1, '#');
  for (let shelf = 0; shelf < 3; shelf++) {
    const top = shelf * 8 + 1;
    for (let i = 0; i < 6; i++) {
      const x = 3 + i * 6;
      if ((i + shelf) % 2 === 0) c.box(x, top + 1, 5, 5, '-');
      else c.box(x + 1, top, 3, 6, '+');
    }
  }
});

/** Shop floor: light squares, alternating with blank paper */
const SHOP_FLOOR = tile([
  '--------',
  '--------',
  '--------',
  '--------',
  '--------',
  '--------',
  '--------',
  '--------',
]);

// ---------------------------------------------------------------------------
// Shrine
// ---------------------------------------------------------------------------

/** A torii gate: the curved top beam and the tie beam, on two pillars */
const TORII = prop(4, 3, (c) => {
  for (const x of [6, 22]) c.box(x, 4, 4, 20, '+');
  c.box(3, 8, 26, 3, '+');
  c.box(14, 4, 4, 5, '-'); // the name plaque
  c.box(0, 1, 32, 4, '+'); // the top beam, its ends turned up
  c.rect(0, 0, 3, 1, '#');
  c.rect(29, 0, 3, 1, '#');
});

/** The shrine hall: a big sloping roof over wooden walls and an open front */
const SHRINE = prop(5, 3, (c) => {
  c.box(5, 11, 30, 13, '-');
  c.box(15, 14, 10, 10, '+');
  c.rect(19, 11, 2, 7, '#'); // the bell rope
  c.shape((x, y) => y >= 1 && y <= 11 && Math.abs(x - 19.5) <= 9 + y, '+');
  c.rect(0, 10, 40, 1, '#');
});

/** A stone lantern's light box (it flickers, see animations.ts) */
const LANTERN_LIGHT = tile([
  '...##...',
  '.######.',
  '########',
  '..#--#..',
  '..#-+#..',
  '..#--#..',
  '.######.',
  '..#--#..',
]);

/** A stone lantern's post and base */
const LANTERN_BASE = tile([
  '..#--#..',
  '..#--#..',
  '..#--#..',
  '..#--#..',
  '.#----#.',
  '.######.',
  '#------#',
  '########',
]);

/** Raked gravel */
const GRAVEL = tile([
  '--------',
  '-+------',
  '-----+--',
  '--------',
  '---+----',
  '-------+',
  '-+------',
  '--------',
]);

/** Stepping stones up to the shrine */
const STEPPING_STONES = tile([
  '-++++++-',
  '+------+',
  '+------+',
  '-++++++-',
  '--------',
  '-++++++-',
  '+------+',
  '-++++++-',
]);

/** Every map character but ' ' (blank paper) */
export const SCENERY: Readonly<Record<string, Scenery>> = {
  C: CLOUD,
  O: ORB,
  '.': STAR,
  '^': ROOFTOP,
  B: BUILDING,
  T: TRAIN,
  _: PLATFORM_EDGE,
  p: PLATFORM,
  Y: TREE,
  H: HOUSE,
  g: GRASS_EDGE,
  r: SIDEWALK,
  c: CURB,
  '#': LAWN,
  f: FENCE,
  b: BEAM,
  L: LANTERN,
  N: NOREN,
  K: KITCHEN,
  W: RAMEN,
  m: COUNTER,
  n: COUNTER, // the same counter, drawn in front of the staff (see ColorScheme.front)
  F: WOOD_FLOOR,
  S: SIGN,
  E: SHELF,
  k: SHOP_FLOOR,
  R: TORII,
  J: SHRINE,
  i: LANTERN_LIGHT,
  I: LANTERN_BASE,
  v: GRAVEL,
  s: STEPPING_STONES,
};
