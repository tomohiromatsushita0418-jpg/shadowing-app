import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Linking, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { apiBase, authRedirectTo, isAuthConfigured, isPaywallEnabled, supabase } from './supabase';
import { entitlementOf, type Entitlement, type Profile } from './entitlement';

type AccountValue = {
  /** Initial session + profile lookup has finished. Gate UI on this to avoid a paywall flash. */
  ready: boolean;
  configured: boolean;
  paywallEnabled: boolean;
  session: Session | null;
  email: string | null;
  profile: Profile | null;
  entitlement: Entitlement | null;
  /** The only thing screens should branch on. */
  hasAccess: boolean;
  signInWithEmail: (email: string) => Promise<{ error?: string }>;
  verifyEmailCode: (email: string, token: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  startCheckout: (plan: 'monthly' | 'yearly') => Promise<{ error?: string }>;
  openBillingPortal: () => Promise<{ error?: string }>;
  refresh: () => Promise<void>;
  /** After returning from Stripe, waits for the webhook to land. */
  waitForUpgrade: (timeoutMs?: number) => Promise<boolean>;
};

const AccountContext = createContext<AccountValue | null>(null);

// Comp accounts: emails that get full access without paying (the operator, and
// anyone else you choose to grant). Set EXPO_PUBLIC_COMP_EMAILS to a
// comma-separated list. Knowing an email here grants nothing on its own —
// access still requires a real authenticated session for that inbox — so it is
// safe that the list ends up in the client bundle.
const COMP_EMAILS = (process.env.EXPO_PUBLIC_COMP_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isCompEmail(email: string | null | undefined): boolean {
  return !!email && COMP_EMAILS.includes(email.toLowerCase());
}

function openUrl(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
  } else {
    void Linking.openURL(url);
  }
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(!isAuthConfigured);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      if (mounted.current) setProfile(null);
      return;
    }
    // RLS restricts this to the caller's own row, so the anon key is safe here
    // and we avoid a serverless round-trip on every screen.
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[account] profile load failed', error.message);
      return;
    }
    if (mounted.current) setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    if (!isAuthConfigured) return;

    let cancelled = false;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (!cancelled && mounted.current) setReady(true);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void loadProfile(next?.user.id);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadProfile(data.session?.user.id);
  }, [loadProfile]);

  const isComp = isCompEmail(session?.user.email);

  const entitlement = useMemo<Entitlement | null>(() => {
    // Comp accounts read as an active "pro" (status "comp") so every isPro/lock
    // check across the app unlocks, without touching Stripe or the database.
    if (isComp) {
      return {
        active: true,
        plan: 'pro',
        status: 'comp',
        trialEndsAt: null,
        trialDaysLeft: 0,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    }
    return profile ? entitlementOf(profile) : null;
  }, [isComp, profile]);

  // Full access = an active paid subscription (or a comp account). There is no
  // free trial: the free tier is the first FREE_PREVIEW_TOPICS episodes — Stage 1
  // (see lib/access.ts); everything from Stage 2 on and the practice tools
  // require a subscription. Until the paywall is switched on everything stays
  // unlocked (ships ahead of going live).
  const hasAccess =
    !isPaywallEnabled || isComp || (entitlement?.plan === 'pro' && entitlement.active === true);

  const authedFetch = useCallback(async (path: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('ログインが必要です');
    const response = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    const payload = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
    return payload;
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    if (!isAuthConfigured) return { error: 'ログイン機能はまだ有効化されていません' };
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: authRedirectTo(), shouldCreateUser: true },
    });
    return error ? { error: error.message } : {};
  }, []);

  // Verify the 6-digit code from the email. This avoids the magic-link redirect
  // entirely — link scanners can't consume a code the user types by hand.
  const verifyEmailCode = useCallback(async (email: string, token: string) => {
    if (!isAuthConfigured) return { error: 'ログイン機能はまだ有効化されていません' };
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'email',
    });
    return error ? { error: error.message } : {};
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const startCheckout = useCallback(
    async (plan: 'monthly' | 'yearly') => {
      try {
        const { url } = await authedFetch('/api/checkout', {
          method: 'POST',
          body: JSON.stringify({ plan }),
        });
        if (!url) return { error: '決済ページのURLを取得できませんでした' };
        openUrl(url);
        return {};
      } catch (error) {
        return { error: (error as Error).message };
      }
    },
    [authedFetch],
  );

  const openBillingPortal = useCallback(async () => {
    try {
      const { url } = await authedFetch('/api/portal', { method: 'POST' });
      if (!url) return { error: '管理ページのURLを取得できませんでした' };
      openUrl(url);
      return {};
    } catch (error) {
      return { error: (error as Error).message };
    }
  }, [authedFetch]);

  /**
   * Stripe redirects back the instant payment succeeds, but the webhook that
   * flips `plan` to `pro` lands a moment later. Poll rather than showing the
   * user a paywall they just paid to remove.
   */
  const waitForUpgrade = useCallback(
    async (timeoutMs = 20_000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        if (userId) {
          const { data: row } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
          if (row && (row as Profile).plan === 'pro') {
            if (mounted.current) setProfile(row as Profile);
            return true;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1_500));
      }
      await refresh();
      return false;
    },
    [refresh],
  );

  const value = useMemo<AccountValue>(
    () => ({
      ready,
      configured: isAuthConfigured,
      paywallEnabled: isPaywallEnabled,
      session,
      email: session?.user.email ?? null,
      profile,
      entitlement,
      hasAccess,
      signInWithEmail,
      verifyEmailCode,
      signOut,
      startCheckout,
      openBillingPortal,
      refresh,
      waitForUpgrade,
    }),
    [
      ready,
      session,
      profile,
      entitlement,
      hasAccess,
      signInWithEmail,
      verifyEmailCode,
      signOut,
      startCheckout,
      openBillingPortal,
      refresh,
      waitForUpgrade,
    ],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside <AccountProvider>');
  return value;
}
