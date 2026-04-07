declare const __tileRow: unique symbol;
declare const __tileCol: unique symbol;
declare const __tilemapAddr: unique symbol;

export const BG_MAP_BASE = 0x9800;
export const MAP_ROWS = 32;
export const MAP_COLS = 32;
export const SCREEN_COLS = 20;

export type TileRow = number & { readonly [__tileRow]: true };
export type TileCol = number & { readonly [__tileCol]: true };
export type TilemapAddress = number & { readonly [__tilemapAddr]: true };

export interface TilePosition {
  readonly row: TileRow;
  readonly col: TileCol;
}

export function tileRow(row: number): TileRow {
  if (row < 0 || row >= MAP_ROWS) {
    throw new RangeError(`Tile row out of range: ${String(row)}`);
  }
  return row as TileRow;
}

export function tileCol(col: number): TileCol {
  if (col < 0 || col >= MAP_COLS) {
    throw new RangeError(`Tile col out of range: ${String(col)}`);
  }
  return col as TileCol;
}

export function tilePos(row: number, col: number): TilePosition {
  return { row: tileRow(row), col: tileCol(col) };
}

export function centerStartCol(width: number): TileCol {
  if (width < 0 || width > SCREEN_COLS) {
    throw new RangeError(`Centered width out of range: ${String(width)}`);
  }
  return tileCol(Math.floor((SCREEN_COLS - width) / 2));
}

export function tilemapAddr(row: number, col: number): TilemapAddress;
export function tilemapAddr(position: TilePosition): TilemapAddress;
export function tilemapAddr(rowOrPosition: number | TilePosition, col?: number): TilemapAddress {
  if (typeof rowOrPosition === 'number') {
    if (col === undefined) {
      throw new TypeError('tilemapAddr(row, col) requires both coordinates');
    }
    return (BG_MAP_BASE + rowOrPosition * MAP_COLS + col) as TilemapAddress;
  }
  return (BG_MAP_BASE + rowOrPosition.row * MAP_COLS + rowOrPosition.col) as TilemapAddress;
}
