







/*
 * flu_therapy.js
 *
 * Moduł leczenia infekcji wirusowych dla aplikacji Vilda Clinic.
 *
 * Ten skrypt dodaje obsługę przycisku „Leczenie infekcji wirusowych”,
 * rozwijanej karty z formularzem oraz generowanie zaleceń leczenia wybranej infekcji
 * (obecnie grypy) zgodnie z rekomendacjami FLU KOMPAS (POZ – Adults)
 * oraz KOMPAS Grypa 23/24 dla dzieci. Struktura modułu została zaprojektowana
 * tak, aby umożliwiać dodawanie kolejnych wskazań wirusowych w przyszłości.
 * W module uwzględniono dostępną w Polsce substancję czynną oseltamiwir oraz
 * zarejestrowane preparaty (Tamiflu, Ebilfumin, Segosana, Tamivil). Skrypt
 * oblicza dawki terapeutyczne i profilaktyczne na podstawie wieku i masy
 * ciała pacjenta oraz uwzględnia opcje dotyczące przynależności do grupy
 * ryzyka, profilaktyki dla domowników i zachęty do szczepień. Przyciski
 * i karta są domyślnie ukryte i pojawiają się po pozytywnej weryfikacji
 * numeru PWZ (w chwili gdy widoczny staje się przycisk „Antybiotykoterapia”).
 */


function fluEscapeHtml(value) {
  if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.escapeHtml === 'function') {
    return window.VildaHtml.escapeHtml(value);
  }
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fluTextToHtml(value) {
  if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.textToHtml === 'function') {
    return window.VildaHtml.textToHtml(value);
  }
  return fluEscapeHtml(value).replace(/\r\n|\r|\n/g, '<br>');
}

function fluSafeUrl(value) {
  if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.safeUrl === 'function') {
    return window.VildaHtml.safeUrl(value, { fallback: '#' });
  }
  const raw = String(value == null ? '' : value).trim();
  return /^(https?:|mailto:|tel:)/i.test(raw) ? raw : '#';
}

function fluSourceToSafeHtml(value) {
  const raw = String(value == null ? '' : value).trim();
  const anchorMatch = raw.match(/^<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>$/i);
  if (anchorMatch) {
    const href = fluSafeUrl(anchorMatch[1]);
    const label = anchorMatch[2].replace(/<[^>]*>/g, '');
    if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.linkHtml === 'function') {
      return window.VildaHtml.linkHtml(href, label, { target: '_blank', rel: 'noopener noreferrer' });
    }
    return `<a href="${fluEscapeHtml(href)}" target="_blank" rel="noopener noreferrer">${fluEscapeHtml(label)}</a>`;
  }
  return fluEscapeHtml(raw);
}

function fluSetEscapedHtml(element, text) {
  if (!element) return false;
  if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.setEscapedHtml === 'function') {
    return window.VildaHtml.setEscapedHtml(element, text, { context: 'flu-therapy:recommendation' });
  }
  element.textContent = String(text == null ? '' : text);
  return true;
}

function fluSetTrustedHtml(element, html, context) {
  if (!element) return false;
  if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.setTrustedHtml === 'function') {
    return window.VildaHtml.setTrustedHtml(element, html, { context: context || 'flu-therapy:trusted-markup' });
  }
  element.textContent = html || '';
  return true;
}

function fluClearHtml(element) {
  if (!element) return false;
  if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.clearHtml === 'function') {
    return window.VildaHtml.clearHtml(element);
  }
  element.textContent = '';
  return true;
}

