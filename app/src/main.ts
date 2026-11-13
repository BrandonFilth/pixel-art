import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { APP_NAME } from './config';
import { connect, detectHost, refreshAccount, requestGas } from './chain/session';
import { blockTicker } from './chain/ticker';
import { store, type AppState } from './state/store';
import { banner, lockedScreen } from './ui/components';
import { clear, fmtBlock, h } from './ui/dom';
import { icon } from './ui/icons';
import { PUBLIC_ROUTES, currentRoute, startRouter, type Route, type RouteName } from './ui/router';
import { mountTxModal } from './ui/txModal';
import { adminScreen } from './ui/screens/admin';
import { detailScreen } from './ui/screens/detail';
import { editorScreen } from './ui/screens/editor';
import { homeScreen } from './ui/screens/home';
import { galleryScreen, mineScreen } from './ui/screens/lists';
import { profileScreen } from './ui/screens/profile';

const root = document.getElementById('app')!;

// ---------- Esqueleto ----------
const blockText = h('span', {}, '—');
const blockChip = h('div', { class: 'block-chip', role: 'status', 'aria-label': 'Bloque actual: cargando' }, icon('cube'), blockText);
const header = h(
  'header',
  { class: 'app-header' },
  h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-icon' }, icon('logo')), APP_NAME),
  blockChip,
);
const nav = h('nav', { class: 'app-nav', 'aria-label': 'Secciones' });
const banners = h('div', { class: 'banners' });
const main = h('main', { id: 'main', tabindex: '-1' });
// La navegación va al final del DOM: se ve fija abajo y el orden de tabulación coincide con lo visual.
root.append(h('a', { class: 'skip-link', href: '#main', onclick: (e: Event) => { e.preventDefault(); main.focus(); } }, 'Saltar al contenido'), header, banners, main, nav);

const NAV: Array<{ name: RouteName; href: string; label: string; icon: string; admin?: boolean }> = [
  { name: 'home', href: '#/', label: 'Inicio', icon: 'home' },
  { name: 'editor', href: '#/editor', label: 'Editor', icon: 'brush' },
  { name: 'mine', href: '#/mis-dibujos', label: 'Mis dibujos', icon: 'image' },
  { name: 'gallery', href: '#/galeria', label: 'Galería', icon: 'grid' },
  { name: 'profile', href: '#/perfil', label: 'Perfil', icon: 'user' },
  { name: 'admin', href: '#/admin', label: 'Admin', icon: 'shield', admin: true },
];

function renderNav(route: Route): void {
  const s = store.get();
  clear(nav);
  for (const item of NAV) {
    if (item.admin && !s.isAdmin && !s.isPendingAdmin) continue;
    const locked = !s.me && !PUBLIC_ROUTES.has(item.name);
    const current = route.name === item.name;
    nav.append(
      h(
        'a',
        { href: item.href, 'aria-current': current ? 'page' : null, 'aria-label': locked ? `${item.label} (necesita cuenta)` : null },
        icon(item.icon),
        h('span', {}, item.label),
        locked ? icon('lock', 'icon lock') : null,
      ),
    );
  }
}

function renderBanners(): void {
  const s = store.get();
  clear(banners);
  if (s.session === 'outsideHost')
    banners.append(banner('warn', h('p', {}, 'Abre esta app dentro de Polkadot Desktop o de la Polkadot App para conectar tu cuenta. Fuera del Host solo puedes ver el inicio.')));
  if (s.session === 'error')
    banners.append(
      banner(
        'error',
        h('p', {}, 'No se pudo conectar con el Host.'),
        h('p', { class: 'field-hint' }, s.sessionError ?? ''),
        h('button', { class: 'btn btn--sm', type: 'button', onclick: () => void connect() }, 'Reintentar'),
      ),
    );
  if (s.session === 'hostLost')
    banners.append(
      banner(
        'error',
        h('p', {}, 'Se perdió la conexión con el Host.'),
        h('button', { class: 'btn btn--sm', type: 'button', onclick: () => void connect() }, 'Reconectar'),
      ),
    );
  if (s.me && s.isBlacklisted)
    banners.append(banner('error', h('p', {}, 'Tu cuenta está en la lista negra. Solo puedes ver y borrar tus dibujos.')));
  if (s.me && s.session === 'connected' && (s.gas === 'Rejected' || s.gas === 'NotAvailable' || s.gas === 'error'))
    banners.append(
      banner(
        'warn',
        h('p', {}, 'El Host no asignó gas (PGAS). Sin gas no podrás guardar.'),
        h('button', { class: 'btn btn--sm', type: 'button', onclick: () => void requestGas() }, 'Pedir gas otra vez'),
      ),
    );
  if (s.isPendingAdmin)
    banners.append(banner('info', h('p', {}, 'Tienes una invitación de admin. '), h('a', { href: '#/perfil' }, 'Aceptar rol de admin')));
}

