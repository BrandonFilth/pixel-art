# Diseño: DOT PIXEL

## 1. Visión general

DOT PIXEL tiene dos piezas. La primera es un contrato Solidity, `DotPixel`, desplegado una vez con
Remix + MetaMask en Products Devnet (Asset Hub 1000, chainId `420420417`, REVM). El contrato guarda
los dibujos de 16 × 16 (4 bits por píxel, 4 palabras de 256 bits), los nombres de usuario únicos, los
contadores, las listas paginables y la lista negra, y aplica todos los permisos con `msg.sender`. El
rol de admin sale de `Ownable2Step` de OpenZeppelin 5.6.1. La segunda pieza es una app estática en
Vite + TypeScript sin framework de UI, que corre dentro del Host. La app lee por ETH-RPC con viem
(con el Host como respaldo), simula cada escritura con `.query()` y la firma con `.tx()` desde la
cuenta del Product en el pipeline 1 (`txExtVersion: 1`, comisión en PGAS). Un único servicio de
transacciones con máquina de estados controla todas las firmas, una a la vez, y muestra el progreso en
un modal. Las pruebas del contrato se corren localmente con Foundry; el despliegue y la publicación
siguen exactamente `references/contratos.md` y `references/publicar.md` de la skill
`polkadot-products-devnet`.

Rutas de las referencias citadas: `.agents/skills/polkadot-products-devnet/` (`SKILL.md` y
`references/*.md`).

## 2. Stack tecnológico (fijo al aprobar este diseño)

| Pieza | Versión / valor | Fuente |
|---|---|---|
| Red | Products Devnet, Asset Hub 1000, chainId `420420417`, descriptor `devnet_asset_hub` | `references/red-devnet.md` |
| ETH-RPC (lecturas y bloque) | `https://eth-rpc-testnet.polkadot.io` | `references/red-devnet.md` |
| Solidity | `pragma solidity 0.8.28;`, sin optimizador, EVM `cancun` (la EVM por defecto de solc 0.8.28, que Remix usa con "EVM version: default") | `references/contratos.md`; la EVM por defecto es dato de solc, **no verificado** con la skill |
| OpenZeppelin | `@openzeppelin/contracts` 5.6.1 (`Ownable2Step`) | `references/contratos.md`, `references/versiones.md` |
| Despliegue | Remix + MetaMask (Injected Provider) | `references/contratos.md` |
| Pruebas del contrato | Foundry (`forge`), solc 0.8.28, `optimizer = false`, `evm_version = "cancun"` explícito (Foundry no usa la EVM por defecto de solc si se omite), OZ v5.6.1 y forge-std v1.17.0 por `forge install` | pedido del usuario; Foundry y forge-std no aparecen en la skill: **no verificado** con la skill |
| Node.js | ≥ 22.19 (recomendado 24 LTS) | `references/versiones.md` |
| Gestor | pnpm 12.6.0 (`devEngines`), solo pnpm | `SKILL.md`, *Reglas obligatorias* |
| `@parity/product-sdk` | 0.39.0 | `references/versiones.md` |
| `polkadot-api` | 3.2.1 | `references/versiones.md` |
| `@parity/product-sdk-descriptors` | `npm:@polkadot-community-foundation/product-sdk-descriptors@0.14.0-pcf.1` | `references/versiones.md` |
| `@parity/truapi` | 0.25.0 (overrides acotados `padre@versión>hijo`) | `references/versiones.md` |
| `viem` | 2.56.9 | `references/versiones.md` |
| `typescript` / `vite` / `vitest` | 5.9.3 / 8.3.1 / 5.0.3 | `references/versiones.md` |
| UI | TypeScript sin framework (DOM + `<canvas>`) | decisión §5.1 |
| Fuentes | Silkscreen (pixel) y Atkinson Hyperlegible (cuerpo), archivos en el bundle, licencia OFL 1.1 | decisión §8.2 |
| Publicación | `pad` 0.22.1 (`@polkadot-community-foundation/polkadot-app-deploy`), `--env devnet --js-merkle` | `references/publicar.md` |

No se agrega ninguna otra dependencia. Si hiciera falta, `pnpm add <pkg>@<versión> --save-exact` y
probarla en el Host antes de darla por buena (`references/versiones.md`).

## 3. Arquitectura

```text
┌─────────────────────────── Host (Polkadot App / Desktop) ───────────────────────────┐
│  app (bundle estático desde Bulletin, base './')                                    │
│   ui/screens ──► state/store ◄── chain/reads ──► viem ──► ETH-RPC (lecturas, bloque)│
│        │                              └──respaldo──► contract.fn.query() (Host)     │
│        └──► tx/txService (máquina de estados, una firma a la vez)                   │
│               ├─ contract.fn.query({origin})   simulación                           │
│               └─ contract.fn.tx({waitFor:'finalized'}) firmante txExtVersion 1      │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                   │ TrUAPI
                       Asset Hub 1000 (REVM) ── contrato DotPixel
```

Estructura del repositorio (raíz `c:/Users/brand/Downloads/pixel`):

```text
contracts/                    Foundry (solo pruebas)
  foundry.toml
  src/DotPixel.sol            el mismo archivo que se pega en Remix
  test/DotPixel.t.sol         pruebas generales
  test/DotPixelBlacklist.t.sol
  test/DotPixelUsername.t.sol
  test/DotPixelPagination.t.sol
  lib/openzeppelin-contracts  (forge install, tag v5.6.1)
app/
  package.json  pnpm-workspace.yaml  vite.config.js  tsconfig.json  index.html
  polkadot-app-deploy.config.mjs  assets/icono.png (512×512)
  src/
    main.ts  config.ts
    contract/dotPixel.abi.json  contract/abi.ts
    chain/session.ts  chain/reads.ts  chain/blockNumber.ts  chain/productId.ts
    tx/txMachine.ts  tx/txService.ts  tx/errors.ts  tx/actions.ts
    domain/pixels.ts  domain/palette.ts  domain/validation.ts  domain/quantize.ts  domain/history.ts
    state/store.ts  state/cache.ts
    editor/canvasView.ts  editor/tools.ts  editor/imageImport.ts  editor/exportPng.ts
    ui/router.ts  ui/dom.ts  ui/components/*.ts  ui/screens/*.ts
    styles/tokens.css  styles/base.css  styles/components.css
    assets/fonts/*.ttf  assets/fonts/OFL.txt
  test/*.test.ts              vitest
```

## 4. Contrato `DotPixel` (desplegado; fuente de verdad)

> **Alineación (2026-11-12).** El contrato ya está implementado, probado (49 tests de Foundry) y
> **desplegado** en `0xdCb169dcFeAA2d121D740A66b7333b226Cd48e6e` (Products Devnet, chainId
> `420420417`, bloque 15,680,804; ver `contracts/deployments.md`). No se modifica. Esta sección
> describe su interfaz real; si algo de esta spec contradice `contracts/src/DotPixel.sol`,
> `contracts/abi/DotPixel.json` o `contracts/DECISIONS.md`, ganan esos archivos.

### 4.1 Decisiones

- **Registro propio, sin ERC-721.** Soulbound: el dueño se fija en `createDrawing` (`msg.sender`) y no
  existe ninguna función de transferencia ni de aprobación.
- **Admin = `owner()` de `Ownable2Step`** (OZ 5.6.1). Deployer = admin inicial. Traspaso en dos pasos:
  `transferOwnership(nuevo)` + `acceptOwnership()` del pendiente. `transferOwnership(address(0))`
  cancela. `renounceOwnership()` revierte siempre (`RenounceOwnershipDisabled`).
- **Invariante:** el admin actual nunca está en la lista negra. No se puede proponer como admin una
  cuenta bloqueada (`Blacklisted`) y el pendiente bloqueado no puede aceptar (`Blacklisted`). El
  pendiente sí se puede bloquear mientras no acepte.
- **Errores personalizados** (tabla en §5.6, mensajes de `contracts/DECISIONS.md` §10).
- **Sin `payable`** ni llamadas externas: todo es gratis salvo el gas.

### 4.2 Datos

```solidity
struct Drawing { address owner; uint64 createdAt; uint64 updatedAt; string title; bytes32[4] pixels; }
struct DrawingView { uint256 id; address owner; bool ownerBlacklisted; uint64 createdAt;
                     uint64 updatedAt; string title; bytes32[4] pixels; }
uint256 public nextId = 1;            // ids desde 1, monótono, no se reutiliza
mapping(uint256 => Drawing) _drawings;
uint256[] _allIds;                    // lista global (swap-and-pop)
mapping(address => uint256[]) _ownerIds; // lista por dueño (swap-and-pop)
mapping(address => string) _usernames; mapping(bytes32 => address) _usernameOwner;
EnumerableSet.AddressSet _blacklist;
```

