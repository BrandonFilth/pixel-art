# Revisión de diseño: DOT PIXEL (spec `.kiro/specs/dot-pixel/`), iteración 3

Archivos revisados: `requirements.md`, `design.md`, `tasks.md`, contra `.agents/tasks/dot-pixel/brief.md`,
`.agents/skills/polkadot-products-devnet/` (`SKILL.md` y `references/`) y el estado actual del
repositorio (`contracts/`).

**Veredicto: CHANGES_REQUESTED** (1 HIGH, 0 MEDIUM, 2 NIT).

Los 12 hallazgos de la iteración 2 están resueltos en la spec (tabla adicional de la máquina de
estados, `hostPerdido`, `evm_version = "cancun"`, vectores A–D, `refreshNow()`, trazabilidad de R21.6,
R23.5 y R8.3, `Number.isSafeInteger`, captura del valor previo, forge-std fijado, guarda `canLeave()`,
RNF3 y limpieza del dibujo de Remix). Revisé de nuevo los vectores A–D y la tabla de contraste: son
correctos. El bloqueo nuevo viene del repositorio: desde la iteración anterior apareció en
`contracts/` un contrato `DotPixel` ya implementado, probado y con commit, y su interfaz no coincide
con la que define la spec.

## Hallazgos

### 1. HIGH: la spec choca con el contrato que ya existe en `contracts/` y no dice qué hacer con él

**Dónde:** `tasks.md` tarea 1 completa (1.1 "Crear `contracts/` con `forge init contracts --no-git`",
1.2–1.10); `design.md` §3 (estructura de `contracts/`), §4.2–§4.4, §11, "Respuestas a la revisión"
fila 9 y §12.19 (que citan `contracts/foundry.lock` como si ya existiera).

**Problema:** `contracts/` ya contiene un proyecto Foundry con repositorio git propio (commit
`f4174c6 feat: add DotPixel contract, Foundry tests and Remix deploy package`), submódulos
(`.gitmodules`, no `--no-git`), `src/DotPixel.sol`, `test/DotPixel.t.sol`, `remix/DotPixel.flat.sol`,
`abi/DotPixel.json`, `DECISIONS.md`, `DEPLOY_REMIX.md` y `deployments.md`. Lo produjo otro flujo
(`.agents/tasks/dot-pixel-contract/review.json`, veredicto `APPROVED`). Todavía no está desplegado
(`deployments.md` tiene la dirección "pendiente").

La propia spec es incoherente: §12.19 y la fila 9 de "Respuestas" usan la etiqueta de
`contracts/foundry.lock`, pero la tarea 1.1 manda crear `contracts/` desde cero. Quien implemente
`tasks.md` tiene dos caminos y los dos fallan: reescribir un contrato aprobado y con commit que no
hizo (pisar trabajo ajeno), o dejarlo y construir el frontend contra una ABI distinta de la de
§4.3. Diferencias concretas entre `design.md` §4 y `contracts/src/DotPixel.sol`:

| Tema | Spec (`design.md`) | Contrato existente |
|---|---|---|
| Tipo de píxeles | `uint256[]` de longitud 4 + `InvalidPixelData` | `bytes32[4]` fijo |
| Orden de nibbles | LSB primero: `s = (i & 63) * 4` (vectores A–D) | MSB primero: `(63 - i % 64) * 4` (vectores A–D no valen) |
| Título | opcional, 0..31 bytes, rechaza control en cadena | obligatorio, 1..32 bytes, sin chequeo de control |
| Dibujo vacío | `EmptyDrawing` | se acepta |
| Nombre | no se puede borrar (S4) | `setUsername("")` lo borra |
| Lista negra | `addToBlacklist` / `removeFromBlacklist`, eventos `Blacklisted` / `Unblacklisted(account, by)`, `AlreadyBlacklisted` / `NotBlacklisted` | `setBlacklisted(account, bool)`, evento `BlacklistUpdated(account, bool)`, `BlacklistUnchanged`; `Blacklisted(address)` es un **error** |
| Bloquear al pendiente | revierte `CannotBlacklistOwner` | permitido (solo protege a `owner()`) |
| Galería | oculta en el contrato: `getGallery`, `galleryCount` exactos | `getAllDrawings` sin filtrar, con `ownerBlacklisted` por elemento (filtro en el frontend) |
| Forma de las lecturas | arreglos paralelos (§4.1 evita tuplas porque su codificación con el SDK no está documentada) | `DrawingView[]` (arreglo de structs/tuplas) |
| Orden de páginas | lo más reciente primero | lo más antiguo primero (`ids[offset + i]`); lista negra "orden no garantizado" |
| Nombres de funciones | `drawingCountOf`, `getBlacklist`, `getUsernames` | `drawingCount`, `getBlacklisted`, sin `getUsernames`; extra `drawingExists`, `getPixel`, `blacklistCount`, `nextId` público |
| Errores | sin parámetros; `AccountBlacklisted`, `RenounceDisabled`, `NewOwnerBlacklisted`, `PageTooLarge` | con parámetros (`DrawingNotFound(uint256)`, `NotDrawingOwner(uint256,address)`…); `Blacklisted(address)`, `RenounceOwnershipDisabled` |
| Archivo para Remix | `src/DotPixel.sol` "el mismo archivo que se pega en Remix"; imports con versión si Remix no resuelve 5.6.1 (§12.2) | `remix/DotPixel.flat.sol` aplanado con `forge flatten` |
| Pruebas | 4 archivos (`DotPixel`, `Blacklist`, `Username`, `Pagination`) | un solo `test/DotPixel.t.sol` |

