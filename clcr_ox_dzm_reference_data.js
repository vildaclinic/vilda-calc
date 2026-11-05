/* Publication references for 24-hour urinary oxalate. No spot Ox/Cr ranges. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrOxDzmReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  const SOURCES = [
    { id: "ERKNET_OXALEUROPE_2023", label: "ERKNet / OxalEurope, 2023", title: "Clinical practice recommendations for primary hyperoxaluria: an expert consensus statement from ERKNet and OxalEurope", doi: "10.1038/s41581-022-00661-1", url: "https://www.nature.com/articles/s41581-022-00661-1", supplementUrl: "https://static-content.springer.com/esm/art%3A10.1038%2Fs41581-022-00661-1/MediaObjects/41581_2022_661_MOESM1_ESM.pdf", location: "Urine oxalate; Supplementary Table 2, s. 18", version: "2023", accessed: "2026-11-04", population: "Wszystkie grupy wieku; u dzieci korekta do 1,73 m² powierzchni ciała.", sample: "Pełna 24-godzinna zbiórka moczu", method: "Konsensus; oznaczenia szczawianów w moczu, m.in. oksydaza szczawianowa, LC-MS i GC-MS.", limitations: "Próg referencyjny nie rozpoznaje przyczyny hiperoksalurii. W niewydolności nerek wydalanie z moczem może nie odzwierciedlać obciążenia szczawianami." },
    { id: "EAU_UROLITHIASIS_2026", label: "EAU Urolithiasis, 2026", title: "EAU Guidelines on Urolithiasis", url: "https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention", location: "4.4.2, s. 53", version: "2026", accessed: "2026-11-04", population: "Dorośli oceniani w kontekście kamicy", sample: "Dobowa zbiórka moczu", method: "Wytyczne kliniczne", limitations: "Dodatkowy kontekst kamicowy; nie zastępuje przyjętej normy ERKNet / OxalEurope." },
    { id: "CHEBI_OXALATE", label: "ChEBI — oxalate", url: "https://www.ebi.ac.uk/chebi/CHEBI:30623", location: "Molecular formula / average mass", accessed: "2026-11-04", limitations: "Aplikacja zachowuje dotychczasową aproksymację 88,019 mg/mmol; bieżący ChEBI podaje 88,018." },
    { id: "NIST_OXALIC_ACID", label: "NIST — oxalic acid", url: "https://webbook.nist.gov/cgi/cbook.cgi?ID=C144627", location: "Molecular weight", accessed: "2026-11-04", limitations: "Dotyczy kwasu szczawiowego bezwodnego, nie soli ani hydratu." }
  ];
  const DEFAULT_POLICY = {
    id: "erknet-oxaleurope-2023-oxalate-dzm-v1", version: 1, schema: "clcr-ox-dzm-reference-policy",
    label: "ERKNet / OxalEurope, 2023", upperMmolPerDay: 0.46, upperInclusive: false,
    bodySurfaceIndex: 1.73, adultAgeYears: 18, bsaMethod: "Mosteller",
    adultAgeNote: "18 lat to granica dorosłości przyjęta w aplikacji; konsensus używa określenia children.",
    population: { label: "Wszystkie grupy wieku; u dzieci korekta powierzchni ciała", ageLower: 0, ageUpper: null, sex: null, childCorrection: "BSA / 1,73", adultCap: null },
    masses: { oxalate_ion: "88.019", oxalic_acid: "90.0349" },
    stone: { sourceId: "EAU_UROLITHIASIS_2026", adultIncreasedAboveMmol: 0.40, adultMarkedAboveMmol: 1 },
    phSuspicionAboveIndexedMmol: 1, lowEgfrBelow: 30, sourceId: "ERKNET_OXALEUROPE_2023", sources: SOURCES,
    notes: {
      assumption: "Porównanie z normą dotyczy kompletnej zbiórki 24-godzinnej.",
      noPolicy: "Nie dobrano właściwego zakresu referencyjnego. Wynik pozostaje bez automatycznej oceny.",
      noAge: "Brak wieku do doboru normy. U dzieci porównanie wymaga powierzchni ciała.",
      noBsa: "Wynik dobowy jest obliczony. Do porównania z normą dziecka potrzebne są masa i wzrost z danych pacjenta.",
      unknownEntity: "Ilość na dobę jest obliczona. Do porównania z normą potrzebna jest postać masowa podana przez laboratorium.",
      non24: "To przeliczenie krótszej lub dłuższej zbiórki na 24 godziny. Nie nadajemy mu automatycznej oceny.",
      reportedNon24: "Wpisany wynik dobowy pokazujemy bez ponownego przeliczenia. Podano jednak inny czas zbiórki niż 24 godziny, dlatego nie nadajemy automatycznej oceny.",
      reportedUnknownDuration: "Wpisany wynik dobowy jest dostępny. Nieznany lub nieprawidłowy czas pierwotnej zbiórki nie pozwala porównać go z normą.",
      incomplete: "Wynik obliczono z zebranej części moczu. Nie odzwierciedla całego wydalania dobowego.",
      within: "Wydalanie jest poniżej przyjętej górnej granicy.",
      boundary: "Wynik jest równy granicy. Przyjęta norma obejmuje wartości ściśle poniżej tej granicy.",
      high: "Zwiększone wydalanie szczawianów sprzyja tworzeniu kamieni szczawianowo-wapniowych.",
      marked: "Tak duże wydalanie wymaga potwierdzenia i oceny przyczyny, w tym hiperoksalurii pierwotnej oraz przyczyn jelitowych.",
      lowEgfr: "Przy eGFR <30 mL/min/1,73 m² wydalanie z moczem może być zaniżone. Wynik poniżej górnej granicy nie wyklucza hiperoksalurii pierwotnej.",
      lowEgfrTitle: "Ocena ograniczona",
      lowEgfrExplanation: "Istotnie obniżona czynność nerek ogranicza ocenę wydalania. W diagnostyce hiperoksalurii pierwotnej uwzględnia się szczawiany w osoczu.",
      clinicalDetails: "Podwyższenie należy potwierdzić w co najmniej dwóch, a najlepiej trzech zbiórkach. Przyczyną może być dieta, zwiększone wchłanianie jelitowe lub rzadsze zaburzenia metaboliczne. Pojedynczy wynik nie rozpoznaje hiperoksalurii pierwotnej.",
      collectionDetails: "Zbiórkę i przechowywanie wykonaj zgodnie z instrukcją laboratorium. Przeliczenie czasu nie uzupełnia pominiętej porcji moczu.",
      zeroDetails: "Dokładna wartość 0 jest liczona jako zero. Zapis poniżej granicy oznaczalności, np. <5, nie oznacza dokładnego zera."
    }
  };
  return freeze({ DEFAULT_POLICY, SOURCES });
});
