// Historial de deshacer/rehacer con instantáneas de 256 bytes (design.md §5.9).

export class History {
  private past: Uint8Array[] = [];
  private future: Uint8Array[] = [];
  constructor(private readonly max = 100) {}

  /** Guarda el estado previo a un cambio. Borra el futuro. */
  push(snapshot: Uint8Array): void {
    this.past.push(snapshot.slice());
    if (this.past.length > this.max) this.past.shift();
    this.future = [];
  }

  undo(current: Uint8Array): Uint8Array | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(current.slice());
    return prev;
  }

  redo(current: Uint8Array): Uint8Array | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current.slice());
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  clear(): void {
    this.past = [];
    this.future = [];
  }
}
