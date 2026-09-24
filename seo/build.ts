// Static site generator for the public RESOUND site.
//
//   npx tsx seo/build.ts          → writes seo/dist/
//   SITE_URL=https://example.com npx tsx seo/build.ts
//
// Plain HTML on purpose: the content is fully static, so a framework would add
// a build toolchain and a hydration payload without buying anything the pages
// need. Every URL is derived from SITE_URL / APP_URL in config.ts, so moving to
// a custom domain is one environment variable and a rebuild.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { APP_URL, BRAND, DESCRIPTION, MIN_INDEXABLE_CHARS, SITE_URL } from './config';
import {
  buildCollections,
  buildPhraseIndex,
  categoryJa,
  episodeSlug,
  loadTopics,
  topicDate,
  topicTitleJa,
  type Collection,
  type PhraseEntry,
  type Topic,
} from './lib/data';
import { appCta, canonical, clamp, esc, layout, STYLESHEET } from './lib/html';

const OUT = resolve(import.meta.dirname, 'dist');
const CONTENT = resolve(import.meta.dirname, 'content');

type Article = {
  slug: string;
  title: string;
  description: string;
  date: string;
  bodyHtml: string;
  topicId?: string;
  tags?: string[];
};

const sitemap: { path: string; lastmod?: string; priority: number }[] = [];

function write(path: string, html: string) {
  const file = path.endsWith('/') ? `${OUT}${path}index.html` : `${OUT}${path}`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html, 'utf8');
}

/** Rough count of visible characters, used only to decide indexability. */
function textLength(html: string): number {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '')
    .length;
}

function page(opts: {
  path: string;
  title: string;
  description: string;
  body: string;
  jsonLd?: object | object[];
  breadcrumbs?: { label: string; href: string }[];
  lastmod?: string;
  priority?: number;
  forceIndex?: boolean;
}) {
  const noindex = !opts.forceIndex && textLength(opts.body) < MIN_INDEXABLE_CHARS;
  write(opts.path, layout({ ...opts, body: opts.body, noindex }));
  if (!noindex) {
    sitemap.push({ path: opts.path, lastmod: opts.lastmod, priority: opts.priority ?? 0.5 });
  }
  return { noindex };
}

// ---------------------------------------------------------------------------

const allTopics = loadTopics();

// Only the free tier — Stage 1, the first FREE_EPISODES episodes — is published
// publicly. Everything past that is paid content, so it never gets a public page
// on the marketing site (that would give the subscription away for free). This
// matches the app's own free preview (lib/access.ts FREE_PREVIEW_TOPICS).
const FREE_EPISODES = 10;
const topics = allTopics.slice(0, FREE_EPISODES);
const libraryCount = allTopics.length;

const phraseIndex = buildPhraseIndex(topics);
const collections = buildCollections(phraseIndex);

// Newest first everywhere a human browses.
const episodes = topics
  .map((topic, index) => ({ topic, number: index + 1, slug: episodeSlug(topic, index + 1) }))
  .reverse();

const articles: Article[] = existsSync(CONTENT)
  ? readdirSync(CONTENT)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(resolve(CONTENT, f), 'utf8')) as Article)
      .sort((a, b) => b.date.localeCompare(a.date))
  : [];

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

// --- assets -----------------------------------------------------------------

writeFileSync(resolve(OUT, 'style.css'), STYLESHEET, 'utf8');

// --- home -------------------------------------------------------------------