// Czekamy na pełne wczytanie DOM, aby mieć dostęp do wszystkich elementów.
function initFluTherapyModule() {
  // Elementy interfejsu modułu leczenia infekcji wirusowych
  const fluBtnWrapper = document.getElementById('fluButtonWrapper');
  const abxBtnWrapper = document.getElementById('abxButtonWrapper');
  const fluBtn = document.getElementById('toggleFluTherapy');
  const fluCard = document.getElementById('fluCard');
  const copyBtn = document.getElementById('fluCopyRec');

  // Selectory i kontener dla wyboru infekcji.  Umożliwiają wybór choroby (np. grypy)
  // oraz ukrywanie/pokazywanie sekcji szczegółowych w zależności od wskazania.
  const infectionSelect = document.getElementById('infectionSelect');
  const virusControls = document.getElementById('virusControls');

  /**
   * Po weryfikacji PWZ przycisk Antybiotykoterapia jest ustawiany na
   * display:flex. Aby przycisk „Leczenie infekcji wirusowych” pojawił się
   * w tym samym czasie, obserwujemy widoczność przycisku antybiotykoterapii.
   * Gdy przestanie on być ukryty, ustawiamy taki sam display na naszym
   * przycisku.
   */
  function showFluBtnIfAbxVisible() {
    if (!fluBtnWrapper || !abxBtnWrapper) return;
    const abxStyle = getComputedStyle(abxBtnWrapper);
      // Jeżeli przycisk antybiotykoterapii jest widoczny (display ≠ none),
      // ustaw identyczny display dla przycisku leczenia infekcji wirusowych. Domyślnie
      // element ma display:none w HTML.
    if (abxStyle.display !== 'none') {
      fluBtnWrapper.style.display = abxStyle.display;
    }
  }

  // Po załadowaniu spróbuj od razu pokazać przycisk leczenia infekcji wirusowych.
  showFluBtnIfAbxVisible();
  // Dodatkowo sprawdzaj co 500 ms przez kilka sekund, aby wychwycić
  // moment weryfikacji PWZ, gdy skrypt z zewnątrz zmieni display przycisku
  // antybiotykoterapii. Po pojawieniu się obu przycisków zatrzymujemy
  // interwał.
  const intervalId = setInterval(() => {
    showFluBtnIfAbxVisible();
    if (fluBtnWrapper && abxBtnWrapper) {
      const abxVisible = getComputedStyle(abxBtnWrapper).display !== 'none';
      const fluVisible = getComputedStyle(fluBtnWrapper).display !== 'none';
      if (abxVisible && fluVisible) {
        clearInterval(intervalId);
      }
    }
  }, 500);

  // Obsługa kliknięcia przycisku – rozwijanie i zwijanie karty leczenia infekcji wirusowych.
  // Dodatkowo nadajemy klasę .active-toggle, aby wywołać turkusową ramkę wokół przycisku
  // (style definiowane w ios26-v2.css).  Klasa jest dodawana, gdy karta jest
  // widoczna, i usuwana po jej ukryciu.  Używamy stopPropagation, by uniknąć
  // kolizji z innymi modułami, analogicznie do modułu antybiotykoterapii.
  if (fluBtn && fluCard) {
    fluBtn.addEventListener('click', (e) => {
      // Zatrzymaj propagację, aby inne handlery nie przechwytywały kliknięcia
      if (e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
      // Określ, czy karta jest obecnie ukryta. Pusty string oznacza
      // niezainicjowany styl, co traktujemy jak ukrytą kartę.
      const isHidden = fluCard.style.display === '' || fluCard.style.display === 'none';
      // Przełącz widoczność karty
      fluCard.style.display = isHidden ? 'block' : 'none';
      // Podświetl przycisk, gdy karta jest widoczna; usuń podświetlenie, gdy
      // karta jest schowana.  Używamy wartości isHidden sprzed przełączenia.
      if (isHidden) {
        fluBtn.classList.add('active-toggle');
      } else {
        fluBtn.classList.remove('active-toggle');
      }
    }, true);
  }

  /**
   * Tworzymy tooltip dla informacji zwrotnych (kopiowanie i aktualizacja).  Tooltip
   * wykorzystuje klasę .menu-tooltip z pliku style.css i jest wstawiany do
   * document.body.  Funkcja showFluTooltip(msg) ustawia jego treść, pozycję
   * nad przyciskiem kopiowania oraz wyświetla go na krótki czas.
   */
  let fluTooltip;
  // Timer służący do opóźnionego pokazywania informacji o aktualizacji.  Dzięki niemu
  // tooltip nie pojawia się podczas wpisywania, lecz dopiero po krótkiej przerwie.
  let fluUpdateTimer = null;
  function ensureFluTooltip() {
    if (!fluTooltip) {
      fluTooltip = document.createElement('div');
      fluTooltip.id = 'fluTooltip';
      // Nie nadajemy klasy menu-tooltip, aby nie dziedziczyć białego tła – styl nadamy ręcznie
      // Wyzeruj display i opacity, inne właściwości będą ustawione poniżej
      fluTooltip.style.display = 'none';
      fluTooltip.style.opacity = '0';
      // Ustal stałe pozycjonowanie: wyśrodkuj na górze ekranu
      fluTooltip.style.position = 'fixed';
      fluTooltip.style.top = '1rem';
      fluTooltip.style.left = '50%';
      fluTooltip.style.transform = 'translateX(-50%)';
      // Wygląd: turkusowe tło i biała czcionka, zaokrąglenia, cień
      fluTooltip.style.background = 'var(--primary)';
      fluTooltip.style.color = '#fff';
      fluTooltip.style.border = 'none';
      fluTooltip.style.borderRadius = 'var(--radius)';
      fluTooltip.style.padding = '0.5rem 1rem';
      fluTooltip.style.fontSize = '1rem';
      fluTooltip.style.fontWeight = '600';
      fluTooltip.style.textAlign = 'center';
      fluTooltip.style.zIndex = '10020';
      fluTooltip.style.boxShadow = 'var(--shadow)';
      fluTooltip.style.maxWidth = 'min(360px, calc(100vw - 24px))';
      fluTooltip.style.pointerEvents = 'none';
      document.body.appendChild(fluTooltip);
    }
  }
  function showFluTooltip(message) {
    // Tooltipy są wyświetlane tylko, gdy karta leczenia infekcji wirusowych jest otwarta.
    const fluCardEl = document.getElementById('fluCard');
    if (!fluCardEl) return;
    const cardStyle = window.getComputedStyle(fluCardEl);
    if (cardStyle.display === 'none') {
      return;
    }
    ensureFluTooltip();
    fluTooltip.textContent = message;
    fluTooltip.style.display = 'block';
    // Oblicz horyzontalne położenie w zależności od szerokości kontenera fluCard.
    requestAnimationFrame(() => {
      // Uzyskaj szerokość kontenera, aby wyśrodkować tooltip względem tej sekcji.
      const cardEl = document.getElementById('fluCard');
      let left;
      if (cardEl) {
        const cardRect = cardEl.getBoundingClientRect();
        left = cardRect.left + cardRect.width / 2;
      } else {
        left = window.innerWidth / 2;
      }
      fluTooltip.style.left = `${left}px`;
      fluTooltip.style.top = '1rem';
      // Ustaw pełną widoczność
      fluTooltip.style.opacity = '1';
      // Zresetuj transform Y, tylko X pozostaje do wyśrodkowania
      fluTooltip.style.transform = 'translateX(-50%)';
      // po 2 sekundach zniknij
      setTimeout(() => {
        fluTooltip.style.opacity = '0';
        setTimeout(() => {
          fluTooltip.style.display = 'none';
        }, 200);
      }, 2000);
    });
  }

  /**
   * Zaplanuj wyświetlenie informacji o uaktualnieniu zaleceń po upływie krótkiego
   * czasu (np. 800 ms) od ostatniego wywołania.  W przypadku kolejnych zmian
   * podczas edycji (wpisywanie wieku, wagi itp.) poprzedni timer jest anulowany.
   */
  function scheduleUpdateTooltip() {
    if (fluUpdateTimer) {
      clearTimeout(fluUpdateTimer);
    }
    fluUpdateTimer = setTimeout(() => {
      showFluTooltip('Zalecenia zostały uaktualnione');
      fluUpdateTimer = null;
    }, 800);
  }

  // Obsługa przycisku kopiowania zaleceń. Generuje tekst i kopiuje go do schowka.
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const rec = buildFluRecommendation();
      if (!rec) return;
      // Skopiuj do schowka, jeśli możliwe.
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(rec).catch(() => {});
      }
      // Wyświetl rezultat w przeznaczonym polu.  Używamy kontrolowanego HTML,
      // aby zachować łamanie linii w przypadku wypunktowanych zaleceń (\n → <br>).
      const resBox = document.getElementById('fluResult');
      if (resBox) {
        // Zamieniamy znak nowej linii na <br> dla poprawnego formatowania.
        fluSetEscapedHtml(resBox, rec);
      }
      // Pokaż tooltip informujący o skopiowaniu zaleceń
      showFluTooltip('Zalecenia zostały skopiowane do schowka');
    });
  }

  /**
   * Funkcja aktualizująca wynik leczenia grypy w czasie rzeczywistym.  Wywołuje
   * buildFluRecommendation() i wstawia wynik do pola fluResult wraz z
   * aktualizacją sekcji informacji dodatkowych.  Zalecenia wyświetlane są
   * tylko wtedy, gdy użytkownik wybrał substancję czynną i preparat.  W
   * przeciwnym razie pole wynikowe pozostaje puste.
   */
  function recalculateFlu() {
    const resBox = document.getElementById('fluResult');
    const drugSel = document.getElementById('fluDrug');
    const brandSel = document.getElementById('fluBrand');
    if (!resBox || !drugSel || !brandSel) return;
    const drugVal = drugSel.value;
    const brandVal = brandSel.value;
    // Wynik generujemy tylko, gdy wybrano substancję i preparat.
    if (drugVal && brandVal) {
      const rec = buildFluRecommendation();
      if (rec) {
        fluSetEscapedHtml(resBox, rec);
        // Po aktualizacji wyniku zaplanuj pokazanie informacji o uaktualnieniu
        scheduleUpdateTooltip();
      } else {
        fluClearHtml(resBox);
      }
    } else {
      fluClearHtml(resBox);
      // Ukryj sekcje informacji dodatkowych, jeśli nie ma wyniku.
      const infoSection = document.getElementById('fluInfoSection');
      if (infoSection) infoSection.style.display = 'none';
      const sourcesSection = document.getElementById('fluSourcesSection');
      if (sourcesSection) sourcesSection.style.display = 'none';
      // Ukryj sekcję informacji o dawkowaniu, gdy nie ma zaleceń
      const doseSection = document.getElementById('fluDoseSection');
      if (doseSection) doseSection.style.display = 'none';
    }
  }

  // Dodaj nasłuchy na pola wieku, wagi i miesięcy, aby automatycznie aktualizować zalecenia.
  const ageInput = document.getElementById('age');
  const ageMonthsInput = document.getElementById('ageMonths');
  const weightInput = document.getElementById('weight');
  const fluDrugInput = document.getElementById('fluDrug');
  const fluBrandInput = document.getElementById('fluBrand');
  const fluRiskInput = document.getElementById('fluRisk');
  const fluProphylaxisInput = document.getElementById('fluProphylaxis');
  const fluVaccinationInput = document.getElementById('fluVaccination');

  // Elementy interfejsu modułu leczenia ospy wietrznej
  const varControls = document.getElementById('varControls');
  const varPreparationInput = document.getElementById('varPreparation');
  // Jeśli użytkownik ręcznie zmieni preparat, oznacz to w atrybucie data-user-choice.
  // Dzięki temu recalculateVar() może rozróżnić, czy preparat został wybrany
  // automatycznie (na podstawie wieku/masy) czy ręcznie.  Gdy data-user-choice
  // jest ustawione na "true", funkcja recalculateVar() nie będzie nadpisywać
  // wyboru użytkownika przy kolejnych aktualizacjach wieku/wagi.
  if (varPreparationInput) {
    varPreparationInput.addEventListener('change', () => {
      // Jeżeli zmiana została spowodowana przez użytkownika, zaznacz to.
      // Nie ustawiamy atrybutu, gdy wartość jest pusta, aby zachować
      // możliwość zastosowania logiki domyślnej przy pierwszym wyborze.
      if (varPreparationInput.value) {
        varPreparationInput.dataset.userChoice = 'true';
      }
    });
  }
  // Pole "varRisk" zostało usunięte z interfejsu, dlatego nie pobieramy już
  // referencji do tego elementu.  Pozostawiamy komentarz, aby wskazać
  // świadome usunięcie opcji grupy ryzyka dla ospy wietrznej.
  // const varRiskInput = document.getElementById('varRisk');
  const varProphylaxisInput = document.getElementById('varProphylaxis');
  const varVaccinationInput = document.getElementById('varVaccination');
  const varExposureVaccinationInput = document.getElementById('varExposureVaccination');
  const varCopyBtn = document.getElementById('varCopyRec');
  const varDoseBtn = document.getElementById('varShowDosing');
  const varInfoShowBtn = document.getElementById('varShowSources');

  // Lista elementów, które będą wywoływać przeliczenie zaleceń dla ospy wietrznej
  // Lista elementów, które wywołują przeliczenie zaleceń dla ospy wietrznej.  Usunęliśmy
  // pole varRiskInput, gdyż opcja "Pacjent w grupie ryzyka" została wyłączona.
  const varInputs = [ageInput, ageMonthsInput, weightInput, varPreparationInput,
                    varProphylaxisInput, varVaccinationInput, varExposureVaccinationInput];
  varInputs.filter(Boolean).forEach((el) => {
    const eventType = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
    el.addEventListener(eventType, () => {
      recalculateVar();
    });
  });
  [ageInput, ageMonthsInput, weightInput, fluDrugInput, fluBrandInput,
   fluRiskInput, fluProphylaxisInput, fluVaccinationInput]
    .filter(Boolean)
    .forEach((el) => {
      const eventType = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
      el.addEventListener(eventType, () => {
        recalculateFlu();
      });
    });

  // Obsługa zmiany wskazania infekcji: pokaż lub ukryj sekcję z kontrolkami
  // w zależności od wybranej infekcji.  Obecnie dostępna jest tylko grypa.
  if (infectionSelect && virusControls) {
    infectionSelect.addEventListener('change', () => {
      const val = infectionSelect.value;
      // Pokaż kontener ogólny tylko, gdy wybrano jakąś infekcję
      virusControls.style.display = val ? 'block' : 'none';
      // W zależności od wyboru pokaż odpowiednie podsekcje (flu vs ospa wietrzna)
      const fluControlsEl = document.getElementById('fluControls');
      const varControlsEl = document.getElementById('varControls');
      if (val === 'grypa') {
        if (fluControlsEl) fluControlsEl.style.display = 'block';
        if (varControlsEl) varControlsEl.style.display = 'none';
        // Przy zmianie wskazania usuń wynik i sekcje ospy
        const varResult = document.getElementById('varResult');
        if (varResult) fluClearHtml(varResult);
        const varInfoSection = document.getElementById('varInfoSection');
        if (varInfoSection) varInfoSection.style.display = 'none';
        const varDoseSection = document.getElementById('varDoseSection');
        if (varDoseSection) varDoseSection.style.display = 'none';
      } else if (val === 'ospawietrzna') {
        if (fluControlsEl) fluControlsEl.style.display = 'none';
        if (varControlsEl) varControlsEl.style.display = 'block';
        // Zachowaj ewentualny ręczny wybór preparatu zapisany wcześniej w stanie strony.
        // Jeśli użytkownik nie wybierał preparatu samodzielnie, recalculateVar() i tak
        // ustali domyślną opcję na podstawie wieku i masy ciała.
        // Ustaw domyślny preparat w zależności od wieku i masy ciała (jeśli dostępne).
        // Wywołanie recalculateVar() spowoduje ustawienie odpowiedniego preparatu
        // zanim zostaną wygenerowane zalecenia.
        recalculateVar();
      } else {
        // Jeśli wybrano brak infekcji, ukryj obie sekcje
        if (fluControlsEl) fluControlsEl.style.display = 'none';
        if (varControlsEl) varControlsEl.style.display = 'none';
      }
    });

    // Przy odtwarzaniu stanu formularza wartości pól mogą zostać przywrócone
    // jeszcze przed inicjalizacją tego modułu. Wymuś jednorazową synchronizację UI
    // oraz przeliczenie zaleceń po podpięciu wszystkich listenerów.
    window.setTimeout(() => {
      try {
        infectionSelect.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('flu_therapy.js', _, { line: 356 });
    }
  }
      try {
        if (infectionSelect.value === 'grypa') {
          recalculateFlu();
        } else if (infectionSelect.value === 'ospawietrzna') {
          recalculateVar();
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('flu_therapy.js', _, { line: 363 });
    }
  }
    }, 0);
  }

  // Obsługa przycisku „Źródła” dla sekcji leczenia grypy.  Przycisk pokazuje lub
  // ukrywa listę źródeł w sekcji informacyjnej.  Słuchacz dodawany
  // podczas ładowania DOM.
  const srcBtn = document.getElementById('fluShowSources');
  if (srcBtn) {
    srcBtn.addEventListener('click', () => {
      const srcSection = document.getElementById('fluSourcesSection');
      if (!srcSection) return;
      const isHidden = srcSection.style.display === '' || srcSection.style.display === 'none';
      srcSection.style.display = isHidden ? 'block' : 'none';
    });
  }

  // Obsługa przycisku „Informacje o dawkowaniu” – pokazuje i ukrywa sekcję z tabelami
  const doseBtn = document.getElementById('fluShowDosing');
  if (doseBtn) {
    doseBtn.addEventListener('click', () => {
      const doseSection = document.getElementById('fluDoseSection');
      if (!doseSection) return;
      const isHidden = doseSection.style.display === '' || doseSection.style.display === 'none';
      doseSection.style.display = isHidden ? 'block' : 'none';
    });
  }

  // Obsługa przycisku kopiowania zaleceń dla ospy wietrznej
  if (varCopyBtn) {
    varCopyBtn.addEventListener('click', () => {
      const rec = buildVarRecommendation();
      if (!rec) return;
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(rec).catch(() => {});
      }
      const resBox = document.getElementById('varResult');
      if (resBox) {
        fluSetEscapedHtml(resBox, rec);
      }
      showFluTooltip('Zalecenia zostały skopiowane do schowka');
    });
  }

  // Obsługa przycisku „Informacje o dawkowaniu” dla ospy wietrznej
  if (varDoseBtn) {
    varDoseBtn.addEventListener('click', () => {
      const doseSection = document.getElementById('varDoseSection');
      if (!doseSection) return;
      const isHidden = doseSection.style.display === '' || doseSection.style.display === 'none';
      doseSection.style.display = isHidden ? 'block' : 'none';
    });
  }

  // Obsługa przycisku „Źródła” dla ospy wietrznej
  if (varInfoShowBtn) {
    varInfoShowBtn.addEventListener('click', () => {
      const srcSection = document.getElementById('varSourcesSection');
      if (!srcSection) return;
      const isHidden = srcSection.style.display === '' || srcSection.style.display === 'none';
      srcSection.style.display = isHidden ? 'block' : 'none';
    });
  }
}

