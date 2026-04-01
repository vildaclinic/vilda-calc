





/**
 * gh_igf_therapy.js
 * Karta „Leczenie hormonem wzrostu / IGF‑1”
 * Wymagania:
 *  - pojawia się poniżej przycisku „Leczenie hormonem wzrostu / IGF-1”
 *  - pojedynczy element, w osobnym pliku JS
 *  - waga brana z karty „Dane użytkownika” (id="weight")
 *  - użytkownik wybiera tylko program i preparat (listy rozwijalne)
 *  - pole na własną dawkę [mg/kg/d] – opcjonalne; jeśli puste, używamy domyślnej wg programu/preparatu
 *  - dynamiczne przeliczenia (po zmianie programu, preparatu, dawki, dni, wagi)
 *  - wyniki: dawka w mg/kg/d, mg/kg/tydz i (IU/kg/tydz), dawka dla pacjenta, zapotrzebowanie leku (ampułki) na 90 / 180 dni i dowolną liczbę dni
 *  - walidacja zakresów (dla GH: wg programu; dla IGF‑1: 0.08–0.24 mg/kg/d; Ngenla – pokazujemy zalecaną 0.66 mg/kg/tydz)
 *
 * Integracja bezinwazyjna: podpinamy się do #toggleIgfTests w fazie CAPTURE i zatrzymujemy propagację,
 * aby nie pokazywać starych podprzycisków (SNP/ZT/PWS/SGA/IGF‑1) z app.js.
 */

