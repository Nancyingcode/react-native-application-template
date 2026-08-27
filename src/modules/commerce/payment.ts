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
  constructor(message: string) {
    super(message);
    this.name = 'PaymentLaunchError';
  }
}

export class PaymentLauncher {
  constructor(private readonly native: NativeCapabilities) {}

  async launch(session: PaymentSession): Promise<void> {
    assertTrustedPaymentUrl(session.provider, session.redirectUrl);
    const supported = await this.native.canOpenUrl(session.redirectUrl);
    if (!supported) {
      const app = session.provider === 'wechat' ? '微信' : '支付宝';
      throw new PaymentLaunchError(
        `无法打开${app}，请确认已安装并升级到最新版`,
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
    throw new PaymentLaunchError('支付地址格式无效');
  }

  const policy = PAYMENT_URL_POLICIES[provider];
  if (url.protocol === 'https:') {
    if (!policy.httpsHosts.has(url.hostname.toLowerCase())) {
      throw new PaymentLaunchError('支付地址不属于受信任的支付平台');
    }
    return;
  }
  if (!policy.schemes.has(url.protocol.toLowerCase())) {
    throw new PaymentLaunchError('支付地址与所选支付方式不匹配');
  }
}
