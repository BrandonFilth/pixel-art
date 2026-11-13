// Máquina de estados de una transacción (design.md §5.5). Reductor puro, sin E/S.

export type TxState =
  | 'idle'
  | 'simulating'
  | 'simError'
  | 'requestingGas'
  | 'awaitingSignature'
  | 'broadcast'
  | 'inBlock'
  | 'finalized'
  | 'updating'
  | 'done'
  | 'rejected'
  | 'verifying'
  | 'uncertain'
  | 'error';

export type TxEvent =
  | { type: 'START' }
  | { type: 'SIM_OK' }
  | { type: 'SIM_FAIL'; message: string }
  | { type: 'NEED_GAS' }
  | { type: 'GAS_OK' }
  | { type: 'GAS_FAIL'; message: string }
  | { type: 'STATUS'; status: 'signing' | 'broadcasting' | 'in-block' | 'finalized' | 'error' }
  | { type: 'REJECTED' }
  | { type: 'PIPELINE_FALLBACK' }
  | { type: 'TX_ERROR'; message: string; recoverable?: boolean }
  | { type: 'TIMEOUT' }
  | { type: 'VERIFIED'; ok: boolean }
  | { type: 'VERIFY_OK' }
  | { type: 'VERIFY_FAIL' }
  | { type: 'REFRESH_OK' }
  | { type: 'REFRESH_FAIL' }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }
  | { type: 'CLOSE' };

export interface TxContext {
  state: TxState;
  message: string | null;
  gasRetried: boolean;
  pipeline: 0 | 1;
  pipelineFellBack: boolean;
  recoverable: boolean;
  refreshFailed: boolean;
  blockNumber: number | null;
  txHash: string | null;
}

export const initialTx = (): TxContext => ({
  state: 'idle',
  message: null,
  gasRetried: false,
  pipeline: 1,
  pipelineFellBack: false,
  recoverable: true,
  refreshFailed: false,
  blockNumber: null,
  txHash: null,
});

export const FINAL_STATES: ReadonlySet<TxState> = new Set(['idle', 'simError', 'rejected', 'uncertain', 'error', 'done']);
export const CLOSABLE: ReadonlySet<TxState> = new Set(['simError', 'rejected', 'uncertain', 'error', 'done']);

const ORDER: Partial<Record<TxState, number>> = { awaitingSignature: 0, broadcast: 1, inBlock: 2, finalized: 3 };
const STATUS_TO: Record<string, TxState> = { broadcasting: 'broadcast', 'in-block': 'inBlock', finalized: 'finalized' };
const SENDING: ReadonlySet<TxState> = new Set(['awaitingSignature', 'broadcast', 'inBlock']);

export function txReducer(c: TxContext, e: TxEvent): TxContext {
  const to = (state: TxState, patch: Partial<TxContext> = {}): TxContext => ({ ...c, ...patch, state });
  const s = c.state;

  if (e.type === 'START' && (s === 'idle' || FINAL_STATES.has(s))) return to('simulating', { ...initialTx(), state: 'simulating' });

  switch (s) {
    case 'simulating':
      if (e.type === 'SIM_OK') return to('awaitingSignature', { message: null });
      if (e.type === 'SIM_FAIL') return to('simError', { message: e.message });
      if (e.type === 'NEED_GAS') return c.gasRetried ? to('error', { message: 'No hay gas suficiente.', recoverable: true }) : to('requestingGas', { gasRetried: true });
      if (e.type === 'CANCEL') return to('idle');
      break;
    case 'requestingGas':
      if (e.type === 'GAS_OK') return to('simulating');
      if (e.type === 'GAS_FAIL') return to('error', { message: e.message, recoverable: true });
      break;
    case 'simError':
    case 'rejected':
    case 'uncertain':
      if (e.type === 'RETRY') return to('simulating', { message: null });
      if (e.type === 'CLOSE') return to('idle');
      break;
    case 'error':
      if (e.type === 'RETRY' && c.recoverable) return to('simulating', { message: null, gasRetried: false });
      if (e.type === 'CLOSE') return to('idle');
      break;
    case 'finalized':
      if (e.type === 'VERIFIED')
        return e.ok
          ? to('updating')
          : to('error', { message: 'La transacción entró en la cadena pero no se aplicó.', recoverable: true });
      break;
    case 'verifying':
      if (e.type === 'VERIFY_OK') return to('updating');
      if (e.type === 'VERIFY_FAIL') return to('uncertain', { message: 'No se pudo confirmar. Revisa antes de reintentar.' });
      break;
    case 'updating':
      if (e.type === 'REFRESH_OK') return to('done');
      if (e.type === 'REFRESH_FAIL') return to('done', { refreshFailed: true });
      break;
    case 'done':
      if (e.type === 'CLOSE') return to('idle');
      break;
  }

  if (SENDING.has(s)) {
    if (e.type === 'STATUS') {
      if (e.status === 'error') return to('error', { message: 'La transacción falló.', recoverable: true });
      const next = STATUS_TO[e.status];
      if (next && (ORDER[next] ?? -1) > (ORDER[s] ?? -1)) return to(next);
      return c;
    }
    if (e.type === 'TX_ERROR') return to('error', { message: e.message, recoverable: e.recoverable ?? true });
    if (e.type === 'TIMEOUT') return to('verifying', { message: 'Sin respuesta a tiempo. Revisando si se aplicó…' });
    if (s === 'awaitingSignature') {
      if (e.type === 'REJECTED') return to('rejected', { message: 'Firma rechazada.' });
      if (e.type === 'NEED_GAS')
        return c.gasRetried ? to('error', { message: 'No hay gas suficiente.', recoverable: true }) : to('requestingGas', { gasRetried: true });
      if (e.type === 'PIPELINE_FALLBACK')
        return c.pipelineFellBack
          ? to('error', { message: 'El Host rechazó la firma.', recoverable: true })
          : to('simulating', { pipeline: 0, pipelineFellBack: true });
    }
  }

  if (e.type !== 'CLOSE' && e.type !== 'RETRY') console.warn(`[tx] evento ${e.type} ignorado en ${s}`);
  return c;
}

export const STATE_TEXT: Record<TxState, string> = {
  idle: '',
  simulating: 'Simulando la transacción…',
  simError: 'Error de simulación',
  requestingGas: 'Pidiendo permiso de gas al Host…',
  awaitingSignature: 'Esperando tu firma en el Host',
  broadcast: 'Enviada a la red',
  inBlock: 'Incluida en un bloque, esperando finalización',
  finalized: 'Finalizada. Comprobando el resultado…',
  updating: 'Actualizando la app…',
  done: 'Listo',
  rejected: 'Firma rechazada',
  verifying: 'Sin respuesta a tiempo. Revisando si se aplicó…',
  uncertain: 'No se pudo confirmar',
  error: 'Error',
};

/** Pasos visibles en el modal, en orden. */
export const STEPS: ReadonlyArray<{ key: TxState; label: string }> = [
  { key: 'simulating', label: 'Simular' },
  { key: 'awaitingSignature', label: 'Firmar' },
  { key: 'broadcast', label: 'Enviar' },
  { key: 'inBlock', label: 'En bloque' },
  { key: 'finalized', label: 'Finalizada' },
  { key: 'updating', label: 'Actualizar app' },
];

export function stepIndex(s: TxState): number {
  const order: TxState[] = ['simulating', 'awaitingSignature', 'broadcast', 'inBlock', 'finalized', 'updating', 'done'];
  if (s === 'requestingGas') return 0;
  if (s === 'verifying') return 3;
  return order.indexOf(s);
}
