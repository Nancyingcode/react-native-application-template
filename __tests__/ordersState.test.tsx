import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { SessionManager, InMemorySessionStore } from '../src/core/auth';
import { OrdersRepository } from '../src/modules/commerce/orders/repository';
import { useOrders } from '../src/modules/commerce/orders/useOrders';
import orderFixture from './ordersFixture.json';

it('only server detail completion enables completed receipt state; unknown states cannot mutate', async () => {
  const session = new SessionManager(new InMemorySessionStore());
  await session.setSession({
    userId: 'user-a',
    accessToken: 'test',
    expiresAt: Date.now() + 60000,
    permissions: [],
  });
  const request = jest
    .fn()
    .mockResolvedValue({ data: { ...orderFixture, status: 'SHIPPED' } });
  const repository = new OrdersRepository({ request }, session);
  let latest!: ReturnType<typeof useOrders>;
  function Harness() {
    latest = useOrders(repository, session, 'order/1');
    return null;
  }
  let renderer!: Renderer.ReactTestRenderer;
  await act(async () => {
    renderer = Renderer.create(<Harness />);
  });
  request
    .mockResolvedValueOnce({ data: { id: 'order/1', status: 'COMPLETED' } })
    .mockResolvedValueOnce({ data: { ...orderFixture, status: 'SHIPPED' } });
  await act(async () => latest.mutate('receipt'));
  expect(latest.order?.status).toBe('SHIPPED');
  request.mockResolvedValueOnce({
    data: { ...orderFixture, status: 'FUTURE_STATUS' },
  });
  await act(async () => latest.load());
  await act(async () => {
    await latest.mutate('cancel');
    await latest.mutate('receipt');
  });
  expect(request).toHaveBeenCalledTimes(4);
  act(() => renderer.unmount());
  repository.dispose();
});
