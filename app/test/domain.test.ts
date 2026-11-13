import { describe, expect, it } from 'vitest';
import { countDiff, emptyCells, getPixel, pack, unpack } from '../src/domain/pixels';
import { newestFirst, pageFromEnd } from '../src/domain/pagination';
import { nearestIndex, quantizeRgba } from '../src/domain/quantize';
import { PALETTE } from '../src/domain/palette';
import { History } from '../src/domain/history';
import {
  parsePositiveInt,
  utf8Bytes,
  validateAddress,
  validateTitle,
  validateUsername,
} from '../src/domain/validation';

describe('pixels (mismo orden que el contrato: nibble más significativo primero)', () => {
  it('pixel 0 es el primer hex de la palabra 0 y el 255 el último de la palabra 3', () => {
    const c = emptyCells();
    c[0] = 0xa;
    c[255] = 0x5;
    c[64] = 0xf;
    const w = pack(c);
    expect(w[0].slice(2, 3)).toBe('a');
    expect(w[1].slice(2, 3)).toBe('f');
    expect(w[3].slice(-1)).toBe('5');
    expect(getPixel(w, 0)).toBe(0xa);
    expect(getPixel(w, 64)).toBe(0xf);
    expect(getPixel(w, 255)).toBe(5);
  });

  it('ida y vuelta de los 256 índices con todos los valores', () => {
    const c = new Uint8Array(256).map((_, i) => (i * 7 + 3) % 16);
    const w = pack(c);
    expect(w).toHaveLength(4);
    w.forEach((x) => expect(x).toMatch(/^0x[0-9a-f]{64}$/));
    expect([...unpack(w)]).toEqual([...c]);
    for (let i = 0; i < 256; i++) expect(getPixel(w, i)).toBe(c[i]);
  });

  it('vacío = 4 palabras en cero', () => {
    expect(pack(emptyCells()).every((x) => /^0x0{64}$/.test(x))).toBe(true);
  });

  it('countDiff', () => {
    const a = emptyCells();
    const b = emptyCells();
    b[3] = 1;
    b[200] = 2;
    expect(countDiff(a, b)).toBe(2);
  });

  it('rechaza datos mal formados', () => {
    expect(() => unpack(['0x00'])).toThrow();
    expect(() => pack(new Uint8Array(10))).toThrow();
  });
});

describe('paginación desde el final', () => {
  it('página 1 son los últimos', () => {
    expect(pageFromEnd(30, 1, 12)).toEqual({ offset: 18, limit: 12, pages: 3, page: 1 });
    expect(pageFromEnd(30, 3, 12)).toEqual({ offset: 0, limit: 6, pages: 3, page: 3 });
  });
  it('lista vacía y página fuera de rango', () => {
    expect(pageFromEnd(0, 1, 12)).toEqual({ offset: 0, limit: 0, pages: 1, page: 1 });
    expect(pageFromEnd(5, 9, 12)).toEqual({ offset: 0, limit: 5, pages: 1, page: 1 });
  });
  it('newestFirst ordena por id desc y deduplica', () => {
    const r = newestFirst([{ id: 2n }, { id: 9n }, { id: 2n }, { id: 5n }]);
    expect(r.map((x) => x.id)).toEqual([9n, 5n, 2n]);
  });
});

describe('cuantización', () => {
  it('los colores exactos de la paleta mapean a sí mismos', () => {
    for (const c of PALETTE) if (c.rgb) expect(nearestIndex(...c.rgb)).toBe(c.index);
  });
  it('alfa < 128 es transparente', () => {
    expect(nearestIndex(255, 0, 0, 10)).toBe(0);
    const rgba = new Uint8Array(1024);
    expect([...quantizeRgba(rgba)].every((v) => v === 0)).toBe(true);
  });
});

describe('validación', () => {
  it('título 1..32 bytes UTF-8', () => {
    expect(validateTitle('').ok).toBe(false);
    expect(validateTitle('a'.repeat(32)).ok).toBe(true);
    expect(validateTitle('a'.repeat(33)).ok).toBe(false);
    expect(utf8Bytes('ñ')).toBe(2);
    expect(validateTitle('ñ'.repeat(16)).ok).toBe(true);
    expect(validateTitle('ñ'.repeat(17)).ok).toBe(false);
    expect(validateTitle('a\u0007b').ok).toBe(false);
  });
  it('username [a-z0-9_]{3,16} (se pasa a minúsculas)', () => {
    expect(validateUsername('abc').ok).toBe(true);
    expect(validateUsername('ABC_1').ok).toBe(true);
    expect(validateUsername('ab').ok).toBe(false);
    expect(validateUsername('a'.repeat(17)).ok).toBe(false);
    expect(validateUsername('a-b-c').ok).toBe(false);
    expect(validateUsername('añb').ok).toBe(false);
  });
  it('dirección', () => {
    expect(validateAddress('0x6d465F5CB6FFc918761d4cC9A675F1ED2c6bB764').ok).toBe(true);
    expect(validateAddress('0x' + '0'.repeat(40)).ok).toBe(false);
    expect(validateAddress('0x123').ok).toBe(false);
  });
  it('enteros positivos seguros', () => {
    expect(parsePositiveInt('1')).toBe(1);
    expect(parsePositiveInt('0')).toBeNull();
    expect(parsePositiveInt('01')).toBeNull();
    expect(parsePositiveInt('9999999999999999')).toBeNull();
    expect(parsePositiveInt('abc')).toBeNull();
  });
});

describe('historial', () => {
  it('deshacer y rehacer', () => {
    const h = new History(2);
    const a = new Uint8Array([1]);
    const b = new Uint8Array([2]);
    const c = new Uint8Array([3]);
    h.push(a);
    h.push(b);
    expect(h.undo(c)).toEqual(b);
    expect(h.redo(b)).toEqual(c);
    h.push(c);
    expect(h.canRedo).toBe(false);
  });
});
