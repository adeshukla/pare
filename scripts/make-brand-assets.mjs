// Renders Pare's app icons and link-preview image from the logo, in a real
// browser, so they match the site exactly. Run after changing the logo or the
// headline: node scripts/make-brand-assets.mjs - then run the PNGs through Pare
// itself (OxiPNG for the icons, MozJPEG at 86 to turn og.png into og.jpg); the
// committed files are those optimised copies.
import { chromium } from '@playwright/test';

const MARK = (size, radius) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#9333ea"/>
  </linearGradient></defs>
  <rect width="32" height="32" rx="${radius}" fill="url(#g)"/>
  <path d="M10 24V9h6.5a5 5 0 0 1 0 10H13" fill="none" stroke="white" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const page = (body, w, h) => `<!doctype html><html><head><style>
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}
</style></head><body>${body}</body></html>`;

const OG = `<!doctype html><html><head><style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden}
  body{background:#09090b;color:#fafafa;font-family:"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;
       display:flex;flex-direction:column;justify-content:center;padding:0 96px;box-sizing:border-box;position:relative}
  .glow{position:absolute;inset:-200px -100px auto auto;width:760px;height:760px;border-radius:50%;
        background:radial-gradient(closest-side,rgba(129,140,248,.45),transparent);filter:blur(20px)}
  .glow2{position:absolute;left:-180px;bottom:-260px;width:620px;height:620px;border-radius:50%;
         background:radial-gradient(closest-side,rgba(52,211,153,.28),transparent)}
  .brand{display:flex;align-items:center;gap:20px;font-size:40px;font-weight:700;letter-spacing:-.02em;position:relative}
  h1{margin:36px 0 0;font-size:104px;line-height:1;letter-spacing:-.045em;position:relative}
  h1 span{background:linear-gradient(100deg,#818cf8,#c084fc 60%,#34d399);-webkit-background-clip:text;background-clip:text;color:transparent}
  p{margin:28px 0 0;font-size:34px;color:#a1a1aa;max-width:900px;line-height:1.35;position:relative}
  .chips{display:flex;gap:14px;margin-top:40px;position:relative}
  .chip{border:2px solid #27272a;border-radius:999px;padding:10px 22px;font-size:24px;color:#d4d4d8}
</style></head><body>
  <div class="glow"></div><div class="glow2"></div>
  <div class="brand">${MARK(64, 9)}pare</div>
  <h1>Pare it <span>down.</span></h1>
  <p>Shrink images, fonts and code in your browser. Nothing is uploaded.</p>
  <div class="chips"><span class="chip">AVIF · WebP</span><span class="chip">HEIC · BMP</span><span class="chip">Fonts</span><span class="chip">Whole sites</span></div>
</body></html>`;

const browser = await chromium.launch();
const shot = async (html, w, h, path, transparent = true) => {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html);
  await p.screenshot({ path, omitBackground: transparent });
  await p.close();
};

// "any" icons keep rounded corners; the maskable one is full-bleed so the
// platform's own mask (circle, squircle) can crop it without losing the mark.
await shot(page(MARK(192, 9), 192, 192), 192, 192, 'public/icon-192.png');
await shot(page(MARK(512, 9), 512, 512), 512, 512, 'public/icon-512.png');
await shot(page(MARK(512, 0), 512, 512), 512, 512, 'public/icon-maskable-512.png', false);
await shot(page(MARK(180, 0), 180, 180), 180, 180, 'public/apple-touch-icon.png', false);
await shot(OG, 1200, 630, 'public/og.png', false);
await browser.close();
console.log('wrote public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, og.png');
