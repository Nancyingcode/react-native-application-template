import type { CacheStore } from './cache';
import { InvalidRefreshSessionError, type SessionManager } from './auth';
import type { Logger } from './logger';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super('An authenticated request requires a valid session');
    this.name = 'AuthenticationRequiredError';
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  authenticated?: boolean;
  cache?: { key: string; ttlMs: number };
  retry?: number;
}

export interface HttpClientConfig {
  baseUrl: string;
  timeoutMs: number;
  session: SessionManager;
  cache: CacheStore;
  logger: Logger;
  fetcher?: typeof fetch;
  onRequestCompleted?(metric: HttpRequestMetric): void;
}

export interface HttpRequestMetric {
  path: string;
  method: string;
  status?: number;
  durationMs: number;
  success: boolean;
  source: 'network' | 'cache' | 'client';
  attempts: number;
  errorCode?: string;
}

export class HttpClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly config: HttpClientConfig) {
    this.fetcher = config.fetcher ?? fetch;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const startedAt = Date.now();
    // 查询参数经常包含搜索词或短时凭证，指标只保留稳定且低敏感的路由路径。
    const metricPath = path.split('?')[0];
    const method = options.method?.toUpperCase() ?? 'GET';
    if (options.cache) {
      const cached = await this.config.cache.get<T>(options.cache.key);
      if (cached !== undefined) {
        this.recordMetric({
          path: metricPath,
          method,
          durationMs: Date.now() - startedAt,
          success: true,
          source: 'cache',
          attempts: 0,
        });
        return cached;
      }
    }

    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    headers.set('Content-Type', 'application/json');
    headers.set('X-Request-Id', createRequestId());
    let accessToken: string | undefined;
    if (options.authenticated !== false) {
      try {
        accessToken = await this.config.session.getAccessToken();
      } catch (error) {
        if (!(error instanceof InvalidRefreshSessionError)) {
          throw error;
        }
      }
      if (!accessToken) {
        this.recordMetric({
          path: metricPath,
          method,
          durationMs: Date.now() - startedAt,
          success: false,
          source: 'client',
          attempts: 0,
          errorCode: 'AUTHENTICATION_REQUIRED',
        });
        throw new AuthenticationRequiredError();
      }
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const attempts = Math.max(1, (options.retry ?? 1) + 1);
    let refreshedAuthentication = false;
    let refreshFailed = false;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs,
      );
      try {
        const request: RequestInit = {
          ...options,
          headers,
          signal: controller.signal,
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(options.body),
        };
        let response = await this.fetcher(
          `${this.config.baseUrl}${path}`,
          request,
        );
        const shouldRefresh =
          response.status === 401 &&
          accessToken !== undefined &&
          !refreshedAuthentication;
        if (shouldRefresh && accessToken) {
          refreshedAuthentication = true;
          let refreshedToken: string | undefined;
          try {
            refreshedToken = await this.config.session.refreshAccessToken(
              accessToken,
            );
          } catch (error) {
            if (!(error instanceof InvalidRefreshSessionError)) {
              refreshFailed = true;
              throw error;
            }
          }
          if (refreshedToken) {
            accessToken = refreshedToken;
            headers.set('Authorization', `Bearer ${refreshedToken}`);
            response = await this.fetcher(
              `${this.config.baseUrl}${path}`,
              request,
            );
          }
        }
        if (response.status === 401 && accessToken) {
          await this.config.session.invalidateAccessToken(accessToken);
        }
        const requestId = response.headers.get('X-Request-Id') ?? undefined;
        if (!response.ok) {
          const details = (await safeJson(response)) as {
            message?: string;
            code?: string;
          };
          throw new ApiError(
            details.message ?? `Request failed with ${response.status}`,
            response.status,
            details.code ?? 'HTTP_ERROR',
            requestId,
          );
        }
        const data = (await safeJson(response)) as T;
        if (options.cache) {
          await this.config.cache.set(
            options.cache.key,
            data,
            options.cache.ttlMs,
          );
        }
        this.recordMetric({
          path: metricPath,
          method,
          status: response.status,
          durationMs: Date.now() - startedAt,
          success: true,
          source: 'network',
          attempts: attempt,
        });
        return data;
      } catch (error) {
        lastError = error;
        // 续期暂时失败时不能再用旧 Token 重试，否则下一次 401 会误清除会话。
        const retryable =
          !refreshFailed &&
          (!(error instanceof ApiError) || error.status >= 500);
        if (!retryable || attempt === attempts) {
          this.config.logger.log('error', 'HTTP request failed', {
            path,
            attempt,
            error,
          });
          this.recordMetric({
            path: metricPath,
            method,
            status: error instanceof ApiError ? error.status : undefined,
            durationMs: Date.now() - startedAt,
            success: false,
            source: 'network',
            attempts: attempt,
            errorCode:
              error instanceof ApiError
                ? error.code
                : error instanceof Error
                ? error.name
                : 'UNKNOWN_ERROR',
          });
          throw error;
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  }

  private recordMetric(metric: HttpRequestMetric): void {
    try {
      this.config.onRequestCompleted?.(metric);
    } catch (error) {
      this.config.logger.log('warn', 'HTTP metric observer failed', { error });
    }
  }
}

async function safeJson(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function createRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
