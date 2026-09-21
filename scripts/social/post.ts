/**
 * post.ts — publishes the day's social posts.
 *
 * Run:   tsx scripts/social/post.ts
 * Env:   SOCIAL_POST_KIND=phrase|quiz|episode|all   (default: all)
 *        SOCIAL_TOPIC_INDEX=-1                      which episode (default: newest)
 *        SOCIAL_DRY_RUN=1                           print, don't post
 *        SITE_URL                                   where the links should point
 *
 * Platform credentials are optional: a platform with no credentials is skipped
 * with a note rather than failing the run, so you can switch each account on
 * as you finish setting it up.
 */

import { composePosts, fitForThreads, fitForX, loadTopics, type Post, type PostKind } from './compose';
import { postToX, xCredentials } from './x';
import { postToThreads, threadsCredentials } from './threads';

type Result = { platform: string; kind: PostKind; ok: boolean; detail: string };

async function main() {
  const topics = loadTopics();
  if (topics.length === 0) throw new Error('No topics available.');

  const raw = Number(process.env.SOCIAL_TOPIC_INDEX ?? -1);
  const index = raw < 0 ? topics.length + raw : raw;
  const topic = topics[index];
  if (!topic) throw new Error(`No topic at index ${index}`);

  const wanted = (process.env.SOCIAL_POST_KIND ?? 'all').trim();
  const all = composePosts(topic, index + 1);
  const posts = wanted === 'all' ? all : all.filter((p) => p.kind === wanted);

  if (posts.length === 0) {
    console.log(`[social] no post of kind "${wanted}" for this episode — nothing to do.`);
    return;
  }

  const dryRun = process.env.SOCIAL_DRY_RUN === '1';
  const x = xCredentials();
  const threads = threadsCredentials();

  if (!x) console.log('[social] X: no credentials, skipping.');
  if (!threads) console.log('[social] Threads: no credentials, skipping.');
  if (!x && !threads && !dryRun) {
    console.log('[social] nothing configured; exiting without error.');
    return;
  }

  const results: Result[] = [];

  for (const post of posts) {
    const forX = fitForX(post);
    const forThreads = fitForThreads(post);

    if (dryRun) {
      console.log(`\n--- ${post.kind} → X (${forX.length} chars) ---\n${forX}`);
      console.log(`\n--- ${post.kind} → Threads (${forThreads.length} chars) ---\n${forThreads}`);
      continue;
    }

    if (x) {
      try {
        const id = await postToX(forX, x);
        results.push({ platform: 'X', kind: post.kind, ok: true, detail: id });
      } catch (error) {
        results.push({
          platform: 'X',
          kind: post.kind,
          ok: false,
          detail: (error as Error).message,
        });
      }
    }

    if (threads) {
      try {
        const id = await postToThreads(forThreads, threads);
        results.push({ platform: 'Threads', kind: post.kind, ok: true, detail: id });
      } catch (error) {
        results.push({
          platform: 'Threads',
          kind: post.kind,
          ok: false,
          detail: (error as Error).message,
        });
      }
    }

    // Space consecutive posts out a little rather than firing them back to back.
    if (posts.length > 1) await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  if (dryRun) return;

  for (const result of results) {
    const mark = result.ok ? '✓' : '✗';
    console.log(`[social] ${mark} ${result.platform} ${result.kind}: ${result.detail}`);
  }

  // One platform being down shouldn't fail the job, but everything failing
  // means something is actually broken and the run should go red.
  if (results.length > 0 && results.every((r) => !r.ok)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[social]', error instanceof Error ? error.message : error);
  process.exit(1);
});
