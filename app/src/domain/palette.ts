// Paleta fija (design.md §8.5). El contrato solo guarda índices; cambiar un hex cambia
// cómo se ven todos los dibujos guardados.

export interface PaletteColor {
  index: number;
  name: string;
  hex: string | null; // null = transparente
  rgb: [number, number, number] | null;
}

const RAW: Array<[string, string | null]> = [
  ['Transparente', null],
  ['Negro', '#000000'],
  ['Gris oscuro', '#4a4453'],
  ['Gris', '#9a93a0'],
  ['Blanco', '#ffffff'],
  ['Ciruela', '#5b3f60'],
  ['Malva', '#8f7193'],
  ['Lila', '#c0a0c3'],
  ['Niebla', '#e5dde6'],
  ['Rojo', '#b8323f'],
  ['Naranja', '#e7843c'],
  ['Amarillo', '#f2d25c'],
  ['Verde', '#4f9a4a'],
  ['Azul', '#3a6fb5'],
  ['Piel', '#f0b79a'],
  ['Marrón', '#8a5a3b'],
];

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const PALETTE: readonly PaletteColor[] = RAW.map(([name, hex], index) => ({
  index,
  name,
  hex,
  rgb: hex ? toRgb(hex) : null,
}));

export const TRANSPARENT = 0;
export const DEFAULT_COLOR = 6; // Malva
