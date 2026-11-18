# WDuck: aplikacja do porządkowania PDF i skanów (projekt)

*2026-11-18 · nazwa: **WDuck** · GitHub: konto/organizacja **BuilderHutLabs***

## 1. Po co i dla kogo

Znajoma autora dostaje skany wielostronicowe (~100 stron), z których nawet ~85% jest obróconych źle. Dziś obraca je ręcznie strona po stronie na iPadzie. **Głównym celem aplikacji jest automatyczne ustawianie stron do pionu i prostowanie lekkiego przekrzywienia**, tak żeby z całej paczki ręcznie trzeba było poprawić najwyżej kilka stron.

Pozostałe funkcje (układanie stron, adnotacje, konwersje i dodatki) robią z tego ogólne narzędzie do PDF-ów, które autor chce też opublikować w Sklepie Play.

Użytkownicy:
- znajoma na iPadzie (iOS, Safari), główna użytkowniczka i źródło prawdziwych skanów;
- użytkownicy Androida ze Sklepu Play;
- przy okazji iPhone i komputer, bo to ta sama aplikacja webowa.

## 2. Cele, niecele, antycele

**Cele**
- Paczka ~100 skanów: **≥95% stron poprawnie obróconych bez dotykania**, a całość przetworzona w **≤3 min na iPadzie znajomej**.
- Strony, co do których aplikacja nie ma pewności, są wyraźnie oznaczone i poprawia się je jednym tapnięciem.
- Działa na iOS (iPad, iPhone) i Androidzie z jednego kodu, także bez internetu.
- Dokumenty nigdy nie opuszczają urządzenia.

**Niecele (na teraz)**
- Konta użytkowników, chmura, synchronizacja między urządzeniami.
- Natywna aplikacja w App Store (możliwa później, patrz §4 wariant C).
- Edycja istniejącego tekstu w PDF (to nie Acrobat).
- Wypełnianie formularzy PDF.

**Antycele (porażka, nawet jeśli „działa”)**
- Aplikacja po cichu psuje dokument: obraca dobrą stronę bez sygnału, usuwa stronę bez potwierdzenia albo wyraźnie pogarsza jakość skanu.
- Wysyłanie plików na jakikolwiek serwer, analityka śledząca treść.
- Zawieszanie się lub crash Safari na dużym pliku zamiast pracy partiami.
- Automatyczne obracanie, które jest wolniejsze od ręcznego.

## 3. Ograniczenia

- Autor pracuje na **Windowsie**, bez Maca.
- Na iOS nie ma instalowania aplikacji „z pliku”. Natywna aplikacja wymaga konta Apple Developer (99 $/rok), dlatego na iOS idzie **PWA**: Safari, a potem „Dodaj do ekranu początkowego”.
- Sklep Play: konto 25 $ jednorazowo. Nowe konto prywatne wymaga zamkniętych testów (12 testerów przez 14 dni) przed publikacją.
- Hosting: **GitHub Pages** (darmowy, HTTPS). Na darmowym planie repozytorium jest publiczne. Aplikacja działa pod podścieżką `/<nazwa-repo>/`.
- Pamięć Safari na iPhonie i iPadzie jest ograniczona, więc strony przetwarzamy po kolei lub partiami, nigdy wszystkich naraz w pełnej rozdzielczości.

## 4. Rozważone podejścia

| | Podejście | Plusy | Minusy |
|---|---|---|---|
| **A** ✅ | **PWA (React) na GitHub Pages + to samo opakowane w Capacitor do Sklepu Play** | Jeden kod, wszystkie urządzenia, za darmo na iOS, budowanie z Windowsa | Wykrywanie orientacji w przeglądarce wolniejsze niż natywne, limity pamięci Safari |
| B | React Native (Expo) | Natywne Apple Vision / ML Kit: szybkie i dokładne | iOS tylko z płatnym kontem Apple, więcej pracy przy edycji PDF i rysowaniu |
| C | A teraz, natywne wtyczki później | Furtka do App Store i szybszego OCR bez przepisywania | Odkłada natywną jakość na później |

**Wybrane: A, z furtką do C.** Znajoma może korzystać od razu i za darmo, wszystko da się zbudować z Windowsa, a do Sklepu Play trafia ta sama aplikacja. Autor zaakceptował to pod warunkiem, że działa i na Androidzie, i na iOS.

