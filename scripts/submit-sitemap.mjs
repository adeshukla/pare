// After a production deploy, tell the search engines the site changed.
//
//  - Bing, Yandex and others: IndexNow. Needs no account; the key file in
//    public/ proves we own the host. Bing's old sitemap ping is retired.
//  - Google: the Search Console API's sitemap submit (Google retired its ping
//    too). Runs only when GSC_SERVICE_ACCOUNT_JSON is set - a service account
//    added as an owner of the property in Search Console. GSC_SITE is the
//    property: "sc-domain:devstash.me" or "https://pare.devstash.me/".
//
// Never fails the deploy: it reports what it did and what it skipped.
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const HOST = 'pare.devstash.me';
const KEY = '322e09e4ec3215b509abd1f922c4af8e';
const SITEMAP = `https://${HOST}/sitemap.xml`;

const urls = [...readFileSync('dist/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

async function indexNow() {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
  });
  // 200 and 202 are both accepted; 422/403 mean the key file was not reachable yet.
  console.log(`IndexNow: ${urls.length} URLs, HTTP ${res.status}`);
  if (res.status >= 400) throw new Error('IndexNow refused the submission');
}

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

async function google() {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  const site = process.env.GSC_SITE;
  if (!raw || !site) {
    console.log('Google: skipped (GSC_SERVICE_ACCOUNT_JSON / GSC_SITE not set)');
    return;
  }
  const account = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const claim = b64({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/webmasters', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 });
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const signature = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(account.private_key, 'base64url');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${signature}` }),
  });
  if (!tokenRes.ok) throw new Error(`Google token: HTTP ${tokenRes.status}`);
  const { access_token } = await tokenRes.json();
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(SITEMAP)}`,
    { method: 'PUT', headers: { authorization: `Bearer ${access_token}` } },
  );
  console.log(`Google Search Console sitemap: HTTP ${res.status}`);
  if (!res.ok) throw new Error(`Google sitemap submit: HTTP ${res.status}`);
}

let failed = 0;
for (const step of [indexNow, google]) {
  try {
    await step();
  } catch (e) {
    failed++;
    console.log(`::warning::${e.message}`);
  }
}
if (failed) console.log(`${failed} submission(s) failed; the deploy itself is unaffected.`);