{
  const latest = episodes.slice(0, 6);
  const body = `
<section class="home-hero">
  <p class="eyebrow">RESOUND · ENGLISH STUDIO</p>
  <h1>シャドーイング×瞬間英作文で、<br>“話せる英語”へ。</h1>
  <p class="hero-sub">ネイティブ音声の<strong>シャドーイング</strong>で耳と口をつくり、AIが添削する<strong>瞬間英作文</strong>で“自分で言える”に変える。日常会話からビジネス・時事・旅行・スポーツ・歴史まで、実際に使う英文を毎日1本。</p>
  <a class="cta-button lg" href="${esc(APP_URL)}?utm_source=seo" rel="noopener">Resound を無料ではじめる →</a>
  <div class="pillars">
    <div class="pillar"><span class="pi">🎧</span><b>シャドーイング</b><span>ネイティブ音声を真似て、声に出す</span></div>
    <div class="pillar"><span class="pi">✍️</span><b>瞬間英作文</b><span>和文から自分で英作文、AIが添削</span></div>
    <div class="pillar"><span class="pi">🔁</span><b>復習で定着</b><span>間違いと熟語だけ繰り返して自分のものに</span></div>
  </div>
</section>

<p class="freenote">全<strong>${libraryCount}話</strong>のうち、最初の<strong>${topics.length}話（Stage 1）</strong>を無料公開中。続きはアプリの購読で。すべて全文和訳と表現解説つきです。</p>

<h2>無料公開エピソード</h2>
<ul class="list">
${latest
  .map(
    ({ topic, number, slug }) => `<li><a href="/episodes/${esc(slug)}/">
  <span class="t">第${number}回　${esc(topicTitleJa(topic))}</span>
  <span class="s">${esc(categoryJa(topic.category))} ・ ${topic.sentences.length}文 ・ ${esc(clamp(topic.title, 60))}</span>
</a></li>`,
  )
  .join('\n')}
</ul>
<p><a href="/episodes/">すべてのエピソードを見る →</a></p>

<h2>英語表現集</h2>
<p>エピソードに登場した表現を、分野別にまとめています。</p>
<div class="grid">
${[...new Set(collections.map((c) => c.category))]
  .map((category) => {
    const first = collections.find((c) => c.category === category)!;
    const count = collections
      .filter((c) => c.category === category)
      .reduce((n, c) => n + c.entries.length, 0);
    return `<a href="/phrases/${esc(first.slug)}/">${esc(categoryJa(category))}<span class="c">${count.toLocaleString()}表現</span></a>`;
  })
  .join('\n')}
</div>

${articles.length ? `<h2>最新の解説</h2>\n<ul class="list">\n${articles
    .slice(0, 5)
    .map(
      (a) =>
        `<li><a href="/blog/${esc(a.slug)}/"><span class="t">${esc(a.title)}</span><span class="s">${esc(a.date.slice(0, 10))}</span></a></li>`,
    )
    .join('\n')}\n</ul>` : ''}

${appCta('今日の1本を、声に出してみる', 'ネイティブ音声のシャドーイングとAI瞬間英作文。最初の10話（Stage 1）は無料。')}
`;

  page({
    path: '/',
    title: BRAND,
    description: DESCRIPTION,
    body,
    priority: 1.0,
    forceIndex: true,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: BRAND,
      url: SITE_URL,
      description: DESCRIPTION,
      inLanguage: 'ja',
    },
  });
}

// --- episode index ----------------------------------------------------------

{
  const body = `
<h1>エピソード一覧</h1>
<p class="lead">Stage 1 の ${topics.length} 話を無料で公開中。全 ${libraryCount} 話はアプリでご利用いただけます。</p>
<ul class="list">
${episodes
  .map(
    ({ topic, number, slug }) => `<li><a href="/episodes/${esc(slug)}/">
  <span class="t">第${number}回　${esc(topicTitleJa(topic))}</span>
  <span class="s">${esc(categoryJa(topic.category))} ・ ${topic.sentences.length}文</span>
</a></li>`,
  )
  .join('\n')}
</ul>
${appCta()}`;

  page({
    path: '/episodes/',
    title: 'エピソード一覧',
    description: `${BRAND} の無料公開エピソード（Stage 1・${topics.length}話）。日常会話・ビジネス・時事・旅行・スポーツ・歴史など、実際に使われる英文を和訳と表現解説つきで掲載。`,
    body,
    priority: 0.9,
    forceIndex: true,
    breadcrumbs: [{ label: 'ホーム', href: '/' }],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      numberOfItems: episodes.length,
      itemListElement: episodes.slice(0, 100).map((e, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: canonical(`/episodes/${e.slug}/`),
        name: topicTitleJa(e.topic),
      })),
    },
  });
}

// --- episode pages ----------------------------------------------------------

