import type { ImportErrorCode } from '../import/errors';
import type { PageFlag } from '../model/document';

/** Polish plural form for n: 1 → one, 2–4 (not 12–14) → few, otherwise many. */
function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}

export const pl = {
  appName: 'DuckFix',
  language: 'Język',
  exportSuffix: ' (poprawiony)',
  defaultDocName: 'dokument.pdf',
  updateAvailable: 'Dostępna nowa wersja',
  updateAction: 'Odśwież',
  appDescription: 'Skanuj aparatem, łącz pliki i popraw krzywe strony. Zapisz jeden czysty PDF.',
  steps: ['1. Otwórz', '2. Sprawdź', '3. Zapisz'] as string[],

  open: 'Wybierz pliki',
  mergeHint: 'Kilka plików połączy się w jeden PDF.',
  opening: 'Otwieram…',
  close: 'Zamknij',
  confirmClose: 'Zamknąć dokument? Niezapisane zmiany przepadną.',

  restoreSession: 'Wróć do ostatniego dokumentu',
  startOver: 'Zacznij od nowa',

  analyzing: (done: number, total: number) => `Analizuję ${done}/${total}`,
  toCheck: (n: number) => `${n} ${plural(n, 'strona', 'strony', 'stron')} do sprawdzenia`,
  toCheckShort: (n: number) => `${n} do sprawdzenia`,
  showOnlyFlagged: 'Pokaż tylko te',
  nothingFlagged: 'Wszystkie strony sprawdzone.',
  emptyDoc: 'Brak stron. Dodaj strony przyciskiem „+”.',

  undo: 'Cofnij',
  redo: 'Ponów',
  save: 'Zapisz PDF',
  saving: 'Zapisuję…',
  savingProgress: (done: number, total: number) => `Zapisuję ${done}/${total}`,
  ocrProgress: (done: number, total: number) => `Rozpoznaję tekst ${done}/${total}`,
  ocrUnavailable: 'Nie udało się rozpoznać tekstu (potrzebny internet przy pierwszym użyciu). Plik zapisano bez niego.',
  shareExport: 'Udostępnij / Zapisz',
  inAppWarning: 'Ta wbudowana przeglądarka (np. Messenger) nie zapisuje plików PDF.',
  openInChrome: 'Otwórz w Chrome',
  openInSafariHint: 'Dotknij ⋯ w rogu ekranu i wybierz „Otwórz w Safari”.',
  savedNotice: (name: string, size: string) => `Zapisano plik „${name}” (${size}) w folderze Pobrane.`,

  saveOptions: 'Zapisz PDF',
  smallerFile: 'Mniejszy plik',
  smallerFileHint: 'Strony zapisują się jako lżejsze zdjęcia. Dobre do maila i urzędu.',
  searchableText: 'Tekst do wyszukiwania',
  searchableTextHint: 'Rozpoznaje tekst, żeby dało się go szukać i kopiować. Trwa dłużej.',
  fileName: 'Nazwa pliku',
  saveSelected: 'Zapisz zaznaczone',
  saveShort: 'Zapisz',
  format: 'Format',
  saveConfirm: 'Zapisz',
  cancel: 'Anuluj',

  select: 'Zaznacz',
  selectDone: 'Gotowe',
  selectedCount: (n: number) => `Zaznaczono: ${n}`,
  rotate: 'Obróć',
  remove: 'Usuń',

  takePhoto: 'Zrób zdjęcie',
  scanName: 'Skan',
  cropTitle: 'Dopasuj kartkę',
  cropDone: 'Gotowe',
  cropNext: 'Następna strona',
  cropRetake: 'Powtórz',
  cropHint: 'Przeciągnij kółka do rogów kartki.',
  cropCorner: (n: number) => `Róg ${n}`,

  cropPreview: 'Podgląd strony',
  filterColor: 'Kolor',
  filterWhiten: 'Wybielony',
  filterBw: 'Czarno-biały',
  pageLook: 'Wygląd stron',
  pageLookCount: (n: number) => `Dotyczy stron: ${n}`,
  filterWhitenHint: 'Białe tło bez cieni, wyraźny tekst.',
  filterBwHint: 'Sam czarny tekst. Najlżejszy plik, dobry do druku.',
  filterColorHint: 'Tak, jak zeskanowano.',
  sign: 'Podpisz',
  signature: 'Podpis',
  removeSignature: 'Usuń podpis',
  mySignature: 'Mój podpis',
  signatureDraw: 'Narysuj',
  signatureScan: 'Z kartki',
  signatureDrawHint: 'Podpisz się palcem w ramce.',
  signatureScanHint: 'Podpisz się na białej kartce i zrób zdjęcie. Tło zostanie usunięte.',
  signatureNotFound: 'Nie znaleziono podpisu. Spróbuj na białej kartce, ciemnym długopisem.',
  signatureClear: 'Wyczyść',
  signatureSave: 'Zapisz podpis',
  signatureTitle: 'Mój podpis',
  signatureLocal: 'Twój podpis jest zapisany tylko w tym telefonie.',
  insertHere: 'Wstaw strony tutaj',
  addAtEnd: 'Dodaj pliki',

  settings: 'Ustawienia',
  more: 'Więcej',
  diagnostics: 'Diagnostyka',
  deskew: 'Prostuj przekrzywienie',
  deskewHint: 'Zmiana działa przy następnym otwarciu pliku.',
  quack: 'Kwa kwa!',
  theme: 'Wygląd',
  themeAuto: 'Automatyczny',
  themeLight: 'Jasny',
  themeDark: 'Ciemny',
  palette: 'Kolor',
  paletteWarm: 'Ciepły',
  paletteBlue: 'Niebieski',
  paletteMint: 'Miętowy',
  paletteLavender: 'Lawendowy',

  page: (n: number) => `Strona ${n}`,
  preview: (n: number) => `Podgląd: strona ${n}`,
  previousPage: 'Poprzednia strona',
  nextPage: 'Następna strona',
  flagLabels: {
    'check-orientation': 'Sprawdź',
    'low-text': 'Mało tekstu',
    blank: 'Pusta?',
  } satisfies Record<PageFlag, string>,
  removeBlank: (n: number) => `Usuń puste strony (${n})`,
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
};

export type Strings = typeof pl;
