# CMC POEM - generator G-code dla Mach3Mill

Niezależna aplikacja WWW, zamieniająca macierz `0/1` w nawiercenia CNC. **0 = pomiń, 1 = nawierć**.

## Uruchomienie

Aplikacja nie wymaga Node.js ani instalowania zależności. Ponieważ pliki JavaScript są modułami, otwórz ją przez lokalny serwer HTTP:

```bash
cd cmc_poem
python3 -m http.server 8080
```

Następnie otwórz w przeglądarce `http://localhost:8080`. Możesz też hostować katalog jako zwykłą stronę statyczną, np. przez GitHub Pages.

## Funkcje

- Wprowadzanie siatki zer i jedynek, ze spacjami lub bez. Każdy wiersz tekstu reprezentuje osobny rząd.
- Widoczne pole zwykłego tekstu: wpisz tekst lub wiersz, a aplikacja automatycznie zakoduje go jako UTF-8 (8 bitów na bajt). Dostępny jest także przycisk **Zamień tekst na 0/1**, od 1 do 31 bajtów na wiersz i automatyczne zawijanie. Puste linie tworzą rzędy bez nawiertów.
- Klikanie w podglądzie przełącza `0/1`; po zmianie należy ponownie wygenerować kod.
- Oba układy rosną wzdłuż Y: w poziomym 8 bitów bajtu leży w rzędzie X, w pionowym 8 bitów leży w kolumnie Y. Przy 1 bajcie na wiersz aplikacja domyślnie wybiera pionowy (chyba że operator zmienił go ręcznie).
- Punkt `(0,0)` w jednym z czterech narożników siatki.
- Niezależne odstępy X i Y w milimetrach.
- Obliczanie liczby otworów i wymiarów pomiędzy skrajnymi środkami nawiertów.
- Głębokość poniżej Z0, posuw, poziom podejścia R, bezpieczne Z.
- Eksport G-code: ruchy `G0/G1`, cykl `G81/G98` lub helisa `G3`.
- Podgląd siatki odświeża się na bieżąco, natomiast przycisk **Generuj G-code** uruchamia generowanie programu CNC. Po zmianie parametrów wcześniejszy kod jest usuwany, aby nie pobrać nieaktualnego pliku.
- Kolejność wierszami lub wężykiem. Gotowy plik `.tap` lub kopiowanie G-code.
- Opcjonalne `S... M3` i `M5`; domyślnie generator **nie uruchamia wrzeciona**.

## Przykład

Dla macierzy:

```text
101
010
```

ustaw `pitchX=5`, `pitchY=5`, `origin=bottom-left`, `orientation=horizontal`. Narzędzie nawierci punkty `(X0,Y5)`, `(X10,Y5)` i `(X5,Y0)`, a rozstaw siatki wyniesie `10 x 5 mm`.

## Współrzędne i bezpieczeństwo

- Jednostki: `G21` (milimetry), `G90` (absolutne), `G94` (mm/min), aktywny układ roboczy `G54`.
- **Z0** musi znajdować się na powierzchni materiału; głębokość jest generowana jako **ujemne Z**.
- Ustaw **G54 X0 Y0** w wybranym narożniku siatki. Pozostałe współrzędne mogą być ujemne (gdy wybrano prawy lub górny narożnik).
- `safeZ >= retractZ > 0`. Najpierw wykonywany jest ruch osi Z do bezpiecznej wysokości; po każdym otworze jawnego cyklu Z wraca do bezpiecznej wysokości.
- Kod nie zmienia układów narzędzi ani nie wywołuje zmiany narzędzia. Komenda `G49` anuluje wcześniejsze korekcje długości narzędzia; uwzględnij to w swojej konfiguracji.
- **Przed wykonaniem przeprowadź symulację w Mach3, sprawdź G54, kierunek osi, odległości od ograniczników, mocowanie materiału, narzędzie, obroty i posuw. Wykonaj próbny przejazd nad detalem.** Generator nie sprawdza fizycznej kinematyki i zakresu ruchów Twojej maszyny.
- **Nie przesyłaj pliku automatycznie na maszynę**. Aplikacja wyłącznie generuje i pobiera pliki lokalnie w przeglądarce.

W standardowej składni Mach3Mill: posuw to `F` (nie `P`), głębokość nawiertu to `Z`, a `G81` jest cyklem wiercenia. `P` to m.in. czas postoju w `G82`, dlatego nie jest tu używane jako posuw.

## Testy

```bash
npm test
```

Testowane są: parsowanie i uzupełnianie wierszy, orientacja, punkty zerowe, kolejność otworów, zerowy i pojedynczy nawiert, głębokości, `G81`, bezpieczne powroty, wrzeciono i walidacja.

## Struktura

- `index.html` - interfejs.
- `src/styles.css` - wygląd responsywny.
- `src/gcode.mjs` - niezależny parser i postprocesor G-code.
- `src/app.mjs` - obsługa podglądu, kontrolek i eksportu.
- `tests/gcode.test.mjs` - testy jednostkowe Node.js.

Źródło składni: instrukcja *Using Mach3Mill*, Rev 1.84 (rozdział 10, zwłaszcza `G0`, `G1`, `G81`, `G98`, `G90`, `G94`).

## CMC POEM v1.5: obie orientacje pionowym pasem

Poziomy i pionowy opisują położenie bitów, a **nie kierunek transportu materiału**. W obu układach kolejne bajty/grupy rosną wzdłuż Y.

