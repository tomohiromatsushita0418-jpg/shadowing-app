// POST /api/stripe-webhook
// The only thing that is ever allowed to move a user into or out of `pro`.
//
// Configure in Stripe → Developers → Webhooks with these events:
//   checkout.session.completed
//   customer.subscription.created
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.payment_failed
//
// Note on ordering: rather than trusting the event payload (webhooks can arrive
// out of order, and a stale `updated` landing after a `deleted` would resurrect
// a cancelled subscription), every handler re-fetches the subscription from
// Stripe and writes whatever it says right now.

import type Stripe from 'stripe';
import { required, stripe, supabaseAdmin } from './_lib';

/**
 * `current_period_end` lives on the subscription in older Stripe API versions
 * and on each subscription item from 2025-03-31 onwards. Read whichever exists
 * so this keeps working across an API version bump.
 */
function periodEndOf(sub: Stripe.Subscription): string | null {
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const perItem = sub.items?.data?.[0]?.current_period_end;
  const unix = legacy ?? perItem;
  return typeof unix === 'number' ? new Date(unix * 1000).toISOString() : null;
}

/** `active`/`trialing` obviously pass. `past_due`/`unpaid` stay `pro` because the
 *  user has already paid for the period they are in — `current_period_end` is
 *  what actually cuts them off, and Stripe retries the card in the meantime. */
function planFor(status: Stripe.Subscription.Status): 'pro' | 'expired' | null {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'unpaid':
      return 'pro';
    case 'canceled':
    case 'incomplete_expired':
      return 'expired';
    case 'incomplete':
    case 'paused':
      return null; // Not paid yet / deliberately halted — leave the plan alone.
    default:
      return null;
  }
}

async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  const fromSub = sub.metadata?.supabase_user_id;
  if (fromSub) return fromSub;

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customerId) return null;

  const { data } = await supabaseAdmin()
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (data?.id) return data.id as string;

  // Last resort: the id we stamped onto the customer at creation time.
  const customer = await stripe().customers.retrieve(customerId);
  if (!customer.deleted && customer.metadata?.supabase_user_id) {
    return customer.metadata.supabase_user_id;
  }
  return null;
}

async function syncSubscription(subscriptionId: string): Promise<void> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const userId = await resolveUserId(sub);
  if (!userId) {
    console.error('[stripe-webhook] could not map subscription to a user', subscriptionId);
    return;
  }

  const plan = planFor(sub.status);
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

  const patch: Record<string, unknown> = {
    status: sub.status,
    current_period_end: periodEndOf(sub),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
  };
  if (plan) patch.plan = plan;
  if (customerId) patch.stripe_customer_id = customerId;

  const { error } = await supabaseAdmin().from('profiles').update(patch).eq('id', userId);
  if (error) throw new Error(`profile update failed: ${error.message}`);

  console.log('[stripe-webhook] synced', { userId, status: sub.status, plan });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('method_not_allowed', { status: 405 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('missing signature', { status: 400 });

  // Raw body — must not be parsed before signature verification.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(
      payload,
      signature,
      required('STRIPE_WEBHOOK_SECRET'),
    );
  } catch (error) {
    console.error('[stripe-webhook] signature verification failed', error);
    return new Response(`invalid signature: ${(error as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        if (subId) await syncSubscription(subId);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(sub.id);
        break;
      }

      case 'invoice.payment_failed': {
        // Informational: the matching `customer.subscription.updated` carries the
        // status change. Logged so failed renewals are visible without digging
        // through the Stripe dashboard.
        const invoice = event.data.object as Stripe.Invoice;
        console.warn('[stripe-webhook] payment failed', invoice.customer, invoice.id);
        break;
      }

      default:
        break;
    }
  } catch (error) {
    // Returning 500 makes Stripe retry, which is what we want for a transient
    // Supabase or network failure.
    console.error('[stripe-webhook] handler failed', event.type, error);
    return new Response((error as Error).message, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
