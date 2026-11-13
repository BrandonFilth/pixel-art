import { APP_NAME, MAX_DRAWINGS_PER_USER } from '../../config';
import { connect } from '../../chain/session';
import { thumbCanvas } from '../../editor/render';
import { store } from '../../state/store';
import { h } from '../dom';
import { banner } from '../components';

// Corazón de muestra (índices de la paleta), estático en el bundle.
const SAMPLE = [
  '................',
  '................',
  '...5555...5555..',
  '..566665.566665.',
  '.56777766677776.',
  '.56788777777776.',
  '.56787777777776.',
  '.56777777777776.',
  '..567777777776..',
  '...5677777776...',
  '....56777776....',
  '.....567776.....',
  '......5676......',
  '.......56.......',
  '................',
  '................',
];

function sampleCells(): Uint8Array {
  const c = new Uint8Array(256);
  SAMPLE.forEach((row, y) => [...row].forEach((ch, x) => (c[y * 16 + x] = ch === '.' ? 0 : parseInt(ch, 16))));
  return c;
}

export function homeScreen(main: HTMLElement): void {
  const s = store.get();
  const art = thumbCanvas(sampleCells(), 'Corazón de pixel art de muestra', 160);
  art.className = 'hero-art';
  art.style.display = 'block';
  art.style.border = 'var(--border)';
  art.style.boxShadow = 'var(--shadow-hard)';

  const stats = h(
    'div',
    { class: 'stats' },
    h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Dibujos en la red'), h('span', { class: 'value-box' }, s.totalDrawings ?? '—')),
    s.me
      ? h(
          'div',
          { class: 'stat' },
          h('span', { class: 'label' }, 'Tus dibujos'),
          h('span', { class: 'value-box' }, `${s.myCount ?? '—'}/${MAX_DRAWINGS_PER_USER}`),
        )
      : h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Lienzo'), h('span', { class: 'value-box' }, '16×16')),
  );

  let cta: HTMLElement;
  if (s.session === 'outsideHost') {
    cta = banner(
      'warn',
      h('p', {}, h('strong', {}, 'Estás fuera del Host. ')),
      h('p', {}, 'Abre esta app dentro de Polkadot Desktop o de la Polkadot App para conectar tu cuenta y dibujar.'),
    );
  } else if (s.me) {
    cta = h('a', { class: 'btn btn--primary btn--block', href: '#/editor' }, 'Abrir editor');
  } else {
    cta = h(
      'button',
      { class: 'btn btn--primary btn--block', type: 'button', disabled: s.session === 'connecting' || s.session === 'checking', onclick: () => void connect() },
      s.session === 'connecting' ? 'Conectando…' : 'Conectar cuenta',
    );
  }

  main.append(
    h('h1', {}, APP_NAME),
    h('p', {}, 'Dibuja pixel art de 16 × 16 y guárdalo en Polkadot. Cada dibujo queda ligado a tu cuenta.'),
    art,
    stats,
    cta,
    h(
      'section',
      { class: 'panel' },
      h('h2', { class: 'panel-title' }, 'Cómo funciona'),
      h(
        'ol',
        {},
        h('li', {}, 'Conecta tu cuenta desde el Host.'),
        h('li', {}, 'Pinta en el lienzo con la paleta de 15 colores.'),
        h('li', {}, 'Guarda: simulamos, firmas y ves cada paso hasta que finaliza.'),
      ),
      h('p', { class: 'muted' }, `Guardar es gratis: solo pagas el gas con PGAS. Máximo ${MAX_DRAWINGS_PER_USER} dibujos por cuenta.`),
    ),
  );
}
