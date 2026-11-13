import { describe, expect, it } from 'vitest';
import { encodeErrorResult } from 'viem';
import { dotPixelViemAbi } from '../src/contract/abi';
import { classifySignError, decodeContractError, messageForError } from '../src/tx/errors';
import { initialTx, txReducer, type TxContext, type TxEvent } from '../src/tx/txMachine';
import { productIdFromHost } from '../src/chain/productId';
import { parseRoute } from '../src/ui/router';

const run = (events: TxEvent[], start: TxContext = initialTx()): TxContext => events.reduce(txReducer, start);

describe('máquina de estados de tx', () => {
  it('camino feliz completo', () => {
    const c = run([
      { type: 'START' },
      { type: 'SIM_OK' },
      { type: 'STATUS', status: 'signing' },
      { type: 'STATUS', status: 'broadcasting' },
      { type: 'STATUS', status: 'in-block' },
      { type: 'STATUS', status: 'finalized' },
      { type: 'VERIFIED', ok: true },
      { type: 'REFRESH_OK' },
    ]);
    expect(c.state).toBe('done');
    expect(run([{ type: 'CLOSE' }], c).state).toBe('idle');
  });
  it('estados saltados y repetidos', () => {
    const c = run([{ type: 'START' }, { type: 'SIM_OK' }, { type: 'STATUS', status: 'finalized' }]);
    expect(c.state).toBe('finalized');
    const d = run([{ type: 'START' }, { type: 'SIM_OK' }, { type: 'STATUS', status: 'in-block' }, { type: 'STATUS', status: 'broadcasting' }]);
    expect(d.state).toBe('inBlock');
  });
  it('error de simulación y reintento', () => {
    const c = run([{ type: 'START' }, { type: 'SIM_FAIL', message: 'x' }]);
    expect(c.state).toBe('simError');
    expect(run([{ type: 'RETRY' }], c).state).toBe('simulating');
  });
  it('gas: un solo reintento', () => {
    const c = run([{ type: 'START' }, { type: 'NEED_GAS' }, { type: 'GAS_OK' }, { type: 'NEED_GAS' }]);
    expect(c.state).toBe('error');
    const d = run([{ type: 'START' }, { type: 'SIM_OK' }, { type: 'NEED_GAS' }]);
    expect(d.state).toBe('requestingGas');
  });
  it('rechazo, pipeline 0 una vez, timeout', () => {
    expect(run([{ type: 'START' }, { type: 'SIM_OK' }, { type: 'REJECTED' }]).state).toBe('rejected');
    const p = run([{ type: 'START' }, { type: 'SIM_OK' }, { type: 'PIPELINE_FALLBACK' }]);
    expect(p.state).toBe('simulating');
    expect(p.pipeline).toBe(0);
    expect(run([{ type: 'SIM_OK' }, { type: 'PIPELINE_FALLBACK' }], p).state).toBe('error');
    const t = run([{ type: 'START' }, { type: 'SIM_OK' }, { type: 'STATUS', status: 'broadcasting' }, { type: 'TIMEOUT' }]);
    expect(t.state).toBe('verifying');
    expect(run([{ type: 'VERIFY_FAIL' }], t).state).toBe('uncertain');
    expect(run([{ type: 'VERIFY_OK' }], t).state).toBe('updating');
  });
  it('verificación fallida tras finalizar y cancelar simulación', () => {
    const f = run([{ type: 'START' }, { type: 'SIM_OK' }, { type: 'STATUS', status: 'finalized' }, { type: 'VERIFIED', ok: false }]);
    expect(f.state).toBe('error');
    expect(run([{ type: 'START' }, { type: 'CANCEL' }]).state).toBe('idle');
  });
  it('errores después de enviar', () => {
    const c = run([{ type: 'START' }, { type: 'SIM_OK' }, { type: 'STATUS', status: 'in-block' }, { type: 'TX_ERROR', message: 'x' }]);
    expect(c.state).toBe('error');
  });
  it('eventos no listados se ignoran', () => {
    const c = run([{ type: 'START' }, { type: 'VERIFIED', ok: true }]);
    expect(c.state).toBe('simulating');
  });
});

describe('errores', () => {
  it('decodifica un revert codificado con viem', () => {
    const data = encodeErrorResult({ abi: dotPixelViemAbi, errorName: 'DrawingLimitReached', args: ['0x6d465F5CB6FFc918761d4cC9A675F1ED2c6bB764'] });
    const d = decodeContractError({ type: 'ContractRevertedWithPayload', data });
    expect(d?.name).toBe('DrawingLimitReached');
    expect(messageForError(d)).toMatch(/30 dibujos/);
  });
  it('usa decoded del SDK si viene', () => {
    expect(decodeContractError({ decoded: { errorName: 'UsernameTaken', args: ['x'] } })?.name).toBe('UsernameTaken');
    expect(messageForError({ name: 'BlacklistUnchanged', args: ['0x', true] })).toMatch(/ya estaba bloqueada/);
    expect(messageForError(null)).toMatch(/rechazó/);
  });
  it('clasifica errores de firma', () => {
    expect(classifySignError(new Error('User rejected'))).toBe('rejected');
    expect(classifySignError('Invalid.Payment')).toBe('gas');
    expect(classifySignError('Revive.StorageDepositNotEnoughFunds')).toBe('gas');
    expect(classifySignError('Invalid.Stale')).toBe('session');
    expect(classifySignError('timeout waiting')).toBe('timeout');
    expect(classifySignError('Host provider unavailable')).toBe('host');
    expect(classifySignError('chain declares no transaction-extension pipeline version 1')).toBe('pipeline');
    expect(classifySignError('boom')).toBe('unknown');
  });
});

describe('productId y rutas', () => {
  it('productIdFromHost con las 5 formas', () => {
    for (const h of ['mi-app.dot', 'mi-app.dot.li', 'mi-app.app.dot.li', 'mi-app.dev-dot.li', 'mi-app.app.dev-dot.li'])
      expect(productIdFromHost(h)).toBe('mi-app.dot');
    expect(productIdFromHost('localhost')).toBeNull();
  });
  it('parseRoute', () => {
    expect(parseRoute('#/').name).toBe('home');
    expect(parseRoute('#/dibujo/12')).toMatchObject({ name: 'detail', id: 12 });
    expect(parseRoute('#/editor/0').name).toBe('invalid');
    expect(parseRoute('#/galeria?p=3')).toMatchObject({ name: 'gallery', page: 3 });
    expect(parseRoute('#/galeria?p=abc').page).toBe(1);
    expect(parseRoute('#/nada').name).toBe('invalid');
  });
});
