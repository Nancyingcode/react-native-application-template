import type { Product } from './types';

export const demoProducts: Product[] = [
  {
    id: 'aurora-headphones',
    name: 'Aurora Pro 降噪耳机',
    subtitle: '沉浸声场 · 40 小时续航',
    description:
      '双芯主动降噪与自适应通透模式，可根据环境自动调整强度。轻量化头梁适合通勤和长时间佩戴。',
    category: '数码影音',
    imageUrl:
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900&auto=format&fit=crop',
    priceMinor: 129900,
    currency: 'CNY',
    inventory: 18,
  },
  {
    id: 'cedar-watch',
    name: 'Cedar 健康手表',
    subtitle: '全天候健康趋势追踪',
    description:
      '支持运动、睡眠和心率趋势记录，采用明亮的全天候显示屏与简洁轻盈的铝合金表壳。',
    category: '智能穿戴',
    imageUrl:
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900&auto=format&fit=crop',
    priceMinor: 89900,
    currency: 'CNY',
    inventory: 32,
  },
  {
    id: 'linen-backpack',
    name: '城市轻旅双肩包',
    subtitle: '防泼水面料 · 16 英寸电脑仓',
    description:
      '为日常通勤设计的轻量背包，独立电脑仓与隐藏式安全口袋让收纳保持清晰有序。',
    category: '生活方式',
    imageUrl:
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&auto=format&fit=crop',
    priceMinor: 36900,
    currency: 'CNY',
    inventory: 45,
  },
  {
    id: 'ceramic-set',
    name: '手作陶瓷咖啡组',
    subtitle: '一壶两杯 · 哑光釉面',
    description:
      '温润哑光釉与自然手作纹理，每一件都保留细微差异，适合日常手冲和赠礼。',
    category: '家居器物',
    imageUrl:
      'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=900&auto=format&fit=crop',
    priceMinor: 25900,
    currency: 'CNY',
    inventory: 12,
  },
];

export function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}