(function(){
  const GH_DRUGS = ['Omnitrope 5 mg','Omnitrope 10 mg','Genotropin 5,3 mg','Genotropin 12 mg','Ngenla 24 mg','Ngenla 60 mg'];
  const IGF_DRUGS = ['Increlex 40 mg']; // Mecaserminum

  // Map a therapeutic program to its default preparation. When the user switches
  // programs we will automatically select the appropriate preparation from this
  // mapping. These defaults reflect common clinical practice: SNP, SGA and PNN
  // use Omnitrope 10 mg, Turner syndrome (ZT) and PWS use Genotropin 12 mg and
  // IGF‑1 (mecasermin) uses Increlex 40 mg.
  const DEFAULT_DRUG_BY_PROGRAM = {
    'SNP':   'Omnitrope 10 mg',
    'PNN':   'Omnitrope 10 mg',
    'SGA':   'Omnitrope 10 mg',
    'ZT':    'Genotropin 12 mg',
    'PWS':   'Genotropin 12 mg',
    'IGF-1': 'Increlex 40 mg'
  };

  // mg na 1 ampułkę/wkład/wstrzykiwacz
  const DRUG_UNITS = {
    'Omnitrope 5 mg':   { mgPerUnit: 5,   type:'somatotropina' },
    'Omnitrope 10 mg':  { mgPerUnit:10,   type:'somatotropina' },
    'Genotropin 5,3 mg':{ mgPerUnit:5.3,  type:'somatotropina' },
    'Genotropin 12 mg': { mgPerUnit:12,   type:'somatotropina' },
    'Ngenla 24 mg':     { mgPerUnit:24,   type:'somatrogon', weekly:true }, // 1x/tydz
    'Ngenla 60 mg':     { mgPerUnit:60,   type:'somatrogon', weekly:true }, // 1x/tydz
    'Increlex 40 mg':   { mgPerUnit:40,   type:'mecasermin' }
  };

  /**
   * Sprawdź, czy dany preparat jest codzienną somatotropiną (GH), dla której
   * powinniśmy udostępnić możliwość wpisania dawki w mg/d i przeliczać
   * dwukierunkowo pomiędzy mg/kg/d a mg/d. Preparaty tygodniowe (np.
   * Ngenla) oraz IGF‑1 (mecasermin) są wyłączone.
   */
  function isDailySomatotropinDrug(drugName){
    const info = DRUG_UNITS[drugName];
    return !!(info && info.type === 'somatotropina' && !info.weekly);
  }

  // Flagi edycyjne – sygnalizują, które pole dawki jest aktualnie edytowane.
  // Pozwala to uniknąć nadpisywania wartości wpisywanych przez użytkownika
  // podczas synchronizacji i formatowania, zapewniając płynną edycję.
  let editingPerKg = false;  // true, gdy użytkownik edytuje pole mg/kg/d
  let editingPerDay = false; // true, gdy użytkownik edytuje pole mg/d

  /**
   * Zwraca liczbę miejsc po przecinku, które należy zastosować przy
   * prezentowaniu dawki w mg/dobę w polu "Dawka (mg/dobę)".
   * Dla Omnitrope 10 mg oraz Genotropin 12 mg wyniki prezentujemy z
   * dokładnością do 1 miejsca po przecinku; dla Omnitrope 5 mg i
   * Genotropin 5,3 mg – z dokładnością do 2 miejsc. Inne leki (np.
   * Ngenla, Increlex) domyślnie używają 3 miejsc.
   */
  function mgPerDayDecimals(drugName){
    switch (drugName) {
      case 'Genotropin 12 mg':
        // Genotropin 12 mg has a dosing increment of 0.15 mg.  To
        // display these increments correctly (e.g. 1.35 mg/d), we need
        // two decimal places. Without this, values like 1.35 mg would
        // be rounded to 1.4 mg when formatted with a single decimal.
        return 2;
      case 'Omnitrope 10 mg':
        // Omnitrope 10 mg has a 0.1 mg step, so one decimal is sufficient.
        return 1;
      case 'Omnitrope 5 mg':
      case 'Genotropin 5,3 mg':
        return 2;
      default:
        return 3;
    }
  }

  /**
   * Funkcje pluralizujące słowa po polsku. Używane do odmiany rzeczowników
   * w zależności od liczby (np. ampułka/ampułki/ampułek, miesiąc/miesiące/miesięcy).
   * Zwracają odpowiednią formę na podstawie reguł dla języka polskiego.
   */
  function pluralizePL(n, form1, form2, form5) {
    const intN = Math.abs(Math.round(n));
    const lastDigit = intN % 10;
    const lastTwo = intN % 100;
    if (intN === 1) return form1;
    if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return form2;
    return form5;
  }
  function formatAmpoulesPL(n) {
    return `${n} ${pluralizePL(n, 'ampułka', 'ampułki', 'ampułek')}`;
  }
  function formatMonthsPL(n) {
    return `${n} ${pluralizePL(n, 'miesiąc', 'miesiące', 'miesięcy')}`;
  }

  /**
   * Odmiana słowa „wstrzykiwacz” w zależności od liczby.  Preparat Ngenla
   * dostarczany jest w postaci wstrzykiwaczy (pre‑filled pen).  Funkcja
   * zwraca łańcuch w postaci „X wstrzykiwacz(e/y)” w poprawnej formie.
   *
   * @param {number} n Liczba wstrzykiwaczy
   * @returns {string}
   */
  function formatPensPL(n) {
    return `${n} ${pluralizePL(n, 'wstrzykiwacz', 'wstrzykiwacze', 'wstrzykiwaczy')}`;
  }

  /**
   * Odmiana słowa „iniekcja” dla liczby zabiegów. Używane w tabeli
   * zapotrzebowania dla tygodniowych preparatów (np. Ngenla), aby
   * poprawnie wyświetlić liczbę wykonanych zastrzyków.
   *
   * @param {number} n Liczba iniekcji
   * @returns {string}
   */
  function formatInjectionsPL(n) {
    return `${n} ${pluralizePL(n, 'iniekcja', 'iniekcje', 'iniekcji')}`;
  }

  /**
   * Zwraca datę Wielkanocy dla danego roku (algorytm Meeusa/Jonesa).  Potrzebne
   * do wyliczenia świąt ruchomych w Polsce (Poniedziałek Wielkanocny i
   * Boże Ciało).
   *
   * @param {number} Y Rok
   * @returns {Date} Data Niedzieli Wielkanocnej
   */
  function easterDate(Y){
    const a = Y % 19;
    const b = Math.floor(Y / 100);
    const c = Y % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Marzec, 4=Kwiecień
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Y, month - 1, day);
  }

  /**
   * Zwraca tablicę dat ustawowo wolnych od pracy w Polsce dla danego roku.
   * Obejmuje święta stałe (Nowy Rok, Trzech Króli, Święto Pracy,
   * Święto Konstytucji 3 maja, Wniebowzięcie NMP, Wszystkich Świętych,
   * Święto Niepodległości, Boże Narodzenie – 25 i 26 grudnia) oraz
   * święta ruchome (Poniedziałek Wielkanocny i Boże Ciało).  Lista może
   * być rozszerzona w razie potrzeby.
   *
   * @param {number} year Rok
   * @returns {Date[]} Lista dat
   */
  function getPolishHolidays(year){
    const holidays = [];
    // Święta stałe
    holidays.push(new Date(year,0,1));  // 1 stycznia – Nowy Rok
    holidays.push(new Date(year,0,6));  // 6 stycznia – Święto Trzech Króli
    holidays.push(new Date(year,4,1));  // 1 maja – Święto Pracy
    holidays.push(new Date(year,4,3));  // 3 maja – Święto Konstytucji 3 Maja
    holidays.push(new Date(year,7,15)); // 15 sierpnia – Wniebowzięcie NMP
    holidays.push(new Date(year,10,1)); // 1 listopada – Wszystkich Świętych
    holidays.push(new Date(year,10,11));// 11 listopada – Święto Niepodległości
    holidays.push(new Date(year,11,25));// 25 grudnia – Boże Narodzenie (I dzień)
    holidays.push(new Date(year,11,26));// 26 grudnia – Drugi dzień Świąt Bożego Narodzenia

    /*
     * Od 2025 r. Wigilia (24 grudnia) jest w Polsce ustawowo wolna od pracy.
     * Nowe przepisy weszły w życie 1 lutego 2025 r., dlatego dodajemy
     * 24 grudnia do listy stałych dni wolnych począwszy od roku 2025.
     * Jeśli w przyszłości przepisy ulegną zmianie, warunek roku można
     * odpowiednio dostosować.  Dla uproszczenia przyjmujemy, że od 2025
     * włącznie Wigilia zawsze jest świętem państwowym.
     */
    if (year >= 2025) {
      holidays.push(new Date(year,11,24)); // 24 grudnia – Wigilia Bożego Narodzenia
    }
    // Święta ruchome
    const easter = easterDate(year);
    const easterMonday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 1);
    const corpusChristi = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 60);
    holidays.push(easterMonday);
    holidays.push(corpusChristi);
    return holidays;
  }

  /**
   * Sprawdza, czy podana data wypada w weekend.
   * Niedziela → 0, Poniedziałek → 1, …, Sobota → 6.
   *
   * @param {Date} d Data
   * @returns {boolean} True jeśli sobota lub niedziela
   */
  function isWeekend(d){
    const day = d.getDay();
    return day === 0 || day === 6;
  }

  /**
   * Sprawdza, czy podana data jest świętem państwowym w Polsce.
   *
   * @param {Date} d Data
   * @returns {boolean} True jeśli święto
   */
  function isHoliday(d){
    const year = d.getFullYear();
    const holidays = getPolishHolidays(year);
    return holidays.some(h => h.getDate() === d.getDate() && h.getMonth() === d.getMonth());
  }

  /**
   * Sprawdza, czy podana data jest dniem roboczym (nie weekend i nie święto).
   *
   * @param {Date} d Data
   * @returns {boolean}
   */
  function isWorkingDay(d){
    return !isWeekend(d) && !isHoliday(d);
  }

  /**
   * Zwraca nową datę przesuniętą o określoną liczbę dni względem podanej daty.
   * Nie modyfikuje oryginalnego obiektu.
   *
   * @param {Date} date Data odniesienia
   * @param {number} offset Liczba dni do dodania (może być ujemna)
   * @returns {Date}
   */
  function addDays(date, offset){
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + offset);
    return d;
  }

  /**
   * Zwraca kopię podanej daty obciętą do początku dnia (godzina 00:00:00).
   * Używamy tej funkcji w obliczeniach liczby dni zamiast bezpośredniego
   * porównywania z obiektem Date() reprezentującym bieżący moment.  Dzięki
   * temu różnica w milisekundach jest całkowitą liczbą dni niezależnie od
   * godziny wykonania obliczeń, co eliminuje błędy zaokrągleń prowadzące
   * do przesunięcia o jeden dzień (np. podczas liczenia liczby tygodni
   * przy Ngenla).  Funkcja nie modyfikuje oryginalnego obiektu.
   *
   * @param {Date} date Data wejściowa
   * @returns {Date} Data o godzinie 00:00:00
   */
  function startOfDay(date){
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }


  /**
   * Parsuje wartość pola daty w formacie YYYY-MM-DD do lokalnego obiektu Date
   * ustawionego na początek dnia.  Nie polegamy wyłącznie na konstruktorze
   * Date(string), ponieważ w różnych przeglądarkach potrafi on zwracać datę
   * w UTC albo lokalnie, co może dawać niespójne obliczenia liczby dni dla
   * funkcji "Ustalona data kontroli".
   *
   * @param {string} value Wartość pola daty
   * @returns {Date|null}
   */
  function parseLocalDateInput(value){
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return null;
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const parsed = new Date(year, month - 1, day);
      if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
        return null;
      }
      return startOfDay(parsed);
    }
    const fallback = new Date(raw);
    if (isNaN(fallback)) return null;
    return startOfDay(fallback);
  }

  /**
   * Zwraca polską nazwę dnia tygodnia w mianowniku (niedziela, poniedziałek…).
   *
   * @param {Date} d Data
   * @returns {string}
   */
  function dayNamePl(d){
    const names = ['niedziela','poniedziałek','wtorek','środa','czwartek','piątek','sobota'];
    return names[d.getDay()];
  }

  /**
   * Formatuje datę do zapisu „dd.mm.rrrrr.” stosowanego w zaleceniach.
   *
   * @param {Date} d Data
   * @returns {string}
   */
  function formatDatePl(d){
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}r.`;
  }

  /**
   * Formatuje datę w krótkiej postaci „dd/mm/rrrr”.  Używane w etykietach
   * przycisków kopiujących zalecenia, zgodnie z wytycznymi użytkownika.
   *
   * @param {Date} d Data
   * @returns {string} Łańcuch w formacie dd/mm/rrrr
   */
  function formatDateShort(d){
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  /**
   * Oblicza datę kontroli dla codziennie podawanych somatotropin na podstawie
   * liczby dni leczenia.  Używa bieżącej daty, dodaje podaną liczbę dni,
   * następnie cofa lub przesuwa datę, jeżeli wypada ona w weekend lub
   * święto, aby wskazać najbliższy dzień roboczy w promieniu 7 dni.
   *
   * @param {number} days Liczba dni terapii (np. 90 lub 180)
   * @returns {Date} Data kontroli
   */
  function findGhControlDate(days) {
    const today = new Date();
    let ctrlDate = addDays(today, days);
    if (!isWorkingDay(ctrlDate)) {
      for (let i = 1; i <= 7; i++) {
        const earlier = addDays(ctrlDate, -i);
        if (isWorkingDay(earlier)) { ctrlDate = earlier; break; }
        const later = addDays(ctrlDate, i);
        if (isWorkingDay(later)) { ctrlDate = later; break; }
      }
    }
    return ctrlDate;
  }

  /**
   * Wybiera datę rozpoczęcia terapii i odpowiadającą jej datę kontroli dla
   * somatrogonu (Ngenla).  Funkcja próbuje rozpocząć podawanie leku w dniu
   * dzisiejszym; jeżeli po dodaniu <days> i czterech dni dzień kontroli
   * wypada w weekend lub święto, przesuwa dzień rozpoczęcia o maks. 6 dni
   * w przód, aby znaleźć kombinację zapewniającą dzień roboczy na kontrolę.
   * W przypadku braku takiej kombinacji w ciągu tygodnia, zwraca oryginalną
   * datę rozpoczęcia oraz przesuwa datę kontroli na najbliższy dzień
   * roboczy w promieniu 7 dni.
   *
   * @param {number} days Liczba dni terapii (np. 90 lub 180)
   * @returns {{startDate:Date, controlDate:Date}}
   */
  /**
   * Znajduje datę rozpoczęcia terapii i datę kontroli dla somatrogonu
   * (preparaty Ngenla 24 mg i 60 mg) na podstawie liczby dni leczenia.
   * Algorytm uwzględnia cotygodniowe podawanie leku oraz wymóg,
   * aby kontrola laboratoryjna odbyła się 4 dni po ostatniej dawce.
   * Bazowa data kontroli jest obliczana jako (dzisiejsza data + liczba
   * dni terapii + 4), a następnie dostosowywana do najbliższego dnia
   * roboczego (jeśli przypada w weekend lub święto). Następnie liczba
   * tygodni terapii (zaokrąglona w górę) determinuje liczbę iniekcji
   * i pierwszy zastrzyk jest planowany tak, aby ostatni wypadł 4 dni
   * przed datą kontroli. Jeżeli tak wyliczony początek jest poza
   * zakresem 0–6 dni od dzisiaj, data kontroli jest przesuwana
   * o całe tygodnie (±7 dni), aż uzyskamy początek wewnątrz
   * najbliższego tygodnia. W sytuacji wyjątkowej, gdy mimo przesunięć
   * początek nadal znajduje się poza zakresem, stosowany jest
   * rezerwowy mechanizm przeszukujący kolejne dni tygodnia jak dotąd.
   *
   * @param {number} days Liczba dni leczenia (np. 90 lub 180)
   * @returns {{startDate: Date, controlDate: Date}} Start terapii i data kontroli
   */
  function findSomatrogonDates(days){
    // Użyj początku dnia dla „dziś”, aby uniknąć błędów zaokrągleń przy obliczaniu
    // różnicy w dniach.  Użycie pełnego obiektu Date() (z godziną) powoduje, że
    // różnica w milisekundach pomiędzy datami może nie być wielokrotnością
    // 24 godzin, co przy zaokrągleniu prowadzi do obliczenia diffDays o jeden
    // mniejszego lub większego niż oczekiwano.  Korzystamy z startOfDay(),
    // definiowanej powyżej.
    const todayReal = new Date();
    const today = startOfDay(todayReal);
    // Liczba iniekcji = liczba pełnych tygodni (zaokrąglenie w górę)
    const injections = Math.ceil(days / 7);
    const msPerDay = 24 * 60 * 60 * 1000;
    // Funkcja pomocnicza: zwraca najbliższy dzień roboczy (preferując wcześniejszy)
    function adjustToWorking(d){
      if (isWorkingDay(d)) return d;
      for (let i = 1; i <= 7; i++) {
        const earlier = addDays(d, -i);
        if (isWorkingDay(earlier)) return earlier;
        const later = addDays(d, i);
        if (isWorkingDay(later)) return later;
      }
      return d;
    }
    // Funkcja pomocnicza: oblicza datę rozpoczęcia z zadanej kontroli
    function computeStart(ctrl){
      const lastInjection = addDays(ctrl, -4);
      return addDays(lastInjection, -(injections - 1) * 7);
    }
    // Bazowa data kontroli = dziś + days + 4
    let control = addDays(today, days + 4);
    control = adjustToWorking(control);
    let start = computeStart(control);
    // Przesuwaj kontrolę o całe tygodnie, aż początek znajdzie się w odległości 0–6 dni od dziś
    let attempts = 0;
    while (attempts < 14) {
      // Oblicz różnicę dni względem początku bieżącego dnia, aby uzyskać
      // dokładną liczbę pełnych dni.  Nie korzystaj z bieżącego czasu,
      // ponieważ godzina w „today” mogłaby przesunąć wynik o 1 dzień.
      const diffDays = Math.round((start - today) / msPerDay);
      if (diffDays >= 0 && diffDays <= 6) {
        return { startDate: start, controlDate: control };
      }
      // Jeżeli początek jest w przeszłości, przesuwamy datę kontroli o +7 dni
      if (diffDays < 0) {
        control = addDays(control, 7);
        control = adjustToWorking(control);
        start = computeStart(control);
      } else {
        // Jeżeli początek jest zbyt odległy w przyszłości (>6 dni), cofamy kontrolę o 7 dni
        control = addDays(control, -7);
        control = adjustToWorking(control);
        start = computeStart(control);
      }
      attempts++;
    }
    // Rezerwowy mechanizm: przeszukaj start w zakresie 0–6 dni, jak poprzednio
    for (let off = 0; off <= 6; off++) {
      const tentativeStart = addDays(today, off);
      const lastInjection = addDays(tentativeStart, (injections - 1) * 7);
      const candidateCtrl = addDays(lastInjection, 4);
      if (isWorkingDay(candidateCtrl)) {
        return { startDate: tentativeStart, controlDate: candidateCtrl };
      }
    }
    // Ostatecznie zwróć datę kontroli i start z bazowego wyliczenia
    return { startDate: start, controlDate: control };
  }

  /**
   * Dla dowolnie wybranej daty kontroli (stosowanej w somatrogonie) wyznacza
   * sugerowany dzień rozpoczęcia podawania leku, tak aby iniekcja odbyła
   * się co najmniej 4 dni przed planowaną kontrolą.  Jeżeli wyliczony
   * dzień rozpoczęcia przypada w weekend lub święto, funkcja przesuwa go
   * o maks. 7 dni do najbliższego dnia roboczego.  Nie modyfikuje daty
   * kontroli – użytkownik wybiera ją samodzielnie.
   *
   * @param {Date} ctrlDate Data kontroli
   * @returns {Date} Sugerowana data rozpoczęcia podawania
   */
  function findStartForManual(ctrlDate){
    // dzień startowy = 4 dni przed kontrolą
    let start = addDays(ctrlDate, -4);
    if (!isWorkingDay(start)) {
      for (let i = 1; i <= 7; i++) {
        const earlier = addDays(start, -i);
        if (isWorkingDay(earlier)) { start = earlier; break; }
        const later = addDays(start, i);
        if (isWorkingDay(later)) { start = later; break; }
      }
    }
    return start;
  }

  /**
   * Zwraca sugerowaną datę rozpoczęcia podawania leku (pierwszą iniekcję)
   * dla dowolnie wybranej daty kontroli w somatrogonie (Ngenla). Funkcja
   * zakłada tygodniowe podawanie leku i wyznacza taki dzień w ciągu
   * najbliższych 7 dni od dziś, aby różnica między datą ostatniej
   * iniekcji (4 dni przed kontrolą) a początkiem terapii była wielokrotnością
   * 7 dni. W ten sposób cykl tygodniowy kończy się 4 dni przed kontrolą.
   *
   * @param {Date} ctrlDate Data kontroli
   * @returns {Date} Data pierwszej iniekcji
   */
  function findFirstInjectionStartForManual(ctrlDate){
    // Przy wyliczaniu pierwszej iniekcji korzystamy z daty początku dzisiejszego dnia.
    // Dzięki temu różnica z ctrlMinus4 zawsze będzie liczbą całkowitą (w dniach)
    // i unikniemy przesunięcia o jeden dzień, które może wystąpić, gdy
    // wykorzystamy aktualny czas (z godziną).  Obcinamy również datę
    // startu do początku dnia.
    const todayReal = new Date();
    const today = startOfDay(todayReal);
    const ctrlMinus4 = addDays(ctrlDate, -4);
    const msPerDay = 24*60*60*1000;
    const diffDays = Math.round((ctrlMinus4 - today) / msPerDay);
    // redukuj modulo 7, biorąc pod uwagę ujemne wartości
    let offset = ((diffDays % 7) + 7) % 7;
    // Data startu to początek dzisiejszego dnia + offset dni
    return addDays(today, offset);
  }

  /**
   * Zwraca łańcuch zaleceń dla podanej liczby dni (90 lub 180).  Funkcja
   * korzysta z aktualnych obliczeń przechowywanych w obiekcie
   * window.ghTherapyCalc, który jest aktualizowany w recalc().  Jeżeli
   * przepis nie dotyczy codziennych somatotropin (np. Ngenla, Increlex),
   * funkcja zwraca pusty ciąg znaków.
   *
   * @param {number} days Liczba dni terapii (np. 90 lub 180)
   * @returns {string} Zalecenia w formie wielowierszowego tekstu
   */
  function buildGhRecommendation(days){
    try {
      // Uaktualnij obliczenia na wszelki wypadek
      recalc();
    } catch(e){ /* ignore */ }
    const calc = (typeof window !== 'undefined') ? window.ghTherapyCalc : null;
    if (!calc) return '';
    // Jeśli wybrano Ngenla (somatrogon) – generuj dedykowane zalecenia tygodniowe
    if (/^Ngenla/.test(calc.drug)) {
      return buildSomatrogonRecommendation(days);
    }
    // Jeżeli preparat nie jest codziennie podawanym GH (np. Increlex), nie generujemy zaleceń
    if (!isDailySomatotropinDrug(calc.drug)) return '';
    const drugTokens = calc.drug.split(' ');
    const brand = drugTokens[0];
    // Kawałek opisujący dawkę preparatu (np. "5,3 mg") – używamy dwóch ostatnich elementów
    const mgNumber = drugTokens[1] || '';
    const mgUnit   = drugTokens[2] || '';
    const mgPart   = mgNumber + (mgUnit ? ' ' + mgUnit : '');
    // Liczba ampułek dla wybranej liczby dni
    const units = (days === 90 ? calc.units90 : (days === 180 ? calc.units180 : 0));
    // Formatuj liczby zgodnie z już zdefiniowanymi funkcjami (fmt(), mgPerDayDecimals)
    // Dawka mg/dobę z właściwą liczbą miejsc po przecinku
    const perDayStr    = fmt(calc.perDayMg, mgPerDayDecimals(calc.drug));
    // Dawka mg/kg/d i mg/kg/tydz z dokładnością do 3 miejsc po przecinku
    const mgKgDayStr   = fmt(calc.mgKgDay, 3);
    const mgKgWeekStr  = fmt(calc.mgKgWeek, 3);
    // Liczba miesięcy = dni / 30, zaokrąglona do najbliższej liczby całkowitej
    const months = Math.round(days / 30);
    const monthsStr = formatMonthsPL(months);
    // Data kontroli = bieżąca data + days; używamy lokalnej strefy czasu i unikamy dni wolnych
    const today = new Date();
    let ctrlDate = addDays(today, days);
    // jeżeli data kontroli wypada w weekend lub święto, cofnij ją o maks. 7 dni, aż trafimy na dzień roboczy
    if (!isWorkingDay(ctrlDate)) {
      for (let i = 1; i <= 7; i++) {
        const earlier = addDays(ctrlDate, -i);
        if (isWorkingDay(earlier)) { ctrlDate = earlier; break; }
        const later = addDays(ctrlDate, i);
        if (isWorkingDay(later)) { ctrlDate = later; break; }
      }
    }
    const dateStr = formatDatePl(ctrlDate);
    // Zbuduj poszczególne linie zaleceń
    // Zbuduj cztery linie zaleceń dla codziennie podawanych hormonów wzrostu.
    // Każda linia opisuje odpowiednio sposób podania, aktualną dawkę, liczbę wydanych ampułek
    // oraz termin kontroli.  Na końcu dodajemy numerację, aby spełnić wymaganie
    // enumeracji punktów (1., 2., 3., …) dla każdego preparatu.
    const lines = [];
    lines.push(`${brand} - ${perDayStr} mg na dobę w codziennych wstrzyknięciach podskórnych.`);
    lines.push(`Aktualna dawka hormonu wzrostu to ${mgKgDayStr} mg/kg/d (${mgKgWeekStr} mg/kg/tydz)`);
    lines.push(`Wydano lek na ${days} dni (${formatAmpoulesPL(units)} preparatu ${brand} a ${mgPart})`);
    lines.push(`Kontrola za ${monthsStr} w dniu ${dateStr}`);
    // Dodaj numerację punktów 1., 2., 3., 4.
    const numberedLines = lines.map((l, idx) => `${idx+1}. ${l}`);
    return numberedLines.join('\n');
  }

  /**
   * Buduje zalecenia dla preparatów somatrogonu (Ngenla).  Zalecenia
   * mają formę sześcio‑punktowego planu leczenia, obejmującego dawkę
   * tygodniową, bieżącą dawkę mg/kg/tydzień (jeśli różna od 0,66), liczbę
   * wstrzykiwaczy, termin kontroli oraz zasady postępowania w przypadku
   * pominięcia dawki i zmiany dnia podawania.  Wykorzystuje aktualne
   * wyliczenia z obiektu window.ghTherapyCalc i funkcje obliczające
   * odpowiedni dzień rozpoczęcia terapii i kontrolę.
   *
   * @param {number} days Liczba dni terapii (np. 90 lub 180)
   * @returns {string} Tekst zaleceń z numeracją
   */
  function buildSomatrogonRecommendation(days){
    try { recalc(); } catch(_){}
    const calc = (typeof window !== 'undefined') ? window.ghTherapyCalc : null;
    if (!calc || !/^Ngenla/.test(calc.drug)) return '';
    // Nazwa preparatu i jego moc (np. „Ngenla 24 mg” → brand="Ngenla", mgPart="24 mg")
    const tokens = calc.drug.split(' ');
    const brand = tokens[0];
    const mgNumber = tokens[1] || '';
    const mgUnit = tokens[2] || '';
    const mgPart = mgNumber + (mgUnit ? ' ' + mgUnit : '');
    // Wylicz mg na tydzień (zaokrąglone) oraz dawkę mg/kg/tydzień
    const perWeekStr = fmt(calc.perWeekMg, 1);
    const mgKgWeekStr = fmt(calc.mgKgWeek, 2);
    // Czy użytkownik zmienił dawkę w polu? Jeżeli nie, nie pokazujemy drugiego punktu
    const defaultWeekly = 0.66;
    const userChanged = (Math.abs(calc.mgKgWeek - defaultWeekly) > 1e-6);
    // Liczba wstrzykiwaczy dla danej liczby dni
    let units;
    if (days === 90) units = calc.units90;
    else if (days === 180) units = calc.units180;
    else units = 0;
    // Ustal dzień rozpoczęcia terapii oraz datę kontroli z uwzględnieniem 4. doby i świąt
    const { startDate: sDate, controlDate: cDate } = findSomatrogonDates(days);
    const months = Math.round(days / 30);
    const monthsStr = formatMonthsPL(months);
    const controlDateStr = formatDatePl(cDate);
    // Buduj numerowane linie zaleceń
    const lines = [];
    // 1. Dawka tygodniowa i sposób podania.  Preparat podawany jest podskórnie
    // w wybraną przez Ciebie porę, zawsze tego samego dnia każdego tygodnia.
    lines.push(`${brand} - ${perWeekStr} mg raz na tydzień. Preparat podaje się podskórnie, tego samego dnia każdego tygodnia, o dowolnej porze dnia.`);
    // 2. Aktualna dawka mg/kg/tydzień (tylko jeśli zmieniona)
    if (userChanged) {
      lines.push(`Aktualna dawka hormonu wzrostu to ${mgKgWeekStr} mg/kg/tydzień,`);
    }
    // 3. Zapotrzebowanie – wstrzykiwacze
    lines.push(`Wydano lek na ${days} dni (wydano ${formatPensPL(units)} preparatu ${brand} ${mgPart})`);
    // 4. Termin kontroli z uwzględnieniem czwartej doby po podaniu
    lines.push(`Kontrola za ${monthsStr} w dniu ${controlDateStr}`);
    // 5. Pominięta dawka – przystępny opis
    lines.push(`Pominięta dawka: przyjmuj lek zawsze tego samego dnia tygodnia. Jeśli zapomnisz o dawce, podaj ją jak najszybciej w ciągu 3 dni, a potem wróć do swojego cotygodniowego schematu. Jeśli minęły ponad 3 dni, pominiętej dawki nie podawaj i zaczekaj na wcześniej ustalony dzień.`);
    // 6. Zmiana dnia podawania – przystępny opis
    lines.push(`Zmiana dnia dawkowania: w razie potrzeby możesz zmienić dzień podawania, ale zadbaj, aby między dwiema kolejnymi dawkami było przynajmniej 3 dni przerwy. Po wybraniu nowego dnia kontynuuj podawanie raz w tygodniu.`);
    // Dodaj numerację do linii
    const numbered = lines.map((l, idx) => `${idx+1}. ${l}`);
    return numbered.join('\n');
  }

  /**
   * Buduje zalecenia dla somatrogonu (Ngenla) na niestandardową liczbę dni,
   * przy założeniu, że kontrola nastąpi w zadanym dniu kontrolnym.  Funkcja
   * korzysta z bieżących obliczeń zapisanych w window.ghTherapyCalc.
   *
   * @param {number} days Liczba dni leczenia (np. 87)
   * @param {Date} manualControlDate Data kontroli ustalona przez lekarza/pacjenta
   * @returns {string} Ciąg zaleceń w formie wielowierszowej
   */
  function buildSomatrogonManualRecommendation(days, manualControlDate){
    try { recalc(); } catch(_){}
    const calc = (typeof window !== 'undefined') ? window.ghTherapyCalc : null;
    if (!calc || !/^Ngenla/.test(calc.drug)) return '';
    const tokens = calc.drug.split(' ');
    const brand = tokens[0];
    const mgNumber = tokens[1] || '';
    const mgUnit = tokens[2] || '';
    const mgPart = mgNumber + (mgUnit ? ' ' + mgUnit : '');
    const perWeekStr = fmt(calc.perWeekMg, 1);
    const mgKgWeekStr = fmt(calc.mgKgWeek, 2);
    const defaultWeekly = 0.66;
    const userChanged = (Math.abs(calc.mgKgWeek - defaultWeekly) > 1e-6);
    // Oblicz liczbę wstrzykiwaczy na podstawie liczby dni: zaokrąglamy do pełnych tygodni
    let injections = 0;
    if (days && days>0) {
      injections = Math.ceil(days / 7);
    }
    const unitInfo = DRUG_UNITS[calc.drug];
    let totalMg = injections * calc.perWeekMg;
    let units = 0;
    if (unitInfo && unitInfo.mgPerUnit) {
      units = Math.ceil(totalMg / unitInfo.mgPerUnit);
    }
    // Liczba miesięcy ~
    const months = Math.round(days / 30);
    const monthsStr = formatMonthsPL(months);
    const ctrlDateStr = formatDatePl(manualControlDate);
    const lines = [];
    lines.push(`${brand} - ${perWeekStr} mg raz na tydzień. Preparat podaje się podskórnie, tego samego dnia każdego tygodnia, o dowolnej porze dnia.`);
    if (userChanged) {
      lines.push(`Aktualna dawka hormonu wzrostu to ${mgKgWeekStr} mg/kg/tydzień,`);
    }
    lines.push(`Wydano lek na ${days} dni (wydano ${formatPensPL(units)} preparatu ${brand} ${mgPart})`);
    lines.push(`Kontrola za ${monthsStr} w dniu ${ctrlDateStr}`);
    lines.push(`Pominięta dawka: przyjmuj lek zawsze tego samego dnia tygodnia. Jeśli zapomnisz o dawce, podaj ją jak najszybciej w ciągu 3 dni, a potem wróć do swojego cotygodniowego schematu. Jeśli minęły ponad 3 dni, pominiętej dawki nie podawaj i zaczekaj na wcześniej ustalony dzień.`);
    lines.push(`Zmiana dnia dawkowania: w razie potrzeby możesz zmienić dzień podawania, ale zadbaj, aby między dwiema kolejnymi dawkami było przynajmniej 3 dni przerwy. Po wybraniu nowego dnia kontynuuj podawanie raz w tygodniu.`);
    const numbered = lines.map((l, idx) => `${idx+1}. ${l}`);
    return numbered.join('\n');
  }

  /**
   * Buduje zalecenia dla GH (codziennych somatotropin) lub Ngenla zależnie od
   * aktualnie wybranego preparatu na niestandardową liczbę dni.  Przyjmuje też
   * docelową datę kontroli.  Dla Ngenla deleguje do buildSomatrogonManualRecommendation,
   * dla GH samodzielnie liczy liczbę ampułek i buduje opis.
   *
   * @param {number} days Liczba dni leczenia
   * @param {Date} ctrlDate Data planowanej kontroli
   * @returns {string}
   */
  function buildGhManualRecommendation(days, ctrlDate){
    try { recalc(); } catch(_){}
    const calc = (typeof window !== 'undefined') ? window.ghTherapyCalc : null;
    if (!calc) return '';
    const drug = calc.drug;
    if (/^Ngenla/.test(drug)) {
      return buildSomatrogonManualRecommendation(days, ctrlDate);
    }
    // Jeżeli preparat nie jest codzienną somatotropiną, nie generuj zaleceń
    if (!isDailySomatotropinDrug(drug)) return '';
    // Rozbij nazwę preparatu na markę i mg
    const drugTokens = drug.split(' ');
    const brand = drugTokens[0];
    const mgNumber = drugTokens[1] || '';
    const mgUnit   = drugTokens[2] || '';
    const mgPart   = mgNumber + (mgUnit ? ' ' + mgUnit : '');
    // Dawki i przeliczenia
    const perDayStr   = fmt(calc.perDayMg, mgPerDayDecimals(drug));
    const mgKgDayStr  = fmt(calc.mgKgDay, 3);
    const mgKgWeekStr = fmt(calc.mgKgWeek, 3);
    // Wylicz liczbę ampułek na podstawie days
    // mg per day for patient is calc.perDayMg; mg per unit from DRUG_UNITS
    let totalMg = calc.perDayMg * days;
    const unitInfo = DRUG_UNITS[drug];
    let units = 0;
    if (unitInfo && unitInfo.mgPerUnit) {
      units = Math.ceil(totalMg / unitInfo.mgPerUnit);
    }
    // Liczba miesięcy i format daty kontroli
    const months = Math.round(days / 30);
    const monthsStr = formatMonthsPL(months);
    const ctrlDateStr = formatDatePl(ctrlDate);
    // Zbuduj cztery linie zaleceń dla codziennie podawanych hormonów wzrostu.
    // Każda linia opisuje kolejno dawkę dzienną, aktualną dawkę w przeliczeniu na masę,
    // liczbę wydanych ampułek i termin kontroli.  Dodaj numerację punktów, aby
    // zalecenia były czytelne i zgodne z wymaganiami użytkownika.
    const lines = [];
    lines.push(`${brand} - ${perDayStr} mg na dobę w codziennych wstrzyknięciach podskórnych.`);
    lines.push(`Aktualna dawka hormonu wzrostu to ${mgKgDayStr} mg/kg/d (${mgKgWeekStr} mg/kg/tydz)`);
    lines.push(`Wydano lek na ${days} dni (${formatAmpoulesPL(units)} preparatu ${brand} a ${mgPart})`);
    lines.push(`Kontrola za ${monthsStr} w dniu ${ctrlDateStr}`);
    const numberedLines = lines.map((l, idx) => `${idx+1}. ${l}`);
    return numberedLines.join('\n');
  }

  /**
   * Kopiuje podany tekst do schowka, korzystając z API Clipboard jeśli jest dostępne,
   * a następnie wyświetla krótki komunikat.  Fallback używa ukrytego pola
   * textarea.  Komunikat pojawia się na dole ekranu i znika po 2,5 s.
   *
   * @param {string} text Tekst do skopiowania
   */
  function copyRecommendationToClipboard(text){
    if (!text) return;
    const notify = function(){ showGhToast('Zalecenia zostały skopiowane do schowka.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(notify).catch(() => {
        // Fallback w przypadku błędu
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); notify(); } catch(_){}
        document.body.removeChild(ta);
      });
    } else {
      // Fallback – starsze przeglądarki
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch(_){}
      document.body.removeChild(ta);
      notify();
    }
  }

  /**
   * Wyświetla krótkie powiadomienie na dole ekranu.  Styl oparty na
   * showMetabolicToast z pliku HTML, ale z lekkimi modyfikacjami.  Toast
   * jest usuwany po około 2,5 sekundy.
   *
   * @param {string} message Treść powiadomienia
   */
  function showGhToast(message){
    try {
      const toast = document.createElement('div');
      toast.textContent = message || 'Zalecenia zostały skopiowane do schowka.';
      toast.style.position = 'fixed';
      toast.style.bottom = '1rem';
      toast.style.left = '50%';
      toast.style.transform = 'translateX(-50%)';
      toast.style.background = getComputedStyle(document.documentElement).getPropertyValue('--secondary') || '#00838d';
      toast.style.color = 'white';
      toast.style.padding = '0.6rem 1.2rem';
      toast.style.borderRadius = '4px';
      toast.style.fontSize = '1rem';
      toast.style.zIndex = '10000';
      toast.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
      document.body.appendChild(toast);
      setTimeout(() => { try { toast.remove(); } catch(e){} }, 2500);
    } catch(_) {
      // w razie problemów z dodaniem toastu nic nie robimy
    }
  }

  // Programy – zakresy terapeutyczne (GH – w mg/kg/tydz), dawki domyślne w mg/kg/d (poza IGF‑1 i somatrogonem)
  const PROGRAMS = {
    'SNP': { label:'SNP (Somatotropinowa niedoczynność przysadki)', ghWeekRange:[0.10,0.33], defaultDaily:0.025, drugs: GH_DRUGS },
    'PNN': { label:'PNN (Przewlekła niewydolność nerek)',           ghWeekRange:[0.33,0.37], defaultDaily:0.050, drugs: GH_DRUGS },
    'ZT' : { label:'Zespół Turnera',                                ghWeekRange:[0.33,0.47], defaultDaily:0.057, drugs: GH_DRUGS },
    'PWS': { label:'Zespół PWS',                                    ghWeekRange:[0.18,0.47], defaultDaily:0.046, drugs: GH_DRUGS },
    'SGA': { label:'SGA',                                           ghWeekRange:[0.16,0.43], defaultDaily:(0.25/7), drugs: GH_DRUGS },
    'IGF-1': { label:'IGF‑1 (niedobór IGF‑1 – mekasermina)',        igfDailyRange:[0.08,0.24], igfTargetPerDose:0.12, drugs: IGF_DRUGS }
  };

  function fmt(n, d=3){
    if (!isFinite(n)) return '–';
    const x = (d==null ? String(n) : Number(n).toFixed(d));
    // usuń zbędne zera po przecinku
    const trimmed = (d!=null) ? x.replace(/\.?0+$/, '') : x;
    return trimmed.replace('.', ',');
  }
  function num(v){
    const x = parseFloat(v);
    return (isNaN(x) ? null : x);
  }
  function kg(){ // masa pacjenta z karty „Dane użytkownika”
    const el = document.getElementById('weight');
    const w = el ? parseFloat(el.value) : NaN;
    return (isNaN(w) ? null : w);
  }

  function createCard(){
    const card = document.createElement('section');
    card.id = 'ghIgfTherapyCard';
    card.className = 'result-card animate-in'; // szeroka karta jak intakeCard
    card.style.margin = '1rem 0';

    card.innerHTML = `
      <h2 style="text-align:center;">Leczenie hormonem wzrostu / IGF‑1</h2>
      <div class="flex" style="display:flex; gap:.75rem; flex-wrap:wrap; align-items:flex-end;">
        <label style="flex:1 1 260px; min-width:240px;">
          Program terapeutyczny
          <select id="therProg"></select>
        </label>
        <label style="flex:1 1 260px; min-width:240px;">
          Preparat
          <select id="therDrug"></select>
        </label>
      </div>

      <div class="flex" style="display:flex; gap:.75rem; flex-wrap:wrap; align-items:flex-end; margin-top:.65rem;">
        <label id="therDoseContainer" style="flex:1 1 220px; min-width:210px;">
          <span id="therDoseLabelText">Dawka (mg/kg/dobę)</span>
          <input type="number" step="0.001" min="0" id="therDailyDose" placeholder="domyślnie wg programu/preparatu">
        </label>
        <!-- Pole na dawkę absolutną (mg/dobę); widoczne tylko dla preparatów GH podawanych codziennie -->
        <label id="therDoseAbsContainer" style="flex:1 1 220px; min-width:210px; display:none;">
          <span id="therDoseAbsLabelText">Dawka (mg/dobę)</span>
          <input type="number" step="0.001" min="0" id="therDailyDoseAbs" placeholder="">
        </label>
        <label style="flex:0 0 160px;">
          Inne dni
          <input type="number" step="1" min="1" id="therCustomDays" placeholder="np. 30">
        </label>
      </div>

      <div id="therDoseNote" class="muted" style="margin-top:.35rem;"></div>
      <div id="therWarning" class="plan-warning-card notice-orange" style="display:none; margin-top:.5rem;"></div>

      <div id="therSummary" class="result-box" style="margin-top:.8rem;"></div>

      <div class="data-card" style="margin-top:.8rem;">
        <!--
          Podziel kontener wyników na dwie kolumny: lewa wyświetla zapotrzebowanie leku
          (liczbę ampułek/opakowań) na 90 dni, 180 dni oraz dowolny okres, a prawa
          zawiera przyciski kopiujące zalecenia na 90 i 180 dni.  Prawa kolumna
          jest domyślnie ukryta i pojawia się tylko dla codziennie podawanych
          somatotropin (Omnitrope/Genotropin).  Dzięki flexboxowi obie części
          rozciągają się na równą wysokość.  Przy braku prawej kolumny lewa
          zajmuje 100 % szerokości.
        -->
        <div class="ther-data-wrapper" style="display:flex; gap:0.8rem; flex-wrap:wrap; align-items:stretch;">
          <!-- Lewa połowa: tabela zapotrzebowania leku -->
          <div class="ther-amounts" id="therAmountsContainer" style="flex:1 1 50%; min-width:220px;">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:.6rem; align-items:center;">
              <div><strong>Na 90 dni</strong></div>  <div id="ther90"></div>
              <div><strong>Na 180 dni</strong></div> <div id="ther180"></div>
              <div id="therCustomRow" style="display:contents;">
                <div><strong>Na <span id="therCustomLabel">—</span> dni</strong></div>
                <div id="therCustom"></div>
              </div>
              <!-- Wiersz zapotrzebowania na lek dla ustalonej daty kontroli. Ukrywany
                   domyślnie; gdy użytkownik wybierze datę kontroli w kalendarzu,
                   zostanie wyświetlony. Używamy display:contents, aby zachować
                   spójny układ siatki. Podkreślenie dodawane jest dynamicznie
                   w skrypcie (turkusowa linia pod wierszem). -->
              <div id="therManualRow" style="display:none;">
                <div><strong>Na <span id="therManualLabel">—</span> dni</strong></div>
                <div id="therManual"></div>
              </div>
            </div>
            <small class="muted" style="display:block; margin-top:.4rem;">W obliczeniach zaokrąglamy liczbę ampułek w górę – uwzględnia to typowe straty podczas podawania.</small>
            <!-- Komunikat o sugerowanym dniu rozpoczęcia podawania leku przy Ngenla -->
            <div id="therStartAdvice" style="margin-top:.5rem;"></div>
          </div>
          <!-- Prawa połowa: przyciski kopiujące zalecenia oraz dodatkowe komunikaty dla Ngenla.
               Ukryta domyślnie; pokazujemy ją dla codziennie podawanych somatotropin
               oraz Ngenla (somatrogon).  Zawiera grupy dla 90 i 180 dni oraz sekcję
               z ustaloną datą kontroli. -->
          <div class="ther-recommendations" id="therRecommendationActions" style="flex:1 1 50%; min-width:220px; flex-direction:column; gap:.6rem; display:none; position:relative; z-index:5;">
            <!-- Grupa zaleceń na 90 dni -->
            <div id="rec90Group" style="display:flex; flex-direction:column; gap:.4rem;">
              <div id="startAdvice90" style="text-align:center; font-weight:600; color: var(--notice-orange);"></div>
              <button type="button" id="copy90days" class="igf-btn btn-icon" style="background:#ffffff !important; color:#000000 !important; border:2px solid var(--secondary) !important;">Wydanie leku na 90 dni – kliknij i skopiuj</button>
            </div>
            <!-- Grupa zaleceń na 180 dni -->
            <div id="rec180Group" style="display:flex; flex-direction:column; gap:.4rem;">
              <div id="startAdvice180" style="text-align:center; font-weight:600; color: var(--notice-orange);"></div>
              <button type="button" id="copy180days" class="igf-btn btn-icon" style="background:#ffffff !important; color:#000000 !important; border:2px solid var(--secondary) !important;">Wydanie leku na 180 dni – kliknij i skopiuj</button>
            </div>
            <!-- Grupa z ustaloną datą kontroli (własny wybór lekarza) -->
            <div id="manualGroup" style="display:none; flex-direction:column; gap:.4rem;">
              <!-- Wyśrodkowana i powiększona etykieta dla pola daty -->
              <label for="manualControlDate" style="font-weight:600; text-align:center; font-size:1.25rem; width:100%; display:block;">Ustalona data kontroli</label>
              <!-- Opakowanie dla niestandardowego kalendarza. Używamy input typu text
                   (readonly), aby uniknąć wbudowanego małego datepickera i
                   wyświetlamy własny kalendarz po kliknięciu -->
              <div id="manualDateWrapper" style="position:relative; width:100%;">
                <!-- Pole daty w trybie tylko do odczytu.  Używamy placeholdera, aby
                     wyświetlić wskazówkę do czasu wyboru daty.  Kolor tekstu ustawiony
                     początkowo na szary (muted), dzięki czemu etykieta jest mniej
                     dominująca. -->
                <input type="text" id="manualControlDate" readonly
                       placeholder="Wybierz dokładną datę kontroli"
                       style="padding:.3rem; width:100%; cursor:pointer; color:#6b7a7a;">
                <!-- Kontener na nasz niestandardowy kalendarz. Początkowo ukryty.
                     Ustawiamy pozycjonowanie absolutne względem opakowania i
                     parametry bottom/left zamiast top, tak aby kalendarz
                     pojawiał się nad polem daty. -->
                <div id="manualDatePicker" class="custom-date-picker"
                     style="display:none; position:absolute; z-index:10020;
                            /* umieszczamy kalendarz powyżej pola daty. Używamy calc, aby dodać niewielką przerwę */
                            bottom:calc(100% + 0.4rem); left:0; background:white;
                            border:1px solid var(--secondary); border-radius:8px;
                            box-shadow:0 4px 12px rgba(0,0,0,0.15);
                            padding:0.5rem;">
                  <!-- Zawartość kalendarza generowana jest dynamicznie w JS -->
                </div>
              </div>
              <div id="manualStartAdvice" style="text-align:center; font-weight:600; color: var(--notice-orange);"></div>
              <!-- Przycisk kopiowania zaleceń z turkusową ramką. Ustawiamy biały
                   kolor tła i czarny tekst, aby nadpisać akcent Liquid iOS26 -->
              <button type="button" id="copyManualDays" class="igf-btn btn-icon" style="display:none; border:2px solid var(--secondary) !important; background:#ffffff !important; color:#000000 !important;">Wydanie leku – kliknij i skopiuj</button>
            </div>
          </div>
        </div>
      </div>
      <!-- Stały przycisk do monitorowania leczenia GH/IGF‑1.  Umieszczamy go bezpośrednio w karcie
           terapii, aby był zawsze dostępny niezależnie od porządku ładowania plików.  
           Klasa btn-icon centruje zawartość w trybie Liquid Glass, a btn-accent nadaje akcent kolorystyczny.  -->
      <div id="ghMonitorBtnWrapper" style="width:100%; display:flex; justify-content:center; margin:1rem 0;">
        <button type="button" id="toggleGhMonitor" class="igf-btn btn-icon btn-accent">Monitorowanie leczenia hormonem wzrostu</button>
      </div>
    `;
    return card;
  }

  const PROGRAM_ORDER = ['SNP','ZT','PWS','SGA','PNN','IGF-1'];

  function mountCard(){
    if (document.getElementById('ghIgfTherapyCard')) return;
    const where = document.getElementById('igfButtonWrapper');
    if (!where || !where.parentNode) return;
    const card = createCard();
    // wstaw POD przyciskiem „Leczenie hormonem wzrostu / IGF‑1”
    where.parentNode.insertBefore(card, where.nextSibling);
    // Początkowo ukryj kartę, aby pierwszy klik w przycisk pokazywał ją zamiast od razu chować.
    // Bez tego stylu domyślnie display jest pusty (""), co powodowało traktowanie karty jako widocznej
    // i natychmiastowe schowanie przy pierwszym kliknięciu. Ustawiając display na "none" zapewniamy
    // prawidłowe zachowanie przełącznika.
    card.style.display = 'none';

    // Jeśli karta monitorowania GH/IGF już istnieje na stronie, przenieś ją
    // zaraz po nowo utworzonej karcie terapii.  W tej wersji przycisk
    // monitorowania jest wbudowany bezpośrednio w createCard(), więc
    // nie musimy czekać na funkcję ghInjectMonitorToggleButton.  Przeniesienie
    // karty monitorowania tutaj zapewnia, że obie karty znajdują się w
    // oczekiwanym porządku od razu po montażu.
    const monitorCard = document.getElementById('ghTherapyMonitorCard');
    if (monitorCard) {
      try {
        where.parentNode.insertBefore(monitorCard, card.nextSibling);
      } catch(_) {
        /* ignoruj błędy podczas przenoszenia */
      }
    }

    // wypełnij listy
    const progSel = document.getElementById('therProg');
    const drugSel = document.getElementById('therDrug');
    PROGRAM_ORDER.forEach(key=>{
      const def = PROGRAMS[key];
      if(!def) return;
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = def.label;
      progSel.appendChild(opt);
    });
    // domyślnie wybierz SNP
    progSel.value = 'SNP';
    populateDrugs();

    // Funkcja pomocnicza resetująca dane specyficzne dla pojedynczego preparatu,
    // np. własną liczbę dni (therCustomDays) oraz ustawioną ręcznie datę kontroli.
    // Jest wywoływana przy zmianie programu terapeutycznego lub preparatu,
    // aby nie pozostawiać w tabeli wyników wierszy obliczonych dla poprzedniego wyboru.
    function resetCustomInputs() {
      try {
        // Wyczyść pole „Inne dni” i ukryj odpowiadający wiersz
        const customInp = document.getElementById('therCustomDays');
        if (customInp) customInp.value = '';
        const customRow = document.getElementById('therCustomRow');
        if (customRow) customRow.style.display = 'none';
        const customLabel = document.getElementById('therCustomLabel');
        const customVal = document.getElementById('therCustom');
        if (customLabel) customLabel.textContent = '—';
        if (customVal) customVal.textContent = '—';
        // Wyczyść ręcznie wybraną datę kontroli i ukryj wiersz manualny
        const manualInp = document.getElementById('manualControlDate');
        if (manualInp) {
          manualInp.value = '';
          // Przywróć szary kolor placeholdera po wyczyszczeniu
          try { manualInp.style.color = '#6b7a7a'; } catch(_) {}
        }
        const manualRow = document.getElementById('therManualRow');
        if (manualRow) manualRow.style.display = 'none';
        const manualLabel = document.getElementById('therManualLabel');
        const manualVal = document.getElementById('therManual');
        if (manualLabel) manualLabel.textContent = '—';
        if (manualVal) manualVal.textContent = '';
        // Ukryj komunikat o sugerowanej dacie i przycisk kopiowania dla manualnej daty
        const manualStartAdviceEl = document.getElementById('manualStartAdvice');
        if (manualStartAdviceEl) manualStartAdviceEl.textContent = '';
        const copyManualBtn = document.getElementById('copyManualDays');
        if (copyManualBtn) copyManualBtn.style.display = 'none';
      } catch(_) {
        /* ignoruj błędy */
      }
    }

    // listenery
    progSel.addEventListener('change', ()=>{
      resetCustomInputs();
      populateDrugs();
      applyDefaults();
      recalc();
    });
    drugSel.addEventListener('change', ()=>{
      resetCustomInputs();
      applyDefaults();
      recalc();
    });

    const doseInp = document.getElementById('therDailyDose');
    const doseAbsInp = document.getElementById('therDailyDoseAbs');
    const customDays = document.getElementById('therCustomDays');
    // Sygnalizuj, które pole dawki jest aktualnie edytowane (focus/blur)
    doseInp.addEventListener('focus', () => editingPerKg = true);
    doseInp.addEventListener('blur',  () => { editingPerKg = false; recalc(); });
    doseAbsInp.addEventListener('focus', () => editingPerDay = true);
    doseAbsInp.addEventListener('blur',  () => { editingPerDay = false; recalc(); });
    // Funkcje synchronizujące dawkę mg/kg/d ↔ mg/d
    function syncFromPerKg(){
      const wVal = kg();
      const perKg = num(doseInp.value);
      const drugName = document.getElementById('therDrug').value;
      if (isDailySomatotropinDrug(drugName)){
        if (wVal && perKg != null && perKg > 0){
          // Ustal liczbę miejsc po przecinku w mg/d w zależności od preparatu
          const dec = mgPerDayDecimals(drugName);
          if (!editingPerDay) doseAbsInp.value = Number(perKg * wVal).toFixed(dec);
        } else {
          if (!editingPerDay) doseAbsInp.value = '';
        }
      }
    }
    function syncFromPerDay(){
      const wVal = kg();
      const perDay = num(doseAbsInp.value);
      if (isDailySomatotropinDrug(document.getElementById('therDrug').value)){
        if (wVal && perDay != null && perDay > 0){
          if (!editingPerKg) doseInp.value = Number(perDay / wVal).toFixed(3);
        } else {
          if (!editingPerKg) doseInp.value = '';
        }
      }
    }
    // Nasłuchy: aktualizuj pola i przeliczaj wyniki na bieżąco
    doseInp.addEventListener('input', () => { syncFromPerKg(); recalc(); });
    doseAbsInp.addEventListener('input', () => { syncFromPerDay(); recalc(); });
    customDays.addEventListener('input', recalc);

    // Live‑sync z wagą
    const wt = document.getElementById('weight');
    if (wt){
      wt.addEventListener('input', recalc);
      wt.addEventListener('change', recalc);
    }

    // Podłącz zdarzenie do przycisku monitorowania leczenia GH.  Ponieważ
    // przycisk został osadzony w createCard(), jest dostępny w elemencie
    // `card`.  Kliknięcie przycisku przełącza widoczność karty
    // ghTherapyMonitorCard oraz odpowiednio dodaje/usuwa klasę
    // .active-toggle.
    const monitorBtn = card.querySelector('#toggleGhMonitor');
    if (monitorBtn) {
      monitorBtn.addEventListener('click', function(){
        const monitorCard = document.getElementById('ghTherapyMonitorCard');
        if (!monitorCard) return;
        const isHidden = monitorCard.style.display === 'none';
        if (isHidden) {
          monitorCard.style.display = '';
          this.classList.add('active-toggle');
        } else {
          monitorCard.style.display = 'none';
          this.classList.remove('active-toggle');
        }
      });
    }

    // Podłącz obsługę przycisków kopiujących zalecenia.  Nasłuch jest
    // dodawany po utworzeniu karty i dotyczy tylko elementów istniejących
    // w szablonie createCard().  Zdarzenia generują tekst zaleceń i
    // kopiują go do schowka, wyświetlając krótki komunikat.
    const copy90Btn  = card.querySelector('#copy90days');
    const copy180Btn = card.querySelector('#copy180days');
    const copyManualBtn = card.querySelector('#copyManualDays');
    const manualDateInp = card.querySelector('#manualControlDate');
    const manualPickerEl = card.querySelector('#manualDatePicker');
    if (copy90Btn) {
      copy90Btn.addEventListener('click', function(){
        const text = buildGhRecommendation(90);
        copyRecommendationToClipboard(text);
      });
    }
    if (copy180Btn) {
      copy180Btn.addEventListener('click', function(){
        const text = buildGhRecommendation(180);
        copyRecommendationToClipboard(text);
      });
    }
    if (manualDateInp) {
      // Aktualizuj zalecenia dla własnej daty kontroli po zmianie pola
      manualDateInp.addEventListener('change', function(){
        try { recalc(); } catch(_) {}
      });
      // Zainicjuj własny kalendarz dla pola daty
      try {
        setupCustomDatePicker(manualDateInp, manualPickerEl);
      } catch(_) {
        /* ignoruj błędy w inicjalizacji kalendarza */
      }
    }
    if (copyManualBtn) {
      copyManualBtn.addEventListener('click', function(){
        // Pobierz liczbę dni i zbuduj zalecenia dla podanej daty kontroli.
        // Dla somatrogonu (Ngenla) odejmujemy 4 dni od różnicy, aby
        // uwzględnić czterodniową przerwę przed badaniem; dla codziennych
        // somatotropin (GH) używamy pełnej różnicy w dniach.
        try {
          const ctrlInput = document.getElementById('manualControlDate');
          if (!ctrlInput || !ctrlInput.value) return;
          const ctrlDate = parseLocalDateInput(ctrlInput.value);
          if (!ctrlDate) return;
          // Obetnij bieżącą datę do północy, aby zapewnić poprawne obliczenie liczby dni.
          const todayReal = new Date();
          const today = startOfDay(todayReal);
          const msPerDay = 24*60*60*1000;
          const diffDays = Math.round((ctrlDate - today) / msPerDay);
          // Pobierz aktualnie wybrany preparat z globalnego stanu; jeśli brak, pozostaw pusty ciąg
          const calc = (typeof window !== 'undefined') ? window.ghTherapyCalc : null;
          const currentDrug = calc ? calc.drug || '' : '';
          let therapyDays;
          if (/^Ngenla/.test(currentDrug)) {
            therapyDays = diffDays - 4;
          } else if (isDailySomatotropinDrug(currentDrug)) {
            therapyDays = diffDays;
          } else {
            therapyDays = diffDays;
          }
          if (therapyDays <= 0) {
            // Nie kopiuj jeśli data jest za wczesna
            return;
          }
          const text = buildGhManualRecommendation(therapyDays, ctrlDate);
          copyRecommendationToClipboard(text);
        } catch(e) {
          /* ignore */
        }
      });
    }

    // start
    applyDefaults();
    recalc();
  }

  function populateDrugs(){
    const prog = document.getElementById('therProg').value;
    const drugSel = document.getElementById('therDrug');
    drugSel.innerHTML = '';
    const list = PROGRAMS[prog].drugs;
    list.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      drugSel.appendChild(opt);
    });
    // Ustaw domyślny preparat w zależności od programu. Gdy wartość z
    // DEFAULT_DRUG_BY_PROGRAM istnieje w bieżącej liście, wybieramy ją;
    // w przeciwnym razie pozostawiamy pierwszy element listy. Dla IGF‑1
    // zachowujemy preferencję na jedyny dostępny preparat.
    let defaultDrug = DEFAULT_DRUG_BY_PROGRAM[prog];
    if (prog === 'IGF-1') {
      defaultDrug = 'Increlex 40 mg';
    }
    if (defaultDrug && list.includes(defaultDrug)) {
      drugSel.value = defaultDrug;
    } else {
      // fallback: wybierz pierwszy element (jeśli jest)
      if (list.length > 0) {
        drugSel.value = list[0];
      }
    }
  }

  function applyDefaults(){
    const prog = document.getElementById('therProg').value;
    const drug = document.getElementById('therDrug').value;
    const doseInp = document.getElementById('therDailyDose');
    const note = document.getElementById('therDoseNote');
    const labelEl = document.getElementById('therDoseLabelText');

    // Wartości domyślne dla dawek w mg/kg/d lub mg/kg/tydz
    let defaultDailyMgPerKg = null;
    let defaultWeeklyMgPerKg = null;
    let noteHtml = '';

    // Dla somatrogonu (Ngenla) posługujemy się dawką tygodniową w polu
    // wprowadzania (mg/kg/tydzień), natomiast w obliczeniach stosujemy
    // przeliczenie na mg/kg/dobę. W pozostałych przypadkach dawka jest
    // podawana w mg/kg/dobę.
    if (prog === 'IGF-1') {
      // IGF‑1: docelowa dawka 0,12 mg/kg 2×/dobę (razem 0,24 mg/kg/d)
      defaultDailyMgPerKg = 0.24;
      labelEl.textContent = 'Dawka (mg/kg/dobę)';
      doseInp.placeholder = String(defaultDailyMgPerKg);
      doseInp.value = String(defaultDailyMgPerKg);
      noteHtml = `IGF‑1: docelowa dawka <strong>0,12&nbsp;mg/kg</strong> podawana <strong>2×/dobę</strong> (<em>łącznie ≈&nbsp;${fmt(defaultDailyMgPerKg,3)}&nbsp;mg/kg/d</em>).`;
    } else if (/^Ngenla/.test(drug)) {
      // Somatrogon (Ngenla) – zalecana dawka 0,66 mg/kg/tydz; ustawiamy tygodniową wartość w polu
      defaultWeeklyMgPerKg = 0.66;
      defaultDailyMgPerKg = defaultWeeklyMgPerKg / 7;
      labelEl.textContent = 'Dawka (mg/kg/tydzień)';
      doseInp.placeholder = String(defaultWeeklyMgPerKg);
      doseInp.value = String(defaultWeeklyMgPerKg);
      noteHtml = `Somatrogon (Ngenla): zalecana dawka <strong>0,66&nbsp;mg/kg/tydz</strong> (<em>≈&nbsp;${fmt(defaultDailyMgPerKg,3)}&nbsp;mg/kg/d</em>).`;
    } else {
      // Somatotropina (GH) – dawki w mg/kg/dobę zgodnie z programem
      defaultDailyMgPerKg = PROGRAMS[prog].defaultDaily;
      labelEl.textContent = 'Dawka (mg/kg/dobę)';
      doseInp.placeholder = String(defaultDailyMgPerKg);
      doseInp.value = String(defaultDailyMgPerKg);
      // Use the program label before any parentheses to derive a short
      // program name.  For labels like "SNP (Somatotropinowa niedoczynność przysadki)"
      // this returns "SNP", while for labels without parentheses (e.g. "Zespół Turnera",
      // "Zespół PWS" or "SGA") it returns the full label.  This avoids cutting off
      // parts of names that consist of multiple words (e.g. "Zespół Turnera").
      const progShort = PROGRAMS[prog].label.split(' (')[0];
      noteHtml = `GH (somatotropina) – zalecana dawka dla programu <strong>${progShort}</strong>: <em>${fmt(defaultDailyMgPerKg,3)}&nbsp;mg/kg/d</em>.`;
    }

    // Dodaj informację o zalecanym zakresie dawek dla wybranego programu.  Dla
    // programów GH zakresy są zdefiniowane w ghWeekRange (mg/kg/tydzień);
    // zamieniamy je na mg/kg/dobę poprzez podzielenie przez 7.  Dla IGF‑1
    // zakresy znajdują się w igfDailyRange (mg/kg/d).  Jeśli żaden zakres nie
    // jest dostępny (np. dla preparatów somatrogonu), nie dodajemy
    // dodatkowej etykiety.
    let rangeHtml = '';
    if (prog === 'IGF-1') {
      const p = PROGRAMS[prog];
      if (p && Array.isArray(p.igfDailyRange)) {
        const [minR, maxR] = p.igfDailyRange;
        rangeHtml = ` (${fmt(minR,3)}–${fmt(maxR,3)} mg/kg/d)`;
      }
    } else {
      const p = PROGRAMS[prog];
      if (p && Array.isArray(p.ghWeekRange)) {
        const [minW, maxW] = p.ghWeekRange;
        const minD = minW / 7;
        const maxD = maxW / 7;
        rangeHtml = ` (${fmt(minD,3)}–${fmt(maxD,3)} mg/kg/d)`;
      }
    }

    // Dodaj zakres do notatki, jeśli istnieje.  Zostawiamy kropkę na końcu
    // pierwotnej notatki i dołączamy zakres jako osobne zdanie w nawiasach.
    note.innerHTML = noteHtml + (rangeHtml || '');

    // Pokaż lub ukryj pole dawki w mg/dobę oraz ustaw jego wartość początkową.
    // Pole mg/dobę jest widoczne tylko dla codziennie podawanych preparatów GH (somatotropina).
    const doseAbsWrap  = document.getElementById('therDoseAbsContainer');
    const doseAbsInput = document.getElementById('therDailyDoseAbs');
    const wVal = kg();
    if (isDailySomatotropinDrug(drug)){
      doseAbsWrap.style.display = '';
      if (wVal && defaultDailyMgPerKg != null){
        // Ustal liczbę miejsc po przecinku dla wyniku w mg/dobę w zależności od preparatu
        const dec = mgPerDayDecimals(drug);
        if (!editingPerDay) doseAbsInput.value = Number(defaultDailyMgPerKg * wVal).toFixed(dec);
      } else {
        if (!editingPerDay) doseAbsInput.value = '';
      }
    } else {
      doseAbsWrap.style.display = 'none';
      if (!editingPerDay) doseAbsInput.value = '';
    }
  }

  function weekRangeDaily(prog){
    // zwróć [minD, maxD] dla GH programów (mg/kg/d)
    const p = PROGRAMS[prog];
    if (!p || !p.ghWeekRange) return null;
    return [ p.ghWeekRange[0]/7, p.ghWeekRange[1]/7 ];
  }

function recalc(){
    const warnBox = document.getElementById('therWarning');
    const summary = document.getElementById('therSummary');
    const out90 = document.getElementById('ther90');
    const out180 = document.getElementById('ther180');
    const outC = document.getElementById('therCustom');
    const labC = document.getElementById('therCustomLabel');

    const prog = document.getElementById('therProg').value;
    const drug = document.getElementById('therDrug').value;
    const doseVal = num(document.getElementById('therDailyDose').value);
    const customDays = num(document.getElementById('therCustomDays').value);
    const w = kg();

    // minimal validation: require weight
    if (!w || w <= 0){
      summary.innerHTML = `<p>Uzupełnij <strong>wagę</strong> w sekcji „Dane użytkownika”, aby zobaczyć dawki.</p>`;
      out90.textContent = '—';
      out180.textContent = '—';
      outC.textContent = '—';
      labC.textContent = customDays ? String(customDays) : '—';
      warnBox.style.display = 'none';
      return;
    }

    // Determine base daily (mg/kg/d) and weekly (mg/kg/tydz) dose based on drug/program
    let daily;   // mg/kg/d
    let weekly;  // mg/kg/tydz
    if (/^Ngenla/.test(drug)) {
      // Ngenla: input is mg/kg/week
      if (doseVal == null || doseVal <= 0) {
        weekly = 0.66;
      } else {
        weekly = doseVal;
      }
      daily = weekly / 7;
    } else if (prog === 'IGF-1') {
      // IGF‑1: input is mg/kg/day
      if (doseVal == null || doseVal <= 0) {
        daily = 0.24;
      } else {
        daily = doseVal;
      }
      weekly = daily * 7;
    } else {
      // GH daily: input is mg/kg/day
      if (doseVal == null || doseVal <= 0) {
        daily = PROGRAMS[prog].defaultDaily;
      } else {
        daily = doseVal;
      }
      weekly = daily * 7;
    }

    // Per-patient mg/day and mg/week (before rounding)
    const perKgWeek_mg = weekly;
    const perKgWeek_IU = (prog === 'IGF-1' ? null : perKgWeek_mg * 3);
    let perDay_mg = daily * w;
    let perWeek_mg = perKgWeek_mg * w;

    // === ROUNDING OF PATIENT'S DOSE ===
    let step = null;
    let weeklyDose = false;
    switch (drug) {
      case 'Omnitrope 5 mg':    step = 0.05; break;
      case 'Omnitrope 10 mg':   step = 0.1;  break;
      case 'Genotropin 5,3 mg': step = 0.05; break;
      case 'Genotropin 12 mg':  step = 0.15; break;
      case 'Ngenla 24 mg':      step = 0.2; weeklyDose = true; break;
      case 'Ngenla 60 mg':      step = 0.5; weeklyDose = true; break;
      case 'Increlex 40 mg':    step = null; break;
    }
    function roundTo(val, st){ return Math.round(val / st) * st; }
    if (step) {
      if (weeklyDose) {
        perWeek_mg = roundTo(perWeek_mg, step);
        perDay_mg = perWeek_mg / 7;
      } else {
        perDay_mg = roundTo(perDay_mg, step);
        perWeek_mg = perDay_mg * 7;
      }
    }
    // === END ROUNDING ===

    // Effective dose in mg/kg/day and mg/kg/week after rounding
    let dailyEff;
    let weeklyEff;
    if (/^Ngenla/.test(drug)) {
      weeklyEff = (w ? (perWeek_mg / w) : weekly);
      dailyEff = weeklyEff / 7;
    } else if (prog === 'IGF-1') {
      dailyEff = daily;
      weeklyEff = dailyEff * 7;
    } else {
      dailyEff = (w ? (perDay_mg / w) : daily);
      weeklyEff = dailyEff * 7;
    }

    // Synchronize inputs for daily somatotropin drugs
    if (isDailySomatotropinDrug(drug)) {
      const doseAbsInput  = document.getElementById('therDailyDoseAbs');
      const dosePerKgInput= document.getElementById('therDailyDose');
      if (w) {
        // określ liczbę miejsc po przecinku dla mg/d w zależności od preparatu
        const dec = mgPerDayDecimals(drug);
        if (!editingPerDay) doseAbsInput.value  = Number(perDay_mg).toFixed(dec);
        if (!editingPerKg)  dosePerKgInput.value= Number(dailyEff).toFixed(3);
      }
    }

    // Warnings based on effective dose
    let warn = '';
    if (prog === 'IGF-1') {
      const [minD, maxD] = PROGRAMS['IGF-1'].igfDailyRange;
      if (dailyEff < minD || dailyEff > maxD) {
        warn = `Wpisana/efektywna dawka <strong>${fmt(dailyEff,3)} mg/kg/d</strong> jest <strong>poza zakresem</strong> programu IGF‑1 (<em>${fmt(minD,2)}–${fmt(maxD,2)} mg/kg/d</em>).`;
      }
    } else if (/^Ngenla/.test(drug)) {
      // Ostrzeżenie dla Ngenla (somatrogon) pojawia się tylko wtedy, gdy użytkownik
      // świadomie zmienił dawkę tygodniową mg/kg/tydz na inną niż zalecane 0,66.
      // Wartość doseVal pochodzi bezpośrednio z pola wejściowego (mg/kg/tydz).
      // Jeśli jest ona pusta/null lub równa 0,66 (domyślnie wstawiana przez applyDefaults),
      // uznajemy, że użytkownik nie modyfikował dawki i nie wyświetlamy ostrzeżenia,
      // nawet jeśli weeklyEff różni się minimalnie od 0,66 wskutek zaokrągleń skoków.
      const defaultWeekly = 0.66;
      const userChanged = (doseVal != null && Math.abs(doseVal - defaultWeekly) > 1e-6);
      if (userChanged && Math.abs(weeklyEff - defaultWeekly) > 1e-6) {
        warn = `Ngenla: zalecana dawka to <strong>0,66&nbsp;mg/kg/tydz</strong> (u Ciebie: <em>${fmt(weeklyEff,3)}&nbsp;mg/kg/tydz</em>).`;
      }
    } else {
      const rng = weekRangeDaily(prog);
      if (rng) {
        if (dailyEff < rng[0] || dailyEff > rng[1]) {
          warn = `Efektywna dawka <strong>${fmt(dailyEff,3)} mg/kg/d</strong> jest <strong>poza zakresem</strong> programu <strong>${prog}</strong> (<em>${fmt(rng[0],3)}–${fmt(rng[1],3)} mg/kg/d</em>).`;
        }
      }
    }
    if (warn){
      warnBox.innerHTML = warn;
      warnBox.style.display = 'block';
    } else {
      warnBox.style.display = 'none';
      warnBox.innerHTML = '';
    }

    // Summary display using effective doses
    if (/^Ngenla/.test(drug)) {
      const perKgWeek_IU_eff = (prog === 'IGF-1' ? null : weeklyEff * 3);
      const iuPartN = (perKgWeek_IU_eff==null) ? '' : ` (<span class="muted">${fmt(perKgWeek_IU_eff,2)} IU/kg/tydz</span>)`;
      summary.innerHTML = `
      <div class="whr-result">
        <div class="whr-topline" style="justify-content:center;">
          <span class="whr-label">Pacjent:</span>
          <span class="whr-number">${fmt(perWeek_mg,3)} <small>mg/tydz</small></span>
        </div>
        <div class="whr-badges" style="justify-content:center;">
          <span class="whr-badge">${fmt(dailyEff,3)} mg/kg/d</span>
          <span class="whr-badge">= ${fmt(weeklyEff,3)} mg/kg/tydz${iuPartN}</span>
          <span class="whr-badge">${fmt(perDay_mg,3)} mg/d</span>
        </div>
      </div>
      `;
    } else {
      const perKgWeek_IU_eff2 = (prog === 'IGF-1' ? null : weeklyEff * 3);
      const iuPart2 = (perKgWeek_IU_eff2==null) ? '' : ` (<span class="muted">${fmt(perKgWeek_IU_eff2,2)} IU/kg/tydz</span>)`;
      summary.innerHTML = `
      <div class="whr-result">
        <div class="whr-topline" style="justify-content:center;">
          <span class="whr-label">Pacjent:</span>
          <span class="whr-number">${fmt(perDay_mg,3)} <small>mg/d</small></span>
        </div>
        <div class="whr-badges" style="justify-content:center;">
          <span class="whr-badge">${fmt(dailyEff,3)} mg/kg/d</span>
          <span class="whr-badge">= ${fmt(weeklyEff,3)} mg/kg/tydz${iuPart2}</span>
          <span class="whr-badge">${fmt(perWeek_mg,3)} mg/tydz</span>
        </div>
      </div>
      `;
    }

    // Medicine demand calculations (unchanged except using rounded perDay/perWeek)
    function needForDays(days){
      if (!days || days<=0) return { mg:0, units:0, injections:0 };
      const unit = DRUG_UNITS[drug];
      if (!unit) return { mg:0, units:0, injections:0 };
      let totalMg = 0;
      let injections = 0;
      if (unit.weekly){
        injections = Math.ceil(days / 7);
        totalMg = perWeek_mg * injections;
      } else {
        totalMg = perDay_mg * days;
      }
      const units = Math.ceil(totalMg / unit.mgPerUnit);
      return { mg: totalMg, units, injections };
    }

    function lineFor(days){
      const res = needForDays(days);
      const unit = DRUG_UNITS[drug];
      if (unit && unit.weekly) {
        // tygodniowe preparaty (somatrogon): wyświetl liczbę wstrzykiwaczy oraz iniekcji
        return `≈ ${fmt(res.mg,1)} mg  →  wstrzykiwaczy: <strong>${res.units}</strong>; ${formatInjectionsPL(res.injections)}`;
      } else {
        // codzienne GH: zachowaj pierwotny opis ampułek i opakowań
        const packs = (/^Omnitrope/.test(drug)) ? Math.ceil(res.units / 5) : null;
        const packInfo = (packs!=null) ? `; opakowań: ${packs} (po 5 ampułek)` : '';
        return `≈ ${fmt(res.mg,1)} mg  →  ampułek: <strong>${res.units}</strong>${packInfo}`;
      }
    }

    out90.innerHTML  = lineFor(90);
    out180.innerHTML = lineFor(180);
    if (customDays && customDays>0){
      labC.textContent = String(customDays);
      outC.innerHTML = lineFor(customDays);
    } else {
      labC.textContent = '—';
      outC.textContent = '—';
    }
    // Pokaż lub ukryj wiersz „Na — dni” w zależności od tego, czy użytkownik wprowadził własną liczbę dni
    try {
      const customRowEl = document.getElementById('therCustomRow');
      if (customRowEl) {
        if (customDays && customDays>0) {
          customRowEl.style.display = 'contents';
        } else {
          customRowEl.style.display = 'none';
        }
      }
    } catch(_) { /* ignore */ }

    // === Update global state for recommendation builder ===
    try {
      // Obliczenia zapotrzebowania dla 90 i 180 dni
      const _res90  = needForDays(90);
      const _res180 = needForDays(180);
      // Zapisz najważniejsze parametry do obiektu globalnego, aby funkcje kopiowania
      // mogły łatwo je odczytać.  Dzięki temu unikamy ponownego
      // przeliczania wszystkiego w funkcji buildGhRecommendation().
      if (typeof window !== 'undefined') {
        window.ghTherapyCalc = {
          drug: drug,
          weight: w,
          perDayMg: perDay_mg,
          perWeekMg: perWeek_mg,
          mgKgDay: dailyEff,
          mgKgWeek: weeklyEff,
          units90: _res90.units,
          mgTotal90: _res90.mg,
          units180: _res180.units,
          mgTotal180: _res180.mg
        };
      }
    } catch (_){ /* ignore errors storing global */ }

    // === Show/hide recommendation buttons and adjust widths ===
    try {
      const recActions = document.getElementById('therRecommendationActions');
      const amountsContainer = document.getElementById('therAmountsContainer');
      if (recActions && amountsContainer) {
        // Pokaż przyciski dla codziennych somatotropin (GH) oraz dla somatrogonu (Ngenla).
        if (isDailySomatotropinDrug(drug) || /^Ngenla/.test(drug)) {
          recActions.style.display = 'flex';
          amountsContainer.style.flex = '1 1 50%';
        } else {
          recActions.style.display = 'none';
          amountsContainer.style.flex = '1 1 100%';
        }
      }
    } catch(_){ /* ignore */ }

    // === Aktualizuj komunikaty i etykiety przycisków w sekcji zaleceń ===
    try {
      // Wyczyść stary komunikat w kontenerze therStartAdvice (historyczny element)
      const oldAdvice = document.getElementById('therStartAdvice');
      if (oldAdvice) {
        oldAdvice.innerHTML = '';
      }
      const rec90Group = document.getElementById('rec90Group');
      const rec180Group = document.getElementById('rec180Group');
      const manualGroup = document.getElementById('manualGroup');
      const startEl90 = document.getElementById('startAdvice90');
      const startEl180 = document.getElementById('startAdvice180');
      const copyBtn90 = document.getElementById('copy90days');
      const copyBtn180 = document.getElementById('copy180days');
      const manualDateInput = document.getElementById('manualControlDate');
      const manualStartEl = document.getElementById('manualStartAdvice');
      const copyManualBtn = document.getElementById('copyManualDays');
      // Upewnij się, że istnieją elementy
      if (rec90Group && rec180Group && copyBtn90 && copyBtn180) {
        // Somatrogon (Ngenla)
        if (/^Ngenla/.test(drug)) {
          // Pokaż grupy 90/180 i manual
          rec90Group.style.display = 'flex';
          rec180Group.style.display = 'flex';
          if (manualGroup) manualGroup.style.display = 'flex';
          // Dane dla 90 dni
          const { startDate: s90, controlDate: c90 } = findSomatrogonDates(90);
          const dayName90 = dayNamePl(s90);
          const startStr90 = formatDatePl(s90);
          if (startEl90) {
            startEl90.textContent = `Rozpocznij podawanie leku w ${dayName90} (${startStr90}), aby badania kontrolne (4. doba po iniekcji) wypadły w dzień roboczy – gdy wydajemy lek na 90 dni`;
          }
          if (copyBtn90) {
            const btnDate = formatDateShort(c90);
            copyBtn90.textContent = `Wydanie leku na 90 dni, proponowana data kontroli (${btnDate}) – kliknij i skopiuj`;
          }
          // Dane dla 180 dni
          const { startDate: s180, controlDate: c180 } = findSomatrogonDates(180);
          const dayName180 = dayNamePl(s180);
          const startStr180 = formatDatePl(s180);
          if (startEl180) {
            startEl180.textContent = `Rozpocznij podawanie leku w ${dayName180} (${startStr180}), aby badania kontrolne (4. doba po iniekcji) wypadły w dzień roboczy – gdy wydajemy lek na 180 dni`;
          }
          if (copyBtn180) {
            const btnDate = formatDateShort(c180);
            copyBtn180.textContent = `Wydanie leku na 180 dni, proponowana data kontroli (${btnDate}) – kliknij i skopiuj`;
          }
          // Ukryj wiersz manualny dla innych preparatów
          const manualRow2 = document.getElementById('therManualRow');
          if (manualRow2) manualRow2.style.display = 'none';
          // Obsługa manualnej daty kontroli
          if (manualGroup && manualDateInput) {
            const manualRow = document.getElementById('therManualRow');
            const manualLabel = document.getElementById('therManualLabel');
            const manualVal = document.getElementById('therManual');
            if (manualDateInput.value) {
              try {
                const ctrlDate = parseLocalDateInput(manualDateInput.value);
                if (!ctrlDate) throw new Error('Invalid manual control date');
                // liczba dni między dziś a kontrolą
                const msPerDay = 24*60*60*1000;
                // Obetnij bieżącą datę do północy, aby uniknąć przesunięć o 1 dzień
                const todayReal = new Date();
                const today = startOfDay(todayReal);
                const diffDays = Math.round((ctrlDate - today) / msPerDay);
                const therapyDays = diffDays - 4;
                // przygotuj komunikat: użyj daty pierwszej iniekcji, a nie ostatniej
                const startManual = findFirstInjectionStartForManual(ctrlDate);
                const dayNameM = dayNamePl(startManual);
                const startStrM = formatDatePl(startManual);
                if (manualStartEl) {
                  manualStartEl.textContent = `Rozpocznij podawanie leku w ${dayNameM} (${startStrM}), aby badania kontrolne (4. doba po iniekcji) wypadły w dzień roboczy – dla ustalonej daty kontroli`;
                }
                // aktualizuj przycisk kopiowania
                if (copyManualBtn) {
                  if (therapyDays > 0) {
                    const btnDate = formatDateShort(ctrlDate);
                    copyManualBtn.style.display = 'inline-block';
                    copyManualBtn.textContent = `Wydanie leku na ${therapyDays} dni, ustalona data kontroli (${btnDate}) – kliknij i skopiuj`;
                  } else {
                    copyManualBtn.style.display = 'none';
                  }
                }
                // aktualizuj wiersz zapotrzebowania na lek dla tej daty
                if (manualRow && manualLabel && manualVal) {
                  if (therapyDays > 0) {
                    manualRow.style.display = 'contents';
                    manualLabel.textContent = String(therapyDays);
                    manualVal.innerHTML = lineFor(therapyDays);
                    // podkreśl oba pola wiersza turkusową linią
                    try {
                      Array.from(manualRow.children).forEach(cell => {
                        cell.style.borderBottom = '2px solid var(--secondary)';
                        cell.style.paddingBottom = '0.2rem';
                      });
                    } catch(_) { /* ignore */ }
                  } else {
                    manualRow.style.display = 'none';
                  }
                }
              } catch(_) {
                if (manualStartEl) manualStartEl.textContent = '';
                if (copyManualBtn) copyManualBtn.style.display = 'none';
                if (manualRow) manualRow.style.display = 'none';
              }
            } else {
              // brak ustawionej daty: ukryj komunikat, przycisk i wiersz
              if (manualStartEl) manualStartEl.textContent = '';
              if (copyManualBtn) copyManualBtn.style.display = 'none';
              if (manualRow) manualRow.style.display = 'none';
            }
          }
        } else if (isDailySomatotropinDrug(drug)) {
          // Codzienna somatotropina (GH): pokaż przyciski 90/180 oraz grupę manualną,
          // ale nie wyświetlaj komunikatów startowych jak w przypadku Ngenla. Użytkownik
          // może wybrać dowolny dzień roboczy jako datę kontroli; nie modyfikujemy tej
          // daty na najbliższy dzień roboczy ani nie sugerujemy dnia rozpoczęcia.
          if (rec90Group) rec90Group.style.display = 'flex';
          if (rec180Group) rec180Group.style.display = 'flex';
          if (manualGroup) manualGroup.style.display = 'flex';
          // Ukryj komunikaty startowe
          if (startEl90) startEl90.textContent = '';
          if (startEl180) startEl180.textContent = '';
          if (manualStartEl) manualStartEl.textContent = '';
          // Data kontroli dla 90 i 180 dni
          const c90 = findGhControlDate(90);
          const c180 = findGhControlDate(180);
          if (copyBtn90) {
            const btnDate = formatDateShort(c90);
            copyBtn90.textContent = `Wydanie leku na 90 dni, proponowana data kontroli (${btnDate}) – kliknij i skopiuj`;
          }
          if (copyBtn180) {
            const btnDate = formatDateShort(c180);
            copyBtn180.textContent = `Wydanie leku na 180 dni, proponowana data kontroli (${btnDate}) – kliknij i skopiuj`;
          }
          // Obsługa manualnej daty kontroli dla GH: oblicz liczbę dni terapii
          if (manualGroup && manualDateInput) {
            const manualRow = document.getElementById('therManualRow');
            const manualLabel = document.getElementById('therManualLabel');
            const manualVal = document.getElementById('therManual');
            if (manualDateInput.value) {
              try {
                const ctrlDate = parseLocalDateInput(manualDateInput.value);
                if (!ctrlDate) throw new Error('Invalid manual control date');
                const msPerDay = 24*60*60*1000;
                // Używamy początku dnia do obliczenia różnicy dni, aby uniknąć błędu
                // zaokrąglenia przy obecnym czasie.  Bez tego np. wybierając datę
                // kontrolną w połowie dnia można uzyskać diffDays mniejszy o 1.
                const todayReal = new Date();
                const today = startOfDay(todayReal);
                const diffDays = Math.round((ctrlDate - today) / msPerDay);
                const therapyDays = diffDays; // dla GH nie odejmujemy 4 dni
                // aktualizuj przycisk kopiowania
                if (copyManualBtn) {
                  if (therapyDays > 0) {
                    const btnDate = formatDateShort(ctrlDate);
                    copyManualBtn.style.display = 'inline-block';
                    copyManualBtn.textContent = `Wydanie leku na ${therapyDays} dni, ustalona data kontroli (${btnDate}) – kliknij i skopiuj`;
                  } else {
                    copyManualBtn.style.display = 'none';
                  }
                }
                // aktualizuj wiersz zapotrzebowania na lek dla tej daty
                if (manualRow && manualLabel && manualVal) {
                  if (therapyDays > 0) {
                    manualRow.style.display = 'contents';
                    manualLabel.textContent = String(therapyDays);
                    manualVal.innerHTML = lineFor(therapyDays);
                    // podkreśl oba pola wiersza turkusową linią
                    try {
                      Array.from(manualRow.children).forEach(cell => {
                        cell.style.borderBottom = '2px solid var(--secondary)';
                        cell.style.paddingBottom = '0.2rem';
                      });
                    } catch(_) { /* ignore */ }
                  } else {
                    manualRow.style.display = 'none';
                  }
                }
              } catch(_) {
                if (copyManualBtn) copyManualBtn.style.display = 'none';
                const manualRowEl = document.getElementById('therManualRow');
                if (manualRowEl) manualRowEl.style.display = 'none';
              }
            } else {
              // brak ustawionej daty: ukryj przycisk i wiersz
              if (copyManualBtn) copyManualBtn.style.display = 'none';
              const manualRowEl2 = document.getElementById('therManualRow');
              if (manualRowEl2) manualRowEl2.style.display = 'none';
            }
          }
        } else {
          // Inne preparaty (np. IGF‑1) – ukryj wszystko
          if (rec90Group) rec90Group.style.display = 'none';
          if (rec180Group) rec180Group.style.display = 'none';
          if (manualGroup) manualGroup.style.display = 'none';
          // Ukryj wiersz manualny dla innych preparatów
          const manualRow3 = document.getElementById('therManualRow');
          if (manualRow3) manualRow3.style.display = 'none';
        }
      }
    } catch(_) { /* ignore errors updating recommendation section */ }
  }

  function hideOldIgfSubbuttons(){
    const ids = ['snpButtonWrapper','turnerButtonWrapper','pwsButtonWrapper','sgaButtonWrapper','igf1ButtonWrapper'];
    ids.forEach(id=>{
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  /**
   * Inicjuje niestandardowy kalendarz dla pola daty kontroli. Ponieważ
   * natywny datepicker w przeglądarkach mobilnych jest bardzo mały i
   * trudny w użyciu, tworzymy własny, większy widok kalendarza. Kalendarz
   * zawiera nagłówek z przyciskami nawigacji (poprzedni/następny miesiąc),
   * listę dni tygodnia oraz siatkę dni. Po kliknięciu na dowolny dzień
   * wartość inputu zostaje ustawiona w formacie YYYY-MM-DD i wyzwalana
   * jest procedura przeliczania. Kliknięcie poza kalendarz chowa go.
   *
   * @param {HTMLInputElement} input Pole tekstowe, do którego przypisujemy datę
   * @param {HTMLElement} picker Kontener kalendarza, który będzie wypełniany
   */
  function setupCustomDatePicker(input, picker){
    if (!input || !picker) return;
    // aktualnie wyświetlany miesiąc
    let current = new Date();
    // jeśli w polu jest już ustawiona data, użyj jej jako początkowego miesiąca
    if (input.value) {
      const parsed = parseLocalDateInput(input.value);
      if (!isNaN(parsed)) current = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    } else {
      current = new Date(current.getFullYear(), current.getMonth(), 1);
    }

    const monthNames = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
    const weekdayNames = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];

    function pad(n){ return n<10 ? '0'+n : String(n); }

    function buildDayCell(day, month, year){
      const cell = document.createElement('div');
      cell.textContent = day;
      cell.style.cursor = 'pointer';
      cell.style.padding = '0.5rem';
      cell.style.textAlign = 'center';
      cell.style.fontSize = '1.1rem';
      cell.style.borderRadius = '4px';
      // Zapamiętaj domyślne tło.  Komórki weekendowe i świąteczne
      // otrzymają wartość w trakcie renderowania, dzięki czemu po
      // opuszczeniu kursora kolor zostanie przywrócony zamiast usunięty.
      cell.dataset.defaultBg = '';
      cell.addEventListener('mouseenter', () => {
        // Zmień tło tylko dla zwykłych dni roboczych.  Dla dni
        // weekendowych/świątecznych pozostaw istniejące podświetlenie.
        if (!cell.dataset.defaultBg) {
          cell.style.background = 'rgba(0,176,166,0.15)';
        }
      });
      cell.addEventListener('mouseleave', () => {
        // Przywróć domyślne tło po opuszczeniu kursora.  Jeżeli
        // defaultBg jest ustawione (weekend/święto), przywracamy je;
        // w przeciwnym razie usuwamy kolor.
        cell.style.background = cell.dataset.defaultBg || '';
      });
      cell.addEventListener('click', () => {
        const selDate = new Date(year, month, day);
        const y = selDate.getFullYear();
        const m = pad(selDate.getMonth()+1);
        const d = pad(selDate.getDate());
        input.value = `${y}-${m}-${d}`;
        // po wyborze daty zmień kolor tekstu na czarny, aby zastąpić szary
        try { input.style.color = '#000'; } catch(_) {}
        picker.style.display = 'none';
        // wyzwól zdarzenie zmiany, aby przeliczyć zalecenia
        input.dispatchEvent(new Event('change'));
      });
      return cell;
    }

    function render(date){
      // clear the existing content
      picker.innerHTML = '';
      // color definitions
      const weekendBg = 'rgba(0, 176, 166, 0.12)'; // light turquoise for weekends
      const holidayBg = 'rgba(198, 40, 40, 0.15)';  // light red for Polish holidays
      // header with navigation buttons
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.marginBottom = '0.3rem';
      const prevBtn = document.createElement('button');
      prevBtn.textContent = '<';
      prevBtn.style.border = 'none';
      prevBtn.style.background = 'none';
      prevBtn.style.cursor = 'pointer';
      prevBtn.style.fontSize = '1.2rem';
      prevBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
        render(current);
      });
      const nextBtn = document.createElement('button');
      nextBtn.textContent = '>';
      nextBtn.style.border = 'none';
      nextBtn.style.background = 'none';
      nextBtn.style.cursor = 'pointer';
      nextBtn.style.fontSize = '1.2rem';
      nextBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        render(current);
      });
      const title = document.createElement('div');
      title.textContent = monthNames[current.getMonth()] + ' ' + current.getFullYear();
      title.style.fontWeight = '600';
      title.style.fontSize = '1.1rem';
      header.appendChild(prevBtn);
      header.appendChild(title);
      header.appendChild(nextBtn);
      picker.appendChild(header);
      // weekday header row
      const weekdaysRow = document.createElement('div');
      weekdaysRow.style.display = 'grid';
      weekdaysRow.style.gridTemplateColumns = 'repeat(7, 1fr)';
      weekdaysRow.style.gap = '0.2rem';
      weekdayNames.forEach((wd, idx) => {
        const cell = document.createElement('div');
        cell.textContent = wd;
        cell.style.textAlign = 'center';
        cell.style.fontWeight = '600';
        cell.style.fontSize = '0.9rem';
        // highlight weekend column headers
        if (idx === 5 || idx === 6) {
          cell.style.background = weekendBg;
        }
        weekdaysRow.appendChild(cell);
      });
      picker.appendChild(weekdaysRow);
      // grid for days
      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
      grid.style.gap = '0.2rem';
      // determine year and month from current
      const year = current.getFullYear();
      const month = current.getMonth();
      const firstDay = new Date(year, month, 1);
      // compute offset: Monday=0, Sunday=6
      let startOffset = (firstDay.getDay() + 6) % 7;
      // fill empty cells before first day
      for (let i = 0; i < startOffset; i++) {
        const empty = document.createElement('div');
        // highlight weekend columns for empty cells
        const col = i % 7;
        if (col === 5 || col === 6) {
          empty.style.background = weekendBg;
        }
        grid.appendChild(empty);
      }
      // populate actual days
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const cell = buildDayCell(d, month, year);
        // compute column index for this day (0=Monday,...6=Sunday)
        const col = (startOffset + d - 1) % 7;
        let defaultBg = '';
        // highlight weekends by default
        if (col === 5 || col === 6) {
          cell.style.background = weekendBg;
          defaultBg = weekendBg;
        }
        // check for Polish holiday and override with red highlight
        try {
          const thisDate = new Date(year, month, d);
          if (isHoliday(thisDate)) {
            cell.style.background = holidayBg;
            defaultBg = holidayBg;
            cell.style.color = '#c62828';
            cell.style.fontWeight = '700';
          }
        } catch(_) {
          /* ignore errors */
        }
        // zapisz domyślne tło w data-*; dzięki temu obsługa hover
        // przywróci pierwotny kolor zamiast usuwać podświetlenie
        cell.dataset.defaultBg = defaultBg;
        grid.appendChild(cell);
      }
      // fill trailing empty cells to ensure a full 6-week grid (42 cells total)
      const totalCellsSoFar = startOffset + daysInMonth;
      const cellsToAdd = 42 - totalCellsSoFar;
      for (let i = 0; i < cellsToAdd; i++) {
        const empty = document.createElement('div');
        const col = (totalCellsSoFar + i) % 7;
        if (col === 5 || col === 6) {
          empty.style.background = weekendBg;
        }
        grid.appendChild(empty);
      }
      picker.appendChild(grid);

      /*
       * Ustal stałą wysokość siatki kalendarza niezależnie od liczby faktycznych
       * tygodni w miesiącu.  Normalnie liczba wierszy w siatce może wynosić
       * 4, 5 lub 6, w zależności od dnia rozpoczęcia miesiąca i liczby dni.
       * Choć wypełniamy brakujące komórki, wysokość kontenera nadal zmienia się,
       * ponieważ CSS automatycznie zmniejsza liczbę wierszy.  Aby zachować
       * stałą wysokość, obliczamy wysokość pojedynczego wiersza na podstawie
       * pierwszej komórki w siatce oraz odstępu między wierszami, a następnie
       * ustawiamy wysokość siatki na wartość odpowiadającą 6 pełnym wierszom.
       */
      try {
        // Pobierz pierwszą komórkę w siatce (może to być pusta lub z datą)
        const firstCell = grid.querySelector('div');
        if (firstCell) {
          // Wymuś obliczenie stylów, aby mieć aktualne wymiary
          const cellRect = firstCell.getBoundingClientRect();
          const gridStyles = window.getComputedStyle(grid);
          // wysokość komórki (obejmuje padding i linię tekstu)
          const cellHeight = cellRect.height;
          // odstęp między wierszami (grid-row-gap lub rowGap)
          let rowGap = 0;
          const gapStr = gridStyles.rowGap || gridStyles.gap || gridStyles.gridRowGap;
          if (gapStr) {
            // getComputedStyle zwraca wartości w px, np. "3.2px"
            const parsed = parseFloat(gapStr);
            if (!isNaN(parsed)) rowGap = parsed;
          }
          // Zawsze zakładamy 6 wierszy tygodni; odstępy występują pomiędzy wierszami (5 przerw)
          const rows = 6;
          const totalHeight = (cellHeight * rows) + (rowGap * (rows - 1));
          // Ustaw wysokość siatki na obliczoną wartość
          grid.style.height = totalHeight + 'px';
        }
      } catch(e) {
        // Jeżeli nie możemy obliczyć rozmiarów (np. w kontekście serwera),
        // pomijamy ustawienie wysokości.  Kalendarz będzie działał bez zmian.
      }
    }

    // Upewnij się, że kalendarz może być przeniesiony do dokumentu body.  Dzięki temu
    // nie będzie przycinany przez kontenery z overflow i zawsze będzie
    // wyświetlany nad innymi elementami.
    let appendedToBody = false;

    function openPickerFromInput(ev){
      if (ev && typeof ev.preventDefault === 'function' && ev.type === 'keydown') {
        ev.preventDefault();
      }
      if (ev && typeof ev.stopPropagation === 'function') {
        ev.stopPropagation();
      }
      // ustaw miesiąc zgodnie z obecną wartością pola
      if (input.value) {
        const parsed = parseLocalDateInput(input.value);
        if (parsed) current = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
      }
      // jeżeli kalendarz nie został jeszcze dodany do body, dodaj go
      if (!appendedToBody) {
        try {
          document.body.appendChild(picker);
          appendedToBody = true;
        } catch(_) {
          /* jeśli z jakiegoś powodu nie możemy przenieść kalendarza, kontynuujemy bez przenoszenia */
        }
      }
      // pokaż kalendarz, aby obliczyć jego wymiary
      picker.style.display = 'block';
      // wyrenderuj zawartość przed obliczeniami wymiarów
      render(current);
      // oblicz pozycję, aby upewnić się, że kalendarz mieści się w obrębie widocznego okna
      try {
        const inputRect = input.getBoundingClientRect();
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const pickerRect = picker.getBoundingClientRect();
        const pickerHeight = pickerRect.height;
        const pickerWidth  = pickerRect.width;
        let left = inputRect.left + scrollX;
        let top  = inputRect.bottom + scrollY + 8;
        // jeśli kalendarz nie mieści się poniżej, wyświetl powyżej pola
        if (top + pickerHeight > scrollY + viewportHeight) {
          top = inputRect.top + scrollY - pickerHeight - 8;
        }
        // jeśli nadal wychodzi poza górną krawędź, ustaw poniżej
        if (top < scrollY) {
          top = inputRect.bottom + scrollY + 8;
        }
        // jeżeli kalendarz nie mieści się po prawej stronie, przesuwamy w lewo
        if (left + pickerWidth > scrollX + viewportWidth) {
          left = inputRect.right + scrollX - pickerWidth;
        }
        // jeżeli nadal wychodzi poza lewą krawędź, ustaw minimalny margines 8px
        if (left < scrollX) {
          left = scrollX + 8;
        }
        picker.style.position = 'absolute';
        picker.style.left = left + 'px';
        picker.style.top  = top + 'px';
        picker.style.bottom = '';
        picker.style.zIndex = '20000';
      } catch(_) {
        /* jeśli nie uda się obliczyć pozycji, pozostaw domyślne wartości */
      }
    }

    // otwórz kalendarz po kliknięciu albo wejściu fokusem w pole
    input.addEventListener('click', openPickerFromInput);
    input.addEventListener('focus', () => {
      if (picker.style.display === 'block') return;
      openPickerFromInput();
    });
    input.addEventListener('keydown', (ev) => {
      const key = ev && ev.key ? ev.key : '';
      if (key === 'Enter' || key === ' ' || key === 'Spacebar' || key === 'ArrowDown') {
        openPickerFromInput(ev);
      }
    });

    // Obsługa gestów przesuwania (touch) i przewijania (wheel) do zmiany miesiąca
    // Zmienna do przechowywania początkowego położenia dotyku w osi X
    let swipeStartX = null;
    // Gest dotykowy: zarejestruj początek
    picker.addEventListener('touchstart', (ev) => {
      try {
        if (ev.touches && ev.touches.length > 0) {
          swipeStartX = ev.touches[0].clientX;
        }
      } catch(_) {
        swipeStartX = null;
      }
    });
    // Gest dotykowy: zarejestruj koniec i oblicz przesunięcie
    picker.addEventListener('touchend', (ev) => {
      try {
        if (swipeStartX !== null && ev.changedTouches && ev.changedTouches.length > 0) {
          const dx = ev.changedTouches[0].clientX - swipeStartX;
          // Jeżeli przesunięcie poziome jest znaczące, zmień miesiąc.
          // Pragniemy mniejszej czułości, dlatego zwiększamy próg z 30 px do 300 px.
          if (Math.abs(dx) > 300) {
            if (dx < 0) {
              // przesunięcie w lewo (przesuwamy w prawo) – następny miesiąc
              current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
            } else {
              // przesunięcie w prawo – poprzedni miesiąc
              current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
            }
            render(current);
          }
        }
      } catch(_) {
        /* ignore */
      } finally {
        swipeStartX = null;
      }
    });
    // Obsługa przewijania poziomego (trackpad/wheel) – zmiana miesiąca przy scrollu poziomym.
    // Na urządzeniach takich jak MacBook generowanych jest wiele zdarzeń wheel w
    // krótkim czasie (tzw. momentum scrolling), co może powodować szybkie
    // „przeskakiwanie” miesięcy.  Aby temu zapobiec, stosujemy prostą
    // detekcję momentu bezwładności: kolejne zdarzenia w tym samym kierunku,
    // o malejącej wartości deltaX i w krótkim odstępie czasu, traktujemy jako
    // bezwładność i pomijamy.  Tylko pierwszy, „intencjonalny” gest w danym
    // kierunku zmienia miesiąc, a następne są ignorowane do momentu, kiedy
    // użytkownik ponownie wykona wyraźny gest.

    // Aby ograniczyć nadmierne przewijanie, stosujemy prostą blokadę: po
    // pierwszym przełączeniu miesiąca przez gest przewijania poziomego
    // ignorujemy kolejne zdarzenia przez określony czas.  Na urządzeniach
    // z touchpadem (np. MacBook) browser generuje dziesiątki zdarzeń wheel
    // w ciągu jednego gestu, co bez blokady prowadzi do przeskakiwania kilku
    // miesięcy naraz.  Blokada zapewnia, że
    // pojedynczy swipe przenosi o dokładnie jeden miesiąc.
    let wheelBlockedUntil = 0;
    picker.addEventListener('wheel', (ev) => {
      try {
        const absDX = Math.abs(ev.deltaX);
        const absDY = Math.abs(ev.deltaY);
        // Reagujemy tylko na wyraźne przewijanie poziome (o wartości większej niż 15 px).
        if (absDX > absDY && absDX > 15) {
          const now = Date.now();
          // jeśli blokada aktywna, nie wykonuj kolejnego przewinięcia
          if (now < wheelBlockedUntil) {
            ev.preventDefault();
            return;
          }
          ev.preventDefault();
          if (ev.deltaX > 0) {
            // przewijanie w prawo – następny miesiąc
            current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
          } else {
            // przewijanie w lewo – poprzedni miesiąc
            current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
          }
          render(current);
          // zablokuj kolejne przewinięcia na 700 ms.
          // Zmieniliśmy blokadę z 1 s (1000 ms) na 0,4 s (400 ms), aby
          // kalendarz był bardziej responsywny, jednocześnie zachowując
          // ochronę przed zbyt czułym przewijaniem.
          wheelBlockedUntil = now + 400;
        }
      } catch(_) {
        /* ignore errors */
      }
    }, { passive: false });
    // zamknij kalendarz przy kliknięciu poza nim
    document.addEventListener('click', (ev) => {
      const path = ev.composedPath ? ev.composedPath() : (ev.path || []);
      if (picker.style.display === 'block') {
        if (path.indexOf && !path.includes(picker) && ev.target !== input) {
          picker.style.display = 'none';
        } else if (!path.indexOf) {
          // fallback: jeżeli nie obsługujemy composedPath, sprawdzaj manualnie
          if (!picker.contains(ev.target) && ev.target !== input) {
            picker.style.display = 'none';
          }
        }
      }
    });

    // obsługa gestów przesunięcia (swipe) do zmiany miesięcy
    let touchStartX = null;
    let touchStartY = null;
    picker.addEventListener('touchstart', (ev) => {
      try {
        if (ev.touches && ev.touches.length === 1) {
          touchStartX = ev.touches[0].clientX;
          touchStartY = ev.touches[0].clientY;
        }
      } catch(_) {
        /* ignore */
      }
    }, { passive: true });
    picker.addEventListener('touchend', (ev) => {
      try {
        if (touchStartX === null) return;
        const touchEndX = ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0].clientX : null;
        const touchEndY = ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0].clientY : null;
        if (touchEndX === null) {
          touchStartX = null;
          touchStartY = null;
          return;
        }
        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;
        // threshold: horizontal movement greater than 40px and more than vertical
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) {
            // swipe left → next month
            current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
          } else {
            // swipe right → previous month
            current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
          }
          render(current);
        }
      } catch(_) {
        /* ignore */
      } finally {
        touchStartX = null;
        touchStartY = null;
      }
    }, { passive: true });

    // fallback gesture handling for pointer events (e.g. mouse/trackpad swipes)
    let pointerStartX = null;
    let pointerStartY = null;
    let pointerActive = false;
    picker.addEventListener('pointerdown', (ev) => {
      // ignore right clicks or secondary buttons
      if (ev.button !== 0) return;
      pointerStartX = ev.clientX;
      pointerStartY = ev.clientY;
      pointerActive = true;
    }, { passive: true });
    picker.addEventListener('pointerup', (ev) => {
      if (!pointerActive) return;
      const dx = ev.clientX - pointerStartX;
      const dy = ev.clientY - pointerStartY;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) {
          current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        } else {
          current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
        }
        render(current);
      }
      pointerActive = false;
      pointerStartX = null;
      pointerStartY = null;
    }, { passive: true });
    picker.addEventListener('pointercancel', () => {
      pointerActive = false;
      pointerStartX = null;
      pointerStartY = null;
    });
  }

  function captureGhIgfPersistState(){
    const card = document.getElementById('ghIgfTherapyCard');
    if (!card) return null;
    const getValue = (id) => {
      const el = document.getElementById(id);
      if (!el) return '';
      return typeof el.value === 'string' ? el.value : String(el.value == null ? '' : el.value);
    };
    return {
      program: getValue('therProg'),
      drug: getValue('therDrug'),
      dailyDose: getValue('therDailyDose'),
      dailyDoseAbs: getValue('therDailyDoseAbs'),
      customDays: getValue('therCustomDays'),
      manualControlDate: getValue('manualControlDate')
    };
  }

  function resetGhIgfManualControlUi(){
    try {
      const manualInp = document.getElementById('manualControlDate');
      if (manualInp) {
        manualInp.value = '';
        try { manualInp.style.color = '#6b7a7a'; } catch (_) {}
      }
      const manualPicker = document.getElementById('manualDatePicker');
      if (manualPicker) {
        manualPicker.style.display = 'none';
      }
      const manualRow = document.getElementById('therManualRow');
      if (manualRow) manualRow.style.display = 'none';
      const manualLabel = document.getElementById('therManualLabel');
      if (manualLabel) manualLabel.textContent = '—';
      const manualVal = document.getElementById('therManual');
      if (manualVal) manualVal.textContent = '';
      const manualStartAdviceEl = document.getElementById('manualStartAdvice');
      if (manualStartAdviceEl) manualStartAdviceEl.textContent = '';
      const copyManualBtn = document.getElementById('copyManualDays');
      if (copyManualBtn) {
        copyManualBtn.style.display = 'none';
        copyManualBtn.textContent = 'Wydanie leku – kliknij i skopiuj';
      }
    } catch (_) {
      /* ignore reset errors */
    }
  }

  function resetGhIgfCustomDaysUi(){
    try {
      const customInp = document.getElementById('therCustomDays');
      if (customInp) customInp.value = '';
      const customRow = document.getElementById('therCustomRow');
      if (customRow) customRow.style.display = 'none';
      const customLabel = document.getElementById('therCustomLabel');
      if (customLabel) customLabel.textContent = '—';
      const customVal = document.getElementById('therCustom');
      if (customVal) customVal.textContent = '—';
    } catch (_) {
      /* ignore reset errors */
    }
  }

  function resetGhIgfPersistState(options){
    const opts = (options && typeof options === 'object') ? options : {};
    const card = document.getElementById('ghIgfTherapyCard');
    try {
      if (typeof window !== 'undefined') {
        window.ghTherapyCalc = null;
      }
    } catch (_) {}
    if (!card) return true;

    const progSel = document.getElementById('therProg');
    const doseAbsInp = document.getElementById('therDailyDoseAbs');
    if (progSel) {
      progSel.value = 'SNP';
    }
    try { populateDrugs(); } catch (_) {}
    try { applyDefaults(); } catch (_) {}

    resetGhIgfCustomDaysUi();
    resetGhIgfManualControlUi();

    if (doseAbsInp && !kg()) {
      doseAbsInp.value = '';
    }

    try {
      const warnBox = document.getElementById('therWarning');
      if (warnBox) {
        warnBox.style.display = 'none';
        warnBox.textContent = '';
      }
    } catch (_) {}

    if (opts.hideCards) {
      try {
        card.style.display = 'none';
        const toggle = document.getElementById('toggleIgfTests');
        if (toggle) toggle.classList.remove('active-toggle');
      } catch (_) {}
      try {
        const monitorCard = document.getElementById('ghTherapyMonitorCard');
        if (monitorCard) monitorCard.style.display = 'none';
        const monitorBtn = document.getElementById('toggleGhMonitor');
        if (monitorBtn) monitorBtn.classList.remove('active-toggle');
      } catch (_) {}
    }

    try { recalc(); } catch (_) {}
    return true;
  }

  function readGhIgfPersistFallback(){
    try {
      const raw = localStorage.getItem('sharedUserData');
      if (!raw) return null;
      const root = JSON.parse(raw) || {};
      const persist = root && root._vildaPersist && typeof root._vildaPersist === 'object' ? root._vildaPersist : {};
      const byId = persist.byId && typeof persist.byId === 'object' ? persist.byId : {};
      const out = {
        program: byId.therProg || '',
        drug: byId.therDrug || '',
        dailyDose: byId.therDailyDose || '',
        dailyDoseAbs: byId.therDailyDoseAbs || '',
        customDays: byId.therCustomDays || '',
        manualControlDate: byId.manualControlDate || ''
      };
      return Object.values(out).some((value) => String(value || '') !== '') ? out : null;
    } catch (_) {
      return null;
    }
  }

  function restoreGhIgfPersistState(state){
    const saved = (state && typeof state === 'object') ? state : readGhIgfPersistFallback();
    if (!saved || typeof saved !== 'object') return false;
    mountCard();
    const progSel = document.getElementById('therProg');
    const drugSel = document.getElementById('therDrug');
    const doseInp = document.getElementById('therDailyDose');
    const doseAbsInp = document.getElementById('therDailyDoseAbs');
    const customDaysInp = document.getElementById('therCustomDays');
    const manualDateInp = document.getElementById('manualControlDate');
    if (!progSel || !drugSel || !doseInp || !doseAbsInp || !customDaysInp || !manualDateInp) return false;

    const hasOption = (selectEl, value) => {
      if (!selectEl) return false;
      return Array.from(selectEl.options || []).some((opt) => String(opt.value) === String(value));
    };

    if (saved.program && hasOption(progSel, saved.program)) {
      progSel.value = saved.program;
    }
    populateDrugs();

    if (saved.drug && hasOption(drugSel, saved.drug)) {
      drugSel.value = saved.drug;
    }

    applyDefaults();

    if (String(saved.dailyDose || '') !== '') {
      doseInp.value = String(saved.dailyDose);
    }
    if (String(saved.dailyDoseAbs || '') !== '') {
      doseAbsInp.value = String(saved.dailyDoseAbs);
    }
    if (String(saved.customDays || '') !== '') {
      customDaysInp.value = String(saved.customDays);
    }
    if (String(saved.manualControlDate || '') !== '') {
      manualDateInp.value = String(saved.manualControlDate);
      try { manualDateInp.style.color = '#000'; } catch (_) {}
    } else {
      manualDateInp.value = '';
      try { manualDateInp.style.color = '#6b7a7a'; } catch (_) {}
    }

    try { recalc(); } catch (_) {}
    return true;
  }

  try {
    if (typeof window !== 'undefined') {
      window.vildaGhIgfPersistApi = {
        ensureMounted: mountCard,
        captureState: captureGhIgfPersistState,
        restoreState: restoreGhIgfPersistState,
        resetState: resetGhIgfPersistState,
        resetManualControlState: resetGhIgfManualControlUi
      };
    }
  } catch (_) {}

  document.addEventListener('DOMContentLoaded', function(){
    const igfBtn = document.getElementById('toggleIgfTests');
    if (!igfBtn) return;

    // CAPTURE phase → blokujemy stary handler z app.js, który pokazywał podprzyciski
    igfBtn.addEventListener('click', function(ev){
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      hideOldIgfSubbuttons();
      mountCard();
      // toggle: pokaż/ukryj kartę
      const card = document.getElementById('ghIgfTherapyCard');
      if (card){
        // Determine current visibility and toggle the therapy card
        const visible = (card.style.display !== 'none');
        card.style.display = visible ? 'none' : 'block';
        // Highlight the IGF button only when the therapy card is visible and Liquid Glass theme is active
        try {
          if (document.body && document.body.classList.contains('liquid-ios26')) {
            const cardVisible = card.style.display !== 'none';
            if (cardVisible) {
              igfBtn.classList.add('active-toggle');
            } else {
              igfBtn.classList.remove('active-toggle');
            }
          }
        } catch(e) {
          /* ignore */
        }
        // Regardless of the new state of the therapy card, hide the monitoring card.
        // This ensures that pressing the IGF button always collapses both the therapy
        // card and the monitoring card, as requested by the specification.
        try {
          const monitorCard = document.getElementById('ghTherapyMonitorCard');
          if (monitorCard) {
            monitorCard.style.display = 'none';
          }
          // Remove active state from the monitor toggle button so the UI reflects
          // that the monitor card is hidden.  The button is created dynamically
          // inside gh_therapy_monitor.js with id="toggleGhMonitor".
          const monitorBtn = document.getElementById('toggleGhMonitor');
          if (monitorBtn) {
            monitorBtn.classList.remove('active-toggle');
          }
        } catch(_){
          /* ignore errors when hiding the monitor card */
        }
      }
      // dopasuj szerokości głównych przycisków (jeśli funkcja istnieje)
      try{ if (typeof adjustTestButtonWidths === 'function') requestAnimationFrame(adjustTestButtonWidths); }catch(_){}
    }, true); // <-- capture

    // Gdy moduł lekarski przełącza się/zmienia się waga – próbuj odświeżać wyniki karty jeśli istnieje
    const wt = document.getElementById('weight');
    if (wt){
      ['input','change'].forEach(evt=> wt.addEventListener(evt, ()=>{
        const card = document.getElementById('ghIgfTherapyCard');
        if (!card || card.style.display === 'none') return;
        try{ recalc(); }catch(_){}
      }));
    }
  });
})();
