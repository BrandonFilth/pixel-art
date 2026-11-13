import type { AbiEntry } from '@parity/product-sdk/contracts';
import type { Abi } from 'viem';
import abiJson from './DotPixel.abi.json';

/** ABI para el SDK (references/contratos.md, *La ABI*). */
export const dotPixelAbi = abiJson as AbiEntry[];
/** La misma ABI para viem. */
export const dotPixelViemAbi = abiJson as unknown as Abi;

export type Hex = `0x${string}`;
export type Words = readonly [Hex, Hex, Hex, Hex];

/** DrawingView del contrato, normalizado. */
export interface DrawingView {
  id: bigint;
  owner: Hex;
  ownerBlacklisted: boolean;
  createdAt: bigint;
  updatedAt: bigint;
  title: string;
  pixels: Words;
}
