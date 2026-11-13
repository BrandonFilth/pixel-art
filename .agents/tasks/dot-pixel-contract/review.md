# DotPixel: soulbound 16x16 pixel-art registry with admin blacklist

The change adds `DotPixel`, a single Solidity 0.8.28 contract for Products Devnet (REVM) that stores 16x16 drawings packed at 4 bits per pixel into `bytes32[4]`, plus optional unique usernames and an admin-managed blacklist. Admin is OpenZeppelin 5.6.1 `Ownable2Step` with the deployer as initial owner and `renounceOwnership` disabled. Drawings are soulbound by omission: no transfer or approval path exists, and the owner is fixed at creation. A Foundry suite of 49 tests (3 fuzz), a flattened Remix file, the exported ABI and Spanish deployment and decision docs come with it. I ran `forge build --sizes` (runtime 13,178 B of 24,576 B) and `forge test` (49 passed, 0 failed) from `contracts/`; both match the evidence in DECISIONS.md.

Watch for: DECISIONS.md says `owner`, `createdAt` and `updatedAt` share one storage slot, but the compiled layout puts `updatedAt` in its own slot (confirmed), so each drawing uses 7 slots and the storage-deposit reasoning built on that claim is wrong. A blacklisted account's username stays reserved and nobody, the admin included, can release it (confirmed). Neither one blocks deployment.

**Verdict**: APPROVED

## High-level view

Writes are O(1). Create pushes onto a per-owner list and a global list, and delete swap-and-pops both using index mappings. The counters (`totalDrawings`, `drawingCount`) are the list lengths, so they only count drawings that exist, and the 30-drawing cap frees a slot when a drawing is deleted. `nextId` starts at 1 and never decreases.

Only the drawing owner can update, and only while not blacklisted. The owner (even when blacklisted) or the admin can delete, and `deletedBy` in the event tells the two apart. The contract keeps the active admin off the blacklist. There are no payable functions and no external calls, so reentrancy and fees don't apply. The MetaMask deployer is not the app's Product account, so the admin panel needs a `transferOwnership` plus an in-app `acceptOwnership`.

The gaps are small. The storage-packing claim in DECISIONS.md is wrong, which affects deposit estimates rather than behavior. Blacklisting freezes a username permanently, because the blacklist blocks `setUsername("")` and there is no admin override. The tests skip update with a title over 32 bytes and the page-size cap on `getDrawingsByOwner`. Deployment tooling matches the references (pragma, optimizer off, OZ 5.6.1 via a flattened file whose `DotPixel` body is identical to `src/`, chainId 420420417), and the EVM version (`cancun`) is marked "no verificado".

<details>
<summary>Issues (4)</summary>

1. **Wrong storage-packing claim in DECISIONS.md** — §3 says owner + `createdAt` + `updatedAt` fit in one slot, but 20+8+8 = 36 bytes, so `updatedAt` takes slot 1 (confirmed via `forge inspect DotPixel storageLayout`). Fix the text to say 7 slots per drawing (8 when the title is exactly 32 bytes). If the deposit matters, use `uint48` timestamps to fit one slot, but that departs from the agreed `uint64`.
2. **Blacklisted username is frozen forever** — the `notBlacklisted` modifier on `setUsername` blocks clearing, and no admin function releases a name, so a blacklisted account keeps its (possibly abusive) name reserved permanently (confirmed). Record this as a deliberate decision in DECISIONS.md §7/§8, or add an `onlyOwner` release function.
3. **Update title-length path untested** — `test_TitleValidation` checks `updateDrawing` only with `""`; add a 33-byte title case for update (confirmed missing).
4. **Owner-page cap untested** — `test_PaginationLimitCapped` exercises only `getAllDrawings`; add a cap or `offset >= total` check for `getDrawingsByOwner` (confirmed missing; same `_page` helper, so the risk is low).

</details>

<details>
<summary>Details</summary>

### Drawing storage layout and the packing claim

