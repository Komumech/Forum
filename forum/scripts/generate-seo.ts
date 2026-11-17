import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { guides } from '../src/seo/guides';

const siteUrl = 'https://komu-forum.vercel.app';
const outputDirectory = path.resolve('dist');

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const styles = `
  :root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f8fafc;font-synthesis:none;text-rendering:optimizeLegibility}
  *{box-sizing:border-box}body{margin:0;line-height:1.7}a{color:#047857;text-underline-offset:3px}a:hover{color:#065f46}
  .skip{position:absolute;left:-9999px}.skip:focus{left:1rem;top:1rem;background:white;padding:.75rem;z-index:5}
  .site-header,main,footer{width:min(100% - 2rem,760px);margin-inline:auto}.site-header{padding:1.5rem 0;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0}
  .brand{font-weight:750;color:#172033;text-decoration:none;font-size:1.15rem}.site-header nav{display:flex;gap:1.25rem;font-size:.92rem}
  main{padding:3rem 0 4rem}.eyebrow{color:#047857;text-transform:uppercase;letter-spacing:.12em;font-size:.75rem;font-weight:750}
  h1{font-size:clamp(2rem,5vw,3.35rem);line-height:1.12;letter-spacing:-.04em;margin:.75rem 0 1rem;color:#111827}
  h2{font-size:1.5rem;line-height:1.3;letter-spacing:-.02em;margin:2.4rem 0 .65rem;color:#111827}
  p,li{font-size:1.04rem;color:#475569}.lede{font-size:1.2rem;color:#334155}.meta{font-size:.87rem;color:#64748b}
  .panel,.guide-card{background:white;border:1px solid #e2e8f0;border-radius:1rem;padding:1.35rem}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:1rem;margin-top:1.6rem}
  .guide-card h2{font-size:1.2rem;margin:.5rem 0}.guide-card p{font-size:.96rem;margin:.5rem 0 1rem}
  .cta{display:inline-block;background:#0f172a;color:#fff;text-decoration:none;border-radius:.7rem;padding:.7rem 1rem;font-weight:650;margin-top:1rem}.cta:hover{background:#1e293b;color:#fff}
  .related{display:flex;flex-wrap:wrap;gap:.75rem;padding:0;list-style:none}.related a{display:inline-block;border:1px solid #cbd5e1;border-radius:999px;padding:.4rem .8rem;text-decoration:none;background:white}
  .faq{border-top:1px solid #e2e8f0;padding:.75rem 0}.faq h3{font-size:1.05rem;margin:.35rem 0}.faq p{margin:.35rem 0}
  footer{border-top:1px solid #e2e8f0;padding:1.5rem 0 2.5rem;display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;font-size:.9rem}
  footer p{font-size:.85rem;margin:0}@media(max-width:520px){.site-header nav{gap:.7rem;font-size:.82rem}main{padding-top:2rem}.lede{font-size:1.08rem}}
`;

function shell(title: string, description: string, canonicalPath: string, body: string, structuredData: unknown): string {
  const canonical = `${siteUrl}${canonicalPath}`;
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonical}">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:site_name" content="Forum">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <script type="application/ld+json">${jsonForHtml(structuredData)}</script>
  <style>${styles}</style>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="/">Forum</a>
    <nav aria-label="Main navigation"><a href="/resources/">Guides</a><a href="/">Start a meeting</a></nav>
  </header>
  ${body}
  <footer><a class="brand" href="/">Forum</a><p>Practical guides for better online meetings and collaboration.</p></footer>
