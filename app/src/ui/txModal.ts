// Modal de estado de transacción (Requisito 17): un paso por estado, aria-live, reintentar/cerrar.

import { fmtBlock, h, clear } from './dom';
import { icon } from './icons';
import { openModal, type ModalHandle } from './components';
import { cancelTx, closeTx, retryTx, subscribeTx, type TxAction } from '../tx/txService';
import { CLOSABLE, STATE_TEXT, STEPS, stepIndex, type TxContext } from '../tx/txMachine';

let modal: ModalHandle | null = null;
let statusEl: HTMLDivElement | null = null;
let stepsEl: HTMLOListElement | null = null;
let actionsEl: HTMLDivElement | null = null;

const FAILED = new Set(['simError', 'rejected', 'uncertain', 'error']);

function renderSteps(ctx: TxContext): void {
  if (!stepsEl) return;
  clear(stepsEl);
  const cur = stepIndex(ctx.state);
  const failed = FAILED.has(ctx.state);
  const done = ctx.state === 'done';
  STEPS.forEach((s, i) => {
    let cls = '';
    let mark = String(i + 1);
    if (done || i < cur) {
      cls = 'is-done';
      mark = '✓';
    } else if (i === cur && !failed) cls = 'is-current';
    if (failed && i === Math.max(cur, 0)) {
      cls = 'is-failed';
      mark = '!';
    }
    stepsEl!.append(
      h('li', { class: cls, 'aria-current': cls === 'is-current' ? 'step' : null }, h('span', { class: 'dot', 'aria-hidden': 'true' }, mark), s.label),
    );
  });
}

function render(ctx: TxContext, action: TxAction | null): void {
  if (ctx.state === 'idle') {
    if (modal) {
      const m = modal;
      modal = null;
      m.close();
    }
    return;
  }
  if (!modal) {
    modal = openModal(action?.title ?? 'TRANSACCIÓN', {
      closable: false,
      onClose: () => {
        if (modal) {
          modal = null;
          closeTx();
        }
      },
    });
    stepsEl = h('ol', { class: 'steps', 'aria-label': 'Progreso' });
    statusEl = h('div', { class: 'tx-status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    actionsEl = h('div', { class: 'row' });
    modal.body.append(stepsEl, statusEl, actionsEl);
  }
  modal.setClosable(CLOSABLE.has(ctx.state));
  renderSteps(ctx);

  {
    clear(statusEl!);
    const failed = FAILED.has(ctx.state);
    statusEl!.setAttribute('role', failed ? 'alert' : 'status');
    statusEl!.append(h('strong', {}, STATE_TEXT[ctx.state]));
    if (ctx.message) statusEl!.append(h('p', { class: failed ? 'field-error' : '' }, ctx.message));
    if (ctx.state === 'awaitingSignature')
      statusEl!.append(h('p', { class: 'muted' }, 'Revisa el Host (o tu teléfono) y aprueba la firma.'));
    if (ctx.pipeline === 0) statusEl!.append(h('p', { class: 'field-hint' }, 'Aviso: la comisión se cobrará en PAS.'));
    if (ctx.blockNumber) statusEl!.append(h('p', { class: 'field-hint' }, `Bloque #${fmtBlock(BigInt(ctx.blockNumber))}`));
    if (ctx.state === 'done') {
      statusEl!.append(
        h('p', { class: 'field-ok' }, icon('check'), ' La transacción finalizó y la app ya muestra los datos nuevos.'),
      );
      if (ctx.refreshFailed)
        statusEl!.append(h('p', { class: 'field-error' }, 'La transacción finalizó, pero no se pudieron recargar los datos.'));
    }
  }
  clear(actionsEl!);
  if (ctx.state === 'simulating')
    actionsEl!.append(h('button', { class: 'btn btn--block', type: 'button', onclick: () => cancelTx() }, 'Cancelar'));
  const canRetry =
    ctx.state === 'rejected' || ctx.state === 'uncertain' || (ctx.state === 'error' && ctx.recoverable);
  if (canRetry)
    actionsEl!.append(h('button', { class: 'btn btn--primary btn--block', type: 'button', onclick: () => void retryTx() }, 'Reintentar'));
  if (CLOSABLE.has(ctx.state))
    actionsEl!.append(
      h(
        'button',
        { class: `btn btn--block ${ctx.state === 'done' ? 'btn--primary' : ''}`, type: 'button', onclick: () => closeTx() },
        ctx.state === 'done' ? 'Continuar' : 'Cerrar',
      ),
    );
}

export function mountTxModal(): void {
  subscribeTx(render);
}
