import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * False until the Supabase env vars are set in Vercel. The whole account layer
 * degrades to "everything unlocked" in that case, so this code can ship to
 * production before the Supabase/Stripe accounts exist without changing what
 * today's users see.
 */
export const isAuthConfigured = Boolean(url && anonKey);

/**
 * Separate switch from `isAuthConfigured`: set EXPO_PUBLIC_PAYWALL_ENABLED=true
 * only when you actually want to start charging. Until then the app runs with
 * accounts available but nothing locked, which is how you test the flow end to
 * end against live Stripe test keys without shutting anyone out.
 */
export const isPaywallEnabled =
  isAuthConfigured && process.env.EXPO_PUBLIC_PAYWALL_ENABLED === 'true';

export const supabase = createClient(
  url || 'https://unconfigured.supabase.co',
  anonKey || 'unconfigured',
  {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      // On web the magic-link callback lands back on the SPA with a `?code=`
      // query param that supabase-js exchanges for a session automatically.
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
  },
);

/** Base URL for the serverless functions. Same origin on web; explicit on native. */
export function apiBase(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return 'https://shadowing-app-gray.vercel.app';
}

/** Where the magic link should send the user back to. */
export function authRedirectTo(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/login`;
  }
  return 'shadowing-app://login';
}
