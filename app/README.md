# DOT PIXEL (app)

Polkadot Product: editor de pixel art de 16×16 que guarda los dibujos en el contrato `DotPixel`
(`0xdCb169dcFeAA2d121D740A66b7333b226Cd48e6e`, Products Devnet, chainId 420420417).
Spec: `../.kiro/specs/dot-pixel/`. Contrato: `../contracts/`.

## Comandos (solo pnpm)

```powershell
pnpm install
pnpm dev          # solo navegador normal: parte visual y lecturas por ETH-RPC
pnpm typecheck
pnpm test         # vitest --run
pnpm test:red     # lecturas reales del contrato desplegado
pnpm build
node ..\.agents\skills\polkadot-products-devnet\scripts\verificar-entorno.mjs .
```

`pnpm dev` con `?demo=0x…` en la URL simula una cuenta de solo lectura para revisar las pantallas
(no firma; no existe en el build). Conectar, firmar y PGAS solo funcionan con la app publicada en su
`.dot` y abierta desde el Host.

## Publicar (references/publicar.md)

Pruebas rápidas (sin manifest):

```powershell
function pad { $env:PAD_UPDATE_CHECK = '0'; pnpm dlx --ignore-scripts @polkadot-community-foundation/polkadot-app-deploy@0.22.1 @args }
pnpm build
$tmp = 'tmp' + (-join ((Get-Date -Format 'yyyyMMddHHmmss').ToCharArray() | ForEach-Object { [char](97 + [int]"$_") })) + '.dot'
pad .\dist $tmp --env devnet --js-merkle --no-manifest
```

Copiar el `CID: bafy…` final y pegarlo con **Resolve** en tu dominio desde `dotns.dot` en el Host.

Final con icono y manifest: igual pero `$env:APP_DOT = <nombre temporal>` y
`pad .\dist $env:APP_DOT --env devnet --js-merkle` (sin `--no-manifest`, sin tuberías); luego Resolve
con el CID y Custom Record `manifest` con el JSON de `Verified text[manifest]:`.

Bulletin borra el contenido a los ~14 días: volver a publicar solo para renovar o para una versión nueva.

## Hacerte admin desde la app

La cuenta del Product depende del dominio, así que esto se hace con el **dominio final**:

1. Abre la app en el Host → **Perfil** → «Copiar mi dirección».
2. En Remix, con la cuenta MetaMask admin, `transferOwnership(<esa dirección>)`.
3. En la app, «Aceptar rol de admin». Aparece la pestaña **Admin**.