Las diferencias tocan requisitos que el usuario fijó (por ejemplo, la forma de la lista negra y la
galería) y supuestos de la spec (S2, S3, S4), así que las tareas de las secciones 4 a 9 no se pueden
implementar sin decidir cuál de las dos versiones manda.

**Arreglo:** pedir al usuario que elija una opción y dejarla escrita en la spec antes de aprobarla:

- **Opción A (recomendada si el usuario quiere conservar el contrato aprobado): adaptar la spec al
  contrato existente.** Reescribir `design.md` §4.2–§4.4 con la interfaz real de
  `contracts/src/DotPixel.sol`, recalcular los vectores A–D con el orden MSB primero y ajustar en
  `requirements.md` R3.4, R3.5, R8.3, R10.2, R12 (borrado de nombre), R13.1, R13.4–R13.8 y S2–S4.
  Para el filtro de galería en el frontend, definir cómo se pagina cuando se saltan elementos con
  `ownerBlacklisted`. Mover a la tarea 4.4 la prueba de que `.query()` del SDK decodifica
  `DrawingView[]` y `bytes32[4]`, con salida si falla. Cambiar la tarea 1 por "Revisar y ajustar el
  contrato existente": `forge test` en verde, medir tamaño, agregar solo las pruebas que falten de
  §11 y desplegar `remix/DotPixel.flat.sol`. Quitar `forge init`.
- **Opción B: la spec manda y reemplaza el contrato existente.** Agregar en `design.md` §4 una nota
  "Reemplaza `contracts/src/DotPixel.sol` (commit `f4174c6`) con la interfaz de §4.3", y cambiar la
  tarea 1.1 por: "Con confirmación del usuario, reescribir `src/DotPixel.sol`, dividir
  `test/DotPixel.t.sol` en los cuatro archivos de §3, regenerar `remix/DotPixel.flat.sol` y
  `abi/DotPixel.json`, y actualizar `DECISIONS.md`. Mantener el repositorio git y los submódulos que
  ya existen (no `forge init`)". Registrar en §12 que esta opción descarta trabajo aprobado de
  `dot-pixel-contract`.

En los dos casos, quitar la contradicción entre §12.19 (que da por existente `foundry.lock`) y la
tarea 1.1 (que crea `contracts/`).

### 2. NIT: la comprobación de lista negra en `acceptOwnership` no se puede alcanzar ni probar

**Dónde:** `requirements.md` R15.3; `design.md` §4.4 (`acceptOwnership`); tarea 1.8.12.

**Problema:** `transferOwnership` rechaza destinos bloqueados y `addToBlacklist` rechaza al
`pendingOwner()`. Por eso un pendiente nunca puede estar bloqueado y la rama `NewOwnerBlacklisted` de
`acceptOwnership` es código muerto. La tarea 1.8.12 solo prueba `transferOwnership`.

**Arreglo:** dejar la rama como defensa y anotar en §4.4: "Inalcanzable mientras se cumpla el
invariante 'admin y pendiente nunca bloqueados' (§4.5); no tiene prueba propia". O quitarla para
ahorrar bytes si §4.6 lo necesita.

### 3. NIT: "lo más reciente primero" también se rompe al desbloquear, y S6 solo habla del borrado

**Dónde:** `requirements.md` S6 y R10.2; `design.md` §4.4 (`removeFromBlacklist` hace `push` de los
ids a la galería).

**Problema:** al desbloquear una cuenta, sus dibujos antiguos se agregan al final de `_galleryIds` y
salen primero en la galería como si fueran nuevos.

**Arreglo:** en S6, agregar: "…y después de desbloquear una cuenta: sus dibujos vuelven al principio
de la galería".

## Supuestos verificados