## 5. Ustalone z autorem

- Platformy: iOS (iPad, iPhone) jako PWA, Android przez Sklep Play, hosting GitHub Pages.
- Zakres funkcji: obracanie i prostowanie (najważniejsze), układanie stron, adnotacje, konwersja zdjęcie ↔ PDF, plus dodatki zaproponowane przez Claude'a i zaakceptowane: warstwa tekstowa OCR, usuwanie pustych stron, łączenie i dzielenie, kompresja, podpis, numeracja stron, znak wodny.

## 6. Projekt (decyzje Claude'a, do korekty)

### 6.1 Technologia
- **Vite + React + TypeScript**, PWA przez `vite-plugin-pwa` (service worker, manifest; `base`, `scope` i `start_url` ustawione na podścieżkę repo).
- **pdf.js** do renderowania stron, **pdf-lib** do zapisu PDF.
- **tesseract.js** do wykrywania orientacji (OSD) i OCR, uruchamiany w **Web Workerach**. Pliki modelu (`osd`, `pol`, `eng`) hostowane razem z aplikacją i cache'owane przez service worker, bez zależności od zewnętrznego CDN.
- Stan dokumentu w pamięci plus **IndexedDB** na trwające prace (żeby zamknięcie karty nie kasowało postępu) i zapisany podpis.
- Zapis i udostępnianie: **Web Share API** (arkusz udostępniania iOS i Androida, czyli Pliki, Mail itp.), w zapasie zwykłe pobranie pliku.
- Interfejs po polsku. Teksty trzymane w jednym miejscu, żeby dało się dodać angielski przed publikacją w Sklepie Play.
- Brak analityki i brak żądań sieciowych z treścią dokumentów.

### 6.2 Model dokumentu
Dokument to lista stron. Każda strona wskazuje źródło (strona z PDF-a albo obraz) i ma: obrót (0/90/180/270), kąt prostowania, adnotacje (jako obiekty, edytowalne do eksportu) i flagi (np. „niepewna orientacja”, „prawdopodobnie pusta”). **Wszystkie operacje są niedestrukcyjne aż do eksportu** i mają cofnij/ponów.

### 6.3 Auto-orientacja (rdzeń)
1. Każdą stronę renderujemy do obrazu w niskiej rozdzielczości (ok. 1000–1500 px dłuższy bok, do ustalenia w teście).
2. Tesseract OSD zwraca kąt (0/90/180/270) i pewność.
3. Pewność powyżej progu: obrót stosujemy automatycznie. Poniżej progu: strona dostaje flagę „sprawdź” i obrót jest tylko proponowany. Próg dobieramy w teście na prawdziwych skanach.
4. Strony prawie bez tekstu (zdjęcia, puste) od razu dostają flagę „sprawdź”.
5. Przetwarzanie idzie w puli workerów (domyślnie 2 na urządzeniach mobilnych), z paskiem postępu. Wyniki pojawiają się na bieżąco, więc nie trzeba czekać na koniec.
6. Zmiana orientacji przy eksporcie: przez **atrybut `/Rotate` strony, czyli bezstratnie**, bez ponownego kodowania obrazu, o ile strona nie wymaga też prostowania.

### 6.4 Prostowanie przekrzywienia
- Po ustaleniu orientacji: wykrywanie kąta metodą profilu projekcji (obraz pomniejszony i zbinaryzowany, zakres ±10°, najpierw grubo, potem dokładnie do ~0,1°). Liczone w workerze, w czystym JS, bez ciężkiego OpenCV.
- Stosowane tylko, gdy |kąt| > ~0,3°. Taka strona jest rasteryzowana w rozsądnej rozdzielczości (ok. 200 DPI), obrócona i osadzona z powrotem jako obraz. Brzegi wypełniamy bielą.
- Strony, które w oryginale mają prawdziwy tekst (nie skan), **nie są prostowane** domyślnie, żeby nie zamieniać wektorów w obraz.
- Wyłącznik w ustawieniach.

