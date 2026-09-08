import {
  applyAuthTokens,
  type AuthSession,
  type AuthTokensResponse,
} from '../../core/auth';
export interface AuthenticationResponse {
  data: {
    user: { id: string };
    tokens: AuthTokensResponse;
  };
}

export function toAuthSession(response: AuthenticationResponse): AuthSession {
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
