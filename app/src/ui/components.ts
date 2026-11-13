// Componentes compartidos: modales, avisos, paginador, miniaturas, bloque de dirección.

import type { DrawingView, Hex } from '../contract/abi';
import { cachedUsername } from '../chain/reads';
import { unpack } from '../domain/pixels';
import { shortAddress } from '../domain/validation';
import { thumbCanvas } from '../editor/render';
import { store } from '../state/store';
import { copyText, fmtDate, h } from './dom';
import { icon } from './icons';

// ---------- Modal base (<dialog> nativo) ----------
export interface ModalHandle {
  dialog: HTMLDialogElement;
  body: HTMLDivElement;
  heading: HTMLHeadingElement;
  closeBtn: HTMLButtonElement;
  close: () => void;
  setClosable: (v: boolean) => void;
}

let modalSeq = 0;

export function openModal(title: string, opts: { onClose?: () => void; closable?: boolean } = {}): ModalHandle {
  const id = `modal-title-${++modalSeq}`;
  const opener = document.activeElement as HTMLElement | null;
  let closable = opts.closable ?? true;
  const heading = h('h2', { id, tabindex: '-1' }, title);
  const closeBtn = h('button', { class: 'modal-close', type: 'button', 'aria-label': 'Cerrar' }, icon('close'));
  const body = h('div', { class: 'modal-body' });
  const dialog = h('dialog', { class: 'modal', 'aria-labelledby': id }, h('div', { class: 'modal-bar' }, heading, closeBtn), body);
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    dialog.close();
    dialog.remove();
    opts.onClose?.();
    opener?.focus?.();
  };
  closeBtn.addEventListener('click', () => closable && close());
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (closable) close();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
  heading.focus();
  const setClosable = (v: boolean): void => {
    closable = v;
    closeBtn.disabled = !v;
  };
  setClosable(closable);
  return { dialog, body, heading, closeBtn, close, setClosable };
}

export function confirmDialog(title: string, text: string, okLabel: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal(title, { onClose: () => !answered && resolve(false) });
    const ok = h('button', { class: `btn btn--block ${danger ? 'btn--danger' : 'btn--primary'}`, type: 'button' }, okLabel);
    const cancel = h('button', { class: 'btn btn--block', type: 'button' }, 'Cancelar');
    ok.addEventListener('click', () => {
      answered = true;
      resolve(true);
      m.close();
    });
    cancel.addEventListener('click', () => {
      answered = true;
      resolve(false);
      m.close();
    });
    m.body.append(h('p', {}, text), ok, cancel);
  });
}

// ---------- Avisos ----------
export function banner(kind: 'info' | 'warn' | 'error' | 'ok', ...content: (Node | string)[]): HTMLDivElement {
  const ic = kind === 'ok' ? 'check' : 'warn';
  return h(
    'div',
    { class: `banner banner--${kind}`, role: kind === 'error' ? 'alert' : null },
    icon(ic),
    h('div', {}, ...content),
  );
}

export function errorBlock(text: string, onRetry?: () => void): HTMLDivElement {
  const retry = onRetry ? h('button', { class: 'btn btn--sm', type: 'button', onclick: onRetry }, 'Reintentar') : null;
  return banner('error', h('p', {}, text), retry ?? '');
}

export function loading(text = 'Cargando…'): HTMLParagraphElement {
  return h('p', { class: 'label', role: 'status' }, text);
}

// ---------- Paginador ----------
export function pager(page: number, pages: number, hrefFor: (p: number) => string): HTMLElement {
  const prev =
    page > 1
      ? h('a', { class: 'btn btn--sm', href: hrefFor(page - 1) }, '‹ Anterior')
      : h('button', { class: 'btn btn--sm', type: 'button', disabled: true }, '‹ Anterior');
  const next =
    page < pages
      ? h('a', { class: 'btn btn--sm', href: hrefFor(page + 1) }, 'Siguiente ›')
      : h('button', { class: 'btn btn--sm', type: 'button', disabled: true }, 'Siguiente ›');
  return h('nav', { class: 'pager', 'aria-label': 'Paginación' }, prev, h('span', { class: 'label' }, `Página ${page} de ${pages}`), next);
}

