import { InMemorySessionStore, SessionManager } from '../../../../core/auth';
import { MemoryCache } from '../../../../core/cache';
import { HttpClient } from '../../../../core/http';
import { logoutSession } from '../../logout/service';
import { SmsRepository } from '../repository';

// 仅手动运行已确认关闭代理的本机 Mockoon；常规测试不会导入或执行此文件。
async function main() {
  if (!process.argv.includes('--run-local-mock')) {
    throw new Error(
      'Requires --run-local-mock and a non-forwarding Mockoon on port 3002',
    );
  }
  const session = new SessionManager(new InMemorySessionStore());
  const http = new HttpClient({
    baseUrl: 'http://localhost:3002',
    timeoutMs: 5000,
    session,
    cache: new MemoryCache(),
    logger: {
      log() {},
      child() {
        return this;
      },
    },
  });
  const repository = new SmsRepository(http);
  try {
    const timing = await repository.sendCode('+19999999999');
    console.log(
      'Mock SMS response:',
      timing.expiresAt > Date.now() ? 'valid timing' : 'already expired',
    );
  } catch {
    console.log('Mock SMS response: rejected or unavailable');
  }
  try {
    const result = await repository.login('+19999999999', '123456');
    await session.setSession(result);
    console.log('Mock SMS login: validated');
  } catch {
    console.log('Mock SMS login: rejected or invalid authentication response');
  }
  const expected = session.getSnapshot() ?? {
    userId: 't1-mock-only',
    accessToken: 't1-mock-access',
    refreshToken: 't1-mock-refresh',
    permissions: [],
    expiresAt: Date.now() + 60000,
  };
  await session.setSession(expected);
  console.log('Mock logout:', await logoutSession(http, session, expected));
  console.log('Local session cleared:', session.getSnapshot() === null);
}

main().catch(() => {
  console.error('Mock smoke check failed');
  process.exitCode = 1;
});
