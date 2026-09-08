import type { AuthSession } from '../../core/auth';
import { toAuthSession, type AuthenticationResponse } from './authResponse';
import type { HttpClient } from '../../core/http';

export interface RegisterInput {
  email: string;
  password: string;
  phone?: string;
  displayName?: string;
}

export class AuthRepository {
  constructor(private readonly http: HttpClient) {}

  async login(email: string, password: string): Promise<AuthSession> {
    const response = await this.http.request<AuthenticationResponse>(
      '/api/v1/auth/login',
      {
        method: 'POST',
        body: { email: email.trim(), password },
        authenticated: false,
        retry: 0,
      },
    );
    return toAuthSession(response);
  }

  async register(input: RegisterInput): Promise<AuthSession> {
    const response = await this.http.request<AuthenticationResponse>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: {
          email: input.email.trim(),
          password: input.password,
          phone: input.phone?.trim() || undefined,
          displayName: input.displayName?.trim() || undefined,
        },
        authenticated: false,
        // 网络失败时账号可能已创建，自动重试会重复提交注册。
        retry: 0,
      },
    );
    return toAuthSession(response);
  }
}
