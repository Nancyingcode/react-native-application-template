import type { HttpClient } from '../../../core/http';
import { toAuthSession, type AuthenticationResponse } from '../authResponse';

export interface SmsCodeTiming {
  expiresAt: number;
  resendAt: number;
}

export function isValidPhone(phone: string): boolean {
  // 仅校验国家码前缀与数字格式，不从 Swagger 示例推断国家或运营商号段。
  return /^\+[1-9][0-9]+$/.test(phone.trim());
}

export function isValidCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code);
}

export class SmsRepository {
  constructor(private readonly http: HttpClient) {}

  async sendCode(phone: string): Promise<SmsCodeTiming> {
    if (!isValidPhone(phone)) {
      throw new Error('Invalid phone format');
    }
    const startedAt = Date.now();
    const response = await this.http.request<{
      data: {
        expiresAt: string;
        expiresInSeconds: number;
        resendAfterSeconds: number;
      };
    }>('/api/v1/auth/sms/code', {
      method: 'POST',
      body: { phone: phone.trim() },
      authenticated: false,
      retry: 0,
    });
    const data = response?.data;
    const expiresAt = Date.parse(data?.expiresAt);
    const validSeconds = (value: number): boolean =>
      Number.isSafeInteger(value) && value >= 0;
    const validTiming =
      data &&
      Number.isFinite(expiresAt) &&
      validSeconds(data.expiresInSeconds) &&
      validSeconds(data.resendAfterSeconds) &&
      Number.isSafeInteger(startedAt + data.expiresInSeconds * 1000) &&
      Number.isSafeInteger(Date.now() + data.resendAfterSeconds * 1000);
    if (!validTiming) {
      throw new Error('Invalid SMS timing response');
    }
    return {
      // 有效期取较早截止点，重发从收到确认开始，网络耗时不会提前开放重发。
      expiresAt: Math.min(expiresAt, startedAt + data.expiresInSeconds * 1000),
      resendAt: Date.now() + data.resendAfterSeconds * 1000,
    };
  }

  async login(phone: string, code: string) {
    if (!isValidPhone(phone) || !isValidCode(code)) {
      throw new Error('Invalid SMS login format');
    }
    const response = await this.http.request<AuthenticationResponse>(
      '/api/v1/auth/sms/login',
      {
        method: 'POST',
        body: { phone: phone.trim(), code },
        authenticated: false,
        retry: 0,
      },
    );
    return toAuthSession(response);
  }
}
