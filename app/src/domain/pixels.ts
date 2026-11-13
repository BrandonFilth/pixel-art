// Empaquetado de píxeles igual al contrato (design.md §4.2):
// píxel i en la palabra i/64, nibble i%64 contado desde el MÁS significativo.
// Equivale a: el hex concatenado de las 4 palabras tiene el píxel i en el carácter i.

import type { Hex, Words } from '../contract/abi';

export const SIZE = 16;
export const PIXEL_COUNT = 256;

export function emptyCells(): Uint8Array {
  return new Uint8Array(PIXEL_COUNT);
}

export function pack(cells: Uint8Array): Words {
  if (cells.length !== PIXEL_COUNT) throw new Error('Se esperaban 256 píxeles');
  const words: Hex[] = [];
  for (let w = 0; w < 4; w++) {
    let hex = '';
    for (let k = 0; k < 64; k++) {
      const v = cells[w * 64 + k]!;
      if (v > 15) throw new Error('Índice de color fuera de rango');
      hex += v.toString(16);
    }
    words.push(`0x${hex}`);
  }
  return words as unknown as Words;
}

export function unpack(words: readonly string[]): Uint8Array {
  if (words.length !== 4) throw new Error('Se esperaban 4 palabras');
  const cells = new Uint8Array(PIXEL_COUNT);
  for (let w = 0; w < 4; w++) {
    const hex = words[w]!.replace(/^0x/i, '').padStart(64, '0');
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('Palabra de píxeles no válida');
    for (let k = 0; k < 64; k++) cells[w * 64 + k] = parseInt(hex[k]!, 16);
  }
  return cells;
}

/** Lo mismo que getPixel() del contrato. */
export function getPixel(words: readonly string[], index: number): number {
  const word = BigInt(words[Math.floor(index / 64)]!);
  return Number((word >> BigInt((63 - (index % 64)) * 4)) & 0xfn);
}

export function countDiff(a: Uint8Array, b: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < PIXEL_COUNT; i++) if (a[i] !== b[i]) n++;
  return n;
}
