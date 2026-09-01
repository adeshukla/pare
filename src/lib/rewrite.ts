import { encodeCssValue } from './css-refs';
import type { RefSite } from './graph';
import { basenameOf, replaceBasename } from './hash';
import { applyEdits, decodeEntities, encodeAttrValue, type Edit } from './html-scan';
import { formatSrcset, parseSrcset } from './url-ref';

/**
 * Applying renames to the files that point at them.
 *
 * Every edit here is a byte-range splice into the original text. Nothing is
 * re-parsed and re-emitted, so a rewritten page is byte-identical to its original
 * everywhere except the addresses that actually changed (ADR-015). That property
 * is what the Phase 5 verifier is checking, and it is much easier to verify when
 * the diff is three lines rather than the whole file.
 */

export type RewriteResult = {
  text: string;
  /** How many addresses were changed. */
  rewritten: number;
};

/**
 * @param source   the file's current text
 * @param refs     references whose `from` is this file
 * @param renamed  old folder-relative path to new folder-relative path
 */
export function rewriteReferences(
  source: string,
  refs: RefSite[],
  renamed: Map<string, string>,
): RewriteResult {
  const edits: Edit[] = [];
  let rewritten = 0;

  // Several srcset candidates share one attribute range, so edits are grouped by
  // the range they occupy and each range produces at most one splice.
  const groups = new Map<string, RefSite[]>();
  for (const ref of refs) {
    if (!ref.at || !ref.resolvable || !ref.target) continue;
    const key = `${ref.at.start}:${ref.at.end}`;
    const list = groups.get(key) ?? [];
    list.push(ref);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    const first = group[0]!;
    const at = first.at!;
    const original = source.slice(at.start, at.end);

    if (group.some((r) => r.srcsetIndex !== undefined)) {
      const candidates = parseSrcset(decodeEntities(original));
      let touched = false;

      for (const ref of group) {
        const index = ref.srcsetIndex;
        if (index === undefined) continue;
        const candidate = candidates[index];
        const target = renamed.get(ref.target!);
        if (!candidate || !target) continue;
        candidate.url = replaceBasename(candidate.url, basenameOf(target));
        touched = true;
        rewritten++;
      }

      if (touched) {
        edits.push({
          start: at.start,
          end: at.end,
          text: encodeAttrValue(formatSrcset(candidates), at.quote),
        });
      }
      continue;
    }

    const target = renamed.get(first.target!);
    if (!target) continue;

    const decoded = at.syntax === 'html' ? decodeEntities(original) : original;
    const next = replaceBasename(decoded, basenameOf(target));
    if (next === decoded) continue;

    edits.push({
      start: at.start,
      end: at.end,
      text:
        at.syntax === 'html'
          ? encodeAttrValue(next, at.quote)
          : encodeCssValue(next, at.quote),
    });
    rewritten++;
  }

  return { text: applyEdits(source, edits), rewritten };
}

/**
 * Group reference sites by the file they live in, so each file is rewritten once.
 */
export function refsByFile(refs: RefSite[]): Map<string, RefSite[]> {
  const out = new Map<string, RefSite[]>();
  for (const ref of refs) {
    const list = out.get(ref.from) ?? [];
    list.push(ref);
    out.set(ref.from, list);
  }
  return out;
}
