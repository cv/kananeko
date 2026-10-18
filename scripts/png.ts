/**
 * Minimal PNG encoder for RGBA images (no dependencies).
 */

import * as zlib from 'node:zlib';

export interface Image {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major */
  readonly pixels: Uint8Array;
}

export function createImage(width: number, height: number, fill = [0, 0, 0, 255]): Image {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(fill, i);
  return { width, height, pixels };
}

/** Nearest-neighbor upscale */
export function scale(image: Image, factor: number): Image {
  const out = createImage(image.width * factor, image.height * factor);
  for (let y = 0; y < out.height; y++) {
    const sy = Math.floor(y / factor);
    for (let x = 0; x < out.width; x++) {
      const src = (sy * image.width + Math.floor(x / factor)) * 4;
      out.pixels.set(image.pixels.subarray(src, src + 4), (y * out.width + x) * 4);
    }
  }
  return out;
}

/** Copy `src` into `dst` at (x, y) */
export function blit(dst: Image, src: Image, x: number, y: number): void {
  for (let row = 0; row < src.height; row++) {
    const from = row * src.width * 4;
    dst.pixels.set(
      src.pixels.subarray(from, from + src.width * 4),
      ((y + row) * dst.width + x) * 4,
    );
  }
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(data, zlib.crc32(type)), 0);
  return Buffer.concat([head, data, crc]);
}

export function encodePng(image: Image): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace

  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    raw.set(image.pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ]);
}
