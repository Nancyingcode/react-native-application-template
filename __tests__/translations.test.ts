import aurora from '../brands/aurora/brand.config.json';
import cedar from '../brands/cedar/brand.config.json';
import type { BrandConfig } from '../src/brand/types';
import type { CoreServices } from '../src/core/services';
import { authModule } from '../src/modules/auth';
import { commerceModule } from '../src/modules/commerce';
import { formatMoney, getDemoProducts } from '../src/modules/commerce/catalog';
import { marketsModule } from '../src/modules/markets';
import { newsModule } from '../src/modules/news';
import { onboardingModule } from '../src/modules/onboarding';
import { portfolioModule } from '../src/modules/portfolio';
import { tradingModule } from '../src/modules/trading';
import type { AppModuleFactory } from '../src/modules/contracts';
import { advancedOrdersPlugin } from '../src/plugins/advanced-orders';
import { qrLoginPlugin } from '../src/plugins/qr-login';

const factories: AppModuleFactory[] = [
  authModule,
  qrLoginPlugin,
  onboardingModule,
  marketsModule,
  tradingModule,
  portfolioModule,
  newsModule,
  commerceModule,
  advancedOrdersPlugin,
];

describe('translation catalogs', () => {
  test.each(factories)(
    '$id keeps Chinese and English module keys aligned',
    factory => {
      const module = factory.create({
        brand: aurora as BrandConfig,
        services: {} as CoreServices,
      });
      const chinese = module.translations?.['zh-CN'];
      const english = module.translations?.['en-US'];

      expect(chinese).toBeDefined();
      expect(english).toBeDefined();
      expect(Object.keys(chinese ?? {}).sort()).toEqual(
        Object.keys(english ?? {}).sort(),
      );
      expect(Object.values(chinese ?? {}).every(Boolean)).toBe(true);
      expect(Object.values(english ?? {}).every(Boolean)).toBe(true);
    },
  );

  test.each([aurora, cedar])(
    '$id supplies copy for every supported locale',
    brand => {
      const config = brand as BrandConfig;
      const defaultKeys = Object.keys(config.copy[config.defaultLocale]).sort();

      for (const locale of config.supportedLocales) {
        expect(Object.keys(config.copy[locale]).sort()).toEqual(defaultKeys);
        expect(Object.values(config.copy[locale]).every(Boolean)).toBe(true);
      }
    },
  );

  test('localizes demo products and currency formatting', () => {
    const translated = getDemoProducts(key => `translated:${key}`);

    expect(translated[0].name).toBe(
      'translated:commerce.demo.auroraHeadphones.name',
    );
    expect(formatMoney(129900, 'CNY', 'zh-CN')).not.toBe(
      formatMoney(129900, 'CNY', 'en-US'),
    );
  });
});