- Reglas obligatorias de `SKILL.md` frente a la spec: red Products Devnet (Asset Hub 1000, chainId
  `420420417`, `devnet_asset_hub`), versiones exactas (`@parity/product-sdk` 0.39.0, `polkadot-api`
  3.2.1, alias de descriptores `0.14.0-pcf.1`, `@parity/truapi` 0.25.0 con overrides acotados, pnpm
  12.6.0, solo pnpm), `pragma solidity 0.8.28;` sin optimizador, Remix + MetaMask, 24,576 B, OZ 5.6.1,
  `createChainClient` (sin `getChainAPI`), `.query()` antes de `.tx()`, una firma a la vez,
  `waitFor: 'finalized'`, PGAS con `SmartContractAllowance` y `txExtVersion: 1`, Vite `base: './'` +
  plugin del descriptor, sin `localhost` para firmas, `pad` 0.22.1 con `--no-manifest` para pruebas y
  config con `domain: process.env.APP_DOT` para la final, sin secretos. Ninguna contradicción.
- `onStatus` recibe `signing`, `broadcasting`, `in-block`, `finalized` y `error`
  (`references/app-sdk.md`, línea 263).
- `getProductContext()` necesita timeout de 3 s y las 5 formas de hostname de `productIdFromHost`
  (`references/app-sdk.md`, líneas 39–41).
- En devnet, `pad` imprime `https://<nombre-temporal>.dev-dot.li` (`references/publicar.md`) y
  `references/versiones.md` solo prueba dev-dot.li: el diseño marca dot.li como **no verificado**
  (§12.7) en lugar de inventarlo.
- La skill no documenta una suscripción al número de bloque; el diseño usa `eth_blockNumber` por
  ETH-RPC y lo marca **no verificado** (§12.6).
- `contracts/foundry.lock` registra `forge-std` `v1.17.0` y `openzeppelin-contracts` `v5.6.1`, como
  dice §12.19.
- Sobrescribir `transferOwnership` como `public override onlyOwner`, `acceptOwnership` como
  `public override` y `renounceOwnership` como `public pure override` sobre `Ownable2Step` de OZ 5.6.1
  compila con solc 0.8.28 (el contrato existente lo hace y tiene build en `contracts/out/`).
- Vectores A–D de §4.2: recalculados con la fórmula `s = (i & 63) * 4`; las palabras esperadas son
  correctas.
- Tabla de contraste §8.4: recalculé los 14 pares de color con la fórmula de luminancia relativa de
  WCAG y coinciden con dos decimales (negro/`#8f7193` 4.95:1, blanco/`#8f7193` 4.24:1,
  `#8f7193`/`#e5dde6` 3.19:1, `#8f7193`/`#dfcae1` 2.76:1, etc.).
- 60-30-10 con los colores exactos del brief; texto negro sobre acento; grafito `#2b2b2b` en sombras.
- Cada regla de la lista negra tiene su subtarea Foundry (1.8.1–1.8.12) y 1.9 cubre permisos,
  borrado por admin, `Ownable2Step`, nombres, límite de 30, contadores, bordes de paginación, ida y
  vuelta de píxeles y soulbound.
- Orden de tareas igual al del brief y cada tarea cita requisitos.
- Los tres archivos están en español y `design.md` termina con "12. Puntos abiertos / no verificado".
- Los autores de la spec no escribieron código de aplicación: el código de `contracts/` viene del
  flujo `dot-pixel-contract` (ver hallazgo 1); no hay `app/`.

## Supuestos no verificados o incorrectos

- **Incorrecto:** que `contracts/` no exista y se cree con `forge init --no-git` (tarea 1.1). Ya existe,
  con git y submódulos, y su interfaz no coincide con §4.3 (hallazgo 1).
- **Incoherente:** §12.19 y la fila 9 de "Respuestas" toman la versión de forge-std del
  `foundry.lock` existente, pero el resto de la spec ignora el contrato que está al lado.
- **No verificado (el diseño ya lo marca):** codificación de `uint256[]` como argumento (§12.3);
  forma de `r.value` en un revert (§12.4); import y forma de `getProductContext()` (§12.5); bloque por
  `eth_blockNumber` (§12.6); dot.li en devnet y conservación del hash (§12.7); texto del rechazo del
  pipeline 1 (§12.8); APIs del navegador dentro del Host (§12.9); devolución del depósito al hacer
  `delete` (§12.10); tamaño 13–19 KB (§12.11); EVM `cancun` en REVM (§12.12); `msg.sender` =
  `me.h160Address` (§12.14); evento de desconexión del Host (§12.16); `sent.ok` y reverts en el
  bloque (§12.17); `beforeunload` en el Host (§12.18).
