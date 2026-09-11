import React from 'react';
import { PrimaryButton } from '../src/modules/commerce/shared/ui';
import Renderer, { act } from 'react-test-renderer';
import { useApplication } from '../src/app/ApplicationProvider';
import { AppNavigationProvider } from '../src/app/navigation';
import { activeBrand } from '../src/brands/generated/activeBrand';
import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { I18n } from '../src/core/i18n';
import { AccountStore } from '../src/modules/commerce/account/AccountStore';
import { AccountScreen } from '../src/modules/commerce/account/screen';
import { accountTranslations } from '../src/modules/commerce/account/translations';
import { NotificationsStore } from '../src/modules/commerce/notifications/NotificationsStore';
import { NotificationsScreen } from '../src/modules/commerce/notifications/screen';
import { UnreadBadge } from '../src/modules/commerce/notifications/UnreadBadge';
import { notificationsTranslations } from '../src/modules/commerce/notifications/translations';
import type {
  MemberProfile,
  PointsAccount,
} from '../src/modules/commerce/account/repository';
import type { Notification } from '../src/modules/commerce/notifications/repository';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));

async function setup(locale: string) {
  const session = new SessionManager(new InMemorySessionStore());
  await session.setSession({
    userId: 'a',
    accessToken: 'a',
    permissions: [],
    expiresAt: Date.now() + 60000,
  });
  const i18n = new I18n(locale);
  for (const catalog of [accountTranslations, notificationsTranslations]) {
    for (const [language, messages] of Object.entries(catalog)) {
      i18n.add(language, messages);
    }
  }
  jest.mocked(useApplication).mockReturnValue({
    brand: activeBrand,
    locale,
    services: { i18n, session },
  } as ReturnType<typeof useApplication>);
  return { session, i18n };
}
const member: MemberProfile = {
  userId: 'a',
  levelConfigId: 'level',
  growthValue: 25,
  createdAt: '2026-09-01',
  updatedAt: '',
  levelConfig: {
    id: 'level',
    code: 'GOLD',
    name: 'Gold',
    growthThreshold: 20,
    discountRate: 90,
    freeShipping: true,
    pointsMultiplier: 2,
    isActive: true,
    createdAt: '',
    updatedAt: '',
  },
};
const points: PointsAccount = {
  userId: 'a',
  available: 400,
  frozen: 10,
  totalEarned: 500,
  totalSpent: 90,
  version: 1,
  createdAt: '',
  updatedAt: '',
};
const message: Notification = {
  id: 'one',
  userId: 'a',
  eventId: 'event',
  channel: 'IN_APP',
  type: 'ORDER',
  title: 'Delivery update',
  content: 'Your order is on the way.',
  status: 'SENT',
  readAt: null,
  sentAt: null,
  error: null,
  createdAt: '2026-09-12T10:00:00Z',
  updatedAt: '',
};
const press = (renderer: Renderer.ReactTestRenderer, label: string) =>
  renderer.root
    .findAll(
      node =>
        node.props?.accessibilityRole === 'button' &&
        typeof node.props.onPress === 'function',
    )
    .find(node => node.props.accessibilityLabel === label)!
    .props.onPress();

it.each(['zh-CN', 'en-US'])(
  'renders account, omits arbitrary spend, navigates by route, and clears on logout in %s',
  async locale => {
    const { session, i18n } = await setup(locale);
    const store = new AccountStore(
      {
        member: jest.fn().mockResolvedValue(member),
        points: jest.fn().mockResolvedValue(points),
      },
      session,
    );
    const navigate = jest.fn();
    let renderer!: Renderer.ReactTestRenderer;
    await act(async () => {
      renderer = Renderer.create(
        <AppNavigationProvider navigate={navigate} params={{}}>
          <AccountScreen store={store} />
        </AppNavigationProvider>,
      );
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('Gold');
    expect(JSON.stringify(renderer.toJSON())).toContain('400');
    expect(renderer.root.findAllByType(PrimaryButton)).toHaveLength(1);
    act(() => press(renderer, i18n.t('commerce.notifications.title')));
    expect(navigate).toHaveBeenCalledWith('CommerceNotifications');
    await act(async () => session.signOut());
    expect(JSON.stringify(renderer.toJSON())).not.toContain('Gold');
    act(() => renderer.unmount());
    store.dispose();
  },
);

it('mounts badge and page together, requires read-all confirmation, and updates both', async () => {
  const { session, i18n } = await setup('zh-CN');
  const repository = {
    page: jest.fn().mockResolvedValue({ items: [message], nextCursor: null }),
    unreadCount: jest.fn().mockResolvedValue(1),
    read: jest.fn().mockResolvedValue(undefined),
    readAll: jest.fn().mockResolvedValue(1),
  };
  const store = new NotificationsStore(repository, session);
  let renderer!: Renderer.ReactTestRenderer;
  await act(async () => {
    renderer = Renderer.create(
      <>
        <UnreadBadge store={store} onPress={jest.fn()} />
        <NotificationsScreen store={store} />
      </>,
    );
  });
  expect(JSON.stringify(renderer.toJSON())).toContain('Delivery update');
  act(() => press(renderer, i18n.t('commerce.notifications.readAll')));
  expect(repository.readAll).not.toHaveBeenCalled();
  act(() => press(renderer, i18n.t('commerce.notifications.cancel')));
  expect(repository.readAll).not.toHaveBeenCalled();
  act(() => press(renderer, i18n.t('commerce.notifications.readAll')));
  repository.unreadCount.mockResolvedValue(0);
  repository.page.mockResolvedValue({
    items: [{ ...message, status: 'READ' }],
    nextCursor: null,
  });
  await act(async () =>
    press(renderer, i18n.t('commerce.notifications.confirm')),
  );
  expect(repository.readAll).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot().unread).toBe(0);
  expect(
    renderer.root
      .findAll(
        node =>
          node.props?.accessibilityRole === 'button' &&
          typeof node.props.onPress === 'function',
      )
      .find(
        node =>
          node.props.accessibilityLabel ===
          i18n.t('commerce.notifications.readAll'),
      )!.props.disabled,
  ).toBe(true);
  await act(async () => session.signOut());
  expect(JSON.stringify(renderer.toJSON())).not.toContain('Delivery update');
  act(() => renderer.unmount());
  store.dispose();
});
