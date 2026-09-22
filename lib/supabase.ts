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

// On web, persist to localStorage directly — the AsyncStorage web adapter can
// silently no-op in a static export, which means the session survives in memory
// (login looks fine) but is gone on the next full page load (paywall/checkout
// then thinks you're logged out). Native uses AsyncStorage.
const authStorage =
  Platform.OS === 'web'
    ? (typeof window !== 'undefined' ? window.localStorage : undefined)
    : AsyncStorage;

export const supabase = createClient(
  url || 'https://unconfigured.supabase.co',
  anonKey || 'unconfigured',
  {
    auth: {
      storage: authStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: Platform.OS === 'web',
      // Web uses the implicit flow: the magic link returns the tokens directly
      // in the URL hash, so there's no PKCE code_verifier that Safari's tracking
      // prevention can wipe between requesting and clicking the link (a common
      // cause of the "link just loops back to login" bug). Native keeps PKCE.
      flowType: Platform.OS === 'web' ? 'implicit' : 'pkce',
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
