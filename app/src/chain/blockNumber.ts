// Número de bloque por ETH-RPC cada 6 s (design.md §5.1; la skill no documenta una suscripción).

import { BLOCK_POLL_MS } from '../config';

export interface BlockSource {
  getBlockNumber(): Promise<bigint>;
}

export function createBlockTicker(src: BlockSource, onChange: (n: bigint | null) => void, interval = BLOCK_POLL_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let warned = false;

  async function tick(): Promise<void> {
    try {
      const n = await src.getBlockNumber();
      warned = false;
      onChange(n);
    } catch (e) {
      if (!warned) console.warn('[bloque]', e);
      warned = true;
      onChange(null);
    }
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    if (!running) return;
    timer = setTimeout(async () => {
      await tick();
      schedule();
    }, interval);
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      void tick().then(schedule);
    },
    stop(): void {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    /** Lee una vez ya y reinicia el temporizador. */
    async refreshNow(): Promise<void> {
      await tick();
      schedule();
    },
  };
}
