// Paginación "más reciente primero" sobre listas en orden de inserción (design.md §5.4).

export interface PageWindow {
  offset: number;
  limit: number;
  pages: number;
  page: number;
}

/** Página p (1-based) leída desde el final de una lista de `total` elementos. */
export function pageFromEnd(total: number, page: number, size: number): PageWindow {
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pages);
  const end = total - (p - 1) * size;
  const offset = Math.max(0, end - size);
  return { offset, limit: Math.max(0, end - offset), pages, page: p };
}

/** Ordena por id descendente y quita duplicados. */
export function newestFirst<T extends { id: bigint }>(items: readonly T[]): T[] {
  const seen = new Set<bigint>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}
