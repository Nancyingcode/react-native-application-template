export interface OrderDraft {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
}

export interface TradingAdapter {
  submit(order: OrderDraft): Promise<{orderId: string}>;
}

export class RestTradingAdapter implements TradingAdapter {
  constructor(private readonly send: (order: OrderDraft) => Promise<{id: string}>) {}
  async submit(order: OrderDraft): Promise<{orderId: string}> {
    const result = await this.send(order);
    return {orderId: result.id};
  }
}

export class BrokerTradingAdapter implements TradingAdapter {
  constructor(private readonly brokerSend: (payload: Record<string, unknown>) => Promise<{ticket: string}>) {}
  async submit(order: OrderDraft): Promise<{orderId: string}> {
    const result = await this.brokerSend({
      instrument: order.symbol,
      direction: order.side.toUpperCase(),
      units: order.quantity,
    });
    return {orderId: result.ticket};
  }
}
