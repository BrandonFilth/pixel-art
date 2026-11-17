// Inicio: lienzo blanco animado con píxeles de colores al azar, título con profundidad y stats abajo.

import { APP_NAME, MAX_DRAWINGS_PER_USER } from '../../config';
import { connect } from '../../chain/session';
import { PALETTE } from '../../domain/palette';
import { store } from '../../state/store';
import { h } from '../dom';
import { icon } from '../icons';

const CELL = 22; // px CSS por cuadro
const GRID_COLOR = '#efeaf0';
// Colores de la paleta sin blanco ni el tono más claro (no se verían sobre blanco).
const COLORS = PALETTE.filter((c) => c.hex && c.index !== 4 && c.index !== 8).map((c) => c.hex!);

interface Lit {
  color: string;
  born: number;
  life: number;
}

/** Arranca la animación sobre `canvas`. Devuelve la función que la detiene. */
function animate(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lit = new Map<number, Lit>();
  let w = 0;
  let hgt = 0;
  let cols = 0;
  let rows = 0;
  let raf = 0;

  const resize = (): void => {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    w = r.width;
    hgt = r.height;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(hgt * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / CELL);
    rows = Math.ceil(hgt / CELL);
    for (const k of lit.keys()) if (k >= cols * rows) lit.delete(k);
    if (reduce) staticFrame();
  };

  const spawn = (now: number): void => {
    const i = Math.floor(Math.random() * cols * rows);
    if (lit.has(i)) return;
    lit.set(i, {
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      born: now,
      life: 1400 + Math.random() * 2600,
    });
  };

  const paint = (now: number): void => {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, hgt);
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= cols; x++) {
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, hgt);
    }
    for (let y = 0; y <= rows; y++) {
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(w, y * CELL + 0.5);
    }
    ctx.stroke();
    for (const [i, c] of lit) {
      let a = 0.85;
      if (!reduce) {
        const p = (now - c.born) / c.life;
        if (p >= 1) {
          lit.delete(i);
          continue;
        }
        // Se enciende rápido y se apaga despacio.
        a = (p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8) * 0.9;
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = c.color;
      ctx.fillRect((i % cols) * CELL + 1, Math.floor(i / cols) * CELL + 1, CELL - 1, CELL - 1);
    }
    ctx.globalAlpha = 1;
  };

  // Sin movimiento: un patrón fijo de píxeles encendidos.
  const staticFrame = (): void => {
    lit.clear();
    const n = Math.floor(cols * rows * 0.08);
    for (let k = 0; k < n; k++) spawn(0);
    paint(0);
  };

  const frame = (now: number): void => {
    const target = Math.max(8, Math.floor(cols * rows * 0.07));
    for (let k = 0; k < 3 && lit.size < target; k++) if (Math.random() < 0.6) spawn(now);
    paint(now);
    raf = requestAnimationFrame(frame);
  };

  const onVisibility = (): void => {
    cancelAnimationFrame(raf);
    if (!document.hidden && !reduce) raf = requestAnimationFrame(frame);
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  if (!reduce) raf = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export function homeScreen(main: HTMLElement): () => void {
  const s = store.get();
  const canvas = h('canvas', { class: 'hero-canvas', 'aria-hidden': 'true' });

  const totalEl = h('span', { class: 'value-box' });
  const mineEl = h('span', { class: 'value-box' });
  const sync = (): void => {
    const st = store.get();
    totalEl.textContent = st.totalDrawings == null ? '—' : String(st.totalDrawings);
    mineEl.textContent = st.me ? `${st.myCount ?? '—'}/${MAX_DRAWINGS_PER_USER}` : '—';
  };
  sync();

  const words = APP_NAME.split(' ');
  const showConnect = !s.me && s.session !== 'outsideHost';

  main.append(
    h(
      'section',
      { class: 'hero', 'aria-labelledby': 'hero-title' },
      canvas,
      h(
        'div',
        { class: 'hero-center' },
        h('h1', { class: 'hero-title', id: 'hero-title', 'aria-label': APP_NAME }, ...words.map((w) => h('span', { 'aria-hidden': 'true' }, w))),
        h('p', { class: 'hero-tagline' }, 'Pixel art de 16 × 16 en Polkadot'),
      ),
      h(
        'div',
        { class: 'hero-bottom' },
        h(
          'div',
          { class: 'stats' },
          h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Dibujos en la red'), totalEl),
          h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Tus dibujos'), mineEl),
        ),
        h('a', { class: 'btn btn--primary btn--block', href: '#/editor' }, icon('brush'), 'Abrir editor'),
        showConnect
          ? h(
              'button',
              { class: 'btn btn--block', type: 'button', disabled: s.session === 'connecting' || s.session === 'checking', onclick: () => void connect() },
              s.session === 'connecting' ? 'Conectando…' : 'Conectar cuenta',
            )
          : '',
      ),
    ),
  );

  const stop = animate(canvas);
  const unsub = store.subscribe((n, p) => {
    if (n.totalDrawings !== p.totalDrawings || n.myCount !== p.myCount || n.me !== p.me) sync();
  });
  return () => {
    stop();
    unsub();
  };
}
