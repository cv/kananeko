export const BG_MAP_BASE = 0x9800;
export const MAP_COLS = 32;
export const SCREEN_COLS = 20;

export interface TilePosition {
  readonly row: number;
  readonly col: number;
}

export function tilePos(row: number, col: number): TilePosition {
  return { row, col };
}

export function tilemapAddr(row: number, col: number): number {
  return BG_MAP_BASE + row * MAP_COLS + col;
}
