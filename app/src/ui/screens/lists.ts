// Mis dibujos y Galería, paginados "más reciente primero" (design.md §5.4).

import { MAX_DRAWINGS_PER_USER, PAGE_SIZE } from '../../config';
import { reads, type Page } from '../../chain/reads';
import type { DrawingView } from '../../contract/abi';
import { newestFirst, pageFromEnd } from '../../domain/pagination';
import { store } from '../../state/store';
import { deleteDrawingAction } from '../../tx/actions';
import { runTx } from '../../tx/txService';
import { banner, confirmDialog, errorBlock, loading, pager, thumbCard } from '../components';
import { h } from '../dom';

async function loadPage(
  totalFn: () => Promise<number>,
  pageFn: (offset: number, limit: number) => Promise<Page>,
  page: number,
): Promise<{ items: DrawingView[]; total: number; page: number; pages: number }> {
  const total = await totalFn();
  const w = pageFromEnd(total, page, PAGE_SIZE);
  if (total === 0 || w.limit === 0) return { items: [], total, page: w.page, pages: w.pages };
  const r = await pageFn(w.offset, w.limit);
  return { items: newestFirst(r.items), total: r.total, page: w.page, pages: Math.max(1, Math.ceil(r.total / PAGE_SIZE)) };
}

export function mineScreen(main: HTMLElement, page: number): void {
  const s = store.get();
  const me = s.me!;
  const full = (s.myCount ?? 0) >= MAX_DRAWINGS_PER_USER;
  const newBtn = full || s.isBlacklisted
    ? h('button', { class: 'btn btn--primary', type: 'button', disabled: true }, 'Nuevo dibujo')
    : h('a', { class: 'btn btn--primary', href: '#/editor' }, 'Nuevo dibujo');
  const reason = s.isBlacklisted
    ? 'Tu cuenta está bloqueada: no puedes crear dibujos.'
    : full
      ? 'Llegaste al límite de 30 dibujos. Borra uno para crear otro.'
      : '';
  const body = h('div', {}, loading());
  main.append(
    h('h1', {}, 'Mis dibujos'),
    h('div', { class: 'row' }, newBtn, h('span', { class: 'value-box', 'aria-label': `Tienes ${s.myCount ?? 0} de 30 dibujos` }, `${s.myCount ?? '—'}/${MAX_DRAWINGS_PER_USER}`)),
    reason ? h('p', { class: 'field-hint' }, reason) : '',
    body,
  );
  const run = async (): Promise<void> => {
    body.replaceChildren(loading());
    try {
      const r = await loadPage(() => reads.drawingCount(me.h160), (o, l) => reads.getDrawingsByOwner(me.h160, o, l), page);
      if (r.total === 0) {
        body.replaceChildren(
          h('div', { class: 'empty' }, h('p', {}, 'Crea tu primer dibujo.'), s.isBlacklisted ? null : h('a', { class: 'btn btn--primary', href: '#/editor' }, 'Abrir editor')),
        );
        return;
      }
      body.replaceChildren(
        h('ul', { class: 'thumbs' }, ...r.items.map((d) => thumbCard(d))),
        r.pages > 1 ? pager(r.page, r.pages, (p) => `#/mis-dibujos?p=${p}`) : '',
      );
    } catch {
      body.replaceChildren(errorBlock('No se pudieron cargar tus dibujos.', () => void run()));
    }
  };
  void run();
}

export function galleryScreen(main: HTMLElement, page: number): void {
  const s = store.get();
  const body = h('div', {}, loading());
  main.append(
    h('h1', {}, 'Galería'),
    h('p', { class: 'muted' }, 'Dibujos de todas las cuentas, del más reciente al más antiguo.'),
    s.isAdmin ? banner('info', 'Eres admin: ves también los dibujos de cuentas bloqueadas (marcados) y puedes eliminarlos.') : '',
    body,
  );
  const run = async (): Promise<void> => {
    body.replaceChildren(loading());
    try {
      const r = await loadPage(() => reads.totalDrawings(), (o, l) => reads.getAllDrawings(o, l), page);
      const visible = s.isAdmin ? r.items : r.items.filter((d) => !d.ownerBlacklisted);
      const hidden = r.items.length - visible.length;
      if (visible.length === 0) {
        body.replaceChildren(
          h('div', { class: 'empty' }, h('p', {}, r.total === 0 ? 'Todavía no hay dibujos públicos.' : 'No hay dibujos visibles en esta página.')),
          r.pages > 1 ? pager(r.page, r.pages, (p) => `#/galeria?p=${p}`) : '',
        );
        return;
      }
      body.replaceChildren(
        h(
          'ul',
          { class: 'thumbs' },
          ...visible.map((d) =>
            thumbCard(d, {
              showOwner: true,
              actions: s.isAdmin
                ? h(
                    'button',
                    {
                      class: 'btn btn--danger btn--sm btn--block',
                      type: 'button',
                      disabled: s.txBusy,
                      onclick: async () => {
                        if (!(await confirmDialog('ELIMINAR DIBUJO', `¿Eliminar «${d.title}» (#${d.id})? No se puede deshacer.`, 'Eliminar', true))) return;
                        await runTx(deleteDrawingAction(d.id, true, `#/galeria?p=${r.page}`));
                      },
                    },
                    'Eliminar',
                  )
                : undefined,
            }),
          ),
        ),
        hidden > 0 ? h('p', { class: 'field-hint' }, `${hidden} dibujo(s) oculto(s) en esta página: su autor está en la lista negra.`) : '',
        r.pages > 1 ? pager(r.page, r.pages, (p) => `#/galeria?p=${p}`) : '',
      );
    } catch {
      body.replaceChildren(errorBlock('No se pudo cargar la galería.', () => void run()));
    }
  };
  void run();
}
