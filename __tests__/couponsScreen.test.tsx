import React from 'react';

import Renderer, { act } from 'react-test-renderer';
import aurora from '../brands/aurora/brand.config.json';
import cedar from '../brands/cedar/brand.config.json';
import { useApplication } from '../src/app/ApplicationProvider';
import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { I18n } from '../src/core/i18n';
import { activeBrand } from '../src/brands/generated/activeBrand';
import { createCoreServices } from '../src/core/services';
import {
  CouponsClient,
  CouponsProvider,
  CouponsScreen,
  CouponSelector,
  CouponClaim,
  couponsTranslations,
} from '../src/modules/commerce/coupons';
import type { UserCoupon } from '../src/modules/commerce/coupons';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));
const coupon: UserCoupon = {
  id: 'instance-id',
  couponTemplateId: 'template-id',
  name: 'Welcome coupon',
  type: 'DISCOUNT',
  status: 'AVAILABLE',
  validFrom: '2026-01-01T00:00:00Z',
  validUntil: '2027-01-01T00:00:00Z',
  orderId: null,
  unavailableReason: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
async function setup(
  configuration: { theme: typeof aurora.theme } = aurora,
  locale = 'zh-CN',
) {
  const brand = { ...activeBrand, theme: configuration.theme };
  const i18n = new I18n(locale);
  Object.entries(couponsTranslations).forEach(([language, messages]) =>
    i18n.add(language, messages),
  );
  jest.mocked(useApplication).mockReturnValue({
    brand,
    locale,
    services: { ...createCoreServices(brand), i18n },
  } as ReturnType<typeof useApplication>);
  const session = new SessionManager(new InMemorySessionStore());
  await session.setSession({
    userId: 'A',
    accessToken: 'a',
    expiresAt: Date.now() + 60000,
    permissions: [],
  });
  const repository = {
    my: jest.fn().mockResolvedValue([coupon]),
    available: jest.fn().mockResolvedValue([coupon]),
    claim: jest.fn().mockResolvedValue(coupon),
  };
  const client = new CouponsClient(repository, session);
  const mount = async (children: React.ReactNode) => {
    let renderer!: Renderer.ReactTestRenderer;
    await act(async () => {
      renderer = Renderer.create(
        <CouponsProvider client={client}>{children}</CouponsProvider>,
      );
    });
    return renderer;
  };
  return { i18n, repository, client, session, mount };
}
const content = (renderer: Renderer.ReactTestRenderer) =>
  JSON.stringify(renderer.toJSON());
async function press(renderer: Renderer.ReactTestRenderer, label: string) {
  const button = renderer.root
    .findAll(node => typeof node.props.onPress === 'function')
    .find(node => node.props.accessibilityLabel === label);
  expect(button).toBeDefined();
  await act(async () => {
    button!.props.onPress();
  });
}

describe.each([aurora, cedar])('coupon theme %s', brand => {
  it.each(['zh-CN', 'en'])(
    'filters status and renders empty/error/retry states in %s',
    async locale => {
      const { mount, i18n, repository, client } = await setup(brand, locale);
      const renderer = await mount(<CouponsScreen />);
      expect(content(renderer)).toContain(coupon.name);
      repository.my.mockResolvedValueOnce([]);
      await press(renderer, i18n.t('commerce.coupons.USED'));
      expect(repository.my).toHaveBeenLastCalledWith('USED');
      expect(content(renderer)).toContain(i18n.t('commerce.coupons.empty'));
      repository.my.mockRejectedValueOnce(new Error('offline'));
      await press(renderer, i18n.t('commerce.coupons.refresh'));
      expect(content(renderer)).toContain(i18n.t('commerce.coupons.error'));
      await press(renderer, i18n.t('commerce.coupons.refresh'));
      expect(content(renderer)).toContain(coupon.name);
      act(() => renderer.unmount());
      client.dispose();
    },
  );
});

it('returns instance IDs, supports removal and disables unavailable/unknown coupons', async () => {
  const { mount, repository, i18n, client } = await setup();
  repository.available.mockResolvedValue([
    coupon,
    { ...coupon, id: 'locked', name: 'Locked', status: 'LOCKED' },
    { ...coupon, id: 'unknown', name: 'Unknown', status: 'NEW' },
  ]);
  const onChange = jest.fn();
  const renderer = await mount(
    <CouponSelector value={null} onChange={onChange} />,
  );
  await press(renderer, i18n.t('commerce.coupons.select') + ': ' + coupon.name);
  expect(onChange).toHaveBeenLastCalledWith({ couponId: 'instance-id' });
  expect(
    new Set(
      renderer.root
        .findAll(node => typeof node.props.onPress === 'function')
        .filter(node => node.props.disabled && node.props.accessibilityLabel)
        .map(node => node.props.accessibilityLabel),
    ).size,
  ).toBe(2);
  await press(renderer, i18n.t('commerce.coupons.none'));
  expect(onChange).toHaveBeenLastCalledWith(null);
  act(() => renderer.unmount());
  client.dispose();
});

it('preserves controlled values, reports unavailable selection and respects disabled', async () => {
  const { mount, client, i18n } = await setup();
  const onChange = jest.fn();
  const renderer = await mount(
    <CouponSelector
      value={{ couponId: 'missing' }}
      disabled
      onChange={onChange}
    />,
  );
  expect(content(renderer)).toContain(
    i18n.t('commerce.coupons.invalidSelection'),
  );
  expect(onChange).not.toHaveBeenCalled();
  expect(
    renderer.root
      .findAll(node => typeof node.props.onPress === 'function')
      .filter(node => node.props.accessibilityRole === 'radio')
      .every(node => node.props.disabled),
  ).toBe(true);
  act(() => renderer.unmount());
  client.dispose();
});

it('ignores older filters and account responses and performs no automatic onChange', async () => {
  const { mount, repository, i18n, session, client } = await setup();
  const pending = deferred<readonly UserCoupon[]>();
  repository.my.mockReturnValueOnce(pending.promise);
  const renderer = await mount(<CouponsScreen />);
  expect(content(renderer)).toContain(i18n.t('commerce.coupons.loading'));
  repository.my.mockResolvedValueOnce([]);
  await press(renderer, i18n.t('commerce.coupons.EXPIRED'));
  await act(async () => pending.resolve([coupon]));
  expect(content(renderer)).not.toContain(coupon.name);
  await act(async () => session.signOut());
  expect(content(renderer)).toContain(i18n.t('commerce.coupons.login'));
  act(() => renderer.unmount());
  client.dispose();
});

it('retains uncertain claim across unmount and retries with the original key', async () => {
  const { mount, repository, i18n, client } = await setup();
  repository.claim.mockRejectedValueOnce(new Error('timeout'));
  let renderer = await mount(
    <CouponClaim couponTemplateId="template-id" name="Campaign coupon" />,
  );
  await press(renderer, i18n.t('commerce.coupons.claim'));
  expect(content(renderer)).toContain(i18n.t('commerce.coupons.claimUnknown'));
  act(() => renderer.unmount());
  renderer = await mount(
    <CouponClaim couponTemplateId="template-id" name="Campaign coupon" />,
  );
  await press(renderer, i18n.t('commerce.coupons.claimRetry'));
  expect(repository.claim.mock.calls[1]).toEqual(
    repository.claim.mock.calls[0],
  );
  expect(content(renderer)).toContain(i18n.t('commerce.coupons.claimSuccess'));
  act(() => renderer.unmount());
  client.dispose();
});

it('does not update an unmounted query or render claims without a template source', async () => {
  const { mount, repository, client } = await setup();
  const pending = deferred<readonly UserCoupon[]>();
  repository.my.mockReturnValueOnce(pending.promise);
  const renderer = await mount(<CouponsScreen />);
  act(() => renderer.unmount());
  await act(async () => pending.resolve([coupon]));
  expect(renderer.toJSON()).toBeNull();
  const claim = await mount(<CouponClaim couponTemplateId="" name="" />);
  expect(claim.toJSON()).toBeNull();
  expect(repository.claim).not.toHaveBeenCalled();
  act(() => claim.unmount());
  client.dispose();
});
