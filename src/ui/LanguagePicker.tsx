import { LANGS, LANG_NAMES, useLanguage } from '../i18n';
import { strings } from './strings';

/** Język: Polski / English / Deutsch / Español, each in its own language. */
export function LanguagePicker() {
  const [lang, setLang] = useLanguage();
  return (
    <>
      <span className="theme-label">{strings.language}</span>
      <div className="segmented segmented-lang" role="group" aria-label={strings.language}>
        {LANGS.map((l) => (
          <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
            {LANG_NAMES[l]}
          </button>
        ))}
      </div>
    </>
  );
}
