import { useTheme, type ThemeChoice } from './theme';
import { strings } from './strings';

const OPTIONS: [ThemeChoice, string][] = [
  ['auto', strings.themeAuto],
  ['light', strings.themeLight],
  ['dark', strings.themeDark],
];

/** iOS-style segmented control: Automatyczny / Jasny / Ciemny. */
export function ThemePicker() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="theme-picker">
      <span className="theme-label">{strings.theme}</span>
      <div className="segmented" role="group" aria-label={strings.theme}>
        {OPTIONS.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
