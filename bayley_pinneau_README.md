# Bayley-Pinneau – digital extract (stage 1)

This package contains the first-stage digital extraction of the Bayley-Pinneau tables supplied as photographs.

## What is stored as canonical data

The clinically essential values from the printed tables are the rows labeled **% of Mature Height**. Each printed body cell is then derived as:

`predicted mature height = current height / (percent mature height / 100)`

rounded to the nearest 0.1 unit with half-up rounding.

Because the percentage factor is unitless, the same factors can be used directly with centimeters inside the app. That means the app does **not** need to store or look up the printed inch-by-inch table cells to calculate final height.

## Files

- `bayley_pinneau_data.js` — app-ready dataset exposed as `window.bayleyPinneauData`
- `bayley_pinneau_tables.json` — the same canonical data in JSON form
- `bayley_pinneau_dense_lookup.json` — dense lookup matrices generated from the factor rows across the printed current-height ranges
- `bayley_pinneau_validation.json` — spot checks against values visibly readable in the supplied photos

## Suggested next implementation step

In the next stage the module can:

1. choose the correct group (`average`, `accelerated`, `retarded`) from the relation between chronological age and bone age,
2. match the nearest supported Bayley-Pinneau skeletal-age node,
3. calculate predicted adult height directly in **cm** from the factor row,
4. optionally display the original table-equivalent lookup value in inches for audit/debugging.


## Model błędu Bayley-Pinneau

Do danych dodano zdigitalizowane tabele błędu Bayley-Pinneau:
- **Table IV** – girls (`IMG_0721.jpeg`)
- **Table V** – boys (`IMG_0722.jpeg`)

W danych zapisano osobno:
- próbę standaryzacyjną,
- próbę walidacyjną.

Aplikacja używa domyślnie **próby walidacyjnej (Berkeley Growth Study)**.

Strategia aplikacji:
- punktowa prognoza BP jest korygowana o średni błąd z tabel,
- przybliżony 90% przedział błędu liczony jest jako `± 1.645 × SD`,
- błąd jest pokazywany tylko od wieku metrykalnego **8-0** wzwyż,
- gdy w próbie walidacyjnej brakuje dokładnego wiersza wieku (np. **8-6**), wartości są interpolowane liniowo między sąsiednimi dostępnymi wierszami,
- tabele błędu nie są rozdzielone na grupy `accelerated / average / retarded`, więc błąd należy traktować jako przybliżony.

Plik pomocniczy z walidacją liczb:
- `bayley_pinneau_error_validation.json`
