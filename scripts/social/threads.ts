/**
 * Posting to Threads via the official Threads API.
 *
 * Two steps by design: create a media container, then publish it. Meta's docs
 * recommend a short pause between the two so the container is ready.
 *
 * THREADS_ACCESS_TOKEN should be a long-lived token (60 days). Refresh it with
 * GET /refresh_access_token before it expires — see docs/GROWTH_SETUP.md.
 */

const API = 'https://graph.threads.net/v1.0';

export type ThreadsCredentials = { userId: string; accessToken: string };

export function threadsCredentials(): ThreadsCredentials | null {
  const userId = process.env.THREADS_USER_ID;
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  if (!userId || !accessToken) return null;
  return { userId, accessToken };
}

async function call(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: 'POST' });
  const payload = await response.text();
  if (!response.ok) throw new Error(`Threads API ${response.status}: ${payload.slice(0, 400)}`);
  return JSON.parse(payload) as Record<string, unknown>;
}

export async function postToThreads(
  text: string,
  credentials: ThreadsCredentials,
): Promise<string> {
  const create = new URL(`${API}/${credentials.userId}/threads`);
  create.searchParams.set('media_type', 'TEXT');
  create.searchParams.set('text', text);
  create.searchParams.set('access_token', credentials.accessToken);

  const container = await call(create.toString());
  const creationId = container.id as string | undefined;
  if (!creationId) throw new Error('Threads API returned no container id');

  // Meta asks for ~30s before publishing; text-only containers are ready much
  // sooner, but a short wait costs nothing in a nightly job.
  await new Promise((resolve) => setTimeout(resolve, 5_000));

  const publish = new URL(`${API}/${credentials.userId}/threads_publish`);
  publish.searchParams.set('creation_id', creationId);
  publish.searchParams.set('access_token', credentials.accessToken);

  const published = await call(publish.toString());
  return (published.id as string) ?? '';
}
