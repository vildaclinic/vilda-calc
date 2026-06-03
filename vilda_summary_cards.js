/* ==========================================================================
 * vilda_summary_cards.js — summary cards / metabolic summary UI
 *
 * Wydzielone z app.js w kroku 8Q-4 bez zmiany obliczeń klinicznych,
 * danych GH/IGF, estimated intake, persistence ani importu/eksportu.
 * ========================================================================== */
(function (window) {
  'use strict';

  const VERSION = '1.0.0';
  const STEP = '8Q-4';
  let initialized = false;
  let controlsRegistered = false;
  let diffHeightRuntimeInitialized = false;

  function exposeSummaryCardGlobals() {
    if (!window) return;
    window.__pickLastMeasurement = __pickLastMeasurement;
    window.__kgToEnterNormalRange = __kgToEnterNormalRange;
    window.__renderPrevSummary = __renderPrevSummary;
    window.__syncPrevClcrCardHeight = __syncPrevClcrCardHeight;
    window.__renderPrevClcrSummary = __renderPrevClcrSummary;
    window.repositionDoctor = repositionDoctor;
    window.repositionMetabolicSummary = repositionMetabolicSummary;
    window.updateMetabolicSummaryVisibility = updateMetabolicSummaryVisibility;
    window.generateMetabolicSummary = generateMetabolicSummary;
    window.handleMetabolicSummaryClick = handleMetabolicSummaryClick;
  }

  /* === Podsumowanie poprzednich pomiarów ===
     Funkcje pomocnicze do analizy ostatniego pomiaru wczytanego z pliku JSON.
     Obejmują wybór ostatniego pomiaru, obliczenie BMI, centyli dziecięcych,
     wskaźnika Cole’a, WHR i różnicy do normy BMI.
  */
  function __pickLastMeasurement(data){
    // Zwraca sex, wiek w miesiącach, wzrost cm, wagę kg oraz obwody talii i bioder (jeśli występują).
    const result = { sex: null, ageMonths: null, heightCm: null, weightKg: null, waistCm: null, hipCm: null };
    if(!data || !data.user) return result;
    // Sex
    result.sex = data.user.sex || (data.advanced && data.advanced.data && data.advanced.data.sex) || 'M';
    // Age
    // preferuj currentAgeMonths jeśli dostępny w sekcji advanced.data
    if(data.advanced && data.advanced.data && typeof data.advanced.data.currentAgeMonths === 'number'){
      result.ageMonths = data.advanced.data.currentAgeMonths;
    } else {
      const ageYears  = (typeof data.user.age === 'number') ? data.user.age : null;
      const ageMonths = (typeof data.user.ageMonths === 'number') ? data.user.ageMonths : null;
      if(ageYears!=null || ageMonths!=null){
        result.ageMonths = Math.round((ageYears||0) * 12 + (ageMonths||0));
      }
    }
    // Height / weight – preferuj pola currentHeight/currentWeight w advanced.data
    if(data.advanced && data.advanced.data){
      const adv = data.advanced.data;
      if(typeof adv.currentHeight === 'number') result.heightCm = adv.currentHeight;
      if(typeof adv.currentWeight === 'number') result.weightKg = adv.currentWeight;
    }
    // Fallback do user.height/weight jeśli brak current*
    if(result.heightCm == null && typeof data.user.height === 'number'){
      result.heightCm = data.user.height;
    }
    if(result.weightKg == null && typeof data.user.weight === 'number'){
      result.weightKg = data.user.weight;
    }
    // Wiek oraz waga z historii pomiarów – wybierz ostatni (największy ageMonths)
    // jeżeli brak current* lub user.*
    let meas = [];
    if(data.advanced && data.advanced.data && Array.isArray(data.advanced.data.measurements)){
      meas = data.advanced.data.measurements.slice();
    }
    if(meas.length){
      meas.sort((a,b)=>{
        const am = (typeof a.ageMonths === 'number') ? a.ageMonths : Math.round((a.ageYears||0)*12);
        const bm = (typeof b.ageMonths === 'number') ? b.ageMonths : Math.round((b.ageYears||0)*12);
        return am - bm;
      });
      const last = meas[meas.length-1];
      const h = (typeof last.height === 'number') ? last.height : null;
      const w = (typeof last.weight === 'number') ? last.weight : null;
      if(result.heightCm == null && h!=null) result.heightCm = h;
      if(result.weightKg == null && w!=null) result.weightKg = w;
      // ageMonths z historii jeśli brak
      if(result.ageMonths == null){
        if(typeof last.ageMonths === 'number') result.ageMonths = last.ageMonths;
        else if(typeof last.ageYears === 'number') result.ageMonths = Math.round(last.ageYears * 12);
      }
    }
    // WHR – obwód talii i bioder (jeśli w danych)
    if(typeof data.user.waist === 'number') result.waistCm = data.user.waist;
    if(typeof data.user.hip === 'number') result.hipCm = data.user.hip;
    // Alternatywne pola w advanced.data
    if(data.advanced && data.advanced.data){
      if(typeof data.advanced.data.currentWaist === 'number' && result.waistCm == null) result.waistCm = data.advanced.data.currentWaist;
      if(typeof data.advanced.data.currentHip === 'number' && result.hipCm == null) result.hipCm = data.advanced.data.currentHip;
    }
    return result;
  }

  function __kgToEnterNormalRange(weightKg, heightCm, sex, ageMonths){
    // Oblicza minimalną różnicę masy (kg) do wejścia w zakres normy BMI.
    if(!weightKg || !heightCm) return null;
    const h2 = Math.pow(heightCm / 100, 2);
    const bmi = weightKg / h2;
    const ageYears = (typeof ageMonths === 'number') ? ageMonths / 12 : null;
    // Dziecko (<18 lat): użyj z‑score 5c (–1.645) i 85c (+1.036)
    if(ageYears != null && ageYears < 18){
      const lms = (typeof getLMS === 'function') ? getLMS(sex, Math.round(ageMonths)) : null;
      if(!lms) return null;
      const [L,M,S] = lms;
      const bmiAtZ = (z) => {
        return (L !== 0) ? M * Math.pow(1 + L * S * z, 1 / L) : M * Math.exp(S * z);
      };
      const BMI_P5  = bmiAtZ(-1.645);
      const BMI_P85 = bmiAtZ( 1.036);
      if(bmi < BMI_P5){
        const targetW = BMI_P5 * h2;
        return targetW - weightKg;      // dodatnie: ile kg do przybrania
      }else if(bmi >= BMI_P85){
        const targetW = BMI_P85 * h2;
        return weightKg - targetW;      // dodatnie: ile kg do zgubienia
      }else{
        return 0;                       // w normie
      }
    }
    // Dorośli: zakres 18.5–24.9
    const BMI_LOW = 18.5, BMI_HIGH = 24.9;
    if(bmi < BMI_LOW){
      const targetW = BMI_LOW * h2;
      return targetW - weightKg;        // dodatnie: do przybrania
    }else if(bmi > BMI_HIGH){
      const targetW = BMI_HIGH * h2;
      return weightKg - targetW;        // dodatnie: do zgubienia
    }
    return 0;
  }

  // ── Karta „Ostatni pomiar" v2 — VAULT-AWARE dyspozytor ─────────────────────
  // Karta pokazuje POPRZEDNI pomiar (n-1) AKTYWNEGO pacjenta z vault (snapshoty
  // posortowane malejąco po savedAtISO → [1] = poprzedni). Gdy nie ma wczytanego
  // pacjenta z vault lub jest < 2 pomiarów — karta się chowa. Wszystkie ścieżki
  // (applyLoadedData, vilda:patient-loaded, vilda:measurement-changed) wołają tę
  // funkcję; argument `data` jest IGNOROWANY — źródłem prawdy jest vault.
  function _hidePrevSummaryCard(){
    try {
      var w = document.getElementById('prevSummaryWrap');
      var c = document.getElementById('prevSummaryCard');
      if (w) w.style.display = 'none';
      if (c) c.style.display = 'none';
    } catch(_){}
    try { window.prevMeasurementInfo = null; } catch(_){}
    // Karta znikła → wróć do pojedynczej karty „Podsumowania wyników".
    try {
      if (typeof window.updateProfessionalSummaryCard === 'function') {
        window.updateProfessionalSummaryCard();
      }
    } catch(_){}
  }
  function __renderPrevSummary(patientIdFromEvent){
    // Fix (wyścig): kartę odświeżają zdarzenia patient-loaded / measurement-changed.
    // window._vildaCurrentPatientId ustawia INNY listener (custom-fixes.js) na tym
    // samym evencie — bez gwarancji kolejności, więc tu bywało jeszcze null i karta
    // się chowała. Zdarzenie niesie detail.patientId — bierzemy je w pierwszej
    // kolejności i od razu utrwalamy w globalnej (źródło prawdy dla pozostałych).
    var pid = null;
    if (typeof patientIdFromEvent === 'string' && patientIdFromEvent) {
      pid = patientIdFromEvent;
      try { window._vildaCurrentPatientId = pid; } catch(_){}
    } else {
      try { pid = window._vildaCurrentPatientId || null; } catch(_){}
    }
    var V = window.VildaVault;
    if (!pid || !V || typeof V.isUnlocked !== 'function' || !V.isUnlocked() ||
        typeof V.getPatient !== 'function') {
      _hidePrevSummaryCard();
      return;
    }
    V.getPatient(pid).then(function(pf){
      var snaps = (pf && Array.isArray(pf.snapshots)) ? pf.snapshots : [];
      // snapshots[0] = najnowszy, [1] = poprzedni (n-1). Brak n-1 → chowamy.
      if (snaps.length < 2 || !snaps[1] || !snaps[1].payload) { _hidePrevSummaryCard(); return; }
      _renderPrevSummaryFromPayload(snaps[1].payload);
      // Reload-survival: utrwal pid (sessionStorage = per karta przeglądarki).
      // Po przeładowaniu strony przywrócimy kartę ze ŚWIEŻYMI danymi z vaulta.
      try { window.sessionStorage.setItem('vildaPrevSummaryPid', pid); } catch(_){}
      try { window.prevMeasurementInfo = __pickLastMeasurement(snaps[1].payload); } catch(_){}
      try { if (typeof window.updatePrevSummaryDiff === 'function') window.updatePrevSummaryDiff(); } catch(_){}
    }).catch(function(){ _hidePrevSummaryCard(); });
  }
  // Nasłuch: odśwież kartę przy wczytaniu pacjenta i każdej zmianie pomiarów;
  // schowaj przy wyczyszczeniu sesji/wylogowaniu.
  if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__vildaPrevSummaryBound) {
    window.__vildaPrevSummaryBound = true;
    document.addEventListener('vilda:patient-loaded', function(e){ __renderPrevSummary(e && e.detail && e.detail.patientId); });
    document.addEventListener('vilda:measurement-changed', function(e){ __renderPrevSummary(e && e.detail && e.detail.patientId); });
    document.addEventListener('vilda:user-state-cleared', function(){
      _hidePrevSummaryCard();
      // Sesja wyczyszczona/wylogowanie → karta NIE ma wracać po kolejnym reloadzie.
      try { window.sessionStorage.removeItem('vildaPrevSummaryPid'); } catch(_){}
    });
    // ── Reload-survival karty „Ostatni pomiar" (decyzja UX 2026-06-03) ──────────
    // Karta służy porównaniu nowego pomiaru z historycznym i ma przeżywać
    // przeładowanie strony (oba scenariusze: tuż po „Wczytaj → Nowy pomiar" oraz
    // po wpisaniu danych, gdy widać też „Podsumowanie wyników"). Render wymaga
    // ODBLOKOWANEGO vaulta, więc próbujemy idempotentnie w trzech momentach:
    // zaraz po starcie (sesja bywa wciąż odblokowana), po odtworzeniu stanu
    // formularza (vilda:state-restored) i po schowaniu nakładki auth
    // (vilda:auth-hidden = m.in. tuż po udanym odblokowaniu). Dane karty zawsze
    // idą świeżo z vaulta (V.getPatient) — brak ryzyka nieaktualności.
    var _restorePrevSummaryFromSession = function(){
      try {
        var pid = window.sessionStorage ? window.sessionStorage.getItem('vildaPrevSummaryPid') : null;
        if (!pid) return;
        var V = window.VildaVault;
        if (!V || typeof V.isUnlocked !== 'function' || !V.isUnlocked()) return; // ponowimy na auth-hidden
        __renderPrevSummary(pid);
      } catch(_){}
    };
    document.addEventListener('vilda:auth-hidden', _restorePrevSummaryFromSession);
    document.addEventListener('vilda:state-restored', _restorePrevSummaryFromSession);
    if (document.readyState !== 'loading') setTimeout(_restorePrevSummaryFromSession, 0);
    else document.addEventListener('DOMContentLoaded', function(){ setTimeout(_restorePrevSummaryFromSession, 0); });
  }

  function _renderPrevSummaryFromPayload(data){
    // Zwróć jeśli brak elementów DOM
    const wrap  = document.getElementById('prevSummaryWrap');
    const card  = document.getElementById('prevSummaryCard');
    const toggle= document.getElementById('togglePrevSummary');
    const content = document.getElementById('prevSummaryContent');
    if(!wrap || !card || !toggle || !content) return;

    // Pobierz ostatni pomiar z danych
    const last = __pickLastMeasurement(data);
    const ageMonths = last.ageMonths;
    const sex = last.sex || 'M';
    const height = last.heightCm;
    const weight = last.weightKg;

    // Obliczenia podstawowe
    const bmi = (typeof BMI === 'function' && weight && height) ? BMI(weight, height) : null;
    const whr = (last.waistCm && last.hipCm && last.hipCm !== 0) ? (last.waistCm / last.hipCm) : null;
    // Centyle (dzieci) – poprawne wywołanie funkcji calcPercentileStats(value, sex, ageYears, param)
    let heightPerc = null, weightPerc = null, bmiPerc = null, cole = null;
    if (ageMonths != null && (ageMonths / 12) < 18) {
      const ageYears = ageMonths / 12;
      // Ustal zapisane źródło danych dla centyli z pliku JSON.  Dzięki temu
      // można tymczasowo nadpisać globalną zmienną bmiSource, aby funkcje
      // calcPercentileStats() i bmiPercentileChild() korzystały z odpowiednich
      // siatek centylowych (WHO, OLAF lub Palczewska) niezależnie od
      // aktualnie zaznaczonego suwaka w UI.
      let dataSrc = null;
      try {
        if (data && data.zscore && data.zscore.dataSource) dataSrc = data.zscore.dataSource;
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 6752 });
    }
  }
      // Zapisz oryginalną wartość bmiSource i tymczasowo ustaw ją na dataSrc.
      let __origBmiSource;
      try {
        if (typeof bmiSource !== 'undefined') __origBmiSource = bmiSource;
        if (dataSrc) {
          bmiSource = dataSrc;
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 6760 });
    }
  }
      // Jeśli źródło to Palczewska i dostępna jest funkcja calcPercentileStatsPal,
      // użyj jej do obliczenia centyli wzrostu i wagi.  W przeciwnym razie
      // korzystaj ze standardowej calcPercentileStats() (dla WHO/OLAF).
      if (dataSrc === 'PALCZEWSKA' && typeof calcPercentileStatsPal === 'function') {
        if (height != null) {
          const statsH = calcPercentileStatsPal(height, sex, ageYears, 'HT');
          if (statsH && statsH.percentile != null) heightPerc = statsH.percentile;
        }
        if (weight != null) {
          const statsW = calcPercentileStatsPal(weight, sex, ageYears, 'WT');
          if (statsW && statsW.percentile != null) weightPerc = statsW.percentile;
        }
      } else {
        if (typeof calcPercentileStats === 'function' && height != null) {
          const statsH = calcPercentileStats(height, sex, ageYears, 'HT');
          if (statsH && statsH.percentile != null) heightPerc = statsH.percentile;
        }
        if (typeof calcPercentileStats === 'function' && weight != null) {
          const statsW = calcPercentileStats(weight, sex, ageYears, 'WT');
          if (statsW && statsW.percentile != null) weightPerc = statsW.percentile;
        }
      }
      // Percentyl BMI – korzystaj z bmiPercentileChild(), które automatycznie
      // używa Palczewskiej, OLAF lub WHO w zależności od zmiennej bmiSource.
      if (typeof bmiPercentileChild === 'function' && bmi != null) {
        const bp = bmiPercentileChild(bmi, sex, ageMonths);
        if (bp != null) bmiPerc = bp;
      }
      // Indeks Cole’a (Cole Index) obliczamy tylko wówczas,
      // gdy mamy LMS z siatek WHO/OLAF.  Palczewska nie udostępnia LMS,
      // dlatego ten wskaźnik pomijamy dla źródła PALCZEWSKA.
      if (dataSrc !== 'PALCZEWSKA' && typeof getLMS === 'function' && bmi != null) {
        const lms = getLMS(sex, Math.round(ageMonths));
        if (lms) {
          const M = lms[1];
          cole = (bmi / M) * 100;
        }
      }
      // Przywróć poprzednią wartość bmiSource, aby nie zmieniać globalnego stanu
      // po zakończeniu obliczeń.
      try {
        if (__origBmiSource !== undefined) bmiSource = __origBmiSource;
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 6803 });
    }
  }
      // Przekaż użyte źródło danych do formatu etykiet (formatCentileLabel)
      // poprzez zmienną globalną prevSummaryDataSource.  Zostanie ona
      // nadpisana w każdym wywołaniu tej funkcji i wyczyszczona po
      // wstawieniu wyników do DOM.  Dzięki temu formatCentileLabel()
      // może sprawdzić, że aktualnie renderujemy podsumowanie poprzedniego
      // pomiaru i wymusić polskie opisy centyli dla Palczewskiej i OLAF.
      try {
        if (typeof window !== 'undefined') {
          window.prevSummaryDataSource = dataSrc || null;
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 6814 });
    }
  }
    }
    // Różnica masy do normy
    const kgDiff = __kgToEnterNormalRange(weight, height, sex, ageMonths);
    let kgText = '';
    if(kgDiff != null){
      const absKg = Math.abs(kgDiff);
      // Ustal kierunek: jeśli BMI powyżej górnej granicy – trzeba schudnąć (−),
      // jeśli BMI poniżej dolnej granicy – trzeba przybrać (+), w normie 0.
      if(kgDiff === 0){
        kgText = 'w normie';
      }else if(weight != null && height != null){
        const h2 = Math.pow(height/100,2);
        const bmiVal = weight / h2;
        const ageYears = (ageMonths != null) ? ageMonths/12 : null;
        let overweight;
        if(ageYears != null && ageYears < 18){
          // Dziecko: sprawdź BMI względem 85 centyla
          const lms = (typeof getLMS === 'function') ? getLMS(sex, Math.round(ageMonths)) : null;
          if(lms){
            const [L,M,S] = lms;
            const bmi85 = (L !== 0) ? M * Math.pow(1 + L*S*1.036, 1/L) : M * Math.exp(S*1.036);
            overweight = bmiVal >= bmi85;
          }else{
            overweight = false;
          }
        }else{
          overweight = bmiVal > 24.9;
        }
        kgText = overweight
          ? `${absKg.toFixed(1).replace('.', ',')} kg do górnej granicy normy`
          : `${absKg.toFixed(1).replace('.', ',')} kg do dolnej granicy normy`;
      }
    }
    // Wylicz wiek w latach i miesiącach do wyświetlenia.
    // Dla 1 roku użyj "rok", dla pozostałych "lata" (2–4) lub "lat" (≥5) zgodnie z językiem polskim.
    let ageDisplay = '';
    if (ageMonths != null) {
      const yrs = Math.floor(ageMonths / 12);
      const mos = ageMonths - yrs * 12;
      let yearWord;
      if (yrs === 1) {
        yearWord = 'rok';
      } else if (yrs % 10 >= 2 && yrs % 10 <= 4 && (yrs % 100 < 10 || yrs % 100 >= 20)) {
        yearWord = 'lata';
      } else {
        yearWord = 'lat';
      }
      ageDisplay = `${yrs} ${yearWord} ${mos} mies.`;
    }

    // Obwody talii i bioder – oblicz centyle dla dzieci (3–18 lat) jeśli dostępne.
    // W przypadku dorosłych lub braku danych centyle nie są obliczane.
    let waistPerc = null;
    let hipPerc = null;
    if (last.waistCm != null && last.hipCm != null && ageMonths != null) {
      const ageYearsWHR = ageMonths / 12;
      if (ageYearsWHR >= 3 && ageYearsWHR <= 18 && typeof childPercentileFromTables === 'function') {
        try {
          const percRes = childPercentileFromTables(ageYearsWHR, sex, last.waistCm, last.hipCm);
          if (percRes) {
            waistPerc = percRes.waistP;
            hipPerc   = percRes.hipP;
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 6880 });
    }
  }
      }
    }
    // Wyznacz klasy kolorów dla wyników w zależności od kategorii (norma, ostrzeżenie, alert)
    let heightClass = '';
    let weightClass = '';
    let bmiClass    = '';
    let coleClass   = '';
    let waistClass  = '';
    let hipClass    = '';
    let whrClass    = '';
    // Ustal, czy mamy do czynienia z osobą pełnoletnią (wiek >= 18 lat).
    const isAdult = (ageMonths != null && (ageMonths / 12) >= 18);
    if (!isAdult) {
      // Klasyfikacja wzrostu/wagi — spójna z główną kartą „Podsumowanie wyników"
      // (custom-fixes.js → getCentileState):
      //   <3 || >97  → status-alert   (czerwony)
      //   <10 || >90 → status-improve (pomarańczowy „borderline")
      //   10–90      → brak klasy      (turkus)
      // Wcześniej brakowało dolnego pasma 3–10 dla wagi oraz całego pasma
      // ostrzegawczego dla wzrostu → waga np. na 8. centylu fałszywie świeciła turkus.
      if (heightPerc != null) {
        if (heightPerc < 3 || heightPerc > 97) {
          heightClass = ' status-alert';
        } else if (heightPerc < 10 || heightPerc > 90) {
          heightClass = ' status-improve';
        }
      }
      if (weightPerc != null) {
        if (weightPerc < 3 || weightPerc > 97) {
          weightClass = ' status-alert';
        } else if (weightPerc < 10 || weightPerc > 90) {
          weightClass = ' status-improve';
        }
      }
      // Klasyfikacja BMI u dzieci
      if (bmi != null && bmiPerc != null) {
        if (bmiPerc >= 97 || bmiPerc < 3) {
          bmiClass = ' status-alert';
        } else if (bmiPerc >= 85) {
          bmiClass = ' status-improve';
        }
      }
      // Klasyfikacja wskaźnika Cole'a – nadwaga/otyłość
      if (cole != null) {
        if (cole < 90 || cole >= 120) {
          coleClass = ' status-alert';
        } else if (cole > 110 && cole < 120) {
          coleClass = ' status-improve';
        }
      }
      // Klasyfikacja obwodu talii u dzieci
      if (last.waistCm != null && waistPerc != null) {
        if (waistPerc >= 97) {
          waistClass = ' status-alert';
        } else if (waistPerc >= 90) {
          waistClass = ' status-improve';
        }
      }
      // Klasyfikacja obwodu bioder u dzieci
      if (last.hipCm != null && hipPerc != null) {
        if (hipPerc >= 97) {
          hipClass = ' status-alert';
        } else if (hipPerc >= 90) {
          hipClass = ' status-improve';
        }
      }
      // WHR u dzieci – brak kolorowania
    } else {
      // Klasyfikacja BMI u dorosłych
      if (bmi != null) {
        if (bmi >= 30 || bmi < 18.5) {
          bmiClass = ' status-alert';
        } else if (bmi >= 25) {
          bmiClass = ' status-improve';
        }
      }
      // Klasyfikacja Cole'a u dorosłych (jeżeli M z siatek jest dostępne)
      if (cole != null) {
        if (cole < 90 || cole >= 120) {
          coleClass = ' status-alert';
        } else if (cole > 110 && cole < 120) {
          coleClass = ' status-improve';
        }
      }
      // Klasyfikacja obwodu talii u dorosłych
      if (last.waistCm != null) {
        if (sex === 'M') {
          if (last.waistCm >= 102) {
            waistClass = ' status-alert';
          } else if (last.waistCm >= 94) {
            waistClass = ' status-improve';
          }
        } else {
          // Zakładamy, że pozostałe osoby to kobiety
          if (last.waistCm >= 88) {
            waistClass = ' status-alert';
          } else if (last.waistCm >= 80) {
            waistClass = ' status-improve';
          }
        }
      }
      // Biodra u dorosłych – brak kolorowania
      // Klasyfikacja WHR u dorosłych
      if (whr != null) {
        const whrLimit = (sex === 'M') ? 0.90 : 0.85;
        if (whr > whrLimit) {
          whrClass = ' status-alert';
        }
      }
    }

    // Budowa HTML
    const rows = [];
    // ► Źródło danych
    // Wstaw wiersz informujący o zestawie danych (WHO/OLAF/Palczewska), z którego
    // korzystano podczas zapisu pomiaru.  Informacja ta pochodzi z pola
    // data.zscore.dataSource zapisanego w pliku JSON.  Dzięki temu użytkownik
    // widzi, na podstawie której siatki centylowej obliczono wysokość,
    // masę, BMI oraz inne parametry.  Jeżeli brak takiej informacji,
    // wiersz nie jest dodawany.
    (function() {
      let __srcLabel = null;
      try {
        if (data && data.zscore && data.zscore.dataSource) {
          const src = data.zscore.dataSource;
          if (src === 'PALCZEWSKA') {
            __srcLabel = 'Palczewska';
          } else if (src === 'OLAF') {
            __srcLabel = 'OLAF';
          } else if (src === 'WHO') {
            __srcLabel = 'WHO';
          } else {
            __srcLabel = src;
          }
        }
      } catch (_) {
        __srcLabel = null;
      }
      if (__srcLabel) {
        rows.push(`<div class="label">Źródło\u00a0danych</div><div class="val"><span class="result-val">${__srcLabel}</span></div>`);
      }
    })();
    // Data ostatniego zapisu
    const ts = data && (data.timestampISO || data.timestamp);
    if(ts){
      const d = new Date(ts);
      const pl = d.toLocaleString('pl-PL', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
      rows.push(`<div class="label">Data ostatniego zapisu</div><div class="val">${pl}</div>`);
      // Wiersz informujący o czasie od ostatniego pomiaru będzie uaktualniany dynamicznie
      // po uzupełnieniu aktualnego wieku użytkownika.  Wstawiamy ukryty placeholder.
      rows.push(`<div class="label time-since-label" style="display:none;">Od ostatniego pomiaru</div><div class="val time-since-val" style="display:none;"><span class="result-val" style="text-decoration:underline; font-size:1.0rem; font-weight:600;"></span></div>`);
    }
    // Wiek
    if(ageDisplay){
      rows.push(`<div class="label">Wiek podczas pomiaru</div><div class="val"><span class="result-val">${ageDisplay}</span></div>`);
    }
    // Wzrost
    rows.push(`<div class="label">Wzrost</div><div class="val"><span class="result-val${heightClass}">${height != null ? height.toFixed(1).replace('.', ',') : '—'}<small> cm</small></span>${heightPerc != null ? ` <span class="muted">(${formatCentileLabel(heightPerc)})</span>` : ''}</div>`);
    // Waga
    rows.push(`<div class="label">Waga</div><div class="val"><span class="result-val${weightClass}">${weight != null ? weight.toFixed(1).replace('.', ',') : '—'}<small> kg</small></span>${weightPerc != null ? ` <span class="muted">(${formatCentileLabel(weightPerc)})</span>` : ''}</div>`);
    // BMI
    rows.push(`<div class="label">BMI</div><div class="val"><span class="result-val${bmiClass}">${bmi != null ? bmi.toFixed(1).replace('.', ',') : '—'}</span>${bmiPerc != null ? ` <span class="muted">(${formatCentileLabel(bmiPerc)})</span>` : ''}</div>`);
    // Cole index
    if(cole != null){
      rows.push(`<div class="label">Wskaźnik Cole’a</div><div class="val"><span class="result-val${coleClass}">${cole.toFixed(1).replace('.', ',')}<small>%</small></span></div>`);
    }
    // Obwód talii (jeśli dostępny)
    if (last.waistCm != null) {
      const waistVal = last.waistCm.toFixed(1).replace('.', ',');
      rows.push(`<div class="label">Obwód\u00a0talii</div><div class="val"><span class="result-val${waistClass}">${waistVal}<small>\u00a0cm</small></span>${waistPerc != null ? ` <span class="muted">(${formatCentileLabel(waistPerc)})</span>` : ''}</div>`);
    }
    // Obwód bioder (jeśli dostępny)
    if (last.hipCm != null) {
      const hipVal = last.hipCm.toFixed(1).replace('.', ',');
      rows.push(`<div class="label">Obwód\u00a0bioder</div><div class="val"><span class="result-val${hipClass}">${hipVal}<small>\u00a0cm</small></span>${hipPerc != null ? ` <span class="muted">(${formatCentileLabel(hipPerc)})</span>` : ''}</div>`);
    }
    // WHR (wskaźnik talia‑biodra)
    if(whr != null){
      rows.push(`<div class="label">WHR</div><div class="val"><span class="result-val${whrClass}">${whr.toFixed(2).replace('.', ',')}</span></div>`);
    }
    // Usunięto wiersz "Do normy BMI" – nie pokazujemy tego parametru ani jego zmian.

    // Faza 14 — duplikat baneru obesity_kids USUNIĘTY z karty "Ostatni pomiar".
    // Baner pozostaje tylko w karcie Wskaźnik Cole'a (#coleObesityKidsBanner
    // generowany przez vildaUpdatePrepRenderColeMetrics w vilda_update_prep.js,
    // styling: vilda_obesity_banner.css). W karcie "Ostatni pomiar" baner był
    // postrzegany jako szum — user widzi już wszystkie wskaźniki w głównej
    // karcie + dedykowanej karcie Cole'a.

    // Insert into DOM
    vildaAppSetTrustedHtml(content, rows.join(''), 'app:content');
    // Po wyrenderowaniu wyniku usuń znacznik prevSummaryDataSource.
    // Wykorzystywany jest tylko podczas tworzenia wierszy, aby
    // formatCentileLabel() mógł poprawnie dobrać język dla centyli.
    try {
      if (typeof window !== 'undefined') {
        window.prevSummaryDataSource = null;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 7066 });
    }
  }
    // Pokaż kartę i ukryj przycisk toggle
    wrap.style.display = 'block';
    card.style.display = 'block';
    toggle.style.display = 'none';
    // Po pokazaniu karty przelicz układ „Podsumowania wyników" (split na dwie
    // symetryczne połówki). KRYTYCZNE po reloadzie: podsumowanie renderuje się
    // z autosave formularza ZANIM karta „Ostatni pomiar" wróci (czeka na unlock
    // vaulta) — bez tego przeliczenia zostawała jedna duża karta pod spodem.
    try {
      if (typeof window.updateProfessionalSummaryCard === 'function') {
        window.updateProfessionalSummaryCard();
      }
    } catch(_){}
    // Oznacz, że podsumowanie poprzedniego pomiaru zostało poprawnie załadowane.
    // Dzięki temu będziemy mogli decydować, czy karta powinna być wyświetlana
    // podczas modyfikacji formularza – karta ma się pojawiać tylko po wczytaniu
    // danych z pliku JSON.
    if (wrap && wrap.dataset) {
      wrap.dataset.loaded = 'true';
    }
    if (card && card.dataset) {
      card.dataset.loaded = 'true';
    }
  }
