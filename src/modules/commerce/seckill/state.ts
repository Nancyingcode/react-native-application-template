import type { SeckillActivity, SeckillSku } from './types';

export type ActivityPhase =
  | 'scheduled'
  | 'active'
  | 'ended'
  | 'cancelled'
  | 'unavailable';
export function getActivityPhase(
  activity: SeckillActivity,
  now = Date.now(),
): ActivityPhase {
  if (activity.status === 'CANCELLED') {
    return 'cancelled';
  }
  if (activity.status === 'ENDED' || now >= Date.parse(activity.endAt)) {
    return 'ended';
  }
  if (activity.status !== 'ACTIVE' && activity.status !== 'SCHEDULED') {
    return 'unavailable';
  }
  if (now < Date.parse(activity.startAt) || activity.status === 'SCHEDULED') {
    return 'scheduled';
  }
  return 'active';
}
export function getQuantityLimit(sku: SeckillSku): number {
  return Math.max(0, Math.min(10, sku.perUserLimit, sku.availableStock));
}
