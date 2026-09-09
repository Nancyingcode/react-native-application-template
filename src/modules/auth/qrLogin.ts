import {
  ApiError,
  AuthenticationRequiredError,
  type HttpClient,
} from '../../core/http';

export interface QrLoginRequest {
  sessionId: string;
  scanToken: string;
}

export type QrLoginStatus =
  | 'PENDING'
  | 'SCANNED'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'CONSUMED';

export interface QrLoginChallenge {
  sessionId: string;
  status: QrLoginStatus;
  expiresAt: number;
}

export class QrLoginParseError extends Error {
  constructor(readonly code: 'invalid' | 'response') {
    super(code);
    this.name = 'QrLoginParseError';
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[a-f0-9]{64}$/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseQrLoginPayload(raw: string): QrLoginRequest {
  if (typeof raw !== 'string' || raw.length > 2048) {
    throw new QrLoginParseError('invalid');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new QrLoginParseError('invalid');
  }
  // type 来源于后端 QrLoginService.create；仅接受三字段数据，拒绝电脑凭证和 URL 扩展。
  if (
    !record(value) ||
    Object.keys(value).length !== 3 ||
    value.type !== 'qr-login' ||
    typeof value.sessionId !== 'string' ||
    !UUID.test(value.sessionId) ||
    typeof value.scanToken !== 'string' ||
    !TOKEN.test(value.scanToken)
  ) {
    throw new QrLoginParseError('invalid');
  }
  return { sessionId: value.sessionId, scanToken: value.scanToken };
}

function isStatus(value: unknown): value is QrLoginStatus {
  return (
    value === 'PENDING' ||
    value === 'SCANNED' ||
    value === 'CONFIRMED' ||
    value === 'CANCELLED' ||
    value === 'CONSUMED'
  );
}

function parseDeadline(value: string): number {
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!parts) throw new QrLoginParseError('response');
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] =
    parts;
  const calendar = new Date(0);
  calendar.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  const timestamp = Date.parse(value);
  // Date.parse 会把 2 月 30 日等日期归一化，不能把畸形响应变成更晚的截止时间。
  if (
    calendar.getUTCFullYear() !== Number(year) ||
    calendar.getUTCMonth() !== Number(month) - 1 ||
    calendar.getUTCDate() !== Number(day) ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    Number(offsetHour ?? 0) > 23 ||
    Number(offsetMinute ?? 0) > 59 ||
    !Number.isSafeInteger(timestamp)
  ) {
    throw new QrLoginParseError('response');
  }
  return timestamp;
}

export function validateQrLoginResponse(
  value: unknown,
  expectedId: string,
): QrLoginChallenge {
  const data = record(value) ? value.data : undefined;
  if (
    !record(data) ||
    data.sessionId !== expectedId ||
    !UUID.test(expectedId) ||
    !isStatus(data.status) ||
    typeof data.expiresAt !== 'string'
  ) {
    throw new QrLoginParseError('response');
  }
  const expiresAt = parseDeadline(data.expiresAt);
  return { sessionId: expectedId, status: data.status, expiresAt };
}

export interface QrLoginGateway {
  scan(request: QrLoginRequest): Promise<QrLoginChallenge>;
  confirm(request: QrLoginRequest): Promise<QrLoginChallenge>;
  cancel(request: QrLoginRequest): Promise<QrLoginChallenge>;
}

export function createQrLoginGateway(http: HttpClient): QrLoginGateway {
  const send = async (
    action: 'scan' | 'confirm' | 'cancel',
    request: QrLoginRequest,
  ) => {
    if (!UUID.test(request.sessionId) || !TOKEN.test(request.scanToken)) {
      throw new QrLoginParseError('invalid');
    }
    const response = await http.request<unknown>(
      `/api/v1/auth/qr-login/${encodeURIComponent(
        request.sessionId,
      )}/${action}`,
      {
        method: 'POST',
        body: { scanToken: request.scanToken },
        authenticated: true,
        retry: 0,
      },
    );
    return validateQrLoginResponse(response, request.sessionId);
  };
  return {
    scan: request => send('scan', request),
    confirm: request => send('confirm', request),
    cancel: request => send('cancel', request),
  };
}

export function qrLoginErrorKey(error: unknown): string {
  if (error instanceof QrLoginParseError) {
    return `auth.qr.error.${error.code === 'invalid' ? 'invalid' : 'unknown'}`;
  }
  if (error instanceof AuthenticationRequiredError) return 'auth.qr.error.auth';
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'QR_LOGIN_EXPIRED':
        return 'auth.qr.error.expired';
      case 'QR_LOGIN_INVALID':
        return 'auth.qr.error.invalid';
      case 'QR_LOGIN_NOT_OWNED':
        return 'auth.qr.error.owner';
      case 'QR_LOGIN_STATUS_INVALID':
        return 'auth.qr.error.status';
    }
    if (error.status === 401 || error.status === 403)
      return 'auth.qr.error.auth';
    if (error.status === 429) return 'auth.qr.error.rate';
  }
  // 断网、超时、5xx 和不合法成功响应都无法证明副作用未发生。
  return 'auth.qr.error.unknown';
}
