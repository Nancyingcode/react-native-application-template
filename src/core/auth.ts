export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  userId: string;
  permissions: string[];
  expiresAt: number;
  refreshExpiresAt?: number;
}

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  accessExpiresInSeconds: number;
  refreshExpiresInSeconds: number;
}

export function applyAuthTokens(
  session: Pick<AuthSession, 'userId' | 'permissions'>,
  tokens: AuthTokensResponse,
  now = Date.now(),
): AuthSession {
  const validLifetime = (seconds: number): boolean =>
    Number.isSafeInteger(seconds) &&
    seconds > 0 &&
    Number.isSafeInteger(now + seconds * 1000);
  const validTokens =
    tokens?.tokenType === 'Bearer' &&
    typeof tokens.accessToken === 'string' &&
    tokens.accessToken.length > 0 &&
    typeof tokens.refreshToken === 'string' &&
    tokens.refreshToken.length > 0 &&
    validLifetime(tokens.accessExpiresInSeconds) &&
    validLifetime(tokens.refreshExpiresInSeconds);
  if (!validTokens) {
    throw new Error('Invalid authentication tokens');
  }
  return {
    ...session,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: now + tokens.accessExpiresInSeconds * 1000,
    refreshExpiresAt: now + tokens.refreshExpiresInSeconds * 1000,
  };
}

export type SessionRefresher = (session: AuthSession) => Promise<AuthSession>;

export interface SessionStore {
  read(): Promise<AuthSession | null>;
  write(session: AuthSession): Promise<void>;
  clear(): Promise<void>;
}

export interface SessionObserver {
  onSessionChanged(session: AuthSession | null): void;
}

export class InMemorySessionStore implements SessionStore {
  private session: AuthSession | null = null;
  async read(): Promise<AuthSession | null> {
    return this.session;
  }
  async write(session: AuthSession): Promise<void> {
    this.session = session;
  }
  async clear(): Promise<void> {
    this.session = null;
  }
}

export class SessionManager {
  private revision = 0;
  private snapshot: AuthSession | null = null;
  private listeners = new Set<() => void>();
  private refresher?: SessionRefresher;
  private refreshedFromToken?: string;
  private refreshInFlight?: {
    session: AuthSession;
    promise: Promise<string | undefined>;
  };

  constructor(
    private readonly store: SessionStore,
    private readonly observer?: SessionObserver,
  ) {}

  getSession(): Promise<AuthSession | null> {
    return this.store.read();
  }

  getSnapshot = (): AuthSession | null => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setRefresher(refresher: SessionRefresher): void {
    this.refresher = refresher;
  }

  async getAccessToken(): Promise<string | undefined> {
    const revision = this.revision;
    const session = await this.store.read();
    if (!session || revision !== this.revision) {
      return undefined;
    }
    if (session.expiresAt > Date.now()) {
      return session.accessToken;
    }
    return this.refreshAccessToken(session.accessToken);
  }

  async refreshAccessToken(
    rejectedAccessToken: string,
  ): Promise<string | undefined> {
    const revision = this.revision;
    const session = await this.store.read();
    if (!session || revision !== this.revision) {
      return undefined;
    }
    // 另一请求已经完成轮换时，复用新凭据，不能再次消费旧 Refresh Token。
    if (session.accessToken !== rejectedAccessToken) {
      const canReuseRefreshedToken =
        this.refreshedFromToken === rejectedAccessToken &&
        session.expiresAt > Date.now();
      return canReuseRefreshedToken ? session.accessToken : undefined;
    }
    const refreshExpired =
      session.refreshExpiresAt !== undefined &&
      session.refreshExpiresAt <= Date.now();
    if (!session.refreshToken || !this.refresher || refreshExpired) {
      await this.signOut();
      return undefined;
    }
    if (this.refreshInFlight?.session === session) {
      return this.refreshInFlight.promise;
    }

    const promise = this.refreshSession(session, this.refresher, revision);
    const flight = { session, promise };
    this.refreshInFlight = flight;
    try {
      return await promise;
    } finally {
      if (this.refreshInFlight === flight) {
        this.refreshInFlight = undefined;
      }
    }
  }

  private async refreshSession(
    session: AuthSession,
    refresher: SessionRefresher,
    revision: number,
  ): Promise<string | undefined> {
    try {
      const refreshed = await refresher(session);
      // 刷新期间可能退出或切换账号，旧请求不能恢复或覆盖新的登录状态。
      if (revision !== this.revision) {
        return undefined;
      }
      await this.setSession(refreshed);
      if (this.snapshot !== refreshed) {
        return undefined;
      }
      this.refreshedFromToken = session.accessToken;
      return refreshed.accessToken;
    } catch (error) {
      // 网络或服务故障不等于凭据失效，保留会话让下一次请求重试。
      if (
        error instanceof InvalidRefreshSessionError &&
        revision === this.revision
      ) {
        await this.signOut();
      }
      throw error;
    }
  }

  async setSession(session: AuthSession): Promise<void> {
    const revision = ++this.revision;
    this.refreshedFromToken = undefined;
    await this.store.write(session);
    if (revision === this.revision) {
      this.publish(session);
    }
  }

  async signOut(): Promise<void> {
    const revision = ++this.revision;
    this.refreshedFromToken = undefined;
    await this.store.clear();
    if (revision === this.revision) {
      this.publish(null);
    }
  }

  async invalidateAccessToken(accessToken: string): Promise<void> {
    const revision = this.revision;
    const session = await this.store.read();
    // 读取后可能已有新登录，校验与清除必须针对同一代会话。
    if (revision === this.revision && session?.accessToken === accessToken) {
      await this.signOut();
    }
  }

  private publish(session: AuthSession | null): void {
    this.snapshot = session;
    this.observer?.onSessionChanged(session);
    this.listeners.forEach(listener => listener());
  }
}

export class InvalidRefreshSessionError extends Error {
  constructor() {
    super('The refresh session is no longer valid');
    this.name = 'InvalidRefreshSessionError';
  }
}
