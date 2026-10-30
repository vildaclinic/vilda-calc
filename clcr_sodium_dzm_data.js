/* Versioned sodium-excretion references. The engine receives the selected
 * population explicitly; laboratory intervals are not salt-intake targets. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrSodiumDzmReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  const SOURCE_ID = "LABCORP_003178_2026_10_30";
  const UNIT_CONSTANTS = freeze({ id: "SODIUM_CHEMICAL_UNITS_2026_10_30", version: 1, sodiumMgPerMmol: "22.98976928", sodiumChlorideGPerMmol: "0.05844", sourceId: "CIAAW_SODIUM" });
  const titles = { low: "Poniżej normy dla wieku", within: "W zakresie laboratoryjnym", high: "Powyżej normy dla wieku" };
  const interpretation = {
    low: "Małe wydalanie może wiązać się z małą podażą lub zatrzymywaniem sodu przez nerki. Sam wynik nie rozpoznaje hiponatremii.",
    within: "Zakres laboratoryjny nie jest celem spożycia soli.",
    high: "Duże wydalanie może wiązać się z podażą sodu, diuretykami lub utratą sodu przez nerki. Sam wynik nie rozpoznaje hipernatremii."
  };
  function profile(id, ageLower, ageUpper, sex, population, lower, upper, sourceAgeLabel) {
    return { id, kind: "interval", ageLower, ageUpper, ageLowerInclusive: true, ageUpperInclusive: false, sex, lower, upper, lowerInclusive: true, upperInclusive: true, unit: "mmol/24 h", label: "Norma dla wieku", population, text: lower + "–" + upper, sourceId: SOURCE_ID, sourceIds: [SOURCE_ID], sourceLabel: "Labcorp 003178 · " + population, sourceAgeLabel, method: "ISE / flame photometer; katalog laboratoryjny", sample: "Pełna zbiórka moczu 24 h", contextLabel: "Dobowe wydalanie sodu", titles: { ...titles }, copy: { ...interpretation }, explanation: "Źródłowa grupa wieku: " + sourceAgeLabel + ". Stosujemy jawne przedziały ukończonych lat bez interpolacji. Granice wyniku są włączone; zakres nie jest celem podaży sodu ani stężeniem sodu we krwi." };
  }
  const DEFAULT_POLICY = freeze({
    id: "SODIUM_DZM_LABCORP_003178_2026_10_30", version: 1, quantity: "sodium-excretion", minimumAge: 6,
    population: { label: "Labcorp 003178 · laboratoryjne zakresy wydalania sodu dla wieku i płci", limitations: "Katalog nie podaje liczebności populacji ani definicji percentyli. Nie ustala zakresu poniżej 6 lat ani dla chłopców w wieku 6–12 lat. Zakres laboratoryjny nie jest uniwersalnym celem spożycia soli." },
    agePolicy: "Konwencja ukończonych lat: [6,13), [13,18), [18,81), [81,∞). Źródłowe etykiety: 6 to 12 y, 13 to 17 y, 18 to 80 y, >80 y. Cały możliwy przedział wieku podanego w ukończonych latach musi mieścić się w grupie. Identyczne zakresy obu płci stosujemy także przy nieznanej płci.",
    profiles: [
      profile("LABCORP_NA_6_12_F", 6, 13, "F", "Dziewczynki · 6–12 lat", 33, 185, "6 to 12 y"),
      profile("LABCORP_NA_13_17", 13, 18, null, "13–17 lat · obie płcie", 30, 250, "13 to 17 y"),
      profile("LABCORP_NA_18_80_M", 18, 81, "M", "Mężczyźni · 18–80 lat", 58, 337, "18 to 80 y"),
      profile("LABCORP_NA_18_80_F", 18, 81, "F", "Kobiety · 18–80 lat", 39, 258, "18 to 80 y"),
      profile("LABCORP_NA_OVER_80", 81, null, null, "Powyżej 80 lat · obie płcie", 23, 207, ">80 y")
    ],
    referenceGroups: [
      { id: "young", label: "0–5 lat", maleProfile: null, femaleProfile: null },
      { id: "child", label: "6–12 lat", maleProfile: null, femaleProfile: "LABCORP_NA_6_12_F" },
      { id: "teen", label: "13–17 lat", maleProfile: "LABCORP_NA_13_17", femaleProfile: "LABCORP_NA_13_17" },
      { id: "adult", label: "18–80 lat", maleProfile: "LABCORP_NA_18_80_M", femaleProfile: "LABCORP_NA_18_80_F" },
      { id: "senior", label: "Powyżej 80 lat", maleProfile: "LABCORP_NA_OVER_80", femaleProfile: "LABCORP_NA_OVER_80" }
    ],
    sources: [
      { id: SOURCE_ID, label: "Labcorp 003178 · Sodium, 24-Hour Urine", url: "https://www.labcorp.com/tests/003178/sodium-24-hour-urine", locator: "Reference Range; 0–5 y not established; 6–12 y F33–185/Mnot established; 13–17 y 30–250; 18–80 y M58–337/F39–258; >80 y 23–207 mmol/24 h. Methodology: ISE/flame photometer.", accessed: "2026-10-30", revision: "Katalog nie wskazuje daty rewizji" },
      { id: "CIAAW_SODIUM", label: "CIAAW · Sodium", url: "https://ciaaw.org/sodium.htm", locator: "Standard atomic weight Na 22.98976928(2); zastosowano 22.98976928 mg Na/mmol. Przybliżony odpowiednik NaCl: 0.05844 g/mmol.", accessed: "2026-10-30" },
      { id: "WHO_SODIUM_2026", label: "WHO · Sodium reduction", url: "https://www.who.int/news-room/fact-sheets/detail/sodium-reduction", locator: "Zalecenia spożycia dla dorosłych: <2 g sodu / <5 g soli na dobę; nie zakres moczu.", accessed: "2026-10-30" },
      { id: "WHO_SODIUM_CHILDREN", label: "WHO · Sodium intake in children", url: "https://www.who.int/tools/elena/interventions/sodium-bp-children", locator: "Dzieci 2–15 lat: obniżenie dorosłego pułapu odpowiednio do zapotrzebowania energetycznego; nie stała norma natriurii.", accessed: "2026-10-30" },
      { id: "EAU_STONES_2026", label: "EAU · Metabolic evaluation and recurrence prevention", url: "https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention", locator: "Zalecenie podaży NaCl 4–5 g/d w ogólnej profilaktyce kamicy; nie zakres wydalania Na w DZM.", accessed: "2026-10-30" },
      { id: "EAU_PEDIATRIC_STONES_2026", label: "EAU · Paediatric urinary stone disease", url: "https://uroweb.org/guidelines/paediatric-urology/chapter/urinary-stone-disease", locator: "Ocena Na w moczu; podaż sodu wpływa na wydalanie wapnia; brak jednej normy natriurii dla wszystkich dzieci.", accessed: "2026-10-30" },
      { id: "EFSA_SODIUM_2019", label: "EFSA 2019 · Dietary reference values for sodium", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7009309/", doi: "10.2903/j.efsa.2019.5778", locator: "§2.6.1.1: ograniczenia pojedynczej zbiórki w ocenie zwyczajowej podaży sodu u pojedynczej osoby.", accessed: "2026-10-30" }
    ],
    notes: {
      noPolicyTitle: "Wynik bez porównania z normą", noPolicy: "Nie dobrano właściwego zakresu referencyjnego. Wynik pozostaje bez automatycznej oceny.",
      noAge: "Wiek pacjenta jest nieznany lub nie ma wystarczającej dokładności do doboru zakresu. Wynik liczbowy pozostaje dostępny.",
      belowAge: "W profilu Labcorp nie ustalono zakresu dla dzieci poniżej 6 lat.",
      noSex: "W tym wieku profil Labcorp wymaga znanej płci. Brak tej informacji nie blokuje wyniku liczbowego.",
      noChildMale: "W profilu Labcorp nie ustalono zakresu dla chłopców w wieku 6–12 lat.",
      noChildSex: "W wieku 6–12 lat profil Labcorp podaje zakres tylko dla dziewczynek; płeć jest nieznana.",
      noProfile: "Nie dobrano zakresu właściwego dla wieku, płci lub dokładności dostępnego wieku. Wynik pozostaje bez automatycznej oceny.",
      non24Title: "Oszacowanie na 24 h", non24: "Wynik przeliczono proporcjonalnie na dobę. Zbiórki o innym czasie nie porównujemy z normą pełnej DZM.",
      reportedNon24Title: "Gotowy wynik dobowy", reportedNon24: "Gotowy wynik dobowy przyjęto bez ponownego skalowania. Znany inny czas zbiórki ogranicza porównanie z pełną DZM.",
      reportedUnknown: "Podaną ilość dobową przyjęto bez ponownego skalowania. Czas zbiórki jest nieznany, więc nie dobieramy normy pełnej DZM.",
      zeroTitle: "Wynik 0 — sprawdź zapis laboratorium", zero: "Sprawdź, czy raport podaje dokładnie 0, czy wynik poniżej granicy oznaczalności. Zapis „<…” nie jest zerem.",
      precision: "Znak ≈ oznacza skrócony zapis liczby. Ocenę i zapis oparto na pełnej, niezaokrąglonej wartości.",
      saltEquivalent: "To przybliżony chemiczny odpowiednik wydalonego sodu, a nie pomiar spożycia soli ani chlorków w moczu.",
      sections: [
        { title: "Obliczenie i zbiórka", paragraphs: ["Stężenie sodu (mmol/L) × objętość (L) × 24 / czas (h) = mmol/24 h. Dla nowej zbiórki domyślnie wpisano 24 h; rzeczywisty czas można zmienić. Inny czas daje oszacowanie bez normy pełnej DZM.", "Gotowy wynik dobowy w mmol, mg Na lub g Na przyjmujemy bez ponownego skalowania. Nieznany czas historyczny nie staje się automatycznie 24 h. Znana niepełna lub błędna zbiórka blokuje obliczenie i zapis w obu trybach."] },
        { title: "Norma dla wieku i płci", paragraphs: ["Stosujemy jeden profil laboratoryjny Labcorp 003178. Zakresy nie są celem podaży sodu ani oceną natremii. Granice wyniku są włączone. Brak zakresu w tej tabeli oznacza lukę w tym profilu, a nie brak wszystkich opublikowanych norm.", "Wiek wykorzystujemy bez przedwczesnego zaokrąglenia: 6≤wiek<13, 13≤wiek<18, 18≤wiek<81, wiek≥81. W grupach 13–17 lat i powyżej 80 lat identyczny zakres obu płci pozwala na porównanie także przy nieznanej płci."] },
        { title: "Jednostki i dokładność", paragraphs: ["1 mmol Na = 22,98976928 mg Na. Dla sodu mEq/L i mmol/L są liczbowo równe. g Na oznacza masę sodu, nie soli NaCl.", "Porównujemy dokładne wartości przed zaokrągleniem. Mały dodatni wynik pozostaje dodatni. Dokładne 0 wymaga sprawdzenia zapisu laboratorium i granicy oznaczalności."] },
        { title: "Sól, dieta i kamica", paragraphs: ["Przybliżony odpowiednik NaCl obliczamy jako mmol Na × 0,05844 g. To przeliczenie chemiczne; pojedyncza zbiórka nie określa wiarygodnie zwyczajowego spożycia soli.", "WHO zaleca dorosłym spożycie <2 g sodu (<5 g soli) na dobę. Dla dzieci 2–15 lat pułap zależy od zapotrzebowania energetycznego. EAU w ogólnej profilaktyce kamicy wskazuje 4–5 g NaCl/d. Są to zalecenia spożycia, nie normy moczu; nie tworzą progu automatycznej oceny wyniku.", "Duża podaż sodu może zwiększać kalciurię. Sam wynik DZM nie rozpoznaje hipo- lub hipernatremii i nie uzasadnia automatycznego ograniczenia sodu u każdego dziecka lub pacjenta z utratą sodu."] }
      ]
    },
    educationalReferences: []
  });
  return Object.freeze({ DEFAULT_POLICY, UNIT_CONSTANTS, NA_MG_PER_MMOL: Number(UNIT_CONSTANTS.sodiumMgPerMmol), NACL_G_PER_MMOL: Number(UNIT_CONSTANTS.sodiumChlorideGPerMmol), getPolicy: () => DEFAULT_POLICY });
});
