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
  // Źródło dla centyli tętna i liczby oddechów.  W nowej wersji korzystamy
  // z danych Bonafide et al. 2013 (hospitalizowane dzieci) skorygowanych
  // o wyniki Daymont et al. 2015 (wpływ gorączki), Nijman et al. 2012
  // (częstość oddechu u dzieci z gorączką) oraz Herbert et al. 2020
  // (różnice RR w czuwaniu i śnie).  Ta nota jest dołączana do
  // wyników tętna.
  // Źródła dla interpretacji tętna w module BP.
  // Fleming 2011 – siatki centylowe dla populacji zdrowej;
  // Bonafide 2013 – hospitalizowane dzieci;
  // Daymont 2015 – korekta temperatury dla tętna.
  const HR_SOURCE_HTML = '<p class="source-note">Źródło: Fleming et al. 2011, Bonafide et al. 2013, Daymont et al. 2015</p>';

  /**
   * Buduje dynamiczny tekst źródłowy dla tętna w zależności od wybranych opcji.
   * Jeśli użytkownik wybierze populację ambulatoryjną (healthy) lub szpitalną (hospital)
   * oraz wprowadzi temperaturę, funkcja zwróci opis zastosowanych źródeł i korekt.
   * @param {Object} opts
   * @param {string} opts.population 'healthy' lub 'hospital'
   * @param {number|null} opts.temperature Temperatura w °C lub null
   * @returns {string} HTML z notą źródłową
   */
  function buildHrSourceHTML(opts) {
    const baseSrc = (opts.population === 'hospital')
      ? 'Bonafide et al. 2013'
      : 'Fleming et al. 2011';
    const mods = [];
    if (opts.temperature !== undefined && opts.temperature !== null) {
      mods.push('o temperaturę (Daymont et al. 2015)');
    }
    let note = 'Źródło: ' + baseSrc;
    if (mods.length > 0) {
      note += '; wynik skorygowano ' + mods.join(' i ');
    }
    return '<p class="source-note">' + note + '</p>';
  }

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

    function clearBpGlobals() {
      if (typeof window === 'undefined') return;
      try { window.percSbp = undefined; } catch (_) {}
      try { window.percDbp = undefined; } catch (_) {}
      try { window.zSbp = undefined; } catch (_) {}
      try { window.zDbp = undefined; } catch (_) {}
    }
    // Odczytaj wartości wejściowe
    const ageYears  = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : parseFloat(document.getElementById('age').value) || 0;
    const sexEl     = document.getElementById('sex');
    const sex       = sexEl ? sexEl.value : 'M';
    const heightCm  = parseFloat(document.getElementById('height')?.value);
    const sbp       = parseFloat(document.getElementById('bpSystolic')?.value);
    const dbp       = parseFloat(document.getElementById('bpDiastolic')?.value);

    // Odczytaj liczbę uderzeń serca (tętno) i ewentualnie wylicz jego centyl.  Dodajemy wynik tętna
    // na początku raportu niezależnie od wprowadzonych wartości ciśnienia.
    const hrValue = parseFloat(document.getElementById('heartRate')?.value);
    let hrHtml = '';
    let hrPresent = false;
    let hrSourceHtml = '';
    if (hrValue && !isNaN(hrValue) && ageYears !== undefined && !isNaN(ageYears) && ageYears <= 18) {
      try {
        const vital = (typeof window !== 'undefined') ? window.vitalSigns : null;
        if (vital && typeof vital.getHrPercentile === 'function') {
          // Pobierz opcje dla tętna z UI: populacja (Ambulatoryjny vs Szpitalny) oraz temperatura ciała.
          const popEl  = document.getElementById('hrPopulation');
          const tmpEl  = document.getElementById('hrTemperature');
          const population = popEl ? popEl.value : 'healthy';
          const tempStr   = tmpEl ? tmpEl.value : '';
          const temperature = tempStr && !isNaN(parseFloat(tempStr)) ? parseFloat(tempStr) : null;
          const opts = { population };
          if (temperature !== null) opts.temperature = temperature;
          const perc = vital.getHrPercentile(ageYears, hrValue, opts);
          if (typeof perc === 'number' && !isNaN(perc)) {
            let percStr;
            if (perc < 1) {
              percStr = '&lt;1';
            } else if (perc > 99) {
              percStr = '&gt;99';
            } else {
              percStr = Math.round(perc).toString();
            }
            hrHtml = `<p>Tętno: <strong>${hrValue.toFixed(0)}&nbsp;ud./min</strong> – ${percStr}. centyl</p>`;
            hrPresent = true;

            // Zbuduj dynamiczną notę źródłową dla tętna na podstawie opcji.
            hrSourceHtml = buildHrSourceHTML(opts);
          }
        }
      } catch (_) {
        hrHtml = '';
        hrPresent = false;
        hrSourceHtml = '';
      }
    }

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
    // Jeżeli brakuje niezbędnych danych (wiek, wzrost, SBP lub DBP), pokaż komunikat zachęcający do wprowadzenia pomiarów.
    // W tej sytuacji, jeśli wprowadzono tętno, nadal prezentujemy jego centyl.
    if (!ageYears || !heightCm || !sbp || !dbp || !isFinite(ageYears) || !isFinite(heightCm)) {
      clearBpGlobals();
      clearPulse(resultEl);
      resultEl.className = 'result-box';
      resultEl.classList.remove('rr-warning', 'rr-danger');
      let html = '';
      if (hrHtml) html += hrHtml;
      html += '<p class="bp-placeholder">Wpisz wartości ciśnienia skurczowego i rozkurczowego powyżej, aby zobaczyć wynik.</p>';
      if (hrPresent) html += hrSourceHtml;
      resultEl.innerHTML = html;
      return;
    }
    // Zakres wiekowy dla norm OLAF: 3–18 lat (36–216 mies.). Jeśli poza zakresem, informujemy.
    // Wynik tętna (jeśli dostępny) jest nadal prezentowany.
    if (ageYears * 12 < 36 || ageYears * 12 > 216) {
      clearBpGlobals();
      let html = '';
      if (hrHtml) html += hrHtml;
      html += '<p>Normy ciśnienia są dostępne dla wieku 3–18&nbsp;lat.</p>';
      if (hrPresent) html += hrSourceHtml;
      resultEl.innerHTML = html;
      clearPulse(resultEl);
      resultEl.className = 'result-box';
      return;
    }
    // Oblicz z‑score dla wzrostu
    const ageMonths = ageYears * 12;
    const zht = computeHeightZ(sex, ageMonths, heightCm);
    if (typeof zht !== 'number' || isNaN(zht)) {
      clearBpGlobals();
      let html = '';
      if (hrHtml) html += hrHtml;
      html += '<p>Brak danych do obliczenia centyla (błąd wzrostu).</p>';
      if (hrPresent) html += hrSourceHtml;
      resultEl.innerHTML = html;
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
    // Dodaj wynik tętna, jeśli istnieje, przed wynikami ciśnienia
    if (hrHtml) {
      resultHtml += hrHtml;
    }
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
    // Dołącz źródło tętna (jeżeli wyświetlono tętno). W przypadku gdy pojawia się definicja BP,
    // źródło do ciśnienia jest dodane w konstrukcji definicji powyżej.
    if (hrPresent) {
      resultHtml += hrSourceHtml;
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

  /**
   * Publiczne API dla innych modułów (np. "Leczenie nadciśnienia").
   *
   * Zwraca obliczenia spójne z tym, co wyświetla karta "Ciśnienie tętnicze u dzieci":
   * - percentyle SBP/DBP (OLAF 7–18 lat lub NHBPEP 3–18 lat)
   * - progi P90/P95/P99 oraz P99+5
   * - klasyfikację: normal / high / stage1 / stage2
   *
   * @param {Object} params
   * @param {number} params.ageYears Wiek w latach (z częścią ułamkową).
   * @param {'M'|'F'} params.sex Płeć.
   * @param {number} params.heightCm Wzrost w cm.
   * @param {number} params.sbp SBP w mm Hg.
   * @param {number} params.dbp DBP w mm Hg.
   * @param {'OLAF'|'NHBPEP'} [params.datasetChoice] Wymuszenie źródła norm.
   * @returns {Object}
   */

  function getPediatricBpReference(params) {
    try {
      const ageYears = Number(params?.ageYears);
      const sex = (params?.sex || '').toUpperCase();
      const heightCm = Number(params?.heightCm);

      if (!isFinite(ageYears) || !isFinite(heightCm)) {
        return { ok: false, error: 'Brak wymaganych danych (wiek/wzrost).' };
      }
      if (!(sex === 'M' || sex === 'F')) {
        return { ok: false, error: 'Brak danych o płci (M/K).' };
      }

      const ageMonths = ageYears * 12;
      if (ageMonths < 36 || ageMonths > 216) {
        return { ok: false, error: 'Normy ciśnienia są dostępne dla wieku 3–18 lat.' };
      }

      let datasetChoice = (params?.datasetChoice || '').toUpperCase();
      if (!(datasetChoice === 'OLAF' || datasetChoice === 'NHBPEP')) {
        const showToggle = (ageYears >= 7 && ageYears <= 18);
        const bpToggle = document.getElementById('bpDataToggle');
        if (showToggle && bpToggle) {
          datasetChoice = bpToggle.checked ? 'NHBPEP' : 'OLAF';
        } else {
          datasetChoice = 'NHBPEP';
        }
      }
      if (datasetChoice === 'OLAF' && ageYears < 7) {
        datasetChoice = 'NHBPEP';
      }

      const zht = computeHeightZ(sex, ageMonths, heightCm);
      if (typeof zht !== 'number' || isNaN(zht)) {
        return { ok: false, error: 'Nie można obliczyć Z-score wzrostu (brak danych LMS).' };
      }

      let reference;
      if (datasetChoice === 'OLAF') {
        const dataset = (sex === 'M') ? OLAF_BP_BOYS : OLAF_BP_GIRLS;
        const olafVals = getOlafValues(dataset, ageYears);
        reference = {
          sbpP10: olafVals.SBP['10'],
          sbpP50: olafVals.SBP['50'],
          sbpP90: olafVals.SBP['90'],
          sbpP95: olafVals.SBP['95'],
          dbpP10: olafVals.DBP['10'],
          dbpP50: olafVals.DBP['50'],
          dbpP90: olafVals.DBP['90'],
          dbpP95: olafVals.DBP['95']
        };
      } else {
        const coeffs = (sex === 'M') ? NHBPEP_BOYS : NHBPEP_GIRLS;
        const muSbp = predictBPMean(ageYears, zht, coeffs.SBP);
        const muDbp = predictBPMean(ageYears, zht, coeffs.DBP);
        const sdSbp = coeffs.SBP.sigma;
        const sdDbp = coeffs.DBP.sigma;
        reference = {
          sbpP10: muSbp - Z90 * sdSbp,
          sbpP50: muSbp,
          sbpP90: muSbp + Z90 * sdSbp,
          sbpP95: muSbp + Z95 * sdSbp,
          dbpP10: muDbp - Z90 * sdDbp,
          dbpP50: muDbp,
          dbpP90: muDbp + Z90 * sdDbp,
          dbpP95: muDbp + Z95 * sdDbp
        };
      }

      return {
        ok: true,
        datasetChoice,
        ageYears,
        ageMonths,
        sex,
        heightCm,
        zht,
        reference
      };
    } catch (e) {
      return { ok: false, error: 'Błąd obliczeń RR (bp_module).' };
    }
  }

  function computePediatricBp(params) {
    try {
      const ageYears = Number(params?.ageYears);
      const sex = (params?.sex || '').toUpperCase();
      const heightCm = Number(params?.heightCm);
      const sbp = Number(params?.sbp);
      const dbp = Number(params?.dbp);

      if (!isFinite(ageYears) || !isFinite(heightCm) || !isFinite(sbp) || !isFinite(dbp)) {
        return { ok: false, error: 'Brak wymaganych danych (wiek/wzrost/SBP/DBP).' };
      }
      if (!(sex === 'M' || sex === 'F')) {
        return { ok: false, error: 'Brak danych o płci (M/K).' };
      }

      // Zakres wieku dla norm w tym module: 3–18 lat (36–216 mies.)
      const ageMonths = ageYears * 12;
      if (ageMonths < 36 || ageMonths > 216) {
        return { ok: false, error: 'Normy ciśnienia są dostępne dla wieku 3–18 lat.' };
      }

      // Ustal źródło norm (OLAF vs NHBPEP). W UI OLAF jest dostępny w wieku 7–18 lat.
      let datasetChoice = (params?.datasetChoice || '').toUpperCase();
      if (!(datasetChoice === 'OLAF' || datasetChoice === 'NHBPEP')) {
        const showToggle = (ageYears >= 7 && ageYears <= 18);
        const bpToggle = document.getElementById('bpDataToggle');
        if (showToggle && bpToggle) {
          datasetChoice = bpToggle.checked ? 'NHBPEP' : 'OLAF';
        } else {
          datasetChoice = 'NHBPEP';
        }
      }
      // Dla wieku <7 lat nie mamy OLAF – wymuś NHBPEP.
      if (datasetChoice === 'OLAF' && ageYears < 7) {
        datasetChoice = 'NHBPEP';
      }

      const zht = computeHeightZ(sex, ageMonths, heightCm);
      if (typeof zht !== 'number' || isNaN(zht)) {
        return { ok: false, error: 'Nie można obliczyć Z‑score wzrostu (brak danych LMS).' };
      }

      let percSbp, percDbp;
      let p90Sbp, p95Sbp, p99Sbp, p99Plus5Sbp;
      let p90Dbp, p95Dbp, p99Dbp, p99Plus5Dbp;
      let zSbpVal, zDbpVal;

      if (datasetChoice === 'OLAF') {
        const dataset = (sex === 'M') ? OLAF_BP_BOYS : OLAF_BP_GIRLS;
        const olafVals = getOlafValues(dataset, ageYears);
        const percents = OLAF_PERCENTILES;
        const sbpVals = percents.map(p => olafVals.SBP[String(p)]);
        const dbpVals = percents.map(p => olafVals.DBP[String(p)]);

        percSbp = estimatePercentile(sbp, percents, sbpVals);
        percDbp = estimatePercentile(dbp, percents, dbpVals);

        p90Sbp = olafVals.SBP['90'];
        p95Sbp = olafVals.SBP['95'];
        p99Sbp = olafVals.SBP['99'];
        p99Plus5Sbp = p99Sbp + 5;

        p90Dbp = olafVals.DBP['90'];
        p95Dbp = olafVals.DBP['95'];
        p99Dbp = olafVals.DBP['99'];
        p99Plus5Dbp = p99Dbp + 5;

        // Przybliżony z‑score jak w updateBP
        const p10Sbp = olafVals.SBP['10'];
        const p50Sbp = olafVals.SBP['50'];
        const p90SbpTemp = p90Sbp;
        const p10Dbp = olafVals.DBP['10'];
        const p50Dbp = olafVals.DBP['50'];
        const p90DbpTemp = p90Dbp;

        const sigmaSbp = (p90SbpTemp - p10Sbp) / (2 * Z90);
        const sigmaDbp = (p90DbpTemp - p10Dbp) / (2 * Z90);
        zSbpVal = (sigmaSbp && isFinite(sigmaSbp) && sigmaSbp > 0) ? ((sbp - p50Sbp) / sigmaSbp) : NaN;
        zDbpVal = (sigmaDbp && isFinite(sigmaDbp) && sigmaDbp > 0) ? ((dbp - p50Dbp) / sigmaDbp) : NaN;
      } else {
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

        zSbpVal = zSbp;
        zDbpVal = zDbp;
      }

      // Klasyfikacja jak w updateBP
      let severity = 'normal';
      if (sbp >= p99Plus5Sbp || dbp >= p99Plus5Dbp) {
        severity = 'stage2';
      } else if (sbp >= p95Sbp || dbp >= p95Dbp) {
        severity = 'stage1';
      } else if (sbp >= p90Sbp || dbp >= p90Dbp || sbp >= 120 || dbp >= 80) {
        severity = 'high';
      } else {
        severity = 'normal';
      }

      const interpMap = {
        normal: 'Ciśnienie w normie.',
        high: 'Ciśnienie wysokie prawidłowe (pre‑nadciśnienie).',
        stage1: 'Nadciśnienie I\u00A0stopnia.',
        stage2: 'Nadciśnienie II\u00A0stopnia.'
      };

      return {
        ok: true,
        datasetChoice,
        ageYears,
        ageMonths,
        sex,
        heightCm,
        zht,
        sbp,
        dbp,
        percSbp,
        percDbp,
        zSbp: (typeof zSbpVal === 'number' && isFinite(zSbpVal)) ? zSbpVal : null,
        zDbp: (typeof zDbpVal === 'number' && isFinite(zDbpVal)) ? zDbpVal : null,
        thresholds: {
          sbp90: p90Sbp,
          sbp95: p95Sbp,
          sbp99: p99Sbp,
          sbp99Plus5: p99Plus5Sbp,
          dbp90: p90Dbp,
          dbp95: p95Dbp,
          dbp99: p99Dbp,
          dbp99Plus5: p99Plus5Dbp,
        },
        severity,
        interp: interpMap[severity] || '',
        definition: BP_DEFINITIONS[severity] || null,
      };
    } catch (e) {
      return { ok: false, error: 'Błąd obliczeń RR (bp_module).' };
    }
  }

  // Udostępnij API w window (bez modyfikowania zachowania UI).
  try {
    if (typeof window !== 'undefined') {
      window.bpModuleApi = window.bpModuleApi || {};
      window.bpModuleApi.computePediatricBp = computePediatricBp;
      window.bpModuleApi.getPediatricBpReference = getPediatricBpReference;
    }
  } catch (_) {
    // ignore
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
    // Nowe pole: tętno – aktualizujemy wynik również po zmianie liczby uderzeń serca
    attach(document.getElementById('heartRate'), 'input');
    // Słuchaj zmian populacji tętna i temperatury gorączkowej, aby przeliczyć centyl tętna
    attach(document.getElementById('hrPopulation'), 'change');
    attach(document.getElementById('hrTemperature'), 'input');
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