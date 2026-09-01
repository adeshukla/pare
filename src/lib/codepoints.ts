/**
 * Which characters a site actually uses.
 *
 * This drives the opt-in "keep only what I use" subset mode. It is deliberately
 * greedy: it reads every character in the file, markup and attribute values
 * included, rather than trying to work out which text nodes are rendered.
 *
 * Being greedy is the point. Working out what is *not* shown is the same
 * undecidable problem that keeps CSS purging out of scope (ADR-002), and getting
 * it wrong here means a missing glyph on someone's page. Over-keeping costs a
 * few hundred bytes; under-keeping costs a tofu box in production.
 */

const decoder = new TextDecoder('utf-8', { fatal: false });

/** CSS `content: "\2713"` and HTML `&#10003;` / `&copy;` hide characters from a plain scan. */
function expandEscapes(text: string): string {
  // CSS escapes: \2713 or \2713<space>
  const cssEscapes = [...text.matchAll(/\\([0-9a-fA-F]{1,6})\s?/g)]
    .map((m) => safeFromCodePoint(Number.parseInt(m[1]!, 16)))
    .join('');

  // HTML numeric entities: &#10003; and &#x2713;
  const htmlEntities = [...text.matchAll(/&#(x?)([0-9a-fA-F]+);/g)]
    .map((m) => safeFromCodePoint(Number.parseInt(m[2]!, m[1] ? 16 : 10)))
    .join('');

  // Joined with no separator on purpose. Padding with a space would report a
  // character the source never contained.
  return text + cssEscapes + htmlEntities;
}

function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return '';
  try {
    return String.fromCodePoint(cp);
  } catch {
    // Lone surrogates and other invalid scalars. Nothing to contribute.
    return '';
  }
}

export function fromText(text: string): Set<number> {
  const out = new Set<number>();
  for (const char of expandEscapes(text)) {
    const cp = char.codePointAt(0);
    if (cp !== undefined) out.add(cp);
  }
  return out;
}

export function fromBytes(bytes: Uint8Array): Set<number> {
  return fromText(decoder.decode(bytes));
}

/**
 * Characters that must survive any subset, whatever the scan found.
 *
 * Space and the ASCII digits and letters cost almost nothing and are what a
 * database-driven page is most likely to produce that a static scan never saw.
 * Including them is cheap insurance against the failure mode this whole feature
 * has - see ADR-011.
 */
export function withSafetyFloor(codepoints: Set<number>): Set<number> {
  const out = new Set(codepoints);
  for (let cp = 0x20; cp <= 0x7e; cp++) out.add(cp);
  out.add(0x00a0); // non-breaking space
  out.add(0xfffd); // replacement character
  return out;
}

export const union = (sets: Array<Set<number>>): Set<number> => {
  const out = new Set<number>();
  for (const set of sets) for (const cp of set) out.add(cp);
  return out;
};
