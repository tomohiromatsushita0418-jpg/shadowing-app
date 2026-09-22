/**
 * How many episodes from the very beginning (Stage 1) stay readable without a
 * subscription.
 *
 * The free tier is the *first* `FREE_PREVIEW_TOPICS` episodes — Stage 1 — so a
 * new learner starts at lesson 1 and follows the intended order. It is enough to
 * judge the product and to get a real first week of study; everything past
 * Stage 1 requires a subscription.
 */
export const FREE_PREVIEW_TOPICS = 10;

/**
 * `index` is the position in `topics` (oldest first). The free tier is the first
 * `FREE_PREVIEW_TOPICS` episodes (Stage 1); everything after is locked.
 */
export function isPreviewTopic(index: number, _total: number): boolean {
  return index < FREE_PREVIEW_TOPICS;
}
