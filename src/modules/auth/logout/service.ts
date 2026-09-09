import type { AuthSession, SessionManager } from '../../../core/auth';
import type { HttpClient } from '../../../core/http';

export type LogoutResult =
  | 'revoked'
  | 'unconfirmed'
  | 'sessionChanged'
  | 'localFailed';

const operations = new WeakMap<
  SessionManager,
  {
    session: AuthSession;
    promise: Promise<LogoutResult>;
  }
>();

export function logoutSession(
  http: HttpClient,
  session: SessionManager,
  expected: AuthSession,
): Promise<LogoutResult> {
  const existing = operations.get(session);
  if (existing?.session === expected) {
    return existing.promise;
  }
  const promise = revoke(http, session, expected);
  const operation = { session: expected, promise };
  operations.set(session, operation);
  promise.finally(() => {
    if (operations.get(session) === operation) {
      operations.delete(session);
    }
  });
  return promise;
}

async function revoke(
  http: HttpClient,
  session: SessionManager,
  expected: AuthSession,
): Promise<LogoutResult> {
  let credential;
  try {
    credential = await session.signOutForRevocation(expected);
  } catch {
    return 'localFailed';
  }
  if (!credential) {
    return 'sessionChanged';
  }
  if (!credential.refreshToken) {
    return 'unconfirmed';
  }
  try {
    await http.request<void>('/api/v1/auth/logout', {
      method: 'POST',
      body: { refreshToken: credential.refreshToken },
      authenticated: false,
      retry: 0,
    });
    return credential.rotationUncertain ? 'unconfirmed' : 'revoked';
  } catch {
    return 'unconfirmed';
  }
}
