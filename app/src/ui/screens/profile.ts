// Perfil: dirección para copiar (R27), nombre de usuario (R12) y aceptar admin (R15).

import { reads } from '../../chain/reads';
import { store } from '../../state/store';
import { acceptAdminAction, setUsernameAction } from '../../tx/actions';
import { runTx } from '../../tx/txService';
import { normalizeUsername, validateUsername } from '../../domain/validation';
import { addressBlock, banner, confirmDialog } from '../components';
import { h } from '../dom';

export function acceptAdminPanel(): HTMLElement | null {
  const s = store.get();
  if (!s.isPendingAdmin) return null;
  return h(
    'section',
    { class: 'panel', 'aria-labelledby': 'accept-title' },
    h('h2', { class: 'panel-title', id: 'accept-title' }, 'Invitación de admin'),
    h('p', {}, 'El admin actual te propuso como nuevo admin. Acepta para recibir el rol.'),
    h(
      'button',
      {
        class: 'btn btn--primary btn--block',
        type: 'button',
        disabled: s.txBusy || s.isBlacklisted,
        onclick: () => void runTx(acceptAdminAction()),
      },
      'Aceptar rol de admin',
    ),
    s.isBlacklisted ? h('p', { class: 'field-error' }, 'Tu cuenta está bloqueada: no puedes aceptar el rol.') : null,
  );
}

export function profileScreen(main: HTMLElement): void {
  const s = store.get();
  const input = h('input', {
    class: 'input',
    id: 'username',
    type: 'text',
    value: s.username,
    maxlength: '16',
    autocomplete: 'off',
    autocapitalize: 'none',
    spellcheck: 'false',
    'aria-describedby': 'username-help username-msg',
  });
  const msg = h('p', { id: 'username-msg', 'aria-live': 'polite' });
  const saveBtn = h('button', { class: 'btn btn--primary', type: 'button' }, 'Guardar nombre');
  const clearBtn = h('button', { class: 'btn', type: 'button' }, 'Borrar nombre');
  let timer: ReturnType<typeof setTimeout> | null = null;
  let checkSeq = 0;
  let available = false;

  const update = (): void => {
    const st = store.get();
    const name = normalizeUsername(input.value);
    if (input.value !== name) input.value = name;
    const v = validateUsername(name);
    available = false;
    saveBtn.disabled = true;
    clearBtn.disabled = !st.username || st.isBlacklisted || st.txBusy;
    if (name === st.username) {
      msg.className = 'field-hint';
      msg.textContent = st.username ? 'Ese es tu nombre actual.' : '';
      input.setAttribute('aria-invalid', 'false');
      return;
    }
    if (!v.ok) {
      msg.className = 'field-error';
      msg.textContent = v.message;
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    input.setAttribute('aria-invalid', 'false');
    msg.className = 'field-hint';
    msg.textContent = 'Comprobando disponibilidad…';
    if (timer) clearTimeout(timer);
    const seq = ++checkSeq;
    timer = setTimeout(async () => {
      try {
        const owner = await reads.ownerOfUsername(name);
        if (seq !== checkSeq) return;
        const free = /^0x0{40}$/.test(owner);
        available = free;
        msg.className = free ? 'field-ok' : 'field-error';
        msg.textContent = free ? 'Disponible.' : 'Ese nombre ya está en uso. Elige otro.';
        const now = store.get();
        saveBtn.disabled = !free || now.isBlacklisted || now.txBusy;
      } catch {
        if (seq !== checkSeq) return;
        msg.className = 'field-hint';
        msg.textContent = 'No se pudo comprobar; la simulación lo confirmará.';
        available = true;
        saveBtn.disabled = store.get().isBlacklisted || store.get().txBusy;
      }
    }, 400);
  };

  input.addEventListener('input', update);
  saveBtn.addEventListener('click', () => {
    const name = normalizeUsername(input.value);
    if (!available || !validateUsername(name).ok) return;
    void runTx(setUsernameAction(name));
  });
  clearBtn.addEventListener('click', async () => {
    if (!(await confirmDialog('BORRAR NOMBRE', `¿Borrar tu nombre «${store.get().username}»? Quedará libre para otra cuenta.`, 'Borrar', true))) return;
    void runTx(setUsernameAction(''));
  });

  main.append(
    h('h1', {}, 'Perfil'),
    s.isBlacklisted ? banner('error', 'Tu cuenta está bloqueada: no puedes cambiar tu nombre, crear ni editar dibujos. Sí puedes borrar los tuyos.') : '',
    acceptAdminPanel() ?? '',
    addressBlock(),
    h(
      'section',
      { class: 'panel', 'aria-labelledby': 'name-title' },
      h('h2', { class: 'panel-title', id: 'name-title' }, 'Nombre de usuario'),
      h('p', {}, 'Actual: ', h('strong', {}, s.username ? `@${s.username}` : 'Sin nombre')),
      h('div', { class: 'field' }, h('label', { for: 'username' }, 'Nuevo nombre'), input, h('p', { class: 'field-hint', id: 'username-help' }, 'Opcional. De 3 a 16 caracteres: a-z, 0-9 o _. Único.'), msg),
      h('div', { class: 'row' }, saveBtn, clearBtn),
    ),
  );
  update();
}
