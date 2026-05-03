/*
 * Vilda Anorexia Risk Module v1.0.0
 *
 * Detekcja ryzyka zaburzeń odżywiania/anoreksji i korekta TEE.
 * Wydzielone z app.js w kroku 8J bez zmiany progów, komunikatów ani korekty obliczeń.
 */
// === ANOREXIA RISK MODULE ================================================
// Ten moduł wykrywa ryzyko zaburzeń odżywiania (anoreksji) i automatycznie
// koryguje całkowity wydatek energetyczny (TEE) o 15% w przypadku wykrycia
// ryzyka. Wyświetla również baner ostrzegawczy w określonym kontenerze.
(function () {
  // --- Konfiguracja progów i korekt ---
  const AN_CFG = {
    adult: {
      bmiWarn: 18.5,     // wczesne ostrzeżenie dla dorosłych
      bmiAN: 17.5,       // sygnał anoreksji u dorosłych
      bmiExtreme: 13.0   // skrajna niedowaga
    },
    teen: {
      minAgeMonths: 13 * 12,
      maxAgeMonths: 17 * 12 + 11,
      ebwCut: 0.85       // <85% spodziewanej masy (EBW) sygnalizuje ryzyko
    },
    // NOWE: progi pediatryczne dla dzieci i młodzieży (0–17 lat)
    // Parametry można dostosować w przyszłości bez zmiany logiki
    peds: {
      ageMinMonths: 0,
      ageMaxMonths: 17 * 12 + 11,
      // Klasyfikacja wg udziału masy ciała do mediany BMI (MBMI = BMI / BMI50).
      // Zgodnie z wytycznymi:
      // 80–90% median BMI => łagodne niedożywienie (+1 pkt)
      // 70–79% median BMI => umiarkowane niedożywienie (+2 pkt)
      // <70% median BMI    => ciężkie niedożywienie (+3 pkt)
      // Zmienione progi MBMI zgodnie z literaturą, aby zwiększyć specyficzność:
      // 75–84% mediany BMI => łagodne niedożywienie (+1 pkt)
      // 65–74% mediany BMI => umiarkowane niedożywienie (+2 pkt)
      // <65% mediany BMI    => ciężkie niedożywienie (+3 pkt)
      mbmiMild: 0.85,
      mbmiModerate: 0.75,
      mbmiSevere: 0.65,
      // Bardzo niskie BMI: poniżej 2. centyla – dodaj 2 pkt
      bmiCentileSevere: 2.0,
      // Progi szybkiej utraty masy:
      rapidLossKgPerWeek: 1.0,        // >1 kg/tydz. utraty masy
      rapidLoss6mPct: 20,             // ≥20% w 6 mies. (zastępuje low weight)
      acuteLoss3mModeratePctMin: 15,  // 15–<20% w 3 mies.
      acuteLoss3mSeverePctMin: 20     // ≥20% w 3 mies.
    },
    // NOWE: parametry oceniające brak spodziewanego przyrostu (failure-to-gain)
    trajectory: {
      // Minimalny odstęp czasowy między dwoma pomiarami, aby ocenić przyrost (w dniach).
      minWindowDays: 150,
      // Spodziewany wzrost EBW w tym oknie (w kg). Jeżeli EBW wzrośnie co najmniej o tyle,
      // a rzeczywista masa nie wzrośnie, uznajemy brak spodziewanego przyrostu.
      minDeltaEbwKg: 1.5,
      // Maksymalny akceptowany rzeczywisty przyrost masy (w kg).
      // Jeśli jest równy lub mniejszy od tego, uznajemy brak przyrostu.
      maxObservedGainKg: 0
    },
    loss: {
      weeklyPctWarn: 0.5,
      weeklyPctHigh: 1.0,
      monthlyPctWarn: 3.0,
      monthlyPctHigh: 5.0
    },
    intake: {
      fracOfTEEWarn: 0.60,
      fracOfBMRWarn: 1.00
    },
    correction: {
      teeFactor: 0.85    // redukcja TEE o 15%
    },
    ui: {
      mountId: 'intakeResults' // domyślny kontener banera
    }
  };

      // Przekształca wiek w latach i miesiącach na pełne miesiące
      // Poprzednia implementacja mnożyła wiek (z ułamkiem miesięcy) przez 12 i
      // dodawała ponownie liczbę miesięcy. To prowadziło do podwójnego
      // zliczania miesięcy, gdy ageYears zawierał część ułamkową (np. 11,0833…
      // reprezentujący 11 lat i 1 miesiąc). Nowa wersja rozdziela część
      // całkowitą i ułamkową, tak aby miesiące z ageYears nie były liczone
      // dwukrotnie. Funkcja przyjmuje liczbę lat (ageYears) i dodatkowe
      // miesiące (ageMonthsOpt) z formularza i zwraca całkowitą liczbę
      // miesięcy.
      function toMonths(ageYears, ageMonthsOpt) {
        // Konwertuj dane wejściowe; NaN traktuj jako 0
        const y = Number(ageYears) || 0;
        const mOpt = Number(ageMonthsOpt) || 0;
        // Jeżeli użytkownik podał liczbę miesięcy w osobnym polu (mOpt > 0),
        // przyjmij, że ageYears zawiera tylko część całkowitą i nie zawiera
        // miesięcy jako ułamka. W przeciwnym wypadku wykorzystaj ułamek z ageYears.
        let total;
        if (mOpt > 0) {
          // Wykorzystaj całkowitą część lat i dodaj przekazane miesiące
          total = Math.floor(y) * 12 + mOpt;
        } else {
          // Użytkownik podał wiek wyłącznie w latach (być może z ułamkiem),
          // więc przemnażamy całą wartość przez 12, aby uzyskać miesiące.
          total = y * 12;
        }
        return Math.max(0, Math.round(total));
      }

  // Oblicza BMI z wagi (kg) i wzrostu (cm)
  function bmiKgM2(weightKg, heightCm) {
    const h = Number(heightCm) / 100;
    const w = Number(weightKg);
    if (!h || !w) return null;
    return w / (h * h);
  }

  // Próbuje pobrać 50. centyl BMI dla wieku i płci (jeśli funkcje istnieją)
  function getBMIp50(ageMonths, sex) {
    try {
      if (typeof window.getBmiP50ForAgeSex === 'function') {
        return window.getBmiP50ForAgeSex(ageMonths, sex);
      }
      if (typeof window.getColeBMI50 === 'function') {
        return window.getColeBMI50(ageMonths, sex);
      }
    } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', error, { line: 19149 });
    }
  }
    return null;
  }

  // Szacuje oczekiwaną masę ciała (EBW) na podstawie BMI‑50 i wzrostu
  function estimateEBW(ageMonths, sex, heightCm) {
    const bmi50 = getBMIp50(ageMonths, sex);
    if (!bmi50) return null;
    const h2 = Math.pow(Number(heightCm) / 100, 2);
    return bmi50 * h2;
  }

  // Oblicza tempo spadku masy ciała na podstawie historii pomiarów
  function computeLossRates(history) {
    if (!Array.isArray(history) || history.length < 2) return null;
    const data = history
      .map(r => {
        let t = null;
        if (r.t != null) t = Number(r.t);
        else if (r.date) t = Date.parse(r.date);
        else if (r.ageMonths != null) t = Number(r.ageMonths) * 30.44 * 24 * 3600 * 1000;
        return (t && r.weight != null) ? { t, w: Number(r.weight) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.t - b.t);
    if (data.length < 2) return null;
    let a = data[data.length - 2], b = data[data.length - 1];
    for (let i = data.length - 2; i >= 0; i--) {
      const cand = data[i];
      const days = (b.t - cand.t) / (1000 * 3600 * 24);
      if (days >= 14) { a = cand; break; }
    }
    const dtDays = Math.max(1, (b.t - a.t) / (1000 * 3600 * 24));
    const dw = b.w - a.w;
    const pctChange = (dw / a.w) * 100;
    const weeklyPct = pctChange * (7 / dtDays);
    const monthlyPct = pctChange * (30.44 / dtDays);
    return { weeklyPct, monthlyPct };
  }

  // --- Pomocnicze funkcje statystyczne dla pediatrii (0–17 lat) ---
  // Oblicza funkcję błędu (erf) i dystrybuantę normalną (phi) – potrzebne do
  // konwersji LMS -> z-score -> centyl BMI. Przybliżenie Abramowitz-Stegun
  // zapewnia wystarczającą dokładność do obliczania percentyli.
  function _erf(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }
  function _phi(z) {
    return 0.5 * (1 + _erf(z / Math.SQRT2));
  }
  // Oblicza centyl BMI na podstawie LMS (z getLMS) i podanego BMI.
  // Zwraca wartość z zakresu 0–100 lub null, jeśli nie można obliczyć.
  function bmiCentile(ageMonths, sex, bmi) {
    if (!bmi || typeof getLMS !== 'function') return null;
    const lms = getLMS(sex === 'M' ? 'M' : 'F', Math.round(ageMonths));
    if (!lms) return null;
    const [L, M, S] = lms;
    if (!M || !S) return null;
    let z;
    if (Math.abs(L) < 1e-8) {
      z = Math.log(bmi / M) / S;
    } else {
      z = (Math.pow(bmi / M, L) - 1) / (L * S);
    }
    return _phi(z) * 100;
  }
  // Zwraca bogatsze statystyki z dwóch ostatnich pomiarów masy ciała.
  // Używane do oceny szybkiej/ostrej utraty masy u dzieci i młodzieży.
  function computeTwoPointStats(history) {
    if (!Array.isArray(history) || history.length < 2) return null;
    const data = history
      .map(r => {
        let t = null;
        if (r.t != null) t = Number(r.t);
        else if (r.date) t = Date.parse(r.date);
        else if (r.ageMonths != null) t = Number(r.ageMonths) * 30.44 * 24 * 3600 * 1000;
        return (t && r.weight != null) ? { t, w: Number(r.weight) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.t - b.t);
    if (data.length < 2) return null;
    let b = data[data.length - 1], a = data[data.length - 2];
    for (let i = data.length - 2; i >= 0; i--) {
      const cand = data[i];
      const days = (b.t - cand.t) / (1000 * 3600 * 24);
      if (days >= 14) { a = cand; break; }
    }
    const dtDays = Math.max(1, (b.t - a.t) / (1000 * 3600 * 24));
    const dW = b.w - a.w;                 // różnica w kg (ujemne = utrata)
    const pctChange = (dW / a.w) * 100;   // % zmiany względem starszego punktu
    // kg utracone na tydzień (dodatnie = utrata)
    const kgPerWeek = Math.max(0, -dW) / (dtDays / 7);
    // Przeskalowane % utraty do 3 i 6 miesięcy (zawsze dodatnie)
    const pct3m = Math.max(0, -pctChange) * (91.31 / dtDays);
    const pct6m = Math.max(0, -pctChange) * (182.62 / dtDays);
    return { a, b, dtDays, dW, pctChange, kgPerWeek, pct3m, pct6m };
  }

  // Wykrywa ryzyko anoreksji na podstawie BMI, tempa spadku masy, EBW oraz spożycia
  function detectAnRisk(user, opts = {}) {
    const reasons = [];
    let severityScore = 0;
    const ageMonths = toMonths(user.ageYears, user.ageMonthsOpt);
    const isAdult = ageMonths >= 18 * 12;
    const isTeen  = ageMonths >= AN_CFG.teen.minAgeMonths && ageMonths <= AN_CFG.teen.maxAgeMonths;
    const bmi = bmiKgM2(user.weightKg, user.heightCm);
    if (isAdult && bmi) {
      if (bmi < AN_CFG.adult.bmiExtreme) {
        reasons.push(`Skrajnie niskie BMI u dorosłego (${bmi.toFixed(1).replace('.', ',')}).`);
        severityScore += 3;
      } else if (bmi < AN_CFG.adult.bmiAN) {
        reasons.push(`BMI < ${AN_CFG.adult.bmiAN} u dorosłego (${bmi.toFixed(1).replace('.', ',')}).`);
        severityScore += 2;
      } else if (bmi < AN_CFG.adult.bmiWarn) {
        reasons.push(`BMI < ${AN_CFG.adult.bmiWarn} u dorosłego (${bmi.toFixed(1).replace('.', ',')}).`);
        severityScore += 1;
      }
    }
    if (isTeen) {
      const ebw = estimateEBW(ageMonths, user.sex, user.heightCm);
      if (ebw) {
        const frac = user.weightKg / ebw;
        if (frac < AN_CFG.teen.ebwCut) {
          reasons.push(`Masa < ${(AN_CFG.teen.ebwCut * 100).toFixed(0)}% należnej dla wieku/wzrostu (EBW).`);
          severityScore += 2;
        }
      } else {
        if (bmi && bmi < AN_CFG.adult.bmiWarn) {
          // Zmieniamy separator dziesiętny na przecinek w wyświetlanej wartości BMI
          reasons.push(`Niskie BMI u młodzieży (fallback dorosłych): ${bmi.toFixed(1).replace('.', ',')}.`);
          severityScore += 1;
        }
      }
    }
    // NOWE: pediatria (0–17 lat) – analiza według wytycznych specjalistycznych
    const isPeds = (ageMonths >= AN_CFG.peds.ageMinMonths && ageMonths <= AN_CFG.peds.ageMaxMonths);
    if (isPeds && bmi) {
      // 1) Ocena niedożywienia na podstawie udziału masy do mediany BMI (MBMI)
      const bmi50 = getBMIp50(ageMonths, user.sex);
       if (bmi50) {
         const mbmi = bmi / bmi50;
         // Aby uniknąć fałszywych alarmów u szczupłych, zdrowych dzieci, ocena niedożywienia
         // na podstawie udziału masy do mediany BMI (MBMI) odbywa się tylko wtedy, gdy
         // dostępnych jest co najmniej 2 pomiarów masy w historii (bieżący + poprzedni).
         const historyCount = (opts.history && opts.history.length) ? opts.history.length : 0;
         if (historyCount >= 2) {
           if (mbmi < AN_CFG.peds.mbmiSevere) {
             reasons.push('Ciężkie niedożywienie: <65% median BMI.');
             severityScore += 3;
           } else if (mbmi < AN_CFG.peds.mbmiModerate) {
             reasons.push('Umiarkowane niedożywienie: 65–74% median BMI.');
             severityScore += 2;
           } else if (mbmi < AN_CFG.peds.mbmiMild) {
             reasons.push('Łagodne niedożywienie: 75–84% median BMI.');
             severityScore += 1;
           }
         }
       }
      // 2) Bardzo niskie BMI – poniżej 2. centyla
      const cent = bmiCentile(ageMonths, user.sex, bmi);
      if (cent != null && cent < AN_CFG.peds.bmiCentileSevere) {
        reasons.push('BMI < 2. centyla dla wieku/płci.');
        severityScore += 2;
      }
      // 3) Progi szybkiej i ostrej utraty masy z historii
      const stats = computeTwoPointStats(opts.history || null);
      if (stats) {
        // >1 kg/tydz. utraty masy
        if (stats.kgPerWeek > AN_CFG.peds.rapidLossKgPerWeek) {
          reasons.push(`Szybka utrata masy > ${AN_CFG.peds.rapidLossKgPerWeek} kg/tydz.`);
          severityScore += 2;
        }
        // ≥20% utraty w 6 mies.
        if (stats.pct6m >= AN_CFG.peds.rapidLoss6mPct) {
          reasons.push(`Szybka utrata masy ≥ ${AN_CFG.peds.rapidLoss6mPct}% w 6 mies.`);
          severityScore += 2;
        }
        // Ostry spadek w 3 mies. (15–<20% lub ≥20%)
        if (stats.pct3m >= AN_CFG.peds.acuteLoss3mSeverePctMin) {
          reasons.push('Ostry spadek masy ≥20% w 3 mies.');
          severityScore += 2;
        } else if (stats.pct3m >= AN_CFG.peds.acuteLoss3mModeratePctMin) {
          reasons.push('Ostry spadek masy 15–<20% w 3 mies.');
          severityScore += 1;
        }
        // 4) Brak spodziewanego przyrostu masy względem trajektorii EBW
        if (typeof getBmiP50ForAgeSex === 'function' || typeof getColeBMI50 === 'function') {
          const monthsBack = Math.round(stats.dtDays / 30.44);
          const ebwPrev = estimateEBW(ageMonths - monthsBack, user.sex, user.heightCm);
          const ebwCurr = estimateEBW(ageMonths, user.sex, user.heightCm);
          if (ebwPrev && ebwCurr) {
            const deltaEBW = ebwCurr - ebwPrev;
            const observedGain = stats.dW;
            // oblicz Wskaźnik Cole'a jako procent odniesienia do należnej masy (EBW)
            let colePct = null;
            try {
              colePct = (user.weightKg && ebwCurr) ? (user.weightKg / ebwCurr) * 100 : null;
            } catch (_) {
              colePct = null;
            }
            // ocena braku przyrostu tylko, gdy wystarczająco długi odstęp, oczekiwany przyrost EBW jest istotny,
            // rzeczywisty przyrost jest niewielki lub ujemny, oraz Cole < 90% (dziecko poniżej normy wagowej)
            if (stats.dtDays >= AN_CFG.trajectory.minWindowDays &&
                deltaEBW >= AN_CFG.trajectory.minDeltaEbwKg &&
                observedGain <= AN_CFG.trajectory.maxObservedGainKg &&
                colePct != null && colePct < 90) {
              reasons.push('Brak spodziewanego przyrostu masy względem trajektorii EBW (aktywne przy Cole < 90%).');
              severityScore += 1;
            }
          }
        }
      }
    }
    const rates = computeLossRates(opts.history || null);
    if (rates) {
      if (rates.weeklyPct <= -AN_CFG.loss.weeklyPctHigh || rates.monthlyPct <= -AN_CFG.loss.monthlyPctHigh) {
        reasons.push(`Gwałtowny spadek masy: ${(Math.abs(rates.weeklyPct)).toFixed(1).replace('.', ',')}%/tydz. lub ${(Math.abs(rates.monthlyPct)).toFixed(1).replace('.', ',')}%/mies.`);
        severityScore += 2;
      } else if (rates.weeklyPct <= -AN_CFG.loss.weeklyPctWarn || rates.monthlyPct <= -AN_CFG.loss.monthlyPctWarn) {
        reasons.push(`Szybki spadek masy: ${(Math.abs(rates.weeklyPct)).toFixed(1).replace('.', ',')}%/tydz. lub ${(Math.abs(rates.monthlyPct)).toFixed(1).replace('.', ',')}%/mies.`);
        severityScore += 1;
      }
    }
    if (opts.intakeKcalPerDay && (opts.bmr || opts.pal)) {
      const teeRawLocal = (opts.bmr && opts.pal) ? (opts.bmr * opts.pal) : null;
      if (teeRawLocal) {
        const fracTEE = opts.intakeKcalPerDay / teeRawLocal;
        if (fracTEE < AN_CFG.intake.fracOfTEEWarn) {
          reasons.push(`Spożycie < ${(AN_CFG.intake.fracOfTEEWarn * 100).toFixed(0)}% TEE (bardzo niskie).`);
          severityScore += 1;
        }
      }
      if (opts.bmr && opts.intakeKcalPerDay < AN_CFG.intake.fracOfBMRWarn * opts.bmr) {
        reasons.push(`Spożycie < BMR (bardzo niskie).`);
        severityScore += 1;
      }
    }
    const any = severityScore >= 1;
    let level = 'none';
    if (severityScore >= 3) level = 'high';
    else if (severityScore >= 1) level = 'warn';
    return { any, level, reasons, bmi, isAdult, isTeen };
  }

  // Funkcje UI: wstawianie i usuwanie komunikatu o ryzyku zaburzeń odżywiania
  // Zamiast osobnej ramki z czerwonym tłem wstawiamy tekst wewnątrz pola wyników (#intakeResults).
  const BAN_ID = 'an-risk-banner';

  /**
   * Wyświetla komunikat o ryzyku zaburzeń odżywiania w kontenerze wyników.
   * Ustawia również odpowiedni kolor obramowania (czerwony lub pomarańczowy)
   * oraz uruchamia animację pulsowania.
   * @param {{mountId:string, risk:{level:string,reasons:string[]}, teeRaw:number, teeAdjusted:number, factor:number}} opts
   */
  function showAnBanner({ mountId, risk, teeRaw, teeAdjusted, factor }) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    // usuń istniejący komunikat AN
    removeAnBanner(mountId);
    // Utwórz element alertu z odpowiednią klasą ('danger' dla wysokiego ryzyka, 'warn' w przeciwnym razie)
    const wrap = document.createElement('div');
    wrap.id = BAN_ID;
    const level = (risk.level === 'high') ? 'danger' : 'warn';
    wrap.className = `intake-alert ${level}`;
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    // Lista powodów, jeśli istnieje
    const reasonsList = (risk.reasons || []).map(r => `<li>${r}</li>`).join('');
    // Tytuł i treść z korektą TEE
    const title = 'Wykryto ryzyko zaburzeń odżywiania – zastosowano korektę zapotrzebowania (−15%).';
    vildaAppSetTrustedHtml(wrap, `\n      <div><strong>${title}</strong></div>\n      ${reasonsList ? `<ul class=\"intake-reasons\">${reasonsList}</ul>` : ''}\n      <div>TEE przed: <strong>${Math.round(teeRaw)} kcal/d</strong> ➔ po: <strong>${Math.round(teeAdjusted)} kcal/d</strong> (×${factor}).</div>\n    `, 'app:wrap');
    // Wstaw na koniec kontenera
    mount.appendChild(wrap);
    // Zmień kolor ramki i uruchom puls
    mount.classList.remove('bmi-warning','bmi-danger');
    if (risk.level === 'high') {
      mount.classList.add('bmi-danger');
      try { applyPulse(mount, 'danger'); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 19431 });
    }
  }
    } else {
      mount.classList.add('bmi-warning');
      try { applyPulse(mount, 'warning'); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 19434 });
    }
  }
    }
  }

  /**
   * Usuwa komunikat AN z danego kontenera. Jeśli nie pozostały inne komunikaty,
   * resetuje kolor obramowania i zatrzymuje puls.
   * @param {string} mountId
   */
  function removeAnBanner(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    const el = document.getElementById(BAN_ID);
    if (el && mount.contains(el)) mount.removeChild(el);
    // Jeśli brak innych alertów, przywróć neutralny stan
    if (!mount.querySelector('.intake-alert')) {
      mount.classList.remove('bmi-warning','bmi-danger');
      try { clearPulse(mount); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 19451 });
    }
  }
    }
  }

  // Główna funkcja: oblicza TEE z korektą i zarządza banerem
  function anorexiaRiskAdjust({ user, bmr, reeKcal, pal, teeRawKcal, history, intakeKcalPerDay, mountId }) {
    const ree = energyIsNumeric(reeKcal) ? reeKcal : (Number(bmr) || 0);
    const teeRaw = energyIsNumeric(teeRawKcal)
      ? teeRawKcal
      : (isFinite(ree) && isFinite(Number(pal)) ? (ree * Number(pal)) : 0);
    const risk = detectAnRisk(user, { history, bmr: ree, pal, intakeKcalPerDay });
    let teeAdjusted = teeRaw;
    if (risk.any) {
      teeAdjusted = Math.max(0, teeRaw * AN_CFG.correction.teeFactor);
      try {
        showAnBanner({
          mountId: mountId || AN_CFG.ui.mountId,
          risk,
          teeRaw,
          teeAdjusted,
          factor: AN_CFG.correction.teeFactor
        });
      } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', error, { line: 19473 });
    }
  }
    } else {
      try { removeAnBanner(mountId || AN_CFG.ui.mountId); } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', error, { line: 19475 });
    }
  }
    }
    return { teeRaw, teeAdjusted, risk };
  }

  // Eksport do globalnego obszaru nazw
  window.anorexiaRiskAdjust = anorexiaRiskAdjust;
  window.detectAnRisk = detectAnRisk;
})();


(function exposeVildaAnorexiaRiskModule(global) {
  'use strict';
  if (!global) return;
  const api = {
    __vildaAnorexiaRiskModule: true,
    version: '1.0.0',
    detectAnRisk: typeof global.detectAnRisk === 'function' ? global.detectAnRisk : null,
    anorexiaRiskAdjust: typeof global.anorexiaRiskAdjust === 'function' ? global.anorexiaRiskAdjust : null
  };
  global.VildaAnorexiaRisk = api;
  global.vildaAnorexiaRisk = api;
  global.vildaAnorexiaRiskVersion = function vildaAnorexiaRiskVersion() { return api.version; };
})(typeof window !== 'undefined' ? window : globalThis);
