// Store observable mínimo (design.md §5.1).

import type { Hex } from '../contract/abi';

export type SessionStatus =
  | 'checking'
  | 'outsideHost'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'hostLost'
  | 'error';

export type GasState = 'unknown' | 'Allocated' | 'Rejected' | 'NotAvailable' | 'error';

export interface Me {
  address: string; // SS58
  h160: Hex; // msg.sender en el contrato
}

export interface AppState {
  session: SessionStatus;
  sessionError: string | null;
  productId: string;
  me: Me | null;
  gas: GasState;
  owner: Hex | null;
  pendingOwner: Hex | null;
  isAdmin: boolean;
  isPendingAdmin: boolean;
  isBlacklisted: boolean;
  username: string;
  myCount: number | null;
  totalDrawings: number | null;
  block: bigint | null;
  txBusy: boolean;
  /** Sube tras cada transacción aplicada; las pantallas vuelven a leer. */
  dataVersion: number;
}

type Listener = (s: AppState, prev: AppState) => void;

function createStore(initial: AppState) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(patch: Partial<AppState>): void {
      const prev = state;
      state = { ...state, ...patch };
      if (state.me && state.owner) state.isAdmin = state.owner === state.me.h160;
      else state.isAdmin = false;
      state.isPendingAdmin = Boolean(
        state.me && state.pendingOwner && state.pendingOwner === state.me.h160,
      );
      for (const l of listeners) l(state, prev);
    },
    subscribe(l: Listener): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export const store = createStore({
  session: 'checking',
  sessionError: null,
  productId: '',
  me: null,
  gas: 'unknown',
  owner: null,
  pendingOwner: null,
  isAdmin: false,
  isPendingAdmin: false,
  isBlacklisted: false,
  username: '',
  myCount: null,
  totalDrawings: null,
  block: null,
  txBusy: false,
  dataVersion: 0,
});

export function bumpData(): void {
  store.set({ dataVersion: store.get().dataVersion + 1 });
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Hex;