- **Píxeles:** `bytes32[4]`; píxel `i` (0..255, fila por fila, `x = i % 16`, `y = i / 16`) en la palabra
  `i / 64`, nibble `i % 64` contado desde el **más significativo**:
  `valor = (uint256(pixels[i / 64]) >> ((63 - i % 64) * 4)) & 0xF`. Equivale a: el hex concatenado de
  las 4 palabras (256 caracteres) tiene el píxel `i` en el carácter `i`. Índice 0 = transparente. Los
  16 valores son válidos y se aceptan dibujos vacíos.
- **Título:** obligatorio, 1..32 **bytes** UTF-8 (`MAX_TITLE_LENGTH = 32`). El contrato no valida
  caracteres de control; la app sí (§6).
- **Contadores:** `totalDrawings()` = largo de `_allIds`; `drawingCount(address)` = largo de la lista
  del dueño. Solo cuentan dibujos existentes. Límite `MAX_DRAWINGS_PER_USER = 30` existentes.
- **Orden de las listas:** de inserción (más antiguo primero) hasta que se borra algo: el borrado hace
  swap-and-pop y el último id pasa al hueco. La app muestra "más reciente primero" paginando desde el
  final y ordenando por `id` descendente dentro de la página (§5.4); tras borrados el orden es
  aproximado.

### 4.3 Interfaz (ABI real, `contracts/abi/DotPixel.json`)

Escritura:

| Función | Quién | Reglas |
|---|---|---|
| `createDrawing(string title, bytes32[4] pixels) → uint256 id` | cualquiera no bloqueado | título 1..32 B; < 30 dibujos |
| `updateDrawing(uint256 id, string title, bytes32[4] pixels)` | solo el dueño, no bloqueado | el admin **no** edita ajenos |
| `deleteDrawing(uint256 id)` | dueño (aunque esté bloqueado) o admin | `delete` real; evento con `deletedBy` |
| `setUsername(string name)` | no bloqueado | 3..16 `[a-z0-9_]`; `""` borra; único; mismo nombre revierte |
| `setBlacklisted(address account, bool blacklisted)` | admin | no `address(0)`, no el admin; sin cambio revierte |
| `transferOwnership(address)` / `acceptOwnership()` | admin / pendiente | dos pasos; destino no bloqueado |
| `renounceOwnership()` | — | siempre revierte |

Lectura: `getDrawing(id) → DrawingView`, `drawingExists(id)`, `totalDrawings()`,
`drawingCount(address)`, `getDrawingsByOwner(address, offset, limit) → (DrawingView[], total)`,
`getAllDrawings(offset, limit) → (DrawingView[], total)`, `getPixel(bytes32[4], index)`,
`usernameOf(address)`, `ownerOfUsername(string)`, `isBlacklisted(address)`, `blacklistCount()`,
`getBlacklisted(offset, limit) → (address[], total)`, `owner()`, `pendingOwner()`, `nextId()` y las
constantes `MAX_DRAWINGS_PER_USER`, `MAX_PAGE_SIZE` (50), `MAX_TITLE_LENGTH`, `MIN_USERNAME_LENGTH`,
`MAX_USERNAME_LENGTH`, `PIXEL_COUNT`.

Paginación: `limit > 50` se recorta a 50; `limit = 0` u `offset >= total` devuelven 0 elementos y el
`total` real, sin revertir. **El contrato no filtra la lista negra**: cada `DrawingView` trae
`ownerBlacklisted` y la app oculta esos dibujos en la galería (§5.4).

Eventos: `DrawingCreated(id, owner, title)`, `DrawingUpdated(id, owner)`,
`DrawingDeleted(id, owner, deletedBy)`, `UsernameChanged(account, oldName, newName)`,
`BlacklistUpdated(account, blacklisted)`, más `OwnershipTransferStarted` / `OwnershipTransferred`.

### 4.4 Orden de chequeos

Ver el código (`contracts/src/DotPixel.sol`). Resumen: `notBlacklisted` va primero en crear,
actualizar y `setUsername`; luego existencia (`DrawingNotFound`), dueño (`NotDrawingOwner`), título
(`InvalidTitle`) y límite (`DrawingLimitReached`). En `setUsername`: `UsernameUnchanged`, luego
`InvalidUsername`, luego `UsernameTaken`.

### 4.5 Tamaño y costo (medidos)

- Runtime desplegado: 6,745 B (Remix; build local sin optimizador: 13,178 B). Límite 24,576 B.
- Gas EVM medido con Foundry: `createDrawing` ~209k, `updateDrawing` 28k–62k, `deleteDrawing` ~76k,
  `setUsername` 28k–76k, `setBlacklisted` 65k–93k. Cada dibujo ocupa 7 slots (8 si el título mide
  32 bytes). Costos en REVM/PGAS: **no verificado**.
- Una página de 50 dibujos cuesta ~1.15 M de gas EVM en `eth_call`; la app usa páginas de 12.

### 4.6 Cambios futuros (no aplicados: exigirían redesplegar)

- Función `onlyOwner` para liberar el nombre de una cuenta bloqueada (hoy queda reservado).
- Timestamps `uint48` para ahorrar 1 slot por dibujo.

## 5. Frontend

### 5.1 Decisiones

- **TypeScript sin framework.** `references/versiones.md` no incluye React, Vue ni otro framework, y
  cada dependencia nueva tiene que probarse en el Host. La app tiene 7 pantallas y un lienzo; un store
  observable de ~50 líneas y funciones que crean nodos DOM bastan.
- **Todo texto de usuario con `textContent`.** Títulos y nombres vienen de la cadena y los escribe
  cualquiera: nunca `innerHTML` con datos (security-and-hardening, *XSS*).
- **Rutas con hash** (`#/…`), porque el bundle se sirve con `base: './'` desde un CID
  (`references/app-sdk.md`, *Vite*).
- **Lecturas por ETH-RPC primero, Host como respaldo.** Es el patrón de la app de referencia (en iOS
  la conexión del Host tarda) y permite que Inicio muestre datos sin cuenta y fuera del Host
  (`references/app-sdk.md`, *Lecturas rápidas por ETH-RPC*). Las firmas siempre van por el Host.
- **Número de bloque por ETH-RPC** con `getBlockNumber()` de viem cada 6 s. `references/app-sdk.md`
  no documenta una suscripción a bloques del cliente de cadena; el ETH-RPC es un origen permitido y
  funciona también fuera del Host. Que `eth_blockNumber` coincida con el número de bloque de Asset Hub
  que muestran otros exploradores es **no verificado**.

### 5.2 Configuración (`src/config.ts`)

| Constante | Valor | Nota |
|---|---|---|
| `APP_NAME` | `'DOT PIXEL'` | Requisito 2.5 |
| `CONTRACT_ADDRESS` | dirección de Remix | tarea 2 |
| `DERIVATION_INDEX` | `0` | `references/app-sdk.md` |
| `TX_EXT_VERSION` | `1` | pipeline con PGAS |
| `ETH_RPC_URL` | `https://eth-rpc-testnet.polkadot.io` | `references/red-devnet.md` |
| `RPC_TIMEOUT_MS` | `8000` | `references/app-sdk.md` |
| `TX_TIMEOUT_MS` | `300000` | `references/app-sdk.md` |
| `PRODUCT_CONTEXT_TIMEOUT_MS` | `3000` | `references/app-sdk.md` |
| `LIGHT_CLIENT_GATEWAY` | `'dot.li'` | pedido del usuario; ver §12 |
| `FALLBACK_DOT_NAME` | `import.meta.env.VITE_APP_DOT` (p. ej. `dotpixelapp.dot`) | último recurso del id del Product |
| `PAGE_SIZE` | `12` | Requisito 10.5 |
| `BLOCK_POLL_MS` | `6000` | Requisito 2.2 |
| `BUILD_DATE` | inyectada por Vite (`define`) | sello de versión |

### 5.3 Sesión (`chain/session.ts`)

Sigue el *Flujo completo* de `references/app-sdk.md`:

1. `isInsideContainer()`; si es `false`, estado `fueraDelHost` (sin conectar).
2. `productId = await resolveProductId()` (`chain/productId.ts`): `getProductContext()` con timeout de
   3 s → si no, `productIdFromHost(location.hostname)` (`x.dot`, `x.dot.li`, `x.app.dot.li`,
   `x.dev-dot.li`, `x.app.dev-dot.li` → `x.dot`) → si no, `FALLBACK_DOT_NAME`. La forma exacta del
   valor que devuelve `getProductContext()` y su ruta de import son **no verificado**; la tarea 4.2 lo
   confirma y, si no se encuentra, se usa solo el hostname.
3. `createChainClient({ chains: { assetHub: devnet_asset_hub } })` y
   `createContractRuntimeFromClient(client.raw.assetHub, devnet_asset_hub, { at: 'best' })`.
4. `new SignerManager({ dappName: productId, ss58Prefix: 42, hostTimeout: 30_000, maxRetries: 1,
   persistence: null })`, `connect()`, `getProductAccount(productId, 0)` → `me`.
