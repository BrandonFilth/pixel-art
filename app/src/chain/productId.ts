// Id del Product (`mi-app.dot`) deducido de la URL (references/app-sdk.md, *Reglas del sandbox*).
// getProductContext() no existe en product-sdk-host 0.28.0, así que solo se usa el hostname.

import { FALLBACK_DOT_NAME } from '../config';

const SUFFIXES = ['.app.dev-dot.li', '.dev-dot.li', '.app.dot.li', '.dot.li', '.dot'];

export function productIdFromHost(hostname: string): string | null {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  for (const s of SUFFIXES) {
    if (h.endsWith(s)) {
      const label = h.slice(0, -s.length).split('.').pop();
      if (label && /^[a-z0-9-]{3,63}$/.test(label)) return `${label}.dot`;
    }
  }
  return null;
}

export function resolveProductId(hostname = location.hostname): string {
  return productIdFromHost(hostname) ?? FALLBACK_DOT_NAME;
}

export function labelOf(productId: string): string {
  return productId.replace(/\.dot$/, '');
}