function renderEpisode(topic: Topic, number: number, slug: string, position: number): string {
  const prev = episodes[position + 1];
  const next = episodes[position - 1];

  const sentences = topic.sentences
    .map(
      (sentence, i) => `<div class="sentence">
  <p class="en">${i + 1}. ${esc(sentence.en)}</p>
  <p class="ja">${esc(sentence.ja)}</p>
  ${
    sentence.phrases?.length
      ? `<ul class="phrases">${sentence.phrases
          .map(
            (p) =>
              `<li><b>${esc(p.phrase)}</b> — ${esc(p.meaning)}${p.usage ? `<br>${esc(p.usage)}` : ''}</li>`,
          )
          .join('')}</ul>`
      : ''
  }
</div>`,
    )
    .join('\n');

  return `
<h1>第${number}回　${esc(topicTitleJa(topic))}</h1>
<p class="meta"><span class="tag">${esc(categoryJa(topic.category))}</span>
<span>${topic.sentences.length}文</span>${topicDate(topic) ? `<span>${esc(topicDate(topic)!.slice(0, 10))}</span>` : ''}</p>
<p class="lead">${esc(topic.title)}</p>

${sentences}

${appCta('この回を音声でシャドーイングする', 'ネイティブ音声の再生、単語タップ辞書、熟語帳はアプリでご利用いただけます。')}

<div class="pager">
  ${prev ? `<a href="/episodes/${esc(prev.slug)}/">← 第${prev.number}回</a>` : '<span></span>'}
  ${next ? `<a href="/episodes/${esc(next.slug)}/">第${next.number}回 →</a>` : '<span></span>'}
</div>`;
}

episodes.forEach(({ topic, number, slug }, position) => {
  const firstSentence = topic.sentences[0];
  page({
    path: `/episodes/${slug}/`,
    title: `第${number}回　${topicTitleJa(topic)}`,
    description: `${topicTitleJa(topic)} — ${clamp(firstSentence.ja, 90)}`,
    body: renderEpisode(topic, number, slug, position),
    lastmod: topicDate(topic) ?? undefined,
    priority: 0.8,
    breadcrumbs: [
      { label: 'ホーム', href: '/' },
      { label: 'エピソード', href: '/episodes/' },
    ],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      name: topicTitleJa(topic),
      inLanguage: 'en',
      learningResourceType: '英語学習教材',
      educationalLevel: '中級〜上級',
      about: categoryJa(topic.category),
      datePublished: topicDate(topic) ?? undefined,
      publisher: { '@type': 'Organization', name: BRAND, url: SITE_URL },
    },
  });
});

// --- phrase collections -----------------------------------------------------

function renderPhraseEntry(entry: PhraseEntry, linked: boolean): string {
  const example = entry.examples[0];
  const head = linked
    ? `<a href="/phrases/w/${esc(entry.slug)}/">${esc(entry.phrase)}</a>`
    : esc(entry.phrase);
  return `<div class="phrase-entry">
  <p class="p">${head}</p>
  <p class="m">${esc(entry.meanings.join(' / '))}</p>
  ${entry.usages[0] ? `<p class="u">${esc(entry.usages[0])}</p>` : ''}
  ${example ? `<p class="ex">例: ${esc(example.en)}<br>${esc(example.ja)}</p>` : ''}
</div>`;
}

/** A phrase earns its own page only when there is more than one attestation to show. */
const standalone = [...phraseIndex.values()].filter((e) => e.examples.length >= 2);
const standaloneSlugs = new Set(standalone.map((e) => e.slug));