5. `getAccountsProvider()` → `getProductAccountSigner({ dotNsIdentifier: productId, derivationIndex:
   0, publicKey: me.publicKey }, { txExtVersion: 1 })`.
6. `createContract(runtime, CONTRACT_ADDRESS, abi as AbiEntry[], { defaultOrigin: me.address,
   defaultSigner: signer })`.
7. `requestResourceAllocation([{ tag: 'SmartContractAllowance', value: { tag: 'Index', value: 0 } }])`
   → `gas: 'Allocated' | 'Rejected' | 'NotAvailable'`.
8. Leer `owner()`, `pendingOwner()`, `isBlacklisted(me.h160Address)`, `usernameOf`,
   `drawingCount` y guardar en el store.

El store expone `session: { estado: 'fueraDelHost' | 'desconectada' | 'conectando' | 'conectada' |
'hostPerdido' | 'error', me?, isAdmin, isPendingAdmin, isBlacklisted, gas }`. `isAdmin` compara
`owner()` con `me.h160Address` en minúsculas.

**Pérdida del Host.** `session` pasa a `hostPerdido` cuando una firma (§5.6) o una lectura de
respaldo por Host (§5.4) falla con un texto que contiene `Host provider` o `disconnect` (sin distinguir
mayúsculas; tabla de `references/app-sdk.md`, *Errores de firma frecuentes*). En `hostPerdido` se
muestra el aviso "Se perdió la conexión con el Host" con "Reconectar" en todas las pantallas, los
botones que firman quedan deshabilitados y las lecturas siguen por ETH-RPC. "Reconectar" pasa a
`conectando` y vuelve a correr los pasos 3–8 de arriba (cliente, `SignerManager`, cuenta, firmante,
contrato, PGAS y lecturas de rol); si terminan bien, `conectada`; si fallan, `error` con
"Reintentar". No hay latido periódico: la skill no documenta un evento de desconexión del Host
(**no verificado**, §12.16). Si la pérdida ocurre con una transacción en curso, la máquina de §5.5
pasa a `error` (clase Host) y suelta el candado.

### 5.4 Lecturas (`chain/reads.ts`) y caché (`state/cache.ts`)

Cada lectura es una función tipada, por ejemplo `getAllDrawings(offset): Promise<GalleryPage>`. Intenta
`rpc.readContract({ address, abi, functionName, args })` con timeout de 8 s; si falla y hay sesión
dentro del Host, `contract.<fn>.query(...args)`; si también falla, lanza `ReadError` con la clave de la
lectura. La caché guarda resultados por clave (`'total'`, `'count:<addr>'`, `'mine:<addr>:<offset>'`,
`'gallery:<offset>'`, `'drawing:<id>'`, `'username:<addr>'`, `'blacklist:<offset>'`, `'admin'`) y
`invalidate(prefijos)` fuerza la relectura. Los nombres de una página se piden con `usernameOf(owner)`
por cada dueño distinto (con caché `username:<addr>`), porque el contrato no tiene lectura en lote.

**Galería y "Mis dibujos": más reciente primero.** Las listas del contrato están en orden de
inserción. Página `p` (1-based) de tamaño `PAGE_SIZE`: `end = total - (p-1)*PAGE_SIZE`,
`offset = max(0, end - PAGE_SIZE)`, `limit = end - offset`; los elementos se ordenan por `id`
descendente. En la galería se descartan los de `ownerBlacklisted = true` (salvo para el admin, que
los ve marcados), así que una página puede salir corta; la app lo muestra tal cual y deduplica por
`id` entre páginas. El `total` de la paginación es el `total` del contrato (incluye los ocultos).

### 5.5 Servicio de transacciones (`tx/`)

`tx/actions.ts` define cada acción como datos:

```ts
interface TxAction {
  kind: 'create' | 'update' | 'delete' | 'adminDelete' | 'setUsername' | 'blacklistAdd'
      | 'blacklistRemove' | 'transferAdmin' | 'cancelTransfer' | 'acceptAdmin';
  title: string;                 // título del modal, p. ej. 'GUARDAR DIBUJO'
  method: keyof DotPixelAbiFns;  // 'createDrawing', …
  args: readonly unknown[];
  verify: () => Promise<boolean>; // ¿se aplicó? (tras timeout y tras finalized)
  invalidate: string[];           // prefijos de caché a refrescar
  onDone?: () => void;            // navegación posterior
}
```

Cada constructor de acción en `tx/actions.ts` es `async`: lee el valor previo que necesita su
`verify()` (`drawingCount(me)` para crear, `updatedAt` de `getDrawing(id)` para modificar,
`pendingOwner()` para transferir/cancelar) **al crear la acción, antes de simular**, y lo guarda en el
cierre de `verify()`. Si esa lectura falla, la acción no se crea y se muestra el `ReadError` con
"Reintentar" (sin abrir el modal de firma). Las acciones cuyo `verify()` compara con un valor
esperado fijo (eliminar, nombre, lista negra, aceptar admin) no leen nada previo.

`tx/txMachine.ts` es un reductor puro (sin E/S), probado con vitest:

| Estado | Texto en el modal | Evento → siguiente |
|---|---|---|
| `simulando` | "Simulando la transacción…" | `SIM_OK` → `esperandoFirma`; `SIM_FAIL(e)` → `errorSimulacion`; `NEED_GAS` → `solicitandoGas` |
| `solicitandoGas` | "Pidiendo permiso de gas al Host…" | `GAS_OK` → `simulando` (una vez); `GAS_FAIL` → `error` |
| `errorSimulacion` | "Error de simulación: <mensaje>" | `RETRY` → `simulando`; `CLOSE` → `idle` |
| `esperandoFirma` | "Esperando tu firma en el Host" | `STATUS(broadcasting)` → `enviada`; `REJECTED` → `rechazada`; `TX_ERROR` → `error` |
| `enviada` | "Enviada a la red" | `STATUS(in-block)` → `enBloque` |
| `enBloque` | "Incluida en un bloque, esperando finalización" | `STATUS(finalized)` → `finalizada` |
| `finalizada` | "Finalizada. Comprobando el resultado…" | `VERIFIED(true)` → `actualizando`; `VERIFIED(false)` → `error` (ver tabla adicional) |
| `actualizando` | "Actualizando la app…" | `REFRESH_OK` → `listo`; `REFRESH_FAIL` → `listo` con aviso |
| `listo` | "Listo" (+ aviso si la recarga falló, con "Recargar datos") | `CLOSE` → `idle` y `onDone` |
| `rechazada` | "Firma rechazada" | `RETRY` → `simulando`; `CLOSE` |
| `verificando` | "Sin respuesta a tiempo. Revisando si se aplicó…" | `VERIFY_OK` → `actualizando` (ya se comprobó; no repite `verify()`); `VERIFY_FAIL` → `incierta` |
| `incierta` | "No se pudo confirmar. Revisa antes de reintentar." | `RETRY` → `simulando`; `CLOSE` |
| `error` | mensaje clasificado | `RETRY` (si recuperable) → `simulando`; `CLOSE` |

Transiciones adicionales (cierran los huecos de la tabla anterior):

| Estado | Evento → siguiente |
|---|---|
| `simulando` | `CANCEL` → `idle` (descarta el resultado de `.query()` cuando llegue y suelta el candado) |
| `esperandoFirma`, `enviada`, `enBloque` | `STATUS(error)` o `TX_ERROR(e)` → `error` (clasificado con §5.6; si la clase es Host, además `session` → `hostPerdido`) |
| `esperandoFirma`, `enviada`, `enBloque` | `STATUS(s)` con `s` posterior al estado actual → salta directo a ese estado (orden: `broadcasting` → `enviada` < `in-block` → `enBloque` < `finalized` → `finalizada`); un `STATUS` anterior o igual al actual se ignora |
| `esperandoFirma` | `NEED_GAS` (texto `Invalid.Payment` o `StorageDepositNotEnoughFunds`, primera vez en esta acción) → `solicitandoGas`; la segunda vez → `error` |
| `esperandoFirma` | `PIPELINE_FALLBACK` (el Host rechaza el pipeline 1, primera vez en esta acción) → `simulando` con `pipeline: 0` y aviso persistente en el modal "La comisión se cobrará en PAS"; la segunda vez → `error` |
| `esperandoFirma`, `enviada`, `enBloque` | `TIMEOUT` → `verificando` |
| `finalizada` | `VERIFIED(true)` → `actualizando`; `VERIFIED(false)` → `error` con "La transacción entró en la cadena pero no se aplicó." (recuperable: "Reintentar" → `simulando`) |

El contexto del reductor guarda `gasRetried: boolean`, `pipeline: 0 | 1` y `prevStatus`; ningún
evento no listado cambia el estado (se ignora y se registra `console.warn` una vez). `STATUS(signing)`
mantiene `esperandoFirma`. El modal solo se puede cerrar en `errorSimulacion`, `rechazada`,
`incierta`, `error` y `listo`; en `simulando` hay "Cancelar". `idle`, `errorSimulacion`, `rechazada`,
`incierta`, `error` y `listo` son estados finales: al entrar en cualquiera, `txService` suelta el
candado.

