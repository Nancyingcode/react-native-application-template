import React from 'react';
import { Text, TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { useApplication } from '../src/app/ApplicationProvider';
import { AppNavigationProvider } from '../src/app/navigation';
import { activeBrand } from '../src/brands/generated/activeBrand';
import { createCoreServices } from '../src/core/services';
import { AfterSalesStore } from '../src/modules/commerce/after-sales/AfterSalesStore';
import { createAfterSaleScreen } from '../src/modules/commerce/after-sales/screen';
import { afterSalesTranslations } from '../src/modules/commerce/after-sales/translations';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));
const params = {
  orderId: 'order',
  orderItemId: '11111111-1111-4111-8111-111111111111',
  quantity: '2',
};
describe('after-sale application screen', () => {
  let renderer: Renderer.ReactTestRenderer;
  let services: ReturnType<typeof createCoreServices>;
  let store: AfterSalesStore;
  const port = { requestRefund: jest.fn(), requestAfterSale: jest.fn() };
  const orders = { getForAfterSale: jest.fn() };
  const navigate = jest.fn();
  const button = (label: string) =>
    renderer.root
      .findAllByProps({ accessibilityLabel: label })
      .find(node => typeof node.props.onPress === 'function')!;
  const text = () =>
    renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .flat()
      .join(' ');
  async function mount(route = params) {
    const Screen = createAfterSaleScreen(store);
    await act(async () => {
      renderer = Renderer.create(
        <AppNavigationProvider navigate={navigate} params={route}>
          <Screen />
        </AppNavigationProvider>,
      );
    });
  }
  beforeEach(async () => {
    services = createCoreServices(activeBrand);
    jest.spyOn(services.logger, 'log').mockImplementation(() => undefined);
    Object.entries(afterSalesTranslations).forEach(([locale, messages]) =>
      services.i18n.add(locale, messages),
    );
    services.i18n.setLocale('zh-CN');
    await services.session.setSession({
      userId: 'user',
      accessToken: 'token',
      permissions: [],
      expiresAt: Date.now() + 60000,
    });
    jest
      .mocked(useApplication)
      .mockReturnValue({ brand: activeBrand, services } as ReturnType<
        typeof useApplication
      >);
    port.requestRefund
      .mockReset()
      .mockResolvedValue({ refundId: 'refund-123', status: 'PENDING' });
    port.requestAfterSale.mockReset().mockResolvedValue({
      afterSaleId: 'after-sale-123',
      status: 'REQUESTED',
    });
    orders.getForAfterSale.mockReset().mockResolvedValue({
      orderId: params.orderId,
      status: 'PAID',
      items: [
        {
          orderItemId: params.orderItemId,
          quantity: 3,
          productId: 'p',
          skuId: 's',
        },
      ],
    });
    store = new AfterSalesStore(port, orders, services.session);
  });
  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer.unmount());
    }
    store.dispose();
    jest.restoreAllMocks();
  });
  async function fillReason() {
    await act(async () =>
      renderer.root
        .findAllByType(TextInput)[0]
        .props.onChangeText(' 商品损坏 '),
    );
  }
  it('requires a reason, reviews before POST, displays actual application id and status', async () => {
    await mount();
    expect(button('核对申请').props.disabled).toBe(true);
    await fillReason();
    await act(async () => button('核对申请').props.onPress());
    expect(port.requestRefund).not.toHaveBeenCalled();
    await act(async () => button('确认提交申请').props.onPress());
    expect(port.requestRefund.mock.calls[0][0].reason).toBe('商品损坏');
    expect(text()).toContain('refund-123');
    expect(text()).toContain('PENDING');
    expect(text()).toContain('当前暂不支持在此查看历史申请或撤销');
  });
  it('submits after-sale only with its own enum and optional description', async () => {
    await mount();
    await act(async () => button('售后申请').props.onPress());
    await act(async () => button('退货退款').props.onPress());
    await fillReason();
    await act(async () =>
      renderer.root
        .findAllByType(TextInput)[1]
        .props.onChangeText(' 包装破损 '),
    );
    await act(async () => button('核对申请').props.onPress());
    await act(async () => button('确认提交申请').props.onPress());
    expect(port.requestAfterSale.mock.calls[0][0]).toMatchObject({
      type: 'RETURN_REFUND',
      description: '包装破损',
    });
    expect(port.requestRefund).not.toHaveBeenCalled();
    expect(text()).toContain('after-sale-123');
  });
  it('offers no retry for an uncertain after-sale', async () => {
    port.requestAfterSale.mockRejectedValue(new Error('timeout'));
    await mount();
    await act(async () => button('售后申请').props.onPress());
    await fillReason();
    await act(async () => button('核对申请').props.onPress());
    await act(async () => button('确认提交申请').props.onPress());
    expect(text()).toContain('申请结果尚未确认');
    expect(text()).not.toContain('使用原申请重试退款');
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  });
  it('rejects invalid route quantities before loading', async () => {
    await mount({ ...params, quantity: '1e2' });
    expect(orders.getForAfterSale).not.toHaveBeenCalled();
    expect(text()).toContain('订单项或申请数量无效');
  });
  it('removes account data and form on sign-out', async () => {
    await mount();
    await fillReason();
    await act(async () => services.session.signOut());
    expect(text()).toContain('登录状态已变化');
    expect(text()).not.toContain(params.orderItemId);
    expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
  });
  it('handles failed order load and explicit recheck', async () => {
    orders.getForAfterSale.mockRejectedValueOnce(new Error('offline'));
    await mount();
    expect(text()).toContain('订单加载失败');
    await act(async () => button('重新核对订单').props.onPress());
    expect(button('核对申请').props.disabled).toBe(true);
  });
});
