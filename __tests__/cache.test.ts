import {MemoryCache} from '../src/core/cache';

describe('MemoryCache', () => {
  it('expires values at the configured ttl', async () => {
    let now = 100;
    const cache = new MemoryCache(() => now);
    await cache.set('quote:AAPL', {price: 200}, 10);
    expect(await cache.get('quote:AAPL')).toEqual({price: 200});
    now = 110;
    expect(await cache.get('quote:AAPL')).toBeUndefined();
  });
});
