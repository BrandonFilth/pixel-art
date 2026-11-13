// Configuración de DOT PIXEL (design.md §5.2).

declare const __BUILD_DATE__: string;

export const APP_NAME = 'DOT PIXEL';

/** Contrato desplegado con Remix (contracts/deployments.md). */
export const CONTRACT_ADDRESS = '0xdCb169dcFeAA2d121D740A66b7333b226Cd48e6e' as const;

export const CHAIN_ID = 420420417;
export const DERIVATION_INDEX = 0;
/** Pipeline 1 (AsPgas): la comisión sale de PGAS (references/app-sdk.md, *Pipelines*). */
export const TX_EXT_VERSION = 1;

export const ETH_RPC_URL = 'https://eth-rpc-testnet.polkadot.io';
export const BLOCKSCOUT_URL = 'https://blockscout-testnet.polkadot.io';
export const RPC_TIMEOUT_MS = 8_000;
export const TX_TIMEOUT_MS = 300_000;
export const HOST_TIMEOUT_MS = 30_000;

/** Pasarela del light client para el enlace de compartir (no verificado en devnet, design §12.7). */
export const LIGHT_CLIENT_GATEWAY = 'dot.li';
/** Último recurso para el id del Product si no se deduce del hostname. */
export const FALLBACK_DOT_NAME: string = (import.meta.env.VITE_APP_DOT as string | undefined) ?? 'dotpixel.dot';

export const PAGE_SIZE = 12;
export const BLOCK_POLL_MS = 6_000;
export const MAX_DRAWINGS_PER_USER = 30;
export const MAX_TITLE_BYTES = 32;

export const BUILD_DATE: string = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : 'dev';
