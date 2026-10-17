// Writes every generated page from index.html and src/tasks.ts (ADR-035,
// ADR-041): the main page in each language (/hi/, /es/, ...), each task page
// in each language (/tools/<slug>/, /hi/tools/<slug>/, ...), and the sitemap.
// Each page is index.html with its own words, language, canonical address and
// links to its translations; the app reads <html lang> and data-task.
//
// index.html itself gets the links to its translations too, between the
// <!-- alternates --> markers, so the English main page names its siblings.
//
// Run by `npm run dev` and `npm run build`; by hand after editing either file:
//   node scripts/make-task-pages.mjs        (Node strips the TypeScript types.)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { HOME, LANGS, SITE, TASKS, homePath, taskCopy, taskPath } from '../src/tasks.ts';

const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const BLOCK = /<!-- alternates -->[\s\S]*?<!-- \/alternates -->/;
// Structured data in <head>, and the page's own words as plain HTML in <body>.
// The app is drawn by JavaScript, and the crawlers behind AI assistants mostly
// do not run it: without these two blocks every page reads as an empty <div>.
const LD = /<!-- ld -->[\s\S]*?<!-- \/ld -->/;
const CRAWL = /<!-- crawl -->[\s\S]*?<!-- \/crawl -->/;
const text = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** JSON-LD for one page. The author @id is the Person node devstash.me
 * declares, so both sites describe the same person. */
const ld = ({ lang, url, title, description }) => {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Pare',
    headline: title,
    description,
    url,
    inLanguage: lang,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Any (runs in a web browser)',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
    author: {
      '@type': 'Person',
      '@id': 'https://devstash.me/#person',
      name: 'Adesh Shukla',
      url: 'https://devstash.me',
    },
  };
  // A "<" escaped, so no string in the data can close the script tag.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!-- ld -->\n    <script type="application/ld+json">${json}</script>\n    <!-- /ld -->`;
};

/** The page's words for a reader that runs no scripts. Inside <noscript>,
 * so everyone else never sees them: no flash, no layout shift. */
const crawl = ({ heading, paragraphs, links }) =>
  '<!-- crawl -->\n    <noscript>\n      <main>\n' +
  `        <h1>${text(heading)}</h1>\n` +
  paragraphs.map((p) => `        <p>${text(p)}</p>\n`).join('') +
  '        <ul>\n' +
  links.map(([href, label]) => `          <li><a href="${href}">${text(label)}</a></li>\n`).join('') +
  '        </ul>\n' +
  '        <p>Pare is made by Adesh Shukla: <a href="https://devstash.me/projects/pare">devstash.me</a>.</p>\n' +
  '      </main>\n    </noscript>\n    <!-- /crawl -->';

/** Every task page in a language, as [href, link text]. */
const taskLinks = (lang) => TASKS.map((t) => [taskPath(t, lang), taskCopy(t, lang).name]);

const homeBody = (lang) => ({
  heading: HOME[lang].title,
  paragraphs: [HOME[lang].description],
  links: taskLinks(lang),
});

const swap = (html, pattern, replacement) => {
  if (!pattern.test(html)) throw new Error(`index.html no longer matches ${pattern}`);
  return html.replace(pattern, replacement);
};

/** <link rel="alternate" hreflang> for one page in every language, and x-default. */
const alternates = (pathFor) =>
  '<!-- alternates -->\n' +
  [...LANGS.map((l) => [l, pathFor(l)]), ['x-default', pathFor('en')]]
    .map(([l, path]) => `    <link rel="alternate" hreflang="${l}" href="${SITE}${path}" />`)
    .join('\n') +
  '\n    <!-- /alternates -->';

// The main English page names its translations.
const source = readFileSync('index.html', 'utf8');
let template = swap(source, BLOCK, alternates(homePath));
template = swap(template, LD, ld({ lang: 'en', url: SITE + homePath('en'), ...HOME.en }));
template = swap(template, CRAWL, crawl(homeBody('en')));
if (template !== source) writeFileSync('index.html', template);

function page({ lang, path, title, description, task, pathFor, body }) {
  const url = SITE + path;
  let html = template;
  html = swap(html, /<html lang="en">/, `<html lang="${lang}"${task ? ` data-task="${task}"` : ''}>`);
  html = swap(html, /<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`);
  html = swap(html, /(<meta name="description" content=")[^"]*(")/, `$1${attr(description)}$2`);
  html = swap(html, /(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
  html = swap(html, /(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`);
  html = swap(html, /(<meta property="og:title" content=")[^"]*(")/, `$1${attr(title)}$2`);
  html = swap(html, /(<meta property="og:description" content=")[^"]*(")/, `$1${attr(description)}$2`);
  html = swap(html, BLOCK, alternates(pathFor));
  html = swap(html, LD, ld({ lang, url, title, description }));
  html = swap(html, CRAWL, crawl(body));
  const dir = path.replace(/^\/|\/$/g, '');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    `${dir}/index.html`,
    `<!-- Generated by scripts/make-task-pages.mjs from index.html and src/tasks.ts. -->\n` + html,
  );
}

const paths = [];
for (const lang of LANGS) {
  if (lang !== 'en') {
    page({ lang, path: homePath(lang), ...HOME[lang], pathFor: homePath, body: homeBody(lang) });
  }
  paths.push(homePath(lang));
  for (const task of TASKS) {
    const copy = taskCopy(task, lang);
    page({
      lang,
      path: taskPath(task, lang),
      title: copy.title,
      description: copy.description,
      task: task.slug,
      pathFor: (l) => taskPath(task, l),
      body: {
        heading: copy.heading.join(' '),
        paragraphs: [copy.lede],
        links: [
          [homePath(lang), HOME[lang].title],
          ...taskLinks(lang).filter(([href]) => href !== taskPath(task, lang)),
        ],
      },
    });
    paths.push(taskPath(task, lang));
  }
}

const urls = paths
  .map((path) => `  <url>\n    <loc>${SITE}${path}</loc>\n    <changefreq>monthly</changefreq>\n  </url>`)
  .join('\n');
writeFileSync(
  'public/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
console.log(`wrote ${paths.length - 1} pages and public/sitemap.xml`);
