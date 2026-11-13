// Cuantización a la paleta (design.md §5.9): alfa < 128 → transparente; si no, el color 1..15
// más cercano con la distancia "redmean". Sin tramado.

import { PALETTE } from './palette';

export function redmean(a: readonly number[], b: readonly number[]): number {
  const rm = (a[0]! + b[0]!) / 2;
  const dr = a[0]! - b[0]!;
  const dg = a[1]! - b[1]!;
  const db = a[2]! - b[2]!;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

export function nearestIndex(r: number, g: number, b: number, a = 255): number {
  if (a < 128) return 0;
  let best = 1;
  let bestD = Infinity;
  for (const c of PALETTE) {
    if (!c.rgb) continue;
    const d = redmean([r, g, b], c.rgb);
    if (d < bestD) {
      bestD = d;
      best = c.index;
    }
  }
  return best;
}

/** RGBA de 16×16 (1024 bytes) → 256 índices. */
export function quantizeRgba(data: ArrayLike<number>): Uint8Array {
  if (data.length !== 256 * 4) throw new Error('Se esperaban 16×16 píxeles RGBA');
  const out = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    out[i] = nearestIndex(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!, data[i * 4 + 3]!);
  }
  return out;
}
