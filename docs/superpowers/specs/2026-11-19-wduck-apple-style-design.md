# WDuck — nowy wygląd w stylu Apple (krótki design)

## Po co
Użytkownik: „jest brzydkie, jedyne co mi się podoba to rozkład tych stron pdf”. Szczególnie źle wygląda na telefonie:
pasek przycisków łamie się na 3 rzędy, miniatury są małe, ekran startowy jest surowy. Wybrany kierunek (z 3 makiet):
**C · „Jak aplikacje Apple”**: jasny, czysty, niebieskie przyciski, znajomy dla znajomej na iPadzie.

## Cele
- Wygląd w stylu iOS na telefonie, iPadzie i komputerze, spójnie na wszystkich ekranach: start, siatka stron, zaznaczanie, ustawienia, diagnostyka, komunikaty, pasek nowej wersji.
- Na telefonie (375 px) pasek u góry mieści się w **jednym rzędzie**.
- „Zapisz PDF” to duży przycisk na dole ekranu, z uwzględnieniem dolnej krawędzi iPhone'a (safe area).

## Nie-cele / anty-cele
- **Układ siatki stron zostaje** (kolejność, przyciski „+” między stronami, „Dodaj strony”, przeciąganie). Zmienia się tylko styl. Przebudowa układu byłaby porażką, nawet gdyby wyglądała ładnie.
- Bez zmian w zachowaniu: obracanie, analiza, zapis i sesja działają jak dziś. Wszystkie obecne testy przechodzą.
- Bez trybu ciemnego, bez nowych funkcji, bez nowych bibliotek UI.

## Podejścia
1. **(wybrane) Własny CSS + przebudowa samego paska i ekranu startowego w obecnych komponentach.** Mała zmiana, zero nowych zależności, pełna kontrola nad wyglądem iOS.
2. Biblioteka UI w stylu iOS (np. Konsta UI / Ionic): gotowy wygląd, ale przepisanie komponentów, większy pakiet i ryzyko zepsucia przeciągania stron. Odrzucone.
3. Sam CSS bez zmiany paska: tańsze, ale nie rozwiązuje paska w 3 rzędach. Odrzucone.

## Projekt
- **Paleta i typografia:** czcionka systemowa (`-apple-system`, Segoe UI, Roboto), tło `#f2f2f7`, karty białe, akcent `#0a84ff`, oznaczenia pomarańczowe `#ff9f0a`, usuwanie czerwone `#ff3b30`, tekst drugorzędny `#6e6e73`. Zaokrąglenia 10–14 px, delikatne cienie. Kolory jako zmienne CSS w jednym miejscu.
- **Pasek u góry (siatka stron):** półprzezroczysty, z rozmyciem (`backdrop-filter`), w jednym rzędzie: ✕ (zamknij), kapsułka „N do sprawdzenia” (dotknięcie przełącza „Pokaż tylko te”, aktywna jest wyróżniona; 5 dotknięć nadal otwiera diagnostykę), odstęp, ikony ↶ cofnij i ↷ ponów, ⋯ menu („Zaznacz”, „Prostowanie” z ustawień). Ikony jako proste wbudowane SVG z `aria-label`, bez nowych zależności.
- **Dolny pasek:** duży niebieski „Zapisz PDF”; w trakcie zapisu „Zapisuję 12/100”; na iOS po zapisie „Udostępnij / Zapisz”. W trybie zaznaczania dolny pasek pokazuje „Obróć” i „Usuń” (czerwony), a górny „Gotowe” i „Zaznaczono N”.
- **Miniatury:** białe karty z cieniem, numer w ciemnej kapsułce, niebieska kropka ↻ dla auto-obrotu, pomarańczowa ramka i etykieta dla „Mało tekstu” / „Sprawdź”. Większe niż dziś na telefonie (mniejsze odstępy i „+”). Przyciski „+” zostają, ale delikatniejsze.
- **Ekran startowy:** ikona aplikacji (kaczka z `public/icons`) w zaokrąglonym kwadracie, tytuł „WDuck”, podtytuł „Obraca i prostuje skany PDF. Wszystko zostaje na Twoim urządzeniu.”, duży niebieski przycisk, trzy kroki „1. Otwórz · 2. Sprawdź · 3. Zapisz”. Przyciski przywracania sesji w tym samym stylu.
- **Komunikaty:** błąd i potwierdzenie jako zaokrąglone karty pod paskiem; pasek nowej wersji jako pływająca karta.
- Wszystkie nowe teksty w `src/ui/strings.ts`, po polsku.

## Zostawione wykonawcy
Dokładne odstępy i rozmiary, rysunek ikon SVG, animacje (krótkie, opcjonalne). Weryfikacja wizualna w przeglądarce przy 375×812, 768×1024 i na komputerze.
