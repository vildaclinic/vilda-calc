/*
 * Vilda Down Syndrome Module v1.0.0
 *
 * Centyle Zemel 2015 dla zespołu Downa: waga, wzrost/długość, BMI i obwód głowy.
 * Wydzielone z app.js w kroku 8J bez zmiany logiki obliczeń ani treści wyników.
 */
/* ============================================================================
 *  DOWN SYNDROME (Zemel 2015) – centyle wagi/wzrostu/BMI i obwodu głowy
 *  Wymaga załadowanego window.DS (z ds_lms.js).  Funkcje te działają
 *  niezależnie od głównej funkcji update() i automatycznie aktualizują
 *  wyniki, gdy użytkownik zmienia dane (wiek, płeć, waga, wzrost).
 * ==========================================================================*/

// Pomocnicze funkcje do odczytu pól formularza
function __ds_readAgeYears() {
  const ageEl = document.getElementById('age');
  const ageMEl = document.getElementById('ageMonths');
  const y = parseFloat(ageEl && ageEl.value) || 0;
  const m = parseFloat(ageMEl && ageMEl.value) || 0;
  return y + (m / 12);
}
function __ds_readSex() {
  const sexEl = document.getElementById('sex');
  return (sexEl && sexEl.value === 'F') ? 'F' : 'M';
}
function __ds_readWeight() {
  const el = document.getElementById('weight');
  return parseFloat(el && el.value);
}
function __ds_readHeightCm() {
  const el = document.getElementById('height');
  return parseFloat(el && el.value);
}

// Obliczanie Z-score z parametrów LMS
function __ds_zFromLMS(L, M, S, value) {
  if (!(M > 0) || !(S > 0) || !(value > 0)) return NaN;
  if (L === 0) return Math.log(value / M) / S;
  return (Math.pow(value / M, L) - 1) / (L * S);
}
// Aproksymacja gęstości i dystrybuanty N(0,1)
function __ds_phi(z){ return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI); }
function __ds_cdf(z){
  const b1=0.319381530, b2=-0.356563782, b3=1.781477937, b4=-1.821255978, b5=1.330274429, p=0.2316419;
  const t = 1 / (1 + p * Math.abs(z));
  const poly = ((((b5*t + b4)*t + b3)*t + b2)*t + b1) * t;
  const cdf  = 1 - __ds_phi(Math.abs(z)) * poly;
  return (z >= 0) ? cdf : 1 - cdf;
}
function __ds_fmtPerc(p){
  if (p == null || !isFinite(p)) return '—';
  if (p < 1)  return '&lt;1 centyl';
  if (p > 99) return '&gt;99 centyl';
  return Math.round(p) + ' centyl';
}
// Round to 1 decimal and format with comma as decimal separator
function __ds_round1(x){
  const val = (Math.round(x * 10) / 10).toFixed(1);
  return val.replace('.', ',');
}

// Interpolacja dla wieku w miesiącach (niemowlęta) i latach (dzieci ≥2)
function __ds_interpMonths(table, m){
  const keys = Object.keys(table).map(Number).sort((a,b)=>a-b);
  if (m <= keys[0]) return table[String(keys[0])];
  if (m >= keys[keys.length-1]) return table[String(keys[keys.length-1])];
  const lo = Math.floor(m), hi = Math.ceil(m);
  const vLo = table[String(lo)], vHi = table[String(hi)];
  if (!vLo || !vHi || lo === hi) return vLo || vHi || null;
  const t = (m - lo) / (hi - lo);
  return [
    vLo[0] + t * (vHi[0] - vLo[0]),
    vLo[1] + t * (vHi[1] - vLo[1]),
    vLo[2] + t * (vHi[2] - vLo[2]),
  ];
}
function __ds_interpYears(table, y){
  const keys = Object.keys(table).map(Number).sort((a,b)=>a-b);
  if (y <= keys[0]) return table[String(keys[0])];
  if (y >= keys[keys.length-1]) return table[String(keys[keys.length-1])];
  let lo = keys[0], hi = keys[keys.length-1];
  for (let i=1;i<keys.length;i++){
    if (keys[i] >= y){ hi = keys[i]; lo = keys[i-1]; break; }
  }
  const vLo = table[String(lo)], vHi = table[String(hi)];
  if (!vLo || !vHi || lo === hi) return vLo || vHi || null;
  const t = (y - lo) / (hi - lo);
  return [
    vLo[0] + t * (vHi[0] - vLo[0]),
    vLo[1] + t * (vHi[1] - vLo[1]),
    vLo[2] + t * (vHi[2] - vLo[2]),
  ];
}

