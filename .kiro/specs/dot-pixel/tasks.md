# Tareas: DOT PIXEL

Referencias entre corchetes: requisitos de `requirements.md` (R<n>.<criterio>) y secciones de
`design.md` (§). Rutas de la skill: `.agents/skills/polkadot-products-devnet/`.

**Alineación (2026-11-12):** el contrato ya está hecho, probado y desplegado. Su interfaz real
(`design.md` §4.3, `contracts/DECISIONS.md`) manda sobre cualquier nombre antiguo de esta lista.

- [x] 1. Contrato y pruebas locales con Foundry (`contracts/`)
  - [x] 1.1 Proyecto Foundry con solc 0.8.28, `optimizer = false`, `evm_version = "cancun"`, OZ
    v5.6.1 y forge-std v1.17.0. [R24.1, R23.3]
  - [x] 1.2 `src/DotPixel.sol`: `Ownable2Step`, datos, constantes, eventos y errores (§4.2–§4.3).
    [R15.1, R3.7, R8.1, R16.1]
  - [x] 1.3 `createDrawing`, `updateDrawing`, `deleteDrawing` con swap-and-pop. [R3, R6, R7, R9.2, R14]
  - [x] 1.4 `setUsername` (borrable con `""`), `usernameOf`, `ownerOfUsername`. [R12]
  - [x] 1.5 `setBlacklisted`, `isBlacklisted`, `blacklistCount`, `getBlacklisted`. [R13]
  - [x] 1.6 `transferOwnership`, `acceptOwnership` y `renounceOwnership` sobrescritos. [R15]
  - [x] 1.7 Vistas paginadas `getDrawing`, `getDrawingsByOwner`, `getAllDrawings` (con
    `ownerBlacklisted`), `drawingCount`, `totalDrawings`. [R9, R10]
  - [x] 1.8 Pruebas de cada regla de la lista negra (`test_Blacklisted*`, `test_OwnerCannotBlacklistItself`,
    `test_UnblacklistRestoresAbilities`, `test_OwnerBlacklistedFlagInGallery`, etc.). [R13]
  - [x] 1.9 Resto de pruebas: permisos, Ownable2Step, username, límite de 30, contadores, paginación,
    píxeles, soulbound, inexistentes (49 tests, 3 fuzz). [R24.2]
  - [x] 1.10 `forge test` 49/49 y `forge build --sizes`: 13,178 B < 24,576 B. [R23.3]
  - [ ] 1.11 (Opcional, solo tests) Agregar `updateDrawing` con título de 33 bytes y tope de página
    en `getDrawingsByOwner` a `contracts/test/DotPixel.t.sol`, sin tocar `src/`.

- [x] 2. Despliegue con Remix + MetaMask (`references/contratos.md`)
  - [x] 2.1 MetaMask con "Polkadot Hub TestNet" (`420420417`) y PAS del faucet.
  - [x] 2.2 Compilar `contracts/remix/DotPixel.flat.sol` en Remix con 0.8.28.
  - [x] 2.3 Desplegado en `0xdCb169dcFeAA2d121D740A66b7333b226Cd48e6e` (bloque 15,680,804, admin
    `0x6d465F5CB6FFc918761d4cC9A675F1ED2c6bB764`).
  - [x] 2.4 Verificación de solo lectura (código, 29 selectores, constantes, `owner()`,
    `pendingOwner()`) y registro en `contracts/deployments.md`. Nota: el runtime desplegado (6,745 B)
    indica que Remix compiló con optimizador; la ABI es la misma.
  - [ ] 2.5 (Usuario) Tras publicar en el dominio final: copiar la dirección desde Perfil, llamar
    `transferOwnership(<dirección>)` en Remix y aceptar en la app (tarea 12.6). [R15, R27, §12.14]

