import {
  applyAuthTokens,
  type AuthSession,
  type AuthTokensResponse,
} from '../../core/auth';
import type { HttpClient } from '../../core/http';

interface AuthenticationResponse {
  data: {
    user: { id: string };
    tokens: AuthTokensResponse;
  };
}

export interface RegisterInput {
  email: string;
  password: string;
  phone?: string;
  displayName?: string;
}

function toAuthSession(response: AuthenticationResponse): AuthSession {
  const userId = response?.data?.user?.id;
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Invalid authentication response');
  }
  return applyAuthTokens(
    // 认证接口未返回权限，客户端不能自行授予受限功能。
    { userId, permissions: [] },
    response.data.tokens,
  );
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
