export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  userId: string;
  permissions: string[];
  expiresAt: number;
}

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
  constructor(
    private readonly store: SessionStore,
    private readonly observer?: SessionObserver,
  ) {}

  getSession(): Promise<AuthSession | null> {
    return this.store.read();
  }

  async getAccessToken(): Promise<string | undefined> {
    const session = await this.store.read();
    return session && session.expiresAt > Date.now() ? session.accessToken : undefined;
  }

  async setSession(session: AuthSession): Promise<void> {
    await this.store.write(session);
    this.observer?.onSessionChanged(session);
  }

  async signOut(): Promise<void> {
    await this.store.clear();
    this.observer?.onSessionChanged(null);
  }
}
