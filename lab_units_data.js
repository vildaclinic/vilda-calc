/* lab_units_data.js
 * --------------------------------------------------------------------------
 *  Baza danych substancji dla przelicznika jednostek laboratoryjnych.
 *
 *  STAN PEDIATRYCZNYCH ZAKRESÓW (faza 2b ukończona):
 *    – kortyzol, aldosteron, 17-OH-progesteron, testosteron T: Soldin 2005/2009
 *      (LC-MS/MS lub IMMULITE 1000, dane open-access)
 *    – ACTH, 11-deoksykortyzol, kortykosteron, 17-OH-pregnenolon, pregnenolon,
 *      DHEA, DHEA-S, androstendion, wolny testosteron, DHT, estradiol, estron,
 *      progesteron: Mayo Clinic Test Catalog (snapshoty Wayback Machine, gdzie
 *      relevant cytowane są oryginalne źródła Mayo: Kushnir 2006, Soldin AACC 2003/2005).
 *    – Tanner-based stratyfikacja dla: 17-OH-pregnenolon, pregnenolon, DHEA-S,
 *      androstendion, DHT, estradiol, estron (Mayo daje tabele Tannera I–V).
 *    – Bez stratyfikacji pediatrycznej: 25-OH wit. D (Polski konsensus 2023 stosuje
 *      jednolite progi dla wszystkich grup wiekowych), 1,25(OH)₂ wit. D (Mayo
 *      podaje jeden zakres dorosły), wit. D₃ (brak ustalonego klinicznego zakresu).
 *
 *  Każda substancja definiuje:
 *    id            – stabilny identyfikator (slug),
 *    label_pl      – etykieta po polsku (UI),
 *    label_en      – etykieta po angielsku (search/synonim),
 *    aliases       – dodatkowe nazwy/skróty do wyszukiwarki,
 *    group         – grupa kliniczna (do nagłówków w selektorze),
 *    mw            – masa cząsteczkowa [g/mol],
 *    canonical_si  – kanoniczna jednostka SI (do której wszystko jest sprowadzane),
 *    units[]       – lista jednostek; każda ma:
 *                      symbol         (np. "μg/dL"),
 *                      label          (etykieta wyświetlana),
 *                      kind           ("conv" | "si"),
 *                      factor_to_si   – współczynnik: value_in_canonical_si = value × factor_to_si
 *    precision     – sugerowana liczba cyfr znaczących przy wyświetlaniu,
 *    ranges_pl[]   – informacyjne zakresy referencyjne (string),
 *    notes_pl      – uwagi kliniczne / pułapki interpretacyjne,
 *    sources[]     – źródła literaturowe (numerowane w UI).
 *
 *  Reguła przeliczeniowa (z mas. cz. M, w g/mol):
 *    SI: nmol/L (z masy/objętości)
 *      μg/dL  → nmol/L  : 10000 / M
 *      ng/mL  → nmol/L  :  1000 / M
 *      ng/dL  → nmol/L  :    10 / M
 *      pg/mL  → nmol/L  :     1 / M
 *    SI: pmol/L
 *      pg/mL  → pmol/L  :  1000 / M
 *      ng/dL  → pmol/L  : 10000 / M
 *      ng/L   → pmol/L  :  1000 / M
 *    SI: μmol/L
 *      μg/dL  → μmol/L  :    10 / M
 *      μg/mL  → μmol/L  :  1000 / M
 *
 *  Wartości MW i czynników zaokrąglono do 4 cyfr znaczących z surowych
 *  obliczeń wzoru sumarycznego (CAS / PubChem).  Drobne różnice względem
 *  zewnętrznych kalkulatorów (np. childmetrics.org) wynikają z innego
 *  zaokrąglenia – w obliczeniach używamy współczynnika bezpośrednio,
 *  nie liczonego ponownie z MW.
 * --------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  // Stała używana w komentarzach do oznaczania, że dany przelicznik nie wynika
  // wprost z masy cząsteczkowej tylko ze standardu międzynarodowego (WHO IS).
  // Pozostawiamy ją do ewentualnej rozbudowy o jednostki biologiczne (mIU/L itp.).
  var WHO_IS = 'WHO IS';                                       // (na razie nieużywane – placeholder)

  // ────────────────────────────────────────────────────────────────────────
  //  Globalna mapa źródeł literaturowych. Każda substancja referuje przez
  //  source_ids do tej mapy, dzięki czemu unikamy duplikowania pełnych cytowań.
  //
  //  Pola:
  //    label_short – krótka etykieta widoczna przy wyniku (np. "CALIPER 2013"),
  //    full_cite   – pełne cytowanie w stylu Vancouver dla rozwijanej listy,
  //    url         – link do artykułu/DOI (jeśli dostępny),
  //    pmid, doi   – identyfikatory dla uzupełniania metadanych.
  // ────────────────────────────────────────────────────────────────────────
  var SOURCES = {
    tietz_2018: {
      label_short: 'Tietz 2018',
      full_cite: 'Rifai N, Horvath AR, Wittwer CT, eds. Tietz Textbook of Clinical Chemistry and Molecular Diagnostics. 6th ed. St. Louis: Elsevier; 2018.',
      url: null
    },
    bhasin_es_testosterone_2018: {
      label_short: 'Endocrine Society 2018 — testosteron (Bhasin)',
      full_cite: 'Bhasin S, Brito JP, Cunningham GR, Hayes FJ, Hodis HN, Matsumoto AM, Snyder PJ, Swerdloff RS, Wu FC, Yialamas MA. Testosterone Therapy in Men With Hypogonadism: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2018;103(5):1715–1744.',
      doi: '10.1210/jc.2018-00229',
      url: 'https://academic.oup.com/jcem/article/103/5/1715/4939465'
    },
    speiser_es_cah_2018: {
      label_short: 'Endocrine Society CAH 2018 (Speiser)',
      full_cite: 'Speiser PW, Arlt W, Auchus RJ, Baskin LS, Conway GS, Merke DP, Meyer-Bahlburg HFL, Miller WL, Murad MH, Oberfield SE, White PC. Congenital Adrenal Hyperplasia Due to Steroid 21-Hydroxylase Deficiency: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2018;103(11):4043–4088.',
      doi: '10.1210/jc.2018-01865',
      url: 'https://doi.org/10.1210/jc.2018-01865'
    },
    funder_es_pa_2016: {
      label_short: 'Endocrine Society Primary Aldosteronism 2016 (Funder)',
      full_cite: 'Funder JW, Carey RM, Mantero F, Murad MH, Reincke M, Shibata H, Stowasser M, Young WF Jr. The Management of Primary Aldosteronism: Case Detection, Diagnosis, and Treatment: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2016;101(5):1889–1916.',
      doi: '10.1210/jc.2015-4061',
      url: 'https://doi.org/10.1210/jc.2015-4061'
    },
    nieman_es_cushing_2008: {
      label_short: 'Endocrine Society Cushing 2008 (Nieman)',
      full_cite: 'Nieman LK, Biller BMK, Findling JW, Newell-Price J, Savage MO, Stewart PM, Montori VM. The Diagnosis of Cushing\'s Syndrome: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2008;93(5):1526–1540.',
      doi: '10.1210/jc.2008-0125',
      url: 'https://doi.org/10.1210/jc.2008-0125'
    },
    pludowski_vitd_2023: {
      label_short: 'Polski konsensus wit. D 2023 (Płudowski)',
      full_cite: 'Płudowski P, Kos-Kudła B, Walczak M, Fal A, Zozulińska-Ziółkiewicz D, Sieroszewski P, Peregud-Pogorzelski J, Lauterbach R, Targowski T, Lewiński A i wsp. Guidelines for Preventing and Treating Vitamin D Deficiency: A 2023 Update in Poland. Nutrients. 2023;15(3):695.',
      doi: '10.3390/nu15030695',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9920487/'
    },
    caliper_bailey_2013: {
      label_short: 'CALIPER 2013 — sterydy LC-MS/MS (Bailey)',
      full_cite: 'Bailey D, Colantonio D, Kyriakopoulou L, Cohen AH, Chan MK, Armbruster D, Adeli K. Marked biological variance in endocrine and biochemical markers in childhood: establishment of pediatric reference intervals using healthy community children from the CALIPER cohort. Clin Chem. 2013;59(9):1393–1405.',
      pmid: '23637247',
      url: 'https://pubmed.ncbi.nlm.nih.gov/23637247/'
    },
    caliper_konforte_2013: {
      label_short: 'CALIPER 2013 — hormony płodności (Konforte)',
      full_cite: 'Konforte D, Shea JL, Kyriakopoulou L, Colantonio D, Cohen AH, Shaw J, Bailey D, Chan MK, Armbruster D, Adeli K. Complex biological pattern of fertility hormones in children and adolescents: a study of healthy children from the CALIPER cohort and establishment of pediatric reference intervals. Clin Chem. 2013;59(8):1215–1227.',
      pmid: '23637248',
      url: 'https://pubmed.ncbi.nlm.nih.gov/23637248/'
    },
    caliper_kyriakopoulou_2013: {
      label_short: 'CALIPER 2013 — 8 sterydów MS (Kyriakopoulou)',
      full_cite: 'Kyriakopoulou L, Yazdanpanah M, Colantonio DA, Chan MK, Daly CH, Adeli K. A sensitive and rapid mass spectrometric method for the simultaneous measurement of eight steroid hormones and CALIPER pediatric reference intervals. Clin Biochem. 2013;46(7-8):642–651.',
      pmid: '23337690',
      url: 'https://pubmed.ncbi.nlm.nih.gov/23337690/'
    },
    caliper_bohn_2021: {
      label_short: 'CALIPER 2021 — Siemens Atellica (Bohn)',
      full_cite: 'Bohn MK, Higgins V, Tahmasebi H, Hall A, Liu E, Adeli K. Pediatric reference intervals for endocrine markers and fertility hormones in healthy children and adolescents on the Siemens Healthineers Atellica immunoassay system. Clin Chem Lab Med. 2021;59(8):1421–1430.',
      pmid: '33957708',
      url: 'https://pubmed.ncbi.nlm.nih.gov/33957708/'
    },
    mayo_test_catalog: {
      label_short: 'Mayo Clinic Laboratories — Test Catalog',
      full_cite: 'Mayo Clinic Laboratories. Test Catalog. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog'
    },
    soldin_2005_immulite: {
      label_short: 'Soldin 2005 — IMMULITE 1000 (pediatria)',
      full_cite: 'Soldin SJ, Hoffman EG, Waring MA, Soldin OP. Pediatric reference intervals for FSH, LH, estradiol, T3, free T3, cortisol, and growth hormone on the DPC IMMULITE 1000. Clin Chim Acta. 2005;355(1-2):205-210.',
      pmid: '15820497',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3636986/'
    },
    soldin_2009_lcms: {
      label_short: 'Soldin 2009 — LC-MS/MS (pediatria)',
      full_cite: 'Soldin OP, Sharma H, Husted L, Soldin SJ. Pediatric reference intervals for aldosterone, 17α-hydroxyprogesterone, dehydroepiandrosterone, testosterone and 25-hydroxy vitamin D3 using tandem mass spectrometry. Clin Biochem. 2009;42(9):823-827.',
      pmid: '19318024',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3637995/'
    },
    mayo_ohpg_neonatal: {
      label_short: 'Mayo OHPG — noworodki / Von Schnakenburg 1980',
      full_cite: 'Mayo Clinic Laboratories, Test ID OHPG (17-Hydroxyprogesterone, Serum) — wartości referencyjne dla noworodków. Von Schnakenburg K, Bidlingmaier F, Knorr D. 17-hydroxyprogesterone, androstenedione, and testosterone in normal children and in prepubertal patients with congenital adrenal hyperplasia. Eur J Pediatr. 1980;133(3):259-267.',
      pmid: null,
      url: 'https://pediatric.testcatalog.org/show/OHPG'
    },
    kushnir_2006_steroids: {
      label_short: 'Kushnir 2006 — pediatryczne sterydy LC-MS/MS',
      full_cite: 'Kushnir MM, Rockwood AL, Roberts WL, Pattison EG, Bunker AM, Fitzgerald RL, Meikle AW. Performance characteristics of a novel tandem mass spectrometry assay for serum testosterone. Clin Chem. 2006;52(8):1559-1567.',
      pmid: '16823014',
      url: 'https://academic.oup.com/clinchem/article/52/8/1559/5628186'
    },
    soldin_2005_aacc: {
      label_short: 'Soldin Pediatric Reference Ranges (AACC) 2005',
      full_cite: 'Soldin SJ, Brugnara C, Wong EC, eds. Pediatric Reference Ranges. 5th ed. Washington, DC: AACC Press; 2005.',
      url: null
    },
    // — Poszczególne testy Mayo Clinic Test Catalog. Każdy URL prowadzi do
    //   konkretnej strony testu, dzięki czemu w sekcji „Źródła" lekarz może
    //   sięgnąć po pełną dokumentację metodyki, granic detekcji itd.
    mayo_test_acth: {
      label_short: 'Mayo Test 8411 — ACTH, Plasma',
      full_cite: 'Mayo Clinic Laboratories. Test 8411 — Adrenocorticotropic Hormone (ACTH), Plasma. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/8411'
    },
    mayo_test_11dc: {
      label_short: 'Mayo Test 46920 — 11-Deoxycortisol',
      full_cite: 'Mayo Clinic Laboratories. Test 46920 — 11-Deoxycortisol, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/46920'
    },
    mayo_test_cortico: {
      label_short: 'Mayo Test 88221 — Corticosterone',
      full_cite: 'Mayo Clinic Laboratories. Test 88221 — Corticosterone, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/88221'
    },
    mayo_test_17oh_preg: {
      label_short: 'Mayo Test 81151 — 17-OH-Pregnenolon',
      full_cite: 'Mayo Clinic Laboratories. Test 81151 — 17-Hydroxypregnenolone, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/81151'
    },
    mayo_test_pregnenolone: {
      label_short: 'Mayo Test 88645 — Pregnenolon',
      full_cite: 'Mayo Clinic Laboratories. Test 88645 — Pregnenolone, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/88645'
    },
    mayo_test_dhea: {
      label_short: 'Mayo Test 81405 — DHEA',
      full_cite: 'Mayo Clinic Laboratories. Test 81405 — Dehydroepiandrosterone (DHEA), Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/81405'
    },
    mayo_test_dheas: {
      label_short: 'Mayo Test 113595 — DHEA-S',
      full_cite: 'Mayo Clinic Laboratories. Test 113595 — Dehydroepiandrosterone Sulfate (DHEA-S), Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/113595'
    },
    mayo_test_androstenedione: {
      label_short: 'Mayo Test 9709 — Androstendion',
      full_cite: 'Mayo Clinic Laboratories. Test 9709 — Androstenedione, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/9709'
    },
    mayo_test_free_t: {
      label_short: 'Mayo Test 83686 — Testosteron wolny + całk. + biodostępny',
      full_cite: 'Mayo Clinic Laboratories. Test 83686 — Testosterone, Total, Bioavailable, and Free, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/83686'
    },
    mayo_test_dht: {
      label_short: 'Mayo Test 81479 — DHT',
      full_cite: 'Mayo Clinic Laboratories. Test 81479 — Dihydrotestosterone (DHT), Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/81479'
    },
    mayo_test_estradiol: {
      label_short: 'Mayo Test 81816 — Estradiol (LC-MS/MS)',
      full_cite: 'Mayo Clinic Laboratories. Test 81816 — Estradiol, Serum (HPLC-MS/MS). Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/81816'
    },
    mayo_test_estrone: {
      label_short: 'Mayo Test 81418 — Estron',
      full_cite: 'Mayo Clinic Laboratories. Test 81418 — Estrone (E1), Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/81418'
    },
    mayo_test_progesterone: {
      label_short: 'Mayo Test 8141 — Progesteron',
      full_cite: 'Mayo Clinic Laboratories. Test 8141 — Progesterone, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/8141'
    },
    pyrzak_walczak_2023: {
      label_short: 'Endokrynologia wieku rozwojowego (Pyrżak, Walczak 2023)',
      full_cite: 'Pyrżak B, Walczak M, red. Endokrynologia wieku rozwojowego. Wyd. 2. Warszawa: PZWL Wydawnictwo Lekarskie; 2023.',
      url: null
    },
    ptmrie_ptgp_2018: {
      label_short: 'PTMRiE / PTGP 2018 — rekomendacje niepłodności',
      full_cite: 'Rekomendacje Polskiego Towarzystwa Medycyny Rozrodu i Embriologii (PTMRiE) oraz Polskiego Towarzystwa Ginekologów i Położników (PTGP) dotyczące diagnostyki i leczenia niepłodności. 2018.',
      url: 'https://www.ptmrie.org.pl/rekomendacje'
    },
    snibe_maglumi_v11: {
      label_short: 'Maglumi V11.0 IFU (Snibe)',
      full_cite: 'Snibe Diagnostic. Maglumi serum estradiol / progesterone / 17-OH-progesterone IFU (Instructions for Use), wersja V11.0. Shenzhen, China.',
      url: 'https://www.snibe.com/'
    },

    // ── Tarczyca (paczka 4a) ──────────────────────────────────────────────
    mayo_test_tsh: {
      label_short: 'Mayo Test 8939 — TSH',
      full_cite: 'Mayo Clinic Laboratories. Test 8939 (STSH) — Thyroid-Stimulating Hormone (sensitive), Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/8939'
    },
    mayo_test_ft4: {
      label_short: 'Mayo Test 8725 — fT4',
      full_cite: 'Mayo Clinic Laboratories. Test 8725 (FRT4) — Thyroxine (T4), Free, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/8725'
    },
    mayo_test_ft3: {
      label_short: 'Mayo Test 621321 — fT3',
      full_cite: 'Mayo Clinic Laboratories. Test 621321 (T3FR) — Triiodothyronine (T3), Free, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/621321'
    },
    mayo_test_t4_total: {
      label_short: 'Mayo Test 8724 — T4 całkowita',
      full_cite: 'Mayo Clinic Laboratories. Test 8724 (T4) — Thyroxine (T4), Total Only, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/8724'
    },
    mayo_test_t3_total: {
      label_short: 'Mayo Test 8613 — T3 całkowita',
      full_cite: 'Mayo Clinic Laboratories. Test 8613 (T3) — Triiodothyronine (T3), Total, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/8613'
    },
    mayo_test_tg: {
      label_short: 'Mayo Test 62800 — Tg (tyreoglobulina)',
      full_cite: 'Mayo Clinic Laboratories. Test 62800 (HTG2) — Thyroglobulin, Tumor Marker, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/62800'
    },
    pte_hubalewska_2021_pregnancy: {
      label_short: 'PTE 2021 — tarczyca w ciąży (Hubalewska-Dydejczyk)',
      full_cite: 'Hubalewska-Dydejczyk A, Trofimiuk-Müldner M, Ruchała M, Lewiński A, Bednarczuk T, Zgliczyński W, Syrenicz A, Kos-Kudła B, Jarząb B, Gietka-Czernel M, Hubalewska-Dydejczyk T, Ostrowska L, Kalicka-Kasperczyk A. Thyroid diseases in pregnancy: guidelines of the Polish Society of Endocrinology. Endokrynol Pol. 2021;72(5):425-488.',
      pmid: '34855189',
      doi: '10.5603/EP.a2021.0089',
      url: 'https://journals.viamedica.pl/endokrynologia_polska/article/view/86218'
    },
    jarzab_dtc_adults_2022: {
      label_short: 'Polskie wytyczne DTC dorośli 2022 (Jarząb)',
      full_cite: 'Jarząb B, Dedecjus M, Lewiński A, Adamczewski Z, Bagłaj M, Bałdys-Waligórska A, Barczyński M, Biernat W, Bobek-Billewicz B i wsp. Diagnosis and treatment of thyroid cancer in adult patients — Recommendations of Polish Scientific Societies and the National Oncological Strategy. 2022 Update. Endokrynol Pol. 2022;73(2):173-300.',
      pmid: '35593680',
      doi: '10.5603/EP.a2022.0028',
      url: 'https://journals.viamedica.pl/endokrynologia_polska/article/view/89101'
    },
    handkiewicz_junak_dtc_children_2024: {
      label_short: 'Polskie wytyczne DTC dzieci 2024 (Handkiewicz-Junak)',
      full_cite: 'Handkiewicz-Junak D, Niedziela M, Lewiński A i wsp. Diagnostics and treatment of differentiated thyroid carcinoma in children — Guidelines of the Polish National Scientific Societies, 2024 Update. Endokrynol Pol. 2024;75(6):565-591.',
      pmid: '39829212',
      doi: '10.5603/ep.103845',
      url: 'https://journals.viamedica.pl/endokrynologia_polska/article/view/103845'
    },
    caliper_bohn_2021_atellica: {
      label_short: 'CALIPER Bohn 2021 — Atellica (pediatria)',
      full_cite: 'Bohn MK, Horn P, League D, Steele P, Hall A, Adeli K. Pediatric reference intervals for endocrine markers and fertility hormones in healthy children and adolescents on the Siemens Healthineers Atellica immunoassay system. Clin Chem Lab Med. 2021;59(8):1421-1430.',
      pmid: '33957708',
      doi: '10.1515/cclm-2021-0050',
      url: 'https://doi.org/10.1515/cclm-2021-0050'
    },
    kapelari_thyroid_pediatric_2008: {
      label_short: 'Kapelari 2008 — pediatryczne RI tarczycy',
      full_cite: 'Kapelari K, Kirchlechner C, Högler W, Schweitzer K, Virgolini I, Moncayo R. Pediatric reference intervals for thyroid hormone levels from birth to adulthood: a retrospective study. BMC Endocr Disord. 2008;8:15.',
      pmid: '19036169',
      doi: '10.1186/1472-6823-8-15',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2645400/'
    },
    kucharska_pte_chypo_2016: {
      label_short: 'Polskie rekomendacje WNT 2016 (Kucharska)',
      full_cite: 'Kucharska AM, Beń-Skowronek I, Walczak M, Ołtarzewski M, Szalecki M, Jackowska T, Bossowski A, Pyrżak B, Niedziela M. Congenital hypothyroidism — Polish recommendations for therapy, treatment monitoring, and screening tests in special categories of neonates with increased risk of hypothyroidism. Endokrynol Pol. 2016;67(5):536-547.',
      pmid: '27759154',
      doi: '10.5603/EP.2016.0062',
      url: 'https://journals.viamedica.pl/endokrynologia_polska/article/view/EP.2016.0062/38001'
    },
    pl_screening_program_2019_2026: {
      label_short: 'Polski program przesiewowy noworodków 2019–2026',
      full_cite: 'Ministerstwo Zdrowia RP. Rządowy program badań przesiewowych noworodków w Rzeczypospolitej Polskiej na lata 2019-2026.',
      url: 'https://www.gov.pl/web/zdrowie/program-badan-przesiewowych-noworodkow'
    },

    // ── Przysadka + gonady (paczka 4b) ────────────────────────────────────
    mayo_test_igf1: {
      label_short: 'Mayo Test 62750 — IGF-1 (LC-MS/MS)',
      full_cite: 'Mayo Clinic Laboratories. Test 62750 (IGFMS) — Insulin-Like Growth Factor 1 (IGF-1), Serum, by LC-MS/MS. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/62750'
    },
    mayo_test_igfbp3: {
      label_short: 'Mayo Test 83300 — IGFBP-3',
      full_cite: 'Mayo Clinic Laboratories. Test 83300 (IGFB3) — Insulin-Like Growth Factor Binding Protein 3, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/83300'
    },
    mayo_test_prolactin: {
      label_short: 'Mayo Test 85670 — Prolaktyna',
      full_cite: 'Mayo Clinic Laboratories. Test 85670 (PRL) — Prolactin, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/85670'
    },
    mayo_test_lh_adult: {
      label_short: 'Mayo Test 602752 — LH (dorośli)',
      full_cite: 'Mayo Clinic Laboratories. Test 602752 (LH) — Luteinizing Hormone (LH), Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/602752'
    },
    mayo_test_lh_pediatric: {
      label_short: 'Mayo Test 62999 — LHPED (pediatria, czułość 0.02 IU/L)',
      full_cite: 'Mayo Clinic Laboratories. Test 62999 (LHPED) — Luteinizing Hormone (LH), Pediatric, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/62999'
    },
    mayo_test_fsh: {
      label_short: 'Mayo Test 602753 — FSH',
      full_cite: 'Mayo Clinic Laboratories. Test 602753 (FSH) — Follicle-Stimulating Hormone (FSH), Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/602753'
    },
    mayo_test_inhibin_b: {
      label_short: 'Mayo Test 88722 — Inhibina B',
      full_cite: 'Mayo Clinic Laboratories. Test 88722 (INHB) — Inhibin B, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/88722'
    },
    mayo_test_amh: {
      label_short: 'Mayo Test 608824 — AMH',
      full_cite: 'Mayo Clinic Laboratories. Test 608824 (AMH1) — Antimüllerian Hormone (AMH), Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/608824'
    },
    mayo_test_shbg: {
      label_short: 'Mayo Test 608102 — SHBG',
      full_cite: 'Mayo Clinic Laboratories. Test 608102 (SHBG1) — Sex Hormone-Binding Globulin, Serum. Rochester, MN.',
      url: 'https://www.mayocliniclabs.com/test-catalog/Overview/608102'
    },
    bidlingmaier_igf1_2014: {
      label_short: 'Bidlingmaier 2014 — IGF-1 reference data',
      full_cite: 'Bidlingmaier M, Friedrich N, Emeny RT i wsp. Reference intervals for insulin-like growth factor-1 (IGF-I) from birth to senescence: results from a multicenter study using a new automated chemiluminescence IGF-I immunoassay conforming to recent international recommendations. J Clin Endocrinol Metab. 2014;99(5):1712-1721.',
      pmid: '24606072',
      doi: '10.1210/jc.2013-3059',
      url: 'https://academic.oup.com/jcem/article/99/5/1712/2537500'
    },
    andersson_inhibin_b_1998: {
      label_short: 'Andersson 1998 — inhibina B w mini-puberty',
      full_cite: 'Andersson AM, Toppari J, Haavisto AM, Petersen JH, Simell T, Simell O, Skakkebaek NE. Longitudinal reproductive hormone profiles in infants: peak of inhibin B levels in infant boys exceeds levels in adult men. J Clin Endocrinol Metab. 1998;83(11):4109-4113.',
      pmid: '9814500',
      doi: '10.1210/jcem.83.11.5306',
      url: 'https://academic.oup.com/jcem/article/83/11/4109/2865499'
    },
    elmlinger_shbg_2005: {
      label_short: 'Elmlinger 2005 — SHBG pediatria',
      full_cite: 'Elmlinger MW, Kühnel W, Wormstall H, Döller PC. Reference intervals for testosterone, androstenedione and SHBG levels in healthy females and males from birth until old age. Clin Chem Lab Med. 2005;43(10):1098-1102.',
      pmid: '16329620',
      doi: '10.1515/CCLM.2005.193',
      url: null
    },
    bohn_amh_caliper_2022: {
      label_short: 'CALIPER Bohn 2022 — AMH pediatryczne',
      full_cite: 'Bohn MK, Higgins V, Tahmasebi H, Hall A, Liu E, Adeli K. Establishment of pediatric reference intervals for anti-Müllerian hormone in healthy children and adolescents. Clin Biochem. 2022;107:33-38.',
      pmid: '35760370',
      doi: '10.1016/j.clinbiochem.2022.06.011',
      url: null
    },
    nfz_ivf_2025: {
      label_short: 'NFZ — kryteria refundacji IVF',
      full_cite: 'Narodowy Fundusz Zdrowia. Kryteria refundacji procedur in vitro (próg AMH ≥ 0,7 ng/mL).',
      url: 'https://www.nfz.gov.pl/'
    },
    eshre_pcos_2023: {
      label_short: 'ESHRE 2023 — PCOS Rotterdam criteria',
      full_cite: 'Teede HJ, Tay CT, Laven J i wsp. Recommendations from the 2023 International Evidence-based Guideline for the Assessment and Management of Polycystic Ovary Syndrome. Fertil Steril. 2023;120(4):767-793.',
      pmid: '37589596',
      doi: '10.1016/j.fertnstert.2023.07.025',
      url: 'https://www.eshre.eu/Guidelines-and-Legal/Guidelines/Polycystic-Ovary-Syndrome'
    }
  };

  var SUBSTANCES = [

    /* ───────────── Glikokortykosteroidy / oś nadnerczowa ───────────── */

    {
      id: 'cortisol',
      label_pl: 'Kortyzol',
      label_en: 'Cortisol',
      aliases: ['hydrocortisone (endogenny)', 'F', 'compound F'],
      group: 'Kora nadnerczy – glikokortykosteroidy',
      mw: 362.46,
      canonical_si: 'nmol/L',
      clinical_indications: ['adrenal_insufficiency', 'cushing', 'short_stature', 'obesity', 'obesity_kids', 'hypertension', 'cah', 'hyponatremia', 'diabetes_insipidus'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)',  kind: 'si',   factor_to_si: 1 },
        { symbol: 'μmol/L', label: 'μmol/L',        kind: 'si',   factor_to_si: 1000 },
        { symbol: 'μg/dL',  label: 'μg/dL',         kind: 'conv', factor_to_si: 27.59 },
        { symbol: 'ng/mL',  label: 'ng/mL',         kind: 'conv', factor_to_si: 2.759 },
        { symbol: 'ng/dL',  label: 'ng/dL',         kind: 'conv', factor_to_si: 0.02759 },
        { symbol: 'pg/mL',  label: 'pg/mL',         kind: 'conv', factor_to_si: 0.002759 }
      ],
      precision: 3,
      default_range_si: { low: 138, high: 690, context_pl: 'Dorośli, rano (≈ 8:00)' },
      reference_ranges_si: [
        // ── Pediatria, time-aware ────────────────────────────────────────
        //  Wartości poranne — Soldin 2005 (IMMULITE 1000, podejście Hoffmanna).
        //  Wartości wieczorne — ekstrapolacja kliniczna z rytmu dobowego: u dzieci
        //  > 6 mies. wartość wieczorna powinna spaść do ≤ 50 % porannej (Tietz).
        //  Wartości nocne (midnight) — próg diagnostyczny Cushinga < 207 nmol/L
        //  (Nieman ES 2008), wspólny dla dorosłych i dzieci > 12 mies.
        //  Dla niemowląt 0–2 lat rytm dobowy NIE jest jeszcze ustalony — używamy
        //  tego samego (porannego) zakresu niezależnie od pory.
        //
        //  0–2 lat (brak rytmu dobowego — wszystkie pory identyczne)
        { id: 'cortisol_ped_0_2_morning',  when: { age_min: 0, age_max: 2, life_stage: 'pediatric', time_of_day: 'morning' },
          low: 28, high: 966, context_pl: 'Dzieci 0–2 lat, pobranie poranne',
          source_ids: ['soldin_2005_immulite'] },
        { id: 'cortisol_ped_0_2_evening',  when: { age_min: 0, age_max: 2, life_stage: 'pediatric', time_of_day: 'evening' },
          low: 28, high: 966, context_pl: 'Dzieci 0–2 lat — rytm dobowy nie jest jeszcze ustalony; ten sam zakres co rano',
          source_ids: ['soldin_2005_immulite', 'tietz_2018'] },
        { id: 'cortisol_ped_0_2_midnight', when: { age_min: 0, age_max: 2, life_stage: 'pediatric', time_of_day: 'midnight' },
          low: 28, high: 966, context_pl: 'Dzieci 0–2 lat — rytm dobowy nie jest jeszcze ustalony',
          source_ids: ['soldin_2005_immulite', 'tietz_2018'] },
        { id: 'cortisol_ped_0_2',          when: { age_min: 0, age_max: 2, life_stage: 'pediatric' },
          low: 28, high: 966, context_pl: 'Dzieci 0–2 lat (zakres ogólny, brak rytmu dobowego)',
          source_ids: ['soldin_2005_immulite'] },
        //  2–6 lat (rytm dobowy wykształcony)
        { id: 'cortisol_ped_2_6_morning',  when: { age_min: 2, age_max: 6, life_stage: 'pediatric', time_of_day: 'morning' },
          low: 28, high: 717, context_pl: 'Dzieci 2–6 lat, pobranie poranne',
          source_ids: ['soldin_2005_immulite'] },
        { id: 'cortisol_ped_2_6_evening',  when: { age_min: 2, age_max: 6, life_stage: 'pediatric', time_of_day: 'evening' },
          low: 28, high: 360, context_pl: 'Dzieci 2–6 lat, pobranie wieczorne (≤ 50 % wartości porannej)',
          source_ids: ['tietz_2018', 'soldin_2005_immulite'] },
        { id: 'cortisol_ped_2_6_midnight', when: { age_min: 2, age_max: 6, life_stage: 'pediatric', time_of_day: 'midnight' },
          low: 0, high: 207, context_pl: 'Dzieci 2–6 lat, pobranie nocne (diagnostyka Cushinga; próg < 207 nmol/L)',
          source_ids: ['nieman_es_cushing_2008'] },
        { id: 'cortisol_ped_2_6',          when: { age_min: 2, age_max: 6, life_stage: 'pediatric' },
          low: 28, high: 717, context_pl: 'Dzieci 2–6 lat (domyślnie poranne)',
          source_ids: ['soldin_2005_immulite'] },
        //  6–11 lat
        { id: 'cortisol_ped_6_11_morning',  when: { age_min: 6, age_max: 11, life_stage: 'pediatric', time_of_day: 'morning' },
          low: 28, high: 1049, context_pl: 'Dzieci 6–11 lat, pobranie poranne',
          source_ids: ['soldin_2005_immulite'] },
        { id: 'cortisol_ped_6_11_evening',  when: { age_min: 6, age_max: 11, life_stage: 'pediatric', time_of_day: 'evening' },
          low: 28, high: 525, context_pl: 'Dzieci 6–11 lat, pobranie wieczorne (≤ 50 % wartości porannej)',
          source_ids: ['tietz_2018', 'soldin_2005_immulite'] },
        { id: 'cortisol_ped_6_11_midnight', when: { age_min: 6, age_max: 11, life_stage: 'pediatric', time_of_day: 'midnight' },
          low: 0, high: 207, context_pl: 'Dzieci 6–11 lat, pobranie nocne (próg Cushinga < 207 nmol/L)',
          source_ids: ['nieman_es_cushing_2008'] },
        { id: 'cortisol_ped_6_11',          when: { age_min: 6, age_max: 11, life_stage: 'pediatric' },
          low: 28, high: 1049, context_pl: 'Dzieci 6–11 lat (domyślnie poranne)',
          source_ids: ['soldin_2005_immulite'] },
        //  11–15 lat
        { id: 'cortisol_ped_11_15_morning',  when: { age_min: 11, age_max: 15, life_stage: 'pediatric', time_of_day: 'morning' },
          low: 55, high: 690, context_pl: 'Młodzież 11–15 lat, pobranie poranne',
          source_ids: ['soldin_2005_immulite'] },
        { id: 'cortisol_ped_11_15_evening',  when: { age_min: 11, age_max: 15, life_stage: 'pediatric', time_of_day: 'evening' },
          low: 28, high: 345, context_pl: 'Młodzież 11–15 lat, pobranie wieczorne (≤ 50 % wartości porannej)',
          source_ids: ['tietz_2018', 'soldin_2005_immulite'] },
        { id: 'cortisol_ped_11_15_midnight', when: { age_min: 11, age_max: 15, life_stage: 'pediatric', time_of_day: 'midnight' },
          low: 0, high: 207, context_pl: 'Młodzież 11–15 lat, pobranie nocne (próg Cushinga < 207 nmol/L)',
          source_ids: ['nieman_es_cushing_2008'] },
        { id: 'cortisol_ped_11_15',          when: { age_min: 11, age_max: 15, life_stage: 'pediatric' },
          low: 55, high: 690, context_pl: 'Młodzież 11–15 lat (domyślnie poranne)',
          source_ids: ['soldin_2005_immulite'] },
        //  15–18 lat
        { id: 'cortisol_ped_15_18_morning',  when: { age_min: 15, age_max: 18, life_stage: 'pediatric', time_of_day: 'morning' },
          low: 28, high: 856, context_pl: 'Młodzież 15–18 lat, pobranie poranne',
          source_ids: ['soldin_2005_immulite'] },
        { id: 'cortisol_ped_15_18_evening',  when: { age_min: 15, age_max: 18, life_stage: 'pediatric', time_of_day: 'evening' },
          low: 28, high: 428, context_pl: 'Młodzież 15–18 lat, pobranie wieczorne (≤ 50 % wartości porannej)',
          source_ids: ['tietz_2018', 'soldin_2005_immulite'] },
        { id: 'cortisol_ped_15_18_midnight', when: { age_min: 15, age_max: 18, life_stage: 'pediatric', time_of_day: 'midnight' },
          low: 0, high: 207, context_pl: 'Młodzież 15–18 lat, pobranie nocne (próg Cushinga < 207 nmol/L)',
          source_ids: ['nieman_es_cushing_2008'] },
        { id: 'cortisol_ped_15_18',          when: { age_min: 15, age_max: 18, life_stage: 'pediatric' },
          low: 28, high: 856, context_pl: 'Młodzież 15–18 lat (domyślnie poranne)',
          source_ids: ['soldin_2005_immulite'] },
        // — Dorosły, time-aware. Wartości referencyjne ustanawiane standardowo
        //   dla pobrania porannego. Dla wieczornego/midnight — osobne zakresy
        //   (klinicznie istotne w diagnostyce zespołu Cushinga).
        { id: 'cortisol_adult_post_dst', when: { test_protocol: 'post_dst' },
          low: 0, high: 50,
          context_pl: 'Po teście hamowania 1 mg deksametazonu (overnight DST). Wartość ≥ 50 nmol/L (≥ 1,8 μg/dL) sugeruje brak hamowania → diagnostyka Cushinga.',
          source_ids: ['nieman_es_cushing_2008'] },
        { id: 'cortisol_adult_midnight', when: { life_stage: 'adult', time_of_day: 'midnight' },
          low: 0, high: 207,
          context_pl: 'Dorośli, próbka o północy (22:00–24:00) — diagnostyka zespołu Cushinga. Wartość > 207 nmol/L (> 7,5 μg/dL) sugeruje utratę rytmu dobowego.',
          source_ids: ['nieman_es_cushing_2008', 'tietz_2018'] },
        { id: 'cortisol_adult_evening', when: { life_stage: 'adult', time_of_day: 'evening' },
          low: 28, high: 276,
          context_pl: 'Dorośli, pobranie popołudniowe/wieczorne (14:00–22:00). Wartości orientacyjne; pora niewskazana dla rutynowej oceny — diagnostyka tylko w kontekście zespołu Cushinga.',
          source_ids: ['tietz_2018'] },
        { id: 'cortisol_adult_morning', when: { life_stage: 'adult', time_of_day: 'morning' },
          low: 138, high: 690,
          context_pl: 'Dorośli, pobranie poranne (7:00–10:00)',
          source_ids: ['tietz_2018', 'nieman_es_cushing_2008'] },
        // Pozostały fallback — gdy brak ustalonej pory i protokołu, traktujemy jak poranne.
        { id: 'cortisol_adult', when: {},
          low: 138, high: 690, context_pl: 'Dorośli, rano (≈ 8:00) — zakres przyjęty domyślnie',
          source_ids: ['tietz_2018', 'nieman_es_cushing_2008'] }
      ],
      ranges_pl: [
        'Surowica, rano (≈ 8:00): 138–690 nmol/L (5–25 μg/dL)',
        'Surowica, wieczorem (≈ 23:00): < 138 nmol/L (< 5 μg/dL)',
        'Po 1 mg deksametazonu (overnight): < 50 nmol/L (< 1,8 μg/dL)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'Kortyzol — główny glikokortykoid produkowany w korze nadnerczy. Stężenie zależne od rytmu dobowego (szczyt rano, minimum o północy), stresu, ciąży i doustnej antykoncepcji (↑ CBG = corticosteroid-binding globulin). Pomiar zawsze interpretowany w odniesieniu do pory pobrania i kontekstu klinicznego.'
          },
          {
            title: 'Diagnostyka zespołu Cushinga — test DST overnight',
            body: [
              'Polskie wytyczne PTE (Bednarczuk i wsp., Endokrynol Pol) oraz Endocrine Society 2008/2015 (Nieman):',
              { items: [
                { label: 'Protokół', text: 'pacjent przyjmuje 1 mg deksametazonu o 23:00; pobranie kortyzolu rano (8:00–9:00) dnia następnego.' },
                { label: 'Kortyzol < 50 nmol/L (1,8 μg/dL)', text: 'wyklucza autonomię — wynik prawidłowy.' },
                { label: 'Kortyzol 50–138 nmol/L', text: 'wynik niejednoznaczny — rozważ powtórzenie / dalsze testy.' },
                { label: 'Kortyzol > 138 nmol/L (5 μg/dL)', text: 'potwierdza autonomię (zespół Cushinga lub subkliniczny zespół Cushinga w incydentaloma).' }
              ]}
            ]
          },
          {
            title: 'Diagnostyka niedoczynności kory nadnerczy — test stymulacji Synacthen',
            body: [
              'Polskie wytyczne PTE (Bednarczuk) oraz Endocrine Society 2016 (Bornstein):',
              { items: [
                { label: 'Protokół', text: 'Synacthen 250 μg i.v., pomiar kortyzolu w czasie 0 i 30/60 min.' },
                { label: 'Szczytowy kortyzol < 500 nmol/L (18 μg/dL)', text: 'potwierdza niedoczynność kory nadnerczy.' },
                { label: 'Szczytowy kortyzol > 500 nmol/L', text: 'wyklucza pierwotną postać niedoczynności (choroba Addisona).' }
              ]},
              { label: 'Pułapka', text: 'w postaci wtórnej (SAI — secondary adrenal insufficiency) test może być prawidłowy w okresie ostrym, bo gruczoły nadnerczy są nieuszkodzone — wymagany dłuższy okres deprywacji ACTH, by wystąpiła atrofia.' }
            ]
          }
        ]
      },
      sources: ['Tietz', 'Endocrine Society 2008/2015 (Nieman, Cushing)', 'Endocrine Society 2016 (Bornstein, PAI)', 'PTE Bednarczuk (DST, Synacthen)']
    },

    {
      id: 'acth',
      label_pl: 'ACTH (kortykotropina)',
      label_en: 'ACTH (corticotropin)',
      aliases: ['adrenokortykotropina', 'corticotropin'],
      group: 'Kora nadnerczy – glikokortykosteroidy',
      mw: 4541.1,                                              // peptyd 39-aa (ludzki ACTH)
      canonical_si: 'pmol/L',
      clinical_indications: ['adrenal_insufficiency', 'cushing', 'cah', 'hyponatremia'],
      units: [
        { symbol: 'pmol/L', label: 'pmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 0.2203 },
        { symbol: 'ng/L',   label: 'ng/L',         kind: 'conv', factor_to_si: 0.2203 }
      ],
      precision: 3,
      default_range_si: { low: 2.2, high: 13.3, context_pl: 'Dorośli, rano (≈ 8:00)' },
      reference_ranges_si: [
        // Mayo Test 8411 jawnie podaje: „Pediatric reference values are the same
        // as adults" (cytowane: Petersen KE. Acta Paediatr Scand 1981;70:341-345).
        // Górna granica Mayo 13.9 pmol/L (63 pg/mL) ≈ górnej Tietz 13.3.
        { id: 'acth_morning', when: { time_of_day: 'morning' },
          low: 1.6, high: 13.9, context_pl: 'Wszystkie grupy wiekowe, pobranie poranne (7:00–10:00)',
          source_ids: ['mayo_test_acth', 'tietz_2018'] },
        { id: 'acth_evening', when: { time_of_day: 'evening' },
          low: 0, high: 5,
          context_pl: 'Pobranie popołudniowe/wieczorne — wartości orientacyjne; Mayo nie ustanawia formalnego zakresu dla tej pory.',
          source_ids: ['tietz_2018', 'mayo_test_acth'] },
        { id: 'acth_midnight', when: { time_of_day: 'midnight' },
          low: 0, high: 5,
          context_pl: 'Pobranie nocne (22:00–02:00). Wartość > 5 pmol/L sugeruje utratę rytmu dobowego.',
          source_ids: ['nieman_es_cushing_2008', 'tietz_2018'] },
        // Fallback — gdy brak ustalonej pory, używamy zakresu porannego.
        { id: 'acth_all_ages', when: {},
          low: 1.6, high: 13.9, context_pl: 'Wszystkie grupy wiekowe, zakres poranny (domyślnie)',
          source_ids: ['mayo_test_acth', 'tietz_2018'] }
      ],
      ranges_pl: [
        'Surowica, rano (≈ 8:00): 2,2–13,3 pmol/L (10–60 pg/mL)',
        'Wieczorem: zwykle < 5 pmol/L (< 20 pg/mL)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'ACTH (kortykotropina) — hormon przysadki regulujący wydzielanie kortyzolu. Mierzony w panelu z kortyzolem w celu różnicowania przyczyn niedoczynności / nadczynności kory nadnerczy (pierwotna vs wtórna vs ektopowa).'
          },
          {
            title: 'Pobranie — bardzo ważne',
            body: [
              { items: [
                { label: 'Probówka EDTA', text: 'pobranie do SCHŁODZONEJ probówki EDTA — ACTH jest niestabilny w temperaturze pokojowej.' },
                { label: 'Szybkie odwirowanie', text: 'jak najszybciej po pobraniu (transport w lodzie).' },
                { label: 'Jednostki', text: 'ng/L i pg/mL są liczbowo identyczne.' }
              ]}
            ]
          }
        ]
      },
      sources: ['Tietz', 'Mayo Clinic Labs']
    },

    {
      id: 'aldosterone',
      label_pl: 'Aldosteron',
      label_en: 'Aldosterone',
      aliases: ['ALD'],
      group: 'Kora nadnerczy – mineralokortykosteroidy',
      mw: 360.44,
      canonical_si: 'pmol/L',
      clinical_indications: ['hypertension', 'primary_aldosteronism', 'hypokalemia', 'cah', 'adrenal_insufficiency'],
      units: [
        { symbol: 'pmol/L', label: 'pmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'nmol/L', label: 'nmol/L',       kind: 'si',   factor_to_si: 1000 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 2.774 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 27.74 },
        { symbol: 'ng/L',   label: 'ng/L',         kind: 'conv', factor_to_si: 2.774 }
      ],
      precision: 3,
      default_range_si: { low: 100, high: 860, context_pl: 'Dorośli, pozycja siedząca (po 2 h)' },
      reference_ranges_si: [
        // Pediatria — Soldin 2009 (LC-MS/MS, dwie szerokie grupy wiekowe, sex-neutral).
        // CALIPER (Bailey 2013) ma drobniejszą stratyfikację z osobną grupą noworodków
        // (< 30 dni), ale jest paywalled.
        { id: 'aldo_ped_0_8',  when: { age_min: 0, age_max: 8,  life_stage: 'pediatric' },
          low: 2.8, high: 546.5, context_pl: 'Dzieci 0–8 lat',
          source_ids: ['soldin_2009_lcms'] },
        { id: 'aldo_ped_8_18', when: { age_min: 8, age_max: 18, life_stage: 'pediatric' },
          low: 5.5, high: 554.8, context_pl: 'Młodzież 8–18 lat',
          source_ids: ['soldin_2009_lcms'] },
        { id: 'aldo_adult', when: {},
          low: 100, high: 860, context_pl: 'Dorośli, pozycja siedząca (po 2 h)',
          source_ids: ['tietz_2018', 'funder_es_pa_2016'] }
      ],
      ranges_pl: [
        'Pozycja leżąca (rano): 30–440 pmol/L (1–16 ng/dL)',
        'Pozycja siedząca (po 2 h): 100–860 pmol/L (4–31 ng/dL)',
        'Algorytm diagnostyczny PHA (skrining ARR, testy potwierdzające, lokalizacja) — zob. sekcję „Trzystopniowy algorytm PHA — PTNT 2021" poniżej.'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'Aldosteron — główny mineralokortykoid, regulator gospodarki sodowo-potasowej i ciśnienia tętniczego. Główne wskazanie do oznaczenia: diagnostyka pierwotnego hiperaldosteronizmu (PHA, zespół Conna) — najczęstsza wtórna przyczyna nadciśnienia tętniczego, znacznie niedoszacowana w Polsce. Interpretacja zawsze wymaga znajomości pozycji ciała przy pobraniu, podaży sodu i przyjmowanych leków.'
          },
          {
            title: 'Trzystopniowy algorytm PHA — PTNT 2021 (Januszewicz/Prejbisz)',
            body: [
              'Polskie wytyczne PTNT 2021 (Grupa Robocza, Nadciśnienie Tętnicze) — trzystopniowy algorytm rozpoznania pierwotnego hiperaldosteronizmu: skrining → potwierdzenie → lokalizacja.',
              { label: 'Krok 1 — skrining (ARR)' },
              { items: [
                { label: 'Próg ARR (aldosterone-to-renin ratio)', text: '> 30 (ng/dL ÷ ng/mL/h) LUB > 750 (pmol/L ÷ ng/mL/h).' },
                { label: 'Warunki pobrania', text: 'rano 8:00–10:00, pacjent na nogach ≥ 2 h, ostatnie 5–15 min siedząc.' },
                { label: 'Wyrównanie kaliemii > 4,0 mmol/L', text: 'konieczne — hipokaliemia hamuje aldosteron i daje fałszywie ujemny wynik.' },
                { label: 'Odstawienie leków zakłócających', text: 'MRA (spironolakton, eplerenon) — 4–6 tyg.; β-blokery — 2 tyg.; ACEI/ARB i NLPZ także wpływają.' }
              ]},
              { label: 'Krok 2 — potwierdzenie' },
              { items: [
                { label: 'Test obciążenia solą (NaCl 0,9%)', text: 'najczęściej stosowany w Polsce — 2 L 0,9% NaCl i.v. w ciągu 4 h. Aldosteron po teście > 5 ng/dL = potwierdzenie PHA.' },
                { label: 'Test z kaptoprilem', text: 'aldosteron > 15 ng/dL z wysokim ARR potwierdza PHA.' },
                { label: 'Test fludrokortyzonowy', text: 'alternatywa rzadziej stosowana.' }
              ]},
              { label: 'Krok 3 — lokalizacja' },
              'TK nadnerczy + AVS (adrenal venous sampling — cewnikowanie żył nadnerczowych) różnicuje:',
              { items: [
                { label: 'Jednostronny gruczolak Conn', text: 'AVS wykazuje asymetrię — leczenie operacyjne (adrenalektomia).' },
                { label: 'Obustronny przerost (BAH)', text: 'AVS symetryczne — leczenie zachowawcze (MRA).' }
              ]}
            ]
          },
          {
            title: 'Niedoszacowanie PHA w Polsce',
            body: 'Wytyczne PTNT 2021 wskazują na istotne niedoszacowanie PHA w Polsce — tylko ~1% pacjentów z nadciśnieniem jest badanych w kierunku PHA, mimo szacowanej częstości ~5–10% w HT ogółem i ~20% w HT opornym na leczenie. PTNT zaleca skrining ARR u: HT opornego, HT + hipokaliemia (samoistna lub po diuretykach), HT + incydentaloma nadnercza, HT u młodych < 40 lat, HT z udarami < 40 lat.'
          }
        ]
      },
      sources: ['Tietz', 'Endocrine Society PA Guideline 2016 (Funder)', 'PTNT 2021 (Januszewicz/Prejbisz)']
    },

    {
      id: 'deoxycortisol_11',
      label_pl: '11-deoksykortyzol',
      label_en: '11-Deoxycortisol',
      aliases: ['compound S', 'kortodoksyn', '11-DOC nie mylić z 11-deoksykortykosteronem'],
      group: 'Kora nadnerczy – prekursory steroidogenezy',
      mw: 346.46,
      canonical_si: 'nmol/L',
      clinical_indications: ['cah', 'adrenal_insufficiency'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.02886 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 2.886 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 0.002886 }
      ],
      precision: 3,
      default_range_si: { low: 0.1, high: 1.5, context_pl: 'Dorośli bazalnie (bez metyraponu)' },
      reference_ranges_si: [
        // Pediatria — Mayo Test 46920 (LC-MS/MS, sex-neutral)
        { id: 'dc11_ped', when: { life_stage: 'pediatric' },
          low: 0, high: 9.93, context_pl: 'Dzieci i młodzież ≤ 18 lat (zakres szerszy niż dorosły)',
          source_ids: ['mayo_test_11dc'] },
        { id: 'dc11_adult', when: {},
          low: 0.289, high: 2.28, context_pl: 'Dorośli, bazalnie (bez metyraponu) — Mayo LC-MS/MS',
          source_ids: ['mayo_test_11dc', 'tietz_2018', 'speiser_es_cah_2018'] }
      ],
      ranges_pl: [
        'Dorośli, bazalnie: < 1,5 nmol/L (< 52 ng/dL)',
        'Test z metyraponem (8 h po dawce): > 200 nmol/L (> 7 μg/dL) – prawidłowa rezerwa osi'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: '11-deoksykortyzol — bezpośredni prekursor kortyzolu (przekształcany przez 11β-hydroksylazę). Marker testu z metyraponem (blokada 11β-hydroksylazy → wzrost 11-deoksykortyzolu jako ocena rezerwy ACTH/przysadki) oraz niedoboru 11β-hydroksylazy (CAH typu IV — rzadka postać WPN z nadciśnieniem tętniczym i wirylizacją).'
          },
          {
            title: 'Uwaga — nie mylić z 11-deoksykortykosteronem (DOC)',
            body: '11-deoksykortyzol ≠ 11-deoksykortykosteron (DOC) — to dwie różne substancje o podobnej nazwie, w różnych miejscach szlaku steroidogenezy.'
          },
          {
            title: 'Polskie wytyczne PTEDD',
            body: 'Kucharska 2018 (Endokrynol Pediatr) wymienia niedobór 11β-hydroksylazy jako ~5% klasycznego WPN. Diagnostyka rozszerzona dopiero przy podejrzeniu klinicznym: nadciśnienie tętnicze + wirylizacja przy ujemnym 17-OHP.'
          }
        ]
      },
      sources: ['Tietz', 'ESPE/Endocrine Society CAH 2018 (Speiser)', 'PTEDD Kucharska 2018 (rzadkie postaci WPN)']
    },

    {
      id: 'corticosterone',
      label_pl: 'Kortykosteron (związek B)',
      label_en: 'Corticosterone',
      aliases: ['compound B'],
      group: 'Kora nadnerczy – prekursory steroidogenezy',
      mw: 346.46,
      canonical_si: 'nmol/L',
      clinical_indications: ['cah'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.02886 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 2.886 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 0.002886 }
      ],
      precision: 3,
      default_range_si: { low: 3.5, high: 60, context_pl: 'Dorośli, rano' },
      reference_ranges_si: [
        // Pediatria — Mayo Test 88221 (LC-MS/MS, sex-neutral, 8:00 a.m.)
        { id: 'cortico_ped', when: { life_stage: 'pediatric' },
          low: 0.52, high: 56.86, context_pl: 'Dzieci i młodzież ≤ 18 lat (rano)',
          source_ids: ['mayo_test_cortico'] },
        { id: 'cortico_adult', when: {},
          low: 1.53, high: 45.02, context_pl: 'Dorośli, rano (≈ 8:00)',
          source_ids: ['mayo_test_cortico', 'tietz_2018'] }
      ],
      ranges_pl: [
        'Dorośli, rano: 3,5–60 nmol/L (130–2 080 ng/dL)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'Kortykosteron (związek B) — minorowy mineralokortykoid u człowieka. Marker niedoboru 17α-hydroksylazy: ↑ kortykosteron przy ↓ kortyzol (bardzo rzadka postać WPN).'
          },
          {
            title: 'Uwaga techniczna',
            body: 'Wzór sumaryczny C21H30O4 (taki sam jak 11-deoksykortyzol) — stąd identyczne czynniki przeliczeniowe między jednostkami.'
          },
          {
            title: 'Polskie wytyczne PTEDD',
            body: 'Kucharska 2018 (Endokrynol Pediatr) wymienia niedobór 17α-hydroksylazy wśród rzadkich postaci WPN. Obraz kliniczny: nadciśnienie tętnicze + brak rozwoju płciowego. Oznaczać kortykosteron tylko przy podejrzeniu klinicznym.'
          }
        ]
      },
      sources: ['Tietz', 'PTEDD Kucharska 2018 (rzadkie postaci WPN)']
    },

    {
      id: 'oh17_progesterone',
      label_pl: '17-OH-progesteron (17-OHP)',
      label_en: '17α-Hydroxyprogesterone',
      aliases: ['17 OHP', '17α-OHP'],
      group: 'Steroidogeneza nadnerczowo-gonadalna',
      mw: 330.46,
      canonical_si: 'nmol/L',
      clinical_indications: ['cah', 'hirsutism', 'pcos', 'infertility', 'precocious_puberty', 'obesity_kids'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03026 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.026 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 0.003026 }
      ],
      precision: 3,
      default_range_si: { low: 0.3, high: 10, context_pl: 'Kobiety, faza lutealna (zakres szerszy: M < 6, F-fol. < 3)' },
      reference_ranges_si: [
        // ═══════════════════════════════════════════════════════════════════
        //  METODA: LC-MS/MS (Soldin 2009 + Mayo / Von Schnakenburg 1980)
        //  Tag: method: 'lcms'
        //  Metoda referencyjna zalecana przez ESPE/Endocrine Society 2018
        //  (Speiser), zwłaszcza u dzieci i w przesiewie noworodkowym.
        //  Wartości NIŻSZE niż immunoassaye (brak reaktywności krzyżowej).
        // ═══════════════════════════════════════════════════════════════════
        { id: '17ohp_lcms_ped_neonate', when: { age_min: 0, age_max: 0.077, life_stage: 'pediatric', method: 'lcms' },
          low: 0, high: 19.0, context_pl: 'LC-MS/MS — noworodki donoszone 0–28 dni (Mayo; wcześniaki fizjologicznie wyżej — niekiedy do ~30 nmol/L)',
          source_ids: ['mayo_ohpg_neonatal'] },
        { id: '17ohp_lcms_ped_infant', when: { age_min: 0.077, age_max: 0.5, life_stage: 'pediatric', method: 'lcms' },
          low: 0.76, high: 7.50, context_pl: 'LC-MS/MS — niemowlęta 1–6 miesięcy, oba płcie (Soldin 2009; stopniowy spadek do wartości prepubertalnych)',
          source_ids: ['soldin_2009_lcms'] },
        { id: '17ohp_lcms_ped_male_infant_to_adult', when: { sex: 'M', age_min: 0.5, age_max: 18, life_stage: 'pediatric', method: 'lcms' },
          low: 0.21, high: 3.03, context_pl: 'LC-MS/MS — chłopcy 6 miesięcy – 18 lat (Soldin 2009)',
          source_ids: ['soldin_2009_lcms'] },
        { id: '17ohp_lcms_ped_female_6mo_6', when: { sex: 'F', age_min: 0.5, age_max: 6, life_stage: 'pediatric', method: 'lcms' },
          low: 0.09, high: 3.24, context_pl: 'LC-MS/MS — dziewczynki 6 miesięcy – 6 lat (Soldin 2009)',
          source_ids: ['soldin_2009_lcms'] },
        { id: '17ohp_lcms_ped_female_6_10', when: { sex: 'F', age_min: 6, age_max: 10, life_stage: 'pediatric', method: 'lcms' },
          low: 0.18, high: 1.88, context_pl: 'LC-MS/MS — dziewczynki 6–10 lat (Soldin 2009)',
          source_ids: ['soldin_2009_lcms'] },
        { id: '17ohp_lcms_ped_female_10_18', when: { sex: 'F', age_min: 10, age_max: 18, life_stage: 'pediatric', method: 'lcms' },
          low: 0.45, high: 4.15, context_pl: 'LC-MS/MS — dziewczynki 10–18 lat (Soldin 2009)',
          source_ids: ['soldin_2009_lcms'] },
        { id: '17ohp_lcms_female_follicular', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'follicular', method: 'lcms' },
          low: 0.3, high: 3.0, context_pl: 'LC-MS/MS — kobiety, faza folikularna (Tietz/ES 2018 Speiser)',
          source_ids: ['tietz_2018', 'speiser_es_cah_2018'] },
        { id: '17ohp_lcms_female_luteal', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'luteal', method: 'lcms' },
          low: 3.0, high: 10.0, context_pl: 'LC-MS/MS — kobiety, faza lutealna (Tietz)',
          source_ids: ['tietz_2018'] },
        { id: '17ohp_lcms_female_postmeno', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'postmenopause', method: 'lcms' },
          low: 0.3, high: 3.0, context_pl: 'LC-MS/MS — kobiety, postmenopauza (Tietz)',
          source_ids: ['tietz_2018'] },
        { id: '17ohp_lcms_male', when: { sex: 'M', life_stage: 'adult', method: 'lcms' },
          low: 0.3, high: 6.0, context_pl: 'LC-MS/MS — mężczyźni dorośli (Tietz)',
          source_ids: ['tietz_2018'] },

        // ═══════════════════════════════════════════════════════════════════
        //  METODA: IMMUNOASSAY POLSKIE LABORATORIA (Maglumi CLIA + Synevo ECLIA)
        //  Tag: method: 'immunoassay_pl'
        //  Pełna stratyfikacja wieku/płci uwzględniająca mini-puberty
        //  (1–3 mies. — sex-stratified wg Maglumi V11.0 IFU).
        //  Wartości typowo WYŻSZE niż LC-MS/MS — reaktywność krzyżowa
        //  z 11-deoksykortyzolem, 17-OH-pregnenolonem, siarczanami.
        //  Średnie z dostępnych polskich źródeł (max range Maglumi + Synevo).
        //  Luki w danych Maglumi (0–28 dni, 4–12 mies., 1–3 lata) wypełnione
        //  szacunkowo z buforem na wyższe wartości immunoassayu vs LC-MS/MS.
        // ═══════════════════════════════════════════════════════════════════
        { id: '17ohp_immuno_neonate_0_28d', when: { age_min: 0, age_max: 0.077, life_stage: 'pediatric', method: 'immunoassay_pl' },
          low: 0, high: 20.0, context_pl: 'Immunoassay PL — noworodki donoszone 0–28 dni (Maglumi nie podaje 0–28 dni; orientacyjnie z Mayo + bufor na wyższe wartości immunoassayu; wcześniaki mogą sięgać 30 nmol/L)',
          source_ids: ['mayo_ohpg_neonatal', 'maglumi_v11_ifu'] },
        // ── Mini-puberty: 1 mies. (wczesna), 2 mies. (peak), 3 mies. (zanikająca)
        //    Sex-stratified — Maglumi V11.0 IFU V11.0 (2019-11)
        { id: '17ohp_immuno_1mo_M', when: { sex: 'M', age_min: 0.077, age_max: 0.165, life_stage: 'pediatric', method: 'immunoassay_pl' },
          low: 0, high: 24.2, context_pl: 'Immunoassay PL — chłopcy 1 miesiąc życia (mini-puberty wczesna; Maglumi V11.0: 0,0–8,0 ng/mL)',
          source_ids: ['maglumi_v11_ifu'] },
        { id: '17ohp_immuno_1mo_F', when: { sex: 'F', age_min: 0.077, age_max: 0.165, life_stage: 'pediatric', method: 'immunoassay_pl' },
          low: 7.3, high: 50.8, context_pl: 'Immunoassay PL — dziewczynki 1 miesiąc życia (mini-puberty wczesna; Maglumi V11.0: 2,4–16,8 ng/mL — fizjologicznie wyższe niż u chłopców)',
          source_ids: ['maglumi_v11_ifu'] },
        { id: '17ohp_immuno_2mo_M', when: { sex: 'M', age_min: 0.165, age_max: 0.247, life_stage: 'pediatric', method: 'immunoassay_pl' },
          low: 10.9, high: 41.5, context_pl: 'Immunoassay PL — chłopcy 2 miesiące życia (mini-puberty peak; Maglumi V11.0: 3,6–13,7 ng/mL)',
          source_ids: ['maglumi_v11_ifu'] },
        { id: '17ohp_immuno_2mo_F', when: { sex: 'F', age_min: 0.165, age_max: 0.247, life_stage: 'pediatric', method: 'immunoassay_pl' },
          low: 4.8, high: 29.4, context_pl: 'Immunoassay PL — dziewczynki 2 miesiące życia (mini-puberty peak; Maglumi V11.0: 1,6–9,7 ng/mL)',
          source_ids: ['maglumi_v11_ifu'] },
        { id: '17ohp_immuno_3mo_M', when: { sex: 'M', age_min: 0.247, age_max: 0.329, life_stage: 'pediatric', method: 'immunoassay_pl' },
          low: 5.1, high: 12.1, context_pl: 'Immunoassay PL — chłopcy 3 miesiące życia (mini-puberty zanikająca; Maglumi V11.0: 1,7–4,0 ng/mL)',
          source_ids: ['maglumi_v11_ifu'] },
        { id: '17ohp_immuno_3mo_F', when: { sex: 'F', age_min: 0.247, age_max: 0.329, life_stage: 'pediatric', method: 'immunoassay_pl' },
          low: 0.3, high: 9.4, context_pl: 'Immunoassay PL — dziewczynki 3 miesiące życia (mini-puberty zanikająca; Maglumi V11.0: 0,1–3,1 ng/mL)',
          source_ids: ['maglumi_v11_ifu'] },
        { id: '17ohp_immuno_4_12mo', when: { age_min: 0.329, age_max: 1, life_stage: 'pediatric', method: 'immunoassay_pl' },
          low: 0.3, high: 7.5, context_pl: 'Immunoassay PL — niemowlęta 4–12 miesięcy, oba płcie (poza mini-puberty; Maglumi nie podaje, szacowane z Mayo + bufor immunoassay)',
          source_ids: ['mayo_ohpg_neonatal', 'maglumi_v11_ifu'] },
        { id: '17ohp_immuno_1_3y', when: { age_min: 1, age_max: 3, life_stage: 'pediatric', method: 'immunoassay_pl' },
          low: 0.3, high: 5.5, context_pl: 'Immunoassay PL — dzieci 1–3 lat, oba płcie (luka w Maglumi; interpolacja między niemowlętami a Maglumi 3–14 lat)',
          source_ids: ['maglumi_v11_ifu'] },
        { id: '17ohp_immuno_3_14y', when: { age_min: 3, age_max: 14, life_stage: 'pediatric', method: 'immunoassay_pl' },
          low: 0.3, high: 5.14, context_pl: 'Immunoassay PL — dzieci 3–14 lat, oba płcie prepubertal (Maglumi V11.0: 0,1–1,7 ng/mL)',
          source_ids: ['maglumi_v11_ifu'] },
        // Młodzież 14–18 lat — Maglumi NIE PODAJE osobnego zakresu pediatrycznego
        // dla tej grupy (od 14 lat traktuje już jak dorosłych); stosujemy więc
        // zakresy dorosłych z konkretnymi cycle_phase u dziewczynek po menarche.
        // Definiujemy WYRAŹNE wpisy 14_18 dla immunoassay, aby uniknąć fallback
        // do innych pediatrycznych zakresów.
        { id: '17ohp_immuno_14_18_M', when: { sex: 'M', age_min: 14, age_max: 18, life_stage: 'pediatric', method: 'immunoassay_pl' },
          low: 0.6, high: 7.0, context_pl: 'Immunoassay PL — chłopcy 14–18 lat (Maglumi traktuje od 14 lat jak dorosłych; uwzględnić stadium Tannera; uśrednione z Maglumi/Synevo: 0,2–2,3 ng/mL)',
          source_ids: ['maglumi_v11_ifu', 'synevo_pl'] },
        { id: '17ohp_immuno_14_18_F_follicular', when: { sex: 'F', age_min: 14, age_max: 18, life_stage: 'pediatric', cycle_phase: 'follicular', method: 'immunoassay_pl' },
          low: 0.3, high: 3.9, context_pl: 'Immunoassay PL — dziewczynki 14–18 lat, faza folikularna (Maglumi traktuje od 14 lat jak dorosłych; uśrednione z Maglumi/Synevo: 0,1–1,3 ng/mL)',
          source_ids: ['maglumi_v11_ifu', 'synevo_pl'] },
        { id: '17ohp_immuno_14_18_F_ovulation', when: { sex: 'F', age_min: 14, age_max: 18, life_stage: 'pediatric', cycle_phase: 'ovulation', method: 'immunoassay_pl' },
          low: 0.9, high: 4.2, context_pl: 'Immunoassay PL — dziewczynki 14–18 lat, owulacja (Maglumi V11.0: 0,3–1,4 ng/mL)',
          source_ids: ['maglumi_v11_ifu'] },
        { id: '17ohp_immuno_14_18_F_luteal', when: { sex: 'F', age_min: 14, age_max: 18, life_stage: 'pediatric', cycle_phase: 'luteal', method: 'immunoassay_pl' },
          low: 1.8, high: 13.6, context_pl: 'Immunoassay PL — dziewczynki 14–18 lat, faza lutealna (uśrednione z Maglumi/Synevo: 0,6–4,5 ng/mL)',
          source_ids: ['maglumi_v11_ifu', 'synevo_pl'] },
        { id: '17ohp_immuno_14_18_F_default', when: { sex: 'F', age_min: 14, age_max: 18, life_stage: 'pediatric', method: 'immunoassay_pl' },
          low: 0.3, high: 3.9, context_pl: 'Immunoassay PL — dziewczynki 14–18 lat (faza cyklu nieznana, używamy folikularnej jako domyślnej; gdy faza znana zob. cycle_phase)',
          source_ids: ['maglumi_v11_ifu', 'synevo_pl'] },
        // Dorośli — immunoassay PL (uśrednione Maglumi + Synevo, max range)
        { id: '17ohp_immuno_female_follicular', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'follicular', method: 'immunoassay_pl' },
          low: 0.3, high: 3.9, context_pl: 'Immunoassay PL — kobiety, faza folikularna (Maglumi 0,1–0,8 + Synevo 0,2–1,3 ng/mL; max range)',
          source_ids: ['maglumi_v11_ifu', 'synevo_pl'] },
        { id: '17ohp_immuno_female_ovulation', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'ovulation', method: 'immunoassay_pl' },
          low: 0.9, high: 4.2, context_pl: 'Immunoassay PL — kobiety, owulacja (Maglumi V11.0: 0,3–1,4 ng/mL)',
          source_ids: ['maglumi_v11_ifu'] },
        { id: '17ohp_immuno_female_luteal', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'luteal', method: 'immunoassay_pl' },
          low: 1.8, high: 13.6, context_pl: 'Immunoassay PL — kobiety, faza lutealna (Maglumi 0,6–2,3 + Synevo 1,0–4,5 ng/mL; max range)',
          source_ids: ['maglumi_v11_ifu', 'synevo_pl'] },
        { id: '17ohp_immuno_female_postmeno', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'postmenopause', method: 'immunoassay_pl' },
          low: 0.4, high: 2.7, context_pl: 'Immunoassay PL — kobiety, menopauza (Maglumi 0,13–0,51 + Synevo 0,2–0,9 ng/mL; max range)',
          source_ids: ['maglumi_v11_ifu', 'synevo_pl'] },
        { id: '17ohp_immuno_post_acth_F', when: { sex: 'F', life_stage: 'adult', test_protocol: 'post_acth', method: 'immunoassay_pl' },
          low: 0, high: 9.68, context_pl: 'Immunoassay PL — kobiety dorosłe po stymulacji ACTH (test Synacthen): norma < 9,68 nmol/L (< 3,2 ng/mL wg Maglumi). > 30 nmol/L (> 10 ng/mL) = potwierdzenie WPN wg PTEDD/ES.',
          source_ids: ['maglumi_v11_ifu', 'speiser_es_cah_2018'] },
        { id: '17ohp_immuno_male', when: { sex: 'M', life_stage: 'adult', method: 'immunoassay_pl' },
          low: 0.6, high: 7.0, context_pl: 'Immunoassay PL — mężczyźni dorośli (Maglumi 0,5–2,1 + Synevo 0,2–2,3 ng/mL; max range)',
          source_ids: ['maglumi_v11_ifu', 'synevo_pl'] },

        // ═══════════════════════════════════════════════════════════════════
        //  DEFAULT FALLBACK — bez `method` w when
        //  Najszerszy zakres uwzględniający OBA metody; używany gdy
        //  użytkownik nie wybrał metody. Po wdrożeniu UI selektora metody
        //  (Krok 2) ten fallback będzie używany tylko w wypadku "Nie wiem".
        // ═══════════════════════════════════════════════════════════════════
        { id: '17ohp_default', when: {}, default: true,
          low: 0.3, high: 13.6, context_pl: 'Dorośli, zakres ogólny (najszerszy; metoda oznaczenia nieznana). KLINICZNIE: porównaj z zakresem laboratorium wykonującego badanie. LC-MS/MS daje wartości NIŻSZE (max ~10 nmol/L); immunoassay PL — WYŻSZE (max ~13,6 nmol/L w lutealnej).',
          source_ids: ['tietz_2018', 'speiser_es_cah_2018', 'maglumi_v11_ifu', 'synevo_pl'] }
      ],
      ranges_pl: [
        'Faza folikularna: < 3 nmol/L (< 100 ng/dL)',
        'Faza lutealna: 3–10 nmol/L (100–330 ng/dL)',
        'Mężczyźni dorośli: < 6 nmol/L (< 200 ng/dL)',
        'Test ACTH – odcięcie dla CAH 21-OH: stymulowany 17-OHP > 30 nmol/L (> 1 000 ng/dL)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: '17-OH-progesteron (17-OHP) — kluczowy marker diagnostyki wrodzonego przerostu nadnerczy (WPN, CAH) z niedoboru 21-hydroksylazy (najczęstsza postać WPN, ~90% przypadków). Mierzony też w noworodkowym przesiewie WPN oraz w diagnostyce NCAH (nieklasyczny WPN) u kobiet z hiperandrogenizmem / PCOS.'
          },
          {
            title: 'Pobranie',
            body: [
              { items: [
                { label: 'Pora dnia', text: 'rano (7:00–9:00) — rytm dobowy podobny do kortyzolu.' },
                { label: 'Faza cyklu (kobieta)', text: 'FOLIKULARNA (dni 2–5 cyklu). W II połowie cyklu i w ciąży wartości fizjologicznie wyższe — fałszywie dodatnie.' },
                { label: 'Pułapki — fałszywe ↑', text: 'torbiele jajnika, NCAH (nieklasyczny WPN), II połowa cyklu, ciąża.' }
              ]}
            ]
          },
          {
            title: 'Polski przesiew noworodkowy — od 2018 r.',
            body: 'Skrining 17-OHP wprowadzony do polskiego rządowego programu badań przesiewowych noworodków od 2018 r. (koordynacja: IMiD — Instytut Matki i Dziecka). Bibuła pobierana w 3.–5. dobie życia razem z TSH i innymi parametrami.'
          },
          {
            title: 'Progi PTEDD Kucharska 2018 — rozpoznanie WPN',
            body: [
              'Wytyczne PTEDD Kucharska et al. 2018 (Endokrynologia Pediatryczna) — rozpoznanie WPN z niedoboru 21-hydroksylazy:',
              { items: [
                { label: '17-OHP > 30 nmol/L (10 ng/mL)', text: 'klasyczny WPN (postać z utratą soli lub prosta wirylizująca) — pewne rozpoznanie.' },
                { label: '17-OHP 6–30 nmol/L', text: 'wynik niejednoznaczny — wskazany test stymulacji ACTH.' },
                { label: '17-OHP < 6 nmol/L', text: 'wyklucza klasyczny WPN, ale część NCAH (kobieta dorosła z hiperandrogenizmem/PCOS) ma wartości bazalne < 6 i ujawnia się dopiero po stymulacji.' }
              ]},
              { label: 'Test stymulacji ACTH', text: 'Synacthen 250 μg i.v., pomiar 17-OHP w czasie 0 i 60 min. Szczyt 17-OHP > 30 nmol/L po stymulacji potwierdza WPN (NCAH lub klasyczny).' }
            ]
          },
          {
            title: '⚠ Uwaga metodologiczna — LC-MS/MS vs immunoassay',
            body: [
              'Pediatryczne zakresy referencyjne w przeliczniku pochodzą z metody LC-MS/MS (Soldin 2009; noworodki — Mayo / Von Schnakenburg 1980) — metody referencyjnej zalecanej przez ESPE/Endocrine Society, zwłaszcza u dzieci i w przesiewie noworodkowym.',
              'Immunoassaye (RIA i in., powszechne w wielu polskich laboratoriach) dają wartości WYŻSZE — szczególnie u dzieci, ze względu na reaktywność krzyżową z prekursorami steroidowymi (11-deoksykortyzol, 17-OH-pregnenolon i ich siarczany).',
              'Immunoassaye 17-OHP nie mają jednolitego standardu zakresów referencyjnych (17-OHP nie figuruje na głównych platformach immunoassay; każde laboratorium waliduje własne zakresy).',
              { label: 'Praktyczna wskazówka', text: 'wynik z immunoassayu zawsze interpretuj wg zakresu referencyjnego podanego przez laboratorium wykonujące badanie, a nie wg zakresów w tym przeliczniku.' }
            ]
          }
        ]
      },
      sources: ['Tietz', 'ESPE/Endocrine Society CAH 2018 (Speiser)', 'PTEDD Kucharska 2018 (CAH)', 'Polski Program Przesiewu Noworodków 2018 (IMiD)', 'Soldin 2009 (LC-MS/MS, pediatria)', 'Mayo Clinic Labs / Von Schnakenburg 1980 (noworodki)']
    },

    {
      id: 'oh17_pregnenolone',
      label_pl: '17-OH-pregnenolon',
      label_en: '17α-Hydroxypregnenolone',
      aliases: ['17-OH preg'],
      group: 'Steroidogeneza nadnerczowo-gonadalna',
      mw: 332.48,
      canonical_si: 'nmol/L',
      clinical_indications: ['cah'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03008 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.008 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 0.003008 }
      ],
      precision: 3,
      default_range_si: { low: 1.1, high: 9.9, context_pl: 'Dorośli, bazalnie' },
      reference_ranges_si: [
        // — Pediatria, Mayo Test 81151 (Kushnir LC-MS/MS, dane z Kushnir 2006).
        //   Wartości w nawiasie po prawej to dolne/górne w ng/dL × 0.03008 → nmol/L.
        //   Wcześniaki — sex-neutral (oba płcie identyczne)
        { id: '17ohp17_premature_26_28', when: { age_min: 0, age_max: 0.05, life_stage: 'pediatric' },
          low: 38.5, high: 309.6, context_pl: 'Wcześniaki 26–28 tyg. ciąży',
          source_ids: ['mayo_test_17oh_preg', 'kushnir_2006_steroids'] },
        // — Tanner-based (preferowane gdy pacjent ma określony Tanner)
        { id: 'ohp17preg_tanner1_M', when: { sex: 'M', tanner: 1 },
          low: 0, high: 6.60, context_pl: 'Chłopcy Tanner I',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_tanner2_M', when: { sex: 'M', tanner: 2 },
          low: 0, high: 11.25, context_pl: 'Chłopcy Tanner II',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_tanner3_M', when: { sex: 'M', tanner: 3 },
          low: 0, high: 14.25, context_pl: 'Chłopcy Tanner III',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_tanner45_M', when: { sex: 'M', tanner: 4 },
          low: 1.11, high: 15.10, context_pl: 'Chłopcy Tanner IV–V',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_tanner5_M', when: { sex: 'M', tanner: 5 },
          low: 1.11, high: 15.10, context_pl: 'Chłopcy Tanner IV–V',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_tanner1_F', when: { sex: 'F', tanner: 1 },
          low: 0, high: 7.46, context_pl: 'Dziewczynki Tanner I',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_tanner2_F', when: { sex: 'F', tanner: 2 },
          low: 0, high: 11.63, context_pl: 'Dziewczynki Tanner II',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_tanner3_F', when: { sex: 'F', tanner: 3 },
          low: 0, high: 13.62, context_pl: 'Dziewczynki Tanner III',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_tanner45_F', when: { sex: 'F', tanner: 4 },
          low: 0, high: 13.05, context_pl: 'Dziewczynki Tanner IV–V',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_tanner5_F', when: { sex: 'F', tanner: 5 },
          low: 0, high: 13.05, context_pl: 'Dziewczynki Tanner IV–V',
          source_ids: ['mayo_test_17oh_preg'] },
        // — Age-based pediatric (gdy brak Tannera)
        { id: 'ohp17preg_infant_1_5mo', when: { age_min: 0.05, age_max: 0.5, life_stage: 'pediatric' },
          low: 7.24, high: 98.08, context_pl: 'Niemowlęta 1–5 miesięcy (donoszone)',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_6mo_12mo', when: { age_min: 0.5, age_max: 1, life_stage: 'pediatric' },
          low: 6.98, high: 62.59, context_pl: 'Niemowlęta 6–12 miesięcy',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_1_2', when: { age_min: 1, age_max: 3, life_stage: 'pediatric' },
          low: 1.11, high: 22.50, context_pl: 'Dzieci 1–2 lat',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_3_6', when: { age_min: 3, age_max: 7, life_stage: 'pediatric' },
          low: 0, high: 8.75, context_pl: 'Dzieci 3–6 lat',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_M_7_9', when: { sex: 'M', age_min: 7, age_max: 10, life_stage: 'pediatric' },
          low: 0, high: 5.94, context_pl: 'Chłopcy 7–9 lat',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_M_10_12', when: { sex: 'M', age_min: 10, age_max: 13, life_stage: 'pediatric' },
          low: 0, high: 12.42, context_pl: 'Chłopcy 10–12 lat',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_M_13_15', when: { sex: 'M', age_min: 13, age_max: 16, life_stage: 'pediatric' },
          low: 1.11, high: 14.69, context_pl: 'Chłopcy 13–15 lat',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_M_16_17', when: { sex: 'M', age_min: 16, age_max: 18, life_stage: 'pediatric' },
          low: 1.01, high: 15.10, context_pl: 'Chłopcy 16–17 lat',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_F_7_9', when: { sex: 'F', age_min: 7, age_max: 10, life_stage: 'pediatric' },
          low: 0, high: 6.73, context_pl: 'Dziewczynki 7–9 lat',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_F_10_12', when: { sex: 'F', age_min: 10, age_max: 13, life_stage: 'pediatric' },
          low: 0, high: 12.61, context_pl: 'Dziewczynki 10–12 lat',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_F_13_15', when: { sex: 'F', age_min: 13, age_max: 16, life_stage: 'pediatric' },
          low: 0, high: 12.89, context_pl: 'Dziewczynki 13–15 lat',
          source_ids: ['mayo_test_17oh_preg'] },
        { id: 'ohp17preg_F_16_17', when: { sex: 'F', age_min: 16, age_max: 18, life_stage: 'pediatric' },
          low: 0, high: 13.40, context_pl: 'Dziewczynki 16–17 lat',
          source_ids: ['mayo_test_17oh_preg'] },
        // — Dorośli: Tietz 1,1–9,9 (zachowane z fazy 1), Mayo M 1,74–14,38, F 0,98–14,38.
        //   Wybieram szerszy Mayo jako default dla dorosłych (real-world).
        { id: 'ohp17preg_male_adult', when: { sex: 'M', life_stage: 'adult' },
          low: 1.74, high: 14.38, context_pl: 'Mężczyźni dorośli (≥ 18 lat)',
          source_ids: ['mayo_test_17oh_preg', 'tietz_2018'] },
        { id: 'ohp17preg_female_adult', when: { sex: 'F', life_stage: 'adult' },
          low: 0.98, high: 14.38, context_pl: 'Kobiety dorosłe (≥ 18 lat)',
          source_ids: ['mayo_test_17oh_preg', 'tietz_2018'] },
        { id: 'ohp17preg_adult', when: {},
          low: 1.1, high: 14.4, context_pl: 'Dorośli, bazalnie (zakres ogólny)',
          source_ids: ['mayo_test_17oh_preg', 'tietz_2018'] }
      ],
      ranges_pl: [
        'Dorośli, bazalnie: 1,1–9,9 nmol/L (36–330 ng/dL)',
        'Po stymulacji ACTH: > 30-krotny wzrost względem 17-OHP → 3β-HSD deficiency'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: '17-OH-pregnenolon — marker niedoboru 3β-HSD (3β-hydroksysteroidowej dehydrogenazy) oraz CAH typu III (rzadka postać WPN). Charakterystyczne: zaburzenie syntezy zarówno androgenów jak i estrogenów, u noworodków obu płci cechy interpłciowe.'
          },
          {
            title: 'Pobranie i interpretacja',
            body: 'Oznaczany razem z 17-OHP w teście stymulacji ACTH (Synacthen 250 μg i.v., pomiar 17-OH-pregnenolonu i 17-OHP w 0 i 60 min). Podwyższenie 17-OH-pregnenolonu / 17-OHP > 30 nmol/L po stymulacji ACTH potwierdza niedobór 3β-HSD.'
          },
          {
            title: 'Polskie wytyczne PTEDD',
            body: 'Kucharska 2018 (Endokrynol Pediatr) wymienia niedobór 3β-HSD wśród rzadkich postaci WPN. Diagnostyka rozszerzona dopiero przy podejrzeniu klinicznym (cechy interpłciowe u noworodka, podwyższone wszystkie prekursory androgenów).'
          }
        ]
      },
      sources: ['Tietz', 'PTEDD Kucharska 2018 (rzadkie postaci WPN)']
    },

    {
      id: 'pregnenolone',
      label_pl: 'Pregnenolon',
      label_en: 'Pregnenolone',
      aliases: ['Δ5-pregnenolone'],
      group: 'Steroidogeneza nadnerczowo-gonadalna',
      mw: 316.48,
      canonical_si: 'nmol/L',
      clinical_indications: ['cah', 'adrenal_insufficiency'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03160 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.160 }
      ],
      precision: 3,
      default_range_si: { low: 0.3, high: 3.2, context_pl: 'Dorośli' },
      reference_ranges_si: [
        // — Tanner-based (Mayo Test 88645, Kushnir 2006 LC-MS/MS)
        { id: 'preg_tanner1_M', when: { sex: 'M', tanner: 1 },
          low: 0, high: 4.96, context_pl: 'Chłopcy Tanner I',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_tanner2_M', when: { sex: 'M', tanner: 2 },
          low: 0, high: 4.55, context_pl: 'Chłopcy Tanner II',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_tanner3_M', when: { sex: 'M', tanner: 3 },
          low: 0, high: 6.79, context_pl: 'Chłopcy Tanner III',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_tanner45_M', when: { sex: 'M', tanner: 4 },
          low: 0.60, high: 6.35, context_pl: 'Chłopcy Tanner IV–V',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_tanner5_M', when: { sex: 'M', tanner: 5 },
          low: 0.60, high: 6.35, context_pl: 'Chłopcy Tanner IV–V',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_tanner1_F', when: { sex: 'F', tanner: 1 },
          low: 0, high: 5.43, context_pl: 'Dziewczynki Tanner I',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_tanner2_F', when: { sex: 'F', tanner: 2 },
          low: 0.70, high: 7.24, context_pl: 'Dziewczynki Tanner II',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_tanner3_F', when: { sex: 'F', tanner: 3 },
          low: 1.07, high: 6.79, context_pl: 'Dziewczynki Tanner III',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_tanner45_F', when: { sex: 'F', tanner: 4 },
          low: 0.82, high: 7.43, context_pl: 'Dziewczynki Tanner IV–V',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_tanner5_F', when: { sex: 'F', tanner: 5 },
          low: 0.82, high: 7.43, context_pl: 'Dziewczynki Tanner IV–V',
          source_ids: ['mayo_test_pregnenolone'] },
        // — Age-based pediatric (gdy brak Tannera). Mayo: 0–6 lat „Not established".
        //   Faza 5d: dla < 7 lat używamy Tanner I (zakres prepubertalny) jako fallback wieku.
        { id: 'preg_M_prepubertal_age', when: { sex: 'M', age_min: 0.5, age_max: 7, life_stage: 'pediatric' },
          low: 0, high: 4.96,
          context_pl: 'Chłopcy 0,5–7 lat (Tanner I — fallback wiek; Mayo „Not established" dla 0–6 lat)',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_F_prepubertal_age', when: { sex: 'F', age_min: 0.5, age_max: 7, life_stage: 'pediatric' },
          low: 0, high: 5.43,
          context_pl: 'Dziewczynki 0,5–7 lat (Tanner I — fallback wiek; Mayo „Not established" dla 0–6 lat)',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_M_7_9', when: { sex: 'M', age_min: 7, age_max: 10, life_stage: 'pediatric' },
          low: 0, high: 6.51, context_pl: 'Chłopcy 7–9 lat',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_M_10_12', when: { sex: 'M', age_min: 10, age_max: 13, life_stage: 'pediatric' },
          low: 0, high: 4.80, context_pl: 'Chłopcy 10–12 lat',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_M_13_15', when: { sex: 'M', age_min: 13, age_max: 16, life_stage: 'pediatric' },
          low: 0.57, high: 6.23, context_pl: 'Chłopcy 13–15 lat',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_M_16_17', when: { sex: 'M', age_min: 16, age_max: 18, life_stage: 'pediatric' },
          low: 0.54, high: 7.20, context_pl: 'Chłopcy 16–17 lat',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_F_7_9', when: { sex: 'F', age_min: 7, age_max: 10, life_stage: 'pediatric' },
          low: 0, high: 4.77, context_pl: 'Dziewczynki 7–9 lat',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_F_10_12', when: { sex: 'F', age_min: 10, age_max: 13, life_stage: 'pediatric' },
          low: 0.60, high: 6.95, context_pl: 'Dziewczynki 10–12 lat',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_F_13_15', when: { sex: 'F', age_min: 13, age_max: 16, life_stage: 'pediatric' },
          low: 0.70, high: 6.64, context_pl: 'Dziewczynki 13–15 lat',
          source_ids: ['mayo_test_pregnenolone'] },
        { id: 'preg_F_16_17', when: { sex: 'F', age_min: 16, age_max: 18, life_stage: 'pediatric' },
          low: 0.70, high: 7.24, context_pl: 'Dziewczynki 16–17 lat',
          source_ids: ['mayo_test_pregnenolone'] },
        // — Dorośli (Mayo nie różnicuje płciowo)
        { id: 'preg_adult', when: {},
          low: 1.04, high: 7.84, context_pl: 'Dorośli (≥ 18 lat)',
          source_ids: ['mayo_test_pregnenolone', 'tietz_2018'] }
      ],
      ranges_pl: [
        'Dorośli mężczyźni: 0,3–3,2 nmol/L (10–100 ng/dL)',
        'Dorosłe kobiety: 0,3–3,2 nmol/L (10–100 ng/dL)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'Pregnenolon — pierwszy steroid w szlaku biosyntezy z cholesterolu (synteza wymaga białka StAR i enzymu CYP11A1, side-chain cleavage). Oznaczany rzadko — głównie w diagnostyce wrodzonych defektów steroidogenezy.'
          },
          {
            title: 'Lipoidalny WPN (niedobór StAR) — najcięższa postać',
            body: 'Polskie wytyczne PTEDD Kucharska 2018 (Endokrynol Pediatr) wymieniają niedobór StAR: lipoidalny WPN — najcięższa postać z brakiem syntezy wszystkich steroidów. Obraz kliniczny: krzywica nadnerczowa noworodkowa, fenotyp żeński nawet u kariotypu 46,XY. Pregnenolon nieoznaczalny lub bardzo niski.'
          },
          {
            title: 'Kiedy oznaczać',
            body: 'Tylko w specjalistycznej diagnostyce wrodzonych zaburzeń steroidogenezy (w ośrodkach referencyjnych) — nie ma zastosowania w rutynowej praktyce klinicznej.'
          }
        ]
      },
      sources: ['Tietz', 'PTEDD Kucharska 2018 (rzadkie postaci WPN, lipoidalny WPN)']
    },

    /* ───────────── Androgeny ───────────── */

    {
      id: 'dhea',
      label_pl: 'DHEA (dehydroepiandrosteron)',
      label_en: 'Dehydroepiandrosterone',
      aliases: ['prasterone', 'DHA'],
      group: 'Androgeny',
      mw: 288.42,
      canonical_si: 'nmol/L',
      clinical_indications: ['hirsutism', 'pcos', 'cah', 'adrenal_tumor', 'precocious_puberty'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03467 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.467 }
      ],
      precision: 3,
      default_range_si: { low: 5, high: 25, context_pl: 'Dorośli (M: 6–25, K: 5–20 nmol/L)' },
      reference_ranges_si: [
        // — Pediatria, Mayo Test 81405 (LC-MS/MS, sex-neutral; Mayo cytuje Soldin AACC 2005).
        //   ng/mL × 3.467 = nmol/L (MW 288.42)
        { id: 'dhea_premature', when: { age_min: 0, age_max: 0.003, life_stage: 'pediatric' },
          low: 0, high: 138.7, context_pl: 'Wcześniaki (do ≈ 1. dnia życia)',
          source_ids: ['mayo_test_dhea', 'soldin_2005_aacc'] },
        { id: 'dhea_0_1d', when: { age_min: 0, age_max: 0.006, life_stage: 'pediatric' },
          low: 0, high: 38.1, context_pl: 'Noworodki 0–1 dzień',
          source_ids: ['mayo_test_dhea', 'soldin_2005_aacc'] },
        { id: 'dhea_2_6d', when: { age_min: 0.006, age_max: 0.020, life_stage: 'pediatric' },
          low: 0, high: 30.2, context_pl: 'Noworodki 2–6 dni',
          source_ids: ['mayo_test_dhea', 'soldin_2005_aacc'] },
        { id: 'dhea_7d_1mo', when: { age_min: 0.020, age_max: 0.083, life_stage: 'pediatric' },
          low: 0, high: 20.1, context_pl: 'Niemowlęta 7 dni – 1 miesiąc',
          source_ids: ['mayo_test_dhea', 'soldin_2005_aacc'] },
        { id: 'dhea_1mo_2y', when: { age_min: 0.083, age_max: 2, life_stage: 'pediatric' },
          low: 0, high: 10.05, context_pl: 'Niemowlęta i małe dzieci 1 mies. – 2 lata',
          source_ids: ['mayo_test_dhea', 'soldin_2005_aacc'] },
        { id: 'dhea_2_5', when: { age_min: 2, age_max: 6, life_stage: 'pediatric' },
          low: 0, high: 7.97, context_pl: 'Dzieci 2–5 lat',
          source_ids: ['mayo_test_dhea', 'soldin_2005_aacc'] },
        { id: 'dhea_6_10', when: { age_min: 6, age_max: 11, life_stage: 'pediatric' },
          low: 0, high: 11.79, context_pl: 'Dzieci 6–10 lat (adrenarche)',
          source_ids: ['mayo_test_dhea', 'soldin_2005_aacc'] },
        { id: 'dhea_11_14', when: { age_min: 11, age_max: 15, life_stage: 'pediatric' },
          low: 0, high: 17.34, context_pl: 'Młodzież 11–14 lat',
          source_ids: ['mayo_test_dhea', 'soldin_2005_aacc'] },
        { id: 'dhea_15_18', when: { age_min: 15, age_max: 18, life_stage: 'pediatric' },
          low: 0, high: 22.88, context_pl: 'Młodzież 15–18 lat',
          source_ids: ['mayo_test_dhea', 'soldin_2005_aacc'] },
        // — Dorośli, Mayo (≥19 lat, stratyfikacja wiekowa, sex-neutral)
        { id: 'dhea_19_30', when: { age_min: 19, age_max: 31, life_stage: 'adult' },
          low: 0, high: 45.07, context_pl: 'Dorośli 19–30 lat',
          source_ids: ['mayo_test_dhea', 'tietz_2018'] },
        { id: 'dhea_31_40', when: { age_min: 31, age_max: 41, life_stage: 'adult' },
          low: 0, high: 34.67, context_pl: 'Dorośli 31–40 lat',
          source_ids: ['mayo_test_dhea'] },
        { id: 'dhea_41_50', when: { age_min: 41, age_max: 51, life_stage: 'adult' },
          low: 0, high: 27.74, context_pl: 'Dorośli 41–50 lat',
          source_ids: ['mayo_test_dhea'] },
        { id: 'dhea_51_60', when: { age_min: 51, age_max: 61, life_stage: 'adult' },
          low: 0, high: 20.80, context_pl: 'Dorośli 51–60 lat',
          source_ids: ['mayo_test_dhea'] },
        { id: 'dhea_61_plus', when: { age_min: 61, life_stage: 'adult' },
          low: 0, high: 17.34, context_pl: 'Dorośli ≥ 61 lat',
          source_ids: ['mayo_test_dhea'] },
        // — Default fallback gdy brak danych pacjenta
        { id: 'dhea_default', when: {}, default: true,
          low: 0, high: 45, context_pl: 'Dorośli, zakres ogólny (spada z wiekiem)',
          source_ids: ['mayo_test_dhea', 'tietz_2018'] }
      ],
      ranges_pl: [
        'Dorośli mężczyźni: 6–25 nmol/L (180–720 ng/dL)',
        'Dorosłe kobiety (premenopauza): 5–20 nmol/L (140–580 ng/dL)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'DHEA (dehydroepiandrosteron) — prekursor androgenów nadnerczowych. W rutynowej diagnostyce klinicznej oznacza się DHEA-S (siarczan, stabilniejszy i niezależny od rytmu dobowego) — sam DHEA oznaczany rzadko, głównie przy rzadkich postaciach WPN.'
          },
          {
            title: 'Kiedy podwyższone',
            body: [
              { items: [
                { label: 'Przedwczesne adrenarche', text: 'DHEA-S umiarkowanie podwyższony — wzrost wraz z DHEA.' },
                { label: 'Guz nadnercza produkujący androgeny', text: 'DHEA i DHEA-S znacznie podwyższone (kilkukrotnie ponad normę).' },
                { label: 'Spadek z wiekiem', text: 'u dorosłych fizjologiczna „adrenopauza" — DHEA i DHEA-S maleją liniowo.' }
              ]}
            ]
          },
          {
            title: 'Polskie wytyczne — preferowany DHEA-S',
            body: 'PTE Bednarczuk (incydentaloma 2016) i ES 2018 Martin (hirsutyzm) preferują DHEA-S jako podstawowy marker. DHEA oznaczane głównie przy rzadkich postaciach WPN (np. niedobór 3β-HSD).'
          }
        ]
      },
      sources: ['Tietz', 'Mayo Clinic Labs / Soldin 2005']
    },

    {
      id: 'dhea_s',
      label_pl: 'DHEA-S (siarczan DHEA)',
      label_en: 'Dehydroepiandrosterone sulfate',
      aliases: ['DHEAS', 'DHA-S'],
      group: 'Androgeny',
      clinical_indications: ['hirsutism', 'pcos', 'adrenal_tumor', 'precocious_puberty', 'cah'],
      mw: 368.49,                                              // wolny kwas; sól sodowa 390.49
      canonical_si: 'μmol/L',
      units: [
        { symbol: 'μmol/L', label: 'μmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'nmol/L', label: 'nmol/L',       kind: 'si',   factor_to_si: 0.001 },
        { symbol: 'μg/dL',  label: 'μg/dL',        kind: 'conv', factor_to_si: 0.02714 },
        { symbol: 'μg/mL',  label: 'μg/mL',        kind: 'conv', factor_to_si: 2.714 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 0.002714 }
      ],
      precision: 3,
      default_range_si: { low: 1.9, high: 12, context_pl: 'Dorośli, średnio (M 18–30: 4,3–12; K 18–30: 1,9–9,4 μmol/L)' },
      reference_ranges_si: [
        // — Pediatria, Mayo Test 113595 (LC-MS/MS, Mayo-derived intervals)
        //   Tanner-based dla chłopców
        { id: 'dheas_M_tanner1', when: { sex: 'M', tanner: 1 },
          low: 0.299, high: 3.257, context_pl: 'Chłopcy Tanner I (>14 dni)',
          source_ids: ['mayo_test_dheas'] },
        { id: 'dheas_M_tanner2', when: { sex: 'M', tanner: 2 },
          low: 0.380, high: 8.766, context_pl: 'Chłopcy Tanner II (śr. 11,5 lat)',
          source_ids: ['mayo_test_dheas'] },
        { id: 'dheas_M_tanner3', when: { sex: 'M', tanner: 3 },
          low: 0.149, high: 8.468, context_pl: 'Chłopcy Tanner III (śr. 13,6 lat)',
          source_ids: ['mayo_test_dheas'] },
        { id: 'dheas_M_tanner4', when: { sex: 'M', tanner: 4 },
          low: 0.787, high: 11.182, context_pl: 'Chłopcy Tanner IV (śr. 15,1 lat)',
          source_ids: ['mayo_test_dheas'] },
        { id: 'dheas_M_tanner5', when: { sex: 'M', tanner: 5 },
          low: 2.823, high: 12.701, context_pl: 'Chłopcy Tanner V (śr. 18 lat)',
          source_ids: ['mayo_test_dheas'] },
        //   Tanner-based dla dziewczynek
        { id: 'dheas_F_tanner1', when: { sex: 'F', tanner: 1 },
          low: 0.434, high: 2.605, context_pl: 'Dziewczynki Tanner I (>14 dni)',
          source_ids: ['mayo_test_dheas'] },
        { id: 'dheas_F_tanner2', when: { sex: 'F', tanner: 2 },
          low: 0.597, high: 4.994, context_pl: 'Dziewczynki Tanner II (śr. 10,5 lat)',
          source_ids: ['mayo_test_dheas'] },
        { id: 'dheas_F_tanner3', when: { sex: 'F', tanner: 3 },
          low: 0.299, high: 8.033, context_pl: 'Dziewczynki Tanner III (śr. 11,6 lat)',
          source_ids: ['mayo_test_dheas'] },
        { id: 'dheas_F_tanner4', when: { sex: 'F', tanner: 4 },
          low: 0.461, high: 9.309, context_pl: 'Dziewczynki Tanner IV (śr. 12,3 lat)',
          source_ids: ['mayo_test_dheas'] },
        { id: 'dheas_F_tanner5', when: { sex: 'F', tanner: 5 },
          low: 1.547, high: 10.720, context_pl: 'Dziewczynki Tanner V (śr. 14,5 lat)',
          source_ids: ['mayo_test_dheas'] },
        // — Age-based fallback (gdy Tanner nieznany; Faza 5d).
        //   Mapowanie: 0,5–9 lat ≈ Tanner I; 9–14 ≈ Tanner II–IV (suma); 14–18 ≈ Tanner V.
        { id: 'dheas_M_prepubertal_age', when: { sex: 'M', age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 0.299, high: 3.257,
          context_pl: 'Chłopcy prepubertalni (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_dheas'] },
        { id: 'dheas_M_peripubertal_age', when: { sex: 'M', age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 0.149, high: 11.182,
          context_pl: 'Chłopcy pubertalni (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_dheas'] },
        { id: 'dheas_M_latepubertal_age', when: { sex: 'M', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 2.823, high: 12.701,
          context_pl: 'Chłopcy późnopubertalni (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_dheas'] },
        { id: 'dheas_F_prepubertal_age', when: { sex: 'F', age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 0.434, high: 2.605,
          context_pl: 'Dziewczynki prepubertalne (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_dheas'] },
        { id: 'dheas_F_peripubertal_age', when: { sex: 'F', age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 0.299, high: 9.309,
          context_pl: 'Dziewczynki pubertalne (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_dheas'] },
        { id: 'dheas_F_latepubertal_age', when: { sex: 'F', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 1.547, high: 10.720,
          context_pl: 'Dziewczynki późnopubertalne (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_dheas'] },
        // — Mężczyźni — 4 przedziały wiekowe (Mayo + Tietz)
        { id: 'dheas_male_18_30', when: { sex: 'M', age_min: 18, age_max: 30, life_stage: 'adult' },
          low: 4.3, high: 12.0, context_pl: 'Mężczyźni 18–30 lat',
          source_ids: ['tietz_2018', 'mayo_test_catalog'] },
        { id: 'dheas_male_30_50', when: { sex: 'M', age_min: 30, age_max: 50, life_stage: 'adult' },
          low: 2.6, high: 10.5, context_pl: 'Mężczyźni 30–50 lat',
          source_ids: ['mayo_test_catalog', 'tietz_2018'] },
        { id: 'dheas_male_50_70', when: { sex: 'M', age_min: 50, age_max: 70, life_stage: 'adult' },
          low: 1.1, high: 7.9, context_pl: 'Mężczyźni 50–70 lat',
          source_ids: ['mayo_test_catalog'] },
        { id: 'dheas_male_70_plus', when: { sex: 'M', age_min: 70, life_stage: 'adult' },
          low: 0.8, high: 4.8, context_pl: 'Mężczyźni > 70 lat (adrenopauza)',
          source_ids: ['mayo_test_catalog', 'tietz_2018'] },
        // — Kobiety — 4 przedziały wiekowe (Mayo + Tietz)
        { id: 'dheas_female_18_30', when: { sex: 'F', age_min: 18, age_max: 30, life_stage: 'adult' },
          low: 1.9, high: 9.4, context_pl: 'Kobiety 18–30 lat',
          source_ids: ['tietz_2018', 'mayo_test_catalog'] },
        { id: 'dheas_female_30_50', when: { sex: 'F', age_min: 30, age_max: 50, life_stage: 'adult' },
          low: 0.9, high: 6.5, context_pl: 'Kobiety 30–50 lat',
          source_ids: ['mayo_test_catalog', 'tietz_2018'] },
        { id: 'dheas_female_50_70', when: { sex: 'F', age_min: 50, age_max: 70, life_stage: 'adult' },
          low: 0.4, high: 4.9, context_pl: 'Kobiety 50–70 lat (adrenopauza)',
          source_ids: ['mayo_test_catalog'] },
        { id: 'dheas_female_70_plus', when: { sex: 'F', age_min: 70, life_stage: 'adult' },
          low: 0.3, high: 2.4, context_pl: 'Kobiety > 70 lat (adrenopauza)',
          source_ids: ['mayo_test_catalog', 'tietz_2018'] },
        // — Fallback dla braku danych pacjenta
        { id: 'dheas_default', when: {}, default: true,
          low: 1.9, high: 12, context_pl: 'Dorośli, zakres ogólny (spada z wiekiem)',
          source_ids: ['tietz_2018', 'mayo_test_catalog'] }
      ],
      ranges_pl: [
        'Mężczyźni 18–30 lat: 4,3–12 μmol/L (160–450 μg/dL)',
        'Mężczyźni 60–70 lat: 1,1–5,4 μmol/L (40–200 μg/dL)',
        'Kobiety 18–30 lat: 1,9–9,4 μmol/L (70–350 μg/dL)',
        'Kobiety > 60 lat: 0,3–4,1 μmol/L (10–150 μg/dL)',
        '> 13 μmol/L (> 500 μg/dL): wymaga dalszej diagnostyki — NCAH, gruczolak androgenny lub rak kory nadnercza',
        '> 18,9 μmol/L (> 700 μg/dL): SILNE PODEJRZENIE guza nadnercza wg ES 2018 Martin (hirsutyzm/wirylizacja); wskazana pilna diagnostyka obrazowa (TK nadnerczy wielofazowe)',
        'W rakach kory nadnercza (ACC) wartości często wielokrotnie > 18,9 μmol/L'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'DHEA-S (siarczan dehydroepiandrosteronu) — marker źródła nadnerczowego androgenów. Produkowany wyłącznie w korze nadnerczy, niezależny od rytmu dobowego i fazy cyklu menstruacyjnego (w przeciwieństwie do DHEA). Stężenie spada liniowo z wiekiem („adrenopauza").'
          },
          {
            title: 'Progi kliniczne w diagnostyce hiperandrogenizmu',
            body: [
              'Wg ES 2018 Martin (hirsutyzm):',
              { items: [
                { label: 'DHEA-S do ~13 μmol/L', text: 'łagodne podwyższenie typowe dla PCOS lub fizjologicznego adrenarche.' },
                { label: 'DHEA-S 13–18,9 μmol/L', text: 'umiarkowane podwyższenie — wymaga dalszej diagnostyki (NCAH, gruczolak androgenny, rak kory nadnercza).' },
                { label: 'DHEA-S > 18,9 μmol/L (> 700 μg/dL)', text: 'silne podejrzenie guza nadnercza — pilna diagnostyka obrazowa (TK nadnerczy wielofazowe z kontrastem).' },
                { label: 'Rak kory nadnercza (ACC)', text: 'wartości często wielokrotnie wyższe od progu (kilkadziesiąt μmol/L).' }
              ]}
            ]
          },
          {
            title: 'Polskie wytyczne — skrining wirylizacji',
            body: 'PTE Bednarczuk incydentaloma 2016 — DHEA-S w panelu skriningu warunkowego u kobiet z wirylizacją, razem z testosteronem całkowitym i 17-OH-progesteronem.'
          }
        ]
      },
      sources: ['Tietz', 'Mayo Clinic Labs', 'ES 2018 Martin (hirsutyzm)', 'PTE Bednarczuk 2016 (incydentaloma)']
    },

    {
      id: 'androstenedione',
      label_pl: 'Androstendion (Δ4)',
      label_en: 'Androstenedione',
      aliases: ['Δ4-androstendion', 'A4'],
      group: 'Androgeny',
      mw: 286.41,
      canonical_si: 'nmol/L',
      clinical_indications: ['hirsutism', 'pcos', 'cah', 'adrenal_tumor', 'virilization', 'precocious_puberty'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03491 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.491 }
      ],
      precision: 3,
      default_range_si: { low: 1.2, high: 10.5, context_pl: 'Dorośli (M: 1,2–8,7; K folikul.: 1,2–10,5 nmol/L)' },
      reference_ranges_si: [
        // — Pediatria, Mayo Test 9709 (LC-MS/MS dla dorosłych; pediatria Soldin AACC 4th ed. 2003)
        //   Wcześniaki + niemowlęta (sex-neutral)
        { id: 'a4_premature_26_28', when: { age_min: 0, age_max: 0.04, life_stage: 'pediatric' },
          low: 3.21, high: 9.84, context_pl: 'Wcześniaki 26–28 tyg. (4. dzień życia)',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_premature_31_35', when: { age_min: 0, age_max: 0.10, life_stage: 'pediatric' },
          low: 2.79, high: 15.57, context_pl: 'Wcześniaki 31–35 tyg. (4. dzień życia)',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_neonatal', when: { age_min: 0, age_max: 0.02, life_stage: 'pediatric' },
          low: 0.70, high: 10.12, context_pl: 'Noworodki donoszone 1–7 dni',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_1mo_1y', when: { age_min: 0.083, age_max: 1, life_stage: 'pediatric' },
          low: 0, high: 2.41, context_pl: 'Niemowlęta 1 miesiąc – 1 rok',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        //   Tanner-based dla chłopców
        { id: 'a4_M_tanner1', when: { sex: 'M', tanner: 1 },
          low: 0, high: 1.78, context_pl: 'Chłopcy Tanner I (prepubertal)',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_M_tanner2', when: { sex: 'M', tanner: 2 },
          low: 1.08, high: 2.27, context_pl: 'Chłopcy Tanner II',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_M_tanner3', when: { sex: 'M', tanner: 3 },
          low: 1.74, high: 3.49, context_pl: 'Chłopcy Tanner III',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_M_tanner4', when: { sex: 'M', tanner: 4 },
          low: 1.68, high: 4.89, context_pl: 'Chłopcy Tanner IV',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_M_tanner5', when: { sex: 'M', tanner: 5 },
          low: 2.27, high: 7.33, context_pl: 'Chłopcy Tanner V',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        //   Tanner-based dla dziewczynek
        { id: 'a4_F_tanner1', when: { sex: 'F', tanner: 1 },
          low: 0, high: 1.78, context_pl: 'Dziewczynki Tanner I (prepubertal)',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_F_tanner2', when: { sex: 'F', tanner: 2 },
          low: 1.47, high: 3.49, context_pl: 'Dziewczynki Tanner II',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_F_tanner3', when: { sex: 'F', tanner: 3 },
          low: 2.79, high: 6.63, context_pl: 'Dziewczynki Tanner III',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_F_tanner4', when: { sex: 'F', tanner: 4 },
          low: 2.69, high: 7.85, context_pl: 'Dziewczynki Tanner IV',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_F_tanner5', when: { sex: 'F', tanner: 5 },
          low: 2.79, high: 8.38, context_pl: 'Dziewczynki Tanner V',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        // — Age-based fallback (gdy Tanner nieznany; Faza 5d).
        { id: 'a4_M_prepubertal_age', when: { sex: 'M', age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 0, high: 1.78,
          context_pl: 'Chłopcy prepubertalni (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_M_peripubertal_age', when: { sex: 'M', age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 1.08, high: 4.89,
          context_pl: 'Chłopcy pubertalni (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_M_latepubertal_age', when: { sex: 'M', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 2.27, high: 7.33,
          context_pl: 'Chłopcy późnopubertalni (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_F_prepubertal_age', when: { sex: 'F', age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 0, high: 1.78,
          context_pl: 'Dziewczynki prepubertalne (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_F_peripubertal_age', when: { sex: 'F', age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 1.47, high: 7.85,
          context_pl: 'Dziewczynki pubertalne (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        { id: 'a4_F_latepubertal_age', when: { sex: 'F', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 2.79, high: 8.38,
          context_pl: 'Dziewczynki późnopubertalne (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_androstenedione', 'soldin_2005_aacc'] },
        // — Dorośli Mayo (lepsze niż Tietz, sex-stratified)
        { id: 'a4_male_adult', when: { sex: 'M', life_stage: 'adult' },
          low: 1.40, high: 5.24, context_pl: 'Mężczyźni dorośli — Mayo LC-MS/MS',
          source_ids: ['mayo_test_androstenedione', 'tietz_2018'] },
        { id: 'a4_female_premeno', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'follicular' },
          low: 1.2, high: 10.5, context_pl: 'Kobiety, faza folikularna',
          source_ids: ['tietz_2018'] },
        { id: 'a4_female_luteal', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'luteal' },
          low: 1.2, high: 10.5, context_pl: 'Kobiety, faza lutealna',
          source_ids: ['tietz_2018'] },
        { id: 'a4_female_postmeno', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'postmenopause' },
          low: 0.5, high: 4.2, context_pl: 'Kobiety, postmenopauza',
          source_ids: ['tietz_2018'] },
        { id: 'a4_female_default', when: { sex: 'F', life_stage: 'adult' },
          low: 1.05, high: 6.98, context_pl: 'Kobiety dorosłe (zakres ogólny) — Mayo LC-MS/MS',
          source_ids: ['mayo_test_androstenedione', 'tietz_2018'] },
        { id: 'a4_default', when: {}, default: true,
          low: 1.05, high: 6.98, context_pl: 'Dorośli, zakres ogólny — Mayo LC-MS/MS',
          source_ids: ['mayo_test_androstenedione', 'tietz_2018'] }
      ],
      ranges_pl: [
        'Mężczyźni dorośli: 1,2–8,7 nmol/L (35–250 ng/dL)',
        'Kobiety (faza folikularna): 1,2–10,5 nmol/L (35–300 ng/dL)',
        'Po menopauzie: < 4,2 nmol/L (< 120 ng/dL)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'Androstendion (Δ4-androstendion) — prekursor androgenowy produkowany w korze nadnerczy (~50%) i gonadach: jajnikach/jądrach (~50%). Mierzony razem z testosteronem, SHBG, DHEA-S i 17-OHP w profilu androgenowym.'
          },
          {
            title: 'Kiedy podwyższony',
            body: [
              { items: [
                { label: 'PCOS', text: 'umiarkowane podwyższenie razem z testosteronem.' },
                { label: 'NCAH (nieklasyczny WPN)', text: 'podwyższony obok 17-OHP.' },
                { label: 'Guz nadnercza / gonady produkujący androgeny', text: 'znacznie podwyższony razem z testosteronem i DHEA-S.' }
              ]}
            ]
          },
          {
            title: 'Marker monitorowania leczenia WPN (PTEDD Kucharska 2018)',
            body: [
              'Kluczowa rola jako marker monitorowania leczenia hydrokortyzonem w klasycznym i nieklasycznym WPN. Cel terapeutyczny: środkowy zakres normy dla wieku i płci.',
              { items: [
                { label: 'Zbyt niska wartość', text: 'nadmierna substytucja → jatrogenny zespół Cushinga / zahamowanie wzrostu u dzieci.' },
                { label: 'Zbyt wysoka wartość', text: 'niedostateczna substytucja → hiperandrogenizm.' }
              ]}
            ]
          },
          {
            title: 'Hirsutyzm / PCOS — ES 2018 Martin',
            body: 'Androstendion uzupełnia profil androgenowy podstawowy (testosteron całkowity + SHBG + DHEA-S + 17-OHP) — pomocniczy zwłaszcza gdy testosteron całkowity jest granicznie podwyższony.'
          }
        ]
      },
      sources: ['Tietz', 'Mayo Clinic Labs / Soldin AACC', 'ES 2018 Martin (hirsutyzm)', 'PTEDD Kucharska 2018 (CAH monitoring)']
    },

    {
      id: 'testosterone_total',
      label_pl: 'Testosteron całkowity',
      label_en: 'Total testosterone',
      aliases: ['T', 'TT'],
      group: 'Androgeny',
      mw: 288.42,
      canonical_si: 'nmol/L',
      clinical_indications: ['hypogonadism_male', 'andropause', 'hirsutism', 'pcos', 'virilization', 'delayed_puberty', 'precocious_puberty', 'klinefelter', 'infertility', 'obesity_kids'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03467 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.467 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 0.003467 }
      ],
      precision: 3,
      default_range_si: { low: 8.6, high: 29, context_pl: 'Mężczyźni dorośli, rano (kobiety: 0,3–2,4 nmol/L)' },
      reference_ranges_si: [
        // ── Pora pobrania krytyczna diagnostycznie (Bhasin ES 2018) ──
        //  Popołudnie/wieczór — pomiar testosteronu nie jest interpretowalny do
        //  diagnostyki hipogonadyzmu (wartości mogą spaść ~30% w porównaniu z porą
        //  poranną). Flaga no_interpretation chowa pasek normy i wyłącza kolorowanie.
        { id: 'tt_evening_no_interpret', when: { time_of_day: 'evening' },
          no_interpretation: true,
          low: null, high: null,
          context_pl: 'Pobranie popołudniowe/wieczorne — brak ustalonego zakresu klinicznego. Bhasin ES 2018: do diagnostyki hipogonadyzmu wymagane pobranie 7:00–10:00. Wartości popołudniowe mogą być o ≈ 30 % niższe niż poranne.',
          source_ids: ['bhasin_es_testosterone_2018'] },
        { id: 'tt_midnight_no_interpret', when: { time_of_day: 'midnight' },
          no_interpretation: true,
          low: null, high: null,
          context_pl: 'Pobranie nocne — brak ustalonego zakresu referencyjnego. Powtórzyć pobranie rano (7:00–10:00) wg Bhasin ES 2018.',
          source_ids: ['bhasin_es_testosterone_2018'] },
        // — Pediatria, dziewczynki (Soldin 2009 LC-MS/MS)
        { id: 'tt_ped_female_0_5',   when: { sex: 'F', age_min: 0,  age_max: 6,  life_stage: 'pediatric' },
          low: 0.07, high: 0.35, context_pl: 'Dziewczynki 0–5 lat',
          source_ids: ['soldin_2009_lcms'] },
        { id: 'tt_ped_female_6_9',   when: { sex: 'F', age_min: 6,  age_max: 10, life_stage: 'pediatric' },
          low: 0.17, high: 0.45, context_pl: 'Dziewczynki 6–9 lat',
          source_ids: ['soldin_2009_lcms'] },
        { id: 'tt_ped_female_10_14', when: { sex: 'F', age_min: 10, age_max: 15, life_stage: 'pediatric' },
          low: 0.49, high: 1.73, context_pl: 'Dziewczynki 10–14 lat (pokwitanie)',
          source_ids: ['soldin_2009_lcms'] },
        { id: 'tt_ped_female_15_18', when: { sex: 'F', age_min: 15, age_max: 18, life_stage: 'pediatric' },
          low: 0.42, high: 1.84, context_pl: 'Dziewczynki 15–18 lat',
          source_ids: ['soldin_2009_lcms'] },
        // — Pediatria, chłopcy (Soldin 2009 LC-MS/MS). Szerokie zakresy 10–16 lat
        // odzwierciedlają zmienność stadium Tannera w obrębie grupy wiekowej.
        { id: 'tt_ped_male_0_6',     when: { sex: 'M', age_min: 0,  age_max: 7,  life_stage: 'pediatric' },
          low: 0.14, high: 1.07, context_pl: 'Chłopcy 0–6 lat',
          source_ids: ['soldin_2009_lcms'] },
        { id: 'tt_ped_male_7_9',     when: { sex: 'M', age_min: 7,  age_max: 10, life_stage: 'pediatric' },
          low: 0.14, high: 0.87, context_pl: 'Chłopcy 7–9 lat',
          source_ids: ['soldin_2009_lcms'] },
        { id: 'tt_ped_male_10_12',   when: { sex: 'M', age_min: 10, age_max: 13, life_stage: 'pediatric' },
          low: 0.17, high: 14.49, context_pl: 'Chłopcy 10–12 lat (wczesne pokwitanie)',
          source_ids: ['soldin_2009_lcms'] },
        { id: 'tt_ped_male_13_14',   when: { sex: 'M', age_min: 13, age_max: 15, life_stage: 'pediatric' },
          low: 0.21, high: 22.43, context_pl: 'Chłopcy 13–14 lat (pokwitanie)',
          source_ids: ['soldin_2009_lcms'] },
        { id: 'tt_ped_male_15_16',   when: { sex: 'M', age_min: 15, age_max: 17, life_stage: 'pediatric' },
          low: 1.46, high: 30.51, context_pl: 'Chłopcy 15–16 lat (późne pokwitanie)',
          source_ids: ['soldin_2009_lcms'] },
        { id: 'tt_ped_male_17_18',   when: { sex: 'M', age_min: 17, age_max: 18, life_stage: 'pediatric' },
          low: 4.20, high: 28.53, context_pl: 'Chłopcy 17–18 lat',
          source_ids: ['soldin_2009_lcms'] },
        // — Dorośli (z fazy 1)
        { id: 'tt_male_adult', when: { sex: 'M', life_stage: 'adult' },
          low: 8.6, high: 29, context_pl: 'Mężczyźni dorośli, rano (próg hipogonadyzmu < 9,2 nmol/L wg Bhasin 2018)',
          source_ids: ['bhasin_es_testosterone_2018', 'tietz_2018'] },
        { id: 'tt_female_adult', when: { sex: 'F', life_stage: 'adult' },
          low: 0.3, high: 2.4, context_pl: 'Kobiety dorosłe',
          source_ids: ['tietz_2018'] },
        { id: 'tt_default', when: {}, default: true,
          low: 8.6, high: 29, context_pl: 'Dorosły, zakres ogólny (mężczyźni)',
          source_ids: ['bhasin_es_testosterone_2018', 'tietz_2018'] }
      ],
      ranges_pl: [
        'Mężczyźni dorośli (rano): 8,6–29 nmol/L (250–840 ng/dL)',
        'Kobiety dorosłe: 0,3–2,4 nmol/L (8–70 ng/dL)',
        'Progi diagnostyczne (hipogonadyzm M, guzy androgenne K, metoda LC-MS/MS) — zob. sekcje poniżej.'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'Testosteron całkowity — suma wolnego (~2%), związanego z SHBG (~60%) i z albuminą (~38%). Główny androgen u mężczyzn. U kobiet ~50% pochodzi z konwersji obwodowej androstendionu, ~25% z jajników, ~25% z nadnerczy. Interpretacja zawsze w kontekście SHBG + albuminy (wzór Vermeulena dla wolnego T).'
          },
          {
            title: 'Protokół pobrania (Bhasin ES 2018)',
            body: [
              { items: [
                { label: 'Pora dnia', text: 'rano 7:00–10:00 (rytm dobowy — peak rano).' },
                { label: 'Stan pacjenta', text: 'na czczo, w stanie stabilnym (bez ostrych chorób, deprywacji snu, dużego wysiłku).' },
                { label: 'Powtórzenie', text: 'wymagane 2-KROTNE potwierdzenie w odrębnych dniach przy rozpoznaniu hipogonadyzmu.' }
              ]}
            ]
          },
          {
            title: 'Metoda — LC-MS/MS vs immunoassay',
            body: 'LC-MS/MS to metoda referencyjna — szczególnie zalecana u kobiet i przy wartościach granicznych. Bezpośrednie immunoassaye u kobiet zaniżają wyniki (Bhasin ES 2018, Endocrine Society / PTE 2018) — niska dokładność w zakresie wartości kobiecych.'
          },
          {
            title: 'Pułapki — przejściowy spadek testosteronu',
            body: [
              { items: [
                'Choroby ostre (NTIS — non-thyroidal illness syndrome z hipogonadyzmem czynnościowym).',
                'Duży wysiłek, deprywacja snu.',
                'Otyłość (obniżona SHBG przez insulinooporność → ↓ T całkowity przy zachowanym T wolnym).',
                'Niedoczynność tarczycy.',
                'Leczenie opioidami, glikokortykosteroidami.',
                'Sterydy anaboliczne — zahamowanie osi HPG; testosteron endogenny niski po odstawieniu (do kilku miesięcy).'
              ]}
            ]
          },
          {
            title: 'Polskie wytyczne — hipogonadyzm u mężczyzn (PTE / EAU 2023)',
            body: [
              { items: [
                { label: 'T < 9,2 nmol/L', text: 'kryterium rozpoznania LOH (late-onset hypogonadism — hipogonadyzm o późnym początku).' },
                { label: 'T 9,2–12 nmol/L (350 ng/dL)', text: 'strefa graniczna — EAU 2023 zaleca dalszą ocenę (SHBG, T wolny obliczony wzorem Vermeulena).' }
              ]}
            ]
          },
          {
            title: 'Hirsutyzm u kobiet — ES 2018 Martin',
            body: [
              { items: [
                { label: 'T > 7 nmol/L', text: 'silne podejrzenie guza androgennego — pilna diagnostyka obrazowa (USG narządów rodnych + TK nadnerczy wielofazowe).' },
                { label: 'T > 14 nmol/L', text: 'praktycznie pewny guz produkujący androgeny.' }
              ]}
            ]
          }
        ]
      },
      sources: ['Tietz', 'Endocrine Society Male Hypogonadism 2018 (Bhasin)', 'ES 2018 Martin (hirsutyzm — progi guza K)', 'EAU 2023 (Salonia, LOH)', 'Soldin 2009 (LC-MS/MS pediatria)']
    },

    {
      id: 'testosterone_free',
      label_pl: 'Testosteron wolny',
      label_en: 'Free testosterone',
      aliases: ['fT', 'wolny T'],
      group: 'Androgeny',
      mw: 288.42,
      canonical_si: 'pmol/L',
      clinical_indications: ['hypogonadism_male', 'andropause', 'hirsutism', 'pcos'],
      units: [
        { symbol: 'pmol/L', label: 'pmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 3.467 },
        { symbol: 'pg/dL',  label: 'pg/dL',        kind: 'conv', factor_to_si: 0.3467 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 34.67 }
      ],
      precision: 3,
      default_range_si: { low: 174, high: 729, context_pl: 'Mężczyźni dorośli (kobiety: 1,7–22 pmol/L)' },
      reference_ranges_si: [
        // ── Pora pobrania krytyczna diagnostycznie (Bhasin ES 2018) ──
        //  Wolny testosteron, jak całkowity, wymaga pobrania porannego.
        { id: 'ft_evening_no_interpret', when: { time_of_day: 'evening' },
          no_interpretation: true,
          low: null, high: null,
          context_pl: 'Pobranie popołudniowe/wieczorne — brak ustalonego zakresu klinicznego. Bhasin ES 2018: do diagnostyki hipogonadyzmu wymagane pobranie 7:00–10:00.',
          source_ids: ['bhasin_es_testosterone_2018'] },
        { id: 'ft_midnight_no_interpret', when: { time_of_day: 'midnight' },
          no_interpretation: true,
          low: null, high: null,
          context_pl: 'Pobranie nocne — brak ustalonego zakresu referencyjnego.',
          source_ids: ['bhasin_es_testosterone_2018'] },
        // — Pediatria, Mayo Test 83686 (equilibrium dialysis + LC-MS/MS).
        //   Wartości w ng/dL × 34.67 = pmol/L; Mayo podaje per rok 8–24 lata.
        //   Łączę sąsiednie roczne grupy w 2-letnie zakresy gdy wartości są zbliżone.
        //   Chłopcy
        { id: 'ft_M_neonate', when: { sex: 'M', age_min: 0, age_max: 0.04, life_stage: 'pediatric' },
          low: 6.93, high: 107.48, context_pl: 'Chłopcy 1–15 dni (donoszone)',
          source_ids: ['mayo_test_free_t'] },
        { id: 'ft_M_1_8', when: { sex: 'M', age_min: 0.04, age_max: 9, life_stage: 'pediatric' },
          low: 0, high: 4.51, context_pl: 'Chłopcy 1–8 lat (prepubertal)',
          source_ids: ['mayo_test_free_t'] },
        { id: 'ft_M_9', when: { sex: 'M', age_min: 9, age_max: 10, life_stage: 'pediatric' },
          low: 0, high: 15.60, context_pl: 'Chłopcy 9 lat',
          source_ids: ['mayo_test_free_t'] },
        { id: 'ft_M_10', when: { sex: 'M', age_min: 10, age_max: 11, life_stage: 'pediatric' },
          low: 0, high: 43.68, context_pl: 'Chłopcy 10 lat',
          source_ids: ['mayo_test_free_t'] },
        { id: 'ft_M_11', when: { sex: 'M', age_min: 11, age_max: 12, life_stage: 'pediatric' },
          low: 0, high: 191.4, context_pl: 'Chłopcy 11 lat',
          source_ids: ['mayo_test_free_t'] },
        { id: 'ft_M_12', when: { sex: 'M', age_min: 12, age_max: 13, life_stage: 'pediatric' },
          low: 0, high: 321.7, context_pl: 'Chłopcy 12 lat',
          source_ids: ['mayo_test_free_t'] },
        { id: 'ft_M_13', when: { sex: 'M', age_min: 13, age_max: 14, life_stage: 'pediatric' },
          low: 0, high: 436.8, context_pl: 'Chłopcy 13 lat',
          source_ids: ['mayo_test_free_t'] },
        { id: 'ft_M_14', when: { sex: 'M', age_min: 14, age_max: 15, life_stage: 'pediatric' },
          low: 16.64, high: 530.5, context_pl: 'Chłopcy 14 lat',
          source_ids: ['mayo_test_free_t'] },
        { id: 'ft_M_15', when: { sex: 'M', age_min: 15, age_max: 16, life_stage: 'pediatric' },
          low: 56.17, high: 613.7, context_pl: 'Chłopcy 15 lat',
          source_ids: ['mayo_test_free_t'] },
        { id: 'ft_M_16', when: { sex: 'M', age_min: 16, age_max: 17, life_stage: 'pediatric' },
          low: 101.6, high: 676.1, context_pl: 'Chłopcy 16 lat',
          source_ids: ['mayo_test_free_t'] },
        { id: 'ft_M_17', when: { sex: 'M', age_min: 17, age_max: 18, life_stage: 'pediatric' },
          low: 148.4, high: 724.6, context_pl: 'Chłopcy 17 lat',
          source_ids: ['mayo_test_free_t'] },
        //   Dziewczynki
        { id: 'ft_F_neonate', when: { sex: 'F', age_min: 0, age_max: 0.04, life_stage: 'pediatric' },
          low: 0, high: 8.67, context_pl: 'Dziewczynki 1–15 dni (donoszone)',
          source_ids: ['mayo_test_free_t'] },
        { id: 'ft_F_1_6', when: { sex: 'F', age_min: 0.04, age_max: 7, life_stage: 'pediatric' },
          low: 0, high: 4.85, context_pl: 'Dziewczynki 1–6 lat',
          source_ids: ['mayo_test_free_t'] },
        { id: 'ft_F_7_9', when: { sex: 'F', age_min: 7, age_max: 10, life_stage: 'pediatric' },
          low: 0, high: 15.95, context_pl: 'Dziewczynki 7–9 lat',
          source_ids: ['mayo_test_free_t'] },
        { id: 'ft_F_10_12', when: { sex: 'F', age_min: 10, age_max: 13, life_stage: 'pediatric' },
          low: 0, high: 29.12, context_pl: 'Dziewczynki 10–12 lat',
          source_ids: ['mayo_test_free_t'] },
        { id: 'ft_F_13_18', when: { sex: 'F', age_min: 13, age_max: 18, life_stage: 'pediatric' },
          low: 0, high: 37.79, context_pl: 'Dziewczynki 13–18 lat',
          source_ids: ['mayo_test_free_t'] },
        // — Dorośli (Bhasin Endocrine Society 2018 + Mayo)
        { id: 'ft_male_adult', when: { sex: 'M', life_stage: 'adult' },
          low: 174, high: 729, context_pl: 'Mężczyźni dorośli (ekwilibrium dialysis lub obliczenie ze SHBG)',
          source_ids: ['bhasin_es_testosterone_2018', 'mayo_test_free_t'] },
        { id: 'ft_female_adult', when: { sex: 'F', life_stage: 'adult' },
          low: 1.7, high: 37.44, context_pl: 'Kobiety dorosłe (1,7–37 pmol/L, Mayo: do 1,08 ng/dL)',
          source_ids: ['tietz_2018', 'mayo_test_free_t'] },
        { id: 'ft_default', when: {}, default: true,
          low: 174, high: 729, context_pl: 'Dorosły, zakres ogólny (mężczyźni)',
          source_ids: ['bhasin_es_testosterone_2018'] }
      ],
      ranges_pl: [
        'Mężczyźni dorośli: 174–729 pmol/L (50–210 pg/mL)',
        'Próg HIPOGONADYZMU T wolny: orientacyjnie < ~220 pmol/L (~65 pg/mL); DOKŁADNY próg zależy od metody — porównaj z normami laboratorium (Bhasin ES 2018)',
        'Kobiety dorosłe: 1,7–22 pmol/L (0,5–6,3 pg/mL)',
        'Wzrost wolnego T u kobiety przy granicznym T całkowitym sugeruje hiperandrogenizm (PCOS, NCAH); FAI > 5 (z SHBG) czulszy parametr u kobiet'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'Testosteron wolny — biologicznie aktywna frakcja testosteronu (~2% testosteronu całkowitego), niezwiązana z SHBG ani albuminą. Najbardziej wartościowy parametr w stanach z nieprawidłową SHBG (otyłość, cukrzyca, marskość, starszy wiek, estrogeny).'
          },
          {
            title: 'Metody pomiaru (Bhasin ES 2018)',
            body: [
              { items: [
                { label: 'Preferowane (referencyjne)', text: 'equilibrium dialysis + LC-MS/MS lub ultrafiltracja + LC-MS/MS — metody złotego standardu.' },
                { label: 'Akceptowalna alternatywa', text: 'obliczenie wzorem Vermeulena (1999 JCEM) z testosteronu całkowitego + SHBG + albuminy — dostępne kalkulatory online; akceptowalne w rutynowej diagnostyce.' },
                { label: 'Niezalecane', text: 'bezpośrednie immunoassaye (RIA, ELISA) — niska dokładność w zakresie wartości kobiecych i granicznych męskich.' }
              ]}
            ]
          },
          {
            title: 'Kiedy oznaczać T wolny',
            body: [
              'Wskazania (Bhasin ES 2018):',
              { items: [
                { label: 'T całkowity w strefie granicznej', text: '8–12 nmol/L u mężczyzn — uzupełnij oznaczeniem T wolnego.' },
                { label: 'Nieprawidłowa SHBG (obniżona)', text: 'otyłość, cukrzyca, zespół metaboliczny → ↓ SHBG → ↓ T całkowity przy zachowanym T wolnym.' },
                { label: 'Nieprawidłowa SHBG (podwyższona)', text: 'starszy wiek, marskość, hipertyreoza, estrogeny → ↑ SHBG → ↑ T całkowity przy obniżonym T wolnym.' }
              ]}
            ]
          },
          {
            title: 'Hiperandrogenizm u kobiet — FAI lepszy niż T wolny',
            body: 'U kobiet z hiperandrogenizmem (hirsutyzm, PCOS) obliczenie FAI (Free Androgen Index) = T całk. × 100 / SHBG jest czulszym parametrem niż sam T wolny (ES 2018 Martin).'
          }
        ]
      },
      sources: ['Endocrine Society Male Hypogonadism 2018 (Bhasin)', 'Vermeulen 1999 JCEM', 'ES 2018 Martin (hirsutyzm — FAI)']
    },

    {
      id: 'dht',
      label_pl: 'DHT (5α-dihydrotestosteron)',
      label_en: 'Dihydrotestosterone',
      aliases: ['5α-DHT', 'androstanolone'],
      group: 'Androgeny',
      mw: 290.44,
      canonical_si: 'nmol/L',
      clinical_indications: ['dsd', 'hirsutism', '5a_reductase_deficiency', 'hypogonadism_male'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03443 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.443 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 0.003443 }
      ],
      precision: 3,
      default_range_si: { low: 1.0, high: 3.1, context_pl: 'Mężczyźni dorośli (kobiety: 0,1–0,9 nmol/L)' },
      reference_ranges_si: [
        // — Pediatria, Mayo Test 81479 (HPLC + LC-MS/MS).
        //   Wartości w pg/mL × 0.003443 = nmol/L (MW 290.45). Krew pępowinowa
        //   oraz fizjologiczny szczyt do 6. miesiąca życia ("mini-puberty").
        { id: 'dht_M_cord', when: { sex: 'M', age_min: 0, age_max: 0.003, life_stage: 'pediatric' },
          low: 0, high: 0.344, context_pl: 'Chłopcy — krew pępowinowa',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_M_under_6mo', when: { sex: 'M', age_min: 0, age_max: 0.5, life_stage: 'pediatric' },
          low: 0, high: 4.132, context_pl: 'Chłopcy ≤ 6 miesięcy (mini-puberty)',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_F_cord', when: { sex: 'F', age_min: 0, age_max: 0.003, life_stage: 'pediatric' },
          low: 0, high: 0.172, context_pl: 'Dziewczynki — krew pępowinowa',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_F_under_6mo', when: { sex: 'F', age_min: 0, age_max: 0.5, life_stage: 'pediatric' },
          low: 0, high: 4.132, context_pl: 'Dziewczynki ≤ 6 miesięcy',
          source_ids: ['mayo_test_dht'] },
        //   Tanner-based dla chłopców
        { id: 'dht_M_tanner1', when: { sex: 'M', tanner: 1 },
          low: 0, high: 0.172, context_pl: 'Chłopcy Tanner I (śr. 7,1 lat)',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_M_tanner2', when: { sex: 'M', tanner: 2 },
          low: 0, high: 0.689, context_pl: 'Chłopcy Tanner II (śr. 12,1 lat)',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_M_tanner3', when: { sex: 'M', tanner: 3 },
          low: 0.275, high: 1.136, context_pl: 'Chłopcy Tanner III (śr. 13,6 lat)',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_M_tanner4', when: { sex: 'M', tanner: 4 },
          low: 0.757, high: 1.790, context_pl: 'Chłopcy Tanner IV (śr. 15,1 lat)',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_M_tanner5', when: { sex: 'M', tanner: 5 },
          low: 0.826, high: 2.238, context_pl: 'Chłopcy Tanner V (śr. 18 lat)',
          source_ids: ['mayo_test_dht'] },
        //   Tanner-based dla dziewczynek (Mayo: stała 0–300 pg/mL od II–V)
        { id: 'dht_F_tanner1', when: { sex: 'F', tanner: 1 },
          low: 0, high: 0.172, context_pl: 'Dziewczynki Tanner I',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_F_tanner2_5', when: { sex: 'F', tanner: 2 },
          low: 0, high: 1.033, context_pl: 'Dziewczynki Tanner II–V',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_F_tanner3_5', when: { sex: 'F', tanner: 3 },
          low: 0, high: 1.033, context_pl: 'Dziewczynki Tanner II–V',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_F_tanner4_5', when: { sex: 'F', tanner: 4 },
          low: 0, high: 1.033, context_pl: 'Dziewczynki Tanner II–V',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_F_tanner5_5', when: { sex: 'F', tanner: 5 },
          low: 0, high: 1.033, context_pl: 'Dziewczynki Tanner V',
          source_ids: ['mayo_test_dht'] },
        // — Age-based fallback (gdy Tanner nieznany; Faza 5d).
        { id: 'dht_M_prepubertal_age', when: { sex: 'M', age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 0, high: 0.172,
          context_pl: 'Chłopcy prepubertalni (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_M_peripubertal_age', when: { sex: 'M', age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 0, high: 1.79,
          context_pl: 'Chłopcy pubertalni (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_M_latepubertal_age', when: { sex: 'M', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 0.826, high: 2.238,
          context_pl: 'Chłopcy późnopubertalni (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_F_prepubertal_age', when: { sex: 'F', age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 0, high: 0.172,
          context_pl: 'Dziewczynki prepubertalne (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_F_peripubertal_age', when: { sex: 'F', age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 0, high: 1.033,
          context_pl: 'Dziewczynki pubertalne (9–14 lat, Tanner II–IV — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_F_latepubertal_age', when: { sex: 'F', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 0, high: 1.033,
          context_pl: 'Dziewczynki późnopubertalne (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_dht'] },
        // — Dorośli (Mayo M szerszy niż Tietz; F do 55 lat 0–300 pg/mL, > 55 niżej)
        { id: 'dht_male_adult', when: { sex: 'M', life_stage: 'adult' },
          low: 0.386, high: 3.288, context_pl: 'Mężczyźni dorośli (>19 lat)',
          source_ids: ['mayo_test_dht', 'tietz_2018'] },
        { id: 'dht_female_premeno', when: { sex: 'F', age_min: 18, age_max: 55, life_stage: 'adult' },
          low: 0, high: 1.033, context_pl: 'Kobiety dorosłe 20–55 lat',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_female_postmeno', when: { sex: 'F', age_min: 55, life_stage: 'adult' },
          low: 0, high: 0.441, context_pl: 'Kobiety > 55 lat',
          source_ids: ['mayo_test_dht'] },
        { id: 'dht_default', when: {}, default: true,
          low: 0.386, high: 3.288, context_pl: 'Dorosły, zakres ogólny (mężczyźni)',
          source_ids: ['mayo_test_dht', 'tietz_2018'] }
      ],
      ranges_pl: [
        'Mężczyźni dorośli: 1,0–3,1 nmol/L (30–90 ng/dL)',
        'Kobiety dorosłe: 0,1–0,9 nmol/L (3–25 ng/dL)',
        'Stosunek T/DHT — KLUCZOWY w diagnostyce niedoboru 5α-reduktazy typu 2 (mutacja SRD5A2, autosomalna recesywna):',
        '  - Norma T/DHT < 16',
        '  - Bazalnie > 30 → silne podejrzenie niedoboru 5α-RD2 (Mendonça 2016)',
        '  - Bazalnie 16–30 → niejednoznaczne, wskazany test stymulacji hCG',
        '  - Po stymulacji hCG T/DHT > 10–20 → potwierdza niedobór 5α-RD2'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'DHT (5α-dihydrotestosteron) — najsilniejszy androgen u człowieka. Powstaje z testosteronu pod wpływem enzymu 5α-reduktazy (głównie w skórze, mieszkach włosowych, prostacie, zewnętrznych narządach płciowych). Obniżony u osób leczonych finasterydem lub dutasterydem (inhibitory 5α-RD typu 2).'
          },
          {
            title: 'Kluczowa rola diagnostyczna — niedobór 5α-reduktazy typu 2',
            body: [
              'Mutacja SRD5A2 (autosomalna recesywna) — u 46,XY z niejednoznacznymi narządami płciowymi lub niedostateczną wirylizacją w okresie dojrzewania:',
              { items: [
                { label: 'T prawidłowy / podwyższony', text: 'oś HPG zachowana.' },
                { label: 'DHT obniżony', text: 'defekt enzymatyczny.' },
                { label: 'Stosunek T/DHT podwyższony', text: 'kluczowy wskaźnik (Mendonça 2016).' }
              ]}
            ]
          },
          {
            title: 'Diagnostyka różnicowa DSD 46,XY',
            body: [
              { items: [
                { label: 'Niedobór 5α-RD typu 2', text: 'T/DHT > 30 bazalnie lub > 10–20 po stymulacji hCG.' },
                { label: 'Zespół niewrażliwości na androgeny (CAIS/PAIS)', text: 'T i DHT prawidłowe/podwyższone, LH wysoki (oporność receptora AR).' },
                { label: 'Defekty syntezy testosteronu (17β-HSD3, StAR, HSD3B2)', text: 'T niski, LH wysoki.' }
              ]}
            ]
          },
          {
            title: 'Optymalny moment pomiaru u niemowląt',
            body: 'Mini-puberty 1.–6. miesiąc życia (szczyt ~3 mies.) — bazalne wartości T i DHT są wiarygodne bez stymulacji. Poza tym oknem (od 6 mies. do dojrzewania) T bazalny jest niski/nieoznaczalny — konieczny test stymulacji hCG.'
          }
        ]
      },
      sources: ['Tietz', 'Mayo Clinic Labs', 'Mendonça 2016 (5α-RD2 diagnostyka)']
    },

    /* ───────────── Estrogeny / progesteron ───────────── */

    {
      id: 'estradiol',
      label_pl: 'Estradiol (E2)',
      label_en: '17β-Estradiol',
      aliases: ['E2', '17β-E2'],
      group: 'Estrogeny / progesteron',
      mw: 272.38,
      canonical_si: 'pmol/L',
      clinical_indications: ['hypogonadism_female', 'menopause', 'ovarian_failure', 'gynecomastia', 'precocious_puberty', 'delayed_puberty', 'ivf_reserve', 'infertility'],
      units: [
        { symbol: 'pmol/L', label: 'pmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'nmol/L', label: 'nmol/L',       kind: 'si',   factor_to_si: 1000 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 3.671 },
        { symbol: 'ng/L',   label: 'ng/L',         kind: 'conv', factor_to_si: 3.671 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 36.71 }
      ],
      precision: 3,
      default_range_si: { low: 70, high: 290, context_pl: 'Kobiety, faza folikularna (M: 40–160 pmol/L; pik owul. do 1460)' },
      reference_ranges_si: [
        // — Mini-puberty (dziewczynki 14 dni – 6 mies). Literatura PL/EU:
        //   Bizzarri 2014 + Endokrynologia Pediatryczna — u dziewczynek 1–3 mies
        //   E2 dochodzi do ~50 pg/mL (~183 pmol/L), spadek < 10 pg/mL po 6. mies.
        //   Mini-puberty u chłopców: E2 nieistotny (główne LH/FSH/T), więc tylko F.
        { id: 'e2_F_mini_puberty', when: { sex: 'F', age_min: 0.038, age_max: 0.5, life_stage: 'pediatric' },
          low: 0, high: 183,
          context_pl: 'Dziewczynki 14 dni – 6 miesięcy (mini-puberty żeńska; do ~50 pg/mL)',
          source_ids: ['mayo_test_estradiol'] },
        // — Pediatria, Mayo Test 81816 (HPLC + LC-MS/MS).
        //   Wartości w pg/mL × 3.671 = pmol/L (MW 272.38).
        //   Tanner-based, chłopcy
        { id: 'e2_M_tanner1', when: { sex: 'M', tanner: 1 },
          low: 0, high: 47.79, context_pl: 'Chłopcy Tanner I (>14 dni, prepubertal)',
          source_ids: ['mayo_test_estradiol'] },
        { id: 'e2_M_tanner2', when: { sex: 'M', tanner: 2 },
          low: 0, high: 58.82, context_pl: 'Chłopcy Tanner II',
          source_ids: ['mayo_test_estradiol'] },
        { id: 'e2_M_tanner3', when: { sex: 'M', tanner: 3 },
          low: 0, high: 95.58, context_pl: 'Chłopcy Tanner III',
          source_ids: ['mayo_test_estradiol'] },
        { id: 'e2_M_tanner4', when: { sex: 'M', tanner: 4 },
          low: 0, high: 139.69, context_pl: 'Chłopcy Tanner IV',
          source_ids: ['mayo_test_estradiol'] },
        { id: 'e2_M_tanner5', when: { sex: 'M', tanner: 5 },
          low: 36.76, high: 147.04, context_pl: 'Chłopcy Tanner V',
          source_ids: ['mayo_test_estradiol'] },
        //   Tanner-based, dziewczynki
        { id: 'e2_F_tanner1', when: { sex: 'F', tanner: 1 },
          low: 0, high: 73.52, context_pl: 'Dziewczynki Tanner I (>14 dni, prepubertal)',
          source_ids: ['mayo_test_estradiol'] },
        { id: 'e2_F_tanner2', when: { sex: 'F', tanner: 2 },
          low: 0, high: 88.22, context_pl: 'Dziewczynki Tanner II',
          source_ids: ['mayo_test_estradiol'] },
        { id: 'e2_F_tanner3', when: { sex: 'F', tanner: 3 },
          low: 0, high: 220.56, context_pl: 'Dziewczynki Tanner III',
          source_ids: ['mayo_test_estradiol'] },
        { id: 'e2_F_tanner4', when: { sex: 'F', tanner: 4 },
          low: 55.14, high: 312.46, context_pl: 'Dziewczynki Tanner IV',
          source_ids: ['mayo_test_estradiol'] },
        { id: 'e2_F_tanner5', when: { sex: 'F', tanner: 5 },
          low: 0, high: 290,
          context_pl: 'Dziewczynki Tanner V — domyślnie zakres premenopauzy fazy folikularnej (faza cyklu zmienia interpretację: owulacja 380–1460; lutealna 200–770 pmol/L)',
          source_ids: ['mayo_test_estradiol', 'tietz_2018'] },
        // — Age-based fallback (gdy Tanner nieznany; Faza 5d). Mini-puberty F (0–6 mies) wyżej.
        { id: 'e2_M_prepubertal_age', when: { sex: 'M', age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 0, high: 47.79,
          context_pl: 'Chłopcy prepubertalni (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_estradiol'] },
        { id: 'e2_M_peripubertal_age', when: { sex: 'M', age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 0, high: 139.69,
          context_pl: 'Chłopcy pubertalni (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_estradiol'] },
        { id: 'e2_M_latepubertal_age', when: { sex: 'M', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 36.76, high: 147.04,
          context_pl: 'Chłopcy późnopubertalni (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_estradiol'] },
        { id: 'e2_F_prepubertal_age', when: { sex: 'F', age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 0, high: 73.52,
          context_pl: 'Dziewczynki prepubertalne (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_estradiol'] },
        { id: 'e2_F_peripubertal_age', when: { sex: 'F', age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 0, high: 312.46,
          context_pl: 'Dziewczynki pubertalne (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany; faza cyklu zmienia interpretację)',
          source_ids: ['mayo_test_estradiol'] },
        { id: 'e2_F_latepubertal_age', when: { sex: 'F', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 0, high: 290,
          context_pl: 'Dziewczynki późnopubertalne (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany; faza cyklu zmienia interpretację)',
          source_ids: ['mayo_test_estradiol', 'tietz_2018'] },
        // — Dorośli (z fazy 1) — zachowujemy fazę cyklu z Tietz
        { id: 'e2_female_follicular', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'follicular' },
          low: 70, high: 290, context_pl: 'Kobiety, faza folikularna',
          source_ids: ['tietz_2018'] },
        { id: 'e2_female_ovulation', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'ovulation' },
          low: 380, high: 1460, context_pl: 'Kobiety, pik owulacyjny',
          source_ids: ['tietz_2018'] },
        { id: 'e2_female_luteal', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'luteal' },
          low: 200, high: 770, context_pl: 'Kobiety, faza lutealna',
          source_ids: ['tietz_2018'] },
        { id: 'e2_female_postmeno', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'postmenopause' },
          low: 0, high: 110,
          context_pl: 'Kobiety, postmenopauza — kryterium menopauzy w PL: E2 < 30 pg/mL (~110 pmol/L) + FSH > 30 IU/L (PTMRiE/PTG, ESHRE 2016)',
          source_ids: ['tietz_2018', 'ptmrie_ptgp_2018'] },
        { id: 'e2_male_adult', when: { sex: 'M', life_stage: 'adult' },
          low: 40, high: 160, context_pl: 'Mężczyźni dorośli',
          source_ids: ['tietz_2018'] },
        { id: 'e2_female_default', when: { sex: 'F', life_stage: 'adult' },
          low: 70, high: 290, context_pl: 'Kobiety dorosłe (domyślnie: faza folikularna)',
          source_ids: ['tietz_2018'] },
        { id: 'e2_default', when: {}, default: true,
          low: 70, high: 290, context_pl: 'Dorośli, zakres ogólny (kobiety, faza folikularna)',
          source_ids: ['tietz_2018'] }
      ],
      ranges_pl: [
        'Faza folikularna wczesna: 70–290 pmol/L (19–80 pg/mL)',
        'Pik owulacyjny: 380–1 460 pmol/L (105–400 pg/mL)',
        'Faza lutealna: 200–770 pmol/L (55–210 pg/mL)',
        'Postmenopauza: < 110 pmol/L (< 30 pg/mL)',
        'Mężczyźni dorośli: 40–160 pmol/L (10–45 pg/mL)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'Estradiol (E2) — główny estrogen u kobiet w wieku rozrodczym, produkowany przez pęcherzyki jajnikowe. U mężczyzn pochodzi z aromatyzacji testosteronu (w tkance tłuszczowej i jądrach). Pomiar zależny od fazy cyklu — zawsze podaj dzień cyklu lub fazę.'
          },
          {
            title: '⚠ Uwaga metodologiczna — dzieci',
            body: 'Bardzo wysokie pomiary E2 u dzieci często odzwierciedlają ograniczenia immunoassayów (krzyżowa reaktywność z innymi steroidami). U dzieci preferowaną metodą jest LC-MS/MS — metoda referencyjna zalecana przez ESPE/Endocrine Society. W diagnostyce przedwczesnego dojrzewania pomiar E2 metodą immunoassay ma ograniczoną wartość — czulszą metodą jest test stymulacji LH-RH.'
          }
        ]
      },
      sources: ['Tietz']
    },

    {
      id: 'estrone',
      label_pl: 'Estron (E1)',
      label_en: 'Estrone',
      aliases: ['E1'],
      group: 'Estrogeny / progesteron',
      clinical_indications: ['menopause', 'ovarian_failure', 'gynecomastia', 'precocious_puberty'],
      mw: 270.37,
      canonical_si: 'pmol/L',
      units: [
        { symbol: 'pmol/L', label: 'pmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 3.699 },
        { symbol: 'ng/L',   label: 'ng/L',         kind: 'conv', factor_to_si: 3.699 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 36.99 }
      ],
      precision: 3,
      default_range_si: { low: 110, high: 400, context_pl: 'Kobiety, faza folikularna (M: 40–180; postmenop.: 30–130 pmol/L)' },
      reference_ranges_si: [
        // — Pediatria, Mayo Test 81418 (HPLC + LC-MS/MS).
        //   Wartości w pg/mL × 3.699 = pmol/L (MW 270.37).
        //   Tanner-based, chłopcy
        { id: 'e1_M_tanner1', when: { sex: 'M', tanner: 1 },
          low: 0, high: 59.26, context_pl: 'Chłopcy Tanner I (>14 dni, prepubertal)',
          source_ids: ['mayo_test_estrone'] },
        { id: 'e1_M_tanner2', when: { sex: 'M', tanner: 2 },
          low: 0, high: 81.49, context_pl: 'Chłopcy Tanner II',
          source_ids: ['mayo_test_estrone'] },
        { id: 'e1_M_tanner3', when: { sex: 'M', tanner: 3 },
          low: 37.04, high: 92.60, context_pl: 'Chłopcy Tanner III',
          source_ids: ['mayo_test_estrone'] },
        { id: 'e1_M_tanner4', when: { sex: 'M', tanner: 4 },
          low: 37.04, high: 170.38, context_pl: 'Chłopcy Tanner IV',
          source_ids: ['mayo_test_estrone'] },
        { id: 'e1_M_tanner5', when: { sex: 'M', tanner: 5 },
          low: 37.04, high: 222.24, context_pl: 'Chłopcy Tanner V',
          source_ids: ['mayo_test_estrone'] },
        //   Tanner-based, dziewczynki
        { id: 'e1_F_tanner1', when: { sex: 'F', tanner: 1 },
          low: 0, high: 107.42, context_pl: 'Dziewczynki Tanner I (>14 dni)',
          source_ids: ['mayo_test_estrone'] },
        { id: 'e1_F_tanner2', when: { sex: 'F', tanner: 2 },
          low: 37.04, high: 122.23, context_pl: 'Dziewczynki Tanner II',
          source_ids: ['mayo_test_estrone'] },
        { id: 'e1_F_tanner3', when: { sex: 'F', tanner: 3 },
          low: 55.56, high: 159.27, context_pl: 'Dziewczynki Tanner III',
          source_ids: ['mayo_test_estrone'] },
        { id: 'e1_F_tanner4', when: { sex: 'F', tanner: 4 },
          low: 59.26, high: 285.21, context_pl: 'Dziewczynki Tanner IV',
          source_ids: ['mayo_test_estrone'] },
        { id: 'e1_F_tanner5', when: { sex: 'F', tanner: 5 },
          low: 62.97, high: 740.80, context_pl: 'Dziewczynki Tanner V',
          source_ids: ['mayo_test_estrone'] },
        // — Age-based fallback (gdy Tanner nieznany; Faza 5d).
        { id: 'e1_M_prepubertal_age', when: { sex: 'M', age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 0, high: 59.26,
          context_pl: 'Chłopcy prepubertalni (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_estrone'] },
        { id: 'e1_M_peripubertal_age', when: { sex: 'M', age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 0, high: 170.38,
          context_pl: 'Chłopcy pubertalni (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_estrone'] },
        { id: 'e1_M_latepubertal_age', when: { sex: 'M', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 37.04, high: 222.24,
          context_pl: 'Chłopcy późnopubertalni (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_estrone'] },
        { id: 'e1_F_prepubertal_age', when: { sex: 'F', age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 0, high: 107.42,
          context_pl: 'Dziewczynki prepubertalne (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_estrone'] },
        { id: 'e1_F_peripubertal_age', when: { sex: 'F', age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 37.04, high: 285.21,
          context_pl: 'Dziewczynki pubertalne (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_estrone'] },
        { id: 'e1_F_latepubertal_age', when: { sex: 'F', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 62.97, high: 740.80,
          context_pl: 'Dziewczynki późnopubertalne (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_estrone'] },
        // — Dorośli (z fazy 1 + Mayo)
        { id: 'e1_female_follicular', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'follicular' },
          low: 110, high: 400, context_pl: 'Kobiety, faza folikularna',
          source_ids: ['tietz_2018', 'mayo_test_estrone'] },
        { id: 'e1_female_postmeno', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'postmenopause' },
          low: 30, high: 130, context_pl: 'Kobiety, postmenopauza',
          source_ids: ['tietz_2018'] },
        { id: 'e1_male_adult', when: { sex: 'M', life_stage: 'adult' },
          low: 40, high: 180, context_pl: 'Mężczyźni dorośli',
          source_ids: ['tietz_2018'] },
        { id: 'e1_female_default', when: { sex: 'F', life_stage: 'adult' },
          low: 110, high: 400, context_pl: 'Kobiety dorosłe (domyślnie: faza folikularna)',
          source_ids: ['tietz_2018'] },
        { id: 'e1_default', when: {}, default: true,
          low: 110, high: 400, context_pl: 'Dorośli, zakres ogólny (kobiety, faza folikularna)',
          source_ids: ['tietz_2018'] }
      ],
      ranges_pl: [
        'Faza folikularna: 110–400 pmol/L (30–110 pg/mL)',
        'Postmenopauza: 30–130 pmol/L (7–35 pg/mL)',
        'Mężczyźni dorośli: 40–180 pmol/L (10–50 pg/mL)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'Estron (E1) — główny estrogen po menopauzie. Powstaje z androstendionu w tkance tłuszczowej drogą aromatyzacji. Klinicznie istotny gdy E2 jest niski (postmenopauza) lub w stanach z dominacją E1 nad E2.'
          },
          {
            title: 'Wskazania kliniczne',
            body: [
              { items: [
                { label: 'PCOS', text: 'E1 dominujący nad E2 (typowy profil).' },
                { label: 'Monitorowanie HRT', text: 'u kobiet postmenopauzalnych.' },
                { label: 'Hiperestrogenizm w otyłości', text: 'nadmiar tkanki tłuszczowej → ↑ aromatyzacja androgenów → ↑ E1.' },
                { label: 'Ektopowa nadprodukcja estrogenów', text: 'feminizacja u mężczyzn, ginekomastia, niektóre nowotwory.' }
              ]}
            ]
          },
          {
            title: 'Dostępność w Polsce',
            body: 'W Polsce badanie rzadkie — zlecane do laboratoriów referencyjnych (Synevo, ALAB plus, Synlab DE) — głównie metoda LC-MS/MS.'
          }
        ]
      },
      sources: ['Tietz']
    },

    {
      id: 'progesterone',
      label_pl: 'Progesteron',
      label_en: 'Progesterone',
      aliases: ['P4'],
      group: 'Estrogeny / progesteron',
      mw: 314.46,
      canonical_si: 'nmol/L',
      clinical_indications: ['infertility', 'ovulation', 'luteal_phase_defect', 'pregnancy', 'amenorrhea'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 3.180 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.03180 }
      ],
      precision: 3,
      default_range_si: { low: 16, high: 95, context_pl: 'Kobiety, środek fazy lutealnej (folikul. < 3,2; M: 0,3–1,3 nmol/L)' },
      reference_ranges_si: [
        // — Pediatria, Mayo Test 8141 (Roche immunoassay + CALIPER pediatryczne).
        //   Wartości ng/mL × 3.18 = nmol/L (MW 314.47).
        //   Chłopcy
        { id: 'p4_M_4w_12mo', when: { sex: 'M', age_min: 0.077, age_max: 1, life_stage: 'pediatric' },
          low: 0, high: 2.10, context_pl: 'Chłopcy 4 tyg. – 12 miesięcy',
          source_ids: ['mayo_test_progesterone'] },
        { id: 'p4_M_1_9', when: { sex: 'M', age_min: 1, age_max: 10, life_stage: 'pediatric' },
          low: 0, high: 1.11, context_pl: 'Chłopcy 1–9 lat',
          source_ids: ['mayo_test_progesterone'] },
        // Mayo dla M 10–17 lat nie podaje wartości (komentarz: „concentrations increase
        // through puberty"). Pacjent w tej grupie wpadnie w fallback (adult M).
        //   Dziewczynki
        { id: 'p4_F_4d_12mo', when: { sex: 'F', age_min: 0.011, age_max: 1, life_stage: 'pediatric' },
          low: 0, high: 4.13, context_pl: 'Dziewczynki 4 dni – 12 miesięcy',
          source_ids: ['mayo_test_progesterone'] },
        { id: 'p4_F_1_9', when: { sex: 'F', age_min: 1, age_max: 10, life_stage: 'pediatric' },
          low: 0, high: 1.11, context_pl: 'Dziewczynki 1–9 lat',
          source_ids: ['mayo_test_progesterone'] },
        // Dla F 10–17 lat Mayo: „adult concentrations attained by puberty" — fallback.
        // — Dorośli (z fazy 1 + Mayo) + ciąża z Mayo
        { id: 'p4_female_pregnancy_t1', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'pregnancy_t1' },
          low: 34.98, high: 139.92, context_pl: 'Kobiety, I trymestr ciąży',
          source_ids: ['mayo_test_progesterone'] },
        { id: 'p4_female_pregnancy_t2', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'pregnancy_t2' },
          low: 79.50, high: 263.94, context_pl: 'Kobiety, II trymestr ciąży',
          source_ids: ['mayo_test_progesterone'] },
        { id: 'p4_female_pregnancy_t3', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'pregnancy_t3' },
          low: 184.44, high: 680.52, context_pl: 'Kobiety, III trymestr ciąży',
          source_ids: ['mayo_test_progesterone'] },
        { id: 'p4_female_follicular', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'follicular' },
          low: 0.3, high: 3.2, context_pl: 'Kobiety, faza folikularna',
          source_ids: ['tietz_2018'] },
        // — Protokół diagnostyczny: potwierdzenie owulacji (PTMRiE 2018).
        //   Próg: P4 > 10 ng/mL (> 31,8 nmol/L) na 7. dniu po owulacji
        //   (klasycznie 21. d.c. w cyklu 28-dniowym).
        //   MUSI być przed `p4_female_luteal`, bo użytkownik, który wybrał
        //   protokół, ma najczęściej także ustawioną fazę lutealną — protokół
        //   diagnostyczny powinien wtedy wygrać nad fizjologicznym zakresem fazy.
        { id: 'p4_ovulation_check', when: { sex: 'F', life_stage: 'adult', test_protocol: 'ovulation_check' },
          low: 31.8, high: 95,
          context_pl: 'Kobiety, potwierdzenie owulacji — próg PTMRiE 2018: P4 > 10 ng/mL (> 31,8 nmol/L) na 7. dniu po owulacji (21. d.c. w cyklu 28-dniowym)',
          source_ids: ['ptmrie_ptgp_2018'] },
        { id: 'p4_female_luteal', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'luteal' },
          low: 5.82, high: 75.9,
          context_pl: 'Kobiety, faza lutealna (cały przedział — pełny zakres referencyjny PL labów: Diagnostyka Roche ECLIA / Maglumi V11.0 CLIA = 1,83–23,9 ng/mL)',
          source_ids: ['mayo_test_progesterone', 'snibe_maglumi_v11'] },
        { id: 'p4_female_postmeno', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'postmenopause' },
          low: 0.3, high: 1.3, context_pl: 'Kobiety, postmenopauza',
          source_ids: ['tietz_2018'] },
        { id: 'p4_male_adult', when: { sex: 'M', life_stage: 'adult' },
          low: 0.3, high: 1.3, context_pl: 'Mężczyźni dorośli',
          source_ids: ['tietz_2018'] },
        { id: 'p4_female_default', when: { sex: 'F', life_stage: 'adult' },
          low: 16, high: 95, context_pl: 'Kobiety dorosłe (domyślnie: faza lutealna)',
          source_ids: ['tietz_2018'] },
        { id: 'p4_default', when: {}, default: true,
          low: 16, high: 95, context_pl: 'Dorośli, zakres ogólny (kobiety, faza lutealna)',
          source_ids: ['tietz_2018'] }
      ],
      ranges_pl: [
        'Faza folikularna: < 3,2 nmol/L (< 1 ng/mL)',
        'Faza lutealna (cały przedział): 5,8–75,9 nmol/L (1,8–23,9 ng/mL) — PL labs Roche / Maglumi V11.0',
        'Potwierdzenie owulacji (7. dzień po owulacji, klasycznie 21. d.c.): P4 > 31,8 nmol/L (> 10 ng/mL) — PTMRiE 2018',
        'Postmenopauza: 0,3–1,3 nmol/L (0,1–0,4 ng/mL)',
        'Mężczyźni dorośli: 0,3–1,3 nmol/L (0,1–0,4 ng/mL)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'Progesteron (P4) — hormon produkowany przez ciałko żółte w drugiej fazie cyklu (luteinizacja po owulacji) i przez łożysko w ciąży. Główne zastosowania: potwierdzenie owulacji, monitorowanie wczesnej ciąży, diagnostyka niewydolności fazy lutealnej.'
          },
          {
            title: 'Potwierdzenie owulacji — protokół',
            body: [
              { items: [
                { label: 'Pora pobrania', text: '7. dzień po owulacji = klasycznie 21. dzień cyklu (przy regularnym cyklu 28-dniowym).' },
                { label: 'Cut-off (PTMRiE 2018)', text: 'P4 > 10 ng/mL (> 31,8 nmol/L) = owulacja potwierdzona.' },
                'Wybierz protokół „Potwierdzenie owulacji" w formularzu pomiaru, by zobaczyć ten próg automatycznie.'
              ]}
            ]
          },
          {
            title: 'Dostępność w Polsce',
            body: 'Polskie laboratoria (Diagnostyka, Synevo, ALAB, Maglumi V11.0) używają immunoassay (ECLIA Roche / CLIA Snibe) z porównywalnymi zakresami referencyjnymi. LC-MS/MS rzadko stosowane.'
          }
        ]
      },
      sources: ['Tietz', 'PTMRiE/PTGP 2018', 'Maglumi V11.0 IFU']
    },

    /* ───────────── Witamina D ───────────── */

    {
      id: 'vit_d_25oh',
      label_pl: '25-OH wit. D (25-OHD)',
      label_en: '25-Hydroxyvitamin D',
      aliases: ['kalcydiol', 'calcidiol', '25(OH)D'],
      group: 'Witamina D',
      mw: 400.64,                                              // domyślnie D3 (kalcydiol); D2 = 412,65
      canonical_si: 'nmol/L',
      clinical_indications: ['vitamin_d_status', 'osteoporosis', 'rickets_kids', 'osteomalacia', 'malabsorption', 'obesity', 'obesity_kids', 'short_stature', 'ckd'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 2.496 },
        { symbol: 'μg/L',   label: 'μg/L',         kind: 'conv', factor_to_si: 2.496 }
      ],
      precision: 3,
      default_range_si: { low: 75, high: 125, context_pl: 'Optymalne (suboptymalne 50–75; niedobór < 50; górny próg 250 nmol/L)' },
      reference_ranges_si: [
        { id: '25ohd_optimal', when: {},
          low: 75, high: 125, context_pl: 'Stężenie optymalne (niedobór < 50; suboptym. 50–75; górny próg bezp. < 250 nmol/L) — jednolite dla wszystkich grup wiekowych',
          source_ids: ['pludowski_vitd_2023'] }
      ],
      ranges_pl: [
        'Niedobór: < 50 nmol/L (< 20 ng/mL)',
        'Stężenie suboptymalne: 50–75 nmol/L (20–30 ng/mL)',
        'Optymalne: 75–125 nmol/L (30–50 ng/mL)',
        'Górny próg bezpieczny: < 250 nmol/L (< 100 ng/mL)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: '25-OH wit. D (25-hydroksywitamina D, kalcydiol) — podstawowy marker oceny zasobów ustrojowych witaminy D. Odzwierciedla łącznie syntezę skórną i podaż z dietą/suplementami. Długi okres półtrwania (~2–3 tyg.) i stabilne stężenie czynią ją parametrem z wyboru do oceny zaopatrzenia.'
          },
          {
            title: 'Klasyfikacja stężeń (polski konsensus Płudowski 2023)',
            body: 'Pełna tabela kategorii stężeń (ciężki niedobór / niedobór / niewystarczające / optymalne / wysokie / toksyczne) z opisem postępowania — zob. lista zakresów referencyjnych powyżej.'
          },
          {
            title: 'Uwagi techniczne',
            body: [
              { items: [
                { label: 'Współczynnik konwersji', text: '2,496 dotyczy 25-OH-D3. Dla 25-OH-D2 dokładny współczynnik to 2,422 — różnica < 4% i klinicznie nieistotna.' },
                { label: 'Co mierzy assay', text: 'większość immunoassayów mierzy SUMĘ 25-OH-D3 + 25-OH-D2 (Total 25-OHD). LC-MS/MS pozwala je rozdzielić — istotne tylko w wybranych przypadkach (suplementacja ergokalcyferolem D2 w niewydolności nerek).' }
              ]}
            ]
          }
        ]
      },
      sources: ['Endocrine Society Vit D 2024', 'Polski konsensus wit. D 2023']
    },

    {
      id: 'vit_d_1_25',
      label_pl: '1,25(OH)₂ wit. D (kalcytriol)',
      label_en: '1,25-Dihydroxyvitamin D',
      aliases: ['kalcytriol', 'calcitriol', '1,25(OH)2D', '1,25-D'],
      group: 'Witamina D',
      mw: 416.64,
      canonical_si: 'pmol/L',
      clinical_indications: ['rickets_kids', 'osteomalacia', 'granulomatous_disease', 'ckd', 'vitamin_d_status'],
      units: [
        { symbol: 'pmol/L', label: 'pmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 2.400 },
        { symbol: 'ng/L',   label: 'ng/L',         kind: 'conv', factor_to_si: 2.400 },
        { symbol: 'pg/dL',  label: 'pg/dL',        kind: 'conv', factor_to_si: 0.2400 }
      ],
      precision: 3,
      default_range_si: { low: 48, high: 168, context_pl: 'Dorośli (dzieci: 60–240 pmol/L)' },
      reference_ranges_si: [
        { id: 'd125_pediatric', when: { life_stage: 'pediatric' },
          low: 60, high: 240,
          context_pl: 'Dzieci — wyższy zakres niż u dorosłych (większa aktywność 1α-hydroksylazy nerkowej w okresie wzrostu)',
          source_ids: ['tietz_2018', 'mayo_test_catalog'] },
        { id: 'd125_adult', when: { life_stage: 'adult' },
          low: 48, high: 168, context_pl: 'Dorośli',
          source_ids: ['tietz_2018'] },
        { id: 'd125_default', when: {}, default: true,
          low: 48, high: 168, context_pl: 'Zakres ogólny (dorośli)',
          source_ids: ['tietz_2018'] }
      ],
      ranges_pl: [
        'Dzieci: 60–240 pmol/L (25–100 pg/mL)',
        'Dorośli: 48–168 pmol/L (20–70 pg/mL)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: '1,25(OH)₂ wit. D (kalcytriol) — aktywna hormonalna postać witaminy D. Bardzo krótki okres półtrwania (~4 h), regulowana hormonalnie (PTH, FGF23). NIE jest dobrym wskaźnikiem zasobów ustrojowych witaminy D — do oceny zaopatrzenia służy 25-OHD.'
          },
          {
            title: 'Kiedy oznaczać 1,25(OH)₂D',
            body: [
              'Oznaczać celowo, w wybranych sytuacjach klinicznych:',
              { items: [
                { label: 'Przewlekła choroba nerek (PChN)', text: 'ocena upośledzenia hydroksylacji 1α w nerkach.' },
                { label: 'Sarkoidoza i inne granulomatozy', text: '↑ pozanerkowa produkcja 1,25(OH)₂D przez makrofagi → hiperkalcemia.' },
                { label: 'Dziedziczne krzywice', text: 'krzywica zależna od witaminy D typu I (1α-hydroksylaza) lub typu II (oporność receptora VDR).' },
                { label: 'Hiperkalcemia o niejasnej etiologii', text: 'różnicowanie PTH-zależnej vs niezależnej.' }
              ]}
            ]
          }
        ]
      },
      sources: ['Tietz']
    },

    {
      id: 'vit_d3',
      label_pl: 'Wit. D₃ (cholekalcyferol)',
      label_en: 'Vitamin D3 (cholecalciferol)',
      aliases: ['cholekalcyferol', 'D3'],
      group: 'Witamina D',
      mw: 384.64,
      clinical_indications: ['vitamin_d_status'],
      canonical_si: 'nmol/L',
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 2.600 },
        { symbol: 'μg/L',   label: 'μg/L',         kind: 'conv', factor_to_si: 2.600 },
        { symbol: 'IU/L',   label: 'IU/L',         kind: 'conv', factor_to_si: 0.0650 }   // 1 μg D3 ≡ 40 IU → 1 IU = 0,025 μg/L = 0,065 nmol/L
      ],
      precision: 3,
      ranges_pl: [
        'Macierzysta wit. D₃ rzadko oznaczana w rutynie; służy do oceny niedawnej podaży/suplementacji.',
        'Przelicznik: 1 μg D₃ ≡ 40 IU'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'Wit. D₃ (cholekalcyferol) — natywna forma witaminy D powstająca w skórze pod wpływem UVB oraz pochodząca z diety. Bardzo krótki okres półtrwania (~24 h) — pomiar Wit. D₃ NIE odzwierciedla zasobów ustrojowych i nie ma wartości diagnostycznej w ocenie zaopatrzenia.'
          },
          {
            title: 'Nie mylić z 25-OH wit. D',
            body: 'Wit. D₃ ≠ 25-OH wit. D (kalcydiol). Do oceny zaopatrzenia w witaminę D zawsze oznaczaj 25-OHD (długi okres półtrwania, stabilne stężenie). Pomiar samej Wit. D₃ ma znaczenie wyłącznie naukowe / badawcze.'
          }
        ]
      },
      sources: ['Tietz', 'IOM 2011']
    },

    /* ═══════════════════════════════════════════════════════════════════════
     *  PACZKA 4a — TARCZYCA (6 substancji)
     *  TSH, fT4, fT3, T4, T3, Tg
     *  Źródła: Mayo Clinic Labs (pediatric + adult), PTE 2021 (ciąża),
     *  Jarząb 2022 (Tg po thyroidectomy u dorosłych),
     *  Handkiewicz-Junak 2024 (Tg po thyroidectomy u dzieci)
     * ═══════════════════════════════════════════════════════════════════ */

    {
      id: 'tsh',
      label_pl: 'TSH (tyreotropina)',
      label_en: 'Thyroid-Stimulating Hormone',
      aliases: ['thyrotropin', 'tyreotropina', 'TSH-sensitive'],
      group: 'Tarczyca — hormony',
      mw: null,                                    // peptyd — jednostka bioaktywności WHO IS
      biologic_units: true,                        // flaga: brak MW, jednostki nie konwertowalne masowo
      canonical_si: 'mIU/L',
      clinical_indications: ['hypothyroidism', 'hyperthyroidism', 'thyroid_cancer_followup', 'thyroid_cancer_followup_kids', 'pregnancy', 'short_stature', 'autoimmune_thyroid', 'neonatal_screening', 'obesity', 'obesity_kids', 'hyponatremia', 'diabetes_insipidus'],
      units: [
        { symbol: 'mIU/L',  label: 'mIU/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'μIU/mL', label: 'μIU/mL',     kind: 'conv', factor_to_si: 1 },
        { symbol: 'mU/L',   label: 'mU/L',       kind: 'conv', factor_to_si: 1 }
      ],
      precision: 3,
      reference_ranges_si: [
        // ── Najpierw protokoły specjalistyczne (DBS przesiew) — bardziej
        //    specyficzne niż reguły age-based, muszą być sprawdzane jako
        //    pierwsze, bo inaczej age-based wygrywa wildcard match.
        // ── Badanie przesiewowe z bibuły (DBS, Dried Blood Spot) ─────────
        //   Algorytm rządowego programu badań przesiewowych noworodków
        //   2019–2026 (ryc. 8). UWAGA: progi DBS są niższe niż w surowicy
        //   (pełna krew rozcieńczona ~60–70 % wartości serum).
        //   Pierwsza bibuła pobierana w 3.–5. dobie życia.
        { id: 'tsh_dbs_first',  when: { test_protocol: 'neonatal_dbs_first' },
          low: 0, high: 10,
          context_pl: 'Pierwsza bibuła (DBS, Dried Blood Spot): < 10 mIU/L = norma; 10–24 → druga bibuła; ≥ 24 → bezpośrednie wezwanie do diagnostyki (rządowy program 2019–2026).',
          source_ids: ['pl_screening_program_2019_2026'] },
        { id: 'tsh_dbs_second', when: { test_protocol: 'neonatal_dbs_second' },
          low: 0, high: 10,
          context_pl: 'Druga bibuła (DBS): < 10 mIU/L = norma; ≥ 10 → wezwanie do diagnostyki potwierdzającej (TSH+fT4 w surowicy w 3.–5. dobie).',
          source_ids: ['pl_screening_program_2019_2026'] },
        // Pediatria — Mayo Clinic Labs + polskie wytyczne PTEDD (Kucharska 2016)
        //   0–2 dni (do ~48–72h po porodzie): fizjologiczny TSH surge po porodzie
        //   (peak ~80 mIU/L po 30 min, spadek do <20 po 24h). Mayo 0.7–15.2.
        //   3–5 dni: polskie wytyczne przesiewowe PTEDD są ostrzejsze:
        //     < 12 mIU/L (przy prawidłowym fT4) = norma fizjologiczna
        //     12–28 = WNT (umiarkowana) → leczenie L-tyroksyną 10–15 μg/kg/d
        //     > 28 = WNT (jawna)
        //   Polski program przesiewowy pobiera bibułę w 36–72h życia,
        //   potwierdzenie w surowicy w 3.–5. dobie.
        // 0–2 doba: fizjologiczny szczyt TSH po porodzie (~80 mIU/L po 30 min,
        // spadek do < 20 mIU/L po 24h). Pomiar w tym okresie ma ograniczoną
        // wartość diagnostyczną — wynik nie jest klinicznie interpretowalny
        // bez kontekstu (po jakim czasie od porodu). Flaga no_interpretation
        // chowa pasek normy i wyłącza kolorowanie.
        { id: 'tsh_neonate_0_2d',    when: { age_min: 0,         age_max: 0.00821, life_stage: 'pediatric' },
          no_interpretation: true,
          low: null, high: null,
          context_pl: 'Noworodki 0–2 doba: fizjologiczny szczyt TSH po porodzie (~80 mIU/L po 30 min, spadek do < 20 mIU/L po 24 h). Pomiar w tym okresie ma ograniczoną wartość diagnostyczną — brak ustalonego progu klinicznego. Standard interpretacji: surowica w 3.–5. dobie (zob. sekcja „Progi PTEDD do potwierdzenia WNT").',
          source_ids: ['kucharska_pte_chypo_2016'] },
        { id: 'tsh_neonate_3_5d',    when: { age_min: 0.00821,   age_max: 0.0137,  life_stage: 'pediatric' },
          low: 0.7, high: 12,
          context_pl: 'Noworodki 3–5 dni (polski przesiew PTEDD: TSH < 12 = norma; 12–28 z ↓ fT4 = WNT do leczenia; > 28 = WNT jawna; < 0,7 z ↓ fT4 = wtórna niedoczynność przysadkowa)',
          source_ids: ['kucharska_pte_chypo_2016', 'pl_screening_program_2019_2026'] },
        { id: 'tsh_6d_2mo',          when: { age_min: 0.0137,  age_max: 0.1667, life_stage: 'pediatric' },
          low: 0.7, high: 11.0, context_pl: 'Niemowlęta 6 dni – 2 miesiące',
          source_ids: ['mayo_test_tsh'] },
        { id: 'tsh_3_11mo',          when: { age_min: 0.1667,  age_max: 1,      life_stage: 'pediatric' },
          low: 0.7, high: 8.4,  context_pl: 'Niemowlęta 3–11 miesięcy',
          source_ids: ['mayo_test_tsh'] },
        { id: 'tsh_1_5y',            when: { age_min: 1,       age_max: 6,      life_stage: 'pediatric' },
          low: 0.7, high: 6.0,  context_pl: 'Dzieci 1–5 lat',
          source_ids: ['mayo_test_tsh', 'kapelari_thyroid_pediatric_2008'] },
        { id: 'tsh_6_10y',           when: { age_min: 6,       age_max: 11,     life_stage: 'pediatric' },
          low: 0.6, high: 4.8,  context_pl: 'Dzieci 6–10 lat',
          source_ids: ['mayo_test_tsh'] },
        { id: 'tsh_11_19y',          when: { age_min: 11,      age_max: 20,     life_stage: 'pediatric' },
          low: 0.5, high: 4.3,  context_pl: 'Młodzież 11–19 lat',
          source_ids: ['mayo_test_tsh'] },
        // Ciąża — PTE 2021 (Hubalewska-Dydejczyk i wsp., tab. 2)
        // Polska populacja na elektrochemiluminescencji (ECL). Górny próg
        // każdego trymestru = próg DIAGNOSTYCZNY: powyżej = subkliniczna
        // niedoczynność wymagająca leczenia. CEL TERAPEUTYCZNY u pacjentki
        // LECZONEJ lewotyroksyną w I trymestrze: < 2,5 mIU/L
        // (to NIE jest próg diagnostyczny — patrz cytat z wytycznych w notes_pl).
        { id: 'tsh_pregnancy_t1', when: { sex: 'F', cycle_phase: 'pregnancy_t1' },
          low: 0.01, high: 3.18, context_pl: 'Ciąża, I trymestr (do 13 tyg.) — polski populacyjny zakres referencyjny PTE 2021 (ECL): 0,01–3,18 mIU/L. > 3,18 = subkliniczna niedoczynność wymagająca leczenia. CEL TERAPEUTYCZNY u pacjentki LECZONEJ lewotyroksyną w I trymestrze: < 2,5 mIU/L (NIE jest to próg diagnostyczny).',
          source_ids: ['pte_hubalewska_2021_pregnancy'] },
        { id: 'tsh_pregnancy_t2', when: { sex: 'F', cycle_phase: 'pregnancy_t2' },
          low: 0.05, high: 3.44, context_pl: 'Ciąża, II trymestr — polski populacyjny zakres PTE 2021 (ECL): 0,05–3,44 mIU/L. > 3,44 = subkliniczna niedoczynność wymagająca leczenia.',
          source_ids: ['pte_hubalewska_2021_pregnancy'] },
        { id: 'tsh_pregnancy_t3', when: { sex: 'F', cycle_phase: 'pregnancy_t3' },
          low: 0.11, high: 3.53, context_pl: 'Ciąża, III trymestr — polski populacyjny zakres PTE 2021 (ECL): 0,11–3,53 mIU/L. > 3,53 = subkliniczna niedoczynność wymagająca leczenia.',
          source_ids: ['pte_hubalewska_2021_pregnancy'] },
        // Dorośli (Mayo, sex-neutral)
        { id: 'tsh_adult',        when: { life_stage: 'adult' },
          low: 0.3, high: 4.2, context_pl: 'Dorośli (≥ 20 lat)',
          source_ids: ['mayo_test_tsh'] },
        // Fallback default (gdy brak danych)
        { id: 'tsh_default',      when: {}, default: true,
          low: 0.3, high: 4.2, context_pl: 'Zakres ogólny dorosły (domyślnie)',
          source_ids: ['mayo_test_tsh'] }
      ],
      ranges_pl: [
        'Noworodki 3–5 dni: 0,7–12 mIU/L',
        'Niemowlęta 6 dni – 2 mies.: 0,7–11,0 mIU/L',
        'Niemowlęta 3–11 mies.: 0,7–8,4 mIU/L',
        'Dzieci 1–5 lat: 0,7–6,0 mIU/L',
        'Dzieci 6–10 lat: 0,6–4,8 mIU/L',
        'Młodzież 11–19 lat: 0,5–4,3 mIU/L',
        'Dorośli: 0,3–4,2 mIU/L',
        'Ciąża, I trymestr: 0,01–3,18 mIU/L (PTE 2021)',
        'Ciąża, II trymestr: 0,05–3,44 mIU/L (PTE 2021)',
        'Ciąża, III trymestr: 0,11–3,53 mIU/L (PTE 2021)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'TSH (tyreotropina) — test pierwszego rzutu w diagnostyce chorób tarczycy. U noworodków po porodzie TSH wzrasta gwałtownie (szczyt ~80 mIU/L po 30 min) i spada w ciągu 24–72 h.'
          },
          {
            title: 'Polski przesiew noworodkowy — algorytm DBS',
            body: [
              'Rządowy Program Badań Przesiewowych Noworodków 2019–2026: pobranie bibuły (DBS — dried blood spot) z pięty noworodka w 36.–72. godzinie życia. Progi DBS są niższe niż w surowicy (krwinki w pełnej krwi „rozcieńczają" osocze przy ekstrakcji).',
              { label: 'Bibuła I (36.–72. h życia)' },
              { items: [
                { label: 'TSH < 10 mIU/L', text: 'norma — koniec procedury.' },
                { label: 'TSH 10–23,9 mIU/L', text: 'wynik graniczny → druga bibuła (powtórka po 7–14 dniach).' },
                { label: 'TSH ≥ 24 mIU/L', text: 'wezwanie — pilne potwierdzenie z surowicy (TSH + fT4).' }
              ]},
              { label: 'Bibuła II (powtórka, gdy I = 10–23,9)' },
              { items: [
                { label: 'TSH < 10 mIU/L', text: 'norma — przejściowa hipertyreotropinemia.' },
                { label: 'TSH ≥ 10 mIU/L', text: 'wezwanie — potwierdzenie z surowicy.' }
              ]},
              'Po wezwaniu: krew żylna na TSH + fT4 (interpretacja wg progów PTEDD w surowicy — zob. sekcja niżej). Pełny dokument programu i szczegóły postępowania: zob. panel „Przesiew noworodkowy (tarczyca)".'
            ]
          },
          {
            title: 'Progi PTEDD do potwierdzenia WNT po przesiewie (surowica)',
            body: [
              'Po wezwaniu z przesiewu noworodkowego wykonuje się oznaczenie TSH + fT4 z krwi żylnej (surowica). Progi PTEDD różnią się od progów DBS — krew żylna ma wyższe stężenie TSH niż pełna krew z bibuły. Normy poniżej (Kucharska 2016, Endokrynol Pol):',
              { label: '0.–2. doba życia', text: 'fizjologiczny szczyt TSH do ~30 (czasem 50) mIU/L; pomiar w tym okresie ma ograniczoną wartość diagnostyczną.' },
              { label: '3.–5. doba — standard interpretacji' },
              { items: [
                { label: 'TSH < 12 mIU/L', text: 'norma (przy prawidłowym fT4).' },
                { label: 'TSH 12–28 + prawidłowe fT4', text: 'subkliniczna WNT — decyzja indywidualna w ośrodku referencyjnym (zwykle leczenie przy TSH > 20).' },
                { label: 'TSH 12–28 + ↓fT4', text: 'jawna WNT umiarkowana → L-tyroksyna 10–15 μg/kg/dobę.' },
                { label: 'TSH > 28', text: 'jawna WNT → L-tyroksyna 10–15 μg/kg/dobę bezzwłocznie.' },
                { label: 'TSH < 0,7 + ↓fT4', text: 'wtórna (centralna) niedoczynność przysadkowa → L-tyroksyna 7–10 μg/kg/dobę.' }
              ]},
              { label: '1.–4. tydzień życia', text: 'stopniowy spadek do < 10 mIU/L.' },
              'U wcześniaków i dzieci SGA: te same progi stosuje się w 3.–5. dobie niezależnie od wyniku przesiewu DBS.',
              'Krytyczne okno terapeutyczne: rozpoczęcie L-tyroksyny w pierwszych 2 tygodniach życia daje prawidłowy rozwój neurologiczny.'
            ]
          },
          {
            title: 'Ciąża — polskie zakresy referencyjne',
            body: [
              'PTE 2021 (Hubalewska-Dydejczyk i wsp.) — populacyjne zakresy referencyjne TSH (metoda elektrochemiluminescencji, tab. 2):',
              { items: [
                { label: 'I trymestr', text: '0,01–3,18 mIU/L; > 3,18 = subkliniczna niedoczynność wymagająca leczenia.' },
                { label: 'II trymestr', text: '0,05–3,44 mIU/L; > 3,44 = subkliniczna niedoczynność.' },
                { label: 'III trymestr', text: '0,11–3,53 mIU/L; > 3,53 = subkliniczna niedoczynność.' }
              ]},
              'PTE 2021 wprost odstąpiło od progu ATA 2017 = 4,0 mIU/L (zbyt liberalny) na rzecz polskich progów populacyjnych.',
              { label: 'Cel terapeutyczny', text: 'u pacjentki leczonej lewotyroksyną w I trymestrze < 2,5 mIU/L (to NIE jest próg diagnostyczny).' },
              { label: 'U kobiet z aTPO(+)', text: 'przy TSH 2,5–3,18 mIU/L rozważyć leczenie (Hubalewska 2021).' }
            ]
          },
          {
            title: 'TSH po thyroidectomy z powodu DTC',
            body: [
              'Cel supresji TSH zależy od dynamicznej stratyfikacji odpowiedzi na leczenie:',
              { items: [
                { label: 'Excellent response', text: 'cel TSH < 2,0 mIU/L.' },
                { label: 'High-risk / persistent disease', text: 'supresja TSH < 0,1 mIU/L.' }
              ]},
              'Szczegóły schematu w panelu „Rak tarczycy — follow-up u dorosłych" (Jarząb 2022) i „Rak tarczycy — follow-up u dzieci" (Handkiewicz-Junak 2024).'
            ]
          }
        ]
      },
      sources: ['Mayo Clinic Labs', 'Kucharska 2016 (PTEDD)', 'PL Program przesiewowy 2019–2026', 'PTE 2021', 'Jarząb 2022', 'Handkiewicz-Junak 2024']
    },

    {
      id: 'ft4',
      label_pl: 'fT4 (wolna tyroksyna)',
      label_en: 'Free Thyroxine (FT4)',
      aliases: ['free T4', 'free thyroxine', 'wolna tyroksyna'],
      group: 'Tarczyca — hormony',
      mw: 776.87,
      canonical_si: 'pmol/L',
      clinical_indications: ['hypothyroidism', 'hyperthyroidism', 'thyroid_cancer_followup', 'thyroid_cancer_followup_kids', 'pregnancy', 'short_stature', 'autoimmune_thyroid', 'neonatal_screening', 'obesity_kids', 'hyponatremia', 'diabetes_insipidus'],
      units: [
        { symbol: 'pmol/L', label: 'pmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 12.87 },
        { symbol: 'ng/L',   label: 'ng/L',         kind: 'conv', factor_to_si: 1.287 }
      ],
      precision: 3,
      reference_ranges_si: [
        // Pediatria — Mayo (konwersja ng/dL × 12.87 = pmol/L)
        { id: 'ft4_neonate_0_5d', when: { age_min: 0,       age_max: 0.0137, life_stage: 'pediatric' },
          low: 11.6, high: 32.2, context_pl: 'Noworodki 0–5 dni',
          source_ids: ['mayo_test_ft4'] },
        { id: 'ft4_6d_2mo',       when: { age_min: 0.0137,  age_max: 0.1667, life_stage: 'pediatric' },
          low: 11.6, high: 28.3, context_pl: 'Niemowlęta 6 dni – 2 mies.',
          source_ids: ['mayo_test_ft4'] },
        { id: 'ft4_3_11mo',       when: { age_min: 0.1667,  age_max: 1,      life_stage: 'pediatric' },
          low: 11.6, high: 25.7, context_pl: 'Niemowlęta 3–11 mies.',
          source_ids: ['mayo_test_ft4'] },
        { id: 'ft4_1_5y',         when: { age_min: 1,       age_max: 6,      life_stage: 'pediatric' },
          low: 12.9, high: 23.2, context_pl: 'Dzieci 1–5 lat',
          source_ids: ['mayo_test_ft4'] },
        { id: 'ft4_6_10y',        when: { age_min: 6,       age_max: 11,     life_stage: 'pediatric' },
          low: 12.9, high: 21.9, context_pl: 'Dzieci 6–10 lat',
          source_ids: ['mayo_test_ft4'] },
        { id: 'ft4_11_19y',       when: { age_min: 11,      age_max: 20,     life_stage: 'pediatric' },
          low: 12.9, high: 20.6, context_pl: 'Młodzież 11–19 lat',
          source_ids: ['mayo_test_ft4'] },
        // Ciąża (PTE 2021)
        { id: 'ft4_pregnancy_t1', when: { sex: 'F', cycle_phase: 'pregnancy_t1' },
          low: 11.99, high: 21.89, context_pl: 'Ciąża, I trymestr (PTE 2021, polska populacja)',
          source_ids: ['pte_hubalewska_2021_pregnancy'] },
        { id: 'ft4_pregnancy_t2', when: { sex: 'F', cycle_phase: 'pregnancy_t2' },
          low: 10.46, high: 16.67, context_pl: 'Ciąża, II trymestr',
          source_ids: ['pte_hubalewska_2021_pregnancy'] },
        { id: 'ft4_pregnancy_t3', when: { sex: 'F', cycle_phase: 'pregnancy_t3' },
          low: 8.96,  high: 17.23, context_pl: 'Ciąża, III trymestr',
          source_ids: ['pte_hubalewska_2021_pregnancy'] },
        // Dorośli (Mayo)
        { id: 'ft4_adult', when: { life_stage: 'adult' },
          low: 11.6, high: 21.9, context_pl: 'Dorośli (≥ 20 lat)',
          source_ids: ['mayo_test_ft4'] },
        { id: 'ft4_default', when: {}, default: true,
          low: 11.6, high: 21.9, context_pl: 'Zakres ogólny dorosły',
          source_ids: ['mayo_test_ft4'] }
      ],
      ranges_pl: [
        'Noworodki 0–5 dni: 11,6–32,2 pmol/L (0,9–2,5 ng/dL)',
        'Niemowlęta 3–11 mies.: 11,6–25,7 pmol/L',
        'Dzieci 1–5 lat: 12,9–23,2',
        'Dorośli: 11,6–21,9 pmol/L (0,9–1,7 ng/dL)',
        'Ciąża T1: 11,99–21,89 pmol/L (PTE 2021)',
        'Ciąża T2: 10,46–16,67',
        'Ciąża T3: 8,96–17,23'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'fT4 (wolna tyroksyna) — biologicznie aktywna frakcja T4 niezwiązana z białkami transportującymi. Standard w diagnostyce zaburzeń tarczycy obok TSH (panel pierwszego rzutu).'
          },
          {
            title: 'Interpretacja w zaburzeniach tarczycy',
            body: [
              { items: [
                { label: 'TSH ↑ + fT4 ↓', text: 'jawna niedoczynność tarczycy.' },
                { label: 'TSH ↑ + fT4 prawidłowe', text: 'subkliniczna niedoczynność tarczycy.' },
                { label: 'TSH ↓ + fT4 ↑', text: 'jawna nadczynność tarczycy.' },
                { label: 'TSH ↓ + fT4 prawidłowe', text: 'subkliniczna nadczynność tarczycy (sprawdź fT3 — T3-toksykoza).' },
                { label: 'TSH nieadekwatnie prawidłowe/niskie + fT4 ↓', text: 'wtórna (centralna) niedoczynność tarczycy.' }
              ]}
            ]
          },
          {
            title: 'Ciąża — polskie zakresy referencyjne',
            body: 'Zakresy fT4 w ciąży OBNIŻAJĄ się fizjologicznie (zwłaszcza w II i III trymestrze) ze względu na wzrost TBG estrogenozależny i zwiększoną dejodynację obwodową. PTE 2021 (Hubalewska-Dydejczyk) podaje polskie populacyjne zakresy — zob. lista wyżej.'
          },
          {
            title: 'Pułapki metody oznaczania',
            body: 'Metoda LC-MS/MS (np. Lo 2016) daje wyższe wartości fT4 niż immunoassay (Mayo, AdviaCentaur, Atellica) — różnica może wynieść nawet 20–30%. Przy interpretacji wyniku zwracaj uwagę na metodę użytą przez laboratorium. Czynniki fizjologiczne wpływające na fT4: ciąża (↓), heparyna (fałszywie ↑ w niektórych immunoassayach), ciężkie choroby ogólne (NTIS — non-thyroidal illness syndrome, ↓ fT3/fT4).'
          }
        ]
      },
      sources: ['Mayo Clinic Labs', 'PTE 2021 (Hubalewska)', 'Lo SF, et al. LC-MS/MS for free T4. 2016.']
    },

    {
      id: 'ft3',
      label_pl: 'fT3 (wolna trójjodotyronina)',
      label_en: 'Free Triiodothyronine (FT3)',
      aliases: ['free T3', 'free triiodothyronine', 'wolna trójjodotyronina'],
      group: 'Tarczyca — hormony',
      mw: 650.97,
      canonical_si: 'pmol/L',
      clinical_indications: ['hyperthyroidism', 'thyroid_cancer_followup', 'thyroid_cancer_followup_kids', 'hypothyroidism', 'pregnancy'],
      units: [
        { symbol: 'pmol/L', label: 'pmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'pg/mL',  label: 'pg/mL',        kind: 'conv', factor_to_si: 1.536 },
        { symbol: 'ng/L',   label: 'ng/L',         kind: 'conv', factor_to_si: 1.536 },
        { symbol: 'pg/dL',  label: 'pg/dL',        kind: 'conv', factor_to_si: 0.01536 }
      ],
      precision: 3,
      reference_ranges_si: [
        // Pediatria — Mayo (konwersja pg/mL × 1.536 = pmol/L)
        { id: 'ft3_0_1mo',  when: { age_min: 0,      age_max: 0.0833, life_stage: 'pediatric' },
          low: 4.15, high: 13.06, context_pl: 'Noworodki 0–1 m.ż.',
          source_ids: ['mayo_test_ft3'] },
        { id: 'ft3_1_12mo', when: { age_min: 0.0833, age_max: 1,      life_stage: 'pediatric' },
          low: 5.22, high: 8.60,  context_pl: 'Niemowlęta 1–12 mies.',
          source_ids: ['mayo_test_ft3'] },
        { id: 'ft3_1_14y',  when: { age_min: 1,      age_max: 14,     life_stage: 'pediatric' },
          low: 4.61, high: 7.83,  context_pl: 'Dzieci 1–14 lat',
          source_ids: ['mayo_test_ft3'] },
        { id: 'ft3_14_19y', when: { age_min: 14,     age_max: 20,     life_stage: 'pediatric' },
          low: 3.07, high: 6.76,  context_pl: 'Młodzież 14–19 lat',
          source_ids: ['mayo_test_ft3'] },
        // Ciąża (PTE 2021)
        { id: 'ft3_pregnancy_t1', when: { sex: 'F', cycle_phase: 'pregnancy_t1' },
          low: 3.63, high: 6.55, context_pl: 'Ciąża, I trymestr (PTE 2021)',
          source_ids: ['pte_hubalewska_2021_pregnancy'] },
        { id: 'ft3_pregnancy_t2', when: { sex: 'F', cycle_phase: 'pregnancy_t2' },
          low: 3.29, high: 5.45, context_pl: 'Ciąża, II trymestr',
          source_ids: ['pte_hubalewska_2021_pregnancy'] },
        { id: 'ft3_pregnancy_t3', when: { sex: 'F', cycle_phase: 'pregnancy_t3' },
          low: 3.10, high: 5.37, context_pl: 'Ciąża, III trymestr',
          source_ids: ['pte_hubalewska_2021_pregnancy'] },
        // Dorośli (Mayo)
        { id: 'ft3_adult', when: { life_stage: 'adult' },
          low: 3.07, high: 6.76, context_pl: 'Dorośli (≥ 19 lat)',
          source_ids: ['mayo_test_ft3'] },
        { id: 'ft3_default', when: {}, default: true,
          low: 3.07, high: 6.76, context_pl: 'Zakres ogólny dorosły',
          source_ids: ['mayo_test_ft3'] }
      ],
      ranges_pl: [
        'Noworodki 0–1 m.ż.: 4,15–13,06 pmol/L (2,7–8,5 pg/mL)',
        'Dzieci 1–14 lat: 4,61–7,83',
        'Młodzież 14–19 lat: 3,07–6,76',
        'Dorośli: 3,07–6,76 pmol/L (2,0–4,4 pg/mL)',
        'Ciąża T1: 3,63–6,55 pmol/L',
        'Ciąża T2: 3,29–5,45',
        'Ciąża T3: 3,10–5,37'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'fT3 (wolna trójjodotyronina) — biologicznie aktywna frakcja T3. Najczulszy hormon w diagnostyce nadczynności tarczycy, szczególnie w T3-toksykozie.'
          },
          {
            title: 'Kiedy oznaczyć fT3',
            body: [
              { label: 'T3-toksykoza', text: 'TSH ↓ + fT4 prawidłowe → oznacz fT3 (podwyższone potwierdza nadczynność).' },
              { label: 'Wczesna faza choroby Gravesa-Basedowa', text: 'fT3 może być podwyższone wcześniej niż fT4.' },
              { label: 'Monitorowanie leczenia tyreostatykami', text: 'fT3 wraca do normy później niż fT4 — kontrola po wyrównaniu.' },
              { label: 'NIE rutynowo w niedoczynności', text: 'fT3 ma niską wartość diagnostyczną w hipotyreozie (TSH + fT4 wystarczają).' }
            ]
          }
        ]
      },
      sources: ['Mayo Clinic Labs', 'PTE 2021']
    },

    {
      id: 't4_total',
      label_pl: 'T4 (tyroksyna, całkowita)',
      label_en: 'Total Thyroxine (T4)',
      aliases: ['T4 total', 'tyroksyna', 'total T4'],
      group: 'Tarczyca — hormony',
      mw: 776.87,
      canonical_si: 'nmol/L',
      clinical_indications: ['hypothyroidism', 'hyperthyroidism', 'neonatal_screening'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'μg/dL',  label: 'μg/dL',        kind: 'conv', factor_to_si: 12.87 },
        { symbol: 'μg/L',   label: 'μg/L',         kind: 'conv', factor_to_si: 1.287 }
      ],
      precision: 3,
      reference_ranges_si: [
        // Pediatria — Mayo (konwersja μg/dL × 12.87 = nmol/L)
        { id: 't4_neonate_0_5d', when: { age_min: 0,       age_max: 0.0137, life_stage: 'pediatric' },
          low: 64.4, high: 238.1, context_pl: 'Noworodki 0–5 dni',
          source_ids: ['mayo_test_t4_total'] },
        { id: 't4_6d_2mo',       when: { age_min: 0.0137,  age_max: 0.1667, life_stage: 'pediatric' },
          low: 69.5, high: 218.8, context_pl: 'Niemowlęta 6 dni – 2 mies.',
          source_ids: ['mayo_test_t4_total'] },
        { id: 't4_3_11mo',       when: { age_min: 0.1667,  age_max: 1,      life_stage: 'pediatric' },
          low: 73.4, high: 205.9, context_pl: 'Niemowlęta 3–11 mies.',
          source_ids: ['mayo_test_t4_total'] },
        { id: 't4_1_5y',         when: { age_min: 1,       age_max: 6,      life_stage: 'pediatric' },
          low: 77.2, high: 189.2, context_pl: 'Dzieci 1–5 lat',
          source_ids: ['mayo_test_t4_total'] },
        { id: 't4_6_10y',        when: { age_min: 6,       age_max: 11,     life_stage: 'pediatric' },
          low: 77.2, high: 177.6, context_pl: 'Dzieci 6–10 lat',
          source_ids: ['mayo_test_t4_total'] },
        { id: 't4_11_19y',       when: { age_min: 11,      age_max: 20,     life_stage: 'pediatric' },
          low: 75.9, high: 169.9, context_pl: 'Młodzież 11–19 lat',
          source_ids: ['mayo_test_t4_total'] },
        { id: 't4_adult', when: { life_stage: 'adult' },
          low: 57.9, high: 150.6, context_pl: 'Dorośli (≥ 20 lat)',
          source_ids: ['mayo_test_t4_total'] },
        { id: 't4_default', when: {}, default: true,
          low: 57.9, high: 150.6, context_pl: 'Zakres ogólny dorosły',
          source_ids: ['mayo_test_t4_total'] }
      ],
      ranges_pl: [
        'Noworodki 0–5 dni: 64,4–238,1 nmol/L (5,0–18,5 μg/dL)',
        'Dzieci 1–5 lat: 77,2–189,2',
        'Dorośli: 57,9–150,6 nmol/L (4,5–11,7 μg/dL)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'T4 całkowita = suma wolnej (fT4) i związanej z białkami transportującymi (głównie TBG — thyroxine-binding globulin). W rutynowej diagnostyce zaburzeń tarczycy preferowany pomiar fT4 (niezależny od stężenia białek). T4 całkowita zachowuje wartość w niektórych przesiewach noworodkowych i przy nieoznaczalnym fT4 (np. zakłócenia w immunoassayu).'
          },
          {
            title: 'Pułapki — zmiany stężenia TBG',
            body: [
              'Stężenie T4 całkowitego zależy bezpośrednio od stężenia TBG, które może być znacznie zmienione w wielu stanach:',
              { items: [
                { label: 'Wzrost TBG (fałszywe ↑ T4)', text: 'ciąża (~1,5× przez ↑ estrogenowy), doustna antykoncepcja, HTZ, ostre zapalenie wątroby, leki estrogenowe.' },
                { label: 'Spadek TBG (fałszywe ↓ T4)', text: 'wrodzony niedobór TBG (rzadki defekt X-recesywny), zespół nerczycowy (utrata z moczem), ciężkie choroby ogólne, leki androgenowe i GKS, akromegalia.' }
              ]},
              'W tych stanach fT4 pozostaje prawidłowe — dlatego fT4 jest preferowane w diagnostyce.'
            ]
          }
        ]
      },
      sources: ['Mayo Clinic Labs']
    },

    {
      id: 't3_total',
      label_pl: 'T3 (trójjodotyronina, całkowita)',
      label_en: 'Total Triiodothyronine (T3)',
      aliases: ['T3 total', 'trójjodotyronina', 'total T3'],
      group: 'Tarczyca — hormony',
      mw: 650.97,
      canonical_si: 'nmol/L',
      clinical_indications: ['hyperthyroidism', 'hypothyroidism'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/dL',  label: 'ng/dL',        kind: 'conv', factor_to_si: 0.01536 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 1.536 }
      ],
      precision: 3,
      reference_ranges_si: [
        // Pediatria — Mayo (konwersja ng/dL × 0.01536 = nmol/L)
        { id: 't3_neonate_0_5d', when: { age_min: 0,       age_max: 0.0137, life_stage: 'pediatric' },
          low: 1.12, high: 4.42, context_pl: 'Noworodki 0–5 dni',
          source_ids: ['mayo_test_t3_total'] },
        { id: 't3_6d_2mo',       when: { age_min: 0.0137,  age_max: 0.1667, life_stage: 'pediatric' },
          low: 1.23, high: 4.22, context_pl: 'Niemowlęta 6 dni – 2 mies.',
          source_ids: ['mayo_test_t3_total'] },
        { id: 't3_3_11mo',       when: { age_min: 0.1667,  age_max: 1,      life_stage: 'pediatric' },
          low: 1.32, high: 4.07, context_pl: 'Niemowlęta 3–11 mies.',
          source_ids: ['mayo_test_t3_total'] },
        { id: 't3_1_5y',         when: { age_min: 1,       age_max: 6,      life_stage: 'pediatric' },
          low: 1.41, high: 3.81, context_pl: 'Dzieci 1–5 lat',
          source_ids: ['mayo_test_t3_total'] },
        { id: 't3_6_10y',        when: { age_min: 6,       age_max: 11,     life_stage: 'pediatric' },
          low: 1.43, high: 3.55, context_pl: 'Dzieci 6–10 lat',
          source_ids: ['mayo_test_t3_total'] },
        { id: 't3_11_19y',       when: { age_min: 11,      age_max: 20,     life_stage: 'pediatric' },
          low: 1.40, high: 3.35, context_pl: 'Młodzież 11–19 lat',
          source_ids: ['mayo_test_t3_total'] },
        { id: 't3_adult', when: { life_stage: 'adult' },
          low: 1.23, high: 3.07, context_pl: 'Dorośli (≥ 20 lat)',
          source_ids: ['mayo_test_t3_total'] },
        { id: 't3_default', when: {}, default: true,
          low: 1.23, high: 3.07, context_pl: 'Zakres ogólny dorosły',
          source_ids: ['mayo_test_t3_total'] }
      ],
      ranges_pl: [
        'Noworodki 0–5 dni: 1,12–4,42 nmol/L',
        'Dzieci 1–5 lat: 1,41–3,81',
        'Dorośli: 1,23–3,07 nmol/L (80–200 ng/dL)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'T3 całkowita = suma wolnej (fT3) i związanej z białkami transportującymi (głównie TBG). W rutynowej diagnostyce nadczynności tarczycy preferowany pomiar fT3 (niezależny od stężenia białek). T3 całkowita ma obecnie ograniczone zastosowanie kliniczne.'
          },
          {
            title: 'Pułapki — zależność od TBG',
            body: 'Zmiany stężenia TBG (ciąża, doustna antykoncepcja, HTZ — wzrost; wrodzony niedobór TBG, zespół nerczycowy, GKS — spadek) wpływają na T3 całkowitą podobnie jak na T4 całkowitą. Dlatego fT3 jest preferowane w diagnostyce.'
          }
        ]
      },
      sources: ['Mayo Clinic Labs']
    },

    {
      id: 'thyroglobulin',
      label_pl: 'Tg (tyreoglobulina)',
      label_en: 'Thyroglobulin',
      aliases: ['Tg', 'thyroglobulin', 'tyreoglobulina'],
      group: 'Tarczyca — autoprzeciwciała i Tg',
      mw: null,
      biologic_units: true,
      canonical_si: 'ng/mL',
      clinical_indications: ['thyroid_cancer_followup', 'thyroid_cancer_followup_kids'],
      units: [
        { symbol: 'ng/mL', label: 'ng/mL (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'μg/L',  label: 'μg/L',       kind: 'conv', factor_to_si: 1 }
      ],
      precision: 3,
      reference_ranges_si: [
        // ─── Jawne dopasowania przez test_protocol (Faza 20) ───
        // Te wpisy mają PRIORYTET — gdy użytkownik wybierze z dropdownu konkretną
        // opcję, dopasowanie idzie bezpośrednio po test_protocol, niezależnie od
        // danych pacjenta. To pozwala lekarzowi szybko sprawdzić wynik wg dowolnej
        // kategorii bez ustawiania wieku pacjenta.
        { id: 'tg_intact_infant_explicit',
          when: { test_protocol: 'tg_intact_infant' },
          low: 0, high: 78,
          context_pl: 'Niemowlęta i dzieci 0–2 lat z zachowaną tarczycą — zakres rozszerzony (do ~78 ng/mL); fizjologiczna podwyższona Tg wskutek przebudowy tarczycy po urodzeniu (Spencer 2007; van Trotsenburg 2021).',
          source_ids: ['mayo_test_tg'] },
        { id: 'tg_intact_child_explicit',
          when: { test_protocol: 'tg_intact_child' },
          low: 0, high: 40,
          context_pl: 'Dzieci 2–19 lat z zachowaną tarczycą — zakres zbliżony do dorosłych z możliwą fizjologiczną elewacją w okresach intensywnego wzrostu/pokwitania.',
          source_ids: ['mayo_test_tg'] },
        { id: 'tg_intact_adult_explicit',
          when: { test_protocol: 'tg_intact_adult' },
          low: 0, high: 33,
          context_pl: 'Zachowana tarczyca (cała lub po lobektomii) — zdrowi dorośli (Mayo adult range).',
          source_ids: ['mayo_test_tg', 'jarzab_dtc_adults_2022'] },
        { id: 'tg_post_tt_basal_adult_explicit',
          when: { test_protocol: 'tg_post_tt_basal_adult' },
          low: 0, high: 0.2,
          context_pl: 'Dorośli, po total thyroidectomy (na L-tyroksynie, bazalny): excellent response < 0,2 ng/mL. Wartości 0,2–5 (po RAI) lub > 1 (bez RAI) = biochemical incomplete; > 5 = persistent disease.',
          source_ids: ['jarzab_dtc_adults_2022'] },
        { id: 'tg_post_tt_stim_adult_explicit',
          when: { test_protocol: 'tg_post_tt_stim_adult' },
          low: 0, high: 1.0,
          context_pl: 'Dorośli, po total thyroidectomy + RAI (stymulowany): excellent response < 1 ng/mL. Po thyroidectomy bez RAI: próg excellent < 2 ng/mL. Wartość > 10 ng/mL = biochemical incomplete.',
          source_ids: ['jarzab_dtc_adults_2022'] },
        { id: 'tg_post_tt_basal_ped_explicit',
          when: { test_protocol: 'tg_post_tt_basal_ped' },
          low: 0, high: 1.0,
          context_pl: 'Dzieci, po total thyroidectomy (bazalny): excellent response ≤ 1,0 ng/mL. Wartości > 1 = biochemical incomplete.',
          source_ids: ['handkiewicz_junak_dtc_children_2024'] },
        { id: 'tg_post_tt_stim_ped_explicit',
          when: { test_protocol: 'tg_post_tt_stim_ped' },
          low: 0, high: 2.0,
          context_pl: 'Dzieci, po total thyroidectomy (stymulowany): excellent response ≤ 2,0 ng/mL. Wartość > 10 = biochemical incomplete (wymaga indywidualnej oceny).',
          source_ids: ['handkiewicz_junak_dtc_children_2024'] },
        // ─── Stara ścieżka — fallback gdy test_protocol pusty (auto) ───
        // Dopasowanie via life_stage / age (wymaga ustawienia kontekstu pacjenta).
        // Po total thyroidectomy — bazalny (na L-tyroksynie)
        { id: 'tg_post_tt_basal_adult',
          when: { life_stage: 'adult', test_protocol: 'post_thyroidectomy_basal' },
          low: 0, high: 0.2,
          context_pl: 'Dorośli, po total thyroidectomy (na L-tyroksynie, bazalny): excellent response < 0,2 ng/mL. Wartości 0,2–5 (po RAI) lub > 1 (bez RAI) = biochemical incomplete; > 5 = persistent disease.',
          source_ids: ['jarzab_dtc_adults_2022'] },
        { id: 'tg_post_tt_basal_ped',
          when: { life_stage: 'pediatric', test_protocol: 'post_thyroidectomy_basal' },
          low: 0, high: 1.0,
          context_pl: 'Dzieci, po total thyroidectomy (bazalny): excellent response ≤ 1,0 ng/mL. Wartości > 1 = biochemical incomplete.',
          source_ids: ['handkiewicz_junak_dtc_children_2024'] },
        // Po total thyroidectomy — stymulowany (rhTSH / odstawienie L-tyr)
        { id: 'tg_post_tt_stim_adult',
          when: { life_stage: 'adult', test_protocol: 'post_thyroidectomy_stimulated' },
          low: 0, high: 1.0,
          context_pl: 'Dorośli, po total thyroidectomy + RAI (stymulowany): excellent response < 1 ng/mL. Po thyroidectomy bez RAI: próg excellent < 2 ng/mL. Wartość > 10 ng/mL = biochemical incomplete.',
          source_ids: ['jarzab_dtc_adults_2022'] },
        { id: 'tg_post_tt_stim_ped',
          when: { life_stage: 'pediatric', test_protocol: 'post_thyroidectomy_stimulated' },
          low: 0, high: 2.0,
          context_pl: 'Dzieci, po total thyroidectomy (stymulowany): excellent response ≤ 2,0 ng/mL. Wartość > 10 = biochemical incomplete (wymaga indywidualnej oceny).',
          source_ids: ['handkiewicz_junak_dtc_children_2024'] },
        // Zachowana tarczyca — stratyfikacja pediatryczna (Spencer 2007; van Trotsenburg 2021)
        { id: 'tg_intact_infant',
          when: { age_min: 0, age_max: 2, life_stage: 'pediatric' },
          low: 0, high: 78,
          context_pl: 'Niemowlęta i dzieci 0–2 lat z zachowaną tarczycą — zakres rozszerzony (do ~78 ng/mL); fizjologiczna podwyższona Tg ze względu na utrzymującą się przebudowę tarczycy po urodzeniu.',
          source_ids: ['mayo_test_tg'] },
        { id: 'tg_intact_child',
          when: { age_min: 2, age_max: 20, life_stage: 'pediatric' },
          low: 0, high: 40,
          context_pl: 'Dzieci 2–19 lat z zachowaną tarczycą — zakres zbliżony do dorosłych z możliwą fizjologiczną elewacją w okresach intensywnego wzrostu/pokwitania.',
          source_ids: ['mayo_test_tg'] },
        // Default: zachowana tarczyca (cała lub po lobektomii) — dorośli
        { id: 'tg_intact',
          when: {}, default: true,
          low: 0, high: 33,
          context_pl: 'Zachowana tarczyca (cała lub po lobektomii) — zdrowi dorośli (Mayo adult range).',
          source_ids: ['mayo_test_tg', 'jarzab_dtc_adults_2022'] }
      ],
      ranges_pl: [
        'Zachowana tarczyca — niemowlęta i dzieci 0–2 lat: < 78 ng/mL (fizjologicznie wyższa wskutek przebudowy)',
        'Zachowana tarczyca — dzieci 2–19 lat: < 40 ng/mL',
        'Zachowana tarczyca (cała / po lobektomii) — dorośli: < 33 ng/mL',
        'Po total thyroidectomy DTC, dorośli, bazalny: < 0,2 ng/mL (excellent); 0,2–5 biochemical incomplete; > 5 persistent',
        'Po total thyroidectomy DTC, dorośli, stymulowany: < 1 (z RAI) lub < 2 (bez RAI) ng/mL (excellent); > 10 incomplete',
        'Po total thyroidectomy DTC, dzieci, bazalny: ≤ 1,0 ng/mL (excellent)',
        'Po total thyroidectomy DTC, dzieci, stymulowany: ≤ 2,0 ng/mL (excellent)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'Tg (tyreoglobulina) — białko produkowane wyłącznie przez komórki pęcherzykowe tarczycy (zdrowe lub nowotworowe). Po thyroidectomy z powodu DTC (zróżnicowany rak tarczycy) — kluczowy marker monitorowania remisji i wykrywania nawrotu choroby.'
          },
          {
            title: 'Zawsze oznaczać RAZEM z anty-Tg',
            body: 'Przeciwciała anty-Tg fałszują wynik immunoassayu Tg, najczęściej znacząco zaniżając jego wartość (mogą maskować nawrót choroby). Sam wynik Tg bez równoległego oznaczenia anty-Tg jest niediagnostyczny. Anty-Tg dodatnie u ok. 20–25% pacjentów z DTC — w tej grupie Tg ma ograniczoną wartość, a trend anty-Tg w czasie staje się surogatem aktywności choroby (spadek = dobra prognoza, wzrost = sygnał alarmowy).'
          },
          {
            title: 'Pomiar bazalny vs stymulowany',
            body: [
              { label: 'Bazalny (na L-tyroksynie)', text: 'pacjent w pełnej dawce supresyjnej L-tyroksyny — TSH < 0,1 mIU/L. Tg może być fałszywie ujemna w pozostałościach DTC supresjonowanego.' },
              { label: 'Stymulowany (rhTSH lub odstawienie L-tyr.)', text: 'TSH > 30 mIU/L (po podaniu rhTSH — Thyrogen — lub po odstawieniu L-tyroksyny). Czulszy do wykrywania resztkowej tkanki / nawrotu.' },
              'Oba wyniki interpretuje się osobno — nie można ich porównywać między sobą.'
            ]
          },
          {
            title: 'Wymóg techniczny — czuły assay',
            body: 'Granica oznaczalności (functional sensitivity) assayu Tg powinna być ≤ 0,1 ng/mL. Starsze, mniej czułe immunoassaye (LOQ 1,0 ng/mL) nie spełniają obecnych standardów monitorowania DTC. Zawsze sprawdzaj LOQ laboratorium.'
          },
          {
            title: 'Polskie wytyczne — różne progi dla dorosłych i dzieci',
            body: [
              'Progi Tg do oceny remisji i nawrotu różnią się między wytycznymi dla dorosłych i dzieci — nie można stosować progów dorosłych u dzieci ani odwrotnie.',
              { items: [
                { label: 'Jarząb 2022 (dorośli)', text: 'pełna ścieżka dynamicznej stratyfikacji odpowiedzi na leczenie z konkretnymi progami Tg po thyroidectomy ± ablacji ¹³¹I. Zob. panel „Rak tarczycy — follow-up u dorosłych".' },
                { label: 'Handkiewicz-Junak 2024 (dzieci)', text: 'osobne wytyczne dla pacjentów pediatrycznych — różny zakres ryzyka, inna kinetyka Tg po leczeniu. Zob. panel „Rak tarczycy — follow-up u dzieci".' }
              ]}
            ]
          }
        ]
      },
      sources: ['Mayo Clinic Labs', 'Jarząb 2022 (DTC dorośli)', 'Handkiewicz-Junak 2024 (DTC dzieci)']
    },

    /* ═══════════════════════════════════════════════════════════════════════
     *  PACZKA 4b — PRZYSADKA + GONADY (8 substancji)
     *  IGF-1, IGFBP-3, prolaktyna, LH, FSH, inhibina B, AMH, SHBG
     *  Źródła: Mayo + Bidlingmaier 2014 (IGF-1) + Andersson 1998 (inhibina B
     *  mini-puberty) + Elmlinger 2005 (SHBG pediatria) + CALIPER Bohn 2022 (AMH)
     *  + polskie progi NFZ/ESHRE 2023
     * ═══════════════════════════════════════════════════════════════════ */

    {
      id: 'igf1',
      label_pl: 'IGF-1 (insulinopodobny czynnik wzrostu 1)',
      label_en: 'Insulin-like Growth Factor 1',
      aliases: ['IGF1', 'somatomedin C', 'somatomedyna C', 'IGF I'],
      group: 'Przysadka — somatotropowa',
      mw: 7649,
      canonical_si: 'nmol/L',
      clinical_indications: ['GH_deficiency', 'GH_deficiency_kids', 'short_stature', 'acromegaly', 'delayed_puberty', 'precocious_puberty', 'obesity_kids'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/mL',  label: 'ng/mL',        kind: 'conv', factor_to_si: 0.131 },
        { symbol: 'μg/L',   label: 'μg/L',         kind: 'conv', factor_to_si: 0.131 }
      ],
      precision: 3,
      reference_ranges_si: [
        // Pediatryczne Tanner-based (Mayo, Bidlingmaier 2014)
        { id: 'igf1_M_tanner1', when: { sex: 'M', tanner: 1 },
          low: 10.6, high: 33.4, context_pl: 'Chłopcy Tanner I',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        { id: 'igf1_M_tanner2', when: { sex: 'M', tanner: 2 },
          low: 13.9, high: 56.6, context_pl: 'Chłopcy Tanner II',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        { id: 'igf1_M_tanner3', when: { sex: 'M', tanner: 3 },
          low: 32.1, high: 66.9, context_pl: 'Chłopcy Tanner III',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        { id: 'igf1_M_tanner4', when: { sex: 'M', tanner: 4 },
          low: 29.2, high: 75.7, context_pl: 'Chłopcy Tanner IV',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        { id: 'igf1_M_tanner5', when: { sex: 'M', tanner: 5 },
          low: 29.7, high: 67.9, context_pl: 'Chłopcy Tanner V',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        { id: 'igf1_F_tanner1', when: { sex: 'F', tanner: 1 },
          low: 11.3, high: 42.3, context_pl: 'Dziewczynki Tanner I',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        { id: 'igf1_F_tanner2', when: { sex: 'F', tanner: 2 },
          low: 15.5, high: 59.1, context_pl: 'Dziewczynki Tanner II',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        { id: 'igf1_F_tanner3', when: { sex: 'F', tanner: 3 },
          low: 33.8, high: 69.3, context_pl: 'Dziewczynki Tanner III',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        { id: 'igf1_F_tanner4_5', when: { sex: 'F', tanner: 4 },
          low: 29.3, high: 76.8, context_pl: 'Dziewczynki Tanner IV–V',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        { id: 'igf1_F_tanner5', when: { sex: 'F', tanner: 5 },
          low: 29.3, high: 76.8, context_pl: 'Dziewczynki Tanner IV–V',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        // — Age-based fallback (gdy Tanner nieznany; Faza 5d).
        { id: 'igf1_M_prepubertal_age', when: { sex: 'M', age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 10.6, high: 33.4,
          context_pl: 'Chłopcy prepubertalni (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        { id: 'igf1_M_peripubertal_age', when: { sex: 'M', age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 13.9, high: 75.7,
          context_pl: 'Chłopcy pubertalni (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        { id: 'igf1_M_latepubertal_age', when: { sex: 'M', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 29.7, high: 67.9,
          context_pl: 'Chłopcy późnopubertalni (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        { id: 'igf1_F_prepubertal_age', when: { sex: 'F', age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 11.3, high: 42.3,
          context_pl: 'Dziewczynki prepubertalne (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        { id: 'igf1_F_peripubertal_age', when: { sex: 'F', age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 15.5, high: 76.8,
          context_pl: 'Dziewczynki pubertalne (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        { id: 'igf1_F_latepubertal_age', when: { sex: 'F', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 29.3, high: 76.8,
          context_pl: 'Dziewczynki późnopubertalne (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_igf1', 'bidlingmaier_igf1_2014'] },
        // Dorośli wiek-stratified (Bidlingmaier 2014)
        { id: 'igf1_adult_20_29', when: { age_min: 19, age_max: 30, life_stage: 'adult' },
          low: 17.8, high: 55.2, context_pl: 'Dorośli 20–29 lat',
          source_ids: ['bidlingmaier_igf1_2014'] },
        { id: 'igf1_adult_30_39', when: { age_min: 30, age_max: 40, life_stage: 'adult' },
          low: 11.8, high: 30.1, context_pl: 'Dorośli 30–39 lat',
          source_ids: ['bidlingmaier_igf1_2014'] },
        { id: 'igf1_adult_40_49', when: { age_min: 40, age_max: 50, life_stage: 'adult' },
          low: 10.5, high: 27.5, context_pl: 'Dorośli 40–49 lat',
          source_ids: ['bidlingmaier_igf1_2014'] },
        { id: 'igf1_adult_50_59', when: { age_min: 50, age_max: 60, life_stage: 'adult' },
          low: 7.9, high: 25.5, context_pl: 'Dorośli 50–59 lat',
          source_ids: ['bidlingmaier_igf1_2014'] },
        { id: 'igf1_adult_60_69', when: { age_min: 60, age_max: 70, life_stage: 'adult' },
          low: 7.2, high: 23.6, context_pl: 'Dorośli 60–69 lat',
          source_ids: ['bidlingmaier_igf1_2014'] },
        { id: 'igf1_adult_70_plus', when: { age_min: 70, life_stage: 'adult' },
          low: 6.6, high: 22.3, context_pl: 'Dorośli ≥ 70 lat',
          source_ids: ['bidlingmaier_igf1_2014'] },
        { id: 'igf1_default', when: {}, default: true,
          low: 11.8, high: 55.2, context_pl: 'Dorośli, zakres ogólny',
          source_ids: ['bidlingmaier_igf1_2014'] }
      ],
      ranges_pl: [
        'Tanner-stratified (preferowane u dzieci/młodzieży) — Mayo i Bidlingmaier 2014',
        'Dorośli silnie wiek-zależni: 20–29 lat: 17,8–55,2; 30–39: 11,8–30,1; 40–49: 10,5–27,5; 50–59: 7,9–25,5; 60–69: 7,2–23,6; ≥70: 6,6–22,3 nmol/L',
        'IGF-1 < 2,5 percentyla dla wieku/Tanner = sugestia niedoboru GH (wymaga IGFBP-3 + test stymulacyjny)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'IGF-1 (insulinopodobny czynnik wzrostu 1, somatomedyna C) — marker integracji osi GH-IGF. Produkowana głównie w wątrobie pod wpływem GH; długi okres półtrwania (~15 h) i stabilne wydzielanie czynią ją lepszym markerem niż sam GH (który jest wydzielany pulsacyjnie). Zastosowanie: diagnostyka niedoboru GH (niskorosłość u dziecka, GHD u dorosłego) i nadmiaru GH (akromegalia). Zawsze mierzona razem z IGFBP-3 — panel GH-IGF.'
          },
          {
            title: 'Tanner stage ważniejszy niż wiek metrykalny',
            body: 'Między 8. a 18. rokiem życia IGF-1 zależy bardziej od stadium dojrzewania (Tanner) niż od samego wieku metrykalnego. Szczyt fizjologiczny IGF-1 przypada na Tanner III–IV (gwałtowny wzrost dojrzewania). Zawsze podaj stadium Tannera przy interpretacji wyniku u nastolatka — przelicznik automatycznie dobierze właściwą normę.'
          },
          {
            title: 'Niedobór wzrostu — kiedy zlecać testy stymulacji GH',
            body: [
              'Polskie wytyczne PTEDD (Oczkowska 2009, Endokrynol Ped vol. 9/Suppl. 1):',
              { items: [
                { label: 'Niedobór wzrostu', text: 'wzrost < −2 SD od średniej dla wieku i płci (wg polskich siatek centylowych OLAF / Palczewska).' },
                { label: 'IGF-1 < −1 SD dla wieku/płci', text: 'wskazanie do testu stymulacji GH (czułość 88% dla szczytu GH < 7 ng/mL w testach stymulacyjnych).' },
                { label: 'Diagnostyka zawsze łączona', text: 'IGF-1 + IGFBP-3 + test stymulacyjny GH (po wykluczeniu chorób przewlekłych, celiakii, niedoczynności tarczycy).' }
              ]},
              'Pełen algorytm diagnostyczny — zob. panele „Niedobór wzrostu" oraz „Niedobór hormonu wzrostu (dzieci — programy lekowe)".'
            ]
          },
          {
            title: 'Ciężki GHD u dorosłych i młodzieży',
            body: 'Kwalifikacja do leczenia rhGH wg Programu Lekowego B.111 NFZ (Załącznik do Obwieszczenia MZ, od XI.2020) — obejmuje pacjentów dorosłych oraz młodzież po zakończeniu terapii promującej wzrastanie. Obniżone IGF-1 (poniżej zakresu wartości prawidłowych) wystarcza do rozpoznania ciężkiego GHD u pacjenta z wielohormonalną niedoczynnością wszystkich osi przysadkowych (z wyjątkiem prolaktyny) oraz potwierdzoną organiczną/genetyczną przyczyną — bez konieczności testu stymulacji. Szczegóły: panel „Niedobór hormonu wzrostu (dorośli)".'
          },
          {
            title: 'Czynniki obniżające IGF-1 (poza GHD)',
            body: 'Przed interpretacją wyniku wykluczyć i wyrównać: niedożywienie, choroby wątroby, niewyrównaną cukrzycę, niedoczynność tarczycy. Wszystkie te stany istotnie obniżają IGF-1 i mogą imitować GHD.'
          }
        ]
      },
      sources: ['Mayo Clinic Labs', 'Bidlingmaier 2014 JCEM', 'Oczkowska 2009 PTEDD', 'Lewiński 2018 Endokrynol Pol']
    },

    {
      id: 'igfbp3',
      label_pl: 'IGFBP-3 (białko wiążące IGF-3)',
      label_en: 'Insulin-like Growth Factor Binding Protein 3',
      aliases: ['IGFBP3', 'binding protein 3'],
      group: 'Przysadka — somatotropowa',
      mw: null,
      biologic_units: true,
      canonical_si: 'mg/L',
      clinical_indications: ['GH_deficiency', 'GH_deficiency_kids', 'short_stature', 'acromegaly'],
      units: [
        { symbol: 'mg/L',  label: 'mg/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'μg/mL', label: 'μg/mL',     kind: 'conv', factor_to_si: 1 }
      ],
      precision: 3,
      reference_ranges_si: [
        // Mayo Tanner V (jedyny pełny zakres pobrany)
        { id: 'igfbp3_tanner5', when: { tanner: 5 },
          low: 2.6, high: 8.6, context_pl: 'Tanner V (dorosły młody)',
          source_ids: ['mayo_test_igfbp3'] },
        { id: 'igfbp3_default', when: {}, default: true,
          low: 2.6, high: 8.6, context_pl: 'Dorośli (Tanner V — zakres ogólny Mayo). UWAGA — pediatryczne tabele age/Tanner-stratified NIE są wprowadzone do bazy: ZAWSZE porównuj z wartościami referencyjnymi laboratorium oznaczającego. Interpretacja wg polskich wytycznych PTEDD: IGFBP-3 < -1 SD dla wieku/płci łącznie z niskim IGF-1 = wskazanie do testu stymulacji GH.',
          source_ids: ['mayo_test_igfbp3'] }
      ],
      ranges_pl: [
        'Tanner V / dorosły młody: 2,6–8,6 mg/L (Mayo)',
        'OSTRZEŻENIE: pediatryczne pełne tabele Tanner-stratified NIE są zawarte w tej bazie — wartości referencyjne dla dzieci/młodzieży należy ZAWSZE odczytać z laboratorium oznaczającego (zalecane Friedrich 2005 JCEM lub własne normy laboratorium)',
        'Interpretacja kliniczna (PTEDD Oczkowska 2009): IGFBP-3 < -1 SD dla wieku/płci łącznie z niskim IGF-1 = wskazanie do testu stymulacji GH'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'IGFBP-3 (białko wiążące IGF — białko wiążące insulinopodobny czynnik wzrostu 3) — główne z sześciu białek wiążących IGF, najsilniej zależne od hormonu wzrostu. Stężenie odzwierciedla stan czynności osi GH i jest bardziej stabilne w ciągu dnia niż IGF-1 (mniejsza zależność od posiłku). Zawsze mierzona razem z IGF-1 — panel GH-IGF.'
          },
          {
            title: 'Interpretacja w diagnostyce GHD',
            body: [
              'Polskie wytyczne PTEDD (Oczkowska 2009, Endokrynol Ped vol. 9/Suppl. 1):',
              { items: [
                'Diagnostyka łączona — IGF-1 + IGFBP-3 + test stymulacyjny GH.',
                { label: 'Oba parametry < −1 SD', text: 'wskazanie do dalszej diagnostyki — pełen algorytm w panelu „Niedobór wzrostu".' },
                'Prawidłowe IGF-1 i IGFBP-3 nie wykluczają całkowicie GHD u dziecka — przy uzasadnionym podejrzeniu klinicznym wykonać testy stymulacji GH.'
              ]}
            ]
          },
          {
            title: 'Ograniczenia bazy norm',
            body: 'W aktualnej bazie aplikacji wprowadzono norm tylko dla Tanner V (Mayo Clinic Labs). Pełne tabele pediatryczne stratyfikowane wiekowo i wg Tannera nie są dostępne w open-access — należy odczytać z laboratorium oznaczającego lub uzupełnić z Friedrich 2005 (JCEM). Dotyczy to zwłaszcza dzieci < 18. r.ż., gdzie IGFBP-3 ma istotną zmienność wiekową.'
          }
        ]
      },
      sources: ['Mayo Clinic Labs', 'Oczkowska 2009 PTEDD', 'Friedrich 2005 JCEM (alt.)']
    },

    {
      id: 'prolactin',
      label_pl: 'Prolaktyna (PRL)',
      label_en: 'Prolactin',
      aliases: ['PRL', 'prolaktyna'],
      group: 'Przysadka — laktotropowa',
      mw: null,
      biologic_units: true,
      canonical_si: 'ng/mL',
      clinical_indications: ['hyperprolactinemia', 'infertility', 'amenorrhea', 'pregnancy', 'hypogonadism_male', 'galactorrhea'],
      units: [
        { symbol: 'ng/mL', label: 'ng/mL (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'μg/L',  label: 'μg/L',       kind: 'conv', factor_to_si: 1 },
        { symbol: 'mIU/L', label: 'mIU/L (WHO 84/500)', kind: 'conv', factor_to_si: 0.04717 }
      ],
      precision: 3,
      reference_ranges_si: [
        // Ciąża — PRZED kobiety nieciężarne, bo te ostatnie nie mają wymogu
        // cycle_phase w when i zmatchowałyby ciążarną fallbackiem.
        { id: 'prl_pregnancy_t1', when: { sex: 'F', cycle_phase: 'pregnancy_t1' },
          low: 10, high: 95, context_pl: 'Ciąża, I trymestr (fizjologiczny wzrost)',
          source_ids: ['mayo_test_prolactin'] },
        { id: 'prl_pregnancy_t2', when: { sex: 'F', cycle_phase: 'pregnancy_t2' },
          low: 40, high: 170, context_pl: 'Ciąża, II trymestr',
          source_ids: ['mayo_test_prolactin'] },
        { id: 'prl_pregnancy_t3', when: { sex: 'F', cycle_phase: 'pregnancy_t3' },
          low: 10, high: 209, context_pl: 'Ciąża, III trymestr (do 209 ng/mL fizjologicznie)',
          source_ids: ['mayo_test_prolactin'] },
        // Mayo PRL (dorośli nieciężarni)
        { id: 'prl_male_adult', when: { sex: 'M', life_stage: 'adult' },
          low: 2, high: 18, context_pl: 'Mężczyźni dorośli (Mayo). Próg hyperprolaktynemii > 15 ng/mL',
          source_ids: ['mayo_test_prolactin'] },
        { id: 'prl_female_nonpregnant', when: { sex: 'F', life_stage: 'adult' },
          low: 2, high: 29, context_pl: 'Kobiety nieciężarne (Mayo). Próg hyperprolaktynemii > 25 ng/mL',
          source_ids: ['mayo_test_prolactin'] },
        { id: 'prl_default', when: {}, default: true,
          low: 2, high: 29, context_pl: 'Dorośli, zakres ogólny',
          source_ids: ['mayo_test_prolactin'] }
      ],
      ranges_pl: [
        'Mężczyźni dorośli: 2–18 ng/mL',
        'Kobiety nieciężarne: 2–29 ng/mL',
        'Ciąża, I trymestr: 10–95 ng/mL',
        'Ciąża, II trymestr: 40–170 ng/mL',
        'Ciąża, III trymestr: 10–209 ng/mL',
        'Polskie i międzynarodowe progi diagnostyczne hiperprolaktynemii (Karasek 2006, ES 2011 Melmed) — zob. sekcje poniżej.',
        'Makroprolaktyna — zalecane gdy PRL > ~33 ng/mL (700 mU/L) bez objawów.'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'Prolaktyna (PRL) — hormon przysadki, regulowany hamująco przez dopaminę z podwzgórza. Podwyższona w wielu fizjologicznych i patologicznych sytuacjach. Pomiar wymaga rygorystycznych warunków pobrania ze względu na podatność na czynniki zewnętrzne.'
          },
          {
            title: 'Protokół pobrania',
            body: [
              { items: [
                { label: 'Pora', text: '7:00–10:00, na czczo.' },
                { label: 'Wypoczynek', text: 'minimum 30 minut spokoju przed pobraniem.' },
                { label: 'Czynniki podwyższające PRL', text: 'stres, sen, stosunek płciowy, wysiłek fizyczny, hipoglikemia — unikać przed pobraniem.' }
              ]}
            ]
          },
          {
            title: 'Wykluczenie wtórnych przyczyn hiperprolaktynemii',
            body: [
              { items: [
                'Ciąża (najczęstsza fizjologiczna przyczyna).',
                'Niedoczynność tarczycy (↑ TRH stymuluje też PRL).',
                'Leki — neuroleptyki, metoklopramid, opioidy, niektóre antydepresanty (SSRI, TCA).',
                'Przewlekła choroba nerek, marskość wątroby.'
              ]}
            ]
          },
          {
            title: 'Polskie wytyczne — Karasek / Pawlikowski / Lewiński 2006',
            body: [
              'Endokrynol Pol 57(6):656-662:',
              { items: [
                { label: 'Hiperprolaktynemia', text: '> 20 ng/mL u kobiet / > 15 ng/mL u mężczyzn.' },
                { label: 'PRL 25–200 ng/mL', text: 'możliwa każda przyczyna (mikrogruczolak, leki, hipotyroza, niewydolność nerek).' },
                { label: 'PRL > 200 ng/mL + zaburzony rytm dobowy', text: 'zwykle prolactinoma (mikro / makro).' },
                { label: 'PRL < 150 ng/mL + stwierdzony gruczolak', text: 'guz mieszany lub niewydzielający prolaktyny.' }
              ]}
            ]
          },
          {
            title: 'Międzynarodowe wytyczne — ES 2011 (Melmed)',
            body: [
              { items: [
                { label: 'PRL > 250 ng/mL', text: 'silnie sugeruje prolactinoma.' },
                { label: 'PRL > 500 ng/mL', text: 'diagnostyczne dla makroprolactinoma.' }
              ]}
            ]
          },
          {
            title: 'Makroprolaktyna — badanie różnicujące',
            body: 'Przy bezobjawowej hiperprolaktynemii warto wykonać badanie różnicujące na makroprolaktynę (kompleks PRL-IgG, biologicznie nieaktywny). Metoda: precypitacja PEG (polietylenoglikol). Odzysk monomerowej PRL < ~40% po precypitacji sugeruje przewagę makroprolaktyny — wynik fałszywie sugerujący hiperprolaktynemię.'
          },
          {
            title: 'Konwersja jednostek',
            body: 'ng/mL × 21,2 = mIU/L (standard WHO IS 84/500).'
          }
        ]
      },
      sources: ['Mayo Clinic Labs', 'Karasek 2006 (Endokrynol Pol)', 'Melmed/ES 2011', 'WHO IS 84/500']
    },

    {
      id: 'lh',
      label_pl: 'LH (hormon luteinizujący)',
      label_en: 'Luteinizing Hormone',
      aliases: ['LH', 'lutropina', 'lutropin'],
      group: 'Oś podwzgórze-przysadka-gonady',
      mw: null,
      biologic_units: true,
      canonical_si: 'IU/L',
      clinical_indications: ['hypogonadism_male', 'hypogonadism_female', 'pcos', 'infertility', 'menopause', 'precocious_puberty', 'delayed_puberty', 'klinefelter', 'ovarian_failure', 'obesity_kids'],
      units: [
        { symbol: 'IU/L',   label: 'IU/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'mIU/mL', label: 'mIU/mL',     kind: 'conv', factor_to_si: 1 }
      ],
      precision: 3,
      reference_ranges_si: [
        // Mini-puberty (Andersson 1998, Bergada 2006)
        { id: 'lh_minipuberty_M', when: { sex: 'M', age_min: 0.083, age_max: 0.5, life_stage: 'pediatric' },
          low: 1, high: 6, context_pl: 'Chłopcy 1–6 miesięcy (mini-puberty, peak ~3 mies.)',
          source_ids: ['andersson_inhibin_b_1998'] },
        { id: 'lh_minipuberty_F', when: { sex: 'F', age_min: 0.083, age_max: 0.5, life_stage: 'pediatric' },
          low: 0, high: 2, context_pl: 'Dziewczynki 1–6 miesięcy (mini-puberty słabsza niż u M)',
          source_ids: ['andersson_inhibin_b_1998'] },
        // Tanner-based pediatryczne (Mayo LHPED, czułość 0.02 IU/L)
        { id: 'lh_M_tanner1', when: { sex: 'M', tanner: 1 },
          low: 0.02, high: 0.5, context_pl: 'Chłopcy Tanner I (prepubertal, 1–8 lat)',
          source_ids: ['mayo_test_lh_pediatric'] },
        { id: 'lh_M_tanner2', when: { sex: 'M', tanner: 2 },
          low: 0.03, high: 3.7, context_pl: 'Chłopcy Tanner II',
          source_ids: ['mayo_test_lh_pediatric'] },
        { id: 'lh_M_tanner3', when: { sex: 'M', tanner: 3 },
          low: 0.09, high: 4.2, context_pl: 'Chłopcy Tanner III',
          source_ids: ['mayo_test_lh_pediatric'] },
        { id: 'lh_M_tanner4', when: { sex: 'M', tanner: 4 },
          low: 1.3, high: 9.8, context_pl: 'Chłopcy Tanner IV–V',
          source_ids: ['mayo_test_lh_pediatric'] },
        { id: 'lh_M_tanner5', when: { sex: 'M', tanner: 5 },
          low: 1.3, high: 9.8, context_pl: 'Chłopcy Tanner IV–V',
          source_ids: ['mayo_test_lh_pediatric'] },
        { id: 'lh_F_tanner1', when: { sex: 'F', tanner: 1 },
          low: 0.02, high: 0.3, context_pl: 'Dziewczynki Tanner I (prepubertal)',
          source_ids: ['mayo_test_lh_pediatric'] },
        { id: 'lh_F_tanner2', when: { sex: 'F', tanner: 2 },
          low: 0.02, high: 4.1, context_pl: 'Dziewczynki Tanner II',
          source_ids: ['mayo_test_lh_pediatric'] },
        { id: 'lh_F_tanner3', when: { sex: 'F', tanner: 3 },
          low: 0.6, high: 7.2, context_pl: 'Dziewczynki Tanner III',
          source_ids: ['mayo_test_lh_pediatric'] },
        { id: 'lh_F_tanner4', when: { sex: 'F', tanner: 4 },
          low: 0.9, high: 13.3, context_pl: 'Dziewczynki Tanner IV–V',
          source_ids: ['mayo_test_lh_pediatric'] },
        { id: 'lh_F_tanner5', when: { sex: 'F', tanner: 5 },
          low: 0.9, high: 13.3, context_pl: 'Dziewczynki Tanner IV–V',
          source_ids: ['mayo_test_lh_pediatric'] },
        // — Age-based fallback (gdy Tanner nieznany; Faza 5d).
        { id: 'lh_M_prepubertal_age', when: { sex: 'M', age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 0.02, high: 0.5,
          context_pl: 'Chłopcy prepubertalni (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_lh_pediatric'] },
        { id: 'lh_M_peripubertal_age', when: { sex: 'M', age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 0.03, high: 9.8,
          context_pl: 'Chłopcy pubertalni (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_lh_pediatric'] },
        { id: 'lh_M_latepubertal_age', when: { sex: 'M', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 1.3, high: 9.8,
          context_pl: 'Chłopcy późnopubertalni (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_lh_pediatric'] },
        { id: 'lh_F_prepubertal_age', when: { sex: 'F', age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 0.02, high: 0.3,
          context_pl: 'Dziewczynki prepubertalne (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_lh_pediatric'] },
        { id: 'lh_F_peripubertal_age', when: { sex: 'F', age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 0.02, high: 13.3,
          context_pl: 'Dziewczynki pubertalne (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_lh_pediatric'] },
        { id: 'lh_F_latepubertal_age', when: { sex: 'F', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 0.9, high: 13.3,
          context_pl: 'Dziewczynki późnopubertalne (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_lh_pediatric'] },
        // Dorośli, cycle-aware u kobiet
        { id: 'lh_male_adult', when: { sex: 'M', life_stage: 'adult' },
          low: 1.24, high: 8.62, context_pl: 'Mężczyźni dorośli',
          source_ids: ['mayo_test_lh_adult'] },
        { id: 'lh_female_follicular', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'follicular' },
          low: 1.68, high: 15.0, context_pl: 'Kobiety, faza folikularna',
          source_ids: ['mayo_test_lh_adult'] },
        { id: 'lh_female_ovulation', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'ovulation' },
          low: 21.9, high: 56.6, context_pl: 'Kobiety, pik owulacyjny (5–10× wyższy)',
          source_ids: ['mayo_test_lh_adult'] },
        { id: 'lh_female_luteal', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'luteal' },
          low: 0.61, high: 16.3, context_pl: 'Kobiety, faza lutealna',
          source_ids: ['mayo_test_lh_adult'] },
        { id: 'lh_female_postmeno', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'postmenopause' },
          low: 14.2, high: 52.3, context_pl: 'Kobiety, postmenopauza (> 40 IU/L diagnostyczne)',
          source_ids: ['mayo_test_lh_adult'] },
        { id: 'lh_female_default', when: { sex: 'F', life_stage: 'adult' },
          low: 1.68, high: 15.0, context_pl: 'Kobiety dorosłe (domyślnie folikularna)',
          source_ids: ['mayo_test_lh_adult'] },
        { id: 'lh_default', when: {}, default: true,
          low: 1.24, high: 8.62, context_pl: 'Dorośli, zakres ogólny (mężczyźni)',
          source_ids: ['mayo_test_lh_adult'] }
      ],
      ranges_pl: [
        'Mini-puberty: chłopcy 1–6 mies. peak 1–6 IU/L; dziewczynki słabsza dynamika',
        'Tanner I (prepubertal): < 0,5 (M), < 0,3 (F) IU/L',
        'Tanner V: 1,3–9,8 (M), 0,9–13,3 (F)',
        'Dorośli M: 1,24–8,62 IU/L',
        'K folikularna: 1,68–15; pik owul.: 21,9–56,6; lutealna: 0,61–16,3; postmenop.: 14,2–52,3',
        'Próg hipogonadyzmu hipogonadotropowego: < 1,5 IU/L u dorosłych',
        'LH/FSH > 2:1 lub > 3:1: wspomagająco PCOS'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'LH (hormon luteinizujący) — produkowany przez przysadkę, wydzielany pulsacyjnie. U kobiet w połowie cyklu pik LH (ovulatory surge) wywołuje owulację. U mężczyzn LH stymuluje produkcję testosteronu w komórkach Leydiga. Pojedynczy pomiar może być mylący ze względu na pulsacyjne wydzielanie.'
          },
          {
            title: 'Pobranie',
            body: [
              { items: [
                { label: 'U kobiet', text: 'zawsze podać dzień cyklu lub fazę. Standardowo pobranie w 3.–5. dniu cyklu (faza folikularna).' },
                { label: 'Pulsacyjność', text: 'jeden pomiar może być nieprzewidywalny. Przy ocenie hipogonadyzmu można rozważyć 3 pomiary co 20–30 min i uśrednić.' }
              ]}
            ]
          },
          {
            title: 'Mini-puberty u niemowląt (1–6 mies.)',
            body: 'Wartości LH/FSH są przejściowo podwyższone — fizjologiczna aktywacja osi podwzgórze-przysadka-gonady (postnatal gonadal axis activation, szczyt ~3 mies.). To okno diagnostyczne dla wrodzonego hipogonadyzmu.'
          },
          {
            title: 'Polskie wytyczne PTMRiE/PTGP 2018 — niepłodność',
            body: [
              { items: [
                { label: 'U kobiet', text: 'oznaczyć LH + FSH + estradiol w 3.–5. dniu cyklu. Podwyższony stosunek LH/FSH > 2:1 lub > 3:1 wspomagająco sugeruje PCOS.' },
                { label: 'U mężczyzn — hipogonadyzm', text: 'LH + FSH + testosteron całkowity. ↑LH + ↓testosteron = pierwotny (hipergonadotropowy). ↓/prawidłowy LH + ↓testosteron = wtórny (hipogonadotropowy — wskazanie do MRI przysadki).' }
              ]}
            ]
          },
          {
            title: 'Pediatria — czuły assay LH (Mayo LHPED)',
            body: 'Test Mayo LHPED ma 10× wyższą czułość niż standardowy (limit detekcji 0,02 IU/L). Istotny w diagnostyce CPP (centralne przedwczesne dojrzewanie) — gdzie LH bazalne lub po stymulacji LHRH > 0,3 IU/L sugeruje aktywację osi GnRH.'
          }
        ]
      },
      sources: ['Mayo Clinic Labs', 'Andersson 1998 (mini-puberty)', 'CALIPER Konforte 2013', 'PTMRiE/PTGP 2018']
    },

    {
      id: 'fsh',
      label_pl: 'FSH (hormon folikulotropowy)',
      label_en: 'Follicle-Stimulating Hormone',
      aliases: ['FSH', 'folikulotropina', 'folikulinotropina', 'folitropin'],
      group: 'Oś podwzgórze-przysadka-gonady',
      mw: null,
      biologic_units: true,
      canonical_si: 'IU/L',
      clinical_indications: ['hypogonadism_male', 'hypogonadism_female', 'infertility', 'menopause', 'ovarian_failure', 'klinefelter', 'ivf_reserve', 'precocious_puberty', 'delayed_puberty', 'obesity_kids'],
      units: [
        { symbol: 'IU/L',   label: 'IU/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'mIU/mL', label: 'mIU/mL',     kind: 'conv', factor_to_si: 1 }
      ],
      precision: 3,
      reference_ranges_si: [
        // Mini-puberty (Andersson 1998)
        { id: 'fsh_minipuberty_M', when: { sex: 'M', age_min: 0.083, age_max: 0.5, life_stage: 'pediatric' },
          low: 0.2, high: 3.0, context_pl: 'Chłopcy 1–6 miesięcy (mini-puberty)',
          source_ids: ['andersson_inhibin_b_1998'] },
        { id: 'fsh_minipuberty_F', when: { sex: 'F', age_min: 0.083, age_max: 0.5, life_stage: 'pediatric' },
          low: 1, high: 8, context_pl: 'Dziewczynki 1–6 miesięcy (mini-puberty, peak wyższy niż u M)',
          source_ids: ['andersson_inhibin_b_1998'] },
        // Tanner-based (Mayo FSH)
        { id: 'fsh_tanner1', when: { tanner: 1 },
          low: 0.4, high: 6.7, context_pl: 'Tanner I (prepubertal)',
          source_ids: ['mayo_test_fsh'] },
        { id: 'fsh_tanner2', when: { tanner: 2 },
          low: 0.5, high: 8.7, context_pl: 'Tanner II',
          source_ids: ['mayo_test_fsh'] },
        { id: 'fsh_tanner3', when: { tanner: 3 },
          low: 1.2, high: 11.4, context_pl: 'Tanner III',
          source_ids: ['mayo_test_fsh'] },
        { id: 'fsh_tanner4', when: { tanner: 4 },
          low: 0.7, high: 12.8, context_pl: 'Tanner IV',
          source_ids: ['mayo_test_fsh'] },
        { id: 'fsh_tanner5', when: { tanner: 5 },
          low: 1.0, high: 11.6, context_pl: 'Tanner V',
          source_ids: ['mayo_test_fsh'] },
        // — Age-based fallback (gdy Tanner nieznany; Faza 5d). FSH Tanner Mayo nie dzieli
        //   na M/F (single range per Tanner), więc fallbacki też pojedyncze (suma M/F).
        { id: 'fsh_prepubertal_age', when: { age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 0.4, high: 6.7,
          context_pl: 'Dzieci prepubertalne (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_fsh'] },
        { id: 'fsh_peripubertal_age', when: { age_min: 9, age_max: 14, life_stage: 'pediatric' },
          low: 0.5, high: 12.8,
          context_pl: 'Dzieci pubertalne (9–14 lat, suma Tanner II–IV — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_fsh'] },
        { id: 'fsh_latepubertal_age', when: { age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 1.0, high: 11.6,
          context_pl: 'Dzieci późnopubertalne (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['mayo_test_fsh'] },
        // Dorośli
        { id: 'fsh_male_adult', when: { sex: 'M', life_stage: 'adult' },
          low: 1.5, high: 12.4, context_pl: 'Mężczyźni dorośli',
          source_ids: ['mayo_test_fsh'] },
        { id: 'fsh_female_follicular', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'follicular' },
          low: 3.9, high: 8.8, context_pl: 'Kobiety, faza folikularna (3. d.c. — ocena rezerwy)',
          source_ids: ['mayo_test_fsh'] },
        { id: 'fsh_female_ovulation', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'ovulation' },
          low: 4.5, high: 22.5, context_pl: 'Kobiety, pik owulacyjny',
          source_ids: ['mayo_test_fsh'] },
        { id: 'fsh_female_luteal', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'luteal' },
          low: 1.8, high: 5.1, context_pl: 'Kobiety, faza lutealna',
          source_ids: ['mayo_test_fsh'] },
        { id: 'fsh_female_postmeno', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'postmenopause' },
          low: 16.7, high: 113.6, context_pl: 'Kobiety, postmenopauza (> 40 IU/L diagnostyczne)',
          source_ids: ['mayo_test_fsh'] },
        { id: 'fsh_female_default', when: { sex: 'F', life_stage: 'adult' },
          low: 3.9, high: 8.8, context_pl: 'Kobiety dorosłe (domyślnie folikularna)',
          source_ids: ['mayo_test_fsh'] },
        { id: 'fsh_default', when: {}, default: true,
          low: 1.5, high: 12.4, context_pl: 'Dorośli, zakres ogólny',
          source_ids: ['mayo_test_fsh'] }
      ],
      ranges_pl: [
        'Tanner I: 0,4–6,7 IU/L; Tanner II: 0,5–8,7; Tanner III: 1,2–11,4; Tanner IV: 0,7–12,8; Tanner V: 1,0–11,6',
        'Mężczyźni dorośli: 1,5–12,4 IU/L',
        'Kobiety — faza folikularna (3. d.c.): 3,9–8,8 IU/L',
        'Kobiety — pik owulacyjny: 4,5–22,5 IU/L',
        'Kobiety — faza lutealna: 1,8–5,1 IU/L',
        'Kobiety — postmenopauza: 16,7–113,6 IU/L',
        'Progi rezerwy jajnikowej i kryteria POI (ESHRE 2016 / PTMRiE 2018) — zob. sekcje poniżej.'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'FSH (hormon folikulotropowy) — produkowany przez przysadkę, stymuluje rozwój pęcherzyków jajnikowych u kobiet i spermatogenezę u mężczyzn. Najczęściej oznaczany w panelu z LH + estradiolem (kobiety) lub testosteronem (mężczyźni). AMH jest bardziej czułym markerem rezerwy jajnikowej niż FSH.'
          },
          {
            title: 'Progi rezerwy jajnikowej (FSH w 3. d.c.)',
            body: [
              { items: [
                { label: 'FSH > 10 IU/L', text: 'obniżona rezerwa jajnikowa.' },
                { label: 'FSH > 25 IU/L', text: 'bardzo obniżona rezerwa.' },
                { label: 'FSH > 40 IU/L', text: 'menopauza.' }
              ]}
            ]
          },
          {
            title: 'POI — przedwczesna niewydolność jajników (ESHRE 2016)',
            body: [
              'Kryteria rozpoznania POI:',
              { items: [
                'FSH > 25 IU/L w DWÓCH pomiarach w odstępie > 4 tygodni.',
                'Amenorrhea ≥ 4 miesięcy.',
                'Wiek < 40 lat.'
              ]}
            ]
          },
          {
            title: 'Hipogonadyzm — różnicowanie',
            body: [
              { items: [
                { label: 'Hipogonadyzm hipergonadotropowy (niewydolność gonad)', text: 'FSH ↑↑ + niskie hormony płciowe (E2/T). Najczęstsze przyczyny: POI u kobiet, zespół Klinefeltera u mężczyzn.' },
                { label: 'Hipogonadyzm hipogonadotropowy', text: 'FSH < 1,5 IU/L + niski estradiol / testosteron. Wskazanie do MRI przysadki (zmiana organiczna, zespół Kallmanna).' }
              ]}
            ]
          },
          {
            title: 'Polskie wytyczne PTMRiE/PTGP 2018',
            body: 'Oznaczenie FSH + LH + estradiol w 3.–5. dniu cyklu u kobiet w diagnostyce niepłodności (panel pierwszego rzutu).'
          }
        ]
      },
      sources: ['Mayo Clinic Labs', 'Andersson 1998 (mini-puberty)', 'CALIPER Konforte 2013', 'PTMRiE/PTGP 2018', 'ESHRE 2016 (POI)']
    },

    {
      id: 'inhibin_b',
      label_pl: 'Inhibina B',
      label_en: 'Inhibin B',
      aliases: ['inhibinB', 'inhibina-B'],
      group: 'Oś podwzgórze-przysadka-gonady',
      mw: null,
      biologic_units: true,
      canonical_si: 'pg/mL',
      clinical_indications: ['hypogonadism_male', 'infertility', 'klinefelter', 'dsd', 'delayed_puberty', 'ovarian_failure', 'menopause', 'ivf_reserve'],
      units: [
        { symbol: 'pg/mL', label: 'pg/mL (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'ng/L',  label: 'ng/L',       kind: 'conv', factor_to_si: 1 }
      ],
      precision: 3,
      reference_ranges_si: [
        // Mini-puberty u chłopców — kluczowe klinicznie (Andersson 1998)
        { id: 'inhb_M_minipuberty_peak', when: { sex: 'M', age_min: 0.083, age_max: 0.5, life_stage: 'pediatric' },
          low: 150, high: 400, context_pl: 'Chłopcy 1–6 miesięcy (mini-puberty, peak ~3–4 mies., mediana 270)',
          source_ids: ['andersson_inhibin_b_1998'] },
        { id: 'inhb_M_6_12mo', when: { sex: 'M', age_min: 0.5, age_max: 1, life_stage: 'pediatric' },
          low: 100, high: 200, context_pl: 'Chłopcy 6–12 miesięcy (spadek z mini-puberty)',
          source_ids: ['andersson_inhibin_b_1998'] },
        // Dzieci prepubertal (Mayo uproszczone)
        { id: 'inhb_M_prepubertal', when: { sex: 'M', age_min: 1, age_max: 9, life_stage: 'pediatric' },
          low: 70, high: 150, context_pl: 'Chłopcy prepubertal 1–9 lat',
          source_ids: ['mayo_test_inhibin_b'] },
        { id: 'inhb_F_prepubertal', when: { sex: 'F', age_min: 1, age_max: 9, life_stage: 'pediatric' },
          low: 0, high: 50, context_pl: 'Dziewczynki prepubertal 1–9 lat (znacznie niższe niż u M)',
          source_ids: ['mayo_test_inhibin_b'] },
        // Tanner-aware (Mayo uproszczone <16/≥16, literatura)
        { id: 'inhb_M_pubertal', when: { sex: 'M', age_min: 9, age_max: 16, life_stage: 'pediatric' },
          low: 80, high: 250, context_pl: 'Chłopcy 9–16 lat (pokwitanie, wzrost do plateau dorosłego w Tanner II)',
          source_ids: ['mayo_test_inhibin_b'] },
        { id: 'inhb_F_pubertal', when: { sex: 'F', age_min: 9, age_max: 16, life_stage: 'pediatric' },
          low: 20, high: 90, context_pl: 'Dziewczynki 9–16 lat (pokwitanie)',
          source_ids: ['mayo_test_inhibin_b'] },
        // Dorośli
        { id: 'inhb_male_adult', when: { sex: 'M', life_stage: 'adult' },
          low: 80, high: 300, context_pl: 'Mężczyźni dorośli (mediana ~170; < 80 = niewydolność jąder; < 40 = azoospermia non-obstructive)',
          source_ids: ['mayo_test_inhibin_b'] },
        { id: 'inhb_female_follicular', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'follicular' },
          low: 20, high: 90, context_pl: 'Kobiety, faza folikularna',
          source_ids: ['mayo_test_inhibin_b'] },
        { id: 'inhb_female_ovulation', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'ovulation' },
          low: 50, high: 200, context_pl: 'Kobiety, pik owulacyjny',
          source_ids: ['mayo_test_inhibin_b'] },
        { id: 'inhb_female_luteal', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'luteal' },
          low: 0, high: 50, context_pl: 'Kobiety, późna faza lutealna',
          source_ids: ['mayo_test_inhibin_b'] },
        { id: 'inhb_female_postmeno', when: { sex: 'F', life_stage: 'adult', cycle_phase: 'postmenopause' },
          low: 0, high: 5, context_pl: 'Kobiety, postmenopauza (poniżej granicy detekcji)',
          source_ids: ['mayo_test_inhibin_b'] },
        { id: 'inhb_female_default', when: { sex: 'F', life_stage: 'adult' },
          low: 20, high: 90, context_pl: 'Kobiety dorosłe (domyślnie folikularna)',
          source_ids: ['mayo_test_inhibin_b'] },
        { id: 'inhb_default', when: {}, default: true,
          low: 80, high: 300, context_pl: 'Dorośli, zakres ogólny (mężczyźni)',
          source_ids: ['mayo_test_inhibin_b'] }
      ],
      ranges_pl: [
        'Mini-puberty M (1–6 mies.): 150–400 pg/mL (peak ~3–4 mies.)',
        'Dzieci prepubertal: M 70–150, F 0–50 pg/mL',
        'Pokwitanie 9–16 lat: M 80–250, F 20–90',
        'Mężczyźni dorośli: 80–300 (< 80 niewydolność jąder; < 40 azoospermia non-obstructive)',
        'Kobiety: K folikularna 20–90; pik owul. 50–200; lutealna < 50; postmenop. < 5 pg/mL'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'Inhibina B — u chłopców marker funkcji komórek Sertoli i spermatogenezy; u kobiet komplementarny marker rezerwy jajnikowej (razem z AMH). W mini-puberty u chłopców (1–6 mies.) wartości szczytowe (mediana 270 pg/mL, do 400) — kluczowe dla diagnostyki hipogonadyzmu wrodzonego.'
          },
          {
            title: 'Progi u mężczyzn',
            body: [
              { items: [
                { label: '< 80 pg/mL', text: 'niewydolność jąder.' },
                { label: '< 40 pg/mL', text: 'azoospermia non-obstructive.' }
              ]}
            ]
          },
          {
            title: 'Zespół Klinefeltera',
            body: 'Niska inhibina B + niska AMH + wysokie FSH/LH = pierwotna niewydolność komórek Sertoli. Pełen panel diagnostyczny — zob. panel kliniczny „Zespół Klinefeltera".'
          },
          {
            title: 'Różnicowanie CDGP vs trwały hipogonadyzm hipogonadotropowy',
            body: [
              'U chłopców z opóźnionym dojrzewaniem inhibina B jest jednym z najlepszych pojedynczych parametrów różnicujących (wg PTEDD / ESPE):',
              { items: [
                { label: 'CDGP (konstytucjonalne opóźnienie)', text: 'inhibina B zachowana — rokowanie korzystne.' },
                { label: 'Trwały wrodzony HH', text: 'inhibina B obniżona / nieoznaczalna — wymaga leczenia.' }
              ]},
              'Pełen algorytm — zob. panel kliniczny „Opóźnione dojrzewanie płciowe".'
            ]
          },
          {
            title: 'Uwaga — niepłodność u kobiet',
            body: 'Polskie wytyczne PTMRiE/PTGP 2018 (Diagnostyka i leczenie niepłodności) nie wymieniają inhibiny B jako standardowego markera rezerwy jajnikowej. Interpretacja kliniczna jako uzupełnienie AMH, bez konkretnych polskich progów. U kobiet inhibina B spada szybciej z wiekiem niż AMH.'
          }
        ]
      },
      sources: ['Mayo Clinic Labs', 'Andersson 1998 (mini-puberty)', 'PTEDD/ESPE (delayed puberty, CDGP)']
    },

    {
      id: 'amh',
      label_pl: 'AMH (hormon antymüllerowski)',
      label_en: 'Anti-Müllerian Hormone',
      aliases: ['AMH', 'antimullerian', 'antymüllerowski', 'MIS'],
      group: 'Oś podwzgórze-przysadka-gonady',
      mw: null,                     // białko ~140 kDa; factor 7.14 (ng/mL → pmol/L) jest empiryczny z literatury, nie masowy
      biologic_units: true,
      canonical_si: 'ng/mL',
      clinical_indications: ['ivf_reserve', 'ovarian_failure', 'menopause', 'pcos', 'infertility', 'hypogonadism_male', 'klinefelter', 'dsd', 'delayed_puberty'],
      units: [
        { symbol: 'ng/mL',  label: 'ng/mL (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'pmol/L', label: 'pmol/L',     kind: 'conv', factor_to_si: 0.1401 },   // 1 pmol/L = 1/7.14 ng/mL
        { symbol: 'μg/L',   label: 'μg/L',       kind: 'conv', factor_to_si: 1 }
      ],
      precision: 3,
      reference_ranges_si: [
        // Kobiety: Mayo age-stratified
        { id: 'amh_F_under_2', when: { sex: 'F', age_max: 2, life_stage: 'pediatric' },
          low: 0, high: 4.7, context_pl: 'Dziewczynki < 2 lat',
          source_ids: ['mayo_test_amh'] },
        { id: 'amh_F_2_12', when: { sex: 'F', age_min: 2, age_max: 13, life_stage: 'pediatric' },
          low: 0, high: 8.8, context_pl: 'Dziewczynki 2–12 lat (CALIPER 2022: mediana 3,18–4,16)',
          source_ids: ['mayo_test_amh', 'bohn_amh_caliper_2022'] },
        { id: 'amh_F_13_45', when: { sex: 'F', age_min: 13, age_max: 46, life_stage: 'adult' },
          low: 0.9, high: 9.5, context_pl: 'Kobiety w wieku rozrodczym (13–45 lat). Próg PCOS > 5; niska rezerwa < 1; NFZ IVF ≥ 0,7',
          source_ids: ['mayo_test_amh', 'eshre_pcos_2023', 'nfz_ivf_2025'] },
        { id: 'amh_F_over_45', when: { sex: 'F', age_min: 45, life_stage: 'adult' },
          low: 0, high: 1.0, context_pl: 'Kobiety > 45 lat (perimenopauza/menopauza)',
          source_ids: ['mayo_test_amh'] },
        // Mężczyźni
        { id: 'amh_M_minipuberty', when: { sex: 'M', age_min: 0, age_max: 0.5, life_stage: 'pediatric' },
          low: 100, high: 200, context_pl: 'Chłopcy 0–6 miesięcy (mini-puberty, bardzo wysoka — marker komórek Sertoli)',
          source_ids: ['mayo_test_amh'] },
        { id: 'amh_M_pediatric', when: { sex: 'M', age_min: 0.5, age_max: 18, life_stage: 'pediatric' },
          low: 5, high: 100, context_pl: 'Chłopcy 6 mies. – 18 lat (spadek od pokwitania)',
          source_ids: ['mayo_test_amh'] },
        { id: 'amh_M_adult', when: { sex: 'M', life_stage: 'adult' },
          low: 1.5, high: 10, context_pl: 'Mężczyźni dorośli (stabilne w wieku rozrodczym, spadek z wiekiem)',
          source_ids: ['mayo_test_amh'] },
        { id: 'amh_default', when: {}, default: true,
          low: 0.9, high: 9.5, context_pl: 'Dorośli (zakres ogólny kobiet rozrodczych)',
          source_ids: ['mayo_test_amh'] }
      ],
      ranges_pl: [
        'Kobiety < 2 lat: < 4,7 ng/mL; 2–12 lat: < 8,8',
        'Kobiety 13–45 lat (rozrodczy): 0,9–9,5',
        'Próg PCOS: > 5 ng/mL (ESHRE 2023 jako wspomagający)',
        'Niska rezerwa jajnikowa: < 1,0 ng/mL (kobiety > 35 lat)',
        'Próg NFZ IVF: ≥ 0,7 ng/mL',
        'Kobiety > 45 lat: < 1,0 ng/mL',
        'Chłopcy mini-puberty (0–6 mies.): 100–200 ng/mL',
        'Mężczyźni dorośli: 1,5–10 ng/mL'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'AMH (hormon antymüllerowski) — najczulszy marker rezerwy jajnikowej u kobiet i marker funkcji komórek Sertoli u chłopców. Stabilny w cyklu menstruacyjnym (w przeciwieństwie do FSH) — można oznaczać w dowolnym dniu cyklu. U kobiet wartości szczytowe ~25 r.ż., potem stopniowy spadek aż do menopauzy.'
          },
          {
            title: 'Mini-puberty u chłopców',
            body: 'U chłopców w mini-puberty (0–6 mies. życia) bardzo wysokie wartości AMH — marker komórek Sertoli i sygnał obecności zachowanych jąder. Niska AMH w tym okresie sugeruje anorchię lub dysgenezję gonad.'
          },
          {
            title: 'Polskie wytyczne PTMRiE/PTGP 2018 — niepłodność',
            body: [
              'AMH zalecany jako element przesiewowego badania rezerwy jajnikowej u:',
              { items: [
                'Kobiet planujących późną prokreację.',
                'Kobiet przed leczeniem gonadotoksycznym (chemioterapia, radioterapia onkologiczna).'
              ]},
              'Wytyczne nie podają konkretnych progów liczbowych — interpretacja indywidualna w kontekście wyników laboratorium i AFC (antral follicle count) w USG.',
              { label: 'Refundacja NFZ IVF', text: 'AMH ≥ 0,7 ng/mL jest warunkiem kwalifikacji do procedury.' }
            ]
          },
          {
            title: 'PCOS — ESHRE 2023',
            body: 'AMH > 5 ng/mL może zastąpić USG morfologii jajników w kryteriach Rotterdamskich (kryterium pomocnicze, nie wykluczające — nadal można rozpoznać PCOS bez podwyższonego AMH).'
          },
          {
            title: 'Uwagi techniczne',
            body: [
              { items: [
                { label: 'Konwersja', text: 'ng/mL × 7,14 = pmol/L.' },
                { label: 'Metoda', text: 'Beckman Gen II i picoAMH dają RÓŻNE wyniki — sprawdź, jaki assay stosuje laboratorium.' }
              ]}
            ]
          }
        ]
      },
      sources: ['Mayo Clinic Labs', 'CALIPER Bohn 2022 (PMID 35760370)', 'ESHRE 2023 PCOS', 'PTMRiE/PTGP 2018', 'NFZ IVF']
    },

    {
      id: 'shbg',
      label_pl: 'SHBG (globulina wiążąca hormony płciowe)',
      label_en: 'Sex Hormone-Binding Globulin',
      aliases: ['SHBG', 'TeBG'],
      group: 'Oś podwzgórze-przysadka-gonady',
      mw: 90000,
      canonical_si: 'nmol/L',
      clinical_indications: ['hypogonadism_male', 'hypogonadism_female', 'pcos', 'hirsutism', 'andropause', 'hyperthyroidism', 'pregnancy', 'metabolic_syndrome', 'obesity_kids'],
      units: [
        { symbol: 'nmol/L', label: 'nmol/L (SI)', kind: 'si',   factor_to_si: 1 },
        { symbol: 'μg/dL',  label: 'μg/dL',        kind: 'conv', factor_to_si: 0.347 }
      ],
      precision: 3,
      reference_ranges_si: [
        // Pediatryczne Tanner (Elmlinger 2005)
        { id: 'shbg_tanner1', when: { tanner: 1 },
          low: 60, high: 100, context_pl: 'Tanner I (prepubertal, mediana ~78 nmol/L)',
          source_ids: ['elmlinger_shbg_2005'] },
        { id: 'shbg_M_tanner5', when: { sex: 'M', tanner: 5 },
          low: 18, high: 38, context_pl: 'Chłopcy Tanner V (znaczny spadek w pokwitaniu)',
          source_ids: ['elmlinger_shbg_2005'] },
        { id: 'shbg_F_tanner5', when: { sex: 'F', tanner: 5 },
          low: 32, high: 60, context_pl: 'Dziewczynki Tanner V',
          source_ids: ['elmlinger_shbg_2005'] },
        // — Age-based fallback (gdy Tanner nieznany; Faza 5d). Elmlinger 2005
        //   nie podaje pełnej Tanner II–IV, więc tylko fallback prepubertalny i
        //   późnopubertalny per płeć. Pubertalny (9–14) zostawiamy do fallback
        //   default (znaczna zmienność osobnicza).
        { id: 'shbg_prepubertal_age', when: { age_min: 0.5, age_max: 9, life_stage: 'pediatric' },
          low: 60, high: 100,
          context_pl: 'Dzieci prepubertalne (0,5–9 lat, Tanner I — fallback wiek gdy Tanner nieznany)',
          source_ids: ['elmlinger_shbg_2005'] },
        { id: 'shbg_M_latepubertal_age', when: { sex: 'M', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 18, high: 38,
          context_pl: 'Chłopcy późnopubertalni (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['elmlinger_shbg_2005'] },
        { id: 'shbg_F_latepubertal_age', when: { sex: 'F', age_min: 14, age_max: 18, life_stage: 'pediatric' },
          low: 32, high: 60,
          context_pl: 'Dziewczynki późnopubertalne (14–18 lat, Tanner V — fallback wiek gdy Tanner nieznany)',
          source_ids: ['elmlinger_shbg_2005'] },
        // Dorośli (Mayo)
        { id: 'shbg_male_adult', when: { sex: 'M', life_stage: 'adult' },
          low: 10, high: 57, context_pl: 'Mężczyźni dorośli',
          source_ids: ['mayo_test_shbg', 'elmlinger_shbg_2005'] },
        { id: 'shbg_female_adult', when: { sex: 'F', life_stage: 'adult' },
          low: 18, high: 144, context_pl: 'Kobiety dorosłe, nieciężarne (znacznie wyższe niż u M, estrogen-stymulowane)',
          source_ids: ['mayo_test_shbg', 'elmlinger_shbg_2005'] },
        { id: 'shbg_default', when: {}, default: true,
          low: 10, high: 144, context_pl: 'Dorośli, zakres ogólny',
          source_ids: ['mayo_test_shbg'] }
      ],
      ranges_pl: [
        'Tanner I (prepubertal): mediana ~78 nmol/L (60–100)',
        'Tanner V: M 18–38 (znaczny spadek), F 32–60 nmol/L',
        'Mężczyźni dorośli: 10–57 nmol/L',
        'Kobiety dorosłe nieciężarne: 18–144 nmol/L',
        'Niskie SHBG u M (Mayo cutoff < 13,3): zespół metaboliczny / insulinooporność',
        'Niskie SHBG u K ≤ 46 lat (< 18,2): hiperandrogenizm/PCOS',
        'Wysokie SHBG: hipertyreoza, ciąża, estrogeny terapeutyczne, doustna antykoncepcja',
        'FAI = T całk. × 100 / SHBG (jednostki nmol/L); FAI > 5 = biochemiczny hiperandrogenizm (ES 2018 Martin, hirsutyzm/PCOS)',
        'Wolny T u mężczyzn: obliczany wzorem Vermeulena z T całkowitego + SHBG + albuminy (ES 2018 Bhasin, hipogonadyzm)'
      ],
      notes_pl: {
        sections: [
          {
            title: 'Najważniejsze',
            open: true,
            body: 'SHBG (sex hormone binding globulin) — białko transportujące testosteron i estradiol we krwi. Stężenie wyższe u kobiet (estrogen-stymulowane). Klinicznie używane do obliczenia wolnego / biodostępnego testosteronu wzorem Vermeulena (1999 JCEM, kalkulatory online — wymaga T całkowitego + SHBG + albuminy).'
          },
          {
            title: 'Kiedy oznaczać SHBG (ES 2018 Bhasin)',
            body: 'U mężczyzn z testosteronem całkowitym na granicy normy lub w stanach zmieniających SHBG (Bhasin ES 2018, hipogonadyzm męski, Tabela 2) — bez SHBG nie można poprawnie ocenić frakcji biologicznie aktywnej.'
          },
          {
            title: 'Stany obniżające SHBG (zaniżają T całkowity)',
            body: [
              { items: [
                'Otyłość, cukrzyca typu 2, zespół metaboliczny (insulinooporność hamuje syntezę SHBG w wątrobie).',
                'Niedoczynność tarczycy.',
                'Glikokortykosteroidy, progestyny, sterydy anaboliczne.',
                'Niedożywienie.',
                'Akromegalia.'
              ]}
            ]
          },
          {
            title: 'Stany podwyższające SHBG (zawyżają T całkowity)',
            body: [
              { items: [
                'Starszy wiek.',
                'Marskość wątroby.',
                'Nadczynność tarczycy.',
                'Leki przeciwpadaczkowe.',
                'Estrogeny — doustna antykoncepcja, HRT.',
                'HIV, hiperestrogenizm.',
                'Ciąża — SHBG rośnie 3–10× przez estrogeny → interpretacja T u ciężarnych wymaga uwzględnienia SHBG.'
              ]}
            ]
          },
          {
            title: 'FAI — czulszy parametr u kobiet z PCOS',
            body: 'ES 2018 Martin (hirsutyzm/PCOS): FAI (Free Androgen Index) = T całk. × 100 / SHBG. FAI > 5 = biochemiczny hiperandrogenizm. Czulszy niż sam testosteron całkowity u kobiet z PCOS, gdzie SHBG jest fizjologicznie obniżona przez insulinooporność.'
          }
        ]
      },
      sources: ['Mayo Clinic Labs', 'Elmlinger 2005', 'ES 2018 Bhasin (hipogonadyzm M)', 'ES 2018 Martin (hirsutyzm)', 'Vermeulen 1999 JCEM']
    }
  ];

  // ────────────────────────────────────────────────────────────────
  //  Eksport (UMD-light – globalny obiekt i opcjonalny module.exports)
  // ────────────────────────────────────────────────────────────────
  var api = {
    list: function () { return SUBSTANCES.slice(); },
    find: function (id) {
      for (var i = 0; i < SUBSTANCES.length; i++) {
        if (SUBSTANCES[i].id === id) return SUBSTANCES[i];
      }
      return null;
    },
    groups: function () {
      var seen = {};
      var out = [];
      for (var i = 0; i < SUBSTANCES.length; i++) {
        var g = SUBSTANCES[i].group;
        if (!seen[g]) { seen[g] = true; out.push(g); }
      }
      return out;
    },
    sources: function () { return SOURCES; },
    findSource: function (id) { return SOURCES[id] || null; },
    version: '2.0.0'
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.LabUnitsData = api;
})(typeof window !== 'undefined' ? window : this);
