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

  return deepFreeze({
    schemaVersion: 1,
    dataVersion: '2026-10-03.1',
    implementationStatus: 'prepared-not-connected-to-ui',
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
    clinicalProfile: {
      id: 'puberty-timing-pediatric',
      version: '2026-10-03.1',
      sourceIds: ['endocrine-society-cpp-2026', 'endo-ern-delay-2021', 'delayed-puberty-review-2024', 'cpp-laboratory-review-2025'],
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
      }
    ]
  });
});