- [x] 3. Proyecto Vite + TypeScript (`app/`) con versiones fijas
  - [x] 3.1 Crear `package.json` con `devEngines` pnpm 12.6.0 y las dependencias exactas de
    `references/versiones.md` (`@parity/product-sdk` 0.39.0, alias de descriptores PCF 0.14.0-pcf.1,
    `polkadot-api` 3.2.1, `viem` 2.56.9; `typescript` 5.9.3, `vite` 8.3.1, `vitest` 5.0.3), sin `^` ni
    `~`. [R23.2]
  - [x] 3.2 Crear `pnpm-workspace.yaml` con `allowBuilds`, `minimumReleaseAgeExclude` y los overrides
    acotados (`padre@versión>hijo`) de `references/versiones.md`; nunca overrides globales. [R23.2]
  - [x] 3.3 `vite.config.js` con `base: './'`, el plugin `soloDescriptorDevnet()` de
    `references/app-sdk.md` y `define` para `BUILD_DATE`. `index.html` con `lang="es"`. [R23.4,
    R22.8, R25.3]
  - [x] 3.4 `pnpm install` y `node c:/Users/brand/Downloads/pixel/.agents/skills/polkadot-products-devnet/scripts/verificar-entorno.mjs app`
    sin ✘ (una sola copia de `@parity/truapi` 0.25.0 y `polkadot-api` 3.2.1). [R23.2]
  - [x] 3.5 `src/config.ts` con las constantes de §5.2 y `contract/abi.ts` con la ABI como
    `abiJson as AbiEntry[]`. `pnpm typecheck` y `pnpm build` pasan. [R2.5, §5.2]

- [ ] 4. Conexión con el SDK y lecturas
  - [x] 4.1 `domain/pixels.ts` (`pack`/`unpack`) y `domain/palette.ts` (tabla §8.5) con pruebas vitest
    que comprueban `pack`/`unpack` contra los vectores A–D de §4.2 (las mismas constantes que 1.9).
    [R8.1, R8.2, R8.4, R8.5, §4.2]
  - [x] 4.2 `chain/productId.ts` (`getProductContext()` con timeout 3 s → hostname →
    `FALLBACK_DOT_NAME`) con pruebas de `productIdFromHost` para las 5 formas; confirmar la ruta de
    import de `getProductContext()` en el paquete instalado o dejar solo el hostname. [R19.2, §12.5]
  - [x] 4.3 `chain/session.ts` según §5.3 (contenedor, cliente de cadena, `SignerManager`, cuenta,
    firmante `txExtVersion: 1`, contrato, `SmartContractAllowance`, lectura de rol y lista negra), con
    el estado `hostPerdido` (errores `Host provider`/`disconnect` en firmas o lecturas por Host) y
    `reconnect()` que repite los pasos 3–8; pruebas vitest de esas transiciones con dependencias
    simuladas. [R1.1, R1.4, R1.5, R1.7, R17.11, R20.1, R20.3, R23.1, §12.16]
  - [ ] 4.4 Pantalla de diagnóstico temporal y publicación de prueba con `--no-manifest`
    (`references/publicar.md`, §2) para comprobar dentro del Host: conectar, `.query()` de
    `createDrawing` con un `bytes32[4]` y la forma de `r.value` en un revert. Si `bytes32[4]` no se codifica, detenerse y avisar antes de seguir (cambia la ABI). [§12.3, §12.4,
    R25.2]
  - [x] 4.5 `chain/reads.ts` (viem primero con timeout 8 s, Host de respaldo, `ReadError`) y
    `state/cache.ts` con `invalidate`. Prueba `test:red` de Node que lee `totalDrawings`,
    `getAllDrawings(0, 12)` y `owner()` del contrato desplegado. [R9.1, R10.1, R20.2, §5.4]
  - [x] 4.6 `chain/blockNumber.ts`: `getBlockNumber()` cada 6 s, pausa con `visibilitychange`, "—"
    en fallo, y `start()`/`stop()`/`refreshNow()` (lectura inmediata que reinicia el temporizador)
    con prueba vitest. [R2.2, R2.3, R17.10, §5.5, §12.6]

