/* ==========================================================================
 * VildaProfessionalModule — logika modułu profesjonalnego
 *
 * Plik wydzielony z app.js w kroku 8Q-2. Zachowuje dotychczasowy callback
 * inicjalizacji modułu profesjonalnego, walidację PWZ, bezpieczne helpery
 * localStorage oraz UI kart testów endokrynologicznych.
 * ========================================================================== */
(function (global) {
  const VERSION = '1.0.0';
  const STEP = '8Q-2';

  if (!global) return;

  // ── PERF: leniwe ładowanie biblioteki SheetJS (XLSX) ──────────────────────
  // Biblioteka (~kilkaset KB + ~133 ms eval) była dotąd ładowana synchronicznie
  // w <head> docpro, blokując start strony dla KAŻDEJ wizyty — choć potrzebna
  // jest wyłącznie przy wsadowym imporcie/eksporcie Z-score (rzadka akcja).
  // Teraz wstrzykujemy skrypt dopiero przy pierwszym uruchomieniu tej akcji.
  // URL + SRI (integrity) muszą zgadzać się z dawnym tagiem z docpro.html.
  var __VILDA_XLSX_SRC = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  var __VILDA_XLSX_SRI = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw';
  var __vildaXlsxLoaderPromise = null;
  function vildaEnsureXlsxLibrary() {
    // Już dostępna (np. inna podstrona ładuje ją synchronicznie) — od razu zwróć.
    if (global.XLSX && typeof global.XLSX.read === 'function') {
      return Promise.resolve(global.XLSX);
    }
    if (__vildaXlsxLoaderPromise) return __vildaXlsxLoaderPromise;
    __vildaXlsxLoaderPromise = new Promise(function (resolve, reject) {
      try {
        var doc = global.document;
        if (!doc) { reject(new Error('Brak document — nie można załadować XLSX.')); return; }
        var onReady = function () {
          if (global.XLSX && typeof global.XLSX.read === 'function') resolve(global.XLSX);
          else { __vildaXlsxLoaderPromise = null; reject(new Error('XLSX załadowane, ale obiekt niedostępny.')); }
        };
        var existing = doc.querySelector('script[data-vilda-xlsx-loader]');
        if (existing) {
          existing.addEventListener('load', onReady);
          existing.addEventListener('error', function (e) { __vildaXlsxLoaderPromise = null; reject(e || new Error('Błąd ładowania XLSX.')); });
          return;
        }
        var s = doc.createElement('script');
        s.src = __VILDA_XLSX_SRC;
        s.integrity = __VILDA_XLSX_SRI;
        s.crossOrigin = 'anonymous';
        s.async = true;
        s.setAttribute('data-vilda-xlsx-loader', '1');
        s.onload = onReady;
        s.onerror = function (e) {
          __vildaXlsxLoaderPromise = null; // pozwól na ponowną próbę przy kolejnym kliknięciu
          reject(e || new Error('Nie udało się załadować biblioteki XLSX.'));
        };
        (doc.head || doc.documentElement).appendChild(s);
      } catch (err) {
        __vildaXlsxLoaderPromise = null;
        reject(err);
      }
    });
    return __vildaXlsxLoaderPromise;
  }

  function initProfessionalModule() {
    const isDoctorCheckbox   = document.getElementById('isDoctor');
    const pwzContainer       = document.getElementById('pwzContainer');
    const pwzNumberInput     = document.getElementById('pwzNumber');
    const pwzError           = document.getElementById('pwzError');
    const professionalModule = document.getElementById('professionalModule');
    const toggleGhTestsBtn   = document.getElementById('toggleGhTests');
    // Kontener dla przycisku testów GH (umieszczony poza modułem profesjonalnym)
    const ghButtonWrapper    = document.getElementById('ghButtonWrapper');
    // Kontenery z testami GH podzielone na kolumny (lewa i prawa). Zastępują dawny ghTestsContainer.
    const ghTestsLeft  = document.getElementById('ghTestsLeft');
    const ghTestsRight = document.getElementById('ghTestsRight');

    const PROFESSIONAL_STORAGE_KEYS = Object.freeze({
      pwzNumber: 'pwzNumber',
      professionalConfirmedDate: 'professionalConfirmedDate'
    });

    function logProfessionalStorageError(action, key, error) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', error, {
          step: '8P-6',
          context: 'professional-local-storage:' + action,
          key: key
        });
      }
    }

    function getProfessionalLocalStorage() {
      try {
        if (typeof window === 'undefined') return null;
        return window.localStorage || null;
      } catch (error) {
        logProfessionalStorageError('resolve', 'window.localStorage', error);
        return null;
      }
    }

    function safeGetProfessionalStorageItem(key) {
      const storage = getProfessionalLocalStorage();
      if (!storage) return null;
      try {
        return storage.getItem(key);
      } catch (error) {
        logProfessionalStorageError('getItem', key, error);
        return null;
      }
    }

    function safeSetProfessionalStorageItem(key, value) {
      const storage = getProfessionalLocalStorage();
      if (!storage) return false;
      try {
        storage.setItem(key, String(value));
        return true;
      } catch (error) {
        logProfessionalStorageError('setItem', key, error);
        return false;
      }
    }

    // === NOWE TESTY: OGTT/GnRH i ACTH/TRH ===
    // Pobierz przyciski i kontenery dla nowych testów. Domyślnie są ukryte i pojawiają się
    // dopiero po pozytywnej weryfikacji numeru PWZ. Każdy przycisk steruje swoją
    // parą kart wynikowych.
    const toggleOgttTestsBtn = document.getElementById('toggleOgttTests');
    const ogttButtonWrapper  = document.getElementById('ogttButtonWrapper');
    const ogttTestsLeft      = document.getElementById('ogttTestsLeft');
    const ogttTestsRight     = document.getElementById('ogttTestsRight');
    const toggleActhTestsBtn = document.getElementById('toggleActhTests');
    const acthButtonWrapper  = document.getElementById('acthButtonWrapper');
    const acthTestsLeft      = document.getElementById('acthTestsLeft');
    const acthTestsRight     = document.getElementById('acthTestsRight');
    // Nowe przyciski i kontenery: główny przycisk testów endokrynologii
    // oraz przycisk leczenia hormonem wzrostu / IGF-1 wraz z listą podprzycisków.
    const toggleEndoTestsBtn  = document.getElementById('toggleEndoTests');
    const endoButtonWrapper   = document.getElementById('endoButtonWrapper');
    const toggleIgfTestsBtn   = document.getElementById('toggleIgfTests');
    const igfButtonWrapper    = document.getElementById('igfButtonWrapper');
    const snpButtonWrapper    = document.getElementById('snpButtonWrapper');
    const turnerButtonWrapper = document.getElementById('turnerButtonWrapper');
    const pwsButtonWrapper    = document.getElementById('pwsButtonWrapper');
    const sgaButtonWrapper    = document.getElementById('sgaButtonWrapper');
    const igf1ButtonWrapper   = document.getElementById('igf1ButtonWrapper');
    // Kontener dla przycisku antybiotykoterapii. Sekcja ta jest analogiczna do innych
    // przycisków modułu lekarskiego i powinna być wyświetlana wyłącznie po pozytywnej
    // weryfikacji numeru PWZ. Element ten zostanie zainicjowany również tutaj, aby
    // umożliwić jego pokazanie/ukrycie zależnie od stanu użytkownika.
    const abxButtonWrapper    = document.getElementById('abxButtonWrapper');

    // Nowy przycisk i elementy kalkulatora Z‑score (batch XLSX)
    const zscoreButtonWrapper = document.getElementById('zscoreButtonWrapper');
    // Elementy modułu leczenia bisfosfonianami (przycisk oraz karta).  
    // Przyciski są ukryte domyślnie w HTML i pokazują się dopiero po pozytywnej weryfikacji numeru PWZ.
    const bisphosButtonWrapper = document.getElementById('bisphosButtonWrapper');
    const toggleBisphosBtn    = document.getElementById('toggleBisphos');
    const bisphosCard         = document.getElementById('bisphosCard');
    const sgaBirthButtonWrapper = document.getElementById('sgaBirthButtonWrapper');
    const toggleSgaBirthBtn   = document.getElementById('toggleSgaBirth');
    const sgaBirthCard        = document.getElementById('sgaBirthCard');

    // Nowy moduł: leczenie otyłości (placeholder)
    const obesityButtonWrapper = document.getElementById('obesityButtonWrapper');
    const toggleObesityTherapyBtn = document.getElementById('toggleObesityTherapy');
    const obesityCard = document.getElementById('obesityCard');
    const toggleZscoreBtn     = document.getElementById('toggleZscore');
    const zscoreCard          = document.getElementById('zscoreCard');
    const zscoreFileInput     = document.getElementById('zscoreFileInput');
    const computeZscoreBatchBtn = document.getElementById('computeZscoreBatch');
    const zscoreMessage       = document.getElementById('zscoreMessage');

    // === Konfiguracja wyboru źródła danych dla kalkulatora Z‑score ===
    // Użytkownik wybiera pomiędzy danymi Palczewska i OLAF za pomocą dwóch przycisków.
    // Przechowujemy aktualny wybór w zmiennej zscoreBatchSourceChoice.  Domyślnie
    // ustawiamy OLAF jako źródło. Kliknięcie przycisku ustawia wybór i
    // podświetla aktywny przycisk poprzez dodanie klasy .active-toggle.
    let zscoreBatchSourceChoice = 'OLAF';
    const btnZscorePalczewska = document.getElementById('btnZscorePalczewska');
    const btnZscoreOlaf       = document.getElementById('btnZscoreOlaf');
    const getZscoreBatchSourceChoice = () => {
      if (btnZscorePalczewska && btnZscorePalczewska.classList.contains('active-toggle')) {
        return 'PALCZEWSKA';
      }
      if (btnZscoreOlaf && btnZscoreOlaf.classList.contains('active-toggle')) {
        return 'OLAF';
      }
      return zscoreBatchSourceChoice || 'OLAF';
    };
    if (btnZscorePalczewska && btnZscoreOlaf) {
      const updateZscoreButtons = (choice) => {
        zscoreBatchSourceChoice = choice;
        if (choice === 'PALCZEWSKA') {
          btnZscorePalczewska.classList.add('active-toggle');
          btnZscoreOlaf.classList.remove('active-toggle');
        } else {
          btnZscoreOlaf.classList.add('active-toggle');
          btnZscorePalczewska.classList.remove('active-toggle');
        }
      };
      btnZscorePalczewska.addEventListener('click', () => updateZscoreButtons('PALCZEWSKA'));
      btnZscoreOlaf.addEventListener('click',       () => updateZscoreButtons('OLAF'));
      zscoreBatchSourceChoice = getZscoreBatchSourceChoice();
    }

    if(!isDoctorCheckbox) return;

    // Rejestracja obsługi dla kalkulatora Z‑score (batch)
    // Funkcje te są wykonywane tylko, gdy elementy istnieją (przykład na stronie DocPro).
    if (toggleZscoreBtn) {
      toggleZscoreBtn.addEventListener('click', function () {
        // Jeśli karta Z‑score jest otwarta, zamknij ją; w przeciwnym razie otwórz i schowaj inne karty
        const visible = zscoreCard && zscoreCard.style.display !== 'none' && zscoreCard.style.display !== '';
        if (visible) {
          if (zscoreCard) zscoreCard.style.display = 'none';
          this.classList.remove('active-toggle');
        } else {
          if (zscoreCard) zscoreCard.style.display = 'block';
          this.classList.add('active-toggle');
          // Zamknij wszystkie listy testów i usuń podświetlenie przycisków
          if (ghTestsLeft && ghTestsRight) {
            ghTestsLeft.classList.remove('active');
            ghTestsRight.classList.remove('active');
          }
          if (ogttTestsLeft && ogttTestsRight) {
            ogttTestsLeft.classList.remove('active');
            ogttTestsRight.classList.remove('active');
          }
          if (acthTestsLeft && acthTestsRight) {
            acthTestsLeft.classList.remove('active');
            acthTestsRight.classList.remove('active');
          }
          if (ghButtonWrapper) ghButtonWrapper.style.display = 'none';
          if (ogttButtonWrapper) ogttButtonWrapper.style.display = 'none';
          if (acthButtonWrapper) acthButtonWrapper.style.display = 'none';
          if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
          if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
          if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
          if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
          if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
          // Przywróć widoczność przycisku IGF‑1 (jeśli ukryty)
          if (igfButtonWrapper) igfButtonWrapper.style.display = 'flex';
          // Usuń podświetlenie z innych przycisków
          if (toggleGhTestsBtn)   toggleGhTestsBtn.classList.remove('active-toggle');
          if (toggleOgttTestsBtn) toggleOgttTestsBtn.classList.remove('active-toggle');
          if (toggleActhTestsBtn) toggleActhTestsBtn.classList.remove('active-toggle');
          if (toggleEndoTestsBtn) toggleEndoTestsBtn.classList.remove('active-toggle');
          if (toggleIgfTestsBtn)  toggleIgfTestsBtn.classList.remove('active-toggle');
          // Schowaj kartę antybiotykoterapii i usuń podświetlenie jej przycisku
          const abxCard = document.getElementById('antibioticTherapyCard');
          if (abxCard) abxCard.style.display = 'none';
          const abxToggleBtn = document.getElementById('toggleAbxTherapy');
          if (abxToggleBtn) abxToggleBtn.classList.remove('active-toggle');
        }
        if (typeof adjustTestButtonWidths === 'function') {
          requestAnimationFrame(() => adjustTestButtonWidths());
        }
      });
    }
    if (computeZscoreBatchBtn) {
      computeZscoreBatchBtn.addEventListener('click', function () {
        if (!zscoreFileInput || !zscoreFileInput.files || zscoreFileInput.files.length === 0) {
          if (zscoreMessage) {
            zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
            zscoreMessage.textContent = 'Wybierz plik .xlsx zawierający dane pacjentów.';
          }
          return;
        }
        // Show a loading overlay for a brief moment to simulate processing.  The
        // overlay is hidden automatically after 2 s.  We wrap this in a try/catch
        // to avoid errors if the element does not exist.
        function __vildaRunZscoreBatch() {
        try {
          const loadingOverlay = document.getElementById('zscoreLoadingOverlay');
          if (loadingOverlay) {
            // display flex so that the Lottie animation is centered
            loadingOverlay.style.display = 'flex';
            setTimeout(() => {
              loadingOverlay.style.display = 'none';
            }, 2000);
          }
        } catch (err) {
          vildaLogAppWarn('zscore-batch-xlsx', 'Nie udało się pokazać overlay przetwarzania XLSX', err);
        }
        const file = zscoreFileInput.files[0];
        // Ustal źródło danych (Palczewska lub OLAF) na podstawie wyboru użytkownika.
        // Źródło przechowywane jest w zmiennej zscoreBatchSourceChoice ustawianej
        // przez przyciski Dane Palczewska / Dane OLAF.
        let sourceChoice = getZscoreBatchSourceChoice();
        zscoreBatchSourceChoice = sourceChoice || 'OLAF';
        if (zscoreMessage) {
          zscoreMessage.textContent = '';
        }
        const reader = new FileReader();
        reader.onerror = function () {
          vildaLogAppError('zscore-batch-xlsx', 'Błąd odczytu pliku XLSX przez FileReader', reader.error || null, { fileName: file && file.name });
          if (zscoreMessage) {
            zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
            zscoreMessage.textContent = 'Błąd odczytu pliku.';
          }
        };
        reader.onload = function (e) {
          try {
            vildaEnsureGlobalDependencyContract('zscore-batch-xlsx', { silent: true, showUi: true, throwOnMissing: false, statusElement: zscoreMessage, message: 'Brakuje biblioteki XLSX potrzebnej do przetworzenia pliku.' });
            const xlsx = vildaRequireGlobalObject('XLSX', 'zscore-batch-xlsx');
            if (!xlsx || typeof xlsx.read !== 'function' || !xlsx.utils || typeof xlsx.writeFile !== 'function') {
              vildaShowDependencyFallbackNotice('Brakuje biblioteki XLSX potrzebnej do przetworzenia pliku.', {
                moduleName: 'zscore-batch-xlsx',
                statusElement: zscoreMessage,
                statusOnly: true
              });
              return;
            }
            const data = new Uint8Array(e.target.result);
            const workbook = xlsx.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames && workbook.SheetNames.length > 0 ? workbook.SheetNames[0] : null;
            if (!sheetName) {
              if (zscoreMessage) {
                zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
                zscoreMessage.textContent = 'Plik nie zawiera arkuszy.';
              }
              return;
            }
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(worksheet, { defval: null });
            if (!jsonData || jsonData.length === 0) {
              if (zscoreMessage) {
                zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
                zscoreMessage.textContent = 'Plik nie zawiera danych.';
              }
              return;
            }
            if (jsonData.length > 250) {
              if (zscoreMessage) {
                zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
                zscoreMessage.textContent = 'Maksymalna liczba wierszy to 250. Zmniejsz dane wejściowe.';
              }
              return;
            }
            const detectColumn = (row, keys, patterns) => {
              for (const key of keys) {
                const lower = String(key).trim().toLowerCase();
                for (const pattern of patterns) {
                  if (lower.includes(pattern)) return key;
                }
              }
              return null;
            };
            const headerKeys = Object.keys(jsonData[0] || {});
            const weightKey = detectColumn(jsonData[0], headerKeys, ['waga', 'masa']);
            const heightKey = detectColumn(jsonData[0], headerKeys, ['wzrost']);
            const birthKey  = detectColumn(jsonData[0], headerKeys, ['data urodzenia', 'dataurodzenia', 'urodzenia', 'data']);
            let sexKey = detectColumn(jsonData[0], headerKeys, ['płeć', 'plec', 'sex', 'płe', 'pleć']);
            let colM = null;
            let colK = null;
            if (!sexKey) {
              const mCandidates = headerKeys.filter(k => String(k).trim().toUpperCase() === 'M');
              const kCandidates = headerKeys.filter(k => String(k).trim().toUpperCase() === 'K');
              if (mCandidates.length > 0) colM = mCandidates[0];
              if (kCandidates.length > 0) colK = kCandidates[0];
            }
            if (!weightKey || !heightKey || !birthKey || (!sexKey && !(colM || colK))) {
              if (zscoreMessage) {
                zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
                zscoreMessage.textContent = 'Nie znaleziono wymaganych kolumn w pliku. Upewnij się, że plik zawiera kolumny waga, wzrost, płeć i data urodzenia.';
              }
              return;
            }
            const output = [];
            jsonData.forEach((row) => {
              // Utwórz nowy obiekt wynikowy i pomiń kolumny bez nazwy (np. __EMPTY, Unnamed) lub puste nagłówki.
              const outRow = {};
              Object.keys(row).forEach((key) => {
                const trimmed = String(key).trim();
                if (trimmed && !trimmed.startsWith('__') && !trimmed.toLowerCase().startsWith('unnamed')) {
                  outRow[key] = row[key];
                }
              });
              try {
                // Ustal płeć na podstawie kolumny sexKey lub binarnych kolumn M/K
                let sexVal = null;
                if (sexKey) {
                  const val = row[sexKey];
                  if (val != null) {
                    const txt = String(val).trim().toUpperCase();
                    if (txt.startsWith('M')) sexVal = 'M';
                    else if (txt.startsWith('K')) sexVal = 'K';
                  }
                } else {
                  const mVal = colM ? row[colM] : null;
                  const kVal = colK ? row[colK] : null;
                  if (mVal != null && mVal !== '' && mVal !== 0) sexVal = 'M';
                  else if (kVal != null && kVal !== '' && kVal !== 0) sexVal = 'K';
                }
                if (!sexVal) throw new Error('Brak informacji o płci.');
                // Waga i wzrost
                const weightValRaw = row[weightKey];
                const weightNum = parseFloat(String(weightValRaw).replace(',', '.'));
                if (!(weightNum > 0)) throw new Error('Nieprawidłowa wartość wagi.');
                const heightValRaw = row[heightKey];
                const heightNum = parseFloat(String(heightValRaw).replace(',', '.'));
                if (!(heightNum > 0)) throw new Error('Nieprawidłowa wartość wzrostu.');
                // Odczytaj i przelicz datę urodzenia na obiekt Date
                let birthDateVal = row[birthKey];
                let birthDate;
                if (birthDateVal instanceof Date) {
                  birthDate = birthDateVal;
                } else if (typeof birthDateVal === 'number') {
                  // Konwersja z liczb excelowych: dzień 0 = 1899-12-30
                  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
                  birthDate = new Date(excelEpoch.getTime() + (birthDateVal * 24 * 3600 * 1000));
                } else if (typeof birthDateVal === 'string') {
                  // Zamień kropki na slash i parsuj
                  const parsed = Date.parse(birthDateVal.replace(/\./g, '/'));
                  if (!isNaN(parsed)) {
                    birthDate = new Date(parsed);
                  } else {
                    // Jeśli format dd-mm-yyyy lub yyyy-mm-dd, rozdziel i zbuduj datę
                    const parts = birthDateVal.split(/[-\/]/);
                    if (parts.length === 3) {
                      // próbujemy obu układów (dzień pierwszy) i (rok pierwszy)
                      // Spróbuj RRRR-MM-DD
                      let dt;
                      if (parts[0].length === 4) {
                        dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                      } else {
                        // dd-mm-yyyy
                        dt = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
                      }
                      if (!isNaN(dt.getTime())) {
                        birthDate = dt;
                      }
                    }
                  }
                }
                if (!(birthDate instanceof Date) || isNaN(birthDate.getTime())) {
                  throw new Error('Nieprawidłowa data urodzenia.');
                }
                // Oblicz wiek i BMI
                const now = new Date();
                const diffMs = now.getTime() - birthDate.getTime();
                const ageYears = diffMs / (365.25 * 24 * 3600 * 1000);
                const ageMonths = ageYears * 12;
                const bmi = weightNum / Math.pow(heightNum / 100, 2);
                // Dopisz BMI i Z-score'y
                outRow.BMI = Math.round(bmi * 10) / 10;
                let zW = null, zH = null, zBMI = null;
                if (sourceChoice === 'PALCZEWSKA') {
                  const statsW = calcPercentileStatsPal(weightNum, sexVal, ageYears, 'WT');
                  zW = statsW ? statsW.sd : null;
                  const statsH = calcPercentileStatsPal(heightNum, sexVal, ageYears, 'HT');
                  zH = statsH ? statsH.sd : null;
                  const originalBmiSource = bmiSource;
                  try {
                    bmiSource = 'PALCZEWSKA';
                    zBMI = bmiZscore(bmi, sexVal, ageMonths);
                  } finally {
                    bmiSource = originalBmiSource;
                  }
                } else {
                  const originalBmiSource = bmiSource;
                  try {
                    bmiSource = 'OLAF';
                    const statsW = calcPercentileStats(weightNum, sexVal, ageYears, 'WT');
                    zW = statsW ? statsW.sd : null;
                    const statsH = calcPercentileStats(heightNum, sexVal, ageYears, 'HT');
                    zH = statsH ? statsH.sd : null;
                    zBMI = bmiZscore(bmi, sexVal, ageMonths);
                  } finally {
                    bmiSource = originalBmiSource;
                  }
                }
                outRow['Z_waga']   = (zW !== null && zW !== undefined) ? Math.round(zW * 100) / 100 : '';
                outRow['Z_wzrost'] = (zH !== null && zH !== undefined) ? Math.round(zH * 100) / 100 : '';
                outRow['Z_BMI']    = (zBMI !== null && zBMI !== undefined) ? Math.round(zBMI * 100) / 100 : '';
                // Nadpisz kolumnę daty urodzenia czytelnym łańcuchem znaków w formacie RRRR-MM-DD, poprzedzonym apostrofem.
                const isoStr = birthDate.toISOString().slice(0, 10);
                outRow[birthKey] = "'" + isoStr;
              } catch (err) {
                vildaLogAppWarn('zscore-batch-xlsx', 'Pominięto nieprawidłowy wiersz podczas przeliczania Z-score XLSX', err, { fileName: file && file.name });
                console.error(err);
                return;
              }
              output.push(outRow);
            });
            if (!output || output.length === 0) {
              if (zscoreMessage) {
                zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
                zscoreMessage.textContent = 'Brak prawidłowych danych do obliczeń.';
              }
              return;
            }
            const wsOut = xlsx.utils.json_to_sheet(output);
            const wbOut = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wbOut, wsOut, 'Wyniki');
            const baseName = file.name.replace(/\.(xlsx|xls)$/i, '');
            const fileName = baseName + '_Zscore.xlsx';
            xlsx.writeFile(wbOut, fileName);
            if (zscoreMessage) {
              zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--success') || '#007e33';
              zscoreMessage.textContent = 'Obliczenia zakończone. Plik został pobrany.';
            }
          } catch (ex) {
            vildaLogAppError('zscore-batch-xlsx', 'Błąd przetwarzania lub eksportu pliku XLSX Z-score', ex, { fileName: file && file.name });
            console.error(ex);
            if (zscoreMessage) {
              zscoreMessage.style.color = getComputedStyle(document.documentElement).getPropertyValue('--danger') || '#d32f2f';
              zscoreMessage.textContent = 'Wystąpił błąd podczas przetwarzania pliku.';
            }
          }
        };
        reader.readAsArrayBuffer(file);
        } // koniec __vildaRunZscoreBatch

        // PERF (lazy XLSX): najpierw upewnij się, że biblioteka jest załadowana,
        // potem dopiero przetwarzaj. Pierwsze kliknięcie pobiera skrypt z CDN;
        // kolejne korzystają z cache przeglądarki. Gdy ładowanie zawiedzie —
        // pokaż istniejący komunikat fallbacku (ta sama ścieżka co brak biblioteki).
        if (zscoreMessage) {
          zscoreMessage.style.color = '';
          zscoreMessage.textContent = 'Wczytywanie biblioteki…';
        }
        vildaEnsureXlsxLibrary().then(function () {
          if (zscoreMessage && zscoreMessage.textContent === 'Wczytywanie biblioteki…') {
            zscoreMessage.textContent = '';
          }
          __vildaRunZscoreBatch();
        }).catch(function (err) {
          vildaLogAppError('zscore-batch-xlsx', 'Nie udało się załadować biblioteki XLSX (lazy-load)', err, null);
          vildaShowDependencyFallbackNotice('Brakuje biblioteki XLSX potrzebnej do przetworzenia pliku.', {
            moduleName: 'zscore-batch-xlsx',
            statusElement: zscoreMessage,
            statusOnly: true
          });
        });
      });
    }

    // Obsługa zmiany stanu checkboxa "Jestem lekarzem". Jeśli istnieje zapamiętany numer
    // prawa wykonywania zawodu w localStorage, to po zaznaczeniu checkboxa automatycznie
    // zostanie pokazany moduł profesjonalny bez ponownego pytania o numer. W przeciwnym
    // razie wyświetlimy pole do wpisania numeru i zweryfikujemy wpisaną wartość.
    isDoctorCheckbox.addEventListener('change', function(){
      // Po każdym kliknięciu checkboxa „Jestem lekarzem” wywołujemy krótką wibrację urządzenia (jeśli obsługiwane)
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(100);
        }
      } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31058 });
    }
  }
      const storedPwz = safeGetProfessionalStorageItem(PROFESSIONAL_STORAGE_KEYS.pwzNumber);
      if(this.checked){
        if(storedPwz){
          // Użytkownik uprzednio zgodził się na zapamiętanie numeru – nie pytamy ponownie.
          // Zamiast od razu pokazywać kartę z komunikatem, zastosuj overlay
          // edukacyjny, jeśli minął miesiąc od ostatniego potwierdzenia. Po potwierdzeniu
          // lub gdy overlay nie jest wymagany, aktywuj moduł profesjonalny.  Ta
          // funkcja ukryje kartę z komunikatem i pokaże odpowiednie przyciski.
          const proceedWithModule = () => {
            // Ukryj pole wprowadzania PWZ oraz komunikat o błędzie
            pwzContainer.style.display = 'none';
            pwzError.style.display     = 'none';
            // Aktywuj moduł profesjonalny bez ponownego pytania o zapamiętanie numeru
            activateProfessionalModule(storedPwz);
          };
          if (typeof shouldShowProfessionalOverlay === 'function' && shouldShowProfessionalOverlay()) {
            showProfessionalOverlay(proceedWithModule);
          } else {
            proceedWithModule();
          }
        } else {
          // Brak zapamiętanego numeru – umożliwiamy jego wpisanie i weryfikację
          pwzContainer.style.display = 'block';
          // Pokaż instrukcję wpisania numeru PWZ
          try {
            var doctorInfoEl = document.querySelector('.doctor-info');
            if (doctorInfoEl) doctorInfoEl.style.display = '';
          } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31088 });
    }
  }
          // Ukryj przyciski testów, dopóki numer nie zostanie pozytywnie zweryfikowany
          if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
          if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
          if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
          // Ukryj również główne przyciski modułu lekarskiego i wszystkie podprzyciski IGF‑1
          if (abxButtonWrapper)   abxButtonWrapper.style.display   = 'none';
          if (endoButtonWrapper)  endoButtonWrapper.style.display  = 'none';
          if (igfButtonWrapper)   igfButtonWrapper.style.display   = 'none';
          if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
          if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
          if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
          if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
          if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
          // Ukryj kalkulator Z‑score (przycisk i kartę), dopóki numer PWZ nie zostanie pozytywnie zweryfikowany
          if (typeof zscoreButtonWrapper !== 'undefined' && zscoreButtonWrapper) {
            zscoreButtonWrapper.style.display = 'none';
          }
          if (typeof zscoreCard !== 'undefined' && zscoreCard) {
            zscoreCard.style.display = 'none';
          }
          // Ukryj moduł leczenia bisfosfonianami, dopóki numer PWZ nie zostanie pozytywnie zweryfikowany
          if (bisphosButtonWrapper) {
            bisphosButtonWrapper.style.display = 'none';
          }
          if (bisphosCard) {
            bisphosCard.style.display = 'none';
          }
          if (toggleBisphosBtn) {
            toggleBisphosBtn.classList.remove('active-toggle');
          }
          if (sgaBirthButtonWrapper) {
            sgaBirthButtonWrapper.style.display = 'none';
          }
          if (sgaBirthCard) {
            sgaBirthCard.style.display = 'none';
          }
          if (toggleSgaBirthBtn) {
            toggleSgaBirthBtn.classList.remove('active-toggle');
          }
          // Ukryj moduł leczenia otyłości (placeholder), dopóki numer PWZ nie zostanie pozytywnie zweryfikowany
          if (obesityButtonWrapper) {
            obesityButtonWrapper.style.display = 'none';
          }
          if (obesityCard) {
            obesityCard.style.display = 'none';
          }
          if (toggleObesityTherapyBtn) {
            toggleObesityTherapyBtn.classList.remove('active-toggle');
          }
          // Wywołujemy walidację dla obecnej wartości, by w razie potrzeby od razu
          // włączyć moduł (np. po ponownym zaznaczeniu checkboxa z zachowaną wartością).
          validatePWZ();
        }
      } else {
        // Odznaczono checkbox – ukrywamy pole, moduł oraz komunikaty
        pwzContainer.style.display       = 'none';
        professionalModule.style.display = 'none';
        pwzError.style.display           = 'none';
        // Ukryj instrukcję wpisania numeru PWZ, gdy użytkownik nie jest lekarzem
        try {
          var doctorInfoEl = document.querySelector('.doctor-info');
          if (doctorInfoEl) doctorInfoEl.style.display = 'none';
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31151 });
    }
  }
        // Ukryj wszystkie przyciski testów, gdy użytkownik nie jest lekarzem
        if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
        if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
        if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
        if (abxButtonWrapper)   abxButtonWrapper.style.display   = 'none';
        // Ukryj przycisk i kartę leczenia bisfosfonianami, jeśli numer PWZ jest niepoprawny
        if (bisphosButtonWrapper) {
          bisphosButtonWrapper.style.display = 'none';
        }
        if (bisphosCard) {
          bisphosCard.style.display = 'none';
        }
        if (toggleBisphosBtn) {
          toggleBisphosBtn.classList.remove('active-toggle');
        }
        // Ukryj moduł leczenia otyłości (placeholder) przy wyłączeniu modułu profesjonalnego
        if (obesityButtonWrapper) {
          obesityButtonWrapper.style.display = 'none';
        }
        if (obesityCard) {
          obesityCard.style.display = 'none';
        }
        if (toggleObesityTherapyBtn) {
          toggleObesityTherapyBtn.classList.remove('active-toggle');
        }
        if (endoButtonWrapper)  endoButtonWrapper.style.display  = 'none';
        if (igfButtonWrapper)   igfButtonWrapper.style.display   = 'none';
        // Ukryj wszystkie podprzyciski IGF‑1
        if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
        if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
        if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
        if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
        if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';

        // Ukryj kalkulator Z‑score (przycisk i kartę) oraz usuń podświetlenie
        // przycisku Kalkulator Z‑score, gdy moduł lekarski jest deaktywowany.
        if (typeof zscoreButtonWrapper !== 'undefined' && zscoreButtonWrapper) {
          zscoreButtonWrapper.style.display = 'none';
        }
        // Ukryj przycisk i kartę leczenia bisfosfonianami przy wyłączeniu modułu profesjonalnego
        if (bisphosButtonWrapper) {
          bisphosButtonWrapper.style.display = 'none';
        }
        if (bisphosCard) {
          bisphosCard.style.display = 'none';
        }
        if (typeof toggleBisphosBtn !== 'undefined' && toggleBisphosBtn) {
          toggleBisphosBtn.classList.remove('active-toggle');
        }
        if (sgaBirthButtonWrapper) {
          sgaBirthButtonWrapper.style.display = 'none';
        }
        if (sgaBirthCard) {
          sgaBirthCard.style.display = 'none';
        }
        if (toggleSgaBirthBtn) {
          toggleSgaBirthBtn.classList.remove('active-toggle');
        }
        // Ukryj moduł leczenia otyłości (placeholder)
        if (obesityButtonWrapper) {
          obesityButtonWrapper.style.display = 'none';
        }
        if (obesityCard) {
          obesityCard.style.display = 'none';
        }
        if (toggleObesityTherapyBtn) {
          toggleObesityTherapyBtn.classList.remove('active-toggle');
        }
        if (typeof zscoreCard !== 'undefined' && zscoreCard) {
          zscoreCard.style.display = 'none';
        }
        if (typeof toggleZscoreBtn !== 'undefined' && toggleZscoreBtn) {
          toggleZscoreBtn.classList.remove('active-toggle');
        }
        // Ukryj wszystkie listy testów
        if (ghTestsLeft && ghTestsRight) {
          ghTestsLeft.classList.remove('active');
          ghTestsRight.classList.remove('active');
        }
        if (ogttTestsLeft && ogttTestsRight) {
          ogttTestsLeft.classList.remove('active');
          ogttTestsRight.classList.remove('active');
        }
        if (acthTestsLeft && acthTestsRight) {
          acthTestsLeft.classList.remove('active');
          acthTestsRight.classList.remove('active');
        }
        // Jeśli użytkownik wyłącza moduł profesjonalny, schowaj kartę antybiotykoterapii
        // oraz usuń podświetlenie przycisku Antybiotykoterapia. Dzięki temu karta
        // nie pozostanie widoczna, gdy użytkownik nie ma uprawnień.
        const abxCard = document.getElementById('antibioticTherapyCard');
        if (abxCard) {
          abxCard.style.display = 'none';
        }
        const abxToggleBtn = document.getElementById('toggleAbxTherapy');
        if (abxToggleBtn) {
          abxToggleBtn.classList.remove('active-toggle');
        }
        // Jeśli numer PWZ nie został zapamiętany, wyczyść wpisaną wartość,
        // aby przy ponownym zaznaczeniu checkboxa wymagać ponownego podania numeru.
        if (!safeGetProfessionalStorageItem(PROFESSIONAL_STORAGE_KEYS.pwzNumber)) {
          pwzNumberInput.value = '';
        }
        // Po każdej zmianie widoczności przycisków testów aktualizuj ich szerokość.
        // Używamy requestAnimationFrame, aby poczekać na zakończenie bieżącego
        // przebiegu renderowania – dzięki temu elementy mają już właściwe
        // rozmiary, gdy funkcja pobiera ich szerokość.
        if (typeof adjustTestButtonWidths === 'function') {
          requestAnimationFrame(() => adjustTestButtonWidths());
        }
      }
    });

    // Po zainicjowaniu elementów w dokumencie: jeśli przeglądarka nie
    // przechowuje zapamiętanego numeru PWZ, upewnij się, że pole wejściowe
    // jest puste przy pierwszym załadowaniu strony. W niektórych
    // przeglądarkach formularze mogą zachowywać wcześniejsze dane
    // wprowadzane przed odświeżeniem (autouzupełnianie), co powodowałoby
    // natychmiastowe ukrywanie pola po ponownym zaznaczeniu checkboxa.
    if(!safeGetProfessionalStorageItem(PROFESSIONAL_STORAGE_KEYS.pwzNumber)){
      pwzNumberInput.value = '';
    }

    // Po załadowaniu elementów i wstępnej inicjalizacji wywołaj logikę
    // obsługi checkboxa „Jestem lekarzem”.  Bez tego kroku pole na
    // numer PWZ mogłoby pozostać ukryte po pierwszym załadowaniu strony,
    // ponieważ handler „change” uruchamia się tylko po interakcji.
    // Dzięki dispatchEvent z eventem „change” zapewniamy, że UI zostanie
    // dostosowane zależnie od tego, czy numer PWZ jest zapamiętany oraz
    // czy overlay powinien się pojawić.
    if (isDoctorCheckbox && isDoctorCheckbox.checked) {
      setTimeout(() => {
        try {
          const ev = new Event('change');
          isDoctorCheckbox.dispatchEvent(ev);
        } catch(err) {
          // Fallback: ręcznie wykonaj część logiki z handlera
          const storedPwzInit = safeGetProfessionalStorageItem(PROFESSIONAL_STORAGE_KEYS.pwzNumber);
          if (storedPwzInit) {
            const proceedWithModule = () => {
              pwzContainer.style.display = 'none';
              pwzError.style.display     = 'none';
              activateProfessionalModule(storedPwzInit);
            };
            if (typeof shouldShowProfessionalOverlay === 'function' && shouldShowProfessionalOverlay()) {
              showProfessionalOverlay(proceedWithModule);
            } else {
              proceedWithModule();
            }
          } else {
            pwzContainer.style.display = 'block';
            validatePWZ();
          }
        }
      }, 0);
    }

    // Walidacja numeru PWZ: 7 cyfr. Jeśli poprawny – pokaż moduł profesjonalny.
    // Funkcja obliczająca cyfrę kontrolną i weryfikująca numer PWZ.
    // Numer PWZ ma format KABCDEF, gdzie K jest cyfrą kontrolną.
    function verifyPWZ(num){
      // Sprawdź długość, cyfry i brak wiodącego zera.
      // Numer PWZ składa się z siedmiu cyfr i nie zaczyna się od zera.
      // Używamy wyrażenia regularnego ^[1-9]\d{6}$, aby odrzucić ciągi
      // zaczynające się od 0 (np. „0000000”), które mimo poprawnej
      // cyfry kontrolnej nie są prawidłowymi numerami.
      if(!/^[1-9]\d{6}$/.test(num)) return false;
      const digits = num.split('').map(d => parseInt(d, 10));
      // Suma ważona cyfr A‑F z wagami 1..6 (indeksy 1..6 w tablicy)
      let sum = 0;
      for(let i = 1; i < digits.length; i++){
        sum += digits[i] * i;
      }
      let control = sum % 11;
      // Jeśli reszta to 10, numer jest niepoprawny
      if(control === 10) return false;
      return digits[0] === control;
    }

    /*
     * Sprawdza, czy należy wyświetlić overlay informacyjny modułu profesjonalnego.
     * Overlay jest wyświetlany, jeśli w localStorage nie zapisano daty potwierdzenia
     * (professionalConfirmedDate) lub minęło co najmniej 30 dni od ostatniego
     * potwierdzenia. Funkcja zwraca true, gdy overlay powinien się pojawić.
     */
    function shouldShowProfessionalOverlay(){
      try {
        const ts = safeGetProfessionalStorageItem(PROFESSIONAL_STORAGE_KEYS.professionalConfirmedDate);
        if(!ts) return true;
        const last = parseInt(ts, 10);
        if(isNaN(last)) return true;
        const now = Date.now();
        const diffDays = (now - last) / (1000 * 60 * 60 * 24);
        return diffDays >= 30;
      } catch(e){
        return true;
      }
    }

    /*
     * Wyświetla pełnoekranowy overlay z informacją o charakterze edukacyjnym modułu
     * profesjonalnego i dwoma przyciskami: „Potwierdzam” oraz „Wychodzę”.
     * Po kliknięciu „Potwierdzam” zapisuje datę potwierdzenia w localStorage
     * (klucz professionalConfirmedDate) i wywołuje przekazaną funkcję callback.
     * Po kliknięciu „Wychodzę” zamyka overlay i przekierowuje użytkownika do
     * strony głównej.  Jeśli overlay nie istnieje w DOM, natychmiast wywołuje callback.
     */
    function showProfessionalOverlay(onConfirm){
      const overlay    = document.getElementById('professionalOverlay');
      const confirmBtn = document.getElementById('professionalConfirmBtn');
      const exitBtn    = document.getElementById('professionalExitBtn');
      if(!overlay || !confirmBtn || !exitBtn){
        if(typeof onConfirm === 'function') onConfirm();
        return;
      }
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      overlay.style.display = 'flex';
      function cleanup(){
        overlay.style.display = 'none';
        document.body.style.overflow = prevOverflow;
        confirmBtn.removeEventListener('click', confirmHandler);
        exitBtn.removeEventListener('click', exitHandler);
      }
      function confirmHandler(){
        cleanup();
        try {
          safeSetProfessionalStorageItem(PROFESSIONAL_STORAGE_KEYS.professionalConfirmedDate, Date.now().toString());
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31380 });
    }
  }
        // Ukryj kartę z komunikatem w module profesjonalnym, ponieważ została ona zastąpiona overlayem
        try {
          const msgCard = document.getElementById('professionalModule');
          if(msgCard) msgCard.style.display = 'none';
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31385 });
    }
  }
        if(typeof onConfirm === 'function') onConfirm();
      }
      function exitHandler(){
        cleanup();
        // Przekieruj do strony głównej serwisu
        try {
          window.location.href = '/';
        } catch(e) {
          window.location.pathname = '/';
        }
      }
      confirmBtn.addEventListener('click', confirmHandler);
      exitBtn.addEventListener('click', exitHandler);
    }

    /*
     * Wyświetla pełnoekranowy overlay z pytaniem, czy zapamiętać numer
     * prawa wykonywania zawodu lekarza w tej przeglądarce.  Używa tego
     * samego stylu co overlay modułu profesjonalnego.  Po kliknięciu
     * „Tak” zapisuje numer w localStorage (klucz pwzNumber).  Po
     * kliknięciu „Nie” nie zapisuje numeru.  Po dokonaniu wyboru
     * zamyka overlay i przywraca poprzedni stan przewijania.  Opcjonalny
     * callback onComplete jest wywoływany po zamknięciu overlayu.
     */
    function showRememberPwzOverlay(val, onComplete){
      const overlay   = document.getElementById('rememberPwzOverlay');
      const yesBtn    = document.getElementById('rememberPwzYesBtn');
      const noBtn     = document.getElementById('rememberPwzNoBtn');
      if(!overlay || !yesBtn || !noBtn){
        if(typeof onComplete === 'function') onComplete();
        return;
      }
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      overlay.style.display = 'flex';
      function cleanup(){
        overlay.style.display = 'none';
        document.body.style.overflow = prevOverflow;
        yesBtn.removeEventListener('click', yesHandler);
        noBtn.removeEventListener('click', noHandler);
      }
      function yesHandler(){
        cleanup();
        try{
          safeSetProfessionalStorageItem(PROFESSIONAL_STORAGE_KEYS.pwzNumber, val);
        }catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31431 });
    }
  }
        if(typeof onComplete === 'function') onComplete();
      }
      function noHandler(){
        cleanup();
        if(typeof onComplete === 'function') onComplete();
      }
      yesBtn.addEventListener('click', yesHandler);
      noBtn.addEventListener('click', noHandler);
    }

    /*
     * Aktywuje moduł profesjonalny po pozytywnej weryfikacji numeru PWZ.
     * Ukrywa zbędne elementy, pokazuje główne przyciski, resetuje pola
     * i proponuje zapamiętanie numeru PWZ.  Funkcja przyjmuje numer PWZ,
     * aby ewentualnie zapisać go w localStorage.
     */
    function activateProfessionalModule(val){
      // Ukryj komunikat o błędzie
      pwzError.style.display = 'none';
      // Ukryj instrukcję wpisania PWZ
      try {
        var doctorInfoEl = document.querySelector('.doctor-info');
        if (doctorInfoEl) doctorInfoEl.style.display = 'none';
      } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31455 });
    }
  }
      // Ukryj kartę z komunikatem modułu (zostanie ukryta również po potwierdzeniu)
      if (professionalModule) {
        professionalModule.style.display = 'none';
      }
      // Pokaż główne przyciski modułu lekarskiego
      if (abxButtonWrapper)   { abxButtonWrapper.style.display   = 'flex'; }
      if (endoButtonWrapper)  { endoButtonWrapper.style.display  = 'flex'; }
      if (igfButtonWrapper)   { igfButtonWrapper.style.display   = 'flex'; }
      // Pokaż przycisk kalkulatora Z‑score, gdy moduł profesjonalny jest aktywowany
      if (typeof zscoreButtonWrapper !== 'undefined' && zscoreButtonWrapper) {
        zscoreButtonWrapper.style.display = 'flex';
      }
      // Pokaż przycisk leczenia otyłości (placeholder)
      if (obesityButtonWrapper) {
        obesityButtonWrapper.style.display = 'flex';
      }
      // Pokaż przycisk leczenia bisfosfonianami, gdy moduł profesjonalny jest aktywowany
      if (bisphosButtonWrapper) {
        bisphosButtonWrapper.style.display = 'flex';
      }
      if (sgaBirthButtonWrapper) {
        sgaBirthButtonWrapper.style.display = 'flex';
      }
      if (sgaBirthCard) {
        sgaBirthCard.style.display = 'none';
      }
      if (toggleSgaBirthBtn) {
        toggleSgaBirthBtn.classList.remove('active-toggle');
      }
      // Ukryj kartę Z‑score – użytkownik otworzy ją ręcznie przyciskiem
      if (typeof zscoreCard !== 'undefined' && zscoreCard) {
        zscoreCard.style.display = 'none';
      }
      // Ukryj kartę leczenia otyłości – użytkownik otworzy ją ręcznie
      if (obesityCard) {
        obesityCard.style.display = 'none';
      }
      if (toggleObesityTherapyBtn) {
        toggleObesityTherapyBtn.classList.remove('active-toggle');
      }
      // Ukryj przyciski poszczególnych testów – użytkownik rozwinie je z menu
      if (ghButtonWrapper)    { ghButtonWrapper.style.display    = 'none'; }
      if (ogttButtonWrapper)  { ogttButtonWrapper.style.display  = 'none'; }
      if (acthButtonWrapper)  { acthButtonWrapper.style.display  = 'none'; }
      // Ukryj podprzyciski IGF‑1
      if (snpButtonWrapper)    { snpButtonWrapper.style.display    = 'none'; }
      if (turnerButtonWrapper) { turnerButtonWrapper.style.display = 'none'; }
      if (pwsButtonWrapper)    { pwsButtonWrapper.style.display    = 'none'; }
      if (sgaButtonWrapper)    { sgaButtonWrapper.style.display    = 'none'; }
      if (igf1ButtonWrapper)   { igf1ButtonWrapper.style.display   = 'none'; }
      // Ukryj wszystkie listy testów
      if (ghTestsLeft  && ghTestsRight)  { ghTestsLeft.classList.remove('active');  ghTestsRight.classList.remove('active'); }
      if (ogttTestsLeft && ogttTestsRight){ ogttTestsLeft.classList.remove('active'); ogttTestsRight.classList.remove('active'); }
      if (acthTestsLeft && acthTestsRight){ acthTestsLeft.classList.remove('active'); acthTestsRight.classList.remove('active'); }
      // Dopasuj szerokości przycisków
      if (typeof adjustTestButtonWidths === 'function') {
        adjustTestButtonWidths();
      }
      // Zapytaj o zapamiętanie numeru PWZ poprzez overlay, jeśli numer nie został jeszcze zapisany
      if(!safeGetProfessionalStorageItem(PROFESSIONAL_STORAGE_KEYS.pwzNumber)){
        // Wywołaj overlay zapamiętywania.  Nie przekazujemy callbacku, ponieważ
        // dalsza logika nie wymaga oczekiwania na wybór użytkownika.  Moduł
        // profesjonalny jest już aktywny, a overlay blokuje interakcję do
        // momentu podjęcia decyzji przez użytkownika.
        showRememberPwzOverlay(val);
      }
      // Ukryj pole wprowadzania numeru
      pwzContainer.style.display = 'none';
      // Wyczyść wpisaną wartość, aby przy ponownym włączeniu modułu wymagane było
      // ponowne wpisanie numeru, jeśli nie został zapamiętany
      pwzNumberInput.value = '';
    }

    function validatePWZ(){
      const val     = pwzNumberInput.value.trim();
      const isValid = verifyPWZ(val);
      // Jeśli numer jest poprawny
      if(isValid){
        // *** Niestandardowa obsługa modułu profesjonalnego ***
        // Zamiast natychmiast pokazywać moduł profesjonalny, wywołujemy overlay
        // z komunikatem edukacyjnym. Po potwierdzeniu aktywujemy moduł.
        pwzError.style.display = 'none';
        const proceedFn = () => activateProfessionalModule(val);
        if (shouldShowProfessionalOverlay()) {
          showProfessionalOverlay(proceedFn);
        } else {
          proceedFn();
        }
        return;
        // Ukryj komunikat o błędzie i pokaż moduł profesjonalny
        pwzError.style.display = 'none';
        professionalModule.style.display = 'block';
        // Po pozytywnej weryfikacji numeru ukryj instrukcję wpisania PWZ
        try {
          var doctorInfoEl = document.querySelector('.doctor-info');
          if (doctorInfoEl) doctorInfoEl.style.display = 'none';
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31552 });
    }
  }
        // Pokaż główne przyciski modułu lekarskiego po pozytywnej weryfikacji numeru
        if (abxButtonWrapper)  abxButtonWrapper.style.display  = 'flex';
        if (endoButtonWrapper)  endoButtonWrapper.style.display  = 'flex';
        if (igfButtonWrapper)   igfButtonWrapper.style.display   = 'flex';
        // Ukryj przyciski poszczególnych testów (GH/OGTT/ACTH) – użytkownik rozwinie je z menu endo
        if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
        if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
        if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
        // Ukryj podprzyciski IGF‑1; użytkownik może je rozwinąć później
        if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
        if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
        if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
        if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
        if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
        // Nie pokazujemy od razu listy testów. Użytkownik może ją otworzyć później.
        if (ghTestsLeft && ghTestsRight) {
          ghTestsLeft.classList.remove('active');
          ghTestsRight.classList.remove('active');
        }
        if (ogttTestsLeft && ogttTestsRight) {
          ogttTestsLeft.classList.remove('active');
          ogttTestsRight.classList.remove('active');
        }
        if (acthTestsLeft && acthTestsRight) {
          acthTestsLeft.classList.remove('active');
          acthTestsRight.classList.remove('active');
        }
        // Po uaktywnieniu modułu i pokazaniu przycisków testów natychmiast
        // wyrównaj ich szerokości. Wykonujemy to synchronicznie, aby
        // zapewnić prawidłowy wygląd zanim pojawi się blokujący popup
        // (okno confirm). Funkcja adjustTestButtonWidths ustawi taką samą
        // szerokość wszystkich przycisków testów.
        if (typeof adjustTestButtonWidths === 'function') {
          adjustTestButtonWidths();
        }
        // Jeśli w pamięci przeglądarki nie ma jeszcze zapisanego numeru,
        // zapytaj użytkownika o zapamiętanie. Wywołujemy to tylko przy
        // pierwszej poprawnej weryfikacji w danej przeglądarce.
        if(!safeGetProfessionalStorageItem(PROFESSIONAL_STORAGE_KEYS.pwzNumber)){
          const remember = window.confirm('Czy zapamiętać podany numer prawa wykonywania zawodu w tej przeglądarce?');
          if(remember){
            try{
              safeSetProfessionalStorageItem(PROFESSIONAL_STORAGE_KEYS.pwzNumber, val);
            }catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31596 });
    }
  }
          }
        }
        // Zawsze ukryj pole wprowadzania numeru po udanej walidacji,
        // niezależnie od tego, czy użytkownik zapamiętał numer.
        pwzContainer.style.display = 'none';
        // Wyczyść wpisaną wartość, aby przy ponownym włączeniu modułu
        // wymagane było ponowne wpisanie numeru jeśli nie został zapamiętany.
        pwzNumberInput.value = '';
      } else {
        // Numer niepoprawny. Wyświetl błąd tylko gdy użytkownik coś wpisał.
        pwzError.style.display = val ? 'block' : 'none';
        professionalModule.style.display = 'none';
        // Przy niepoprawnym numerze pokaż ponownie instrukcję wpisania PWZ
        try {
          var doctorInfoEl = document.querySelector('.doctor-info');
          if (doctorInfoEl) doctorInfoEl.style.display = '';
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31615 });
    }
  }
        // Ukryj wszystkie przyciski testów w razie niepoprawnego numeru
        if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
        if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
        if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
        if (endoButtonWrapper)  endoButtonWrapper.style.display  = 'none';
        if (igfButtonWrapper)   igfButtonWrapper.style.display   = 'none';
        if (abxButtonWrapper)   abxButtonWrapper.style.display   = 'none';
        if (sgaBirthButtonWrapper) sgaBirthButtonWrapper.style.display = 'none';
        // Ukryj podprzyciski IGF‑1
        if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
        if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
        if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
        if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
        if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
        // Ukryj wszystkie listy testów
        if (ghTestsLeft && ghTestsRight) {
          ghTestsLeft.classList.remove('active');
          ghTestsRight.classList.remove('active');
        }
        if (ogttTestsLeft && ogttTestsRight) {
          ogttTestsLeft.classList.remove('active');
          ogttTestsRight.classList.remove('active');
        }
        if(acthTestsLeft && acthTestsRight){
          acthTestsLeft.classList.remove('active');
          acthTestsRight.classList.remove('active');
        }
        // Schowaj kartę antybiotykoterapii i wyłącz podświetlenie przycisku, jeśli numer PWZ jest niepoprawny
        const abxCard = document.getElementById('antibioticTherapyCard');
        if (abxCard) {
          abxCard.style.display = 'none';
        }
        const abxToggleBtn = document.getElementById('toggleAbxTherapy');
        if (abxToggleBtn) {
          abxToggleBtn.classList.remove('active-toggle');
        }
        if (sgaBirthCard) {
          sgaBirthCard.style.display = 'none';
        }
        if (toggleSgaBirthBtn) {
          toggleSgaBirthBtn.classList.remove('active-toggle');
        }
      }
      // Po aktualizacji widoczności przycisków testów (zarówno przy poprawnym,
      // jak i błędnym numerze), wyrównaj ich szerokości w układzie dwukolumnowym.
      // Używamy requestAnimationFrame, aby zmiana była obliczana po zrenderowaniu
      // elementów – inaczej pomiar mógłby zwrócić zbyt małe wartości.
      if (typeof adjustTestButtonWidths === 'function') {
        requestAnimationFrame(() => adjustTestButtonWidths());
      }
    }

      // Po każdej zmianie checkboxa aktualizuj pozycję i wygląd sekcji modułu
      // lekarskiego (np. mniejszy rozmiar w trybie mobilnym przy włączonych
      // wynikach). Funkcję repositionDoctor deklarujemy niżej.
      if (typeof repositionDoctor === 'function') {
        repositionDoctor();
      }
    if(pwzNumberInput){
      pwzNumberInput.addEventListener('input', validatePWZ);
    }

    // Otwieranie i zamykanie listy testów GH
    if(toggleGhTestsBtn){
      toggleGhTestsBtn.addEventListener('click', function(){
        // Zamknij kalkulator Z‑score, jeśli jest otwarty, gdy użytkownik otwiera listę GH
        if (typeof zscoreCard !== 'undefined' && zscoreCard && zscoreCard.style.display !== 'none') {
          zscoreCard.style.display = 'none';
          if (typeof toggleZscoreBtn !== 'undefined' && toggleZscoreBtn) toggleZscoreBtn.classList.remove('active-toggle');
        }
        // Jeśli nie znaleziono kontenerów testów, przerwij
        if(!ghTestsLeft || !ghTestsRight) return;
        // Listę testów uważamy za widoczną, jeśli lewy kontener ma klasę 'active'
        const currentlyActive = ghTestsLeft.classList.contains('active');
        if(currentlyActive){
          // Ukryj oba kontenery
          ghTestsLeft.classList.remove('active');
          ghTestsRight.classList.remove('active');
        } else {
          // Pokaż oba kontenery i przelicz dawki
          ghTestsLeft.classList.add('active');
          ghTestsRight.classList.add('active');
          computeGhResults();
        }
        // Po zmianie widoczności listy GH aktualizujemy stan aktywnego przycisku.
        try {
          if (document.body && document.body.classList.contains('liquid-ios26')) {
            const isActiveNow = ghTestsLeft.classList.contains('active');
            if (isActiveNow) {
              toggleGhTestsBtn.classList.add('active-toggle');
            } else {
              toggleGhTestsBtn.classList.remove('active-toggle');
            }
          }
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31710 });
    }
  }
      });
    }

    // Otwieranie i zamykanie listy testów OGTT/GnRH
    if(toggleOgttTestsBtn){
      toggleOgttTestsBtn.addEventListener('click', function(){
        // Zamknij kalkulator Z‑score, jeśli jest otwarty, gdy użytkownik otwiera listę OGTT
        if (typeof zscoreCard !== 'undefined' && zscoreCard && zscoreCard.style.display !== 'none') {
          zscoreCard.style.display = 'none';
          if (typeof toggleZscoreBtn !== 'undefined' && toggleZscoreBtn) toggleZscoreBtn.classList.remove('active-toggle');
        }
        if(!ogttTestsLeft || !ogttTestsRight) return;
        const isActive = ogttTestsLeft.classList.contains('active');
        if(isActive){
          ogttTestsLeft.classList.remove('active');
          ogttTestsRight.classList.remove('active');
        } else {
          ogttTestsLeft.classList.add('active');
          ogttTestsRight.classList.add('active');
          computeOgttResults();
        }
        // Aktualizuj aktywne podświetlenie przycisku OGTT
        try {
          if (document.body && document.body.classList.contains('liquid-ios26')) {
            const isActiveNow = ogttTestsLeft.classList.contains('active');
            if (isActiveNow) {
              toggleOgttTestsBtn.classList.add('active-toggle');
            } else {
              toggleOgttTestsBtn.classList.remove('active-toggle');
            }
          }
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31744 });
    }
  }
      });
    }
    // Otwieranie i zamykanie listy testów ACTH/TRH
    if(toggleActhTestsBtn){
      toggleActhTestsBtn.addEventListener('click', function(){
        // Zamknij kalkulator Z‑score, jeśli jest otwarty, gdy użytkownik otwiera listę ACTH
        if (typeof zscoreCard !== 'undefined' && zscoreCard && zscoreCard.style.display !== 'none') {
          zscoreCard.style.display = 'none';
          if (typeof toggleZscoreBtn !== 'undefined' && toggleZscoreBtn) toggleZscoreBtn.classList.remove('active-toggle');
        }
        if(!acthTestsLeft || !acthTestsRight) return;
        const isActive = acthTestsLeft.classList.contains('active');
        if(isActive){
          acthTestsLeft.classList.remove('active');
          acthTestsRight.classList.remove('active');
        } else {
          acthTestsLeft.classList.add('active');
          acthTestsRight.classList.add('active');
          computeActhResults();
        }
        // Aktualizuj aktywne podświetlenie przycisku ACTH
        try {
          if (document.body && document.body.classList.contains('liquid-ios26')) {
            const isActiveNow = acthTestsLeft.classList.contains('active');
            if (isActiveNow) {
              toggleActhTestsBtn.classList.add('active-toggle');
            } else {
              toggleActhTestsBtn.classList.remove('active-toggle');
            }
          }
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31777 });
    }
  }
      });
    }

    // Otwieranie i zamykanie listy testów endokrynologicznych (GH/OGTT/ACTH)
    // Kliknięcie w przycisk „Testy w endokrynologii” powoduje rozwinięcie lub zwinięcie listy testów GH, OGTT i ACTH.
    if (toggleEndoTestsBtn) {
      toggleEndoTestsBtn.addEventListener('click', function() {
        // Zamknij kalkulator Z‑score, jeśli jest otwarty, gdy użytkownik otwiera lub zamyka listę endokrynologiczną
        if (typeof zscoreCard !== 'undefined' && zscoreCard && zscoreCard.style.display !== 'none') {
          zscoreCard.style.display = 'none';
          if (typeof toggleZscoreBtn !== 'undefined' && toggleZscoreBtn) toggleZscoreBtn.classList.remove('active-toggle');
        }
        // Jeżeli przyciski testów GH/OGTT/ACTH są widoczne (display !== 'none'), traktujemy listę jako otwartą
        const isVisible = ghButtonWrapper && ghButtonWrapper.style.display !== 'none';
        if (isVisible) {
          // Lista jest otwarta – chowamy przyciski poszczególnych testów i zwijamy otwarte karty testów
          if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'none';
          if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'none';
          if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'none';
          // Zamknij wszystkie karty testów GH, OGTT i ACTH
          if (ghTestsLeft && ghTestsRight) {
            ghTestsLeft.classList.remove('active');
            ghTestsRight.classList.remove('active');
          }
          if (ogttTestsLeft && ogttTestsRight) {
            ogttTestsLeft.classList.remove('active');
            ogttTestsRight.classList.remove('active');
          }
          if (acthTestsLeft && acthTestsRight) {
            acthTestsLeft.classList.remove('active');
            acthTestsRight.classList.remove('active');
          }
        } else {
          // Lista jest zwinięta – pokaż przyciski testów GH/OGTT/ACTH
          if (ghButtonWrapper)    ghButtonWrapper.style.display    = 'flex';
          if (ogttButtonWrapper)  ogttButtonWrapper.style.display  = 'flex';
          if (acthButtonWrapper)  acthButtonWrapper.style.display  = 'flex';
        }
        // Po zmianie widoczności wyrównaj szerokość przycisków w układzie dwukolumnowym
        if (typeof adjustTestButtonWidths === 'function') {
          requestAnimationFrame(() => adjustTestButtonWidths());
        }
        // Aktualizuj aktywne podświetlenie przycisku „Testy w endokrynologii”
        try {
          if (document.body && document.body.classList.contains('liquid-ios26')) {
            const listOpen = ghButtonWrapper && ghButtonWrapper.style.display !== 'none';
            if (listOpen) {
              toggleEndoTestsBtn.classList.add('active-toggle');
            } else {
              toggleEndoTestsBtn.classList.remove('active-toggle');
              // Zwijanie listy usuwa również podświetlenie z podprzycisków GH/OGTT/ACTH
              if (typeof toggleGhTestsBtn !== 'undefined' && toggleGhTestsBtn)   toggleGhTestsBtn.classList.remove('active-toggle');
              if (typeof toggleOgttTestsBtn !== 'undefined' && toggleOgttTestsBtn) toggleOgttTestsBtn.classList.remove('active-toggle');
              if (typeof toggleActhTestsBtn !== 'undefined' && toggleActhTestsBtn) toggleActhTestsBtn.classList.remove('active-toggle');
            }
          }
        } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 31836 });
    }
  }
      });
    }

    // Otwieranie i zamykanie listy testów IGF‑1 (SNP, Zespół Turnera, Zespół PWS, SGA, IGF‑1)
    // Kliknięcie w przycisk „Leczenie hormonem wzrostu / IGF‑1” rozwija lub zwija listę pięciu podprzycisków.
    if (toggleIgfTestsBtn) {
      toggleIgfTestsBtn.addEventListener('click', function() {
        // Zamknij kalkulator Z‑score, jeśli jest otwarty, gdy użytkownik otwiera lub zamyka listę IGF
        if (typeof zscoreCard !== 'undefined' && zscoreCard && zscoreCard.style.display !== 'none') {
          zscoreCard.style.display = 'none';
          if (typeof toggleZscoreBtn !== 'undefined' && toggleZscoreBtn) toggleZscoreBtn.classList.remove('active-toggle');
        }
        // Sprawdź, czy pierwszy podprzycisk jest aktualnie widoczny
        const isOpen = snpButtonWrapper && snpButtonWrapper.style.display !== 'none';
        if (isOpen) {
          // Lista jest otwarta – chowamy wszystkie podprzyciski IGF‑1
          if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'none';
          if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'none';
          if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'none';
          if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'none';
          if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'none';
        } else {
          // Lista jest zamknięta – pokaż wszystkie podprzyciski IGF‑1
          if (snpButtonWrapper)    snpButtonWrapper.style.display    = 'flex';
          if (turnerButtonWrapper) turnerButtonWrapper.style.display = 'flex';
          if (pwsButtonWrapper)    pwsButtonWrapper.style.display    = 'flex';
          if (sgaButtonWrapper)    sgaButtonWrapper.style.display    = 'flex';
          if (igf1ButtonWrapper)   igf1ButtonWrapper.style.display   = 'flex';
        }
        // Wyrównaj szerokości przycisków po zmianie
        if (typeof adjustTestButtonWidths === 'function') {
          requestAnimationFrame(() => adjustTestButtonWidths());
        }
      });
    }

    /**
     * Oblicza dawki dla poszczególnych testów stymulacyjnych GH i aktualizuje karty.
     * Wzory obliczeniowe:
     *   – Arginina: 0,5 g/kg masy ciała, maks. 30 g.
     *   – Klonidyna: 0,10–0,15 mg/m² powierzchni ciała (podajemy w mikrogramach).
     *   – L‑Dopa: 300 mg/m² powierzchni ciała; wg masy ciała <15 kg: 125 mg, 15–35 kg: 250 mg, >35 kg: 500 mg.
     *   – Insulina: 0,1 j./kg; w szczególnych przypadkach (deficyt GH, <5 r.ż.) 0,05 j./kg.
     *   – Glukagon: 0,03 mg/kg masy ciała, maks. 1 mg; >90 kg: 1,5 mg.
     */
    function computeGhResults(){
      const weightInput = document.getElementById('weight');
      const heightInput = document.getElementById('height');
      if(!weightInput || !heightInput) return;
      const weight = parseFloat(weightInput.value);
      const height = parseFloat(heightInput.value);
      // Jeśli brak danych, wyświetl komunikat w kartach
      if(!(weight > 0 && height > 0)){
        const cards = document.querySelectorAll('#ghTestsLeft .gh-test-card, #ghTestsRight .gh-test-card');
        cards.forEach(card => {
          const p = card.querySelector('p');
          if(p){
            p.textContent = 'Wprowadź wagę i wzrost, aby obliczyć dawkę.';
          }
        });
        return;
      }
      // Powierzchnia ciała – wzór Mostellera (cm i kg): sqrt((wzrost_cm × masa_kg) / 3600)
      const bsa = Math.sqrt((height * weight) / 3600);
      // Test z argininą: 0,5 g/kg, maks. 30 g
      const arginineDose = Math.min(weight * 0.5, 30);
      // Test z klonidyną: 0,10–0,15 mg/m²; przeliczenie na µg (1 mg = 1000 µg)
      // Zakres dawki w mikrogramach obliczamy jak dotychczas.
      const clonidineLowUg  = bsa * 0.10 * 1000;
      const clonidineHighUg = bsa * 0.15 * 1000;

      /*
       * Przeliczanie dawek klonidyny na liczbę tabletek Iporel.
       * Jedna tabletka Iporelu zawiera 75 µg substancji czynnej. Ponieważ
       * tabletkę można bezpiecznie podzielić jedynie na pół, zaokrąglamy
       * obliczoną liczbę tabletek do najbliższej połówki. Dodatkowo
       * prezentujemy odpowiadającą temu zaokrągleniu ilość w mikrogramach.
       */
      const iporelTabUg = 75;
      // Zaokrąglenie do najbliższej 0,5 tabletki
      const roundToHalf = (val) => Math.round(val * 2) / 2;
      const iporelLowTabs  = roundToHalf(clonidineLowUg  / iporelTabUg);
      const iporelHighTabs = roundToHalf(clonidineHighUg / iporelTabUg);
      // Formatowanie liczby tabletek tak, aby zamiast kropki użyć przecinka
      const formatTablet = (t) => {
        // jeśli wartość jest całkowita, nie pokazujemy części dziesiętnej
        const str = (t % 1 === 0) ? t.toFixed(0) : t.toString();
        return str.replace('.', ',');
      };
      // Formatowanie mikrogramów – jeśli ma część dziesiętną .5, wyświetlamy jedną cyfrę
      const formatMicrog = (ug) => {
        // zaokrąglamy do 0,1 µg, choć wartości połówkowe dają dokładnie x,5
        const rounded = Math.round(ug * 10) / 10;
        // usuwamy .0 aby nie wyświetlać zbędnych zer po przecinku
        const str = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
        return str.replace('.', ',');
      };
      const iporelRangeTabStr = `${formatTablet(iporelLowTabs)}–${formatTablet(iporelHighTabs)} tabl.`;
      const iporelRangeUgLow  = iporelLowTabs  * iporelTabUg;
      const iporelRangeUgHigh = iporelHighTabs * iporelTabUg;
      const iporelRangeUgStr  = `${formatMicrog(iporelRangeUgLow)}–${formatMicrog(iporelRangeUgHigh)} µg`;
      const iporelInfo = `Iporel: ${iporelRangeTabStr} (${iporelRangeUgStr})`;
      // Test z L‑Dopą: 300 mg/m² oraz progowe dawki wg masy ciała
      const lDopaPerM2 = bsa * 300; // mg
      let lDopaWeightCat;
      if(weight < 15)      lDopaWeightCat = 125;
      else if(weight <= 35) lDopaWeightCat = 250;
      else                  lDopaWeightCat = 500;
      // Test z insuliną: 0,1 j./kg; dodatkowo 0,05 j./kg
      // W zależności od wieku dziecka dawki insuliny mogą ulec zmianie. Domyślnie
      // obliczamy wartości 0,1 j./kg oraz 0,05 j./kg, ale wybór odpowiedniej
      // dawki nastąpi później w opisie. Jeśli wiek <5 lat, stosujemy tylko 0,05 j./kg.
      const insulinDose    = weight * 0.1;
      const insulinDoseLow = weight * 0.05;
      // Test z glukagonem: 0,03 mg/kg (maks. 1 mg; >90 kg: 1,5 mg)
      let glucagonDose = weight * 0.03;
      if(weight > 90){
        glucagonDose = 1.5;
      }else if(glucagonDose > 1){
        glucagonDose = 1;
      }
      // Ustal opis dawki insuliny w zależności od wieku. Jeśli wiek nie został
      // podany, poproś użytkownika o jego wprowadzenie. Przy wieku <5 lat
      // stosowana jest dawka 0,05 j./kg; w przeciwnym razie prezentujemy
      // domyślną dawkę 0,1 j./kg z alternatywną dawką 0,05 j./kg.
      let insulinDesc;
      // Wiek z uwzględnieniem miesięcy (lata + miesiące/12). Wiek 0 lat jest
      // prawidłowy, o ile został wpisany jawnie; puste pole wieku nadal oznacza brak danych.
      const ageStateForInsulin = (typeof vildaGetMainAgeInputState === 'function') ? vildaGetMainAgeInputState() : null;
      const ageVal = ageStateForInsulin && ageStateForInsulin.value != null ? ageStateForInsulin.value : getAgeDecimal();
      if(!(ageStateForInsulin ? ageStateForInsulin.validNonNegative : vildaIsFiniteNonNegative(ageVal))){
        insulinDesc = 'Podaj wiek dziecka, aby obliczyć dawkę insuliny.';
      } else if(ageVal < 5){
        // Zmieniamy separator dziesiętny na przecinek dla dawki insuliny
        insulinDesc = `Dawka: ${insulinDoseLow.toFixed(2).replace('.', ',')} j. (0,05 j./kg)`;
      } else {
        // Używamy przecinków jako separatorów dziesiętnych dla obu dawek
        insulinDesc = `Dawka: ${insulinDose.toFixed(2).replace('.', ',')} j. (0,1 j./kg); alternatywnie ${insulinDoseLow.toFixed(2).replace('.', ',')} j. (0,05 j./kg)`;
      }
      // Przygotuj opisy dla kart. Do wyniku testu z klonidyną dodajemy również
      // informację o liczbie tabletek Iporelu potrzebnych do podania dawki.
      const descriptions = [
        `Zakres dawki: ${Math.round(clonidineLowUg)}–${Math.round(clonidineHighUg)} µg (0,10–0,15 mg/m²); ${iporelInfo}`,
        // Zamiana kropki na przecinek dla dawki glukagonu
        `Dawka: ${glucagonDose.toFixed(2).replace('.', ',')} mg (0,03 mg/kg; maks. 1 mg, >90 kg: 1,5 mg)` ,
        insulinDesc,
        // Zamiana kropki na przecinek dla dawki argininy
        `Dawka: ${arginineDose.toFixed(1).replace('.', ',')} g (0,5 g/kg; maks. 30 g)` ,
        `Dawka wg masy: ${lDopaWeightCat} mg; wg 300 mg/m²: ${Math.round(lDopaPerM2)} mg`
      ];
      // Przygotuj tablicę ostrzeżeń przeciwwskazań w zależności od wieku dziecka.
      const warnings = ['', '', '', '', ''];
      const ageStateForWarn = (typeof vildaGetMainAgeInputState === 'function') ? vildaGetMainAgeInputState() : null;
      const ageValForWarn = ageStateForWarn && ageStateForWarn.value != null ? ageStateForWarn.value : getAgeDecimal();
      if(ageStateForWarn ? ageStateForWarn.validNonNegative : vildaIsFiniteNonNegative(ageValForWarn)) {
        // Testy z klonidyną, glukagonem, argininą oraz L‑Dopą są przeciwwskazane u dzieci <2 r.ż.
        if(ageValForWarn < 2) {
          warnings[0] = 'Test przeciwwskazany u dzieci poniżej 2. roku życia!';
          warnings[1] = 'Test przeciwwskazany u dzieci poniżej 2. roku życia!';
          warnings[3] = 'Test przeciwwskazany u dzieci poniżej 2. roku życia!';
          warnings[4] = 'Test przeciwwskazany u dzieci poniżej 2. roku życia!';
        }
        // Test z insuliną jest przeciwwskazany u dzieci <5 r.ż.
        if(ageValForWarn < 5) {
          warnings[2] = 'Test przeciwwskazany u dzieci poniżej 5. roku życia!';
        }
      }
      // Zaktualizuj treści kart z uwzględnieniem ostrzeżeń. Pobieramy karty z kontenerów
      // ghTestsLeft i ghTestsRight. Kolejność kart odpowiada kolejności testów:
      // klonidyna, glukagon, insulina, arginina, L‑Dopa.
      const cards = document.querySelectorAll('#ghTestsLeft .gh-test-card, #ghTestsRight .gh-test-card');
      cards.forEach((card, idx) => {
        const p = card.querySelector('p');
        if(!p) return;
        const desc = descriptions[idx] || '';
        const warn = warnings[idx] || '';
        if(warn) {
          // Wstawiamy span z klasą ostrzeżenia poniżej opisu przez kontrolowany helper HTML.
          vildaAppSetTrustedHtml(p, `${desc}<br><span class="gh-test-warning">${warn}</span>`, 'app:p');
        } else {
          // Jeśli nie ma ostrzeżenia, zachowujemy zwykły tekst (textContent),
          // co zapobiega interpretacji znaków specjalnych jako HTML.
          p.textContent = desc;
        }
      });
    }

    /**
     * Oblicza dawki dla testu OGTT oraz GnRH/LHRH i aktualizuje karty wynikowe.
     * Wzory obliczeniowe:
     *   – OGTT: 1,75 g/kg masy ciała; maksymalnie 75 g.
     *   – GnRH/LHRH: 2,5 µg/kg masy ciała; maksymalnie 100 µg.
     * Jeśli waga nie została podana, prosi użytkownika o jej wprowadzenie.
     */
    function computeOgttResults(){
      const weightInput = document.getElementById('weight');
      if(!weightInput) return;
      const weight = parseFloat(weightInput.value);
      // Pobierz oba paragrafy kart testów OGTT i GnRH
      const ogttCard = document.querySelector('#ogttTestsLeft .gh-test-card p');
      const gnrhCard = document.querySelector('#ogttTestsRight .gh-test-card p');
      if(!(weight > 0)){
        if(ogttCard) ogttCard.textContent = 'Wprowadź wagę, aby obliczyć dawkę.';
        if(gnrhCard) gnrhCard.textContent = 'Wprowadź wagę, aby obliczyć dawkę.';
        return;
      }
      // Obliczenie dawek
      let ogttDose = weight * 1.75;
      if(ogttDose > 75) ogttDose = 75;
      let gnrhDose = weight * 2.5;
      if(gnrhDose > 100) gnrhDose = 100;
      // Formatowanie z przecinkiem zamiast kropki
      const formatDose = (dose) => {
        return (dose % 1 === 0 ? dose.toFixed(0) : dose.toFixed(2)).replace('.', ',');
      };
      if(ogttCard) ogttCard.textContent = `Dawka: ${formatDose(ogttDose)}\u00a0g (1,75\u00a0g/kg; maks.\u00a075\u00a0g)`;
      if(gnrhCard) gnrhCard.textContent = `Dawka: ${formatDose(gnrhDose)}\u00a0µg (2,5\u00a0µg/kg; maks.\u00a0100\u00a0µg)`;
    }

    /**
     * Oblicza dawki dla testu z dużą dawką ACTH oraz testu z TRH.
     * Wzory obliczeniowe:
     *   – ACTH: dzieci >2 lat – 250 µg; dzieci ≤2 lat – 15 µg/kg masy ciała (maks. 125 µg).
     *   – TRH: 7 µg/kg masy ciała; maksymalnie 200 µg. Część źródeł podaje dawkę maks. 400 µg.
     * Jeśli wymagane dane (wiek lub waga) nie zostały podane, wyświetla komunikat.
     */
    function computeActhResults(){
      const weightInput = document.getElementById('weight');
      const weight = weightInput ? parseFloat(weightInput.value) : NaN;
      // Użyj funkcji pomocniczej do obliczenia wieku z dokładnością do miesięcy.
      const ageState = (typeof vildaGetMainAgeInputState === 'function') ? vildaGetMainAgeInputState() : null;
      const age = ageState && ageState.value != null ? ageState.value : getAgeDecimal();
      // Pobierz paragrafy kart testów ACTH i TRH
      const acthCard = document.querySelector('#acthTestsLeft .gh-test-card p');
      const trhCard  = document.querySelector('#acthTestsRight .gh-test-card p');
      // ACTH: potrzebujemy wieku i wagi
      if(!((ageState ? ageState.validNonNegative : vildaIsFiniteNonNegative(age))) || !(weight > 0)){
        if(acthCard) acthCard.textContent = 'Podaj wiek i wagę, aby obliczyć dawkę ACTH.';
      } else {
        let acthDose;
        if(age <= 2){
          acthDose = weight * 15;
          if(acthDose > 125) acthDose = 125;
        } else {
          acthDose = 250;
        }
        const doseStr = (acthDose % 1 === 0 ? acthDose.toFixed(0) : acthDose.toFixed(2)).replace('.', ',');
        if(acthCard) acthCard.textContent = `Dawka: ${doseStr}\u00a0µg (${age <= 2 ? '15\u00a0µg/kg; maks.\u00a0125\u00a0µg' : 'stała dawka 250\u00a0µg'})`;
      }
      // TRH: potrzebujemy wagi
      if(!(weight > 0)){
        if(trhCard) trhCard.textContent = 'Wprowadź wagę, aby obliczyć dawkę.';
      } else {
        let trhDose = weight * 7;
        if(trhDose > 200) trhDose = 200;
        const doseStr = (trhDose % 1 === 0 ? trhDose.toFixed(0) : trhDose.toFixed(2)).replace('.', ',');
        if(trhCard) trhCard.textContent = `Dawka: ${doseStr}\u00a0µg (7\u00a0µg/kg; maks.\u00a0200\u00a0µg; niektóre źródła: maks.\u00a0400\u00a0µg)`;
      }
    }

    // Aktualizuj dawki testów endokrynologicznych przy każdej zmianie wagi, wzrostu
    // lub wieku (w latach i miesiącach).  Dzięki temu wyniki w kartach testów GH/OGTT/ACTH
    // są odświeżane na bieżąco, bez konieczności zamykania i ponownego otwierania kart.
    const weightInputEl  = document.getElementById('weight');
    const heightInputEl  = document.getElementById('height');
    const ageInputEl     = document.getElementById('age');
    const ageMonthsEl    = document.getElementById('ageMonths');
    // Funkcja pomocnicza do podpięcia wielu zdarzeń do jednego elementu.
    function attachListeners(el, handlers){
      if(!el) return;
      ['input','change'].forEach(evt => {
        el.addEventListener(evt, handlers);
      });
    }
    // Przy zmianie wagi i wzrostu przeliczamy wszystkie testy endokrynologiczne
    attachListeners(weightInputEl, function(){
      computeGhResults();
      computeOgttResults();
      computeActhResults();
    });
    attachListeners(heightInputEl, function(){
      computeGhResults();
      computeOgttResults();
      computeActhResults();
    });
    // Przy zmianie wieku (lata) oraz wieku w miesiącach przeliczamy testy zależne od wieku
    attachListeners(ageInputEl, function(){
      computeGhResults();
      computeActhResults();
    });
    attachListeners(ageMonthsEl, function(){
      computeGhResults();
      computeActhResults();
    });
  
  }

  function getSnapshot() {
    return {
      kind: 'vilda-professional-module-snapshot',
      version: VERSION,
      step: STEP,
      readOnly: true,
      moduleOnly: true,
      didRenderDom: false,
      didCallWindowUpdate: false,
      api: {
        init: typeof initProfessionalModule === 'function',
        initProfessionalModule: typeof initProfessionalModule === 'function'
      }
    };
  }

  global.VildaProfessionalModule = Object.freeze({
    __vildaProfessionalModule: true,
    VERSION: VERSION,
    version: VERSION,
    STEP: STEP,
    step: STEP,
    init: initProfessionalModule,
    initProfessionalModule: initProfessionalModule,
    getSnapshot: getSnapshot
  });
  global.vildaGetProfessionalModuleSnapshot = getSnapshot;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
