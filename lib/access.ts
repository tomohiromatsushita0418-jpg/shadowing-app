/**
 * How many of the newest episodes stay readable without an account.
 *
 * A hard wall at the front door would waste every visitor the SEO site and the
 * social accounts send over — they need to hear the audio before an email
 * address is worth giving up. Three is enough to judge the product and far too
 * few to learn from, which is exactly the trade we want.
 */
export const FREE_PREVIEW_TOPICS = 3;

/** `index` is the position in `topics` (oldest first), so the newest are at the end. */
export function isPreviewTopic(index: number, total: number): boolean {
  return index >= total - FREE_PREVIEW_TOPICS;
}
