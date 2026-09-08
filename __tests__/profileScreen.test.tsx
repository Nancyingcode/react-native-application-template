import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useApplication } from '../src/app/ApplicationProvider';
import { AppNavigationProvider } from '../src/app/navigation';
import { activeBrand } from '../src/brands/generated/activeBrand';
import { I18n } from '../src/core/i18n';
import type { CoreServices } from '../src/core/services';
import { ProfileScreen } from '../src/modules/auth/ProfileScreen';
import type { UserProfile } from '../src/modules/auth/profileRepository';
import { profileTranslations } from '../src/modules/auth/profileTranslations';
import { useProfile } from '../src/modules/auth/useProfile';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));

jest.mock('../src/modules/auth/useProfile', () => ({
  useProfile: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const profile: UserProfile = {
  id: '019934ba-7437-7000-8000-000000000001',
  email: 'customer@example.com',
  phone: '+852 1234 5678',
  displayName: 'Profile Customer',
  status: 'ACTIVE',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-08T08:00:00.000Z',
};

describe('personal profile screen', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  const navigate = jest.fn();
  const refresh = jest.fn();

  async function renderScreen(
    state: Partial<ReturnType<typeof useProfile>> = {},
    locale = 'zh-CN',
  ) {
    const i18n = new I18n('zh-CN');
    for (const [language, messages] of Object.entries(profileTranslations)) {
      i18n.add(language, messages);
    }
    i18n.setLocale(locale);
    const application: ReturnType<typeof useApplication> = {
      brand: activeBrand,
      environment: 'development',
      locale,
      services: { i18n } as CoreServices,
      modules: [],
      application: {
        routes: [],
        menu: [],
        home: [],
        login: [],
        initialRoute: 'Home',
      },
      setLocale: jest.fn(),
      setServerFlags: jest.fn(),
    };
    jest.mocked(useApplication).mockReturnValue(application);
    jest.mocked(useProfile).mockReturnValue({
      profile,
      loading: false,
      refreshing: false,
      errorKey: null,
      refresh,
      ...state,
    });
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AppNavigationProvider navigate={navigate} params={{}}>
          <ProfileScreen />
        </AppNavigationProvider>,
      );
    });
    return application;
  }

  function textValues(): unknown[] {
    return renderer!.root.findAllByType(Text).map(item => item.props.children);
  }

  function button(testID: string) {
    return renderer!.root.findByProps({
      testID,
      accessibilityRole: 'button',
    });
  }

  beforeEach(() => {
    navigate.mockReset();
    refresh.mockReset();
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer!.unmount());
      renderer = undefined;
    }
    jest.clearAllMocks();
  });

  it('shows an account name and placeholders for missing optional details', async () => {
    await renderScreen({
      profile: { ...profile, displayName: null, phone: null },
    });

    expect(textValues()).toContain('我的账户');
    expect(textValues().filter(value => value === '未设置')).toHaveLength(2);
    expect(textValues()).toContain(profile.email);
    expect(textValues()).toContain(profile.id);
  });

  it.each([
    ['zh-CN', 'ACTIVE', '正常'],
    ['zh-CN', 'DISABLED', '已停用'],
    ['zh-CN', 'LOCKED', '已锁定'],
    ['en-US', 'ACTIVE', 'Active'],
    ['en-US', 'DISABLED', 'Disabled'],
    ['en-US', 'LOCKED', 'Locked'],
  ] as const)(
    'renders %s account status %s as %s',
    async (locale, status, label) => {
      await renderScreen({ profile: { ...profile, status } }, locale);

      expect(textValues()).toContain(label);
      expect(textValues()).toContain(
        locale === 'zh-CN' ? '基本信息' : 'Personal information',
      );
    },
  );

  it('announces loading and disables refresh until the initial request completes', async () => {
    await renderScreen({ profile: undefined, loading: true });

    expect(textValues()).toContain('正在加载个人资料…');
    expect(button('profile-refresh').props).toMatchObject({
      disabled: true,
      accessibilityState: { busy: true, disabled: true },
    });
    expect(
      renderer!.root.findAllByProps({ testID: 'profile-retry' }),
    ).toHaveLength(0);
  });

  it('updates date language when the application locale changes', async () => {
    const timestamp = new Date(2026, 8, 8, 12).toISOString();
    const application = await renderScreen({
      profile: { ...profile, createdAt: timestamp, updatedAt: timestamp },
    });

    expect(
      textValues().some(
        value => typeof value === 'string' && value.includes('2026年9月8日'),
      ),
    ).toBe(true);

    await act(async () => {
      application.services.i18n.setLocale('en-US');
      jest.mocked(useApplication).mockReturnValue({
        ...application,
        locale: 'en-US',
      });
      renderer!.update(
        <AppNavigationProvider navigate={navigate} params={{}}>
          <ProfileScreen />
        </AppNavigationProvider>,
      );
    });

    expect(
      textValues().some(
        value => typeof value === 'string' && value.includes('Sep 8, 2026'),
      ),
    ).toBe(true);
    expect(textValues()).toContain('Personal information');
  });

  it('keeps details visible and disables refresh while updating', async () => {
    await renderScreen({ refreshing: true });

    expect(textValues()).toContain(profile.displayName);
    expect(textValues()).toContain('正在刷新…');
    expect(button('profile-refresh').props).toMatchObject({
      disabled: true,
      accessibilityState: { busy: true, disabled: true },
    });
    expect(
      renderer!.root.findByProps({ testID: 'profile-scroll' }).props
        .refreshControl.props.refreshing,
    ).toBe(true);
  });

  it('supports refresh from the button and pull to refresh', async () => {
    await renderScreen();

    await act(async () => button('profile-refresh').props.onPress());
    await act(async () => {
      renderer!.root
        .findByProps({ testID: 'profile-scroll' })
        .props.refreshControl.props.onRefresh();
    });

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('offers retry after a failed initial request', async () => {
    await renderScreen({
      profile: undefined,
      errorKey: 'auth.profile.error.failed',
    });

    expect(textValues()).toContain('加载失败，请检查网络后重试。');
    expect(textValues()).toContain('重新加载');
    await act(async () => button('profile-retry').props.onPress());

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('offers sign-in when the session is unavailable', async () => {
    await renderScreen({
      profile: undefined,
      errorKey: 'auth.profile.error.session',
    });

    expect(textValues()).toContain('请登录后查看个人资料。');
    expect(textValues()).toContain('去登录');
    await act(async () => button('profile-retry').props.onPress());

    expect(navigate).toHaveBeenCalledWith('AccountPasswordLogin');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('preserves existing details and explains a failed refresh', async () => {
    await renderScreen({ errorKey: 'auth.profile.error.failed' });

    expect(textValues()).toContain(profile.email);
    expect(textValues()).toContain('未能刷新，以下仍为上次加载的资料。');
    expect(button('profile-refresh').props.disabled).toBe(false);
    await act(async () => button('profile-refresh').props.onPress());

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('returns home from the back button', async () => {
    await renderScreen();
    await act(async () => button('profile-back').props.onPress());

    expect(navigate).toHaveBeenCalledWith('Home');
  });
});
