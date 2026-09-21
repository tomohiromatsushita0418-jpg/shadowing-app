// POST /api/portal  →  { url }
// Opens Stripe's hosted Customer Portal so the user can change card, download
// invoices, or cancel — all without us building any of those screens.

import { appUrl, getProfile, json, preflight, requireUser, stripe } from './_lib';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);

  try {
    const user = await requireUser(request);
    if (!user) return json(request, { error: 'unauthorized' }, 401);

    const profile = await getProfile(user.id);
    if (!profile?.stripe_customer_id) {
      return json(request, { error: 'no_subscription' }, 404);
    }

    const session = await stripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl()}/account`,
      locale: 'ja',
    });

    return json(request, { url: session.url });
  } catch (error) {
    console.error('[portal]', error);
    return json(request, { error: (error as Error).message }, 500);
  }
}
