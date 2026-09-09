import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { LogoutButton } from '../src/modules/auth/logout/LogoutButton';
import {
  deferred,
  response,
  setupApplication,
} from '../src/modules/auth/sms/testing/fixtures';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));

describe('logout confirmation and feedback', () => {
  let renderer: Renderer.ReactTestRenderer;
  let services: ReturnType<typeof setupApplication>;
  const account = {
    userId: 'test-user',
    accessToken: 'test-access',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60000,
    permissions: [],
  };
  const button = (testID: string) =>
    renderer.root.findByProps({ testID, accessibilityRole: 'button' });
  beforeEach(async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response(null, 204));
    services = setupApplication();
    await services.session.setSession(account);
    await act(async () => {
      renderer = Renderer.create(<LogoutButton />);
    });
  });
  afterEach(async () => {
    await act(async () => renderer.unmount());
    jest.restoreAllMocks();
  });

  it('requires confirmation and cancellation has no side effects', async () => {
    const fetcher = jest.spyOn(global, 'fetch');
    act(() => button('logout-button').props.onPress());
    act(() => button('logout-cancel').props.onPress());
    expect(fetcher).not.toHaveBeenCalled();
    expect(services.session.getSnapshot()).toBe(account);
  });

  it.each([204, 503])(
    'shows accurate final feedback for %s after immediate local cleanup',
    async status => {
      const pending = deferred<Response>();
      const fetcher = jest
        .spyOn(global, 'fetch')
        .mockReturnValue(pending.promise);
      act(() => button('logout-button').props.onPress());
      const confirm = button('logout-confirm').props.onPress;
      let completion!: Promise<void>;
      await act(async () => {
        completion = confirm();
        confirm();
        await Promise.resolve();
      });
      expect(button('logout-button').props.accessibilityState.busy).toBe(true);
      expect(services.session.getSnapshot()).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
      await act(async () => {
        pending.resolve(response({ code: 'ERROR' }, status));
        await completion;
      });
      const expected = status === 204 ? 'revoked' : 'unconfirmed';
      expect(
        renderer.root.findByProps({ testID: 'logout-result' }).props.children,
      ).toBe(services.i18n.t(`auth.logout.${expected}`));
    },
  );

  it('does not sign out a new login during confirmation', async () => {
    const fetcher = jest.spyOn(global, 'fetch');
    act(() => button('logout-button').props.onPress());
    await act(async () =>
      services.session.setSession({ ...account, userId: 'new' }),
    );
    await act(async () => button('logout-confirm').props.onPress());
    expect(services.session.getSnapshot()?.userId).toBe('new');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('suppresses old remote failure after a new account logs in', async () => {
    const pending = deferred<Response>();
    jest.spyOn(global, 'fetch').mockReturnValue(pending.promise);
    act(() => button('logout-button').props.onPress());
    let completion!: Promise<void>;
    await act(async () => {
      completion = button('logout-confirm').props.onPress();
      await Promise.resolve();
    });
    await act(async () =>
      services.session.setSession({ ...account, userId: 'new' }),
    );
    await act(async () => {
      pending.reject(new TypeError('offline'));
      await completion;
    });
    expect(
      renderer.root.findAllByProps({ testID: 'logout-result' }),
    ).toHaveLength(0);
    expect(services.session.getSnapshot()?.userId).toBe('new');
  });

  it('finishes revocation even if the component unmounts', async () => {
    const pending = deferred<Response>();
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockReturnValue(pending.promise);
    act(() => button('logout-button').props.onPress());
    let completion!: Promise<void>;
    await act(async () => {
      completion = button('logout-confirm').props.onPress();
      renderer.unmount();
    });
    pending.resolve(response(null, 204));
    await completion;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(services.session.getSnapshot()).toBeNull();
  });
});
