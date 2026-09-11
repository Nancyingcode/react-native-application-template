import React, { createContext, useContext } from 'react';
import type { CouponsClient } from './client';

const Context = createContext<CouponsClient | null>(null);
export function CouponsProvider({
  client,
  children,
}: React.PropsWithChildren<{ client: CouponsClient }>) {
  return <Context.Provider value={client}>{children}</Context.Provider>;
}
export function useCouponsClient(): CouponsClient {
  const client = useContext(Context);
  if (!client) {
    throw new Error('CouponsProvider is required');
  }
  return client;
}
