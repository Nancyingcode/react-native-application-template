import {useEffect} from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import type {Analytics} from '../core/telemetry';

export function useAnalyticsLifecycle(analytics: Analytics): void {
  useEffect(() => {
    let currentState: AppStateStatus = AppState.currentState;
    let activeSince = currentState === 'active' ? Date.now() : undefined;

    analytics.track('app_open', {initialState: currentState});

    const subscription = AppState.addEventListener('change', nextState => {
      const wasActive = currentState === 'active';
      const isActive = nextState === 'active';
      const now = Date.now();

      if (wasActive && !isActive) {
        analytics.track('app_background', {
          engagementTimeMs: activeSince ? now - activeSince : 0,
        });
        analytics.flush().catch(() => undefined);
        activeSince = undefined;
      } else if (!wasActive && isActive) {
        analytics.track('app_foreground', {previousState: currentState});
        activeSince = now;
      }
      currentState = nextState;
    });

    return () => {
      subscription.remove();
      analytics.track('app_close', {
        engagementTimeMs: activeSince ? Date.now() - activeSince : 0,
      });
      analytics.flush().catch(() => undefined);
    };
  }, [analytics]);
}
