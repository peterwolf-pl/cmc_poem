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
- Alternatywny tryb: wpisz zwykły tekst lub wiersz, a aplikacja zakoduje go jako UTF-8 (8 bitów na bajt), z wyborem od 1 do 31 bajtów na wiersz i automatycznym zawijaniem. Puste linie w tekście generują puste rzędy nawiertów.
- Klikanie w podglądzie przełącza `0/1` i aktualizuje kod.
- Układ poziomy lub pionowy. Pionowy obraca tekstową macierz o **90° zgodnie z ruchem wskazówek zegara**.
- Punkt `(0,0)` w jednym z czterech narożników siatki.
- Niezależne odstępy X i Y w milimetrach.
- Obliczanie liczby otworów i wymiarów pomiędzy skrajnymi środkami nawiertów.
- Głębokość poniżej Z0, posuw, poziom podejścia R, bezpieczne Z.
- Eksport dwóch wariantów: jawne ruchy `G0/G1` lub cykl wiercenia `G81` z `G98`.
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