if (typeof window !== 'undefined' && typeof window.vildaOnReady === 'function') {
  window.vildaOnReady('flu-therapy:init', initFluTherapyModule);
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFluTherapyModule, { once: true });
} else {
  initFluTherapyModule();
}

/**
 * Buduje tekst zaleceń leczenia infekcji wirusowych na podstawie formularza użytkownika.
 * Wykorzystuje dane o wieku i masie ciała pobrane z pól wejściowych
 * sekcji „Dane użytkownika”. Gdy informacje nie są dostępne, zwraca
 * komunikat proszący o uzupełnienie wymaganych danych.
 *
 * @returns {string} Tekst zaleceń do skopiowania
 */
function buildFluRecommendation() {
  // Pobierz dane wejściowe od użytkownika: wiek w latach, wiek w miesiącach i masa ciała.
  const ageYears = (typeof getAge === 'function') ? getAge() : null;
  const ageMonths = (typeof getChildAgeMonths === 'function') ? getChildAgeMonths() : null;
  const weight = (typeof getWeight === 'function') ? getWeight() : null;
  // Wybrana substancja czynna i preparat
  const drugSelect = document.getElementById('fluDrug');
  const brandSelect = document.getElementById('fluBrand');
  const drug = drugSelect ? drugSelect.value : '';
  const brand = brandSelect ? brandSelect.value : '';
  // Opcje dodatkowe
  const risk = document.getElementById('fluRisk')?.checked || false;
  const addProph = document.getElementById('fluProphylaxis')?.checked || false;
  const addVaccine = document.getElementById('fluVaccination')?.checked || false;

  // Jeśli nie wybrano substancji czynnej lub preparatu, nie generujemy zaleceń.
  if (!drug || !brand) {
    return '';
  }

  // W przypadku braku danych o wieku lub masie ciała zwróć prośbę o ich podanie.
  if (ageYears === null && ageMonths === null) {
    return 'Uzupełnij wiek w sekcji „Dane użytkownika”, aby obliczyć dawki oseltamiwiru.';
  }
  if (weight === null) {
    return 'Uzupełnij masę ciała w sekcji „Dane użytkownika”, aby obliczyć dawki oseltamiwiru.';
  }

  // Zaokrąglanie liczb zgodnie z funkcją fmt() z modułu antybiotykoterapii, jeśli dostępna.
  const format = (typeof fmt === 'function') ? fmt : (n) => {
    return Number.isFinite(n) ? n.toString() : '–';
  };

  // Określ, czy pacjent jest osobą dorosłą (≥18 lat).
  const isAdult = (ageYears !== null && ageYears >= 18);
  // Długość terapii w dniach
  let treatmentDays = 5;
  let prophylaxisDays = 10;
  // Dawka terapeutyczna i profilaktyczna (w mg na dawkę)
  let treatDoseMg = null;
  let prophylDoseMg = null;

  // Dla dorosłych dawka jest stała: 75 mg. Prophylaxis – 75 mg.
  if (isAdult) {
    treatDoseMg = 75;
    prophylDoseMg = 75;
  } else {
    // Dziecko: określ dawki w zależności od masy i wieku.
    // Jeżeli dziecko ma ≤ 12 miesięcy, ale waży ≥ 10 kg, stosujemy schemat jak dla starszych dzieci (30/45/60/75 mg),
    // czyli nie przygotowujemy roztworu 6 mg/ml.  W przeciwnym razie stosujemy dawkę 3 mg/kg.
    if (ageMonths !== null && ageMonths <= 12) {
      if (weight >= 10) {
        // Zastosuj przedziały wagowe jak u starszych dzieci
        if (weight <= 15) {
          treatDoseMg = 30;
        } else if (weight <= 23) {
          treatDoseMg = 45;
        } else if (weight <= 40) {
          treatDoseMg = 60;
        } else {
          treatDoseMg = 75;
        }
        prophylDoseMg = treatDoseMg;
      } else {
        // Dzieci <10 kg (≤12 miesięcy) – dawka 3 mg/kg
        treatDoseMg = Math.round(3 * weight);
        prophylDoseMg = treatDoseMg;
      }
    } else {
      // Starsze dzieci: dawki zależne od masy ciała (wg tab. 7)
      if (weight <= 15) {
        treatDoseMg = 30;
      } else if (weight <= 23) {
        treatDoseMg = 45;
      } else if (weight <= 40) {
        treatDoseMg = 60;
      } else {
        treatDoseMg = 75;
      }
      prophylDoseMg = treatDoseMg;
    }
  }

  // Częstotliwość podania
  const treatFreq = '2 × dziennie';
  const prophylFreq = '1 × dziennie';

  // ==== Nowe podejście: budujemy wypunktowane zalecenia skierowane do pacjenta lub opiekuna ====
  const lines = [];

  // Określ polskie nazwy substancji i preparatu. Jeśli użytkownik wybrał oseltamivir,
  // stosujemy nazwę ogólną „oseltamiwir” zamiast angielskiej.
  let baseName = '';
  if (drug) {
    if (drug.toLowerCase() === 'oseltamivir') {
      baseName = 'oseltamiwir';
    } else {
      baseName = drug;
    }
  }
  let prepLabel = '';
  if (brand) {
    prepLabel = `${brand}`;
  }

  /*
   * Funkcja pomocnicza zwraca informację, ile i jakiej wielkości kapsułek należy
   * podać, aby osiągnąć wymaganą dawkę. Zwraca obiekt { count, size } lub
   * null dla dawek mniejszych niż 30 mg (wtedy stosujemy roztwór 6 mg/ml).
   * Logika bazuje na dostępnych w Polsce kapsułkach 30 mg, 45 mg i 75 mg:
   *  – 75 mg → 1 kapsułka 75 mg
   *  – 60 mg → 2 kapsułki 30 mg
   *  – 45 mg → 1 kapsułka 45 mg
   *  – 30 mg → 1 kapsułka 30 mg
   */
  function getCapsuleInfo(dose) {
    if (dose >= 75) {
      return { count: 1, size: 75 };
    }
    if (dose === 60) {
      return { count: 2, size: 30 };
    }
    if (dose === 45) {
      return { count: 1, size: 45 };
    }
    if (dose === 30) {
      return { count: 1, size: 30 };
    }
    return null;
  }

  /**
   * Funkcja pomocnicza zwraca odpowiednią formę słowa „kapsułka” w zależności od liczby.
   * 1 → kapsułkę, 2–4 → kapsułki, ≥5 → kapsułek. W naszych zastosowaniach
   * występują jedynie 1 i 2 kapsułki, ale funkcja obsługuje pełny zakres.
   */
  function kapsWord(count) {
    // Używamy dopełniacza po przyimku "po":
    // 1 → kapsułce, 2–4 → kapsułki, ≥5 → kapsułek.
    if (count === 1) return 'kapsułce';
    if (count >= 2 && count <= 4) return 'kapsułki';
    return 'kapsułek';
  }

  /**
   * Funkcja pomocnicza buduje instrukcję dawkowania. Zwraca krótką frazę
   * z liczbą kapsułek lub objętością roztworu oraz częstotliwością podania.
   * Jeśli dawka jest <30 mg (u niemowląt), zaleca przygotowanie roztworu
   * 6 mg/ml poprzez rozpuszczenie kapsułki 30 mg w 5 ml wody i podanie
   * obliczonej objętości. Dla większych dawek używa dostępnych kapsułek
   * 30, 45 lub 75 mg. Tekst zawiera nazwę preparatu, liczbę kapsułek oraz
   * informację „po” (np. „2 × dziennie po 2 kapsułki”).
   */
  function buildDrugLine(doseMg, freq, days) {
    const isInfantDose = doseMg < 30;
    // freq będzie w formacie "2 × dziennie" lub "1 × dziennie"
    if (isInfantDose) {
      // Obliczenie objętości: 30 mg kapsułka rozpuszczona w 5 ml → 6 mg/ml
      const volMl = parseFloat((doseMg / 6).toFixed(1));
      const volStr = volMl.toString().replace('.', ',');
      return `${prepLabel ? prepLabel + ' – ' : ''}${freq} podawaj ${volStr} ml roztworu 6 mg/ml przez ${days} dni.`;
    }
    const info = getCapsuleInfo(doseMg);
    if (!info) {
      // Fallback: jeśli dawka nie pasuje do standardowych kombinacji,
      // wyświetl w mg (na wypadek nietypowych scenariuszy).
      return `${prepLabel ? prepLabel + ' – ' : ''}${freq} podawaj ${format(doseMg)} mg przez ${days} dni.`;
    }
    const count = info.count;
    // Wybierz właściwą formę słowa „kapsułka”
    const word = kapsWord(count);
    return `${prepLabel ? prepLabel + ' – ' : ''}${freq} po ${count} ${word} przez ${days} dni.`;
  }

  // Ustal tytuł sekcji w zależności od wskazanej choroby.
  let infectionName = '';
  const infSelectEl = document.getElementById('infectionSelect');
  const infVal = infSelectEl ? infSelectEl.value : '';
  if (infVal === 'grypa') {
    infectionName = 'Leczenie grypy';
  } else if (infVal) {
    infectionName = `Leczenie ${infVal}`;
  } else {
    infectionName = 'Leczenie infekcji wirusowej';
  }

  // ==== 1. Leki: zalecenia terapeutyczne ====
  let bulletIndex = 1;
  {
    // Ustal liczbę dawek na dobę na podstawie tekstu częstotliwości (1 × dziennie lub 2 × dziennie).
    const treatTimesPerDay = /2/.test(treatFreq) ? 2 : 1;
    const capsInfo = getCapsuleInfo(treatDoseMg);
    let treatText;
    if (capsInfo) {
      // Dawki korzystające z całych kapsułek 30 mg, 45 mg lub 75 mg.
      const mgPerCaps = capsInfo.size;
      const mgPerDose = treatDoseMg; // mg w jednej dawce
      const word = kapsWord(capsInfo.count);
      // Konstrukcja tekstu: „Ebilfumin 30 mg – 2 × dziennie po 2 kapsułki (2 × 60 mg) przez 5 dni.”
      treatText = `${prepLabel ? prepLabel + ' ' : ''}${mgPerCaps} mg – ${treatFreq} po ${capsInfo.count} ${word} (${treatTimesPerDay} × ${format(mgPerDose)} mg) przez ${treatmentDays} dni.`;
    } else {
      // Dawki <30 mg (niemowlęta lub małe dzieci) – używamy kapsułki 30 mg do przygotowania roztworu 6 mg/ml.
      // Oblicz objętość roztworu na jedną dawkę (kapsułka 30 mg + 5 ml wody daje roztwór 6 mg/ml).
      const volMl = parseFloat((treatDoseMg / 6).toFixed(1));
      const volStr = volMl.toString().replace('.', ',');
      // Przygotuj szczegółowy opis dla rodzica/opiekuna: jak uzyskać roztwór 6 mg/ml z kapsułki 30 mg.
      treatText =
        `${prepLabel ? prepLabel + ' 30 mg – ' : ''}` +
        `${treatFreq} podawaj dziecku po ${volStr} ml roztworu (6 mg/ml), ` +
        `który uzyskasz w następujący sposób: ` +
        `otwórz 1 kapsułkę 30 mg, wysyp zawartość do strzykawki doustnej o objętości 5 ml, ` +
        `dopełnij przegotowaną i ostudzoną wodą do 5 ml, dokładnie wymieszaj do uzyskania jednorodnego roztworu, ` +
        `następnie odmierz ${volStr} ml i podaj dziecku doustnie; pozostałość roztworu wyrzuć ` +
        `(przygotuj świeżą porcję przed każdym podaniem) - lek podawaj przez ${treatmentDays} dni.`;
    }
    lines.push(`${bulletIndex}. Leki: ${treatText}`);
    bulletIndex++;
  }

  // Jeśli pacjent jest dzieckiem (<18 lat) i dawka >=30 mg (czyli podajemy kapsułki),
  // dodaj informację o możliwości wysypania kapsułki i wymieszania z płynem.
  if (!isAdult && treatDoseMg >= 30) {
    lines.push(`${bulletIndex}. W razie trudności z połykaniem kapsułek można otworzyć kapsułkę i wymieszać jej zawartość z niewielką ilością wody lub soku. Podaj dziecku całą przygotowaną dawkę natychmiast po przyrządzeniu.`);
    bulletIndex++;
  }

  // ==== 2. Wskazówki dotyczące czasu rozpoczęcia i kontynuacji terapii ====
  {
    // Dostosuj komunikat do pacjenta dorosłego lub opiekuna dziecka oraz uwzględnij grupę ryzyka.
    let startLine;
    if (risk) {
      // W grupach ryzyka należy podkreślić konieczność szybkiego rozpoczęcia pełnej terapii
      if (isAdult) {
        startLine = `Pacjent należy do grupy ryzyka powikłań – leczenie należy rozpocząć jak najszybciej, najlepiej w ciągu 48 godzin od pojawienia się objawów, i kontynuować pełną ${treatmentDays}-dniową kurację, nawet jeśli objawy ustąpią.`;
      } else {
        startLine = `Pacjent (dziecko) należy do grupy ryzyka powikłań – leczenie należy rozpocząć jak najszybciej, najlepiej w ciągu 48 godzin od pojawienia się objawów, i kontynuować pełną ${treatmentDays}-dniową kurację, nawet jeśli objawy ustąpią.`;
      }
    } else {
      // Zarówno dla dorosłych, jak i dzieci stosujemy neutralną formę rozpoczęcia leczenia.
      startLine = 'Leczenie należy rozpocząć możliwie szybko, najlepiej w ciągu 48 godzin od pojawienia się objawów.';
    }
    lines.push(`${bulletIndex}. ${startLine}`);
    bulletIndex++;
  }

  // ==== 3. Wsparcie objawowe ====
  if (isAdult) {
    lines.push(`${bulletIndex}. Wsparcie objawowe: zadbaj o odpoczynek, nawodnienie, pozostanie w domu do ustąpienia gorączki i co najmniej 24 godziny bez gorączki. W razie bólu lub gorączki stosuj paracetamol lub ibuprofen w dawkach odpowiednich dla osoby dorosłej.`);
  } else {
    lines.push(`${bulletIndex}. Wsparcie objawowe: zadbaj, aby dziecko odpoczywało, było odpowiednio nawodnione i pozostawało w domu do ustąpienia gorączki oraz co najmniej 24 godziny bez gorączki. W razie bólu lub gorączki można podać paracetamol lub ibuprofen w dawce dostosowanej do masy ciała.`);
  }
  bulletIndex++;

  // ==== 4. Profilaktyka dla domowników (opcjonalnie) ====
  if (addProph) {
    // Zalecenia profilaktyczne dla domowników nie zależą od dawki pacjenta – dawkę należy dobrać indywidualnie
    // w zależności od masy ciała i wieku danej osoby, dlatego nie podajemy mg ani liczby kapsułek.
    const prophylText = `${prepLabel ? prepLabel + ' – ' : ''}${prophylFreq} przez ${prophylaxisDays} dni (dawkę należy dobrać indywidualnie dla każdej osoby).`;
    lines.push(
      `${bulletIndex}. Profilaktyka dla domowników: ${prophylText} Profilaktykę należy rozpocząć w ciągu 48 godzin od kontaktu z osobą chorą; zalecana jest szczególnie osobom niezaszczepionym z wysokim ryzykiem powikłań, osobom mieszkającym z pacjentem oraz opiekunom niemowląt poniżej 6 miesięcy.`
    );
    bulletIndex++;
  }

  // ==== 5. Zachęta do szczepień (opcjonalnie) ====
  if (addVaccine) {
    // Jedno ujednolicone zalecenie dotyczące szczepienia dla wszystkich grup wiekowych.
    lines.push(
      `${bulletIndex}. Szczepienie: coroczne szczepienie przeciw grypie jest najskuteczniejszą metodą zapobiegania chorobie. Szczepienie ochronne przeciw grypie jest szczególnie zalecane dzieciom powyżej 6 miesiąca życia, osobom dorosłym powyżej 65. roku życia, kobietom w ciąży oraz pacjentom z chorobami przewlekłymi.`
    );
    bulletIndex++;
  }

  // ==== 6. Informacje dodatkowe i źródła ====
  {
    // Sekcje „Informacje dodatkowe” i „Źródła” są prezentowane osobno w interfejsie.
    // Definiujemy listy faktów i listę źródeł (bez cytowań) oraz zapisujemy je
    // jako właściwości globalne. Funkcja updateFluInfoUI() (zdefiniowana niżej)
    // wykorzysta te tablice do aktualizacji widoku.
    window.fluModuleInfoFacts = [
      'Leczenie oseltamiwirem należy rozpocząć możliwie szybko – najlepiej w ciągu 48 godzin od wystąpienia objawów; wczesne podanie skraca chorobę i zmniejsza ryzyko powikłań.',
      'Oseltamiwir jest zatwierdzony do leczenia niepowikłanej grypy A i B u dorosłych i dzieci od 2 tygodni życia oraz do profilaktyki u pacjentów w wieku ≥ 1 roku.',
      'Do grupy podwyższonego ryzyka zaliczamy dzieci < 2 lat, osoby ≥ 65 lat, kobiety w ciąży, chorych przewlekle (np. POChP, cukrzyca, choroby serca, wątroby, nerek, neurologiczne, metaboliczne, otyłość, nowotwory) oraz osoby z obniżoną odpornością.',
      'Coroczne szczepienie przeciw grypie redukuje ryzyko powikłań, hospitalizacji i zgonów; u osób z cukrzycą zaobserwowano redukcję powikłań o 56%, hospitalizacji o 54% i zgonów o 58%.',
      'Najmniejsza kapsułka zawiera 30 mg oseltamiwiru; dawkę 75 mg można uzyskać z jednej kapsułki 75 mg lub z kombinacji 30 mg + 45 mg. U dzieci i pacjentów, którzy nie potrafią połykać, preferuje się zawiesinę 6 mg/ml przygotowaną z kapsułki 30 mg.',
      'U niemowląt w wieku 0–12 miesięcy dawka wynosi 3 mg/kg masy ciała dwa razy dziennie; na przykład dziecko o masie 6 kg powinno otrzymać 18 mg (3 ml roztworu 6 mg/ml).'
    ];
    window.fluModuleSources = [
      'Charakterystyka produktu leczniczego Segosana – informacje o postaciach, dawkach i wskazaniach',
      'FLU KOMPAS POZ – Adults: wytyczne dotyczące standardowej dawki 75 mg 2 × dziennie przez 5 dni i konieczności ukończenia kuracji',
      'KOMPAS Grypa 23/24 – dzieci: zalecane dawki 30/45/60/75 mg w zależności od masy ciała oraz stosowanie roztworu 6 mg/ml u niemowląt',
      '<a href="https://www.ncbi.nlm.nih.gov/books/NBK539909/" target="_blank" rel="noopener noreferrer">StatPearls (NCBI Bookshelf) – wskazania, wczesne leczenie oraz grupy wysokiego ryzyka</a>',
      '<a href="https://pubmed.ncbi.nlm.nih.gov/16873778/" target="_blank" rel="noopener noreferrer">PubMed: skuteczność szczepienia przeciw grypie u osób z cukrzycą</a>'
    ];
    if (typeof updateFluInfoUI === 'function') {
      updateFluInfoUI();
    }
  }

  // Zwracamy tekst z podziałem na wiersze.  Każda kropka/średnik powyżej jest częścią jednej linii; kolejne
  // elementy tablicy lines reprezentują osobne wypunktowane punkty.
  return lines.join('\n');
}

