// Config de `pad` para la publicación final con manifest (references/publicar.md, §2 variante y §4).
// `domain` siempre desde APP_DOT (nombre temporal); nunca el dominio propio.
export default {
  domain: process.env.APP_DOT,
  displayName: 'DOT PIXEL',
  description: 'Dibuja pixel art de 16×16 y guárdalo en Polkadot.',
  icon: { path: './assets/icono.png', format: 'png' },
  executables: [{ kind: 'app', path: './dist', appVersion: [1, 0, 0] }],
};
