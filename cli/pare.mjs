#!/usr/bin/env node
// Pare from the command line (ADR-042): `node cli/pare.mjs ./site --out dist`.
//
// The same engine as the web app, because it IS the web app: this opens Pare
// in a headless Chromium on this machine, hands it the folder, waits for the
// before-and-after check, and writes what it would let you download. Files go
// from this disk into a browser tab on this disk and back - never to a server.
//
// Needs: npm install (for playwright-core and fflate) and a Chromium -
// `npx playwright install chromium` once.
//
// Exit codes: 0 done, 1 the check found a change (nothing written), 2 usage or
// setup problem.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { unzipSync } from 'fflate';

const USAGE = `Usage: node cli/pare.mjs <folder> [--out <folder>] [--url <pare address>] [--keep-names] [--files]

  <folder>      what to optimize: a site, or a folder of images, fonts and code
  --out         where to write the result (default: <folder>-pare). Must be empty or absent.
  --url         the Pare to run (default https://pare.devstash.me; a local
                \`npm run preview\` works too, e.g. http://localhost:4173)
  --keep-names  do not rename files for caching
  --files       treat the folder as separate files, not a site`;

function args(argv) {
  const out = { url: 'https://pare.devstash.me', keepNames: false, files: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--url') out.url = argv[++i];
    else if (a === '--keep-names') out.keepNames = true;
    else if (a === '--files') out.files = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else if (!out.folder) out.folder = a;
    else throw new Error(`Unexpected argument: ${a}`);
  }
  return out;
}

function listFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === '.git' || name === 'node_modules') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(root);
  return files;
}

async function main() {
  let opts;
  try {
    opts = args(process.argv.slice(2));
  } catch (e) {
    console.error(e.message + '\n\n' + USAGE);
    return 2;
  }
  if (opts.help || !opts.folder) {
    console.log(USAGE);
    return opts.help ? 0 : 2;
  }

  const root = resolve(opts.folder);
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`Not a folder: ${opts.folder}`);
    return 2;
  }
  const outDir = resolve(opts.out ?? root + '-pare');
  if (statSync(outDir, { throwIfNoEntry: false }) && readdirSync(outDir).length > 0) {
    // ADR-024's rule, here too: never write over files that exist.
    console.error(`${outDir} is not empty. Pare writes only into an empty or new folder.`);
    return 2;
  }

  const files = listFiles(root);
  const top = root.split(sep).pop();
  console.log(`Pare: ${files.length} files from ${root}`);

  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    console.error('No Chromium found. Run once: npx playwright install chromium');
    return 2;
  }
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto(opts.url);
    await page.locator('input[type=file]').waitFor({ state: 'attached' });

    // Hand the files over with their folder paths, in batches, as a folder drop.
    await page.evaluate(() => {
      window.__pareFiles = new DataTransfer();
    });
    const batch = [];
    const flush = async () => {
      await page.evaluate((items) => {
        for (const item of items) {
          const bytes = Uint8Array.from(atob(item.b64), (c) => c.charCodeAt(0));
          const file = new File([bytes], item.path.split('/').pop());
          Object.defineProperty(file, 'webkitRelativePath', { value: item.path });
          window.__pareFiles.items.add(file);
        }
      }, batch.splice(0));
    };
    let pending = 0;
    for (const full of files) {
      const path = top + '/' + relative(root, full).split(sep).join('/');
      const b64 = readFileSync(full).toString('base64');
      batch.push({ path, b64 });
      pending += b64.length;
      if (pending > 16 * 1024 * 1024) {
        await flush();
        pending = 0;
      }
    }
    await flush();
    await page.evaluate(() => {
      const input = document.querySelector('input[type=file]');
      input.files = window.__pareFiles.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Reading the files is asynchronous; the run button appears once it is done.
    await page
      .getByRole('button', { name: /^Optimize (the site|\d+ files?)$/ })
      .waitFor({ timeout: 10 * 60 * 1000 });
    const siteChoice = page.getByRole('radio', { name: /Optimize the whole site/ });
    const isSite = !opts.files && (await siteChoice.count()) > 0;
    if (!isSite && (await siteChoice.count()) > 0) {
      await page.getByRole('radio', { name: /Just give me optimized files/ }).check();
    }
    if (isSite && opts.keepNames) {
      await page.getByRole('checkbox', { name: /content fingerprint/ }).uncheck();
    }

    const started = Date.now();
    const tick = setInterval(async () => {
      const bar = page.getByRole('progressbar', { name: 'Files finished' });
      const done = await bar.getAttribute('aria-valuenow', { timeout: 500 }).catch(() => null);
      const note = await page.getByRole('status').first().textContent({ timeout: 500 }).catch(() => '');
      const line = `  ${Math.round((Date.now() - started) / 1000)}s  ${done ?? '-'} of ${files.length} files  ${note ?? ''}`;
      process.stdout.write('\r' + line.slice(0, 100).padEnd(100));
    }, 2000);

    let zipPath;
    try {
      if (isSite) {
        await page.getByRole('button', { name: /^Optimize the site$/ }).click();
        // The result appears once every page has been rendered before and after.
        const verification = page.getByRole('region', { name: 'Verification' });
        await verification.waitFor({ timeout: 60 * 60 * 1000 });
        const download = page.getByRole('button', { name: 'Download site' });
        if ((await download.count()) === 0) {
          clearInterval(tick);
          console.log('\n\nThe before-and-after check found a change, so nothing was written:\n');
          console.log((await verification.innerText()).trim());
          return 1;
        }
        const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
        zipPath = await file.path();
      } else {
        await page.getByRole('button', { name: /^Optimize \d+ files?$/ }).click();
        await page.getByLabel('Savings').waitFor({ timeout: 60 * 60 * 1000 });
        const [file] = await Promise.all([
          page.waitForEvent('download'),
          page.getByRole('button', { name: 'Download zip' }).click(),
        ]);
        zipPath = await file.path();
      }
    } finally {
      clearInterval(tick);
    }

    const zip = unzipSync(new Uint8Array(readFileSync(zipPath)));
    let written = 0;
    // The folder's own name is the first level inside the zip; --out replaces it.
    const names = Object.keys(zip).filter((n) => !n.endsWith('/'));
    const strip = names.every((n) => n.startsWith(top + '/')) ? top.length + 1 : 0;
    for (const [name, bytes] of Object.entries(zip)) {
      if (name.endsWith('/')) continue;
      const target = join(outDir, ...name.slice(strip).split('/'));
      if (!target.startsWith(outDir + sep)) continue; // never outside the output folder
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      written++;
    }
    const summary = await page
      .getByRole('region', { name: isSite ? 'Site savings' : 'Savings' })
      .first()
      .innerText()
      .catch(() => '');
    // The headline the page shows: before, after, and the saving if there is one.
    const sizes = summary.match(/[\d.]+ (?:B|KB|MB)\b/g) ?? [];
    const saving = /\d+% smaller/.exec(summary)?.[0];
    if (sizes.length >= 2) console.log(`\n\n${sizes[0]} → ${sizes[1]}${saving ? `, ${saving}` : ''}`);
    console.log(`Wrote ${written} files to ${outDir}`);
    return 0;
  } finally {
    await browser.close();
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error('\n' + (e?.message ?? e));
    process.exit(2);
  },
);
