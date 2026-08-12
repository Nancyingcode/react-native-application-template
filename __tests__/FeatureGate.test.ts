import {isContributionVisible} from '../src/app/FeatureGate';

describe('isContributionVisible', () => {
  const runtime = {
    authenticated: true,
    permissions: new Set(['portfolio:read']),
    serverFlags: {portfolio: true},
  };

  it('requires build flag, server flag and permission together', () => {
    expect(
      isContributionVisible({portfolio: true}, runtime, {
        feature: 'portfolio',
        permissions: ['portfolio:read'],
        requiresAuth: true,
      }),
    ).toBe(true);
    expect(
      isContributionVisible({portfolio: false}, runtime, {feature: 'portfolio'}),
    ).toBe(false);
    expect(
      isContributionVisible(
        {portfolio: true},
        {...runtime, serverFlags: {portfolio: false}},
        {feature: 'portfolio'},
      ),
    ).toBe(false);
  });

  it('denies missing permissions', () => {
    expect(
      isContributionVisible({}, runtime, {permissions: ['trade:write']}),
    ).toBe(false);
  });
});