// === Podsumowanie ostatniego pomiaru klirensu (tylko na podstronie „Klirens”) ===
// === Podsumowanie ostatniego pomiaru klirensu (tylko na podstronie „Klirens”) ===

/**
 * Synchronize the height of the previous creatinine clearance measurement card
 * (#prevClcrCard) with the patient data card.  On desktop (≥ 700 px) both cards
 * should be the same height so they align neatly when displayed side by side.
 * This function measures the height of the patient card and applies it to the
 * previous measurement card.  It also enables an internal scroll on the list
 * of previous results (.prev-clcr-sections) so that overflowing content does
 * not stretch the card.  On mobile (< 700 px) any inline height and overflow
 * styles applied by this function are removed, allowing the layout defined in
 * CSS to take effect.
 */
function __syncPrevClcrCardHeight() {
  try {
    // Jeśli dostępna jest nowa funkcja ustawiająca wysokość karty,
    // użyj jej zamiast lokalnej implementacji.  Dzięki temu logika wysokości
    // pozostaje spójna z definicją w pliku HTML (setupPrevClcrCardHeight),
    // która oblicza wysokość na podstawie odległości między sekcją "Dane pacjenta"
    // a "Wybierz formułę do obliczenia".
    if (typeof window !== 'undefined' && typeof window.setupPrevClcrCardHeight === 'function') {
      window.setupPrevClcrCardHeight();
      return;
    }
    // Fallback: zachowaj oryginalną funkcjonalność tylko jeśli nowa funkcja nie istnieje.
    const clcrForm = document.getElementById('clcrForm');
    if (!clcrForm || !clcrForm.classList.contains('has-prev-clcr')) {
      return;
    }
    const patientFieldset = document.getElementById('patientSet') || clcrForm.querySelector('.patient-card fieldset');
    const prevClcrCard = document.getElementById('prevClcrCard');
    if (!patientFieldset || !prevClcrCard) {
      return;
    }
    const listContainer = prevClcrCard.querySelector('.prev-clcr-sections');
    prevClcrCard.style.height = '';
    prevClcrCard.style.minHeight = '';
    prevClcrCard.style.maxHeight = '';
    if (listContainer) {
      listContainer.style.overflowY = '';
    }
    const isDesktop = typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(min-width: 700px)').matches;
    if (!isDesktop) {
      return;
    }
    const patientHeight = patientFieldset.getBoundingClientRect().height;
    if (!patientHeight || patientHeight <= 0) {
      return;
    }
    const hPx = patientHeight + 'px';
    prevClcrCard.style.height = hPx;
    prevClcrCard.style.minHeight = hPx;
    prevClcrCard.style.maxHeight = hPx;
    if (listContainer) {
      listContainer.style.overflowY = 'auto';
    }
  } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 7143 });
    }
  }
}
function __renderPrevClcrSummary(data) {
  try {
    const clcrData = data && data.clcr;
    if (!clcrData || !clcrData.summary) return;

    const summary  = clcrData.summary || {};
    const clcrArr  = Array.isArray(summary.clcr)  ? summary.clcr  : [];
    const elecArr  = Array.isArray(summary.elec)  ? summary.elec  : [];
    const stoneArr = Array.isArray(summary.stone) ? summary.stone : [];
    const ktvArr   = Array.isArray(summary.ktv)   ? summary.ktv   : [];

    // Jeśli w pliku nie ma żadnych podsumowań z modułu klirensu – nic nie pokazujemy
    if (!clcrArr.length && !elecArr.length && !stoneArr.length && !ktvArr.length) {
      return;
    }

    const clcrForm = document.getElementById('clcrForm');
    if (!clcrForm) return;

    // Utwórz (lub pobierz) kartę "Ostatni pomiar"
    let prevClcrCard = document.getElementById('prevClcrCard');
    if (!prevClcrCard) {
      prevClcrCard = document.createElement('div');
      prevClcrCard.id = 'prevClcrCard';
      prevClcrCard.className = 'card';
    } else {
      prevClcrCard.classList.add('card');
    }

    // Upewnij się, że karta jest dzieckiem formularza
    if (prevClcrCard.parentNode !== clcrForm) {
      clcrForm.appendChild(prevClcrCard);
    }

    // Ustaw kartę bezpośrednio za sekcją „Dane pacjenta”
    const patientCard = clcrForm.querySelector('.patient-card');
    if (patientCard) {
      const next = patientCard.nextElementSibling;
      if (next !== prevClcrCard) {
        if (next) {
          clcrForm.insertBefore(prevClcrCard, next);
        } else {
          clcrForm.appendChild(prevClcrCard);
        }
      }
    }

    // Włącz tryb dwukolumnowy – CSS ustawi patient + prevClcr w jednym wierszu
    clcrForm.classList.add('has-prev-clcr');

    // Wyczyść zawartość karty i zbuduj ją od nowa
    vildaAppClearHtml(prevClcrCard);

    // --- Nagłówek karty ---
    const header = document.createElement('h2');
    header.textContent = 'Ostatni pomiar (klirens/eGFR)';
    header.style.textAlign = 'center';
    header.style.marginTop = '0';
    prevClcrCard.appendChild(header);

    // --- Metadane (pacjent, data, wiek, masa, wzrost) ---
    const meta = document.createElement('p');
    meta.className = 'prev-clcr-meta';
    meta.style.textAlign = 'center';
    meta.style.fontSize = '0.9rem';

    const user     = (data && data.user) || {};
    const fullName = (data && (data.fullName || data.name)) || '';
    const ageY     = user.age != null
      ? user.age
      : (user.ageMonths != null ? (user.ageMonths / 12).toFixed(1) : null);
    const weight   = user.weight;
    const height   = user.height;

    const metaParts = [];

    if (fullName) {
      metaParts.push('Pacjent: ' + fullName);
    }

    if (data && data.timestampISO) {
      const dt = new Date(data.timestampISO);
      if (!isNaN(dt.getTime())) {
        const dateStr = dt.toLocaleDateString('pl-PL');
        const timeStr = dt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
        metaParts.push('Data zapisu: ' + dateStr + ', ' + timeStr);
      }
    }

    const aux = [];
    if (ageY != null && isFinite(ageY)) aux.push('wiek ok. ' + ageY + ' lat');
    if (weight != null) aux.push('masa ' + weight + ' kg');
    if (height != null) aux.push('wzrost ' + height + ' cm');
    if (aux.length) metaParts.push(aux.join(', '));

    meta.textContent = metaParts.join(' \u2022 ');
    prevClcrCard.appendChild(meta);

    // Informacja o wersji kalkulatora
    const version = clcrData.currentVersion || clcrData.version;
    if (version) {
      const v = document.createElement('p');
      v.style.textAlign = 'center';
      v.style.fontSize = '0.85rem';
      v.style.color = 'var(--muted-text, #555)';

      let label = version;
      if (version === 'basic')    label = 'podstawowa';
      if (version === 'advanced') label = 'rozszerzona';
      if (version === 'spot')     label = 'spot (pojedyncza próbka moczu)';
      if (version === 'pro')      label = 'pełna (PRO)';

      v.textContent = 'Aktywna wersja kalkulatora (w momencie zapisu): ' + label;
      prevClcrCard.appendChild(v);
    }

    const hr = document.createElement('hr');
    hr.style.margin = '0.75rem 0 1rem';
    prevClcrCard.appendChild(hr);

    const listContainer = document.createElement('div');
    listContainer.className = 'prev-clcr-sections';
    prevClcrCard.appendChild(listContainer);

    const addSection = (titleText, arr) => {
      if (!arr || !arr.length) return;

      const section = document.createElement('div');
      section.className = 'prev-clcr-section';

      const h3 = document.createElement('h3');
      h3.textContent = titleText;
      h3.style.fontSize = '1rem';
      h3.style.margin = '0.25rem 0 0.5rem';
      section.appendChild(h3);

      const ul = document.createElement('ul');
      ul.style.margin = '0 0 0.75rem';
      ul.style.paddingLeft = '1.1rem';

      arr.forEach((row) => {
        if (!row) return;
        const text = typeof row === 'string' ? row : row.text;
        if (!text) return;

        const li = document.createElement('li');
        li.textContent = text;

        const isOut = typeof row === 'object' && !!row.isOut;
        if (isOut) {
          li.style.fontWeight = '600';
          li.style.color = 'var(--danger, #b00020)';
        }

        ul.appendChild(li);
      });

      if (ul.children.length) {
        section.appendChild(ul);
        listContainer.appendChild(section);
      }
    };

    // Sekcje: wszystkie obliczenia z modułu Klirens
    addSection('Wyniki klirensu / eGFR', clcrArr);
    addSection('Parametry surowicy i DZM', elecArr);
    addSection('Ryzyko kamicy nerkowej', stoneArr);
    addSection('Parametry dializy / KT/V', ktvArr);

    // Dopasuj wysokość karty do "Dane pacjenta"
    __syncPrevClcrCardHeight();

    // Jednorazowo podpinamy się pod resize i zmiany w formularzu,
    // żeby wysokość karty aktualizowała się przy zmianie układu / pól.
    if (!window.__prevClcrLayoutBound) {
      window.__prevClcrLayoutBound = true;

      const schedulePrevClcrCardHeightResize = vildaCreateRafThrottledLayoutTask('prev-clcr-card-height-resize', function syncPrevClcrCardHeightAfterResize() {
        try { __syncPrevClcrCardHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 7325, step: '8P-7', context: 'prev-clcr-card-height-resize' });
    }
  }
      });
      window.addEventListener('resize', function handlePrevClcrCardHeightResize() {
        schedulePrevClcrCardHeightResize('resize');
      });

      const form = document.getElementById('clcrForm');
      if (form) {
        const handler = () => {
          try { __syncPrevClcrCardHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 7331 });
    }
  }
        };
        form.addEventListener('input', handler);
        form.addEventListener('change', handler);
      }
    }

  } catch (e) {
    console.error('Błąd w __renderPrevClcrSummary:', e);
  }
}


