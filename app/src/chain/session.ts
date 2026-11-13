// Sesión con el Host (references/app-sdk.md, *Flujo completo*; design.md §5.3).

import { createChainClient } from '@parity/product-sdk/chain';
import {
  createContract,
  createContractRuntimeFromClient,
  ensureContractAccountMapped,
  isContractAccountMapped,
} from '@parity/product-sdk/contracts';
import { getAccountsProvider, isInsideContainer, requestResourceAllocation } from '@parity/product-sdk/host';
import { SignerManager } from '@parity/product-sdk/wallet';
import { devnet_asset_hub } from '@parity/product-sdk-descriptors/devnet-asset-hub';
import { CONTRACT_ADDRESS, DERIVATION_INDEX, HOST_TIMEOUT_MS, TX_EXT_VERSION } from '../config';
import { dotPixelAbi, type Hex } from '../contract/abi';
import { store, ZERO_ADDRESS, type GasState } from '../state/store';
import { resolveProductId } from './productId';
import { reads } from './reads';

// Tipos laxos: los genéricos del SDK dependen de la ABI y aquí se llama por nombre de método.
export interface ContractMethod {
  query: (...args: unknown[]) => Promise<{ success: boolean; value: unknown }>;
  tx: (...args: unknown[]) => Promise<{ ok: boolean; value?: unknown; error?: unknown }>;
}
export type AnyContract = Record<string, ContractMethod>;

interface Live {
  contract: AnyContract;
  runtime: unknown;
  signer: unknown;
  meAddress: string;
  publicKey: Uint8Array;
  pipeline: 0 | 1;
}

let live: Live | null = null;
let clientRef: { raw: { assetHub: unknown } } | null = null;

export function getLive(): Live | null {
  return live;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${what}`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export async function detectHost(): Promise<void> {
  const productId = resolveProductId();
  store.set({ productId });
  let inside = false;
  try {
    inside = await withTimeout(isInsideContainer(), 3_000, 'isInsideContainer');
  } catch (e) {
    console.info('[host] fuera del Host', e);
  }
  store.set({ session: inside ? 'disconnected' : 'outsideHost' });
}

async function buildContract(productId: string, pipeline: 0 | 1, meAddress: string, publicKey: Uint8Array) {
  const provider = await getAccountsProvider();
  if (!provider) throw new Error('El Host no entregó el proveedor de cuentas.');
  const signer = provider.getProductAccountSigner(
    { dotNsIdentifier: productId, derivationIndex: DERIVATION_INDEX, publicKey },
    { txExtVersion: pipeline },
  );
  if (!clientRef) throw new Error('Sin cliente de cadena');
  const runtime = createContractRuntimeFromClient(clientRef.raw.assetHub as never, devnet_asset_hub, { at: 'best' });
  const contract = createContract(runtime, CONTRACT_ADDRESS, dotPixelAbi, {
    defaultOrigin: meAddress,
    defaultSigner: signer,
  }) as unknown as AnyContract;
  return { contract, runtime, signer };
}

/** Rearma el firmante con otro pipeline (reintento con 0 si el Host rechaza el 1). */
export async function setPipeline(pipeline: 0 | 1): Promise<void> {
  if (!live) throw new Error('Sin sesión');
  if (live.pipeline === pipeline) return;
  const built = await buildContract(store.get().productId, pipeline, live.meAddress, live.publicKey);
  live = { ...live, ...built, pipeline };
}

/**
 * Registra el mapeo SS58 → H160 en pallet-revive si hace falta (una firma, una sola vez).
 * Solo se usa si una simulación falla con `AccountNotMapped` (no verificado que ocurra con
 * cuentas de Product; la skill no lo documenta).
 */
export async function ensureMapped(onStatus?: (s: string) => void): Promise<boolean> {
  if (!live) return false;
  const mapped = await isContractAccountMapped(live.runtime as never, live.meAddress);
  if (mapped.ok && mapped.value) return true;
  const r = await ensureContractAccountMapped(live.runtime as never, live.meAddress, live.signer as never, {
    timeoutMs: 300_000,
    onStatus,
  });
  return r.ok;
}

export async function requestGas(): Promise<GasState> {
  try {
    const r = await requestResourceAllocation([
      { tag: 'SmartContractAllowance', value: { tag: 'Index', value: DERIVATION_INDEX } },
    ] as never);
    const res = r as unknown as { ok: boolean; value?: unknown[] };
    const outcome = (res.ok ? (res.value?.[0] as unknown) : undefined) as unknown;
    const tag =
      typeof outcome === 'string'
        ? outcome
        : ((outcome as { tag?: string } | undefined)?.tag ?? (res.ok ? 'Allocated' : 'error'));
    const gas = (['Allocated', 'Rejected', 'NotAvailable'].includes(tag) ? tag : 'error') as GasState;
    store.set({ gas });
    return gas;
  } catch (e) {
    console.warn('[gas]', e);
    store.set({ gas: 'error' });
    return 'error';
  }
}

export async function connect(): Promise<void> {
  const s = store.get();
  if (s.session === 'connecting' || s.session === 'outsideHost') return;
  store.set({ session: 'connecting', sessionError: null });
  const productId = s.productId || resolveProductId();
  try {
    const client = await createChainClient({ chains: { assetHub: devnet_asset_hub } });
    clientRef = client as unknown as { raw: { assetHub: unknown } };

    const manager = new SignerManager({
      dappName: productId,
      ss58Prefix: 42,
      hostTimeout: HOST_TIMEOUT_MS,
      maxRetries: 1,
      persistence: null,
    });
    const connected = await manager.connect();
    if (!connected.ok) throw connected.error;
    const account = await manager.getProductAccount(productId, DERIVATION_INDEX);
    if (!account.ok) throw account.error;
    const me = account.value;

    const built = await buildContract(productId, TX_EXT_VERSION as 0 | 1, me.address, me.publicKey);
    live = { ...built, meAddress: me.address, publicKey: me.publicKey, pipeline: TX_EXT_VERSION as 0 | 1 };

    store.set({
      session: 'connected',
      me: { address: me.address, h160: me.h160Address.toLowerCase() as Hex },
    });
    await requestGas();
    await refreshAccount();
  } catch (e) {
    console.warn('[conexión]', e);
    live = null;
    store.set({ session: 'error', sessionError: errText(e) });
  }
}

export function markHostLost(): void {
  if (store.get().session === 'connected') store.set({ session: 'hostLost' });
}

/** Rol, lista negra, nombre y contadores de la cuenta conectada. */
export async function refreshAccount(): Promise<void> {
  const me = store.get().me;
  const [owner, pending, total] = await Promise.all([
    reads.owner().catch(() => store.get().owner),
    reads.pendingOwner().catch(() => store.get().pendingOwner),
    reads.totalDrawings().catch(() => store.get().totalDrawings),
  ]);
  store.set({
    owner,
    pendingOwner: pending && pending !== ZERO_ADDRESS ? pending : null,
    totalDrawings: total,
  });
  if (!me) return;
  const [bl, name, count] = await Promise.all([
    reads.isBlacklisted(me.h160).catch(() => store.get().isBlacklisted),
    reads.usernameOf(me.h160).catch(() => store.get().username),
    reads.drawingCount(me.h160).catch(() => store.get().myCount),
  ]);
  store.set({ isBlacklisted: bl, username: name, myCount: count });
}
