import { defineConfig } from 'vite';

const DESCRIPTORES = '@parity/product-sdk-descriptors/';
const STUB = '\0descriptor-sin-usar:';

// @parity/product-sdk-chain-client importa de forma dinámica los metadatos de todas las cadenas.
// En el build se cambian los demás descriptores por un módulo vacío (references/app-sdk.md, *Vite*).
export function soloDescriptorDevnet() {
  return {
    name: 'solo-descriptor-devnet',
    apply: 'build',
    enforce: 'pre',
    resolveId(id) {
      if (!id.startsWith(DESCRIPTORES)) return null;
      const subruta = id.slice(DESCRIPTORES.length);
      return subruta === 'devnet-asset-hub' ? null : STUB + subruta;
    },
    load(id) {
      return id.startsWith(STUB) ? 'export {};' : null;
    },
  };
}

export default defineConfig({
  // Rutas relativas: el bundle se sirve desde un CID de Bulletin.
  base: './',
  plugins: [soloDescriptorDevnet()],
  // Los metadatos del devnet (~1 MB) son un solo módulo; el aviso no aporta.
  build: { chunkSizeWarningLimit: 1200 },
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'),
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
