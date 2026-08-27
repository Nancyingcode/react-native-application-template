import type { NativeCapabilities } from '../src/core/native';
import {
  PaymentLaunchError,
  PaymentLauncher,
  assertTrustedPaymentUrl,
} from '../src/modules/commerce/payment';
import type { PaymentSession } from '../src/modules/commerce/types';

const session: PaymentSession = {
  id: 'payment-1',
  orderId: 'order-1',
  provider: 'wechat',
  redirectUrl:
    'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=opaque',
  status: 'pending',
};

function createNative(supported = true): jest.Mocked<NativeCapabilities> {
  return {
    platform: 'android',
    canOpenUrl: jest.fn(async (_url: string) => supported),
    openUrl: jest.fn(async (_url: string) => undefined),
    share: jest.fn(async (_message: string) => undefined),
  };
}

describe('PaymentLauncher', () => {
  it('opens a trusted provider URL', async () => {
    const native = createNative();
    await new PaymentLauncher(native).launch(session);
    expect(native.openUrl).toHaveBeenCalledWith(session.redirectUrl);
  });

  it('rejects a URL that does not match the provider', () => {
    expect(() =>
      assertTrustedPaymentUrl('wechat', 'alipays://platformapi/startapp'),
    ).toThrow(PaymentLaunchError);
    expect(() =>
      assertTrustedPaymentUrl('alipay', 'https://payments.example.test/pay'),
    ).toThrow('受信任');
  });

  it('reports an unavailable payment app without opening the URL', async () => {
    const native = createNative(false);
    await expect(new PaymentLauncher(native).launch(session)).rejects.toThrow(
      '无法打开微信',
    );
    expect(native.openUrl).not.toHaveBeenCalled();
  });
});
