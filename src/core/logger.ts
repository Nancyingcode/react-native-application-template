export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

export interface Logger {
  log(level: LogLevel, message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

const SENSITIVE_FIELD = /token|password|secret|authorization|account/i;

function redact(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      SENSITIVE_FIELD.test(key) ? '[REDACTED]' : value,
    ]),
  );
}

export class ConsoleLogger implements Logger {
  constructor(private readonly baseFields: LogFields = {}) {}

  log(level: LogLevel, message: string, fields: LogFields = {}): void {
    const payload = redact({...this.baseFields, ...fields});
    const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    writer(`[${level.toUpperCase()}] ${message}`, payload);
  }

  child(fields: LogFields): Logger {
    return new ConsoleLogger({...this.baseFields, ...fields});
  }
}
