import React from 'react';
import { Text, TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { useApplication } from '../src/app/ApplicationProvider';
import { activeBrand } from '../src/brands/generated/activeBrand';
import { createCoreServices } from '../src/core/services';
import { CatalogRepository } from '../src/modules/commerce/catalog/api';
import { SkuPicker } from '../src/modules/commerce/catalog/SkuPicker';
import { catalogTranslations } from '../src/modules/commerce/catalog/translations';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));
const sku = {
  id: 'sku-1',
  productId: 'product-1',
  name: 'Blue',
  skuCode: 'BLUE',
  attributes: { Color: 'Blue' },
  price: '199.0000',
  originalPrice: null,
  currency: 'CNY',
  status: 'ACTIVE',
};

describe('SKU selection', () => {
  let renderer: Renderer.ReactTestRenderer;
  let services: ReturnType<typeof createCoreServices>;
  const repository = new CatalogRepository({ request: jest.fn() });
  const addItem = jest.fn();
  const integration = { repository, addItem };
  const button = () =>
    renderer.root
      .findAllByProps({
        accessibilityLabel: '加入购物车',
        accessibilityRole: 'button',
      })
      .find(item => typeof item.props.onPress === 'function')!;
  const hasText = (text: string) =>
    renderer.root
      .findAllByType(Text)
      .some(item => item.props.children === text);
  async function mount(authenticated = false) {
    services = createCoreServices(activeBrand);
    jest.spyOn(services.logger, 'log').mockImplementation(() => undefined);
    for (const [locale, messages] of Object.entries(catalogTranslations)) {
      services.i18n.add(locale, messages);
    }
    services.i18n.setLocale('zh-CN');
    if (authenticated) {
      await services.session.setSession({
        userId: 'user',
        accessToken: 'token',
        permissions: [],
        expiresAt: Date.now() + 60000,
      });
    }
    jest
      .mocked(useApplication)
      .mockReturnValue({ brand: activeBrand, services } as ReturnType<
        typeof useApplication
      >);
    await act(async () => {
      renderer = Renderer.create(
        <SkuPicker productId="product-1" integration={integration} />,
      );
    });
    await act(async () =>
      renderer.root
        .findAllByProps({ accessibilityRole: 'radio' })
        .find(item => typeof item.props.onPress === 'function')!
        .props.onPress(),
    );
  }
  beforeEach(() => {
    jest.spyOn(repository, 'listSkus').mockResolvedValue([sku]);
    jest.spyOn(repository, 'getSku').mockResolvedValue(sku);
    jest
      .spyOn(repository, 'inventory')
      .mockResolvedValue({ skuId: sku.id, available: 4 });
    addItem.mockReset().mockResolvedValue(undefined);
  });
  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer.unmount());
    }
    jest.restoreAllMocks();
  });

  it('does not request anonymous inventory and adds only the selected SKU', async () => {
    await mount();
    expect(repository.inventory).not.toHaveBeenCalled();
    expect(hasText('库存未知，暂时无法确认可售数量。')).toBe(true);
    await act(async () => button().props.onPress());
    expect(addItem).toHaveBeenCalledWith('sku-1', 1);
    expect(hasText('已加入购物车')).toBe(true);
  });

  it('validates quantity and prevents adding more than available stock', async () => {
    await mount(true);
    await act(async () =>
      renderer.root.findByType(TextInput).props.onChangeText('5'),
    );
    expect(button().props.disabled).toBe(true);
    expect(hasText('库存不足，请减少数量')).toBe(true);
    for (const quantity of ['0', '1.5', '100', '']) {
      await act(async () =>
        renderer.root.findByType(TextInput).props.onChangeText(quantity),
      );
      expect(button().props.disabled).toBe(true);
    }
    expect(addItem).not.toHaveBeenCalled();
  });

  it('checks fresh stock before adding and shows sold out distinctly', async () => {
    await mount(true);
    jest
      .mocked(repository.inventory)
      .mockResolvedValue({ skuId: sku.id, available: 0 });
    await act(async () => button().props.onPress());
    expect(addItem).not.toHaveBeenCalled();
    expect(hasText('已售罄')).toBe(true);
  });

  it('keeps inventory failure unknown and never replays an uncertain add', async () => {
    jest.mocked(repository.inventory).mockRejectedValue(new Error('offline'));
    await mount(true);
    expect(hasText('库存未知，暂时无法确认可售数量。')).toBe(true);
    expect(hasText('已售罄')).toBe(false);
    await act(async () => button().props.onPress());
    expect(addItem).not.toHaveBeenCalled();
  });

  it('suppresses repeated clicks and a completion after logout', async () => {
    await mount(true);
    let finish!: () => void;
    addItem.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        }),
    );
    let completion!: Promise<void>;
    await act(async () => {
      completion = button().props.onPress();
      button().props.onPress();
    });
    expect(addItem).toHaveBeenCalledTimes(1);
    await act(async () => services.session.signOut());
    await act(async () => {
      finish();
      await completion;
    });
    expect(hasText('已加入购物车')).toBe(false);
  });

  it('does not replay a failed cart mutation', async () => {
    await mount();
    addItem.mockRejectedValue(new Error('unknown network result'));
    await act(async () => button().props.onPress());
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(hasText('已加入购物车')).toBe(false);
    expect(hasText('未能确认加购结果，请先到购物车核对后再操作。')).toBe(true);
  });

  it('discards inventory from a previously selected SKU', async () => {
    jest
      .mocked(repository.listSkus)
      .mockResolvedValue([sku, { ...sku, id: 'sku-2' }]);
    let finish!: (value: { skuId: string; available: number }) => void;
    jest.mocked(repository.inventory).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    await mount(true);
    jest
      .mocked(repository.inventory)
      .mockResolvedValue({ skuId: 'sku-2', available: 3 });
    await act(async () => {
      const options = renderer.root
        .findAllByProps({ accessibilityRole: 'radio' })
        .filter(
          item =>
            typeof item.props.onPress === 'function' &&
            item.props.accessibilityState.checked === false,
        );
      options[0].props.onPress();
    });
    await act(async () => finish({ skuId: 'sku-1', available: 0 }));
    expect(hasText('已售罄')).toBe(false);
    expect(hasText('库存 3 件')).toBe(true);
  });
});
