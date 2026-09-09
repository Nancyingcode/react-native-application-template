import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { ApiError } from '../src/core/http';
import type {
  QrLoginChallenge,
  QrLoginGateway,
} from '../src/modules/auth/qrLogin';
import { useQrAuthorization } from '../src/plugins/qr-login/useQrAuthorization';

const sessionId = '019934ba-7437-7000-8000-000000000001';
const raw = (id = sessionId) =>
  JSON.stringify({
    type: 'qr-login',
    sessionId: id,
    scanToken: 'a'.repeat(64),
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('T2 authorization lifecycle', () => {
  let session: SessionManager;
  let gateway: jest.Mocked<QrLoginGateway>;
  let renderer: TestRenderer.ReactTestRenderer;
  let flow: ReturnType<typeof useQrAuthorization>;
  let challenge: QrLoginChallenge;
  function Harness({ active = true }: { active?: boolean }) {
    flow = useQrAuthorization(gateway, session, active);
    return null;
  }
  beforeEach(async () => {
    jest.useFakeTimers();
    session = new SessionManager(new InMemorySessionStore());
    await session.setSession({
      userId: 'mobile',
      accessToken: 'mobile-token',
      permissions: [],
      expiresAt: Date.now() + 3600000,
    });
    challenge = {
      sessionId,
      status: 'SCANNED',
      expiresAt: Date.now() + 120000,
    };
    gateway = {
      scan: jest.fn().mockResolvedValue(challenge),
      confirm: jest
        .fn()
        .mockResolvedValue({ ...challenge, status: 'CONFIRMED' }),
      cancel: jest
        .fn()
        .mockResolvedValue({ ...challenge, status: 'CANCELLED' }),
    };
    await act(async () => {
      renderer = TestRenderer.create(<Harness />);
    });
  });
  afterEach(async () => {
    await act(async () => renderer.unmount());
    jest.useRealTimers();
  });
  it('locks repeated detections before React rerenders', async () => {
    await act(async () => {
      await Promise.all([flow.scan(raw()), flow.scan(raw())]);
    });
    expect(gateway.scan).toHaveBeenCalledTimes(1);
    expect(flow.mode).toBe('reviewing');
    expect(flow.challenge).toEqual(challenge);
  });
  it.each(['confirm', 'cancel'] as const)(
    '%s excludes the conflicting action and renders only server result',
    async action => {
      await act(async () => {
        await flow.scan(raw());
      });
      const pending = deferred<QrLoginChallenge>();
      gateway[action].mockReturnValue(pending.promise);
      let operation: Promise<void>;
      await act(async () => {
        operation = flow[action]();
        await flow[action === 'confirm' ? 'cancel' : 'confirm']();
      });
      expect(
        gateway[action === 'confirm' ? 'cancel' : 'confirm'],
      ).not.toHaveBeenCalled();
      expect(flow.mode).toBe(action === 'confirm' ? 'submitting' : 'rejecting');
      await act(async () => {
        pending.resolve({
          ...challenge,
          status: action === 'confirm' ? 'CONFIRMED' : 'CANCELLED',
        });
        await operation;
      });
      expect(flow.mode).toBe('result');
      expect(flow.challenge?.status).toBe(
        action === 'confirm' ? 'CONFIRMED' : 'CANCELLED',
      );
      expect(session.getSnapshot()?.accessToken).toBe('mobile-token');
    },
  );
  it.each(['scan', 'confirm', 'cancel'] as const)(
    'keeps unknown %s result and never replays',
    async action => {
      if (action !== 'scan')
        await act(async () => {
          await flow.scan(raw());
        });
      gateway[action].mockRejectedValue(new Error('timeout'));
      await act(async () => {
        await (action === 'scan' ? flow.scan(raw()) : flow[action]());
      });
      expect(flow.messageKey).toBe('auth.qr.error.unknown');
      await act(async () => {
        await flow.confirm();
        await flow.cancel();
        flow.reset();
      });
      await act(async () => {
        await flow.scan(raw());
      });
      expect(flow.messageKey).toBe('auth.qr.error.used');
      expect(gateway[action]).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['scan', 'confirm', 'cancel'] as const)(
    'handles documented failures during %s',
    async action => {
      if (action !== 'scan')
        await act(async () => {
          await flow.scan(raw());
        });
      gateway[action].mockRejectedValue(
        new ApiError('not logged', 403, 'QR_LOGIN_NOT_OWNED'),
      );
      await act(async () => {
        await (action === 'scan' ? flow.scan(raw()) : flow[action]());
      });
      expect(flow.messageKey).toBe('auth.qr.error.owner');
      expect(flow.mode).toBe('result');
    },
  );
  it.each(['PENDING', 'CONFIRMED', 'CANCELLED', 'CONSUMED'] as const)(
    'does not turn %s into a local review',
    async status => {
      gateway.scan.mockResolvedValue({ ...challenge, status });
      await act(async () => {
        await flow.scan(raw());
        await flow.confirm();
      });
      expect(flow.mode).toBe('result');
      expect(flow.challenge?.status).toBe(status);
      expect(gateway.confirm).not.toHaveBeenCalled();
    },
  );
  it('uses the original deadline when returning from background', async () => {
    await act(async () => {
      await flow.scan(raw());
      renderer.update(<Harness active={false} />);
    });
    jest.setSystemTime(challenge.expiresAt + 1);
    await act(async () => renderer.update(<Harness active />));
    expect(flow.messageKey).toBe('auth.qr.error.expired');
    await act(async () => {
      await flow.confirm();
    });
    expect(gateway.confirm).not.toHaveBeenCalled();
  });
  it('checks deadline in handlers before the next timer tick', async () => {
    await act(async () => {
      await flow.scan(raw());
    });
    jest.setSystemTime(challenge.expiresAt + 1);
    await act(async () => {
      await flow.cancel();
    });
    expect(flow.messageKey).toBe('auth.qr.error.expired');
    expect(gateway.cancel).not.toHaveBeenCalled();
  });
  it('rejects a server response that moves the fixed deadline', async () => {
    await act(async () => {
      await flow.scan(raw());
    });
    gateway.confirm.mockResolvedValue({
      ...challenge,
      status: 'CONFIRMED',
      expiresAt: challenge.expiresAt + 1000,
    });
    await act(async () => {
      await flow.confirm();
    });
    expect(flow.messageKey).toBe('auth.qr.error.unknown');
    expect(flow.challenge?.expiresAt).toBe(challenge.expiresAt);
  });
  it.each(['scan', 'confirm', 'cancel'] as const)(
    'ignores late %s after leaving',
    async action => {
      if (action !== 'scan')
        await act(async () => {
          await flow.scan(raw());
        });
      const pending = deferred<QrLoginChallenge>();
      gateway[action].mockReturnValue(pending.promise);
      let operation: Promise<void>;
      await act(async () => {
        operation = action === 'scan' ? flow.scan(raw()) : flow[action]();
      });
      const previous = flow;
      await act(async () => renderer.unmount());
      await act(async () => {
        pending.resolve({ ...challenge, status: 'CONFIRMED' });
        await operation;
      });
      expect(flow).toBe(previous);
    },
  );
  it('ignores old response after scanning another code', async () => {
    const pending = deferred<QrLoginChallenge>();
    gateway.scan.mockReturnValueOnce(pending.promise);
    let operation: Promise<void>;
    await act(async () => {
      operation = flow.scan(raw());
    });
    await act(async () => flow.reset());
    const other = '019934ba-7437-7000-8000-000000000002';
    gateway.scan.mockResolvedValue({ ...challenge, sessionId: other });
    await act(async () => {
      await flow.scan(raw(other));
      pending.resolve(challenge);
      await operation;
    });
    expect(flow.challenge?.sessionId).toBe(other);
  });
  it.each(['scan', 'confirm', 'cancel'] as const)(
    'invalidates %s on account switch and discards its late response',
    async action => {
      if (action !== 'scan')
        await act(async () => {
          await flow.scan(raw());
        });
      const pending = deferred<QrLoginChallenge>();
      gateway[action].mockReturnValue(pending.promise);
      let operation: Promise<void>;
      await act(async () => {
        operation = action === 'scan' ? flow.scan(raw()) : flow[action]();
      });
      await act(async () =>
        session.setSession({
          userId: 'other',
          accessToken: 'other-token',
          permissions: [],
          expiresAt: Date.now() + 60000,
        }),
      );
      await act(async () => {
        pending.resolve({ ...challenge, status: 'CONFIRMED' });
        await operation;
      });
      expect(flow.messageKey).toBe('auth.qr.error.accountChanged');
      expect(flow.challenge).toBeUndefined();
      expect(session.getSnapshot()?.userId).toBe('other');
    },
  );
  it('invalidates sign-out then sign-in of the same user', async () => {
    await act(async () => {
      await flow.scan(raw());
    });
    const owner = session.getSnapshot()!;
    await act(async () => {
      await session.signOut();
      await session.setSession(owner);
      await flow.confirm();
    });
    expect(gateway.confirm).not.toHaveBeenCalled();
    expect(flow.messageKey).toBe('auth.qr.error.accountChanged');
  });
  it.each([
    ['QR_LOGIN_EXPIRED', 410, 'expired'],
    ['QR_LOGIN_STATUS_INVALID', 409, 'status'],
    ['QR_LOGIN_INVALID', 401, 'invalid'],
    ['RATE_LIMITED', 429, 'rate'],
  ])('stops scan on %s', async (code, status, key) => {
    gateway.scan.mockRejectedValue(new ApiError('redacted', status, code));
    await act(async () => {
      await flow.scan(raw());
    });
    expect(flow.messageKey).toBe(`auth.qr.error.${key}`);
    expect(flow.mode).toBe('result');
    expect(gateway.scan).toHaveBeenCalledTimes(1);
  });
  it('does not replace a new flow with an old rejection', async () => {
    const pending = deferred<QrLoginChallenge>();
    gateway.scan.mockReturnValueOnce(pending.promise);
    let operation: Promise<void>;
    await act(async () => {
      operation = flow.scan(raw());
    });
    await act(async () => flow.reset());
    await act(async () => {
      pending.reject(new Error('late'));
      await operation;
    });
    expect(flow.mode).toBe('scanning');
    expect(flow.messageKey).toBeUndefined();
  });
});
