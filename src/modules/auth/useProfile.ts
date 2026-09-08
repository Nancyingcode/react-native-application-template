import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useApplication } from '../../app/ApplicationProvider';
import { InvalidRefreshSessionError } from '../../core/auth';
import { ApiError, AuthenticationRequiredError } from '../../core/http';
import { ProfileRepository, type UserProfile } from './profileRepository';

interface ProfileState {
  userId: string | undefined;
  profile: UserProfile | undefined;
  phase: 'idle' | 'loading' | 'refreshing';
  errorKey: string | null;
}

export function useProfile() {
  const { services } = useApplication();
  const { session, monitor } = services;
  const currentSession = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const userId = currentSession?.userId;
  const repository = useMemo(
    () => new ProfileRepository(services.http),
    [services.http],
  );
  const [state, setState] = useState<ProfileState>({
    userId,
    profile: undefined,
    phase: userId ? 'loading' : 'idle',
    errorKey: null,
  });
  const request = useRef({ id: 0, active: false, mounted: false });

  const load = useCallback(async (): Promise<void> => {
    const canLoad =
      request.current.mounted &&
      !request.current.active &&
      userId !== undefined &&
      session.getSnapshot()?.userId === userId;
    if (!canLoad) {
      return;
    }
    const requestId = ++request.current.id;
    request.current.active = true;
    // 账号可能先于 effect 切换，迟到的结果必须再次核对当前会话。
    const isCurrentRequest = () =>
      request.current.mounted &&
      request.current.id === requestId &&
      session.getSnapshot()?.userId === userId;
    setState(current => {
      const profile = current.userId === userId ? current.profile : undefined;
      return {
        userId,
        profile,
        phase: profile ? 'refreshing' : 'loading',
        errorKey: null,
      };
    });
    try {
      const profile = await repository.getProfile();
      if (!isCurrentRequest()) {
        return;
      }
      if (profile.id !== userId) {
        throw new Error('User profile does not match the current account');
      }
      setState({ userId, profile, phase: 'idle', errorKey: null });
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }
      monitor.capture(error, { scope: 'auth.profile' });
      setState(current => ({
        ...current,
        phase: 'idle',
        errorKey: profileErrorKey(error),
      }));
    } finally {
      if (isCurrentRequest()) {
        request.current.active = false;
      }
    }
  }, [monitor, repository, session, userId]);

  useEffect(() => {
    const currentRequest = request.current;
    currentRequest.mounted = true;
    if (userId) {
      load();
    } else {
      setState({
        userId: undefined,
        profile: undefined,
        phase: 'idle',
        errorKey: 'auth.profile.error.session',
      });
    }
    return () => {
      currentRequest.mounted = false;
      currentRequest.active = false;
      currentRequest.id += 1;
    };
  }, [load, userId]);

  const refresh = useCallback(() => {
    load();
  }, [load]);

  // 续期只替换 Token；资料归属按账号判断，避免续期触发重复加载。
  const isCurrentAccount = userId !== undefined && state.userId === userId;
  let errorKey: string | null = null;
  if (!userId) {
    errorKey = 'auth.profile.error.session';
  } else if (isCurrentAccount) {
    errorKey = state.errorKey;
  }
  return {
    profile: isCurrentAccount ? state.profile : undefined,
    loading:
      Boolean(userId) && (!isCurrentAccount || state.phase === 'loading'),
    refreshing: isCurrentAccount && state.phase === 'refreshing',
    errorKey,
    refresh,
  };
}

function profileErrorKey(error: unknown): string {
  const sessionExpired =
    error instanceof AuthenticationRequiredError ||
    error instanceof InvalidRefreshSessionError ||
    (error instanceof ApiError && error.status === 401);
  if (sessionExpired) {
    return 'auth.profile.error.session';
  }
  if (error instanceof ApiError) {
    switch (error.status) {
      case 404:
        return 'auth.profile.error.unavailable';
      case 403:
        return 'auth.profile.error.forbidden';
      case 429:
        return 'auth.profile.error.rateLimited';
    }
  }
  return 'auth.profile.error.failed';
}
