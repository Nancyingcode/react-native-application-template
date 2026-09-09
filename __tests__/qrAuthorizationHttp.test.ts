/** @jest-environment node */
import { randomBytes, randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { once } from 'node:events';

import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { MemoryCache } from '../src/core/cache';
import { HttpClient } from '../src/core/http';
import {
  createQrLoginGateway,
  parseQrLoginPayload,
} from '../src/modules/auth/qrLogin';

type Status = 'PENDING' | 'SCANNED' | 'CONFIRMED' | 'CANCELLED' | 'CONSUMED';
interface Record {
  sessionId: string;
  status: Status;
  expiresAt: number;
  scanToken: string;
  pollToken: string;
  owner?: string;
}

// 专用测试服务：凭证仅在内存中生成；不导入移动端运行时、不代表生产后端。
async function startQrAuthorizationMock(now = () => Date.now()) {
  const records = new Map<string, Record>();
  const mobileToken = randomBytes(32).toString('hex');
  const secondMobileToken = randomBytes(32).toString('hex');
  const view = (value: Record) => ({
    sessionId: value.sessionId,
    status: value.status,
    expiresAt: new Date(value.expiresAt).toISOString(),
  });
  const reply = (response: ServerResponse, status: number, value: unknown) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(value));
  };
  const fail = (response: ServerResponse, status: number, code: string) =>
    reply(response, status, { code, message: code });
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST')
      return fail(response, 405, 'METHOD_NOT_ALLOWED');
    if (request.url === '/api/v1/auth/qr-login') {
      const value: Record = {
        sessionId: randomUUID(),
        status: 'PENDING',
        expiresAt: now() + 120000,
        scanToken: randomBytes(32).toString('hex'),
        pollToken: randomBytes(32).toString('hex'),
      };
      records.set(value.sessionId, value);
      return reply(response, 201, {
        data: {
          ...view(value),
          pollToken: value.pollToken,
          qrCodeContent: JSON.stringify({
            type: 'qr-login',
            sessionId: value.sessionId,
            scanToken: value.scanToken,
          }),
          expiresInSeconds: 120,
        },
      });
    }
    const match =
      /^\/api\/v1\/auth\/qr-login\/([a-f0-9-]+)\/(scan|confirm|cancel|status|exchange)$/.exec(
        request.url ?? '',
      );
    if (!match) return fail(response, 404, 'NOT_FOUND');
    const [, id, action] = match;
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    let body: { scanToken?: string; pollToken?: string };
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return fail(response, 400, 'INVALID_BODY');
    }
    const value = records.get(id);
    if (!value || value.expiresAt <= now())
      return fail(response, 410, 'QR_LOGIN_EXPIRED');
    if (action === 'status' || action === 'exchange') {
      if (body.pollToken !== value.pollToken)
        return fail(response, 401, 'QR_LOGIN_INVALID');
      if (action === 'exchange') {
        if (value.status !== 'CONFIRMED')
          return fail(response, 409, 'QR_LOGIN_STATUS_INVALID');
        value.status = 'CONSUMED';
        return reply(response, 200, {
          data: {
            user: { id: value.owner },
            tokens: {
              accessToken: randomBytes(32).toString('hex'),
              tokenType: 'Bearer',
            },
          },
        });
      }
    } else {
      const bearer = request.headers.authorization;
      const owner =
        bearer === `Bearer ${mobileToken}`
          ? 't2-mobile'
          : bearer === `Bearer ${secondMobileToken}`
          ? 't2-other'
          : undefined;
      if (!owner) return fail(response, 401, 'UNAUTHORIZED');
      if (body.scanToken !== value.scanToken)
        return fail(response, 401, 'QR_LOGIN_INVALID');
      if (value.owner && value.owner !== owner)
        return fail(response, 403, 'QR_LOGIN_NOT_OWNED');
      if (action === 'scan') {
        if (value.status !== 'PENDING' && value.status !== 'SCANNED')
          return fail(response, 409, 'QR_LOGIN_STATUS_INVALID');
        value.owner = owner;
        value.status = 'SCANNED';
      } else {
        const next = action === 'confirm' ? 'CONFIRMED' : 'CANCELLED';
        if (value.status !== 'SCANNED' && value.status !== next)
          return fail(response, 409, 'QR_LOGIN_STATUS_INVALID');
        value.status = next;
      }
    }
    return reply(response, 200, { data: view(value) });
  };
  const server = createServer((request, response) => {
    handle(request, response).catch(() => fail(response, 500, 'MOCK_ERROR'));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Mock listener unavailable');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    mobileToken,
    secondMobileToken,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

describe('T2 dedicated HTTP mock cross-client flow (not real backend)', () => {
  let mock: Awaited<ReturnType<typeof startQrAuthorizationMock>>;
  let session: SessionManager;
  let gateway: ReturnType<typeof createQrLoginGateway>;
  let now: number;
  const logger = { log: jest.fn(), child: jest.fn() };
  async function computer(path: string, body: object = {}) {
    const response = await fetch(
      `${mock.baseUrl}/api/v1/auth/qr-login${path}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    return { status: response.status, payload: await response.json() };
  }
  async function create() {
    const { payload } = await computer('');
    return {
      request: parseQrLoginPayload(payload.data.qrCodeContent),
      pollToken: payload.data.pollToken,
      expiresAt: payload.data.expiresAt,
    };
  }
  beforeEach(async () => {
    now = Date.now();
    mock = await startQrAuthorizationMock(() => now);
    session = new SessionManager(new InMemorySessionStore());
    await session.setSession({
      userId: 't2-mobile',
      accessToken: mock.mobileToken,
      expiresAt: now + 3600000,
      permissions: [],
    });
    gateway = createQrLoginGateway(
      new HttpClient({
        baseUrl: mock.baseUrl,
        session,
        cache: new MemoryCache(),
        logger,
        timeoutMs: 5000,
      }),
    );
  });
  afterEach(async () => mock.close());
  it('creates, scans, confirms, polls and exchanges once without replacing the phone session', async () => {
    const owner = session.getSnapshot();
    const created = await create();
    const scanned = await gateway.scan(created.request);
    expect(scanned.status).toBe('SCANNED');
    expect(scanned.expiresAt).toBe(Date.parse(created.expiresAt));
    expect((await gateway.confirm(created.request)).status).toBe('CONFIRMED');
    const path = `/${created.request.sessionId}`;
    expect(
      (await computer(`${path}/status`, { pollToken: created.pollToken }))
        .payload.data.status,
    ).toBe('CONFIRMED');
    const exchanged = await computer(`${path}/exchange`, {
      pollToken: created.pollToken,
    });
    expect(exchanged.status).toBe(200);
    expect(exchanged.payload.data.tokens.accessToken).not.toBe(
      owner?.accessToken,
    );
    const second = await computer(`${path}/exchange`, {
      pollToken: created.pollToken,
    });
    expect(second.status).toBe(409);
    expect(
      (await computer(`${path}/status`, { pollToken: created.pollToken }))
        .payload.data.status,
    ).toBe('CONSUMED');
    expect(session.getSnapshot()).toBe(owner);
  });
  it('cancels and prevents the computer from exchanging', async () => {
    const created = await create();
    await gateway.scan(created.request);
    expect((await gateway.cancel(created.request)).status).toBe('CANCELLED');
    expect(
      (
        await computer(`/${created.request.sessionId}/exchange`, {
          pollToken: created.pollToken,
        })
      ).status,
    ).toBe(409);
  });
  it('rejects expiry without extending the original deadline', async () => {
    const created = await create();
    now += 120001;
    await expect(gateway.scan(created.request)).rejects.toMatchObject({
      code: 'QR_LOGIN_EXPIRED',
    });
  });
  it('rejects another mobile account after scan', async () => {
    const created = await create();
    await gateway.scan(created.request);
    await session.setSession({
      userId: 't2-other',
      accessToken: mock.secondMobileToken,
      expiresAt: now + 3600000,
      permissions: [],
    });
    await expect(gateway.confirm(created.request)).rejects.toMatchObject({
      code: 'QR_LOGIN_NOT_OWNED',
    });
  });
  it('keeps scan and poll credentials separate', async () => {
    const created = await create();
    const result = await computer(`/${created.request.sessionId}/status`, {
      pollToken: created.request.scanToken,
    });
    expect(result.status).toBe(401);
    expect(result.payload.code).toBe('QR_LOGIN_INVALID');
    expect(created.pollToken).not.toBe(created.request.scanToken);
  });
});
