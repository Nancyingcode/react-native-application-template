import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionManager } from '../../core/auth';
import {
  parseQrLoginPayload,
  qrLoginErrorKey,
  type QrLoginChallenge,
  type QrLoginGateway,
  type QrLoginRequest,
} from '../../modules/auth/qrLogin';

type Mode =
  | 'scanning'
  | 'resolving'
  | 'reviewing'
  | 'submitting'
  | 'rejecting'
  | 'result';
interface State {
  mode: Mode;
  challenge?: QrLoginChallenge;
  messageKey?: string;
}

export function useQrAuthorization(
  gateway: QrLoginGateway,
  session: SessionManager,
  active: boolean,
) {
  const [state, setState] = useState<State>({ mode: 'scanning' });
  const [now, setNow] = useState(Date.now);
  const current = useRef(state);
  const mounted = useRef(false);
  const generation = useRef(0);
  const request = useRef<QrLoginRequest | undefined>(undefined);
  const attempted = useRef(new Set<string>());
  const publish = useCallback((next: State) => {
    current.current = next;
    if (mounted.current) setState(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = session.subscribe(() => {
      // 公共会话未暴露登录代次；任何会话替换均保守终止授权，包括同账号重新登录和刷新。
      generation.current += 1;
      request.current = undefined;
      publish({ mode: 'result', messageKey: 'auth.qr.error.accountChanged' });
    });
    return () => {
      mounted.current = false;
      generation.current += 1;
      request.current = undefined;
      unsubscribe();
    };
  }, [session, publish]);

  useEffect(() => {
    const update = () => {
      const time = Date.now();
      setNow(time);
      const previous = current.current;
      if (
        previous.mode === 'reviewing' &&
        previous.challenge &&
        previous.challenge.expiresAt <= time
      ) {
        publish({
          ...previous,
          mode: 'result',
          messageKey: 'auth.qr.error.expired',
        });
      }
    };
    update();
    if (!active) return;
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [active, publish]);

  const reset = useCallback(() => {
    generation.current += 1;
    request.current = undefined;
    publish({ mode: 'scanning' });
  }, [publish]);

  const run = useCallback(
    async (action: 'scan' | 'confirm' | 'cancel', raw?: string) => {
      if (!mounted.current || !active) return;
      const previous = current.current;
      if (
        action === 'scan'
          ? previous.mode !== 'scanning'
          : previous.mode !== 'reviewing'
      )
        return;
      const owner = session.getSnapshot();
      if (!owner) {
        publish({ mode: 'result', messageKey: 'auth.qr.error.auth' });
        return;
      }
      let input: QrLoginRequest;
      try {
        if (action === 'scan') {
          input = parseQrLoginPayload(raw ?? '');
          if (attempted.current.has(input.sessionId)) {
            publish({ mode: 'result', messageKey: 'auth.qr.error.used' });
            return;
          }
          attempted.current.add(input.sessionId);
          request.current = input;
        } else {
          if (
            !request.current ||
            !previous.challenge ||
            previous.challenge.expiresAt <= Date.now()
          ) {
            publish({
              ...previous,
              mode: 'result',
              messageKey: 'auth.qr.error.expired',
            });
            return;
          }
          input = request.current;
        }
      } catch (error) {
        publish({ mode: 'result', messageKey: qrLoginErrorKey(error) });
        return;
      }
      const ticket = ++generation.current;
      // 同步更新 ref，封住同一帧重复扫码和 confirm/cancel 双击；不依赖 React 提交时机。
      publish({
        ...previous,
        mode:
          action === 'scan'
            ? 'resolving'
            : action === 'confirm'
            ? 'submitting'
            : 'rejecting',
        messageKey: undefined,
      });
      const isCurrent = () =>
        mounted.current &&
        ticket === generation.current &&
        session.getSnapshot() === owner;
      try {
        const challenge = await gateway[action](input);
        if (!isCurrent()) return;
        if (
          previous.challenge &&
          previous.challenge.expiresAt !== challenge.expiresAt
        ) {
          publish({
            ...previous,
            mode: 'result',
            messageKey: 'auth.qr.error.unknown',
          });
          return;
        }
        setNow(Date.now());
        if (challenge.status === 'SCANNED' && action === 'scan') {
          publish(
            challenge.expiresAt > Date.now()
              ? { mode: 'reviewing', challenge }
              : {
                  mode: 'result',
                  challenge,
                  messageKey: 'auth.qr.error.expired',
                },
          );
        } else {
          const messageKey =
            challenge.status === 'CONFIRMED'
              ? 'auth.qr.success.description'
              : challenge.status === 'CANCELLED'
              ? 'auth.qr.cancelled.description'
              : challenge.status === 'CONSUMED'
              ? 'auth.qr.consumed.description'
              : 'auth.qr.error.status';
          publish({ mode: 'result', challenge, messageKey });
        }
      } catch (error) {
        if (isCurrent())
          publish({
            ...previous,
            mode: 'result',
            messageKey: qrLoginErrorKey(error),
          });
      }
    },
    [active, gateway, publish, session],
  );

  return {
    ...state,
    secondsRemaining: state.challenge
      ? Math.max(0, Math.ceil((state.challenge.expiresAt - now) / 1000))
      : undefined,
    scan: (raw: string) => run('scan', raw),
    confirm: () => run('confirm'),
    cancel: () => run('cancel'),
    reset,
  };
}