// Pobieranie LMS według metryki
// metric: 'WT' (waga), 'HT' (wzrost/długość), 'BMI', 'HC' (obwód głowy)
function __ds_getLMS(sex, ageYears, metric){
  if (!window.DS) return null;
  const DS = window.DS;
  if (ageYears < 2){
    const m = Math.max(0, Math.min(36, ageYears * 12));
    if (metric === 'WT') {
      return __ds_interpMonths(sex==='M' ? DS.DS_INFANT_WEIGHT_BOYS : DS.DS_INFANT_WEIGHT_GIRLS, m);
    }
    if (metric === 'HT') {
      return __ds_interpMonths(sex==='M' ? DS.DS_INFANT_LENGTH_BOYS : DS.DS_INFANT_LENGTH_GIRLS, m);
    }
    if (metric === 'HC') {
      const mm = Math.max(1, m);
      return __ds_interpMonths(sex==='M' ? DS.DS_INFANT_HEAD_BOYS : DS.DS_INFANT_HEAD_GIRLS, mm);
    }
    if (metric === 'BMI') {
      return null;
    }
    return null;
  } else {
    const y = Math.min(20, Math.max(2, ageYears));
    if (metric === 'WT') {
      return __ds_interpYears(sex==='M' ? DS.DS_CHILD_WEIGHT_BOYS : DS.DS_CHILD_WEIGHT_GIRLS, y);
    }
    if (metric === 'HT') {
      return __ds_interpYears(sex==='M' ? DS.DS_CHILD_HEIGHT_BOYS : DS.DS_CHILD_HEIGHT_GIRLS, y);
    }
    if (metric === 'HC') {
      return __ds_interpYears(sex==='M' ? DS.DS_CHILD_HEAD_BOYS : DS.DS_CHILD_HEAD_GIRLS, y);
    }
    if (metric === 'BMI') {
      return __ds_interpYears(sex==='M' ? DS.DS_CHILD_BMI_BOYS : DS.DS_CHILD_BMI_GIRLS, y);
    }
    return null;
  }
}

// Wyznacza centyl dla danej wartości
function __ds_percentile(sex, ageYears, metric, value){
  const lms = __ds_getLMS(sex, ageYears, metric);
  if (!lms) return null;
  const z = __ds_zFromLMS(lms[0], lms[1], lms[2], value);
  if (!isFinite(z)) return null;
  return __ds_cdf(z) * 100;
}

// Budowanie treści wyników DS (waga, wzrost, BMI)
function __ds_buildResultsHTML() {
  const ageY  = __ds_readAgeYears();
  const sex   = __ds_readSex();
  const w     = __ds_readWeight();
  const hCm   = __ds_readHeightCm();
  const hM    = (hCm > 0 ? hCm / 100 : NaN);
  const bmi   = (isFinite(w) && isFinite(hM) && hM>0) ? (w / (hM*hM)) : NaN;

  const pW  = (isFinite(w)   ? __ds_percentile(sex, ageY, 'WT',  w)   : null);
  const pH  = (isFinite(hCm) ? __ds_percentile(sex, ageY, 'HT',  hCm) : null);
  const pBMI= (ageY >= 2 && isFinite(bmi) ? __ds_percentile(sex, ageY, 'BMI', bmi) : null);

  const lines = [];
  if (!(ageY >= 0 && ageY <= 20)) {
    lines.push('<div>Wiek poza zakresem karty (0–20 lat).</div>');
  } else {
    if (isFinite(w)) {
      lines.push(`<div><strong>Waga:</strong> <span class="result-val">${__ds_round1(w)} kg</span> — ${__ds_fmtPerc(pW)} (DS)</div>`);
    }
    if (isFinite(hCm)) {
      lines.push(`<div><strong>Wzrost:</strong> <span class="result-val">${__ds_round1(hCm)} cm</span> — ${__ds_fmtPerc(pH)} (DS)</div>`);
    }
    if (ageY < 2) {
      lines.push(`<div><strong>BMI:</strong> — <span class="muted">Brak norm DS dla &lt;2 lat (stosuj WFL).</span></div>`);
    } else if (isFinite(bmi)) {
      lines.push(`<div><strong>BMI:</strong> <span class="result-val">${__ds_round1(bmi)}</span> — ${__ds_fmtPerc(pBMI)} (DS)</div>`);
    }
  }
  return lines.join('');
}

