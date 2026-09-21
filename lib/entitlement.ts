// The access rule, in one place. Imported by both the app (lib/account.tsx)
// and the serverless functions (api/_lib.ts) so the two can never disagree.
// `public.has_access()` in supabase/schema.sql mirrors this in SQL.
//
// Deliberately free of React and react-native imports so it is safe to pull
// into a Node serverless bundle.

export type Plan = 'trial' | 'pro' | 'expired';

export type Profile = {
  id: string;
  email: string | null;
  stripe_customer_id: string | null;
  plan: Plan;
  status: string | null;
  trial_ends_at: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type Entitlement = {
  active: boolean;
  plan: Plan;
  status: string | null;
  trialEndsAt: string | null;
  /** Whole days remaining, rounded up. 0 once the trial has lapsed. */
  trialDaysLeft: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export function entitlementOf(profile: Profile, now: number = Date.now()): Entitlement {
  const trialEnds = profile.trial_ends_at ? Date.parse(profile.trial_ends_at) : 0;
  const periodEnd = profile.current_period_end ? Date.parse(profile.current_period_end) : null;

  // `past_due` subscriptions stay `pro`: the user paid for the period they are
  // in, and current_period_end is what actually ends their access.
  const proActive = profile.plan === 'pro' && (periodEnd === null || periodEnd > now);
  const trialActive = profile.plan === 'trial' && trialEnds > now;

  return {
    active: proActive || trialActive,
    plan: profile.plan,
    status: profile.status,
    trialEndsAt: profile.trial_ends_at ?? null,
    trialDaysLeft: Math.max(0, Math.ceil((trialEnds - now) / 86_400_000)),
    currentPeriodEnd: profile.current_period_end,
    cancelAtPeriodEnd: profile.cancel_at_period_end,
  };
}
