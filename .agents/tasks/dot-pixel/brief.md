GOAL: Write a Kiro spec (documents only, NO application code) for a Polkadot Product: a 16x16 pixel-art drawing app. Output three Markdown files, written in SPANISH:
- c:/Users/brand/Downloads/pixel/.kiro/specs/dot-pixel/requirements.md (user stories + acceptance criteria in EARS format: "CUANDO ... EL SISTEMA DEBERÁ ...")
- c:/Users/brand/Downloads/pixel/.kiro/specs/dot-pixel/design.md (architecture, smart contract data model + function signatures + events + custom errors, frontend screens/components/state machine, design tokens, testing strategy, open/unverified items)
- c:/Users/brand/Downloads/pixel/.kiro/specs/dot-pixel/tasks.md (ordered checklist of implementation tasks using "- [ ] 1. ..." / "- [ ] 1.1 ..." markdown checkboxes, each task referencing the requirement numbers it satisfies)

This is documentation work; no worktree. Workspace root: c:/Users/brand/Downloads/pixel (only contains .agents/skills/). Do not write any source code, package.json, or contracts.

MANDATORY SOURCES the agents must read before writing (installed skills in the workspace):
- c:/Users/brand/Downloads/pixel/.agents/skills/polkadot-products-devnet/SKILL.md and its references/ folder (red-devnet.md, versiones.md, contratos.md, app-sdk.md, publicar.md, errores-comunes.md, fuentes.md). This skill's "Reglas obligatorias" are binding: Products Devnet (Asset Hub 1000, chainId 420420417, descriptor devnet_asset_hub), exact pinned versions (@parity/product-sdk 0.39.0, polkadot-api 3.2.1, descriptors alias, @parity/truapi 0.25.0, pnpm 12.6.0, only pnpm), Solidity `pragma solidity 0.8.28;` no optimizer, REVM, deploy with Remix + MetaMask, 24,576-byte contract size limit, OpenZeppelin 5.6.1, createChainClient (not getChainAPI), `.query()` before every `.tx()`, one signature at a time, waitFor 'finalized', PGAS via SmartContractAllowance and txExtVersion: 1 product account signer, Vite base './' + descriptor-only plugin, no Host connects to localhost (signing tests only on published .dot), publish with pad 0.22.1 per references/publicar.md, never handle secrets. The spec must comply; cite the reference file where a decision comes from; mark anything not found in the references as "no verificado".
- c:/Users/brand/Downloads/pixel/.agents/skills/develop-secure-contracts/SKILL.md and c:/Users/brand/Downloads/pixel/.agents/skills/solidity-security/SKILL.md (contract security patterns)
- c:/Users/brand/Downloads/pixel/.agents/skills/frontend-design/SKILL.md, c:/Users/brand/Downloads/pixel/.agents/skills/accessibility/SKILL.md, c:/Users/brand/Downloads/pixel/.agents/skills/security-and-hardening/SKILL.md
(If any SKILL.md references sub-files, read the relevant ones.)

DECISIONS ALREADY MADE WITH THE USER (all binding):

Concept
- Each drawing is its own independent 16x16 canvas. Drawings are soulbound to the creator's address: no transfer function.
- UI language: Spanish. App name provisional "DOT PIXEL" (keep it configurable / easy to change).

Roles
- Usuario normal: create, modify and delete drawings they own (identity = their address).
- Admin: everything a normal user can do, plus add/remove addresses to/from the blacklist and delete drawings of other users.
- Admin = the initial deployer, with a function to transfer the admin/owner role ("swap de owner"). Use OpenZeppelin 5.6.1 Ownable2Step (two-step transfer) unless the designer finds a documented reason against it; record the choice.