/*
 * Funkcja repositionDoctor() odpowiada za dynamiczne przenoszenie sekcji
 * przejścia do modułu lekarskiego (doctorWrapper) między oryginalnym
 * kontenerem w kolumnie formularza a dedykowanym kontenerem pod
 * komunikatem błędu w widoku jednokolumnowym. Jeżeli okno jest wąskie
 * (mniej niż 700 px), wówczas element jest przenoszony pod pola
 * obowiązkowe i wyświetlany z większym odstępem podczas oczekiwania na
 * dane (3 rem) lub z mniejszym odstępem, gdy wyniki są już wyświetlane
 * (1 rem). W trybie kompaktowym zmniejszamy także rozmiary czcionek
 * oraz samego checkboxa o 0,25 rem.
 */
function repositionDoctor() {
  // reposition disabled to prevent layout shifts
  return;
  const doctorWrapper = document.getElementById('doctorWrapper');
  const doctorContainer = document.getElementById('doctorContainer');
  const doctorMobileContainer = document.getElementById('doctorMobileContainer');
  const doctorBottomContainer = document.getElementById('doctorBottom');
  const pwzContainer = document.getElementById('pwzContainer');
  const prevSummaryWrap = document.getElementById('prevSummaryWrap');
  const resultsDiv = document.getElementById('results');
  const errorBox = document.getElementById('errorBox');
  const isDoctorCb = document.getElementById('isDoctor');
  if (!doctorWrapper || !doctorContainer || !doctorMobileContainer) return;

  // Jeżeli przewinięcie do wyników jest oczekiwane, ale sekcja modułu lekarza
  // została już przeniesiona (co może wpływać na pozycję kart wyników),
  // pozostawiamy obsługę przewijania funkcji repositionMetabolicSummary,
  // która zostanie wywołana jako kolejna.  Nie zerujemy flagi tutaj, aby
  // umożliwić przesunięcie po kompletnym repozycjonowaniu układu.
  // Determine whether we should show compact version
  const isMobile = window.innerWidth < 700;
  const resultsVisible = resultsDiv && resultsDiv.style && resultsDiv.style.display !== 'none';
  const isDoctor = isDoctorCb && isDoctorCb.checked;

  if (isMobile) {
    // Show the mobile container
    doctorMobileContainer.style.display = 'flex';
    doctorMobileContainer.style.justifyContent = 'center';
    doctorMobileContainer.style.alignItems = 'center';
    // Układ pionowy: umieszczamy elementy jeden pod drugim
    doctorMobileContainer.style.flexDirection = 'column';
    // Move wrapper into mobile container if not already there
    if (doctorWrapper.parentElement !== doctorMobileContainer) {
      doctorMobileContainer.appendChild(doctorWrapper);
    }
    // Jeśli istnieje kontener z polem na numer PWZ, przenieś go pod sekcję
    // przełącznika w widoku mobilnym, aby pole pojawiało się bezpośrednio
    // pod przyciskiem „Przejdź do modułu lekarskiego”.
    if (pwzContainer && pwzContainer.parentElement !== doctorMobileContainer) {
      doctorMobileContainer.appendChild(pwzContainer);
    }
    // Przenieś podsumowanie pomiarów poniżej sekcji modułu lekarskiego w mobilnym układzie
    if (prevSummaryWrap && prevSummaryWrap.parentElement !== doctorMobileContainer) {
      if (pwzContainer && pwzContainer.parentElement === doctorMobileContainer) {
        doctorMobileContainer.insertBefore(prevSummaryWrap, pwzContainer);
      } else {
        doctorMobileContainer.appendChild(prevSummaryWrap);
      }
    }
    // Ustawienie kolejności: upewnij się, że karta podsumowania jest przed sekcją lekarza w mobilnym układzie
    if (prevSummaryWrap && doctorWrapper && prevSummaryWrap.parentElement === doctorMobileContainer) {
      doctorMobileContainer.insertBefore(prevSummaryWrap, doctorWrapper);
    }
    // Hide original container (to avoid taking up space)
    doctorContainer.style.display = 'none';
    // Ukryj kontener dolny w widoku mobilnym
    if (doctorBottomContainer) {
      doctorBottomContainer.style.display = 'none';
    }
    // Apply spacing and sizing
    if (!resultsVisible) {
      // waiting for data – larger gap and normal size
      doctorWrapper.classList.remove('compact');
      doctorWrapper.style.marginTop = '3rem';
      doctorWrapper.style.marginBottom = '0';
    } else {
      // results visible – smaller gap; shrink size only if użytkownik nie jest lekarzem
      doctorWrapper.style.marginTop = '1rem';
      doctorWrapper.style.marginBottom = '1rem';
      if (!isDoctor) {
        doctorWrapper.classList.add('compact');
      } else {
        doctorWrapper.classList.remove('compact');
      }
    }
  } else {
    // Large screens: przenieś sekcję modułu lekarskiego do kontenera dolnego
    // oraz pozostaw podsumowanie pomiarów w oryginalnym kontenerze.
    if (doctorBottomContainer) {
      // Pokaż i wyśrodkuj dolny kontener
      doctorBottomContainer.style.display = 'flex';
      doctorBottomContainer.style.justifyContent = 'center';
      doctorBottomContainer.style.alignItems = 'center';
      doctorBottomContainer.style.flexDirection = 'column';
      // Przenieś sekcję lekarza do kontenera dolnego
      if (doctorWrapper.parentElement !== doctorBottomContainer) {
        doctorBottomContainer.appendChild(doctorWrapper);
      }
      // Przenieś pole PWZ do kontenera dolnego
      if (pwzContainer && pwzContainer.parentElement !== doctorBottomContainer) {
        doctorBottomContainer.appendChild(pwzContainer);
      }
    }
    // Upewnij się, że podsumowanie pomiarów znajduje się w oryginalnym kontenerze
    if (prevSummaryWrap && prevSummaryWrap.parentElement !== doctorContainer) {
      doctorContainer.appendChild(prevSummaryWrap);
    }
    // W widoku szerokim ukryj kontener mobilny i przywróć widoczność oryginalnego kontenera
    doctorContainer.style.display = '';
    doctorMobileContainer.style.display = 'none';
    // Usuń ustawienie kierunku flex w kontenerze mobilnym w razie ponownego przełączenia
    doctorMobileContainer.style.flexDirection = '';
    // Ustaw marginesy sekcji lekarskiej w zależności od stanu wyników
    if (!resultsVisible) {
      // waiting for data – większa przerwa i pełny rozmiar
      doctorWrapper.classList.remove('compact');
      doctorWrapper.style.marginTop = '3rem';
      doctorWrapper.style.marginBottom = '0';
    } else {
      // wyniki widoczne – mniejsza przerwa; zmniejsz rozmiar tylko, gdy użytkownik nie jest lekarzem
      doctorWrapper.style.marginTop = '1rem';
      doctorWrapper.style.marginBottom = '1rem';
      if (!isDoctor) {
        doctorWrapper.classList.add('compact');
      } else {
        doctorWrapper.classList.remove('compact');
      }
    }
  }

  // Po zakończeniu zmiany położenia sekcji modułu lekarskiego (zarówno w widoku
  // mobilnym, jak i desktopowym), ponownie wyrównaj szerokości przycisków
  // testów. Użycie requestAnimationFrame gwarantuje, że pomiar zostanie
  // wykonany po zakończeniu reflow.
  if (typeof adjustTestButtonWidths === 'function') {
    requestAnimationFrame(() => adjustTestButtonWidths());
  }
}

/*
 * Funkcja repositionMetabolicSummary() odpowiada za dynamiczne przenoszenie
 * przycisku podsumowania wyników pomiędzy kolumnami w zależności od szerokości
 * okna. W układzie jednokolumnowym (np. szerokość < 700 px) przycisk
 * "Podsumowanie wyników – kliknij i skopiuj" ma znajdować się przed kartą
 * "Centyle i BMI" w lewej kolumnie. Na większych
 * ekranach przycisk pozostaje w prawej kolumnie (normWrapper) za kartą WFL.
 */
function repositionMetabolicSummary() {
  // reposition disabled to prevent layout shifts
  return;
  const section = document.getElementById('metabolicSummarySection');
  const leftColumn = document.getElementById('leftColumnWrap');
  const normWrapper = document.getElementById('normWrapper');
  const bmiCard = document.getElementById('bmiCard');
  const wflCard = document.getElementById('wflCard');
  if (!section || !leftColumn || !normWrapper) return;
  const isMobile = window.innerWidth < 700;
  if (isMobile) {
    // W widoku mobilnym przenieś sekcję nad kartę BMI
    // Jeśli nie znajduje się już w lewej kolumnie, dodaj ją tam
    if (section.parentElement !== leftColumn) {
      leftColumn.insertBefore(section, leftColumn.firstChild);
    }
    // Upewnij się, że sekcja znajduje się bezpośrednio przed kartą BMI
    if (bmiCard && section.nextSibling !== bmiCard) {
      leftColumn.insertBefore(section, bmiCard);
    }
  } else {
    // W widoku szerokim przywróć sekcję do prawej kolumny (normWrapper)
    if (section.parentElement !== normWrapper) {
      // Jeśli istnieje karta WFL w normWrapper, umieść przycisk bezpośrednio za nią.
      if (wflCard && wflCard.parentElement === normWrapper) {
        // insertAfter: w JS insertBefore z nextSibling
        normWrapper.insertBefore(section, wflCard.nextSibling);
      } else {
        normWrapper.insertBefore(section, normWrapper.firstChild);
      }
    } else {
      // Upewnij się, że sekcja jest za kartą WFL, jeśli WFL jest widoczna
      if (wflCard && wflCard.parentElement === normWrapper) {
        const expectedPos = wflCard.nextSibling;
        if (expectedPos !== section) {
          normWrapper.insertBefore(section, expectedPos);
        }
      }
    }
  }

  // Po zakończeniu repozycjonowania, jeżeli oczekuje przewinięcia do
  // wyników, wykonaj je teraz.  Sprawdzamy także, czy element wyników
  // jest widoczny (display: grid) – w przeciwnym razie przewijanie nie
  // zostanie wywołane.  Po przewinięciu zerujemy flagę, aby uniknąć
  // kolejnych przewinięć przy przyszłych zmianach układu.
  try {
    // Jeżeli flaga przewijania jest ustawiona, zaplanuj płynne przewinięcie
    // do karty wyników w następnym cyklu animacji.  Użycie
    // requestAnimationFrame zapewnia, że DOM został już przebudowany i
    // elementy znajdują się na właściwych pozycjach, co pozwala na poprawne
    // obliczenie współrzędnych.  Po wykonaniu przewinięcia resetujemy flagę.
    if (pendingResultsScroll) {
      requestAnimationFrame(() => {
        try {
          scrollToResultsCard();
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 20144 });
    }
  } finally {
          pendingResultsScroll = false;
        }
      });
    }
  } catch (e) {
    // ignorujemy błędy zewnętrzne, ale resetujemy flagę, by zapobiec
    // nieskończonemu oczekiwaniu na przewinięcie przy kolejnych zmianach
    pendingResultsScroll = false;
  }
}