### 6.5 Ekran przeglądu (pierwszy ekran po otwarciu pliku)
Siatka miniatur. Strony zmienione automatycznie mają małą ikonkę, a niepewne mają wyraźną ramkę i są licznikiem na górze („3 strony do sprawdzenia”), z przyciskiem „pokaż tylko te”. Tap obraca o 90°. Długie przytrzymanie i przeciągnięcie zmienia kolejność. Zaznaczanie wielu stron pozwala usunąć, obrócić albo wyodrębnić. Przycisk „+” między stronami wstawia strony z innego PDF-a lub zdjęć. Duże cele dotyku, bo iPhone też ma działać.

### 6.6 Adnotacje
Tryb pełnoekranowy jednej strony z zoomem. Narzędzia: pióro (Apple Pencil i palec), zakreślacz, podkreślenie, tekst, prostokąt, elipsa, linia, strzałka, gumka, kolory i grubości, cofnij/ponów. Adnotacje pozostają edytowalne w aplikacji. Przy eksporcie są **wtapiane w PDF** (rysowane przez pdf-lib), co daje maksymalną zgodność z innymi przeglądarkami. Biblioteka do rysowania jest wyborem budowniczego (np. react-konva).

### 6.7 Konwersje
- **Zdjęcia do PDF:** wybór wielu zdjęć (Safari na iOS zwykle oddaje HEIC jako JPEG; jeśli nie, potrzebny dekoder). Najpierw orientacja z EXIF, potem ta sama auto-orientacja i prostowanie co dla skanów. Strony domyślnie A4, z dopasowaniem obrazu.
- **PDF do zdjęć:** każda strona jako JPG lub PNG w wybranej rozdzielczości. Wiele plików pakujemy do ZIP albo udostępniamy przez Web Share.

### 6.8 Dodatki
- **Warstwa tekstowa OCR** (pol + eng): niewidoczny tekst nałożony na stronę, dzięki czemu PDF da się przeszukiwać i kopiować z niego tekst. Wolniejsze niż OSD, więc uruchamiane osobnym przyciskiem, nie automatycznie.
- **Puste strony:** wykrywane po udziale „tuszu” w zbinaryzowanym obrazie. **Tylko oznaczane i proponowane do usunięcia, nigdy usuwane bez potwierdzenia.**
- **Łączenie i dzielenie:** kilka PDF-ów w jeden; podział według zakresów albo co N stron.
- **Kompresja:** ponowne zakodowanie stron-obrazów jako JPEG z wyborem jakości i DPI, z podglądem rozmiaru przed i po.
- **Podpis:** narysowany raz, zapisany w IndexedDB, wstawiany jak adnotacja-obrazek.
- **Numeracja stron i znak wodny:** pozycja, rozmiar, przezroczystość.

### 6.9 Wydajność i pamięć
Strony są renderowane i analizowane pojedynczo, a obrazy pośrednie zwalniane od razu. Miniatury w małej rozdzielczości. Eksport strumieniowy, strona po stronie, na tyle, na ile pozwala pdf-lib. Cel: plik ~100 stron (~50 MB) bez crasha na iPadzie i na średnim iPhonie.

### 6.10 Publikacja
- GitHub Actions: build i deploy na GitHub Pages przy każdym pushu do `main`.
- PWA: ikona, splash, praca offline po pierwszym uruchomieniu, komunikat „dostępna nowa wersja, odśwież”.
- Android: Capacitor opakowuje ten sam build. Dodatkowo „Otwórz w…” / udostępnij do aplikacji dla plików PDF i obrazów (intent filters). Publikacja według procesu Play (zamknięte testy).

## 7. Kolejność budowy

0. **Test na prawdziwych skanach (spike):** sama auto-orientacja i prostowanie na skanach znajomej. Mierzymy trafność i czas na jej iPadzie, dobieramy progi. **Jeśli trafność OSD wyjdzie wyraźnie poniżej celu, wracamy do decyzji o podejściu** (np. wariant C wcześniej) zanim zbudujemy resztę.
1. **MVP:** otwarcie PDF/zdjęć, auto-orientacja i prostowanie, ekran przeglądu (obracanie, kolejność, usuwanie, wstawianie), eksport i udostępnianie, PWA i deploy na Pages. Po tym etapie znajoma zaczyna z niego korzystać.
2. Adnotacje i podpis.
3. Zdjęcia ↔ PDF, łączenie i dzielenie, puste strony, kompresja.
4. Warstwa OCR, numeracja, znak wodny.
5. Opakowanie Capacitor i Sklep Play.

