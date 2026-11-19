# WDuck — podgląd strony po przytrzymaniu (krótki design)

## Po co
Na telefonie miniatury są małe, więc trudno ocenić, czy strona stoi prosto. Użytkownik: „Dodajmy powiększenie strony przy przytrzymaniu konkretnej strony pdf”. Wybrany wariant: **A — „przytrzymaj i puść = podgląd, przytrzymaj i przesuń = przeniesienie”**. Podgląd w zaproponowanym kształcie został zaakceptowany razem z wyborem.

## Cele
- Dotyk: przytrzymanie miniatury (dzisiejsze 250 ms, które unosi stronę do przeciągania) i puszczenie bez przesunięcia otwiera podgląd. Przytrzymanie z przesunięciem dalej zmienia kolejność.
- Mysz: przytrzymanie przycisku ~500 ms bez ruchu otwiera podgląd (na komputerze przeciąganie zaczyna się dopiero od ruchu o 8 px, więc się nie gryzą).
- Krótkie dotknięcie dalej obraca o 90°. Otwarcie podglądu **nie może** dodatkowo obrócić strony.
- Podgląd na cały ekran: ostra strona, obrócona tak, jak zostanie zapisana (efektywny obrót + prostowanie, jak na miniaturze). Na górze numer strony („Strona N”) i ✕. Strzałki ‹ › przechodzą po stronach widocznych w siatce (przy włączonym „tylko do sprawdzenia” po tych stronach). Przycisk „Obróć” obraca o 90° przez historię (cofnij działa). Powiększanie dwoma palcami (natywne przybliżanie przeglądarki, nie blokować). Escape i ✕ zamykają, strzałki klawiatury przełączają.

## Nie-cele
- Bez zmian w eksporcie, analizie i sesji. Bez nowych bibliotek. Bez podglądu w trybie zaznaczania (tam przytrzymanie nie robi nic nowego).

## Podejścia
A (wybrane): przytrzymaj i puść. B: lupa na miniaturze (dodatkowa ikonka na każdej stronie, trudno trafić). C: dwukrotne dotknięcie (pierwsze dotknięcie obraca stronę).

## Zostawione wykonawcy
Rozdzielczość renderu podglądu (dłuższy bok ~1600–2400 px wg `devicePixelRatio`, z poszanowaniem pamięci iOS: zwolnić canvas po zamianie na obraz, zwolnić URL przy zamknięciu lub zmianie strony). Animacja otwarcia (krótka, opcjonalna).
