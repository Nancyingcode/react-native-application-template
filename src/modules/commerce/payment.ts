import type { NativeCapabilities } from '../../core/native';
import type { PaymentProvider, PaymentSession } from './types';

const PAYMENT_URL_POLICIES: Record<
  PaymentProvider,
  { schemes: Set<string>; httpsHosts: Set<string> }
> = {
  wechat: {
    schemes: new Set(),
    httpsHosts: new Set(['wx.tenpay.com']),
  },
  alipay: {
    schemes: new Set(['alipays:']),
    httpsHosts: new Set([
      'mapi.alipay.com',
      'openapi.alipay.com',
      'render.alipay.com',
    ]),
  },
};

export class PaymentLaunchError extends Error {
  constructor(readonly messageKey: string) {
    super(messageKey);
    this.name = 'PaymentLaunchError';
  }
}

export class PaymentLauncher {
  constructor(private readonly native: NativeCapabilities) {}

  async launch(session: PaymentSession): Promise<void> {
    assertTrustedPaymentUrl(session.provider, session.redirectUrl);
    const supported = await this.native.canOpenUrl(session.redirectUrl);
    if (!supported) {
      throw new PaymentLaunchError(
        session.provider === 'wechat'
          ? 'commerce.payment.error.wechatUnavailable'
          : 'commerce.payment.error.alipayUnavailable',
      );
    }
    await this.native.openUrl(session.redirectUrl);
  }
}

export function assertTrustedPaymentUrl(
  provider: PaymentProvider,
  redirectUrl: string,
): void {
  let url: URL;
  try {
    url = new URL(redirectUrl);
  } catch {
    throw new PaymentLaunchError('commerce.payment.error.invalidUrl');
  }

  const policy = PAYMENT_URL_POLICIES[provider];
  if (url.protocol === 'https:') {
    if (!policy.httpsHosts.has(url.hostname.toLowerCase())) {
      throw new PaymentLaunchError('commerce.payment.error.untrustedUrl');
    }
    return;
  }
  if (!policy.schemes.has(url.protocol.toLowerCase())) {
    throw new PaymentLaunchError('commerce.payment.error.providerMismatch');
  }
}
