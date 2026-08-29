import type { Product } from './types';

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

interface DemoProductDefinition
  extends Pick<
    Product,
    'id' | 'imageUrl' | 'priceMinor' | 'currency' | 'inventory'
  > {
  nameKey: string;
  subtitleKey: string;
  descriptionKey: string;
  categoryKey: string;
}

const DEMO_PRODUCT_DEFINITIONS: DemoProductDefinition[] = [
  {
    id: 'aurora-headphones',
    nameKey: 'commerce.demo.auroraHeadphones.name',
    subtitleKey: 'commerce.demo.auroraHeadphones.subtitle',
    descriptionKey: 'commerce.demo.auroraHeadphones.description',
    categoryKey: 'commerce.demo.category.digitalAudio',
    imageUrl:
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900&auto=format&fit=crop',
    priceMinor: 129900,
    currency: 'CNY',
    inventory: 18,
  },
  {
    id: 'cedar-watch',
    nameKey: 'commerce.demo.cedarWatch.name',
    subtitleKey: 'commerce.demo.cedarWatch.subtitle',
    descriptionKey: 'commerce.demo.cedarWatch.description',
    categoryKey: 'commerce.demo.category.wearables',
    imageUrl:
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900&auto=format&fit=crop',
    priceMinor: 89900,
    currency: 'CNY',
    inventory: 32,
  },
  {
    id: 'linen-backpack',
    nameKey: 'commerce.demo.linenBackpack.name',
    subtitleKey: 'commerce.demo.linenBackpack.subtitle',
    descriptionKey: 'commerce.demo.linenBackpack.description',
    categoryKey: 'commerce.demo.category.lifestyle',
    imageUrl:
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&auto=format&fit=crop',
    priceMinor: 36900,
    currency: 'CNY',
    inventory: 45,
  },
  {
    id: 'ceramic-set',
    nameKey: 'commerce.demo.ceramicSet.name',
    subtitleKey: 'commerce.demo.ceramicSet.subtitle',
    descriptionKey: 'commerce.demo.ceramicSet.description',
    categoryKey: 'commerce.demo.category.homeware',
    imageUrl:
      'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=900&auto=format&fit=crop',
    priceMinor: 25900,
    currency: 'CNY',
    inventory: 12,
  },
];
const demoProductInstances = new WeakSet<Product>();

export function getDemoProducts(t: Translate): Product[] {
  return DEMO_PRODUCT_DEFINITIONS.map(definition => {
    const product: Product = {
      id: definition.id,
      name: t(definition.nameKey),
      subtitle: t(definition.subtitleKey),
      description: t(definition.descriptionKey),
      category: t(definition.categoryKey),
      imageUrl: definition.imageUrl,
      priceMinor: definition.priceMinor,
      currency: definition.currency,
      inventory: definition.inventory,
    };
    demoProductInstances.add(product);
    return product;
  });
}

export function isDemoProduct(product: Product): boolean {
  return demoProductInstances.has(product);
}

export function formatMoney(
  amountMinor: number,
  currency: string,
  locale: string,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}