/**
 * Buduje tekst zaleceń leczenia ospy wietrznej (varicella) na podstawie formularza
 * użytkownika. Uwzględnia wiek, masę ciała oraz wybrany preparat (tabletki
 * różnej mocy lub zawiesiny o mocy 200 mg/5 ml i 400 mg/5 ml). U dorosłych
 * (≥12 lat) stosuje się 800 mg acyklowiru 5 ×/dobę przez 7 dni; u dzieci
 * dawkę oblicza się jako 20 mg/kg (maks. 800 mg) 4 ×/dobę przez 5 dni. Dawka
 * jest konwertowana na liczbę tabletek lub mililitrów w zależności od
 * wybranego preparatu; objętość zawiesiny zaokrąglana jest do 0,5 ml.
 * Do tekstu dodawane są informacje o grupach ryzyka, profilaktyce po
 * kontakcie, szczepieniach rutynowych oraz poekspozycyjnych, w zależności
 * od stanu zaznaczonych przełączników.
 *
 * @returns {string} Tekst zaleceń do skopiowania dla ospy wietrznej
 */
function buildVarRecommendation() {
  // Pobierz wiek i masę ciała z pól formularza. W projekcie brakuje funkcji getAge()/getWeight(),
  // dlatego korzystamy z getAgeDecimal() (jeśli dostępna) albo bezpośrednio z wartości
  // wprowadzonych przez użytkownika.  Funkcja getAgeDecimal() zwraca wiek z uwzględnieniem miesięcy
  // jako liczbę zmiennoprzecinkową.
  let ageYears = null;
  if (typeof getAgeDecimal === 'function') {
    ageYears = getAgeDecimal();
  } else {
    const yearsEl = document.getElementById('age');
    const monthsEl = document.getElementById('ageMonths');
    const yearsVal = yearsEl ? parseFloat(yearsEl.value) || 0 : 0;
    const monthsVal = monthsEl ? parseFloat(monthsEl.value) || 0 : 0;
    // miesiące przeliczone na ułamek roku
    ageYears = yearsVal + (Math.max(0, Math.min(11, monthsVal)) / 12);
  }
  // Pobierz masę ciała bezpośrednio z pola input#weight
  let weight = null;
  const weightEl = document.getElementById('weight');
  if (weightEl) {
    const w = parseFloat(weightEl.value);
    weight = isNaN(w) ? null : w;
  }
  // Jeśli brakuje podstawowych danych, informuj użytkownika
  if (ageYears == null || isNaN(ageYears) || weight == null || isNaN(weight)) {
    return 'Uzupełnij wiek i masę ciała w sekcji „Dane użytkownika”.';
  }
  // Pobierz wybrany preparat
  const prepSelect = document.getElementById('varPreparation');
  if (!prepSelect) return '';
  const prepVal = prepSelect.value;
  if (!prepVal) return '';
  // Definicje preparatów: marka, forma, typ (tab/susp), siła [mg/tabl] lub [mg/5 ml]
  const products = {
    hasc200tab: {brand: 'Hascovir', form: 'tabletki 200 mg', type: 'tab', strength: 200},
    hasc400tab: {brand: 'Hascovir', form: 'tabletki 400 mg', type: 'tab', strength: 400},
    hasc800tab: {brand: 'Hascovir', form: 'tabletki 800 mg', type: 'tab', strength: 800},
    hasc200sus: {brand: 'Hascovir', form: 'zawiesina 200 mg/5 ml', type: 'susp', strength: 200},
    hasc400sus: {brand: 'Hascovir', form: 'zawiesina 400 mg/5 ml', type: 'susp', strength: 400},
    heviran200tab: {brand: 'Heviran', form: 'tabletki 200 mg', type: 'tab', strength: 200},
    heviran400tab: {brand: 'Heviran', form: 'tabletki 400 mg', type: 'tab', strength: 400},
    heviran800tab: {brand: 'Heviran', form: 'tabletki 800 mg', type: 'tab', strength: 800},
  };
  const prod = products[prepVal];
  if (!prod) return '';
  // Obliczenie dawki mg/dawkę w zależności od wieku
  let mgDose;
  let frequency;
  let duration;
  const age = parseFloat(ageYears);
  if (age < 12) {
    mgDose = Math.min(weight * 20, 800); // 20 mg/kg (max 800 mg)
    frequency = '4 × dziennie';
    duration = 'przez 5 dni';
  } else {
    mgDose = 800;
    frequency = '5 razy na dobę';
    duration = 'przez 7 dni';
  }
  // Przelicz dawkę mg na liczbę tabletek lub mililitry
  let doseText = '';
  let doseValue = 0;
  if (prod.type === 'susp') {
    // mg per mL = strength/5 ml
    const mgPerMl = prod.strength / 5;
    let ml = mgDose / mgPerMl;
    // Zaokrąglij do najbliższych 0,5 ml
    ml = Math.round(ml * 2) / 2;
    doseValue = ml;
    // Format liczb z przecinkiem
    const mlStr = ml.toLocaleString('pl-PL');
    doseText = `${mlStr} ml`;
  } else {
    // liczenie tabletek: pozwalamy na 0,5 tabletki, zaokrąglając do 0,5 w górę
    let tabs = mgDose / prod.strength;
    // Zaokrąglij do pół tabletki
    tabs = Math.round(tabs * 2) / 2;
    doseValue = tabs;
    const tabStr = tabs.toLocaleString('pl-PL');
    // odmiana słowa tabletki: 1 – tabletka, 0,5–2 – tabletki, >4 – tabletek
    let tabletWord = 'tabletek';
    if (tabs === 1) tabletWord = 'tabletka';
    else if (tabs === 0.5 || (tabs > 1 && tabs < 5)) tabletWord = 'tabletki';
    doseText = `${tabStr} ${tabletWord}`;
  }
  // Budowanie zaleceń – listę punktów
  const lines = [];
  // Używaj numerowanych punktów zamiast wypunktowania za pomocą punktorów.
  let bullet = 1;
  // Podstawowa informacja o leku i dawkowaniu
  lines.push(`${bullet++}. Leki: ${prod.brand} – ${prod.form} – ${doseText} ${frequency} ${duration}.`);
  // Zalecenie dotyczące rozpoczęcia leczenia
  lines.push(`${bullet++}. Leczenie należy rozpocząć możliwie szybko, najlepiej w ciągu 24 h od pojawienia się wysypki.`);
  // Informacja o grupie ryzyka została usunięta z zalecenia, gdyż pole
  // wyboru "Pacjent w grupie ryzyka" nie jest już dostępne w interfejsie.

  // Wsparcie objawowe: zalecenia dotyczące postępowania symptomatycznego w ospie wietrznej.
  // Akcentujemy odpoczynek, nawodnienie i utrzymanie higieny skóry.  Dla kontroli bólu
  // i gorączki zalecamy paracetamol; unikamy kwasu acetylosalicylowego u dzieci ze
  // względu na ryzyko zespołu Reye’a.  Przy uciążliwym świądzie można podać leki
  // przeciwhistaminowe pierwszej generacji (np. dimetynden).  Dostępne dane
  // obserwacyjne wskazują, że stosowanie ibuprofenu podczas ospy może zwiększać
  // ryzyko ciężkich zakażeń skóry i tkanek miękkich u dzieci, dlatego nie zaleca
  // się jego stosowania; u dorosłych również należy zachować ostrożność i
  // skonsultować się z lekarzem przed użyciem.
  lines.push(`${bullet++}. Wsparcie objawowe: zapewnij odpoczynek, nawodnienie i utrzymanie higieny skóry. W razie bólu lub gorączki stosuj paracetamol; unikaj kwasu acetylosalicylowego u dzieci ze względu na ryzyko zespołu Reye’a. W przypadku uciążliwego świądu można zastosować leki przeciwhistaminowe I generacji (np. dimetynden). Nie zaleca się stosowania ibuprofenu w ospie, ponieważ badania obserwacyjne sugerują zwiększone ryzyko ciężkich zakażeń skóry i tkanek miękkich u dzieci; u dorosłych również zachowaj ostrożność i skonsultuj się z lekarzem.`);
  // Profilaktyka po kontakcie
  const varProphEl = document.getElementById('varProphylaxis');
  if (varProphEl && varProphEl.checked) {
    // Zalecenie dotyczące profilaktyki farmakologicznej po kontakcie – usunięto link do źródła.
    lines.push(`${bullet++}. Profilaktyka po kontakcie: przeznaczona dla osób z istotnym niedoborem odporności, wszystkich kobiet w ciąży oraz noworodków i niemowląt, które miały bliski kontakt z osobą chorą i nie posiadają odporności. Jeśli swoista immunoglobulina przeciw VZV (VZIG) jest niedostępna, w 7.–14. dniu po ekspozycji stosuje się doustny acyklowir przez 7 dni: osoby ≥12 lat (w tym kobiety w ciąży) – 800 mg co 6 godzin (4 ×/dobę); dzieci 2–17 lat – 10 mg/kg (maks. 800 mg) co 6 godzin; niemowlęta <2 lat – 10 mg/kg co 6 godzin.`);
  }
  // Rutynowe szczepienia przeciw ospie wietrznej
  const varVaccEl = document.getElementById('varVaccination');
  if (varVaccEl && varVaccEl.checked) {
    // Zalecenie dotyczące rutynowych szczepień – usunięto linki do źródeł.
    lines.push(`${bullet++}. Szczepienie rutynowe: osoby bez potwierdzonej odporności (≥12 miesięcy) powinny otrzymać dwie dawki szczepionki przeciw ospie wietrznej. Pierwszą dawkę podaje się między 12. a 15. miesiącem życia, drugą w wieku 4–6 lat; u osób ≥13 lat podaje się dwie dawki co najmniej 4–8 tygodni po sobie. Szczepionka jest przeciwwskazana u kobiet w ciąży i u osób z ciężkim niedoborem odporności.`);
  }
  // Szczepienie poekspozycyjne
  const varExpEl = document.getElementById('varExposureVaccination');
  if (varExpEl && varExpEl.checked) {
    // Zalecenie dotyczące szczepienia poekspozycyjnego – usunięto linki do źródeł.
    lines.push(`${bullet++}. Szczepienie poekspozycyjne: osoby bez udokumentowanej odporności (w wieku ≥12 miesięcy) powinny otrzymać szczepionkę jak najszybciej po kontakcie z chorym. Podanie w ciągu 3–5 dni od ekspozycji może zapobiec zachorowaniu lub złagodzić przebieg; jeśli upłynęło więcej niż 5 dni, szczepienie nadal warto podać, aby zapewnić ochronę przy kolejnych ekspozycjach i ograniczyć transmisję. Szczepionka jest przeciwwskazana u kobiet w ciąży i u osób z ciężkim niedoborem odporności.`);
  }
  return lines.join('\n');
}

