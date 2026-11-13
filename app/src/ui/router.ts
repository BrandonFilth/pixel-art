// Rutas con hash (base './'), guardas de acceso y de cambios sin guardar (design.md §5.7).

import { parsePositiveInt } from '../domain/validation';

export type RouteName = 'home' | 'editor' | 'mine' | 'gallery' | 'detail' | 'profile' | 'admin' | 'invalid';

export interface Route {
  name: RouteName;
  id?: number;
  page: number;
  raw: string;
}

export const PUBLIC_ROUTES: ReadonlySet<RouteName> = new Set(['home', 'invalid']);

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [path = '/', query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const pRaw = params.get('p');
  const page = pRaw == null ? 1 : (parsePositiveInt(pRaw) ?? 1);
  const parts = path.split('/').filter(Boolean);
  const [a, b] = parts;
  if (parts.length === 0) return { name: 'home', page, raw };
  if (a === 'editor' && parts.length === 1) return { name: 'editor', page, raw };
  if (a === 'editor' && parts.length === 2) {
    const id = parsePositiveInt(b);
    return id ? { name: 'editor', id, page, raw } : { name: 'invalid', page, raw };
  }
  if (a === 'dibujo' && parts.length === 2) {
    const id = parsePositiveInt(b);
    return id ? { name: 'detail', id, page, raw } : { name: 'invalid', page, raw };
  }
  if (parts.length === 1) {
    if (a === 'mis-dibujos') return { name: 'mine', page, raw };
    if (a === 'galeria') return { name: 'gallery', page, raw };
    if (a === 'perfil') return { name: 'profile', page, raw };
    if (a === 'admin') return { name: 'admin', page, raw };
  }
  return { name: 'invalid', page, raw };
}

// ---- Guarda de cambios sin guardar ----
type LeaveGuard = () => boolean; // true = se puede salir
let guard: LeaveGuard | null = null;
let confirmLeave: (() => Promise<boolean>) | null = null;
let lastHash = '';
let suppress = false;

function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (guard && !guard()) e.preventDefault();
}

export function setLeaveGuard(g: LeaveGuard | null, confirm?: () => Promise<boolean>): void {
  guard = g;
  confirmLeave = confirm ?? null;
  if (g) window.addEventListener('beforeunload', onBeforeUnload);
  else window.removeEventListener('beforeunload', onBeforeUnload);
}

export function startRouter(render: (r: Route) => void): void {
  lastHash = location.hash || '#/';
  const handle = async (): Promise<void> => {
    if (suppress) {
      suppress = false;
      return;
    }
    const target = location.hash || '#/';
    if (guard && !guard() && target !== lastHash) {
      history.replaceState(null, '', lastHash);
      const ok = confirmLeave ? await confirmLeave() : true;
      if (!ok) return;
      setLeaveGuard(null);
      suppress = false;
      location.hash = target;
      return;
    }
    lastHash = target;
    render(parseRoute(target));
  };
  window.addEventListener('hashchange', () => void handle());
  void handle();
}

export function currentRoute(): Route {
  return parseRoute(location.hash);
}
