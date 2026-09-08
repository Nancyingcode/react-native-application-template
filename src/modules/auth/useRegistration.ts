import { useEffect, useMemo, useRef, useState } from 'react';
import { useApplication } from '../../app/ApplicationProvider';
import { useAppNavigation } from '../../app/navigation';
import { ApiError } from '../../core/http';
import { AuthRepository } from './repository';

interface RegistrationForm {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
}

export function useRegistration(form: RegistrationForm) {
  const { services } = useApplication();
  const navigate = useAppNavigation();
  const repository = useMemo(
    () => new AuthRepository(services.http),
    [services.http],
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const canSubmit =
    !!form.email.trim() && !!form.password && !!form.confirmPassword;

  useEffect(() => {
    mounted.current = true;
    return () => {
      // 离页后注册仍可能在服务端完成，但迟到的响应不能恢复登录或跳转。
      mounted.current = false;
    };
  }, []);

  const submit = async (): Promise<void> => {
    if (!mounted.current || inFlight.current || !canSubmit) {
      return;
    }
    const validationError = validateRegistration(form);
    if (validationError) {
      setErrorKey(validationError);
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setErrorKey(null);
    services.analytics.track('registration_submitted');
    try {
      const session = await repository.register({
        email: form.email,
        password: form.password,
        displayName: form.displayName,
      });
      if (!mounted.current) {
        return;
      }
      await services.session.setSession(session);
      if (mounted.current) {
        navigate('Home');
      }
    } catch (error) {
      if (mounted.current) {
        setErrorKey(registrationErrorKey(error));
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setSubmitting(false);
      }
    }
  };

  return { submitting, errorKey, submit, canSubmit };
}

function validateRegistration(form: RegistrationForm): string | null {
  const email = form.email.trim();
  const validEmail =
    characterLength(email) <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!validEmail) {
    return 'auth.register.error.email';
  }
  const passwordLength = characterLength(form.password);
  if (passwordLength < 12 || passwordLength > 128) {
    return 'auth.register.error.password';
  }
  // 与注册服务的强密码规则一致：中文、emoji 等字符不能代替所需的字母或符号。
  const strongPassword =
    /[a-z]/.test(form.password) &&
    /[A-Z]/.test(form.password) &&
    /[0-9]/.test(form.password) &&
    /[-#!$@£%^&*()_+|~=`{}[\]:";'<>?,./\\ ]/.test(form.password);
  if (!strongPassword) {
    return 'auth.register.error.passwordStrength';
  }
  if (form.password !== form.confirmPassword) {
    return 'auth.register.error.confirmPassword';
  }
  if (characterLength(form.displayName.trim()) > 100) {
    return 'auth.register.error.displayName';
  }
  return null;
}

function characterLength(value: string): number {
  // 与服务端 validator.isLength 保持一致，避免将 emoji 或变体选择符误计为多个字符。
  const surrogatePairs = value.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g) ?? [];
  const variationSequences =
    value.match(/[^\uFE0F\uFE0E][\uFE0F\uFE0E]/g) ?? [];
  return value.length - surrogatePairs.length - variationSequences.length;
}

function registrationErrorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return 'auth.register.error.rateLimited';
    }
    switch (error.code) {
      case 'USER_ALREADY_EXISTS':
        return 'auth.register.error.exists';
      case 'VALIDATION_FAILED':
        return 'auth.register.error.validation';
    }
  }
  return 'auth.register.error.failed';
}
