import type { HttpClient } from '../../../core/http';
import type { AfterSaleInput, AfterSalesPort, RefundInput } from './contracts';
import { validId, validateInput, AfterSaleValidationError } from './validation';

interface ApplicationResponse {
  data: { id: string; orderId: string; status: string };
}

export class AfterSalesRepository implements AfterSalesPort {
  constructor(private readonly http: Pick<HttpClient, 'request'>) {}

  async requestRefund(
    input: RefundInput,
    operation: { idempotencyKey: string },
  ) {
    validateInput(input, 'refund');
    if (!/^[A-Za-z0-9._-]{8,128}$/.test(operation.idempotencyKey)) {
      throw new AfterSaleValidationError();
    }
    const { data } = await this.http.request<ApplicationResponse>(
      `/api/v1/orders/${encodeURIComponent(input.orderId)}/refunds`,
      {
        method: 'POST',
        retry: 0,
        headers: { 'Idempotency-Key': operation.idempotencyKey },
        body: {
          ...(input.type === undefined ? {} : { type: input.type }),
          items: input.items.map(({ orderItemId, quantity }) => ({
            orderItemId,
            quantity,
          })),
          reason: input.reason,
        },
      },
    );
    this.validateResponse(data, input.orderId);
    return { refundId: data.id, status: data.status };
  }

  async requestAfterSale(input: AfterSaleInput) {
    validateInput(input, 'afterSale');
    const { data } = await this.http.request<ApplicationResponse>(
      `/api/v1/orders/${encodeURIComponent(input.orderId)}/after-sales`,
      {
        method: 'POST',
        retry: 0,
        body: {
          type: input.type,
          items: input.items.map(({ orderItemId, quantity }) => ({
            orderItemId,
            quantity,
          })),
          reason: input.reason,
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
        },
      },
    );
    this.validateResponse(data, input.orderId);
    return { afterSaleId: data.id, status: data.status };
  }

  private validateResponse(data: ApplicationResponse['data'], orderId: string) {
    if (
      !data ||
      !validId(data.id) ||
      !validId(data.status) ||
      data.orderId !== orderId
    ) {
      // POST 已发送，损坏的成功响应不能作为明确失败后重新申请的依据。
      throw new Error('Invalid after-sale response');
    }
  }
}