</body>
</html>`;
}

function renderHub(): string {
  const cards = guides.map((guide) => `
    <article class="guide-card">
      <p class="eyebrow">${escapeHtml(guide.cluster)}</p>
      <h2><a href="/resources/${escapeHtml(guide.slug)}/">${escapeHtml(guide.title)}</a></h2>
      <p>${escapeHtml(guide.description)}</p>
      <a href="/resources/${escapeHtml(guide.slug)}/">Read the guide <span aria-hidden="true">→</span></a>
    </article>`).join('');
  const body = `
  <main id="main">
    <p class="eyebrow">Forum Guides · Online meetings and collaboration</p>
    <h1>Make online meetings more useful</h1>
    <p class="lede">Straightforward playbooks for joining browser meetings, collaborating visually, capturing decisions, and running focused remote sessions.</p>
    <p>These guides are organized around practical tasks rather than interchangeable keyword pages. Each one answers a distinct question and links to the next useful step in the same topic cluster.</p>
    <section aria-label="Meeting and collaboration guides" class="grid">${cards}</section>
    <section class="panel" style="margin-top:2rem">
      <h2>Choosing the right guide</h2>
      <p>Start with the immediate task: help a guest join, plan a whiteboard activity, record meeting outcomes, or structure a remote team session. Use the related links at the end of each guide to move between preparation, participation, and follow-through.</p>
      <a class="cta" href="/">Try Forum in your browser</a>
    </section>
  </main>`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Forum Guides: Online Meetings and Collaboration',
    description: 'Practical guides to browser video meetings, collaborative whiteboards, shared notes, and remote team agendas.',
    url: `${siteUrl}/resources/`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: guides.map((guide, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${siteUrl}/resources/${guide.slug}/`,
        name: guide.title
      }))
    }
  };
  return shell('Online Meeting & Collaboration Guides | Forum', 'Practical guides to browser video meetings, collaborative whiteboards, shared notes, and remote team agendas.', '/resources/', body, schema);
}

function renderGuide(guide: (typeof guides)[number]): string {
  const articlePath = `/resources/${guide.slug}/`;
  const articleUrl = `${siteUrl}${articlePath}`;
  const sections = guide.sections.map((section) => `
    <section>
      <h2>${escapeHtml(section.heading)}</h2>
      ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
      ${section.bullets ? `<ul>${section.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    </section>`).join('');
  const faqMarkup = guide.faqs.map((faq) => `
    <div class="faq"><h3>${escapeHtml(faq.question)}</h3><p>${escapeHtml(faq.answer)}</p></div>`).join('');
  const relatedGuides = guide.related
    .map((slug) => guides.find((item) => item.slug === slug))
    .filter((item): item is (typeof guides)[number] => Boolean(item));
  const relatedMarkup = relatedGuides.map((item) => `
    <li><a href="/resources/${escapeHtml(item.slug)}/">${escapeHtml(item.title)}</a></li>`).join('');
  const body = `
  <main id="main">
    <nav aria-label="Breadcrumb" class="meta"><a href="/">Home</a> / <a href="/resources/">Guides</a> / ${escapeHtml(guide.cluster)}</nav>
    <article>
      <p class="eyebrow">${escapeHtml(guide.cluster)}</p>
      <h1>${escapeHtml(guide.title)}</h1>
      <p class="meta">A practical guide from the Forum team</p>
      <p class="lede">${escapeHtml(guide.introduction)}</p>
      ${sections}
      <section aria-labelledby="faq-heading">
        <h2 id="faq-heading">Frequently asked questions</h2>
        ${faqMarkup}
      </section>
    </article>
    <aside aria-labelledby="related-heading">
      <h2 id="related-heading">Continue exploring</h2>
      <ul class="related">${relatedMarkup}</ul>
      <a class="cta" href="/">Start a meeting with Forum</a>
    </aside>
  </main>`;
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: guide.title,
        description: guide.description,
        inLanguage: 'en',
        author: { '@type': 'Organization', name: 'Forum' },
        publisher: { '@type': 'Organization', name: 'Forum', url: siteUrl },
        mainEntityOfPage: articleUrl
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Guides', item: `${siteUrl}/resources/` },
          { '@type': 'ListItem', position: 3, name: guide.title, item: articleUrl }
        ]
      },
      {
        '@type': 'FAQPage',
        mainEntity: guide.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer }
        }))
      }
    ]
  };
  return shell(`${guide.title} | Forum`, guide.description, articlePath, body, schema);
}

mkdirSync(outputDirectory, { recursive: true });
const resourceDirectory = path.join(outputDirectory, 'resources');
mkdirSync(resourceDirectory, { recursive: true });
writeFileSync(path.join(resourceDirectory, 'index.html'), renderHub(), 'utf8');

for (const guide of guides) {
  const guideDirectory = path.join(resourceDirectory, guide.slug);
  mkdirSync(guideDirectory, { recursive: true });
  writeFileSync(path.join(guideDirectory, 'index.html'), renderGuide(guide), 'utf8');
}

const sitemapUrls = [
  '/',
  '/resources/',
  ...guides.map((guide) => `/resources/${guide.slug}/`)
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((url) => `  <url><loc>${siteUrl}${url}</loc></url>`).join('\n')}\n</urlset>\n`;
writeFileSync(path.join(outputDirectory, 'sitemap.xml'), sitemap, 'utf8');
