const configuredApiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || 'https://chikondi265.zapto.org';

export const API_BASE_URL = configuredApiBaseUrl.replace(/\/+$/, '');
export const USE_LIVE_API = true;
