import type { SeckillActivity } from '../types';
export const now = Date.parse('2026-09-12T00:00:00Z');
export const activity: SeckillActivity = {
  id: 'activity/a',
  name: 'Weekend sale',
  status: 'ACTIVE',
  startAt: new Date(now - 1000).toISOString(),
  endAt: new Date(now + 60000).toISOString(),
  version: 1,
  createdAt: '',
  updatedAt: '',
  skus: [
    {
      id: 'entry',
      activityId: 'activity/a',
      skuId: 'sku/a',
      seckillPrice: '100.0000',
      totalStock: 20,
      availableStock: 12,
      perUserLimit: 3,
      version: 1,
      createdAt: '',
      updatedAt: '',
    },
  ],
};
export const address = {
  recipient: ' Person ',
  phone: ' +123 ',
  province: ' Province ',
  city: ' City ',
  addressLine: ' Street ',
  district: '',
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