- [x] 5. Tokens de diseño y estructura
  - [x] 5.1 Copiar Silkscreen y Atkinson Hyperlegible (`.ttf` + `OFL.txt`) a `src/assets/fonts/` y
    declarar `@font-face`; comprobar en `dist` que no hay URLs externas. [R21.5, §8.2]
  - [x] 5.2 `styles/tokens.css` con todas las propiedades de §8.3; `base.css` con reset, foco
    visible, `prefers-reduced-motion`, `.visually-hidden`, objetivos de 44 px y layout fluido de 320 a
    420 px (`--layout-max`). Revisar Inicio, Editor y modales a 320 y 380 px de ancho sin
    desplazamiento horizontal. [R21.1–R21.3, R21.6, R22.3, R22.5, R22.7]
  - [x] 5.3 `ui/dom.ts` (creación de nodos solo con `textContent`), `state/store.ts` y
    `ui/router.ts` con rutas hash, guardas y validación de parámetros de §5.7, con pruebas vitest.
    [R1.2, R1.3, R19.4, §5.7]
  - [x] 5.4 Componentes: encabezado (icono + nombre; cubo + bloque), navegación con Admin condicional,
    botón, botón de icono, `<dialog>` con barra negra, confirmación, pantalla bloqueada, avisos (fuera
    del Host, sin gas, lista negra, error con "Reintentar"), paginador. [R2.1, R2.4, R2.6, R1.2,
    R1.5, R13.9, R20.1–R20.3, R22.6]
  - [x] 5.5 Pantalla Inicio (pública) con contadores, conectar, aviso fuera del Host y sello de
    versión. Revisar contraste real en pantalla contra la tabla §8.4. [R1.1, R1.6, R9.5, R21.4, R25.3]

- [x] 6. Editor
  - [x] 6.1 `editor/canvasView.ts`: render 16 × 16, tablero de transparencia, cuadrícula conmutable,
    zoom `[1, 1.5, 2, 3, 4]` con `overflow: auto`, centrar. [R4.1, R4.2, R22.4]
  - [x] 6.2 `editor/tools.ts`: mano, pincel de 1 px con Bresenham, borrador, cuentagotas; un trazo =
    un paso. Sin control de tamaño de pincel. [R4.3–R4.6]
  - [x] 6.3 `domain/history.ts` (100 pasos) con pruebas; deshacer, rehacer y limpiar con
    confirmación. [R4.8, R4.9]
  - [x] 6.4 Paleta como `radiogroup` de 15 colores + borrador; barra de herramientas `role="toolbar"`
    con `aria-pressed`. [R4.7, R22.2]
  - [x] 6.5 Teclado del lienzo (cursor, Enter/Espacio, atajos) y anuncio `aria-live`. [R4.13, R22.1]
  - [x] 6.6 `editor/imageImport.ts` y `domain/quantize.ts` (§5.9) con pruebas de cuantización y
    errores de tipo/tamaño. [R5.1–R5.4]
  - [x] 6.7 Campo título con contador de bytes y `domain/validation.ts` (título, nombre, dirección,
    id) con pruebas. [R3.5, §6]
  - [x] 6.8 Hoja inferior: píxeles cambiados, "TUS DIBUJOS" N/30, "GUARDAR DIBUJO" deshabilitado sin
    cambios, vacío, en el límite o en lista negra; confirmación al salir con cambios mediante la
    guarda `canLeave()` del router (`hashchange` + `history.replaceState` + modal) y `beforeunload`
    (§5.7), con prueba vitest de la guarda. [R3.3, R3.4, R4.10–R4.12, R13.9, §12.18]

- [x] 7. Listas y detalle
  - [x] 7.1 Miniatura de dibujo (canvas pequeño desde `unpack`) y autor (nombre o `0x1234…abcd`).
    [R11.1, R12.1]
  - [x] 7.2 Mis dibujos con `getDrawingsByOwner`, paginación de 12, "Nuevo dibujo" con límite, estado
    vacío. [R10.5, R10.7, R3.3]
  - [x] 7.3 Galería con `getAllDrawings` (paginada desde el final, oculta `ownerBlacklisted`) + `usernameOf`, paginación de 12, estado vacío, "Eliminar" solo
    para el admin. [R10.5, R10.7, R13.4, R14.1]
  - [x] 7.4 Detalle con fechas, botones por rol, "no existe" y autor bloqueado. [R11.1–R11.4]

