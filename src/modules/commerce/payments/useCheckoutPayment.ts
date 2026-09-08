import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { useAppNavigation } from '../../../app/navigation';
import { AuthenticationRequiredError } from '../../../core/http';
import { CartStore, useCart } from '../CartStore';
import { PaymentLaunchError, PaymentLauncher } from '../payment';
import type { CommerceRepository } from '../repository';
import type { PaymentProvider, PaymentStatus } from './types';
export function createUseCheckoutPayment(
  repository: CommerceRepository,
  cart: CartStore,
  paymentLauncher: PaymentLauncher,
) {
  return function useCheckoutPayment() {
    const { brand, services } = useApplication();
    const navigate = useAppNavigation();
    const snapshot = useCart(cart);
    const providers = brand.commerce?.paymentProviders ?? ['wechat', 'alipay'];
    const [provider, setProvider] = useState<PaymentProvider>(providers[0]);
    const [phase, setPhase] = useState<
      'idle' | 'creating' | 'waiting' | 'checking' | 'succeeded' | 'failed'
    >('idle');
    const [paymentId, setPaymentId] = useState<string>();
    const [messageKey, setMessageKey] = useState('');
    const paymentInFlight = useRef(false);
    const statusInFlight = useRef(false);
    const busy = phase === 'creating' || phase === 'checking';

    const checkPayment = useCallback(async (): Promise<void> => {
      if (!paymentId) {
        return;
      }
      if (statusInFlight.current) {
        return;
      }
      statusInFlight.current = true;
      setPhase('checking');
      try {
        const status = await repository.getPaymentStatus(paymentId);
        applyPaymentStatus(status, setPhase, setMessageKey);
        if (status === 'succeeded') {
          cart.clear();
          services.analytics.track('commerce_payment_succeeded', {
            provider,
          });
        }
      } catch (error) {
        services.monitor.capture(error, { scope: 'commerce.payment.status' });
        setPhase('waiting');
        setMessageKey('commerce.payment.statusCheckFailed');
      } finally {
        statusInFlight.current = false;
      }
    }, [paymentId, provider, services.analytics, services.monitor]);

    useEffect(() => {
      if (!paymentId) {
        return;
      }
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'active') {
          checkPayment();
        }
      });
      return () => subscription.remove();
    }, [checkPayment, paymentId]);

    const pay = async (): Promise<void> => {
      if (paymentInFlight.current) {
        return;
      }
      if (snapshot.lines.length === 0) {
        navigate('CommerceCart');
        return;
      }
      paymentInFlight.current = true;
      setPhase('creating');
      setMessageKey('commerce.payment.creating');
      try {
        const order = await repository.createOrder(snapshot.lines);
        const session = await repository.createPayment(order.id, provider);
        setPaymentId(session.id);
        setPhase('waiting');
        setMessageKey('commerce.payment.returnToApp');
        services.analytics.track('commerce_payment_launched', {
          provider,
        });
        await paymentLauncher.launch(session);
      } catch (error) {
        setPhase('failed');
        setMessageKey(toPaymentErrorKey(error));
        services.monitor.capture(error, { scope: 'commerce.payment.launch' });
      } finally {
        paymentInFlight.current = false;
      }
    };

    return {
      snapshot,
      providers,
      provider,
      setProvider,
      phase,
      paymentId,
      messageKey,
      busy,
      checkPayment,
      pay,
    };
  };
}
function applyPaymentStatus(
  status: PaymentStatus,
  setPhase: (phase: 'waiting' | 'succeeded' | 'failed') => void,
  setMessageKey: (messageKey: string) => void,
): void {
  if (status === 'succeeded') {
    setPhase('succeeded');
    setMessageKey('commerce.payment.success.title');
  } else if (status === 'failed' || status === 'cancelled') {
    setPhase('failed');
    setMessageKey(
      status === 'cancelled'
        ? 'commerce.payment.cancelled'
        : 'commerce.payment.failed',
    );
  } else {
    setPhase('waiting');
    setMessageKey('commerce.payment.pending');
  }
}

function toPaymentErrorKey(error: unknown): string {
  if (error instanceof AuthenticationRequiredError) {
    return 'commerce.payment.error.authenticationRequired';
  }
  if (error instanceof PaymentLaunchError) {
    return error.messageKey;
  }
  return 'commerce.payment.error.launchFailed';
}