`tx/txService.ts` ejecuta una acción:

1. Si `lock` está tomado, no hace nada (los botones ya están deshabilitados). Toma `lock`.
2. `simulando`: `contract[method].query(...args, { origin: me.address })`. `success: false` →
   decodificar (§5.6) → `SIM_FAIL`. Si el texto es `Revive.StorageDepositNotEnoughFunds` →
   `NEED_GAS`.
3. `esperandoFirma`: `contract[method].tx(...args, { waitFor: 'finalized', timeoutMs: 300_000,
   onStatus })`. `onStatus` traduce `signing | broadcasting | in-block | finalized | error` a
   `STATUS`.
   Una excepción lanzada por `.tx()` se trata igual que `!sent.ok` con su mensaje.
4. Si `!sent.ok` (antes o después de difundir), clasificar `sent.error` (§5.6): rechazo →
   `REJECTED`; `Invalid.Payment`/`StorageDepositNotEnoughFunds` → `NEED_GAS` (primera vez:
   `solicitandoGas` y repetir desde 2); si el Host rechaza el pipeline 1 → `PIPELINE_FALLBACK`
   (primera vez: rearmar el firmante con `txExtVersion: 0` y repetir desde 2;
   `references/app-sdk.md`, *Pipelines*; el texto exacto de ese rechazo es **no verificado**);
   `timeout` → `TIMEOUT` y `verify()`; `Host provider`/`disconnect` → `TX_ERROR` y `session` →
   `hostPerdido`; otro → `TX_ERROR`.
5. `finalizada` → `await action.verify()` → `VERIFIED(resultado)`. Si es `true`:
   `blockNumber.refreshNow()` (lectura inmediata de `getBlockNumber()`, sin esperar el sondeo) +
   `cache.invalidate(action.invalidate)` y releer lo visible → `listo`. Si `verify()` lanza
   (`ReadError`), se trata como `true` con el aviso de recarga fallida de §7 (la cadena ya confirmó
   la finalización; solo falló la lectura).
6. Suelta `lock` al llegar a un estado final.

Se corre `verify()` también tras `finalized` porque `references/app-sdk.md` no documenta si
`sent.ok === true` garantiza que la llamada al contrato no revirtió dentro del bloque (**no
verificado**, §12.17).

Verificación y refresco por acción:

| Acción | Método | `verify()` | Invalida |
|---|---|---|---|
| Crear | `createDrawing` | `drawingCount(me)` subió respecto al valor previo | `total`, `count:me`, `mine:me`, `gallery`; luego abre `#/dibujo/<id>` con el primer id de `getDrawingsByOwner(me, 0, 1)` (lo más reciente) |
| Modificar | `updateDrawing` | `updatedAt` cambió | `drawing:<id>`, `mine:me`, `gallery` |
| Eliminar / Admin elimina | `deleteDrawing` | `getDrawing(id)` revierte `DrawingNotFound` | `total`, `count:<owner>`, `mine:<owner>`, `gallery`, `drawing:<id>` |
| Nombre | `setUsername` | `usernameOf(me) == nuevo` | `username:me`, `gallery` |
| Bloquear / desbloquear | `setBlacklisted(cuenta, true/false)` | `isBlacklisted(cuenta)` es el esperado | `blacklist`, `gallery` |
| Transferir / cancelar | `transferOwnership` | `pendingOwner()` es el esperado | `admin` |
| Aceptar admin | `acceptOwnership` | `owner() == me` | `admin` (y recalcula `isAdmin`, muestra la pestaña Admin) |

Todas las acciones, además, refrescan el encabezado con `blockNumber.refreshNow()` al finalizar
(paso 5). `chain/blockNumber.ts` expone `start()`, `stop()` y `refreshNow(): Promise<void>`;
`refreshNow()` lee una vez y reinicia el temporizador de 6 s; un fallo deja "—" como en §7.

### 5.6 Errores: clasificación y mensajes (`tx/errors.ts`)

Decodificación de reverts de `.query()`: la forma de `r.value` en un revert es **no verificado**.
`decodeContractError(value)`: (1) si `value` (o `value.data`/`value.revertData`) es hex `0x` con ≥ 4
bytes, `decodeErrorResult({ abi, data })` de viem; (2) si trae un nombre de error del ABI, usarlo;
(3) si no, repetir la llamada como `simulateContract({ account: me.h160Address, … })` por ETH-RPC solo
para obtener `errorName`; (4) si nada funciona, mensaje genérico y `console.warn` con el valor crudo.

| Error del contrato | Mensaje en la app | ¿Reintentar? |
|---|---|---|
Mensajes tomados de `contracts/DECISIONS.md` §10 (errores reales del ABI):

| Error del contrato | Mensaje en la app | ¿Reintentar? |
|---|---|---|
| `DrawingNotFound(id)` | "Este dibujo no existe o fue borrado." | No |
| `NotDrawingOwner(id, caller)` | "Este dibujo no es tuyo. Solo su autor puede modificarlo." | No |
| `Blacklisted(account)` | "Tu cuenta está bloqueada. Solo puedes borrar tus dibujos." (en el panel admin, al transferir: "Esa cuenta está bloqueada; quítala de la lista antes de proponerla como admin.") | No |
| `DrawingLimitReached(account)` | "Llegaste al límite de 30 dibujos. Borra uno para crear otro." | No |
| `InvalidTitle()` | "El título debe tener entre 1 y 32 caracteres (los acentos cuentan doble)." | No |
| `InvalidUsername()` | "El nombre debe tener de 3 a 16 caracteres: minúsculas, números o guion bajo." | No |
| `UsernameTaken(name)` | "Ese nombre ya está en uso. Elige otro." | No |
| `UsernameUnchanged()` | "Ese ya es tu nombre de usuario." | No |
| `InvalidPixelIndex(index)` | "Píxel fuera del lienzo." | No |
| `CannotBlacklistOwner()` | "No puedes bloquear la cuenta del administrador." | No |
| `ZeroAddress()` | "Dirección no válida." | No |
| `BlacklistUnchanged(account, blacklisted)` | "Esa cuenta ya estaba bloqueada." / "Esa cuenta no estaba bloqueada." | No |
| `RenounceOwnershipDisabled()` | "Renunciar al rol de admin está deshabilitado." | No |
| `OwnableUnauthorizedAccount(account)` | "Solo el administrador puede hacer esto." (al aceptar: "Tu cuenta no tiene una invitación de admin pendiente.") | No |
| `OwnableInvalidOwner(owner)` | "Dirección de administrador no válida." | No |
| desconocido | "El contrato rechazó la operación." | Sí |

Errores de firma (tabla de `references/app-sdk.md`, *Errores de firma frecuentes*), por coincidencia
de texto sin distinguir mayúsculas:

| Texto | Clase | Acción automática | Mensaje | Recuperable | Log |
|---|---|---|---|---|---|
| `reject`, `cancel`, `denied` | rechazo | ninguna | "Firma rechazada." | Sí | ninguno |
| `Invalid.Payment` | gas | pedir allowance y reintentar 1 vez | "No hay gas suficiente. Acepta el permiso de gas y reintenta." | Sí | `warn` |
| `StorageDepositNotEnoughFunds` | gas | igual | igual | Sí | `warn` |
| `Invalid.Stale`, `Future`, `nonce` | sesión | reconectar | "La sesión de firma se desfasó. Reconecta y reintenta." | Sí | `warn` |
| `timeout` | tiempo | `verify()` | ver `verificando` | Sí | `warn` |
| `Host provider`, `disconnect` | Host | ninguna | "Se perdió la conexión con el Host." + "Reconectar" | Sí | `error` |
| otro | desconocido | ninguna | "La transacción falló." | Sí | `error` |

Los logs van solo a la consola del navegador; no hay telemetría. Nunca se registran claves (la app
no maneja ninguna).

### 5.7 Rutas y acceso (`ui/router.ts`)

| Ruta | Pantalla | Sin cuenta | Condición extra |
|---|---|---|---|
| `#/` | Inicio | sí | — |
| `#/editor` | Editor (nuevo) | bloqueada | en lista negra: solo lectura con aviso |
| `#/editor/<id>` | Editor (existente) | bloqueada | dueño y no bloqueado; si no, redirige al detalle |
| `#/mis-dibujos?p=<n>` | Mis dibujos | bloqueada | — |
| `#/galeria?p=<n>` | Galería | bloqueada | — |
| `#/dibujo/<id>` | Detalle | bloqueada | — |
| `#/perfil` | Perfil | bloqueada | — |
| `#/admin` | Panel admin | bloqueada | solo `isAdmin`; si no, "Esta sección es solo para el admin" |

