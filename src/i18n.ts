import type { NoteTranslations } from './lib/notes';
import { LANGS, type Lang } from './tasks';

/**
 * The words on the everyday path - the landing page, the drop zone, the run
 * button, results, savings, Save and Share, the size and icon options - in the
 * languages of the people who most need "make my photo smaller" (ADR-041).
 *
 * A page's language is its address: /hi/, /es/tools/compress-image/ and so on,
 * set as <html lang> by scripts/make-task-pages.mjs. No guessing from the
 * browser, so a link always opens in the language it was shared in.
 *
 * Notes about a single file, and the advanced settings, are English for now;
 * the page says so. English is the source: every other language must supply
 * every key, or this file does not compile.
 */

const en = {
  langName: 'English',
  language: 'Language',
  privacyChip: 'Nothing leaves this tab',
  worksOffline: 'Works offline',

  heroChip: 'Images · fonts · code · whole sites',
  taskChip: 'Free · private · works offline',
  heroHeading: ['Pare it', 'down.'] as [string, string],
  heroLede:
    'Shrink your images, fonts and code, and get the markup to use them. Files are read in this tab and never sent anywhere — there is no server to send them to.',
  srOptimize: 'Pare — optimize your files',
  backToStart: 'Pare — back to the start',

  whatPareDoes: 'What Pare does',
  features: [
    ['Images', 'AVIF, WebP and an optimized original at every width you choose — plus the <picture> tag to paste.'],
    ['Fonts', 'Split by script so pages load only what they need, or cut to the characters you use. WOFF2 and @font-face included.'],
    ['Code', 'CSS, JavaScript, HTML and SVG minified. Rewritten, never removed — nothing that worked can stop working.'],
    ['Whole sites', 'Drop a folder: every file shrinks in place, and every page is rendered before and after before you can download it.'],
  ] as Array<[string, string]>,
  steps: [
    ['Drop', 'A folder, some files, or a pasted screenshot.'],
    ['Tune', 'Every option is a switch, with its cost shown before you run.'],
    ['Take it', 'A zip, a folder, and the markup to paste.'],
  ] as Array<[string, string]>,

  dropHere: 'Drop a folder or files here',
  dropMore: 'Drop, paste or choose more files to start again',
  reading: 'Reading files…',
  dropOverlay: 'Drop to add these files',
  dropOverlaySub: 'They stay in this tab.',
  dropHint: 'Or a .zip, or paste an image. Nothing is uploaded — everything runs in this browser tab.',
  chooseFolder: 'Choose a folder',
  chooseFiles: 'Choose files',
  trySample: 'No file to hand? Try it with a sample photo',
  sampleFailed: 'The sample could not be loaded. Try again once you are online.',
  nothingReadable: 'Nothing readable in that drop.',

  optimizeFiles: (n: number) => `Optimize ${n} ${n === 1 ? 'file' : 'files'}`,
  optimizeSite: 'Optimize the site',
  working: 'Working…',
  startOver: 'Start over',
  dropped: (n: number, workers: number) => `${n} dropped · ${workers} worker${workers === 1 ? '' : 's'}`,
  kindCount: (n: number, kind: 'image' | 'font' | 'code' | 'other') =>
    `${n} ${kind === 'image' ? (n === 1 ? 'image' : 'images') : kind === 'font' ? (n === 1 ? 'font' : 'fonts') : kind}`,
  checkingPages: 'Checking pages',
  optimizing: 'Optimizing',
  doneOf: (done: number, total: number) => `${done} of ${total} done`,
  filesFinished: 'Files finished',
  modeSite: (parts: string) => `Optimize the whole site (${parts})`,
  siteParts: (pages: number, templates: number) =>
    [
      pages > 0 ? `${pages} page${pages === 1 ? '' : 's'}` : '',
      templates > 0 ? `${templates} template${templates === 1 ? '' : 's'}` : '',
    ]
      .filter(Boolean)
      .join(', '),
  modeSiteHint: 'Every file shrinks in place, addresses stay correct, and each page is checked before you can download.',
  modeSiteHintTemplates:
    'Every file shrinks in place under its own name. Templates are never touched, so a WordPress or PHP site keeps working.',
  modeFiles: 'Just give me optimized files and snippets',
  modeFilesHint: 'AVIF, WebP, fonts and minified code, with markup to paste where you like.',
  whatToDo: 'What to do',

  downloadZip: 'Download zip',
  saveToFolder: 'Save to a folder…',
  copySnippet: 'Copy snippet',
  copyAllSnippets: (n: number) => `Copy all ${n} snippets`,
  savingsReport: 'Savings report',
  zipNote: 'Includes snippets.html with every generated tag. Your original files are untouched.',
  englishNote: '',

  noUpload: 'No upload, no account, no server.',
  offlineNote: ' Anything you have used once in this browser keeps working without a connection.',
  tools: 'Tools',
  everything: 'Everything Pare does',
  bugReport: 'Copy details for a bug report',

  colFile: 'File',
  colBefore: 'Before',
  colAfter: 'After',
  colChange: 'Change',
  smaller: (n: number) => `${n}% smaller`,
  noChange: 'no change',
  waiting: 'waiting',
  save: 'Save',
  share: 'Share',
  saveFile: (name: string) => `Save ${name}`,
  shareFile: (name: string) => `Share ${name}`,
  locationRemoved: 'Location removed',
  locationTitle: 'This photo recorded where it was taken. The files Pare made do not.',

  savingsLabel: 'Savings',
  visitorDownloads: 'What a visitor downloads',
  savingsExplain: (zip: string) =>
    `For images the smallest full-size format their browser reads, for split fonts the first file only, for code the minified file itself. The zip holds ${zip} across every variant — nobody downloads all of it.`,
  compressedNote: (size: string) =>
    `If your server also compresses code (gzip or brotli), it would send about ${size} instead. That is an estimate - the files you save are not that size, and the .gz and .br copies only help once your server is set up to send them.`,
  locationsRemoved: (n: number) =>
    n === 1
      ? 'One photo held the place it was taken. That location is not in the file you download.'
      : `${n} photos held the place they were taken. Those locations are not in the files you download.`,
  skippedNote: (n: number) => `${n} file${n === 1 ? ' was' : 's were'} left unchanged. The reason is on the row.`,

  outputResponsive: 'Responsive set',
  outputSingle: 'One size',
  outputTarget: 'Under a size',
  outputIcons: 'App icons',
  hintResponsive: 'Several widths, and markup that lets each screen download the one it needs.',
  hintSingle: 'One file per format at the size you set. For a thumbnail, an avatar, or an image you place yourself.',
  hintTarget: 'One file per format, each at or under a file size - for an upload form, an email or a chat.',
  hintIcons:
    'favicon.ico, the Apple touch icon, the icons an installed site uses, a maskable one for Android, and the manifest and tags that list them - from one square-ish picture, 512px or larger.',
  everyFileUnder: 'Every file at or under',
  sizeLimits: 'Common size limits',
  anySize: 'Or any size, in KB',
  targetExplain:
    'Pare lowers quality first and makes the picture smaller only if it has to, then tells you what it changed. A photo without transparency comes out as JPEG, which is what most upload forms ask for.',
  formPresets: "For a form",
  formPhoto: "Form photo",
  signature: "Signature",
  passport: "Passport photo",
  avatar: "Profile picture",
  presetsHint: "Forms differ: check the size yours asks for.",
  exactSize: "Exact size, in pixels (optional)",
  width: "Width",
  height: "Height",
  exactSizeHint: "With both set, the middle of the picture is cropped to that shape. Pare then lowers only quality - the size stays exact - and says so if the limit cannot be met.",
  /** Worker notes in this language, by shape (src/lib/notes.ts). English needs none. */
  notes: {} as NoteTranslations,
};

export type Strings = typeof en;

/** Each language's name in itself, for the picker. Only English's words load up front. */
export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  hi: 'हिन्दी',
  es: 'Español',
  pt: 'Português',
  id: 'Bahasa Indonesia',
};

/** This page's language, from its address (set as <html lang> when the page was generated). */
export const lang: Lang = (LANGS as readonly string[]).includes(document.documentElement.lang)
  ? (document.documentElement.lang as Lang)
  : 'en';

/**
 * The words on this page. English is in the main bundle; any other language is
 * its own small file, fetched before the first render (src/main.tsx), so a
 * visitor downloads one language's words, not five.
 */
export let t: Strings = en;

const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<{ default: Strings }>> = {
  hi: () => import('./i18n/hi'),
  es: () => import('./i18n/es'),
  pt: () => import('./i18n/pt'),
  id: () => import('./i18n/id'),
};

export async function loadLanguage(): Promise<void> {
  if (lang === 'en') return;
  try {
    t = (await LOADERS[lang]()).default;
  } catch {
    // Offline before this language was ever loaded: English is better than nothing.
  }
}