// Aktualizuje widoczność sekcji DS w zależności od wieku
function __ds_updateSectionVisibility() {
  const section = document.getElementById('downSyndromeSection');
  if (!section) return;
  const ageY = __ds_readAgeYears();
  if (isFinite(ageY) && ageY <= 20) {
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
    const card = document.getElementById('downSyndromeCard');
    if (card) card.style.display = 'none';
  }
}
// Przelicza i wstawia wyniki DS
function __ds_computeAndRender() {
  const box = document.getElementById('dsPercentiles');
  if (!box) return;
  vildaAppSetTrustedHtml(box, __ds_buildResultsHTML(), 'app:box');
  box.style.display = 'block';
}
// Aktualizuje centyl obwodu głowy
function __ds_updateHeadCirc() {
  const out = document.getElementById('headCircumResultDS');
  const input = document.getElementById('headCircumDS');
  if (!out || !input) return;
  const ageY = __ds_readAgeYears();
  const sex  = __ds_readSex();
  const val  = parseFloat(input.value);
  if (!isFinite(val) || !(ageY >= 0 && ageY <= 20)) {
    out.style.display = 'none';
    vildaAppClearHtml(out);
    return;
  }
  const p = __ds_percentile(sex, ageY, 'HC', val);
  if (p == null) {
    out.style.display = 'block';
    vildaAppSetTrustedHtml(out, '<div>Brak danych DS dla obwodu głowy w tym wieku.</div>', 'app:out');
  } else {
    out.style.display = 'block';
    vildaAppSetTrustedHtml(out, `<div><strong>Obwód głowy:</strong> <span class="result-val">${__ds_round1(val)} cm</span> — ${__ds_fmtPerc(p)} (DS)</div>`, 'app:out');
  }
}

// Inicjalizacja zdarzeń po załadowaniu DOM
window.vildaAppOnReady('app:down-syndrome-module', function initDownSyndromeModule(){
  const btn = document.getElementById('toggleDownSyndrome');
  const card = document.getElementById('downSyndromeCard');
  const headInput = document.getElementById('headCircumDS');

  // Ustaw widoczność sekcji na podstawie wieku
  __ds_updateSectionVisibility();

  // Przełącznik karty DS
  if (btn && card) {
    btn.addEventListener('click', function(){
      const isHidden = (card.style.display === 'none' || card.style.display === '');
      if (isHidden) {
        card.style.display = 'block';
        __ds_computeAndRender();
        __ds_updateHeadCirc();
      } else {
        card.style.display = 'none';
      }
    });
  }

  // Autoprzeliczanie przy zmianie podstawowych pól
  ['age','ageMonths','weight','height','sex'].forEach(function(id){
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', function(){
        __ds_updateSectionVisibility();
        if (card && card.style.display === 'block') {
          __ds_computeAndRender();
          __ds_updateHeadCirc();
        }
      });
    }
  });

  // Centyl obwodu głowy na żywo
  if (headInput) {
    headInput.addEventListener('input', __ds_updateHeadCirc);
  }
});


(function exposeVildaDownSyndromeModule(global) {
  'use strict';
  if (!global) return;
  const api = {
    __vildaDownSyndromeModule: true,
    version: '1.0.0',
    readAgeYears: typeof global.__ds_readAgeYears === 'function' ? global.__ds_readAgeYears : null,
    readSex: typeof global.__ds_readSex === 'function' ? global.__ds_readSex : null,
    readWeight: typeof global.__ds_readWeight === 'function' ? global.__ds_readWeight : null,
    readHeightCm: typeof global.__ds_readHeightCm === 'function' ? global.__ds_readHeightCm : null,
    percentile: typeof global.__ds_percentile === 'function' ? global.__ds_percentile : null,
    buildResultsHtml: typeof global.__ds_buildResultsHTML === 'function' ? global.__ds_buildResultsHTML : null,
    updateSectionVisibility: typeof global.__ds_updateSectionVisibility === 'function' ? global.__ds_updateSectionVisibility : null,
    computeAndRender: typeof global.__ds_computeAndRender === 'function' ? global.__ds_computeAndRender : null,
    updateHeadCirc: typeof global.__ds_updateHeadCirc === 'function' ? global.__ds_updateHeadCirc : null
  };
  global.VildaDownSyndrome = api;
  global.vildaDownSyndrome = api;
  global.vildaDownSyndromeVersion = function vildaDownSyndromeVersion() { return api.version; };
})(typeof window !== 'undefined' ? window : globalThis);