Validación de parámetros: `<id>` y `p` deben coincidir con `/^[1-9]\d{0,15}$/` **y** cumplir
`Number.isSafeInteger(Number(s))` (rango `1..2^53-1`); el id se convierte a `BigInt` para llamar al
contrato. Si no, se muestra "Ruta no válida" con enlace a Inicio. La pantalla bloqueada guarda la ruta
pedida y la abre al conectar.

**Salir del editor con cambios sin guardar** (Requisito 4.12). El editor registra en el router una
guarda `canLeave(): boolean` mientras hay cambios. Al llegar un `hashchange` con la guarda activa, el
router restaura la ruta anterior con `history.replaceState(null, '', rutaAnterior)` (sin volver a
renderizar), abre el modal de confirmación "Tienes cambios sin guardar. ¿Salir sin guardar?" y, solo
si se confirma, quita la guarda y navega a la ruta pedida con `location.hash = destino`. Los enlaces
internos pasan por la misma guarda. Además, mientras haya cambios, un `beforeunload` llama
`event.preventDefault()` para que el navegador pida confirmación al cerrar o recargar; que funcione
dentro del Host es **no verificado** (§12.18). Al guardar o descartar, la guarda y el `beforeunload`
se quitan.

### 5.8 Pantallas

Todas comparten encabezado (izquierda: icono + `APP_NAME`; derecha: cubo + "#15 513 966", con
`aria-label="Bloque actual 15513966"`), barra de navegación debajo y, si aplica, el aviso de lista
negra o de falta de gas.

- **Inicio** (pública): título en fuente pixel, una línea de qué es la app, un dibujo de muestra
  estático (16 × 16 en el bundle), "Dibujos en DOT PIXEL: N" (`totalDrawings`), con cuenta "Tus
  dibujos: N / 30", botón "Conectar cuenta" (o "Abrir editor" si ya hay cuenta), aviso de fuera del
  Host si aplica, y pie con "Versión <BUILD_DATE>".
- **Editor**: barra de herramientas superior en caja con borde y sombra (mano, pincel, borrador,
  cuentagotas, importar, deshacer, rehacer, limpiar), lienzo central, columna de zoom abajo a la
  izquierda (+, −, centrar, cuadrícula), paleta de 15 colores + borrador, campo "Título" con contador
  de bytes, y hoja inferior: línea de acento de 3 px arriba, etiqueta "PÍXELES CAMBIADOS" con insignia
  del número, etiqueta secundaria "TUS DIBUJOS", valor grande "12/30" en caja de acento y botón ancho
  "GUARDAR DIBUJO" (gris deshabilitado sin cambios, o al llegar a 30 en un dibujo nuevo).
- **Mis dibujos**: cuadrícula de miniaturas (2 columnas a 380 px) con título y fecha, paginación de
  12, botón "Nuevo dibujo" (deshabilitado al llegar a 30, con el motivo), estado vacío "Crea tu primer
  dibujo".
- **Galería**: miniaturas con título y autor, paginación de 12; el admin ve además "Eliminar" en cada
  tarjeta. Estado vacío "Todavía no hay dibujos públicos".
- **Detalle**: dibujo grande, título, autor, fechas (`Intl.DateTimeFormat('es', { dateStyle:
  'medium', timeStyle: 'short' })`), botones según Requisito 11.2, aviso de autor bloqueado
  (Requisito 11.4).
- **Perfil**: bloque "Tu dirección" con la `me.h160Address` completa (la `0x…` que el contrato ve como
  `msg.sender`) en un campo de solo lectura monoespaciado, botón **"Copiar mi dirección"** (feedback
  "Copiada" por `aria-live`; si `navigator.clipboard` falla, se selecciona el texto y se pide Ctrl+C),
  la SS58 como dato secundario y la nota: "Para hacerte admin: en Remix, con la cuenta admin actual,
  llama `transferOwnership` con esta dirección y luego pulsa 'Aceptar rol de admin' aquí." Después:
  nombre actual o "Sin nombre", campo de nombre con validación en vivo y disponibilidad
  (`ownerOfUsername`), "Guardar nombre", "Borrar nombre" (`setUsername("")`) y "Aceptar rol de admin"
  si `isPendingAdmin`. El mismo bloque de dirección aparece en el Panel admin.
- **Panel admin**: (1) Lista negra: campo "Dirección 0x…", botón "Bloquear"
  (`setBlacklisted(x, true)`), lista paginada de `getBlacklisted` con "Desbloquear"
  (`setBlacklisted(x, false)`); (2) Eliminar dibujo por id: campo id → vista previa y autor → "Eliminar
  dibujo"; (3) Admin: actual, pendiente, campo destino, "Transferir admin", "Cancelar transferencia".
- **Modales**: barra de título negra con texto blanco en mayúsculas pixel y botón X (`aria-label=
  "Cerrar"`), cuerpo `--color-surface`, botón primario ancho en acento con texto negro. Tipos: estado
  de transacción, confirmación (eliminar, limpiar, salir sin guardar, transferir admin), compartir y
  exportar.

### 5.9 Editor (`editor/`)

- **Modelo:** `Uint8Array(256)` de índices 0..15. `domain/pixels.ts` exporta `pack(cells): bigint[4]`
  y `unpack(words): Uint8Array` con la fórmula de §4.2.
- **Historial** (`domain/history.ts`): pila de instantáneas `Uint8Array(256)` (256 B cada una), máximo
  100; un trazo completo, limpiar o importar = una entrada. Nueva acción después de deshacer borra el
  futuro.
- **Píxeles cambiados:** número de índices distintos entre el estado actual y la base (todo 0 para
  nuevo, lo leído para existente).
- **Render:** `<canvas>` con tamaño de celda `floor(min(anchoDisponible, 352) / 16) × zoom`, escalado
  por `devicePixelRatio`, `imageSmoothingEnabled = false`. Transparente = tablero `#ffffff`/`#efeaf0`
  en 2 × 2 por celda (así no se confunde con el blanco, índice 4). Cuadrícula de 1 px `--color-grid`,
  conmutables.
- **Zoom:** niveles `[1, 1.5, 2, 3, 4]`; el contenedor tiene `overflow: auto`, así que con zoom > 1 el
  desplazamiento funciona con barras (alternativa sin arrastre). "Centrar" vuelve a zoom 1 y
  desplazamiento 0.
- **Puntero:** `pointerdown`/`pointermove` con `setPointerCapture`; entre dos eventos se rellenan las
  celdas intermedias con Bresenham. Mano = arrastrar mueve `scrollLeft/scrollTop`.
- **Teclado:** el lienzo tiene `tabindex="0"`, `role="application"` y `aria-label="Lienzo de 16 por
  16. Flechas para moverte, Enter o Espacio para aplicar la herramienta."`. Cursor de celda con borde
  discontinuo negro de 2 px. Flechas mueven el cursor (con mano: desplazan una celda). Atajos: `B`
  pincel, `E` borrador, `I` cuentagotas, `H` mano, `G` cuadrícula, `+`/`-` zoom, `0` centrar,
  `Ctrl+Z` deshacer, `Ctrl+Y` o `Ctrl+Shift+Z` rehacer. Una región `aria-live="polite"` anuncia
  "Fila 3, columna 5: Malva".
- **Importar** (`editor/imageImport.ts`): `<input type="file" accept="image/png,image/jpeg,image/webp,
  image/gif">`; validar `file.type` en la lista y `file.size ≤ 5 * 1024 * 1024`; `createImageBitmap`;
  dibujar en un canvas de 16 × 16 ajustando por el lado mayor y centrando (relleno transparente) con
  `imageSmoothingQuality = 'high'`; por píxel: alfa < 128 → 0; si no, el índice 1..15 de menor
  distancia "redmean" en RGB. Sin tramado. Si el `<input type="file">` funciona dentro del Host es
  **no verificado**.
- **Exportar** (`editor/exportPng.ts`): canvas de 512 × 512, `imageSmoothingEnabled = false`, cada
  celda 32 × 32, índice 0 sin pintar; `canvas.toBlob('image/png')` → enlace con `download=
  "dot-pixel-<id>.png"`. Como el comportamiento de `download` dentro del Host es **no verificado**, el
  modal de exportar siempre muestra también la imagen (`<img src=blob:…>`) con "Mantén pulsada la
  imagen para guardarla".

### 5.10 Compartir

Con `productId = 'dotpixelapp.dot'` (ejemplo) y etiqueta `dotpixelapp`:

- Enlace del Host: `dotpixelapp.dot/#/dibujo/<id>`.
- Enlace dot.li: `https://dotpixelapp.dot.li/#/dibujo/<id>` (`https://<etiqueta>.<LIGHT_CLIENT_GATEWAY>/
  #/dibujo/<id>`).