- [x] 8. Flujo de estado de transacción
  - [x] 8.1 `tx/txMachine.ts` como reductor puro con las dos tablas de §5.5 y pruebas vitest de cada
    transición: reintento único de gas desde `simulando` y desde `esperandoFirma`, `PIPELINE_FALLBACK`
    único, `CANCEL` en `simulando`, `STATUS(error)`/`TX_ERROR` desde `esperandoFirma`, `enviada` y
    `enBloque`, estados saltados (`finalized` sin `in-block`) y `STATUS` repetidos ignorados, timeout
    → `verificando`, `VERIFIED(false)` → `error`, eventos no listados ignorados y cierre solo en
    estados finales. [R17.2–R17.6, R17.12–R17.14]
  - [x] 8.2 `tx/errors.ts`: decodificación de reverts (viem `decodeErrorResult`, respaldo
    `simulateContract`), mensajes de §5.6 y clasificación de errores de firma, con pruebas. [R17.3,
    R17.7, R26.1]
  - [x] 8.3 `tx/txService.ts`: candado de una firma, `.query({ origin })` antes de `.tx({ waitFor:
    'finalized', timeoutMs: 300000, onStatus })`, reintento con allowance, reintento con pipeline 0,
    `verify()` tras timeout y tras `finalized`, y al finalizar `blockNumber.refreshNow()` +
    invalidación y recarga de los datos afectados (contadores, listas, dibujo, encabezado); suelta el
    candado en todo estado final, también tras un error después de enviar. [R17.1, R17.4, R17.7,
    R17.8, R17.10–R17.13]
  - [x] 8.4 `tx/actions.ts` con las 10 acciones y su `verify`/`invalidate` (tabla §5.5); cada
    constructor `async` lee el valor previo (`drawingCount(me)`, `updatedAt`, `pendingOwner()`)
    antes de simular y lo guarda en el cierre de `verify()`; prueba vitest de esa captura. [R17.1,
    R17.6, R17.13]
  - [x] 8.5 Modal de estado con `aria-live="polite"`, `role="alert"` en errores, Reintentar/Cerrar,
    "Cancelar" en `simulando`, y todos los botones que firman deshabilitados mientras `lock` está
    tomado o la sesión está en `hostPerdido`. [R17.8, R17.9, R17.14, R20.3, R22.6]
  - [x] 8.6 Conectar crear, modificar y eliminar al servicio; tras crear, abrir el detalle del nuevo.
    [R3.1, R3.6, R6.1, R6.6, R7.1, R7.4]

- [x] 9. Perfil y panel admin
  - [x] 9.1 Perfil: bloque "Tu dirección" con `me.h160Address`, botón "Copiar mi dirección" con respaldo de selección y nota de Remix (también en el Panel admin) [R27], nombre con validación en vivo, minúsculas,
    disponibilidad con `ownerOfUsername` (espera de 400 ms), "Guardar nombre", deshabilitado en lista
    negra. [R12.1, R12.3, R12.7, R12.8, R13.9, R15.8]
  - [x] 9.2 "Aceptar rol de admin" para `pendingOwner()`. [R15.7]
  - [x] 9.3 Panel admin: lista negra con `setBlacklisted` (Bloquear con validación, lista paginada de `getBlacklisted`, Desbloquear). [R13.1, R13.8]
  - [x] 9.4 Panel admin: eliminar dibujo por id con vista previa y confirmación. [R14.1]
  - [x] 9.5 Panel admin: admin actual, pendiente, transferir y cancelar con confirmación. [R15.6]

- [x] 10. Exportar y compartir
  - [x] 10.1 `editor/exportPng.ts` 512 × 512 sin suavizado, descarga y vista de respaldo. [R18.1,
    R18.2]
  - [x] 10.2 Modal Compartir con enlace del Host y enlace dot.li desde `productId` y
    `LIGHT_CLIENT_GATEWAY`, Copiar y respaldo de texto seleccionable. [R19.1–R19.3]


**Nota de implementación (2026-11-12):** frontend hecho en `app/`. Desviaciones: lecturas solo por ETH-RPC (sin respaldo por Host);
`getProductContext()` no existe en `product-sdk-host` 0.28.0, el id del Product sale del hostname; mapeo de cuenta con
`ensureContractAccountMapped` solo si la simulación devuelve `AccountNotMapped`. Verificado: `tsc`, `vite build` (1.95 MB),
28 tests de vitest, `test:red` contra el contrato desplegado y capturas en Chrome headless. Sin probar dentro del Host.

