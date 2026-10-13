import type { ImageSettings } from './lib/settings';

/**
 * Task pages (ADR-035): the same app at its own address, with the settings for
 * one job already chosen and words that say what it does. They exist because
 * most people arrive with a task - "HEIC to JPG", "under 100 KB" - not with a
 * wish for an asset optimizer.
 *
 * Read by the app (src/main.tsx) and by scripts/make-task-pages.mjs, which
 * writes each page's HTML and the sitemap. Plain data only: Node imports this
 * file directly.
 */

export type Task = {
  slug: string;
  /** Link text in the footer. */
  name: string;
  /** <title> and the share-card title. */
  title: string;
  /** Meta description and share-card text. */
  description: string;
  /** Headline, in two parts: plain, then the coloured word. */
  heading: [string, string];
  lede: string;
  /** Image settings this page starts from. Everything else is the default. */
  image: Partial<ImageSettings>;
};

export const TASKS: Task[] = [
  {
    slug: 'compress-image',
    name: 'Compress an image to a size',
    title: 'Compress an image to under 100 KB, 50 KB or any size — Pare',
    description:
      'Make a photo small enough for an upload form, an email or a chat: pick a size limit and Pare fits the image under it. In your browser, nothing uploaded.',
    heading: ['Make it fit', 'under 100 KB.'],
    lede: 'Pick a limit — 20 KB, 50 KB, 100 KB or your own — and Pare fits every image under it, lowering quality first and size only if it must. Nothing is uploaded.',
    image: { output: 'target', targetKb: 100, formats: { avif: false, webp: false, fallback: true } },
  },
  {
    slug: 'heic-to-jpg',
    name: 'HEIC to JPG',
    title: 'Convert HEIC to JPG in your browser — Pare',
    description:
      'Turn iPhone HEIC photos into JPGs that open everywhere. Many at once, full size, private: the photos never leave your browser.',
    heading: ['HEIC to', 'JPG.'],
    lede: 'Drop iPhone photos and get JPGs that open everywhere, at full size. Many at once, and nothing is uploaded — the conversion happens in this tab.',
    image: {
      output: 'single',
      single: { width: null, height: null, fit: 'contain' },
      formats: { avif: false, webp: false, fallback: true },
      quality: { avif: 50, webp: 75, fallback: 88 },
    },
  },
  {
    slug: 'resize-image',
    name: 'Resize an image',
    title: 'Resize images to any width or height — Pare',
    description:
      'Resize one image or hundreds to an exact width and height, fitted or cropped to fill, in your browser. Free, no upload.',
    heading: ['Resize to', 'any size.'],
    lede: 'Set a width, a height or both — fit inside, or crop to fill — and every image comes out that size. Never enlarged, never uploaded.',
    image: {
      output: 'single',
      single: { width: 1200, height: null, fit: 'contain' },
      formats: { avif: false, webp: false, fallback: true },
    },
  },
  {
    slug: 'convert-to-webp',
    name: 'Convert to WebP',
    title: 'Convert JPG and PNG to WebP — Pare',
    description:
      'Convert images to WebP, usually much smaller than JPG or PNG at the same look. Batch, in your browser, nothing uploaded.',
    heading: ['Convert to', 'WebP.'],
    lede: 'JPG, PNG, HEIC and more to WebP, at full size — usually far smaller for the same look. Batch, private, in this tab.',
    image: {
      output: 'single',
      single: { width: null, height: null, fit: 'contain' },
      formats: { avif: false, webp: true, fallback: false },
      quality: { avif: 50, webp: 80, fallback: 75 },
    },
  },
  {
    slug: 'convert-to-avif',
    name: 'Convert to AVIF',
    title: 'Convert images to AVIF — Pare',
    description:
      'Convert images to AVIF, the smallest widely supported image format. Batch, in your browser, nothing uploaded.',
    heading: ['Convert to', 'AVIF.'],
    lede: 'The smallest image format every current browser reads. Drop JPG, PNG, HEIC or WebP and get AVIF at full size, without uploading anything.',
    image: {
      output: 'single',
      single: { width: null, height: null, fit: 'contain' },
      formats: { avif: true, webp: false, fallback: false },
    },
  },
];

export const SITE = 'https://pare.devstash.me';
export const taskPath = (task: Task) => `/tools/${task.slug}/`;
