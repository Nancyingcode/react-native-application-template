import type { HttpClient } from '../../core/http';

export interface UserProfile {
  id: string;
  email: string;
  phone: string | null;
  displayName: string | null;
  status: 'ACTIVE' | 'DISABLED' | 'LOCKED';
  createdAt: string;
  updatedAt: string;
}

export class ProfileRepository {
  constructor(private readonly http: HttpClient) {}

  async getProfile(): Promise<UserProfile> {
    const response = await this.http.request<{ data?: unknown }>(
      '/api/v1/users/me',
      { method: 'GET', authenticated: true },
    );
    const profile = response?.data;
    if (!isUserProfile(profile)) {
      throw new Error('Invalid user profile response');
    }
    return profile;
  }
}

function isUserProfile(value: unknown): value is UserProfile {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const profile = value as Record<string, unknown>;
  const validStatus =
    profile.status === 'ACTIVE' ||
    profile.status === 'DISABLED' ||
    profile.status === 'LOCKED';
  return (
    typeof profile.id === 'string' &&
    profile.id.trim().length > 0 &&
    typeof profile.email === 'string' &&
    profile.email.trim().length > 0 &&
    isNullableString(profile.phone) &&
    isNullableString(profile.displayName) &&
    validStatus &&
    isTimestamp(profile.createdAt) &&
    isTimestamp(profile.updatedAt)
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