- [ ] 11. Publicación de prueba (`references/publicar.md`, §2)
  - [ ] 11.1 `pnpm build`; revisar tamaño de `dist` y que solo esté el descriptor del devnet.
    [R23.4]
  - [ ] 11.2 Correr `pnpm audit` y revisar hallazgos críticos/altos por alcance antes de publicar.
    [§10]
  - [ ] 11.3 Publicar con `pad` 0.22.1 a un nombre temporal sin dígitos (`tmp` + fecha en letras),
    `--env devnet --js-merkle --no-manifest`, sin `pad login` y sin mnemónico, keystore ni `.env` con
    secretos en el proyecto ni en la terminal; copiar `CID: bafy…` y pegarlo con Resolve en el nombre
    propio desde `dotns.dot` en el Host. [R25.1, R23.5]
  - [ ] 11.4 Probar los enlaces de compartir: `<etiqueta>.dot/#/dibujo/<id>` desde el Host,
    `https://<etiqueta>.dot.li/#/dibujo/<id>` y `https://<nombre-temporal>.dev-dot.li`. Si dot.li no
    abre la app, avisar al usuario antes de cambiar `LIGHT_CLIENT_GATEWAY`. [R19.1, §12.7]

- [ ] 12. Pruebas manuales en el Host (app publicada en su `.dot`, nunca `localhost`)
  - [ ] 12.1 Conectar, aceptar los tres permisos y ver gas `Allocated`; probar rechazo de gas. [R1.4,
    R1.5, R25.2]
  - [ ] 12.2 Crear, modificar y eliminar un dibujo viendo cada estado del modal; confirmar en el
    bloque la extrínseca `0x45 01` y `PgasAllowance.PGASFeePaid` (`references/app-sdk.md`,
    *Pipelines*). [R17.4, R17.11]
  - [ ] 12.3 Rechazar una firma; provocar un error de simulación (p. ej. nombre ocupado) y ver el
    mensaje en español. [R17.3, R17.5]
  - [ ] 12.4 Intentar una segunda acción mientras otra está pendiente: debe estar deshabilitada.
    [R17.8]
  - [ ] 12.5 Importar imagen, exportar PNG y copiar enlaces dentro del Host; anotar qué respaldos se
    usaron. [R5.1, R18.2, R19.3, §12.9]
  - [ ] 12.6 Desde Remix (MetaMask), `transferOwnership` a la `h160Address` que muestra Perfil en el
    dominio final; aceptar desde la app; ver la pestaña Admin. [R15.2, R15.7, R15.8, §12.14]
  - [ ] 12.7 Con dos cuentas: bloquear una, comprobar el aviso, que no puede crear/editar/cambiar
    nombre, que sí elimina lo suyo, que sus dibujos desaparecen de la galería y vuelven al
    desbloquear; admin elimina un dibujo ajeno. [R13.2–R13.5, R13.9, R14.1]
  - [ ] 12.8 Navegación con teclado, lector de pantalla (TalkBack o NVDA) y `prefers-reduced-motion`.
    [R22.1–R22.7]

- [ ] 13. Publicación final con manifest (`references/publicar.md`, §2 variante y §4)
  - [ ] 13.1 `assets/icono.png` 512 × 512 y `polkadot-app-deploy.config.mjs` con `domain:
    process.env.APP_DOT`, `displayName` (`APP_NAME`), descripción en español, `icon` png y
    `executables`. [R25.1, R2.5]
  - [ ] 13.2 `pnpm build`, `APP_DOT` temporal y `pad .\dist $env:APP_DOT --env devnet --js-merkle`
    sin tuberías, sin mnemónico, keystore ni `.env` con secretos; copiar el CID y el JSON de
    `Verified text[manifest]:`. [R25.1, R23.5]
  - [ ] 13.3 En `dotns.dot`: Resolve con el CID y Custom Record `manifest` con el JSON en el dominio
    principal (sin `app.`). Abrir desde el Host y comprobar icono, nombre y sello de versión. [R25.1,
    R25.3]
  - [ ] 13.4 Anotar en el README la fecha de publicación y que Bulletin borra el contenido a los
    ~14 días (volver a publicar solo para renovar o para una versión nueva). [R25.1]
