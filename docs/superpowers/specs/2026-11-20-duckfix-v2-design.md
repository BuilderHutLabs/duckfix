# DuckFix V2: języki, aparat, OCR, kompresja, łączenie, puste strony

Data: 2026-11-20 · Status: do akceptacji

## Po co

DuckFix ma trafić do Google Play i zainteresować szersze grono ludzi, żeby z czasem ktoś postawił kawę albo kupił wersję Pro. Dziś to polska aplikacja do jednego problemu (krzywe, obrócone skany). V2 robi z niej pełny, prosty **skaner dokumentów**, bez konta, reklam ani znaku wodnego, działający offline, w 4 językach.

## Cele

1. Interfejs po **polsku, angielsku, niemiecku i hiszpańsku**.
2. **Skanowanie aparatem**: zdjęcie, automatyczne wykrycie kartki, przycięcie i wyprostowanie perspektywy, poprawka rogów palcem.
3. **PDF z wyszukiwalnym tekstem** (OCR) jako opcja przy zapisie.
4. **Kompresja**: opcja „Mniejszy plik” przy zapisie.
5. **Łączenie kilku PDF-ów** wyraźnie pokazane w aplikacji (mechanizm już istnieje).
6. **Usuwanie pustych stron** jednym dotknięciem, zawsze po potwierdzeniu przez użytkownika.
7. Wszystko testowane pod **osobnym linkiem** `https://builderhutlabs.github.io/duckfix-v2/`. Obecna aplikacja zostaje nietknięta do akceptacji.

## Poza zakresem (na później)

- Płatności, wersja Pro i „postaw kawę”.
- Pakowanie do Google Play (TWA, assetlinks, polityka prywatności).
- Podgląd aparatu na żywo z automatycznym zdjęciem.
- Filtry „wybielania” skanu (magic color).
- Adnotacje w PDF.

## Antycele (porażka, nawet jeśli działa)

- V2 psuje albo nadpisuje ustawienia lub ostatni dokument w obecnej aplikacji pod `/duckfix/`.
- Aplikacja przestaje działać offline w podstawowym trybie (pl/en, bez OCR w nowych językach).
- Aplikacja sama usuwa strony bez decyzji użytkownika.
- Zapis z domyślnymi opcjami daje gorszą jakość niż dziś.
- Po zainstalowaniu aplikacja startuje wyraźnie wolniej, bo pobiera duże paczki (np. OpenCV ~8 MB).

## Ograniczenia

- Stos bez zmian: Vite, React 18, TS, pdf.js, pdf-lib, tesseract.js 5. Nowe zależności tylko małe; **bez OpenCV**.
- Wszystko działa na urządzeniu, nic nie jest wysyłane na serwer.
- Klucze pamięci obecnej aplikacji (`wduck`, `wduck.deskew`, `wduck-theme`, `duckfix-palette`) zostają bez zmian w buildzie głównym.
- iPad (Safari) i Android (Chrome) to platformy docelowe. Dotykowe cele minimum 44 px.
- Teksty z akcentami (ą ł ß ñ ü…) muszą się poprawnie wyszukiwać i kopiować w PDF z OCR.

## Podejścia, które rozważyłem

**Link testowy**
- **Wybrane (decyzja użytkownika): osobne repo `BuilderHutLabs/duckfix-v2`** z własnymi GitHub Pages. Można je zainstalować obok obecnej aplikacji i dać znajomym.
- Odrzucone: tylko lokalnie (nie da się dać testerom).

**Aparat**
- **Wybrane (decyzja użytkownika): systemowy aparat** (`<input capture>`), potem ekran kadrowania z automatycznie wykrytymi rogami do poprawienia palcem. Pewne na iPadzie i Androidzie.
- Odrzucone na teraz: podgląd na żywo (`getUserMedia`). Dużo pracy, kapryśne na iOS.

**Wykrywanie kartki**
- **Moja decyzja:** własny lekki algorytm na zmniejszonym obrazie (szarości → rozmycie → krawędzie → największy wypukły czworokąt) plus ręczna poprawka jako siatka bezpieczeństwa.
- Odrzucone: OpenCV.js (~8 MB, łamie antycel o starcie).

**Gdzie stosować kadrowanie**
- **Moja decyzja:** od razu po zdjęciu powstaje nowy, wyprostowany obraz JPEG, który wchodzi do dokumentu jak zwykły obraz. Cały dalszy proces (obrót, prostowanie, eksport, sesja) działa bez zmian.
- Odrzucone: przechowywanie rogów jako parametru strony (zmiany w miniaturach, eksporcie i sesji).

