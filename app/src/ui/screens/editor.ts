// Editor 16×16 (Requisitos 3–6; design.md §5.9).

import { MAX_DRAWINGS_PER_USER } from '../../config';
import { reads } from '../../chain/reads';
import { History } from '../../domain/history';
import { DEFAULT_COLOR, PALETTE, TRANSPARENT } from '../../domain/palette';
import { countDiff, emptyCells, pack, SIZE, unpack } from '../../domain/pixels';
import { quantizeRgba } from '../../domain/quantize';
import { utf8Bytes, validateTitle } from '../../domain/validation';
import { imageToRgba16, paintCells } from '../../editor/render';
import { store } from '../../state/store';
import { createDrawingAction, updateDrawingAction } from '../../tx/actions';
import { runTx } from '../../tx/txService';
import { banner, confirmDialog, errorBlock, loading } from '../components';
import { h } from '../dom';
import { icon } from '../icons';
import { setLeaveGuard } from '../router';

type Tool = 'hand' | 'brush' | 'eraser' | 'picker';
const ZOOMS = [1, 1.5, 2, 3, 4];
const TOOL_NAMES: Record<Tool, string> = { hand: 'Mano', brush: 'Pincel', eraser: 'Borrador', picker: 'Cuentagotas' };
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const IMPORT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function editorScreen(main: HTMLElement, id?: number): () => void {
  let disposed = false;
  const cleanup = (): void => {
    disposed = true;
    setLeaveGuard(null);
    window.removeEventListener('resize', onResize);
    unsub();
  };
  const onResize = (): void => draw();
  let unsub: () => void = () => {};

  const start = async (): Promise<void> => {
    main.append(loading('Cargando editor…'));
    let base = emptyCells();
    let title = '';
    if (id) {
      try {
        const d = await reads.getDrawing(BigInt(id));
        if (disposed) return;
        const me = store.get().me;
        if (!me || d.owner !== me.h160 || store.get().isBlacklisted) {
          location.hash = `#/dibujo/${id}`;
          return;
        }
        base = unpack(d.pixels);
        title = d.title;
      } catch (e) {
        if (disposed) return;
        main.replaceChildren(errorBlock('No se pudo cargar el dibujo. Puede que no exista o que la red no responda.', () => location.reload()));
        console.warn(e);
        return;
      }
    }
    if (disposed) return;
    main.replaceChildren();
    build(base, title);
  };

  // ---- Estado ----
  let cells = emptyCells();
  let baseCells = emptyCells();
  let baseTitle = '';
  let tool: Tool = 'brush';
  let color = DEFAULT_COLOR;
  let zoomIdx = 0;
  let showGrid = true;
  let cursor = 0;
  const history = new History(100);

  // ---- Nodos ----
  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let titleInput: HTMLInputElement;
  let titleCount: HTMLSpanElement;
  let titleError: HTMLParagraphElement;
  let changedBadge: HTMLSpanElement;
  let countBox: HTMLSpanElement;
  let saveBtn: HTMLButtonElement;
  let saveHint: HTMLParagraphElement;
  let live: HTMLParagraphElement;
  let undoBtn: HTMLButtonElement;
  let redoBtn: HTMLButtonElement;
  const toolBtns = new Map<Tool, HTMLButtonElement>();
  const swatches = new Map<number, HTMLInputElement>();
  let gridBtn: HTMLButtonElement;

  function cellPx(): number {
    const avail = Math.min((wrap?.clientWidth || 340) - 6, 352);
    return Math.max(8, Math.floor(avail / SIZE)) * ZOOMS[zoomIdx]!;
  }

  function draw(): void {
    if (!canvas) return;
    const cell = cellPx();
    const dpr = window.devicePixelRatio || 1;
    const css = cell * SIZE;
    canvas.style.width = `${css}px`;
    canvas.style.height = `${css}px`;
    canvas.width = Math.round(css * dpr);
    canvas.height = Math.round(css * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintCells(ctx, cells, cell, { grid: showGrid });
    if (document.activeElement === canvas) {
      const x = (cursor % SIZE) * cell;
      const y = Math.floor(cursor / SIZE) * cell;
      ctx.setLineDash([3, 2]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000';
      ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.setLineDash([]);
    }
  }

  function dirty(): boolean {
    return countDiff(cells, baseCells) > 0 || titleInput.value.trim() !== baseTitle;
  }

  function refreshUi(): void {
    const changed = countDiff(cells, baseCells);
    changedBadge.textContent = String(changed);
    const s = store.get();
    countBox.textContent = `${s.myCount ?? '—'}/${MAX_DRAWINGS_PER_USER}`;
    const t = validateTitle(titleInput.value);
    const bytes = utf8Bytes(titleInput.value.trim());
    titleCount.textContent = `${bytes}/32 bytes`;
    const showTitleErr = !t.ok && titleInput.dataset.touched === '1';
    titleError.textContent = showTitleErr && !t.ok ? t.message : '';
    titleInput.setAttribute('aria-invalid', showTitleErr ? 'true' : 'false');

    let reason = '';
    if (s.isBlacklisted) reason = 'Tu cuenta está bloqueada: no puedes guardar.';
    else if (s.session !== 'connected') reason = 'Conecta tu cuenta (o reconecta con el Host) para guardar.';
    else if (!id && (s.myCount ?? 0) >= MAX_DRAWINGS_PER_USER) reason = 'Llegaste al límite de 30 dibujos. Borra uno para crear otro.';
    else if (!dirty()) reason = 'Haz algún cambio para guardar.';
    else if (!t.ok) reason = t.message;
    else if (s.txBusy) reason = 'Hay otra transacción en curso.';
    saveBtn.disabled = reason !== '';
    saveHint.textContent = reason;
    undoBtn.disabled = !history.canUndo;
    redoBtn.disabled = !history.canRedo;
    for (const [k, b] of toolBtns) b.setAttribute('aria-pressed', String(k === tool));
    gridBtn.setAttribute('aria-pressed', String(showGrid));
    wrap.classList.toggle('is-hand', tool === 'hand');
    setLeaveGuard(dirty() ? () => !dirty() : null, () =>
      confirmDialog('SALIR SIN GUARDAR', 'Tienes cambios sin guardar. ¿Salir sin guardar?', 'Salir sin guardar', true),
    );
  }

  function announce(i: number): void {
    const name = PALETTE[cells[i]!]?.name ?? '';
    live.textContent = `Fila ${Math.floor(i / SIZE) + 1}, columna ${(i % SIZE) + 1}: ${name}`;
  }

  function setColor(i: number): void {
    color = i;
    const sw = swatches.get(i);
    if (sw) sw.checked = true;
  }

  function apply(i: number): boolean {
    if (tool === 'picker') {
      const v = cells[i]!;
      if (v === TRANSPARENT) tool = 'eraser';
      else {
        setColor(v);
        tool = 'brush';
      }
      refreshUi();
      return false;
    }
    if (tool === 'hand') return false;
    const v = tool === 'eraser' ? TRANSPARENT : color;
    if (cells[i] === v) return false;
    cells[i] = v;
    return true;
  }

  function line(a: number, b: number): number[] {
    let x0 = a % SIZE, y0 = Math.floor(a / SIZE);
    const x1 = b % SIZE, y1 = Math.floor(b / SIZE);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const out: number[] = [];
    for (;;) {
      out.push(y0 * SIZE + x0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return out;
  }

  function commit(fn: () => boolean): void {
    const before = cells.slice();
    if (fn()) {
      history.push(before);
      draw();
      refreshUi();
    }
  }

  function cellAt(e: PointerEvent): number | null {
    const r = canvas.getBoundingClientRect();
    const cell = r.width / SIZE;
    const x = Math.floor((e.clientX - r.left) / cell);
    const y = Math.floor((e.clientY - r.top) / cell);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
    return y * SIZE + x;
  }

  function attachPointer(): void {
    let drawing = false;
    let last: number | null = null;
    let stroke: Uint8Array | null = null;
    let changedInStroke = false;
    let panStart: { x: number; y: number; l: number; t: number } | null = null;

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      if (tool === 'hand') {
        panStart = { x: e.clientX, y: e.clientY, l: wrap.scrollLeft, t: wrap.scrollTop };
        return;
      }
      const i = cellAt(e);
      if (i == null) return;
      cursor = i;
      if (tool === 'picker') {
        apply(i);
        return;
      }
      drawing = true;
      stroke = cells.slice();
      changedInStroke = apply(i);
      last = i;
      draw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (panStart) {
        wrap.scrollLeft = panStart.l - (e.clientX - panStart.x);
        wrap.scrollTop = panStart.t - (e.clientY - panStart.y);
        return;
      }
      if (!drawing) return;
      const i = cellAt(e);
      if (i == null || i === last) return;
      for (const j of line(last ?? i, i)) changedInStroke = apply(j) || changedInStroke;
      last = i;
      draw();
    });
    const end = (): void => {
      panStart = null;
      if (!drawing) return;
      drawing = false;
      if (changedInStroke && stroke) history.push(stroke);
      stroke = null;
      last = null;
      refreshUi();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  function setZoom(next: number): void {
    zoomIdx = Math.min(ZOOMS.length - 1, Math.max(0, next));
    draw();
  }

  function onKey(e: KeyboardEvent): void {
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (k === 'z' || k === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
      return;
    }
    if (ctrl && (k === 'y' || k === 'Y')) {
      e.preventDefault();
      doRedo();
      return;
    }
    if (ctrl || e.altKey) return;
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -SIZE, ArrowDown: SIZE };
    if (k in moves) {
      e.preventDefault();
      if (tool === 'hand') {
        const step = cellPx();
        if (k === 'ArrowLeft') wrap.scrollLeft -= step;
        if (k === 'ArrowRight') wrap.scrollLeft += step;
        if (k === 'ArrowUp') wrap.scrollTop -= step;
        if (k === 'ArrowDown') wrap.scrollTop += step;
        return;
      }
      const x = cursor % SIZE, y = Math.floor(cursor / SIZE);
      const d = moves[k]!;
      if ((d === -1 && x === 0) || (d === 1 && x === SIZE - 1) || (d < -1 && y === 0) || (d > 1 && y === SIZE - 1)) return;
      cursor += d;
      draw();
      announce(cursor);
      return;
    }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      commit(() => apply(cursor));
      announce(cursor);
      return;
    }
    const shortcuts: Record<string, () => void> = {
      b: () => selectTool('brush'),
      e: () => selectTool('eraser'),
      i: () => selectTool('picker'),
      h: () => selectTool('hand'),
      g: () => toggleGrid(),
      '+': () => setZoom(zoomIdx + 1),
      '-': () => setZoom(zoomIdx - 1),
      '0': () => centerView(),
    };
    const f = shortcuts[k.toLowerCase()];
    if (f) {
      e.preventDefault();
      f();
    }
  }

  function selectTool(t: Tool): void {
    tool = t;
    refreshUi();
  }
  function toggleGrid(): void {
    showGrid = !showGrid;
    draw();
    refreshUi();
  }
  function centerView(): void {
    zoomIdx = 0;
    draw();
    wrap.scrollLeft = 0;
    wrap.scrollTop = 0;
  }
  function doUndo(): void {
    const prev = history.undo(cells);
    if (prev) {
      cells = prev;
      draw();
      refreshUi();
    }
  }
  function doRedo(): void {
    const next = history.redo(cells);
    if (next) {
      cells = next;
      draw();
      refreshUi();
    }
  }
  async function doClear(): Promise<void> {
    if (!cells.some((v) => v !== 0)) return;
    if (!(await confirmDialog('LIMPIAR LIENZO', '¿Borrar todos los píxeles del lienzo? Puedes deshacerlo.', 'Limpiar', true))) return;
    commit(() => {
      cells = emptyCells();
      return true;
    });
  }

  async function doImport(file: File, msg: HTMLElement): Promise<void> {
    msg.replaceChildren();
    if (!IMPORT_TYPES.includes(file.type)) {
      msg.append(banner('error', 'No se pudo importar la imagen: tipo no permitido (usa PNG, JPEG, WebP o GIF).'));
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      msg.append(banner('error', 'No se pudo importar la imagen: pesa más de 5 MB.'));
      return;
    }
    try {
      const rgba = await imageToRgba16(file);
      const q = quantizeRgba(rgba);
      commit(() => {
        cells = q;
        return true;
      });
      msg.append(banner('ok', 'Imagen importada a 16 × 16 con la paleta. Puedes deshacerlo.'));
    } catch (e) {
      console.info('[importar]', e);
      msg.append(banner('error', 'No se pudo importar la imagen: no se pudo leer.'));
    }
  }

  async function save(): Promise<void> {
    const t = validateTitle(titleInput.value);
    if (!t.ok) return;
    const title = titleInput.value.trim();
    const words = pack(cells);
    try {
      const action = id
        ? await updateDrawingAction(BigInt(id), title, words)
        : await createDrawingAction(title, words);
      // Al finalizar se navega: quitar la guarda para no pedir confirmación.
      const origDone = action.onDone;
      action.onDone = () => {
        baseCells = cells.slice();
        baseTitle = title;
        setLeaveGuard(null);
        origDone?.();
      };
      await runTx(action);
    } catch (e) {
      console.warn('[guardar]', e);
      saveHint.textContent = 'No se pudo preparar la transacción. Reintenta.';
    }
  }

  function toolButton(t: Tool, ic: string, key: string): HTMLButtonElement {
    const b = h(
      'button',
      { class: 'icon-btn', type: 'button', 'aria-label': `${TOOL_NAMES[t]} (${key})`, title: `${TOOL_NAMES[t]} (${key})`, 'aria-pressed': 'false', onclick: () => selectTool(t) },
      icon(ic),
    );
    toolBtns.set(t, b);
    return b;
  }

  function build(base: Uint8Array, title: string): void {
    baseCells = base.slice();
    cells = base.slice();
    baseTitle = title;

    const fileInput = h('input', { type: 'file', accept: IMPORT_TYPES.join(','), class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true' });
    const importMsg = h('div', { 'aria-live': 'polite' });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (f) void doImport(f, importMsg);
      fileInput.value = '';
    });

    undoBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Deshacer (Ctrl+Z)', title: 'Deshacer (Ctrl+Z)', onclick: doUndo }, icon('undo'));
    redoBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Rehacer (Ctrl+Y)', title: 'Rehacer (Ctrl+Y)', onclick: doRedo }, icon('redo'));

    const toolbar = h(
      'div',
      { class: 'toolbar', role: 'toolbar', 'aria-label': 'Herramientas' },
      toolButton('hand', 'hand', 'H'),
      toolButton('brush', 'brush', 'B'),
      toolButton('eraser', 'eraser', 'E'),
      toolButton('picker', 'picker', 'I'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Importar imagen', title: 'Importar imagen', onclick: () => fileInput.click() }, icon('image')),
      h('span', { class: 'sep', 'aria-hidden': 'true' }),
      undoBtn,
      redoBtn,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Limpiar lienzo', title: 'Limpiar lienzo', onclick: () => void doClear() }, icon('trash')),
    );

    canvas = h('canvas', {
      tabindex: '0',
      role: 'application',
      'aria-label': 'Lienzo de 16 por 16. Flechas para moverte, Enter o Espacio para aplicar la herramienta.',
      'aria-describedby': 'editor-keys',
    });
    canvas.addEventListener('keydown', onKey);
    canvas.addEventListener('focus', draw);
    canvas.addEventListener('blur', draw);
    wrap = h('div', { class: 'canvas-wrap' }, canvas);

    gridBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cuadrícula (G)', title: 'Cuadrícula (G)', 'aria-pressed': 'true', onclick: toggleGrid }, icon('grid'));
    const zoomCol = h(
      'div',
      { class: 'zoom-col', role: 'group', 'aria-label': 'Vista' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Acercar (+)', title: 'Acercar (+)', onclick: () => setZoom(zoomIdx + 1) }, icon('plus')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Alejar (-)', title: 'Alejar (-)', onclick: () => setZoom(zoomIdx - 1) }, icon('minus')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Centrar (0)', title: 'Centrar (0)', onclick: centerView }, icon('center')),
      gridBtn,
    );

    const palette = h('fieldset', { class: 'palette', role: 'radiogroup', 'aria-label': 'Color' }, h('legend', { class: 'visually-hidden' }, 'Color'));
    for (const c of PALETTE) {
      if (!c.hex) continue;
      const input = h('input', { type: 'radio', name: 'color', value: String(c.index), 'aria-label': c.name, checked: c.index === color });
      input.addEventListener('change', () => {
        color = c.index;
        if (tool !== 'brush') selectTool('brush');
      });
      swatches.set(c.index, input);
      const sw = h('span', { 'aria-hidden': 'true' });
      sw.style.background = c.hex;
      palette.append(h('label', { class: 'swatch', title: c.name }, input, sw));
    }

    titleInput = h('input', { class: 'input', id: 'title', type: 'text', value: title, maxlength: '64', autocomplete: 'off', 'aria-describedby': 'title-count title-error', required: true });
    titleCount = h('span', { id: 'title-count', class: 'field-hint' });
    titleError = h('p', { id: 'title-error', class: 'field-error', 'aria-live': 'polite' });
    titleInput.addEventListener('input', () => refreshUi());
    titleInput.addEventListener('blur', () => {
      titleInput.dataset.touched = '1';
      refreshUi();
    });

    changedBadge = h('span', { class: 'badge', 'aria-live': 'polite' }, '0');
    countBox = h('span', { class: 'value-box' });
    saveBtn = h('button', { class: 'btn btn--primary btn--block', type: 'button', onclick: () => void save() }, id ? 'Guardar cambios' : 'Guardar dibujo', icon('pencil'));
    saveHint = h('p', { class: 'field-hint', 'aria-live': 'polite' });
    live = h('p', { class: 'cursor-info', 'aria-live': 'polite' });

    const s = store.get();
    main.append(
      h('h1', {}, id ? `Editar dibujo #${id}` : 'Nuevo dibujo'),
      s.isBlacklisted ? banner('error', 'Tu cuenta está bloqueada. Puedes mirar el editor, pero no guardar.') : '',
      toolbar,
      fileInput,
      importMsg,
      h('div', { class: 'stage' }, zoomCol, wrap),
      live,
      h('p', { id: 'editor-keys', class: 'visually-hidden' }, 'Atajos: B pincel, E borrador, I cuentagotas, H mano, G cuadrícula, más y menos zoom, 0 centrar, Control Z deshacer, Control Y rehacer.'),
      palette,
      h('div', { class: 'field' }, h('label', { for: 'title' }, 'Título'), titleInput, titleCount, titleError),
      h(
        'div',
        { class: 'sheet' },
        h('div', { class: 'sheet-row' }, h('span', { class: 'label' }, 'Píxeles cambiados'), changedBadge),
        h('div', { class: 'sheet-row' }, h('span', { class: 'label' }, 'Tus dibujos'), countBox),
        saveBtn,
        saveHint,
      ),
    );

    attachPointer();
    window.addEventListener('resize', onResize);
    unsub = store.subscribe((n, p) => {
      if (n.txBusy !== p.txBusy || n.myCount !== p.myCount || n.session !== p.session || n.isBlacklisted !== p.isBlacklisted) refreshUi();
    });
    requestAnimationFrame(() => {
      draw();
      refreshUi();
    });
  }

  void start();
  return cleanup;
}
