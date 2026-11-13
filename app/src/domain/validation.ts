// Validación de entradas (design.md §6). El contrato es la autoridad; esto evita simulaciones inútiles.

import { MAX_TITLE_BYTES } from '../config';

const encoder = new TextEncoder();

export function utf8Bytes(s: string): number {
  return encoder.encode(s).length;
}

export type Check = { ok: true } | { ok: false; message: string };

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

export function validateTitle(raw: string): Check {
  const t = raw.trim();
  const n = utf8Bytes(t);
  if (n === 0) return { ok: false, message: 'Escribe un título.' };
  if (n > MAX_TITLE_BYTES)
    return { ok: false, message: `El título ocupa ${n} bytes; el máximo es ${MAX_TITLE_BYTES} (los acentos cuentan doble).` };
  if (CONTROL.test(t)) return { ok: false, message: 'El título no puede tener caracteres de control.' };
  return { ok: true };
}

export const USERNAME_RE = /^[a-z0-9_]{3,16}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): Check {
  const n = normalizeUsername(raw);
  if (!USERNAME_RE.test(n))
    return { ok: false, message: 'El nombre debe tener de 3 a 16 caracteres: minúsculas, números o guion bajo.' };
  return { ok: true };
}

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function validateAddress(raw: string): Check {
  const a = raw.trim();
  if (!ADDRESS_RE.test(a)) return { ok: false, message: 'Escribe una dirección 0x de 40 caracteres hexadecimales.' };
  if (/^0x0{40}$/.test(a)) return { ok: false, message: 'Dirección no válida.' };
  return { ok: true };
}

/** Id o número de página: 1..2^53-1. */
export function parsePositiveInt(raw: string | undefined | null): number | null {
  if (!raw || !/^[1-9]\d{0,15}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
