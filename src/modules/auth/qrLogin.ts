import type { BrandConfig } from '../../brand/types';
import type { HttpClient } from '../../core/http';

export interface QrLoginRequest {
  id: string;
}

/** Trusted challenge details returned by the authenticated backend. */
export interface QrLoginChallenge {
  id: string;
  deviceName: string;
  location?: string;
  expiresAt: number;
}

export type QrLoginParseErrorCode =
  | 'empty'
  | 'too-long'
  | 'unsupported-source'
  | 'invalid-challenge'
  | 'expired';

export class QrLoginParseError extends Error {
  constructor(readonly code: QrLoginParseErrorCode) {
    super(code);
    this.name = 'QrLoginParseError';
  }
}

interface ResolvedChallengePayload {
  challengeId?: unknown;
  deviceName?: unknown;
  location?: unknown;
  expiresAt?: unknown;
}

const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
const MAX_PAYLOAD_LENGTH = 2048;
const MAX_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Extract only the opaque nonce from a QR code. Device, location and expiry
 * are deliberately ignored here and must come from the authenticated API.
 */
export function parseQrLoginPayload(
  rawValue: string,
  brand: Pick<BrandConfig, 'native'>,
): QrLoginRequest {
  const raw = rawValue.trim();
  if (!raw) {
    throw new QrLoginParseError('empty');
  }
  if (raw.length > MAX_PAYLOAD_LENGTH) {
    throw new QrLoginParseError('too-long');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new QrLoginParseError('unsupported-source');
  }

  const brandScheme = brand.native.deepLinks.scheme.toLowerCase();
  const isBrandRoute =
    url.protocol.toLowerCase() === `${brandScheme}:` &&
    url.hostname.toLowerCase() === 'qr-login' &&
    (url.pathname === '' || url.pathname === '/');
  const isTrustedHttpsRoute =
    url.protocol.toLowerCase() === 'https:' &&
    brand.native.deepLinks.hosts.some(
      host => host.toLowerCase() === url.hostname.toLowerCase(),
    ) &&
    url.pathname.toLowerCase() === '/qr-login';

  if (!isBrandRoute && !isTrustedHttpsRoute) {
    throw new QrLoginParseError('unsupported-source');
  }

  const challenge = url.searchParams.get('challenge');
  if (!challenge || !CHALLENGE_PATTERN.test(challenge)) {
    throw new QrLoginParseError('invalid-challenge');
  }
  return { id: challenge };
}

export interface QrLoginGateway {
  resolve(challengeId: string): Promise<QrLoginChallenge>;
  confirm(challengeId: string): Promise<void>;
  reject(challengeId: string): Promise<void>;
}

export function createQrLoginGateway(http: HttpClient): QrLoginGateway {
  return {
    async resolve(challengeId) {
      const payload = await http.request<unknown>('/v1/auth/qr-login/resolve', {
        method: 'POST',
        body: { challengeId },
        authenticated: true,
        retry: 0,
      });
      return validateResolvedChallenge(payload, challengeId);
    },
    async confirm(challengeId) {
      await http.request<void>('/v1/auth/qr-login/confirm', {
        method: 'POST',
        body: { challengeId },
        authenticated: true,
        retry: 0,
      });
    },
    async reject(challengeId) {
      await http.request<void>('/v1/auth/qr-login/reject', {
        method: 'POST',
        body: { challengeId },
        authenticated: true,
        retry: 0,
      });
    },
  };
}

export function validateResolvedChallenge(
  value: unknown,
  expectedChallengeId: string,
  now: number = Date.now(),
): QrLoginChallenge {
  if (!value || typeof value !== 'object') {
    throw new QrLoginParseError('invalid-challenge');
  }
  const payload = value as ResolvedChallengePayload;
  const challengeId = stringValue(payload.challengeId);
  const deviceName = cleanLabel(payload.deviceName);
  const location = cleanLabel(payload.location);
  const expiresAt = timestampValue(payload.expiresAt);

  const matchesRequestedChallenge = challengeId === expectedChallengeId;
  const hasValidChallengeId =
    challengeId !== undefined && CHALLENGE_PATTERN.test(challengeId);
  const hasRequiredDetails =
    deviceName !== undefined && expiresAt !== undefined;

  if (
    !matchesRequestedChallenge ||
    !hasValidChallengeId ||
    !hasRequiredDetails
  ) {
    throw new QrLoginParseError('invalid-challenge');
  }
  if (expiresAt <= now) {
    throw new QrLoginParseError('expired');
  }
  if (expiresAt - now > MAX_CHALLENGE_TTL_MS) {
    throw new QrLoginParseError('invalid-challenge');
  }

  return { id: challengeId, deviceName, location, expiresAt };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function cleanLabel(value: unknown): string | undefined {
  const label = stringValue(value)
    ?.replace(/[\r\n\t]/g, ' ')
    .trim();
  return label ? label.slice(0, 80) : undefined;
}

function timestampValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new QrLoginParseError('invalid-challenge');
  }
  const timestamp = parsed < 10_000_000_000 ? parsed * 1000 : parsed;
  if (!Number.isSafeInteger(timestamp)) {
    throw new QrLoginParseError('invalid-challenge');
  }
  return timestamp;
}
