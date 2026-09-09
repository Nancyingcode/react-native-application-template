import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useApplication } from '../../../app/ApplicationProvider';
import type { AuthSession } from '../../../core/auth';
import { logoutSession, type LogoutResult } from './service';

export function useLogout() {
  const { services } = useApplication();
  const session = useSyncExternalStore(
    services.session.subscribe,
    services.session.getSnapshot,
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    outcome: LogoutResult;
    owner: AuthSession | null;
  } | null>(null);
  const intent = useRef<AuthSession | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function cancel() {
    intent.current = null;
    setConfirming(false);
  }

  async function confirm(): Promise<void> {
    const expected = intent.current;
    if (!mounted.current || inFlight.current || !expected) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    cancel();
    const outcome = await logoutSession(
      services.http,
      services.session,
      expected,
    );
    inFlight.current = false;
    if (mounted.current) {
      setBusy(false);
      // 后来的登录有自己的页面状态，旧退出结果不能覆盖它或触发导航。
      if (
        !services.session.getSnapshot() ||
        services.session.getSnapshot() === expected
      ) {
        setResult({ outcome, owner: services.session.getSnapshot() });
      } else if (outcome === 'sessionChanged') {
        setResult({ outcome, owner: services.session.getSnapshot() });
      }
    }
  }

  return {
    confirming,
    busy,
    result: session === result?.owner ? result.outcome : null,
    canLogout: !!session && !busy,
    request() {
      if (inFlight.current || !services.session.getSnapshot()) {
        return;
      }
      intent.current = services.session.getSnapshot();
      setResult(null);
      setConfirming(true);
    },
    cancel,
    confirm,
  };
}
