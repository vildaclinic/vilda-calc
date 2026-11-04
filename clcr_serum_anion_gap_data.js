(function (root, factory) {
  const api = factory();
  if (root) root.VildaClcrSerumAnionGapData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function freeze(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  const MAYO_ELPSR_AGS_2026_11 = freeze({
    id: "MAYO_ELPSR_AGS_2026_11", version: 1, formulaId: "AGs", quantity: "serum-anion-gap", nativeUnit: "mmol/L", referenceKind: "interval",
    label: "Luka anionowa surowicy — AG bez potasu",
    population: "Dzieci od ukończenia 7 lat i dorośli; obie płcie.",
    source: { id: "MAYO_ELPSR", label: "Mayo Clinic Laboratories · ELPSR", url: "https://pediatric.testcatalog.org/show/ELPSR", version: "2026-11-04", accessedAt: "2026-11-04" },
    reference: { minimumAgeYears: 7, minimum: 7, maximum: 15, lowerInclusive: true, upperInclusive: true, unit: "mmol/L", sourceId: "MAYO_ELPSR", specimen: "serum", method: "Na i Cl: pośrednia potencjometria; HCO₃: fotometria." },
    correction: { targetAlbuminGl: 40, coefficientGl: "0.25", sourceId: "SRLF_SFMU_2019", referenceAvailable: false, automaticClassification: false },
    sources: [
      { id: "MAYO_ELPSR", label: "Mayo Clinic Laboratories · ELPSR", url: "https://pediatric.testcatalog.org/show/ELPSR", accessedAt: "2026-11-04", fullDocumentRead: true,
        role: "reference-interval", section: "Reference Values → ANION GAP; Method Description → Anion Gap", population: "Wiek ≥7 lat, obie płcie; dla wieku <7 lat zakres nieustalony w tym katalogu.",
        specimen: "Surowica", method: "Na i Cl: pośrednia potencjometria Roche; HCO₃: fotometria.", limitation: "Zakres dotyczy AG bez potasu i bez korekcji albuminowej. Metoda źródła nie jest potwierdzeniem metody badania pacjenta. Katalog cytuje instrukcje producenta; nie odczytano ich osobno." },
      { id: "SRLF_SFMU_2019", label: "SRLF/SFMU 2019 · AG i albumina", url: "https://link.springer.com/article/10.1186/s13613-019-0563-2", doi: "10.1186/s13613-019-0563-2", accessedAt: "2026-11-04", fullDocumentRead: true,
        role: "albumin-correction", section: "R1.3–R1.4, s. 5–6/17", citation: "Jung B et al. Diagnosis and management of metabolic acidosis: guidelines from a French expert panel. Ann Intensive Care. 2019;9:92.",
        population: "Diagnostyka kwasicy metabolicznej w medycynie ratunkowej i intensywnej terapii.", limitation: "Przyjęto konwencję korekty do 40 g/L. Nie jest to osobno zwalidowana norma pediatryczna; cAG nie otrzymuje odrębnej automatycznej klasyfikacji." },
      { id: "KRAUT_NAGAMI_2013", label: "Kraut i Nagami, 2013 · ograniczenia AG", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3817910/", doi: "10.2215/CJN.04040413", accessedAt: "2026-11-04", fullDocumentRead: true,
        role: "interpretation", section: "Definition and Characterization; Recognition of an Increase; tabele 1–3", limitation: "Przegląd. Zakres zależy od metody; prawidłowe AG ani cAG nie wyklucza wzrostu mleczanu ani wszystkich zaburzeń kwasowo-zasadowych." },
      { id: "HABER_2023", label: "Haber i wsp., 2023 · mała luka anionowa", url: "https://www.ccjm.org/content/90/10/619", doi: "10.3949/ccjm.90a.23035", accessedAt: "2026-11-04", fullDocumentRead: true,
        fullTextUrl: "https://escholarship.org/uc/item/6qp590tq", role: "interpretation", section: "s. 619–621; Causes of a low anion gap", limitation: "Przeczytano pełny autorski PDF. Nie przyjęto podanej w przeglądzie normy jako uniwersalnej dla wszystkich analizatorów." },
    ],
    restrictions: { numericalResultRequiresAge: false, numericalResultRequiresSex: false, referenceRequiresAge: true, assumesAdultWhenAgeUnknown: false,
      potassiumIncluded: false, sameBloodDrawAssumed: true, stableKidneyFunctionRequired: false, diagnosesAcidosis: false, correctionHasIndependentReference: false, correctionIsSeparateMeasurement: false },
    notes: {
      referenceLabel: "Norma dla wieku", referenceHint: "Przyjęty zakres; norma na wydruku może się różnić.",
      normal: "AG mieści się w przyjętej normie.",
      low: "Mała luka może wynikać m.in. z niskiej albuminy lub błędu oznaczenia; warto potwierdzić wynik.",
      high: "Zwiększona luka może wskazywać na obecność dodatkowych anionów, np. mleczanów lub ciał ketonowych.",
      unknownAge: "Brak danych o wieku pacjenta; wynik liczbowy jest dostępny.",
      underAge: "W przyjętym źródle nie ustalono normy AG dla dzieci poniżej 7 lat.",
      noProfile: "Nie dobrano zweryfikowanego zakresu porównania; wynik liczbowy jest dostępny.",
      albuminLower: "Niższa albumina może jednak zaniżać lukę.", correction: "Norma powyżej dotyczy AG bez korekcji.",
      correctionUnassessed: "Przeliczenie do albuminy 40 g/L, bez automatycznej oceny.",
      formula: "AG = Na⁺ − (Cl⁻ + HCO₃⁻)", sample: "Trzy stężenia z tego samego pobrania krwi; obliczenie bez potasu.",
      bicarbonate: "Preferowane tCO₂ z tego samego panelu biochemicznego. Przy gazometrii: aktualne HCO₃⁻, nie standardowe; porównywalność metod ma ograniczenia.",
      limitation: "Samo AG nie rozpoznaje kwasicy ani jej przyczyny. AG w przyjętej normie nie wyklucza wszystkich zaburzeń kwasowo-zasadowych ani zwiększonego stężenia mleczanu.",
      albumin: "40 g/L jest poziomem przyjętym do przeliczenia, a nie dolną granicą normy albuminy. Korekta może zwiększyć lub zmniejszyć AG.",
      precision: "Znak ≈ oznacza skrócenie prezentacji; zapis zachowuje dokładną wartość i znak wyniku.",
    },
  });
  return Object.freeze({ getProfile: id => id === MAYO_ELPSR_AGS_2026_11.id ? MAYO_ELPSR_AGS_2026_11 : null, listProfiles: () => Object.freeze([MAYO_ELPSR_AGS_2026_11]) });
});