Smart contract storage
- Username: optional (not required to draw), UNIQUE, changeable (new name must not be assigned to someone else; releasing the old name on change), max length 16 characters. Designer defines the allowed charset (recommendation: [a-z0-9_], and case-normalized uniqueness) and min length; record as decision. UI shows abbreviated address when no username.
- Per drawing: id, owner, title, createdAt, updatedAt, and pixels.
- Pixels: position = index 0..255 (row-major), color = FIXED 16-COLOR PALETTE, 4 bits per pixel, packed (128 bytes = 4 storage slots, e.g. bytes32[4] or uint256[4]). Empty/transparent pixel must be representable: designer chooses between (a) a 256-bit bitmap (1 extra slot) or (b) reserving palette index 0 as transparent (15 visible colors); justify the choice. Designer must also define the 16 palette colors (should harmonize with the UI palette below but cover a usable pixel-art range) and note the palette is fixed at the contract level (indices) while hex values live in the frontend.
- Counters: individual (per user) and global, counting ONLY EXISTING drawings (decrement on delete). A separate monotonically increasing nextId is fine for ids but is not exposed as "count".
- Per-user limit: max 30 existing drawings.
- Per-owner list of drawing ids (swap-and-pop on delete) plus a global enumeration; ALL reads paginated (offset/limit) for both "my drawings" and the global gallery. Events DrawingCreated, DrawingUpdated, DrawingDeleted (including who deleted, to distinguish admin deletion), UsernameChanged, Blacklisted/Unblacklisted.
- Blacklist rules: blacklisted address cannot create, edit, or change username; CAN delete its own drawings; its drawings are hidden from the gallery (frontend filter and/or contract-level flag; designer decides and documents); admin can remove from the blacklist; admin cannot blacklist itself (and consider: cannot blacklist the current owner).
- Delete = real `delete` (free storage), admin deletion emits event with the deleter.
- Everything is free: no fees/payable functions; only tx gas (PGAS per skill).
- Contract must stay under 24,576 bytes; designer should estimate and note risk.

Contract testing
- Deploy will be with Remix, but local tests with FOUNDRY. tasks.md must include writing Foundry tests (forge) that validate: blacklist rules (each one above), ownership/admin checks, admin deletion of others' drawings, Ownable2Step transfer, username uniqueness/change/release/length, 30-drawing limit, counters only counting existing drawings, pagination edge cases, pixel packing round-trip, soulbound (no transfer). Note Foundry setup must use solc 0.8.28 without optimizer and OZ 5.6.1 to match Remix.

