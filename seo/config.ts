// Every externally-visible URL comes from here, so the site can be built
// against a vercel.app subdomain today and a custom domain later by changing
// one environment variable and rebuilding. Nothing hardcodes a hostname.

function env(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return (value && value.length > 0 ? value : fallback).replace(/\/$/, '');
}

/** Where this static site itself is served. Used for canonicals and sitemap. */
export const SITE_URL = env('SITE_URL', 'https://learn.resound.study');

/** Where the app lives. Every call to action points here. */
export const APP_URL = env('APP_URL', 'https://resound.study');

export const BRAND = 'RESOUND';
export const TAGLINE = 'シャドーイング×瞬間英作文で話せる英語へ';
export const DESCRIPTION =
  'ネイティブ音声のシャドーイングと、AI添削つき瞬間英作文で"話せる英語"へ。日常会話・ビジネス・国内外の時事・旅行・スポーツ・歴史まで、実際に使う英文を毎日1本。リスニングとスピーキングを本気で鍛える英語学習アプリ。';

/** Optional: set to add <meta name="google-site-verification">. */
export const GOOGLE_SITE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION?.trim() ?? '';

/** Optional GA4 measurement id (G-XXXXXXX). Analytics is skipped when unset. */
export const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID?.trim() ?? '';

/**
 * Supabase project (public anon key) for the lightweight page-view beacon that
 * feeds the daily funnel digest. Both must be set for the beacon to render.
 */
export const SUPABASE_URL = process.env.SUPABASE_URL?.trim().replace(/\/$/, '') ?? '';
export const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY?.trim() ?? '';

/**
 * Pages whose body text is shorter than this are emitted but marked noindex.
 *
 * This is the guard against Google's "scaled content abuse" / thin-content
 * treatment: a page that exists only to hold a keyword and two lines of text is
 * exactly what gets a site deindexed. Short entries still get a page so
 * internal links never 404 — they just don't ask to be ranked.
 */
export const MIN_INDEXABLE_CHARS = 600;

export const AUTHOR = process.env.SITE_AUTHOR?.trim() ?? BRAND;
