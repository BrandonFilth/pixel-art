// Ejecuta una acción firmada: simular → firmar → seguir el estado → verificar → refrescar.
// Una firma a la vez (references/app-sdk.md, *Escribir: primero .query(), después .tx()*).

import { CONTRACT_ADDRESS, TX_TIMEOUT_MS } from '../config';
import { dotPixelViemAbi } from '../contract/abi';
import { rpc } from '../chain/reads';
import { ensureMapped, getLive, markHostLost, requestGas, setPipeline } from '../chain/session';
import { blockTicker } from '../chain/ticker';
import { store } from '../state/store';
import {
  classifySignError,
  decodeContractError,
  decodeViemError,
  errorText,
  messageForError,
  SIGN_MESSAGES,
} from './errors';
import { FINAL_STATES, initialTx, txReducer, type TxContext, type TxEvent } from './txMachine';

export interface TxAction {
  kind: string;
  /** Título del modal, p. ej. 'GUARDAR DIBUJO'. */
  title: string;
  method: string;
  args: readonly unknown[];
  /** ¿Se aplicó? Se corre tras `finalized` y tras un timeout. */
  verify: () => Promise<boolean>;
  /** Relee lo afectado (contadores, listas, dibujo, cuenta). */
  refresh: () => Promise<void>;
  /** Navegación posterior al cerrar con éxito. */
  onDone?: () => void;
}

type Listener = (ctx: TxContext, action: TxAction | null) => void;

let ctx: TxContext = initialTx();
let current: TxAction | null = null;
let cancelled = false;
const listeners = new Set<Listener>();

export function subscribeTx(l: Listener): () => void {
  listeners.add(l);
  l(ctx, current);
  return () => listeners.delete(l);
}

function send(e: TxEvent): void {
  ctx = txReducer(ctx, e);
  if (FINAL_STATES.has(ctx.state)) store.set({ txBusy: false });
  for (const l of listeners) l(ctx, current);
}

/** Estado actual (función para que TypeScript no lo estreche entre llamadas a send()). */
function st(): TxContext['state'] {
  return ctx.state;
}

function patch(p: Partial<TxContext>): void {
  ctx = { ...ctx, ...p };
  for (const l of listeners) l(ctx, current);
}

function isAccountNotMapped(v: unknown): boolean {
  return /accountnotmapped/i.test(errorText(v));
}

async function simulate(a: TxAction): Promise<'ok' | 'stop' | 'gas'> {
  const live = getLive();
  const me = store.get().me;
  if (!live || !me) {
    send({ type: 'SIM_FAIL', message: 'Conecta tu cuenta para continuar.' });
    return 'stop';
  }
  let mappedTried = false;
  for (;;) {
    let r: { success: boolean; value: unknown };
    try {
      r = await live.contract[a.method]!.query(...a.args, { origin: live.meAddress });
    } catch (e) {
      const cls = classifySignError(e);
      if (cls === 'host') markHostLost();
      console.warn('[tx] query', e);
      send({ type: 'SIM_FAIL', message: cls === 'host' ? SIGN_MESSAGES.host : `No se pudo simular: ${errorText(e)}` });
      return 'stop';
    }
    if (cancelled) return 'stop';
    if (r.success) return 'ok';

    const text = errorText(r.value);
    if (/storagedepositnotenoughfunds/i.test(text)) return 'gas';
    if (isAccountNotMapped(r.value) && !mappedTried) {
      mappedTried = true;
      patch({ message: 'Registrando tu cuenta en la cadena (una firma, solo la primera vez)…' });
      if (await ensureMapped()) continue;
    }
    let decoded = decodeContractError(r.value);
    if (!decoded) {
      // Respaldo: repetir por ETH-RPC solo para obtener el nombre del error.
      try {
        await rpc.simulateContract({
          address: CONTRACT_ADDRESS,
          abi: dotPixelViemAbi,
          functionName: a.method,
          args: a.args,
          account: me.h160,
        } as never);
      } catch (e) {
        decoded = decodeViemError(e);
      }
    }
    if (!decoded) console.warn('[tx] revert sin decodificar', r.value);
    send({ type: 'SIM_FAIL', message: messageForError(decoded, a.kind) });
    return 'stop';
  }
}

