// GET /api/entitlement  →  Entitlement
// The authoritative answer to "is this user allowed in?".
//
// The client also computes this locally for instant UI, but that copy is a
// convenience only — anything that actually costs money to serve should check
// here, because the client's copy is trivially editable in a browser.

import { entitlementOf, getProfile, json, preflight, requireUser } from './_lib';

export const config = { runtime: 'edge' };

export default async function handler(request: Request): Promise<Response> {
  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== 'GET') return json(request, { error: 'method_not_allowed' }, 405);

  try {
    const user = await requireUser(request);
    if (!user) return json(request, { error: 'unauthorized' }, 401);

    const profile = await getProfile(user.id);
    if (!profile) {
      // The sign-up trigger should have created this. Treat a missing row as
      // "no access" rather than inventing a fresh trial, so a failed trigger
      // can't be farmed for unlimited trials.
      return json(request, { error: 'profile_missing', active: false }, 404);
    }

    return json(request, entitlementOf(profile));
  } catch (error) {
    console.error('[entitlement]', error);
    return json(request, { error: (error as Error).message }, 500);
  }
}
