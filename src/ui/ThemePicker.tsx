import { usePalette, useTheme, type PaletteChoice, type ThemeChoice } from './theme';
import { strings } from './strings';
import { LanguagePicker } from './LanguagePicker';

// functions, not constants: the labels must follow a language change
const themeOptions = (): [ThemeChoice, string][] => [
  ['auto', strings.themeAuto],
  ['light', strings.themeLight],
  ['dark', strings.themeDark],
];

const paletteOptions = (): [PaletteChoice, string][] => [
  ['warm', strings.paletteWarm],
  ['blue', strings.paletteBlue],
  ['mint', strings.paletteMint],
  ['lavender', strings.paletteLavender],
];

/** Wygląd (iOS-style segmented control: Automatyczny / Jasny / Ciemny) and Kolor (four colour sets). */
export function ThemePicker() {
  const [theme, setTheme] = useTheme();
  const [palette, setPalette] = usePalette();
  return (
    <div className="theme-picker">
      <LanguagePicker />
      <span className="theme-label theme-label-gap">{strings.theme}</span>
      <div className="segmented" role="group" aria-label={strings.theme}>
        {themeOptions().map(([value, label]) => (
          <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}>
            {label}
          </button>
        ))}
      </div>
      <span className="theme-label palette-label">{strings.palette}</span>
      <div className="swatches" role="group" aria-label={strings.palette}>
        {paletteOptions().map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="swatch"
            aria-pressed={palette === value}
            onClick={() => setPalette(value)}
          >
            <span className={`swatch-dot swatch-${value}`} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