{
  const byCategory = new Map<string, Collection[]>();
  for (const collection of collections) {
    byCategory.set(collection.category, [...(byCategory.get(collection.category) ?? []), collection]);
  }

  const body = `
<h1>英語表現集</h1>
<p class="lead">エピソードに登場した ${phraseIndex.size.toLocaleString()} の表現を、分野別・使用頻度順にまとめています。</p>
${[...byCategory.entries()]
  .map(
    ([category, list]) => `<h2>${esc(categoryJa(category))}</h2>
<div class="grid">
${list
  .map(
    (c) =>
      `<a href="/phrases/${esc(c.slug)}/">${esc(categoryJa(category))} 第${c.part}集<span class="c">${c.entries.length}表現</span></a>`,
  )
  .join('\n')}
</div>`,
  )
  .join('\n')}
${appCta()}`;

  page({
    path: '/phrases/',
    title: '英語表現集',
    description: `日常会話・ビジネス・時事・旅行・スポーツ・歴史などの英語表現 ${phraseIndex.size.toLocaleString()}語を、意味・使い方・実際の例文つきで分野別に収録。`,
    body,
    priority: 0.9,
    forceIndex: true,
    breadcrumbs: [{ label: 'ホーム', href: '/' }],
  });
}

for (const collection of collections) {
  const title = `${categoryJa(collection.category)}の英語表現 ${collection.entries.length}選（第${collection.part}集）`;
  const siblings = collections.filter((c) => c.category === collection.category);
  const prev = siblings.find((c) => c.part === collection.part - 1);
  const next = siblings.find((c) => c.part === collection.part + 1);

  const body = `
<h1>${esc(title)}</h1>
<p class="lead">${esc(categoryJa(collection.category))}のエピソードに実際に登場した表現です。意味・使い方・出典の例文をそのまま掲載しています。</p>
${collection.entries.map((entry) => renderPhraseEntry(entry, standaloneSlugs.has(entry.slug))).join('\n')}
${appCta()}
<div class="pager">
  ${prev ? `<a href="/phrases/${esc(prev.slug)}/">← 第${prev.part}集</a>` : '<span></span>'}
  ${next ? `<a href="/phrases/${esc(next.slug)}/">第${next.part}集 →</a>` : '<span></span>'}
</div>`;

  page({
    path: `/phrases/${collection.slug}/`,
    title,
    description: `${categoryJa(collection.category)}で使われる英語表現を${collection.entries.length}語収録。それぞれ意味・使い方・実際の例文つき。`,
    body,
    priority: 0.7,
    breadcrumbs: [
      { label: 'ホーム', href: '/' },
      { label: '英語表現集', href: '/phrases/' },
    ],
  });
}

// --- individual phrase pages (substantive entries only) ---------------------

for (const entry of standalone) {
  const body = `
<h1>${esc(entry.phrase)} の意味と使い方</h1>
<p class="meta">${[...entry.categories].map((c) => `<span class="tag">${esc(categoryJa(c))}</span>`).join('')}</p>
<h2>意味</h2>
<p>${esc(entry.meanings.join(' / '))}</p>
${entry.usages.length ? `<h2>使い方</h2>\n${entry.usages.map((u) => `<p>${esc(u)}</p>`).join('\n')}` : ''}
<h2>実際の使用例（${entry.examples.length}件）</h2>
${entry.examples
  .map(
    (ex) => `<div class="sentence">
  <p class="en">${esc(ex.en)}</p>
  <p class="ja">${esc(ex.ja)}</p>
  <p class="ex"><a href="/episodes/${esc(episodeSlug(topics[ex.topicIndex], ex.topicIndex + 1))}/">第${ex.topicIndex + 1}回 ${esc(topicTitleJa(topics[ex.topicIndex]))}</a> より</p>
</div>`,
  )
  .join('\n')}
${appCta()}`;

  page({
    path: `/phrases/w/${entry.slug}/`,
    title: `${entry.phrase} の意味と使い方`,
    description: `${entry.phrase}（${entry.meanings[0]}）の意味と使い方を、実際の英文${entry.examples.length}例とともに解説。`,
    body,
    priority: 0.6,
    breadcrumbs: [
      { label: 'ホーム', href: '/' },
      { label: '英語表現集', href: '/phrases/' },
    ],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'DefinedTerm',
      name: entry.phrase,
      description: entry.meanings.join(' / '),
      inDefinedTermSet: { '@type': 'DefinedTermSet', name: `${BRAND} 英語表現集`, url: canonical('/phrases/') },
    },
  });
}

// --- blog -------------------------------------------------------------------