async function finish(a: TxAction, alreadyVerified: boolean): Promise<void> {
  if (!alreadyVerified) {
    let ok = true;
    try {
      ok = await a.verify();
    } catch (e) {
      console.warn('[tx] verify', e); // la cadena ya confirmó; solo falló la lectura
    }
    send({ type: 'VERIFIED', ok });
    if (!ok) return;
  }
  try {
    await Promise.all([blockTicker.refreshNow(), a.refresh()]);
    send({ type: 'REFRESH_OK' });
  } catch (e) {
    console.warn('[tx] refresh', e);
    send({ type: 'REFRESH_FAIL' });
  }
}

async function runFromSimulation(a: TxAction): Promise<void> {
  for (;;) {
    if (st() !== 'simulating') return;
    try {
      await setPipeline(ctx.pipeline);
    } catch (e) {
      send({ type: 'SIM_FAIL', message: `No se pudo preparar el firmante: ${errorText(e)}` });
      return;
    }
    const sim = await simulate(a);
    if (sim === 'stop') return;
    if (sim === 'gas') {
      send({ type: 'NEED_GAS' });
      if (st() !== 'requestingGas') return;
      const g = await requestGas();
      send(g === 'Allocated' ? { type: 'GAS_OK' } : { type: 'GAS_FAIL', message: 'El Host no asignó gas (PGAS).' });
      continue;
    }
    send({ type: 'SIM_OK' });

    const live = getLive()!;
    let res: { ok: boolean; value?: unknown; error?: unknown };
    try {
      res = await live.contract[a.method]!.tx(...a.args, {
        waitFor: 'finalized',
        timeoutMs: TX_TIMEOUT_MS,
        onStatus: (status: 'signing' | 'broadcasting' | 'in-block' | 'finalized' | 'error') => {
          if (status !== 'error') send({ type: 'STATUS', status });
        },
      });
    } catch (e) {
      res = { ok: false, error: e };
    }

    if (res.ok) {
      const v = res.value as { ok?: boolean; txHash?: string; block?: { number?: number } } | undefined;
      patch({ txHash: v?.txHash ?? null, blockNumber: v?.block?.number ?? null });
      if (v && v.ok === false) {
        send({ type: 'TX_ERROR', message: 'La transacción entró en un bloque pero falló al ejecutarse.' });
        return;
      }
      send({ type: 'STATUS', status: 'finalized' });
      await finish(a, false);
      return;
    }

    const cls = classifySignError(res.error);
    console.warn('[tx] error', cls, res.error);
    switch (cls) {
      case 'rejected':
        send({ type: 'REJECTED' });
        return;
      case 'gas':
        send({ type: 'NEED_GAS' });
        if (st() === 'requestingGas') {
          const g = await requestGas();
          send(g === 'Allocated' ? { type: 'GAS_OK' } : { type: 'GAS_FAIL', message: 'El Host no asignó gas (PGAS).' });
          continue;
        }
        return;
      case 'pipeline':
        send({ type: 'PIPELINE_FALLBACK' });
        if (st() === 'simulating')
          patch({ message: 'El Host rechazó el pipeline de PGAS: la comisión se cobrará en PAS.' });
        continue;
      case 'timeout': {
        send({ type: 'TIMEOUT' });
        let ok = false;
        try {
          ok = await a.verify();
        } catch {
          ok = false;
        }
        send(ok ? { type: 'VERIFY_OK' } : { type: 'VERIFY_FAIL' });
        if (ok) await finish(a, true);
        return;
      }
      case 'host':
        markHostLost();
        send({ type: 'TX_ERROR', message: SIGN_MESSAGES.host });
        return;
      default:
        send({ type: 'TX_ERROR', message: `${SIGN_MESSAGES[cls]} ${errorText(res.error).slice(0, 200)}` });
        return;
    }
  }
}

export function txState(): TxContext {
  return ctx;
}

export async function runTx(a: TxAction): Promise<void> {
  if (store.get().txBusy) return;
  if (store.get().session !== 'connected') return;
  store.set({ txBusy: true });
  current = a;
  cancelled = false;
  send({ type: 'START' });
  await runFromSimulation(a);
}

export async function retryTx(): Promise<void> {
  if (!current) return;
  store.set({ txBusy: true });
  cancelled = false;
  send({ type: 'RETRY' });
  if (st() === 'simulating') await runFromSimulation(current);
  else store.set({ txBusy: false });
}

export function cancelTx(): void {
  if (ctx.state !== 'simulating') return;
  cancelled = true;
  send({ type: 'CANCEL' });
}

export function closeTx(): void {
  const a = current;
  const wasDone = ctx.state === 'done';
  send({ type: 'CLOSE' });
  if (ctx.state === 'idle') {
    current = null;
    for (const l of listeners) l(ctx, current);
    if (wasDone) a?.onDone?.();
  }
}
