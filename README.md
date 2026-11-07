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
- Klikanie w podglądzie przełącza `0/1` i aktualizuje kod.
- Układ poziomy lub pionowy. Pionowy obraca tekstową macierz o **90° zgodnie z ruchem wskazówek zegara**.
- Punkt `(0,0)` w jednym z czterech narożników siatki.
- Niezależne odstępy X i Y w milimetrach.
- Obliczanie liczby otworów i wymiarów pomiędzy skrajnymi środkami nawiertów.
- Głębokość poniżej Z0, posuw, poziom podejścia R, bezpieczne Z.
- Eksport dwóch wariantów: jawne ruchy `G0/G1` lub cykl wiercenia `G81` z `G98`.
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

## Nowe w 1.2: dzielenie wydruku na niezależne etapy

1. Wybierz **Pionowy** w polu „Układ wzoru”.
2. Zaznacz **Podziel długi wzór na niezależne etapy**.
3. Wprowadź **Maks. obszar X** i **Maks. obszar Y** w milimetrach. Program uwzględnia **całą średnicę wierconego otworu**, nie tylko siatkę jego środków.
4. Opcjonalnie wpisz **Podziel co N linii siatki** (np. `8`). Generator rozpocznie nowy etap po maksymalnie ośmiu wierszach siatki **już obróconej w orientację pionową**. Linie liczone są od góry. Puste pole pozostawia automatyczny podział tylko według wielkości obszaru. Jeśli maksymalna wysokość Y mieści mniej niż N wierszy, generator podzieli wcześniej, nigdy nie przekraczając limitu obszaru.
5. Kliknij **Generuj G-code**. Program podzieli siatkę na prostokątne pola robocze, oznaczy je ramkami na podglądzie i pokaże liczbę nawiertów w każdej części.
6. Wybierz pojedynczy etap i pobierz odpowiadający mu plik `.tap`, albo kliknij **Pobierz wszystkie etapy ZIP**. Archiwum zawiera niezależne pliki oraz `INSTRUKCJA-ETAPY.txt` z wymiarami, numerami wierszy/kolumn i odniesieniami położenia każdego etapu do punktu zerowego całego wzoru.

**Ważne:** każdy etap zakłada **ponowne ustawienie punktu G54 X0/Y0** w wybranym narożniku *lokalnej* siatki po przestawieniu materiału. Aplikacja nie przesuwa fizycznie osi ani materiału i nie wykonuje automatycznego bazowania. Etapy bez żadnych `1` są zachowane na mapie, ale nie powstaje dla nich plik G-code. Jeżeli obszar jest zbyt mały na średnicę narzędzia, generowanie jest blokowane. Jeśli pełny wzór przekroczy dopuszczalny limit 500 etapów, trzeba zwiększyć obszar roboczy.

**Fizyczne przesuwanie materiału** wymaga własnych znaczników pozycjonujących, ograniczników lub innego powtarzalnego układu referencyjnego. Współrzędne offsetów w plikach `.tap` i instrukcji są opisem położenia w oryginalnym wzorze, **nie poleceniem przesunięcia osi CNC**. Przy wybraniu prawego lub górnego narożnika niektóre lokalne X/Y są ujemne.

## Nowe w 1.2: zagłębianie spiralne (helisa)

Wybierz **G3 · zagłębianie spiralne** i ustaw:

- **Średnica frezu / wiertła**: rzeczywista średnica frezu czołowego.
- **Średnica wykonywanego otworu**: średnica gotowego wyfrezowania.
- **Zejście Z na pełen obrót**: parametr helisy (mm/obrót).
- **Głębokość** i **Posuw** z głównego formularza.

Program ustawia `G91.1` (inkrementalne I/J), `G17`, `G90` i generuje dwa półokręgi `G3` na obrót, ze stopniowo malejącym Z, do zadanej głębokości. Potem wykonuje dodatkowy płaski okrąg do wykończenia ściany, cofa się do `safeZ` i przechodzi do następnego otworu.

- Dopuszczalna średnica otworu: minimum **średnica frezu + 0,1 mm** i maksimum **2 × średnica frezu**. To świadomy limit: jedna toroidalna helisa nie oczyści środka większego otworu.
- Wymagany **frez czołowy do zagłębiania**, poprawnie dobrane parametry technologiczne i **pracujące wrzeciono**. Opcja automatycznego `M3` jest domyślnie wyłączona, zatem operator musi uruchomić wrzeciono zgodnie z procedurą maszyny.
- Używaj tylko po sprawdzeniu pełnej trajektorii `G3` w **symulatorze odpowiedniej konfiguracji Mach3Mill**, z uwzględnieniem wersji sterownika, położenia materiału, podjazdów i zacisków.
- To nie jest procedura wiercenia wiertłem spiralnym: interpolacja helikalna wymaga frezu do obróbki bocznej.

### Dodatkowe pliki

- `src/zip.mjs`: eksport plików etapów do ZIP bez zależności zewnętrznych.
- `tests/stages-and-helix.test.mjs`: testy podziału, globalnych offsetów, G3 i struktury archiwum.

## Nowe w 1.3: podział po liczbie linii

W trybie pionowym, przy zaznaczonym podziale na etapy, pole **Podziel co N linii siatki** ustala maksymalną liczbę kolejnych wierszy na jeden etap. Działa niezależnie od maksymalnych wymiarów, które pozostają bezwzględnym ograniczeniem rozmiaru. Przykład: 22 widoczne wiersze i `N=8` dają od góry 8+8+6 wierszy (o ile obszar Y pozwala), każdy fragment jako osobny plik `.tap`. Dla większej liczby kolumn może pojawić się dodatkowy podział w X. W instrukcji ZIP znajdziesz podaną wartość N, rzeczywistą liczbę wierszy na etap i offsety. Nie przesuwaj materiału bez sprawdzenia fizycznego pozycjonowania.
