import type {FeatureValue} from '../brand/types';

export interface RuntimeEntitlements {
  serverFlags: Record<string, FeatureValue>;
  permissions: ReadonlySet<string>;
  authenticated: boolean;
}

export function isContributionVisible(
  brandFeatures: Record<string, FeatureValue>,
  runtime: RuntimeEntitlements,
  requirement: {
    feature?: string;
    permissions?: string[];
    requiresAuth?: boolean;
  },
): boolean {
  if (requirement.requiresAuth && !runtime.authenticated) {
    return false;
  }
  if (requirement.feature) {
    const buildEnabled = brandFeatures[requirement.feature] === true;
    const serverEnabled = runtime.serverFlags[requirement.feature] !== false;
    if (!buildEnabled || !serverEnabled) {
      return false;
    }
  }
  return (requirement.permissions ?? []).every(permission =>
    runtime.permissions.has(permission),
  );
}
