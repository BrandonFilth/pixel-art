// Dibujo de los 256 índices en un <canvas> y exportación a PNG (design.md §5.9).

import { PALETTE } from '../domain/palette';
import { SIZE } from '../domain/pixels';

const CHECK_A = '#ffffff';
const CHECK_B = '#efeaf0';

/** Pinta `cells` en `ctx` con celdas de `cell` px. Transparente = tablero 2×2 o nada. */
export function paintCells(
  ctx: CanvasRenderingContext2D,
  cells: Uint8Array,
  cell: number,
  opts: { checker?: boolean; grid?: boolean } = {},
): void {
  const { checker = true, grid = false } = opts;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, SIZE * cell, SIZE * cell);
  for (let i = 0; i < 256; i++) {
    const x = (i % SIZE) * cell;
    const y = Math.floor(i / SIZE) * cell;
    const c = PALETTE[cells[i]!];
    if (c?.hex) {
      ctx.fillStyle = c.hex;
      ctx.fillRect(x, y, cell, cell);
    } else if (checker) {
      const half = cell / 2;
      ctx.fillStyle = CHECK_A;
      ctx.fillRect(x, y, cell, cell);
      ctx.fillStyle = CHECK_B;
      ctx.fillRect(x, y, half, half);
      ctx.fillRect(x + half, y + half, half, half);
    }
  }
  if (grid && cell >= 6) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 1; k < SIZE; k++) {
      ctx.moveTo(k * cell + 0.5, 0);
      ctx.lineTo(k * cell + 0.5, SIZE * cell);
      ctx.moveTo(0, k * cell + 0.5);
      ctx.lineTo(SIZE * cell, k * cell + 0.5);
    }
    ctx.stroke();
  }
}

export function thumbCanvas(cells: Uint8Array, label: string, px = 128): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', label);
  const ctx = c.getContext('2d');
  if (ctx) paintCells(ctx, cells, px / SIZE);
  return c;
}

/** PNG de 512×512, índice 0 sin pintar (fondo transparente). */
export function exportPng(cells: Uint8Array): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  paintCells(ctx, cells, 32, { checker: false });
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

/** Imagen del usuario → RGBA 16×16, ajustada por el lado mayor y centrada. */
export async function imageToRgba16(file: File): Promise<Uint8ClampedArray> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Sin canvas');
  const scale = SIZE / Math.max(bmp.width, bmp.height);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const hgt = Math.max(1, Math.round(bmp.height * scale));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(bmp, Math.floor((SIZE - w) / 2), Math.floor((SIZE - hgt) / 2), w, hgt);
  bmp.close();
  return ctx.getImageData(0, 0, SIZE, SIZE).data;
}