Frontend screens / features
- Header: left = app icon + app name; right = cube icon + current block number of the network (live). Designer must find in references/app-sdk.md how to subscribe to the block number; if not documented, mark "no verificado".
- Screens: Home (public), Editor, Mis dibujos, Galería global (paginated, blacklisted owners hidden), Detalle de dibujo, Perfil (username), Panel admin (only visible to the admin: blacklist add/remove/list, delete any drawing). The trophy/ranking from the reference is REMOVED.
- Without a connected account: only Home is accessible; every other section is blocked with a clear CTA to connect.
- Editor tools: hand/pan, brush (always 1 px; brush size +/- REMOVED), eraser, eyedropper, import image (downscale to 16x16 and quantize to the 16-color palette), palette color selector (fixed 16 colors; the reference's free color picker becomes a palette picker), zoom +/-, center, toggle grid, undo/redo, clear canvas, title input.
- Bottom bar (adapted from reference "Confirm Paint"): "Guardar dibujo" with count of changed pixels.
- TRANSACTION STATUS UX (important user requirement): for EVERY user interaction that needs a signature (create, update, delete, set username, admin blacklist add/remove, admin delete, admin transfer), show a dedicated status screen/modal with a state machine: simulando (.query()) → error de simulación (with decoded custom error in Spanish) OR esperando firma → enviada/en bloque (best-block) → finalizada → app actualizada (refetch of affected data: counters, lists, drawing, header); plus rechazada por el usuario and error states, with retry/close. Only one signature at a time (block other tx actions while one is pending).
- States: no Host connection, account blacklisted (clear message, still allowed to delete own drawings), loading, empty lists, errors.
- Extras: export drawing to PNG (upscaled), and share link of a drawing: link taken from the Host (designer checks references for how the app's .dot URL / route is obtained; mark "no verificado" if not documented) plus a dot.li link to open it from the light client (e.g. https://<nombre>.dot.li/... — verify the format in the skill references/fuentes or mark "no verificado"). Drawings need a routable URL (hash routing, since Vite base './').

Design (reference image 1 cannot be shown; here is its description)
- Reference "DOT PIXEL" mobile UI (~380px wide): pixel/bitmap display font for title, headings, button labels and small uppercase labels (e.g. "Press Start 2P" / "Silkscreen"-like; designer picks a self-hosted font, no external CDN, since the app runs in a sandbox); body text in a clean sans. Thick black borders (~2-3px), solid hard offset shadows (~4px right/down, no blur), square icon buttons with border + shadow, active tool filled with accent color. Light canvas area with thin light-gray grid lines. Top toolbar row of tool buttons inside a bordered box with shadow. Vertical zoom control column bottom-left (+, -, center, grid). Modal: black title bar with white uppercase pixel-font title and an X close, white body, full-width primary button with accent fill, black border, uppercase pixel-font label. Bottom sheet separated by a 3px accent line on top, label "Selected Pixels" with a small accent badge counter, small uppercase secondary label, large accent value on the right, and a full-width disabled gray button with icon. Square corners everywhere (no border radius).
- Keep those tokens (typography, borders, hard shadows, square shapes, spacing, grid) but REPLACE the color palette with: #8f7193, #a788ab, #c0a0c3, #dfcae1, #e5dde6, applying 60-30-10:
  - 60% dominant: #e5dde6 (backgrounds, canvas surround)
  - 30% secondary: #dfcae1 and #c0a0c3 (bars, panels, modals body/sections, hover states)
  - 10% accent: #8f7193 (primary buttons, active tool, badges, accent line), #a788ab for hover/pressed
  - Neutrals outside the 60-30-10: black for text and borders, graphite (e.g. #2b2b2b-ish, designer picks) for hard shadows. Text on accent buttons is BLACK (white on #8f7193 is ~4.2:1, fails WCAG AA). Designer must verify all text/background contrast pairs >= 4.5:1 (3:1 for large text/UI components) and list them with ratios in design.md.
- Include design tokens as a CSS custom properties table in design.md. Accessibility: keyboard navigation of the canvas and tools, focus visible, aria labels for icon buttons, aria-live for transaction status, prefers-reduced-motion.

tasks.md must order work roughly: Foundry project + contract + tests -> Remix deploy notes (address + ABI) -> Vite/TS project with pinned versions verified with `node c:/Users/brand/Downloads/pixel/.agents/skills/polkadot-products-devnet/scripts/verificar-entorno.mjs` -> SDK connection/reads -> design tokens/layout -> editor -> lists/gallery/detail -> tx status flow -> profile/admin -> export/share -> publish with pad (testing use with --no-manifest, then final). Keep tasks concrete and verifiable.

design.md must end with a section "Puntos abiertos / no verificado" listing anything the references don't confirm.

VERIFICATION: every decision listed above appears in requirements.md with acceptance criteria and is reflected in design.md and tasks.md; nothing contradicts the polkadot-products-devnet "Reglas obligatorias"; contrast table present; Foundry test tasks cover each blacklist rule; files exist at the exact paths above and are in Spanish.

ORIGINAL USER CONTEXT: the user asked for a Polkadot pixel-art canvas app (16x16), with roles normal/admin, design reference taken from two images (tokens from image 1, palette from image 2, 60/30/10), contract storing username, pixel positions+colors, individual and global counters, blacklist. Answers: canvases limited and soulbound to an address; admin = initial deployer with owner swap; counters only count existing drawings; reads paginated with id lists; unique username changeable and optional, 16 chars; Remix for deploy, Foundry for local tests; everything free except gas; 30 drawings per user; a status screen for every signature/interaction; brush 1px; header left icon+name, right cube+block number; tx states with prior simulation; no account = only Home; share link from host plus dot.li; language ES; black text and graphite for shadows.