/**
 * Aktualizuje widoczność sekcji „Podsumowanie metaboliczne”.
 * Sekcja jest widoczna tylko, gdy użytkownik podał minimalny zestaw danych: wiek, wagę oraz wzrost.
 */
function updateMetabolicSummaryVisibility() {
  const section = document.getElementById('metabolicSummarySection');
  if (!section) return;
  const summaryBtnEl = document.getElementById('metabolicSummaryBtn');
  const dietBtnEl    = document.getElementById('dietRecommendationsBtn');
  // Tryb wyników: sekcja jest dostępna tylko w trybie profesjonalnym
  let proMode = false;
  try {
    if (typeof window !== 'undefined' && typeof window.professionalMode !== 'undefined') {
      proMode = !!window.professionalMode;
    } else if (typeof professionalMode !== 'undefined') {
      proMode = !!professionalMode;
    } else {
      proMode = (readResultsModeStorage() === 'professional');
    }
  } catch (_) {
    proMode = false;
  }
  // Ustawienia widoczności przycisków: każdy przycisk może być wyłączony w ustawieniach
  let showSummarySetting = true;
  let showDietSetting    = true;
  try {
    const persistence = (typeof window !== 'undefined') ? window.VildaPersistence : null;
    const settings = persistence && typeof persistence.readPreferenceJSON === 'function'
      ? persistence.readPreferenceJSON('CARD_VISIBILITY', {})
      : {};
    showSummarySetting = settings['metabolicSummaryBtn'] !== false;
    showDietSetting    = settings['dietRecommendationsBtn'] !== false;
  } catch (_) {
    showSummarySetting = true;
    showDietSetting    = true;
  }
  // Wartości wieku – korzystamy z funkcji getAgeDecimal(), która sumuje lata i miesiące.
  const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
  const weightVal = parseFloat(document.getElementById('weight')?.value);
  const heightVal = parseFloat(document.getElementById('height')?.value);
  const anthroValidation = (typeof vildaGetMainAnthroValidationSnapshot === 'function')
    ? vildaGetMainAnthroValidationSnapshot()
    : null;
  // Minimalny zestaw danych — wiek 0 lat jest legalny, jeśli został jawnie wpisany.
  const hasData = anthroValidation
    ? anthroValidation.complete
    : (vildaIsFiniteNonNegative(ageYears) && vildaIsFinitePositive(weightVal) && vildaIsFinitePositive(heightVal));
  // Czy wyświetlać przycisk podsumowania
  const showSummary = proMode && showSummarySetting && hasData;
  if (summaryBtnEl) {
    summaryBtnEl.style.display = showSummary ? 'block' : 'none';
  }
  // Kontener sekcji wyświetlamy, gdy są spełnione warunki: tryb profesjonalny,
  // minimalne dane oraz co najmniej jeden z przycisków ma być widoczny.
  const showContainer = proMode && hasData && (showSummarySetting || showDietSetting);
  if (showContainer) {
    section.style.display = 'block';
    if (!section.classList.contains('animate-in')) {
      section.classList.add('animate-in');
    }
  } else {
    section.style.display = 'none';
  }
  // Nie zarządzamy tutaj przyciskiem zaleceń dietetycznych – jego widoczność
  // ustala updateDietRecommendationsVisibility(), aby wziąć pod uwagę warunki
  // nadwagi/otyłości oraz ustawienia użytkownika.
}

/**
 * Generuje tekstowy raport „Podsumowanie metaboliczne” na podstawie bieżących danych i wyników obliczeń.
 * Wyniki są umieszczane w oddzielnych liniach. W razie braku konkretnych danych dany element jest pomijany.
 * Funkcja wykorzystuje globalne zmienne i funkcje do ponownego obliczenia centyli wagi, wzrostu i BMI,
 * a także odczytuje wyniki z modułów ciśnienia krwi, obwodów oraz zaawansowanego wzrostu.
 * @returns {string} Tekst podsumowania, gotowy do skopiowania do schowka.
 */