## 8. Testowanie
- Zestaw testowych skanów: prawdziwe od znajomej (lokalnie, **nie w publicznym repo**) plus syntetyczne (obrócone i przekrzywione wersje znanych stron, ze znaną poprawną odpowiedzią) do automatycznych testów trafności.
- Testy jednostkowe modelu dokumentu i eksportu (obrót, kolejność, adnotacje dają oczekiwany PDF).
- Ręczny test na Safari iPad/iPhone i Chrome Android przed każdym etapem.

## 9. Decyzje po recenzji (decyzje Claude'a, do korekty)

- **Zawartość skanów (od autora):** tekst, czasem obrazy i tabelki, ale **na każdej stronie jest przynajmniej trochę tekstu**. Proste wykrywanie orientacji na podstawie tekstu (OSD) jest więc właściwą drogą. Strony z małą ilością tekstu idą do flagi „sprawdź” (§6.3), a wzmocnienie 0°/180° (niżej) jest planowane od początku.
- **Próbki do testu:** krok 0 wymaga 2–3 prawdziwych skanów (mogą być z zamazanymi danymi), trzymanych lokalnie poza repo. Dopóki ich nie ma, test idzie na stronach syntetycznych.
- **Repozytorium i adres:** repo `BuilderHutLabs/wduck` (małymi literami, bo adresy na Pages rozróżniają wielkość liter i małe litery są bezpieczniejsze do wpisywania i linkowania), czyli adres `https://builderhutlabs.github.io/wduck/`. Nazwa wyświetlana w aplikacji: **WDuck**.
- **Jakość przy prostowaniu:** prostowana strona zachowuje rozdzielczość źródłowego obrazu (maks. 300 DPI), a nie sztywne 200 DPI. Skany czarno-białe (1-bit) pozostają czarno-białe (PNG), kolorowe i szare idą do JPEG wysokiej jakości. Prostowanie jest częścią MVP, bo autor wprost go chce.
- **Wymienny detektor orientacji:** moduł orientacji ma jeden interfejs (`obraz strony → kąt + pewność`), żeby dało się podmienić OSD na inną metodę albo natywną (wariant C) bez ruszania reszty.
- **Gdy test (krok 0) nie osiągnie celu:** najpierw próbujemy wzmocnienia, czyli sprawdzenia kandydatów 0° i 180° przez rozpoznanie tekstu i porównanie pewności. Jeśli dalej będzie wyraźnie poniżej 95%, decyzję o dalszej drodze podejmuje autor. Punktem odniesienia jest ręcznie opisany zestaw testowy.
- **Testy na iOS bez Maca:** każda wersja publikowana jest na Pages. Aplikacja ma ukryty ekran diagnostyki (czas na stronę, zużycie pamięci, wykryte kąty i pewności) z możliwością skopiowania lub udostępnienia raportu, który znajoma odsyła.
- **Prywatność skanów:** żadne prawdziwe skany ani ich fragmenty nie trafiają do repo ani na Pages. Testy automatyczne używają tylko syntetycznych stron.
- **HEIC:** odłożone. Polegamy na tym, że Safari i Android oddają JPEG; dekoder dopiero, gdy pojawi się realny problem.
- **Offline:** przy pierwszym uruchomieniu aplikacja pobiera do pamięci modele (OSD + pol + eng, kilkanaście–kilkadziesiąt MB) i prosi o trwałe przechowywanie (`navigator.storage.persist`). Jeśli iOS je usunie, pobierze je ponownie przy następnym połączeniu.
- **Sklep Play:** aplikacja darmowa, bez reklam i płatności. Potrzebna prosta strona z polityką prywatności (hostowana na tych samych Pages). Odbieranie plików przez „Otwórz w…” na Androidzie należy do etapu 5.

## 10. Zostawione budowniczemu
Struktura katalogów, biblioteka do rysowania adnotacji, dokładne progi i rozdzielczości (ustalane w kroku 0), wygląd interfejsu w granicach §6.5–6.6, wybór biblioteki ZIP, szczegóły konfiguracji Capacitor.
