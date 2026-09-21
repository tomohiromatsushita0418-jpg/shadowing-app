/**
 * Posting to X.
 *
 * Uses OAuth 1.0a user-context signing rather than OAuth 2.0, because 1.0a
 * credentials never expire — an unattended daily job would otherwise need to
 * store and rotate a refresh token. The four values come from the app's
 * "Keys and tokens" tab and go straight into GitHub Secrets.
 *
 * The free tier allows 500 posts per month, which is why the workflow posts
 * three times a day rather than on every trigger it could.
 */

import crypto from 'node:crypto';

const ENDPOINT = 'https://api.x.com/2/tweets';

export type XCredentials = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
};

export function xCredentials(): XCredentials | null {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;
  return { apiKey, apiSecret, accessToken, accessSecret };
}

/** RFC 3986, which is stricter than encodeURIComponent about these five. */
function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*()']/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function authorizationHeader(method: string, url: string, credentials: XCredentials): string {
  const params: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: '1.0',
  };

  // A JSON request body is not part of the signature base string — only the
  // oauth_* parameters are, since there are no query or form parameters here.
  const parameterString = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(parameterString),
  ].join('&');

  const signingKey = `${percentEncode(credentials.apiSecret)}&${percentEncode(
    credentials.accessSecret,
  )}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  const header: Record<string, string> = { ...params, oauth_signature: signature };
  return `OAuth ${Object.keys(header)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(header[key])}"`)
    .join(', ')}`;
}

export async function postToX(
  text: string,
  credentials: XCredentials,
  replyTo?: string,
): Promise<string> {
  const body: Record<string, unknown> = { text };
  if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: authorizationHeader('POST', ENDPOINT, credentials),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.text();
  if (!response.ok) {
    throw new Error(`X API ${response.status}: ${payload.slice(0, 400)}`);
  }
  const parsed = JSON.parse(payload) as { data?: { id?: string } };
  return parsed.data?.id ?? '';
}
