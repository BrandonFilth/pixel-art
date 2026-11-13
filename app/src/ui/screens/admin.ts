// Panel admin (Requisitos 13–15): lista negra, eliminar por id, transferir admin.

import { PAGE_SIZE } from '../../config';
import { reads } from '../../chain/reads';
import type { Hex } from '../../contract/abi';
import { unpack } from '../../domain/pixels';
import { shortAddress, validateAddress, parsePositiveInt } from '../../domain/validation';
import { thumbCanvas } from '../../editor/render';
import { store, ZERO_ADDRESS } from '../../state/store';
import { deleteDrawingAction, setBlacklistedAction, transferAdminAction } from '../../tx/actions';
import { runTx } from '../../tx/txService';
import { addressBlock, banner, confirmDialog, errorBlock, loading, ownerLabel, pager } from '../components';
import { h } from '../dom';
import { acceptAdminPanel } from './profile';

function addrField(id: string, label: string): { wrap: HTMLElement; input: HTMLInputElement; err: HTMLElement; read: () => Hex | null } {
  const input = h('input', { class: 'input input--mono', id, type: 'text', placeholder: '0x…', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': `${id}-err` });
  const err = h('p', { class: 'field-error', id: `${id}-err`, 'aria-live': 'polite' });
  const read = (): Hex | null => {
    const v = validateAddress(input.value);
    input.setAttribute('aria-invalid', v.ok ? 'false' : 'true');
    err.textContent = v.ok ? '' : v.message;
    return v.ok ? (input.value.trim().toLowerCase() as Hex) : null;
  };
  return { wrap: h('div', { class: 'field' }, h('label', { for: id }, label), input, err), input, err, read };
}

export function adminScreen(main: HTMLElement, page: number): void {
  const s = store.get();
  if (!s.isAdmin) {
    main.append(
      h('h1', {}, 'Panel admin'),
      banner('warn', 'Esta sección es solo para el admin.'),
      acceptAdminPanel() ?? '',
      addressBlock(),
    );
    return;
  }

  // --- Lista negra ---
  const bl = addrField('bl-addr', 'Dirección 0x a bloquear');
  const blBtn = h('button', { class: 'btn btn--primary', type: 'button', disabled: s.txBusy }, 'Bloquear');
  blBtn.addEventListener('click', async () => {
    const a = bl.read();
    if (!a) return;
    if (a === s.owner) {
      bl.err.textContent = 'No puedes bloquear la cuenta del administrador.';
      return;
    }
    if (!(await confirmDialog('BLOQUEAR CUENTA', `¿Bloquear ${shortAddress(a)}? No podrá crear, editar ni cambiar su nombre.`, 'Bloquear', true))) return;
    await runTx(setBlacklistedAction(a, true));
  });
  const blList = h('div', {}, loading());
  const loadBl = async (): Promise<void> => {
    try {
      const total = await reads.getBlacklisted(0, 0).then((r) => r.total);
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const p = Math.min(page, pages);
      const r = await reads.getBlacklisted((p - 1) * PAGE_SIZE, PAGE_SIZE);
      if (r.total === 0) {
        blList.replaceChildren(h('p', { class: 'muted' }, 'No hay cuentas bloqueadas.'));
        return;
      }
      blList.replaceChildren(
        h(
          'ul',
          { class: 'list-plain' },
          ...r.items.map((a) =>
            h(
              'li',
              {},
              h('span', { class: 'addr' }, ownerLabel(a), h('br'), h('small', {}, a)),
              h(
                'button',
                { class: 'btn btn--sm', type: 'button', disabled: store.get().txBusy, onclick: () => void runTx(setBlacklistedAction(a, false)) },
                'Desbloquear',
              ),
            ),
          ),
        ),
        pages > 1 ? pager(p, pages, (n) => `#/admin?p=${n}`) : '',
      );
    } catch {
      blList.replaceChildren(errorBlock('No se pudo cargar la lista negra.', () => void loadBl()));
    }
  };

  // --- Eliminar por id ---
  const idInput = h('input', { class: 'input', id: 'del-id', type: 'text', inputmode: 'numeric', placeholder: 'Número del dibujo', 'aria-describedby': 'del-msg' });
  const delMsg = h('div', { id: 'del-msg', 'aria-live': 'polite' });
  const findBtn = h('button', { class: 'btn', type: 'button' }, 'Buscar');
  findBtn.addEventListener('click', async () => {
    const n = parsePositiveInt(idInput.value.trim());
    delMsg.replaceChildren();
    if (!n) {
      delMsg.append(h('p', { class: 'field-error' }, 'Escribe un número de dibujo válido.'));
      return;
    }
    delMsg.append(loading('Buscando…'));
    try {
      if (!(await reads.drawingExists(BigInt(n)))) {
        delMsg.replaceChildren(h('p', { class: 'field-error' }, 'Este dibujo no existe o fue borrado.'));
        return;
      }
      const d = await reads.getDrawing(BigInt(n));
      const c = thumbCanvas(unpack(d.pixels), `Dibujo «${d.title}»`, 96);
      c.style.border = 'var(--border-thin)';
      delMsg.replaceChildren(
        h('div', { class: 'row' }, c, h('div', {}, h('strong', {}, d.title), h('br'), 'por ', ownerLabel(d.owner))),
        h(
          'button',
          {
            class: 'btn btn--danger btn--block',
            type: 'button',
            disabled: store.get().txBusy,
            onclick: async () => {
              if (!(await confirmDialog('ELIMINAR DIBUJO', `¿Eliminar «${d.title}» (#${d.id})? No se puede deshacer.`, 'Eliminar', true))) return;
              await runTx(deleteDrawingAction(d.id, d.owner !== store.get().me?.h160, '#/admin'));
            },
          },
          'Eliminar dibujo',
        ),
      );
    } catch {
      delMsg.replaceChildren(errorBlock('No se pudo cargar el dibujo.'));
    }
  });

  // --- Transferir admin ---
  const tr = addrField('tr-addr', 'Nuevo admin (dirección 0x)');
  const trBtn = h('button', { class: 'btn btn--primary', type: 'button', disabled: s.txBusy }, 'Transferir admin');
  trBtn.addEventListener('click', async () => {
    const a = tr.read();
    if (!a) return;
    if (a === s.owner) {
      tr.err.textContent = 'Esa ya es la cuenta admin.';
      return;
    }
    if (!(await confirmDialog('TRANSFERIR ADMIN', `Vas a proponer a ${shortAddress(a)} como admin. Tú sigues siendo admin hasta que esa cuenta acepte desde la app.`, 'Transferir'))) return;
    await runTx(transferAdminAction(a));
  });
  const cancelBtn = s.pendingOwner
    ? h('button', { class: 'btn', type: 'button', disabled: s.txBusy, onclick: () => void runTx(transferAdminAction(ZERO_ADDRESS)) }, 'Cancelar transferencia')
    : null;

  main.append(
    h('h1', {}, 'Panel admin'),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'bl-title' },
      h('h2', { class: 'panel-title', id: 'bl-title' }, 'Lista negra'),
      bl.wrap,
      blBtn,
      h('h3', { class: 'label', style: 'margin-top:16px' }, 'Cuentas bloqueadas'),
      blList,
    ),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'del-title' },
      h('h2', { class: 'panel-title', id: 'del-title' }, 'Eliminar dibujo por número'),
      h('div', { class: 'field' }, h('label', { for: 'del-id' }, 'Número del dibujo'), idInput),
      findBtn,
      delMsg,
    ),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'tr-title' },
      h('h2', { class: 'panel-title', id: 'tr-title' }, 'Rol de admin'),
      h('p', { class: 'muted' }, 'Admin actual: ', h('span', { class: 'addr' }, s.owner ?? '—')),
      h('p', { class: 'muted' }, 'Pendiente: ', h('span', { class: 'addr' }, s.pendingOwner ?? 'ninguno')),
      tr.wrap,
      h('div', { class: 'row' }, trBtn, cancelBtn),
    ),
    addressBlock(),
  );
  void loadBl();
}
