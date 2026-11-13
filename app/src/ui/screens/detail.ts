// Detalle de dibujo con editar, eliminar, exportar PNG y compartir (Requisitos 11, 18, 19).

import { LIGHT_CLIENT_GATEWAY } from '../../config';
import { reads } from '../../chain/reads';
import { labelOf } from '../../chain/productId';
import type { DrawingView } from '../../contract/abi';
import { unpack } from '../../domain/pixels';
import { exportPng, thumbCanvas } from '../../editor/render';
import { store } from '../../state/store';
import { deleteDrawingAction } from '../../tx/actions';
import { runTx } from '../../tx/txService';
import { banner, confirmDialog, errorBlock, loading, openModal, ownerLabel } from '../components';
import { copyText, fmtDate, h } from '../dom';
import { icon } from '../icons';

export function shareLinks(id: bigint | number): { host: string; light: string } {
  const productId = store.get().productId;
  const label = labelOf(productId);
  return {
    host: `${productId}/#/dibujo/${id}`,
    light: `https://${label}.${LIGHT_CLIENT_GATEWAY}/#/dibujo/${id}`,
  };
}

function copyRow(label: string, value: string, idSuffix: string): HTMLElement {
  const input = h('input', { class: 'input input--mono', id: `share-${idSuffix}`, type: 'text', readonly: true, value });
  const msg = h('p', { class: 'field-hint', 'aria-live': 'polite' });
  input.addEventListener('focus', () => input.select());
  return h(
    'div',
    { class: 'field' },
    h('label', { for: `share-${idSuffix}` }, label),
    input,
    h(
      'button',
      {
        class: 'btn btn--sm',
        type: 'button',
        onclick: async () => {
          const ok = await copyText(value, input);
          msg.textContent = ok ? 'Copiado.' : 'Copia el enlace a mano (ya está seleccionado).';
        },
      },
      icon('copy'),
      'Copiar',
    ),
    msg,
  );
}

function openShare(d: DrawingView): void {
  const links = shareLinks(d.id);
  const m = openModal('COMPARTIR');
  m.body.append(
    copyRow('Enlace en el Host (.dot)', links.host, 'host'),
    copyRow(`Enlace con light client (${LIGHT_CLIENT_GATEWAY})`, links.light, 'light'),
    h('p', { class: 'field-hint' }, 'El enlace de light client abre la app en el navegador. No verificado en Products Devnet.'),
  );
}

async function openExport(d: DrawingView): Promise<void> {
  const m = openModal('EXPORTAR PNG');
  m.body.append(loading('Generando PNG…'));
  const blob = await exportPng(unpack(d.pixels));
  m.body.replaceChildren();
  if (!blob) {
    m.body.append(banner('error', 'No se pudo generar el PNG.'));
    return;
  }
  const url = URL.createObjectURL(blob);
  m.dialog.addEventListener('close', () => URL.revokeObjectURL(url));
  m.body.append(
    h('img', { class: 'export-img', src: url, alt: `«${d.title}» en 512 × 512 píxeles` }),
    h('a', { class: 'btn btn--primary btn--block', href: url, download: `dot-pixel-${d.id}.png` }, icon('download'), 'Descargar PNG'),
    h('p', { class: 'field-hint' }, 'Si la descarga no funciona dentro del Host, mantén pulsada la imagen para guardarla.'),
  );
}

export function detailScreen(main: HTMLElement, id: number): void {
  main.append(loading());
  const run = async (): Promise<void> => {
    let d: DrawingView;
    try {
      if (!(await reads.drawingExists(BigInt(id)))) {
        main.replaceChildren(
          h('h1', {}, `Dibujo #${id}`),
          h('div', { class: 'empty' }, h('p', {}, 'Este dibujo no existe o fue borrado.'), h('a', { class: 'btn', href: '#/galeria' }, 'Ir a la galería')),
        );
        return;
      }
      d = await reads.getDrawing(BigInt(id));
    } catch {
      main.replaceChildren(errorBlock('No se pudo cargar el dibujo.', () => void run()));
      return;
    }
    const s = store.get();
    const isOwner = s.me?.h160 === d.owner;
    const hide = d.ownerBlacklisted && !isOwner && !s.isAdmin;

    const art = hide
      ? h('div', { class: 'empty' }, h('p', {}, 'Dibujo oculto: su autor está en la lista negra.'))
      : h('div', { class: 'detail-art checker' }, thumbCanvas(unpack(d.pixels), `Dibujo «${d.title}»`, 256));

    const actions = h('div', { class: 'row' });
    if (isOwner && !s.isBlacklisted) actions.append(h('a', { class: 'btn btn--primary', href: `#/editor/${d.id}` }, icon('pencil'), 'Editar'));
    if (isOwner || s.isAdmin) {
      actions.append(
        h(
          'button',
          {
            class: 'btn btn--danger',
            type: 'button',
            disabled: s.txBusy,
            onclick: async () => {
              const admin = !isOwner;
              const text = admin
                ? `Vas a eliminar como admin el dibujo de otra cuenta («${d.title}»). No se puede deshacer.`
                : `¿Eliminar «${d.title}»? No se puede deshacer y libera un lugar de tus 30.`;
              if (!(await confirmDialog('ELIMINAR DIBUJO', text, 'Eliminar', true))) return;
              await runTx(deleteDrawingAction(d.id, admin, admin ? '#/galeria' : '#/mis-dibujos'));
            },
          },
          icon('trash'),
          'Eliminar',
        ),
      );
    }
    if (!hide) {
      actions.append(
        h('button', { class: 'btn', type: 'button', onclick: () => void openExport(d) }, icon('download'), 'PNG'),
        h('button', { class: 'btn', type: 'button', onclick: () => openShare(d) }, icon('share'), 'Compartir'),
      );
    }

    main.replaceChildren(
      h('h1', {}, d.title),
      d.ownerBlacklisted ? banner('warn', 'El autor de este dibujo está en la lista negra.') : '',
      art,
      h(
        'dl',
        { class: 'meta' },
        h('dt', {}, 'Autor'),
        h('dd', {}, ownerLabel(d.owner), isOwner ? ' (tú)' : ''),
        h('dt', {}, 'Número'),
        h('dd', {}, `#${d.id}`),
        h('dt', {}, 'Creado'),
        h('dd', {}, fmtDate(d.createdAt)),
        h('dt', {}, 'Modificado'),
        h('dd', {}, fmtDate(d.updatedAt)),
      ),
      actions,
    );
  };
  void run();
}