// ---------- Autor ----------
export function ownerLabel(owner: Hex): HTMLSpanElement {
  const span = h('span', { title: owner }, shortAddress(owner));
  void cachedUsername(owner).then((n) => {
    if (n) span.textContent = `@${n}`;
  });
  return span;
}

// ---------- Miniatura ----------
export function thumbCard(d: DrawingView, opts: { showOwner?: boolean; actions?: Node } = {}): HTMLLIElement {
  const cells = unpack(d.pixels);
  const link = h(
    'a',
    { class: 'thumb-link', href: `#/dibujo/${d.id}` },
    thumbCanvas(cells, `Dibujo «${d.title}»`),
    h(
      'div',
      { class: 'thumb-meta' },
      h('span', { class: 'thumb-title' }, d.title),
      opts.showOwner ? h('span', {}, 'por ', ownerLabel(d.owner)) : h('span', {}, fmtDate(d.updatedAt)),
      d.ownerBlacklisted ? h('span', { class: 'flag' }, ' Autor bloqueado') : null,
    ),
  );
  return h('li', { class: 'thumb-card' }, link, opts.actions ? h('div', { class: 'thumb-actions' }, opts.actions) : null);
}

// ---------- Bloque "Tu dirección" (Requisito 27) ----------
export function addressBlock(): HTMLElement {
  const me = store.get().me;
  if (!me) return h('div');
  const input = h('input', {
    class: 'input input--mono',
    type: 'text',
    readonly: true,
    value: me.h160,
    id: 'my-address',
    'aria-describedby': 'my-address-help',
    spellcheck: 'false',
  });
  const live = h('p', { class: 'field-ok', 'aria-live': 'polite' });
  const btn = h(
    'button',
    {
      class: 'btn btn--primary btn--block',
      type: 'button',
      onclick: async () => {
        const ok = await copyText(me.h160, input);
        live.className = ok ? 'field-ok' : 'field-hint';
        live.textContent = ok ? 'Copiada.' : 'Copia la dirección con Ctrl+C (ya está seleccionada).';
        if (!ok) {
          input.focus();
          input.select();
        }
      },
    },
    icon('copy'),
    'Copiar mi dirección',
  );
  input.addEventListener('focus', () => input.select());
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'addr-title' },
    h('h2', { class: 'panel-title', id: 'addr-title' }, 'Tu dirección'),
    h('div', { class: 'field' }, h('label', { for: 'my-address' }, 'Dirección 0x (msg.sender)'), input),
    btn,
    live,
    h(
      'p',
      { class: 'muted', id: 'my-address-help' },
      'Para hacerte admin: en Remix, con la cuenta admin actual, llama transferOwnership con esta dirección y luego pulsa «Aceptar rol de admin» aquí.',
    ),
    h('p', { class: 'field-hint' }, 'SS58: ', h('span', { class: 'addr' }, me.address)),
  );
}

// ---------- Pantalla bloqueada ----------
export function lockedScreen(onConnect: () => void): HTMLElement {
  const s = store.get();
  const outside = s.session === 'outsideHost';
  return h(
    'section',
    { class: 'panel locked' },
    icon('lock'),
    h('h1', {}, 'Conecta tu cuenta'),
    h(
      'p',
      {},
      outside
        ? 'Esta sección necesita una cuenta. Abre DOT PIXEL dentro de Polkadot Desktop o de la Polkadot App para conectarla.'
        : 'Esta sección necesita tu cuenta. Conéctala para dibujar, ver la galería y tu perfil.',
    ),
    outside
      ? null
      : h(
          'button',
          { class: 'btn btn--primary btn--block', type: 'button', onclick: onConnect, disabled: s.session === 'connecting' },
          s.session === 'connecting' ? 'Conectando…' : 'Conectar cuenta',
        ),
  );
}
