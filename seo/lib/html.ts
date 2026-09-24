import { createHash } from 'node:crypto';
import {
  APP_URL,
  BRAND,
  GA_MEASUREMENT_ID,
  GOOGLE_SITE_VERIFICATION,
  SITE_URL,
  SUPABASE_ANON,
  SUPABASE_URL,
  TAGLINE,
} from '../config';

/** One page-view row per session into public.visits, for the funnel digest. */
function viewBeacon(): string {
  if (!SUPABASE_URL || !SUPABASE_ANON) return '';
  const endpoint = JSON.stringify(`${SUPABASE_URL}/rest/v1/visits`);
  const anon = JSON.stringify(SUPABASE_ANON);
  return `<script>(function(){try{if(sessionStorage.getItem('sv'))return;sessionStorage.setItem('sv','1');fetch(${endpoint},{method:'POST',headers:{apikey:${anon},'content-type':'application/json'},body:JSON.stringify({kind:'seo_view',source:'seo',path:location.pathname}),keepalive:true})}catch(e){}})();</script>`;
}

export function esc(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Trims to a clean meta-description length without cutting mid-character. */
export function clamp(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

export type LayoutOptions = {
  title: string;
  description: string;
  /** Site-absolute path with leading and trailing slash, e.g. `/episodes/3-foo/`. */
  path: string;
  body: string;
  jsonLd?: object | object[];
  /** Thin pages are still served, but ask not to be ranked. */
  noindex?: boolean;
  breadcrumbs?: { label: string; href: string }[];
};

export function canonical(path: string): string {
  return `${SITE_URL}${path}`;
}

function breadcrumbJsonLd(trail: { label: string; href: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.label,
      item: canonical(crumb.href),
    })),
  };
}

export function layout(options: LayoutOptions): string {
  const { title, description, path, body, noindex, breadcrumbs } = options;
  const fullTitle = path === '/' ? `${BRAND} — ${TAGLINE}` : `${title} | ${BRAND}`;

  const structured: object[] = [];
  if (options.jsonLd) {
    structured.push(...(Array.isArray(options.jsonLd) ? options.jsonLd : [options.jsonLd]));
  }
  if (breadcrumbs?.length) structured.push(breadcrumbJsonLd(breadcrumbs));

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(clamp(description, 158))}">
<link rel="canonical" href="${esc(canonical(path))}">
${noindex ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta property="og:type" content="${path === '/' ? 'website' : 'article'}">
<meta property="og:site_name" content="${esc(BRAND)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(clamp(description, 158))}">
<meta property="og:url" content="${esc(canonical(path))}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(clamp(description, 158))}">
${GOOGLE_SITE_VERIFICATION ? `<meta name="google-site-verification" content="${esc(GOOGLE_SITE_VERIFICATION)}">` : ''}
<link rel="alternate" type="application/rss+xml" title="${esc(BRAND)}" href="${esc(canonical('/feed.xml'))}">
<link rel="stylesheet" href="/style.css?v=${STYLE_VERSION}">
${structured.length ? `<script type="application/ld+json">${JSON.stringify(structured.length === 1 ? structured[0] : structured)}</script>` : ''}
${GA_MEASUREMENT_ID ? gaSnippet() : ''}
</head>
<body>
<header class="site-header">
  <a class="brand" href="/">${esc(BRAND)}</a>
  <nav>
    <a href="/episodes/">エピソード</a>
    <a href="/phrases/">表現集</a>
    <a href="/blog/">解説</a>
    <a class="cta-link" href="${esc(APP_URL)}" rel="noopener">アプリを開く</a>
  </nav>
</header>
${breadcrumbs?.length ? renderBreadcrumbs(breadcrumbs, title) : ''}
<main>
${body}
</main>
<footer class="site-footer">
  <p class="footer-brand">${esc(BRAND)} — ${esc(TAGLINE)}</p>
  <nav class="footer-nav">
    <a href="/">ホーム</a>
    <a href="/episodes/">エピソード</a>
    <a href="/phrases/">表現集</a>
    <a href="/blog/">解説</a>
    <a href="${esc(APP_URL)}/legal" rel="noopener">利用規約・特商法表記</a>
  </nav>
</footer>
${viewBeacon()}
</body>
</html>`;
}

function renderBreadcrumbs(trail: { label: string; href: string }[], current: string): string {
  const links = trail
    .map((crumb) => `<a href="${esc(crumb.href)}">${esc(crumb.label)}</a>`)
    .join('<span aria-hidden="true">›</span>');
  return `<nav class="breadcrumbs" aria-label="パンくずリスト">${links}<span aria-hidden="true">›</span><span class="current">${esc(clamp(current, 40))}</span></nav>`;
}

function gaSnippet(): string {
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(GA_MEASUREMENT_ID)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(GA_MEASUREMENT_ID)}');</script>`;
}

