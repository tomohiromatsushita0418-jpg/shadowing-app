// Shared helpers for the Vercel serverless functions in this directory.
// Files prefixed with `_` are not exposed as routes.
//
// These handlers use the Web `Request`/`Response` signature (supported by
// Vercel's Node.js runtime) rather than the Node req/res one. That is
// deliberate: `api/stripe-webhook.ts` needs the *unparsed* request body to
// verify Stripe's signature, and `await request.text()` gives it to us without
// fighting a body parser.

import Stripe from 'stripe';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { entitlementOf, type Entitlement, type Profile } from '../lib/entitlement';

export { entitlementOf };
export type { Entitlement, Profile };

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

// Clients are created on first use, not at module load, so that a missing
// variable surfaces as a readable 500 on the affected route instead of
// crashing every function at cold start.
let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  // Edge runtime: use the fetch-based HTTP client instead of Node's http.
  if (!_stripe) {
    _stripe = new Stripe(required('STRIPE_SECRET_KEY'), {
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return _stripe;
}

let _admin: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

/** Same-origin needs no CORS; this exists so `expo start --web` on localhost works. */
function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return origin;
  const appUrl = process.env.APP_URL;
  if (appUrl && origin === appUrl.replace(/\/$/, '')) return origin;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return origin;
  return null;
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = allowedOrigin(request);
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(request),
    },
  });
}

export function preflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Resolves the caller from the `Authorization: Bearer <supabase jwt>` header. */
export async function requireUser(request: Request): Promise<User | null> {
  const header = request.headers.get('authorization');
  const token = header?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

// ---------------------------------------------------------------------------
// Entitlement
// ---------------------------------------------------------------------------

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabaseAdmin()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`profiles lookup failed: ${error.message}`);
  return (data as Profile) ?? null;
}

/**
 * Returns the user's Stripe customer, creating it on first checkout. The
 * Supabase user id is stored in customer metadata so webhook events can always
 * be traced back to a user even if the local mapping is lost.
 */
export async function getOrCreateCustomer(user: User): Promise<string> {
  const profile = await getProfile(user.id);
  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await stripe().customers.create({
    email: user.email ?? undefined,
    metadata: { supabase_user_id: user.id },
  });

  const { error } = await supabaseAdmin()
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', user.id);
  if (error) throw new Error(`failed to store stripe_customer_id: ${error.message}`);

  return customer.id;
}

export function appUrl(): string {
  return required('APP_URL').replace(/\/$/, '');
}