// ---------- Pantallas ----------
let cleanup: (() => void) | null = null;
let currentRouteName: RouteName = 'home';

function render(route: Route): void {
  cleanup?.();
  cleanup = null;
  currentRouteName = route.name;
  renderNav(route);
  renderBanners();
  clear(main);
  const s = store.get();
  if (!PUBLIC_ROUTES.has(route.name) && !s.me) {
    main.append(lockedScreen(() => void connect()));
    document.title = `${APP_NAME} · Conecta tu cuenta`;
    return;
  }
  const titles: Record<RouteName, string> = {
    home: 'Inicio',
    editor: 'Editor',
    mine: 'Mis dibujos',
    gallery: 'Galería',
    detail: 'Dibujo',
    profile: 'Perfil',
    admin: 'Admin',
    invalid: 'Ruta no válida',
  };
  document.title = `${APP_NAME} · ${titles[route.name]}`;
  switch (route.name) {
    case 'home':
      homeScreen(main);
      break;
    case 'editor':
      cleanup = editorScreen(main, route.id);
      break;
    case 'mine':
      mineScreen(main, route.page);
      break;
    case 'gallery':
      galleryScreen(main, route.page);
      break;
    case 'detail':
      detailScreen(main, route.id!);
      break;
    case 'profile':
      profileScreen(main);
      break;
    case 'admin':
      adminScreen(main, route.page);
      break;
    default:
      main.append(h('h1', {}, 'Ruta no válida'), h('p', {}, 'Esa dirección no existe en la app.'), h('a', { class: 'btn', href: '#/' }, 'Ir al inicio'));
  }
}

function needsRerender(n: AppState, p: AppState): boolean {
  return (
    n.session !== p.session ||
    n.me?.h160 !== p.me?.h160 ||
    n.isAdmin !== p.isAdmin ||
    n.isPendingAdmin !== p.isPendingAdmin ||
    n.isBlacklisted !== p.isBlacklisted ||
    n.dataVersion !== p.dataVersion ||
    n.username !== p.username ||
    n.gas !== p.gas
  );
}

store.subscribe((n, p) => {
  if (n.block !== p.block) {
    blockText.textContent = n.block == null ? '—' : `#${fmtBlock(n.block)}`;
    blockChip.setAttribute('aria-label', n.block == null ? 'Bloque actual: sin datos' : `Bloque actual ${n.block}`);
  }
  if (n.txBusy !== p.txBusy && currentRouteName !== 'editor') {
    // Deshabilita botones que firman mientras hay una transacción.
    main.querySelectorAll<HTMLButtonElement>('button.btn--primary, button.btn--danger').forEach((b) => {
      if (n.txBusy) b.dataset.txLock = b.disabled ? '0' : '1';
      if (n.txBusy) b.disabled = true;
      else if (b.dataset.txLock === '1') b.disabled = false;
    });
  }
  if (needsRerender(n, p)) {
    if (currentRouteName === 'editor') {
      // El editor se actualiza solo; solo se rehace si cambia la cuenta o la sesión deja de existir.
      if (n.me?.h160 !== p.me?.h160) render(currentRoute());
      else {
        renderNav(currentRoute());
        renderBanners();
      }
    } else render(currentRoute());
  } else if (n.totalDrawings !== p.totalDrawings || n.myCount !== p.myCount) {
    if (currentRouteName === 'home') render(currentRoute());
  }
});

// ---------- Inicio ----------
mountTxModal();
blockTicker.start();
document.addEventListener('visibilitychange', () => (document.hidden ? blockTicker.stop() : blockTicker.start()));
startRouter(render);
void (async () => {
  await detectHost();
  // Solo en `pnpm dev`: `?demo=0x…` simula una cuenta de solo lectura para revisar las pantallas en
  // un navegador normal (no firma nada; el bundle de producción no incluye este bloque).
  if (import.meta.env.DEV) {
    const demo = new URLSearchParams(location.search).get('demo');
    if (demo && /^0x[0-9a-fA-F]{40}$/.test(demo))
      store.set({ session: 'connected', gas: 'Allocated', me: { address: '(demo)', h160: demo.toLowerCase() as `0x${string}` } });
  }
  await refreshAccount().catch(() => undefined);
})();
