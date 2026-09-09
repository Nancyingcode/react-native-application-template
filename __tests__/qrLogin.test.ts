import {
  ApiError,
  AuthenticationRequiredError,
  HttpClient,
} from '../src/core/http';
import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { MemoryCache } from '../src/core/cache';
import {
  createQrLoginGateway,
  parseQrLoginPayload,
  QrLoginParseError,
  qrLoginErrorKey,
  validateQrLoginResponse,
} from '../src/modules/auth/qrLogin';

const sessionId = '019934ba-7437-7000-8000-000000000001';
const input = { sessionId, scanToken: 'a'.repeat(64) };
const raw = JSON.stringify({ type: 'qr-login', ...input });
const data = {
  sessionId,
  status: 'SCANNED',
  expiresAt: '2026-09-09T12:00:00.000Z',
};

describe('T2 QR data boundary', () => {
  it('parses only verified JSON fields', () => {
    expect(parseQrLoginPayload(raw)).toEqual(input);
  });
  it.each([
    '',
    '{',
    'null',
    '[]',
    '42',
    '"code"',
    'a'.repeat(2049),
    'https://example.com/qr-login',
    'aurora://qr-login?challenge=abcdefghijklmnop',
    JSON.stringify({ type: 'qr-login', ...input, pollToken: 'b'.repeat(64) }),
    JSON.stringify({ type: 'qr-login', ...input, url: 'https://example.com' }),
  ])('rejects untrusted payload case %#', value => {
    expect(() => parseQrLoginPayload(value)).toThrow(QrLoginParseError);
  });
  it.each([
    ['type', undefined],
    ['type', null],
    ['type', 'QR_LOGIN'],
    ['type', 1],
    ['sessionId', undefined],
    ['sessionId', 5],
    ['sessionId', '../scan'],
    ['sessionId', 'bad-id'],
    ['scanToken', undefined],
    ['scanToken', 1],
    ['scanToken', 'A'.repeat(64)],
    ['scanToken', 'a'.repeat(63)],
    ['scanToken', 'a'.repeat(65)],
    ['scanToken', 'g'.repeat(64)],
  ])('rejects invalid %s case %#', (field, value) => {
    expect(() =>
      parseQrLoginPayload(
        JSON.stringify({ type: 'qr-login', ...input, [field]: value }),
      ),
    ).toThrow(QrLoginParseError);
  });
  it.each(['PENDING', 'SCANNED', 'CONFIRMED', 'CANCELLED', 'CONSUMED'])(
    'preserves server %s',
    status => {
      expect(
        validateQrLoginResponse({ data: { ...data, status } }, sessionId),
      ).toEqual({ sessionId, status, expiresAt: Date.parse(data.expiresAt) });
    },
  );
  it.each([
    null,
    {},
    data,
    { data: { ...data, sessionId: 'wrong' } },
    { data: { ...data, status: 'EXPIRED' } },
    { data: { ...data, expiresAt: 123 } },
    { data: { ...data, expiresAt: 'invalid' } },
    { data: { ...data, expiresAt: '2026-99-99T12:00:00Z' } },
    { data: { ...data, expiresAt: '2026-02-30T12:00:00Z' } },
    { data: { ...data, expiresAt: '2026-09-09T24:00:00Z' } },
    { data: { ...data, expiresAt: '2026-09-09T12:00:00' } },
  ])('rejects invalid response case %#', value => {
    expect(() => validateQrLoginResponse(value, sessionId)).toThrow(
      QrLoginParseError,
    );
  });
  it('does not impose the legacy five minute TTL or extend an expired timestamp', () => {
    expect(validateQrLoginResponse({ data }, sessionId).expiresAt).toBe(
      Date.parse(data.expiresAt),
    );
  });
  it('accepts an explicit timezone without changing the deadline', () => {
    expect(
      validateQrLoginResponse(
        { data: { ...data, expiresAt: '2026-09-09T20:00:00+08:00' } },
        sessionId,
      ).expiresAt,
    ).toBe(Date.parse(data.expiresAt));
  });
});

describe('T2 mobile gateway', () => {
  it.each(['scan', 'confirm', 'cancel'] as const)(
    'posts %s once with mobile Bearer and preserves the phone session',
    async action => {
      const session = new SessionManager(new InMemorySessionStore());
      const mobile = {
        userId: 'phone-user',
        accessToken: 'phone-only',
        expiresAt: Date.now() + 60000,
        permissions: [],
      };
      await session.setSession(mobile);
      const fetcher = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () =>
          JSON.stringify({ data: { ...data, accessToken: 'computer-only' } }),
      });
      const log = jest.fn();
      const http = new HttpClient({
        baseUrl: 'http://127.0.0.1:3002',
        timeoutMs: 1000,
        session,
        cache: new MemoryCache(),
        logger: { log, child: jest.fn() },
        fetcher,
      });
      await createQrLoginGateway(http)[action](input);
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, options] = fetcher.mock.calls[0];
      expect(url).toBe(
        `http://127.0.0.1:3002/api/v1/auth/qr-login/${sessionId}/${action}`,
      );
      expect(options.headers.get('Authorization')).toBe('Bearer phone-only');
      expect(JSON.parse(options.body)).toEqual({ scanToken: input.scanToken });
      expect(options.retry).toBe(0);
      expect(session.getSnapshot()).toBe(mobile);
      expect(log).not.toHaveBeenCalled();
    },
  );
  it('does not replay network failures or expose QR data in errors', async () => {
    const request = jest.fn().mockRejectedValue(new Error('network'));
    const gateway = createQrLoginGateway({ request } as unknown as HttpClient);
    await expect(gateway.scan(input)).rejects.toThrow('network');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].retry).toBe(0);
    expect(() => parseQrLoginPayload(raw + '!')).toThrow('invalid');
  });
});

describe('safe localized errors', () => {
  it.each([
    ['QR_LOGIN_EXPIRED', 410, 'expired'],
    ['QR_LOGIN_INVALID', 401, 'invalid'],
    ['QR_LOGIN_NOT_OWNED', 403, 'owner'],
    ['QR_LOGIN_STATUS_INVALID', 409, 'status'],
    ['TOKEN_INVALID', 401, 'auth'],
    ['USER_DISABLED', 403, 'auth'],
    ['RATE_LIMITED', 429, 'rate'],
    ['SERVER_ERROR', 500, 'unknown'],
  ])('maps %s without server message', (code, status, key) => {
    expect(qrLoginErrorKey(new ApiError(raw, status, code))).toBe(
      `auth.qr.error.${key}`,
    );
  });
  it('distinguishes unauthenticated and unknown outcomes', () => {
    expect(qrLoginErrorKey(new AuthenticationRequiredError())).toBe(
      'auth.qr.error.auth',
    );
    expect(qrLoginErrorKey(new Error(raw))).toBe('auth.qr.error.unknown');
    expect(qrLoginErrorKey(new QrLoginParseError('response'))).toBe(
      'auth.qr.error.unknown',
    );
  });
});