Ambos con "Copiar" (`navigator.clipboard.writeText`); si falla o no existe, el campo de texto queda
seleccionado para copiar a mano. `references/app-sdk.md` confirma que `x.dot.li` es una forma de URL
de la app (`productIdFromHost`), pero en devnet `pad` imprime `https://<nombre>.dev-dot.li`
(`references/publicar.md`) y `references/versiones.md` solo prueba dev-dot.li. Que `*.dot.li` abra apps
del devnet y que el Host o el gateway conserven el `#/dibujo/<id>` es **no verificado** (tarea 11.4);
el sufijo es una constante para cambiarlo sin tocar código.

## 6. Validación de entradas externas

| Entrada | Requerida | Tipo / límites | Dónde se valida | Si falla |
|---|---|---|---|---|
| Título | Sí | 1..32 bytes UTF-8 (tras `trim()`), sin bytes `0x00–0x1F`, `0x7F` | App (contador de bytes en vivo) y contrato (solo longitud) | App: texto bajo el campo y "Guardar" deshabilitado; contrato: `InvalidTitle` |
| Píxeles | Sí | `bytes32[4]` (256 índices 0..15); se permite vacío | App (modelo de 256 índices 0..15) | — |
| Nombre de usuario | Sí al guardar nombre | `/^[a-z0-9_]{3,16}$/` tras `toLowerCase()` | App y contrato | App: mensaje bajo el campo, `aria-invalid="true"`; contrato: `InvalidUsername` |
| Dirección (admin) | Sí | `/^0x[0-9a-fA-F]{40}$/`, se envía en minúsculas | App (`isAddress` de viem, `strict: false`) y contrato (`ZeroAddress`) | "Escribe una dirección 0x de 40 caracteres hexadecimales." |
| Id de dibujo (admin, rutas) | Sí | `/^[1-9]\d{0,15}$/` y `Number.isSafeInteger(Number(s))` (`1..2^53-1`); se envía como `BigInt` | App; el contrato responde `DrawingNotFound` | "Escribe un número de dibujo válido." |
| Página `p` | No (por defecto 1) | misma regla que el id; si pasa de la última página, se usa la última | App | se usa 1 |
| Archivo a importar | Sí al importar | PNG/JPEG/WebP/GIF, ≤ 5 MB, decodificable | App | "No se pudo importar la imagen: <tipo no permitido / pesa más de 5 MB / no se pudo leer>" |
| `offset`/`limit` | Sí | uint256 | Contrato (limita a 50, vacío fuera de rango) | sin error |
| Datos leídos de la cadena (títulos, nombres) | — | texto arbitrario | App: siempre `textContent` | — |

## 7. Manejo de errores por operación

| Operación | Fallo | Recuperable | Qué recibe quien llama / qué ve el usuario | Log |
|---|---|---|---|---|
| `isInsideContainer()` | `false` o excepción | No (en esta sesión) | estado `fueraDelHost`, aviso y conectar deshabilitado | `info` |
| `connect()` | `!ok`, timeout 30 s | Sí | `session.estado = 'error'`, mensaje y "Reintentar" | `warn` |
| `getProductAccount` | `!ok` | Sí | igual | `warn` |
| `getAccountsProvider()` | `null` | Sí | "El Host no entregó el proveedor de cuentas." + "Reintentar" | `error` |
| `requestResourceAllocation` | `Rejected` / `NotAvailable` / `!ok` | Sí | sesión conectada con `gas` ≠ `Allocated`, aviso con "Pedir gas otra vez" | `warn` |
| `getProductContext()` | sin respuesta en 3 s | Sí (fallback) | se usa hostname o `FALLBACK_DOT_NAME` | `info` |
| Lectura ETH-RPC | timeout 8 s / red | Sí | respaldo por Host; si falla, `ReadError` → bloque "No se pudo cargar <qué>" + "Reintentar" | `warn` |
| Número de bloque | cualquier fallo | Sí | "—" en el encabezado; reintenta en el siguiente ciclo | `warn` una vez por racha |
| Simulación | revert | No (salvo desconocido) | `errorSimulacion` con mensaje de §5.6 | `info` |
| Firma / envío | ver §5.6 | según tabla | estado del modal | según tabla |
| Firma o lectura por Host | texto `Host provider` / `disconnect` | Sí | `session.estado = 'hostPerdido'`, aviso "Se perdió la conexión con el Host" + "Reconectar" (§5.3); la tx en curso pasa a `error` | `error` |
| "Reconectar" | falla algún paso 3–8 de §5.3 | Sí | `session.estado = 'error'`, mensaje y "Reintentar" | `warn` |
| Lectura del valor previo de una acción (§5.5) | `ReadError` | Sí | no se abre el modal de firma; "No se pudo preparar la transacción" + "Reintentar" | `warn` |
| `verify()` tras `finalized` | devuelve `false` | Sí | `error`: "La transacción entró en la cadena pero no se aplicó." + "Reintentar" | `error` |
| Recarga tras finalizar | `ReadError` | Sí | `listo` con "La transacción finalizó, pero no se pudieron recargar los datos." + "Recargar datos" | `warn` |
| Importar imagen | tipo, tamaño, decodificación | Sí | mensaje; lienzo sin cambios | `info` |
| Exportar PNG | `toBlob` devuelve `null` | Sí | "No se pudo generar el PNG." | `warn` |
| Copiar enlace | `clipboard` ausente o rechazado | Sí | campo seleccionado y "Copia el enlace a mano" | ninguno |

## 8. Diseño visual

### 8.1 Dirección

Los tokens de la referencia 1 (fuente pixel, bordes negros gruesos, sombras sólidas desplazadas,
esquinas cuadradas, botones cuadrados de icono) con la paleta malva de la referencia 2. Lo memorable
es el lienzo: el resto queda sobrio, sin animaciones de entrada; solo hay movimiento como respuesta a
una acción (botón que se hunde al pulsar, avance del modal de estado). Las etiquetas en mayúsculas en
fuente pixel las pide la referencia, así que se usan solo en botones, títulos de modal y etiquetas
cortas; el texto corrido va en minúsculas normales con la fuente del cuerpo.

### 8.2 Tipografía

- **Silkscreen** (OFL 1.1): nombre de la app, encabezados, botones y etiquetas cortas. Más angosta y
  legible que "Press Start 2P" a 12–16 px.
- **Atkinson Hyperlegible** (OFL 1.1): cuerpo, campos, mensajes. Diseñada para baja visión; distingue
  bien `0/O`, `1/l/I`, útil en direcciones y nombres.
- Archivos `.ttf` copiados del repositorio `google/fonts` (`ofl/silkscreen`,
  `ofl/atkinsonhyperlegible`) a `src/assets/fonts/` con su `OFL.txt`, cargados con `@font-face` y
  `font-display: swap`. Sin CDN (el sandbox limita la red, `references/app-sdk.md`). Nombres exactos de
  archivo: **no verificado** hasta descargarlos.
- Escala: 12 / 14 / 16 / 20 / 28 px; cuerpo 16 px con `line-height: 1.5`; textos de máximo ~60
  caracteres por línea.

### 8.3 Tokens (CSS custom properties, `styles/tokens.css`)

| Propiedad | Valor | Rol / 60-30-10 |
|---|---|---|
| `--color-bg` | `#e5dde6` | 60 %: fondo de la app y alrededor del lienzo |
| `--color-surface` | `#dfcae1` | 30 %: barras, paneles, hoja inferior, cuerpo de modales |
| `--color-surface-strong` | `#c0a0c3` | 30 %: hover de controles no primarios, secciones secundarias |
| `--color-accent` | `#8f7193` | 10 %: botón primario, herramienta activa, insignias, línea de acento |
| `--color-accent-hover` | `#a788ab` | 10 %: hover/presionado del acento |
| `--color-ink` | `#000000` | neutro: texto y bordes |
| `--color-shadow` | `#2b2b2b` | neutro: sombras sólidas (grafito) |
| `--color-on-dark` | `#ffffff` | texto de la barra de título del modal |
| `--color-paper` | `#ffffff` | superficie del lienzo |
| `--color-checker` | `#efeaf0` | tablero de píxeles transparentes |
| `--color-grid` | `#d9d3da` | líneas de la cuadrícula |
| `--color-disabled-bg` | `#d6d3d6` | botón deshabilitado |
| `--color-disabled-ink` | `#4a4a4a` | texto del botón deshabilitado |
| `--color-danger` | `#8b1e2d` | texto de error (siempre con icono y texto) |
| `--color-success` | `#1d5c34` | texto de éxito (siempre con icono y texto) |
| `--font-pixel` | `'Silkscreen', monospace` | títulos, botones, etiquetas |
| `--font-body` | `'Atkinson Hyperlegible', system-ui, sans-serif` | cuerpo |
| `--fs-xs` / `--fs-sm` / `--fs-md` / `--fs-lg` / `--fs-xl` | `12px` / `14px` / `16px` / `20px` / `28px` | escala |
| `--lh-body` | `1.5` | interlineado del cuerpo |
| `--border-w` | `3px` | bordes de cajas, botones, modales |
| `--border-w-thin` | `2px` | swatches, campos, miniaturas |
| `--border` | `var(--border-w) solid var(--color-ink)` | borde estándar |
| `--shadow-hard` | `4px 4px 0 0 var(--color-shadow)` | sombra sólida |
| `--shadow-hard-pressed` | `1px 1px 0 0 var(--color-shadow)` | botón presionado (con `translate(3px, 3px)`) |
| `--radius` | `0` | esquinas cuadradas en todo |
| `--accent-line` | `3px solid var(--color-accent)` | separador superior de la hoja inferior |
| `--grid-line` | `1px` | grosor de la cuadrícula |
| `--space-1` … `--space-6` | `4px 8px 12px 16px 24px 32px` | espaciado |
| `--tap-min` | `44px` | tamaño mínimo de botones táctiles |
| `--focus-ring` | `3px solid var(--color-ink)` con `outline-offset: 2px` | foco visible |
| `--layout-max` | `420px` | ancho máximo del contenido (diseño a 380 px) |