**PDF z tekstem**
- **Moja decyzja:** tesseract rozpoznaje końcowy obraz strony (już obrócony i wyprostowany). Niewidoczna warstwa tekstu trafia na stronę, a wygląd strony zostaje taki sam jak bez OCR. Sposób techniczny wybiera wykonawca (wyjście PDF tesseracta lub własna warstwa z osadzoną czcionką), byle spełniał wymóg akcentów.

**Opcje zapisu**
- **Moja decyzja:** „Zapisz” otwiera mały panel z dwoma przełącznikami (Mniejszy plik, Tekst do wyszukiwania) i przyciskiem Zapisz. Wybór jest zapamiętany, więc kolejne zapisy to dalej dwa dotknięcia. Panel pokazuje nowe funkcje, których w ustawieniach nikt by nie znalazł.

## Projekt

### 1. Osobny link testowy
- Gałąź lokalna `v2`, wypychana jako `main` do nowego repo `BuilderHutLabs/duckfix-v2`, z tym samym workflow Pages.
- Base path i nazwa z buildu: zmienne środowiskowe (np. `VITE_BASE=/duckfix-v2/`, `VITE_STORAGE_NS=duckfix-v2`, nazwa w manifeście „DuckFix V2”). Domyślnie (bez zmiennych) build jest identyczny z obecnym.
- **Ta sama domena = wspólna pamięć przeglądarki.** Dlatego przy `VITE_STORAGE_NS` wszystkie klucze localStorage i baza IndexedDB dostają osobny przedrostek. Obie wersje się nie widzą.
- Repo testowe dostaje to samo co produkcja (Pages z workflow). Każde wypchnięcie aktualizuje link.

### 2. Języki
- `strings.ts` staje się słownikami `pl`, `en`, `de`, `es`. Typ wymusza, że każdy język ma wszystkie klucze, łącznie z funkcjami (np. postęp „3/10”).
- Wybór języka:
  - zapamiętany wybór użytkownika, a jeśli go nie ma,
  - pierwszy pasujący z `navigator.languages`, a w ostateczności angielski.
- W Ustawieniach nowa sekcja **„Język”** z 4 opcjami (nazwy w swoim języku: Polski, English, Deutsch, Español). Zmiana działa od razu, bez przeładowania, i ustawia `<html lang>`.
- Nazwa zapisanego pliku jest w języku interfejsu: `(poprawiony)`, `(fixed)`, `(korrigiert)`, `(corregido)`. Ponowne otwarcie poprawionego pliku nie dokleja drugiego przyrostka, w żadnym języku.
- Tłumaczenia de/es piszę ja. Oznaczam je do sprawdzenia przez rodzimego użytkownika przed publikacją w Play.

### 3. Skanowanie aparatem
- Na ekranie startowym nowy przycisk **„Zrób zdjęcie”** obok „Wybierz pliki”. W widoku stron „Dodaj” oferuje też zdjęcie.
- Przycisk otwiera aparat telefonu (`accept="image/*" capture="environment"`). Na komputerze otwiera wybór pliku.
- Po zdjęciu pojawia się **ekran kadrowania**:
  - zdjęcie z 4 przeciąganymi rogami, ustawionymi przez automatyczne wykrycie (gdy się nie uda: lekko wcięty prostokąt na całe zdjęcie);
  - lupa przy przeciąganym rogu, jeśli wykonawca uzna, że mieści się w rozsądnym wysiłku;
  - przyciski: **Gotowe**, **Następna strona** (zapisuje i od razu otwiera aparat ponownie, do skanowania wielu stron pod rząd), **Powtórz**, **Anuluj**.
- Wynik: przekształcenie perspektywiczne do JPEG (dłuższy bok maks. ok. 2400 px, jakość ok. 0,85, z uwzględnieniem orientacji EXIF), dodane do dokumentu jako strona-obraz. Dalej zwykła analiza (obrót, prostowanie).
- Kryterium wykrywania: zwykła kartka A4 na wyraźnie innym tle (stół, blat), zdjęcie z ręki pod lekkim kątem. Rogi trafiają na tyle blisko, że zwykle nie trzeba ich poprawiać. Przy kiepskim kontraście dopuszczalny powrót do ręcznego.