function generateMetabolicSummary() {
  const lines = [];
  // Odczytaj dane wejściowe
  const weightVal = parseFloat(document.getElementById('weight')?.value);
  const heightVal = parseFloat(document.getElementById('height')?.value);
  const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
  const sexEl = document.getElementById('sex');
  const sexVal = sexEl ? sexEl.value : 'M';
  const isAdultPatient = (typeof patientReportIsAdultAgeForCurrentMode === 'function')
    ? patientReportIsAdultAgeForCurrentMode(ageYears)
    : ((typeof patientReportIsAdultAge === 'function')
      ? patientReportIsAdultAge(ageYears)
      : (isFinite(ageYears) && ageYears >= 18));
  const referenceAgeYears = (typeof patientReportGetReferenceAgeYears === 'function')
    ? patientReportGetReferenceAgeYears(ageYears)
    : ageYears;
  const reportPreferredSource = (typeof patientReportGetPreferredSource === 'function')
    ? patientReportGetPreferredSource()
    : ((typeof bmiSource !== 'undefined' && bmiSource) ? String(bmiSource).toUpperCase() : 'OLAF');
  // Tryb profesjonalny
  const pro = (typeof window !== 'undefined' && window.professionalMode) ? window.professionalMode : false;
  const anthroValidation = (typeof vildaGetMainAnthroValidationSnapshot === 'function')
    ? vildaGetMainAnthroValidationSnapshot()
    : null;

  // Warunki minimalne: waga, wzrost i jawnie podany wiek. Wiek 0 lat jest poprawny.
  if (anthroValidation
    ? anthroValidation.complete
    : (vildaIsFiniteNonNegative(ageYears) && vildaIsFinitePositive(weightVal) && vildaIsFinitePositive(heightVal))) {
    // Oblicz statystyki wagi i wzrostu (percentyl i z-score)
    let statsW, statsH;
    let statsWSource = reportPreferredSource;
    let statsHSource = reportPreferredSource;
    const useAdultReferenceSummary = isAdultPatient
      && typeof advHistoryResolveMetric === 'function'
      && typeof referenceAgeYears === 'number'
      && isFinite(referenceAgeYears)
      && referenceAgeYears > 0;
    const usePal = !useAdultReferenceSummary && (typeof bmiSource !== 'undefined' &&
                   (bmiSource === 'PALCZEWSKA' ||
                    (bmiSource === 'OLAF' && ageYears < OLAF_DATA_MIN_AGE)));
    if (useAdultReferenceSummary) {
      const weightResolved = advHistoryResolveMetric('WT', weightVal, sexVal, referenceAgeYears, reportPreferredSource);
      const heightResolved = advHistoryResolveMetric('HT', heightVal, sexVal, referenceAgeYears, reportPreferredSource);
      statsW = weightResolved && weightResolved.result ? weightResolved.result : null;
      statsH = heightResolved && heightResolved.result ? heightResolved.result : null;
      statsWSource = (weightResolved && weightResolved.source) ? weightResolved.source : reportPreferredSource;
      statsHSource = (heightResolved && heightResolved.source) ? heightResolved.source : reportPreferredSource;
    } else if (usePal) {
      statsW = calcPercentileStatsPal(weightVal, sexVal, ageYears, 'WT');
      statsH = calcPercentileStatsPal(heightVal, sexVal, ageYears, 'HT');
    } else {
      statsW = calcPercentileStats(weightVal, sexVal, ageYears, 'WT');
      statsH = calcPercentileStats(heightVal, sexVal, ageYears, 'HT');
    }
    // Oblicz wartości graniczne 3. i 97. centyla dla wagi i wzrostu.
    // Są one używane do wyświetlania, ile kilogramów lub centymetrów brakuje do 3. centyla
    // oraz o ile dany parametr przekracza 97. centyl. Wartości te zależą od wyboru
    // siatek centylowych (Palczewska/OLAF/WHO) i wieku dziecka.
    let w3, w97, h3, h97;
    const monthsWH = Math.round(ageYears * 12);
    if (statsW && statsH) {
      if (useAdultReferenceSummary && typeof patientReportGetMetricValueAtPercentile === 'function') {
        w3 = patientReportGetMetricValueAtPercentile('WT', sexVal, referenceAgeYears, 3, statsWSource);
        w97 = patientReportGetMetricValueAtPercentile('WT', sexVal, referenceAgeYears, 97, statsWSource);
        h3 = patientReportGetMetricValueAtPercentile('HT', sexVal, referenceAgeYears, 3, statsHSource);
        h97 = patientReportGetMetricValueAtPercentile('HT', sexVal, referenceAgeYears, 97, statsHSource);
      } else if (usePal) {
        // Skorzystaj z siatek Palczewskiej dla granicznych centyli
        w3  = getPalCentile(sexVal, monthsWH, 3, 'WT');
        w97 = getPalCentile(sexVal, monthsWH, 97, 'WT');
        h3  = getPalCentile(sexVal, monthsWH, 3, 'HT');
        h97 = getPalCentile(sexVal, monthsWH, 97, 'HT');
      } else {
        // Użyj funkcji LMS (WHO/OLAF) dla obliczenia wartości granicznych
        const lmsW = getChildLMS(sexVal, ageYears, 'WT');
        if (lmsW) {
          w3 = (lmsW[0] !== 0)
             ? lmsW[1] * Math.pow(1 + lmsW[0] * lmsW[2] * Z3, 1 / lmsW[0])
             : lmsW[1] * Math.exp(lmsW[2] * Z3);
          w97 = (lmsW[0] !== 0)
              ? lmsW[1] * Math.pow(1 + lmsW[0] * lmsW[2] * Z97, 1 / lmsW[0])
              : lmsW[1] * Math.exp(lmsW[2] * Z97);
        }
        const lmsH = getChildLMS(sexVal, ageYears, 'HT');
        if (lmsH) {
          h3 = (lmsH[0] !== 0)
             ? lmsH[1] * Math.pow(1 + lmsH[0] * lmsH[2] * Z3, 1 / lmsH[0])
             : lmsH[1] * Math.exp(lmsH[2] * Z3);
          h97 = (lmsH[0] !== 0)
              ? lmsH[1] * Math.pow(1 + lmsH[0] * lmsH[2] * Z97, 1 / lmsH[0])
              : lmsH[1] * Math.exp(lmsH[2] * Z97);
        }
      }
    }
    // Waga
    if (statsW && typeof statsW.percentile === 'number') {
      if (isAdultPatient) {
        const adultWeightPopulationText = patientReportBuildAdultWeightPopulationSummaryText(weightVal, heightVal, sexVal, ageYears);
        lines.push(`Waga: ${adultWeightPopulationText}`);
      } else {
        // Format percentyl tak, aby skrajne wartości (<1, >99,9) były wyświetlane jako "<1" lub ">100".
        let percStr = formatCentile(statsW.percentile);
        // Określ właściwy rodzaj rzeczownika („centyl” vs „centyla”) na podstawie zakodowanych znaków
        let word = centylWord(percStr);
        // Zamień encje HTML na zwykłe znaki w tekście podsumowania
        let decoded = percStr.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        let line = `Waga: ${decoded} ${word}`;
        if (pro && typeof statsW.sd === 'number' && !isNaN(statsW.sd)) {
          line += ` (Z‑score = ${statsW.sd.toFixed(2).replace('.', ',')})`;
        }
        // Dla skrajnie niskich wartości (zaokrąglony centyl ≤ 2) podaj, ile kg brakuje do 3. centyla
        const roundedWeightCent = Math.round(statsW.percentile);
        if (typeof w3 === 'number' && roundedWeightCent <= 2) {
          // używamy zwykłej spacji do oddzielenia jednostki od liczby, aby uniknąć niewidzialnych znaków
          line += `, brakuje ${(w3 - weightVal).toFixed(1).replace('.', ',')} kg do 3 centyla`;
        }
        // Dla wartości ≥98. centyla podaj, o ile kilogramów przekracza 97. centyl
        if (typeof w97 === 'number' && statsW.percentile >= 98) {
          line += `, +${(weightVal - w97).toFixed(1).replace('.', ',')} kg ponad 97 centyl`;
        }
        lines.push(line);
      }

    }
    // Wzrost
    if (statsH && typeof statsH.percentile === 'number') {
      if (isAdultPatient) {
        const adultHeightPopulationText = patientReportBuildAdultHeightPopulationSummaryText(heightVal, sexVal, ageYears);
        lines.push(`Wzrost: ${adultHeightPopulationText}`);
      } else {
        let percStr = formatCentile(statsH.percentile);
        let word = centylWord(percStr);
        let decoded = percStr.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        let line = `Wzrost: ${decoded} ${word}`;
        if (pro && typeof statsH.sd === 'number' && !isNaN(statsH.sd)) {
          line += ` (Z‑score = ${statsH.sd.toFixed(2).replace('.', ',')})`;
        }
        // Dla skrajnie niskich wartości (zaokrąglony centyl ≤ 2) podaj, ile cm brakuje do 3. centyla
        const roundedHeightCent = Math.round(statsH.percentile);
        if (typeof h3 === 'number' && roundedHeightCent <= 2) {
          // stosujemy zwykłe spacje zamiast wąskiej spacji, aby poprawić kompatybilność z edytorami
          line += `, brakuje ${(h3 - heightVal).toFixed(1).replace('.', ',')} cm do 3 centyla`;
        }
        // Dla wartości ≥98. centyla podaj, o ile centymetrów przekracza 97. centyl
        if (typeof h97 === 'number' && statsH.percentile >= 98) {
          line += `, +${(heightVal - h97).toFixed(1).replace('.', ',')} cm ponad 97 centyl`;
        }
        lines.push(line);
      }
    }
    // BMI
    const bmi = BMI(weightVal, heightVal);
    if (bmi && !isNaN(bmi)) {
      const months = Math.round(ageYears * 12);
      let bmiPerc = null;
      // Oblicz percentyl BMI wyłącznie u dzieci i młodzieży.
      if (!isAdultPatient && ageYears >= CHILD_AGE_MIN && ageYears <= CHILD_AGE_MAX) {
        bmiPerc = bmiPercentileChild(bmi, sexVal, months);
      }
      let line = `BMI: ${bmi.toFixed(1).replace('.', ',')}`;
      if (isAdultPatient) {
        const adultAssessment = (typeof patientReportGetAdultBmiAssessment === 'function')
          ? patientReportGetAdultBmiAssessment(bmi)
          : null;
        const adultStatusLabel = patientReportGetAdultBmiSummaryStatusLabel(adultAssessment && adultAssessment.state);
        const adultDeltaSentence = patientReportBuildAdultBmiWeightDeltaSentence(weightVal, heightVal);
        const adultPopulationSentence = patientReportBuildAdultBmiPopulationSummaryText(bmi, sexVal, ageYears);
        line += ` – ${adultStatusLabel}`;
        const adultParts = [];
        if (adultDeltaSentence) {
          const adultDeltaContinuation = adultDeltaSentence.charAt(0).toLowerCase() + adultDeltaSentence.slice(1);
          adultParts.push(adultDeltaContinuation.replace(/\.$/, ''));
        }
        if (adultPopulationSentence) {
          adultParts.push(String(adultPopulationSentence).replace(/\.$/, ''));
        }
        if (adultParts.length) {
          line += `, ${adultParts.join('; ')}.`;
        } else {
          line += '.';
        }
      } else {
        if (typeof bmiPerc === 'number') {
          // BMI percentyl również formatujemy przy użyciu formatCentile, aby zachować spójność ze wzrostem i wagą
          let percStrBmi = formatCentile(bmiPerc);
          let wordBmi   = centylWord(percStrBmi);
          let decodedBmi = percStrBmi.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
          line += ` – ${decodedBmi} ${wordBmi}`;
        }
        // Oblicz z-score BMI w trybie profesjonalnym tylko u dzieci i młodzieży.
        if (pro && ageYears >= CHILD_AGE_MIN && ageYears <= CHILD_AGE_MAX) {
          const bmiZ = bmiZscore(bmi, sexVal, months);
          if (bmiZ !== null && !isNaN(bmiZ)) {
            line += ` (Z‑score = ${bmiZ.toFixed(2).replace('.', ',')})`;
          }
        }
      }
      lines.push(line);
    }
    // Powierzchnia ciała (BSA)
    // Niektóre moduły mogą nie eksportować funkcji BSA_Haycock do zasięgu globalnego,
    // co powoduje ReferenceError podczas wywołania generateMetabolicSummary().
    // Definiujemy funkcję pomocniczą bsaFunc: jeśli istnieje globalna
    // funkcja BSA_Haycock, użyjemy jej; w przeciwnym razie obliczamy BSA
    // bezpośrednio wzorem Haycocka.
    const bsaFunc = (typeof BSA_Haycock === 'function') ? BSA_Haycock : function(weight, height){
      return 0.024265 * Math.pow(weight, 0.5378) * Math.pow(height, 0.3964);
    };
    const bsa = bsaFunc(weightVal, heightVal);
    if (bsa && !isNaN(bsa)) {
      lines.push(`Pow. ciała: ${bsa.toFixed(2).replace('.', ',')} m²`);
    }
    // Wskaźnik Cole’a pokazujemy wyłącznie u dzieci i młodzieży.
    // Dla pacjentów dorosłych nie włączamy go ani do obliczeń, ani do podsumowania.
    let coleVal = null;
    if (!isAdultPatient) {
      coleVal = (typeof window !== 'undefined'
        && typeof window.colePercentValue === 'number'
        && !isNaN(window.colePercentValue))
        ? window.colePercentValue
        : null;

      if ((coleVal === null || coleVal === undefined)
          && ageYears >= CHILD_AGE_MIN && ageYears <= CHILD_AGE_MAX
          && typeof getLMS === 'function') {
        try {
          const monthsCole = Math.round(ageYears * 12);
          const lmsBMI = getLMS(sexVal, monthsCole);
          if (lmsBMI && Array.isArray(lmsBMI) && lmsBMI[1] > 0) {
            // jeśli BMI nie zostało jeszcze policzone, oblicz je pomocniczo
            const bmiForCole = (typeof bmi === 'number' && !isNaN(bmi))
              ? bmi
              : BMI(weightVal, heightVal);
            if (bmiForCole && !isNaN(bmiForCole)) {
              coleVal = (bmiForCole / lmsBMI[1]) * 100;
            }
          }
        } catch (_) {
          coleVal = null;
        }
      }
    }

    if (coleVal !== null && coleVal !== undefined && !isNaN(coleVal)) {
      lines.push(`Wskaźnik Cole’a: ${coleVal.toFixed(1).replace('.', ',')}%`);
    }

    // --- Obwody talii/bioder i WHR ---
    // Jeśli użytkownik wprowadził pomiary talii i bioder, dołącz je do podsumowania.
    // W przypadku dzieci (3–18 lat) spróbuj obliczyć centyle na podstawie siatek;
    // dla dorosłych lub braku centyli pokaż tylko wartości w cm.
    try {
      const waistInput = document.getElementById('waistCm');
      const hipInput   = document.getElementById('hipCm');
      const waistVal   = waistInput ? parseFloat(waistInput.value) : NaN;
      const hipVal     = hipInput   ? parseFloat(hipInput.value)   : NaN;
      // Oblicz centyle talii i bioder dla dzieci, jeśli to możliwe
      let percRes = null;
      if (waistVal > 0 && hipVal > 0 && ageYears >= 3 && ageYears <= 18 && typeof childPercentileFromTables === 'function') {
        try {
          percRes = childPercentileFromTables(ageYears, sexVal, waistVal, hipVal);
        } catch (_) {
          percRes = null;
        }
      }
      // Obwód talii
      if (waistVal && !isNaN(waistVal) && waistVal > 0) {
        let line = `Obwód talii: ${waistVal.toFixed(1).replace('.', ',')} cm`;
        if (percRes && typeof percRes.waistP === 'number' && isFinite(percRes.waistP)) {
          const cent = Math.round(percRes.waistP);
          line += `, ${cent} centyl`;
        }
        lines.push(line);
      }
      // Obwód bioder
      if (hipVal && !isNaN(hipVal) && hipVal > 0) {
        let line = `Obwód bioder: ${hipVal.toFixed(1).replace('.', ',')} cm`;
        if (percRes && typeof percRes.hipP === 'number' && isFinite(percRes.hipP)) {
          const cent = Math.round(percRes.hipP);
          line += `, ${cent} centyl`;
        }
        lines.push(line);
      }
      // Wskaźnik WHR (talia/biodra)
      if (waistVal > 0 && hipVal > 0) {
        const whrVal = waistVal / hipVal;
        if (isFinite(whrVal)) {
          lines.push(`WHR: ${whrVal.toFixed(2).replace('.', ',')}`);
        }
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 24567 });
    }
  }
  }
  // Ciśnienie i tętno
  if (isAdultPatient && window.adultVitalsApi && typeof window.adultVitalsApi.buildSummaryLines === 'function') {
    try {
      const adultState = (typeof window.adultVitalsApi.getState === 'function')
        ? window.adultVitalsApi.getState()
        : null;
      const adultVitalLines = window.adultVitalsApi.buildSummaryLines(adultState);
      (adultVitalLines || []).forEach((line) => {
        if (line) lines.push(line);
      });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 24581 });
    }
  }
  } else {
    // Ciśnienie – odczytaj globalne zmienne ustawione przez bp_module.js
    const bpSystolicCurrent = parseFloat(document.getElementById('bpSystolic')?.value);
    const bpDiastolicCurrent = parseFloat(document.getElementById('bpDiastolic')?.value);
    let summaryBpEval = null;
    try {
      if (bpSystolicCurrent > 0 && bpDiastolicCurrent > 0 && heightVal > 0
          && typeof referenceAgeYears === 'number' && isFinite(referenceAgeYears) && referenceAgeYears > 0
          && window.bpModuleApi && typeof window.bpModuleApi.computePediatricBp === 'function') {
        summaryBpEval = window.bpModuleApi.computePediatricBp({
          ageYears: referenceAgeYears,
          sex: sexVal,
          heightCm: heightVal,
          sbp: bpSystolicCurrent,
          dbp: bpDiastolicCurrent,
          datasetChoice: undefined
        });
      }
    } catch (_) {
      summaryBpEval = null;
    }
    const summaryPercSbp = (summaryBpEval && summaryBpEval.ok && typeof summaryBpEval.percSbp === 'number' && isFinite(summaryBpEval.percSbp))
      ? summaryBpEval.percSbp
      : ((typeof window.percSbp === 'number' && !isNaN(window.percSbp)) ? window.percSbp : null);
    const summaryPercDbp = (summaryBpEval && summaryBpEval.ok && typeof summaryBpEval.percDbp === 'number' && isFinite(summaryBpEval.percDbp))
      ? summaryBpEval.percDbp
      : ((typeof window.percDbp === 'number' && !isNaN(window.percDbp)) ? window.percDbp : null);
    const summaryZSbp = (summaryBpEval && summaryBpEval.ok && typeof summaryBpEval.zSbp === 'number' && isFinite(summaryBpEval.zSbp))
      ? summaryBpEval.zSbp
      : ((typeof window.zSbp === 'number' && !isNaN(window.zSbp)) ? window.zSbp : null);
    const summaryZDbp = (summaryBpEval && summaryBpEval.ok && typeof summaryBpEval.zDbp === 'number' && isFinite(summaryBpEval.zDbp))
      ? summaryBpEval.zDbp
      : ((typeof window.zDbp === 'number' && !isNaN(window.zDbp)) ? window.zDbp : null);
    if (bpSystolicCurrent > 0 && typeof summaryPercSbp === 'number' && !isNaN(summaryPercSbp)) {
      let line = `Ciśnienie skurczowe: ${Math.round(summaryPercSbp)} centyl`;
      if (pro && typeof summaryZSbp === 'number' && !isNaN(summaryZSbp)) {
        line += ` (Z‑score = ${summaryZSbp.toFixed(2).replace('.', ',')})`;
      }
      lines.push(line);
    }
    if (bpDiastolicCurrent > 0 && typeof summaryPercDbp === 'number' && !isNaN(summaryPercDbp)) {
      let line = `Ciśnienie rozkurczowe: ${Math.round(summaryPercDbp)} centyl`;
      if (pro && typeof summaryZDbp === 'number' && !isNaN(summaryZDbp)) {
        line += ` (Z‑score = ${summaryZDbp.toFixed(2).replace('.', ',')})`;
      }
      lines.push(line);
    }
  }
  // Obwód głowy i klatki piersiowej – ustawiane przez circumference_module.js
  const headCircCurrent = parseFloat(document.getElementById('headCircumference')?.value);
  const chestCircCurrent = parseFloat(document.getElementById('chestCircumference')?.value);
  if (headCircCurrent > 0 && typeof window.headCircPercentile === 'number' && isFinite(window.headCircPercentile)) {
    let line = `Obwód głowy: ${Math.round(window.headCircPercentile)} centyl`;
    if (pro && typeof window.headCircSD === 'number' && isFinite(window.headCircSD)) {
      line += ` (Z‑score = ${window.headCircSD.toFixed(2).replace('.', ',')})`;
    }
    lines.push(line);
  }
  if (chestCircCurrent > 0 && typeof window.chestCircPercentile === 'number' && isFinite(window.chestCircPercentile)) {
    let line = `Obwód klatki piersiowej: ${Math.round(window.chestCircPercentile)} centyl`;
    if (pro && typeof window.chestCircSD === 'number' && isFinite(window.chestCircSD)) {
      line += ` (Z‑score = ${window.chestCircSD.toFixed(2).replace('.', ',')})`;
    }
    lines.push(line);
  }
  // Tempo wzrastania i potencjał wzrostowy – z advancedGrowthData
  const agd = (typeof window.advancedGrowthData !== 'undefined') ? window.advancedGrowthData : null;
  if (agd) {
    // Tempo wzrastania
    // Sprawdź, czy jest dostępna wartość tempa; oryginalny kod pomija 0 jako wartość fałszywą,
    // więc tutaj również stosujemy to ograniczenie, aby nie pokazywać „0 cm/rok” w podsumowaniu.
    if (agd.growthVelocity && !isNaN(agd.growthVelocity)) {
      // Jeśli w obliczeniach zaawansowanych wykorzystano okno ostatniego roku (6–15 mies.),
      // to traktujemy tempo jako „aktualne” i podajemy liczbę miesięcy, z której zostało wyliczone.
      if (agd.growthVelocityUsedLastYear) {
        // growthVelocityGapM określa dokładną liczbę miesięcy odstępu między bieżącym pomiarem a użytym poprzednim.
        const m = (typeof agd.growthVelocityGapM === 'number' && agd.growthVelocityGapM >= 6) ? agd.growthVelocityGapM : null;
        const monthInfo = m ? ` (z ostatnich ${m} mies.)` : '';
        lines.push(`Aktualne tempo wzrastania${monthInfo}: ${agd.growthVelocity.toFixed(1).replace('.', ',')} cm/rok`);
      } else {
        // W przeciwnym razie wyświetlamy ogólne tempo wzrastania wraz z kontekstem (średnia z okresu), jeśli jest dostępny.
        let ctxStr = '';
        if (agd.growthVelocityContext) {
          ctxStr = ` (obliczono jako średnią z ${agd.growthVelocityContext})`;
        }
        lines.push(`Tempo wzrastania: ${agd.growthVelocity.toFixed(1).replace('.', ',')} cm/rok${ctxStr}`);
      }
    }
    // Potencjał wzrostowy
    if (agd.targetHeight && !isNaN(agd.targetHeight)) {
      // Zawsze zaczynamy od wartości potencjału i jednostki (MPH – mid‑parental height)
      let line = `MPH (mid-parental height): ${agd.targetHeight.toFixed(1).replace('.', ',')} cm`;
      // Jeżeli dostępne są statystyki centyla i z‑score, wyświetl je
      if (agd.targetStats && typeof agd.targetStats.percentile === 'number') {
        const cent = Math.round(agd.targetStats.percentile);
        // W trybie profesjonalnym pokazujemy również z‑score, gdy jest dostępny
        if (pro && typeof agd.targetStats.sd === 'number' && isFinite(agd.targetStats.sd)) {
          line += ` – centyl: ${cent}, z-score: ${agd.targetStats.sd.toFixed(2).replace('.', ',')}`;
        } else {
          // Tryb standardowy – tylko centyl
          line += ` – centyl: ${cent}`;
        }
      }
      lines.push(line);

      // Dodaj różnicę hSDS - mpSDS do podsumowania metabolicznego w trybie profesjonalnym.
      // Obliczamy Z‑score aktualnego wzrostu dziecka zgodnie z wybranym źródłem siatek centylowych
      // (Palczewska, OLAF lub WHO), a następnie odejmujemy z‑score MPH.
      if (pro && agd.targetStats && typeof agd.targetStats.sd === 'number' && isFinite(agd.targetStats.sd)) {
        let statsHeightDiff = null;
        const usePalAdv = (typeof bmiSource !== 'undefined' &&
                           (bmiSource === 'PALCZEWSKA' ||
                           (bmiSource === 'OLAF' && ageYears < OLAF_DATA_MIN_AGE)));
        if (usePalAdv) {
          statsHeightDiff = calcPercentileStatsPal(heightVal, sexVal, ageYears, 'HT');
        } else {
          statsHeightDiff = calcPercentileStats(heightVal, sexVal, ageYears, 'HT');
        }
        if (statsHeightDiff && typeof statsHeightDiff.sd === 'number' && isFinite(statsHeightDiff.sd)) {
          const diffSummary = statsHeightDiff.sd - agd.targetStats.sd;
          if (typeof diffSummary === 'number' && isFinite(diffSummary)) {
            lines.push(`hSDS - mpSDS: ${diffSummary.toFixed(2).replace('.', ',')}`);
          }
        }
      }
    }

    const bayleyPinneauSummaryLine = advGrowthBuildBayleyPinneauSummaryCardLine(agd.bayleyPinneau);
    if (bayleyPinneauSummaryLine) {
      lines.push(bayleyPinneauSummaryLine);
    }

    const rwtSummaryLine = advGrowthBuildRWTSummaryCardLine(agd.rwt);
    if (rwtSummaryLine) {
      lines.push(rwtSummaryLine);
    }

    const reinehrSummaryLine = (typeof advGrowthBuildReinehrCdgpSummaryCardLine === 'function')
      ? advGrowthBuildReinehrCdgpSummaryCardLine(agd.reinehr)
      : '';
    if (reinehrSummaryLine) {
      lines.push(reinehrSummaryLine);
    }

  }
  try {
    const nutritionSummaryLines = (typeof patientReportBuildNutritionSummaryLines === 'function')
      ? patientReportBuildNutritionSummaryLines()
      : [];
    (nutritionSummaryLines || []).forEach((line) => {
      if (line) lines.push(line);
    });
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 24736 });
    }
  }
  // Zwróć wszystkie linie w postaci tekstu
  return lines.join('\n');
}

/**
 * Obsługuje kliknięcie przycisku „Podsumowanie metaboliczne”.
 * Funkcja ta wywołuje generateMetabolicSummary(), a następnie kopiuje
 * wynik do schowka i informuje użytkownika. Została wydzielona jako
 * globalna, aby można ją było bezpośrednio przypisać do atrybutu
 * onclick w kodzie HTML.
 */