Botones de herramienta: fondo `--color-bg`, borde 3 px, sombra; activa: fondo `--color-accent`,
icono negro y `aria-pressed="true"`. Hoja inferior y barra de herramientas sobre `--color-surface`.

### 8.4 Contraste (WCAG 2.2, calculado con la fórmula de luminancia relativa)

| Primer plano | Fondo | Uso | Ratio | Mínimo | Resultado |
|---|---|---|---|---|---|
| `#000000` | `#e5dde6` | texto sobre fondo | 15.82:1 | 4.5 | ✅ |
| `#000000` | `#dfcae1` | texto en paneles, modales, hoja | 13.67:1 | 4.5 | ✅ |
| `#000000` | `#c0a0c3` | texto en hover / secciones | 9.06:1 | 4.5 | ✅ |
| `#000000` | `#8f7193` | texto e iconos en botón primario, herramienta activa, insignia, valor grande | 4.95:1 | 4.5 | ✅ |
| `#000000` | `#a788ab` | texto en botón primario en hover | 6.75:1 | 4.5 | ✅ |
| `#ffffff` | `#000000` | título de modal | 21.00:1 | 4.5 | ✅ |
| `#000000` | `#ffffff` | texto sobre el lienzo / campos | 21.00:1 | 4.5 | ✅ |
| `#4a4a4a` | `#d6d3d6` | botón deshabilitado (exento, igual se cumple) | 5.97:1 | — | ✅ |
| `#8b1e2d` | `#e5dde6` | error sobre fondo | 6.81:1 | 4.5 | ✅ |
| `#8b1e2d` | `#dfcae1` | error en modal | 5.89:1 | 4.5 | ✅ |
| `#1d5c34` | `#e5dde6` | éxito sobre fondo | 6.01:1 | 4.5 | ✅ |
| `#1d5c34` | `#dfcae1` | éxito en modal | 5.19:1 | 4.5 | ✅ |
| `#000000` (borde, foco) | `#e5dde6` / `#dfcae1` / `#8f7193` | bordes 3 px y anillo de foco | 15.82 / 13.67 / 4.95 | 3 | ✅ |
| `#8f7193` (herramienta activa) | `#e5dde6` | estado activo frente a inactivo | 3.19:1 | 3 | ✅ |
| `#ffffff` | `#8f7193` | **descartado**: texto blanco en acento | 4.24:1 | 4.5 | ❌ no se usa |
| `#8f7193` | `#dfcae1` | **descartado**: texto en acento sobre panel | 2.76:1 | 3 | ❌ no se usa |
| `#8f7193` (línea de acento) | `#dfcae1` | separador decorativo de 3 px | 2.76:1 | — | decorativo, no transmite información |
| `#d9d3da` (cuadrícula) | `#ffffff` | líneas de ayuda conmutables | 1.47:1 | — | decorativo; las celdas se distinguen por color y el cursor de teclado es negro |

Por la fila descartada, el "valor grande en acento" de la referencia se muestra como texto negro
dentro de una caja de fondo acento (4.95:1). Los swatches de la paleta llevan borde negro de 2 px, así
que cada color se distingue del fondo con ≥ 3:1 gracias al borde, sin depender de su relleno.

### 8.5 Paleta de píxeles (fija; índices en el contrato, hex en `domain/palette.ts`)

| Índice | Nombre (etiqueta accesible) | Hex |
|---|---|---|
| 0 | Transparente | — |
| 1 | Negro | `#000000` |
| 2 | Gris oscuro | `#4a4453` |
| 3 | Gris | `#9a93a0` |
| 4 | Blanco | `#ffffff` |
| 5 | Ciruela | `#5b3f60` |
| 6 | Malva | `#8f7193` |
| 7 | Lila | `#c0a0c3` |
| 8 | Niebla | `#e5dde6` |
| 9 | Rojo | `#b8323f` |
| 10 | Naranja | `#e7843c` |
| 11 | Amarillo | `#f2d25c` |
| 12 | Verde | `#4f9a4a` |
| 13 | Azul | `#3a6fb5` |
| 14 | Piel | `#f0b79a` |
| 15 | Marrón | `#8a5a3b` |

Los índices 5–8 armonizan con la interfaz; el resto cubre neutros, primarios cálidos y fríos y un tono
de piel. Cambiar un hex después de publicar cambia cómo se ven todos los dibujos guardados: la tabla
queda fija desde la primera publicación.

## 9. Accesibilidad

- `lang="es"`, enlace "Saltar al contenido", landmarks `header`, `nav`, `main`.
- Botones nativos (`<button>`) en todo; iconos SVG con `aria-hidden="true"` y `aria-label` en el
  botón (accessibility, *Icon buttons*).
- Herramientas: contenedor `role="toolbar" aria-label="Herramientas"`, `aria-pressed` en la activa.
  Paleta: `role="radiogroup" aria-label="Color"` con `<input type="radio">` estilizados y nombre del
  color como etiqueta.
- Lienzo con teclado (§5.9) y alternativa sin arrastre para desplazar (WCAG 2.5.7).
- Foco: `:focus-visible { outline: var(--focus-ring); outline-offset: 2px; }`, `scroll-margin` para que
  la barra inferior fija no tape el foco (WCAG 2.4.11).
- Modales: `<dialog>` nativo con `showModal()`, foco al título al abrir, Escape cierra solo en estados
  cerrables, foco vuelve al control que lo abrió.
- Estado de transacción: región `aria-live="polite"` con el texto del estado; errores en
  `role="alert"`. El número de bloque no se anuncia.
- `@media (prefers-reduced-motion: reduce)`: sin transiciones ni el desplazamiento del botón
  presionado (solo cambia la sombra).
- Objetivos de 44 × 44 px; errores de formulario con `aria-invalid` y `aria-describedby`.

## 10. Seguridad (modelo de amenazas breve)

| Frontera | Amenaza | Mitigación |
|---|---|---|
| Cualquiera llama al contrato | Editar/borrar ajeno, saltarse la lista negra (E) | Chequeos con `msg.sender` en el contrato; pruebas de cada regla |
| Admin | Perder el rol por error, admin bloqueado (E/D) | `Ownable2Step`, renuncia deshabilitada, no bloquear admin ni pendiente |
| Títulos y nombres en la cadena | XSS en la app (T) | `textContent` siempre; sin `innerHTML` con datos |
| Bucles en escritura | Gas ilimitado (D) | ≤ 30 elementos; lecturas ≤ 50 |
| Nombres parecidos | Suplantación por mayúsculas o Unicode (S) | Solo `[a-z0-9_]` |
| Archivo importado | Archivo enorme o malformado (D) | Tipo y tamaño ≤ 5 MB, decodificación del navegador, se procesa local y nunca se sube |
| Secretos | Fuga de llaves | La app y las tareas nunca manejan mnemónicos ni llaves (`SKILL.md`) |
| Dependencias | Paquete malicioso o versión no probada | Versiones exactas, `allowBuilds: esbuild: false`, `pnpm audit` antes de publicar |

## 11. Estrategia de pruebas

**Foundry (unitarias del contrato, hechas):** 49 tests en contracts/test/DotPixel.t.sol (46 unitarios + 3 fuzz), todos pasan con orge test. Cobertura por tema en contracts/DECISIONS.md §12 (lista negra, permisos, Ownable2Step, username, límite de 30, contadores, paginación, píxeles, soulbound, inexistentes). Huecos menores pendientes (solo tests, sin tocar el contrato): updateDrawing con título de 33 bytes y tope de página en getDrawingsByOwner.

