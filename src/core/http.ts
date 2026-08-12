import type { CacheStore } from './cache';
import type { SessionManager } from './auth';
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
}

export class HttpClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly config: HttpClientConfig) {
    this.fetcher = config.fetcher ?? fetch;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (options.cache) {
      const cached = await this.config.cache.get<T>(options.cache.key);
      if (cached !== undefined) {
        return cached;
      }
    }

    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    headers.set('Content-Type', 'application/json');
    headers.set('X-Request-Id', createRequestId());
    if (options.authenticated !== false) {
      const token = await this.config.session.getAccessToken();
      if (!token) {
        throw new AuthenticationRequiredError();
      }
      headers.set('Authorization', `Bearer ${token}`);
    }

    const attempts = Math.max(1, (options.retry ?? 1) + 1);
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs,
      );
      try {
        const response = await this.fetcher(`${this.config.baseUrl}${path}`, {
          ...options,
          headers,
          signal: controller.signal,
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(options.body),
        });
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
        return data;
      } catch (error) {
        lastError = error;
        const retryable = !(error instanceof ApiError) || error.status >= 500;
        if (!retryable || attempt === attempts) {
          this.config.logger.log('error', 'HTTP request failed', {
            path,
            attempt,
            error,
          });
          throw error;
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
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
