// Decodificación de reverts y clasificación de errores de firma (design.md §5.6).

import { BaseError, ContractFunctionRevertedError, decodeErrorResult } from 'viem';
import { dotPixelViemAbi } from '../contract/abi';

export interface DecodedError {
  name: string;
  args: readonly unknown[];
}

const MESSAGES: Record<string, (args: readonly unknown[], ctx?: string) => string> = {
  DrawingNotFound: () => 'Este dibujo no existe o fue borrado.',
  NotDrawingOwner: () => 'Este dibujo no es tuyo. Solo su autor puede modificarlo.',
  Blacklisted: (_a, ctx) =>
    ctx === 'transferAdmin'
      ? 'Esa cuenta está bloqueada; quítala de la lista antes de proponerla como admin.'
      : 'Tu cuenta está bloqueada. Solo puedes borrar tus dibujos.',
  DrawingLimitReached: () => 'Llegaste al límite de 30 dibujos. Borra uno para crear otro.',
  InvalidTitle: () => 'El título debe tener entre 1 y 32 caracteres (los acentos cuentan doble).',
  InvalidUsername: () => 'El nombre debe tener de 3 a 16 caracteres: minúsculas, números o guion bajo.',
  UsernameTaken: () => 'Ese nombre ya está en uso. Elige otro.',
  UsernameUnchanged: () => 'Ese ya es tu nombre de usuario.',
  InvalidPixelIndex: () => 'Píxel fuera del lienzo.',
  CannotBlacklistOwner: () => 'No puedes bloquear la cuenta del administrador.',
  ZeroAddress: () => 'Dirección no válida.',
  BlacklistUnchanged: (a) => (a[1] ? 'Esa cuenta ya estaba bloqueada.' : 'Esa cuenta no estaba bloqueada.'),
  RenounceOwnershipDisabled: () => 'Renunciar al rol de admin está deshabilitado.',
  OwnableUnauthorizedAccount: (_a, ctx) =>
    ctx === 'acceptAdmin'
      ? 'Tu cuenta no tiene una invitación de admin pendiente.'
      : 'Solo el administrador puede hacer esto.',
  OwnableInvalidOwner: () => 'Dirección de administrador no válida.',
};

export function messageForError(e: DecodedError | null, ctx?: string): string {
  if (!e) return 'El contrato rechazó la operación.';
  const f = MESSAGES[e.name];
  return f ? f(e.args, ctx) : `El contrato rechazó la operación (${e.name}).`;
}

function asHex(x: unknown): `0x${string}` | null {
  return typeof x === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(x) ? (x as `0x${string}`) : null;
}

/** Intenta sacar el error personalizado de lo que devuelve `.query()` cuando `success: false`. */
export function decodeContractError(value: unknown): DecodedError | null {
  if (value == null) return null;
  const v = value as Record<string, unknown>;
  const decoded = v.decoded as { errorName?: string; args?: readonly unknown[] } | undefined;
  if (decoded?.errorName) return { name: decoded.errorName, args: decoded.args ?? [] };
  if (typeof v.errorName === 'string') return { name: v.errorName, args: (v.args as unknown[]) ?? [] };
  const data = asHex(value) ?? asHex(v.data) ?? asHex(v.revertData) ?? asHex((v.value as Record<string, unknown>)?.data);
  if (data) {
    try {
      const r = decodeErrorResult({ abi: dotPixelViemAbi, data });
      return { name: r.errorName, args: (r.args as readonly unknown[]) ?? [] };
    } catch {
      /* sigue */
    }
  }
  return null;
}

/** Saca el error personalizado de una excepción de viem (simulateContract por ETH-RPC). */
export function decodeViemError(e: unknown): DecodedError | null {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError && r.data?.errorName) {
      return { name: r.data.errorName, args: (r.data.args as readonly unknown[]) ?? [] };
    }
  }
  return null;
}

export type SignErrorClass = 'rejected' | 'gas' | 'session' | 'timeout' | 'host' | 'pipeline' | 'unknown';

export function errorText(e: unknown): string {
  if (e == null) return '';
  if (typeof e === 'string') return e;
  if (e instanceof Error) {
    const name = e.name && e.name !== 'Error' ? `${e.name}: ` : '';
    return `${name}${e.message}`;
  }
  try {
    return JSON.stringify(e, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  } catch {
    return String(e);
  }
}

export function classifySignError(e: unknown): SignErrorClass {
  const t = errorText(e).toLowerCase();
  if (/pipeline|txextversion|transaction-extension/.test(t)) return 'pipeline';
  if (/reject|cancel|denied|signingrejected/.test(t)) return 'rejected';
  if (/invalid\.payment|payment|storagedepositnotenoughfunds/.test(t)) return 'gas';
  if (/stale|future|nonce/.test(t)) return 'session';
  if (/timeout|timed out/.test(t)) return 'timeout';
  if (/host provider|disconnect|hostunavailable/.test(t)) return 'host';
  return 'unknown';
}

export const SIGN_MESSAGES: Record<SignErrorClass, string> = {
  rejected: 'Firma rechazada.',
  gas: 'No hay gas suficiente. Acepta el permiso de gas y reintenta.',
  session: 'La sesión de firma se desfasó. Reconecta y reintenta.',
  timeout: 'El Host no respondió a tiempo.',
  host: 'Se perdió la conexión con el Host.',
  pipeline: 'El Host rechazó el pipeline de PGAS.',
  unknown: 'La transacción falló.',
};