**Vitest (unitarias del frontend, sin Host):** `pixels.ts` (vectores A–D de §4.2, los mismos que
Foundry), `blockNumber.ts` (`refreshNow()` lee una vez y reinicia el temporizador, con viem simulado),
`session.ts` (paso a `hostPerdido` con errores `Host provider`/`disconnect` y "Reconectar" con
dependencias simuladas), `actions.ts` (cada constructor captura el valor previo antes de simular),
`quantize.ts` (colores exactos de la paleta mapean a sí mismos, alfa < 128 → 0), `validation.ts`
(nombre, título en bytes, dirección, id), `history.ts`, `txMachine.ts` (todas las transiciones de
§5.5, incluidas las de la tabla adicional: errores después de enviar, estados saltados, gas desde
`esperandoFirma`, pipeline 0, `CANCEL` en `simulando`, `VERIFIED(false)` y reintentos únicos), `errors.ts` (cada texto de la tabla → clase y mensaje,
decodificación de un revert codificado con viem `encodeErrorResult`), `productId.ts`
(`productIdFromHost` con las 5 formas), `router.ts` (guardas sin cuenta, admin, parámetros
inválidos).

**Integración por ETH-RPC (Node, sin Host):** prueba `test:red` que lee `totalDrawings`, `getAllDrawings`
y `owner()` del contrato desplegado con viem (como `test:red` de `references/versiones.md`).

**Manual en el Host** (solo con la app publicada en su `.dot`, `references/app-sdk.md`, *Dónde
probar*): lista de chequeo de la tarea 12 (conectar, gas, cada acción firmada con sus estados,
extrínseca `0x45 01` y `PGASFeePaid` en Blockscout/explorador, lista negra, admin, compartir,
exportar, importar).

## Respuestas a la revisión (iteración 2, `.agents/tasks/dot-pixel/review.md`)

Ningún hallazgo cambia una conducta decidida por el usuario; todos se atendieron.

| # | Hallazgo | Respuesta |
|---|---|---|
| 1 | Huecos de la máquina de estados de tx | Atendido: tabla adicional en §5.5 (errores después de enviar, estados saltados, `NEED_GAS` y `PIPELINE_FALLBACK` desde `esperandoFirma`, `CANCEL` en `simulando`, `verify()` tras `finalized`); R17.12–R17.14; §12.17; tarea 8.1. |
| 2 | Detección de pérdida del Host | Atendido: estado `hostPerdido` y "Reconectar" en §5.3; filas nuevas en §7; R20.3 reescrito; §12.16; tarea 4.3. |
| 3 | `evm_version` en Foundry | Atendido: `evm_version = "cancun"` en §2, §12.12 y tarea 1.1; la tarea 2.2 confirma "EVM version: default" en Remix. |
| 4 | Vector de prueba sin definir | Atendido: vectores A–D como constantes en §4.2 (sin leer archivos); §11 y tareas 1.9 y 4.1 los usan. |
| 5 | Encabezado sin recarga tras tx | Atendido: `blockNumber.refreshNow()` en el paso 5 de §5.5; R17.10; tareas 4.6 y 8.3. |
| 6 | R21.6, R23.5 y R8.3 sin tarea | Atendido: tareas 5.2 (320/380 px), 11.3 y 13.2 (sin secretos), 1.3 y 1.9 (`InvalidPixelData`). |
| 7 | Regex de id fuera de rango | Atendido: `Number.isSafeInteger` en §5.7 y §6. |
| 8 | Valor previo de `verify()` | Atendido: captura en el constructor de cada acción, antes de simular (§5.5); fila de error en §7. |
| 9 | forge-std sin versión | Atendido: `v1.17.0` (la de `contracts/foundry.lock`, en lugar de `v1.9.7` que sugería la revisión, para no desalinear el repositorio) y borrado de los archivos de ejemplo de `forge init` (tarea 1.1); §12.19. |
| 10 | Interceptar la salida del editor | Atendido: guarda en el router con `history.replaceState` y `beforeunload` (§5.7); R4.12; §12.18. |
| 11 | RNF3 ambiguo | Atendido: "30 dibujos" y cota de bytes de las cadenas. |
| 12 | Dibujo de prueba de Remix | Atendido: la tarea 2.4 lo elimina con `deleteDrawing` para que `totalDrawings` vuelva a 0. |

## 12. Puntos abiertos / no verificado

1. **Foundry** no aparece en la skill; `references/errores-comunes.md` advierte contra instalarlo
   cuando la IA lo propone para desplegar. Aquí lo pidió el usuario solo para pruebas locales; el
   despliegue sigue en Remix. La instalación de Foundry en Windows y que `forge` produzca el mismo
   bytecode que Remix (metadatos aparte) son **no verificado**.
2. **Versión de OpenZeppelin en Remix:** con imports sin versión, Remix resuelve el paquete por su
   cuenta; que resuelva 5.6.1 es **no verificado**. La tarea 2.2 revisa `.deps/npm/@openzeppelin/
   contracts/package.json` en Remix; si no es 5.6.1, se cambian los imports a
   `@openzeppelin/contracts@5.6.1/…` y se agrega esa remapping en Foundry.
3. **Codificación de `bytes32[4]` como argumento** en `.query()`/`.tx()` del SDK 0.39.0: **no
   verificado** (solo están documentados arreglos devueltos). Tarea 4.4.
4. **Forma de `r.value` en un revert de `.query()`** y si incluye los datos del error personalizado:
   **no verificado**; por eso existe el respaldo con `simulateContract` de viem (§5.6).
5. **`getProductContext()`**: ruta de import y forma del valor: **no verificado**. Respaldo con el
   hostname y `FALLBACK_DOT_NAME`.
6. **Número de bloque**: la skill no documenta una suscripción a bloques; se usa `eth_blockNumber`
   por ETH-RPC. Que coincida con el número de bloque de Asset Hub: **no verificado**.
7. **Enlace dot.li**: en devnet solo está probado `*.dev-dot.li`; que `https://<etiqueta>.dot.li` abra
   la app del devnet y que se conserve el hash `#/dibujo/<id>` (en dot.li, dev-dot.li y al abrir
   `<etiqueta>.dot/#/…` en el Host) es **no verificado**. Si dot.li no abre apps del devnet, cambiar
   `LIGHT_CLIENT_GATEWAY` a `'dev-dot.li'` requiere confirmación del usuario, porque él pidió dot.li.
8. **Texto exacto del rechazo del pipeline 1** por el Host (para el reintento con pipeline 0): **no
   verificado**.
9. **Dentro del Host**: `<input type="file">`, descarga con `<a download>`, `navigator.clipboard` y
   `createImageBitmap`: **no verificado**; cada uno tiene respaldo en la UI.
10. **Devolución del depósito de almacenamiento** al hacer `delete`: **no verificado**.
11. **Tamaño del contrato**: estimado 13–19 KB, sin medir (§4.6).
12. **EVM objetivo**: se fija `evm_version = "cancun"` en `foundry.toml`, la EVM por defecto de solc
    0.8.28 (Foundry no la toma de solc si se omite la clave). Que Remix use "EVM version: default" =
    `cancun` se confirma en la tarea 2.2. Que REVM acepte todos sus opcodes está respaldado solo por
    los contratos de referencia desplegados con la EVM por defecto (`Leaderboard`); **no verificado**
    por la skill.
13. **Content-Security-Policy**: no se agrega `<meta http-equiv="Content-Security-Policy">` en esta
    versión porque se desconoce cómo interactúa con la comunicación TrUAPI del sandbox; el Host ya
    limita la red por manifest (`references/app-sdk.md`). Queda para una versión posterior probada en
    el Host.
14. **Cuenta del admin**: el admin inicial es la cuenta MetaMask que despliega, que no es la cuenta
    del Product (`references/contratos.md`). Para administrar desde la app hay que transferir el rol
    a la `h160Address` de la cuenta del Product **del dominio final** (la cuenta cambia con el dominio,
    `references/errores-comunes.md`) y aceptarlo desde la app. Si `msg.sender` de la cuenta del
    Product es exactamente `me.h160Address` se asume por el uso de `account: me.h160Address` en
    `references/app-sdk.md`; **no verificado** con un contrato propio hasta la tarea 12.
15. **Nombres de archivo de las fuentes** en `google/fonts`: **no verificado** hasta descargarlas.
16. **Desconexión del Host**: la skill no documenta un evento ni una consulta para saber si el Host
    sigue conectado; solo la tabla de errores (`Host provider` / `disconnect` → reconectar,
    `references/app-sdk.md`). La app detecta la pérdida solo cuando falla una firma o una lectura por
    Host (§5.3); un latido periódico queda fuera de esta versión. **No verificado.**
17. **`sent.ok === true` y reverts en el bloque**: `references/app-sdk.md` no dice si `ok` garantiza
    que la llamada al contrato no revirtió al ejecutarse en el bloque. Por eso se corre `verify()`
    también tras `finalized` (§5.5). **No verificado.**
18. **`beforeunload` dentro del Host**: que el Host muestre la confirmación del navegador al cerrar o
    recargar la app es **no verificado**; la confirmación dentro de la app (cambio de ruta) no depende
    de ello (§5.7).
19. **forge-std**: se fija `v1.17.0` (la etiqueta que ya registra `contracts/foundry.lock`); la skill no
    habla de forge-std porque Foundry solo se usa para pruebas locales. **No verificado** con la skill.
