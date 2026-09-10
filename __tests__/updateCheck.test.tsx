import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { UpdateCheck } from '../src/app/UpdateCheck';
import { ota } from '../src/core/ota';
import { queryUpdate } from '../src/core/ota/query';

const mockEnvironment: { otaQueryUrl?: string } = {};
jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: () => ({
    brand: {
      environments: { development: mockEnvironment },
      theme: { colors: {} },
    },
    environment: 'development',
    locale: 'zh-CN',
  }),
}));
jest.mock('../src/core/ota', () => ({ ota: { getStatus: jest.fn() } }));
jest.mock('../src/core/ota/query', () => ({ queryUpdate: jest.fn() }));
let renderer: ReactTestRenderer;
beforeEach(async () => {
  jest.clearAllMocks();
  mockEnvironment.otaQueryUrl =
    'https://updates.example.com/v1/apps/app/updates';
  jest
    .mocked(ota.getStatus)
    .mockResolvedValue({ supported: true, pendingVersion: 0 } as Awaited<
      ReturnType<typeof ota.getStatus>
    >);
  await act(async () => {
    renderer = create(<UpdateCheck />);
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
});
const text = () =>
  renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .join(' ');
const press = async () => {
  await act(async () => {
    await renderer.root
      .findAllByProps({ testID: 'ota-check-update' })
      .find(node => typeof node.props.onPress === 'function')!
      .props.onPress();
  });
};

it('shows configuration and unsupported states without querying', async () => {
  delete mockEnvironment.otaQueryUrl;
  await press();
  expect(text()).toContain('暂未开放');
  mockEnvironment.otaQueryUrl = 'https://updates.example.com';
  jest
    .mocked(ota.getStatus)
    .mockResolvedValue({ supported: false } as Awaited<
      ReturnType<typeof ota.getStatus>
    >);
  await press();
  expect(text()).toContain('不支持');
  expect(queryUpdate).not.toHaveBeenCalled();
});
it('shows available, empty and retryable failure states', async () => {
  jest.mocked(queryUpdate).mockResolvedValueOnce({
    updateAvailable: true,
    bundleVersion: 4,
    manifestUrl: 'https://updates.example.com/release.json',
  });
  await press();
  expect(text()).toContain('发现可用更新：4');
  jest.mocked(queryUpdate).mockRejectedValueOnce(new Error('offline'));
  await press();
  expect(text()).toContain('检查失败');
  jest.mocked(queryUpdate).mockResolvedValueOnce({ updateAvailable: false });
  await press();
  expect(text()).toContain('暂无可用更新');
  expect(
    renderer.root
      .findAllByProps({ testID: 'ota-check-update' })
      .find(node => typeof node.props.onPress === 'function')!.props.disabled,
  ).toBe(false);
});
it('blocks duplicate checks while the native status request is pending', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof ota.getStatus>>) => void;
  jest.mocked(ota.getStatus).mockReturnValue(
    new Promise(done => {
      resolve = done;
    }),
  );
  await act(async () => {
    renderer.root
      .findAllByProps({ testID: 'ota-check-update' })
      .find(node => typeof node.props.onPress === 'function')!
      .props.onPress();
    renderer.root
      .findAllByProps({ testID: 'ota-check-update' })
      .find(node => typeof node.props.onPress === 'function')!
      .props.onPress();
  });
  expect(ota.getStatus).toHaveBeenCalledTimes(1);
  expect(
    renderer.root
      .findAllByProps({ testID: 'ota-check-update' })
      .find(node => typeof node.props.onPress === 'function')!.props.disabled,
  ).toBe(true);
  await act(async () =>
    resolve({ supported: true, pendingVersion: 4 } as Awaited<
      ReturnType<typeof ota.getStatus>
    >),
  );
  expect(text()).toContain('重新打开');
  expect(queryUpdate).not.toHaveBeenCalled();
});
