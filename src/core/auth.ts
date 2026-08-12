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
  constructor(private readonly store: SessionStore) {}

  getSession(): Promise<AuthSession | null> {
    return this.store.read();
  }

  async getAccessToken(): Promise<string | undefined> {
    const session = await this.store.read();
    return session && session.expiresAt > Date.now() ? session.accessToken : undefined;
  }

  setSession(session: AuthSession): Promise<void> {
    return this.store.write(session);
  }

  signOut(): Promise<void> {
    return this.store.clear();
  }
}
