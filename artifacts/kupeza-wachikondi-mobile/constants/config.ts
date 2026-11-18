const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!configuredApiBaseUrl) {
  throw new Error('EXPO_PUBLIC_API_BASE_URL must be configured.');
}

export const API_BASE_URL = configuredApiBaseUrl.replace(/\/+$/, '');
export const USE_LIVE_API = true;
