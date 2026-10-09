/*
 * Wersjonowane dane referencyjne LH/FSH i kryteria czasu dojrzewania.
 * Ten moduł nie uruchamia interpretacji, nie montuje UI i nie zapisuje danych.
 * Normy zależą od materiału, metody i populacji; nie są uniwersalnymi progami
 * diagnostycznymi. Katalog Mayo nie jest źródłem klinicznej definicji opóźnienia.
 */
(function (root, factory) {
  'use strict';
  var data = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = data;
  } else if (root) {
    root.VildaLabPubertyData = data;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
      Object.freeze(value);
    }
    return value;
  }

  // Operatory granic opisują przynależność do przedziału, nie wynik diagnozy.
  // lower:null nie oznacza zera. censoredLower zachowuje zapis <LOD / <0.02.
  function range(lower, upper, sourceText, censoredLower) {
    return {
      lower: lower,
      upper: upper,
      censoredLower: censoredLower || null,
      sourceText: sourceText
    };
  }

  function bound(operator, value) {
    return { operator: operator, value: value };
  }

  function age(lower, upper, sourceText, interpretation) {
    return {
      axis: 'chronologicalYears',
      lower: lower,
      upper: upper,
      sourceText: sourceText,
      interpretation: interpretation || 'literal-age-operators'
    };
  }

  function ageRow(id, sex, ageBounds, referenceRange) {
    return { id: id, sex: sex, age: ageBounds, stage: null, range: referenceRange };
  }

  function stageRow(id, sex, axis, stage, referenceRange, ageBounds) {
    return {
      id: id,
      sex: sex,
      age: ageBounds || null,
      stage: { kind: axis, value: stage, sourceText: 'Tanner stage ' + stage },
      range: referenceRange
    };
  }

  var lhStageIAge = age(bound('>=', 1), bound('<', 9), 'Stage I (1–8 years)', 'attained-year-band');
  var lhCensoredLower = bound('<', 0.02);
  // Operacyjne granice zatwierdzone przez właściciela 9.10.2026 na podstawie
  // protokołu Greaves 2015; nie są empirycznymi skrajami podgrupy LH/FSH.
  var pretermPolicy = {
    id: 'greaves-preterm-applicability', version: '2026-10-09.3',
    sourceIds: ['greaves-preterm-2015'], approvedOn: '2026-10-09',
    approval: 'Clinical owner approved GA 24+0–32+0 inclusive, PMA at most 36+0 inclusive, exclusion of the first 24 hours and uncertainty crossing that limit.',
    gestationalAgeDays: { lower: bound('>=', 168), upper: bound('<=', 224) },
    postnatalAgeDays: { lower: bound('>=', 1), upper: null },
    postmenstrualAgeDays: { lower: bound('>=', 0), upper: bound('<=', 252) },
    ageSemantics: 'Closed intervals of possible completed days. Calendar-date difference D means [max(0,D-1),D]; no birth time is invented. All possible GA/PNA/PMA values must fit.'
  };
  function pretermAge() {
    return { axis: 'postmenstrualDays', lower: pretermPolicy.postmenstrualAgeDays.lower, upper: pretermPolicy.postmenstrualAgeDays.upper,
      sourceText: 'PMA ≤36+0 tyg.; GA 24+0–32+0; po ukończeniu pierwszej doby', interpretation: 'owner-approved-applicability-policy-2026-10-09' };
  }
  function pretermScope() {
    return { age: pretermAge(), gestationalAgeDays: pretermPolicy.gestationalAgeDays, postnatalAgeDays: pretermPolicy.postnatalAgeDays,
      policyId: pretermPolicy.id, policyVersion: pretermPolicy.version };
  }

  return deepFreeze({
    schemaVersion: 1,
    dataVersion: '2026-10-09.3',
    implementationStatus: 'active-in-ui',
    unit: 'IU/L',
    knownLimitations: [
      'Zakres referencyjny nie jest progiem rozpoznania CPP, opóźnienia ani etiologii hipogonadyzmu.',
      'Nie przygotowano norm dorosłych ani uniwersalnego pokrycia wszystkich metod i całego wieku 0–18 lat.',
      'Brak właściwego zakresu nie może uruchamiać zastępczej normy dorosłych ani interpolacji.',
      'Niskie lub nieoznaczalne LH nie wyklucza CPP przy odpowiednich cechach klinicznych.',
      'Brak uniwersalnego progu FSH oraz samodzielnego klasyfikatora LH/FSH.',
      'Te profile nie służą do automatycznej interpretacji stymulacji lub oceny skuteczności GnRHa.'
    ],
    nomenclature: {
      Th: {
        label: 'Gruczoły sutkowe',
        aliases: ['M', 'B'],
        sourceAxis: 'B',
        displayStages: ['Th1', 'Th2', 'Th3', 'Th4', 'Th5'],
        classicTanner: true,
        note: 'Th/M w nomenklaturze polskiej odpowiada osi B w źródłach międzynarodowych; lipomastia nie jest rozwojem tkanki gruczołowej.'
      },
      G: {
        label: 'Męskie zewnętrzne narządy płciowe',
        aliases: [],
        sourceAxis: 'G',
        displayStages: ['G1', 'G2', 'G3', 'G4', 'G5'],
        classicTanner: true,
        note: 'Opis rozwoju genitaliów nie potwierdza sam etiologii centralnej; pełnego stadium nie wyznacza się z jednej objętości jąder.'
      },
      P: {
        label: 'Owłosienie łonowe',
        aliases: ['PH'],
        sourceAxis: 'PH',
        displayStages: ['P1', 'P2', 'P3', 'P4', 'P5'],
        classicTanner: true,
        clinicalTimingSelection: false,
        note: 'Samo owłosienie łonowe nie zastępuje Th ani G i nie potwierdza gonadarche.'
      },
      Ax: {
        label: 'Owłosienie pachowe',
        aliases: [],
        classicTanner: false,
        laboratorySelection: false,
        clinicalTimingSelection: false,
        note: 'Ocena dodatkowa, poza klasyczną skalą Tannera; nie ustanowiono tu źródłowej skali Ax1–Ax5.'
      },
      minipuberty: {
        label: 'Minipuberty',
        note: 'Przejściowa aktywacja osi we wczesnym okresie życia; sam wiek i stężenie nie potwierdzają fizjologicznego przebiegu. Aktywność FSH u dziewczynek do 3–4 lat nie stanowi normy ani ogólnego wyjątku od ostrzeżeń.'
      }
    },
    sources: {
      'greaves-preterm-2015': {
        id: 'greaves-preterm-2015',
        version: 'JCEM-2015-100-1097-1103-with-corrigenda-2016',
        title: 'Hormone Modeling in Preterm Neonates: Establishment of Pituitary and Steroid Hormone Reference Intervals',
        authors: 'Greaves RF, Pitkin J, Ho CS, Baglin J, Hunt RW, Zacharin MR',
        pmid: '25562509',
        doi: '10.1210/jc.2014-3681',
        url: 'https://pubmed.ncbi.nlm.nih.gov/25562509/',
        doiUrl: 'https://doi.org/10.1210/jc.2014-3681',
        accessedOn: '2026-10-09',
        accessTimeZone: 'Europe/Warsaw',
        readScope: 'Full JCEM article supplied as greaves2015.pdf, pp. 1097–1103: methods and eligibility p. 1098, cohort and age analysis pp. 1099–1101, Table 4 p. 1102; full four-page supplement jc-14-3681.pdf, Tables 1–2 and Figure 1; both 2016 corrigenda. Full Greaves 2014 three-page uncorrected proof was read for biobank context only. The final journal table supersedes the previously read author poster.',
        evidenceSha256: '96c1875105cab6dcc301a7494efa47f3a9bf39161dbd3adcf06847c1fa2bc251',
        supplementaryEvidence: {
          filename: 'jc-14-3681.pdf', doi: '10.1210/jc.2014-3681',
          evidenceSha256: '99671cf6eff7f3e47c9fdcf156de613fd5a4c1579ed5800ce2a1df5b579b87f8',
          readScope: 'All four pages: Tables 1–2 and Figure 1. The age scatter is PMA, not postnatal days. Figure axes are not exact eligibility bounds.'
        },
        biobankEvidence: {
          doi: '10.1016/j.clinbiochem.2014.05.040', version: 'UNCORRECTED PROOF',
          evidenceSha256: '096385db34e575a39b28aa5c323739c42b62295b0b7d0ee75451d56ab28481b6',
          readScope: 'All three pages. R1 scheduled postnatal collections and R2 preliminary ranges/e602 are not transferred to the final 2015 e601 profile.'
        },
        intervalEvidence: {
          kind: 'journal-table',
          version: 'JCEM-2015-100-1097-1103',
          url: 'https://doi.org/10.1210/jc.2014-3681',
          table: 'Table 4',
          page: 1102,
          verification: 'Table text and PDF image checked. Central 95% reference intervals are distinct from observed minima/maxima and the 90% confidence intervals of their limits.'
        },
        corrigenda: [
          { doi: '10.1210/jc.2016-1639', url: 'https://academic.oup.com/jcem/article/101/5/2265/2804857' },
          { doi: '10.1210/jc.2016-2005', pmid: '27255718', url: 'https://academic.oup.com/jcem/article/101/6/2622/2804884' }
        ],
        correctionScope: 'Acknowledgements and prolactin units in Table 4 (mIU/L); neither corrigendum changes LH or FSH intervals.',
        recruitment: {
          infants: 248, male: 128, female: 120,
          setting: 'Three neonatal intensive care wards in Melbourne, Australia.',
          gestationalAgeSourceText: 'Abstract: 24–32 weeks. Eligible cohort (n=234): observed minimum 23+3 and maximum 32+4 weeks; the LH/FSH subgroup extrema are not reported.',
          eligibleCohort: { infants: 234, male: 116, female: 118 },
          postnatalAgeDays: null,
          firstSampleAgeEvidence: 'Only the first sample per infant was used for RI estimation. Narrative: mean PNA 21 days (SD 15); Table 2: total 20 (15), male 21 (15), female 20 (14). No minimum/maximum PNA is reported.',
          biobankFollowUp: 'Serial sampling every 2–3 weeks to 36 weeks gestational age describes the biobank follow-up, not the validated age window for first-sample LH/FSH RIs.',
          verifiedCriteria: ['Neonatal physician assessed suitability: usual presentation with complications specific to prematurity.', 'No apparent endocrinopathy, ambiguous genitalia or congenital abnormality; newborn screening was normal.', 'Infants included in RI determination survived beyond the equivalent of term.'],
          treatmentEvidence: 'Approximately 90% of mothers received antenatal glucocorticoids (median 11 days before sampling). Five infants received glucocorticoids before first collection (median 7, range 3–15 days); one mother used progesterone pessaries. The cohort was not defined as entirely free of hormonal exposure.',
          clinicalCriteriaVerified: true,
          completeEligibilityVerified: false
        },
        methodEvidence: {
          articleMethods: 'Roche Cobas 8000-e601 electrochemiluminescence immunoassay, standard manufacturer reagent kits and procedures; analytical performance within manufacturer specifications (p. 1098).',
          traceability: { fsh: 'WHO 78/549', lh: 'NIBSC 80/552' },
          authorPosterDiscrepancy: 'The earlier poster names E602; the full journal methods identify e601 and take precedence.',
          assayIdentityResolved: true,
          transferableToCurrentMayoProfiles: false
        },
        knownLimitations: [
          'Pełny artykuł i suplement odczytano. Kwalifikacja GA 24+0–32+0, PMA ≤36+0 i wyłączenie pierwszej doby są zatwierdzoną polityką kliniczną aplikacji, nie empirycznymi skrajami finalnej podgrupy LH/FSH.',
          'Obserwowane GA 23+3–32+4 dotyczy całej kohorty 234 dzieci; nie ustala dokładnej kwalifikacji podgrupy LH/FSH.',
          'Średnia wieku pobrania i obserwacja biobanku do 36 tygodni nie wyznaczają okna stosowania RI z pierwszych próbek.',
          'Górne granice RI mają niepewność: względna szerokość 90% CI wynosi LH M35%/F52%, FSH M30%/F27% (tabela 4).',
          'To przedziały stężeń w konkretnej populacji i metodzie, nie progi rozpoznania ani uniwersalne normy dla wszystkich wcześniaków lub całego pierwszego roku życia.',
          'Nie potwierdzono przenoszalności na AnshLite ani aktualny profil Mayo Roche Elecsys FSH.',
          'Nie wolno przenosić tu okna 0–43 dni z Greaves 2008, harmonogramu Greaves 2014 ani wyznaczać granic ze średniego wieku kohorty.'
        ]
      },
      'who-preterm-birth-2023': {
        id: 'who-preterm-birth-2023',
        version: '2023-05-10',
        title: 'Preterm birth',
        organization: 'World Health Organization',
        url: 'https://www.who.int/news-room/fact-sheets/detail/preterm-birth',
        accessedOn: '2026-10-03',
        readScope: 'Full fact sheet, particularly Key facts and Overview defining birth before 37 completed weeks of gestation.',
        definition: 'Preterm is defined as babies born alive before 37 weeks of pregnancy are completed.',
        evidenceSha256: '03f6d111599993028b9b93c37633cfe66be553e378d220490dc8b00e23919912',
        knownLimitations: ['Definicja wcześniactwa nie stanowi zakresu referencyjnego LH/FSH ani instrukcji uniwersalnego przeliczania wieku skorygowanego.']
      },
      'mayo-lhped-62999': {
        id: 'mayo-lhped-62999',
        version: 'catalog-snapshot-2026-10-03',
        title: 'Luteinizing Hormone (LH), Pediatrics, Serum — LHPED',
        organization: 'Mayo Clinic Laboratories',
        url: 'https://www.mayocliniclabs.com/test-catalog/Overview/62999',
        accessedOn: '2026-10-03',
        accessTimeZone: 'Europe/Warsaw',
        readScope: 'Full catalog: Reference Values, Ordering Guidance, Specimen Type, Method Description, Cautions.',
        evidenceSha256: '4465de2db88bb12527455d449f1e40f65d887857dc4d532c7d32ccca4434dc38',
        knownLimitations: [
          'Zakresy Mayo-derived; liczebność i szczegółowa charakterystyka próby oraz statystyka przedziału nie są podane w katalogu.',
          'Metoda AnshLite LH CLIA jest opisana jako unpublished Mayo method.',
          'Pasma 1–8 / 9–10 / 11–13 / 14–17 zinterpretowano według osiągniętych urodzin; nie jest to cytat operatorów granic z katalogu.',
          'Katalog kwalifikuje Tanner stage I jako 1–8 years; ten kwalifikator zachowano.',
          'Szeroki zakres <1 roku nie opisuje dokładnie tygodniowej dynamiki minipuberty.',
          'Starszego opisu opóźnienia u dziewcząt by age 12 i uproszczonej interpretacji LH nie używa się jako klinicznych reguł tego modułu.'
        ]
      },
      'mayo-fsh-602753': {
        id: 'mayo-fsh-602753',
        version: 'catalog-snapshot-2026-10-03',
        title: 'Follicle-Stimulating Hormone (FSH), Serum',
        organization: 'Mayo Clinic Laboratories',
        url: 'https://www.mayocliniclabs.com/test-catalog/Overview/602753',
        accessedOn: '2026-10-03',
        accessTimeZone: 'Europe/Warsaw',
        readScope: 'Full catalog: Reference Values, Specimen Type, Method Description, Cautions.',
        evidenceSha256: '018f2cb1f28137b7093bee2d3607628af324c8c71eafd1e6b18d06ed1bad5091',
        methodDocumentVersion: 'Elecsys FSH package insert 09/2021, as cited by the catalog',
        knownLimitations: [
          'Zakresy Mayo-derived; liczebność i szczegółowa charakterystyka próby oraz statystyka przedziału nie są podane w katalogu.',
          'Progi wieku >5, >10 i >15 stosuje się dosłownie do wieku metrykalnego, bez zaokrąglania do pełnych lat.',
          'Strict < dla męskich stadiów I/II różni się od <= w jednostronnych zakresach wieku.',
          'Szeroki zakres <12 miesięcy nie opisuje dokładnie dynamiki minipuberty.'
        ]
      },
      'endocrine-society-cpp-2026': {
        id: 'endocrine-society-cpp-2026',
        version: '2026',
        title: 'Central precocious puberty: an Endocrine Society clinical practice guideline',
        pmid: '42287186',
        doi: '10.1210/clinem/dgag168',
        url: 'https://www.endocrine.org/clinical-practice-guidelines/central-precocious-puberty',
        pubmedUrl: 'https://pubmed.ncbi.nlm.nih.gov/42287186/',
        doiUrl: 'https://doi.org/10.1210/clinem/dgag168',
        accessedOn: '2026-10-03',
        readScope: 'PubMed abstract and official full list of recommendations with technical remarks; not the complete OUP article.',
        knownLimitations: [
          'Pełny artykuł OUP był niedostępny; nie deklaruje się odczytu całego uzasadnienia GRADE.',
          'Rekomendacje 1–3 są warunkowe, z bardzo niską pewnością dowodów.',
          'Obserwacja początkowego Th2 jest zaleceniem zależnym od kontekstu dziewczynek, nie automatyczną decyzją tego modułu.'
        ]
      },
      'endo-ern-delay-2021': {
        id: 'endo-ern-delay-2021',
        version: '2021',
        title: 'ENDO-ERN expert opinion on the differential diagnosis of pubertal delay',
        pmid: '33512657',
        doi: '10.1007/s12020-021-02626-z',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8016789/',
        pubmedUrl: 'https://pubmed.ncbi.nlm.nih.gov/33512657/',
        doiUrl: 'https://doi.org/10.1007/s12020-021-02626-z',
        accessedOn: '2026-10-03',
        readScope: 'Full text, including Clinical features and Hormones and stimulation tests.',
        knownLimitations: ['Niskie LH/FSH i standardowy test GnRH nie rozróżniają pewnie CDGP od CHH.']
      },
      'puberty-hormones-review-2021': {
        id: 'puberty-hormones-review-2021',
        version: '2021',
        title: 'Interpretation of reproductive hormones before, during and after the pubertal transition—Identifying health and disordered puberty',
        pmid: '34368982',
        doi: '10.1111/cen.14578',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9291332/',
        pubmedUrl: 'https://pubmed.ncbi.nlm.nih.gov/34368982/',
        doiUrl: 'https://doi.org/10.1111/cen.14578',
        accessedOn: '2026-10-03',
        readScope: 'Full text, including Precocious puberty and Delayed, arrested or absent puberty; cached text reviewed again for clinical-context messages on 2026-10-04.',
        knownLimitations: [
          'Regresja, zatrzymanie dojrzewania i brak aktualnej progresji nie są synonimami.',
          'Część przedwczesnych cech może ustępować bez leczenia; samo zgłoszenie regresji nie rozpoznaje zaburzenia ani jego przyczyny.'
        ]
      },
      'minipuberty-review-2024': {
        id: 'minipuberty-review-2024',
        version: '2024',
        title: 'Mini-Puberty, Physiological and Disordered: Consequences, and Potential for Therapeutic Replacement',
        pmid: '38436980',
        doi: '10.1210/endrev/bnae003',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11244267/',
        pubmedUrl: 'https://pubmed.ncbi.nlm.nih.gov/38436980/',
        doiUrl: 'https://doi.org/10.1210/endrev/bnae003',
        accessedOn: '2026-10-03',
        readScope: 'Full clinical text, including Postnatal Mini-Puberty in Males and Table 2; cached text reviewed again for infant-volume limitations on 2026-10-04.',
        knownLimitations: [
          'Tabela 2 zestawia różne populacje, metody i statystyki objętości; średnich nie przekształca się w zakresy referencyjne.',
          'Nie ustanowiono progu alarmowego objętości jąder dla niemowląt w tym module.',
          'Kryterium początku pokwitania nie jest zweryfikowaną granicą patologii minipuberty.'
        ]
      },
      'delayed-puberty-review-2024': {
        id: 'delayed-puberty-review-2024',
        version: '2024',
        title: 'A Current Perspective on Delayed Puberty and Its Management',
        pmid: '38683021',
        doi: '10.4274/jcrpe.galenos.2024.2024-2-7',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11629716/',
        pubmedUrl: 'https://pubmed.ncbi.nlm.nih.gov/38683021/',
        doiUrl: 'https://doi.org/10.4274/jcrpe.galenos.2024.2024-2-7',
        accessedOn: '2026-10-03',
        readScope: 'Full text: definitions, physiology and diagnostic evaluation.',
        knownLimitations: ['Opis aktywności FSH do 3–4 lat nie jest tabelą współczesnych granic referencyjnych.']
      },
      'cpp-laboratory-review-2025': {
        id: 'cpp-laboratory-review-2025',
        version: 'published-2025-01-21-volume-2024',
        title: 'Critical appraisal of diagnostic laboratory tests in the evaluation of central precocious puberty',
        pmid: '39911767',
        doi: '10.3389/fped.2024.1504874',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11795171/',
        pubmedUrl: 'https://pubmed.ncbi.nlm.nih.gov/39911767/',
        doiUrl: 'https://doi.org/10.3389/fped.2024.1504874',
        accessedOn: '2026-10-03',
        readScope: 'Full text, Table 1 and Box 1.',
        knownLimitations: [
          'Przegląd narracyjny; progi zależą od metody i protokołu, część jest praktyką lub opinią autorów.',
          'Nie wdrożono tutaj diagnostycznych progów LH 0.3/0.5 ani progów stymulacji jako uniwersalnych reguł.'
        ]
      },
      'johannsen-minipuberty-2018': {
        id: 'johannsen-minipuberty-2018',
        version: '2018-secondary-table-read-2026-10-03',
        title: 'Sex Differences in Reproductive Hormones During Mini-Puberty in Infants With Normal and Disordered Sex Development',
        pmid: '29917083',
        doi: '10.1210/jc.2018-00482',
        url: 'https://pubmed.ncbi.nlm.nih.gov/29917083/',
        doiUrl: 'https://doi.org/10.1210/jc.2018-00482',
        accessedOn: '2026-10-03',
        readScope: 'Original abstract and metadata; numeric reference intervals read from Rohayem 2024 Table 1, method/statistics from Olthof 2026 Table 2.',
        secondarySources: [
          { pmid: '38436980', doi: '10.1210/endrev/bnae003', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11244267/', section: 'Table 1' },
          { pmid: '42554720', doi: '10.1530/JME-26-0037', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13506540/', section: 'Table 2' }
        ],
        knownLimitations: [
          'Pełny tekst oryginału nie był dostępny.',
          'Nie rozstrzygnięto zaliczania dokładnych granic 2.0, 3.5 i 5.0 miesięcy.',
          'Nie potwierdzono liczbowego LOD dla cenzurowanych dolnych granic dziewczynek.',
          'Przedziały kandydackie nie są aktywne i nie obejmują wieku poza źródłowymi 2–5 miesiącami.'
        ]
      }
    },
    // Kwalifikacja populacji RI jest niezależna od klinicznych progów czasu
    // rozwoju: brak clinicalProfile nie usuwa ograniczeń interpretacji biochemii.
    biochemicalPolicy: {
      id: 'pediatric-basal-eligibility',
      version: '2026-10-03.1',
      sourceIds: ['mayo-lhped-62999', 'mayo-fsh-602753', 'who-preterm-birth-2023'],
      infantAgeYears: bound('<', 1),
      pretermGestationalWeeks: bound('<', 37)
    },
    pretermEligibilityPolicy: pretermPolicy,
    clinicalProfile: {
      id: 'puberty-timing-pediatric',
      version: '2026-10-04.1',
      sourceIds: ['endocrine-society-cpp-2026', 'endo-ern-delay-2021', 'delayed-puberty-review-2024', 'cpp-laboratory-review-2025', 'puberty-hormones-review-2021', 'minipuberty-review-2024'],
      population: 'Dzieci i młodzież; kryteria kliniczne czasu dojrzewania, niezależne od zakresów konkretnego laboratorium.',
      scopeAgeYears: { lower: bound('>=', 0), upper: bound('<=', 18) },
      infantAgeYears: bound('<', 1),
      infantAdvancedStageMin: { F: 3, M: 3 },
      infantPolicy: 'Podział kontekstu interpretacji; granica 1 roku nie definiuje biologicznego końca minipuberty.',
      earlyAgeYears: { F: bound('<', 8), M: bound('<', 9) },
      absentOnsetAgeYears: { F: bound('>=', 13), M: bound('>=', 14) },
      onset: {
        F: { axis: 'Th', stage: 2, criterion: 'Pojawienie się tkanki gruczołowej piersi; odpowiednik źródłowego B2.' },
        M: {
          axis: 'G',
          stage: 2,
          testisVolume: { operator: '>=', value: 4, unit: 'mL', method: 'Prader' },
          criterion: 'Początek powiększenia jąder, klinicznie objętość ≥4 ml orchidometrem Pradera; samo stadium G nie ustala mechanizmu.'
        }
      },
      criteria: {
        early: 'Potwierdzone wczesne cechy lub wiarygodny wcześniejszy początek wymagają oceny; wiek i stadium nie rozpoznają centralnej etiologii.',
        absentOnset: 'Potwierdzony brak Th2 do 13 lat lub jąder ≥4 ml do 14 lat, z uwzględnieniem leczenia, regresji i wcześniejszego przebiegu. Nieznany wywiad nie oznacza braku początku.',
        history: 'Znany początek przed granicą wieku pozostaje istotny, gdy pacjent jest obecnie starszy. Ze stadium nie odtwarza się daty początku.',
        missing: 'Brak oceny nie jest stadium 1. P/Ax oraz ogólne niejednoznaczne pole Tanner nie zastępują Th/G.'
      },
      thelarche: {
        initialStage: 2,
        advancedStageMin: 3,
        conditional: true,
        exceptions: ['progression', 'growthAcceleration', 'CNS'],
        sourceComment: 'ES 2026 dopuszcza badanie kontrolne co 4–6 miesięcy przy początkowym Th2 u dziewczynek, zależnie od kontekstu. Th3+, progresja, przyspieszenie wzrastania i objawy OUN zmieniają postępowanie. Ten moduł nie podejmuje automatycznej decyzji o obserwacji lub diagnostyce.',
        initialMessage: 'Wczesny rozwój gruczołów sutkowych — wymaga oceny przebiegu.'
      },
      contextMessages: {
        policy: 'Dodatni wywiad dodaje osobny komunikat i uwagę w podsumowaniu, zachowując ocenę czasu początku i porównania stężenia. Nie rozpoznaje etiologii ani nie wyznacza badania obrazowego.',
        history: [
          {
            field: 'cnsSymptoms', code: 'reported_cns_symptoms',
            title: 'Objawy OUN wymagają odrębnej oceny',
            text: 'Objawy OUN: zgłoszone objawy wymagają odrębnej oceny klinicznej. Wynik LH/FSH i ocena czasu początku nie wyjaśniają ich przyczyny; moduł nie określa pilności na podstawie samej odpowiedzi „Tak”.',
            sourceIds: ['endocrine-society-cpp-2026']
          },
          {
            field: 'regression', code: 'reported_puberty_regression',
            title: 'Regresja cech dojrzewania wymaga odrębnej oceny',
            text: 'Regresja cech dojrzewania: zgłoszono cofnięcie wcześniejszych cech. Wymaga to osobnej oceny przebiegu w kontekście badania i leczenia; sama ocena czasu początku ani stężenie LH/FSH nie wyjaśniają przyczyny. Cofnięcie cech nie oznacza automatycznie trwałego zatrzymania dojrzewania.',
            sourceIds: ['endo-ern-delay-2021', 'puberty-hormones-review-2021']
          }
        ],
        earlyThelarcheWithCns: {
          code: 'early_thelarche_with_cns_symptoms',
          text: 'Objawy OUN przy wczesnym rozwoju piersi: wytyczne wskazują sprawną ocenę przez endokrynologa dziecięcego i odpowiednich specjalistów. Zalecenie samej obserwacji izolowanej wczesnej thelarche nie ma tu zastosowania.',
          sourceIds: ['endocrine-society-cpp-2026']
        },
        infantTesticularVolume: {
          code: 'infant_testicular_volume_not_validated', sex: 'M', unit: 'mL',
          methods: { Prader: 'orchidometr Pradera', ultrasound: 'USG', other: 'inna metoda' },
          unknownMethod: 'metoda niepodana lub nieznana',
          text: 'Objętość jąder w niemowlęctwie: podano {value} {unit}, {method}. Moduł nie ma zweryfikowanego zakresu referencyjnego objętości dla wieku niemowlęcego i metody pomiaru. Pomiar wymaga oceny w tym kontekście oraz weryfikacji jego wiarygodności; nie klasyfikujemy go jako prawidłowy lub nieprawidłowy ani nie odtwarzamy stadium G.',
          sourceIds: ['minipuberty-review-2024'],
          policy: 'Komunikat dotyczy każdego potwierdzonego pomiaru dla próbki w kontekście niemowlęcym, bez progu objętości. Nie jest regułą rozpoznawania powiększonych jąder.'
        }
      },
      knownLimitations: [
        'Niskie LH nie wyklucza CPP; prawidłowe FSH nie usuwa ostrzeżenia wynikającego z czasu rozwoju.',
        'Brak automatycznej diagnozy CPP, obwodowego PP, CDGP/CHH lub pierwotnej niewydolności gonad.',
        'Brak automatycznej decyzji o MRI, obserwacji, leczeniu lub ocenie skuteczności GnRHa.',
        'Wynik i stadium muszą odnosić się do właściwych dat; aktualne dane nie mogą zastępować danych dawnej próbki.',
        'Minipuberty oraz opis aktywności FSH do 3–4 lat nie tworzą ogólnego wyjątku od ostrzeżeń.'
      ]
    },
    profiles: [
      {
        id: 'mayo-lh-pediatric',
        version: '2026-10-03.1',
        active: true,
        analyte: 'lh',
        sourceId: 'mayo-lhped-62999',
        method: {
          id: 'anshlite-lh-clia',
          name: 'AnshLite LH CLIA',
          description: 'Three-step sandwich chemiluminescent immunoassay; unpublished Mayo method.',
          analyticalSensitivity: { value: 0.02, unit: 'IU/L', sourceTerm: 'sensitive to 0.02 IU/L' }
        },
        material: 'serum',
        unit: 'IU/L',
        examinationType: 'basal',
        population: {
          label: 'Pediatryczne zakresy Mayo Clinic Laboratories',
          sourceDescription: 'Mayo-derived reference intervals; characteristics of the reference sample are not reported in the catalog.',
          statistics: { kind: 'referenceInterval', coveragePercent: null, sampleSize: null }
        },
        scope: { age: age(bound('>=', 0), bound('<', 18), 'Pediatric patients younger than 18 years', 'catalog-ordering-guidance') },
        stageAgeMinYears: 1,
        stageAgePolicy: 'W niemowlęctwie wybiera się wyłącznie zakres wieku; ta polityka nie definiuje końca minipuberty.',
        ageInterpretation: 'Attained-year bands: 1–8 means [1st birthday, 9th birthday); source labels are retained for audit.',
        sourceStageLabels: { F: 'Tanner Stages — Females (mapped to Th; international breast axis B)', M: 'Tanner Stages — Males (mapped to G)' },
        knownLimitations: [
          'Zgodność musi dotyczyć metody AnshLite LH CLIA, nie ogólnie dowolnego testu ultrasensitive LH.',
          'Dolne zapisy <0.02 są cenzurowane; nie stanowią liczbowej dolnej granicy normy.',
          'Zakres <1 roku ma ograniczoną rozdzielczość dla minipuberty.',
          'Kwalifikator wieku Stage I (1–8 years) zachowano; nie rozszerzono tego wiersza na starsze dzieci.'
        ],
        rows: [
          ageRow('lh-m-age-under1', 'M', age(bound('>=', 0), bound('<', 1), '<1 year', 'explicit-less-than'), range(null, bound('<=', 5), '<0.02–5.0 IU/L', lhCensoredLower)),
          ageRow('lh-m-age1-8', 'M', age(bound('>=', 1), bound('<', 9), '1–8 years', 'attained-year-band'), range(null, bound('<=', 0.5), '<0.02–0.5 IU/L', lhCensoredLower)),
          ageRow('lh-m-age9-10', 'M', age(bound('>=', 9), bound('<', 11), '9–10 years', 'attained-year-band'), range(null, bound('<=', 3.6), '<0.02–3.6 IU/L', lhCensoredLower)),
          ageRow('lh-m-age11-13', 'M', age(bound('>=', 11), bound('<', 14), '11–13 years', 'attained-year-band'), range(bound('>=', 0.1), bound('<=', 5.7), '0.1–5.7 IU/L')),
          ageRow('lh-m-age14-17', 'M', age(bound('>=', 14), bound('<', 18), '14–17 years', 'attained-year-band'), range(bound('>=', 0.8), bound('<=', 8.7), '0.8–8.7 IU/L')),
          ageRow('lh-f-age-under1', 'F', age(bound('>=', 0), bound('<', 1), '<1 year', 'explicit-less-than'), range(null, bound('<=', 18.3), '<0.02–18.3 IU/L', lhCensoredLower)),
          ageRow('lh-f-age1-8', 'F', age(bound('>=', 1), bound('<', 9), '1–8 years', 'attained-year-band'), range(null, bound('<=', 0.3), '<0.02–0.3 IU/L', lhCensoredLower)),
          ageRow('lh-f-age9-10', 'F', age(bound('>=', 9), bound('<', 11), '9–10 years', 'attained-year-band'), range(null, bound('<=', 4.8), '<0.02–4.8 IU/L', lhCensoredLower)),
          ageRow('lh-f-age11-13', 'F', age(bound('>=', 11), bound('<', 14), '11–13 years', 'attained-year-band'), range(null, bound('<=', 11.7), '<0.02–11.7 IU/L', lhCensoredLower)),
          ageRow('lh-f-age14-17', 'F', age(bound('>=', 14), bound('<', 18), '14–17 years', 'attained-year-band'), range(null, bound('<=', 16.7), '<0.02–16.7 IU/L', lhCensoredLower)),
          stageRow('lh-m-g1', 'M', 'G', 1, range(null, bound('<=', 0.5), '<0.02–0.5 IU/L', lhCensoredLower), lhStageIAge),
          stageRow('lh-m-g2', 'M', 'G', 2, range(bound('>=', 0.03), bound('<=', 3.7), '0.03–3.7 IU/L')),
          stageRow('lh-m-g3', 'M', 'G', 3, range(bound('>=', 0.09), bound('<=', 4.2), '0.09–4.2 IU/L')),
          stageRow('lh-m-g4', 'M', 'G', 4, range(bound('>=', 1.3), bound('<=', 9.8), '1.3–9.8 IU/L')),
          stageRow('lh-m-g5', 'M', 'G', 5, range(bound('>=', 1.3), bound('<=', 9.8), '1.3–9.8 IU/L')),
          stageRow('lh-f-th1', 'F', 'Th', 1, range(null, bound('<=', 0.3), '<0.02–0.3 IU/L', lhCensoredLower), lhStageIAge),
          stageRow('lh-f-th2', 'F', 'Th', 2, range(null, bound('<=', 4.1), '<0.02–4.1 IU/L', lhCensoredLower)),
          stageRow('lh-f-th3', 'F', 'Th', 3, range(bound('>=', 0.6), bound('<=', 7.2), '0.6–7.2 IU/L')),
          stageRow('lh-f-th4', 'F', 'Th', 4, range(bound('>=', 0.9), bound('<=', 13.3), '0.9–13.3 IU/L')),
          stageRow('lh-f-th5', 'F', 'Th', 5, range(bound('>=', 0.9), bound('<=', 13.3), '0.9–13.3 IU/L'))
        ]
      },
      {
        id: 'mayo-fsh-pediatric',
        version: '2026-10-03.1',
        active: true,
        analyte: 'fsh',
        sourceId: 'mayo-fsh-602753',
        method: { id: 'roche-elecsys-fsh-eclia', name: 'Roche Elecsys FSH ECLIA', description: 'Electrochemiluminescence sandwich immunoassay; package insert 09/2021 cited by Mayo.' },
        material: 'serum',
        unit: 'IU/L',
        examinationType: 'basal',
        population: {
          label: 'Pediatryczne zakresy Mayo Clinic Laboratories',
          sourceDescription: 'Mayo-derived reference intervals; characteristics of the reference sample are not reported in the catalog.',
          statistics: { kind: 'referenceInterval', coveragePercent: null, sampleSize: null }
        },
        scope: { age: age(bound('>=', 0), bound('<=', 18), 'Pediatric age rows through 18 years', 'literal-age-operators') },
        stageAgeMinYears: 1,
        stageAgePolicy: 'W niemowlęctwie wybiera się wyłącznie zakres wieku; ta polityka nie definiuje końca minipuberty.',
        ageInterpretation: 'Explicit source age limits: >5–10 means age >5 and <=10, without rounding or attained-year transformation.',
        sourceStageLabels: { F: 'Tanner Stages — Females (mapped to Th; international breast axis B)', M: 'Tanner Stages — Males (mapped to G)' },
        knownLimitations: [
          'Zgodność musi dotyczyć oznaczenia Roche Elecsys FSH ECLIA.',
          'Jednostronne zakresy wieku nie mają dopisanej dolnej granicy.',
          'Męskie stadia G1/G2 mają ścisłe <, a nie <=.',
          'Zakres <12 miesięcy ma ograniczoną rozdzielczość dla minipuberty; wysokie FSH u dziewczynek do 3–4 lat nie jest automatycznie fizjologiczne.'
        ],
        rows: [
          ageRow('fsh-m-age-under1', 'M', age(bound('>=', 0), bound('<', 1), '<12 months'), range(null, bound('<=', 3.3), '< or =3.3 IU/L')),
          ageRow('fsh-m-age1-5', 'M', age(bound('>=', 1), bound('<=', 5), '12 months–5 years'), range(null, bound('<=', 1.9), '< or =1.9 IU/L')),
          ageRow('fsh-m-age-over5-10', 'M', age(bound('>', 5), bound('<=', 10), '>5 years–10 years'), range(null, bound('<=', 2.3), '< or =2.3 IU/L')),
          ageRow('fsh-m-age-over10-15', 'M', age(bound('>', 10), bound('<=', 15), '>10 years–15 years'), range(bound('>=', 0.6), bound('<=', 6.9), '0.6–6.9 IU/L')),
          ageRow('fsh-m-age-over15-18', 'M', age(bound('>', 15), bound('<=', 18), '>15 years–18 years'), range(bound('>=', 0.7), bound('<=', 9.6), '0.7–9.6 IU/L')),
          ageRow('fsh-f-age-under1', 'F', age(bound('>=', 0), bound('<', 1), '<12 months'), range(bound('>=', 1.2), bound('<=', 12.5), '1.2–12.5 IU/L')),
          ageRow('fsh-f-age1-10', 'F', age(bound('>=', 1), bound('<=', 10), '12 months–10 years'), range(bound('>=', 0.5), bound('<=', 6), '0.5–6.0 IU/L')),
          ageRow('fsh-f-age-over10-15', 'F', age(bound('>', 10), bound('<=', 15), '>10 years–15 years'), range(bound('>=', 0.9), bound('<=', 8.9), '0.9–8.9 IU/L')),
          ageRow('fsh-f-age-over15-18', 'F', age(bound('>', 15), bound('<=', 18), '>15 years–18 years'), range(bound('>=', 0.7), bound('<=', 9.6), '0.7–9.6 IU/L')),
          stageRow('fsh-m-g1', 'M', 'G', 1, range(null, bound('<', 1.5), '<1.5 IU/L')),
          stageRow('fsh-m-g2', 'M', 'G', 2, range(null, bound('<', 3), '<3.0 IU/L')),
          stageRow('fsh-m-g3', 'M', 'G', 3, range(bound('>=', 0.4), bound('<=', 6.2), '0.4–6.2 IU/L')),
          stageRow('fsh-m-g4', 'M', 'G', 4, range(bound('>=', 0.6), bound('<=', 5.1), '0.6–5.1 IU/L')),
          stageRow('fsh-m-g5', 'M', 'G', 5, range(bound('>=', 0.8), bound('<=', 7.2), '0.8–7.2 IU/L')),
          stageRow('fsh-f-th1', 'F', 'Th', 1, range(bound('>=', 0.6), bound('<=', 4.1), '0.6–4.1 IU/L')),
          stageRow('fsh-f-th2', 'F', 'Th', 2, range(bound('>=', 0.3), bound('<=', 5.8), '0.3–5.8 IU/L')),
          stageRow('fsh-f-th3', 'F', 'Th', 3, range(bound('>=', 0.1), bound('<=', 7.2), '0.1–7.2 IU/L')),
          stageRow('fsh-f-th4', 'F', 'Th', 4, range(bound('>=', 0.3), bound('<=', 7), '0.3–7.0 IU/L')),
          stageRow('fsh-f-th5', 'F', 'Th', 5, range(bound('>=', 0.4), bound('<=', 8.6), '0.4–8.6 IU/L'))
        ]
      },
      {
        id: 'johannsen-minipuberty-lh-candidate',
        version: '2026-10-03.1',
        active: false,
        analyte: 'lh',
        sourceId: 'johannsen-minipuberty-2018',
        method: { id: 'autodelfia-johannsen-2018', name: 'AutoDELFIA / PerkinElmer', description: 'Method reported in the verified secondary reference review; original full text unavailable.' },
        material: 'serum',
        unit: 'IU/L',
        examinationType: 'basal',
        population: { label: 'Zdrowe donoszone niemowlęta, 2–5 miesięcy, Johannsen 2018', statistics: { kind: 'percentiles', lowerPercentile: 2.5, upperPercentile: 97.5, transformation: 'logarithmic' } },
        blockedReasons: ['unresolvedAgeEdges', 'unresolvedLOD'],
        knownLimitations: ['Tylko kandydat: brak maszynowych rows uniemożliwia przypadkowe użycie nierozstrzygniętych przedziałów.'],
        rows: [],
        reportedIntervals: [
          { sex: 'M', ageMonthsSourceText: '2.0–3.5', ageEdgesResolved: false, rangeSourceText: '0.62–4.08 IU/L', lower: 0.62, upper: 4.08, sampleSize: 581 },
          { sex: 'M', ageMonthsSourceText: '3.5–5.0', ageEdgesResolved: false, rangeSourceText: '0.54–3.32 IU/L', lower: 0.54, upper: 3.32, sampleSize: 166 },
          { sex: 'F', ageMonthsSourceText: '2.0–3.5', ageEdgesResolved: false, rangeSourceText: '<LOD–0.98 IU/L', lower: null, upper: 0.98, lowerReportedAs: '<LOD', sampleSize: 432 },
          { sex: 'F', ageMonthsSourceText: '3.5–5.0', ageEdgesResolved: false, rangeSourceText: '<LOD–1.25 IU/L', lower: null, upper: 1.25, lowerReportedAs: '<LOD', sampleSize: 110 }
        ]
      },
      {
        id: 'johannsen-minipuberty-fsh-candidate',
        version: '2026-10-03.1',
        active: false,
        analyte: 'fsh',
        sourceId: 'johannsen-minipuberty-2018',
        method: { id: 'autodelfia-johannsen-2018', name: 'AutoDELFIA / PerkinElmer', description: 'Method reported in the verified secondary reference review; original full text unavailable.' },
        material: 'serum',
        unit: 'IU/L',
        examinationType: 'basal',
        population: { label: 'Zdrowe donoszone niemowlęta, 2–5 miesięcy, Johannsen 2018', statistics: { kind: 'percentiles', lowerPercentile: 2.5, upperPercentile: 97.5, transformation: 'logarithmic' } },
        blockedReasons: ['unresolvedAgeEdges', 'unresolvedLOD'],
        knownLimitations: ['Tylko kandydat: aktywacja wymaga osobnego rozstrzygnięcia źródłowych granic i zgodności metody.'],
        rows: [],
        reportedIntervals: [
          { sex: 'M', ageMonthsSourceText: '2.0–3.5', ageEdgesResolved: false, rangeSourceText: '0.41–3.02 IU/L', lower: 0.41, upper: 3.02, sampleSize: 578 },
          { sex: 'M', ageMonthsSourceText: '3.5–5.0', ageEdgesResolved: false, rangeSourceText: '0.42–2.68 IU/L', lower: 0.42, upper: 2.68, sampleSize: 165 },
          { sex: 'F', ageMonthsSourceText: '2.0–3.5', ageEdgesResolved: false, rangeSourceText: '1.23–17.4 IU/L', lower: 1.23, upper: 17.4, sampleSize: 435 },
          { sex: 'F', ageMonthsSourceText: '3.5–5.0', ageEdgesResolved: false, rangeSourceText: '1.30–17.7 IU/L', lower: 1.3, upper: 17.7, sampleSize: 111 }
        ]
      },
      {
        id: 'greaves-preterm-lh-candidate',
        version: '2026-10-09.3',
        active: true,
        analyte: 'lh',
        sourceId: 'greaves-preterm-2015',
        method: {
          id: 'roche-cobas-e601-lh-greaves-2015',
          name: 'Roche Cobas 8000-e601 LH — Greaves 2015',
          description: 'ECLIA, standard manufacturer kits and procedures; traceable to NIBSC 80/552 (p. 1098). Not an alias of AnshLite or a current Mayo assay.'
        },
        material: 'serum',
        unit: 'IU/L',
        examinationType: 'basal',
        population: {
          label: 'Wcześniaki z oddziałów noworodkowych w Melbourne — Greaves 2015; GA 24+0–32+0, PMA ≤36+0, po pierwszej dobie według polityki aplikacji',
          statistics: { kind: 'referenceInterval', coveragePercent: 95, lowerPercentile: 2.5, upperPercentile: 97.5, method: 'robust', transformation: 'Box-Cox', sampleSize: 219, sampleSizeBySex: { M: 111, F: 108 } }
        },
        scope: pretermScope(),
        knownLimitations: ['Granice GA/PMA i wyłączenie pierwszej doby są polityką aplikacji zatwierdzoną przez właściciela, a nie min/max badanej podgrupy.', 'Zakres stężenia z tabeli 4 nie rozpoznaje prawidłowej minipuberty ani przyczyny odchylenia.'],
        rows: [
          ageRow('greaves-preterm-lh-m', 'M', pretermAge(), range(bound('>=', 0.1), bound('<=', 9.2), '0.1–9.2 IU/L')),
          ageRow('greaves-preterm-lh-f', 'F', pretermAge(), range(bound('>=', 0.2), bound('<=', 133.9), '0.2–133.9 IU/L'))
        ],
        reportedIntervals: [
          { sex: 'M', rangeSourceText: '0.1–9.2 IU/L', lower: 0.1, upper: 9.2, sampleSize: 111, confidenceIntervals: { coveragePercent: 90, lower: [0.1, 0.2], upper: [7.9, 11.1] } },
          { sex: 'F', rangeSourceText: '0.2–133.9 IU/L', lower: 0.2, upper: 133.9, sampleSize: 108, confidenceIntervals: { coveragePercent: 90, lower: [0.1, 0.5], upper: [104.2, 173.9] } }
        ]
      },
      {
        id: 'greaves-preterm-fsh-candidate',
        version: '2026-10-09.3',
        active: true,
        analyte: 'fsh',
        sourceId: 'greaves-preterm-2015',
        method: {
          id: 'roche-cobas-e601-fsh-greaves-2015',
          name: 'Roche Cobas 8000-e601 FSH — Greaves 2015',
          description: 'ECLIA, standard manufacturer kits and procedures; traceable to WHO 78/549 (p. 1098). Not an alias of the current Mayo Roche Elecsys FSH profile.'
        },
        material: 'serum',
        unit: 'IU/L',
        examinationType: 'basal',
        population: {
          label: 'Wcześniaki z oddziałów noworodkowych w Melbourne — Greaves 2015; GA 24+0–32+0, PMA ≤36+0, po pierwszej dobie według polityki aplikacji',
          statistics: { kind: 'referenceInterval', coveragePercent: 95, lowerPercentile: 2.5, upperPercentile: 97.5, method: 'robust', transformation: 'Box-Cox', sampleSize: 219, sampleSizeBySex: { M: 111, F: 108 } }
        },
        scope: pretermScope(),
        knownLimitations: ['Granice GA/PMA i wyłączenie pierwszej doby są polityką aplikacji zatwierdzoną przez właściciela, a nie min/max badanej podgrupy.', 'Zakres stężenia z tabeli 4 nie rozpoznaje prawidłowej minipuberty ani przyczyny odchylenia.'],
        rows: [
          ageRow('greaves-preterm-fsh-m', 'M', pretermAge(), range(bound('>=', 0.2), bound('<=', 3.6), '0.2–3.6 IU/L')),
          ageRow('greaves-preterm-fsh-f', 'F', pretermAge(), range(bound('>=', 2.6), bound('<=', 181.1), '2.6–181.1 IU/L'))
        ],
        reportedIntervals: [
          { sex: 'M', rangeSourceText: '0.2–3.6 IU/L', lower: 0.2, upper: 3.6, sampleSize: 111, confidenceIntervals: { coveragePercent: 90, lower: [0.1, 0.2], upper: [3.2, 4.2] } },
          { sex: 'F', rangeSourceText: '2.6–181.1 IU/L', lower: 2.6, upper: 181.1, sampleSize: 108, confidenceIntervals: { coveragePercent: 90, lower: [1.0, 4.9], upper: [159.6, 207.6] } }
        ]
      }
    ]
  });
});
