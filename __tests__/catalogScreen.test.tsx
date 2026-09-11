import React from 'react';
import { StyleSheet, TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import aurora from '../brands/aurora/brand.config.json';
import cedar from '../brands/cedar/brand.config.json';
import { useApplication } from '../src/app/ApplicationProvider';
import { AppNavigationProvider } from '../src/app/navigation';
import { activeBrand } from '../src/brands/generated/activeBrand';
import { createCoreServices } from '../src/core/services';
import { CatalogRepository } from '../src/modules/commerce/catalog/api';
import { SearchPanel } from '../src/modules/commerce/catalog/SearchPanel';
import { catalogTranslations } from '../src/modules/commerce/catalog/translations';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));

describe.each([aurora, cedar])('catalog search %s', configuration => {
  it.each(['zh-CN', 'en-US'])(
    'labels search, uses theme focus, filters and navigates by product ID in %s',
    async locale => {
      const brand = { ...activeBrand, theme: configuration.theme };
      const services = createCoreServices(brand);
      for (const [language, messages] of Object.entries(catalogTranslations)) {
        services.i18n.add(language, messages);
      }
      services.i18n.setLocale(locale);
      jest
        .mocked(useApplication)
        .mockReturnValue({ brand, services, locale } as ReturnType<
          typeof useApplication
        >);
      const repository = new CatalogRepository({ request: jest.fn() });
      jest
        .spyOn(repository, 'hot')
        .mockResolvedValue([{ keyword: 'Tea', count: 1 }]);
      const search = jest
        .spyOn(repository, 'search')
        .mockResolvedValue({
          items: [
            {
              productId: 'product-only',
              name: 'Tea',
              categoryId: 'real-category',
              categoryName: 'Drinks',
              subtitle: null,
              salePrice: 20,
              sales: 2,
              status: 'ACTIVE',
              createdAt: '',
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        });
      const navigate = jest.fn();
      let renderer!: Renderer.ReactTestRenderer;
      await act(async () => {
        renderer = Renderer.create(
          <AppNavigationProvider navigate={navigate} params={{}}>
            <SearchPanel repository={repository} onClose={jest.fn()} />
          </AppNavigationProvider>,
        );
      });
      const input = () => renderer.root.findByType(TextInput);
      expect(input().props.accessibilityLabel).toBe(
        services.i18n.t('commerce.products.search.label'),
      );
      expect(StyleSheet.flatten(input().props.style).borderColor).toBe(
        brand.theme.colors.border,
      );
      act(() => input().props.onFocus());
      expect(StyleSheet.flatten(input().props.style).borderColor).toBe(
        brand.theme.colors.primary,
      );
      await act(async () => input().props.onChangeText('Coffee'));
      await act(async () => input().props.onSubmitEditing());
      expect(search).toHaveBeenLastCalledWith(
        { sort: 'relevance', keyword: 'Coffee' },
        1,
        20,
      );
      const category = `${services.i18n.t(
        'commerce.products.search.category',
      )}: Drinks`;
      await act(async () =>
        renderer.root
          .findAllByProps({ accessibilityLabel: category })
          .find(node => typeof node.props.onPress === 'function')!
          .props.onPress(),
      );
      expect(search).toHaveBeenLastCalledWith(
        { sort: 'relevance', keyword: 'Coffee', category: 'real-category' },
        1,
        20,
      );
      await act(async () =>
        renderer.root
          .findAllByProps({ accessibilityRole: 'button' })
          .find(
            node =>
              node.props.style &&
              typeof node.props.style !== 'function' &&
              typeof node.props.onPress === 'function',
          )!
          .props.onPress(),
      );
      expect(navigate).toHaveBeenCalledWith('CommerceProductDetail', {
        productId: 'product-only',
      });
      await act(async () => renderer.unmount());
      jest.restoreAllMocks();
    },
  );
});
