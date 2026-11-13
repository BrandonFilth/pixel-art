# Requisitos: DOT PIXEL

## Resumen

DOT PIXEL es un Polkadot Product: una app web estática (Vite + TypeScript) que corre dentro de un Host
(Polkadot Desktop o la Polkadot App) y guarda dibujos de pixel art de 16 × 16 en un contrato Solidity
en Products Devnet (Asset Hub 1000, chainId `420420417`). Cada dibujo es un lienzo independiente,
ligado para siempre (soulbound) a la dirección que lo creó. Hay dos roles: usuario normal y admin. El
admin es el que despliega el contrato, puede transferir su rol en dos pasos, administrar una lista
negra y eliminar dibujos de cualquier usuario. Toda la interfaz está en español. Cada firma muestra
una pantalla de estado con simulación previa, firma, inclusión en bloque, finalización y
actualización de la app.

Formato de los criterios: EARS en español ("CUANDO … EL SISTEMA DEBERÁ …", "MIENTRAS …", "SI …
ENTONCES …", "EL SISTEMA DEBERÁ …"). "El contrato" es el contrato `DotPixel`; "la app" es el
frontend. "Cuenta del Product" es la cuenta que el Host deriva para la app y que actúa como
`msg.sender` (`references/contratos.md`, *Cuentas y `msg.sender`*).

## Supuestos

- S1. Se mantienen 15 colores visibles más "transparente" (índice 0) en lugar de 16 colores visibles:
  el brief pide una paleta fija de 16 índices de 4 bits y un píxel vacío representable; se elige la
  opción (b) del brief. Justificación en `design.md` §4.2.
- S2. El título es **obligatorio**, de 1 a 32 bytes UTF-8 (lo fija el contrato desplegado,
  `MAX_TITLE_LENGTH = 32`).
- S3. Se permiten dibujos sin píxeles visibles (el contrato no lo impide). Para quitar un dibujo se
  elimina.
- S4. El nombre de usuario se puede cambiar **y borrar** (`setUsername("")` lo libera).
- S5. El admin, como usuario, también tiene el límite de 30 dibujos.
- S6. La galería y "Mis dibujos" muestran primero lo más reciente. El orden puede cambiar después de
  un borrado (por el borrado con intercambio, *swap-and-pop*).
- S7. El detalle de un dibujo cuyo autor está en la lista negra no muestra los píxeles a terceros:
  solo al autor y al admin.
- S8. El admin no puede renunciar al rol (`renounceOwnership` revierte): el usuario pidió transferir,
  y renunciar dejaría la lista negra sin administrador para siempre.
- S9. Los nombres de funciones, eventos y errores del contrato van en inglés; todo texto visible para
  el usuario va en español.

## Alineación con el contrato desplegado (manda sobre el resto)

El contrato `DotPixel` está desplegado en `0xdCb169dcFeAA2d121D740A66b7333b226Cd48e6e` (Products
Devnet, chainId `420420417`; `contracts/deployments.md`) y no se modifica. Donde un criterio de este
archivo nombre funciones, eventos o errores distintos, se aplica esta equivalencia (interfaz real en
`design.md` §4.3 y `contracts/DECISIONS.md`):

| En esta spec | En el contrato |
|---|---|
| `addToBlacklist(a)` / `removeFromBlacklist(a)` | `setBlacklisted(a, true)` / `setBlacklisted(a, false)`; evento `BlacklistUpdated(a, bool)` |
| `AccountBlacklisted()` / `NewOwnerBlacklisted()` | `Blacklisted(account)` |
| `AlreadyBlacklisted()` / `NotBlacklisted()` | `BlacklistUnchanged(account, blacklisted)` |
| `RenounceDisabled()` | `RenounceOwnershipDisabled()` |
| `getGallery(offset, limit)` / `galleryCount()` | `getAllDrawings(offset, limit)` (no filtra; la app oculta los de `ownerBlacklisted`) / `totalDrawings()` |
| `getBlacklist(offset, limit)` | `getBlacklisted(offset, limit)` y `blacklistCount()` |
| `drawingCountOf(a)` | `drawingCount(a)` |
| `getUsernames(accounts)` | no existe: `usernameOf(a)` por cuenta |
| píxeles `uint256[]` | `bytes32[4]`, nibbles desde el más significativo |
| `EmptyDrawing()`, `InvalidPixelData()` | no existen (se aceptan dibujos vacíos) |
| Título 0..31 bytes | Título 1..32 bytes |
| Orden "más reciente primero" en el contrato | Orden de inserción; la app pagina desde el final (`design.md` §5.4) |
| No bloquear al admin pendiente | Solo no se bloquea al admin actual; el pendiente bloqueado no puede aceptar |

## Requisitos funcionales

### Requisito 1: Host, conexión de cuenta y acceso

**Historia:** Como visitante, quiero ver la portada sin conectar nada y conectar mi cuenta cuando
quiera dibujar, para entender la app antes de dar permisos.

1. CUANDO la app arranque EL SISTEMA DEBERÁ comprobar `isInsideContainer()` y, SI devuelve `false`,
   ENTONCES mostrar el aviso "Abre esta app dentro de Polkadot Desktop o de la Polkadot App" y
   deshabilitar el botón de conectar (`references/app-sdk.md`, *Reglas del sandbox*).
2. MIENTRAS no haya cuenta conectada EL SISTEMA DEBERÁ permitir solo la ruta Inicio; cualquier otra
   ruta (Editor, Mis dibujos, Galería, Detalle, Perfil, Panel admin) DEBERÁ mostrar una pantalla
   bloqueada con el texto de la sección y un botón "Conectar cuenta".
3. CUANDO el usuario conecte su cuenta desde una pantalla bloqueada EL SISTEMA DEBERÁ llevarlo a la
   ruta que intentaba abrir.
4. CUANDO el usuario pulse "Conectar cuenta" EL SISTEMA DEBERÁ conectar con
   `SignerManager.connect()`, obtener la cuenta del Product con índice de derivación 0 y pedir
   `SmartContractAllowance` (PGAS) con `requestResourceAllocation` (`references/app-sdk.md`,
   *Flujo completo*).
5. SI la asignación de PGAS devuelve `Rejected` o `NotAvailable` ENTONCES EL SISTEMA DEBERÁ mantener
   la sesión conectada y mostrar "Sin permiso de gas: no podrás guardar cambios hasta aceptarlo" con
   un botón "Pedir gas otra vez".
6. SI la conexión falla ENTONCES EL SISTEMA DEBERÁ mostrar el motivo en español y un botón
   "Reintentar", sin bloquear la portada.
7. EL SISTEMA DEBERÁ identificar al usuario solo por la cuenta del Product (`h160Address` como
   `msg.sender`); el contrato nunca recibirá "la cuenta del usuario" como parámetro para decidir
   permisos (`references/contratos.md`, *Seguridad mínima*).

### Requisito 2: Encabezado y navegación

**Historia:** Como usuario, quiero ver siempre el nombre de la app y el bloque actual de la red, para
saber que la app está viva y conectada.

1. EL SISTEMA DEBERÁ mostrar un encabezado con dos zonas: a la izquierda el icono y el nombre de la
   app; a la derecha un icono de cubo con el número de bloque actual.
2. MIENTRAS la app esté abierta EL SISTEMA DEBERÁ actualizar el número de bloque al menos cada 6 s y
   dejar de consultarlo mientras la pestaña esté oculta.
3. SI no se puede leer el número de bloque ENTONCES EL SISTEMA DEBERÁ mostrar "—" junto al cubo con la
   etiqueta accesible "Bloque no disponible", sin mostrar un error modal.
4. EL SISTEMA DEBERÁ mostrar una barra de navegación con: Inicio, Editor, Mis dibujos, Galería y
   Perfil; y DEBERÁ mostrar "Admin" solo CUANDO la cuenta conectada sea el `owner()` del contrato.
5. EL SISTEMA DEBERÁ tomar el nombre de la app de una sola constante de configuración, con valor
   inicial "DOT PIXEL".
6. EL SISTEMA NO DEBERÁ mostrar trofeo, ranking ni marcador.

### Requisito 3: Crear dibujo

**Historia:** Como usuario conectado, quiero guardar un dibujo nuevo en la cadena, para que quede a mi
nombre.

1. CUANDO el usuario pulse "Guardar dibujo" en un dibujo nuevo EL SISTEMA DEBERÁ iniciar el flujo de
   transacción (Requisito 17) con `createDrawing(title, pixels)`.
2. CUANDO `createDrawing` se ejecute EL CONTRATO DEBERÁ asignar un id nuevo (único, creciente, nunca
   reutilizado, empezando en 1), registrar `owner = msg.sender`, `createdAt = updatedAt =
   block.timestamp`, guardar título y píxeles, y emitir `DrawingCreated(id, owner)`.
3. SI el emisor ya tiene 30 dibujos existentes ENTONCES EL CONTRATO DEBERÁ revertir con
   `DrawingLimitReached()` y la app DEBERÁ mostrar "Llegaste al límite de 30 dibujos. Elimina uno para
   crear otro." y deshabilitar "Guardar dibujo" para dibujos nuevos.
4. SI todos los píxeles son transparentes ENTONCES EL CONTRATO DEBERÁ revertir con `EmptyDrawing()` y
   la app DEBERÁ deshabilitar "Guardar dibujo" con el texto "Pinta al menos un píxel".
5. SI el título supera 31 bytes UTF-8 o contiene caracteres de control (bytes `0x00`–`0x1F` o `0x7F`)
   ENTONCES EL CONTRATO DEBERÁ revertir con `InvalidTitle()`.
6. CUANDO la creación finalice EL SISTEMA DEBERÁ refrescar los contadores, "Mis dibujos", la galería y
   abrir el detalle del dibujo nuevo.
7. EL CONTRATO NO DEBERÁ cobrar nada: ninguna función es `payable` y el contrato no acepta PAS; el
   usuario solo paga la comisión de la transacción en PGAS.

### Requisito 4: Editor y herramientas

**Historia:** Como usuario, quiero un editor de 16 × 16 con herramientas básicas de pixel art, para
dibujar cómodo en el teléfono y con teclado.

1. EL SISTEMA DEBERÁ mostrar un lienzo de 16 × 16 celdas con cuadrícula de líneas finas gris claro.
2. EL SISTEMA DEBERÁ ofrecer las herramientas: mano (desplazar), pincel, borrador, cuentagotas,
   importar imagen, selector de color de la paleta fija, acercar, alejar, centrar, mostrar/ocultar
   cuadrícula, deshacer, rehacer, limpiar lienzo y campo de título.
3. CUANDO el usuario pinte con el pincel EL SISTEMA DEBERÁ pintar exactamente 1 píxel por celda
   tocada; NO DEBERÁ existir control de tamaño de pincel.
4. CUANDO el usuario arrastre el pincel o el borrador EL SISTEMA DEBERÁ pintar todas las celdas del
   trazo sin huecos y registrar el trazo como un solo paso de deshacer.
5. CUANDO el usuario use el borrador EL SISTEMA DEBERÁ poner la celda en transparente (índice 0).
6. CUANDO el usuario use el cuentagotas sobre una celda EL SISTEMA DEBERÁ seleccionar el color de esa
   celda y volver al pincel; SI la celda es transparente ENTONCES DEBERÁ seleccionar el borrador.
7. EL SISTEMA DEBERÁ ofrecer como selector de color solo los 15 colores visibles de la paleta fija; NO
   DEBERÁ ofrecer un selector de color libre.
8. CUANDO el usuario pulse "Limpiar lienzo" EL SISTEMA DEBERÁ pedir confirmación y dejar todas las
   celdas transparentes como un paso que se puede deshacer.
9. EL SISTEMA DEBERÁ guardar al menos 100 pasos de deshacer por sesión del editor.
10. EL SISTEMA DEBERÁ mostrar en la barra inferior "Guardar dibujo" y el número de píxeles cambiados
    respecto al estado inicial (vacío para un dibujo nuevo, el guardado para uno existente).
11. MIENTRAS no haya cambios (0 píxeles cambiados y título igual) EL SISTEMA DEBERÁ mostrar
    "Guardar dibujo" deshabilitado.
12. CUANDO el usuario intente salir del editor con cambios sin guardar (cambio de ruta dentro de la
    app) EL SISTEMA DEBERÁ pedir confirmación y navegar solo si se confirma; al cerrar o recargar la
    página DEBERÁ pedir la confirmación del navegador (que funcione dentro del Host es **no
    verificado**, `design.md` §5.7).
13. EL SISTEMA DEBERÁ permitir usar el lienzo y las herramientas con teclado (Requisito 22).

### Requisito 5: Importar imagen

**Historia:** Como usuario, quiero importar una imagen y convertirla a 16 × 16, para partir de algo
existente.

1. CUANDO el usuario elija un archivo PNG, JPEG, WebP o GIF de hasta 5 MB EL SISTEMA DEBERÁ escalarlo a
   16 × 16 conservando la proporción (ajuste completo, relleno transparente) y cuantizar cada píxel al
   color más cercano de la paleta fija.
2. SI un píxel de la imagen tiene alfa menor a 128 ENTONCES EL SISTEMA DEBERÁ convertirlo en
   transparente.
3. SI el archivo no es de un tipo permitido, supera 5 MB o no se puede decodificar ENTONCES EL SISTEMA
   DEBERÁ mostrar "No se pudo importar la imagen: <motivo>" y dejar el lienzo sin cambios.
4. CUANDO la importación termine EL SISTEMA DEBERÁ reemplazar el lienzo como un paso que se puede
   deshacer, sin enviar nada a la cadena.

### Requisito 6: Modificar dibujo

**Historia:** Como autor, quiero editar mis dibujos guardados.

1. CUANDO el autor guarde cambios EL SISTEMA DEBERÁ iniciar el flujo de transacción con
   `updateDrawing(id, title, pixels)`.
2. CUANDO `updateDrawing` se ejecute EL CONTRATO DEBERÁ reemplazar título y píxeles, actualizar
   `updatedAt`, conservar `owner` y `createdAt`, y emitir `DrawingUpdated(id, owner)`.
3. SI el emisor no es el dueño del dibujo ENTONCES EL CONTRATO DEBERÁ revertir con
   `NotDrawingOwner()`, también si el emisor es el admin.
4. SI el dibujo no existe ENTONCES EL CONTRATO DEBERÁ revertir con `DrawingNotFound()`.
5. Las reglas 3.4 y 3.5 (dibujo vacío, título) DEBERÁN aplicar también a `updateDrawing`.
6. CUANDO la modificación finalice EL SISTEMA DEBERÁ refrescar el dibujo, "Mis dibujos" y la galería.

### Requisito 7: Eliminar dibujo propio

**Historia:** Como autor, quiero eliminar mis dibujos, para liberar espacio de mi límite.

1. CUANDO el autor pulse "Eliminar" EL SISTEMA DEBERÁ pedir confirmación ("Esta acción no se puede
   deshacer") y después iniciar el flujo de transacción con `deleteDrawing(id)`.
2. CUANDO `deleteDrawing` se ejecute EL CONTRATO DEBERÁ borrar el dibujo con `delete` (liberar su
   almacenamiento), quitar su id de la lista del dueño y de la galería, bajar en 1 los contadores
   individual y global, y emitir `DrawingDeleted(id, owner, msg.sender)`.
3. SI el emisor no es el dueño ni el admin ENTONCES EL CONTRATO DEBERÁ revertir con
   `NotDrawingOwner()`.
4. CUANDO la eliminación finalice EL SISTEMA DEBERÁ refrescar contadores, listas y volver a
   "Mis dibujos" (o a la pantalla de origen).
5. CUANDO se consulte un id eliminado EL CONTRATO DEBERÁ revertir con `DrawingNotFound()`; el id
   nunca se reutiliza.

### Requisito 8: Píxeles y paleta

**Historia:** Como usuario, quiero que mis colores se guarden de forma exacta y barata.

1. EL CONTRATO DEBERÁ guardar los 256 píxeles de un dibujo en 4 palabras de 256 bits (128 bytes),
   4 bits por píxel, posición = índice 0..255 en orden por filas (`índice = fila × 16 + columna`).
2. EL SISTEMA DEBERÁ usar el índice 0 como transparente y los índices 1..15 como colores visibles.
3. EL CONTRATO DEBERÁ aceptar solo arreglos de exactamente 4 palabras y revertir con
   `InvalidPixelData()` en otro caso; cualquier valor de 4 bits es un color válido.
4. EL SISTEMA DEBERÁ definir los valores hexadecimales de la paleta solo en el frontend; el contrato
   solo conoce índices.
5. CUANDO se empaqueten unos píxeles y se desempaqueten EL SISTEMA DEBERÁ obtener exactamente los
   mismos 256 índices (ida y vuelta sin pérdida), tanto en el frontend como en el contrato.

### Requisito 9: Contadores

**Historia:** Como usuario, quiero ver cuántos dibujos tengo y cuántos hay en total.

1. EL CONTRATO DEBERÁ exponer `drawingCountOf(address)` (dibujos existentes del usuario) y
   `totalDrawings()` (dibujos existentes de todos).
2. CUANDO se cree un dibujo EL CONTRATO DEBERÁ subir ambos contadores en 1; CUANDO se elimine
   (por el dueño o por el admin) DEBERÁ bajarlos en 1.
3. EL CONTRATO DEBERÁ contar en `totalDrawings()` también los dibujos de cuentas en la lista negra
   mientras existan.
4. EL CONTRATO NO DEBERÁ exponer el siguiente id como "contador".
5. EL SISTEMA DEBERÁ mostrar en Inicio el total global y, con cuenta conectada, "Tus dibujos: N / 30".

### Requisito 10: Lecturas paginadas

**Historia:** Como usuario, quiero navegar mis dibujos y la galería por páginas.

1. EL CONTRATO DEBERÁ exponer `getDrawingsByOwner(owner, offset, limit)` y `getGallery(offset,
   limit)`, ambas devolviendo la página pedida y el total de elementos de esa lista.
2. EL CONTRATO DEBERÁ devolver primero el elemento agregado más recientemente (offset 0 = último de la
   lista).
3. SI `offset` es mayor o igual al total o `limit` es 0 ENTONCES EL CONTRATO DEBERÁ devolver arreglos
   vacíos y el total, sin revertir.
4. SI `limit` es mayor a 50 ENTONCES EL CONTRATO DEBERÁ limitarlo a 50.
5. EL SISTEMA DEBERÁ paginar de 12 en 12 en "Mis dibujos" y en Galería, con botones "Anterior" y
   "Siguiente" y el texto "Página X de Y".
6. EL CONTRATO DEBERÁ mantener una lista de ids por dueño y una lista global de la galería, ambas con
   borrado por intercambio con el último (*swap-and-pop*).
7. MIENTRAS una lista esté vacía EL SISTEMA DEBERÁ mostrar un estado vacío con una acción ("Crea tu
   primer dibujo" en Mis dibujos; "Todavía no hay dibujos públicos" en Galería).

### Requisito 11: Detalle de dibujo

1. EL SISTEMA DEBERÁ mostrar en `#/dibujo/<id>` el dibujo ampliado, el título (o "Sin título"), el
   autor (nombre de usuario o dirección abreviada `0x1234…abcd`), la fecha de creación y la de última
   modificación.
2. EL SISTEMA DEBERÁ mostrar "Editar" solo al dueño que no está en la lista negra, "Eliminar" al dueño
   y al admin, y "Exportar PNG" y "Compartir" a todos.
3. SI el dibujo no existe ENTONCES EL SISTEMA DEBERÁ mostrar "Este dibujo no existe o fue eliminado"
   con un enlace a la Galería.
4. SI el autor está en la lista negra y quien mira no es el autor ni el admin ENTONCES EL SISTEMA
   DEBERÁ ocultar los píxeles y mostrar "Dibujo oculto: su autor está en la lista negra".

### Requisito 12: Nombre de usuario

**Historia:** Como usuario, quiero elegir un nombre único, opcional y cambiable.

1. EL SISTEMA DEBERÁ permitir dibujar sin nombre de usuario; sin nombre DEBERÁ mostrar la dirección
   abreviada.
2. EL CONTRATO DEBERÁ aceptar nombres de 3 a 16 caracteres del conjunto `[a-z0-9_]`; SI no cumple
   ENTONCES DEBERÁ revertir con `InvalidUsername()`.
3. EL SISTEMA DEBERÁ convertir a minúsculas lo que el usuario escribe antes de validar, para que la
   unicidad no dependa de mayúsculas.
4. SI el nombre ya pertenece a otra cuenta ENTONCES EL CONTRATO DEBERÁ revertir con
   `UsernameTaken()`.
5. SI el nombre pedido es igual al actual ENTONCES EL CONTRATO DEBERÁ revertir con
   `UsernameUnchanged()`.
6. CUANDO un usuario cambie de nombre EL CONTRATO DEBERÁ liberar el nombre anterior (otro usuario
   podrá tomarlo), asignar el nuevo y emitir `UsernameChanged(user, oldName, newName)`.
7. CUANDO el usuario escriba un nombre válido EL SISTEMA DEBERÁ consultar su disponibilidad
   (`ownerOfUsername`) y mostrar "Disponible" o "Ya está en uso" antes de simular.
8. CUANDO el cambio finalice EL SISTEMA DEBERÁ refrescar el perfil y los nombres mostrados.

### Requisito 13: Lista negra

**Historia:** Como admin, quiero bloquear cuentas que abusan, sin impedirles borrar lo suyo.

1. EL CONTRATO DEBERÁ exponer `addToBlacklist(account)` y `removeFromBlacklist(account)`, solo para
   el admin; SI otro las llama ENTONCES DEBERÁ revertir con `OwnableUnauthorizedAccount(address)`.
2. MIENTRAS una cuenta esté en la lista negra EL CONTRATO DEBERÁ revertir con `AccountBlacklisted()`
   sus llamadas a `createDrawing`, `updateDrawing` y `setUsername`.
3. MIENTRAS una cuenta esté en la lista negra EL CONTRATO DEBERÁ permitirle `deleteDrawing` sobre sus
   propios dibujos.
4. CUANDO una cuenta entre en la lista negra EL CONTRATO DEBERÁ quitar todos sus dibujos de la
   galería (sin borrarlos) y emitir `Blacklisted(account, admin)`.
5. CUANDO una cuenta salga de la lista negra EL CONTRATO DEBERÁ devolver sus dibujos existentes a la
   galería y emitir `Unblacklisted(account, admin)`.
6. SI el admin intenta bloquearse a sí mismo o bloquear al admin pendiente (`pendingOwner()`)
   ENTONCES EL CONTRATO DEBERÁ revertir con `CannotBlacklistOwner()`.
7. SI la cuenta es `address(0)` ENTONCES EL CONTRATO DEBERÁ revertir con `ZeroAddress()`; SI ya está
   en la lista ENTONCES con `AlreadyBlacklisted()`; SI se quita una cuenta que no está ENTONCES con
   `NotBlacklisted()`.
8. EL CONTRATO DEBERÁ exponer `isBlacklisted(account)` y `getBlacklist(offset, limit)` (paginada,
   mismas reglas del Requisito 10).
9. MIENTRAS la cuenta conectada esté en la lista negra EL SISTEMA DEBERÁ mostrar en todas las
   pantallas: "Tu cuenta está en la lista negra. No puedes crear ni editar dibujos ni cambiar tu
   nombre. Sí puedes eliminar tus dibujos.", deshabilitar el editor y el cambio de nombre y dejar
   habilitado "Eliminar" en sus dibujos.
10. Un usuario en la lista negra conserva su nombre de usuario.

### Requisito 14: Admin elimina dibujos de otros

1. CUANDO el admin elimine un dibujo de otro usuario (desde Detalle, Galería o el Panel admin por id)
   EL SISTEMA DEBERÁ pedir confirmación indicando el autor y usar el flujo de transacción con
   `deleteDrawing(id)`.
2. CUANDO el admin elimine un dibujo ajeno EL CONTRATO DEBERÁ aplicar el Requisito 7.2 y emitir
   `DrawingDeleted(id, owner, admin)`, con lo que se distingue del borrado propio.
3. EL CONTRATO NO DEBERÁ permitir al admin modificar dibujos ajenos.

### Requisito 15: Rol admin y transferencia

**Historia:** Como admin, quiero pasar el rol a otra cuenta de forma segura.

1. EL CONTRATO DEBERÁ usar `Ownable2Step` de OpenZeppelin 5.6.1 con `Ownable(msg.sender)` en el
   constructor: el admin inicial es la cuenta que despliega.
2. CUANDO el admin llame `transferOwnership(nuevo)` EL CONTRATO DEBERÁ dejar a `nuevo` como
   `pendingOwner()` sin cambiar el admin; CUANDO `nuevo` llame `acceptOwnership()` el rol DEBERÁ
   pasar a `nuevo`.
3. SI `nuevo` está en la lista negra ENTONCES EL CONTRATO DEBERÁ revertir con
   `NewOwnerBlacklisted()` (en `transferOwnership` y en `acceptOwnership`).
4. CUANDO el admin llame `transferOwnership(address(0))` EL CONTRATO DEBERÁ cancelar la transferencia
   pendiente.
5. CUANDO alguien llame `renounceOwnership()` EL CONTRATO DEBERÁ revertir con `RenounceDisabled()`.
6. EL SISTEMA DEBERÁ mostrar en el Panel admin: admin actual, admin pendiente, un campo para la
   dirección nueva (`0x` + 40 hex) y los botones "Transferir admin" y "Cancelar transferencia".
7. CUANDO la cuenta conectada sea `pendingOwner()` EL SISTEMA DEBERÁ mostrar en Perfil el botón
   "Aceptar rol de admin".
8. EL SISTEMA DEBERÁ mostrar en Perfil la dirección `0x…` de la cuenta del Product con un botón de
   copiar, para que el admin que desplegó desde MetaMask transfiera el rol a esa cuenta
   (`references/contratos.md`, *Cuentas y `msg.sender`*).

### Requisito 16: Dibujos ligados a la cuenta (soulbound)

1. EL CONTRATO NO DEBERÁ tener ninguna función que cambie el dueño de un dibujo (sin `transfer`,
   `approve` ni equivalentes).
2. CUANDO un dibujo se modifique EL CONTRATO DEBERÁ conservar el mismo `owner`.

### Requisito 17: Flujo de estado de transacción

**Historia:** Como usuario, quiero ver qué pasa con cada firma hasta que la app se actualiza.

1. EL SISTEMA DEBERÁ usar este flujo para todas las acciones que firman: crear, modificar, eliminar,
   cambiar nombre, agregar a la lista negra, quitar de la lista negra, eliminar como admin,
   transferir admin, cancelar transferencia y aceptar admin.
2. CUANDO empiece una acción EL SISTEMA DEBERÁ abrir un modal de estado y simular con `.query()`
   antes de pedir la firma (`references/app-sdk.md`, *Escribir*).
3. SI la simulación falla ENTONCES EL SISTEMA DEBERÁ mostrar "Error de simulación" con el error del
   contrato traducido al español, sin pedir firma, con "Cerrar" (y "Reintentar" si el error es
   recuperable).
4. CUANDO la simulación pase EL SISTEMA DEBERÁ mostrar en orden: "Esperando tu firma", "Enviada",
   "En bloque", "Finalizada", "Actualizando la app" y "Listo", con `waitFor: 'finalized'` y
   `timeoutMs: 300000`.
5. SI el usuario rechaza la firma ENTONCES EL SISTEMA DEBERÁ mostrar "Firma rechazada" con
   "Reintentar" y "Cerrar".
6. SI vence el tiempo de espera ENTONCES EL SISTEMA DEBERÁ leer el estado del contrato para saber si
   la acción se aplicó, y mostrar "Finalizada" o "No se pudo confirmar" con "Reintentar".
7. SI la cadena responde `Invalid.Payment` o `Revive.StorageDepositNotEnoughFunds` ENTONCES EL
   SISTEMA DEBERÁ pedir `SmartContractAllowance` y reintentar una sola vez (`references/app-sdk.md`,
   *Errores de firma frecuentes*).
8. MIENTRAS haya una transacción en curso EL SISTEMA DEBERÁ deshabilitar todas las demás acciones que
   firman: una firma a la vez.
9. EL SISTEMA DEBERÁ anunciar cada cambio de estado en una región `aria-live="polite"` y los errores
   con `role="alert"`.
10. CUANDO la transacción finalice EL SISTEMA DEBERÁ volver a leer los datos afectados (contadores,
    listas, dibujo, perfil, lista negra, admin y el número de bloque del encabezado) antes de mostrar
    "Listo".
11. EL SISTEMA DEBERÁ firmar las llamadas al contrato con el firmante de
    `getAccountsProvider().getProductAccountSigner(…, { txExtVersion: 1 })`.
12. SI la transacción falla después de enviarse (error en `onStatus` o `.tx()` sin `ok` tras difundir)
    ENTONCES EL SISTEMA DEBERÁ salir del estado en curso, mostrar el error clasificado en español y
    liberar el bloqueo de firma.
13. CUANDO la transacción llegue a "Finalizada" EL SISTEMA DEBERÁ comprobar en el contrato que la
    acción se aplicó y, SI no se aplicó, ENTONCES mostrar "La transacción entró en la cadena pero no
    se aplicó." con "Reintentar" y "Cerrar".
14. MIENTRAS el estado sea "Simulando" EL SISTEMA DEBERÁ ofrecer "Cancelar", que descarta la
    simulación y libera el bloqueo sin pedir firma.

### Requisito 18: Exportar PNG

1. CUANDO el usuario pulse "Exportar PNG" EL SISTEMA DEBERÁ generar un PNG de 512 × 512 (cada píxel
   ampliado 32 veces, sin suavizado, transparente donde el índice es 0) con nombre
   `dot-pixel-<id>.png`.
2. SI la descarga no está disponible en el Host ENTONCES EL SISTEMA DEBERÁ mostrar la imagen en un
   modal con el texto "Mantén pulsada la imagen para guardarla".

### Requisito 19: Compartir enlace

1. CUANDO el usuario pulse "Compartir" EL SISTEMA DEBERÁ mostrar dos enlaces al detalle del dibujo:
   el del Host (dominio `.dot` del Product + `#/dibujo/<id>`) y el de dot.li
   (`https://<etiqueta>.dot.li/#/dibujo/<id>`) para abrirlo desde el light client.
2. EL SISTEMA DEBERÁ obtener el dominio del Product del Host con `getProductContext()` (timeout de
   3 s) y, si no responde, deducirlo de la URL; como último recurso, de la configuración del build.
3. EL SISTEMA DEBERÁ ofrecer "Copiar" para cada enlace y, SI el portapapeles no está disponible,
   ENTONCES mostrar el enlace en un campo de texto seleccionable.
4. EL SISTEMA DEBERÁ usar rutas con hash (`#/…`) para que los enlaces funcionen con `base: './'`.

### Requisito 20: Estados de la app

1. EL SISTEMA DEBERÁ tener estados explícitos para: fuera del Host, sin conexión con el Host, cargando,
   lista vacía, error de lectura (con "Reintentar") y cuenta en la lista negra.
2. CUANDO falle una lectura EL SISTEMA DEBERÁ mostrar qué no se pudo cargar y un botón "Reintentar";
   NO DEBERÁ mostrar trazas internas.
3. SI una firma o una lectura por el Host falla con un error de conexión del Host (texto
   `Host provider` o `disconnect`) ENTONCES EL SISTEMA DEBERÁ mostrar "Se perdió la conexión con el
   Host" y un botón "Reconectar" que repite la conexión de la sesión; SI la reconexión falla ENTONCES
   DEBERÁ mostrar el error con "Reintentar". (La skill no documenta un evento de desconexión del Host:
   la pérdida solo se detecta por esos errores; **no verificado** que exista otro mecanismo.)

### Requisito 21: Diseño visual

1. EL SISTEMA DEBERÁ usar los tokens de la referencia 1: fuente pixel para título, encabezados,
   botones y etiquetas pequeñas en mayúsculas; sans legible para el cuerpo; bordes negros de 2–3 px;
   sombras sólidas desplazadas 4 px a la derecha y abajo, sin difuminado; esquinas cuadradas.
2. EL SISTEMA DEBERÁ aplicar la paleta de la referencia 2 con 60-30-10: 60 % `#e5dde6` (fondos), 30 %
   `#dfcae1` y `#c0a0c3` (barras, paneles, cuerpo de modales, hover), 10 % `#8f7193` (botón primario,
   herramienta activa, insignias, línea de acento) con `#a788ab` para hover/presionado.
3. EL SISTEMA DEBERÁ usar negro para texto y bordes y grafito `#2b2b2b` para las sombras; el texto
   sobre botones de acento DEBERÁ ser negro.
4. Todo par texto/fondo DEBERÁ tener contraste ≥ 4.5:1 (≥ 3:1 para texto grande y componentes de
   interfaz), según la tabla de `design.md` §8.4.
5. EL SISTEMA DEBERÁ servir las fuentes desde el propio bundle, sin CDN externo.
6. EL SISTEMA DEBERÁ funcionar desde 320 px de ancho, con diseño principal a 380 px.

### Requisito 22: Accesibilidad

1. EL SISTEMA DEBERÁ permitir mover un cursor de celda en el lienzo con las flechas y aplicar la
   herramienta con Enter o Espacio, anunciando fila, columna y color.
2. EL SISTEMA DEBERÁ dar nombre accesible (`aria-label`) a todos los botones de icono y marcar la
   herramienta activa con `aria-pressed="true"`.
3. EL SISTEMA DEBERÁ mostrar el foco visible en todos los controles (`:focus-visible`, contraste
   ≥ 3:1).
4. EL SISTEMA DEBERÁ ofrecer una alternativa sin arrastre para desplazar el lienzo (barras de
   desplazamiento y flechas con la herramienta mano).
5. CUANDO `prefers-reduced-motion: reduce` esté activo EL SISTEMA DEBERÁ quitar animaciones y
   transiciones.
6. Los modales DEBERÁN atrapar el foco, cerrarse con Escape (salvo durante "Esperando tu firma" y los
   estados en curso) y devolver el foco al control que los abrió.
7. Los objetivos táctiles DEBERÁN medir al menos 44 × 44 px (mínimo WCAG 24 × 24).
8. EL SISTEMA DEBERÁ declarar `lang="es"`.

### Requisito 23: Plataforma (reglas de Products Devnet)

1. EL SISTEMA DEBERÁ conectar a Products Devnet con `createChainClient({ chains: { assetHub:
   devnet_asset_hub } })` y NO DEBERÁ usar `getChainAPI()` ni redes `paseo`/`paseo_asset_hub`
   (`SKILL.md`, *Reglas obligatorias*; `references/red-devnet.md`).
2. EL SISTEMA DEBERÁ usar exactamente las versiones de `references/versiones.md`, sin `^` ni `~`, solo
   con pnpm 12.6.0.
3. EL CONTRATO DEBERÁ usar `pragma solidity 0.8.28;`, compilarse sin optimizador, desplegarse con
   Remix + MetaMask y medir menos de 24,576 bytes de runtime (`references/contratos.md`).
4. EL SISTEMA DEBERÁ configurar Vite con `base: './'` y el plugin que deja solo el descriptor del
   devnet (`references/app-sdk.md`, *Vite*).
5. EL SISTEMA NO DEBERÁ pedir, leer, escribir ni mostrar mnemónicos, llaves privadas ni `.env` con
   secretos.

### Requisito 24: Pruebas locales con Foundry

1. EL PROYECTO DEBERÁ tener pruebas `forge test` con solc 0.8.28 sin optimizador y OpenZeppelin 5.6.1,
   igual que en Remix. Foundry solo se usa para probar; el despliegue sigue en Remix.
2. Las pruebas DEBERÁN cubrir cada regla de la lista negra (13.1–13.8), permisos de dueño y admin,
   eliminación de dibujos ajenos por el admin, transferencia en dos pasos, nombre de usuario
   (unicidad, cambio, liberación, longitud y caracteres), límite de 30, contadores solo con dibujos
   existentes, bordes de la paginación, ida y vuelta del empaquetado de píxeles y ausencia de
   transferencia de dibujos.

### Requisito 25: Publicación

1. EL PROYECTO DEBERÁ publicarse con `pad` 0.22.1 según `references/publicar.md`: pruebas con
   `--no-manifest` a un nombre temporal y publicación final con `polkadot-app-deploy.config.mjs`
   (`domain: process.env.APP_DOT`), sin `pad login`, sin mnemónico.
2. Conectar, firmar y PGAS DEBERÁN probarse solo con la app publicada en su `.dot` y abierta desde el
   Host; nunca en `localhost` (`references/app-sdk.md`, *Dónde probar*).
3. EL SISTEMA DEBERÁ mostrar en Inicio un sello de versión con la fecha del build
   (`references/publicar.md`, §5).

### Requisito 26: Idioma

1. EL SISTEMA DEBERÁ mostrar todo texto de interfaz, mensajes de error y estados en español.

### Requisito 27: Copiar mi dirección (para recibir el rol de admin)

**Historia:** Como usuario conectado, quiero copiar la dirección `0x…` de mi cuenta en la app, para que
el admin actual me transfiera el rol desde Remix con `transferOwnership`.

1. MIENTRAS haya una cuenta conectada EL SISTEMA DEBERÁ mostrar en Perfil y en el Panel admin la
   dirección H160 (`me.h160Address`, la que el contrato ve como `msg.sender`) completa, en un campo de
   solo lectura con fuente monoespaciada, y la SS58 como dato secundario.
2. CUANDO el usuario pulse "Copiar mi dirección" EL SISTEMA DEBERÁ copiar exactamente la dirección
   `0x…` mostrada y anunciar "Copiada" en una región `aria-live`.
3. SI `navigator.clipboard` no existe o falla ENTONCES EL SISTEMA DEBERÁ seleccionar el texto del
   campo y mostrar "Copia la dirección con Ctrl+C" (permiso de portapapeles en el Host: **no
   verificado**).
4. EL SISTEMA DEBERÁ mostrar junto al botón: "Para hacerte admin: en Remix, con la cuenta admin
   actual, llama transferOwnership con esta dirección y luego pulsa 'Aceptar rol de admin' aquí."
5. CUANDO `pendingOwner()` sea la cuenta conectada EL SISTEMA DEBERÁ mostrar "Aceptar rol de admin",
   con el flujo de estado de transacción del Requisito 17.

## Requisitos no funcionales

- RNF1. Seguridad: el contrato decide todos los permisos con `msg.sender`; la app no protege nada
  (`references/contratos.md`, *Seguridad mínima*). Sin funciones `payable`, sin llamadas externas.
- RNF2. Costo: guardar lo mínimo por dibujo (≈ 9 ranuras) para bajar el depósito de almacenamiento
  (`references/contratos.md`, *Gas*).
- RNF3. Bucles acotados: ninguna función que escribe recorre más de 30 dibujos; las validaciones de
  cadenas recorren como máximo 31 bytes (título) o 16 bytes (nombre); ninguna lectura devuelve más de
  50 elementos.
- RNF4. Rendimiento: pintar una celda se refleja en pantalla en menos de 50 ms en un teléfono de gama
  media; una página de galería se muestra en menos de 3 s con ETH-RPC disponible.
- RNF5. Privacidad: no se guardan datos personales aparte de la dirección y el nombre elegido; sin
  analítica ni servicios externos aparte del ETH-RPC del devnet.

## Fuera de alcance

- Transferir, vender o regalar dibujos; precios, comisiones o pagos (solo gas).
- Ranking, trofeos, likes o comentarios.
- Selector de color libre, paletas personalizadas, tamaño de pincel, lienzos de otro tamaño, capas,
  animación.
- Borrar el nombre de usuario; que el admin edite nombres o dibujos ajenos.
- Varios admins o roles adicionales (`AccessControl`).
- Contrato actualizable (proxy) y migración de datos entre versiones.
- Borradores guardados en el dispositivo.
- Despliegue con Foundry, Hardhat o scripts (el despliegue es con Remix + MetaMask).
- Otras redes distintas de Products Devnet.
