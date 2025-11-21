/*
 * bp_module.js
 *
 * Ten moduł rozszerza aplikację Waga i wzrost o kalkulator ciśnienia
 * tętniczego (RR) dla dzieci. Po wprowadzeniu wartości ciśnienia skurczowego
 * i rozkurczowego oraz na podstawie wieku, płci i wzrostu dziecka,
 * skrypt oblicza z‑score i centyl ciśnienia zgodnie z równaniami
 * używanymi w projekcie OLAF (NHBPEP). Następnie klasyfikuje wynik
 * jako prawidłowy, wysokie prawidłowe (pre‑nadciśnienie), nadciśnienie
 * I stopnia lub nadciśnienie II stopnia. Interpretacja oparta jest
 * na rekomendacjach Polskiego Towarzystwa Nefrologii Dziecięcej i
 * wytycznych projektu OLAF【406665779894020†L189-L196】【513381906970854†L478-L495】.
 */

(function() {
  // Stałe dla centyli rozkładu normalnego
  const Z90  = 1.281552;    // 90. centyl
  const Z95  = 1.644854;    // 95. centyl (≈1.645)
  const Z99  = 2.326348;    // 99. centyl

  // Aproksymacja dystrybuanty standardowego rozkładu normalnego.
  // Źródło: podstawowa wersja metody Abramowitza i Steguna.
  function normCdf(z) {
    const b1=0.319381530, b2=-0.356563782, b3=1.781477937, b4=-1.821255978, b5=1.330274429;
    const p=0.2316419;
    const t = 1 / (1 + p * Math.abs(z));
    const poly = (((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t);
    const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    const cdf = 1 - phi * poly;
    return (z >= 0) ? cdf : 1 - cdf;
  }

  // Dane równania NHBPEP dla chłopców i dziewczynek.
  // Każdy obiekt zawiera współczynniki: alpha (α), beta1..beta4 (β1..β4),
  // gamma1..gamma4 (γ1..γ4) oraz sigma (σ) – odchylenie standardowe.
  const NHBPEP_BOYS = {
    SBP: {
      alpha: 102.19768,
      beta1:  1.82416,
      beta2:  0.12776,
      beta3:  0.00249,
      beta4: -0.00135,
      gamma1:  2.73157,
      gamma2: -0.19618,
      gamma3: -0.04659,
      gamma4:  0.00947,
      sigma: 10.7128
    },
    DBP: {
      alpha: 61.01217,
      beta1:  0.68314,
      beta2: -0.09835,
      beta3:  0.01711,
      beta4:  0.00045,
      gamma1:  1.46993,
      gamma2: -0.07849,
      gamma3: -0.03144,
      gamma4:  0.00967,
      sigma: 11.6032
    }
  };
  const NHBPEP_GIRLS = {
    SBP: {
      alpha: 102.01027,
      beta1:  1.94397,
      beta2:  0.00598,
      beta3: -0.00789,
      beta4: -0.00059,
      gamma1:  2.03526,
      gamma2:  0.02534,
      gamma3: -0.01884,
      gamma4:  0.00121,
      sigma: 10.4855
    },
    DBP: {
      alpha: 60.50510,
      beta1:  1.01301,
      beta2:  0.01157,
      beta3:  0.00424,
      beta4: -0.00137,
      gamma1:  1.16641,
      gamma2:  0.12795,
      gamma3: -0.03869,
      gamma4: -0.00079,
      sigma: 10.95730
    }
  };

  /*
   * Dane OLAF dla ciśnienia skurczowego i rozkurczowego u chłopców i dziewcząt w wieku 7–18 lat.
   * Każdy obiekt zawiera słowniki percentyli dla SBP i DBP. Klucze percentylowe reprezentują wartości
   * procentowe (np. 1, 5, 10, 25, 50, 75, 90, 95, 99) a wartości to odpowiadające im ciśnienia w mm Hg.
   * Dane zostały wyodrębnione z plików Excela i są wykorzystywane do interpolacji procentylowej.
   * Jeśli wiek dziecka znajduje się pomiędzy dwoma kluczami wieku, wartości są interpolowane liniowo.
   */
  const OLAF_PERCENTILES = [1, 5, 10, 25, 50, 75, 90, 95, 99];
  const OLAF_BP_BOYS = {
    7: { SBP: {1:83,5:88,10:91,25:96,50:101,75:107,90:113,95:117,99:124},
         DBP: {1:43,5:47,10:50,25:54,50:59,75:64,90:68,95:71,99:77} },
    8: { SBP: {1:84,5:89,10:92,25:97,50:102,75:108,90:114,95:118,99:125},
         DBP: {1:44,5:48,10:50,25:55,50:59,75:64,90:69,95:72,99:78} },
    9: { SBP: {1:85,5:90,10:93,25:98,50:103,75:110,90:116,95:119,99:126},
         DBP: {1:44,5:49,10:51,25:55,50:60,75:65,90:70,95:73,99:78} },
    10:{ SBP: {1:85,5:91,10:94,25:99,50:105,75:111,90:117,95:121,99:128},
         DBP: {1:44,5:49,10:51,25:56,50:61,75:66,90:70,95:73,99:79} },
    11:{ SBP: {1:86,5:92,10:95,25:100,50:106,75:112,90:118,95:122,99:129},
         DBP: {1:45,5:49,10:52,25:56,50:61,75:66,90:71,95:74,99:79} },
    12:{ SBP: {1:87,5:93,10:96,25:101,50:107,75:114,90:120,95:124,99:132},
         DBP: {1:45,5:50,10:52,25:56,50:61,75:66,90:71,95:74,99:80} },
    13:{ SBP: {1:89,5:95,10:98,25:104,50:110,75:117,90:123,95:127,99:135},
         DBP: {1:46,5:50,10:53,25:57,50:62,75:67,90:72,95:75,99:81} },
    14:{ SBP: {1:92,5:98,10:101,25:107,50:113,75:120,90:127,95:131,99:139},
         DBP: {1:46,5:51,10:53,25:58,50:63,75:68,90:73,95:76,99:82} },
    15:{ SBP: {1:94,5:100,10:104,25:110,50:117,75:124,90:131,95:135,99:144},
         DBP: {1:47,5:52,10:55,25:59,50:64,75:69,90:74,95:77,99:83} },
    16:{ SBP: {1:95,5:102,10:105,25:111,50:118,75:126,90:133,95:138,99:147},
         DBP: {1:48,5:53,10:55,25:60,50:65,75:71,90:76,95:79,99:85} },
    17:{ SBP: {1:96,5:103,10:106,25:112,50:120,75:127,90:135,95:139,99:148},
         DBP: {1:49,5:53,10:56,25:60,50:66,75:71,90:76,95:79,99:85} },
    18:{ SBP: {1:97,5:103,10:107,25:113,50:121,75:128,90:136,95:140,99:150},
         DBP: {1:49,5:54,10:56,25:61,50:66,75:72,90:77,95:80,99:86} }
  };
  const OLAF_BP_GIRLS = {
    7: { SBP: {1:82,5:87,10:90,25:95,50:101,75:107,90:113,95:117,99:125},
         DBP: {1:43,5:48,10:50,25:55,50:60,75:65,90:69,95:72,99:78} },
    8: { SBP: {1:83,5:88,10:91,25:96,50:102,75:109,90:115,95:119,99:126},
         DBP: {1:44,5:48,10:51,25:55,50:60,75:65,90:70,95:73,99:78} },
    9: { SBP: {1:84,5:90,10:93,25:98,50:104,75:110,90:116,95:120,99:128},
         DBP: {1:44,5:49,10:51,25:56,50:61,75:66,90:71,95:73,99:79} },
    10:{ SBP: {1:86,5:91,10:94,25:99,50:105,75:112,90:118,95:122,99:130},
         DBP: {1:45,5:50,10:52,25:56,50:61,75:66,90:71,95:74,99:79} },
    11:{ SBP: {1:87,5:93,10:96,25:101,50:107,75:114,90:120,95:124,99:132},
         DBP: {1:46,5:50,10:53,25:57,50:62,75:67,90:72,95:75,99:80} },
    12:{ SBP: {1:89,5:94,10:97,25:103,50:109,75:116,90:122,95:127,99:135},
         DBP: {1:46,5:51,10:54,25:58,50:63,75:68,90:73,95:75,99:81} },
    13:{ SBP: {1:90,5:96,10:99,25:104,50:111,75:118,90:125,95:129,99:137},
         DBP: {1:47,5:52,10:54,25:59,50:64,75:69,90:73,95:76,99:82} },
    14:{ SBP: {1:91,5:97,10:100,25:106,50:112,75:119,90:126,95:130,99:139},
         DBP: {1:48,5:53,10:55,25:59,50:64,75:69,90:74,95:77,99:82} },
    15:{ SBP: {1:92,5:97,10:101,25:106,50:113,75:120,90:127,95:131,99:139},
         DBP: {1:48,5:53,10:56,25:60,50:65,75:70,90:74,95:77,99:83} },
    16:{ SBP: {1:92,5:98,10:101,25:106,50:113,75:120,90:127,95:131,99:139},
         DBP: {1:49,5:53,10:56,25:60,50:65,75:70,90:74,95:77,99:83} },
    17:{ SBP: {1:92,5:97,10:101,25:106,50:113,75:120,90:127,95:131,99:139},
         DBP: {1:49,5:54,10:56,25:60,50:65,75:70,90:75,95:77,99:83} },
    18:{ SBP: {1:92,5:97,10:100,25:106,50:112,75:119,90:126,95:130,99:139},
         DBP: {1:50,5:54,10:57,25:61,50:65,75:70,90:75,95:78,99:83} }
  };

  /**
   * Interpoluje wartości percentylowe ciśnienia dla danego wieku (może być niecałkowity).
   * @param {Object} dataset Słownik OLAF_BP_BOYS lub OLAF_BP_GIRLS.
   * @param {number} ageYears Wiek w latach.
   * @returns {Object} Obiekt z polami SBP i DBP zawierającymi interpolowane wartości percentylowe.
   */
  function getOlafValues(dataset, ageYears) {
    const ages = Object.keys(dataset).map(a => parseFloat(a)).sort((a,b) => a-b);
    const minAge = ages[0];
    const maxAge = ages[ages.length-1];
    let lowerAge = Math.floor(ageYears);
    let upperAge = Math.ceil(ageYears);
    if (ageYears <= minAge) lowerAge = upperAge = minAge;
    if (ageYears >= maxAge) lowerAge = upperAge = maxAge;
    if (!dataset[String(lowerAge)] || !dataset[String(upperAge)]) {
      lowerAge = upperAge = ages[0];
    }
    const lower = dataset[String(lowerAge)];
    const upper = dataset[String(upperAge)];
    if (lowerAge === upperAge) {
      return JSON.parse(JSON.stringify(lower));
    }
    const ratio = (ageYears - lowerAge) / (upperAge - lowerAge);
    const interp = { SBP: {}, DBP: {} };
    OLAF_PERCENTILES.forEach(p => {
      const pStr = String(p);
      const sLow = lower.SBP[pStr], sUp = upper.SBP[pStr];
      interp.SBP[pStr] = sLow + (sUp - sLow) * ratio;
      const dLow = lower.DBP[pStr], dUp = upper.DBP[pStr];
      interp.DBP[pStr] = dLow + (dUp - dLow) * ratio;
    });
    return interp;
  }

  /**
   * Szacuje centyl dla danej wartości na podstawie uporządkowanej listy percentyli i odpowiadających im wartości ciśnienia.
   * @param {number} val Wartość ciśnienia (SBP lub DBP).
   * @param {number[]} percents Tablica percentyli (np. [1,5,10,...]).
   * @param {number[]} values Tablica wartości ciśnienia odpowiadająca tym percentylom.
   * @returns {number} Oszacowany percentyl.
   */
  function estimatePercentile(val, percents, values) {
    if (val <= values[0]) return percents[0];
    if (val >= values[values.length - 1]) return percents[values.length - 1];
    for (let i = 1; i < values.length; i++) {
      if (val <= values[i]) {
        const v0 = values[i - 1], v1 = values[i];
        const p0 = percents[i - 1], p1 = percents[i];
        const ratio = (val - v0) / (v1 - v0);
        return p0 + ratio * (p1 - p0);
      }
    }
    return percents[0];
  }

  // Definicje i źródło norm ciśnienia
  // Tekst ten jest wstawiany pod wynikami, aby użytkownik miał świadomość,
  // na jakich wartościach opiera się klasyfikacja. Zawiera skrócone
  // definicje stanów: prawidłowe, wysokie prawidłowe, nadciśnienie 1. i 2. stopnia.
  // Źródło: Wytyczne Europejskiego Towarzystwa Nadciśnienia Tętniczego (ESH) dla dzieci i
  // młodzieży, przedstawione w artykule „Nadciśnienie tętnicze u dzieci i młodzieży”
  // opublikowanym w czasopiśmie „Choroby Serca i Naczyń” (2010)【383313272884727†L155-L167】.
  // Definicje ciśnienia dla poszczególnych stanów (bez cytowań w treści).
  const BP_DEFINITIONS = {
    normal: 'Prawidłowe ciśnienie – skurczowe i rozkurczowe BP poniżej 90. centyla dla wieku, płci i wzrostu.',
    high:   'Wysokie prawidłowe (pre‑nadciśnienie) – wartości od 90. do poniżej 95. centyla lub ≥ 120/80 mm Hg u nastolatków.',
    stage1:'Nadciśnienie I stopnia – wartości skurczowego lub rozkurczowego BP w zakresie 95.–99. centyla plus 5 mm Hg.',
    stage2:'Nadciśnienie II stopnia – wartości przekraczające 99. centyl plus więcej niż 5 mm Hg.'
  };
  // Stały opis źródła dla wszystkich wyników.
  const BP_SOURCE_HTML = '<p class="source-note">Źródło: Wytyczne Europejskiego Towarzystwa Nadciśnienia Tętniczego (ESH)</p>';

  /**
   * Oblicza przewidywaną średnią ciśnienia (µ) na podstawie wieku (lata),
   * wzrostu (z‑score) i współczynników NHBPEP.
   * @param {number} ageYears Wiek dziecka w latach.
   * @param {number} zht Wartość Z‑score wzrostu (zht).
   * @param {Object} coeff Obiekt współczynników (SBP lub DBP).
   * @returns {number}
   */
  function predictBPMean(ageYears, zht, coeff) {
    // Równanie opisane w arkuszu NHBPEP: α + β1*(a) + β2*(a^2) + β3*(a^3) + β4*(a^4)
    //                                + γ1*(z) + γ2*(z^2) + γ3*(z^3) + γ4*(z^4), gdzie a = (wiek - 10).
    const a = ageYears - 10;
    const z = zht;
    const a2 = a * a;
    const a3 = a2 * a;
    const a4 = a3 * a;
    const z2 = z * z;
    const z3 = z2 * z;
    const z4 = z3 * z;
    return coeff.alpha
      + coeff.beta1 * a
      + coeff.beta2 * a2
      + coeff.beta3 * a3
      + coeff.beta4 * a4
      + coeff.gamma1 * z
      + coeff.gamma2 * z2
      + coeff.gamma3 * z3
      + coeff.gamma4 * z4;
  }

  /**
   * Oblicza z‑score ciśnienia na podstawie obserwacji, przewidywanej średniej i odchylenia.
   * @param {number} observed Wartość zmierzona (np. SBP lub DBP).
   * @param {number} mu Przewidywana średnia (µ).
   * @param {number} sigma Odchylenie standardowe (σ).
   * @returns {number}
   */
  function zscore(observed, mu, sigma) {
    if (!observed || !sigma || !isFinite(observed) || !isFinite(mu) || !isFinite(sigma)) return NaN;
    return (observed - mu) / sigma;
  }

  /**
   * Oblicza Z‑score wzrostu (Zht) na podstawie danych LMS. Korzysta z funkcji
   * getLMSHeightHybrid zdefiniowanej w głównym pliku app.js. W razie jej braku
   * próbuje użyć getLMSFromDataset i globalnych tabel LMS_HEIGHT_BOYS/LMS_HEIGHT_GIRLS.
   * @param {string} sex Płeć ('M' lub 'F').
   * @param {number} ageMonths Wiek w miesiącach.
   * @param {number} heightCm Wzrost w cm.
   * @returns {number|undefined} Zht lub undefined, jeśli brakuje danych.
   */
  function computeHeightZ(sex, ageMonths, heightCm) {
    try {
      // Preferujemy funkcję hybrydową, która wybiera WHO dla wieku <3 lat i OLAF dla ≥3 lat.
      if (typeof getLMSHeightHybrid === 'function') {
        const params = getLMSHeightHybrid(sex, ageMonths);
        if (params && params.length === 3) {
          const [L, M, S] = params;
          if (M > 0 && S > 0 && heightCm > 0) {
            if (L === 0) {
              return Math.log(heightCm / M) / S;
            }
            return (Math.pow(heightCm / M, L) - 1) / (L * S);
          }
        }
      }
      // Jeśli hybryda nie istnieje, spróbuj użyć getLMSFromDataset.
      if (typeof getLMSFromDataset === 'function' && (typeof LMS_HEIGHT_BOYS !== 'undefined')) {
        const dataset = sex === 'M' ? LMS_HEIGHT_BOYS : LMS_HEIGHT_GIRLS;
        const params = getLMSFromDataset(dataset, ageMonths);
        if (params && params.length === 3) {
          const [L, M, S] = params;
          if (M > 0 && S > 0 && heightCm > 0) {
            if (L === 0) {
              return Math.log(heightCm / M) / S;
            }
            return (Math.pow(heightCm / M, L) - 1) / (L * S);
          }
        }
      }
    } catch(e) {
      console.error('Nie można obliczyć Zht:', e);
    }
    return undefined;
  }

  /**
   * Aktualizuje wynik ciśnienia po zmianie któregokolwiek z pól: wiek, płeć, wzrost, SBP lub DBP.
   */
  function updateBP() {
    const resultEl = document.getElementById('bpResult');
    if (!resultEl) return;
    // Odczytaj wartości wejściowe
    const ageYears  = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : parseFloat(document.getElementById('age').value) || 0;
    const sexEl     = document.getElementById('sex');
    const sex       = sexEl ? sexEl.value : 'M';
    const heightCm  = parseFloat(document.getElementById('height')?.value);
    const sbp       = parseFloat(document.getElementById('bpSystolic')?.value);
    const dbp       = parseFloat(document.getElementById('bpDiastolic')?.value);

    // Ustal widoczność i stan przełącznika OLAF/NHBPEP. Dla wieku 7–18 lat pokazujemy suwak.
    const toggleContainer = document.getElementById('bpToggleContainer');
    const bpToggle = document.getElementById('bpDataToggle');
    let datasetChoice = 'NHBPEP';
    const showToggle = (typeof ageYears === 'number' && !isNaN(ageYears) && ageYears >= 7 && ageYears <= 18);
    if (toggleContainer) {
      toggleContainer.style.display = showToggle ? 'flex' : 'none';
    }
    if (showToggle && bpToggle) {
      // Jeśli użytkownik nie zmienił ręcznie suwaka, ustaw domyślnie OLAF (niezaznaczony)
      if (!bpToggle.dataset.manual) {
        bpToggle.checked = false;
      }
      // Suwak w pozycji nieoznaczonej oznacza OLAF, w pozycji zaznaczonej – NHBPEP.
      datasetChoice = bpToggle.checked ? 'NHBPEP' : 'OLAF';
    } else {
      datasetChoice = 'NHBPEP';
    }
    // Jeżeli brakuje niezbędnych danych, pokaż komunikat zachęcający do wprowadzenia pomiarów
    if (!ageYears || !heightCm || !sbp || !dbp || !isFinite(ageYears) || !isFinite(heightCm)) {
      // Reset klas ostrzegawczych
      clearPulse(resultEl);
      resultEl.className = 'result-box';
      resultEl.classList.remove('rr-warning', 'rr-danger');
      // Wyświetl instrukcję zamiast pustego pola
      resultEl.innerHTML = '<p class="bp-placeholder">Wpisz wartości ciśnienia skurczowego i rozkurczowego powyżej, aby zobaczyć wynik.</p>';
      return;
    }
    // Zakres wiekowy dla norm OLAF: 3–18 lat (36–216 mies.). Jeśli poza zakresem, informujemy
    if (ageYears * 12 < 36 || ageYears * 12 > 216) {
      resultEl.innerHTML = '<p>Normy ciśnienia są dostępne dla wieku 3–18&nbsp;lat.</p>';
      clearPulse(resultEl);
      resultEl.className = 'result-box';
      return;
    }
    // Oblicz z‑score dla wzrostu
    const ageMonths = ageYears * 12;
    const zht = computeHeightZ(sex, ageMonths, heightCm);
    if (typeof zht !== 'number' || isNaN(zht)) {
      resultEl.innerHTML = '<p>Brak danych do obliczenia centyla (błąd wzrostu).</p>';
      clearPulse(resultEl);
      resultEl.className = 'result-box';
      return;
    }
    // Oblicz percentyle i progi zależnie od wybranego zestawu (OLAF lub NHBPEP)
    let percSbp, percDbp;
    let p90Sbp, p95Sbp, p99Sbp, p99Plus5Sbp;
    let p90Dbp, p95Dbp, p99Dbp, p99Plus5Dbp;
    // Z‑score do prezentacji w trybie profesjonalnym. Dla OLAF wyliczamy
    // przybliżenie, dla NHBPEP korzystamy bezpośrednio z regresji.
    let zSbpVal, zDbpVal;
    if (datasetChoice === 'OLAF') {
      // Dane OLAF – obliczamy na podstawie tabel percentylowych
      const dataset = (sex === 'M') ? OLAF_BP_BOYS : OLAF_BP_GIRLS;
      const olafVals = getOlafValues(dataset, ageYears);
      const percents = OLAF_PERCENTILES;
      const sbpVals = percents.map(p => olafVals.SBP[String(p)]);
      const dbpVals = percents.map(p => olafVals.DBP[String(p)]);
      percSbp = estimatePercentile(sbp, percents, sbpVals);
      percDbp = estimatePercentile(dbp, percents, dbpVals);
      // Progi dla klasyfikacji
      p90Sbp = olafVals.SBP['90'];
      p95Sbp = olafVals.SBP['95'];
      p99Sbp = olafVals.SBP['99'];
      p99Plus5Sbp = p99Sbp + 5;
      p90Dbp = olafVals.DBP['90'];
      p95Dbp = olafVals.DBP['95'];
      p99Dbp = olafVals.DBP['99'];
      p99Plus5Dbp = p99Dbp + 5;
      // Przybliżona sigma i z-score dla OLAF. Zakładamy w przybliżeniu normalny rozkład
      // symetryczny wokół mediany. Używamy percentyli 10 i 90 do oszacowania odchylenia.
      const p10Sbp = olafVals.SBP['10'];
      const p50Sbp = olafVals.SBP['50'];
      const p90SbpTemp = p90Sbp;
      const p10Dbp = olafVals.DBP['10'];
      const p50Dbp = olafVals.DBP['50'];
      const p90DbpTemp = p90Dbp;
      // Jeżeli różnice są dodatnie, oblicz sigma jako pół różnicy 10.–90. centyla podzielonej przez 1.28155.
      // W przypadku rozkładu normalnego 90. centyl jest oddalony od 10. o 2*1.28155 odchylenia standardowego.
      const sigmaSbp = (p90SbpTemp - p10Sbp) / (2 * Z90);
      const sigmaDbp = (p90DbpTemp - p10Dbp) / (2 * Z90);
      if (sigmaSbp && isFinite(sigmaSbp) && sigmaSbp > 0) {
        zSbpVal = (sbp - p50Sbp) / sigmaSbp;
      } else {
        zSbpVal = NaN;
      }
      if (sigmaDbp && isFinite(sigmaDbp) && sigmaDbp > 0) {
        zDbpVal = (dbp - p50Dbp) / sigmaDbp;
      } else {
        zDbpVal = NaN;
      }
    } else {
      // Dane NHBPEP – korzystamy z równania regresji zależnego od wieku i z-score wzrostu
      const coeffs = (sex === 'M') ? NHBPEP_BOYS : NHBPEP_GIRLS;
      const muSbp = predictBPMean(ageYears, zht, coeffs.SBP);
      const muDbp = predictBPMean(ageYears, zht, coeffs.DBP);
      const sdSbp = coeffs.SBP.sigma;
      const sdDbp = coeffs.DBP.sigma;
      const zSbp = zscore(sbp, muSbp, sdSbp);
      const zDbp = zscore(dbp, muDbp, sdDbp);
      percSbp = normCdf(zSbp) * 100;
      percDbp = normCdf(zDbp) * 100;
      p90Sbp = muSbp + Z90 * sdSbp;
      p95Sbp = muSbp + Z95 * sdSbp;
      p99Sbp = muSbp + Z99 * sdSbp;
      p99Plus5Sbp = p99Sbp + 5;
      p90Dbp = muDbp + Z90 * sdDbp;
      p95Dbp = muDbp + Z95 * sdDbp;
      p99Dbp = muDbp + Z99 * sdDbp;
      p99Plus5Dbp = p99Dbp + 5;
      // Z‑score do prezentacji równe obliczonym wartościom
      zSbpVal = zSbp;
      zDbpVal = zDbp;
    }
    // Zapisz obliczone wartości do zmiennych globalnych, aby można było wykorzystać je w podsumowaniu metabolicznym.
    if (typeof window !== 'undefined') {
      window.percSbp = (typeof percSbp === 'number' && isFinite(percSbp)) ? percSbp : undefined;
      window.percDbp = (typeof percDbp === 'number' && isFinite(percDbp)) ? percDbp : undefined;
      window.zSbp   = (typeof zSbpVal === 'number' && isFinite(zSbpVal)) ? zSbpVal : undefined;
      window.zDbp   = (typeof zDbpVal === 'number' && isFinite(zDbpVal)) ? zDbpVal : undefined;
    }
    // Klasyfikacja oparta na wartościach bezwzględnych (mm Hg)
    let severity = 'normal';
    // Sprawdź nadciśnienie II stopnia (>99. centyla + 5 mm Hg)
    if (sbp >= p99Plus5Sbp || dbp >= p99Plus5Dbp) {
      severity = 'stage2';
    } else if (sbp >= p95Sbp || dbp >= p95Dbp) {
      // Nadciśnienie I stopnia (≥95. centyla). Rozróżniamy czy jest bliżej 99.
      if (sbp >= p99Sbp || dbp >= p99Dbp) {
        severity = 'stage1';
      } else {
        severity = 'stage1';
      }
    } else if (sbp >= p90Sbp || dbp >= p90Dbp || sbp >= 120 || dbp >= 80) {
      // Wysokie prawidłowe: 90.–95. centyl lub przekroczenie 120/80 mm Hg
      severity = 'high';
    } else {
      severity = 'normal';
    }
    // Zbuduj tekst wyniku
    const formatCent = (p) => {
      if (p < 1) return '&lt;1';
      if (p > 99) return '&gt;99';
      return Math.round(p);
    };
    let resultHtml = '';
    // Określ, czy aplikacja działa w trybie profesjonalnym. Zmienna globalna
    // professionalMode jest ustawiana w app.js; używamy też właściwości window
    // w razie braku dostępu.
    const isPro = (typeof professionalMode !== 'undefined' && professionalMode) || (typeof window !== 'undefined' && window.professionalMode);
    // Składamy linie wyników, dołączając Z‑score tylko w trybie profesjonalnym
    let sbpLine = `Ciśnienie skurczowe: <strong>${sbp.toFixed(0)}&nbsp;mm&nbsp;Hg</strong> – ${formatCent(percSbp)}. centyl`;
    if (isPro && typeof zSbpVal === 'number' && !isNaN(zSbpVal)) {
      sbpLine += ` (Z‑score = ${zSbpVal.toFixed(2)})`;
    }
    let dbpLine = `Ciśnienie rozkurczowe: <strong>${dbp.toFixed(0)}&nbsp;mm&nbsp;Hg</strong> – ${formatCent(percDbp)}. centyl`;
    if (isPro && typeof zDbpVal === 'number' && !isNaN(zDbpVal)) {
      dbpLine += ` (Z‑score = ${zDbpVal.toFixed(2)})`;
    }
    resultHtml += `<p>${sbpLine}</p>`;
    resultHtml += `<p>${dbpLine}</p>`;
    let interp = '';
    if (severity === 'normal') {
      interp = 'Ciśnienie w normie.';
    } else if (severity === 'high') {
      interp = 'Ciśnienie wysokie prawidłowe (pre‑nadciśnienie).';
    } else if (severity === 'stage1') {
      interp = 'Nadciśnienie I stopnia.';
    } else if (severity === 'stage2') {
      interp = 'Nadciśnienie II stopnia.';
    }
    resultHtml += `<p><strong>${interp}</strong></p>`;
    // Dodaj definicję odpowiadającą klasyfikacji oraz źródło – zawsze, gdy pojawiają się wyniki
    const definition = BP_DEFINITIONS[severity];
    if (definition) {
      resultHtml += `<div class="bp-definition"><p>${definition}</p>${BP_SOURCE_HTML}</div>`;
    } else {
      // Jeśli z jakiegoś powodu definicji brak, nadal pokaż źródło
      resultHtml += BP_SOURCE_HTML;
    }
    resultEl.innerHTML = resultHtml;
    // Ustaw klasy i animacje ostrzegawcze zgodnie z powagą wyniku
    // Najpierw usuń dotychczasowe klasy pulsacji
    clearPulse(resultEl);
    // Przywróć klasę bazową result-box, aby zachować styl tła/ramki
    // i usuń ewentualne klasy rr-warning/rr-danger z poprzedniego obliczenia
    resultEl.className = 'result-box';
    resultEl.classList.remove('rr-warning', 'rr-danger');
    if (severity === 'high') {
      // Zastosuj ciemnopomarańczową ramkę i pulsowanie dla stanu wysokiego prawidłowego
      resultEl.classList.add('rr-warning');
      applyPulse(resultEl, 'warning');
    } else if (severity === 'stage1' || severity === 'stage2') {
      // Zastosuj czerwoną ramkę i pulsowanie dla nadciśnienia
      resultEl.classList.add('rr-danger');
      applyPulse(resultEl, 'danger');
    }
  }

  // Funkcja inicjalizacyjna: podłącza nasłuchiwacze zdarzeń do odpowiednich pól.
  function initBPModule() {
    const sbpInput = document.getElementById('bpSystolic');
    const dbpInput = document.getElementById('bpDiastolic');
    // Jeżeli elementy nie istnieją, nie uruchamiaj modułu
    if (!sbpInput || !dbpInput) return;
    const attach = (el, event) => {
      if (el) el.addEventListener(event, updateBP);
    };
    attach(sbpInput, 'input');
    attach(dbpInput, 'input');
    // Aktualizuj wynik również po zmianie wieku, miesięcy, płci i wzrostu oraz po zmianie suwaka OLAF/NHBPEP
    attach(document.getElementById('age'), 'input');
    attach(document.getElementById('ageMonths'), 'input');
    attach(document.getElementById('sex'), 'change');
    attach(document.getElementById('height'), 'input');
    attach(document.getElementById('bpDataToggle'), 'change');
    // Aktualizuj wynik ciśnienia również po zmianie trybu wyników (standardowy/profesjonalny).
    // Dzięki temu Z‑score będzie pokazywany lub ukrywany natychmiast po przełączeniu.
    const resultsToggle = document.getElementById('resultsModeToggle');
    if (resultsToggle) {
      resultsToggle.addEventListener('change', updateBP);
    }
    // Wywołaj inicjalne obliczenie (na wypadek wczytanych wartości)
    updateBP();
  }

  // Inicjalizujemy moduł po załadowaniu DOM
  document.addEventListener('DOMContentLoaded', initBPModule);

  // Ustaw flagę manual po zmianie suwaka bpDataToggle, aby zapobiec nadpisywaniu wyboru użytkownika
  document.addEventListener('DOMContentLoaded', function() {
    const bpToggle = document.getElementById('bpDataToggle');
    if (bpToggle) {
      bpToggle.addEventListener('change', function() {
        this.dataset.manual = '1';
      });
    }
  });
})();