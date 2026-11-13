// Lecturas por ETH-RPC con viem (references/app-sdk.md, *Lecturas rápidas por ETH-RPC*).
// El ETH-RPC es el origen de red permitido en el Host y funciona fuera de él.

import { createPublicClient, defineChain, http } from 'viem';
import { CHAIN_ID, CONTRACT_ADDRESS, ETH_RPC_URL, RPC_TIMEOUT_MS } from '../config';
import { dotPixelViemAbi, type DrawingView, type Hex, type Words } from '../contract/abi';

export const devnet = defineChain({
  id: CHAIN_ID,
  name: 'Polkadot Hub TestNet',
  nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
  rpcUrls: { default: { http: [ETH_RPC_URL] } },
});

export const rpc = createPublicClient({
  chain: devnet,
  transport: http(ETH_RPC_URL, { timeout: RPC_TIMEOUT_MS, retryCount: 1 }),
});

export class ReadError extends Error {
  constructor(public readonly what: string, cause: unknown) {
    super(`No se pudo cargar ${what}`);
    this.cause = cause;
  }
}

async function read<T>(what: string, functionName: string, args: readonly unknown[] = []): Promise<T> {
  try {
    return (await rpc.readContract({
      address: CONTRACT_ADDRESS,
      abi: dotPixelViemAbi,
      functionName,
      args,
    } as never)) as T;
  } catch (e) {
    console.warn(`[lectura] ${functionName}`, e);
    throw new ReadError(what, e);
  }
}

interface RawView {
  id: bigint;
  owner: string;
  ownerBlacklisted: boolean;
  createdAt: bigint;
  updatedAt: bigint;
  title: string;
  pixels: readonly string[];
}

export function normalizeView(v: RawView): DrawingView {
  return {
    id: BigInt(v.id),
    owner: v.owner.toLowerCase() as Hex,
    ownerBlacklisted: Boolean(v.ownerBlacklisted),
    createdAt: BigInt(v.createdAt),
    updatedAt: BigInt(v.updatedAt),
    title: String(v.title),
    pixels: v.pixels.map((w) => w.toLowerCase()) as unknown as Words,
  };
}

export interface Page {
  items: DrawingView[];
  total: number;
}

export const reads = {
  totalDrawings: async () => Number(await read<bigint>('el total de dibujos', 'totalDrawings')),
  nextId: () => read<bigint>('el siguiente id', 'nextId'),
  drawingCount: async (a: Hex) => Number(await read<bigint>('tus dibujos', 'drawingCount', [a])),
  owner: async () => (await read<string>('el admin', 'owner')).toLowerCase() as Hex,
  pendingOwner: async () => (await read<string>('el admin pendiente', 'pendingOwner')).toLowerCase() as Hex,
  isBlacklisted: (a: Hex) => read<boolean>('la lista negra', 'isBlacklisted', [a]),
  usernameOf: (a: Hex) => read<string>('el nombre de usuario', 'usernameOf', [a]),
  ownerOfUsername: async (n: string) =>
    (await read<string>('la disponibilidad del nombre', 'ownerOfUsername', [n])).toLowerCase() as Hex,
  drawingExists: (id: bigint) => read<boolean>('el dibujo', 'drawingExists', [id]),
  getDrawing: async (id: bigint) => normalizeView(await read<RawView>('el dibujo', 'getDrawing', [id])),
  getAllDrawings: async (offset: number, limit: number): Promise<Page> => {
    const [items, total] = await read<[RawView[], bigint]>('la galería', 'getAllDrawings', [
      BigInt(offset),
      BigInt(limit),
    ]);
    return { items: items.map(normalizeView), total: Number(total) };
  },
  getDrawingsByOwner: async (a: Hex, offset: number, limit: number): Promise<Page> => {
    const [items, total] = await read<[RawView[], bigint]>('tus dibujos', 'getDrawingsByOwner', [
      a,
      BigInt(offset),
      BigInt(limit),
    ]);
    return { items: items.map(normalizeView), total: Number(total) };
  },
  getBlacklisted: async (offset: number, limit: number) => {
    const [items, total] = await read<[string[], bigint]>('la lista negra', 'getBlacklisted', [
      BigInt(offset),
      BigInt(limit),
    ]);
    return { items: items.map((x) => x.toLowerCase() as Hex), total: Number(total) };
  },
};

// Caché simple de nombres de usuario por dirección.
const names = new Map<string, Promise<string>>();
export function cachedUsername(a: Hex): Promise<string> {
  const k = a.toLowerCase();
  let p = names.get(k);
  if (!p) {
    p = reads.usernameOf(a).catch(() => '');
    names.set(k, p);
  }
  return p;
}
export function forgetUsername(a?: Hex): void {
  if (a) names.delete(a.toLowerCase());
  else names.clear();
}
