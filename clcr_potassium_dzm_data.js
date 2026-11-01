/* Potassium DZM: one explicitly selected laboratory reference policy.
 * These are daily urine amounts, not serum concentrations or diagnostic limits. */
(function (root, factory) {
  const api = factory();
  if (root) root.ClcrPotassiumDzmReferenceData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  const SOURCE_ID = "LABCORP_003186_2026_10_30";
  const titles = { low: "Poniżej normy dla wieku", within: "W zakresie laboratoryjnym", high: "Powyżej normy dla wieku" };
  const interpretation = {
    low: "Może wiązać się z małą podażą lub oszczędzaniem potasu przez nerki; sprawdź też kompletność zbiórki. Sam wynik nie rozpoznaje hipokaliemii.",
    within: "Wynik w tym zakresie nie wyklucza nadmiernej utraty potasu przez nerki przy hipokaliemii.",
    high: "Może wiązać się z większą podażą, suplementacją lub utratą potasu przez nerki. Sam wynik nie rozpoznaje hiperkaliemii."
  };
  function profile(id, ageLower, ageUpper, sex, population, lower, upper, sourceAgeLabel) {
    return { id, kind: "interval", ageLower, ageUpper, ageLowerInclusive: true, ageUpperInclusive: false, sex, lower, upper, lowerInclusive: true, upperInclusive: true, unit: "mmol/24 h", label: "Norma dla wieku", population, text: lower + "–" + upper, sourceId: SOURCE_ID, sourceIds: [SOURCE_ID], sourceLabel: "Labcorp 003186 · " + population, sourceAgeLabel, method: "ISE / fotometr płomieniowy; katalog laboratoryjny", sample: "Pełna zbiórka moczu 24 h", contextLabel: "Dobowe wydalanie potasu", titles: { ...titles }, copy: { ...interpretation }, explanation: "Źródłowa grupa wieku: " + sourceAgeLabel + ". Jawna konwencja aplikacji: ukończone lata bez interpolacji; oba końce zakresu wyniku są włączone. To orientacyjne porównanie z wybranym źródłem, a nie potwierdzenie zakresu laboratorium pacjenta ani ocena stężenia potasu we krwi." };
  }
  const DEFAULT_POLICY = freeze({
    id: "POTASSIUM_DZM_LABCORP_003186_2026_10_30", version: 1, quantity: "potassium-excretion", minimumAge: 6,
    population: { label: "Labcorp 003186 · laboratoryjne zakresy wydalania potasu dla wieku i płci", limitations: "Katalog nie podaje liczebności populacji, warunków diety ani definicji percentyli. Nie ustala zakresu poniżej 6 lat. Zakres dotyczy pełnej zbiórki moczu 24 h; nie jest uniwersalną normą ani zakresem laboratorium pacjenta." },
    agePolicy: "Jawna konwencja aplikacji dla ukończonych lat: [6,18), [18,81), [81,∞). Źródłowe etykiety: 6 to 17 y, 18 to 80 y, >80 y. Labcorp nie definiuje precyzji wieku. Cały możliwy przedział wieku podanego w ukończonych latach musi mieścić się w grupie. Bez interpolacji; znana płeć jest wymagana we wszystkich grupach.",
    profiles: [
      profile("LABCORP_K_6_17_M", 6, 18, "M", "Chłopcy · 6–17 lat", 11, 88, "6 to 17 y"),
      profile("LABCORP_K_6_17_F", 6, 18, "F", "Dziewczęta · 6–17 lat", 10, 70, "6 to 17 y"),
      profile("LABCORP_K_18_80_M", 18, 81, "M", "Mężczyźni · 18–80 lat", 20, 116, "18 to 80 y"),
      profile("LABCORP_K_18_80_F", 18, 81, "F", "Kobiety · 18–80 lat", 14, 95, "18 to 80 y"),
      profile("LABCORP_K_OVER_80_M", 81, null, "M", "Mężczyźni · powyżej 80 lat", 16, 83, ">80 y"),
      profile("LABCORP_K_OVER_80_F", 81, null, "F", "Kobiety · powyżej 80 lat", 6, 67, ">80 y")
    ],
    referenceGroups: [
      { id: "young", label: "0–5 lat", maleProfile: null, femaleProfile: null },
      { id: "child", label: "6–17 lat", maleProfile: "LABCORP_K_6_17_M", femaleProfile: "LABCORP_K_6_17_F" },
      { id: "adult", label: "18–80 lat", maleProfile: "LABCORP_K_18_80_M", femaleProfile: "LABCORP_K_18_80_F" },
      { id: "senior", label: "Powyżej 80 lat", maleProfile: "LABCORP_K_OVER_80_M", femaleProfile: "LABCORP_K_OVER_80_F" }
    ],
    sources: [
      { id: SOURCE_ID, label: "Labcorp 003186 · Potassium, 24-Hour Urine", url: "https://www.labcorp.com/tests/003186/potassium-24-hour-urine?letter=M", locator: "Reference Range; 0–5 y not established; 6–17 y M11–88/F10–70; 18–80 y M20–116/F14–95; >80 y M16–83/F6–67 mmol/24 h. Methodology: ISE/flame photometer. Specimen Requirements: complete 24-hour urine collection; daily volume required.", accessed: "2026-10-30", revision: "Katalog nie wskazuje daty rewizji zakresu" },
      { id: "LABCORP_PEDIATRIC_2022", label: "Labcorp · Pediatric Testing Reference Ranges (2022)", url: "https://www.labcorp.com/content/dam/labcorp/drupal/178250_DX_TL_PediatricTestRef_Final.pdf", locator: "Drukowana s. 42, test 003186 / wynik 013276. DX_QRG_178259–0922, ©2022. Potwierdza 0–5, 6–17 i 18–80 lat; nie zawiera wiersza >80 z aktualnego katalogu.", accessed: "2026-10-30" },
      { id: "MAYO_KUR_2026_CONTEXT", label: "Mayo Clinic Laboratories · KUR (kontekst interpretacji)", url: "https://www.mayocliniclabs.com/test-catalog/overview/614060", locator: "Pełny katalog i PDF wygenerowany 30.10.2026, s. 3 Interpretation: ocena odpowiedzi nerek w hipokaliemii jest odrębnym zagadnieniem. Progów diagnostycznych i zakresu Mayo nie stosujemy do automatycznej oceny Labcorp.", accessed: "2026-10-30" }
    ],
    notes: {
      noPolicyTitle: "Wynik bez porównania z normą", noPolicy: "Nie dobrano właściwego zakresu referencyjnego. Wynik pozostaje bez automatycznej oceny.",
      noAge: "Wiek pacjenta jest nieznany lub nie ma wystarczającej dokładności do doboru zakresu. Wynik liczbowy pozostaje dostępny.",
      belowAge: "W profilu Labcorp nie ustalono zakresu dla dzieci poniżej 6 lat. Wybrany zakres dobowy nie obejmuje tego wieku.",
      noSex: "Profil Labcorp wymaga znanej płci. Brak tej informacji nie blokuje wyniku liczbowego.",
      noProfile: "Nie dobrano zakresu właściwego dla wieku, płci lub dokładności dostępnego wieku. Wynik pozostaje bez automatycznej oceny.",
      non24Title: "Oszacowanie na 24 h", non24: "Wynik przeliczono proporcjonalnie na dobę. Zbiórki o innym czasie nie porównujemy z normą pełnej DZM.",
      reportedNon24Title: "Gotowy wynik dobowy", reportedNon24: "Gotowy wynik dobowy przyjęto bez ponownego skalowania. Znany inny czas zbiórki ogranicza porównanie z pełną DZM.",
      reportedUnknown: "Podaną ilość dobową przyjęto bez ponownego skalowania. Czas zbiórki jest nieznany, więc nie dobieramy normy pełnej DZM.",
      zeroTitle: "Wynik 0 — sprawdź zapis laboratorium", zero: "Sprawdź, czy raport podaje dokładnie 0, czy wynik poniżej granicy oznaczalności. Zapis „<…” nie jest zerem.",
      precision: "Znak ≈ oznacza skrócony zapis liczby. Ocenę i zapis oparto na pełnej, niezaokrąglonej wartości.",
      formula: "Stężenie potasu (mmol/L) × objętość zbiórki (L) × 24 / czas (h) = mmol/24 h.",
      conversion: "Dla jednowartościowego potasu mEq/L i mmol/L oraz mEq/24 h i mmol/24 h są liczbowo równe. Objętość podaj w mL lub L.",
      limitations: "Wydalanie zależy od podaży potasu, leczenia i kompletności zbiórki. Wydalanie mieszczące się w zakresie laboratoryjnym nie potwierdza prawidłowego stężenia potasu we krwi. Przy hipokaliemii potrzebna jest ocena, czy nerki odpowiednio ograniczają utratę potasu.",
      sections: [
        { title: "Obliczenie i zbiórka", paragraphs: ["Stężenie potasu (mmol/L) × objętość (L) × 24 / czas (h) = mmol/24 h. Nowa zbiórka zaczyna z jawnym domyślnym czasem 24 h; rzeczywisty czas można zmienić. Inny dodatni czas daje oszacowanie bez normy pełnej DZM.", "Gotowy wynik dobowy w mmol/24 h przyjmujemy bez ponownego skalowania. Nieznany czas historyczny nie staje się automatycznie 24 h. Znana niepełna lub błędna zbiórka blokuje obliczenie i zapis w obu trybach."] },
        { title: "Norma dla wieku i płci", paragraphs: ["Orientacyjnie porównujemy z jednym profilem Labcorp 003186, a nie z potwierdzonym zakresem laboratorium pacjenta. Nie uzupełniamy luk zakresami innych laboratoriów. Oba końce przedziału wyniku są włączone zgodnie z jawną konwencją aplikacji.", "Źródłowe grupy 6–17, 18–80 i >80 lat mapujemy według ukończonych lat: 6≤wiek<18, 18≤wiek<81, wiek≥81. Jest to konwencja aplikacji, nie definicja precyzji wieku podana przez Labcorp. Brak wieku lub płci oraz wiek poniżej 6 lat pozostawiają wynik bez porównania."] },
        { title: "Jednostki i dokładność", paragraphs: ["Dla jednowartościowego potasu mEq i mmol są liczbowo równe. Stężenie mmol/L i dobowa ilość mmol/24 h to różne wielkości; nie porównujemy samego stężenia z zakresem dobowym.", "Porównujemy dokładne wartości przed zaokrągleniem. Mały dodatni wynik pozostaje dodatni. Dokładne 0 wymaga sprawdzenia zapisu laboratorium i granicy oznaczalności. Zapis „<…” nie jest dokładnym zerem."] },
        { title: "Kontekst kliniczny", paragraphs: ["Wydalanie zależy od podaży potasu, leczenia i kompletności zbiórki. Zakres laboratoryjny nie jest celem spożycia ani suplementacji.", "Wydalanie mieszczące się w zakresie laboratoryjnym nie potwierdza prawidłowego stężenia potasu we krwi. Przy hipokaliemii potrzebna jest ocena, czy nerki odpowiednio ograniczają utratę potasu. Sam wynik nie rozpoznaje utraty nerkowej ani hipo- lub hiperkaliemii."] }
      ]
    },
    educationalReferences: []
  });
  return Object.freeze({ DEFAULT_POLICY, getPolicy: () => DEFAULT_POLICY });
});
