// POST /api/checkout  { plan: "monthly" | "yearly" }  →  { url }
// Creates a Stripe Checkout session for the signed-in user.
//
// There is no `trial_period_days` here on purpose: the 7-day trial is granted
// at sign-up (no card required) and tracked in `profiles.trial_ends_at`. By the
// time someone reaches checkout they are converting, not starting a trial.

import { appUrl, getOrCreateCustomer, json, preflight, required, requireUser, stripe } from './_lib';

export default async function handler(request: Request): Promise<Response> {
  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);

  try {
    const user = await requireUser(request);
    if (!user) return json(request, { error: 'unauthorized' }, 401);

    const body = (await request.json().catch(() => ({}))) as { plan?: string };
    const yearly = body.plan === 'yearly';
    const price = yearly ? required('STRIPE_PRICE_YEARLY') : required('STRIPE_PRICE_MONTHLY');

    const customer = await getOrCreateCustomer(user);

    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      subscription_data: { metadata: { supabase_user_id: user.id } },
      allow_promotion_codes: true,
      locale: 'ja',
      success_url: `${appUrl()}/account?checkout=success`,
      cancel_url: `${appUrl()}/paywall?checkout=cancelled`,
    });

    return json(request, { url: session.url });
  } catch (error) {
    console.error('[checkout]', error);
    return json(request, { error: (error as Error).message }, 500);
  }
}
