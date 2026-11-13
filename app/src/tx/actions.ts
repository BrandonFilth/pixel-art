// Acciones firmadas (design.md §5.5). Cada constructor lee el valor previo antes de simular.

import type { Hex, Words } from '../contract/abi';
import { forgetUsername, reads } from '../chain/reads';
import { refreshAccount } from '../chain/session';
import { bumpData, store } from '../state/store';
import type { TxAction } from './txService';

function me(): Hex {
  const m = store.get().me;
  if (!m) throw new Error('Sin cuenta conectada');
  return m.h160;
}

async function refreshAll(): Promise<void> {
  await refreshAccount();
  bumpData();
}

function go(hash: string): () => void {
  return () => {
    location.hash = hash;
  };
}

export async function createDrawingAction(title: string, pixels: Words): Promise<TxAction> {
  const account = me();
  const expectedId = await reads.nextId();
  return {
    kind: 'create',
    title: 'GUARDAR DIBUJO',
    method: 'createDrawing',
    args: [title, pixels],
    verify: async () => {
      // Si alguien creó otro en medio, el id puede ser mayor: se busca entre los míos.
      if (await reads.drawingExists(expectedId)) {
        const d = await reads.getDrawing(expectedId);
        if (d.owner === account) return true;
      }
      const n = await reads.drawingCount(account);
      const last = await reads.getDrawingsByOwner(account, Math.max(0, n - 1), 1);
      return last.items.some((d) => d.id >= expectedId);
    },
    refresh: refreshAll,
    onDone: async () => {
      try {
        const n = await reads.drawingCount(account);
        const last = await reads.getDrawingsByOwner(account, Math.max(0, n - 1), 1);
        const id = last.items[0]?.id ?? expectedId;
        location.hash = `#/dibujo/${id}`;
      } catch {
        location.hash = '#/mis-dibujos';
      }
    },
  };
}

export async function updateDrawingAction(id: bigint, title: string, pixels: Words): Promise<TxAction> {
  const prev = await reads.getDrawing(id);
  return {
    kind: 'update',
    title: 'GUARDAR CAMBIOS',
    method: 'updateDrawing',
    args: [id, title, pixels],
    verify: async () => {
      const d = await reads.getDrawing(id);
      return d.updatedAt !== prev.updatedAt || (d.title === title && d.pixels.join() === pixels.join().toLowerCase());
    },
    refresh: refreshAll,
    onDone: go(`#/dibujo/${id}`),
  };
}

export function deleteDrawingAction(id: bigint, byAdmin: boolean, after = '#/mis-dibujos'): TxAction {
  return {
    kind: byAdmin ? 'adminDelete' : 'delete',
    title: byAdmin ? 'ELIMINAR DIBUJO (ADMIN)' : 'ELIMINAR DIBUJO',
    method: 'deleteDrawing',
    args: [id],
    verify: async () => !(await reads.drawingExists(id)),
    refresh: refreshAll,
    onDone: go(after),
  };
}

export function setUsernameAction(name: string): TxAction {
  const account = me();
  return {
    kind: 'setUsername',
    title: name ? 'GUARDAR NOMBRE' : 'BORRAR NOMBRE',
    method: 'setUsername',
    args: [name],
    verify: async () => (await reads.usernameOf(account)) === name,
    refresh: async () => {
      forgetUsername(account);
      await refreshAll();
    },
  };
}

export function setBlacklistedAction(account: Hex, blacklisted: boolean): TxAction {
  return {
    kind: blacklisted ? 'blacklistAdd' : 'blacklistRemove',
    title: blacklisted ? 'BLOQUEAR CUENTA' : 'DESBLOQUEAR CUENTA',
    method: 'setBlacklisted',
    args: [account, blacklisted],
    verify: async () => (await reads.isBlacklisted(account)) === blacklisted,
    refresh: refreshAll,
  };
}

export function transferAdminAction(newOwner: Hex): TxAction {
  const cancel = /^0x0{40}$/.test(newOwner);
  return {
    kind: cancel ? 'cancelTransfer' : 'transferAdmin',
    title: cancel ? 'CANCELAR TRANSFERENCIA' : 'TRANSFERIR ADMIN',
    method: 'transferOwnership',
    args: [newOwner],
    verify: async () => (await reads.pendingOwner()) === newOwner.toLowerCase(),
    refresh: refreshAll,
  };
}

export function acceptAdminAction(): TxAction {
  const account = me();
  return {
    kind: 'acceptAdmin',
    title: 'ACEPTAR ROL DE ADMIN',
    method: 'acceptOwnership',
    args: [],
    verify: async () => (await reads.owner()) === account,
    refresh: refreshAll,
    onDone: go('#/admin'),
  };
}
