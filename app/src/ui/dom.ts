// Creación de nodos. Todo texto va con textContent: títulos y nombres vienen de la cadena
// y los escribe cualquiera (security-and-hardening, *XSS*). Nunca innerHTML con datos.

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
  append(el, ...children);
  return el;
}

export function append(el: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Copia texto. Si no hay portapapeles, selecciona el campo para Ctrl+C. */
export async function copyText(text: string, fallbackInput?: HTMLInputElement): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    console.info('[portapapeles]', e);
  }
  if (fallbackInput) {
    fallbackInput.focus();
    fallbackInput.select();
    try {
      if (document.execCommand('copy')) return true;
    } catch {
      /* sin soporte */
    }
  }
  return false;
}

export function fmtDate(sec: bigint): string {
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(sec) * 1000));
}

export function fmtBlock(n: bigint): string {
  return new Intl.NumberFormat('es').format(n);
}
