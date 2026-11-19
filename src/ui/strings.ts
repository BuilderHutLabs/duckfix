import type { ImportErrorCode } from '../import/errors';
import type { PageFlag } from '../model/document';

/** Polish plural form for n: 1 → one, 2–4 (not 12–14) → few, otherwise many. */
function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}

export const strings = {
  appName: 'WDuck',
  updateAvailable: 'Dostępna nowa wersja',
  updateAction: 'Odśwież',
  appDescription: 'Obraca i prostuje skany PDF. Wszystko zostaje na Twoim urządzeniu.',
  steps: ['1. Otwórz', '2. Sprawdź', '3. Zapisz'],

  open: 'Otwórz PDF lub zdjęcia',
  opening: 'Otwieram…',
  close: 'Zamknij',
  confirmClose: 'Zamknąć dokument? Niezapisane zmiany przepadną.',

  restoreSession: 'Wróć do ostatniego dokumentu',
  startOver: 'Zacznij od nowa',

  analyzing: (done: number, total: number) => `Analizuję ${done}/${total}`,
  toCheck: (n: number) => `${n} ${plural(n, 'strona', 'strony', 'stron')} do sprawdzenia`,
  showOnlyFlagged: 'Pokaż tylko te',
  nothingFlagged: 'Wszystkie strony sprawdzone.',
  emptyDoc: 'Brak stron. Dodaj strony przyciskiem „+”.',

  undo: 'Cofnij',
  redo: 'Ponów',
  save: 'Zapisz PDF',
  saving: 'Zapisuję…',
  savingProgress: (done: number, total: number) => `Zapisuję ${done}/${total}`,
  shareExport: 'Udostępnij / Zapisz',
  savedNotice: (name: string) => `Zapisano plik „${name}” w folderze Pobrane.`,

  select: 'Zaznacz',
  selectDone: 'Gotowe',
  selectedCount: (n: number) => `Zaznaczono: ${n}`,
  rotate: 'Obróć',
  remove: 'Usuń',

  insertHere: 'Wstaw strony tutaj',
  addAtEnd: 'Dodaj strony',

  settings: 'Ustawienia',
  deskew: 'Prostuj przekrzywienie',
  deskewHint: 'Zmiana działa przy następnym otwarciu pliku.',

  page: (n: number) => `Strona ${n}`,
  flagLabels: {
    'check-orientation': 'Sprawdź',
    'low-text': 'Mało tekstu',
  } satisfies Record<PageFlag, string>,
  autoRotated: 'Obrócona automatycznie',
  selected: 'zaznaczona',
  thumbError: 'Nie można wyświetlić',

  diagTitle: 'Diagnostyka',
  copy: 'Kopiuj',
  copied: 'Skopiowano',
  share: 'Udostępnij',

  dismiss: 'OK',
  errors: {
    encrypted: 'Ten PDF jest zabezpieczony hasłem. Usuń hasło i spróbuj ponownie.',
    corrupt: 'Nie udało się odczytać pliku. Może być uszkodzony.',
    unsupported: 'Ten rodzaj pliku nie jest obsługiwany. Wybierz PDF lub zdjęcie.',
  } satisfies Record<ImportErrorCode, string>,
  genericError: 'Coś poszło nie tak. Spróbuj ponownie.',
  exportError: 'Nie udało się zapisać PDF. Spróbuj ponownie.',
  analysisError: 'Automatyczne obracanie nie zadziałało. Możesz obracać strony ręcznie.',
} as const;