- Poziomy: dla `ABCD` i 1 bajta na wiersz powstaje siatka 8 kolumn X i 4 wiersze Y.
- Pionowy: dla tego samego tekstu powstaje siatka 1 kolumny X i 32 wierszy Y.
- Dla większej liczby bajtów na wiersz, w pionowym układzie każdy bajt tworzy osobną kolumnę po 8 bitów, kolejne grupy przechodzą w dół.
- Ręczny kod 0/1 ma w poziomym trybie kolejne wiersze w dół, a w pionowym układzie jego bity przebiegają pionowo. Dla wierszy podzielnych przez 8 bity są ułożone w sąsiadujących kolumnach bajtów.

## Ograniczniki oraz etapy, zawsze wzdłuż Y

1. Włącz `Podziel wzór na niezależne etapy` w dowolnej orientacji.
2. Podaj maksymalny obszar X i Y. Program uwzględnia średnicę otworu lub wiertła.
3. Wpisz opcjonalnie `Podziel co N wierszy w osi Y`. Puste pole oznacza automatyczny podział według maksymalnej wysokości Y.
4. Wygeneruj oddzielne programy `.tap` lub pobierz ZIP wraz z instrukcją i offsetami wszystkich etapów.

**Nie ma podziału wzdłuż X.** Jeśli pas jest szerszy od dopuszczalnego X, generator odrzuca plan zamiast tworzyć boczne etapy. W każdym pliku trzeba ponownie ustawić lokalne G54 X0/Y0 w wybranym narożniku fragmentu po przesunięciu materiału. Program nie wykonuje pozycjonowania materiału.

## Osobne posuwy

- Posuw roboczy F w mm/min dotyczy nawiercenia oraz helisy.
- Szybki ruch jałowy XY: `G0`, z prędkością określoną w konfiguracji Mach3, niezależnie od F.
- Kontrolowany ruch jałowy XY: `G1` z oddzielnym `Posuw jałowy XY F`, na wysokości bezpiecznego Z.
- Ruchy Z w trybie jałowym nadal używają `G0`.
- Kontrolowany posuw XY jest niedostępny razem z cyklem `G81`, ponieważ cykl sam pozycjonuje narzędzie.

## Helisa G3

Trzeci tryb obróbki to zagłębianie spiralne `G3`, `G91.1` (inkrementalne I/J). Ustaw średnicę narzędzia, średnicę otworu i zejście na obrót, głębokość i posuw. Generator wykorzystuje dwa półokręgi na obrót i okrąg wykańczający. Średnica wykonywanego otworu musi mieścić się między `D frezu + 0,1 mm` a `2 × D frezu`. Wymagany jest frez umożliwiający zagłębianie.

## Kontrola bezpieczeństwa

Uruchom `npm test`, potem sprawdź każdy etap w symulatorze Mach3Mill. Sprawdź kierunki osi, G54, ustawienie Z0 na powierzchni, bezpieczne wysokości, korekcję długości po `G49`, narzędzie, uchwyty oraz mechanikę maszyny. Wykonaj próbny przejazd nad materiałem. **Zmiana orientacji względem wcześniejszych wersji wymaga nowej symulacji**. Generator nie był testowany na rzeczywistej maszynie.

## Pliki

- `src/gcode.mjs`: parsowanie, pozycje, etapy Y, G-code.
- `src/app.mjs`: interfejs, podgląd, eksport.
- `src/zip.mjs`: eksport ZIP bez zależności.
- `tests/*.test.mjs`: testy logiki, etapów, posuwów i UI.

## v1.6: Bezpieczny obszar pracy dla poziomego i pionowego

Sekcja **Bezpieczny obszar pracy** jest stale widoczna i nie zależy od układu. Ustaw fizyczną szerokość pola X, długość Y oraz niezależne marginesy X/Y (każdy margines jest odejmowany z dwóch przeciwległych stron). Pole użyteczne ma wymiar `X - 2*marginX` × `Y - 2*marginY`. Do obliczeń wchodzi pełna średnica otworu (lub narzędzia), więc również jego krawędzie muszą mieścić się w polu użytecznym.

- W obu układach program dzieli wzór wyłącznie wzdłuż osi Y po przekroczeniu bezpiecznego pola (uwzględniając marginesy).
- Opcjonalne `Podziel co N wierszy` może wymusić krótsze etapy; puste pole nie narzuca dodatkowego ograniczenia.
- Jeśli szerokość przekracza bezpieczne X, program zgłasza błąd zamiast dzielić w poprzek materiału.
- Po wyłączeniu podziału limity X/Y nadal obowiązują: zbyt długiego wzoru nie można wyeksportować jako jednej niebezpiecznej operacji.
- Podgląd zaznacza granice kolejnych etapów przerywaną linią.

**Ustawienie G54:** wartości pola roboczego i marginesów określają rozmiar dostępnego miejsca, ale nie przesuwają automatycznie G54. Ustaw lokalne zero każdego etapu tak, aby krawędzie całej trajektorii narzędzia mieściły się wewnątrz marginesów, z uwzględnieniem promienia frezu i wybranego narożnika. Po przesunięciu materiału wzdłuż Y ponownie wyzeruj zgodnie z oznaczeniami. Przed uruchomieniem każdej partii wykonaj symulację i przejazd próbny nad detalem.
