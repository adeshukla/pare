import { lang, t } from '../i18n';

/**
 * Notes about a single file come from the worker in English. On a translated
 * page (ADR-041) the common ones are recognised here by shape and rewritten in
 * the page's language; anything not recognised - a rarer note, or one whose
 * wording has since changed - stays in English rather than being guessed at.
 */

export const NOTE_PATTERNS = {
  savedAsJpeg: /^Saved as JPEG: a PNG cannot trade quality for size/,
  couldNotFit: /^Could not get the (\S+) under (.+?)\. The smallest Pare could make is (.+?)\.$/,
  madeSmaller: /^To fit under (.+?), the (\S+) was made (\d+)×(\d+) \(from (\d+)×(\d+)\)\.$/,
  savedAtQuality: /^The (\S+) was saved at quality (\d+) \(of (\d+)\) to fit under (.+?)\.$/,
  cropped: /^Cropped to (\d+)×(\d+) from the middle of the (\d+)×(\d+) picture\.$/,
  tooSmallForBox: /^This picture is smaller than (\S+)×(\S+), so it came out (\d+)×(\d+): Pare never enlarges a picture\.$/,
  tiffPages: /^This TIFF holds (\d+) pages; only the first was converted\.$/,
  alreadySmall: /^Already as small as it gets - the original was kept\.$/,
  biggerKept: /^Re-encoding at full size made this file bigger, so the original was kept( with its camera metadata removed)?\.$/,
  unreadable: /^Could not read this file - it may be damaged/,
  tooLargeToRead: /^This image was too large to work on at full size, so it was scaled to (\d+)px wide/,
  iconsSquare: /^Icons are square, so the middle (\d+)×(\d+) of this (\d+)×(\d+) picture was used\.$/,
  iconsSmall: /^This picture is (\d+)px across, so the larger icons/,
  iconsPlace: /^Put these files at the top of your site/,
  maskableWhite: /^The maskable icon sits on white/,
  animation: /^Kept as an animation \((\d+) frames\) at its own size: an animated WebP(, with the original GIF[^.]*)?\./,
  animationBigger: /^An animated WebP came out no smaller than this GIF/,
  animationTarget: /^This GIF is animated, and a size limit cannot be met/,
  // The short line under a file's name.
  minified: /^minified( \+ .+)?$/,
  copiedUnchanged: /^copied unchanged$/,
  fontFiles: /^(\d+) files · (\d+) characters$/,
  fontOf: /^(\d+) of (\d+) characters$/,
} as const;

export type NoteKey = keyof typeof NOTE_PATTERNS;
export type NoteTranslations = Partial<Record<NoteKey, (...groups: string[]) => string>>;

/** A worker's note in this page's language, where it is one Pare knows. */
export function note(text: string): string {
  if (lang === 'en') return text;
  for (const [key, pattern] of Object.entries(NOTE_PATTERNS) as Array<[NoteKey, RegExp]>) {
    const m = pattern.exec(text);
    const say = t.notes[key];
    if (m && say) return say(...m.slice(1).map((g) => g ?? ''));
  }
  return text;
}
