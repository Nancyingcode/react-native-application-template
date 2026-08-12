import type { BrandConfig } from '../src/brand/types';
import type { HttpClient } from '../src/core/http';
import {
  createQrLoginGateway,
  parseQrLoginPayload,
  QrLoginParseError,
  validateResolvedChallenge,
} from '../src/modules/auth/qrLogin';

const brand = {
  native: {
    deepLinks: {
      scheme: 'aurora',
      hosts: ['invest.aurora.example'],
    },
  },
} as BrandConfig;

describe('parseQrLoginPayload', () => {
  it('extracts only the nonce from an exact branded route', () => {
    expect(
      parseQrLoginPayload(
        'aurora://qr-login?challenge=challenge_1234567890&device=Untrusted%20label',
        brand,
      ),
    ).toEqual({ id: 'challenge_1234567890' });
  });

  it('accepts an exact HTTPS route on a trusted host', () => {
    expect(
      parseQrLoginPayload(
        'https://invest.aurora.example/qr-login?challenge=abcdefghijklmnop',
        brand,
      ),
    ).toEqual({ id: 'abcdefghijklmnop' });
  });

  it.each([
    '{"type":"qr-login","challenge":"challenge_1234567890"}',
    'https://evil.example/qr-login?challenge=challenge_1234567890',
    'aurora://qr-login-preview?challenge=challenge_1234567890',
    'https://invest.aurora.example/not-qr-login?challenge=challenge_1234567890',
  ])('rejects an unsupported source: %s', raw => {
    expect(() => parseQrLoginPayload(raw, brand)).toThrow(
      new QrLoginParseError('unsupported-source'),
    );
  });

  it('rejects a weak challenge id', () => {
    expect(() =>
      parseQrLoginPayload('aurora://qr-login?challenge=short', brand),
    ).toThrow(new QrLoginParseError('invalid-challenge'));
  });
});

describe('validateResolvedChallenge', () => {
  const now = 1_800_000_000_000;

  it('accepts trusted server details with a short expiry', () => {
    expect(
      validateResolvedChallenge(
        {
          challengeId: 'challenge_1234567890',
          deviceName: 'Chrome on Windows',
          location: 'Hong Kong',
          expiresAt: now + 60_000,
        },
        'challenge_1234567890',
        now,
      ),
    ).toEqual({
      id: 'challenge_1234567890',
      deviceName: 'Chrome on Windows',
      location: 'Hong Kong',
      expiresAt: now + 60_000,
    });
  });

  it('rejects a mismatched challenge', () => {
    expect(() =>
      validateResolvedChallenge(
        {
          challengeId: 'different_1234567890',
          deviceName: 'Safari',
          expiresAt: now + 60_000,
        },
        'challenge_1234567890',
        now,
      ),
    ).toThrow(new QrLoginParseError('invalid-challenge'));
  });

  it('rejects expired or excessively long-lived challenges', () => {
    expect(() =>
      validateResolvedChallenge(
        {
          challengeId: 'challenge_1234567890',
          deviceName: 'Safari',
          expiresAt: now - 1,
        },
        'challenge_1234567890',
        now,
      ),
    ).toThrow(new QrLoginParseError('expired'));
    expect(() =>
      validateResolvedChallenge(
        {
          challengeId: 'challenge_1234567890',
          deviceName: 'Safari',
          expiresAt: now + 5 * 60_000 + 1,
        },
        'challenge_1234567890',
        now,
      ),
    ).toThrow(new QrLoginParseError('invalid-challenge'));
  });
});

describe('createQrLoginGateway', () => {
  it('resolves the nonce through an authenticated endpoint before confirmation', async () => {
    const request = jest.fn().mockResolvedValue({
      challengeId: 'challenge_1234567890',
      deviceName: 'Chrome',
      expiresAt: Date.now() + 60_000,
    });
    const gateway = createQrLoginGateway({ request } as unknown as HttpClient);

    await expect(
      gateway.resolve('challenge_1234567890'),
    ).resolves.toMatchObject({
      id: 'challenge_1234567890',
      deviceName: 'Chrome',
    });
    expect(request).toHaveBeenCalledWith('/v1/auth/qr-login/resolve', {
      method: 'POST',
      body: { challengeId: 'challenge_1234567890' },
      authenticated: true,
      retry: 0,
    });
  });
});
