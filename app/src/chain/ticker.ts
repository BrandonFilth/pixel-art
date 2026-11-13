import { store } from '../state/store';
import { createBlockTicker } from './blockNumber';
import { rpc } from './reads';

export const blockTicker = createBlockTicker(rpc, (n) => store.set({ block: n }));
