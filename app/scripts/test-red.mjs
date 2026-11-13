// Prueba de red (solo lectura) contra el contrato desplegado, como `test:red` de references/versiones.md.
// Comprueba chainId, constantes, lecturas paginadas y que getPixel() del contrato coincide con el
// empaquetado del frontend (nibble más significativo primero).

import { readFileSync } from 'node:fs';
import { createPublicClient, http } from 'viem';

const RPC = 'https://eth-rpc-testnet.polkadot.io';
const ADDRESS = '0xdCb169dcFeAA2d121D740A66b7333b226Cd48e6e';
const abi = JSON.parse(readFileSync(new URL('../src/contract/DotPixel.abi.json', import.meta.url), 'utf8'));
const rpc = createPublicClient({ transport: http(RPC, { timeout: 15_000 }) });
const call = (functionName, args = []) => rpc.readContract({ address: ADDRESS, abi, functionName, args });

let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✔' : '✘'} ${name}${extra ? `  ${extra}` : ''}`);
  if (!ok) fail++;
};

const chainId = await rpc.getChainId();
check('chainId 420420417', chainId === 420420417, String(chainId));
check('bloque', (await rpc.getBlockNumber()) > 0n);
check('MAX_DRAWINGS_PER_USER = 30', (await call('MAX_DRAWINGS_PER_USER')) === 30n);
check('MAX_PAGE_SIZE = 50', (await call('MAX_PAGE_SIZE')) === 50n);
check('MAX_TITLE_LENGTH = 32', (await call('MAX_TITLE_LENGTH')) === 32n);
const owner = await call('owner');
check('owner()', /^0x[0-9a-fA-F]{40}$/.test(owner), owner);
const total = await call('totalDrawings');
const [items, t2] = await call('getAllDrawings', [0n, 12n]);
check('getAllDrawings(0, 12)', t2 === total && items.length === Math.min(12, Number(total)), `total ${total}`);

// Empaquetado: el carácter hex i (de las 4 palabras concatenadas) es el píxel i.
const cells = Array.from({ length: 256 }, (_, i) => (i * 7 + 3) % 16);
const words = [0, 1, 2, 3].map((w) => '0x' + cells.slice(w * 64, w * 64 + 64).map((v) => v.toString(16)).join(''));
let okPixels = true;
for (const i of [0, 1, 15, 16, 63, 64, 127, 128, 200, 255]) {
  const v = Number(await call('getPixel', [words, BigInt(i)]));
  if (v !== cells[i]) okPixels = false;
}
check('getPixel() del contrato = empaquetado del frontend', okPixels);

process.exit(fail ? 1 : 0);
