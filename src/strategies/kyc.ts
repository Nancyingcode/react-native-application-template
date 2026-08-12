export interface KycStep {
  id: string;
  required: boolean;
}

export interface KycStrategy {
  steps(): KycStep[];
}

export class StandardKycStrategy implements KycStrategy {
  steps(): KycStep[] {
    return [
      {id: 'identity', required: true},
      {id: 'address', required: true},
      {id: 'risk-profile', required: true},
    ];
  }
}

export class EnhancedKycStrategy implements KycStrategy {
  steps(): KycStep[] {
    return [
      ...new StandardKycStrategy().steps(),
      {id: 'source-of-funds', required: true},
      {id: 'liveness', required: true},
    ];
  }
}

export function createKycStrategy(kind: 'standard' | 'enhanced'): KycStrategy {
  return kind === 'enhanced' ? new EnhancedKycStrategy() : new StandardKycStrategy();
}