{
  const body = articles.length
    ? `<h1>解説記事</h1>
<p class="lead">その日のエピソードから、つまずきやすい文法・語法を掘り下げます。</p>
<ul class="list">
${articles
  .map(
    (a) =>
      `<li><a href="/blog/${esc(a.slug)}/"><span class="t">${esc(a.title)}</span><span class="s">${esc(a.date.slice(0, 10))} ・ ${esc(clamp(a.description, 70))}</span></a></li>`,
  )
  .join('\n')}
</ul>
${appCta()}`
    : `<h1>解説記事</h1>\n<p class="lead">まもなく公開します。</p>\n${appCta()}`;

  page({
    path: '/blog/',
    title: '解説記事',
    description: `${BRAND} の英語解説。エピソードに出てきた文法・語法・語彙を、実例に即して掘り下げます。`,
    body,
    priority: 0.8,
    forceIndex: true,
    breadcrumbs: [{ label: 'ホーム', href: '/' }],
  });
}

for (const article of articles) {
  page({
    path: `/blog/${article.slug}/`,
    title: article.title,
    description: article.description,
    body: `
<h1>${esc(article.title)}</h1>
<p class="meta"><span>${esc(article.date.slice(0, 10))}</span>${(article.tags ?? [])
      .map((t) => `<span class="tag">${esc(t)}</span>`)
      .join('')}</p>
${article.bodyHtml}
${appCta()}`,
    lastmod: article.date,
    priority: 0.7,
    breadcrumbs: [
      { label: 'ホーム', href: '/' },
      { label: '解説記事', href: '/blog/' },
    ],
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: article.description,
      datePublished: article.date,
      dateModified: article.date,
      inLanguage: 'ja',
      author: { '@type': 'Organization', name: BRAND, url: SITE_URL },
      publisher: { '@type': 'Organization', name: BRAND, url: SITE_URL },
      mainEntityOfPage: canonical(`/blog/${article.slug}/`),
    },
  });
}

// --- sitemap / robots / feed ------------------------------------------------

writeFileSync(
  resolve(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap
  .map(
    (entry) => `<url><loc>${esc(canonical(entry.path))}</loc>${
      entry.lastmod ? `<lastmod>${entry.lastmod.slice(0, 10)}</lastmod>` : ''
    }<priority>${entry.priority.toFixed(1)}</priority></url>`,
  )
  .join('\n')}
</urlset>`,
  'utf8',
);

writeFileSync(
  resolve(OUT, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${canonical('/sitemap.xml')}\n`,
  'utf8',
);

{
  const items = [
    ...articles.slice(0, 20).map((a) => ({
      title: a.title,
      link: canonical(`/blog/${a.slug}/`),
      date: a.date,
      description: a.description,
    })),
    ...episodes.slice(0, 20).map(({ topic, number, slug }) => ({
      title: `第${number}回 ${topicTitleJa(topic)}`,
      link: canonical(`/episodes/${slug}/`),
      date: topicDate(topic) ?? new Date().toISOString(),
      description: clamp(topic.sentences[0].ja, 110),
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);

  writeFileSync(
    resolve(OUT, 'feed.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>${esc(BRAND)}</title>
<link>${esc(SITE_URL)}</link>
<description>${esc(DESCRIPTION)}</description>
<language>ja</language>
${items
  .map(
    (item) => `<item><title>${esc(item.title)}</title><link>${esc(item.link)}</link>
<guid>${esc(item.link)}</guid><pubDate>${new Date(item.date).toUTCString()}</pubDate>
<description>${esc(item.description)}</description></item>`,
  )
  .join('\n')}
</channel></rss>`,
    'utf8',
  );
}

// --- report -----------------------------------------------------------------

const total = sitemap.length;
console.log(`[seo] site:       ${SITE_URL}`);
console.log(`[seo] app:        ${APP_URL}`);
console.log(`[seo] episodes:   ${episodes.length}`);
console.log(`[seo] phrases:    ${phraseIndex.size} unique (${standalone.length} with a page of their own)`);
console.log(`[seo] collections:${collections.length}`);
console.log(`[seo] articles:   ${articles.length}`);
console.log(`[seo] indexable:  ${total} pages in sitemap.xml`);