`Drawing` is declared as `owner` (address), `createdAt` (uint64), `updatedAt` (uint64), `title` (string), `pixels` (bytes32[4]). An address takes 20 bytes, so only one `uint64` fits beside it. `forge inspect DotPixel storageLayout` shows `owner` slot 0 offset 0, `createdAt` slot 0 offset 20, `updatedAt` slot 1, `title` slot 2, `pixels` slots 3–6, 224 bytes total (confirmed). DECISIONS.md §3 claims all three share a slot. Behavior isn't affected, but contratos.md (*Gas*) explains that every new slot costs a storage deposit, and readers will use this doc to estimate it. A 32-byte title moves to long-string storage and adds one more slot. `uint48` timestamps would recover one slot per drawing, but the brief fixed `uint64`, so correcting the doc is the minimum fix.

### Swap-and-pop lists and pagination order

```
createDrawing:  _ownerIds[owner].push(id)  _ownerIndex[id] = pos
                _allIds.push(id)           _allIndex[id]   = pos
deleteDrawing:  swap last into pos, pop, delete index entry   (both lists)
                delete _drawings[id]
counts:         drawingCount = _ownerIds[a].length   totalDrawings = _allIds.length
```

Because of swap-and-pop, the order isn't chronological after a delete, and concurrent deletes can skip or repeat an item across pages. DECISIONS.md §6 documents both and tells the frontend to dedupe by `id`. A full 50-item page costs about 1.15M EVM gas in `eth_call`. Whether the devnet ETH-RPC accepts that is marked "no verificado", with a fallback to a smaller `limit`. The cap test covers only `getAllDrawings`, not `getDrawingsByOwner` (confirmed). Both call the same `_page`, so the gap is low risk.

### Admin handoff to the Product account

The overrides of `transferOwnership`/`acceptOwnership` and the `CannotBlacklistOwner` check together keep the active admin off the blacklist, while a former admin can still be blacklisted after handover. DECISIONS.md §2 and DEPLOY_REMIX.md §9 point out that the MetaMask deployer and the Product account are different `msg.sender`s (contratos.md, *Cuentas*). Until the deployer runs `transferOwnership` to the Product account and that account calls `acceptOwnership` from the app, no in-app account has admin rights. The frontend spec has to include an accept action shown when `pendingOwner()` equals the connected account.

### Username blacklist freeze

`setUsername` carries `notBlacklisted`, so a blacklisted account can't clear its own name, and no admin function releases a name (confirmed). An abusive username therefore stays reserved and keeps resolving through `ownerOfUsername` for as long as the account is blacklisted. The frontend can hide it, since `usernameOf` still returns it and the UI knows the blacklist state, but nobody else can take the name. DECISIONS.md §8 lists "asignar/cambiar/borrar username" as blocked without stating this consequence. Either record it as intended or add an `onlyOwner` release.

### Titles as untrusted input

Titles are checked only for length (1..32 bytes) and may hold any bytes, including control characters and invalid UTF-8. DECISIONS.md §3 hands that validation to the frontend. Anyone can call the contract directly (contratos.md, *Seguridad mínima*), so the frontend must render titles as text, never as HTML, whatever it validates on input. The tests cover the 0, 32 and 33-byte cases on create but only the empty case on update (confirmed).

</details>

<details>
<summary>File map</summary>

- `contracts/src/DotPixel.sol` — the contract: drawings, pixel packing, lists and counters, pagination, usernames, blacklist, Ownable2Step overrides.
- `contracts/test/DotPixel.t.sol` — 46 unit tests and 3 fuzz tests.
- `contracts/foundry.toml`, `foundry.lock` — solc 0.8.28, optimizer off, cancun, OZ v5.6.1 and forge-std v1.17.0 pins.
- `contracts/remix/DotPixel.flat.sol` — `forge flatten` output with the pragma normalized to `0.8.28`.
- `contracts/abi/DotPixel.json` — exported ABI (29 functions, 7 events, 15 errors, no payable).
- `contracts/DEPLOY_REMIX.md` — Spanish Remix + MetaMask deployment guide.
- `contracts/DECISIONS.md` — decisions, errors with Spanish UI messages, verification log.
- `contracts/deployments.md` — empty template for the deployed address.

The workspace has no VCS, so the review covers the files on disk. Build and test evidence: `forge build --sizes` → DotPixel runtime 13,178 B; `forge test` → 49 passed, 0 failed.

</details>