/**
 * Uzupełnia sekcję informacji dodatkowych i źródeł dla leczenia ospy wietrznej.
 * Funkcja korzysta z globalnych tablic window.varModuleInfoFacts i
 * window.varModuleSources; jeśli te tablice nie istnieją, są inicjalizowane.
 * Wstawia odpowiednie elementy do list w HTML i kontroluje widoczność
 * sekcji w zależności od tego, czy są dostępne zalecenia.
 */
function updateVarInfoUI() {
  // Inicjalizuj tablice faktów i źródeł tylko raz
  if (!window.varModuleInfoFacts) {
    window.varModuleInfoFacts = [
      'Acyklowir jest pierwszą linią leczenia ospy wietrznej; leczenie należy rozpocząć w ciągu 24 h od pojawienia się wysypki. U dorosłych stosuje się 800 mg pięć razy na dobę przez 7 dni; u dzieci podaje się 20 mg/kg (maks. 800 mg) cztery razy na dobę przez 5 dni.',
      'Zawiesina Hascovir 200 mg/5 ml zawiera 40 mg acyklowiru w 1 ml, natomiast zawiesina 400 mg/5 ml zawiera 80 mg acyklowiru w 1 ml.',
      'U dzieci do 12 r.ż. preferowane są zawiesiny; dawkę oblicza się jako 20 mg/kg masy ciała (maks. 800 mg) na dawkę. U osób ≥12 lat stosuje się tabletki 800 mg pięć razy na dobę.',
      'Profilaktykę farmakologiczną po kontakcie stosuje się u osób z istotnym niedoborem odporności, wszystkich kobiet w ciąży oraz u noworodków i niemowląt, jeżeli były narażone na zakażenie i nie mają odporności. Jeśli swoista immunoglobulina przeciw VZV (VZIG) jest niedostępna, doustny acyklowir podaje się w 7.–14. dniu po ekspozycji przez 7 dni.',
      'Rutynowe szczepienie przeciw ospie wietrznej obejmuje dwie dawki; pierwszą podaje się w wieku 12–15 miesięcy, drugą w wieku 4–6 lat. U osób ≥13 lat podaje się dwie dawki w odstępie 4–8 tygodni.',
      'Szczepienie poekspozycyjne powinno być podane osobom bez odporności tak szybko, jak to możliwe. Zalecane jest podanie w ciągu 3–5 dni od ekspozycji, co może zapobiec zachorowaniu lub złagodzić przebieg; nawet jeśli minęło więcej niż 5 dni, warto zaszczepić, aby chronić przed przyszłymi zakażeniami oraz ograniczyć transmisję. Szczepionka jest przeciwwskazana w ciąży i u osób z ciężkim niedoborem odporności.'
    ];
  }
  // Nadpisz listę źródeł tak, aby zawierała zarówno artykuły omawiające bezpieczeństwo ibuprofenu,
  // jak i wytyczne oraz przeglądy z PubMed/PMC dotyczące leczenia, profilaktyki i szczepień przeciwko ospie wietrznej.
  window.varModuleSources = [
    // Charakterystyka produktu leczniczego zawierającego acyklowir (Hascovir, Heviran).
    { title: 'Hascovir, Heviran – charakterystyka produktu leczniczego', cite: 'file:///home/oai/share/Ulotka-37919-2024-07-26-18676_A-2024-07-30.pdf' },
    // Narracyjny przegląd 2021: analizuje ciężkie infekcje związane z ibuprofenem w pediatrii i zaleca unikanie ibuprofenu w ospie wietrznej.
    { title: 'Serious infectious events and ibuprofen administration in pediatrics: a narrative review (2021)', cite: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7844800/' },
    // Narracyjny przegląd 2025: podsumowuje działania niepożądane paracetamolu i ibuprofenu, podkreślając ostrożność w ospie wietrznej.
    { title: 'Adverse reactions to acetaminophen and ibuprofen in pediatric patients: a narrative review (2025)', cite: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12570521/' },
    // Retrospektywne wieloośrodkowe badanie polskie 2024: ocena wyników leczenia dzieci hospitalizowanych z powodu ospy z powikłaniami bakteryjnymi – wskazuje zwiększone ryzyko powikłań po ibuprofenie.
    { title: 'Treatment outcomes and their predictors in children hospitalized with varicella complicated by bacterial superinfections – multicenter study (2024)', cite: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11608362/' },
    // Artykuł przeglądowy dotyczący bezpieczeństwa ibuprofenu w praktyce pediatrycznej – wskazuje na przeciwwskazanie stosowania ibuprofenu w ospie.
    { title: 'Clinical safety of ibuprofen in pediatric practice (2021)', cite: 'https://childshealth-journal.com/index.php/journal/article/view/1462' },
    // Wytyczne terapii przeciwwirusowej zakażeń VZV: rozdział w podręczniku Human Herpesviruses zawiera informacje,
    // że doustny acyklowir jest pierwszą linią leczenia ospy wietrznej; dawka u dzieci to 200 mg/kg (maks. 800 mg)
    // podawana 4–5 razy dziennie przez 5 dni, a u dorosłych 800 mg pięć razy na dobęhttps://www.ncbi.nlm.nih.gov/books/NBK47401/#:~:text=interactions%20between%20acyclovir%20or%20valacyclovir,other%20drugs%20are%20extremely%20uncommon.
    { title: 'Antiviral therapy of varicella‑zoster virus infections – Human Herpesviruses (2007)', cite: 'https://www.ncbi.nlm.nih.gov/books/NBK47401/' },
    // Przegląd: post‑exposure management i profilaktyka VZV – opisuje, że szczepienie po kontakcie powinno być podane w ciągu 3–5 dni,
    // a szczepienie nawet po 5 dniach jest zalecane do ochrony przed przyszłymi zakażeniami; omawia też doustną profilaktykę acyklowirem
    // w dawce 20 mg/kg (maks. 3200 mg/dobę) rozpoczynaną 7.–10. dnia po ekspozycjihttps://pmc.ncbi.nlm.nih.gov/articles/PMC6931226/#:~:text=Academy%20of%20Pediatrics%2C%202018%20%29,American%20Academy%20of%20Pediatrics%2C%202018https://pmc.ncbi.nlm.nih.gov/articles/PMC6931226/#:~:text=Some%20experts%20recommend%207%20days,Preemptive.
    { title: 'Varicella‑zoster virus post‑exposure management and prophylaxis: a review (2019)', cite: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6931226/' },
    // Artykuł StatPearls opisuje szczepionkę przeciw ospie wietrznej oraz harmonogram szczepień: pierwsza dawka w wieku 12–15 miesięcy,
    // druga w wieku 4–6 lat; osoby ≥13 lat powinny otrzymać dwie dawki w odstępie 4–8 tygodni; zaleca podanie szczepionki poekspozycyjnej
    // w ciągu 3–5 dnihttps://www.ncbi.nlm.nih.gov/books/NBK441946/#:~:text=The%20first%20dose%20is%20given%C2%A0to,8.
    { title: 'Varicella (Chickenpox) Vaccine – StatPearls (2023)', cite: 'https://www.ncbi.nlm.nih.gov/books/NBK441946/' },
    // Raport MMWR zawiera zalecenia ACIP: rutynowy program dwudawkowy (12–15 mies. i 4–6 lat) oraz szczepienie osób ≥13 lat bez odpornościhttps://www.cdc.gov/mmwr/preview/mmwrhtml/rr5604a1.htm#:~:text=In%20June%202005%20and%20June,school%2C%20and%20college%20entry%20vaccination.
    { title: 'Prevention of Varicella: Recommendations of the ACIP (2007)', cite: 'https://www.cdc.gov/mmwr/preview/mmwrhtml/rr5604a1.htm' }
  ];
  const infoSection = document.getElementById('varInfoSection');
  const infoList = document.getElementById('varInfoList');
  const srcList = document.getElementById('varSourcesList');
  if (!infoSection || !infoList || !srcList) return;
  // Wyczyść listy i uzupełnij od nowa
  fluClearHtml(infoList);
  fluClearHtml(srcList);
  window.varModuleInfoFacts.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    infoList.appendChild(li);
  });
  window.varModuleSources.forEach((src) => {
    const li = document.createElement('li');
    // Tworzymy element <a> z klikalnym odnośnikiem, aby użytkownik mógł otworzyć źródło.
    const a = document.createElement('a');
    a.href = src.cite;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = src.title;
    li.appendChild(a);
    // Zachowaj również atrybut data-cite dla celów referencyjnych.
    li.setAttribute('data-cite', src.cite);
    srcList.appendChild(li);
  });
  // Pokaż sekcję informacji
  infoSection.style.display = 'block';
  // Ukryj listę źródeł na starcie; przycisk pokaże ją w razie potrzeby
  const srcSection = document.getElementById('varSourcesSection');
  if (srcSection) srcSection.style.display = 'none';
}

/**
 * Funkcja aktualizująca wynik leczenia ospy wietrznej w czasie rzeczywistym.
 * Wywołuje buildVarRecommendation() i wstawia wynik do pola varResult wraz z
 * aktualizacją sekcji informacji dodatkowych.  Zalecenia wyświetlane są
 * tylko wtedy, gdy użytkownik wybrał preparat (varPreparation).  Jeśli nie
 * wybrano lub brakuje danych wejściowych, sekcje wynikowe są ukrywane.
 */
function recalculateVar() {
  const resultBox = document.getElementById('varResult');
  const prepSelect = document.getElementById('varPreparation');
  if (!resultBox || !prepSelect) return;
  let prepVal = prepSelect.value;
  // Sprawdź, czy użytkownik samodzielnie wybrał preparat.  Jeżeli
  // atrybut data-user-choice = 'true', to recalculateVar() nie powinien
  // nadpisywać tego wyboru automatyczną logiką.  Użyjemy tego
  // znacznika później podczas ustalania domyślnego preparatu.
  const userChosen = prepSelect.dataset && prepSelect.dataset.userChoice === 'true';
  // Ustal domyślny preparat w zależności od wieku i masy ciała tylko wtedy,
  // gdy użytkownik jeszcze nie dokonał wyboru.  Nowe zasady (2026‑02‑01):
  //  – dzieci <12 lat i waga <20 kg → domyślnie Hascovir 200 mg/5 ml (hasc200sus)
  //  – dzieci <12 lat i waga 20–40 kg → Hascovir 400 mg/5 ml (hasc400sus)
  //  – dzieci <12 lat i waga >40 kg → Hascovir tabletki 800 mg (hasc800tab)
  //  – wiek ≥12 lat i waga <40 kg → Hascovir 400 mg/5 ml (hasc400sus)
  //  – wiek ≥12 lat i waga ≥40 kg → Hascovir tabletki 800 mg (hasc800tab)
  //  Jeżeli masa ciała nie jest podana, stosujemy dotychczasową logikę:
  //  wiek <12 lat → zawiesina 200 mg/5 ml; wiek ≥12 lat → tabletka 800 mg.
  let ageYears = null;
  if (typeof getAgeDecimal === 'function') {
    ageYears = getAgeDecimal();
  } else {
    const yearsEl = document.getElementById('age');
    const monthsEl = document.getElementById('ageMonths');
    const yVal = yearsEl ? parseFloat(yearsEl.value) || 0 : 0;
    const mVal = monthsEl ? parseFloat(monthsEl.value) || 0 : 0;
    ageYears = yVal + (Math.max(0, Math.min(11, mVal)) / 12);
  }
  // Pobierz masę ciała z formularza użytkownika
  let weightVal = NaN;
  const weightEl = document.getElementById('weight');
  if (weightEl) {
    const w = parseFloat(weightEl.value);
    weightVal = isNaN(w) ? NaN : w;
  }
  if (ageYears !== null && !isNaN(ageYears)) {
    const age = parseFloat(ageYears);
    // Ustal domyślny preparat tylko wtedy, gdy użytkownik nie wybrał go ręcznie.
    // Jeżeli prepVal jest pusty (np. przy pierwszym uruchomieniu) lub data-user-choice
    // nie jest ustawione na 'true', możemy nadpisać wartość zgodnie z logiką.
    if (!userChosen) {
      // Jeśli mamy podaną wagę, stosujemy nowe zasady; w przeciwnym razie
      // fallback do oryginalnej logiki.
      let recommended = '';
      if (!isNaN(weightVal)) {
        if (age < 12) {
          if (weightVal >= 20 && weightVal <= 40) {
            recommended = 'hasc400sus';
          } else if (weightVal < 20) {
            recommended = 'hasc200sus';
          } else {
            // waga > 40 kg u <12 lat – stosujemy tabletki 800 mg
            recommended = 'hasc800tab';
          }
        } else { // age ≥ 12
          if (weightVal < 40) {
            recommended = 'hasc400sus';
          } else {
            recommended = 'hasc800tab';
          }
        }
      } else {
        // Fallback, gdy masa ciała nie jest dostępna
        if (age < 12) {
          recommended = 'hasc200sus';
        } else {
          recommended = 'hasc800tab';
        }
      }
      // Nadpisujemy selektor tylko wtedy, gdy obecna wartość jest pusta lub różni się od rekomendacji.
      if (!prepVal || prepVal !== recommended) {
        prepVal = recommended;
        prepSelect.value = recommended;
      }
    }
  }
  // Po ewentualnym ustawieniu domyślnego preparatu, wygeneruj zalecenia
  if (prepVal) {
    const rec = buildVarRecommendation();
    if (rec) {
      fluSetEscapedHtml(resultBox, rec);
      // Uaktualnij sekcję informacji dodatkowych i źródeł
      updateVarInfoUI();
      // Pokaż informację o uaktualnieniu
      scheduleUpdateTooltip();
    } else {
      fluClearHtml(resultBox);
      // Ukryj sekcje informacji dodatkowych i źródeł
      const infoSection = document.getElementById('varInfoSection');
      if (infoSection) infoSection.style.display = 'none';
      const doseSection = document.getElementById('varDoseSection');
      if (doseSection) doseSection.style.display = 'none';
    }
  } else {
    fluClearHtml(resultBox);
    const infoSection = document.getElementById('varInfoSection');
    if (infoSection) infoSection.style.display = 'none';
    const doseSection = document.getElementById('varDoseSection');
    if (doseSection) doseSection.style.display = 'none';
  }
}

/**
 * Aktualizuje sekcję informacyjną i sekcję źródeł w karcie leczenia infekcji wirusowych.
 * Pobiera globalne tablice fluModuleInfoFacts i fluModuleSources i wstawia je
 * jako listy punktowane do odpowiednich elementów w HTML. Dodatkowo
 * ukrywa listę źródeł, aby była wyświetlana tylko po kliknięciu przycisku.
 */
function updateFluInfoUI() {
  const infoSection = document.getElementById('fluInfoSection');
  const infoList = document.getElementById('fluInfoList');
  const sourcesSection = document.getElementById('fluSourcesSection');
  const sourcesList = document.getElementById('fluSourcesList');
  if (!infoSection || !infoList || !sourcesSection || !sourcesList) {
    return;
  }
  // Pokaż sekcję informacyjną zawsze po aktualizacji zaleceń.
  infoSection.style.display = 'block';
  // Ukryj sekcję źródeł, aby wymagała kliknięcia przycisku.
  sourcesSection.style.display = 'none';
  // Wyczyść istniejące listy.
  fluClearHtml(infoList);
  fluClearHtml(sourcesList);
  // Wstaw fakty
  const facts = window.fluModuleInfoFacts || [];
  facts.forEach((fact) => {
    const li = document.createElement('li');
    li.textContent = fact;
    infoList.appendChild(li);
  });
  // Wstaw źródła
  const sources = window.fluModuleSources || [];
  sources.forEach((src) => {
    const li = document.createElement('li');
    // Jeśli źródło zawiera tagi HTML (np. link), używamy kontrolowanego HTML zamiast textContent.
    fluSetTrustedHtml(li, fluSourceToSafeHtml(src), 'flu-therapy:source-link');
    sourcesList.appendChild(li);
  });
}