### 4. PDF z wyszukiwalnym tekstem
- Przełącznik **„Tekst do wyszukiwania”** w panelu zapisu (domyślnie wyłączony, bo jest wolniejszy).
- Strony, które już mają warstwę tekstu (PDF z tekstem, bez zmian rastra), są pomijane.
- Języki OCR: język interfejsu + angielski, a dla polskiego interfejsu polski + angielski (jak dziś).
  - `pol` i `eng` są w aplikacji offline jak dotąd;
  - `deu` i `spa` dochodzą do `scripts/fetch-tesseract.mjs`, ale **nie są w precache**. Pobierają się przy pierwszym użyciu i zostają w pamięci podręcznej (runtime cache).
- Postęp widoczny w przycisku/panelu: „Rozpoznawanie tekstu 3/10”. Można anulować.
- Brak sieci przy pierwszym OCR po niemiecku lub hiszpańsku: czytelny komunikat i zapis bez OCR (plik nadal powstaje).

### 5. Kompresja
- Przełącznik **„Mniejszy plik”** w panelu zapisu.
- Gdy włączony, każda strona jest renderowana do JPEG o umiarkowanej rozdzielczości (ok. 150 dpi) i jakości (ok. 0,7). Liczby ustala wykonawca, celując w wyraźnie mniejszy plik przy wciąż czytelnym tekście.
- Strony wektorowe (PDF z tekstem) też są wtedy rasteryzowane. Panel mówi to jednym zdaniem pod przełącznikiem.
- Po zapisie komunikat pokazuje rozmiar pliku (np. „Zapisano · 1,2 MB”).

### 6. Łączenie PDF-ów
- Mechanizm już jest: wiele plików naraz, „+” między stronami, przeciąganie.
- Zmiany:
  - przycisk na starcie mówi **„Wybierz pliki”**, a pod nim krótka wskazówka „Kilka plików połączy się w jeden PDF”;
  - w widoku stron „Dodaj pliki” jest wyraźnie widoczne.
- Nazwa wyniku przy wielu plikach: nazwa pierwszego pliku + przyrostek (bez zmian).

### 7. Puste strony
- Podczas analizy każdej strony liczony jest udział „atramentu” (ciemnych pikseli po progowaniu, z pominięciem marginesów ok. 5%). Poniżej progu strona dostaje flagę `blank`.
- Miniatura pokazuje plakietkę **„Pusta?”**.
- Nad siatką, gdy są takie strony, pojawia się pasek **„Usuń puste strony (N)”**. Dotknięcie usuwa je (z możliwością cofnięcia, jak zwykłe usuwanie).
- Ręczny obrót lub zatwierdzenie strony zdejmuje flagę. Strona prawie pusta z małym numerem strony lub pieczątką nie powinna zostać uznana za pustą: próg dobrany ostrożnie.

## Kolejność prac

1. Link testowy (env + przestrzeń nazw pamięci).
2. Języki (dotykają każdego tekstu; później nowe funkcje od razu dostają 4 języki).
3. Panel zapisu + kompresja.
4. OCR.
5. Puste strony.
6. Aparat (największa część).
7. Łączenie (kosmetyka).
8. Wypchnięcie do `duckfix-v2`.

## Testy

- Słowniki kompletne dla 4 języków i nie mogą zawierać pustych tekstów.
- Wybór języka: zapamiętany > przeglądarka > en.
- Przyrostki nazw w 4 językach.
- Wykrywanie czworokąta na syntetycznym obrazie (jasna kartka na ciemnym tle, obrócona i w perspektywie).
- Przekształcenie perspektywy: rogi trafiają w rogi wyniku.
- Puste strony: syntetycznie pusta, prawie pusta z numerem strony i zwykła strona tekstu.
- Kompresja: wynik mniejszy niż bez niej dla strony-obrazu.
- OCR: wynikowy PDF zawiera wyszukiwalne słowo z polskimi znakami (test w stylu istniejących testów kalibracyjnych z prawdziwym tesseractem).
- Przestrzeń nazw pamięci: przy ustawionym `VITE_STORAGE_NS` żaden klucz nie jest taki sam jak w buildzie głównym.
- Każdy przepływ sprawdzony w przeglądarce (telefon i ciemny tryb).

## Co zostaje wykonawcy

- Dokładne progi (wykrywanie kartki, puste strony, jakość kompresji).
- Technika warstwy tekstu w OCR.
- Wygląd ekranu kadrowania i panelu zapisu, w stylu obecnej aplikacji.
- Brzmienie tekstów w obrębie znaczenia opisanego wyżej.