/** The conversion unit. Every content page ends with one. */
export function appCta(
  headline = '音声でシャドーイングする',
  sub = '同じ教材を、ネイティブ音声つきで。最初の10話（Stage 1）は無料でご利用いただけます。',
): string {
  return `<aside class="cta">
  <h2>${esc(headline)}</h2>
  <p>${esc(sub)}</p>
  <a class="cta-button" href="${esc(APP_URL)}?utm_source=seo" rel="noopener">${esc(BRAND)} を無料で試す</a>
</aside>`;
}

export const STYLESHEET = `:root{
  --bg:#0f0f14; --panel:rgba(255,255,255,.04); --line:rgba(255,255,255,.09);
  --text:#e8edf5; --muted:#97a3b6; --dim:#6b7789; --accent:#fbbf24; --accent-soft:rgba(251,191,36,.1);
  --max:760px;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",system-ui,sans-serif;
  line-height:1.8;font-size:16px}
a{color:inherit}
main{max-width:var(--max);margin:0 auto;padding:8px 20px 64px}
.site-header{max-width:var(--max);margin:0 auto;padding:18px 20px 8px;display:flex;
  align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{font-weight:800;letter-spacing:.18em;font-size:15px;text-decoration:none}
.site-header nav{display:flex;gap:16px;flex-wrap:wrap;font-size:13px}
.site-header nav a{color:var(--muted);text-decoration:none}
.site-header nav a:hover{color:var(--text)}
.cta-link{color:var(--accent)!important;font-weight:700}
.breadcrumbs{max-width:var(--max);margin:0 auto;padding:4px 20px;font-size:12px;color:var(--dim);
  display:flex;gap:8px;flex-wrap:wrap}
.breadcrumbs a{color:var(--dim);text-decoration:none}
.breadcrumbs a:hover{color:var(--muted)}
.breadcrumbs .current{color:var(--muted)}
h1{font-size:26px;line-height:1.5;margin:20px 0 8px;font-weight:800;letter-spacing:-.01em}
h2{font-size:19px;margin:36px 0 10px;font-weight:700}
h3{font-size:16px;margin:24px 0 6px;font-weight:700}
p{margin:0 0 14px}
.lead{color:var(--muted);font-size:15px}
.meta{color:var(--dim);font-size:12px;margin:0 0 20px;display:flex;gap:10px;flex-wrap:wrap}
.tag{display:inline-block;background:var(--accent-soft);color:var(--accent);border-radius:999px;
  padding:2px 10px;font-size:11px;font-weight:700}
ul,ol{padding-left:1.2em;margin:0 0 16px}
li{margin:4px 0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 12px}
.card h3{margin-top:0}
.list{list-style:none;padding:0;margin:0}
.list li{margin:0 0 10px}
.list a{display:block;background:var(--panel);border:1px solid var(--line);border-radius:12px;
  padding:14px 16px;text-decoration:none;transition:border-color .15s}
.list a:hover{border-color:var(--accent)}
.list .t{font-weight:700;display:block;margin-bottom:2px}
.list .s{color:var(--muted);font-size:13px;display:block}
.sentence{border-left:2px solid var(--line);padding:2px 0 2px 16px;margin:0 0 22px}
.sentence .en{font-size:17px;line-height:1.75;margin:0 0 6px;font-weight:600}
.sentence .ja{color:var(--muted);font-size:14px;margin:0 0 10px}
.phrases{list-style:none;padding:0;margin:0}
.phrases li{font-size:13px;color:var(--muted);margin:0 0 6px}
.phrases b{color:var(--accent);font-weight:700}
.phrase-entry{border-bottom:1px solid var(--line);padding:14px 0}
.phrase-entry:last-child{border-bottom:none}
.phrase-entry .p{font-size:16px;font-weight:700;color:var(--accent);margin:0 0 4px}
.phrase-entry .m{margin:0 0 4px}
.phrase-entry .u{color:var(--muted);font-size:13px;margin:0}
.phrase-entry .ex{color:var(--dim);font-size:13px;margin:6px 0 0;font-style:italic}
.cta{background:linear-gradient(160deg,rgba(251,191,36,.13),rgba(251,191,36,.03));
  border:1px solid rgba(251,191,36,.3);border-radius:16px;padding:24px;margin:40px 0 0;text-align:center}
.cta h2{margin:0 0 8px;font-size:18px}
.cta p{color:var(--muted);font-size:14px;margin:0 0 16px}
.cta-button{display:inline-block;background:var(--accent);color:#0f0f14;font-weight:800;
  text-decoration:none;border-radius:10px;padding:13px 26px;font-size:15px}
.cta-button:hover{filter:brightness(1.05)}
.cta-button.lg{font-size:16px;padding:15px 32px;border-radius:999px;box-shadow:0 10px 34px rgba(251,191,36,.28)}
.home-hero{text-align:center;padding:34px 0 4px;
  background:radial-gradient(120% 80% at 50% -10%,rgba(251,191,36,.10),transparent 60%)}
.eyebrow{color:var(--accent);font-size:11px;font-weight:800;letter-spacing:.3em;margin:0 0 16px}
.home-hero h1{font-size:33px;line-height:1.4;margin:0 0 16px;font-weight:900;letter-spacing:-.02em}
.hero-sub{color:var(--muted);font-size:15px;line-height:1.95;max-width:600px;margin:0 auto 24px}
.hero-sub strong{color:var(--text);font-weight:800}
.pillars{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:32px 0 6px;text-align:left}
.pillar{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px}
.pillar .pi{font-size:22px;display:block;margin-bottom:8px}
.pillar b{display:block;color:var(--text);font-size:14px;margin-bottom:4px}
.pillar span:last-child{color:var(--muted);font-size:12px;line-height:1.6;display:block}
.freenote{color:var(--muted);font-size:14px;background:var(--panel);border:1px solid var(--line);
  border-radius:12px;padding:14px 16px;margin:22px 0 8px;text-align:center}
.freenote strong{color:var(--accent)}
@media(max-width:560px){.pillars{grid-template-columns:1fr}.home-hero h1{font-size:26px}}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin:0 0 20px}
.grid a{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;
  text-decoration:none;font-size:14px;font-weight:600}
.grid a:hover{border-color:var(--accent)}
.grid .c{display:block;color:var(--dim);font-size:12px;font-weight:400;margin-top:2px}
.site-footer{max-width:var(--max);margin:0 auto;padding:28px 20px 48px;border-top:1px solid var(--line);
  color:var(--dim);font-size:12px}
.footer-brand{margin:0 0 10px;letter-spacing:.06em}
.footer-nav{display:flex;gap:14px;flex-wrap:wrap}
.footer-nav a{color:var(--dim);text-decoration:none}
.footer-nav a:hover{color:var(--muted)}
.pager{display:flex;justify-content:space-between;gap:12px;margin:28px 0 0;font-size:13px}
.pager a{color:var(--accent);text-decoration:none}
@media(max-width:560px){h1{font-size:22px}main{padding:4px 16px 48px}
  .site-header{padding:14px 16px 6px}.breadcrumbs{padding:4px 16px}.site-footer{padding:24px 16px 40px}}
`;

// Content hash so the stylesheet URL changes whenever the CSS does — new HTML
// never renders against a browser-cached old stylesheet (the "unstyled/left-
// aligned on first load after a deploy" bug).
export const STYLE_VERSION = createHash('sha1').update(STYLESHEET).digest('hex').slice(0, 8);