function handleMetabolicSummaryClick(event) {
  if (event) {
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    } else if (typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
  }

  // Wygeneruj podstawowe podsumowanie
  let summaryText = generateMetabolicSummary();

  // Brak danych — powiadom użytkownika
  if (!summaryText || summaryText.trim() === '') {
    alert('Brak danych do podsumowania.');
    return;
  }

  try {
    // Rozbij podsumowanie na linie i dodaj wartości wejściowe oraz zmodyfikuj etykiety,
    // tak jak jest to widoczne w karcie Podsumowanie wyników. Dzięki temu do schowka
    // kopiowane są zarówno odczytane wartości (np. kg/cm/mmHg), jak i ich centyle.
    let lines = summaryText.split('\n').map(s => s.trim()).filter(Boolean);

    // Odczytaj aktualne wartości z formularza (jeśli są wypełnione).
    const weightValStr    = (document.getElementById('weight')?.value || '').trim();
    const heightValStr    = (document.getElementById('height')?.value || '').trim();
    const sbpValStr       = (document.getElementById('bpSystolic')?.value || '').trim();
    const dbpValStr       = (document.getElementById('bpDiastolic')?.value || '').trim();
    const headCircValStr  = (document.getElementById('headCircumference')?.value || '').trim();
    const chestCircValStr = (document.getElementById('chestCircumference')?.value || '').trim();

    lines = lines.map(function (line) {
      if (line.startsWith('Waga:')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const valueLabel = weightValStr ? (weightValStr + ' kg') : '';
        return patientReportFormatSummaryLineWithValue('Waga', valueLabel, rest);
      }

      if (line.startsWith('Wzrost:')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const valueLabel = heightValStr ? (heightValStr + ' cm') : '';
        return patientReportFormatSummaryLineWithValue('Wzrost', valueLabel, rest);
      }

      if (line.startsWith('Ciśnienie skurczowe')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const prefix = sbpValStr ? (sbpValStr + ' mmHg, ') : '';
        return 'RR skurczowe: ' + prefix + rest;
      }

      if (line.startsWith('Ciśnienie rozkurczowe')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const prefix = dbpValStr ? (dbpValStr + ' mmHg, ') : '';
        return 'RR rozkurczowe: ' + prefix + rest;
      }

      if (line.startsWith('Obwód głowy')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const prefix = headCircValStr ? (headCircValStr + ' cm, ') : '';
        return 'Obwód głowy: ' + prefix + rest;
      }

      if (line.startsWith('Obwód klatki piersiowej')) {
        const rest   = line.slice(line.indexOf(':') + 1).trim();
        const prefix = chestCircValStr ? (chestCircValStr + ' cm, ') : '';
        return 'Obwód kl. piersiowej: ' + prefix + rest;
      }

      if (/^MPH \(mid[-‑]parental height\):/i.test(line)) {
        let newLine = line.replace(/^MPH \(mid[^)]*\):/i, 'MPH:');
        newLine = newLine.replace(/z-score:/i, 'Z-score:');
        return newLine;
      }

      return line;
    });

    summaryText = lines.join('\n');
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 24832 });
    }
  }

  // Ujednolicenie formatowania tekstu przed kopiowaniem
  summaryText = summaryText
    .replace(/\u00A0/g, ' ')
    .replace(/([0-9])\.([0-9])/g, '$1,$2');

  // Funkcja pomocnicza: wyświetla toast po skopiowaniu zamiast alertu
  const copyAndNotify = () => {
    const existingToast = document.getElementById('metabolicSummaryCopyToast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'metabolicSummaryCopyToast';
    toast.textContent = 'Dane zostały skopiowane do schowka.';
    toast.style.position = 'fixed';
    toast.style.bottom = '1rem';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = '#00838d';
    toast.style.color = 'white';
    toast.style.padding = '0.6rem 1.2rem';
    toast.style.borderRadius = '4px';
    toast.style.fontSize = '1rem';
    toast.style.zIndex = '9999';
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 2500);
  };

  const copySummaryTextToClipboard = function(text) {
    return new Promise(function(resolve, reject) {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(resolve).catch(function() {
          try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length);
            const successful = document.execCommand('copy');
            textarea.remove();
            if (successful) {
              resolve();
            } else {
              reject(new Error('Copy command failed'));
            }
          } catch (err) {
            reject(err);
          }
        });
        return;
      }

      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const successful = document.execCommand('copy');
        textarea.remove();
        if (successful) {
          resolve();
        } else {
          reject(new Error('Copy command failed'));
        }
      } catch (err) {
        reject(err);
      }
    });
  };

  copySummaryTextToClipboard(summaryText)
    .then(copyAndNotify)
    .catch(function() {
      alert('Nie udało się skopiować danych.');
    });
}


  function registerMetabolicSummaryControls() {
    if (!window || controlsRegistered) return;
    if (typeof window.vildaAppOnReady !== 'function') return;
    controlsRegistered = true;
    // Po załadowaniu DOM, podłącz obsługę przycisku i nasłuchuj zmian na kluczowych polach
    window.vildaAppOnReady('summary-cards:metabolic-summary-controls', function initMetabolicSummaryControls() {
      // Aktualizuj widoczność przycisku po każdej zmianie wieku, wagi lub wzrostu
      ['age','ageMonths','weight','height'].forEach(function(id){
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('input', function(){
            updateMetabolicSummaryVisibility();
            // Przy każdej zmianie odśwież kartę profesjonalnego podsumowania,
            // aby natychmiast zareagować na nowe dane.
            if (typeof updateProfessionalSummaryCard === 'function') {
              try { updateProfessionalSummaryCard(); } catch (e) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', e, { line: 24948 });
        }
      }
            }
          });
          el.addEventListener('change', function(){
            updateMetabolicSummaryVisibility();
            if (typeof updateProfessionalSummaryCard === 'function') {
              try { updateProfessionalSummaryCard(); } catch (e) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', e, { line: 24954 });
        }
      }
            }
          });
        }
      });
      // Wywołaj na starcie, aby ustawić stan początkowy
      updateMetabolicSummaryVisibility();
      // Zaktualizuj kartę z podsumowaniem wyników na starcie
      if (typeof updateProfessionalSummaryCard === 'function') {
        updateProfessionalSummaryCard();
      }

      // Dodaj ogólny nasłuch na formularzu, aby karta podsumowania aktualizowała się
      // „w locie” podczas wprowadzania dowolnych danych (np. ciśnienia, obwodów).
      // Dzięki temu zmiany w polach obsługiwanych przez dodatkowe moduły (bp_module,
      // circumference_module itp.) będą od razu widoczne w karcie podsumowania.
      try {
        const formEl = document.getElementById('calcForm');
        if (formEl) {
          const liveHandler = function(){
            if (typeof updateProfessionalSummaryCard === 'function') {
              try { updateProfessionalSummaryCard(); } catch (e) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', e, { line: 24975 });
        }
      }
            }
          };
          // Reaguj zarówno na input, jak i change – niektóre komponenty
          // emulują dane dopiero po zdarzeniu change.
          formEl.addEventListener('input', liveHandler);
          formEl.addEventListener('change', liveHandler);
        }
      } catch (e) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
          globalThis.vildaLogSwallowedCatch('app.js', e, { line: 24983 });
        }
      }
      // Dodaj obsługę kliknięcia przycisku podsumowania
      const metaBtn = document.getElementById('metabolicSummaryBtn');
      if (metaBtn && !metaBtn.dataset.metabolicSummaryListenerAttached) {
        metaBtn.addEventListener('click', handleMetabolicSummaryClick, { capture: true });
        metaBtn.dataset.metabolicSummaryListenerAttached = 'true';
      }
    });
  }

  function initSummaryDiffAndHeightRuntime() {
    if (!window || diffHeightRuntimeInitialized) return;
    diffHeightRuntimeInitialized = true;
  // Funkcja uaktualniająca wiersz informujący o czasie, jaki upłynął od ostatniego pomiaru.
  // Wiersz ten jest wstawiany jako ukryty placeholder w __renderPrevSummary i ma klasy
  // .time-since-label oraz .time-since-val.  Funkcja wyświetla go dopiero po tym,
  // jak użytkownik wpisze aktualny wiek.  Różnica w czasie jest obliczana na
  // podstawie różnicy wieku (w miesiącach) między obecnym pomiarem a
  // załadowanym poprzednim pomiarem.  Jeśli brak danych lub różnica ≤ 0,
  // wiersz pozostaje ukryty.
  window.updatePrevMeasurementElapsed = function() {
    try {
      const labelEl = document.querySelector('.time-since-label');
      const valEl   = document.querySelector('.time-since-val');
      if (!labelEl || !valEl) return;
      const prev = window.prevMeasurementInfo;
      // Jeżeli brak poprzedniego pomiaru lub nie określono wieku – ukryj wiersz
      if (!prev || !isFinite(prev.ageMonths)) {
        labelEl.style.display = 'none';
        valEl.style.display = 'none';
        return;
      }
      // Pobierz aktualny wiek z formularza (uwzględnia lata + miesiące)
      let ageDec = NaN;
      if (typeof getAgeDecimal === 'function') {
        try { ageDec = getAgeDecimal(); } catch (_) { ageDec = NaN; }
      }
      if (!isFinite(ageDec) || ageDec <= 0) {
        // Wiek nie został uzupełniony – ukryj wiersz
        labelEl.style.display = 'none';
        valEl.style.display = 'none';
        return;
      }
      const ageMonths = Math.round((ageDec || 0) * 12);
      // Oblicz różnicę w miesiącach między bieżącym wiekiem a poprzednim pomiarem
      const diffMonthsTotal = ageMonths - prev.ageMonths;
      if (!isFinite(diffMonthsTotal) || diffMonthsTotal <= 0) {
        // Brak różnicy lub wiek młodszy niż poprzedni – ukryj wiersz
        labelEl.style.display = 'none';
        valEl.style.display = 'none';
        return;
      }
      // Oblicz lata i pozostałe miesiące
      const diffYears = Math.floor(diffMonthsTotal / 12);
      const diffMonths = diffMonthsTotal % 12;
      let phraseFull = '';
      if (diffYears === 0 && diffMonths === 0) {
        phraseFull = 'minęło mniej niż miesiąc';
      } else {
        // Buduj część opisującą lata i miesiące
        let yearPart = '';
        let monthPart = '';
        if (diffYears > 0) {
          let yearWord;
          if (diffYears === 1) {
            yearWord = 'rok';
          } else if (diffYears % 10 >= 2 && diffYears % 10 <= 4 && (diffYears % 100 < 10 || diffYears % 100 >= 20)) {
            yearWord = 'lata';
          } else {
            yearWord = 'lat';
          }
          yearPart = `${diffYears} ${yearWord}`;
        }
        if (diffMonths > 0) {
          let monthWord;
          if (diffMonths === 1) {
            monthWord = 'miesiąc';
          } else if (diffMonths % 10 >= 2 && diffMonths % 10 <= 4 && (diffMonths % 100 < 10 || diffMonths % 100 >= 20)) {
            monthWord = 'miesiące';
          } else {
            monthWord = 'miesięcy';
          }
          monthPart = `${diffMonths} ${monthWord}`;
        }
        let timeText;
        if (yearPart && monthPart) {
          timeText = `${yearPart} i ${monthPart}`;
        } else if (yearPart) {
          timeText = `${yearPart}`;
        } else {
          timeText = `${monthPart}`;
        }
        // Określ czasownik (minął/minęły/minęło)
        let verb;
        if (diffYears > 0) {
          if (diffYears === 1) {
            verb = 'minął';
          } else if (diffYears >= 2 && diffYears <= 4) {
            verb = 'minęły';
          } else {
            verb = 'minęło';
          }
        } else {
          // tylko miesiące
          if (diffMonths === 1) {
            verb = 'minął';
          } else if (diffMonths >= 2 && diffMonths <= 4) {
            verb = 'minęły';
          } else {
            verb = 'minęło';
          }
        }
        phraseFull = `${verb} ${timeText}`;
      }
      // Uaktualnij tekst i pokaż wiersz
      labelEl.style.display = '';
      valEl.style.display = '';
      const span = valEl.querySelector('span');
      if (span) span.textContent = phraseFull;
    } catch (_) {
      // W przypadku błędu ukryj wiersz
      try {
        const labelEl = document.querySelector('.time-since-label');
        const valEl   = document.querySelector('.time-since-val');
        if (labelEl) labelEl.style.display = 'none';
        if (valEl) valEl.style.display = 'none';
      } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 36749 });
    }
  }
    }
  };
  // Globalna funkcja aktualizująca sekcję różnic w karcie poprzedniego pomiaru
  window.updatePrevSummaryDiff = function() {
    try {
      // Zawsze uaktualnij wiersz z informacją, ile czasu minęło od ostatniego pomiaru.
      if (typeof window.updatePrevMeasurementElapsed === 'function') {
        try { window.updatePrevMeasurementElapsed(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 36757 });
    }
  }
      }
      const contentEl = document.getElementById('prevSummaryContent');
      if (!contentEl) return;
      // Usuń istniejącą sekcję różnic, aby uniknąć duplikatów
      const oldSec = contentEl.querySelector('.diff-section');
      if (oldSec) oldSec.remove();
      const prev = window.prevMeasurementInfo;
      if (!prev || !isFinite(prev.weightKg) || !isFinite(prev.heightCm) || !isFinite(prev.ageMonths)) return;
      const weightEl = document.getElementById('weight');
      const heightEl = document.getElementById('height');
      const sexEl = document.getElementById('sex');
      if (!weightEl || !heightEl || !sexEl) return;
      const weight = parseFloat(weightEl.value);
      const height = parseFloat(heightEl.value);
      const sex = sexEl.value || prev.sex || 'M';
      const ageDec = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
      const ageMonths = Math.round((ageDec || 0) * 12);
      if (!isFinite(weight) || !isFinite(height) || !isFinite(ageMonths)) return;
      // Ustal, czy mamy do czynienia z osobą pełnoletnią (wiek >= 18 lat).
      const isAdult = (isFinite(ageDec) && ageDec >= 18);
      // Kontener na sekcję różnic
      const diffSec = document.createElement('div');
      diffSec.className = 'diff-section';
      // Wspólny stan dla wierszy porównania – używany, aby wyrównać ocenę BMI
      // i wskaźnika Cole’a z oceną zmian wzrostu i masy ciała.
      let lastHeightDiff = null;
      let lastHClass = null;
      let lastWeightDiff = null;
      let lastWClass = null;
      // Pomocnicza funkcja: ujednolica kolor wskaźników pochodnych (BMI, wskaźnik Cole’a)
      // z oceną zmian podstawowych parametrów (wzrost, masa ciała).
      function unifyDiffClass(baseClass, lastWClass, lastHClass) {
        const order = { 'status-ok': 0, 'status-improve': 1, 'status-alert': 2 };
        if (!baseClass || !order.hasOwnProperty(baseClass)) return baseClass;
        const primary = [];
        if (lastWClass && order.hasOwnProperty(lastWClass)) primary.push(lastWClass);
        if (lastHClass && order.hasOwnProperty(lastHClass)) primary.push(lastHClass);
        if (primary.length === 0) return baseClass;
        let worst = primary[0];
        for (let i = 1; i < primary.length; i++) {
          if (order[primary[i]] > order[worst]) worst = primary[i];
        }
        const baseSev = order[baseClass];
        const worstSev = order[worst];
        let finalSev;
        if (worstSev === 0) {
          // Wzrost i masa ocenione jako prawidłowe – nie pogarszaj oceny wskaźników pochodnych.
          finalSev = 0;
        } else if (worstSev === 1) {
          // Umiarkowany problem lub poprawa – wskaźniki pochodne nie mogą wyglądać lepiej niż „umiarkowany”.
          finalSev = Math.max(baseSev, 1);
        } else {
          // Poważny problem (czerwony) – wskaźniki BMI/Cole nie mogą wyglądać „zbyt dobrze”
          // w porównaniu z oceną masy i wzrostu.
          finalSev = Math.max(baseSev, 2);
        }
        for (const key in order) {
          if (order[key] === finalSev) return key;
        }
        return baseClass;
      }
      // Dodaj etykietę informującą o porównaniu z poprzednim pomiarem
      const headerLabel = document.createElement('div');
      headerLabel.className = 'prev-summary-label';
      headerLabel.textContent = 'W porównaniu do poprzedniego pomiaru:';
      diffSec.appendChild(headerLabel);
      // Separator oddzielający historię od nowych danych
      const hr = document.createElement('hr');
      hr.className = 'prev-summary-separator';
      diffSec.appendChild(hr);
      // Wzrost
      (function(){
        // Nie pokazuj zmian wzrostu dla osób dorosłych – u dorosłych wzrost się nie zmienia.
        if (isAdult) return;
        const hPrev = prev.heightCm;
        const heightDiff = height - hPrev;
        const medianPrevH = (typeof medianHeightForAgeMonths === 'function') ? medianHeightForAgeMonths(sex, prev.ageMonths) : null;
        const medianCurrH = (typeof medianHeightForAgeMonths === 'function') ? medianHeightForAgeMonths(sex, ageMonths) : null;
        let expectedH = null;
        if (medianPrevH != null && medianCurrH != null && isFinite(medianPrevH) && isFinite(medianCurrH)) {
          expectedH = medianCurrH - medianPrevH;
        }
        let hClass = 'status-ok';
        if (expectedH != null && expectedH > 0) {
          const ratio = heightDiff / expectedH;
          if (ratio < 0.75) hClass = 'status-alert';
          else hClass = 'status-ok';
        } else {
          if (heightDiff < 0) hClass = 'status-alert';
        }
        // Zapamiętaj ocenę wzrostu dla dalszych wierszy (BMI, wskaźnik Cole’a),
        // aby wskaźniki pochodne nie wyglądały gorzej niż sam wzrost.
        lastHeightDiff = heightDiff;
        lastHClass = hClass;
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Wzrost';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val ' + hClass;
        diffSpan.textContent = (heightDiff >= 0 ? '+' : '') + (Math.abs(heightDiff).toFixed(1).replace('.', ',')) + '\u00a0cm';
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = ' (' + (isFinite(height) ? height.toFixed(1).replace('.', ',') : '—') + '\u00a0cm)';
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // Waga
      (function(){
        const wPrev = prev.weightKg;
        const wDiff = weight - wPrev;
        let expectedGain = 0;
        if (typeof expectedGainMedianHeightAware === 'function') {
          const measPrev = { ageMonths: prev.ageMonths, height: prev.heightCm, weight: prev.weightKg };
          const measCurr = { ageMonths: ageMonths, height: height, weight: weight };
          try {
            expectedGain = expectedGainMedianHeightAware(measPrev, measCurr, sex);
          } catch (_) {
            expectedGain = 0;
          }
          if (!isFinite(expectedGain)) expectedGain = 0;
        }
        let ratio = 0;
        if (expectedGain > 0) {
          // Dodatnie oczekiwanie przyrostu masy: klasyczna interpretacja – stosunek obserwowanego przyrostu do oczekiwanego
          ratio = wDiff / expectedGain;
        } else if (expectedGain < 0) {
          // Ujemne oczekiwanie przyrostu (spadek masy): użyj stosunku względem oczekiwanej redukcji
          if (wDiff >= 0) {
            // Zamiast dzielenia przez zero używamy wartości ujemnej, aby łatwo rozróżnić wzrost masy
            ratio = -1;
          } else {
            ratio = Math.abs(wDiff) / Math.abs(expectedGain);
          }
        } else {
          // Oczekiwanie równe zero: brak zmiany wagi powinien dać ratio=0; dodatnia zmiana -> 2, ujemna -> -1
          if (wDiff > 0) ratio = 2;
          else if (wDiff < 0) ratio = -1;
          else ratio = 0;
        }
        let coleCurr = null;
        let colePrevChild = null;
        if (typeof getBmiP50ForAgeSex === 'function') {
          // Aktualny wskaźnik Cole’a
          const bmiCurr = weight / Math.pow(height/100,2);
          const bmi50Curr = getBmiP50ForAgeSex(ageMonths, sex);
          if (bmi50Curr && isFinite(bmi50Curr) && bmi50Curr > 0) {
            coleCurr = (bmiCurr / bmi50Curr) * 100;
          }
          // Poprzedni wskaźnik Cole’a
          if (prev.heightCm && prev.weightKg && isFinite(prev.ageMonths)) {
            const bmiPrevChild = prev.weightKg / Math.pow(prev.heightCm/100,2);
            const bmi50PrevChild = getBmiP50ForAgeSex(prev.ageMonths, sex);
            if (bmi50PrevChild && isFinite(bmi50PrevChild) && bmi50PrevChild > 0) {
              colePrevChild = (bmiPrevChild / bmi50PrevChild) * 100;
            }
          }
        }
        const overOrObese = ((colePrevChild != null && isFinite(colePrevChild) && colePrevChild >= 110) || (coleCurr != null && isFinite(coleCurr) && coleCurr >= 110));
        let wClass;
        /*
         * Klasyfikacja zmian wagi w zależności od wieku i płci.
         * Dla dorosłych stosujemy progi rocznego przyrostu masy ciała
         * oparte na literaturze: dla młodych dorosłych (18–39 lat)
         * mężczyzn przyrost do 0,5 kg/rok jest bezpieczny, 0,5–1,0 kg/rok umiarkowany,
         * powyżej 1,0 kg/rok nadmierny. U kobiet granice są odpowiednio 1,0 kg/rok
         * (bezpieczny) oraz 2,0 kg/rok (nadmierny). W wieku 40–59 lat u obu płci
         * przyrost do 0,5 kg/rok jest bezpieczny, 0,5–1,5 kg/rok umiarkowany,
         * powyżej 1,5 kg/rok nadmierny. Po 60. roku życia zakładamy, że
         * stabilizacja masy jest celem: każdy przyrost >0,5 kg/rok uznajemy za
         * nadmierny, zaś drobne wahania do 0,5 kg/rok jako umiarkowane.
         * Dodatkowo, jeśli pacjent ma nadwagę lub otyłość (BMI ≥25),
         * każdy dodatni przyrost traktujemy jako nadmierny. Utrata masy u osób
         * z niedowagą (BMI <18,5) oznacza alert (status-alert), natomiast u osób
         * z nadwagą/otyłością – poprawę (status-improve). Pozostałe sytuacje
         * zmniejszenia masy klasyfikujemy jako bezpieczne (status-ok).
         */
        if (isAdult) {
          // Oblicz BMI poprzedniego i aktualnego pomiaru
          let bmiPrev = null;
          if (prev.heightCm && prev.weightKg) {
            const hPrevM = prev.heightCm / 100;
            bmiPrev = prev.weightKg / (hPrevM * hPrevM);
          }
          let bmiCurr = null;
          if (height && weight) {
            const hCurrM = height / 100;
            bmiCurr = weight / (hCurrM * hCurrM);
          }
          const overweight = (bmiPrev != null && bmiPrev >= ADULT_BMI.OVER) || (bmiCurr != null && bmiCurr >= ADULT_BMI.OVER);
          // Oblicz roczny przyrost wagi (kg/rok). Jeżeli między pomiarami
          // upłynęło mniej niż rok, skalujemy do rocznego tempa; jeżeli różnica
          // wynosi 0 (np. ten sam dzień), unikamy dzielenia przez zero przyjmując 1 rok.
          const deltaYearsRaw = (ageMonths - prev.ageMonths) / 12;
          const deltaYears = (deltaYearsRaw && deltaYearsRaw > 0) ? deltaYearsRaw : 1;
          const wDiffRate = wDiff / deltaYears;
          if (wDiff <= 0) {
            // Spadek masy ciała – różna interpretacja w zależności od BMI
            if (bmiCurr != null && bmiCurr < ADULT_BMI.UNDER) {
              // U osób z niedowagą dalsza utrata masy jest niebezpieczna
              wClass = 'status-alert';
            } else if (overweight) {
              // U osób z nadwagą/otyłością spadek masy ciała jest poprawą
              wClass = 'status-improve';
            } else {
              // W pozostałych przypadkach utrata masy jest uznawana za bezpieczną
              wClass = 'status-ok';
            }
          } else {
            // Wzrost masy ciała
            if (overweight) {
              // Każdy przyrost masy u osób z nadwagą/otyłością jest nadmierny
              wClass = 'status-alert';
            } else {
              // Ustal progi w zależności od wieku i płci
              let safeTh, moderateTh;
              if (ageDec < 40) {
                if (sex === 'M') {
                  safeTh = 0.5;
                  moderateTh = 1.0;
                } else {
                  safeTh = 1.0;
                  moderateTh = 2.0;
                }
              } else if (ageDec < 60) {
                safeTh = 0.5;
                moderateTh = 1.5;
              } else {
                safeTh = 0;
                moderateTh = 0.5;
              }
              if (wDiffRate <= safeTh) {
                wClass = 'status-ok';
              } else if (wDiffRate <= moderateTh) {
                wClass = 'status-improve';
              } else {
                wClass = 'status-alert';
              }
            }
          }
        } else {
          // Klasyfikacja pediatryczna
          if (expectedGain < 0) {
            // Spodziewamy się redukcji masy
            if (wDiff >= 0) {
              // Przyrost masy ciała przy oczekiwanym spadku – alert
              wClass = 'status-alert';
            } else {
              // Rzeczywista redukcja masy
              const r = ratio; // ratio = |wDiff| / |expectedGain|
              if (r < 0.75) {
                // spadek mniejszy niż oczekiwany – uznajemy za bezpieczny
                wClass = 'status-ok';
              } else if (r <= 1.25) {
                // spadek w granicach oczekiwań
                wClass = 'status-ok';
              } else if (r <= 1.50) {
                // spadek nieco większy niż oczekiwano – umiarkowana poprawa
                wClass = 'status-improve';
              } else {
                // spadek zdecydowanie zbyt duży – alert
                wClass = 'status-alert';
              }
            }
          } else {
            // Oczekujemy przyrostu lub utrzymania masy (expectedGain >= 0)
            if (expectedGain === 0) {
              // Brak oczekiwanego przyrostu: ratio = 2 przy wzroście masy, ratio = -1 przy spadku lub 0 przy braku zmian
              if (ratio < 0.75) {
                wClass = overOrObese ? 'status-improve' : 'status-alert';
              } else if (ratio <= 1.25) {
                wClass = 'status-ok';
              } else if (ratio <= 1.50) {
                wClass = 'status-improve';
              } else {
                wClass = 'status-alert';
              }
            } else {
              // expectedGain > 0
              if (ratio < 0.75) {
                wClass = overOrObese ? 'status-improve' : 'status-alert';
              } else if (ratio <= 1.25) {
                wClass = 'status-ok';
              } else if (ratio <= 1.50) {
                wClass = 'status-improve';
              } else {
                wClass = 'status-alert';
              }
            }
          }
        }
        // Zapamiętaj ocenę zmiany masy dla dalszych wierszy (BMI, wskaźnik Cole’a),
        // tak aby wskaźniki pochodne nie wyglądały gorzej niż sama masa ciała.
        lastWeightDiff = wDiff;
        lastWClass = wClass;
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Waga';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val ' + wClass;
        // Pokazuj znak minus przy ujemnej różnicy masy ciała zamiast pustego ciągu
        diffSpan.textContent = (wDiff >= 0 ? '+' : '-') + (Math.abs(wDiff).toFixed(1).replace('.', ',')) + '\u00a0kg';
        const sub = document.createElement('span');
        sub.className = 'muted';
        const currentStr = isFinite(weight) ? weight.toFixed(1).replace('.', ',') + '\u00a0kg' : '—';
        const expectedStr = (expectedGain && isFinite(expectedGain)) ? expectedGain.toFixed(1).replace('.', ',') + '\u00a0kg' : '0\u00a0kg';
        // Dla dorosłych nie pokazujemy oczekiwanej zmiany masy (zawsze 0), więc pomijamy tę część tekstu.
        if (isAdult) {
          sub.textContent = ' (' + currentStr + ')';
        } else {
          sub.textContent = ' (' + currentStr + ', oczekiwanie ' + expectedStr + ')';
        }
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // BMI
      (function(){
        const hPrev = prev.heightCm;
        const wPrev = prev.weightKg;
        if (!hPrev || !wPrev || !height || !weight) return;
        const bmiPrev = wPrev / Math.pow(hPrev/100,2);
        const bmiCurr = weight / Math.pow(height/100,2);
        const bmiDiff = bmiCurr - bmiPrev;
        let bmi50Prev = null;
        let bmi50Curr = null;
        if (typeof getBmiP50ForAgeSex === 'function') {
          bmi50Prev = getBmiP50ForAgeSex(prev.ageMonths, prev.sex || sex);
          bmi50Curr = getBmiP50ForAgeSex(ageMonths, sex);
        }
        let colePrev = null;
        let coleCurr = null;
        if (bmi50Prev && isFinite(bmi50Prev) && bmi50Prev > 0) {
          colePrev = (bmiPrev / bmi50Prev) * 100;
        }
        if (bmi50Curr && isFinite(bmi50Curr) && bmi50Curr > 0) {
          coleCurr = (bmiCurr / bmi50Curr) * 100;
        }
        let bmiClass;
        // Prepare evaluation of weight change for adults to ensure BMI and weight classifications are aligned.
        // This object will store thresholds, change rate and the resulting class/category.
        let weightEval = null;
        if (isAdult) {
          const wPrevVal = prev.weightKg;
          const hPrevVal = prev.heightCm;
          // Ensure necessary values are finite before computing
          if (isFinite(wPrevVal) && isFinite(hPrevVal) && isFinite(weight) && isFinite(height)) {
            // Determine safe and moderate thresholds (kg/year) based on age and sex
            let safeThW, moderateThW;
            if (ageDec < 40) {
              if (sex === 'M') {
                safeThW = 0.5;
                moderateThW = 1.0;
              } else {
                safeThW = 1.0;
                moderateThW = 2.0;
              }
            } else if (ageDec < 60) {
              safeThW = 0.5;
              moderateThW = 1.5;
            } else {
              safeThW = 0.0;
              moderateThW = 0.5;
            }
            // Compute change in weight and annualized rate
            const wDiffLocal = weight - wPrevVal;
            const deltaYearsRawLocal = (ageMonths - prev.ageMonths) / 12;
            const deltaYearsLocal = (deltaYearsRawLocal && deltaYearsRawLocal > 0) ? deltaYearsRawLocal : 1;
            const wDiffRateLocal = wDiffLocal / deltaYearsLocal;
            // Compute BMI values for previous and current measurements
            const bmiPrevLocal = wPrevVal / Math.pow(hPrevVal / 100, 2);
            const bmiCurrLocal = weight / Math.pow(height / 100, 2);
            const overweightLocal = (bmiPrevLocal >= ADULT_BMI.OVER) || (bmiCurrLocal >= ADULT_BMI.OVER);
            // Determine the weight classification using the same logic as the weight change section
            let wClassLocal;
            if (wDiffLocal <= 0) {
              if (bmiCurrLocal < ADULT_BMI.UNDER) {
                wClassLocal = 'status-alert';
              } else if (overweightLocal) {
                wClassLocal = 'status-improve';
              } else {
                wClassLocal = 'status-ok';
              }
            } else {
              if (overweightLocal) {
                wClassLocal = 'status-alert';
              } else {
                if (wDiffRateLocal <= safeThW) {
                  wClassLocal = 'status-ok';
                } else if (wDiffRateLocal <= moderateThW) {
                  wClassLocal = 'status-improve';
                } else {
                  wClassLocal = 'status-alert';
                }
              }
            }
            // Map internal class to a human-readable category
            let categoryName;
            if (wClassLocal === 'status-ok') {
              categoryName = 'bezpieczny';
            } else if (wClassLocal === 'status-improve') {
              categoryName = 'umiarkowany';
            } else {
              categoryName = 'nadmierny';
            }
            // Store evaluation data for later use in overriding BMI class and generating comments
            weightEval = {
              safeLimit: safeThW,
              moderateLimit: moderateThW,
              wDiffRate: wDiffRateLocal,
              wClass: wClassLocal,
              category: categoryName
            };
          }
        }
        /*
         * Klasyfikacja zmian BMI została uproszczona tak, aby była
         * spójna z oceną przyrostu masy ciała w kilogramach.  Dla osób
         * dorosłych wykorzystujemy tę samą kategorię (status-ok,
         * status-improve, status-alert) co dla zmiany masy ciała; w ten
         * sposób użytkownik nie otrzymuje sprzecznych komunikatów.  U
         * dzieci pozostawiamy dotychczasową klasyfikację opartą o
         * wskaźnik Cole’a.
         */
        if (isAdult) {
          // Jeżeli dostępna jest ocena wagi, użyj jej do klasyfikacji BMI
          if (weightEval && weightEval.wClass) {
            bmiClass = weightEval.wClass;
          } else {
            // W razie braku weightEval (bardzo mało prawdopodobne) zastosuj
            // domyślną logikę opartą o nadwagę/otyłość i trend BMI.
            // Określ, czy mamy do czynienia z nadwagą lub otyłością
            const overweight = (bmiPrev >= ADULT_BMI.OVER) || (bmiCurr >= ADULT_BMI.OVER);
            if (bmiDiff <= 0) {
              if (bmiCurr < ADULT_BMI.UNDER) {
                bmiClass = 'status-alert';
              } else if (overweight) {
                bmiClass = 'status-improve';
              } else {
                bmiClass = 'status-ok';
              }
            } else {
              if (overweight) {
                bmiClass = 'status-alert';
              } else {
                bmiClass = 'status-ok';
              }
            }
          }
        } else {
          // Klasyfikacja pediatryczna oparta na wskaźniku Cole’a
          bmiClass = 'status-ok';
          if (coleCurr != null) {
            if (coleCurr >= 110) {
              bmiClass = (bmiDiff < 0 ? 'status-improve' : 'status-alert');
            } else if (coleCurr <= 90) {
              if (bmiDiff > 0) {
                // Dziecko ma niedowagę (Cole < 90%), ale BMI rośnie. Jeżeli równocześnie
                // zmiany masy ciała i wzrostu są ocenione jako prawidłowe (turkusowe),
                // nie pokazuj koloru ostrzegawczego dla BMI – pozostaw status-ok,
                // aby uniknąć sprzecznego komunikatu względem wagi i wzrostu.
                if (lastWClass === 'status-ok' && lastHClass === 'status-ok') {
                  bmiClass = 'status-ok';
                } else {
                  bmiClass = 'status-improve';
                }
              } else {
                bmiClass = 'status-alert';
              }
            } else {
              bmiClass = 'status-ok';
            }
          }
        }
        // Ustal, czy mamy do czynienia z nadwagą lub otyłością, aby odpowiednio sklasyfikować zmianę BMI.
        let overweightFlag = false;
        if (isAdult) {
          // U dorosłych ocena oparta na progach BMI
          overweightFlag = (bmiPrev >= ADULT_BMI.OVER) || (bmiCurr >= ADULT_BMI.OVER);
        } else {
          // U dzieci wykorzystujemy wskaźnik Cole’a do oceny nadwagi/otyłości
          overweightFlag = ((colePrev != null && colePrev >= 110) || (coleCurr != null && coleCurr >= 110));
        }
        // Określ bazową klasę w zależności od wagi i kierunku zmiany BMI.
        let baseBmiClass;
        if (overweightFlag) {
          const absDiff = Math.abs(bmiDiff);
          if (absDiff <= 0.1) {
            // Minimalna zmiana – kolor ostrzegawczy (ciemny pomarańczowy)
            baseBmiClass = 'status-improve';
          } else if (bmiDiff < 0) {
            // Utrata masy (spadek BMI) u osób z nadwagą/otyłością – pozytywna zmiana
            baseBmiClass = 'status-ok';
          } else {
            // Przyrost BMI u osób z nadwagą/otyłością – alert (czerwony)
            baseBmiClass = 'status-alert';
          }
        } else {
          // Jeżeli użytkownik mieści się w normie, pozostaw dotychczasową klasyfikację.
          baseBmiClass = bmiClass;
        }
        // Ujednolicenie koloru z oceną wzrostu i masy ciała.  Jednakże w przypadku
        // nadwagi/otyłości celowo nie pogarszamy oceny wskaźnika BMI – chcemy
        // zobaczyć realny kierunek zmiany nawet, jeśli wiersz „Waga” jest na czerwono.
        let bmiClassFinal = unifyDiffClass(baseBmiClass, lastWClass, lastHClass);
        if (overweightFlag) {
          // Nadwaga lub otyłość – zastosuj bezpośrednią ocenę, ignorując degradację
          bmiClassFinal = baseBmiClass;
        }
        // Zbuduj wiersz z etykietą „Różnica w BMI” oraz bez wartości BMI w nawiasie
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Różnica\u00a0w\u00a0BMI';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val ' + bmiClassFinal;
        // Pokazuj znak minus przy ujemnej różnicy BMI zamiast pustego ciągu
        diffSpan.textContent = (bmiDiff >= 0 ? '+' : '-') + Math.abs(bmiDiff).toFixed(1).replace('.', ',');
        val.appendChild(diffSpan);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
        // After adding the BMI row, append an explanatory comment with the safe limit and change rate for adults.
        if (isAdult && weightEval) {
          const commentEl = document.createElement('div');
          commentEl.className = 'weight-eval-comment';
          commentEl.style.marginTop = '0.4rem';
          commentEl.style.fontSize = '0.9rem';
          // Format numeric values with comma as decimal separator
          const safeLimitText = (typeof weightEval.safeLimit === 'number')
            ? weightEval.safeLimit.toFixed(1).replace('.', ',') + '\u00a0kg/rok'
            : '—';
          const rateText = (weightEval.wDiffRate != null && isFinite(weightEval.wDiffRate))
            ? weightEval.wDiffRate.toFixed(1).replace('.', ',') + '\u00a0kg/rok'
            : '—';
          commentEl.textContent = 'Limit bezpiecznego przyrostu masy ciała: ' + safeLimitText +
            '; Twój przyrost: ' + rateText + '; Kategoria: ' + weightEval.category + '.';
          // Build a legend explaining the colour coding for categories
          const legend = document.createElement('div');
          legend.className = 'weight-eval-legend';
          legend.style.marginTop = '0.3rem';
          // Use coloured circles (styled via existing classes) to denote each category
          vildaAppSetTrustedHtml(legend, '<span class="result-val status-ok">●</span> Bezpieczny ' +
            '<span class="result-val status-improve" style="margin-left:1rem;">●</span> Umiarkowany ' +
            '<span class="result-val status-alert" style="margin-left:1rem;">●</span> Nadmierny', 'app:legend');
          commentEl.appendChild(legend);
          diffSec.appendChild(commentEl);
        }
      })();
      // Wskaźnik Cole’a
      (function(){
        const hPrev = prev.heightCm;
        const wPrev = prev.weightKg;
        if (!hPrev || !wPrev || !height || !weight) return;
        const bmiPrev = wPrev / Math.pow(hPrev/100,2);
        const bmiCurr = weight / Math.pow(height/100,2);
        let bmi50Prev = null;
        let bmi50Curr = null;
        if (typeof getBmiP50ForAgeSex === 'function') {
          bmi50Prev = getBmiP50ForAgeSex(prev.ageMonths, prev.sex || sex);
          bmi50Curr = getBmiP50ForAgeSex(ageMonths, sex);
        }
        if (!bmi50Prev || !bmi50Curr) return;
        const colePrev = (bmiPrev / bmi50Prev) * 100;
        const coleCurr = (bmiCurr / bmi50Curr) * 100;
        const coleDiff = coleCurr - colePrev;
        // Nowa klasyfikacja zmian wskaźnika Cole’a zgodnie z wymaganiami użytkownika.
        // Określ, czy występuje nadwaga/otyłość lub niedowaga na podstawie obecnego i poprzedniego wskaźnika.
        const coleOverweight = (colePrev >= 110 || coleCurr >= 110);
        const coleUnderweight = (colePrev <= 90 || coleCurr <= 90);
        let baseColeClass;
        if (coleOverweight) {
          // Osoba z nadwagą/otyłością
          const absDiff = Math.abs(coleDiff);
          if (absDiff <= 1) {
            // Minimalna zmiana (±1%) – kolor ostrzegawczy (ciemny pomarańczowy)
            baseColeClass = 'status-improve';
          } else if (coleDiff < 0) {
            // Spadek wskaźnika Cole’a – pozytywna zmiana (turkus)
            baseColeClass = 'status-ok';
          } else {
            // Wzrost wskaźnika Cole’a – alert (czerwony)
            baseColeClass = 'status-alert';
          }
        } else if (coleUnderweight) {
          // Osoba z niedowagą
          const absDiff = Math.abs(coleDiff);
          if (absDiff <= 1) {
            baseColeClass = 'status-improve';
          } else if (coleDiff > 0) {
            // Wzrost wskaźnika Cole’a u osoby z niedowagą – pozytywna zmiana (turkus)
            baseColeClass = 'status-ok';
          } else {
            // Spadek wskaźnika Cole’a u osoby z niedowagą – alert (czerwony)
            baseColeClass = 'status-alert';
          }
        } else {
          // Wskaźnik w normie – domyślnie kolor turkusowy
          baseColeClass = 'status-ok';
        }
        // Ujednolicenie koloru wskaźnika Cole’a z oceną zmian wzrostu i masy ciała.
        let coleClassFinal = unifyDiffClass(baseColeClass, lastWClass, lastHClass);
        // Jeżeli mamy do czynienia z nadwagą/otyłością lub niedowagą,
        // celowo nie pogarszaj oceny wskaźnika Cole’a – zachowaj bezpośrednią ocenę.
        if (coleOverweight || coleUnderweight) {
          coleClassFinal = baseColeClass;
        }
        // Zbuduj wiersz różnicy dla wskaźnika Cole’a, z dodanym znakiem plus/minus i bez wartości w nawiasie
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Wskaźnik\u00a0Cole’a';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val ' + coleClassFinal;
        // Zawsze pokazujemy znak '+' dla wzrostu i '-' dla spadku
        diffSpan.textContent = (coleDiff >= 0 ? '+' : '-') + Math.abs(coleDiff).toFixed(1).replace('.', ',') + '%';
        val.appendChild(diffSpan);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // Obwód talii – różnica względem poprzedniego pomiaru
      (function(){
        const prevWaist = prev.waistCm;
        const waistEl = document.getElementById('waistCm');
        const currWaist = parseFloat(waistEl && waistEl.value);
        if (prevWaist == null || !isFinite(prevWaist) || currWaist == null || !isFinite(currWaist)) return;
        const diff = currWaist - prevWaist;
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Obwód\u00a0talii';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val';
        diffSpan.textContent = (diff >= 0 ? '+' : '') + Math.abs(diff).toFixed(1).replace('.', ',') + '\u00a0cm';
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = ' (' + currWaist.toFixed(1).replace('.', ',') + '\u00a0cm)';
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // Obwód bioder – różnica względem poprzedniego pomiaru
      (function(){
        const prevHip = prev.hipCm;
        const hipEl = document.getElementById('hipCm');
        const currHip = parseFloat(hipEl && hipEl.value);
        if (prevHip == null || !isFinite(prevHip) || currHip == null || !isFinite(currHip)) return;
        const diff = currHip - prevHip;
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Obwód\u00a0bioder';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val';
        diffSpan.textContent = (diff >= 0 ? '+' : '') + Math.abs(diff).toFixed(1).replace('.', ',') + '\u00a0cm';
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = ' (' + currHip.toFixed(1).replace('.', ',') + '\u00a0cm)';
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // WHR – różnica względem poprzedniego pomiaru
      (function(){
        const prevWaist = prev.waistCm;
        const prevHip = prev.hipCm;
        const waistEl = document.getElementById('waistCm');
        const hipEl = document.getElementById('hipCm');
        const currWaist = parseFloat(waistEl && waistEl.value);
        const currHip = parseFloat(hipEl && hipEl.value);
        if (prevWaist == null || prevHip == null || !isFinite(prevWaist) || !isFinite(prevHip)) return;
        if (currWaist == null || currHip == null || !isFinite(currWaist) || !isFinite(currHip)) return;
        if (prevHip === 0 || currHip === 0) return;
        const prevWHR = prevWaist / prevHip;
        const currWHR = currWaist / currHip;
        if (!isFinite(prevWHR) || !isFinite(currWHR)) return;
        const diff = currWHR - prevWHR;
        const row = document.createElement('div');
        row.className = 'diff-row';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'WHR';
        const val = document.createElement('div');
        val.className = 'val';
        const diffSpan = document.createElement('span');
        diffSpan.className = 'result-val';
        diffSpan.textContent = (diff >= 0 ? '+' : '') + Math.abs(diff).toFixed(2).replace('.', ',');
        const sub = document.createElement('span');
        sub.className = 'muted';
        sub.textContent = ' (' + currWHR.toFixed(2).replace('.', ',') + ')';
        val.appendChild(diffSpan);
        val.appendChild(sub);
        row.appendChild(label);
        row.appendChild(val);
        diffSec.appendChild(row);
      })();
      // Dodaj sekcję do karty
      contentEl.appendChild(diffSec);
      // Wyrównaj wysokość karty podsumowania do karty użytkownika
      if (typeof window.adjustPrevSummaryHeight === 'function') {
        try { window.adjustPrevSummaryHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37488 });
    }
  }
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37490 });
    }
  }
  };
  // Globalna funkcja wyrównująca wysokość karty „Ostatni pomiar” do karty użytkownika
  window.adjustPrevSummaryHeight = function() {
    try {
      const card = document.getElementById('prevSummaryCard');
      const formEl = document.getElementById('calcForm');
      if (!card || !formEl) return;
      let userCard = null;
      const fieldsets = formEl.getElementsByTagName('fieldset');
      if (fieldsets.length > 0) {
        userCard = fieldsets[0];
      }
      if (!userCard) return;
      // Sprawdź, czy widok jest desktopowy (szerokość ≥ 700 px).  W trybie
      // mobilnym resetuj nadane style, aby obowiązywały reguły z CSS.
      const isDesktop = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 700px)').matches;
      if (!isDesktop) {
        card.style.height = '';
        card.style.minHeight = '';
        card.style.maxHeight = '';
        card.style.overflowY = '';
        return;
      }
      // Wysokość karty użytkownika jako punkt odniesienia
      const h = userCard.getBoundingClientRect().height;
      if (h && h > 0) {
        // Ustaw zarówno minimalną, maksymalną jak i stałą wysokość
        card.style.height = h + 'px';
        card.style.minHeight = h + 'px';
        card.style.maxHeight = h + 'px';
        card.style.overflowY = 'auto';
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37525 });
    }
  }
  };

  // Globalna funkcja wyrównująca wysokość kart „Podsumowanie wyników” w układzie dwukolumnowym
  //
  // Funkcja ta porównuje wysokości dwóch kart podsumowania (lewej i prawej) w trybie
  // desktopowym i ustawia je na maksymalną z nich.  Dla widoków mobilnych
  // (szerokość <700 px) resetuje nadane style, aby pozostawić naturalne
  // dopasowanie wysokości zgodnie z CSS.  Dodatkowo ustawia overflow-y: auto,
  // aby dłuższe listy wierszy były przewijane w ramach swojej karty.
  window.adjustSummaryCardsHeight = function() {
    try {
      // Wykryj tryb mobilny: nie stosuj wyrównywania w jednokolumnowym widoku
      const isDesktop = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 700px)').matches;
      const leftCard  = document.getElementById('currentSummaryCardLeft');
      const rightCard = document.getElementById('currentSummaryCardRight');
      if (!isDesktop || !leftCard || !rightCard) {
        // Resetuj style kart, jeśli nie spełniono warunków
        [leftCard, rightCard].forEach((c) => {
          if (c) {
            c.style.height = '';
            c.style.minHeight = '';
            c.style.maxHeight = '';
            c.style.overflowY = '';
          }
        });
        return;
      }
      // FIX (2026-06-03): najpierw RESET wysokości, potem pomiar NATURALNYCH
      // wysokości. Wcześniej pomiar szedł po już sklampowanych kartach
      // (height/maxHeight z poprzedniego wywołania), więc przycisk „Raport PDF
      // dla pacjenta" doklejany PO pierwszym wyrównaniu nie mieścił się, a
      // overflowY:auto włączał wewnętrzny scroll w prawej połówce. Wyrównujemy
      // wyłącznie min-height (bez height/maxHeight/overflow) — symetria połówek
      // zostaje, a treść (w tym przycisk PDF) nigdy nie jest przycinana.
      [leftCard, rightCard].forEach((c) => {
        c.style.height = '';
        c.style.minHeight = '';
        c.style.maxHeight = '';
        c.style.overflowY = '';
      });
      const hLeft  = leftCard.getBoundingClientRect().height;
      const hRight = rightCard.getBoundingClientRect().height;
      const maxH   = Math.max(hLeft || 0, hRight || 0);
      if (maxH > 0) {
        [leftCard, rightCard].forEach((c) => {
          c.style.minHeight = maxH + 'px';
        });
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37567 });
    }
  }
  };
  // Wyrównaj wysokość karty po załadowaniu DOM
  if (typeof document !== 'undefined' && typeof window.vildaAppOnReady === 'function') {
    window.vildaAppOnReady('app:summary-cards-height-init', function initSummaryCardsHeight() {
      // Ustaw wysokość karty „Ostatni pomiar” oraz kart podsumowania po załadowaniu DOM
      if (typeof window.adjustPrevSummaryHeight === 'function') {
        try { window.adjustPrevSummaryHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37576 });
    }
  }
      }
      if (typeof window.adjustSummaryCardsHeight === 'function') {
        try { window.adjustSummaryCardsHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37579 });
    }
  }
      }
      // Przy każdej zmianie rozmiaru okna dostosuj wysokości kart
      if (typeof window !== 'undefined') {
        const scheduleSummaryCardsHeightResize = vildaCreateRafThrottledLayoutTask('summary-cards-height-resize', function adjustSummaryCardsHeightAfterResize() {
          if (typeof window.adjustPrevSummaryHeight === 'function') {
            try { window.adjustPrevSummaryHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37585, step: '8P-7', context: 'summary-prev-height-resize' });
    }
  }
          }
          if (typeof window.adjustSummaryCardsHeight === 'function') {
            try { window.adjustSummaryCardsHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 37588, step: '8P-7', context: 'summary-cards-height-resize' });
    }
  }
          }
        });
        window.addEventListener('resize', function handleSummaryCardsHeightResize() {
          scheduleSummaryCardsHeightResize('resize');
        });
      }
    });
  }
  }

  function initSummaryCards() {
    exposeSummaryCardGlobals();
    initSummaryDiffAndHeightRuntime();
    registerMetabolicSummaryControls();
    initialized = true;
    return API;
  }

  function getSnapshot() {
    const hasAlias = function hasAlias(name) {
      return !!(window && typeof window[name] === 'function');
    };
    return Object.freeze({
      version: VERSION,
      step: STEP,
      readOnly: true,
      moduleOnly: true,
      initialized: !!initialized,
      globalsExposed: !!(
        hasAlias('__pickLastMeasurement') &&
        hasAlias('__renderPrevSummary') &&
        hasAlias('__renderPrevClcrSummary') &&
        hasAlias('repositionDoctor') &&
        hasAlias('repositionMetabolicSummary') &&
        hasAlias('updateMetabolicSummaryVisibility') &&
        hasAlias('generateMetabolicSummary') &&
        hasAlias('handleMetabolicSummaryClick')
      ),
      controlsRegistered: !!controlsRegistered,
      diffHeightRuntimeInitialized: !!diffHeightRuntimeInitialized,
      didRenderDom: false,
      didWriteStorage: false
    });
  }

  const API = Object.freeze({
    VERSION: VERSION,
    STEP: STEP,
    init: initSummaryCards,
    initSummaryCards: initSummaryCards,
    getSnapshot: getSnapshot,
    __pickLastMeasurement: __pickLastMeasurement,
    __kgToEnterNormalRange: __kgToEnterNormalRange,
    __renderPrevSummary: __renderPrevSummary,
    __syncPrevClcrCardHeight: __syncPrevClcrCardHeight,
    __renderPrevClcrSummary: __renderPrevClcrSummary,
    repositionDoctor: repositionDoctor,
    repositionMetabolicSummary: repositionMetabolicSummary,
    updateMetabolicSummaryVisibility: updateMetabolicSummaryVisibility,
    generateMetabolicSummary: generateMetabolicSummary,
    handleMetabolicSummaryClick: handleMetabolicSummaryClick
  });

  exposeSummaryCardGlobals();
  if (window) {
    window.VildaSummaryCards = API;
    window.vildaGetSummaryCardsSnapshot = getSnapshot;
  }
}(typeof window !== 'undefined' ? window : ((typeof globalThis !== 'undefined') ? globalThis : null)));
