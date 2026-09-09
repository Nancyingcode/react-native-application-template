import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { useAppNavigation } from '../../../app/navigation';
import type { AuthSession } from '../../../core/auth';
import { ApiError } from '../../../core/http';
import {
  isValidCode,
  isValidPhone,
  SmsRepository,
  type SmsCodeTiming,
} from './repository';

export function useSmsLogin() {
  const { services } = useApplication();
  const navigate = useAppNavigation();
  const repository = useMemo(
    () => new SmsRepository(services.http),
    [services.http],
  );
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [timing, setTiming] = useState<SmsCodeTiming | null>(null);
  const [busy, setBusy] = useState<'send' | 'login' | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const operation = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const committing = useRef<AuthSession | null>(null);

  function invalidate() {
    operation.current += 1;
    inFlight.current = false;
    setBusy(null);
    setTiming(null);
    setCode('');
    setErrorKey(null);
  }

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = services.session.subscribe(() => {
      if (
        committing.current === services.session.getSnapshot() &&
        committing.current
      ) {
        return;
      }
      invalidate();
    });
    return () => {
      mounted.current = false;
      operation.current += 1;
      unsubscribe();
    };
  }, [services.session]);

  useEffect(() => {
    if (!timing) {
      return;
    }
    const update = () => setNow(Date.now());
    update();
    const timer = setInterval(update, 1000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        update();
      }
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [timing]);

  const isCurrent = (id: number) => mounted.current && operation.current === id;

  async function run(action: 'send' | 'login'): Promise<void> {
    if (!mounted.current || inFlight.current) {
      return;
    }
    if (!isValidPhone(phone)) {
      setErrorKey('auth.login.phone.error.phone');
      return;
    }
    if (action === 'login' && !isValidCode(code)) {
      setErrorKey('auth.login.phone.error.codeFormat');
      return;
    }
    const expired = timing && Date.now() >= timing.expiresAt;
    if (action === 'login' && expired) {
      setErrorKey('auth.login.phone.error.expired');
      return;
    }
    if (action === 'send' && timing && Date.now() < timing.resendAt) {
      return;
    }
    const id = ++operation.current;
    inFlight.current = true;
    setBusy(action);
    setErrorKey(null);
    if (action === 'send') {
      // 重发可能已替换服务端验证码，结果未知时不能继续展示旧的发送成功状态。
      setTiming(null);
      setCode('');
    }
    try {
      if (action === 'send') {
        const result = await repository.sendCode(phone);
        if (isCurrent(id)) {
          setTiming(result);
          setCode('');
          setNow(Date.now());
        }
      } else {
        const session = await repository.login(phone, code);
        if (!isCurrent(id)) {
          return;
        }
        committing.current = session;
        await services.session.setSession(session);
        if (isCurrent(id) && services.session.getSnapshot() === session) {
          navigate('Home');
        }
      }
    } catch (error) {
      if (isCurrent(id)) {
        setErrorKey(smsErrorKey(error, action));
      }
    } finally {
      if (isCurrent(id)) {
        committing.current = null;
        inFlight.current = false;
        setBusy(null);
      }
    }
  }

  return {
    phone,
    code,
    busy,
    errorKey,
    sent: timing !== null,
    resendSeconds: timing
      ? Math.max(0, Math.ceil((timing.resendAt - now) / 1000))
      : 0,
    expiresSeconds: timing
      ? Math.max(0, Math.ceil((timing.expiresAt - now) / 1000))
      : 0,
    changePhone(value: string) {
      if (value !== phone) {
        invalidate();
        setPhone(value);
      }
    },
    changeCode(value: string) {
      // 程序化输入变化也必须取消旧登录意图，不能只依赖输入框 disabled。
      if (value !== code) {
        operation.current += 1;
        inFlight.current = false;
        setBusy(null);
        setErrorKey(null);
        setCode(value);
      }
    },
    sendCode: () => run('send'),
    submit: () => run('login'),
  };
}

export function smsErrorKey(error: unknown, action: 'send' | 'login'): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return 'auth.login.phone.error.rateLimited';
    }
    switch (error.code) {
      case 'SMS_UNAVAILABLE':
        return 'auth.login.phone.error.unavailable';
      case 'SMS_CODE_INVALID':
        return 'auth.login.phone.error.invalidCode';
      case 'INVALID_CREDENTIALS':
        return 'auth.login.phone.error.account';
      case 'USER_DISABLED':
        return 'auth.login.phone.error.disabled';
      case 'VALIDATION_FAILED':
        return 'auth.login.phone.error.validation';
    }
  }
  return `auth.login.phone.error.${action}Unknown`;
}
