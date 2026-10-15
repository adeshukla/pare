import { lang, LANG_NAMES, t } from '../i18n';
import { homePath, LANGS, TASKS, taskPath, type Lang } from '../tasks';

/**
 * Moves to this same page in another language (ADR-041). A language is an
 * address, so choosing one is a navigation, and the choice can be shared.
 */
export function LanguagePicker() {
  const task = TASKS.find((x) => x.slug === document.documentElement.dataset.task);
  const go = (next: Lang) => {
    location.href = task ? taskPath(task, next) : homePath(next);
  };
  return (
    <label className="relative">
      <span className="sr-only">{t.language}</span>
      <select
        value={lang}
        onChange={(e) => go(e.target.value as Lang)}
        className="chip cursor-pointer appearance-none bg-transparent pr-3 text-xs"
      >
        {LANGS.map((l) => (
          <option key={l} value={l} lang={l}>
            {LANG_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
