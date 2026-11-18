# Rozpoznania i przebieg leczenia w Karcie pacjenta

Zaakceptowany wariant B1 rozdziela zapisane rozpoznanie od epizodu leczenia.
Jeden pacjent może mieć kilka rozpoznań i kilka metod leczenia jednego problemu.
Kod ICD-10 jest opcjonalnym tekstem wpisanym przez lekarza. Aplikacja nie nadaje
go z BMI, nazwy leku, programu GH ani wcześniejszych notatek.

## Dane i własność

Każde rozpoznanie i każdy epizod jest niezależną zwykłą notatką pacjenta.
`note.id` jest identyfikatorem rekordu, a `note.patientId` określa właściciela.
Nowy opcjonalny `treatmentContext` znajduje się wyłącznie w zaszyfrowanym
`bodyCipher`; nie jest jawną kolumną, preferencją, danymi formularza pomiaru ani
nowym magazynem. Kategoria `treatment` pozwala odnaleźć wpis w istniejącej
historii. Pole `medication` **poza** kontekstem pozostaje puste: nowy zapis nie
tworzy zdarzenia start/change/stop dla dawnego monitora leków.

Kontekst rozpoznania, wersja 1:

```js
{
  schemaVersion: 1, kind: 'diagnosis',
  name: 'Fikcyjne rozpoznanie', code: '', codingSystem: 'ICD-10',
  status: 'active', // active | closed
  dateISO: '2026-11-03'
}
```

Kontekst epizodu, wersja 1:

```js
{
  schemaVersion: 1, kind: 'therapy', title: 'Fikcyjne postępowanie',
  method: 'other', // pharmacological | nonpharmacological | other
  status: 'active', // active | closed
  startDateISO: '', endDateISO: '', diagnosisIds: [],
  medication: '', dose: '', notes: '', nextDateISO: '',
  followups: [{ id: 'fikcyjna-kontrola', dateISO: '2026-11-03',
    kind: 'Kontrola', body: 'Fikcyjna dokumentacja kontroli.' }]
}
```

`diagnosisIds` zawiera identyfikatory notatek rozpoznań. Nie zawiera kopii nazwy,
kodu ani danych innego pacjenta. Nowe powiązanie musi wskazywać rozpoznanie
odczytane w tej karcie. Nieczytelne lub nieobecne dawne powiązanie pozostaje
zachowane; edycja nie usuwa go po cichu. Zakończenie epizodu zmienia tylko jego
notatkę, bez zmiany stanu rozpoznania.

`medication` i `dose` są zapisem lekarza, bez analizy dawki. Przy zmianie metody
nie kasujemy wcześniej zapisanych wartości. Ludzki opis pokazuje je dla
farmakoterapii. Data następnej kontroli jest dokumentacją epizodu; sam jej zapis
nie tworzy automatycznie przypomnienia ani planu opieki.

## API i zabezpieczenia zapisu

`VildaPatientTreatmentModel` udostępnia czyste `normalize`, `decode`, `project`
i `describe`. Wersja nieobsługiwana lub błędny kontekst daje `unsupported`,
a brak pola — `none`. Brak rozpoznania lub leczenia nie jest oceną kliniczną.

`VildaPatientTreatmentStore.createScope({ vault, patientId, isCurrent })`
przechwytuje bieżącą sesję sejfu i zwraca:

- `read()` → `{ patientId, diagnoses, episodes, unsupported }`;
- `createDiagnosis(values)` / `updateDiagnosis(dto, values)`;
- `createEpisode(values)` / `updateEpisode(dto, values)`;
- `addFollowup(dto, values)` / `updateFollowup(dto, id, values)`;
- `dispose()`.

DTO zawiera `id`, `patientId`, `rev`, `updatedAtISO`, odłączoną kopię `baseNote`
i `context`. Edycja używa istniejącego `updateExistingPatientNote` z przechwyconą
rewizją i widoczną wersją. Utworzenie używa `savePatientNoteOnce` z losowym ID.
Zmiana właściciela, blokada lub odtworzenie innej sesji kończy operację przed
kolejnym krokiem. Opcjonalny zaufany drugi argument `{ isCurrent }` tych dwóch
istniejących aktorów jest sprawdzany również w ich dotychczasowej kontroli
`beforeCommit`, po szyfrowaniu i przed przekazaniem wiersza adapterowi. Callback
nie jest częścią notatki i nie trafia do eksportu.

Odczyty i otwieranie zakładki niczego nie zapisują. Nieobsługiwany kontekst jest
tylko do odczytu również w dawnych ścieżkach edycji notatek. Natywne przeniesienie
całego pacjenta zachowuje taki nieprzezroczysty dokument pod tym samym ID;
import i synchronizacja przenoszą go bez interpretowania jego pól.

## Transport i zgodność

`Ft` odczytuje opcjonalne pole, `Ad` zachowuje je przy pominięciu przez starszego
wywołującego, a porównanie treści, CAS oraz deduplikator uwzględniają kontekst.
`Le` zachowuje pole całej zwycięskiej treści; starszy przychodzący zapis bez
rozszerzenia nie usuwa istniejącego kontekstu. Nie łączymy osobno pól dwóch
równoległych epizodów.

Eksport pacjenta, kopia konta i delty korzystają z istniejących ścieżek notatek.
Import pacjenta zachowuje ID notatek i zmienia wyłącznie zewnętrzny `patientId`
na docelowego pacjenta. Tak samo działa natywne scalenie kart, więc powiązania
między ich przeniesionymi rozpoznaniami i epizodami pozostają stabilne. Nowe
pole nie wymaga migracji istniejącego sejfu ani zmiany indeksów IndexedDB.

Dotychczasowe dane i obliczenia GH/IGF-1, otyłości, leków oraz plany opieki nie są
przepisywane do tego rejestru. Pozostają pod własnymi nazwami i w istniejących
modułach. Ta zmiana nie dodaje algorytmów medycznych, norm, progów, kodowania
automatycznego ani oceny skuteczności dowolnej terapii.

## Odtworzenie artefaktu

Czytelne źródła to `runtime/patient-treatment-v1/model.js`, `store.js` oraz
`vault-fragment.js`. Manifest przypina ich skróty i osiemnaście dokładnych
punktów włączenia. `tools/patient-treatment-vault-delta.mjs` sprawdza pełne
odwrócenie warstwy i odtworzenie jej bajtów; nie formatuje pozostałego sejfu.
Chroniony blok natywnego clinical workspace pozostaje bez zmian. Aktualną bazę
tego prywatnego składacza opisuje jego własny manifest granicy.
