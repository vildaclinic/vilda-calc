







/*
 * antibiotic_therapy.js
 *
 * Ten moduł dodaje do aplikacji Vilda Clinic sekcję „Antybiotykoterapia”, która
 * umożliwia lekarzom obliczanie dobowych dawek najczęściej stosowanych
 * antybiotyków u dzieci na podstawie masy ciała oraz parametrów zaczerpniętych
 * z zaleceń „Rekomendacji postępowania w pozaszpitalnych zakażeniach układu
 * oddechowego” (Wyd. 2016). Wybór wskazania powoduje wyświetlenie listy
 * antybiotyków dopuszczonych w danej chorobie wraz z domyślną dawką
 * mg/kg/dobę, zakresem suwaka, liczbą dawek w ciągu doby oraz sugerowanym
 * czasem trwania terapii. Na podstawie masy ciała wpisanej w sekcji
 * „Dane użytkownika” program przelicza dawkę dobowa w mg i ml oraz sugeruje
 * objętość opakowania potrzebną do zakończenia kuracji.
 */

// Uproszczono strukturę skryptu poprzez usunięcie wywołania IIFE.
  // (Usunięto debugowanie ładowania skryptu)
  function logAbxError(message, error, meta) {
    try {
      const logger = window.VildaLogger || window.vildaLogger || null;
      if (logger && typeof logger.error === 'function') {
        logger.error('antibiotic-therapy', message || 'Błąd modułu antybiotykoterapii', error || null, meta || null);
      }
    } catch (loggingError) {
      if (typeof window !== 'undefined' && window.__VILDA_DEBUG && window.console && typeof window.console.warn === 'function') {
        window.console.warn('[VildaLogger][antibiotic-therapy] Nie udało się zapisać logu diagnostycznego', loggingError);
      }
    }
  }

  function logAbxWarn(message, error, meta) {
    try {
      const logger = window.VildaLogger || window.vildaLogger || null;
      if (logger && typeof logger.warn === 'function') {
        logger.warn('antibiotic-therapy', message || 'Ostrzeżenie modułu antybiotykoterapii', error || null, meta || null);
      }
    } catch (loggingError) {
      if (typeof window !== 'undefined' && window.__VILDA_DEBUG && window.console && typeof window.console.warn === 'function') {
        window.console.warn('[VildaLogger][antibiotic-therapy] Nie udało się zapisać logu diagnostycznego', loggingError);
      }
    }
  }


  function abxEscapeHtml(value) {
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

  function abxSafeUrl(value) {
    if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.safeUrl === 'function') {
      return window.VildaHtml.safeUrl(value, { fallback: '#' });
    }
    const raw = String(value == null ? '' : value).trim();
    return /^(https?:|mailto:|tel:)/i.test(raw) || raw.charAt(0) === '#' ? raw : '#';
  }


  function abxSetTrustedMarkup(element, html, context) {
    if (!element) return false;
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.setTrustedHtml === 'function') {
        return window.VildaHtml.setTrustedHtml(element, html, { context: context || 'antibiotic-therapy:controlled-markup' });
      }
      element.textContent = String(html == null ? '' : html);
      return true;
    } catch (error) {
      logAbxWarn('Nie udało się wstawić kontrolowanego HTML.', error, { context: context || '' });
      return false;
    }
  }

  function abxClearElement(element) {
    if (!element) return false;
    try {
      if (typeof window !== 'undefined' && window.VildaHtml) {
        if (typeof window.VildaHtml.clear === 'function') return window.VildaHtml.clear(element);
        if (typeof window.VildaHtml.clearHtml === 'function') return window.VildaHtml.clearHtml(element);
      }
      element.textContent = '';
      return true;
    } catch (error) {
      logAbxWarn('Nie udało się wyczyścić elementu.', error);
      return false;
    }
  }

  // Definicja leków: zawartość substancji w 5 ml oraz dostępne objętości
  // opakowań syropów. Dane te zaczerpnięto z oficjalnych serwisów
  // farmaceutycznych i kart produktów producentów (np. doz.pl).
  const DRUG_INFO = {
    // Monopreparaty: zawiesiny lub roztwory, klucze stanowią nazwy leków.
    // Amoksycylina występuje w dwóch głównych stężeniach zawiesin do stosowania
    // doustnego: 250 mg/5 ml oraz 500 mg/5 ml. Zgodnie z Charakterystyką
    // Produktu Leczniczego dla preparatu Amotaks, granulat o mocy 500 mg/5 ml
    // rekonstrukuje się do 60 ml lub 100 ml zawiesiny.
    // Standardowe stężenie 250 mg/5 ml jest dostępne w podobnych pojemnościach
    // (np. 60 ml i 100 ml) w butelkach Ospamox/Hiconcil/Amotaks. Dlatego dla
    // amoksycyliny definiujemy dwie postaci zawiesin z odpowiednimi stężeniami.
    'Amoksycylina': {
      forms: {
        // Podstawowe zawiesiny amoksycyliny: 250 mg/5 ml i 500 mg/5 ml.
        // W formularzu aplikacji etykiety mogą zawierać zwykłe spacje zamiast twardych,
        // dlatego wpisy z NBSP pojawiają się obok wariantów z normalnymi spacjami.
        'Zawiesina 250 mg/5 ml': {
          mgPer5ml: 250,
          packaging: [60, 100],
          formType: 'suspension'
        },
        'Zawiesina 500 mg/5 ml': {
          mgPer5ml: 500,
          // Po dodaniu wody do granulatu o pojemności 100 ml lub 200 ml otrzymuje się
          // odpowiednio 60 ml lub 100 ml zawiesiny.
          packaging: [60, 100],
          formType: 'suspension'
        },
        // Wprowadzenie tabletek amoksycyliny na podstawie Charakterystyki Produktu Leczniczego:
        // Amoxicillin MIP Pharma 500 mg i 1000 mg w blistrach po 8 lub 24 (500 mg) oraz 8 lub 16 (1000 mg) tabletek.
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [8, 24],
          formType: 'tablet'
        },
        'Tabletka 1000 mg': {
          mgPerTablet: 1000,
          packaging: [8, 16],
          formType: 'tablet'
        },
        // Tabletki do sporządzania zawiesiny ("Dis") umożliwiają przygotowanie doustnej zawiesiny z tabletki.
        // Ulotka preparatu Duomox podaje, że każda z mocy 250 mg, 375 mg, 500 mg, 750 mg i 1 g jest pakowana po 20 tabletek.
        'Tabletka do sporządzania zawiesiny 250 mg': {
          mgPerTablet: 250,
          packaging: [20],
          formType: 'tablet'
        },
        'Tabletka do sporządzania zawiesiny 375 mg': {
          mgPerTablet: 375,
          packaging: [20],
          formType: 'tablet'
        },
        'Tabletka do sporządzania zawiesiny 500 mg': {
          mgPerTablet: 500,
          packaging: [20],
          formType: 'tablet'
        },
        'Tabletka do sporządzania zawiesiny 750 mg': {
          mgPerTablet: 750,
          packaging: [20],
          formType: 'tablet'
        },
        'Tabletka do sporządzania zawiesiny 1 g': {
          mgPerTablet: 1000,
          packaging: [20],
          formType: 'tablet'
        }
      }
    },
    // Amoksycylina z kwasem klawulanowym występuje w kilku postaciach. Standardowa
    // zawiesina 400 mg/5 ml (z dodatkiem 57 mg kwasu klawulanowego) jest
    // dostępna w butelkach 35 ml, 70 ml, 100 ml oraz 140 ml. Wysokodawkowa
    // zawiesina ES 600 mg/5 ml (600 mg amoksycyliny + 42,9 mg kwasu
    // klawulanowego w 5 ml) jest dostępna w butelkach 50 ml i 100 ml.
    // Tabletki powlekane i do sporządzania zawiesiny (QuickTab/Co‑amoxiclav) zawierają
    // odpowiednio 500 mg + 125 mg lub 875 mg + 125 mg amoksycyliny i są sprzedawane
    // w opakowaniach po 14 lub 30 sztuk.
    'Amoksycylina z kwasem klawulanowym': {
      forms: {
        'Zawiesina 400 mg/57 mg/5 ml': {
          // Każde 5 ml standardowej zawiesiny zawiera 400 mg amoksycyliny i
          // 57 mg kwasu klawulanowego. Zgodnie z ulotką, przygotowana
          // zawiesina jest dostępna w butelkach pozwalających uzyskać 35 ml,
          // 70 ml lub 140 ml roztworu, dlatego zestaw
          // packaging zawiera tylko te objętości.
          mgPer5ml: 400,
          packaging: [35, 70, 140],
          formType: 'suspension'
        },
        'Zawiesina 600 mg/42,9 mg/5 ml (ES)': {
          mgPer5ml: 600,
          packaging: [50, 100],
          formType: 'suspension'
        },
        'Tabletka 500 mg/125 mg': {
          mgPerTablet: 500,
          packaging: [14],
          formType: 'tablet'
        },
        'Tabletka 875 mg/125 mg': {
          mgPerTablet: 875,
          packaging: [14, 30],
          formType: 'tablet'
        }
      }
    },
    // Cefuroksym występuje w dwóch zasadniczo różnych postaciach: doustny aksetyl
    // cefuroksymu (zawiesiny i tabletki) oraz dożylny cefuroksym sodowy.
    // Wcześniejsza implementacja traktowała cefuroksym jako jednoznaczny lek
    // 125 mg/5 ml. W celu rozróżnienia form wprowadzamy dwa oddzielne wpisy:
    // "Aksetyl cefuroksymu" dla postaci doustnych i "Cefuroksym (dożylnie)"
    // dla postaci dożylnych. Dzięki temu kalkulator może prawidłowo
    // dopasować sposób podania, stężenie i opakowanie w zależności od wyboru.

    'Aksetyl cefuroksymu': {
      forms: {
        // Zawiesina doustna 125 mg/5 ml i 250 mg/5 ml w butelkach 50 ml i 100 ml.
        'Zawiesina 125 mg/5 ml': {
          mgPer5ml: 125,
          packaging: [50, 100],
          formType: 'suspension'
        },
        'Zawiesina 250 mg/5 ml': {
          mgPer5ml: 250,
          packaging: [50, 100],
          formType: 'suspension'
        },
        // Tabletki aksetylu cefuroksymu są sprzedawane w blistrach po 10 sztuk.
        'Tabletka 250 mg': {
          mgPerTablet: 250,
          packaging: [10],
          formType: 'tablet'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [10],
          formType: 'tablet'
        }
      }
    },
    'Cefuroksym (dożylnie)': {
      forms: {
        // Dożylne fiolki cefuroksymu sodowego dostępne są w dawkach 250 mg,
        // 750 mg, 1000 mg i 1500 mg. W materiałach
        // producenta (Zinacef) nie określono wielkości paczek, dlatego przyjmujemy
        // że można kupić pojedyncze fiolki lub opakowania zbiorcze (np. 10 szt.).
        'Fiolka 250 mg': {
          mgPerVial: 250,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 750 mg': {
          mgPerVial: 750,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 1000 mg': {
          mgPerVial: 1000,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 1500 mg': {
          mgPerVial: 1500,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    // Klarytromycyna posiada wiele postaci farmaceutycznych. Poniższa struktura
    // definiuje je szczegółowo. Wartości mgPer5ml dotyczą zawiesin, a
    // mgPerTablet tabletek. Lista packaging zawiera pojemności butelek (w ml)
    // albo liczbę tabletek w opakowaniu. Dane o opakowaniach pochodzą z
    // Charakterystyk Produktu Leczniczego: zawiesina 125 mg/5 ml dostępna jest
    // w butelkach 60 ml i 100 ml; zawiesina
    // 250 mg/5 ml w butelkach 50 ml, 60 ml i 100 ml; tabletki
    // 250 mg sprzedawane są w opakowaniach po 10 i 14 sztuk;
    // tabletki 500 mg w opakowaniach po 14, 20 i 42 sztuki.
    'Klarytromycyna': {
      forms: {
        'Zawiesina 125 mg/5 ml': {
          mgPer5ml: 125,
          packaging: [60, 100],
          formType: 'suspension'
        },
        'Zawiesina 250 mg/5 ml': {
          mgPer5ml: 250,
          packaging: [50, 60, 100],
          formType: 'suspension'
        },
        'Tabletka 250 mg': {
          mgPerTablet: 250,
          packaging: [10, 14],
          formType: 'tablet'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [14, 20, 42],
          formType: 'tablet'
        }
      }
    },
    // Azytromycyna – dostępna w postaci proszków do sporządzania zawiesiny i tabletek.
    // Zgodnie z charakterystyką produktu leczniczego AzitroLEK, proszek 100 mg/5 ml
    // po rekonstytucji daje 20 ml zawiesiny. Dla stężenia 200 mg/5 ml
    // istnieje kilka wariantów: 600 mg (15 ml), 800 mg (20 ml), 900 mg (22,5 ml), 1200 mg (30 ml)
    // oraz 1500 mg (37,5 ml). Sumamed forte 200 mg/5 ml oferuje
    // butelki do sporządzenia 20 ml, 30 ml i 37,5 ml zawiesiny.
    // Tabletki zawierają 250 mg lub 500 mg azytromycyny; najczęściej sprzedawane
    // są w opakowaniach po 6 tabletek (250 mg) lub 3 tabletki (500 mg), co
    // odpowiada standardowym kuracjom 3‑ i 5‑dniowym.
    'Azytromycyna': {
      forms: {
        'Zawiesina 100 mg/5 ml': {
          // 5 ml zawiesiny zawiera 100 mg azytromycyny, butelka po rekonstrukcji 20 ml.
          mgPer5ml: 100,
          packaging: [20],
          formType: 'suspension'
        },
        'Zawiesina 200 mg/5 ml': {
          // 5 ml zawiesiny zawiera 200 mg azytromycyny; dostępne warianty objętości
          // po rekonstytucji to 15 ml, 20 ml, 22,5 ml, 30 ml i 37,5 ml.
          mgPer5ml: 200,
          packaging: [15, 20, 22.5, 30, 37.5],
          formType: 'suspension'
        },
        'Tabletka 250 mg': {
          mgPerTablet: 250,
          /*
            Oficjalne ulotki dla preparatów zawierających azytromycynę podają, że
            tabletki 250 mg dostępne są w przezroczystych blistrach w kilku
            wielkościach opakowań. Na przykład ulotka producenta Aurovitas
            informuje, że tabletki powlekane 250 mg pakowane są po 3, 4 albo 6
            sztuk w blistrach. W kalkulatorze
            uwzględniamy te najczęściej spotykane opakowania, aby sugerowana
            liczba opakowań była bliższa rzeczywistości.
          */
          packaging: [3, 4, 6],
          formType: 'tablet'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          /*
            Ulotki dla preparatów o mocy 500 mg (np. Azithromycin Advisors i
            Azithromycin Aurovitas) podają, że tabletki mogą być pakowane
            po 2, 3, 6 lub nawet 30 sztuk. W kalkulatorze
            przyjmujemy pakowania 2, 3 i 6 tabletek jako najczęściej spotykane
            w praktyce. Większe opakowania (30 tabl.) są rzadziej dostępne i
            mogą być stosowane w kuracjach dorosłych – nie są tu uwzględnione.
          */
          packaging: [2, 3, 6],
          formType: 'tablet'
        }
      }
    },

    // Azytromycyna (3 dni) – wariant trzydniowej kuracji wykorzystujący te
    // same postaci farmaceutyczne co standardowa azytromycyna. Definicja ta
    // umożliwia kalkulatorowi obliczanie dawkowania i sugerowanie opakowań
    // dla krótszego schematu leczenia.
    'Azytromycyna (3 dni)': {
      forms: {
        'Zawiesina 100 mg/5 ml': {
          mgPer5ml: 100,
          packaging: [20],
          formType: 'suspension'
        },
        'Zawiesina 200 mg/5 ml': {
          mgPer5ml: 200,
          packaging: [15, 20, 22.5, 30, 37.5],
          formType: 'suspension'
        },
        'Tabletka 250 mg': {
          mgPerTablet: 250,
          packaging: [3, 4, 6],
          formType: 'tablet'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [2, 3, 6],
          formType: 'tablet'
        }
      }
    },

    // Azytromycyna (3 dni) – wariant trzydniowy z normalną spacją w nazwie,
    // powielający postaci farmaceutyczne standardowej azytromycyny. Ta
    // definicja umożliwia prawidłowe wyświetlanie opcji w przeglądarce.
    'Azytromycyna (3 dni)': {
      forms: {
        'Zawiesina 100\u00a0mg/5\u00a0ml': {
          mgPer5ml: 100,
          packaging: [20],
          formType: 'suspension'
        },
        'Zawiesina 200\u00a0mg/5\u00a0ml': {
          mgPer5ml: 200,
          packaging: [15, 20, 22.5, 30, 37.5],
          formType: 'suspension'
        },
        'Tabletka 250\u00a0mg': {
          mgPerTablet: 250,
          packaging: [3, 4, 6],
          formType: 'tablet'
        },
        'Tabletka 500\u00a0mg': {
          mgPerTablet: 500,
          packaging: [2, 3, 6],
          formType: 'tablet'
        }
      }
    },

    // Azytromycyna (5 dni) – wariant pięciodniowy z normalną spacją w nazwie,
    // powielający postaci farmaceutyczne standardowej azytromycyny (zawiesiny
    // 100 mg/5 ml i 200 mg/5 ml oraz tabletki 250 mg i 500 mg). Ta definicja
    // umożliwia prawidłowe wyświetlanie opcji preparatu dla pięciodniowego
    // schematu zarówno u dzieci, jak i u dorosłych.
    'Azytromycyna (5 dni)': {
      forms: {
        'Zawiesina 100\u00a0mg/5\u00a0ml': {
          mgPer5ml: 100,
          packaging: [20],
          formType: 'suspension'
        },
        'Zawiesina 200\u00a0mg/5\u00a0ml': {
          mgPer5ml: 200,
          packaging: [15, 20, 22.5, 30, 37.5],
          formType: 'suspension'
        },
        'Tabletka 250\u00a0mg': {
          mgPerTablet: 250,
          packaging: [3, 4, 6],
          formType: 'tablet'
        },
        'Tabletka 500\u00a0mg': {
          mgPerTablet: 500,
          packaging: [2, 3, 6],
          formType: 'tablet'
        }
      }
    },

    // Azytromycyna (7 dni) – wariant siedmiodniowy przeznaczony m.in. do terapii boreliozy.
    // Powiela postaci farmaceutyczne standardowej azytromycyny: zawiesiny 100 mg/5 ml i 200 mg/5 ml
    // oraz tabletki 250 mg i 500 mg. Dzięki tej definicji selektor preparatów prawidłowo wyświetli
    // opcje dla schematu 7‑dniowego zarówno u dzieci, jak i u dorosłych.
    'Azytromycyna (7 dni)': {
      forms: {
        'Zawiesina 100\u00a0mg/5\u00a0ml': {
          mgPer5ml: 100,
          packaging: [20],
          formType: 'suspension'
        },
        'Zawiesina 200\u00a0mg/5\u00a0ml': {
          mgPer5ml: 200,
          packaging: [15, 20, 22.5, 30, 37.5],
          formType: 'suspension'
        },
        'Tabletka 250\u00a0mg': {
          mgPerTablet: 250,
          packaging: [3, 4, 6],
          formType: 'tablet'
        },
        'Tabletka 500\u00a0mg': {
          mgPerTablet: 500,
          packaging: [2, 3, 6],
          formType: 'tablet'
        }
      }
    },

    /*
     * Usunięto wariant jednodniowy azytromycyny („Azytromycyna (1 dzień)”),
     * ponieważ aktualne wytyczne nie rekomendują podawania 2 g jako jednorazowej dawki.
     * Wszystkie definicje postaci dla tego wariantu zostały usunięte, aby uniknąć
     * przypadkowego wyświetlania tej opcji w kalkulatorze.  Pacjenci powinni
     * otrzymywać trzy‑ lub pięciodniowy schemat leczenia w zależności od wskazania.
     */
    // Ampicylina stosowana jest głównie dożylnie w ciężkich postaciach
    // pozaszpitalnego zapalenia płuc. W Polsce dostępne są fiolki 500 mg i 1 g
    // (informacje z ogólnodostępnych opisów produktów). Przyjmujemy opakowania
    // zawierające pojedyncze fiolki lub po 10 sztuk.
    'Ampicylina': {
      forms: {
        'Fiolka 500 mg': {
          mgPerVial: 500,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 1000 mg': {
          mgPerVial: 1000,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    // Cefotaksym – dostępny w fiolkach 1 g i 2 g; ulotka HPRA wskazuje
    // opakowania zawierające 1, 10, 25 lub 50 fiolki.
    'Cefotaksym': {
      forms: {
        // Zgodnie z polską Charakterystyką Produktu Leczniczego Biotaksym
        // (cefuroksym sodowy, Polpharma) fiolka o pojemności 26 ml zawiera 1 g
        // lub 2 g cefotaksymu i opakowanie może zawierać 1 lub 10 fiolek.
        'Fiolka 1000 mg': {
          mgPerVial: 1000,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 2000 mg': {
          mgPerVial: 2000,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    // Ceftriakson – ulotka Wockhardt wymienia opakowania 1, 5, 10, 25 lub 50
    // fiolek 1 g oraz 1 lub 10 fiolek 2 g.
    'Ceftriakson': {
      forms: {
        // Charakterystyka produktu leczniczego Ceftriaxon Kabi 1 g (Fresenius Kabi)
        // podaje, że wielkości opakowań to 5 i 10 fiolek.
        'Fiolka 1000 mg': {
          mgPerVial: 1000,
          packaging: [5, 10],
          formType: 'vial'
        },
        // Zakładamy, że fiolki 2 g mają takie same warianty opakowań (5 lub 10 szt.).
        'Fiolka 2000 mg': {
          mgPerVial: 2000,
          packaging: [5, 10],
          formType: 'vial'
        }
      }
    },
    // Kloksacylina – dożylne fiolki 500 mg i 1 g. Oficjalna charakterystyka
    // produktu leczniczego wskazuje, że są pakowane w pudełka po 1, 10, 25, 50
    // lub 100 fiolek.
    // Fenoksymetylpenicylina (penicylina V) – lek pierwszego wyboru w
    // paciorkowcowym zapaleniu gardła i migdałków. Dostępna w postaci
    // zawiesin i tabletek. Jedna dawka 5 ml zawiesiny Ospen 750 zawiera
    // 750 000 j.m. (jednostek międzynarodowych) fenoksymetylpenicyliny.
    // Granulat Polcylin 100 mg/ml po odtworzeniu daje stężenie 100 mg/ml
    // (500 mg w 5 ml), dostępny w butelkach 60 ml i 125 ml.
    // Tabletki powlekane Ospen zawierają 1 000 000 j.m. lub 1 500 000 j.m.
    // fenoksymetylpenicyliny i są pakowane po 30 sztuk.
    'Fenoksymetylpenicylina': {
      forms: {
        /*
         * Ospen 750 000 j.m./5 ml – zawiesina o stężeniu 750 000 jednostek
         * fenoksymetylpenicyliny w 5 ml. Zgodnie z przelicznikiem 1 000 000 j.m.
         * odpowiada ok. 654 mg fenoksymetylpenicyliny, więc 750 000 j.m. daje
         * 0,75 × 654 mg ≈ 490 mg w 5 ml. W kalkulatorze używamy wartości 490 mg
         * jako mgPer5ml. Preparat dostępny w butelkach 150 ml.
         */
        'Zawiesina 750 000 j.m./5 ml': {
          // Ospen 750 zawiera 750 000 j.m. w 5 ml; odpowiada to ok. 490 mg.
          mgPer5ml: 490,
          // Liczba jednostek międzynarodowych na 5 ml (do użytku przy przeliczaniu).
          unitsPer5ml: 750000,
          // Ulotka Ospen 750 wskazuje, że gotowa zawiesina jest dostępna w butelkach 60 ml
          // lub 150 ml.
          packaging: [60, 150],
          formType: 'suspension'
        },
        // Polcylin 100 mg/ml to granulat do sporządzania zawiesiny; w 5 ml
        // zawiera 500 mg fenoksymetylpenicyliny. Dostępne butelki 60 ml i 125 ml.
        'Granulat 100 mg/ml (5 ml = 500 mg)': {
          mgPer5ml: 500,
          packaging: [60, 125],
          formType: 'suspension'
        },
        /*
         * Tabletki Ospen 1 000 000 j.m. zawierają w jednej tabletce ok. 654 mg
         * fenoksymetylpenicyliny potasowej (1 000 000 j.m. × 0,654 mg/j.m.).
         * Tabletki Ospen 1 500 000 j.m. zawierają ok. 981 mg substancji
         * czynnej (1,5 mln j.m. × 0,654 mg/j.m.). Oba warianty pakowane są
         * zazwyczaj po 30 tabletek.
         */
        'Tabletka 1 000 000 j.m.': {
          // Jedna tabletka zawiera 1 000 000 j.m. fenoksymetylpenicyliny, co odpowiada ok. 654 mg.
          mgPerTablet: 654,
          unitsPerTablet: 1000000,
          packaging: [30],
          formType: 'tablet'
        },
        'Tabletka 1 500 000 j.m.': {
          // Jedna tabletka zawiera 1 500 000 j.m. (≈ 981 mg).
          mgPerTablet: 981,
          unitsPerTablet: 1500000,
          packaging: [30],
          formType: 'tablet'
        }
      }
    },
    /*
     * Cefadroksyl – antybiotyk doustny stosowany w leczeniu skorygowanym
     * paciorkowcowego zapalenia gardła i migdałków oraz w nawrotach. W Polsce
     * dostępne są zawiesiny 250 mg/5 ml (Valdocef) w butelkach 100 ml.
     * Dostępne są również tabletki 500 mg i 1 000 mg; zakładamy opakowania po 10 tabletek.
     */
    'Cefadroksyl': {
      forms: {
        'Zawiesina 250 mg/5 ml': {
          mgPer5ml: 250,
          packaging: [100],
          formType: 'suspension'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [10],
          formType: 'tablet'
        },
        'Tabletka 1 000 mg': {
          mgPerTablet: 1000,
          packaging: [10],
          formType: 'tablet'
        }
      }
    },
    /*
     * Cefaleksyna – dostępna w postaci zawiesiny 125 mg/5 ml i 250 mg/5 ml,
     * każda w butelkach 100 ml. Dostępne są również
     * kapsułki 250 mg i 500 mg pakowane w blistry po 16 kapsułek.
     */
    'Cefaleksyna': {
      forms: {
        'Zawiesina 125 mg/5 ml': {
          mgPer5ml: 125,
          packaging: [100],
          formType: 'suspension'
        },
        'Zawiesina 250 mg/5 ml': {
          mgPer5ml: 250,
          packaging: [100],
          formType: 'suspension'
        },
        'Kapsułka 250 mg': {
          mgPerTablet: 250,
          packaging: [16],
          formType: 'tablet'
        },
        'Kapsułka 500 mg': {
          mgPerTablet: 500,
          packaging: [16],
          formType: 'tablet'
        }
      }
    },

    /*
     * Cefaklor – cefalosporyna II generacji stosowana m.in. w paciorkowcowym
     * zapaleniu gardła jako lek drugiego rzutu. W Polsce dostępne są
     * zawiesiny 125 mg/5 ml i 250 mg/5 ml, a także tabletki 250 mg,
     * o przedłużonym uwalnianiu 375 mg (MR) i 500 mg.  
     * Zgodnie z ChPL standardowe opakowania zawiesin mają pojemność 100 ml,
     * a tabletki pakowane są po 10–16 sztuk. Zestaw packaging odzwierciedla
     * najczęściej spotykane wielkości.
     */
    'Cefaklor': {
      forms: {
        'Zawiesina 125 mg/5 ml': {
          mgPer5ml: 125,
          packaging: [100],
          formType: 'suspension'
        },
        'Zawiesina 250 mg/5 ml': {
          mgPer5ml: 250,
          packaging: [100],
          formType: 'suspension'
        },
        'Tabletka 250 mg': {
          mgPerTablet: 250,
          packaging: [16],
          formType: 'tablet'
        },
        'Tabletka 375 mg (MR)': {
          mgPerTablet: 375,
          packaging: [10],
          formType: 'tablet'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [10],
          formType: 'tablet'
        }
      }
    },
    /*
     * Klindamycyna – linkozamid stosowany w leczeniu nawrotowego paciorkowcowego
     * zapalenia gardła i migdałków. Preparat Dalacin C w postaci granulek do
     * sporządzania zawiesiny po rekonstytucji zawiera 75 mg klindamycyny w 5 ml
     * oraz 80 ml gotowego roztworu. Kapsułki 150 mg
     * są pakowane po 12, 16 lub 100 sztuk, natomiast kapsułki 300 mg po 16 sztuk.
     */
    'Klindamycyna': {
      forms: {
        // W Polsce nie jest dostępny preparat klindamycyny w postaci granulatu do sporządzania
        // zawiesiny.  Usuwamy zatem formę "Granulat 75 mg/5 ml" i pozostawiamy tylko
        // kapsułki 150 mg i 300 mg, które można w razie potrzeby rozkruszyć dla dzieci.
        // Kapsułki 150 mg pakowane są po 12, 16 lub 100 sztuk.
        'Kapsułka 150 mg': {
          mgPerTablet: 150,
          packaging: [12, 16, 100],
          formType: 'tablet'
        },
        // Kapsułki 300 mg pakowane są po 16 sztuk.
        'Kapsułka 300 mg': {
          mgPerTablet: 300,
          packaging: [16],
          formType: 'tablet'
        }
      }
    },
    'Kloksacylina': {
      forms: {
        'Fiolka 500 mg': {
          mgPerVial: 500,
          packaging: [1, 10, 25, 50, 100],
          formType: 'vial'
        },
        'Fiolka 1000 mg': {
          mgPerVial: 1000,
          packaging: [1, 10, 25, 50, 100],
          formType: 'vial'
        }
      }
    }
    ,
    /*
     * Furazydyna – pochodna nitrofurantoiny stosowana głównie w leczeniu
     * niepowikłanych zakażeń dolnych dróg moczowych. Preparaty dostępne w Polsce
     * zawierają 50 mg furazydyny (np. Furaginum, Urofuraginum) lub 100 mg w wersji
     * forte. Tabletki sprzedawane są zazwyczaj w opakowaniach po 30 lub 60 sztuk.
     */
    'Furazydyna': {
      forms: {
        'Tabletka 50 mg': {
          mgPerTablet: 50,
          packaging: [30, 60],
          formType: 'tablet'
        },
        'Tabletka 100 mg': {
          mgPerTablet: 100,
          packaging: [30],
          formType: 'tablet'
        },
        // Zawiesina furazydyny w dawce 10 mg/ml (50 mg w 5 ml).
        // Według ChPL Dafurag zawiesina doustna, 10 mg/ml, zawiera 10 mg furazydyny w 1 ml;
        // 5 ml zawiesiny odpowiada 50 mg furazydyny. Butelka zawiera 140 ml przygotowanego roztworu.
        'Zawiesina 50 mg/5 ml': {
          mgPer5ml: 50,
          packaging: [140],
          formType: 'suspension'
        }
      }
    },
    /*
     * Trimetoprim – antybiotyk hamujący reduktazę dihydrofolianową, stosowany w
     * niepowikłanych zakażeniach dróg moczowych oraz w profilaktyce nawrotów.
     * Dostępny jest w tabletkach 100 mg i 200 mg (np. Trimesan, Urotrim) oraz
     * zawiesinie 100 mg/5 ml dla dzieci. Zawiesina sprzedawana jest w butelkach
     * 100 ml.
     */
    'Trimetoprim': {
      forms: {
        'Tabletka 100 mg': {
          mgPerTablet: 100,
          packaging: [20, 30],
          formType: 'tablet'
        },
        'Tabletka 200 mg': {
          mgPerTablet: 200,
          packaging: [20],
          formType: 'tablet'
        },
        'Zawiesina 100 mg/5 ml': {
          mgPer5ml: 100,
          packaging: [100],
          formType: 'suspension'
        }
      }
    },
    /*
     * Trimetoprim-sulfametoksazol (kotrimoksazol) – lek złożony zawierający
     * 160 mg trimetoprimu i 800 mg sulfametoksazolu w jednej tabletce (łącznie 960 mg
     * substancji czynnej). Zawiesina 240 mg/5 ml zawiera 40 mg trimetoprimu i
     * 200 mg sulfametoksazolu w 5 ml (240 mg łącznie). Preparaty są pakowane w
     * butelki 100 ml (zawiesina) lub blistry po 10–20 tabletek (tabletki 960 mg).
     */
    'Trimetoprim-sulfametoksazol': {
      forms: {
        'Zawiesina 240 mg/5 ml': {
          mgPer5ml: 240,
          packaging: [100],
          formType: 'suspension'
        },
        // Tabletki 80 mg/400 mg (Biseptol 480). Jedna tabletka zawiera 80 mg
        // trimetoprimu i 400 mg sulfametoksazolu (480 mg łącznie). Zwykle
        // dostępne w opakowaniach po 20 sztuk. Dawkowanie u dzieci 6–12 lat
        // wynosi przeciętnie 480 mg kotrimoksazolu co 12 h.
        'Tabletka 80 mg/400 mg': {
          mgPerTablet: 480,
          packaging: [20],
          formType: 'tablet'
        },
        'Tabletka 160 mg/800 mg': {
          mgPerTablet: 960,
          packaging: [10, 20],
          formType: 'tablet'
        }
      }
    },
    /*
     * Fosfomycyna trometamol – antybiotyk stosowany w jednorazowej dawce w
     * niepowikłanych zakażeniach dróg moczowych. Saszetka zawiera 3 g
     * fosfomycyny. Dla uproszczenia traktujemy saszetkę jak tabletkę o masie
     * 3000 mg, ponieważ kalkulator dawkuje w mg/kg/dobę. Opakowania zawierają
     * jedną saszetkę.
     */
    'Fosfomycyna': {
      forms: {
        'Saszetka 3 g': {
          mgPerTablet: 3000,
          packaging: [1],
          formType: 'tablet'
        }
      }
    },
    /*
     * Cefiksym (cefixime) – doustna cefalosporyna III generacji stosowana w
     * zakażeniach układu moczowego. Dostępna jest jako zawiesina 100 mg/5 ml
     * (butelki 50 ml i 100 ml) oraz tabletki 400 mg. Wiele preparatów
     * (np. Suprax) sprzedawanych jest w opakowaniach po 10 kapsułek.
     */
    'Cefiksym': {
      forms: {
        'Zawiesina 100 mg/5 ml': {
          mgPer5ml: 100,
          packaging: [50, 100],
          formType: 'suspension'
        },
        // Ulotka Cetix przewiduje wyłącznie zawiesinę 100 mg/5 ml; stężenie 200 mg/5 ml nie jest
        // dostępne w Polsce, dlatego usuwa się tę formę z definicji preparatów.
        'Tabletka 400 mg': {
          mgPerTablet: 400,
          packaging: [10],
          formType: 'tablet'
        }
      }
    },
    /*
     * Ceftibuten – doustna cefalosporyna III generacji. W Polsce dostępna jest
     * zawiesina o stężeniu 180 mg/5 ml (powstała z proszku 36 mg/ml) oraz
     * kapsułki 400 mg (Cedax). Zawiesina jest sprzedawana w butelkach 60 ml
     * lub 100 ml; kapsułki w opakowaniach po 10 sztuk.
     */
    'Ceftibuten': {
      forms: {
        // Zawiesina 90 mg/5 ml (18 mg/ml) – opcja dla najmłodszych dzieci, która
        // ułatwia precyzyjne odmierzanie mniejszych dawek. Ulotka CEDAX
        // wspomina o butelkach 60 ml, 90 ml i 120 ml.
        'Zawiesina 90 mg/5 ml': {
          mgPer5ml: 90,
          packaging: [60, 90, 120],
          formType: 'suspension'
        },
        'Zawiesina 180 mg/5 ml': {
          mgPer5ml: 180,
          packaging: [60, 100],
          formType: 'suspension'
        },
        'Kapsułka 400 mg': {
          mgPerTablet: 400,
          packaging: [10],
          formType: 'tablet'
        }
      }
    },
    /*
     * Cyprofloksacyna – fluorochinolon stosowany w leczeniu zakażeń układu
     * moczowego, zwłaszcza odmiedniczkowego zapalenia nerek oraz powikłanych
     * zakażeń dróg moczowych. Dostępna w tabletkach 250 mg i 500 mg oraz w
     * roztworach do infuzji (200 mg/100 ml lub 400 mg/200 ml). Preparaty
     * tabletek najczęściej pakowane są po 10–20 sztuk.
     */
    'Cyprofloksacyna': {
      forms: {
        'Tabletka 250 mg': {
          mgPerTablet: 250,
          packaging: [10, 20],
          formType: 'tablet'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [10, 20],
          formType: 'tablet'
        },
        'Roztwór 200 mg/100 ml': {
          mgPerVial: 200,
          packaging: [1],
          formType: 'vial'
        },
        'Roztwór 400 mg/200 ml': {
          mgPerVial: 400,
          packaging: [1],
          formType: 'vial'
        }
      }
    },

    /*
     * Cyprofloksacyna (doustna) – wariant oddzielający postać doustną od
     * dożylnej na potrzeby wskazania „powikłane i inne zakażenia układu
     * moczowego”.  Dzięki temu użytkownik zobaczy w selektorze dwie
     * oddzielne opcje i zostaną zaproponowane właściwe postacie
     * preparatu (tabletki).  Nazwa zawiera określenie „doustna”, dlatego
     * funkcja tworząca etykiety nie będzie dodawać sufiksu „i.v.”.
     */
    'Cyprofloksacyna (doustna)': {
      forms: {
        'Tabletka 250 mg': {
          mgPerTablet: 250,
          packaging: [10, 20],
          formType: 'tablet'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [10, 20],
          formType: 'tablet'
        }
      }
    },

    /*
     * Cyprofloksacyna (dożylna) – wariant oddzielający postać dożylnego
     * roztworu cyprofloksacyny.  Nazwa zawiera „dożylna”, aby uniknąć
     * podwójnego dodawania sufiksu „i.v.” przez selektor leków.  W tym
     * wariancie dostępne są wyłącznie roztwory do infuzji.
     */
    'Cyprofloksacyna (dożylna)': {
      forms: {
        'Roztwór 200 mg/100 ml': {
          mgPerVial: 200,
          packaging: [1],
          formType: 'vial'
        },
        'Roztwór 400 mg/200 ml': {
          mgPerVial: 400,
          packaging: [1],
          formType: 'vial'
        }
      }
    },
    /*
     * Lewofloksacyna – fluorochinolon o szerokim spektrum aktywności, stosowany
     * w powikłanych zakażeniach dróg moczowych i odmiedniczkowym zapaleniu
     * nerek. Tabletki 500 mg są najczęściej sprzedawane w opakowaniach po 10
     * lub 20 sztuk; roztwór do infuzji zawiera 500 mg leku w 100 ml.
     */
    'Lewofloksacyna': {
      forms: {
        // pozostawiamy tylko postać doustną; roztwór przeniesiono do Lewofloksacyna i.v.
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [10, 20],
          formType: 'tablet'
        }
      }
    },
    // Dodajemy oddzielny wpis dla dożylnej postaci lewofloksacyny,
    // aby selektor antybiotyków rozróżniał wariant doustny i i.v.
    'Lewofloksacyna i.v.': {
      forms: {
        'Roztwór 500 mg/100 ml': {
          mgPerVial: 500,
          packaging: [1],
          formType: 'vial'
        }
      }
    },
    /*
     * Doksycyklina – tetracyklina stosowana doustnie w zakażeniach dróg oddechowych.
     * Preparaty w Polsce najczęściej zawierają 100 mg doksycykliny w kapsułce lub tabletce.
     * Standardowe opakowania zawierają 10 lub 20 sztuk.
     */
    'Doksycyklina': {
      forms: {
        'Tabletka 100 mg': {
          mgPerTablet: 100,
          packaging: [10, 20],
          formType: 'tablet'
        }
      }
    },
    /*
     * Cefpodoksym – doustna cefalosporyna III generacji. Tabletki powlekane zawierają
     * zwykle 100 mg lub 200 mg substancji czynnej; w terapii pozaszpitalnego zapalenia płuc
     * stosuje się 200 mg dwa razy na dobę. Przyjmujemy opakowania
     * po 10 lub 14 tabletek.
     */
    'Cefpodoksym': {
      forms: {
        'Tabletka 200 mg': {
          mgPerTablet: 200,
          packaging: [10, 14],
          formType: 'tablet'
        }
      }
    },
    /*
     * Moksyfloksacyna – fluorochinolon oddechowy stosowany w cięższych zakażeniach.
     * Tabletki zawierają 400 mg substancji czynnej; na rynku dostępne są opakowania po
     * 5 lub 10 tabletek.
     */
    'Moksyfloksacyna': {
      forms: {
        'Tabletka 400 mg': {
          mgPerTablet: 400,
          packaging: [5, 10],
          formType: 'tablet'
        }
      }
    },
    /*
     * Gentamycyna – aminoglikozyd stosowany pozajelitowo w ciężkich zakażeniach
     * układu moczowego. Ampułki zawierają 40 mg w 1 ml lub 80 mg w 2 ml.
     * Standardowe opakowania zawierają pojedyncze ampułki lub zestawy po 10 sztuk.
     */
    'Gentamycyna': {
      forms: {
        'Ampułka 40 mg/1 ml': {
          mgPerVial: 40,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Ampułka 80 mg/2 ml': {
          mgPerVial: 80,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Amikacyna – aminoglikozyd o szerokim spektrum działania. Stosowana
     * pozajelitowo w powikłanych zakażeniach układu moczowego i urosepsie.
     * Ampułki zawierają 100 mg lub 500 mg substancji w 2 ml roztworu, w
     * opakowaniach jednostkowych lub zbiorczych (10 szt.).
     */
    'Amikacyna': {
      forms: {
        'Ampułka 100 mg/2 ml': {
          mgPerVial: 100,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Ampułka 500 mg/2 ml': {
          mgPerVial: 500,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Cefepim – cefalosporyna IV generacji stosowana w ciężkich zakażeniach,
     * w tym powikłanych zakażeniach układu moczowego. Dostępna w fiolkach
     * 1 g i 2 g. Przyjmujemy opakowania pojedyncze lub po 10 sztuk.
     */
    'Cefepim': {
      forms: {
        'Fiolka 1 g': {
          mgPerVial: 1000,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 2 g': {
          mgPerVial: 2000,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Piperacylina z tazobaktamem – połączenie penicyliny o szerokim spektrum
     * z inhibitorem beta‑laktamaz, stosowane w ciężkich powikłanych
     * zakażeniach układu moczowego i urosepsie. Fiolka 4,5 g (4 g
     * piperacyliny + 0,5 g tazobaktamu) stanowi podstawową jednostkę. Opakowania
     * zawierają zazwyczaj 1 lub 10 fiolek.
     */
    'Piperacylina z tazobaktamem': {
      forms: {
        'Fiolka 4,5 g': {
          mgPerVial: 4500,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Imipenem z cilastatyną – karbapenem podawany dożylnie w ciężkich
     * zakażeniach układu moczowego. Fiolka zawiera 500 mg imipenemu
     * (zawierającego w równych częściach imipenem i cilastatynę). Opakowania
     * zawierają pojedyncze fiolki lub zestawy po 10 sztuk.
     */
    'Imipenem z cilastatyną': {
      forms: {
        'Fiolka 500 mg': {
          mgPerVial: 500,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Meropenem – karbapenem stosowany w najcięższych zakażeniach i u pacjentów
     * z urosepsą. Dostępny w fiolkach 500 mg i 1 g. Przyjmujemy opakowania
     * pojedyncze lub po 10 sztuk.
     */
    'Meropenem': {
      forms: {
        'Fiolka 500 mg': {
          mgPerVial: 500,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 1 g': {
          mgPerVial: 1000,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Doripenem – karbapenem o wąskim zastosowaniu, stosowany w ciężkich
     * infekcjach szpitalnych, w tym powikłanych zakażeniach układu moczowego.
     * W Polsce dostępna jest fiolka 500 mg (Doripax). Przyjmujemy opakowania
     * pojedyncze lub po 10 sztuk.
     */
    'Doripenem': {
      forms: {
        'Fiolka 500 mg': {
          mgPerVial: 500,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    }
    ,
    /*
     * Cefazolina – cefalosporyna I generacji stosowana w leczeniu zakażeń skóry i tkanki podskórnej.
     * Dostępna w fiolkach 1 g i 2 g do podania dożylnego; w Polsce marką handlową jest Biofazolin.
     */
    'Cefazolina': {
      forms: {
        'Fiolka 1 g': {
          mgPerVial: 1000,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 2 g': {
          mgPerVial: 2000,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Benzylopenicylina (penicylina G) – antybiotyk beta-laktamowy stosowany dożylnie w ciężkich zakażeniach paciorkowcowych.
     * W praktyce pediatrycznej dawki przelicza się w jednostkach; przyjmujemy fiolkę 1 000 000 j.m. (~600 mg) i 5 000 000 j.m. (~3 g).
     */
    'Benzylopenicylina': {
      forms: {
        'Fiolka 1 000 000 j.m.': {
          mgPerVial: 600,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 5 000 000 j.m.': {
          mgPerVial: 3000,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Metronidazol – lek przeciwbakteryjny i przeciwpasożytniczy stosowany w zakażeniach beztlenowych oraz w ropniach.
     * Dostępny w tabletkach 250 mg i 500 mg oraz w roztworach do infuzji 500 mg/100 ml.
     */
    'Metronidazol': {
      forms: {
        'Tabletka 250 mg': {
          mgPerTablet: 250,
          packaging: [20, 30],
          formType: 'tablet'
        },
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [20, 30],
          formType: 'tablet'
        },
        'Roztwór 500 mg/100 ml': {
          mgPerVial: 500,
          packaging: [1],
          formType: 'vial'
        }
      }
    },
    /*
     * Wankomycyna – glikopeptyd stosowany w leczeniu ciężkich zakażeń skóry wywołanych przez MRSA.
     * Dostępna w fiolkach 500 mg i 1 g.
     */
    'Wankomycyna': {
      forms: {
        'Fiolka 500 mg': {
          mgPerVial: 500,
          packaging: [1, 10],
          formType: 'vial'
        },
        'Fiolka 1 g': {
          mgPerVial: 1000,
          packaging: [1, 10],
          formType: 'vial'
        }
      }
    },
    /*
     * Linezolid – oksazolidynon skuteczny przeciw MRSA i VRE, stosowany doustnie i dożylnie.
     * Dostępny w tabletkach 600 mg oraz zawiesinie do podania doustnego 100 mg/5 ml.
     */
    'Linezolid': {
      forms: {
        'Tabletka 600 mg': {
          mgPerTablet: 600,
          packaging: [10, 20],
          formType: 'tablet'
        },
        'Zawiesina 100 mg/5 ml': {
          mgPer5ml: 100,
          packaging: [150],
          formType: 'suspension'
        }
      }
    }
  };

  /**
   * Lista przykładowych nazw handlowych dla poszczególnych leków i ich postaci.
   * Pozwala to użytkownikowi szybko wybrać konkretne preparaty po obliczeniu
   * dawki. Nazwy te pochodzą z oficjalnych stron producentów, rejestrów
   * leków lub są powszechnie używanymi nazwami handlowymi w Polsce. W razie
   * potrzeby zestaw można rozszerzyć, zachowując strukturę: nazwa leku →
   * nazwa postaci → tablica nazw handlowych.
   */
  const BRAND_NAMES = {
    'Fenoksymetylpenicylina': {
      'Zawiesina 750 000 j.m./5 ml': ['Ospen 750'],
      // Uwaga: w formularzu granulat fenoksymetylpenicyliny opisany jest jako "Granulat 100 mg/ml (5 ml = 500 mg)".
      // Dlatego klucz w mapie musi dokładnie odpowiadać tej etykiecie, aby brandy mogły zostać znalezione.
      'Granulat 100 mg/ml (5 ml = 500 mg)': ['Polcylin 100 mg/ml'],
      'Tabletka 1 000 000 j.m.': ['Ospen 1000'],
      'Tabletka 1 500 000 j.m.': ['Ospen 1500']
    },
    'Amoksycylina': {
      // Zawiesina 250 mg/5 ml – brandy: Amotaks, Ospamox, Hiconcil. Dodajemy też wpisy z normalnymi spacjami,
      // aby obsłużyć etykiety formularza z łańcuchem "mg/5 ml".
      'Zawiesina 250 mg/5 ml': ['Amotaks', 'Ospamox', 'Hiconcil'],
      'Zawiesina 250 mg/5 ml': ['Amotaks', 'Ospamox', 'Hiconcil'],
      // Zawiesina 500 mg/5 ml: na rynku dostępne są Amotaks i Ospamox – warianty "Forte" i Hiconcil 500 mg/5 ml nie istnieją.
      'Zawiesina 500 mg/5 ml': ['Amotaks', 'Ospamox'],
      'Zawiesina 500 mg/5 ml': ['Amotaks', 'Ospamox'],
      // Tabletki (monopreparaty amoksycyliny) – na podstawie CHPL Amoxicillin MIP Pharma.
      'Tabletka 500 mg': ['Amoxicillin MIP', 'Ospamox', 'Hiconcil', 'Amotaks'],
      // Tabletka 1000 mg: dostępne są Amoxicillin MIP Pharma, Ospamox 1000 mg i Amotaks 1 g. Hiconcil 1 g nie jest dostępny.
      'Tabletka 1000 mg': ['Amoxicillin MIP', 'Ospamox 1 g', 'Amotaks 1 g'],
      // Tabletki do sporządzania zawiesiny ("Dis") – o różnych mocach; popularne brandy to Duomox oraz warianty Amotaks Dis/Ospamox Dis.
      'Tabletka do sporządzania zawiesiny 250 mg': ['Duomox 250'],
      'Tabletka do sporządzania zawiesiny 375 mg': ['Duomox 375'],
      // Tabletki do sporządzania zawiesiny 500 mg: Ospamox Dis w tej formie nie jest dostępny – usuwamy go.
      'Tabletka do sporządzania zawiesiny 500 mg': ['Duomox 500', 'Amotaks Dis'],
      'Tabletka do sporządzania zawiesiny 750 mg': ['Duomox 750', 'Amotaks Dis 750'],
      'Tabletka do sporządzania zawiesiny 1 g': ['Duomox 1000', 'Amotaks Dis 1000']
    },
    'Amoksycylina z kwasem klawulanowym': {
      'Zawiesina 400 mg/57 mg/5 ml': ['Amoksiklav', 'Augmentin', 'Taromentin'],
      'Zawiesina 600 mg/42,9 mg/5 ml (ES)': ['Amoksiklav ES', 'Augmentin ES'],
      'Tabletka 500 mg/125 mg': ['Amoksiklav', 'Augmentin'],
      // Tabletka 875 mg/125 mg: w Polsce stosuje się nazwy Amoksiklav 875 mg/125 mg i Augmentin 875 mg/125 mg (często oznaczane jako 1 g),
      // określenie "Forte" w przypadku tabletek jest nieoficjalne.
      'Tabletka 875 mg/125 mg': ['Amoksiklav', 'Augmentin', 'Amoksiklav Quicktab']
    },
    'Aksetyl cefuroksymu': {
      'Zawiesina 125 mg/5 ml': ['Zinnat', 'Ceroxim'],
      // Wersje „Forte” (250 mg/5 ml i tabletki 500 mg) nie są zarejestrowane w Polsce, dlatego pozostawiamy podstawowe nazwy.
      'Zawiesina 250 mg/5 ml': ['Zinnat', 'Ceroxim'],
      'Tabletka 250 mg': ['Zinnat', 'Ceroxim'],
      'Tabletka 500 mg': ['Zinnat', 'Ceroxim']
    },
    'Klarytromycyna': {
      'Zawiesina 125 mg/5 ml': ['Klabax', 'Klacid'],
      // Brak oficjalnych wersji „Forte” na polskim rynku – używamy podstawowych nazw klarytromycyny dla form o większym stężeniu.
      'Zawiesina 250 mg/5 ml': ['Klabax', 'Klacid'],
      'Tabletka 250 mg': ['Klabax', 'Klacid'],
      'Tabletka 500 mg': ['Klabax', 'Klacid']
    },
    'Azytromycyna': {
      'Zawiesina 100 mg/5 ml': ['Sumamed', 'AzitroLEK', 'Azycyna'],
      'Zawiesina 200 mg/5 ml': ['Sumamed Forte', 'AzitroLEK Forte', 'Azycyna Forte'],
      'Tabletka 250 mg': ['Sumamed', 'AzitroLEK'],
      'Tabletka 500 mg': ['Sumamed Forte', 'Azycyna Forte']
    },
    'Cefadroksyl': {
      'Zawiesina 250 mg/5 ml': ['Duracef', 'Biodroxyl'],
      'Tabletka 500 mg': ['Duracef'],
      'Tabletka 1 000 mg': ['Duracef Forte']
    },
    'Cefaleksyna': {
      'Zawiesina 125 mg/5 ml': ['Cefaleksyna Polfa'],
      'Zawiesina 250 mg/5 ml': ['Cefaleksyna Forte'],
      'Tabletka 250 mg': ['Cefaleksyna Polfa'],
      'Tabletka 500 mg': ['Cefaleksyna TZF']
    },
    // W Polsce dostępny jest również cefaklor w formie zawiesiny. Dodajemy markę Ceclor dla wszystkich mocy.
    'Cefaklor': {
      'Zawiesina 125 mg/5 ml': ['Ceclor'],
      'Zawiesina 125 mg/5 ml': ['Ceclor'],
      'Zawiesina 250 mg/5 ml': ['Ceclor'],
      'Zawiesina 250 mg/5 ml': ['Ceclor'],
      'Zawiesina 375 mg/5 ml': ['Ceclor'],
      'Zawiesina 375 mg/5 ml': ['Ceclor']
    },
    // Moloxin to jedyna marka moksyfloksacyny dostępna w Polsce; preparat zawiera 400 mg substancji czynnej.
    'Moksyfloksacyna': {
      'Tabletka 400 mg': ['Moloxin'],
      'Tabletka 400 mg': ['Moloxin']
    },
    // DOXYCYCLINUM TZF – kapsułki twarde zawierające 100 mg doksycykliny. Dodajemy tę markę
    // do listy preparatów doksycykliny.
    'Doksycyklina': {
      'Tabletka 100 mg': ['DOXYCYCLINUM TZF'],
      'Tabletka 100 mg': ['DOXYCYCLINUM TZF']
    },
    'Klindamycyna': {
      // Preparat Dalacin C występuje w postaci granulatu do sporządzania
      // zawiesiny 75 mg/5 ml oraz w kapsułkach 150 mg i 300 mg. Zgodnie z
      // definicją form powyżej, klucze w mapie muszą dokładnie odpowiadać
      // etykietom formularza, aby nazwy handlowe były prawidłowo przypisywane.
      // Usunięto preparat granulatu 75 mg/5 ml (Dalacin C) z oferty rynkowej w Polsce, dlatego nie przypisujemy
      // nazwy handlowej do tej formy.  Pozostawiamy tylko kapsułki 150 mg i 300 mg.
      'Kapsułka 150 mg': ['Dalacin C', 'Clindamycin MIP', 'Klimicin'],
      'Kapsułka 300 mg': ['Dalacin C Forte', 'Clindamycin MIP Forte', 'Klimicin']
    },
    /*
     * Furazydyna – nazwy handlowe najpopularniejszych preparatów 50 mg i 100 mg.
     * Dodajemy również warianty z normalnymi spacjami (bez twardej spacji),
     * aby dopasować etykiety formularza.
     */
    'Furazydyna': {
      'Tabletka 50 mg': ['Furaginum', 'Urofuraginum'],
      'Tabletka 50 mg': ['Furaginum', 'Urofuraginum'],
      'Tabletka 100 mg': ['Furaginum Forte', 'Urofuraginum Forte'],
      'Tabletka 100 mg': ['Furaginum Forte', 'Urofuraginum Forte'],
      // Zawiesina furazydyny (10 mg/ml, 50 mg/5 ml). Główną marką jest Dafurag.
      'Zawiesina 50 mg/5 ml': ['Dafurag'],
      'Zawiesina 50 mg/5 ml': ['Dafurag']
    },
    /*
     * Trimetoprim – monopreparat w tabletkach i zawiesinie. W Polsce dostępne
     * są marki Trimesan i Urotrim. Duplikaty z normalnymi spacjami
     * zapewniają kompatybilność z etykietami formularza.
     */
    'Trimetoprim': {
      'Tabletka 100 mg': ['Trimesan', 'Urotrim'],
      'Tabletka 100 mg': ['Trimesan', 'Urotrim'],
      'Tabletka 200 mg': ['Trimesan Forte', 'Urotrim Forte'],
      'Tabletka 200 mg': ['Trimesan Forte', 'Urotrim Forte'],
      'Zawiesina 100 mg/5 ml': ['Trimesan Zawiesina', 'Urotrim Zawiesina'],
      'Zawiesina 100 mg/5 ml': ['Trimesan Zawiesina', 'Urotrim Zawiesina']
    },
    /*
     * Trimetoprim-sulfametoksazol (kotrimoksazol) – preparaty złożone.
     */
    'Trimetoprim-sulfametoksazol': {
      'Zawiesina 240 mg/5 ml': ['Biseptol', 'Bactrim'],
      'Zawiesina 240 mg/5 ml': ['Biseptol', 'Bactrim'],
      'Tabletka 160 mg/800 mg': ['Biseptol 960', 'Bactrim Forte', 'Septrin Forte'],
      'Tabletka 160 mg/800 mg': ['Biseptol 960', 'Bactrim Forte', 'Septrin Forte']
    },
    /*
     * Fosfomycyna – jednorazowe saszetki. Najpopularniejszą marką jest Monural.
     */
    'Fosfomycyna': {
      'Saszetka 3 g': ['Monural'],
      'Saszetka 3 g': ['Monural']
    },
    /*
     * Cefiksym – preparaty doustne (zawiesina i kapsułki). Zarejestrowane
     * marki w Polsce to Suprax oraz Ranfix.
     */
    'Cefiksym': {
      // W Polsce jedyną zarejestrowaną marką cefiksymu jest Cetix. Usuwamy preparaty Suprax i Ranfix.
      'Zawiesina 100 mg/5 ml': ['Cetix'],
      'Zawiesina 100 mg/5 ml': ['Cetix'],
      'Tabletka 400 mg': ['Cetix'],
      'Tabletka 400 mg': ['Cetix']
    },
    /*
     * Ceftibuten – dostępny jako zawiesina i kapsułki pod marką Cedax.
     */
    'Ceftibuten': {
      'Zawiesina 180 mg/5 ml': ['Cedax'],
      'Zawiesina 180 mg/5 ml': ['Cedax'],
      'Kapsułka 400 mg': ['Cedax'],
      'Kapsułka 400 mg': ['Cedax']
    },
    /*
     * Cyprofloksacyna – fluorochinolon. Popularne nazwy handlowe to Ciprinol,
     * Ciprobay i Cipronex. Dodajemy duplikaty z normalnymi spacjami.
     */
    'Cyprofloksacyna': {
      'Tabletka 250 mg': ['Ciprinol', 'Ciprobay', 'Cipronex'],
      'Tabletka 250 mg': ['Ciprinol', 'Ciprobay', 'Cipronex'],
      'Tabletka 500 mg': ['Ciprinol', 'Ciprobay', 'Cipronex'],
      'Tabletka 500 mg': ['Ciprinol', 'Ciprobay', 'Cipronex'],
      'Roztwór 200 mg/100 ml': ['Ciprinol i.v.', 'Ciprobay i.v.'],
      'Roztwór 200 mg/100 ml': ['Ciprinol i.v.', 'Ciprobay i.v.'],
      'Roztwór 400 mg/200 ml': ['Ciprinol i.v.', 'Ciprobay i.v.'],
      'Roztwór 400 mg/200 ml': ['Ciprinol i.v.', 'Ciprobay i.v.']
    },
    /*
     * Cyprofloksacyna (doustna) – wariant oddzielający postać doustną od dożylnych roztworów.
     * Wskazania „odmiedniczkowe zapalenie nerek” oraz „powikłane i inne zakażenia układu moczowego”
     * wykorzystują tę wersję leku do obliczania dawki u dorosłych. Aby umożliwić szybkie
     * wybieranie preparatu, przypisujemy markę Cipronex do obu mocy tabletek. Dodajemy także
     * warianty z normalnymi spacjami, aby klucze pasowały do etykiet formularza.
     */
    'Cyprofloksacyna (doustna)': {
      'Tabletka 250 mg': ['Cipronex'],
      'Tabletka 250 mg': ['Cipronex'],
      'Tabletka 500 mg': ['Cipronex'],
      'Tabletka 500 mg': ['Cipronex']
    },
    /*
     * Lewofloksacyna – fluorochinolon. W Polsce jedynym zarejestrowanym
     * preparatem doustnym jest Levoxa w postaci tabletek 500 mg.
     * Preparaty infuzyjne nie posiadają nazw handlowych, dlatego
     * pozostawiamy puste listy w tabeli nazw, aby kalkulator nie
     * podpowiadał nieistniejących marek.
     */
    'Lewofloksacyna': {
      // Postać doustna: dostępne tabletki 500 mg (tylko Levoxa)
      'Tabletka 500 mg': ['Levoxa'],
      'Tabletka 500 mg': ['Levoxa']
    },
    // Lewofloksacyna i.v. – roztwór do infuzji bez określonej marki (brak nazw handlowych)
    'Lewofloksacyna i.v.': {
      'Roztwór 500 mg/100 ml': [],
      'Roztwór 500 mg/100 ml': []
    },
    /*
     * Gentamycyna – aminoglikozyd. Popularne preparaty to Gentamicin Kabi
     * oraz Gentamycyna Polfa. Dodajemy warianty z normalnymi spacjami.
     */
    'Gentamycyna': {
      'Ampułka 40 mg/1 ml': ['Gentamicin Kabi', 'Gentamycyna Polfa'],
      'Ampułka 40 mg/1 ml': ['Gentamicin Kabi', 'Gentamycyna Polfa'],
      'Ampułka 80 mg/2 ml': ['Gentamicin Kabi', 'Gentamycyna Polfa'],
      'Ampułka 80 mg/2 ml': ['Gentamicin Kabi', 'Gentamycyna Polfa']
    },
    /*
     * Amikacyna – aminoglikozyd o szerokim zastosowaniu w zakażeniach powikłanych.
     */
    'Amikacyna': {
      'Ampułka 100 mg/2 ml': ['Amikacin Kabi'],
      'Ampułka 100 mg/2 ml': ['Amikacin Kabi'],
      'Ampułka 500 mg/2 ml': ['Amikacin Kabi'],
      'Ampułka 500 mg/2 ml': ['Amikacin Kabi']
    },
    /*
     * Cefepim – cefalosporyna IV generacji. W Polsce dostępny preparat Maxipime.
     */
    'Cefepim': {
      'Fiolka 1 g': ['Maxipime'],
      'Fiolka 1 g': ['Maxipime'],
      'Fiolka 2 g': ['Maxipime Forte'],
      'Fiolka 2 g': ['Maxipime Forte']
    },
    /*
     * Piperacylina z tazobaktamem – preparat Tazocin.
     */
    'Piperacylina z tazobaktamem': {
      'Fiolka 4,5 g': ['Tazocin'],
      'Fiolka 4.5 g': ['Tazocin']
    },
    /*
     * Imipenem z cilastatyną – preparat Tienam.
     */
    'Imipenem z cilastatyną': {
      'Fiolka 500 mg': ['Tienam'],
      'Fiolka 500 mg': ['Tienam']
    },
    /*
     * Meropenem – preparaty Meronem i Meropenem Kabi.
     */
    'Meropenem': {
      'Fiolka 500 mg': ['Meronem', 'Meropenem Kabi'],
      'Fiolka 500 mg': ['Meronem', 'Meropenem Kabi'],
      'Fiolka 1 g': ['Meronem Forte', 'Meropenem Kabi'],
      'Fiolka 1 g': ['Meronem Forte', 'Meropenem Kabi']
    },
    /*
     * Doripenem – preparat Doripax.
     */
    'Doripenem': {
      'Fiolka 500 mg': ['Doripax'],
      'Fiolka 500 mg': ['Doripax']
    }
    ,
    'Cefazolina': {
      'Fiolka 1 g': ['Biofazolin'],
      'Fiolka 1 g': ['Biofazolin'],
      'Fiolka 2 g': ['Biofazolin Forte'],
      'Fiolka 2 g': ['Biofazolin Forte']
    },
    'Benzylopenicylina': {
      'Fiolka 1 000 000 j.m.': ['Penicylina G', 'Benzylpenicillin'],
      'Fiolka 1 000 000 j.m.': ['Penicylina G', 'Benzylpenicillin'],
      'Fiolka 5 000 000 j.m.': ['Penicylina G Forte', 'Benzylpenicillin Forte'],
      'Fiolka 5 000 000 j.m.': ['Penicylina G Forte', 'Benzylpenicillin Forte']
    },
    'Metronidazol': {
      'Tabletka 250 mg': ['Metronidazol Polfa', 'Metronidazol Jelfa'],
      'Tabletka 250 mg': ['Metronidazol Polfa', 'Metronidazol Jelfa'],
      'Tabletka 500 mg': ['Metronidazol Polfa Forte', 'Metronidazol Hasco'],
      'Tabletka 500 mg': ['Metronidazol Polfa Forte', 'Metronidazol Hasco'],
      'Roztwór 500 mg/100 ml': ['Metronidazol Polfa i.v.'],
      'Roztwór 500 mg/100 ml': ['Metronidazol Polfa i.v.']
    },
    'Wankomycyna': {
      'Fiolka 500 mg': ['Vancocin', 'Wankomycyna MIP'],
      'Fiolka 500 mg': ['Vancocin', 'Wankomycyna MIP'],
      'Fiolka 1 g': ['Vancocin Forte', 'Wankomycyna MIP Forte'],
      'Fiolka 1 g': ['Vancocin Forte', 'Wankomycyna MIP Forte']
    },
    'Linezolid': {
      'Tabletka 600 mg': ['Zyvoxid'],
      'Tabletka 600 mg': ['Zyvoxid'],
      'Zawiesina 100 mg/5 ml': ['Zyvoxid Zawiesina'],
      'Zawiesina 100 mg/5 ml': ['Zyvoxid Zawiesina']
    }
  };

  /**
   * Pobierz wiek pacjenta z formularza. Zwraca wartość liczbową w latach
   * lub null, jeśli nie podano wieku lub wpisano nieprawidłową wartość.
   *
   * @returns {number|null}
   */
  function getAge(){
    const ageInput = document.getElementById('age');
    if(!ageInput) return null;
    const val = parseFloat(ageInput.value);
    return (!isNaN(val) && val >= 0) ? val : null;
  }

  /**
   * Zbuduj rekomendację dla leków przeciwgorączkowych na podstawie masy i wieku.
   * Dla pacjentów < 10 kg lub w wieku < 1 roku stosujemy preparaty o standardowej mocy,
   * natomiast dla cięższych lub starszych dzieci wybieramy preparaty „Forte”.
   * Funkcja oblicza sugerowaną objętość pojedynczej dawki przy założeniu,
   * że ibuprofen podaje się w dawce 10 mg/kg, a paracetamol w dawce 15 mg/kg na
   * jedną dawkę. Dla ibuprofenu przyjmuje stężenia 20 mg/ml (100 mg/5 ml) dla
   * preparatów standardowych i 40 mg/ml (200 mg/5 ml) dla preparatów Forte.
   * Dla paracetamolu stężenia to 24 mg/ml (120 mg/5 ml) oraz 40 mg/ml dla
   * preparatów Forte. Wyliczone objętości są zaokrąglane do 0,25 ml. Funkcja
   * zwraca jedną linijkę tekstu z nazwami przykładowych preparatów i
   * orientacyjnymi dawkami w ml wraz z częstotliwością podania.
   *
   * @param {number} weight Masa ciała w kilogramach
   * @param {number|null} age Wiek w latach (może być ułamkowy), jeśli dostępny
   * @returns {string} Tekst z zaleceniami przeciwgorączkowymi
   */
function buildAntipyreticLine(weight, age, includeSuspension = true, includeSuppository = true, includeTablet = false){
    // Jeżeli pacjent ma ≥18 lat (osoba dorosła), zamiast przeliczania dawek
    // syropów dla dzieci zwracamy informację o tabletkowych lekach przeciwgorączkowych.
    // Dla dorosłych standardowe dawkowanie ibuprofenu to 200–400 mg na dawkę co
    // 4–6 godzin, a przy tabletkach 600 mg – jedna tabletka co 6–8 godzin,
    // maksymalnie 1 200 mg ibuprofenu na dobę (np. 6 × 200 mg, 3 × 400 mg, 2 × 600 mg).
    // Paracetamol 500 mg przyjmuje się w dawce 500–1 000 mg co 4–6 godzin, z
    // maksymalną dawką dobową 4 000 mg (8 tabletek 500 mg).  Informacje te
    // pochodzą z aktualnych Charakterystyk Produktów Leczniczychfile:///home/oai/share/Charakterystyka-649-2025-02-26-20533_N-2025-03-12.pdf#:~:text=Doro%C5%9Bli%3A%201,4%20g%20paracetamolu%20na%20dob%C4%99file:///home/oai/share/Charakterystyka-19842-2025-03-05-20045_N-2025-03-19.pdf#:~:text=Doro%C5%9Bli%20i%20m%C5%82odzie%C5%BC%20w%20wieku,zachowa%C4%87%20czterogodzinn%C4%85%20przerw%C4%99%20pomi%C4%99dzy%20dawkami.
      if(age !== null && age >= 18){
        // Ustal maksymalną dawkę dobową paracetamolu. Zgodnie z globalną zasadą,
        // u osób dorosłych o masie ciała <50 kg maksymalna dawka dobowa to 2 g.
        let parMaxAdultMg = 4000;
        if(weight < 50){
          parMaxAdultMg = 2000;
        }
        // Tekst dla dawki paracetamolu
        const parMaxAdultStr = parMaxAdultMg === 2000 ? '2 000 mg (2 g)' : '4 000 mg (4 g)';
        return `Leki przeciwgorączkowe: ibuprofen (dostępne są tabletki 200/400/600 mg) – 200–400 mg na dawkę co 4–6 godzin; w przypadku tabletek 600 mg stosuj 1 tabletkę co 6–8 godzin (maksymalnie 2 tabletki na dobę); nie należy stosować więcej niż 1200 mg ibuprofenu w ciągu doby. Paracetamol 500 mg – 1–2 tabletki (500–1 000 mg) co 4–6 godzin; maksymalnie ${parMaxAdultStr} na dobę. Należy przestrzegać co najmniej 4 godzinnego odstępu między kolejnymi dawkami leków przeciwgorączkowych.`;
      }
    // Zbierz poszczególne części zaleceń. Jeżeli sekcja zawiesin lub czopków jest wyłączona,
    // pomijamy odpowiednie fragmenty. W przypadku braku obu sekcji zwróć pusty ciąg.
    const segments = [];
    // Sekcja zawiesin (syropy i krople)
    if(includeSuspension){
      // Określ, czy stosować preparaty Forte. Zgodnie z zaleceniem:
      // * u młodszych/lżejszych dzieci (<10 kg lub <12 mies.) stosujemy preparaty
      //   standardowe (niższe stężenie);
      // * u starszych/cięższych dzieci (≥10 kg lub ≥1 rok) stosujemy preparaty
      //   Forte (wyższe stężenie).  Wartość `age` może być null, gdy wiek nie
      //   został wprowadzony; wówczas decyzja opiera się wyłącznie na masie.
      let useForte = false;
      const qualifiesByWeight = weight >= 10;
      const qualifiesByAge = (age !== null && age >= 1);
      if(qualifiesByWeight || qualifiesByAge){
        useForte = true;
      }
      // Obliczenia dla ibuprofenu: dawka 10 mg/kg
      const iboMg = weight * 10;
      const iboConc = useForte ? 40 : 20; // mg w 1 ml
      let iboMl = iboMg / iboConc;
      iboMl = Math.round(iboMl * 4) / 4; // zaokrąglenie do 0,25 ml
      const iboMlStr = fmt(iboMl);
      // Przykładowe nazwy preparatów ibuprofenu
      const iboBrands = useForte
        ? 'Ibum Forte, Nurofen Forte dla Dzieci'
        : 'Ibum dla Dzieci, Nurofen dla Dzieci';
      // Obliczenia dla paracetamolu: dawki 15 mg/kg (co 6 h) oraz 10 mg/kg (co 4 h).
      const parMg15 = weight * 15;
      const parMg10 = weight * 10;
      // Stężenie syropu: 24 mg/ml (120 mg/5 ml) dla standardu, 40 mg/ml (200 mg/5 ml) dla preparatów Forte.
      const parConc = useForte ? 40 : 24;
      let parVol6 = parMg15 / parConc;
      let parVol4 = parMg10 / parConc;
      // Zaokrąglij objętości do 0,25 ml dla syropów.
      parVol6 = Math.round(parVol6 * 4) / 4;
      parVol4 = Math.round(parVol4 * 4) / 4;
      const parVol6Str = fmt(parVol6);
      const parVol4Str = fmt(parVol4);
      // Nazwy preparatów paracetamolu: w wersji standardowej używamy Panadol dla Dzieci,
      // w wersji Forte – APAP dla Dzieci FORTE.
      const parBrand = useForte
        ? 'APAP dla Dzieci FORTE'
        : 'Panadol dla Dzieci';
      // Obliczenia dla Pedicetamolu (100 mg/ml), dostępnego dla dzieci ≤32 kg.
      let pedPart = '';
      if(weight <= 32){
        let pedVol6 = (weight * 15) / 100;
        let pedVol4 = (weight * 10) / 100;
        pedVol6 = Math.round(pedVol6 * 10) / 10;
        pedVol4 = Math.round(pedVol4 * 10) / 10;
        const pedVol6Str = fmt(pedVol6);
        const pedVol4Str = fmt(pedVol4);
        pedPart = `; Pedicetamol – ${pedVol6Str} ml na dawkę (15 mg/kg) co 6 godzin lub ${pedVol4Str} ml na dawkę (10 mg/kg) co 4 godziny`;
      }
      // Skonstruuj fragment opisujący leki w zawiesinie (syropy/krople)
      segments.push(`ibuprofen np. ${iboBrands} – ${iboMlStr} ml na dawkę, maksymalnie 4 × na dobę (co 6 godzin); paracetamol np. ${parBrand} – ${parVol6Str} ml na dawkę (15 mg/kg) co 6 godzin lub ${parVol4Str} ml na dawkę (10 mg/kg) co 4 godziny${pedPart}`);
    }
    // Sekcja czopków (suppositories)
    if(includeSuppository){
      // Ustal wiek w miesiącach (jeżeli podano w latach). Uwaga: jeżeli age jest null, treat as unknown.
      let months = null;
      if(age !== null){
        months = age * 12;
      }
      const suppSegments = [];
      // Ibuprofen – czopki są zarejestrowane od 3 miesięcy do 6 lat. Wskazówki dawkowania
      // oparto na Charakterystyce Produktów Leczniczych Nurofen dla dzieci 60 mg i 125 mgfile:///home/oai/share/Charakterystyka-16290-2025-04-23-22142_B-2025-05-16.pdf#:~:text=Nurofen%20dla%20dzieci%2060%20mg,Oznacza%20tofile:///home/oai/share/Charakterystyka-16198-2025-03-05-20045_N-2025-03-19.pdf#:~:text=Maksymalna%20dobowa%20dawka%20ibuprofenu%20wynosi,4%20dawkach%20podzielonych%20wg%20schematu.
      // Sprawdź warunki dopuszczające ibuprofen w czopkach.
      if(months === null || (months >= 3 && months < 72)){
        // Ibuprofen w czopkach nie powinien być stosowany u dzieci ważących <6 kg (poniżej 3 mies.).
        if(weight >= 6){
          let ibuMg = 60;
          let ibuMaxSupps = 3;
          let ibuFreq = 'co 6–8 godzin';
          // Określ kategorię wagową i przypisz wielkość czopka oraz maksymalną liczbę na dobę.
          if(weight < 8){
            ibuMg = 60;
            ibuMaxSupps = 3;
            ibuFreq = 'co 6–8 godzin';
          } else if(weight < 12.5){
            ibuMg = 60;
            ibuMaxSupps = 4;
            ibuFreq = 'co 6 godzin';
          } else if(weight < 17){
            ibuMg = 125;
            ibuMaxSupps = 3;
            ibuFreq = 'co 6–8 godzin';
          } else {
            ibuMg = 125;
            ibuMaxSupps = 4;
            ibuFreq = 'co 6 godzin';
          }
          suppSegments.push(`ibuprofen ${ibuMg} mg – 1 czopek ${ibuFreq}; maksymalnie ${ibuMaxSupps} czopki na dobę`);
        }
      }
      // Paracetamol – czopki zarejestrowane u dzieci od 3 miesięcy do 12 latfile:///home/oai/share/Charakterystyka-9735-2025-05-07-21113_N-2025-05-21.pdf#:~:text=U%20dzieci%20dawk%C4%99%20ustala%20si%C4%99,lub%20wed%C5%82ug%20poni%C5%BCszej%20tabeli%20wiekowej. Oblicz dawkę 15 mg/kg i dobierz
      // największą dostępną wielkość czopka (80/125/250/500 mg) nieprzekraczającą zalecanej dawki i
      // nieprzekraczającą całkowitej dobowej dawki 60 mg/kg.
      if(months === null || (months >= 3 && months <= 144)){
        // Lista dostępnych wielkości czopków w mg (posortowana malejąco).
        const sizes = [500, 250, 125, 80];
        const singleDoseMg = weight * 15; // 15 mg/kg na dawkę
        const maxDailyMg = weight * 60; // 60 mg/kg/dobę
        let selectedSize = null;
        for(const size of sizes){
          if(size <= singleDoseMg && (size * 4) <= maxDailyMg){
            selectedSize = size;
            break;
          }
        }
        // Jeżeli żadna wielkość nie spełnia warunków (np. przy bardzo małej masie), użyj najmniejszej dostępnej.
        if(selectedSize === null){
          selectedSize = sizes[sizes.length - 1];
        }
        suppSegments.push(`paracetamol ${selectedSize} mg – 1 czopek co 4 godziny; maksymalnie 4 czopki na dobę`);
      }
      if(suppSegments.length > 0){
        // Dodaj prefiks „w czopkach” do segmentu, aby oddzielić go od zawiesin.
        segments.push('w czopkach: ' + suppSegments.join('; '));
      }
    }
    // Sekcja tabletek dla dzieci i młodzieży 12–18 lat. Ta część
    // generuje zalecenia dla tabletek ibuprofenu i paracetamolu
    // stosowanych w tym przedziale wiekowym. Używamy dawek w mg/kg
    // na dawkę (7–10 mg/kg dla ibuprofenu, 10–15 mg/kg dla paracetamolu)
    // zaokrąglonych odpowiednio do 50 mg i 100 mg. Jednorazowe dawki
    // ograniczamy do 200–400 mg (ibuprofen) i 500–1000 mg (paracetamol),
    // a maksymalne dawki dobowe do 30 mg/kg (nie więcej niż 1200 mg) i
    // 60 mg/kg (nie więcej niż 4000 mg).
    if(includeTablet){
      // Wygeneruj sekcję tabletek tylko jeśli wiek jest znany i mieści się w odpowiednim przedziale.
      if(age !== null && age >= 6 && age < 12){
        /*
         * Sekcja tabletek dla dzieci 6–<12 lat.  Ibuprofen jest stosowany w dawce 200 mg
         * (nie dzieli się tabletek) i różni się częstotliwością podawania zależnie od masy ciała:
         *  - w grupie 6–9 lat (20–<30 kg) – 1 tabletka co 6 godzin; nie więcej niż 3 tabletki 200 mg (600 mg) na dobę;
         *  - w grupie 9–12 lat (30–<40 kg) – 1 tabletka co 4–6 godzin; nie więcej niż 4 tabletki 200 mg (800 mg) na dobę.
         * Zgodnie z wytycznymi obowiązuje również limit 30 mg/kg mc./dobę (czyli 7–10 mg/kg na dawkę, do 3–4 dawkowania na dobę),
         * lecz praktyczne limity mg/dobę wynikają z maksymalnej liczby tabletek.
         * Paracetamol można podawać jako pół tabletki (250 mg) lub jedną tabletkę (500 mg) na dawkę,
         * w dawce 10–15 mg/kg. Nie należy przekraczać 60 mg/kg mc./dobę ani 4 dawek na dobę.
         */
        // Pomocnicza funkcja do odmiany słowa „tabletka” (biernik)
        const pluralize = (count, singular, few, many) => {
          return count === 1 ? singular : (count >= 2 && count <= 4 ? few : many);
        };
        // ==== Ibuprofen dla 6–<12 lat ====
        // Wyznacz maksymalną liczbę tabletek 200 mg na dobę w zależności od wagi
        const weightKg = weight;
        // Limit na dawkę: zawsze 200 mg
        const iboDoseText = '200 mg';
        // Limit dobowy: min(30 mg/kg * masa, limit wg grupy wagowej)
        const iboDailyPerKg = Math.round(weightKg * 30);
        // Określ limit na liczbę tabletek wg grupy: <30 kg → 3; >=30 kg → 4
        const iboMaxTabletsGroup = (weightKg < 30) ? 3 : 4;
        // Limit mg/dobę wg grupy: <30 kg → 600 mg; >=30 kg → 800 mg
        const iboMaxMgGroup = (weightKg < 30) ? 600 : 800;
        // Zastosuj ograniczenie mg/kg oraz limit grupowy
        const iboMaxDailyMg = Math.min(iboDailyPerKg, iboMaxMgGroup);
        let iboMaxCount200 = Math.floor(iboMaxDailyMg / 200);
        // Nie przekraczaj liczby tabletek ustalonej w grupie
        if(iboMaxCount200 > iboMaxTabletsGroup) iboMaxCount200 = iboMaxTabletsGroup;
        // Częstotliwość podawania ibuprofenu w zależności od wagi
        const iboInterval = (weightKg < 30) ? 'co 6 godzin' : 'co 4–6 godzin';
        // Zbuduj opis dla ibuprofenu
        let iboDesc = '';
        if(iboMaxCount200 > 0){
          const word = pluralize(iboMaxCount200, 'tabletkę', 'tabletki', 'tabletek');
          iboDesc = `maksymalnie ${iboMaxCount200} ${word} 200 mg na dobę`;
        }
        // ==== Paracetamol dla 6–<12 lat ====
        // Oblicz minimalną i maksymalną dawkę (mg)
        const parLowRaw = weightKg * 10;
        const parHighRaw = weightKg * 15;
        const parSizes = [250, 500];
        // Wybierz dostępne wielkości tabletek nieprzekraczające górnej granicy
        let parDisplaySizes = parSizes.filter(size => size <= parHighRaw);
        if(parDisplaySizes.length === 0) parDisplaySizes = [parSizes[0]];
        // Sformatuj tekst dawek, np. „250 mg lub 500 mg”
        const parDoseText = parDisplaySizes.map(size => `${size} mg`).join(' lub ');
        // Maksymalna dawka dobowa paracetamolu: 60 mg/kg, ale nie więcej niż 4 tabletki po 500 mg
        const parMaxTabletsByWeight = Math.floor((weightKg * 60) / 500);
        const parMaxTablets = Math.min(parMaxTabletsByWeight, 4);
        let parDesc = '';
        if(parMaxTablets > 0){
          const wordP = pluralize(parMaxTablets, 'tabletkę', 'tabletki', 'tabletek');
          parDesc = `maksymalnie ${parMaxTablets} ${wordP} po 500 mg na dobę`;
        }
        // Domyślna częstotliwość podawania paracetamolu: co 4 godziny
        const parInterval = 'co 4–6 godzin';
        // Zbuduj końcową linię dla tabletek 6–<12 lat
        let tabletLine6to12 = `tabletki – ibuprofen ${iboDoseText} na dawkę ${iboInterval}`;
        if(iboDesc){
          tabletLine6to12 += ` (${iboDesc})`;
        }
        tabletLine6to12 += '; ';
        tabletLine6to12 += `paracetamol ${parDoseText} na dawkę ${parInterval}`;
        if(parDesc){
          tabletLine6to12 += ` (${parDesc})`;
        }
        segments.push(tabletLine6to12);
      } else if(age !== null && age >= 12 && age < 18){
        /*
         * Oblicz dawkowanie tabletek w sposób dyskretny. Ibuprofen jest dostępny
         * w tabletkach 200 mg i 400 mg, których nie wolno dzielić. Dlatego zamiast
         * zaokrąglać dawki do wielokrotności 50 mg, wybieramy najmniejszą
         * wielkość tabletki nie mniejszą niż minimalna dawka (7 mg/kg) oraz
         * największą wielkość tabletki nieprzekraczającą maksymalnej dawki
         * (10 mg/kg). Jeżeli zakres się zawęża, wówczas dolna i górna dawka są
         * równe. Na podstawie maksymalnej dawki dobowej (30 mg/kg, nie więcej
         * niż 1200 mg) obliczamy liczbę tabletek 200 mg i 400 mg, które można
         * bezpiecznie podać w ciągu doby.
         */
        // Surowe dawki minimalna i maksymalna w mg/kg dla ibuprofenu
        const iboLowRaw = weight * 7;
        const iboHighRaw = weight * 10;
        // Dostępne tabletki ibuprofenu
        const iboSizes = [200, 400];
        // Wyznacz najniższą tabletkę >= minimalnej dawki i najwyższą <= maksymalnej dawki
        let iboDoseLow = iboSizes.find(size => size >= iboLowRaw);
        if (iboDoseLow === undefined) iboDoseLow = iboSizes[iboSizes.length - 1];
        let iboDoseHigh = [...iboSizes].reverse().find(size => size <= iboHighRaw);
        if (iboDoseHigh === undefined) iboDoseHigh = iboSizes[0];
        if (iboDoseHigh < iboDoseLow) iboDoseHigh = iboDoseLow;
        /*
         * Maksymalna dawka dobowa ibuprofenu: 30 mg/kg, ograniczona do 1200 mg.
         * Dodatkowo, dla dzieci o masie 30–40 kg nie należy przekraczać 800 mg/dobę.
         */
        const iboDailyPerKg = Math.round(weight * 30);
        const iboMaxByWeight = (weight >= 30 && weight <= 40) ? 800 : 1200;
        const iboMaxDaily = Math.min(iboDailyPerKg, iboMaxByWeight);
        // Maksymalna liczba tabletek 200 mg i 400 mg na dobę
        const iboMaxCount200 = Math.floor(iboMaxDaily / 200);
        const iboMaxCount400 = Math.floor(iboMaxDaily / 400);
        /*
         * Paracetamol jest dostępny w tabletkach 500 mg, które można dzielić tylko
         * na połowę, co daje porcje 250 mg. Wyznaczamy zatem dawkę minimalną
         * (10 mg/kg) i maksymalną (15 mg/kg) zaokrągloną do wielokrotności 250 mg.
         * Jeżeli zakres jest pusty, dolna i górna dawka są równe. Na podstawie
         * maksymalnej dawki dobowej (60 mg/kg, nie więcej niż 4000 mg) obliczamy
         * maksymalną liczbę tabletek 500 mg, przy czym każda tabletka 500 mg
         * odpowiada dwóm dawkom po 250 mg.
         */
        const parLowRaw = weight * 10;
        const parHighRaw = weight * 15;
        // Najbliższe 250 mg w górę i w dół
        const ceilTo250 = (val) => Math.ceil(val / 250) * 250;
        const floorTo250 = (val) => Math.floor(val / 250) * 250;
        let parDoseLow = Math.max(250, Math.min(ceilTo250(parLowRaw), 1000));
        let parDoseHigh = Math.min(Math.max(parDoseLow, floorTo250(parHighRaw)), 1000);
        // Minimalnie 500 mg jeśli dolna dawka jest poniżej 500 mg
        if(parDoseLow < 500 && parDoseHigh < 500){
          // Przy niskiej masie ciała obie dawki mogą wynosić 250 mg, ale zalecamy
          // traktowanie ich jako połowy tabletki 500 mg.
          parDoseLow = parDoseHigh = 250;
        }
        // Jeśli górna dawka jest mniejsza niż dolna, ujednolicamy je
        if(parDoseHigh < parDoseLow) parDoseHigh = parDoseLow;
        // Maksymalna dawka dobowa paracetamolu: 60 mg/kg, nie więcej niż 4000 mg
        const parMaxDaily = Math.min(Math.round(weight * 60), 4000);
        // Maksymalna liczba pełnych tabletek 500 mg na dobę
        const parMaxTablets = Math.floor(parMaxDaily / 500);
        // Pomocnicza funkcja do odmiany słowa „tabletka” (biernik)
        const pluralize = (count, singular, few, many) => {
          return count === 1 ? singular : (count >= 2 && count <= 4 ? few : many);
        };
        // Tekst dawki dla ibuprofenu: pokaż dostępne wielkości tabletek w zakresie dozwolonej dawki.
        // Jeśli maksymalna dawka na dawkę (iboHighRaw) jest mniejsza od największej tabletki, filtrujemy listę.
        let iboDisplaySizes = iboSizes.filter(size => size <= iboHighRaw);
        // W razie gdy żadna tabletka nie mieści się w zakresie, użyj najmniejszej (zapobiega pustej liście)
        if (iboDisplaySizes.length === 0) iboDisplaySizes = [iboSizes[0]];
        // Sformatuj listę „200 mg lub 400 mg”
        const iboDoseText = iboDisplaySizes.map(size => `${size} mg`).join(' lub ');
        // Opis maksymalnej liczby tabletek ibuprofenu
        let iboDesc200 = '';
        if(iboMaxCount200 > 0){
          const word = pluralize(iboMaxCount200, 'tabletkę', 'tabletki', 'tabletek');
          iboDesc200 = `${iboMaxCount200} ${word} 200 mg`;
        }
        let iboDesc400 = '';
        if(iboMaxCount400 > 0){
          const word = pluralize(iboMaxCount400, 'tabletkę', 'tabletki', 'tabletek');
          iboDesc400 = `${iboMaxCount400} ${word} 400 mg`;
        }
        let iboParenthetical;
        if(iboDesc200 && iboDesc400){
          iboParenthetical = `maksymalnie ${iboDesc200} lub ${iboDesc400} na dobę`;
        } else if(iboDesc200){
          iboParenthetical = `maksymalnie ${iboDesc200} na dobę`;
        } else if(iboDesc400){
          iboParenthetical = `maksymalnie ${iboDesc400} na dobę`;
        } else {
          iboParenthetical = '';
        }
        // Tekst dawki dla paracetamolu
        const parDoseText = parDoseLow === parDoseHigh ? `${parDoseLow}` : `${parDoseLow}–${parDoseHigh}`;
        // Opis maksymalnej liczby tabletek paracetamolu 500 mg
        let parParenthetical = '';
        if(parMaxTablets > 0){
          const word = pluralize(parMaxTablets, 'tabletkę', 'tabletki', 'tabletek');
          // Użyj słowa „po” aby wskazać, że chodzi o wielkość tabletki
          parParenthetical = `maksymalnie ${parMaxTablets} ${word} po 500 mg na dobę`;
        }
        // Zbuduj finalny opis
        let tabletLine = `tabletki – ibuprofen ${iboDoseText} na dawkę co 4–6 h`;
        if(iboParenthetical){
          tabletLine += ` (${iboParenthetical})`;
        }
        tabletLine += '; ';
        tabletLine += `paracetamol ${parDoseText} mg na dawkę co 4–6 h`;
        if(parParenthetical){
          tabletLine += ` (${parParenthetical})`;
        }
        segments.push(tabletLine);
      }
    }
    if(segments.length === 0){
      return '';
    }
    // Połącz sekcje średnikiem i dodaj kropkę na końcu.
    return 'Leki przeciwgorączkowe: ' + segments.join('; ') + '.';
  }

  /**
   * Oblicza wiek dziecka w miesiącach na podstawie pól formularza #age i #ageMonths.
   * Zwraca liczbę miesięcy lub null, jeśli wiek nie jest uzupełniony.
   * @returns {number|null}
   */
  function getChildAgeMonths(){
    const yearsEl = document.getElementById('age');
    const monthsEl = document.getElementById('ageMonths');
    let months = null;
    if(yearsEl && yearsEl.value){
      const y = parseFloat(yearsEl.value.replace(',', '.'));
      if(!isNaN(y)){
        months = y * 12;
      }
    }
    if(monthsEl && monthsEl.value){
      const m = parseFloat(monthsEl.value.replace(',', '.'));
      if(!isNaN(m)){
        months = (months || 0) + m;
      }
    }
    return (months !== null && !isNaN(months)) ? months : null;
  }

  /**
   * Normalizuje tekst wskazania na klucz używany w mapie RED_FLAGS.
   * Używa nazw polskich, zamienia je na uproszczone identyfikatory.
   * @param {string} val
   * @returns {string|null}
   */
  function normalizeRedIndication(val){
    if(!val) return null;
    const v = val.toLowerCase();
    // Wartość selecta abxIndication może być zarówno etykietą w języku polskim
    // (np. „Ostre zapalenie gardła i migdałków podniebiennych”), jak i kluczem
    // wewnętrznym (np. „pharyngitis”). Dlatego sprawdzamy kilka warunków.
    // Gardło i migdałki – etykiety i klucz 'pharyngitis'
    if(v.includes('gard') || v.includes('migda') || v.includes('pharyngitis')) return 'throat';
    // Niepowikłane/powikłane zakażenia układu moczowego i inne klucze ZUM
    if(v.includes('mocz') || v.includes('zum') || v.includes('uti')) return 'uti';
    // Zapalenie płuc (np. „pneumonia” w kluczu)
    if(v.includes('płuc') || v.includes('pneum')) return 'pneumonia';
    // Zapalenie ucha środkowego (klucz 'otitis')
    if(v.includes('ucho') || v.includes('otitis')) return 'otitis';
    // Zapalenie zatok (klucz 'sinusitis') lub nosa
    if(v.includes('zatok') || v.includes('nos') || v.includes('sinus')) return 'sinusitis';
    return null;
  }

  /**
   * Mapa czerwonych flag dla poszczególnych wskazań i grup wiekowych.
   * Każdy wpis zawiera tekst, który zostanie dodany w zaleceniach.
   */
  const RED_FLAGS = {
    throat: {
      infant: 'Skontaktuj się ponownie z lekarzem, gdy dziecko ma wyraźne trudności z oddychaniem (przyspieszony, męczący oddech, „zaciąganie” między żebrami), ślini się i nie może połykać albo staje się wyjątkowo senne i odmawia picia.',
      young: 'Skontaktuj się ponownie z lekarzem, gdy ból gardła lub gorączka utrzymują się ponad 2–3 dni, ból gardła jest jednostronny, dziecko ma trudność z szerokim otwarciem ust, ślini się, mówi przytłumionym głosem albo zaczyna trudniej oddychać.',
      older: 'Skontaktuj się ponownie z lekarzem, gdy ból gardła nasila się po jednej stronie, pojawia się trudność w połykaniu lub oddychaniu, szyja jest sztywna i bolesna przy ruchach, głos staje się nietypowo przytłumiony albo gorączka trwa ponad 3 dni mimo leczenia.'
    },
    uti: {
      infant: 'Skontaktuj się ponownie z lekarzem, gdy gorączka nie spada po 2 dniach leczenia, dziecko wymiotuje, odmawia jedzenia/picia, jest bardzo senne albo siusia wyraźnie rzadziej (np. sucha pielucha przez wiele godzin).',
      young: 'Skontaktuj się ponownie z lekarzem, gdy mimo leczenia pojawiają się wymioty (dziecko nie może przyjąć leków i płynów), gorączka utrzymuje się dłużej niż 2–3 dni albo boli bok/plecy w okolicy nerek; zgłoś się także, gdy dziecko siusia dużo rzadziej (oznaką może być senność, suchość w ustach).',
      older: 'Skontaktuj się ponownie z lekarzem, gdy pojawia się ból w dole pleców lub boku (okolice nerek), dreszcze, krew w moczu albo wymioty lub brak poprawy po 2–3 dniach leczenia.'
    },
    pneumonia: {
      infant: 'Skontaktuj się ponownie z lekarzem, gdy dziecko oddycha wyraźnie szybciej lub z wysiłkiem (wciąga przestrzenie między żebrami, ruszają skrzydełka nosa), sinieją usta lub palce, odmawia karmienia albo trudno je dobudzić. Każde pogorszenie oddychania wymaga pilnej ponownej oceny przez lekarza.',
      young: 'Skontaktuj się ponownie z lekarzem, gdy narasta duszność lub przyspieszony oddech, pojawia się ból w klatce piersiowej lub plecach, dziecko wygląda na odwodnione (mało pije, rzadko siusia) albo gorączka nie ustępuje po 2–3 dniach leczenia.',
      older: 'Skontaktuj się ponownie z lekarzem, gdy duszność się nasila, pojawia się kłujący ból przy oddychaniu, wysoka gorączka utrzymuje się mimo leczenia albo dziecko jest wyraźnie osłabione.'
    },
    otitis: {
      infant: 'Skontaktuj się ponownie z lekarzem, gdy pojawia się obrzęk i zaczerwienienie za uchem z „odstawaniem” małżowiny, utrzymuje się wysoka gorączka albo dziecko jest wyjątkowo senne, wiotkie.',
      young: 'Skontaktuj się ponownie z lekarzem, gdy silny ból ucha albo gorączka trwają ponad 2–3 dni mimo leczenia, z ucha sączy się ropa z nasilonym bólem, pojawia się obrzęk i bolesność za uchem albo dziecko skarży się na zawroty głowy.',
      older: 'Skontaktuj się ponownie z lekarzem, gdy ból ucha nasila się zamiast słabnąć, występuje ropny wyciek, zawroty głowy, osłabienie mięśni twarzy albo bolesny obrzęk za uchem.'
    },
    sinusitis: {
      infant: 'Skontaktuj się ponownie z lekarzem, gdy pojawia się obrzęk i zaczerwienienie powiek lub wokół oka, dziecko jest nietypowo senne, trudno je dobudzić albo utrzymuje się wysoka gorączka.',
      young: 'Skontaktuj się ponownie z lekarzem, gdy powieki lub okolice oka puchną i bolą, ruchy oka są bolesne lub ograniczone, widzenie się pogarsza (np. podwójne widzenie) albo ból twarzy jest silny i jednostronny.',
      older: 'Skontaktuj się ponownie z lekarzem, gdy pojawia się silny ból głowy (zwłaszcza czoła), obrzęk czoła, sztywność karku, światłowstręt albo zaburzenia widzenia (np. podwójne widzenie). To mogą być objawy rozwijających się powikłań zapalenia zatok.'
    }
  };

  /**
   * Generuje tekst z czerwonymi flagami (red flags) w zależności od
   * wybranego wskazania i wieku dziecka. Jeżeli wskazanie lub wiek nie jest
   * dostępny, funkcja zwraca pusty łańcuch. Wynik jest bez numeracji –
   * numeracja dodawana jest w funkcji generateRecommendation.
   * @returns {string}
   */
  function buildRedFlagsLine(){
    // Pobierz wskazanie z pola abxIndication
    const sel = document.getElementById('abxIndication');
    if(!sel || !sel.value) return '';
    const key = normalizeRedIndication(sel.value);
    if(!key || !RED_FLAGS[key]) return '';
    // Ustal grupę wiekową na podstawie wieku w miesiącach
    const months = getChildAgeMonths();
    let group = 'young';
    if(months !== null){
      if(months < 12){
        group = 'infant';
      } else if(months < 72){
        group = 'young';
      } else {
        group = 'older';
      }
    }
    const text = RED_FLAGS[key][group] || '';
    if(!text) return '';
    // Red flags texts already contain the appropriate preamble (e.g. "Skontaktuj się ponownie z lekarzem, gdy…").
    // We return the text directly without adding a "Czerwone flagi" prefix, so that
    // the narrative remains clear and simple for parents.
    return text;
  }

  /**
   * Generuje zalecenia dotyczące stosowania leków przeciwgorączkowych (ibuprofen i paracetamol)
   * na podstawie masy ciała oraz wieku (jeśli podany). Funkcja zwraca sformatowany
   * łańcuch tekstowy z informacjami o zalecanych dawkach w mg/kg, przeliczeniu na mg
   * oraz orientacyjnych objętościach syropu, wraz z ostrzeżeniami dla młodszych
   * niemowląt. Jeżeli masa nie jest podana, funkcja zwraca pusty ciąg.
   *
   * @param {number} weight Masa ciała w kilogramach
   * @param {number|null} age Wiek w latach (może być ułamkowy), jeśli dostępny
   * @returns {string} Tekst zaleceń dla leków przeciwgorączkowych
   */
  function getAntipyreticAdvice(weight, age){
    if(!weight || weight <= 0){
      return '';
    }
    const lines = [];
    // Ibuprofen – dawka 5–10 mg/kg/dawkę co 6–8 godzin, max 40 mg/kg/dobę.
    // W niektórych źródłach (np. wytyczne IDSA) stosuje się zakres 4–10 mg/kg/dawkę,
    // ale w praktyce pediatrycznej 5 mg/kg stanowi wygodny dół przedziału. Poniżej
    // bazujemy na 5–10 mg/kg/dawkę, a powiadomienie o niemowlętach <6 mies. pojawia się niżej.
    const iboLowMg = weight * 5;
    const iboHighMg = weight * 10;
    const iboMaxDaily = weight * 40;
    // Syrop 100 mg/5 ml ⇒ 20 mg/ml
    const iboLowMl = iboLowMg / 20;
    const iboHighMl = iboHighMg / 20;
    const iboLowMlRounded = Math.round(iboLowMl * 10) / 10;
    const iboHighMlRounded = Math.round(iboHighMl * 10) / 10;
    let iboAgeWarning = '';
    if(age !== null && age < 0.5){
      iboAgeWarning = ' – nie stosować u niemowląt <6 mies.';
    }
    lines.push(`Ibuprofen: 5–10 mg/kg/dawkę co 6–8 h. Dla tej masy: ${Math.round(iboLowMg)}–${Math.round(iboHighMg)} mg (≈${iboLowMlRounded}–${iboHighMlRounded} ml syropu 100 mg/5 ml) na dawkę; max ${Math.round(iboMaxDaily)} mg/dobę${iboAgeWarning}. Przykłady: Nurofen, Ibum, Ibufen.`);
    // Paracetamol – dawka 10–15 mg/kg/dawkę co 4–6 godzin, max 60 mg/kg/dobę
    const parLowMg = weight * 10;
    const parHighMg = weight * 15;
    const parMaxDaily = weight * 60;
    // Syrop 120 mg/5 ml ⇒ 24 mg/ml
    const parLowMl = parLowMg / 24;
    const parHighMl = parHighMg / 24;
    const parLowMlRounded = Math.round(parLowMl * 10) / 10;
    const parHighMlRounded = Math.round(parHighMl * 10) / 10;
    let parAgeWarning = '';
    // W przypadku noworodków (< 4 tygodnie) zaleca się dawkę 10 mg/kg 3–4 razy dziennie,
    // z maksymalną dawką dobową 40 mg/kg; informujemy o tym w ostrzeżeniu.
    if(age !== null && age < (1/12)){
      parAgeWarning = ' – u noworodków do 4 tygodnia życia stosuj 10 mg/kg/dawkę maks. 3–4 ×/dobę (max 40 mg/kg/dobę)';
    }
    lines.push(`Paracetamol: 10–15 mg/kg/dawkę co 4–6 h. Dla tej masy: ${Math.round(parLowMg)}–${Math.round(parHighMg)} mg (≈${parLowMlRounded}–${parHighMlRounded} ml syropu 120 mg/5 ml) na dawkę; max ${Math.round(parMaxDaily)} mg/dobę${parAgeWarning}. Przykłady: Apap, Panadol, Calpol.`);
    return lines.join('<br>');
  }

  /**
   * Buduje tekst zaleceń dla pacjenta na podstawie wybranej nazwy handlowej,
   * liczby dawek w ciągu doby, wielkości pojedynczej dawki oraz długości terapii.
   * Do wygenerowanych zaleceń dodawana jest propozycja stosowania probiotyku.
   *
   * @param {string} brandName Nazwa handlowa preparatu
   * @param {number} dosesPerDay Liczba dawek na dobę
   * @param {string} doseStr Wielkość pojedynczej dawki (np. „2,5 ml” lub „0,5 tabl.”)
   * @param {number} duration Czas terapii w dniach
   * @returns {string} Przygotowany tekst zaleceń
   */
function generateRecommendation(brandName, dosesPerDay, doseStr, duration, opts = {}){
    // Utwórz pierwszą linię zaleceń. W przypadku schematów dzielonych (np. „w 1. dniu …, następnie …”)
    // zastosuj opis „lek podajemy …” i podaj liczbę kolejnych dni równą czasowi trwania terapii minus pierwszy dzień.
    // W przeciwnym razie użyj standardowego formatu „× dziennie po … przez … dni”.
    let firstLine;
    // Rozpoznaj schemat dzielony na podstawie obecności słowa „następnie” w przekazanym opisie dawki.
    if(doseStr && doseStr.includes('następnie')){
      // Oblicz liczbę kolejnych dni (czas trwania terapii minus pierwszy dzień)
      const remainingDays = duration > 0 ? duration - 1 : 0;
      // Jeśli w opisie dawki występuje znak mnożenia „×”, oznacza to, że liczba podań
      // różni się między dniami (np. „4 × 1 tabl., następnie 3 × 1 tabl.”).  W takiej
      // sytuacji nie podajemy stałej frazy „n razy dziennie”, lecz pozostawiamy
      // jedynie dwukropek przed opisem dawek.
      if(doseStr.includes('×')){
        firstLine = `${brandName} – lek podajemy: ${doseStr} przez ${remainingDays}\u00a0kolejnych dni.`;
      } else {
        // Zbuduj opis częstości dawkowania: „1 raz dziennie”, „2 razy dziennie”, itd.
        let freqPhrase;
        if(dosesPerDay === 1){
          freqPhrase = '1 raz dziennie';
        } else if(dosesPerDay === 2){
          freqPhrase = '2 razy dziennie';
        } else {
          freqPhrase = `${dosesPerDay}\u00a0razy dziennie`;
        }
        // Zbuduj pierwszą linię: brandName – lek podajemy {freqPhrase}: {doseStr} przez {remainingDays} kolejne dni.
        firstLine = `${brandName} – lek podajemy ${freqPhrase}: ${doseStr} przez ${remainingDays}\u00a0kolejnych dni.`;
      }
    } else {
      firstLine = `${brandName} – ${dosesPerDay}\u00a0× dziennie po ${doseStr} przez ${duration}\u00a0dni.`;
    }
    // Obsługa dodatkowych opcji – jeżeli w wywołaniu przekazano obiekt opts,
    // poszczególne pola pozwalają włączyć lub wyłączyć dodatki. Brak pola
    // oznacza wartość true (włączenie).
    const includeProbiotic = opts && opts.includeProbiotic !== false;
    const includeAntipyretic = opts && opts.includeAntipyretic !== false;
    const includeRedFlags = opts && opts.includeRedFlags !== false;
    // Nowe opcje dla sekcji przeciwgorączkowej: czy uwzględniać zawiesiny, czopki oraz tabletki.
    // Brak pola oznacza wartość true, z wyjątkiem sytuacji, gdy w interfejsie nie pokazujemy danego przełącznika.
    const includeSuspension = opts && opts.includeSuspension !== false;
    const includeSuppository = opts && opts.includeSuppository !== false;
    const includeTablet = opts && opts.includeTablet !== false;
    // Definicja linii probiotyku.
    const probioticLine = 'Probiotyk 1\u00a0× dziennie przez 14\u00a0dni.';
    // Pobierz informacje o masie ciała i wieku pacjenta, jeśli funkcje są dostępne.
    const weight = (typeof getWeight === 'function') ? getWeight() : null;
    const ageVal = (typeof getAge === 'function') ? getAge() : null;
    // Pobierz tekst czerwonych flag.
    const red = buildRedFlagsLine();
    // Złóż poszczególne sekcje.
    const lines = [];
    lines.push(firstLine);
    if(includeProbiotic){
      lines.push(probioticLine);
    }
    if(includeAntipyretic && weight && weight > 0){
      const antipy = buildAntipyreticLine(weight, ageVal, includeSuspension, includeSuppository, includeTablet);
      if(antipy){
        lines.push(antipy);
      }
    }
    if(includeRedFlags && red){
      lines.push(red);
    }
    // Zwróć tekst z numeracją.
    return lines.map((ln, idx) => `${idx + 1}. ${ln}`).join('\n');
  }

  /**
   * Tworzy lub aktualizuje sekcję UI odpowiedzialną za wybór nazwy handlowej
   * oraz kopiowanie zaleceń do schowka. Sekcja pojawia się tylko dla
   * preparatów doustnych, które posiadają zdefiniowane przykładowe nazwy
   * handlowe. Dla preparatów dożylnych sekcja pozostaje niewidoczna.
   *
   * @param {string} drugName Nazwa leku (np. "Amoksycylina")
   * @param {string} formName Nazwa postaci leku wybranej przez użytkownika
   * @param {number} dosesPerDay Liczba dawek w ciągu doby
   * @param {string} doseStr Tekst opisujący jedną dawkę (np. "3,25 ml")
   * @param {number} duration Czas trwania terapii w dniach
   */
  function setupRecommendationUI(drugName, formName, dosesPerDay, doseStr, duration){
    const card = document.getElementById('antibioticTherapyCard');
    if(!card) return;
    let recSection = document.getElementById('abxRecSection');
    if(!recSection){
      recSection = document.createElement('div');
      recSection.id = 'abxRecSection';
      recSection.style.marginTop = '.8rem';
      card.appendChild(recSection);
    }
    // Ukryj sekcję domyślnie
    abxSetTrustedMarkup(recSection, '', 'recommendation ui');
    recSection.style.display = 'none';
    // Sprawdź, czy dany lek ma definicję formy
    const drugDef = DRUG_INFO[drugName];
    let formDef = null;
    if(drugDef && drugDef.forms && formName){
      formDef = drugDef.forms[formName];
    }
    if(!formDef) return;
    // Jeśli forma jest fiolką (dożylnie), nie tworzymy sekcji zaleceń
    if(formDef.formType === 'vial'){
      return;
    }
    // Uzyskaj listę nazw handlowych dla kombinacji lek/form.
    // Warianty azytromycyny (np. „Azytromycyna (3 dni)”, „Azytromycyna (5 dni)”) nie mają
    // własnych wpisów w BRAND_NAMES, ale korzystają z tych samych nazw handlowych co
    // podstawowa „Azytromycyna”. Dlatego jeżeli bezpośrednie wyszukanie nie znajdzie
    // listy, spróbujmy usunąć fragment w nawiasie „(3 dni)” lub „(5 dni)” i użyć
    // nazwy bazowej do pobrania mapy marek.
    let brandListMap = BRAND_NAMES[drugName];
    if(!brandListMap){
      const variantMatch = drugName && drugName.match(/^(.+?)\s*\(\d+\s*dni\)$/);
      if(variantMatch){
        const baseName = variantMatch[1].trim();
        brandListMap = BRAND_NAMES[baseName];
      }
    }
    // Odszukaj listę nazw handlowych na podstawie nazwy formy. Najpierw sprawdzamy
    // dokładne dopasowanie, a następnie dokonujemy normalizacji białych znaków
    // (zamiana niełamiących spacji na zwykłe spacje), aby obsłużyć warianty
    // etykiet w formularzu. Dzięki temu klucze w BRAND_NAMES mogą zawierać
    // twarde spacje, a mimo to zostaną znalezione, gdy formularz użyje zwykłych spacji.
    let brandList = null;
    if(brandListMap){
      brandList = brandListMap[formName];
      if(!brandList){
        const normalizedForm = formName ? formName.replace(/\u00A0/g, ' ').trim() : '';
        for(const key in brandListMap){
          if(key.replace(/\u00A0/g, ' ').trim() === normalizedForm){
            brandList = brandListMap[key];
            break;
          }
        }
      }
    }
    if(!brandList || brandList.length === 0){
      return;
    }
    // Przygotuj sekcję interfejsu – instrukcja i przyciski są wyrównane do lewej
    recSection.style.display = 'block';
    recSection.style.textAlign = 'left';
    abxSetTrustedMarkup(recSection, `
      <div id="abxBrandUI" style="border-top: 1px solid #eee; padding-top: .6rem; text-align:left;">
        <p style="margin:.4rem 0 .6rem 0; font-weight:500;">Chcesz mieć gotowe zalecenia? Zaznacz opcje, które mają być widoczne w zaleceniach a następnie wybierz nazwę handlową preparatu i kliknij „Zalecenia do wklejenia”.</p>
        <div id="abxOptionToggles" style="display:flex; flex-direction:column; align-items:flex-start; gap:.4rem; margin-bottom:.6rem;">
          <div class="abx-option-row">
            <span class="abx-option-label">Dodaj leki przeciwgorączkowe</span>
            <label class="abx-switch">
              <input type="checkbox" id="abxToggleAntipyretic" checked>
              <span class="slider"></span>
            </label>
          </div>
          <div class="abx-option-row">
            <span class="abx-option-label">Dodaj probiotyk</span>
            <label class="abx-switch">
              <input type="checkbox" id="abxToggleProbiotic" checked>
              <span class="slider"></span>
            </label>
          </div>
          <div class="abx-option-row">
            <span class="abx-option-label">Dodaj dodatkowe informacje</span>
            <label class="abx-switch">
              <input type="checkbox" id="abxToggleAdditional" checked>
              <span class="slider"></span>
            </label>
          </div>
        </div>
        <div id="abxBrandRow" style="display:flex; gap:.6rem; flex-wrap:wrap; justify-content:flex-start; align-items:center; margin-bottom:.4rem;">
          <button id="abxBrandToggle" type="button">Nazwa handlowa</button>
          <div id="abxBrandList" style="display:flex; gap:.4rem; flex-wrap:wrap;"></div>
        </div>
        <div style="margin-bottom:.4rem;">
          <button id="abxCopyRec" type="button">Zalecenia do wklejenia</button>
          <div id="abxCopyStatus" role="status" aria-live="polite" style="display:none; margin-top:.45rem; font-size:.92rem;"></div>
        </div>
      </div>
    `, 'recommendation ui');
    const listContainer = recSection.querySelector('#abxBrandList');
    // Wypełnij listę przyciskami dla nazw handlowych
    abxSetTrustedMarkup(listContainer, brandList.map((bn, idx) => {
      return `<button type="button" class="abx-brand-option" data-index="${idx}" style="margin:.2rem .4rem .2rem 0;">${abxEscapeHtml(bn)}</button>`;
    }).join(''), 'brand option list');

    // Dodaj dodatkowe przełączniki dla leków przeciwgorączkowych u dzieci (zawiesina i czopki).
    // Te opcje są widoczne, jeżeli wiek dziecka mieści się w zakresie 3 miesiące – 12 lat (3–144 mies.).
    try {
      const ageMonths = (typeof getChildAgeMonths === 'function') ? getChildAgeMonths() : null;
      const togglesDiv = recSection.querySelector('#abxOptionToggles');
      if(togglesDiv && ageMonths !== null){
        // Dzieci 3 miesiące – <6 lat (3–<72 mies.) – przełączniki na zawiesinę i czopki.
        if(ageMonths >= 3 && ageMonths < 72){
          const suspRow = document.createElement('div');
          suspRow.className = 'abx-option-row';
          abxSetTrustedMarkup(suspRow, `
            <span class="abx-option-label">Leki w zawiesinie</span>
            <label class="abx-switch">
              <input type="checkbox" id="abxToggleSuspension" checked>
              <span class="slider"></span>
            </label>
          `, 'antipyretic option row');
          const suppRow = document.createElement('div');
          suppRow.className = 'abx-option-row';
          abxSetTrustedMarkup(suppRow, `
            <span class="abx-option-label">Leki w czopkach</span>
            <label class="abx-switch">
              <input type="checkbox" id="abxToggleSuppository" checked>
              <span class="slider"></span>
            </label>
          `, 'antipyretic option row');
          // Ustal domyślne zaznaczenia w zależności od wieku: do 3 lat – oba zaznaczone; 3–<6 lat – tylko zawiesina.
          try {
            const suspInput = suspRow.querySelector('input');
            const suppInput = suppRow.querySelector('input');
            if(ageMonths < 36){
              if(suspInput) suspInput.checked = true;
              if(suppInput) suppInput.checked = true;
            } else {
              // 3–<6 lat: zawiesina domyślnie wybrana, czopki wyłączone
              if(suspInput) suspInput.checked = true;
              if(suppInput) suppInput.checked = false;
            }
          } catch (error) { logAbxWarn('Zignorowany błąd pomocniczy w module antybiotykoterapii', error); }
          let probioticRow = null;
          const probioticInput = togglesDiv.querySelector('#abxToggleProbiotic');
          if(probioticInput && probioticInput.closest){
            probioticRow = probioticInput.closest('.abx-option-row');
          }
          if(probioticRow){
            togglesDiv.insertBefore(suspRow, probioticRow);
            togglesDiv.insertBefore(suppRow, probioticRow);
          } else {
            togglesDiv.appendChild(suspRow);
            togglesDiv.appendChild(suppRow);
          }
          // Ustaw domyślne zaznaczenie w zależności od wieku: dla dzieci <3 lat zaznacz zarówno
          // zawiesinę, jak i czopki; w przedziale 3–<6 lat zaznacz jedynie zawiesinę.
          try {
            const suspInput = suspRow.querySelector('input');
            const suppInput = suppRow.querySelector('input');
            if(ageMonths < 36){
              if(suspInput) suspInput.checked = true;
              if(suppInput) suppInput.checked = true;
            } else {
              if(suspInput) suspInput.checked = true;
              if(suppInput) suppInput.checked = false;
            }
          } catch (error) { logAbxWarn('Zignorowany błąd pomocniczy w module antybiotykoterapii', error); }
          const antiToggleEl = document.getElementById('abxToggleAntipyretic');
          const updateSubOptions = () => {
            const show = antiToggleEl && antiToggleEl.checked;
            const displayStyle = show ? 'flex' : 'none';
            if(suspRow) suspRow.style.display = displayStyle;
            if(suppRow) suppRow.style.display = displayStyle;
          };
          updateSubOptions();
          if(antiToggleEl){
            antiToggleEl.addEventListener('change', updateSubOptions);
          }
        // Dzieci 6 – <12 lat (72–<144 mies.) – przełączniki na zawiesinę, czopki i tabletki.
        } else if(ageMonths >= 72 && ageMonths < 144){
          const suspRow = document.createElement('div');
          suspRow.className = 'abx-option-row';
          abxSetTrustedMarkup(suspRow, `
            <span class="abx-option-label">Leki w zawiesinie</span>
            <label class="abx-switch">
              <input type="checkbox" id="abxToggleSuspension" checked>
              <span class="slider"></span>
            </label>
          `, 'antipyretic option row');
          const suppRow = document.createElement('div');
          suppRow.className = 'abx-option-row';
          abxSetTrustedMarkup(suppRow, `
            <span class="abx-option-label">Leki w czopkach</span>
            <label class="abx-switch">
              <input type="checkbox" id="abxToggleSuppository" checked>
              <span class="slider"></span>
            </label>
          `, 'antipyretic option row');
          const tabRow = document.createElement('div');
          tabRow.className = 'abx-option-row';
          abxSetTrustedMarkup(tabRow, `
            <span class="abx-option-label">Leki w tabletkach</span>
            <label class="abx-switch">
              <input type="checkbox" id="abxToggleTablet" checked>
              <span class="slider"></span>
            </label>
          `, 'tablet option row');
          let probioticRow = null;
          const probioticInput = togglesDiv.querySelector('#abxToggleProbiotic');
          if(probioticInput && probioticInput.closest){
            probioticRow = probioticInput.closest('.abx-option-row');
          }
          if(probioticRow){
            togglesDiv.insertBefore(suspRow, probioticRow);
            togglesDiv.insertBefore(suppRow, probioticRow);
            togglesDiv.insertBefore(tabRow, probioticRow);
          } else {
            togglesDiv.appendChild(suspRow);
            togglesDiv.appendChild(suppRow);
            togglesDiv.appendChild(tabRow);
          }
          // Domyślnie w grupie wiekowej 6–<12 lat zaznaczamy zawiesinę i tabletki, a odznaczamy czopki.
          try {
            const suspInput = suspRow.querySelector('input');
            const suppInput = suppRow.querySelector('input');
            const tabInput  = tabRow.querySelector('input');
            if(suspInput) suspInput.checked = true;
            if(suppInput) suppInput.checked = false;
            if(tabInput)  tabInput.checked  = true;
          } catch (error) { logAbxWarn('Zignorowany błąd pomocniczy w module antybiotykoterapii', error); }
          const antiToggleEl = document.getElementById('abxToggleAntipyretic');
          const updateSubOptions = () => {
            const show = antiToggleEl && antiToggleEl.checked;
            const displayStyle = show ? 'flex' : 'none';
            if(suspRow) suspRow.style.display = displayStyle;
            if(suppRow) suppRow.style.display = displayStyle;
            if(tabRow) tabRow.style.display = displayStyle;
          };
          updateSubOptions();
          if(antiToggleEl){
            antiToggleEl.addEventListener('change', updateSubOptions);
          }
        // Młodzież 12 – <18 lat (144–<216 mies.) – przełączniki na zawiesinę i tabletki.
        } else if(ageMonths >= 144 && ageMonths < 216){
          const suspRow = document.createElement('div');
          suspRow.className = 'abx-option-row';
          abxSetTrustedMarkup(suspRow, `
            <span class="abx-option-label">Leki w zawiesinie</span>
            <label class="abx-switch">
              <input type="checkbox" id="abxToggleSuspension" checked>
              <span class="slider"></span>
            </label>
          `, 'antipyretic option row');
          const tabRow = document.createElement('div');
          tabRow.className = 'abx-option-row';
          abxSetTrustedMarkup(tabRow, `
            <span class="abx-option-label">Leki w tabletkach</span>
            <label class="abx-switch">
              <input type="checkbox" id="abxToggleTablet" checked>
              <span class="slider"></span>
            </label>
          `, 'tablet option row');
          let probioticRow = null;
          const probioticInput = togglesDiv.querySelector('#abxToggleProbiotic');
          if(probioticInput && probioticInput.closest){
            probioticRow = probioticInput.closest('.abx-option-row');
          }
          if(probioticRow){
            togglesDiv.insertBefore(suspRow, probioticRow);
            togglesDiv.insertBefore(tabRow, probioticRow);
          } else {
            togglesDiv.appendChild(suspRow);
            togglesDiv.appendChild(tabRow);
          }
          // Dla młodzieży ≥12–<18 lat domyślnie zaznaczamy tabletki i odznaczamy zawiesinę.
          try {
            const suspInput = suspRow.querySelector('input');
            const tabInput  = tabRow.querySelector('input');
            if(suspInput) suspInput.checked = false;
            if(tabInput)  tabInput.checked  = true;
          } catch (error) { logAbxWarn('Zignorowany błąd pomocniczy w module antybiotykoterapii', error); }
          const antiToggleEl = document.getElementById('abxToggleAntipyretic');
          const updateSubOptions = () => {
            const show = antiToggleEl && antiToggleEl.checked;
            const displayStyle = show ? 'flex' : 'none';
            if(suspRow) suspRow.style.display = displayStyle;
            if(tabRow) tabRow.style.display = displayStyle;
          };
          updateSubOptions();
          if(antiToggleEl){
            antiToggleEl.addEventListener('change', updateSubOptions);
          }
        }
      }
    } catch(error) {
      logAbxWarn('Nie udało się dodać opcji leków przeciwgorączkowych zależnych od wieku', error);
    }
    // Zarządzanie wyborem nazwy handlowej
    let selectedIndex = 0;
    const brandButtons = listContainer.querySelectorAll('.abx-brand-option');
    function updateBrandSelection(i){
      // Zapamiętaj indeks wybranego preparatu
      selectedIndex = i;
      brandButtons.forEach((btn, j) => {
        // Zaznacz bieżący wybór poprzez wytłuszczenie i podkreślenie tekstu
        // oraz dodanie klasy .active-toggle, która nadaje turkusową ramkę
        if(j === selectedIndex){
          btn.style.fontWeight = 'bold';
          btn.style.textDecoration = 'underline';
          btn.classList.add('active-toggle');
        } else {
          btn.style.fontWeight = 'normal';
          btn.style.textDecoration = 'none';
          btn.classList.remove('active-toggle');
        }
      });
    }
    updateBrandSelection(selectedIndex);
    brandButtons.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        updateBrandSelection(i);
      });
    });
    // Obsługa kliknięcia przycisku „Nazwa handlowa” – rozwija listę
    const toggleBtn = recSection.querySelector('#abxBrandToggle');
    if(toggleBtn){
      toggleBtn.addEventListener('click', () => {
        // W nowym układzie lista nazw handlowych jest zawsze widoczna.
        // Kliknięcie przycisku jedynie przełącza klasę podkreślającą aktywność.
        toggleBtn.classList.toggle('active-toggle');
      });
    }
    // Obsługa kopiowania zaleceń do schowka
    const copyBtn = recSection.querySelector('#abxCopyRec');
    const copyStatus = recSection.querySelector('#abxCopyStatus');

    function showCopyStatus(message, manualText){
      if(!copyStatus) return;
      abxClearElement(copyStatus);
      copyStatus.style.display = '';
      const msg = document.createElement('div');
      msg.textContent = message || '';
      copyStatus.appendChild(msg);
      if(manualText){
        const box = document.createElement('textarea');
        box.readOnly = true;
        box.value = manualText;
        box.setAttribute('aria-label', 'Wygenerowane zalecenia do ręcznego skopiowania');
        box.style.width = '100%';
        box.style.minHeight = '7rem';
        box.style.marginTop = '.35rem';
        box.style.fontSize = '.9rem';
        box.addEventListener('focus', () => { try { box.select(); } catch (error) { logAbxWarn('Nie udało się zaznaczyć tekstu zaleceń.', error); } });
        copyStatus.appendChild(box);
      }
    }

    function copyTextWithTextarea(text){
      const ta = document.createElement('textarea');
      ta.value = text || '';
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      try {
        ta.focus();
        ta.select();
        return !!document.execCommand && document.execCommand('copy');
      } finally {
        if(ta.parentNode) ta.parentNode.removeChild(ta);
      }
    }

    async function copyRecommendationText(text){
      if(navigator.clipboard && typeof navigator.clipboard.writeText === 'function'){
        await navigator.clipboard.writeText(text);
        return true;
      }
      if(copyTextWithTextarea(text)) return true;
      throw new Error('Clipboard API jest niedostępne.');
    }

    if(copyBtn){
      copyBtn.addEventListener('click', async () => {
        const brandName = brandList[selectedIndex];
        // Odczytaj stan przełączników opcji. Jeśli elementy nie istnieją (np. dla postaci dożylnych),
        // pozostaw pola niezdefiniowane, aby funkcja generateRecommendation użyła wartości domyślnych.
        const opts = {};
        const antiToggle = document.getElementById('abxToggleAntipyretic');
        if(antiToggle){
          opts.includeAntipyretic = antiToggle.checked;
        }
        const proToggle = document.getElementById('abxToggleProbiotic');
        if(proToggle){
          opts.includeProbiotic = proToggle.checked;
        }
        const addToggle = document.getElementById('abxToggleAdditional');
        if(addToggle){
          opts.includeRedFlags = addToggle.checked;
        }
            // Pobierz ustawienia dla leków w zawiesinie i czopkach (dla dzieci 3 mies.–12 lat).
            const suspToggle = document.getElementById('abxToggleSuspension');
            if(suspToggle){
              opts.includeSuspension = suspToggle.checked;
            }
            const suppToggle = document.getElementById('abxToggleSuppository');
            if(suppToggle){
              opts.includeSuppository = suppToggle.checked;
            }
            // Dla młodzieży 12–18 lat obsługuj tabletki przeciwgorączkowe i
            // domyślnie wyłącz czopki, jeśli przycisk czopków nie istnieje.
            const tabToggle = document.getElementById('abxToggleTablet');
            if(tabToggle){
              opts.includeTablet = tabToggle.checked;
              // Jeżeli nie ma przełącznika czopków, ustaw includeSuppository na false,
              // aby uniknąć wyświetlania sekcji czopków w zaleceniach.
              if(!suppToggle){
                opts.includeSuppository = false;
              }
            }
        const recText = generateRecommendation(brandName, dosesPerDay, doseStr, duration, opts);
        const oldTxt = copyBtn.textContent;
        try {
          await copyRecommendationText(recText);
          copyBtn.textContent = 'Skopiowano!';
          copyBtn.classList.add('active-toggle');
          showCopyStatus('Zalecenia skopiowano do schowka.', '');
          setTimeout(() => { copyBtn.textContent = oldTxt; }, 2000);
        } catch (error) {
          logAbxWarn('Nie udało się skopiować zaleceń antybiotykoterapii do schowka', error);
          copyBtn.textContent = oldTxt;
          showCopyStatus('Nie udało się automatycznie skopiować zaleceń. Zaznacz i skopiuj tekst poniżej ręcznie.', recText);
        }
      });
    }
  }

  // Definicja wskazań wraz z dostępnymi w nich lekami i parametrami dawkowania.
  // Każdy wpis zawiera etykietę (label) oraz obiekt drugs. Jeśli pole drugs jest
  // pominięte, oznacza to, że antybiotykoterapia nie jest zalecana; wówczas
  // wyświetlamy komunikat zawarty w polu message. Każdy lek w sekcji drugs
  // posiada zakres dawek [min,max] w mg/kg/dobę (mgRange), domyślną wartość
  // sugerowaną (defaultMg), liczbę dawek/dobę (doses) oraz rekomendowany czas
  // trwania w dniach (duration). Pole firstChoice=true wyróżnia preparat
  // pierwszego wyboru, który jest domyślnie wybierany po zmianie wskazania.
// -----------------------------------------------------------------------------
// Global maximum daily doses (mg per day) for oral antibiotics.
// These limits apply across all indications to prevent unrealistic dosing.
// Each entry defines the maximum dose for children (<40 kg) and adults (≥40 kg).
// Values are derived from official guidelines (CDC/IDSA/ChPL) and clinical
// practice recommendations. If a value is set to null, it means no global limit
// is applied and the specific drug definition or clinical context will govern
// dosing.
const GLOBAL_MAX_DAILY_DOSES = {
  // Fenoksymetylpenicylina – zgodnie z Charakterystyką Produktu Leczniczego
  // preparatu Ospen 1500, dorośli o masie ≥60 kg powinni otrzymywać około
  // 4,5 mln j.m. fenoksymetylpenicyliny na dobę (1,5 mln j.m. trzy razy dziennie),
  // co odpowiada ok. 2 943 mg fenoksymetylpenicyliny na dobę.
  // Dorośli o masie <60 kg oraz dzieci i młodzież o masie >40 kg otrzymują
  // zazwyczaj 3 mln j.m./dobę (1 mln j.m. 3 ×/dobę), czyli ok. 1 962 mg/dobę.
  // U dzieci (zwłaszcza <40 kg) dawki są podawane w zakresie 50 000–100 000 j.m./kg/dobę
  // (≈33–65 mg/kg/dobę), co przy 40 kg masy ciała daje
  // maksymalnie ok. 2 600 mg/dobę. Aby odzwierciedlić te wartości i uniknąć
  // ograniczania dobowej dawki do zbyt niskiej wartości 1 000 mg, podnosimy
  // globalne limity: do 2 600 mg/dobę u dzieci (<40 kg) i 3 000 mg/dobę u
  // pacjentów dorosłych (≥40 kg). Te limity odpowiadają odpowiednio około
  // 4 mln j.m. i 4,6 mln j.m. na dobę i są zgodne z zaleceniami ChPL.
  'Fenoksymetylpenicylina': { child: 2600, adult: 3000 },
  // Amoksycylina: w ostrym zapaleniu zatok i ucha oraz innych zakażeniach górnych
  // dróg oddechowych stosuje się zarówno standardowe dawki 45 mg/kg/dobę, jak i
  // wysokodawkowe schematy 80–90 mg/kg/dobę w 2 podaniach. Wytyczne AAP/MedStar
  // dopuszczają podawanie 80–90 mg/kg/dobę z limitem 2 g na dawkę (≈4 g/dobę).
  // Aby umożliwić pełne wykorzystanie schematu 90 mg/kg/dobę u dzieci o masie 40 kg
  // (3 600 mg/dobę), zwiększamy pediatryczny limit z 3 000 mg do 3 600 mg/dobę.
  // Limit dla dorosłych pozostaje 4 000 mg/dobę.
  'Amoksycylina': { child: 3600, adult: 4000 },
  // Amoksycylina z kwasem klawulanowym (koamoksyklaw) – zgodnie z wytycznymi,
  // standardowa dawka wynosi 45 mg/kg/dobę, a wysokodawkowa 80–90 mg/kg/dobę
  // amoksycyliny w dwóch dawkach. Preparaty o wysokiej
  // zawartości amoksycyliny (np. Augmentin ES 600 mg/5 ml) umożliwiają podawanie
  // maksymalnie 2 g na dawkę (4 g/dobę). Poprzedni limit 3 000 mg/dobę mógł
  // ograniczać pełną dawkę u większych dzieci (~40 kg), dlatego zwiększamy
  // pediatryczny limit do 3 600 mg/dobę. Limit dla dorosłych pozostaje 4 000 mg/dobę.
  // Amoksycylina z kwasem klawulanowym (ko‑amoksyklaw) – zgodnie z nowymi wytycznymi
  // ograniczamy globalną maksymalną dawkę dobową do 3 000 mg niezależnie od masy
  // ciała pacjenta. Dotychczasowe limity 3 600 mg u dzieci i 4 000 mg u dorosłych
  // pozwalały na podawanie wysokich dawek 90 mg/kg/dobę u pacjentów o masie ~40 kg,
  // jednak w większości wskazań stosuje się mniejsze dawki. W przypadkach
  // wymagających większej podaży (np. ostre zapalenie błony śluzowej nosa i zatok
  // przynosowych) odpowiedni limit będzie ustawiony lokalnie w logice funkcji
  // recalc().  W pozostałych sytuacjach dozwolona maksymalna dawka dobowa
  // ko‑amoksyklawu wynosi 3 000 mg zarówno dla dzieci (<40 kg), jak i dorosłych
  // (≥40 kg).
  'Amoksycylina z kwasem klawulanowym': { child: 3000, adult: 3000 },
  // Duplicate entry with non-breaking spaces (\u00a0) for UI strings that use NBSP.
  // Ujednolicamy limity dobowej dawki ko‑amoksyklawu z czystą amoksycyliną: 3 600 mg/dobę
  // u dzieci <40 kg i 4 000 mg/dobę u pacjentów ≥40 kg. Poprzednio stosowano 3 000/4 000 mg;
  // aktualizacja pozwala na podanie pełnej dawki 90 mg/kg/dobę u pacjentów o masie 40 kg.
  // Wariant z twardymi spacjami (NBSP) dla zgodności z etykietami UI.  Patrz komentarz
  // powyżej – limit dobowy wynosi 3 000 mg dla obu grup wiekowych.
  'Amoksycylina\u00a0z\u00a0kwasem\u00a0klawulanowym': { child: 3000, adult: 3000 },
  // Cefaleksyna – w powikłanych zakażeniach układu moczowego dawki mogą sięgać 25 mg/kg
  // cztery razy na dobę (100 mg/kg/dobę), co u pacjentów ważących 40 kg daje 4 000 mg/dobę.
  // Aby umożliwić stosowanie pełnych dawek w ciężkich zakażeniach, zwiększamy limit pediatryczny z 2 000 mg do 4 000 mg/dobę,
  // pozostawiając limit dorosłych bez zmian (4 000 mg). W innych wskazaniach dawkę ogranicza lokalny parametr maxDailyMg.
  'Cefaleksyna': { child: 4000, adult: 4000 },
  'Cefadroksyl': { child: 1000, adult: 1000 },
  // Aksetyl cefuroksymu (cefuroksym doustny) – w leczeniu niepowikłanych zakażeń układu moczowego
  // zaleca się 15 mg/kg mc. dwa razy na dobę (30 mg/kg/dobę) z maksymalną dawką 250 mg na
  // pojedynczą dawkę, co odpowiada 500 mg/dobę.  
  // Dlatego ograniczamy zarówno dziecięcy, jak i dorosły limit do 500 mg/dobę, aby nie przekroczyć
  // maksymalnej dawki wynikającej z CHPL.
  // Aksetyl cefuroksymu (cefuroksym doustny) – maksymalna dobowa dawka zależy od wskazania.
  // W niepowikłanych zakażeniach układu moczowego zaleca się 15 mg/kg mc. dwa razy na dobę
  // (30 mg/kg/dobę), co daje maks. 250 mg na dawkę (500 mg/dobę).
  // Jednak w ostrym zapaleniu zatok przynosowych oraz zapaleniu ucha środkowego stosuje się
  // 30 mg/kg mc./dobę w dwóch dawkach z limitem 500 mg na dawkę, czyli do 1 000 mg/dobę.
  // Aby umożliwić pełne wykorzystanie dawki w tych wskazaniach bez ograniczania do 500 mg,
  // podnosimy globalny limit do 1 000 mg/dobę zarówno dla dzieci, jak i dorosłych. Ograniczenia
  // do 500 mg/dobę w zakażeniach układu moczowego będą ustawiane lokalnie w definicji leku.
  'Aksetyl cefuroksymu': { child: 1000, adult: 1000 },
  // Klarytromycyna – standardowo 500 mg/dobę u dzieci; u dorosłych do 1 g/dobę w ciężkich zakażeniach.
  'Klarytromycyna': { child: 500, adult: 1000 },
  // Azytromycyna – w terapii 5‑dniowej: 500 mg w dniu 1, następnie 250 mg/dobę.
  'Azytromycyna': { child: 500, adult: 500 },
  // Wariant trzydniowy azytromycyny (nazwany „Azytromycyna (3 dni)”) stosuje
  // te same ograniczenia dobowe co standardowa terapia: maksymalnie 500 mg/dobę
  // zarówno u dzieci, jak i u dorosłych. Definicja ta zapobiega
  // przekroczeniu limitu podczas obliczeń.
  // Wersja z normalną spacją w nazwie (3 dni) – te same limity co powyżej.
  'Azytromycyna (3 dni)': { child: 500, adult: 500 },
  // Wariant pięciodniowy w pozaszpitalnym zapaleniu płuc u dorosłych – pozostaje limit 500 mg/dobę,
  // ponieważ dzienna dawka wynosi ~250 mg.  Globalny limit zapobiega podaniu większej dawki.
  'Azytromycyna (5 dni)': { child: 500, adult: 500 },
  // Wariant siedmiodniowy azytromycyny na potrzeby leczenia boreliozy – zachowuje limit 500 mg/dobę
  // zarówno dla dzieci, jak i dorosłych, tak jak w innych schematach azytromycyny.
  'Azytromycyna (7 dni)': { child: 500, adult: 500 },
  /*
   * Usunięto wariant jednodniowy azytromycyny („Azytromycyna (1 dzień)”) z globalnej tabeli limitów,
   * ponieważ jednorazowe podanie 2 g nie jest już rekomendowane.  Pozostawiono tylko limity
   * dla schematów 3‑dniowych i 5‑dniowych.
   */
  // Klindamycyna – zgodnie z aktualizacją: 20–30 mg/kg/dobę u dzieci i dorosłych, maksymalnie 1,8 g/dobę.
  // Ujednolicamy limit do 1 800 mg/dobę zarówno dla dzieci, jak i dorosłych.
  'Klindamycyna': { child: 1800, adult: 1800 },
  // Cefiksym – zazwyczaj 400 mg/dobę zarówno u dzieci jak i u dorosłych.
  'Cefiksym': { child: 400, adult: 400 },
  // Ceftibuten – podobnie jak cefiksym, 9 mg/kg/dobę (max 400 mg).
  'Ceftibuten': { child: 400, adult: 400 },
  // Cefaklor – w preparatach doustnych IR maksymalnie 1 g/dobę zarówno u dzieci, jak i u dorosłych. Wersja o przedłużonym uwalnianiu (375 mg co 12 h) daje 750 mg/dobę.
  // Dlatego przyjmujemy bezpieczny limit 1 g/dobę dla obu grup.
  'Cefaklor': { child: 1000, adult: 1000 },
  // Furazydyna (nitrofurantoina) – zgodnie z zaleceniami 5–7 mg/kg/dobę w czterech dawkach u dzieci; maksymalnie 400 mg/dobę u dzieci i dorosłych.
  'Furazydyna': { child: 400, adult: 400 },
  // Trimetoprim – dzieci zwykle otrzymują 5 mg/kg co 12 h (max 200 mg na dawkę),
  // co odpowiada ok. 400 mg/dobę czystego trimetoprimu. U dorosłych
  // stosuje się 100 mg co 12 h (200 mg/dobę) lub 200 mg jednorazowo.
  // Trimetoprim – w niepowikłanych zakażeniach dróg moczowych dorośli otrzymują 200 mg co 12 h
  // (400 mg/dobę), a dzieci 6–12 lat 2–4 mg/kg mc. co 12 h (4–8 mg/kg/dobę).  
  // Wcześniejszy limit 200 mg/dobę dla dorosłych powodował niedodawkowanie; podnosimy go do 400 mg.  
  'Trimetoprim': { child: 400, adult: 400 },
  // Trimetoprim‑sulfametoksazol (kotrimoksazol) – ograniczenia dotyczą całkowitej
  // zawartości obu składników (trimetoprimu i sulfametoksazolu). U dzieci dawka
  // dobowo 6 mg trimetoprimu + 30 mg sulfametoksazolu/kg masy ciała odpowiada
  // ok. 36 mg/kg/dobę całkowitej substancji czynnej. U pacjenta
  // o masie 20 kg daje to ~720 mg/dobę; dlatego wcześniejszy limit 480 mg/dobę
  // powodował niedodawkowanie. Zaktualizowano limit pediatryczny do 960 mg/dobę,
  // co pozwala na zastosowanie pełnej dawki u dzieci o masie do ~26–30 kg. U
  // dorosłych stosuje się 160 mg trimetoprimu + 800 mg sulfametoksazolu co 12 h
  // (960 mg na dawkę, 1 920 mg/dobę) w cięższych zakażeniach.
  'Trimetoprim-sulfametoksazol': { child: 960, adult: 1920 },
  // Fosfomycyna – pojedyncza dawka 3 g (3000 mg) u dorosłych i dzieci ≥12 lat.
  'Fosfomycyna': { child: 3000, adult: 3000 },
  // Fluorochinolony: ustawiono umiarkowane limity, choć rzadko stosowane u dzieci.
  'Ciprofloxacyna': { child: 1000, adult: 1500 },
  'Cyprofloksacyna': { child: 1000, adult: 1500 },
  // Dodajemy osobne limity dobowe dla wariantów doustnych i dożylnych cyprofloksacyny.
  // Doustna cyprofloksacyna może być podawana w dawkach do 750 mg dwa razy na dobę
  // (1 500 mg/dobę), natomiast dożylna postać jest zwykle
  // ograniczona do 400 mg 2–3 ×/dobę (maks. 1 200 mg/dobę).
  'Cyprofloksacyna (doustna)': { child: 1000, adult: 1500 },
  'Cyprofloksacyna (dożylna)': { child: 1000, adult: 1200 },
  'Lewofloksacyna': { child: 500, adult: 1000 },
  'Lewofloksacyna i.v.': { child: 500, adult: 1000 },
  // Doksycyklina – standardowa dawka u dorosłych wynosi 100 mg co 12 h (200 mg/dobę).
  // Ograniczamy dobowe spożycie do 200 mg u dzieci i dorosłych.
  'Doksycyklina': { child: 200, adult: 200 },
  // Cefpodoksym – w pozaszpitalnym zapaleniu płuc podaje się 200 mg dwa razy na dobę.
  // Maksymalna dawka dobowa wynosi 400 mg.
  'Cefpodoksym': { child: 400, adult: 400 },
  // Moksyfloksacyna – fluoroquinolon, którego zalecana dawka wynosi 400 mg raz na dobę.
  // Limitujemy całkowitą dawkę do 400 mg/dobę u dzieci i dorosłych.
  'Moksyfloksacyna': { child: 400, adult: 400 },
  // Kloksacylina – beta-laktam przeciwgronkowcowy; zwykle do 2 g/dobę u dzieci i 4 g/dobę u dorosłych.
  'Kloksacylina': { child: 2000, adult: 4000 },
  // Metronidazol – do 750 mg/dobę u dzieci i 1 500 mg/dobę u dorosłych w zakażeniach jamy brzusznej.
  'Metronidazol': { child: 750, adult: 1500 },
  // Linezolid – 30 mg/kg/dobę u dzieci (max 600 mg), 600 mg 2×/dobę u dorosłych (1 200 mg).
  'Linezolid': { child: 600, adult: 1200 },
  // Wankomycyna – brak doustnych form maksymalnych; nie ustalamy limitów.
  'Wankomycyna': { child: null, adult: null },
  // Gentamycyna – u dzieci i dorosłych w powikłanych ZUM maks. 3–6 mg/kg/dobę,
  // co przy masie 40 kg daje około 240 mg/dobę.
  // Ustalamy górny limit 240 mg/dobę dla obu grup, zapobiegając przekroczeniu zalecanych dawek.
  'Gentamycyna': { child: 240, adult: 240 },
  // Piperacylina z tazobaktamem – 112,5 mg/kg co 8 h u dzieci (około 13 500 mg/dobę dla 40 kg) i 4,5 g co 8 h u dorosłych.
  // Ustalono limit 13 500 mg/dobę zarówno dla dzieci, jak i dorosłych.
  'Piperacylina z tazobaktamem': { child: 13500, adult: 13500 },
  // Imipenem z cilastatyną – maksymalna dobowa dawka wynosi 4 g u dorosłych i dzieci starszych.
  'Imipenem z cilastatyną': { child: 4000, adult: 4000 },
  // Meropenem – zazwyczaj stosuje się do 6 g/dobę u dzieci i dorosłych w ciężkich zakażeniach.
  'Meropenem': { child: 6000, adult: 6000 },
  // Doripenem – u dorosłych 500 mg co 8 h (1,5 g/dobę) lub 1 g co 8 h (3 g/dobę) w ciężkich zakażeniach.
  // Brak danych pediatrycznych; przyjmujemy konserwatywny limit 3 000 mg/dobę dla obu grup.
  'Doripenem': { child: 3000, adult: 3000 },
  // Cefuroksym (dożylnie) – maksymalnie 4,5 g/dobę (1,5 g co 8 h) zarówno u dzieci ≥40 kg, jak i dorosłych.
  'Cefuroksym (dożylnie)': { child: 4500, adult: 4500 },
  // Cefotaksym – u dorosłych zwykle do 6 g/dobę (1–2 g co 8 h), sporadycznie do 12 g; u dzieci do 100 mg/kg/dobę (≈4–6 g przy masie 40 kg).
  // Ustalamy konserwatywny limit 6 000 mg/dobę dla obu grup.
  'Cefotaksym': { child: 6000, adult: 6000 },
  // Ceftriakson – jedna dawka 1–2 g/dobę u dorosłych; dzieci do 50 mg/kg/dobę (max 2 g).
  'Ceftriakson': { child: 2000, adult: 2000 },
  // Cefepim – maksymalnie 6 g/dobę u dorosłych i dzieci (50–150 mg/kg/dobę przy masie 40 kg).
  'Cefepim': { child: 6000, adult: 6000 },
// Amikacyna – limit 1,5 g/dobę dla dzieci i dorosłych zgodnie z wytycznymi.
'Amikacyna': { child: 1500, adult: 1500 }
};

/*
 * Schematy leczenia boreliozy (Lyme)
 *
 * Dane wczytane z pliku lyme_treatment_schemes.json i wbudowane w kod jako stała.
 * Struktura pola 'schemes' przedstawia warunki kliniczne wraz z zalecanymi lekami,
 * dawkami, drogą podania i typowym czasem terapii dla dorosłych oraz dzieci.
 * Lista jest wykorzystywana do dynamicznego budowania rozwijanej sekcji „Schematy leczenia”
 * w interfejsie dla wskazania „Leczenie boreliozy”.
 */
const LYME_SCHEMES = {
  "label": "Schematy leczenia",
  "description": "Aktualne schematy leczenia boreliozy z Lyme według zaleceń europejskich i polskich. Dane podano w podziale na manifestacje kliniczne z zalecanymi antybiotykami, dawkami, drogą podania i typowym czasem terapii.",
  "schemes": [
    {
      "condition": "Rumień wędrujący (EM) – wczesna borelioza",
      "adult": [
        { "drug": "Doksycyklina", "dosage": "100 mg 2× / dzień", "route": "p.o.", "duration": "10–21 dni" },
        { "drug": "Amoksycylina", "dosage": "500 mg 3× / dzień", "route": "p.o.", "duration": "14–21 dni" },
        { "drug": "Aksetyl cefuroksymu", "dosage": "500 mg 2× / dzień", "route": "p.o.", "duration": "14–21 dni" },
        { "drug": "Azytromycyna", "dosage": "500 mg 1× / dzień (pierwsza dawka 500–1000 mg)", "route": "p.o.", "duration": "5–10 dni", "note": "Alternatywa przy nietolerancji β‑laktamów" }
      ],
      "children": [
        { "drug": "Amoksycylina", "dosage": "25–50 mg/kg/d", "route": "p.o.", "duration": "14–21 dni", "frequency": "3 dawki dziennie" },
        { "drug": "Cefuroksym", "dosage": "30–40 mg/kg/d", "route": "p.o.", "duration": "14–21 dni", "frequency": "2 dawki dziennie" },
        { "drug": "Doksycyklina", "dosage": "4,4 mg/kg/d (max. 100 mg 2×)", "route": "p.o.", "duration": "10–21 dni", "note": "Stosować z uwzględnieniem wieku i tolerancji" }
      ]
    },
    {
      "condition": "Neuroborelioza – wczesna",
      "adult": [
        { "drug": "Doksycyklina", "dosage": "100 mg 2× / dzień", "route": "p.o.", "duration": "14–28 dni" },
        { "drug": "Ceftriakson", "dosage": "2 g 1× / dzień", "route": "i.v.", "duration": "14–21 dni" },
        { "drug": "Cefotaksym", "dosage": "2 g 3× / dzień", "route": "i.v.", "duration": "14–21 dni", "note": "Alternatywa" },
        { "drug": "Penicylina G", "dosage": "18–24 mln j./d (podzielone na 6 dawek)", "route": "i.v.", "duration": "14–21 dni", "note": "Alternatywa" }
      ],
      "children": [
        { "drug": "Doksycyklina", "dosage": "4,4 mg/kg/d (max. 100 mg 2×)", "route": "p.o.", "duration": "14–28 dni" },
        { "drug": "Ceftriakson", "dosage": "50–100 mg/kg/d", "route": "i.v.", "duration": "14–21 dni" },
        { "drug": "Cefotaksym", "dosage": "150 mg/kg/d podzielone na 3 dawki", "route": "i.v.", "duration": "14–21 dni" },
        { "drug": "Penicylina G", "dosage": "200 000–400 000 j/kg/d", "route": "i.v.", "duration": "14–21 dni" }
      ]
    },
    {
      "condition": "Neuroborelioza – późna (cięższe OUN)",
      "adult": [
        { "drug": "Ceftriakson", "dosage": "2 g 1× / dzień", "route": "i.v.", "duration": "21–28 dni" },
        { "drug": "Doksycyklina", "dosage": "100 mg 2× / dzień", "route": "p.o. lub i.v.", "duration": "21–28 dni", "note": "Rozważyć przy łagodniejszych objawach" },
        { "drug": "Cefotaksym", "dosage": "2 g 3× / dzień", "route": "i.v.", "duration": "21–28 dni" },
        { "drug": "Penicylina G", "dosage": "18–24 mln j./d", "route": "i.v.", "duration": "21–28 dni" }
      ],
      "children": [
        { "drug": "Ceftriakson", "dosage": "50–100 mg/kg/d", "route": "i.v.", "duration": "21–28 dni" },
        { "drug": "Doksycyklina", "dosage": "4,4 mg/kg/d (max. 100 mg 2×)", "route": "p.o.", "duration": "21–28 dni" },
        { "drug": "Cefotaksym", "dosage": "150 mg/kg/d podzielone na 3 dawki", "route": "i.v.", "duration": "21–28 dni" },
        { "drug": "Penicylina G", "dosage": "200 000–400 000 j/kg/d", "route": "i.v.", "duration": "21–28 dni" }
      ]
    },
    {
      "condition": "Zapalenie stawów (Lyme arthritis)",
      "adult": [
        { "drug": "Doksycyklina", "dosage": "100 mg 2× / dzień", "route": "p.o.", "duration": "21–28 dni" },
        { "drug": "Amoksycylina", "dosage": "500 mg 3× / dzień", "route": "p.o.", "duration": "21–28 dni" },
        { "drug": "Aksetyl cefuroksymu", "dosage": "500 mg 2× / dzień", "route": "p.o.", "duration": "21–28 dni" },
        { "drug": "Ceftriakson", "dosage": "2 g 1× / dzień", "route": "i.v.", "duration": "21–28 dni", "note": "W przypadku ciężkich objawów lub braku poprawy" }
      ],
      "children": [
        { "drug": "Amoksycylina", "dosage": "25–50 mg/kg/d", "route": "p.o.", "duration": "21–28 dni", "frequency": "3 dawki dziennie" },
        { "drug": "Cefuroksym", "dosage": "30–40 mg/kg/d", "route": "p.o.", "duration": "21–28 dni", "frequency": "2 dawki dziennie" },
        { "drug": "Doksycyklina", "dosage": "4,4 mg/kg/d (max. 100 mg 2×)", "route": "p.o.", "duration": "21–28 dni" },
        { "drug": "Ceftriakson", "dosage": "50–100 mg/kg/d", "route": "i.v.", "duration": "21–28 dni", "note": "W przypadku ciężkich objawów lub braku poprawy" }
      ]
    },
    {
      "condition": "Profilaktyka po ukąszeniu kleszcza (wysokie ryzyko)",
      "adult": [
        { "drug": "Doksycyklina", "dosage": "200 mg jednorazowo (4,4 mg/kg)", "route": "p.o.", "duration": "1 dawka", "note": "Podać w ciągu 72 h od usunięcia kleszcza" }
      ],
      "children": [
        { "drug": "Doksycyklina", "dosage": "4,4 mg/kg (max. 200 mg)", "route": "p.o.", "duration": "1 dawka", "note": "Do rozważenia u dzieci powyżej minimalnego wieku; podać w ciągu 72 h od usunięcia kleszcza" }
      ]
    }
  ]
};

// Mapa odniesień cytatów do rzeczywistych adresów URL.  Poszczególne komunikaty
// w sekcji „Antybiotykoterapia” odwołują się do konkretnych źródeł (np.
// artykułów przeglądowych, stron CDC czy monografii leków).  Ponieważ
// identyfikatory cytatów w kodzie (np. „”) są
// specyficzne dla wewnętrznego systemu dokumentacji, ta mapa tłumaczy je
// na bardziej czytelne adresy internetowe, które zostaną wyświetlone w
// sekcji „Źródła”.  Jeśli cytat nie jest zmapowany, wówczas zostanie
// wyświetlony jego oryginalny identyfikator.
const CITATION_MAP = {
  '': 'https://pubmed.ncbi.nlm.nih.gov/14770076/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/14770076/',
  // Wytyczne CDC dotyczące leczenia paciorkowcowego zapalenia gardła –
  // witryna z informacjami o dawkowaniu azytromycyny, klarytromycyny i
  // zaleceniach dla pacjentów z alergią na beta‑laktamy.  W kodzie
  // wykorzystujemy tę samą stronę dla kilku odwołań.
  // Adres prowadzi do oficjalnej strony CDC dla pracowników służby zdrowia
  // (https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html),
  // która zawiera zalecenia terapeutyczne dla zakażenia Streptococcus pyogenes.
  // Odwołania te są wykorzystywane w komunikatach informujących o dawkowaniu
  // makrolidów i ograniczeniach związanych z opornością na te antybiotyki.
  // CDC clinical guidance for treating Group A streptococcal pharyngitis.
  // The original URL (https://www.cdc.gov/groupastrep/clinicians.html) is now a dead link.
  // Replace it with the current CDC page for healthcare providers:
  // https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html
  // which contains dosing recommendations for azithromycin, clarithromycin and
  // other alternatives for penicillin‑allergic patients.
  '': 'https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html',
  // W tym cytowaniu podkreślamy informację o oporności Streptococcus pyogenes na makrolidy i klindamycynę –
  // adres prowadzi do tej samej strony CDC, ale z fragmentem dotyczącym oporności (zakotwiczony nagłówek
  // „Antibiotic resistance”).  Wcześniej używany anchor #resistance nie istniał, dlatego teraz link
  // odwołuje się do identyfikatora nagłówka (#heading-1naimcchq5).  To pozwala odróżnić źródła
  // w sekcji Źródła i zapobiega duplikacji identycznych adresów.
  // Anchor pointing to the “Antibiotic resistance” section on the same CDC page.
  // The previous URL used a non‑existent #resistance anchor; the new anchor
  // (#heading-1naimcchq5) links directly to the relevant section of the page
  // describing the absence of penicillin resistance and the variable
  // resistance to macrolides and clindamycin.
  '': 'https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html#heading-1naimcchq5',
  // Strona z dawkowaniem cefakloru w zakażeniach paciorkowcowych –
  // zawiera informacje o 20–40 mg/kg mc./dobę podzielonych co 8–12 h i
  // minimalnym czasie terapii 10 dni.
  '': 'https://www.drugs.com/dosage/cefaclor.html',
  // Strona z dawkowaniem klarytromycyny (usual adult and pediatric dose for
  // tonsillitis/pharyngitis: 250–500 mg co 12 h dla dorosłych oraz
  // 7,5 mg/kg co 12 h dla dzieci) – wykorzystujemy
  // ten odnośnik do generowania sekcji Źródła przy komunikatach
  '': 'https://www.drugs.com/dosage/clarithromycin.html'
  ,
  // ----- Now add mappings for citations used in the sinusitis module -----
  // Observational management and watchful waiting in acute bacterial rhinosinusitis
  // Up to 80% of children improve without antibiotics; amoxicillin alone is preferred to
  // amoxicillin‑clavulanate for most patients, and cephalosporins are inferior to high‑dose
  // amoxicillin.  This link points to the StatPearls article on
  // acute sinusitis hosted by the U.S. National Library of Medicine.
  '': 'https://www.ncbi.nlm.nih.gov/books/NBK547701/#general-principles',
  // Preference for amoxicillin over amoxicillin‑clavulanate in non‑severe acute sinusitis and
  // recommendation to reserve amoxicillin‑clavulanate for treatment failure or high‑risk
  // patients.  This anchor differentiates the source in the same
  // StatPearls article.
  '': 'https://www.ncbi.nlm.nih.gov/books/NBK547701/#amoxicillin-versus-amoxclav',
  // Oral cephalosporins, including cefuroxime, are less effective than high‑dose amoxicillin
  // and should be reserved for patients with true penicillin allergy.
  '': 'https://www.ncbi.nlm.nih.gov/books/NBK547701/#cephalosporins',
  // Macrolides (azithromycin, clarithromycin) have poor activity against Streptococcus
  // pneumoniae and Haemophilus influenzae and are not recommended for empirical therapy
  // in acute bacterial rhinosinusitis.
  '': 'https://www.ncbi.nlm.nih.gov/books/NBK547701/#macrolides',
  // Clinical failure is defined as lack of improvement within 72 hours of observation or
  // antibiotic therapy; in such cases therapy should be reassessed.
  '': 'https://www.ncbi.nlm.nih.gov/books/NBK547701/#treatment-failure',
  // High‑dose amoxicillin‑clavulanate (2 g twice daily or 90 mg/kg/day) is recommended
  // when amoxicillin‑resistant organisms are suspected or when first‑line therapy fails.
  '': 'https://www.ncbi.nlm.nih.gov/books/NBK547701/#high-dose-amoxicillin-clavulanate',
  // Supportive therapy for acute sinusitis: symptomatic management should focus on
  // hydration, analgesics, antipyretics, saline nasal irrigation and intranasal corticosteroids;
  // oral and topical decongestants and antihistamines are not recommended due to lack
  // of proven benefit and risk of adverse effects.  We map this
  // citation to a publicly available sinusitis guideline summary from Northwestern Medicine.
  '': 'https://adsp.nm.org/uploads/1/4/3/0/143064172/sinusitis_guideline_summary.update_7.17.pdf#page=1',
  // ----- Now add mappings for acute otitis media citations -----
  // Watchful waiting for 2–3 days in mild acute otitis media: the Polish NFZ
  // knowledge base summarises AAP/AAPF guidelines recommending 48–72 hours
  // of observation with symptomatic treatment when diagnosis is uncertain,
  // symptoms are mild and monitoring is feasible.
  '': 'https://centrumwiedzy.nfz.gov.pl/584,rekomendacje-aap-oraz-aafp',
  // Criteria for immediate antibiotic therapy in AOM: the same NFZ resource
  // advises that antibiotics should not be delayed in infants <6 months or in
  // severe cases with high fever, vomiting, diarrhea, bilateral disease,
  // severe otalgia or purulent discharge, or when observation is impractical.
  '': 'https://centrumwiedzy.nfz.gov.pl/584,rekomendacje-aap-oraz-aafp',
  // Restrictions on re‑using amoxicillin: CDC outpatient care guidelines
  // recommend prescribing amoxicillin/clavulanate instead of amoxicillin alone
  // when amoxicillin was used within the past 30 days, purulent conjunctivitis
  // is present, or there is recurrent AOM unresponsive to amoxicillin.
  '': 'https://www.cdc.gov/antibiotic-use/hcp/clinical-care/pediatric-outpatient.html',
  // Additional mapping for high macrolide resistance in acute sinusitis.  This citation
  // references high resistance of Streptococcus pneumoniae to macrolides and
  // trimethoprim‑sulfamethoxazole.  We point to the StatPearls
  // article section on antibiotic choice and duration, which notes macrolides and
  // TMP‑SMX are not recommended as initial therapy due to resistance.
  '': 'https://www.ncbi.nlm.nih.gov/books/NBK547701/#antibiotic-choice'
  ,
  // ----- Additional mapping for acute otitis media -----
  // High‑dose amoxicillin is recommended as the first‑line treatment for acute otitis media.
  // Macrolide antibiotics (azithromycin, clarithromycin) should be reserved for patients with
  // a confirmed beta‑lactam allergy or documented susceptibility of the causative pathogen.
  // This citation points to an accessible article summarising AOM management from US Pharmacist.
  '': 'https://www.uspharmacist.com/article/management-of-pediatric-otitis-media'
  ,
  // ----- New mappings for community‑acquired pneumonia in children -----
  // First‑line treatment for mild to moderate community‑acquired pneumonia in children.
  // The MedStar Health pediatric CAP guideline recommends high‑dose amoxicillin (90 mg/kg/day
  // in 2–3 divided doses, max 4 g/day) as the preferred outpatient therapy and notes that
  // macrolides should be reserved for school‑aged children with suspected atypical pathogens.
  '': 'https://www.medstarfamilychoice.com/-/media/project/mho/mfc/mfc/pdf/pediatric-cap-community-acquired-pneumonia.pdf',
  // The same guideline advises reassessing children after 48–72 hours of amoxicillin therapy;
  // if there is no clinical improvement, antibiotic coverage should be adjusted and atypical
  // pathogens considered.  We map this citation to the same MedStar CAP guideline.
  '': 'https://www.medstarfamilychoice.com/-/media/project/mho/mfc/mfc/pdf/pediatric-cap-community-acquired-pneumonia.pdf',
  // Streptococcus pneumoniae is identified as the most common bacterial cause of community‑acquired
  // pneumonia in children; this citation also maps to the MedStar guideline.
  '': 'https://www.medstarfamilychoice.com/-/media/project/mho/mfc/mfc/pdf/pediatric-cap-community-acquired-pneumonia.pdf',
  // High‑dose amoxicillin and amoxicillin‑clavulanate dosing recommendations for pediatric CAP,
  // as well as treatment escalation for moderate and severe disease, are provided in the Carilion Clinic guideline.
  '': 'https://www.carilionclinic.org/peds-PNA-guide.pdf',
  // The same Carilion guideline notes that vancomycin, teicoplanin and linezolid are reserved for severe cases,
  // particularly those due to MRSA or multi‑resistant pneumococci.
  '': 'https://www.carilionclinic.org/peds-PNA-guide.pdf',
  // The OHSU pediatric CAP guideline emphasises that many pneumonias in preschool children have viral
  // etiology and that antibiotics should not be initiated for viral CAP unless bacterial coinfection is suspected.
  '': 'https://www.ohsu.edu/sites/default/files/2022-02/Pediatric%20CAP%20Guideline.pdf',
  // The same OHSU guideline recommends using cefuroxime for late‑type penicillin hypersensitivity and
  // macrolides (clarithromycin or azithromycin) for immediate hypersensitivity or when atypical pathogens
  // are suspected.
  '': 'https://www.ohsu.edu/sites/default/files/2022-02/Pediatric%20CAP%20Guideline.pdf',
  // Narodowy Program Ochrony Antybiotyków: ogólny portal z rekomendacjami dotyczącymi diagnostyki
  // i terapii zakażeń.  Serwis ten zawiera rekomendacje postępowania w pozaszpitalnych zakażeniach
  // układu oddechowego i informuje, że amoksycylina z kwasem klawulanowym jest preferowana u dzieci,
  // które w ciągu ostatnich 30 dni otrzymywały antybiotyk β‑laktamowy lub gdy istnieje podejrzenie
  // patogenu wytwarzającego β‑laktamazę.  Łącze odsyła do strony z rekomendacjami diagnostyki i
  // terapii zakażeń Narodowego Programu Ochrony Antybiotyków.
  '': 'https://antybiotyki.edu.pl/rekomendacje/rekomendacje-diagnostyki-i-terapii-zakazen/'
  ,
  // ----- Additional mappings for pediatric community‑acquired pneumonia -----
  // Macrolide therapy should not be used empirically for all children with CAP.  The MedStar Health
  // pediatric CAP guideline states that amoxicillin is the preferred first‑line therapy for otherwise
  // healthy infants and preschool children with mild to moderate CAP, and that macrolide antibiotics
  // should be reserved for school‑aged children and adolescents when an atypical pathogen (e.g.
  // Mycoplasma pneumoniae) is suspected.  Both of the following internal
  // identifiers correspond to citations from the Polish guideline, but are mapped here to this
  // publicly available guideline so that the application displays a real source instead of a
  // placeholder.  See lines 186–203 of the MedStar guideline for the relevant recommendation.
  '': 'https://www.medstarfamilychoice.com/-/media/project/mho/mfc/mfc/pdf/pediatric-cap-community-acquired-pneumonia.pdf',
  '': 'https://www.medstarfamilychoice.com/-/media/project/mho/mfc/mfc/pdf/pediatric-cap-community-acquired-pneumonia.pdf'
  ,
  // Fragment z polskich Rekomendacji 2016: w przypadku nawrotu choroby lub podawania
  // antybiotyku w ciągu ostatniego miesiąca zaleca się zastosowanie amoksycyliny z
  // klawulanianem w wysokiej dawce (90 mg/kg mc./dobę).  Link kieruje do strony
  // Narodowego Programu Ochrony Antybiotyków z rekomendacjami diagnostyki i terapii zakażeń.
  '': 'https://antybiotyki.edu.pl/rekomendacje/rekomendacje-diagnostyki-i-terapii-zakazen/',
  // ---- Now add mappings for adult community‑acquired pneumonia citations ----
  // Susceptibility of Streptococcus pneumoniae to amoxicillin and cefuroxime and discussion of high β‑lactam activity.
  // Mapped to the Polish recommendations portal to ensure accessibility.
  '': 'https://antybiotyki.edu.pl/rekomendacje/rekomendacje-diagnostyki-i-terapii-zakazen/',
  // Multicenter evaluation of macrolide‑resistant Streptococcus pneumoniae – reports resistance >25% in most regions.
  '': 'https://pubmed.ncbi.nlm.nih.gov/34250183/',
  // IDSA/ATS guideline for diagnosis and treatment of adults with community‑acquired pneumonia – outpatient regimens for healthy adults.
  '': 'https://pubmed.ncbi.nlm.nih.gov/31573350/',
  // IDSA/ATS guideline – treatment options for adults with comorbidities, combination therapy and dosing.
  '': 'https://pubmed.ncbi.nlm.nih.gov/31573350/',
  // IDSA/ATS guideline – recommended doses of respiratory fluoroquinolones.
  '': 'https://pubmed.ncbi.nlm.nih.gov/31573350/',
  // IDSA/ATS guideline – definition of comorbidities relevant for CAP management.
  '': 'https://pubmed.ncbi.nlm.nih.gov/31573350/',
  // IDSA/ATS guideline – caution against macrolide monotherapy due to high resistance rates.
  '': 'https://pubmed.ncbi.nlm.nih.gov/31573350/',
  // IDSA/ATS guideline – risk factors for MRSA or Pseudomonas aeruginosa requiring additional coverage.
  '': 'https://pubmed.ncbi.nlm.nih.gov/31573350/',
  // Footnote from Polish guideline emphasising minimum 5‑day therapy and continuing treatment 3 days after clinical stabilisation.
  '': 'https://antybiotyki.edu.pl/rekomendacje/rekomendacje-diagnostyki-i-terapii-zakazen/',
  // Outpatient CAP treatment duration recommendation (5–7 days, afebrile ≥48 h before discontinuation).
  '': 'https://antybiotyki.edu.pl/rekomendacje/rekomendacje-diagnostyki-i-terapii-zakazen/'
  ,
  // ----- Additional mappings for skin and soft tissue infections and bite wounds -----
  // The following placeholders are used in messages for infected wounds (ssti_wound),
  // cellulitis/erysipelas (ssti_cellulitis) and bite wounds (ssti_bite).  They previously
  // pointed to internal documentation and now map to peer‑reviewed articles on PubMed.
  // IDSA 2014 guideline for the diagnosis and management of skin and soft tissue infections
  // (https://pubmed.ncbi.nlm.nih.gov/24973422/) – provides recommendations on empiric
  // therapy, dosing and duration for cellulitis, erysipelas and infected wounds.
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  // Additional references for dosing of beta‑lactam antibiotics in cellulitis and wound infections.
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/24973422/',
  // Evidence review for management of dog and cat bite wounds – outlines prophylaxis with
  // amoxicillin‑clavulanate and alternatives for penicillin‑allergic patients.
  // See https://pubmed.ncbi.nlm.nih.gov/37983702/ for details.
  '': 'https://pubmed.ncbi.nlm.nih.gov/37983702/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/37983702/',
  '': 'https://pubmed.ncbi.nlm.nih.gov/37983702/'
};

// -----------------------------------------------------------------------------
// Ujednolicenie nazw w tabeli limitów GLOBAL_MAX_DAILY_DOSES
//
// W wielu miejscach interfejs aplikacji stosuje twarde spacje (NBSP) w nazwach
// leków, podczas gdy w tablicy GLOBAL_MAX_DAILY_DOSES mogą występować te same
// nazwy zapisane z klasycznymi spacjami lub odwrotnie. Aby uniknąć sytuacji,
// w której limit nie zostanie odnaleziony ze względu na różnice w rodzaju
// spacji, poniższy blok kodu tworzy dodatkowe wpisy z odpowiednikami kluczy.
// Dzięki temu odwołanie do GLOBAL_MAX_DAILY_DOSES[drugName] zadziała niezależnie
// od tego, czy nazwa leku w formularzu zawiera twarde spacje czy zwykłe.
(() => {
  const entries = Object.entries(GLOBAL_MAX_DAILY_DOSES);
  entries.forEach(([key, value]) => {
    // Wariant z klasycznymi spacjami (zamień wszystkie NBSP na spacje)
    const withSpaces = key.replace(/\u00A0/g, ' ');
    // Wariant z twardymi spacjami (zamień wszystkie klasyczne spacje na NBSP)
    const withNbsp = key.replace(/ /g, '\u00A0');
    // Dodaj wpis z klasycznymi spacjami, jeśli dotychczas go nie ma
    if (!GLOBAL_MAX_DAILY_DOSES.hasOwnProperty(withSpaces)) {
      GLOBAL_MAX_DAILY_DOSES[withSpaces] = value;
    }
    // Dodaj wpis z twardymi spacjami, jeśli dotychczas go nie ma
    if (!GLOBAL_MAX_DAILY_DOSES.hasOwnProperty(withNbsp)) {
      GLOBAL_MAX_DAILY_DOSES[withNbsp] = value;
    }
  });
})();

// Definicje wskazań wraz z sugerowanymi schematami antybiotykoterapii
const ABX_INDICATIONS = {
    'pharyngitis': {
      label: 'Ostre zapalenie gardła i migdałków podniebiennych',
      drugs: {
        // Fenoksymetylpenicylina (Penicillin V) – lek pierwszego wyboru. U dzieci < 40 kg
        // zalecane 100 000–200 000 j.m./kg/dobę w dwóch dawkach co 12 h, a u pacjentów ≥ 40 kg
        // 2–3 mln j.m. na dobę w dwóch dawkach. Zakres mgRange i dawka będą
        // dodatkowo dostosowywane w updateDoseControls() na podstawie masy ciała.
        // Fenoksymetylpenicylina (Penicylina V) – dawki w jednostkach
        // międzynarodowych 100 000–200 000 j.m./kg/dobę odpowiadają
        // ok. 33–65 mg/kg/dobę (1 000 000 j.m. ≈ 654 mg). Dla pacjentów
        // <40 kg przyjmujemy zakres 33–65 mg/kg/dobę (50 000–100 000 j.m./kg/dobę), domyślnie 50 mg/kg/dobę.
        // Dla pacjentów ≥40 kg zakres dawek jest wyliczany dynamicznie w
        // updateDoseControls() na podstawie całkowitej dawki 2–3 mln j.m./dobę.
        // Fenoksymetylpenicylina (Penicylina V) – zgodnie z najnowszymi wytycznymi w
        // paciorkowcowym zapaleniu gardła dawkę dobową dzieli się na trzy
        // równe podania. Zmieniono liczbę dawek z 2 na 3. Zakres dawek
        // pozostaje niezmieniony: 33–65 mg/kg/dobę (odpowiadające 50 000–100 000 j.m./kg/dobę) z domyślną
        // wartością 50 mg/kg/dobę. W updateDoseControls() zakres jest
        // dodatkowo dostosowywany do masy ciała pacjenta ≥ 40 kg.
        // Fenoksymetylpenicylina: schemat podawania co 8–12 h (2–3 ×/dobę).  
        // Domyślnie przyjmujemy dawkowanie co 12 h (2 dawki/dobę) i udostępniamy
        // alternatywny wariant trzech dawek/dobę poprzez altDoses. Zakres mg/kg/dobę
        // odzwierciedla 50 000–100 000 j.m./kg/dobę (≈33–65 mg/kg/dobę). Domyślna
        // dawka to 50 mg/kg/dobę. Długość terapii: 10 dni.
        'Fenoksymetylpenicylina': { mgRange: [33, 65], defaultMg: 50, doses: 2, altDoses: [3], duration: 10, firstChoice: true },
        // Amoksycylina jako alternatywa – zgodnie z Charakterystyką Produktu Leczniczego
        // zalecane jest 50 mg/kg/dobę w dwóch dawkach (25 mg/kg co 12 h) przy
        // streptokokowym zapaleniu gardła. Zmniejszamy zakres do jednej
        // wartości 50 mg/kg/dobę i aktualizujemy domyślną dawkę do 50 mg/kg/dobę.
        // Amoksycylina – w leczeniu paciorkowcowego zapalenia gardła dawkę dobową
        // 50 mg/kg mc. zwykle podaje się w dwóch podaniach przez 10 dni. Zgodnie
        // z charakterystyką leku i informacjami dla pacjenta, typowy zakres
        // dobowych dawek amoksycyliny u dorosłych wynosi 0,75–3 g, a u dzieci
        // 40–90 mg/kg mc./dobę z maksymalną dawką 3 g na dobę.
        // Aby uniknąć obliczeń przekraczających 3 g/dobę w tym wskazaniu,
        // dodano lokalne ograniczenie maxDailyMg: 3000 mg.
        'Amoksycylina':        { mgRange: [50, 50], defaultMg: 50, doses: 2, duration: 10, maxDailyMg: 3000 },
        // Amoksycylina z kwasem klawulanowym – w tej jednostce chorobowej nie ma
        // konieczności stosowania wysokich dawek. Na podstawie Charakterystyki
        // Produktu Leczniczego Augmentin oraz wytycznych przyjmujemy zakres
        // 25–45 mg/kg/dobę amoksycyliny w dwóch dawkach (standardowy schemat 25–45 mg/kg/dobę,
        // bez przekraczania 45 mg/kg/dobę). Domyślna wartość to 40 mg/kg/dobę.
        // Amoksycylina z kwasem klawulanowym – w infekcjach górnych dróg
        // oddechowych u pacjentów o masie ≥ 40 kg stosuje się 1 g (875 mg + 125 mg)
        // dwa razy na dobę lub 625 mg (500 mg + 125 mg) trzy razy na dobę, a u
        // dzieci <40 kg zakres dawek wynosi 25–45 mg amoksycyliny/kg mc./dobę w
        // dwóch podaniach. Dawka 45 mg/kg mc./dobę u dziecka
        // ważącego 40 kg odpowiada 1 800 mg amoksycyliny na dobę. Aby ograniczyć
        // kalkulator do rozsądnych wartości i nie przekraczać 3 g amoksycyliny
        // na dobę, wprowadzono lokalny limit maxDailyMg: 3000 mg dla tego
        // wskazania.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 40, doses: 2, duration: 10, maxDailyMg: 3000 },
        // Cefadroksyl: jednorazowa dawka dobowa 30 mg/kg (dzieci < 40 kg) lub 1 g
        // (pacjenci ≥ 40 kg) – zgodnie z zaleceniami IDSA i ChPL.
        // Dawka podawana raz dziennie przez 10 dni.
        // Cefadroksyl: dawka dobowa 30 mg/kg mc. (dzieci <40 kg) lub 1 g (≥40 kg),
        // podawana jednorazowo lub w dwóch dawkach co 12 h. Aby ułatwić kliniczne
        // dostosowanie do schematu 8–12 h, przyjmujemy domyślnie 1 dawkę/dobę
        // i udostępniamy alternatywny wariant dwóch dawek poprzez altDoses.
        'Cefadroksyl': { mgRange: [30, 30], defaultMg: 30, doses: 1, altDoses: [2], duration: 10, maxDailyMg: 1000 },
        // Cefaleksyna: tradycyjnie stosowana w leczeniu paciorkowcowego zapalenia gardła,
        // ale obecnie doustne preparaty nie są dostępne w Polsce. Z tego powodu
        // usuwamy cefaleksynę z listy antybiotyków w tym wskazaniu.
        // { mgRange: [40, 40], defaultMg: 40, doses: 2, duration: 10, maxDailyMg: 1000 },
        // Klarytromycyna: dawka 15 mg/kg mc./dobę podzielona na dwie dawki co 12 h
        // jest podstawowym schematem terapii paciorkowcowego zapalenia gardła u dzieci
        // Zgodnie z Charakterystyką Produktu Leczniczego u dorosłych można stosować
        // dawkę 500 mg lub 1 000 mg raz na dobę (tabletki o przedłużonym
        // uwalnianiu). Aby umożliwić obliczenia dla tych wariantów,
        // zwiększamy limit dobowy do 1 000 mg i dodajemy alternatywną opcję
        // dawkowania raz na dobę poprzez altDoses.  
        'Klarytromycyna':      { mgRange: [15, 15], defaultMg: 15, doses: 2, altDoses: [1], duration: 10, maxDailyMg: 1000 },
        // Azytromycyna: w paciorkowcowym zapaleniu gardła rekomendowany jest 5‑dniowy
        // schemat 12 mg/kg/dobę jednorazowo przez 5 dni (dzień 1: 12 mg/kg, w dniach 2–5
        // 6 mg/kg) – takie dawkowanie jest zalecane m.in. przez wytyczne CDC dla
        // pacjentów z alergią na penicylinę. Ustalamy stałą dawkę 12 mg/kg/dobę i długość
        // terapii 5 dni, z limitem 500 mg/dobę.
        // Azytromycyna – zgodnie z rozszerzonymi wytycznymi dla ostrego zapalenia gardła i
        // migdałków podniebiennych stosuje się dwa warianty terapii. Kuracja
        // 5‑dniowa wymaga podania 10–12 mg/kg mc./dobę raz na dobę, z
        // maksymalną dawką 500 mg/dobę; u dorosłych typowym schematem jest
        // 500 mg w 1. dniu i 250 mg/dobę przez kolejne cztery dni. Przyjęcie
        // zakresu 10–12 mg/kg mc./dobę pozwala dostosować dawkę do masy ciała,
        // a limit 500 mg zapobiega przekroczeniu maksymalnej dobowej dawki
        // zalecanej u dzieci.
        // Azytromycyna – w paciorkowcowym zapaleniu gardła stosuje się wyłącznie
        // pięciodniowy schemat 10 mg/kg mc./dobę w 1. dniu i 5 mg/kg mc./dobę w dniach 2–5.
        // Ustalona dawka 10 mg/kg mc. jako wartość bazowa pozwala automatycznie
        // obliczyć większą dawkę w pierwszym dniu (podwojenie) i połowę dawki w kolejnych
        // dniach w funkcji recalc. Limit 500 mg chroni przed przekroczeniem maksymalnej
        // dobowej dawki u dzieci.
        'Azytromycyna':        { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 5, maxDailyMg: 500 },

        // Usunięto trzydniowy wariant azytromycyny w zapaleniu gardła, ponieważ
        // aktualne wytyczne rekomendują wyłącznie schemat 5‑dniowy. 
        // Klindamycyna – w leczeniu paciorkowcowego zapalenia gardła zalecane jest
        // 7 mg/kg na dawkę trzy razy dziennie (21 mg/kg/dobę) z maksymalną dawką
        // 300 mg na dawkę (900 mg/dobę). Dostosowujemy zakres i
        // limit dobowy zgodnie z tymi zaleceniami.
        'Klindamycyna':       {
          // Klindamycyna – dla paciorkowcowego zapalenia gardła stosujemy zakres 20–30 mg/kg mc./dobę
          // (7–10 mg/kg mc. co 8 h).  Podnosimy maksymalną dawkę dobową do 1,8 g u dorosłych
          // i dzieci zgodnie z nowymi zaleceniami.  Domyślną wartość ustawiamy na 25 mg/kg mc./dobę.
          mgRange: [20, 30],
          defaultMg: 25,
          doses: 3,
          duration: 10,
          maxDailyMg: 1800
        },
        // Aksetyl cefuroksymu (cefalosporyna II generacji) – 20–30 mg/kg/dobę w dwóch dawkach, max 1 000 mg/dobę.
        'Aksetyl cefuroksymu':   { mgRange: [20, 30], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 1000 }
        ,
        // Cefaklor: w paciorkowcowym zapaleniu gardła/tonsylitis rekomendowane jest 20–40 mg/kg mc./dobę
        // w postaciach natychmiastowego uwalniania (IR) podzielone co 8–12 h (2–3 dawki na dobę).  
        // Źródła, takie jak przewodnik dawkowania Drugs.com, podają, że u dzieci 
        // 1 miesiąc i starszych łączna dawka dobową 20–40 mg/kg mc. podawana jest 
        // co 8–12 h, przy czym maksymalna dawka dobową nie powinna przekraczać 1 g, a 
        // leczenie zakażeń paciorkowcowych trwa co najmniej 10 dni.  
        // Domyślnie przyjmujemy schemat dwudawkowy z alternatywnym wariantem trzech dawek.  
        'Cefaklor': { mgRange: [20, 40], defaultMg: 30, doses: 2, altDoses: [3], duration: 10, maxDailyMg: 1000 }
      }
    },
    'otitis': {
      label: 'Ostre zapalenie ucha środkowego',
      drugs: {
        // Amoksycylina – w ostrym zapaleniu ucha środkowego zaleca się wysokodawkową terapię
        // 80–90 mg/kg mc./dobę w dwóch dawkach. Zalecenie to wynika z zaleceń AAP i
        // innych wytycznych, które podkreślają, że u dzieci bez alergii na penicylinę
        // pierwszym wyborem jest amoksycylina 80–90 mg/kg/dobę, podawana co 12 h
        // przez 7–10 dni (krótszy czas u starszych dzieci).
        // Ustawiamy zakres 80–90 mg/kg mc./dobę i domyślną dawkę 90 mg/kg mc.;
        // kalkulator skoryguje czas terapii w zależności od wieku.
        // Amoksycylina – zgodnie z polskimi wytycznymi dla OZUŚ stosuje się wysokie dawki
        // 75–90 mg/kg mc./dobę w 2–3 dawkach. Niższy próg 75 mg/kg mc. obejmuje
        // schematy 75–90 mg/kg mc., natomiast w razie potrzeby można zwiększyć
        // liczbę podań do trzech (co 8 h). Domyślnie pozostawiamy 90 mg/kg mc.
        'Amoksycylina':        { mgRange: [75, 90], defaultMg: 90, doses: 2, altDoses: [3], duration: 7, firstChoice: true },
        // Dla preparatu Amoksiklav ES (600 mg/42,9 mg/5 ml) ChPL podaje, że zwykle stosowana
        // dawka u dzieci to 90 mg amoksycyliny + 6,4 mg kwasu klawulanowego na kg mc. na dobę
        // w dwóch dawkach. W przypadkach ostrego zapalenia ucha środkowego
        // aktualne wytyczne zalecają wysoką dawkę amoksycyliny 80–90 mg/kg mc./dobę (z ograniczeniem
        // kwasu klawulanowego <10 mg/kg mc./dobę), podawaną w dwóch dawkach.
        // Dlatego ustawiamy zakres na 80–90 mg/kg mc./dobę i domyślną wartość 90 mg/kg mc. Dzielenie
        // dawki na dwie części ogranicza ilość kwasu klawulanowego i poprawia tolerancję.
        // Amoksycylina z kwasem klawulanowym – stosowana w OZUŚ w przypadku braku
        // odpowiedzi na samą amoksycylinę lub w sytuacjach, gdy podejrzewa się
        // oporne bakterie. Wysoka dawka amoksycyliny 80–90 mg/kg mc./dobę
        // (przy zachowaniu stosunku kwas klawulanowy <10 mg/kg mc./dobę) jest
        // rekomendowana, dzielona na dwie dawki. Dlatego
        // zmieniamy zakres na 80–90 mg/kg mc./dobę i pozostawiamy domyślnie 90 mg/kg mc.
        // Amoksycylina z kwasem klawulanowym – w ostrym zapaleniu ucha środkowego
        // rekomenduje się 75–90 mg/kg mc./dobę amoksycyliny (z dodatkiem kwasu
        // klawulanowego ok. 6,4 mg/kg mc./dobę) w 2–3 dawkach. Użycie trzech
        // dawek (co 8 h) jest dopuszczalne przy nasilonych objawach lub dużej
        // masie ciała. Domyślnie stosujemy górną wartość 90 mg/kg mc./dobę.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [75, 90], defaultMg: 90, doses: 2, altDoses: [3], duration: 7 },
        // Cefuroksym: w OZUŚ stosuje się 30 mg/kg/dobę w dwóch dawkach przez 5–10 dni,
        // przy czym maksymalna dawka dobowa nie powinna przekroczyć 500 mg.
        // W OZUŚ maksymalną dawkę dobową cefuroksymu doustnego zwiększono do 1000 mg,
        // aby umożliwić podawanie 2×500 mg u starszych dzieci (zamiast ograniczenia
        // do 500 mg/dobę). Zakres mg/kg pozostaje 30 mg/kg/dobę w dwóch dawkach.
        // Aksetyl cefuroksymu – według zaleceń stosuje się 30 mg/kg mc./dobę w dwóch dawkach
        // przez 5–10 dni. Wartość 30 mg/kg mc. pozostaje bez zmian, ale domyślny czas
        // terapii zwiększamy do 10 dni (kalkulator skróci go dla starszych dzieci).
        // Aksetyl cefuroksymu – dawka 30 mg/kg mc./dobę (15 mg/kg mc. co 12 h).
        // Maksymalna dobowa dawka w OZUŚ może sięgać 1 000 mg, co pozwala na
        // stosowanie 2×500 mg u starszych dzieci. Domyślny czas terapii zostaje
        // 10 dni; zostanie on skrócony w funkcji recalc w zależności od wieku.
        'Aksetyl cefuroksymu':   { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 1000 },
        // Klarytromycyna: dawka 15 mg/kg/dobę (7,5 mg/kg dwa razy na dobę) z limitem 1 000 mg/dobę.
        // Klarytromycyna – u dzieci z alergią na beta‑laktamy dawka 15 mg/kg mc./dobę
        // (7,5 mg/kg co 12 h) jest podawana przez 10 dni. Maksymalna dawka na dawkę
        // wynosi 250 mg, co odpowiada 500 mg/dobę. Zmieniamy limit
        // dobowy na 500 mg i domyślny czas terapii na 10 dni.
        // Klarytromycyna – dawka 15 mg/kg mc./dobę podzielona na dwie
        // dawki co 12 h jest podstawowym schematem leczenia paciorkowcowego
        // zapalenia gardła u dzieci.  
        // W ulotkach dla dorosłych dopuszcza się jednak podawanie 500 mg lub
        // nawet 1000 mg raz na dobę w postaci tabletek o zmodyfikowanym
        // uwalnianiu. Aby odzwierciedlić te możliwości, zwiększamy limit
        // dobowy do 1 000 mg i dodajemy alternatywną opcję dawkowania raz na
        // dobę poprzez altDoses.  
        // Klarytromycyna – w aktualnych rekomendacjach dawka w ostrym zapaleniu
        // ucha środkowego wynosi około 20 mg/kg mc./dobę (10 mg/kg mc. co 12 h).
        // Podanie raz na dobę preparatu o przedłużonym uwalnianiu jest możliwe u
        // dorosłych, stąd pozostawiamy opcjonalny schemat 1×/dobę w altDoses.
        'Klarytromycyna':      { mgRange: [20, 20], defaultMg: 20, doses: 2, altDoses: [1], duration: 10, maxDailyMg: 1000 },
        // Azytromycyna w ostrym zapaleniu ucha środkowego jest opcją rezerwową. Zalecany
        // jest skrócony 3‑dniowy schemat 10 mg/kg mc./dobę; alternatywnie można
        // podać 5‑dniową terapię (10 mg/kg w 1. dniu, następnie 5 mg/kg/dobę przez 4 dni).
        // Ustawiamy domyślnie 10 mg/kg/dobę w jednej dawce z 3‑dniowym czasem
        // terapii. Limit dobowy pozostaje 500 mg.
        // Azytromycyna – pozostaje alternatywą dla pacjentów z nadwrażliwością
        // na β‑laktamy. Standardowa dawka 10 mg/kg mc./dobę raz na dobę
        // utrzymana jest bez zmian; schematy 3‑ i 5‑dniowe są szczegółowo
        // opisane w sekcji komunikatów.
        // Azytromycyna – w ostrym zapaleniu ucha środkowego można stosować dwa schematy.
        // Wariant trzydniowy (10 mg/kg mc./dobę przez 3 dni) pozostawiamy jako „Azytromycyna (3 dni)”,
        // a dodatkowo udostępniamy wariant pięciodniowy (10 mg/kg w 1. dniu, następnie 5 mg/kg/dobę przez 4 dni).
        'Azytromycyna (3 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 3, maxDailyMg: 500 },
        'Azytromycyna (5 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 5, maxDailyMg: 500 },

        // Cefiksym – cefalosporyna III generacji stosowana jako lek drugiego
        // rzutu w OZUŚ. Dawkowanie wynosi 8 mg/kg mc./dobę, zazwyczaj podawane
        // raz na dobę; dopuszczalny jest podział dawki na dwie porcje (co 12 h).
        // U osób dorosłych typowa dawka całkowita wynosi 400 mg/dobę.
        'Cefiksym': { mgRange: [8, 8], defaultMg: 8, doses: 1, altDoses: [2], duration: 7 }
      }
    },
    'sinusitis': {
      label: 'Ostre zapalenie błony śluzowej nosa i zatok przynosowych',
      drugs: {
        // W ostrym zapaleniu zatok przynosowych stosuje się zarówno standardowe, jak i wysokie dawki amoksycyliny.
        // Zgodnie z Charakterystyką Produktu Leczniczego Ospamox dzieci <40 kg mogą otrzymywać 20–90 mg/kg mc./dobę,
        // przy czym schemat dwudawkowy (co 12 h) stosuje się wyłącznie przy górnych granicach zakresu.
        // Nowsze przeglądy i wytyczne (np. Leung 2020) sugerują standardową dawkę 45 mg/kg/dobę lub wysokodawkowy
        // schemat 90 mg/kg/dobę w 2 dawkach u pacjentów z ryzykiem zakażeń lekoopornych.
        // Ujednolicamy zakres dawki do 45–90 mg/kg mc./dobę i pozostawiamy domyślnie 80 mg/kg mc./dobę w dwóch dawkach.
        // W zapaleniu zatok przynosowych stosuje się głównie wysokodawkową amoksycylinę (80–90 mg/kg mc./dobę) w dwóch dawkach. Dopuszczamy też niższe dawki (ok. 45 mg/kg mc./dobę) w lżejszych przypadkach. Dodajemy możliwość podziału dobowej dawki na trzy podania (co 8 h) zgodnie z wytycznymi.
        'Amoksycylina':        { mgRange: [45, 90], defaultMg: 80, doses: 2, altDoses: [3], duration: 10, firstChoice: true },
        // Dla preparatów ko‑amoksyklawu (np. Augmentin ES) Charakterystyka Produktu Leczniczego zaleca
        // podawanie 90 mg/kg mc./dobę składnika amoksycyliny w dwóch dawkach przez 10 dni.
        // Zgodnie z nowszymi wytycznymi, standardową dawką w niepowikłanych przypadkach może być 45 mg/kg mc./dobę,
        // natomiast u pacjentów z ryzykiem oporności lub cięższą chorobą stosuje się 90 mg/kg mc./dobę.
        // Dlatego poszerzamy zakres dawki do 45–90 mg/kg mc./dobę, zachowując liczbę dawek 2/dobę i domyślne 90 mg/kg mc./dobę.
        // Ko‑amoksyklaw jest lekiem drugiego wyboru w OZNS; stosuje się go w dawce 45–90 mg/kg mc./dobę amoksycyliny. Domyślnie ustawiamy wysoką dawkę 90 mg/kg mc./dobę w dwóch dawkach, ale umożliwiamy podział na trzy dawki w cięższych przypadkach.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [45, 90], defaultMg: 90, doses: 2, altDoses: [3], duration: 10 },
        // Cefuroksym: w OZNZ stosuje się 30 mg/kg/dobę w dwóch dawkach, nie przekraczając 500 mg na dawkę
        // (czyli 1000 mg/dobę).
        'Aksetyl cefuroksymu':   { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 1000 },
        // Klarytromycyna: 15 mg/kg/dobę w dwóch dawkach, z limitem 1 000 mg/dobę.
        // Klarytromycyna: 15 mg/kg mc./dobę (7,5 mg/kg co 12 h) z limitem 1 000 mg/dobę. Preparaty o przedłużonym uwalnianiu umożliwiają dawkowanie raz na dobę, dlatego dodajemy altDoses: [1].
        'Klarytromycyna':      { mgRange: [15, 15], defaultMg: 15, doses: 2, altDoses: [1], duration: 10, maxDailyMg: 1000 },
        // Azytromycyna jest opcją rezerwową w ostrym zapaleniu zatok przynosowych. Zalecany
        // jest 3‑dniowy kurs 10 mg/kg mc./dobę; alternatywnie można zastosować schemat
        // 5‑dniowy (10 mg/kg w 1. dniu, następnie 5 mg/kg/dobę). Ustawiamy domyślnie
        // 10 mg/kg/dobę w jednej dawce z 3‑dniowym czasem terapii. Limit dobowy pozostaje 500 mg.
        // Azytromycyna – w ostrym zapaleniu zatok przynosowych można stosować dwa schematy.
        // Skrócony kurs trzydniowy (10 mg/kg mc./dobę przez 3 dni) zapisujemy jako „Azytromycyna (3 dni)”.
        // Dodatkowo udostępniamy wariant 5‑dniowy: 10 mg/kg w 1. dniu, następnie 5 mg/kg/dobę w dniach 2–5.
        'Azytromycyna (3 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 3, maxDailyMg: 500 },
        'Azytromycyna (5 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 5, maxDailyMg: 500 }
      }
    },
    'pneumonia_child': {
      label: 'Pozaszpitalne zapalenie płuc u dzieci',
      drugs: {
        // Amoksycylina: wg wytycznych dla łagodnego, pozaszpitalnego zapalenia płuc
        // stosuje się wysokodawkowy schemat 80–90 mg/kg mc./dobę w 3 dawkach (co 8 h). 
        // Taka terapia trwa zazwyczaj 5 dni, o ile dziecko pozostaje bez gorączki i klinicznie się poprawia
        // przez co najmniej 48 h. 
        // W pozaszpitalnym zapaleniu płuc pierwszym wyborem jest wysokodawkowa amoksycylina 90 mg/kg mc./dobę.
        // Zalecane jest podzielenie dawki na 2 lub 3 podania (co 8–12 h) i skrócenie terapii do 5 dni, jeśli pacjent
        // pozostaje bez gorączki i klinicznie się poprawia przez co najmniej 48 h. Zawężamy zakres
        // do jednej wartości 90 mg/kg mc./dobę oraz dodajemy alternatywny wariant dwudawkowy.
        'Amoksycylina':        { mgRange: [90, 90], defaultMg: 90, doses: 3, altDoses: [2], duration: 5, firstChoice: true },
        // Amoksycylina z kwasem klawulanowym: wysokodawkowa terapia 80–90 mg/kg mc./dobę amoksycyliny 
        // podawana co 12 h (2 dawki/dobę) jest preferowana w przypadku podejrzenia oporności
        // pneumokoków lub braku odpowiedzi na samą amoksycylinę. 
        // Zmniejszamy czas terapii do 5 dni zgodnie z nowymi rekomendacjami dla łagodnych infekcji. 
        // Ko‑amoksyklaw w PZP stosuje się w wysokiej dawce 90 mg/kg mc./dobę (składnik amoksycyliny) w 2–3 podaniach.
        // Zakres ograniczamy do jednej wartości 90 mg/kg mc./dobę i umożliwiamy alternatywne dawkowanie trzy razy
        // na dobę. Standardowy czas terapii wynosi 5 dni.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [90, 90], defaultMg: 90, doses: 2, altDoses: [3], duration: 5 },
        // Aksetyl cefuroksymu: zalecane jest 15 mg/kg mc. co 12 h (czyli 30 mg/kg mc./dobę) z maks. 500 mg/dobę; 
        // stosujemy stałą wartość 30 mg/kg mc./dobę w dwóch dawkach. 
        'Aksetyl cefuroksymu':   { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 7, maxDailyMg: 500 },
        // Postać dożylna cefuroksymu dla cięższych zakażeń lub niemowląt (3 tydzień–3 miesiąc).  
        // Dawkowanie 50–100 mg/kg mc./dobę w 3 dawkach jest zgodne z wytycznymi; 
        // obniżamy domyślną wartość do 80 mg/kg, aby lepiej odpowiadała zakresowi terapeutycznemu. 
        'Cefuroksym (dożylnie)': { mgRange: [50, 100], defaultMg: 80, doses: 3, duration: 7, maxDailyMg: 4000 },
        // Ampicylina – w umiarkowanym i ciężkim CAP podaje się 50 mg/kg mc. co 6 h (200 mg/kg/dobę) i 
        // zwykle przez 7 dni. Ustawiamy zatem stałą dawkę 200 mg/kg mc./dobę. 
        'Ampicylina':         { mgRange: [200, 200], defaultMg: 200, doses: 4, duration: 7, maxDailyMg: 4000 },
        // Cefotaksym – rekomendowane przez PIDS/IDSA 150 mg/kg mc./dobę (50 mg/kg co 8 h) w leczeniu CAP. 
        // Stosujemy stałą wartość 150 mg/kg/dobę z 3 dawkami. 
        // Cefotaksym – w ciężkim zapaleniu płuc dawka wynosi 150–200 mg/kg mc./dobę (podawana co 6–8 h).
        'Cefotaksym':         { mgRange: [150, 200], defaultMg: 150, doses: 3, duration: 7, maxDailyMg: 6000 },
        // Ceftriakson – w cięższym CAP stosuje się 50–75 mg/kg mc. w pojedynczej dawce na dobę (max 2 g). 
        // Skracamy czas terapii do 5 dni, zgodnie z nowszymi doniesieniami o krótszym leczeniu. 
        // Ceftriakson – w ciężkim CAP podaje się 100 mg/kg mc./dobę jako pojedynczą dawkę (max 2 g/dobę)
        'Ceftriakson':        { mgRange: [100, 100], defaultMg: 100, doses: 1, duration: 5, maxDailyMg: 2000 },
        // Kloksacylina – dla zakażeń gronkowcowych podaje się 25–50 mg/kg co 6 h (100–200 mg/kg mc./dobę). 
        // Zwiększamy zakres i domyślną dawkę, pozostawiając 4 dawki na dobę. 
        'Kloksacylina':       { mgRange: [100, 200], defaultMg: 150, doses: 4, duration: 7, maxDailyMg: 4000 },
        // Klarytromycyna: 15 mg/kg/dobę (7,5 mg/kg dwa razy na dobę) z limitem 1 000 mg/dobę.
        // Zgodnie z zaleceniami terapia powinna trwać co najmniej 7 dni; można ją przedłużyć do 10 dni
        // w cięższych przypadkach lub przy utrzymujących się objawach. Zmieniamy domyślny czas
        // trwania terapii z 5 dni do 7 dni.
        'Klarytromycyna':      { mgRange: [15, 15], defaultMg: 15, doses: 2, duration: 7, maxDailyMg: 1000 },
        // Azytromycyna: dawka 10 mg/kg/dobę w pierwszej dobie, a następnie 5 mg/kg/dobę w
        // kolejnych 4 dobach (łącznie 5 dni) lub alternatywnie 10 mg/kg/dobę przez 3 dni (schemat
        // skrócony). W kalkulatorze pozostawiamy domyślnie 10 mg/kg/dobę w jednej dawce z
        // pięciodniowym czasem terapii, a szczegółowy schemat podajemy w komunikacie informacyjnym.
        // Azytromycyna – w pediatrycznym pozaszpitalnym zapaleniu płuc stosuje się dwa schematy:
        // pięciodniowy (10 mg/kg w 1. dniu, następnie 5 mg/kg/dobę w dniach 2–5) oraz skrócony
        // trzydniowy (10 mg/kg mc./dobę przez 3 dni).  Wprowadzamy obie opcje jako osobne leki.
        'Azytromycyna (5 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 5, maxDailyMg: 500 },
        'Azytromycyna (3 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 3, maxDailyMg: 500 }
        ,
        // Antybiotyki rezerwowe dla ciężkich zakażeń wywołanych szczepami MRSA lub wieloopornym Streptococcus pneumoniae
        // Wankomycyna: 40–60 mg/kg mc./dobę w 3–4 dawkach (co 6–8 h).
        'Wankomycyna':        { mgRange: [40, 60], defaultMg: 50, doses: 4, altDoses: [3], duration: 7, maxDailyMg: 4000 },
        // Teikoplanina: początkowo 10 mg/kg mc./dobę co 12 h, następnie 6–10 mg/kg mc./dobę raz na dobę.
        'Teikoplanina':       { mgRange: [6, 10], defaultMg: 10, doses: 1, duration: 7, maxDailyMg: 1000 },
        // Linezolid: 30 mg/kg mc./dobę w 3 dawkach (co 8 h).
        'Linezolid':          { mgRange: [30, 30], defaultMg: 30, doses: 3, duration: 7, maxDailyMg: 600 }
      }
    },
    'pneumonia_adult': {
      label: 'Pozaszpitalne zapalenie płuc u dorosłych',
      /*
       * Sekcja dla dorosłych dotyczy pozaszpitalnego zapalenia płuc (CAP).
       * Zgodnie z aktualnymi wytycznymi IDSA/ATS i lokalnymi programami
       * antybiotykowymi, leczenie trwa minimum 5 dni; należy kontynuować
       * antybiotykoterapię co najmniej 48 h po ustąpieniu gorączki i
       * poprawie klinicznej. Poniższe schematy są
       * przeznaczone dla pacjentów leczonych ambulatoryjnie.
       *
       * – Dorośli bez chorób współistniejących i bez ryzyka lekooporności:
       *   • amoksycylina 1 g co 8 h przez 5 dni;
       *   • doksycyklina 100 mg co 12 h przez 5 dni;
       *   • makrolid (np. azytromycyna 500 mg w 1. dniu, następnie 250 mg raz na dobę przez kolejne 4 dni
       *     lub klarytromycyna 500 mg dwa razy na dobę) jest dopuszczalny tylko w regionach
       *     o niskiej (<25 %) oporności pneumokoków.
       *
       * – Dorośli z chorobami współistniejącymi lub innymi czynnikami ryzyka: stosuje się
       *   terapię skojarzoną β‑laktam + makrolid/doksycyklina. Do wyboru:
       *   • amoksycylina + kwas klawulanowy 500/125 mg 3 ×/dobę, 875/125 mg 2 ×/dobę
       *     lub 2 g/125 mg 2 ×/dobę przez 5 dni;
       *   • cefpodoksym 200 mg 2 ×/dobę lub cefuroksym 500 mg 2 ×/dobę przez 5 dni;
       *   plus azytromycyna 500 mg w 1. dniu, następnie 250 mg raz na dobę przez 4 dni
       *     lub doksycyklina 100 mg 2 ×/dobę.
       *
       * – Dorośli z alergią na β‑laktamy: monoterapia fluorochinolonem oddechowym:
       *   • lewofloksacyna 750 mg raz na dobę przez 5 dni;
       *   • moksyfloksacyna 400 mg raz na dobę przez 5 dni.
       *   Fluorochinolony nie powinny być stosowane jako lek pierwszego wyboru ze względu
       *   na ryzyko działań niepożądanych i zakażeń Clostridioides difficile.
       */
      // Wskazanie dla dorosłych – pozaszpitalne zapalenie płuc. Określamy dawki w mg/kg/dobę
      // na podstawie zalecanych stałych dawek z wytycznych. Leczenie trwa co najmniej 5 dni;
      // terapię należy kontynuować przez 48 h po ustąpieniu gorączki i poprawie klinicznej.
      drugs: {
        // Zaktualizowane zakresy dawek i liczba dawek na dobę zgodnie z polskimi wytycznymi (tabela w IMG_5478)
        // Amoksycylina: 1 g co 8 h (≈43 mg/kg mc./dobę) lub 1,5–2 g co 12 h (≈43–57 mg/kg mc./dobę).
        'Amoksycylina': { mgRange: [43, 57], defaultMg: 43, doses: 3, altDoses: [2], duration: 5, firstChoice: true },
        // Doksycyklina: 100 mg co 12 h (≈3 mg/kg mc./dobę).  Zakres dawki pozostaje bez zmian.
        'Doksycyklina': { mgRange: [3, 3], defaultMg: 3, doses: 2, duration: 5, maxDailyMg: 200 },
        // Klarytromycyna: 500 mg dwa razy na dobę lub 500 mg raz na dobę (tabletki o przedłużonym uwalnianiu) –
        // odpowiada to 7–14 mg/kg mc./dobę.  Domyślnie przyjmujemy wyższą dawkę podzieloną na 2 dawki,
        // a alternatywnie jedną dawkę dobową.
        'Klarytromycyna': { mgRange: [7, 14], defaultMg: 14, doses: 2, altDoses: [1], duration: 5, maxDailyMg: 1000 },
        // Azytromycyna – w polskich wytycznych dla dorosłych dopuszcza się trzy schematy leczenia:
        // (1) 0,5 g w pierwszym dniu i 0,25 g raz na dobę w dniach 2–5 (5‑dniowy kurs),
        // (2) 0,5 g raz na dobę przez 3 dni, oraz (3) pojedyncza dawka 2 g.  Aby uniknąć konfliktów z
        // innymi wskazaniami, definiujemy każdą opcję jako osobny lek w tej kategorii.
        //  – „Azytromycyna (5 dni)” używa stałej dawki ok. 3 mg/kg mc./dobę (≈250 mg/dobę dla 70 kg).  Pierwszego
        //    dnia lekarz powinien podwoić dawkę, co odpowiada 500 mg.  Domyślna długość terapii wynosi 5 dni.
        //  – „Azytromycyna (3 dni)” stosuje dawkę ok. 7 mg/kg mc./dobę (≈500 mg/dobę) przez 3 dni.
        //  – „Azytromycyna (1 dzień)” reprezentuje jednorazowe podanie 2 g (≈28 mg/kg mc.) w postaci kilku tabletek 500 mg.
        'Azytromycyna (5 dni)': { mgRange: [3, 3], defaultMg: 3, doses: 1, duration: 5, maxDailyMg: 2000 },
        'Azytromycyna (3 dni)': { mgRange: [7, 7], defaultMg: 7, doses: 1, duration: 3, maxDailyMg: 2000 },
        // Usunięto schemat jednodniowy (2 g jednorazowo), ponieważ aktualne
        // wytyczne nie rekomendują tej opcji w leczeniu pozaszpitalnego zapalenia płuc.
        // Amoksycylina z kwasem klawulanowym: 875/125 mg co 8 h (≈38 mg/kg mc./dobę) lub 1 875/125 mg co 12 h (≈54 mg/kg mc./dobę).
        // Ustawiamy zakres 38–54 mg/kg mc./dobę, domyślnie 45 mg/kg mc./dobę i dwie dawki na dobę;
        // dopuszczamy 3 dawki jako alternatywę.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [38, 54], defaultMg: 45, doses: 2, altDoses: [3], duration: 5, maxDailyMg: 4000 },
        // Cefiksym: 200 mg co 12 h lub 400 mg co 24 h (≈6 mg/kg mc./dobę).  Wprowadzamy go jako opcję
        // dla pacjentów z chorobami współistniejącymi.
        'Cefiksym': { mgRange: [6, 6], defaultMg: 6, doses: 2, altDoses: [1], duration: 5, maxDailyMg: 400 },
        // Cefpodoksym pozostaje z zakresem 6 mg/kg mc./dobę; utrzymujemy dwie dawki na dobę.
        'Cefpodoksym': { mgRange: [6, 6], defaultMg: 6, doses: 2, altDoses: [1], duration: 5, maxDailyMg: 400 },
        // Aksetyl cefuroksymu: 500 mg co 12 h (≈14 mg/kg mc./dobę).  Zakres pozostaje bez zmian.
        'Aksetyl cefuroksymu': { mgRange: [14, 14], defaultMg: 14, doses: 2, duration: 5, maxDailyMg: 1000 },
        // Lewofloksacyna: 500 mg co 24 h (≈7 mg/kg mc./dobę) lub 750 mg co 24 h (≈11 mg/kg mc./dobę).
        // Ustawiamy zakres 7–11 mg/kg mc./dobę z jedną dawką na dobę.
        'Lewofloksacyna': { mgRange: [7, 11], defaultMg: 7, doses: 1, duration: 5, maxDailyMg: 750 },
        'Lewofloksacyna i.v.': { mgRange: [7, 11], defaultMg: 7, doses: 1, duration: 5, maxDailyMg: 750 },
        // Moksyfloksacyna pozostaje w dawce 400 mg raz na dobę (≈6 mg/kg mc./dobę).
        'Moksyfloksacyna': { mgRange: [6, 6], defaultMg: 6, doses: 1, duration: 5, maxDailyMg: 400 }
      },
      message: 'Sekcja Antybiotykoterapia dotyczy dawek pediatrycznych. U dorosłych z pozaszpitalnym zapaleniem płuc stosuje się ustalone schematy leczenia.\n' +
        'Minimalny czas terapii wynosi 5 dni; leczenie należy kontynuować co najmniej 48 h po ustąpieniu gorączki i poprawie klinicznej.\n' +
        '\n' +
        'Zalecenia dla zdrowych pacjentów bez chorób współistniejących:\n' +
        '• amoksycylina 1 g 3 ×/dobę przez 5 dni;\n' +
        '• doksycyklina 100 mg 2 ×/dobę przez 5 dni;\n' +
        '• makrolid jest dopuszczalny tylko w regionach o niskiej (<25 %) oporności pneumokoków.\n' +
        '  – Azytromycyna (5 dni): 0,5 g w 1. dniu, następnie 0,25 g/dobę w dniach 2–5;\n' +
        '  – Azytromycyna (3 dni): 0,5 g/dobę przez 3 dni;\n' +
        '  – Klarytromycyna: 500 mg dwa razy na dobę.\n' +
        '\n' +
        'Zalecenia dla pacjentów z chorobami współistniejącymi lub ryzykiem lekooporności:\n' +
        '• amoksycylina + kwas klawulanowy 500/125 mg 3 ×/dobę, 875/125 mg 2 ×/dobę lub 1,875/0,125 g 2 ×/dobę przez 5 dni (wysokodawkowy preparat ES);\n' +
        '• cefpodoksym 200 mg 2 ×/dobę lub cefuroksym 500 mg 2 ×/dobę przez 5 dni;\n' +
        '• do wybranego β‑laktamu dodaj azytromycynę (0,5 g w 1. dniu, następnie 0,25 g/dobę przez 4 dni lub 0,5 g/dobę przez 3 dni) albo doksycyklinę 100 mg 2 ×/dobę.\n' +
        '\n' +
        'W przypadku alergii na β‑laktamy można rozważyć fluorochinolon oddechowy: lewofloksacyna 750 mg 1 ×/dobę przez 5 dni lub moksyfloksacyna 400 mg 1 ×/dobę przez 5 dni. Fluorochinolony stosuje się tylko, gdy inne opcje są przeciwwskazane, ze względu na ryzyko działań niepożądanych i zakażeń C. difficile.'
    },

    // Nowe wskazanie: ostre zapalenie oskrzeli u dorosłych i dzieci.
    // Większość przypadków ma etiologię wirusową; antybiotyki są zarezerwowane dla infekcji bakteryjnych
    // (np. Mycoplasma pneumoniae, Chlamydophila pneumoniae, Bordetella pertussis) oraz osób z
    // istotnymi chorobami współistniejącymi.  Schematy dawkowania i czasy terapii oparto na polskich
    // wytycznych (patrz załączony PDF) oraz literaturze międzynarodowej.
    'bronchitis': {
      label: 'Ostre zapalenie oskrzeli u dorosłych i dzieci',
      drugs: {
        // Klarytromycyna – lek pierwszego wyboru w przypadku zakażeń bakteryjnych wywołanych
        // przez Mycoplasma pneumoniae lub Chlamydophila pneumoniae.  Dawka 15 mg/kg mc./dobę
        // podzielona na dwie dawki co 12 h; dopuszczalny jest również wariant 500 mg raz na dobę
        // (tabletki o przedłużonym uwalnianiu) – altDoses pozwala na wybór 1 dawki/dobę.  Czas
        // terapii skracamy do 7 dni, gdyż w ostrym zapaleniu oskrzeli kuracje są krótsze niż w
        // paciorkowcowym zapaleniu gardła.  Limit dobowy 1000 mg.
        'Klarytromycyna': { mgRange: [15, 15], defaultMg: 15, doses: 2, altDoses: [1], duration: 7, maxDailyMg: 1000, firstChoice: true },
        // Azytromycyna – schemat pięciodniowy: 10 mg/kg mc./dobę (dzień 1: podwójna dawka),
        // stosowany w zakażeniach krztuścem i jako alternatywa dla klarytromycyny.  W ostrym
        // zapaleniu oskrzeli dawka pozostaje stała na poziomie 10 mg/kg mc./dobę, a różnicę
        // dawkowania w poszczególnych dniach opisują dodatkowe komunikaty w funkcji recalc().
        'Azytromycyna (5 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 5, maxDailyMg: 500 },
        // Azytromycyna – schemat trzydniowy (0,5 g na dobę przez 3 dni u dorosłych), który może być
        // stosowany w leczeniu krztuśca u dorosłych i starszych dzieci.  Dla dzieci przeliczamy
        // dawkę 10 mg/kg mc./dobę.  Ograniczamy czas trwania do 3 dni.
        'Azytromycyna (3 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 3, maxDailyMg: 500 },
        // Lewofloksacyna – fluorochinolon drugiego rzutu; stosuj tylko u dorosłych lub nastolatków,
        // gdy inne opcje są przeciwwskazane.  Zakres 7–11 mg/kg mc./dobę odpowiada dawkom
        // 500–750 mg raz na dobę; czas terapii 5 dni; limit dobowy 750 mg.
        'Lewofloksacyna': { mgRange: [7, 11], defaultMg: 7, doses: 1, duration: 5, maxDailyMg: 750 },
        'Lewofloksacyna i.v.': { mgRange: [7, 11], defaultMg: 7, doses: 1, duration: 5, maxDailyMg: 750 },
        // Moksyfloksacyna – fluorochinolon drugiego rzutu; jednorazowa dawka 400 mg/dobę
        // (≈6 mg/kg mc./dobę).  Czas terapii 5 dni.  Preparat dostępny wyłącznie w tabletce 400 mg.
        'Moksyfloksacyna': { mgRange: [6, 6], defaultMg: 6, doses: 1, duration: 5, maxDailyMg: 400 }
      }
    },
    /*
     * Niepowikłane zakażenia dróg moczowych – empiryczna terapia pierwszego rzutu
     * obejmuje nitrofurany (furazydyna), trimetoprim lub jego połączenia, a w
     * razie konieczności cefalosporyny II/III generacji lub amoksycylinę z
     * inhibitorem. Dawki i liczba dawek pochodzą z polskich wytycznych oraz
     * literatury. Fosfomycyna podawana jest jednorazowo. Czas trwania terapii
     * zwykle wynosi 3–7 dni, zależnie od leku.
     */
    'uti_uncomplicated': {
      label: 'Niepowikłane zakażenia dróg moczowych',
      drugs: {
        // Furazydyna (nitrofurantoina) – wg Charakterystyki Produktu Leczniczego dzieci powyżej 3 miesięcy
        // powinny otrzymywać 5–7 mg/kg mc./dobę w dwóch lub trzech dawkach; terapia trwa 7–10 dni.
        // U osób dorosłych stosuje się podobne dawki z limitem 400 mg/dobę. Tutaj przyjmujemy 2 dawki
        // i minimalny czas leczenia 7 dni. W razie potrzeby lekarz może zalecić 3 dawki na dobę.
        'Furazydyna': { mgRange: [5, 7], defaultMg: 6, doses: 2, duration: 7, firstChoice: true },

        // Trimetoprim – w monoterapii dzieci 6–12 lat powinny otrzymywać 2–4 mg/kg mc. co 12 h
        // (4–8 mg/kg mc./dobę), natomiast dorośli i dzieci ≥12 lat 100–200 mg co 12 h. Zgodnie z
        // najnowszymi wytycznymi PTU (2024) niepowikłane zakażenie układu moczowego leczymy
        // przez 5 dni, stosując 200 mg co 12 h (≈ 400 mg/dobę).
        'Trimetoprim': { mgRange: [4, 8], defaultMg: 6, doses: 2, duration: 5 },

        // Trimetoprim‑sulfametoksazol (kotrimoksazol) – dawki odnoszą się do składnika trimetoprimu.
        // Charakterystyki i wytyczne podają 6 mg trimetoprimu + 30 mg sulfametoksazolu na kg mc.
        // na dobę w 2 dawkach, co odpowiada ok. 36 mg/kg mc./dobę. Leczenie trwa co najmniej 5 dni
        // i 2 dni po ustąpieniu objawów.
        'Trimetoprim-sulfametoksazol': { mgRange: [36, 36], defaultMg: 36, doses: 2, duration: 5 },

        // Fosfomycyna trometamol – w niepowikłanym zapaleniu pęcherza moczowego u kobiet i dziewcząt
        // powyżej 12 roku życia stosuje się jedną dawkę 3 g (3000 mg).
        // Lek nie jest zalecany u młodszych dzieci; aby uzyskać 3 g u osoby o masie ok. 40 kg
        // przyjmujemy przelicznik 75 mg/kg mc./dobę. Dawka jest jednorazowa, a globalny limit 3000 mg
        // zapobiega przekroczeniu tej wartości u pacjentów o większej masie ciała.
        'Fosfomycyna': { mgRange: [75, 75], defaultMg: 75, doses: 1, duration: 1 },

        // Aksetyl cefuroksymu – w niepowikłanym zakażeniu dróg moczowych zaleca się 15 mg/kg mc.
        // dwa razy na dobę (30 mg/kg mc./dobę) z maksymalną dawką 250 mg na dawkę (500 mg/dobę)
        // przez 5–10 dni. Ustawiamy stałą wartość 30 mg/kg mc./dobę
        // i skracamy czas terapii do 7 dni.
        // W niepowikłanych zakażeniach układu moczowego zalecana jest dawka 15 mg/kg mc. dwa razy
        // na dobę (30 mg/kg mc./dobę) z maksymalną dawką 250 mg na dawkę (500 mg/dobę).
        // Choć globalny limit dla cefuroksymu doustnego wynosi 1 000 mg/dobę (stosowany w zapaleniu zatok
        // i ucha środkowego), dla tej jednostki chorobowej ograniczamy dawkę do 500 mg/dobę, aby nie
        // przekraczać zaleceń dla zakażeń dróg moczowych. Poniższe pole maxDailyMg wymusza niższy limit.
        'Aksetyl cefuroksymu': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 7, maxDailyMg: 500 },

        // Cefiksym – dzieci od 6 miesięcy do 12 lat otrzymują 8 mg/kg mc./dobę w jednej dawce (lub
        // 4 mg/kg co 12 h); maksymalna dawka dobowa to 400 mg. U osób ≥12 lat podaje się 400 mg
        // w jednej dawce. Czas leczenia niepowikłanego ZUM wynosi 7 dni.
        'Cefiksym': { mgRange: [8, 8], defaultMg: 8, doses: 1, duration: 7 },

        // Ceftibuten – u dzieci ≥6 miesięcy stosuje się 9 mg/kg mc./dobę raz na dobę (max 400 mg/dobę);
        // u młodzieży ≥12 lat 400 mg raz na dobę. Terapia ZUM trwa 7–10 dni;
        // przyjmujemy 7 dni jako minimalny schemat.
        'Ceftibuten': { mgRange: [9, 9], defaultMg: 9, doses: 1, duration: 7 },

        // Amoksycylina z kwasem klawulanowym – w niepowikłanym ZUM zaleca się
        // 25–45 mg/kg mc./dobę amoksycyliny z kwasem klawulanowym w dwóch dawkach podzielonych
        // (co 12 h), z maksymalną dawką pojedynczą 875 mg/125 mg i terapią 7 dni.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 35, doses: 2, duration: 7 },

        // Cefaleksyna – niedostępna w Polsce w terapii niepowikłanego zakażenia dróg moczowych,
        // dlatego nie jest uwzględniana w niniejszym kalkulatorze.
      }
    },
    /*
     * Odmiedniczkowe zapalenie nerek – wymaga intensywniejszej terapii.
     * Leki pierwszego rzutu to doustne cefalosporyny III generacji (cefixim,
     * ceftibuten) lub aksetyl cefuroksymu. W cięższych przypadkach stosuje się
     * dożylne cefalosporyny, aminoglikozydy, fluorchinolony lub karbapenemy.
     * Dawki są podane w mg/kg/dobę, a terapia trwa zwykle 7–14 dni. Leki
     * dożylne (vial) są przeznaczone do hospitalizacji; kalkulator przelicza
     * dawki wagowo.
     */
    'uti_pyelonephritis': {
      label: 'Odmiedniczkowe zapalenie nerek',
      drugs: {
        'Cefiksym': { mgRange: [8, 8], defaultMg: 8, doses: 1, duration: 10, firstChoice: true },
        // Ceftibuten – preparat Cedax jest obecnie niedostępny w Polsce, dlatego usuwamy go z listy leków
        // stosowanych w odmiedniczkowym zapaleniu nerek.
        // Dostosowano zakresy dawek i liczby podań do aktualnych wytycznych PTNFD i CHPL.
        // Aksetyl cefuroksymu: dla pyelonephritis rekomenduje się 30 mg/kg/dobę w 2 dawkach,
        // więc ustawiamy stały zakres 30 mg/kg/dobę (2 dawki).
        'Aksetyl cefuroksymu': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 10 },
        // Cefuroksym (dożylnie): zalecany zakres 50–100 mg/kg/dobę w 3 dawkach, z typową dawką ok. 60 mg/kg/dobę.
        // Obniżono dolną granicę do 50 mg/kg/dobę i zmniejszono domyślną dawkę do 75 mg/kg/dobę.
        'Cefuroksym (dożylnie)': { mgRange: [50, 100], defaultMg: 75, doses: 3, duration: 10 },
        // Cefotaksym: u dzieci do 12 lat stosuje się 50–100 mg/kg/dobę w 2–4 dawkach, a u dorosłych 3–6 g/dobę.
        // Zawężamy górną granicę do 100 mg/kg/dobę i ustawiamy domyślnie 80 mg/kg/dobę.
        'Cefotaksym': { mgRange: [50, 100], defaultMg: 80, doses: 3, duration: 10 },
        // Ceftriakson: w pyelonephritis podaje się 20–50 mg/kg mc. raz na dobę (max 2 g/dobę).
        'Ceftriakson': { mgRange: [20, 50], defaultMg: 40, doses: 1, duration: 10 },
        // Cefepim: zalecane 50 mg/kg co 12 h (lub co 8 h w cięższych zakażeniach), czyli 60–100 mg/kg/dobę.
        // Pozostawiamy zakres 50–100 mg/kg/dobę i redukujemy domyślną dawkę do 70 mg/kg/dobę.
        'Cefepim': { mgRange: [50, 100], defaultMg: 70, doses: 2, duration: 10 },
        // Gentamycyna: w powikłanych ZUM u dzieci >2 mies. 3–6 mg/kg/dobę w pojedynczej dawce, u niemowląt 4,5–7,5 mg/kg.
        // Ustawiamy zakres 3–6 mg/kg/dobę i domyślnie 5 mg/kg, jedna dawka.
        'Gentamycyna': { mgRange: [3, 6], defaultMg: 5, doses: 1, duration: 7 },
        // Amikacyna: dzieci 4 tyg.–11 lat 15–20 mg/kg/dobę (1×/dobę lub 7,5 mg/kg co 12 h), dorośli 15 mg/kg/dobę.
        // Zakres 15–20 mg/kg/dobę, domyślnie 15 mg/kg.
        'Amikacyna': { mgRange: [15, 20], defaultMg: 15, doses: 1, duration: 7 },
        // Cyprofloksacyna: w ostrym odmiedniczkowym zapaleniu nerek u dzieci 6–10 mg/kg co 8 h (3 dawki), czyli 18–30 mg/kg/dobę (max 400 mg na dawkę).
        // Ustawiamy zakres 18–30 mg/kg/dobę, domyślnie 24 mg/kg, i zwiększamy liczbę dawek do 3.
        'Cyprofloksacyna': { mgRange: [18, 30], defaultMg: 24, doses: 3, duration: 10 },
        // Doustna postać cyprofloksacyny – fluorochinolon pierwszego wyboru w odmiedniczkowym zapaleniu nerek u dorosłych.
        // Zalecane dawkowanie doustne wynosi 10–20 mg/kg masy ciała na dawkę, co odpowiada 20–40 mg/kg/dobę w dwóch podaniach.
        // Maksymalna pojedyncza dawka nie powinna przekraczać 750 mg, a terapia trwa zwykle 7–10 dni.
        // Ustawiamy domyślny zakres 20–40 mg/kg/dobę, domyślną dawkę 30 mg/kg i limit 1 500 mg na dobę.
        // Dzięki polu altDurations umożliwiamy skrócenie terapii do 7 dni, a altTablets pozwala wyświetlić schemat 2×750 mg (1,5 tabletki 500 mg),
        // który jest maksymalną dawką w tym wskazaniu.
        'Cyprofloksacyna (doustna)': { mgRange: [20, 40], defaultMg: 30, doses: 2, duration: 10, altDurations: [7], maxDailyMg: 1500, firstChoice: true, altTablets: [1.5] },
        // Lewofloksacyna: brak jednoznacznych zaleceń pediatrycznych – stosuje się 10–15 mg/kg/dobę raz na dobę u dzieci starszych, a u dorosłych 500 mg/dobę.
        // Redukujemy górną granicę do 15 mg/kg/dobę i domyślną dawkę do 10 mg/kg.
        'Lewofloksacyna': { mgRange: [10, 15], defaultMg: 10, doses: 1, duration: 10 },
        'Lewofloksacyna i.v.': { mgRange: [10, 15], defaultMg: 10, doses: 1, duration: 10 },
        // Piperacylina z tazobaktamem: w odmiedniczkowym ZUM dzieci 2–12 lat otrzymują 112,5 mg/kg co 8 h (tj. 337,5 mg/kg/dobę), dorośli 4,5 g co 8 h.
        // Dopasowujemy zakres 300–337,5 mg/kg/dobę i domyślną dawkę 337 mg/kg, pozostawiając 3 dawki.
        'Piperacylina z tazobaktamem': { mgRange: [300, 337.5], defaultMg: 337, doses: 3, duration: 10 },
        // Imipenem z cilastatyną: dzieci ≥3 mies. 15–25 mg/kg co 6 h, czyli 60–100 mg/kg/dobę.
        // Zmieniamy zakres na 60–100 mg/kg/dobę, domyślnie 80 mg/kg, i zwiększamy liczbę dawek do 4.
        'Imipenem z cilastatyną': { mgRange: [60, 100], defaultMg: 80, doses: 4, duration: 10 },
        // Meropenem: u dzieci 20 mg/kg co 8 h (60 mg/kg/dobę) w umiarkowanych zakażeniach; w cięższych 40 mg/kg co 8 h (120 mg/kg/dobę).
        // Zakres pozostaje 60–120 mg/kg/dobę, ale domyślną dawkę redukujemy do 80 mg/kg.
        'Meropenem': { mgRange: [60, 120], defaultMg: 80, doses: 3, duration: 10 },
        // Doripenem: brak zaleceń pediatrycznych, u dorosłych 500 mg co 8 h (1,5 g/dobę) lub 1 g co 8 h (3 g/dobę).
        // Aby unikać niedodawkowania u większych dzieci, ustalamy sztywne 60 mg/kg/dobę (3 dawki) z domyślną 60 mg/kg.
        'Doripenem': { mgRange: [60, 60], defaultMg: 60, doses: 3, duration: 10 },
        'Amoksycylina z kwasem klawulanowym': { mgRange: [45, 60], defaultMg: 50, doses: 3, duration: 10 }
      }
    },
    /*
     * Powikłane i inne zakażenia układu moczowego – obejmują zakażenia u
     * mężczyzn, kobiet w ciąży, pacjentów z cewnikiem oraz przewlekłe lub
     * nawracające ZUM. Dawki są zbliżone do tych stosowanych w odmiedniczkowym
     * ZUM, lecz terapie często trwają dłużej. Wybrane leki pierwszego wyboru
     * to furazydyna i beta‑laktamy. Karbapenemy i piperacylina/tazobaktam
     * stosowane są w najcięższych przypadkach.
     */
    'uti_other': {
      label: 'Powikłane i inne zakażenia układu moczowego',
      drugs: {
        // Furazydyna (nitrofurantoina) – nie osiąga odpowiednich stężeń w tkance nerkowej, dlatego nie zaleca się jej w leczeniu powikłanych zakażeń układu moczowego ani odmiedniczkowego zapalenia nerek.
        // Zachowujemy jednak zakres 5–7 mg/kg/dobę jako orientacyjną dawkę, ale usuwamy oznaczenie firstChoice.
        'Furazydyna': { mgRange: [5, 7], defaultMg: 6, doses: 4, duration: 7 },
        // Cyprofloksacyna (doustna) – fluorochinolon pierwszego wyboru w powikłanych zakażeniach układu moczowego.  Dawkowanie doustne u dzieci to 10–20 mg/kg m.c. 2 ×/dobę (20–40 mg/kg/dobę) z maksymalną pojedynczą dawką 750 mg; u dorosłych stosuje się 500–750 mg 2 ×/dobę przez co najmniej 7–10 dni.  Przekładamy to na zakres 20–40 mg/kg/dobę w dwóch dawkach, z domyślną wartością 30 mg/kg i limitem 1500 mg/dobę.
        'Cyprofloksacyna (doustna)': { mgRange: [20, 40], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 1500, firstChoice: true },

        // Lewofloksacyna – fluorochinolon drugiego rzutu; w powikłanych zakażeniach układu moczowego
        // u dorosłych stosuje się 10–15 mg/kg mc./dobę raz na dobę z maksymalną dawką 500 mg/dobę.
        // Nie stosować u dzieci; w filtrze populateDrugs() ukryjemy tę pozycję u osób <18 lat.
        'Lewofloksacyna': { mgRange: [10, 15], defaultMg: 10, doses: 1, duration: 10, maxDailyMg: 500 },

        // Cyprofloksacyna (dożylna) – pozajelitowa postać cyprofloksacyny stosowana w cięższych powikłanych zakażeniach układu moczowego.  SmPC zaleca 6–10 mg/kg m.c. co 8 h (3 dawki) u dzieci (18–30 mg/kg/dobę) oraz 400 mg 2–3 ×/dobę u dorosłych (800–1 200 mg/dobę) przez 7–21 dni.  Przyjmujemy zakres 18–30 mg/kg/dobę w trzech dawkach, domyślnie 24 mg/kg, z limitem 1 200 mg/dobę.
        'Cyprofloksacyna (dożylna)': { mgRange: [18, 30], defaultMg: 24, doses: 3, duration: 10, maxDailyMg: 1200 },
        // Amoksycylina – w leczeniu powikłanych zakażeń układu moczowego stosuje się
        // wysokodawkowy schemat 80–90 mg/kg mc./dobę, podzielony na trzy podania.
        // Zgodnie z aktualnymi wytycznymi w tym wskazaniu maksymalna dawka dobowa
        // wynosi 3 000 mg (3 g) amoksycyliny, co jest niższe niż ogólny limit 4 000 mg dla dorosłych.
        // Ustawienie parametru maxDailyMg na 3000 zapewnia, że kalkulator przeliczy
        // dawkę tak, aby nie przekraczała tego limitu.
        'Amoksycylina': { mgRange: [80, 90], defaultMg: 90, doses: 3, duration: 10, maxDailyMg: 3000 },
        // Amoksycylina z kwasem klawulanowym – w powikłanych zakażeniach układu moczowego i odmiedniczkowym zapaleniu nerek używa się 45 mg/kg amoksycyliny na dawkę podawaną co 12 h (2 dawki), co odpowiada 90 mg/kg/dobę.  
        'Amoksycylina z kwasem klawulanowym': { mgRange: [80, 90], defaultMg: 90, doses: 2, duration: 10 },
        // Cefaleksyna – doustna cefalosporyna I generacji stosowana w terapii następczej. Przy pyelonephritis zaleca się 25 mg/kg/dawkę 4 ×/dobę (czyli 100 mg/kg/dobę), z maksymalną dawką 1 g na podanie.  
        'Cefaleksyna': { mgRange: [75, 100], defaultMg: 100, doses: 4, duration: 10, maxDailyMg: 4000 },
        // Aksetyl cefuroksymu – dla powikłanych zakażeń układu moczowego u dzieci
        // zaleca się 30 mg/kg mc./dobę w dwóch dawkach (co 12 h), z maksymalną
        // dawką dobową 500 mg. U dorosłych natomiast aksetyl cefuroksymu
        // jest zwykle zastępowany innymi cefalosporynami lub fluorochinolonami,
        // dlatego w tym wskazaniu nie będzie wyświetlany (filtr w populateDrugs()).
        'Aksetyl cefuroksymu': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 500 },
        // Fosfomycyna – pojedyncza dawka 3 g stosowana jest wyłącznie w niepowikłanych zakażeniach dolnych dróg moczowych. W powikłanych zakażeniach i odmiedniczkowym zapaleniu nerek nie jest rekomendowana.  
        'Fosfomycyna': { mgRange: [50, 50], defaultMg: 50, doses: 1, duration: 1 },
        // Cefuroksym (dożylnie) – w cięższych zakażeniach układu moczowego dawka wynosi 50 mg/kg co 8 h do 150 mg/kg/dobę; górna granica stosowana w ciężkich zakażeniach.  
        'Cefuroksym (dożylnie)': { mgRange: [75, 150], defaultMg: 100, doses: 3, duration: 10 },
        // Cefotaksym – w powikłanych zakażeniach układu moczowego i odmiedniczkowym zapaleniu nerek zalecane jest 100–200 mg/kg/dobę w 3 dawkach.  
        'Cefotaksym': { mgRange: [100, 200], defaultMg: 150, doses: 3, duration: 10 },
        // Ceftriakson – terapia parenteralna 50 mg/kg/dobę w jednej dawce do maks. 2 g/dobę.  
        'Ceftriakson': { mgRange: [50, 50], defaultMg: 50, doses: 1, duration: 10 },
        // Cefepim – w powikłanych zakażeniach układu moczowego stosuje się 50 mg/kg co 8–12 h (100–150 mg/kg/dobę); przyjmujemy zakres 100–150 mg/kg/dobę.  
        'Cefepim': { mgRange: [100, 150], defaultMg: 100, doses: 3, duration: 10 },
        // Piperacylina z tazobaktamem – u dzieci 2–12 lat 112,5 mg/kg co 8 h (337,5 mg/kg/dobę); przyjmujemy zakres 270–337,5 mg/kg/dobę z domyślną wartością 300 mg/kg.  
        'Piperacylina z tazobaktamem': { mgRange: [270, 337.5], defaultMg: 300, doses: 3, duration: 10 },
        // Imipenem z cilastatyną – dzieci ≥3 mies. otrzymują 15–25 mg/kg co 6 h (60–100 mg/kg/dobę).  
        'Imipenem z cilastatyną': { mgRange: [60, 100], defaultMg: 80, doses: 4, duration: 10 },
        // Meropenem – w umiarkowanych zakażeniach 20 mg/kg co 8 h (60 mg/kg/dobę); w cięższych 40 mg/kg co 8 h (120 mg/kg/dobę).  
        'Meropenem': { mgRange: [60, 120], defaultMg: 80, doses: 3, duration: 10 },
        // Doripenem – brak danych pediatrycznych; u dorosłych stosuje się 500 mg co 8 h (1,5 g/dobę) lub 1 g co 8 h (3 g/dobę).  
        // Pozostawiamy zakres 60–120 mg/kg/dobę i trzy dawki, ale dodajemy komunikat ostrzegawczy w kalkulatorze.  
        'Doripenem': { mgRange: [60, 120], defaultMg: 80, doses: 3, duration: 10 }
      }
    }
    ,

    // Leczenie boreliozy (choroba z Lyme)
    // Wczesne i układowe postacie zakażenia Borrelia wymagają doustnych antybiotyków przez 10–14 dni.
    // Lekami pierwszego wyboru są doksycyklina, amoksycylina i aksetyl cefuroksymu. Makrolidy
    // (azytromycyna) mają mniejszą skuteczność i stosuje się je wyłącznie, gdy preparaty
    // pierwszoliniowe są przeciwwskazane. W cięższych postaciach (neuroborelioza, zapalenie serca)
    // stosuje się leczenie dożylne (ceftriakson, cefotaksym) przez 14–21 dni.
    'lyme': {
      label: 'Leczenie boreliozy',
      drugs: {
        'Doksycyklina': { mgRange: [4, 4], defaultMg: 4, doses: 2, altDoses: [1], duration: 14, firstChoice: true },
        'Amoksycylina': { mgRange: [50, 50], defaultMg: 50, doses: 3, duration: 14, maxDailyMg: 4000, firstChoice: true },
        'Aksetyl cefuroksymu': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 14, maxDailyMg: 1000, firstChoice: true },
        'Azytromycyna (7 dni)': { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 7, altDurations: [5, 10], maxDailyMg: 500 },
        'Ceftriakson': { mgRange: [50, 50], defaultMg: 50, doses: 1, duration: 14, altDurations: [21], maxDailyMg: 2000 },
        'Cefotaksym': { mgRange: [100, 100], defaultMg: 100, doses: 3, duration: 14, altDurations: [21], maxDailyMg: 6000 }
      }
    },
    /*
     * Zakażenia skóry i tkanki podskórnej – kategoria ropni i czyraków (abscess). Leczenie obejmuje doustne
     * cefalosporyny I generacji, klindamycynę oraz amoksycylinę z klawulanianem, a w cięższych przypadkach
     * dożylnie cefazolinę, wankomycynę lub linezolid. Zakresy dawek oparto na zaleceniach IDSA i polskich wytycznych.
     */
    'ssti_abscess': {
      label: 'Ropnie i czyraki',
      drugs: {
        // Zgodnie z aktualnymi wytycznymi IDSA oraz lokalnych programów
        // antybiotykoterapii, nieskomplikowane ropnie u dzieci zwykle wymagają
        // jedynie nacięcia i drenażu, a antybiotyki stosuje się tylko w razie
        // towarzyszącej rozległej cellulitis, dużego rozmiaru (>5 cm) lub
        // objawów ogólnych. Jeżeli konieczne jest leczenie systemowe,
        // preferuje się klindamycynę lub kotrimoksazol przez 5 dni.
        // Cefaleksyna – w Polsce preparaty doustne są obecnie niedostępne w leczeniu ropni i czyraków,
        // dlatego nie udostępniamy tego antybiotyku w tej jednostce chorobowej.
        'Cefadroksyl': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 5 },
        // Klindamycyna stosowana jest w dawce 10 mg/kg co 8 godzin (≈30 mg/kg/dobę)
        // maks. 450 mg na dawkę; czas leczenia 5 dni.
        'Klindamycyna': { mgRange: [30, 30], defaultMg: 30, doses: 3, duration: 5, firstChoice: true },
        // Zmodyfikowano parametry dawkowania amoksycyliny z kwasem klawulanowym
        // dla ropni i czyraków. Umiarkowane infekcje skóry leczymy dawką
        // 25–45 mg/kg/dobę w dwóch podaniach. Czas terapii skrócono do 5 dni,
        // ponieważ krótsze kuracje są wystarczające.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 35, doses: 2, duration: 5 },
        // Cefazolina dożylna w leczeniu ropni jest stosowana w dawce 33 mg/kg/dawkę
        // co 8 godzin (≈100 mg/kg/dobę). Dlatego zwiększono górny limit
        // i skrócono czas terapii do 5 dni.
        'Cefazolina': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 5 },
        // Metronidazol stosuje się pomocniczo w zakażeniach beztlenowych skóry;
        // terapię skrócono do 5 dni.
        'Metronidazol': { mgRange: [10, 15], defaultMg: 12, doses: 3, duration: 5 },
        'Wankomycyna': { mgRange: [40, 60], defaultMg: 45, doses: 2, duration: 7 },
        'Linezolid': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 7 },
        // Dodano kotrimoksazol (trimetoprim‑sulfametoksazol) jako alternatywę
        // dla MRSA – 4–6 mg trimetoprimu/kg co 12 h przez 5 dni.
        'Trimetoprim-sulfametoksazol': { mgRange: [8, 12], defaultMg: 10, doses: 2, duration: 5 }
      }
    },
    /*
     * Zapalenie tkanki łącznej (cellulitis) i róża – zakażenia skóry o większym zakresie. Pierwszym wyborem są penicyliny
     * przeciw paciorkowcom, cefaleksyna lub cefadroksyl; w alergii na β‑laktamy stosuje się klindamycynę. W cięższych
     * przypadkach stosuje się cefazolinę, cefuroksym, kloksacylinę lub glikopeptydy.
     */
    'ssti_cellulitis': {
      label: 'Zapalenie tkanki łącznej i róża',
      drugs: {
        // Fenoksymetylpenicylina (Penicylina V) – w łagodnym cellulitis/róży zaleca się
        // około 20 mg/kg mc. na dawkę co 8 h (≈60 mg/kg mc./dobę), maksymalnie
        // 500 mg na dawkę. Czas terapii wynosi 5 dni i może zostać
        // wydłużony do 7–10 dni przy powolnej poprawie. Zmieniamy
        // zakres na 50–60 mg/kg mc./dobę, skracamy terapię do 5 dni i pozostawiamy 3 dawki.
        'Fenoksymetylpenicylina': { mgRange: [50, 60], defaultMg: 55, doses: 3, duration: 5, firstChoice: true },
        // Amoksycylina – zgodnie z wytycznymi pediatrycznymi stosuje się
        // 12,5 mg/kg mc. co 8 h (≈37,5 mg/kg mc./dobę), maks. 500 mg na dawkę.
        // Aby uwzględnić wyższą skuteczność przy 3 dawkach oraz tolerancję, ustawiamy
        // zakres 40–50 mg/kg mc./dobę, domyślną wartość 45 mg/kg mc./dobę i
        // 3 dawki przez 5 dni.
        'Amoksycylina': { mgRange: [40, 50], defaultMg: 45, doses: 3, duration: 5 },
        // Amoksycylina z kwasem klawulanowym – w umiarkowanym cellulitisie
        // stosuje się 22,5 mg/kg mc. amoksycyliny co 12 h (≈45 mg/kg mc./dobę) przez 5 dni.
        // Ustawiamy zakres 40–45 mg/kg mc./dobę, domyślną wartość 45 mg i 2 dawki.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [40, 45], defaultMg: 45, doses: 2, duration: 5 },
        // Cefaleksyna – choć tradycyjnie stosowana w leczeniu cellulitis/róży, w Polsce preparat jest niedostępny,
        // dlatego nie pojawia się w opcjach antybiotykoterapii w tym wskazaniu.
        // Cefadroksyl – 30 mg/kg mc./dobę w dwóch dawkach stanowi alternatywę; skracamy terapię do 5 dni.
        'Cefadroksyl': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 5 },
        // Klindamycyna – dawka 10 mg/kg mc. co 8 h (≈30 mg/kg mc./dobę) przez 5 dni.
        'Klindamycyna': { mgRange: [20, 30], defaultMg: 30, doses: 3, duration: 5 },
        // Cefuroksym i.v. – zakres 75–100 mg/kg mc./dobę w 3 dawkach pozostaje, skracamy terapię do 5 dni.
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 5 },
        // Cefazolina – zalecana dawka 25 mg/kg mc. co 8 h (≈75 mg/kg/dobę); skracamy terapię do 5 dni.
        'Cefazolina': { mgRange: [75, 100], defaultMg: 90, doses: 3, duration: 5 },
        // Kloksacylina – w leczeniu MSSA dawkuje się 12,5 mg/kg mc. co 6 h (≈50 mg/kg mc./dobę). Ustawiamy
        // zakres 50–100 mg/kg mc./dobę z domyślną 75 mg, 4 dawki i 5 dni terapii.
        'Kloksacylina': { mgRange: [50, 100], defaultMg: 75, doses: 4, duration: 5 },
        // Benzylopenicylina – stosuje się 50 000–100 000 j.m./kg mc. (≈33–65 mg/kg mc./dobę);
        // skracamy terapię do 5 dni i pozostawiamy 4 dawki.
        'Benzylopenicylina': { mgRange: [50, 75], defaultMg: 60, doses: 4, duration: 5 },
        // Wankomycyna – w ciężkich przypadkach stosuje się 15 mg/kg mc. co 6 h (≈60 mg/kg mc./dobę);
        // pozostawiamy 4 dawki i ograniczamy terapię do 7 dni.
        'Wankomycyna': { mgRange: [60, 60], defaultMg: 60, doses: 4, duration: 7 },
        // Linezolid – dawka 10 mg/kg mc. co 8 h (<12 lat) czyli 30 mg/kg mc./dobę;
        // u starszych dzieci stosuje się 600 mg co 12 h. Ustawiamy 3 dawki i 7 dni terapii.
        'Linezolid': { mgRange: [30, 30], defaultMg: 30, doses: 3, duration: 7 },
        // Dodajemy trimetoprim‑sulfametoksazol jako lek alternatywny na MRSA; dawka 4–6 mg/kg mc. trimetoprimu
        // co 12 h (≈8–12 mg/kg mc./dobę) przez 5 dni.
        'Trimetoprim-sulfametoksazol': { mgRange: [8, 12], defaultMg: 10, doses: 2, duration: 5, maxDailyMg: 320 }
      }
    },
    /*
     * Zakażone rany – obejmują miejscowe zakażenia pourazowe oraz zakażenia pooperacyjne. Terapię empiryczną stanowi
     * amoksycylina z kwasem klawulanianem lub cefaleksyna, w przypadku flory mieszanej dołącza się metronidazol.
     */
    'ssti_wound': {
      label: 'Zakażone rany',
      drugs: {
        // W zakażonych ranach umiarkowanego stopnia preferujemy 2×
        // dawkowanie tabletek 875 mg/125 mg. Ustawiono zakres 25–45 mg/kg/dobę
        // z domyślną wartością 35 mg/kg/dobę i liczbą dawek = 2.
        // Skracamy terapię zakażonych ran do 5 dni dla większości doustnych leków, zgodnie z zaleceniami pediatrycznymi dla cellulitis/erysipelas.
        // Amoksycylina z kwasem klawulanowym – 22,5 mg/kg mc. co 12 h (≈45 mg/kg mc./dobę) przez 5 dni jest standardem w leczeniu umiarkowanych zakażeń skóry.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 35, doses: 2, duration: 5, firstChoice: true },
        // Cefaleksyna – preparat nie jest obecnie dostępny na rynku polskim do leczenia zakażonych ran,
        // dlatego został wyłączony z listy rekomendowanych antybiotyków.
        // Cefuroksym i.v. – zakres 75–100 mg/kg mc./dobę w 3 dawkach utrzymujemy, ale skracamy terapię do 5 dni.
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 5 },
        // Cefazolina – zalecane jest ok. 33 mg/kg/dawkę co 8 h (≈100 mg/kg/dobę) w umiarkowanych zakażeniach. Zmieniamy zakres na 75–100 mg/kg/dobę z domyślną wartością 90 mg i skracamy terapię do 5 dni.
        'Cefazolina': { mgRange: [75, 100], defaultMg: 90, doses: 3, duration: 5 },
        // Klindamycyna – 10 mg/kg/dawkę co 8 h (≈30 mg/kg mc./dobę) przez 5 dni. Ustawiamy domyślną dawkę 30 mg/kg mc./dobę.
        'Klindamycyna': { mgRange: [20, 30], defaultMg: 30, doses: 3, duration: 5 },
        // Metronidazol – stosuje się 10 mg/kg mc. co 12 h (20 mg/kg mc./dobę) w terapii skojarzonej. Zmieniamy na 2 dawki i 5 dni.
        'Metronidazol': { mgRange: [20, 20], defaultMg: 20, doses: 2, duration: 5 },
        // Cyprofloksacyna – u dzieci z alergią na beta‑laktamy stosuje się 20–30 mg/kg mc./dobę w dwóch dawkach. Skracamy terapię do 5 dni.
        'Cyprofloksacyna': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 5 },
        // Piperacylina z tazobaktamem – pozostaje bez zmian (3 dawki przez 10 dni) dla ciężkich zakażeń.
        'Piperacylina z tazobaktamem': { mgRange: [200, 300], defaultMg: 240, doses: 3, duration: 10 },
        // Wankomycyna – w ciężkich zakażeniach skóry stosuje się 15 mg/kg/dawkę co 6 h (≈60 mg/kg mc./dobę). Ustawiamy zakres 60 mg/kg mc./dobę, 4 dawki dziennie i 7 dni terapii.
        'Wankomycyna': { mgRange: [60, 60], defaultMg: 60, doses: 4, duration: 7 },
        // Linezolid – dawka 10 mg/kg/dawkę co 8 h (<12 lat) czyli 30 mg/kg mc./dobę z maksymalnie 600 mg/dawkę; dla starszych 600 mg co 12 h. Ustawiamy 3 dawki i 7 dni terapii.
        'Linezolid': { mgRange: [30, 30], defaultMg: 30, doses: 3, duration: 7 },
        // Dodajemy trimetoprim‑sulfametoksazol jako lek alternatywny na MRSA. Dawka 4–6 mg/kg mc. trimetoprimu co 12 h (8–12 mg/kg mc./dobę) przez 5 dni.
        'Trimetoprim-sulfametoksazol': { mgRange: [8, 12], defaultMg: 10, doses: 2, duration: 5, maxDailyMg: 320 }
      }
    },
    /*
     * Zakażenia po ugryzieniach – infekcje spowodowane florą jamy ustnej zwierząt (psy, koty, ludzie). Pierwszym wyborem
     * jest amoksycylina z kwasem klawulanowym; alternatywy obejmują klindamycynę z cyprofloksacyną lub metronidazolem.
     */
    'ssti_bite': {
      label: 'Zakażenia po ugryzieniach',
      drugs: {
        // Zakażenia po ugryzieniach leczone są zwykle schematem 2× dobę.
        // Zakres dawek 25–45 mg/kg/dobę umożliwia podawanie 1 tabletki
        // 875 mg/125 mg co 12 godzin u pacjentów ≥40 kg. Zmieniono liczbę
        // dawek i wartości mgRange na niższy zakres.
        // Amoksycylina z kwasem klawulanowym jest lekiem pierwszego wyboru w leczeniu zakażeń po ugryzieniach.
        // Wytyczne pediatryczne zalecają dawkę około 22,5 mg/kg mc. co 12 h (czyli ~45 mg/kg mc./dobę), maksymalnie 875 mg na dawkę.
        // Leczenie najczęściej trwa 5 dni; dłuższy kurs (do 7 dni) rezerwuje się dla aktywnych zakażeń.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 40, doses: 2, duration: 5, firstChoice: true },
        // Cefuroksym i.v. jest rzadko stosowany w zakażeniach po ugryzieniach; najczęściej stosuje się ampicylinę/sulbaktam lub ceftriakson z metronidazolem.
        // Pozostawiamy dawkę w dotychczasowym zakresie, lecz skracamy terapię do 5 dni w lżejszych przypadkach.
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 5 },
        // Klindamycyna: zalecana dawka to 10 mg/kg mc. co 8 h (≈30 mg/kg mc./dobę) w skojarzeniu z innymi lekami przy alergii na penicyliny.
        // Ustawiamy zakres 20–30 mg/kg mc./dobę, domyślną wartość 30 mg/kg mc./dobę i skracamy czas terapii do 5 dni.
        'Klindamycyna': { mgRange: [20, 30], defaultMg: 30, doses: 3, duration: 5 },
        // Cyprofloksacyna jest stosowana u dzieci z alergią na beta‑laktamy w skojarzeniu z trimetoprim‑sulfametoksazolem lub klindamycyną.
        // Zalecane dzienne dawki mieszczą się w zakresie 20–30 mg/kg mc., podawane w dwóch dawkach. Skracamy czas terapii do 5 dni.
        'Cyprofloksacyna': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 5 },
        // Metronidazol w schemacie doustnym podaje się 10 mg/kg mc. co 12 h (20 mg/kg mc./dobę) jako część terapii skojarzonej, np. z trimetoprim‑sulfametoksazolem.
        // Redukujemy liczbę dawek do 2 na dobę i skracamy terapię do 5 dni.
        'Metronidazol': { mgRange: [20, 20], defaultMg: 20, doses: 2, duration: 5 },
        // Dodajemy trimetoprim‑sulfametoksazol (kotrimoksazol) jako opcję dla pacjentów uczulonych na penicyliny lub z podejrzeniem MRSA.
        // Zalecana dawka trimetoprimu 4–6 mg/kg mc. co 12 h (8–12 mg/kg mc./dobę) przez 5 dni.
        'Trimetoprim-sulfametoksazol': { mgRange: [8, 12], defaultMg: 10, doses: 2, duration: 5, maxDailyMg: 320 },
        'Cefazolina': { mgRange: [50, 75], defaultMg: 60, doses: 3, duration: 7 },
        'Benzylopenicylina': { mgRange: [50, 75], defaultMg: 60, doses: 4, duration: 7 },
        'Wankomycyna': { mgRange: [40, 60], defaultMg: 45, doses: 2, duration: 7 },
        'Linezolid': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 7 }
      }
    }
  };

  // Utwórz uporządkowaną listę kluczy wskazań posortowanych alfabetycznie według etykiety.
  const INDICATION_ORDER = Object.keys(ABX_INDICATIONS).sort((a, b) => {
    const la = ABX_INDICATIONS[a].label.toLocaleLowerCase('pl-PL');
    const lb = ABX_INDICATIONS[b].label.toLocaleLowerCase('pl-PL');
    return la.localeCompare(lb, 'pl-PL');
  });

  // Pobierz masę ciała w kilogramach z sekcji „Dane użytkownika”. Jeśli brak, zwróć null.
  function getWeight(){
    const el = document.getElementById('weight');
    if(!el) return null;
    const w = parseFloat(el.value);
    return (isNaN(w) || w <= 0) ? null : w;
  }

  // Formatowanie liczb: używamy polskich separatorów, ale usuwamy zbędne zera po przecinku.
  // Zamiast zawsze wymuszać dwa miejsca po przecinku (np. 360,00 mg), pozwalamy na 0–2 miejsca
  // i usuwamy końcowe zera. Dzięki temu wartości takie jak 360,00 stają się „360”,
  // 0,50 staje się „0,5”, a 7,25 pozostaje „7,25”.
  function fmt(n){
    if (!isFinite(n)) return '–';
    // Ograniczamy do dwóch miejsc po przecinku, ale bez wymuszania
    const formatted = n.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return formatted;
  }

  // Flaga globalna wskazująca, czy użytkownik włączył tryb własnego ustalania dawki.
  // Gdy customDoseActive jest true, suwak dawki zostaje odblokowany w szerszym zakresie
  // (od połowy minimalnej dawki do podwójnej maksymalnej) i wyświetlane są ostrzeżenia,
  // że takie dawki nie są rekomendowane.  Ustawienie to jest resetowane po kliknięciu
  // przycisku „Powróć do rekomendowanej dawki” lub przy zmianie leku/wskazania.
  let customDoseActive = false;

  // === Zmienne globalne sterujące ograniczeniem dawki dobowej ===
  // Wartość ostatniego limitu dobowego zastosowanego w obliczeniach (effectiveMax). Jeżeli null, brak limitu.
  window.lastEffectiveMax = null;
  // Maksymalna dozwolona wartość suwaka (mg/kg/dobę) wynikająca z limitu dobowego. Obliczana jako effectiveMax / masa ciała.
  // Jeżeli null, suwak nie jest ograniczony przez limit dobowy (poza zakresem referencyjnym).
  window.maxValueAllowed = null;
  // Flaga sygnalizująca, że suwak został całkowicie wyłączony z powodu limitu dobowego (brak możliwości wyboru żadnej dawki w zakresie).
  // Dotyczy wyłącznie leków o zakresie dawek (mgRange[min]!=mgRange[max]).
  window.sliderDisabledByLimit = false;

// Flaga sygnalizująca widoczność listy schematów leczenia boreliozy.
// Jeśli true – lista jest rozwinięta; false – przycisk jest widoczny, ale lista ukryta.
let schemesVisible = false;

  // Główna funkcja tworząca element karty antybiotykoterapii.
  function createCard(){
    const card = document.createElement('section');
    card.id = 'antibioticTherapyCard';
    card.className = 'result-card animate-in';
    card.style.margin = '1rem 0';
    abxSetTrustedMarkup(card, `
      <h2 style="text-align:center;">Antybiotykoterapia</h2>
      <!-- W początkowym stanie modułu nie wybieramy automatycznie wskazania.  Zamiast tego
           wyświetlamy użytkownikowi instrukcję, aby wybrał wskazanie z listy.  Ten element
           jest ukrywany po dokonaniu wyboru w populateDrugs().  Kolor ciemnopomarańczowy
           (#c75d00) spójny z innymi ostrzeżeniami w interfejsie. -->
      <p id="abxInitialPrompt" style="text-align:center; color:#c75d00; font-weight:600; margin-top:.4rem;">
        Wybierz wskazanie do antybiotykoterapii, aby zobaczyć wyniki.
      </p>
      <div class="flex" style="display:flex; gap:.75rem; flex-wrap:wrap;">
        <label style="flex:1 1 240px; min-width:220px;">
          Wskazanie
          <select id="abxIndication"></select>
        </label>
        <label style="flex:1 1 240px; min-width:220px;">
          Antybiotyk
          <select id="abxDrug"></select>
        </label>
        <!-- Selektor postaci farmaceutycznej. Domyślnie ukryty, widoczny tylko dla leków mających różne postacie (np. klarytromycyna). -->
        <label id="abxFormWrapper" style="flex:1 1 240px; min-width:220px; display:none;">
          Preparat
          <select id="abxForm"></select>
        </label>
      </div>
      <div id="abxControls" style="display:none; margin-top:.8rem;">
        <label style="display:block; margin-top:.4rem; text-align:center;">
          Dawka (<span id="abxDoseDisplay">mg/kg/dobę</span>)
          <!-- Kontener suwaka z podziałką i dynamiczną etykietą. Podziałka umieszczona jest nad suwakiem, natomiast etykieta bieżącej wartości – pod suwakiem. -->
          <div class="dose-slider-container">
            <!-- Podziałka (znaczniki i etykiety) generowana dynamicznie w JS; umieszczona powyżej suwaka. -->
            <div id="sliderTicks" class="slider-ticks"></div>
            <!-- Suwak dawkowania -->
            <input type="range" id="abxDoseSlider" style="width:100%;">
            <!-- Dynamiczna etykieta pokazująca bieżącą wartość dawki -->
            <span id="sliderValueLabel" class="slider-value-label"></span>
          </div>
        </label>
        <div style="display:flex; gap:.75rem; flex-wrap:wrap; margin-top:.6rem;">
          <label id="abxDoseInputLabel" style="flex:1 1 200px; min-width:200px;">
            <span id="abxDoseInputLabelText">Rekomendowana dawka</span>
            <input type="number" id="abxDoseInput" step="0.1" min="0" style="width:100%;" />
          </label>
          <label style="flex:1 1 180px; min-width:180px;">
            Czas terapii (dni)
            <input type="number" id="abxDuration" min="1" step="1" style="width:100%;" />
          </label>
        </div>
        <!-- Przycisk przywracający zalecane parametry (domyślnie ukryty).  Pokazuje się, gdy dawka została wpisana poza rekomendowanym zakresem. -->
        <button type="button" id="abxReturnBtn" class="return-recommendation-btn" style="display:none; margin-top:.5rem;">Powróć do rekomendowanej dawki</button>
      </div>
      <!-- Przycisk włącza tryb samodzielnego ustalania dawkowania.  Umieszczony pomiędzy
           polami dawkowania a sekcją wyników.  Początkowo ukryty; pokazywany, gdy
           dostępny jest przeliczany lek i użytkownik nie włączył trybu własnego.
           Używamy oddzielnej klasy, aby móc zdefiniować wygląd w CSS. -->
      <button type="button" id="abxCustomDoseBtn" class="custom-dose-btn" style="display:none; margin-top:.6rem; margin-left:auto; margin-right:auto;">Chcę sam ustalić dawkowanie</button>
      <div id="abxNote" class="muted" style="margin-top:.6rem;"></div>
      <div id="abxResult" class="result-box" style="margin-top:.9rem;"></div>
      <!-- Kontener na dodatkowe informacje i źródła.  Ten element jest wypełniany dynamicznie
           w funkcji updateNoteElement(), a jego pozycja jest dostosowywana tak, aby
           znajdował się pod sekcją zaleceń (jeśli taka istnieje) lub pod wynikami. -->
      <div id="abxInfo" style="margin-top:1rem;"></div>
      <!-- Kontener na przycisk i listę schematów leczenia boreliozy.  Ten element będzie
           wykorzystywany tylko dla wskazania „Leczenie boreliozy” i pozostanie pusty
           przy innych wskazaniach. Przyciski i listę generuje funkcja updateSchemesButton(). -->
      <div id="abxSchemesContainer" style="margin-top:1rem; text-align:center;"></div>
    `, 'antibiotic therapy card template');
    return card;
  }

  // Wstaw kartę bezpośrednio pod przyciskiem „Antybiotykoterapia”.
  function mountCard(){
    if(document.getElementById('antibioticTherapyCard')) return;
    const where = document.getElementById('abxButtonWrapper');
    if(!where || !where.parentNode) return;
    const card = createCard();
    where.parentNode.insertBefore(card, where.nextSibling);
    // Początkowo ukryj kartę; pierwsze kliknięcie przycisku ją pokaże.
    card.style.display = 'none';
    populateIndications();
    attachEventListeners();
    recalc();
  }

  // Uzupełnij listę wskazań danymi z ABX_INDICATIONS.
  function populateIndications(){
    const indicSelect = document.getElementById('abxIndication');
    if(!indicSelect) return;
    abxClearElement(indicSelect);
    // W pierwszej kolejności dodaj opcję placeholder, która zachęca do wyboru
    // wskazania.  Ta opcja jest domyślnie zaznaczona i wyłączona.
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Wybierz wskazanie —';
    placeholder.disabled = true;
    placeholder.selected = true;
    indicSelect.appendChild(placeholder);
    // Następnie wstawiamy zdefiniowane wskazania.
    INDICATION_ORDER.forEach(key => {
      const def = ABX_INDICATIONS[key];
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = def.label;
      indicSelect.appendChild(opt);
    });
    // Nie ustawiaj domyślnego wskazania – użytkownik musi wybrać je ręcznie.
    // Wywołaj populateDrugs(), aby ukryć kontrolki i pozostawić komunikat
    // powitalny. Funkcja populateDrugs() obsłuży brak wskazania.
    populateDrugs();
    // Po wypełnieniu listy wskazań zaktualizuj ich dostępność w zależności od wieku.
    updateIndicationAvailability();
  }

  /**
   * Aktualizuje dostępność poszczególnych wskazań w selektorze „Wskazanie”
   * w zależności od wieku pacjenta.  Jeżeli użytkownik jest dzieckiem
   * (wiek poniżej 18 lat), opcja „Pozaszpitalne zapalenie płuc u dorosłych”
   * zostanie wyszarzona i nie będzie można jej wybrać.  Analogicznie,
   * jeśli pacjent ma 18 lat lub więcej (dorosły), wyszarzona zostanie opcja
   * „Pozaszpitalne zapalenie płuc u dzieci”.  Funkcja ta dba również o
   * dostosowanie aktualnie wybranego wskazania – jeśli obecnie
   * zaznaczona pozycja staje się niedostępna, zostanie automatycznie
   * wybrana pierwsza dostępna opcja, a listy leków zostaną
   * odświeżone.
   */
  function updateIndicationAvailability(){
    const indicSelect = document.getElementById('abxIndication');
    if(!indicSelect) return;
    // Pobierz wiek w latach. Funkcja getAge() zwraca null, gdy pole jest puste.
    let ageYears = getAge();
    // Jeżeli brak uzupełnionego wieku w latach, spróbuj obliczyć wiek na podstawie miesięcy.
    if(ageYears === null){
      if(typeof getChildAgeMonths === 'function'){
        const months = getChildAgeMonths();
        if(months !== null && !isNaN(months)){
          ageYears = months / 12;
        }
      }
    }
    // Iteruj po opcjach i ustawiaj ich atrybut disabled w zależności od wieku.
    const opts = indicSelect.options;
    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i];
      // Nie zmieniaj atrybutu disabled placeholdera (wartość ""),
      // aby uniknąć nadpisania jego ustawień.  Pozostałe opcje
      // dostosuj w zależności od wieku.
      if (opt.value === '') {
        continue;
      }
      if (opt.value === 'pneumonia_adult') {
        // Wyłącz wskazanie dla dorosłych, jeśli pacjent jest dzieckiem (<18 lat).
        opt.disabled = (ageYears !== null && ageYears < 18);
      } else if (opt.value === 'pneumonia_child') {
        // Wyłącz wskazanie dla dzieci, jeśli pacjent jest dorosły (≥18 lat).
        opt.disabled = (ageYears !== null && ageYears >= 18);
      } else {
        // Inne wskazania zawsze są dostępne.
        opt.disabled = false;
      }
    }
    // Jeżeli obecnie wybrane wskazanie zostało wyłączone i nie jest to placeholder,
    // wybierz pierwszą dostępną opcję.  Placeholder (wartość "") jest oznaczony
    // jako disabled, ale nie powinien powodować automatycznego wyboru innego wskazania.
    const selectedOption = indicSelect.options[indicSelect.selectedIndex];
    if (selectedOption && selectedOption.disabled && selectedOption.value !== '') {
      for (let j = 0; j < opts.length; j++) {
        if (!opts[j].disabled) {
          indicSelect.selectedIndex = j;
          break;
        }
      }
      // Po zmianie wskazania trzeba odświeżyć listę leków i obliczenia.
      populateDrugs();
      recalc();
    }
  }

  // Uzupełnij listę leków na podstawie wybranego wskazania.
  function populateDrugs(){
    const indicKey = document.getElementById('abxIndication').value;
    const indic = ABX_INDICATIONS[indicKey];
    const drugSelect = document.getElementById('abxDrug');
    if(!drugSelect) return;
    // Wyczyść listę leków bez względu na to, czy wskazanie jest ustawione.
    abxClearElement(drugSelect);
    const controls = document.getElementById('abxControls');
    const note     = document.getElementById('abxNote');
    const promptEl = document.getElementById('abxInitialPrompt');
    // Jeśli wskazanie nie zostało wybrane lub nie istnieje w definicjach, ukryj
    // kontrolki i pozostaw komunikat powitalny.  Dla placeholdera indic będzie
    // niezdefiniowany, dlatego sprawdzamy zarówno brak obiektu, jak i brak listy leków.
    if(!indic || !indic.drugs){
      if(controls) controls.style.display = 'none';
      if(note)     note.textContent = indic && indic.message ? indic.message : '';
      // Pokaż komunikat powitalny, jeśli istnieje
      if(promptEl) promptEl.style.display = 'block';
      // Wyczyść wyniki
      const resultDiv = document.getElementById('abxResult');
      if(resultDiv) abxClearElement(resultDiv);
      return;
    }
    // W tym miejscu istnieją zdefiniowane leki – ukryj komunikat powitalny
    if(promptEl) promptEl.style.display = 'none';
    // W przeciwnym razie pokaż kontrolki i wstaw opcje
    if(controls) controls.style.display = 'block';
    if(note)     note.textContent = '';
    // Odczytaj wiek pacjenta (w latach) – może być null, gdy nie podano.
    let ageYears = getAge();
    if(ageYears === null){
      if(typeof getChildAgeMonths === 'function'){
        const months = getChildAgeMonths();
        if(months !== null && !isNaN(months)){
          ageYears = months / 12;
        }
      }
    }
    // Odczytaj ustawienie widoczności leków dożylnych przez wspólny adapter.
    let showIVAntibiotics = false;
    try {
      let v = null;
      if (typeof window !== 'undefined' && window.VildaPersistence && typeof window.VildaPersistence.readPreferenceRaw === 'function') {
        v = window.VildaPersistence.readPreferenceRaw('ANTIBIOTIC_SHOW_IV');
      }
      if(v === 'true') showIVAntibiotics = true;
    } catch (error) { logAbxWarn('Zignorowany błąd pomocniczy w module antybiotykoterapii', error); }
    const allDrugKeys = Object.keys(indic.drugs);
    const filteredDrugKeys = [];
    allDrugKeys.forEach(name => {
      // Jeśli wyłączono leki dożylne, pomijaj antybiotyki, dla których
      // którakolwiek forma ma parametr mgPerVial (oznacza postać i.v.).
      if(!showIVAntibiotics){
        const info = DRUG_INFO[name];
        if(info && info.forms){
          const formNames = Object.keys(info.forms);
          if(formNames.some(fn => 'mgPerVial' in info.forms[fn])){
            return; // pomiń ten lek
          }
        }
      }
      // Wskazanie odmiedniczkowe zapalenie nerek – filtruj leki w zależności od wieku:
      if(indicKey === 'uti_pyelonephritis' && ageYears !== null){
        // Dzieci (<18 lat): ukrywamy doustną cyprofloksacynę oraz lewofloksacynę (obu postaci),
        // gdyż fluoroquinolony doustne są przeciwwskazane u dzieci. Pozostawiamy jednak opcję dożylną cyprofloksacyny.
        if(ageYears < 18){
          if(name === 'Cyprofloksacyna (doustna)') return;
          if(name === 'Lewofloksacyna' || name === 'Lewofloksacyna i.v.') return;
        }
        // Dorośli (≥18 lat): ukrywamy cefiksym, który jest lekiem pediatrycznym w tym wskazaniu.
        if(ageYears >= 18 && name === 'Cefiksym') return;
      }

      // Wskazanie "Powikłane i inne zakażenia układu moczowego" – usuń
      // furazydynę, fosfomycynę oraz cefaleksynę z listy antybiotyków, ponieważ
      // nie osiągają odpowiednich stężeń w miąższu nerek lub są zarezerwowane
      // dla mniej skomplikowanych zakażeń.  Ponadto ograniczamy aksetyl
      // cefuroksymu do pacjentów <18 lat: u dorosłych preferowane są inne
      // antybiotyki, więc lek ten nie będzie widoczny.  Sprawdzamy
      // identyfikator wskazania i pomijamy wymienione leki.
      if(indicKey === 'uti_other'){
        // Usuń furazydynę, fosfomycynę oraz cefaleksynę – te leki nie są rekomendowane w powikłanych ZUM.
        if(name === 'Furazydyna' || name === 'Fosfomycyna' || name === 'Cefaleksyna'){
          return;
        }
        // Ograniczenia wiekowe dla wybranych leków:
        //   • Aksetyl cefuroksymu – stosowany wyłącznie u dzieci; ukrywamy u dorosłych (≥18 lat).
        //   • Lewofloksacyna – stosowana wyłącznie u dorosłych; ukrywamy u dzieci (<18 lat).
        //   • Cyprofloksacyna (doustna) i Cyprofloksacyna (dożylna) – fluorochinolony pierwszego wyboru u dorosłych, przeciwskazane u dzieci, dlatego ukrywamy je u pacjentów <18 lat.
        if(ageYears !== null){
          if(ageYears >= 18 && name === 'Aksetyl cefuroksymu'){
            return;
          }
          if(ageYears < 18 && (name === 'Lewofloksacyna' || name === 'Cyprofloksacyna (doustna)' || name === 'Cyprofloksacyna (dożylna)')){
            return;
          }
        }
      }
      filteredDrugKeys.push(name);
    });
    // Zbuduj opcje tylko dla dostępnych leków
    filteredDrugKeys.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      // Ustal, czy dany lek jest "pierwszego wyboru". Dla wskazania pyelonephritis
      // dynamicznie wybieramy lek pierwszego wyboru w zależności od wieku (cefiksym u dzieci, cyprofloksacyna u dorosłych).
      let isFirst = indic.drugs[name].firstChoice;
      // Dla wskazania „Powikłane i inne zakażenia układu moczowego” (uti_other)
      // dynamicznie wybieramy lek pierwszego wyboru zależnie od wieku:
      //   • u dzieci (<18 lat) – amoksycylina z kwasem klawulanowym,
      //   • u dorosłych (≥18 lat) – cyprofloksacyna doustna.
      if(indicKey === 'uti_other' && ageYears !== null){
        if(ageYears < 18){
          isFirst = (name === 'Amoksycylina z kwasem klawulanowym');
        } else {
          isFirst = (name === 'Cyprofloksacyna (doustna)');
        }
      }
      // Dla odmiedniczkowego zapalenia nerek stosujemy osobne reguły:
      if(indicKey === 'uti_pyelonephritis' && ageYears !== null){
        if(ageYears < 18){
          isFirst = (name === 'Cefiksym');
        } else {
          isFirst = (name === 'Cyprofloksacyna (doustna)');
        }
      }
      // Wyświetl nazwę z oznaczeniem "i.v" dla leków dożylnych. Ustalamy to
      // na podstawie definicji DRUG_INFO: jeśli którakolwiek postać leku posiada
      // parametr mgPerVial, uznajemy lek za dożylny i dopisujemy " i.v" do
      // etykiety, o ile w nazwie nie znajduje się już "i.v" lub "dożylna".
      let displayName = name;
      const info = DRUG_INFO[name];
      if (info && info.forms) {
        const formNames = Object.keys(info.forms);
        if (formNames.some(fn => 'mgPerVial' in info.forms[fn])) {
          const lower = name.toLowerCase();
          if (!/\bi\.v\b/.test(lower) && !/dożylna/.test(lower)) {
            displayName = `${name} i.v`;
          }
        }
      }
      opt.textContent = isFirst ? `${displayName} (I wyboru)` : displayName;
      drugSelect.appendChild(opt);
    });
    // Wybierz domyślny lek.  Dla pyelonephritis wybierz dynamicznie w zależności od wieku,
    // w przeciwnym razie pierwszą opcję "firstChoice" lub pierwszy dostępny.
    let defaultDrug = null;
    if(indicKey === 'uti_pyelonephritis' && ageYears !== null){
      // W odmiedniczkowym zapaleniu nerek domyślnie wybieramy cefiksym u dzieci
      // (<18 lat) oraz cyprofloksacynę doustną u dorosłych.
      if(ageYears < 18){
        defaultDrug = filteredDrugKeys.find(n => n === 'Cefiksym');
      } else {
        defaultDrug = filteredDrugKeys.find(n => n === 'Cyprofloksacyna (doustna)');
      }
    }
    // Dla powikłanych i innych zakażeń układu moczowego (uti_other) domyślny
    // antybiotyk zależy od wieku: u dzieci (<18 lat) stosuje się amoksycylinę
    // z kwasem klawulanowym, u dorosłych (≥18 lat) – cyprofloksacynę doustną.
    if(!defaultDrug && indicKey === 'uti_other' && ageYears !== null){
      if(ageYears < 18){
        defaultDrug = filteredDrugKeys.find(n => n === 'Amoksycylina z kwasem klawulanowym');
      } else {
        defaultDrug = filteredDrugKeys.find(n => n === 'Cyprofloksacyna (doustna)');
      }
    }
    // Jeśli nie ustalono lub nie znaleziono dynamicznego leku, użyj pierwszego z definicji firstChoice lub pierwszej pozycji
    if(!defaultDrug){
      defaultDrug = filteredDrugKeys.find(n => indic.drugs[n].firstChoice) || filteredDrugKeys[0];
    }
    if(defaultDrug){
      drugSelect.value = defaultDrug;
    }
    // Po zmianie listy leków uzupełnij dostępne postacie i przelicz
    populateForms();
    updateDoseControls();
  }

  // Uzupełnij listę dostępnych postaci preparatu dla wybranego leku.
  function populateForms(){
    const formWrapper = document.getElementById('abxFormWrapper');
    const formSelect  = document.getElementById('abxForm');
    const drugName    = document.getElementById('abxDrug') && document.getElementById('abxDrug').value;
    if(!formWrapper || !formSelect || !drugName){
      return;
    }
    const drugInfo = DRUG_INFO[drugName];
    if(drugInfo && drugInfo.forms){
      formWrapper.style.display = 'block';
      abxClearElement(formSelect);
      let forms = Object.keys(drugInfo.forms);
      // Usuń zawiesinę furazydyny u pacjentów ≥15 lat przy wskazaniu "uti_uncomplicated".
      // Zgodnie z wytycznymi użytkownika u dorosłych i młodzieży w tym wskazaniu stosujemy
      // wyłącznie tabletki (50 mg lub 100 mg), dlatego filtrujemy listę postaci.
      {
        const normDrugName = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
        // Pobierz aktualne wskazanie (np. "uti_uncomplicated")
        const indicElem = document.getElementById('abxIndication');
        const indicKeyCurr  = indicElem && indicElem.value;
        // Oblicz wiek w latach: jeżeli pole "wiek (lata)" jest puste, przelicz z miesięcy
        let ageYears = getAge();
        if(ageYears === null){
          const monthsTmp = getChildAgeMonths && getChildAgeMonths();
          if(monthsTmp !== null && monthsTmp !== undefined){
            ageYears = monthsTmp / 12;
          }
        }
        // Jeżeli to furazydyna, wskazanie to niepowikłane ZUM i pacjent ≥15 lat,
        // usuń z listy wszystkie zawiesiny (postaci rozpoczynające się od "Zawiesina").
        if(normDrugName === 'Furazydyna' && indicKeyCurr === 'uti_uncomplicated' && ageYears !== null && ageYears >= 15){
          forms = forms.filter(fn => {
            const normalized = fn.replace(/\u00a0/g, ' ');
            return !normalized.toLowerCase().startsWith('zawiesina');
          });
        }
      }
      // Jeśli wybranym lekiem jest azytromycyna (dowolny wariant), nie filtruj listy postaci.
      // Zgodnie z wymaganiami użytkownika należy pokazywać wszystkie dostępne preparaty (zawiesiny i tabletki),
      // aby lekarz mógł świadomie wybrać inną postać niż rekomendowana.  Domyślny wybór pozostanie
      // kontrolowany przez funkcje choose*DefaultForm poniżej.  Dlatego filtrację postaci
      // ograniczamy tylko do innych leków (jeśli w przyszłości zostaną wprowadzone podobne reguły).
      const normalizedName = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
      if (!normalizedName.startsWith('Azytromycyna')) {
        // Tutaj można wprowadzić ewentualne filtry dla innych leków w przyszłości.
      }
      forms.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        formSelect.appendChild(opt);
      });
      // Ustal domyślną postać preparatu w zależności od wskazania, masy ciała i wieku.
      // Jeżeli wskazanie to niepowikłane zakażenie dróg moczowych, użyj funkcji
      // chooseUtiDefaultForm, która wykorzystuje szczegółowe reguły dla poszczególnych leków.
      let defaultForm = null;
      const weight = getWeight();
      // Oblicz wiek w latach. Jeśli pole wieku (lata) jest puste, użyj wieku w miesiącach
      // (przeliczonego na lata). Dzięki temu niemowlęta i małe dzieci, które mają
      // uzupełnione tylko pole „Wiek (miesiące)”, są prawidłowo rozpoznawane jako dzieci,
      // co wpływa na dobór zawiesin zamiast tabletek.
      let age    = getAge();
      if(age === null){
        const months = getChildAgeMonths();
        if(months !== null){
          age = months / 12;
        }
      }
      const indicElem = document.getElementById('abxIndication');
      const indicKey  = indicElem && indicElem.value;

      // Specjalna obsługa doboru domyślnej postaci preparatu dla wskazania
      // „Leczenie boreliozy” (indication key "lyme").  Zgłoszone błędy wykazały,
      // że dla dorosłych pacjentów i starszych nastolatków (masa ≥40 kg lub wiek ≥18 lat)
      // aplikacja proponowała zbyt małe tabletki (np. Azytromycyna 250 mg, Amoksycylina 500 mg,
      // Aksetyl cefuroksymu 250 mg).  Poniższy blok wybiera większe formy tabletek
      // zgodnie z wytycznymi PTEiLChZ: dla azytromycyny domyślnie 500 mg u pacjentów ≥40 kg
      // lub dorosłych, dla amoksycyliny 1 000 mg, a dla aksetylu cefuroksymu 500 mg.  U dzieci
      // (<40 kg) zachowujemy reguły wagowe: zawiesiny 250 mg/5 ml lub 500 mg/5 ml
      // (amoksycylina) oraz 125 mg/5 ml lub 250 mg/5 ml (aksetyl cefuroksymu),
      // natomiast dla azytromycyny używamy funkcji chooseAzithroDefaultForm, która
      // rozróżnia stężenia 100 mg/5 ml i 200 mg/5 ml u dzieci.
      if(indicKey === 'lyme'){
        const isAdult   = (age !== null && age >= 18);
        const weightGE40 = (weight !== null && weight >= 40);
        // Użyj znormalizowanej nazwy leku, aby ignorować twarde spacje w nazwie.
        const normDrug = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
        let chosen = null;
        if(normDrug.startsWith('Azytromycyna')){
          // Dorośli lub pacjenci ≥40 kg – preferuj tabletkę 500 mg
          if(weightGE40 || isAdult){
            const candidate = Object.keys(drugInfo.forms).find(fn => fn.replace(/\u00a0/g, ' ').startsWith('Tabletka 500 mg'));
            if(candidate){ chosen = candidate; }
          } else {
            // Dzieci – użyj istniejącej funkcji doboru formy (100 mg/5 ml <10 kg; 200 mg/5 ml 10–40 kg)
            const alt = chooseAzithroDefaultForm(weight);
            if(alt && drugInfo.forms[alt]){ chosen = alt; }
          }
        } else if(normDrug === 'Amoksycylina'){
          if(weightGE40 || isAdult){
            const candidate = Object.keys(drugInfo.forms).find(fn => fn.replace(/\u00a0/g, ' ').startsWith('Tabletka 1000 mg'));
            if(candidate){ chosen = candidate; }
          } else {
            // Dzieci: <10 kg – zawiesina 250 mg/5 ml; 10–40 kg – zawiesina 500 mg/5 ml.
            if(weight !== null){
              if(weight < 10 && drugInfo.forms['Zawiesina 250\u00a0mg/5\u00a0ml']){
                chosen = 'Zawiesina 250\u00a0mg/5\u00a0ml';
              } else if(weight < 40 && drugInfo.forms['Zawiesina 500\u00a0mg/5\u00a0ml']){
                chosen = 'Zawiesina 500\u00a0mg/5\u00a0ml';
              }
            }
          }
        } else if(normDrug === 'Aksetyl cefuroksymu'){
          if(weightGE40 || isAdult){
            const candidate = Object.keys(drugInfo.forms).find(fn => fn.replace(/\u00a0/g, ' ').startsWith('Tabletka 500 mg'));
            if(candidate){ chosen = candidate; }
          } else {
            if(weight !== null){
              // Dzieci: <10 kg – zawiesina 125 mg/5 ml; 10–40 kg – zawiesina 250 mg/5 ml
              if(weight < 10 && drugInfo.forms['Zawiesina 125\u00a0mg/5\u00a0ml']){
                chosen = 'Zawiesina 125\u00a0mg/5\u00a0ml';
              } else if(weight < 40 && drugInfo.forms['Zawiesina 250\u00a0mg/5\u00a0ml']){
                chosen = 'Zawiesina 250\u00a0mg/5\u00a0ml';
              }
            }
          }
        }
        if(chosen){
          defaultForm = chosen;
        }
      }

      if(indicKey === 'uti_uncomplicated'){
        const utiForm = chooseUtiDefaultForm(drugName, weight, age);
        if(utiForm && drugInfo.forms[utiForm]){
          defaultForm = utiForm;
        }
      } else if(indicKey === 'uti_pyelonephritis'){
        // W odmiedniczkowym zapaleniu nerek obowiązują inne preferencje formy
        // – silniejsze zawiesiny lub fiolki dożylne dobrane na podstawie masy
        // ciała i wieku. Użyj funkcji choosePyeloDefaultForm do wyznaczenia
        // optymalnej postaci. Jeśli funkcja zwróci pasującą nazwę, używamy jej.
        const pyeloForm = choosePyeloDefaultForm(drugName, weight, age);
        if(pyeloForm && drugInfo.forms[pyeloForm]){
          defaultForm = pyeloForm;
        }
      } else if(indicKey === 'sinusitis'){
        // W ostrym zapaleniu zatok przynosowych stosujemy reguły wyboru
        // analogiczne do tych z zapalenia ucha: zawiesiny 250 mg/5 ml lub
        // 500 mg/5 ml dla amoksycyliny w zależności od masy, wydajniejsze
        // zawiesiny ES dla ko‑amoksyklawu, a u większych pacjentów tabletki.
        const sinForm = chooseSinusitisDefaultForm(drugName, weight, age);
        if(sinForm && drugInfo.forms[sinForm]){
          defaultForm = sinForm;
        }
      } else if(indicKey === 'pharyngitis'){
        // W paciorkowcowym zapaleniu gardła i zapaleniu migdałków podniebiennych
        // wykorzystujemy dedykowaną funkcję choosePharyngitisDefaultForm, która
        // uwzględnia masę ciała i pozwala dobrać postać o odpowiednim stężeniu.
        const pharyngitisForm = choosePharyngitisDefaultForm(drugName, weight, age);
        if(pharyngitisForm && drugInfo.forms[pharyngitisForm]){
          defaultForm = pharyngitisForm;
        }
      } else if(indicKey === 'otitis'){
        // W ostrym zapaleniu ucha środkowego stosujemy wysokodawkowe schematy
        // amoksycyliny i ko‑amoksyklawu. Dobór postaci powinien minimalizować
        // objętość zawiesiny przy dużych dawkach oraz ograniczać liczbę tabletek u starszych
        // dzieci i dorosłych. Funkcja chooseOtitisDefaultForm uwzględnia te kryteria
        // i zwraca sugerowaną postać na podstawie masy ciała (wieku obecnie nie wykorzystujemy).
        const otitisForm = chooseOtitisDefaultForm(drugName, weight, age);
        if(otitisForm && drugInfo.forms[otitisForm]){
          defaultForm = otitisForm;
        }
      } else if(indicKey === 'uti_other'){
        // W powikłanych i innych zakażeniach układu moczowego korzystamy z dedykowanej funkcji
        // chooseUtiOtherDefaultForm. Funkcja ta łączy reguły dla leków doustnych i dożylnych
        // dostosowując postać do masy ciała i wieku pacjenta.
        const utiOtherForm = chooseUtiOtherDefaultForm(drugName, weight, age);
        if(utiOtherForm && drugInfo.forms[utiOtherForm]){
          defaultForm = utiOtherForm;
        }
      } else if(indicKey === 'bronchitis'){
        // Ostre zapalenie oskrzeli – dobierz postać preparatu na podstawie wieku i masy ciała.
        const bronchitisForm = chooseBronchitisDefaultForm(drugName, weight, age);
        if(bronchitisForm && drugInfo.forms[bronchitisForm]){
          defaultForm = bronchitisForm;
        }
      } else if(indicKey === 'pneumonia_adult'){
        // Pozaszpitalne zapalenie płuc u dorosłych ma ustalone dawki niezależne od masy ciała.
        // Wybieramy odpowiednie tabletki lub fiolki na podstawie zaleceń IDSA/ATS oraz
        // dostępnych mocy preparatów. W większości przypadków u dorosłych stosuje się
        // doustne tabletki: amoksycylina 1 g trzy razy dziennie,
        // doksycyklina 100 mg dwa razy dziennie,
        // klarytromycyna 250–500 mg dwa razy dziennie (w cięższych zakażeniach 500 mg),
        // azytromycyna 500 mg w 1. dniu, następnie 250 mg/dzień,
        // amoksycylina z kwasem klawulanowym 875/125 mg lub 500/125 mg,
        // cefpodoksym 200 mg co 12 h,
        // aksetyl cefuroksymu 500 mg co 12 h,
        // lewofloksacyna 500–750 mg raz na dobę oraz
        // moksyfloksacyna 400 mg raz na dobę. Na podstawie tych zaleceń
        // oraz dostępnych form w DRUG_INFO ustalamy domyślne postacie.
        const pneuForm = choosePneumoniaAdultDefaultForm(drugName, weight, age);
        if(pneuForm && drugInfo.forms[pneuForm]){
          defaultForm = pneuForm;
        }
      } else if(indicKey === 'pneumonia_child'){
        // Pozaszpitalne zapalenie płuc u dzieci – dobierz domyślną postać w zależności od masy ciała i wieku.
        // Skorzystaj z funkcji choosePneumoniaChildDefaultForm, która minimalizuje liczbę tabletek lub objętość
        // zawiesiny zgodnie z zaleceniami dla poszczególnych leków. Funkcja uwzględnia również warianty
        // azytromycyny oraz ko‑amoksyklawu.
        const pneuChildForm = choosePneumoniaChildDefaultForm(drugName, weight, age);
        if(pneuChildForm && drugInfo.forms[pneuChildForm]){
          defaultForm = pneuChildForm;
        }
      }
      // Jeżeli nadal nie ustalono domyślnej postaci, zastosuj ogólną regułę wagową:
      // • u dzieci <40 kg (i nie-dorosłych) preferuj zawiesiny – wybieramy dedykowany wariant ko‑amoksyklawu,
      //   a w pozostałych lekach pierwszą dostępną zawiesinę;
      // • u pacjentów ≥40 kg lub dorosłych (wiek ≥18 lat) preferuj formy niebędące zawiesiną.
      if(!defaultForm){
        const isAdult = (age !== null && age >= 18);
        if(weight && weight < 40 && !isAdult){
          // Dzieci o masie <40 kg – wybierz zawiesinę
          if(drugName === 'Amoksycylina z kwasem klawulanowym'){
            // Dedykowana funkcja dobierająca właściwą zawiesinę (standardową lub ES)
            defaultForm = chooseAmoxClavDefaultForm(weight);
          }
          if(!defaultForm){
            for(const fn of forms){
              const f = drugInfo.forms[fn];
              if(f && f.formType === 'suspension'){
                defaultForm = fn;
                break;
              }
            }
          }
        } else {
          // Dorośli lub pacjenci ≥40 kg (oraz przypadki, gdy waga nie jest znana, ale wiek ≥18 lat)
          if(drugName === 'Amoksycylina z kwasem klawulanowym'){
            // Przy braku wagi lub przy masie ≥40 kg wybieramy tabletkę 875/125 mg
            defaultForm = chooseAmoxClavDefaultForm(weight || 40);
          }
          if(!defaultForm){
            for(const fn of forms){
              const f = drugInfo.forms[fn];
              if(f && f.formType !== 'suspension'){
                defaultForm = fn;
                break;
              }
            }
          }
        }
      }
      // Jeśli nadal brak domyślnej postaci, stosuj dedykowane funkcje dla niektórych antybiotyków.
      if(!defaultForm){
        if(drugName === 'Klarytromycyna'){
          defaultForm = chooseClarithroDefaultForm(weight);
        } else if(drugName === 'Amoksycylina z kwasem klawulanowym'){
          defaultForm = chooseAmoxClavDefaultForm(weight);
        } else if(drugName === 'Azytromycyna'){
          defaultForm = chooseAzithroDefaultForm(weight);
        }
      }
      // Ostatecznie, jeśli nie wybrano żadnej postaci lub wybrana nie istnieje w definicji, wybierz pierwszą z listy.
      if(!defaultForm || !(drugInfo.forms[defaultForm])){
        defaultForm = forms[0];
      }
      formSelect.value = defaultForm;
    } else {
      // Jeśli lek nie ma różnych postaci, ukryj selektor
      formWrapper.style.display = 'none';
      abxClearElement(formSelect);
    }
  }

  /**
   * Wybiera domyślną postać klarytromycyny na podstawie masy ciała.
   * Dla najmłodszych dzieci (<12 kg) preferuje się słabszą zawiesinę 125 mg/5 ml,
   * dla dzieci 12–40 kg – zawiesinę 250 mg/5 ml, natomiast u pacjentów o
   * masie ≥40 kg sugeruje się tabletki 250 mg. Funkcja może być rozszerzona
   * w przyszłości w oparciu o bardziej precyzyjne rekomendacje.
   *
   * @param {number|null} weight Masa ciała w kilogramach lub null, jeśli nieznana
   * @returns {string} nazwa domyślnej postaci
   */
  
/**
 * Wyznacza docelową dawkę dobową amoksycyliny (mg/kg/dobę) dla
 * amoksycyliny z kwasem klawulanowym na podstawie przekazanego kontekstu
 * lub bieżącego wskazania w module.
 *
 * @param {Object} [context]
 * @param {string|null} [context.indicKey]
 * @param {number|null} [context.targetDoseMgKg]
 * @param {number|null} [context.defaultMg]
 * @returns {number|null}
 */
function getAmoxClavTargetDoseMgKg(context){
  const ctx = (context && typeof context === 'object') ? context : {};
  const explicitTarget = parseFloat(ctx.targetDoseMgKg);
  if(Number.isFinite(explicitTarget)){
    return explicitTarget;
  }
  const explicitDefault = parseFloat(ctx.defaultMg);
  if(Number.isFinite(explicitDefault)){
    return explicitDefault;
  }
  let indicKey = (typeof ctx.indicKey === 'string' && ctx.indicKey) ? ctx.indicKey : null;
  if(!indicKey && typeof document !== 'undefined'){
    const indicElem = document.getElementById('abxIndication');
    indicKey = indicElem && indicElem.value ? indicElem.value : null;
  }
  if(!indicKey || typeof ABX_INDICATIONS === 'undefined'){
    return null;
  }
  const indic = ABX_INDICATIONS[indicKey];
  const drugDef = indic && indic.drugs ? indic.drugs['Amoksycylina z kwasem klawulanowym'] : null;
  if(!drugDef){
    return null;
  }
  const defaultMg = parseFloat(drugDef.defaultMg);
  if(Number.isFinite(defaultMg)){
    return defaultMg;
  }
  if(Array.isArray(drugDef.mgRange) && drugDef.mgRange.length >= 2){
    const upperBound = parseFloat(drugDef.mgRange[1]);
    if(Number.isFinite(upperBound)){
      return upperBound;
    }
  }
  return null;
}

/**
 * Określa, czy przy aktualnym wskazaniu lub dawce u dziecka <40 kg należy
 * preferować zawiesinę ES 600 mg/42,9 mg/5 ml zamiast zawiesiny 400 mg/57 mg/5 ml.
 * Przyjęto, że formulacja ES jest preferowana dla wysokich dawek
 * amoksycyliny, zwykle od około 70 mg/kg/dobę wzwyż.
 *
 * @param {number|null} weight Masa ciała w kilogramach
 * @param {Object} [context]
 * @returns {boolean}
 */
function shouldPreferAmoxClavEs(weight, context){
  const weightNum = (typeof weight === 'number') ? weight : parseFloat(weight);
  if(!Number.isFinite(weightNum) || weightNum >= 40){
    return false;
  }
  const targetDoseMgKg = getAmoxClavTargetDoseMgKg(context);
  return Number.isFinite(targetDoseMgKg) && targetDoseMgKg >= 70;
}

/**
 * Wybiera domyślną postać amoksycyliny z kwasem klawulanowym na podstawie
 * masy ciała oraz docelowej dobowej dawki amoksycyliny.
 * U dzieci <40 kg preparat 400 mg/57 mg/5 ml pozostaje domyślną opcją dla
 * standardowych dawek, natomiast przy wysokich dawkach amoksycyliny
 * preferowana jest formulacja ES 600 mg/42,9 mg/5 ml. U pacjentów
 * o masie ≥40 kg preferowane są tabletki 875 mg/125 mg.
 *
 * @param {number|null} weight Masa ciała w kilogramach lub null, jeśli nieznana
 * @param {Object} [context] Kontekst dawkowania (np. indicKey, targetDoseMgKg)
 * @returns {string} nazwa domyślnej postaci
 */
function chooseAmoxClavDefaultForm(weight, context){
  if(weight === null || weight === undefined || weight === ''){
    return 'Zawiesina 400 mg/57 mg/5 ml';
  }
  const weightNum = (typeof weight === 'number') ? weight : parseFloat(weight);
  if(!Number.isFinite(weightNum)){
    return 'Zawiesina 400 mg/57 mg/5 ml';
  }
  if(weightNum < 40){
    return shouldPreferAmoxClavEs(weightNum, context)
      ? 'Zawiesina 600 mg/42,9 mg/5 ml (ES)'
      : 'Zawiesina 400 mg/57 mg/5 ml';
  }
  return 'Tabletka 875 mg/125 mg';
}

  /**
   * Wybiera domyślną postać leku w niepowikłanych zakażeniach dróg moczowych
   * (uti_uncomplicated). Funkcja uwzględnia wiek i masę ciała, aby zaproponować
   * postać łatwą do podania i zgodną z zaleceniami z ulotek i wytycznych. Jeśli
   * nie uda się wybrać optymalnej postaci, funkcja zwraca null, co pozwala na
   * zastosowanie ogólnych reguł.
   *
   * @param {string} drugName Nazwa leku
   * @param {number|null} weight Masa ciała w kilogramach lub null
   * @param {number|null} age Wiek pacjenta w latach lub null
   * @returns {string|null} nazwa domyślnej postaci lub null, jeśli brak reguły
   */
  function chooseUtiDefaultForm(drugName, weight, age){
    // Furazydyna: zawiesina 50 mg/5 ml dla dzieci <15 r.ż.; tabletki 50 mg dla
    // pacjentów <50 kg; tabletki 100 mg dla osób ≥50 kg.
    if(drugName === 'Furazydyna'){
      if(age !== null && age < 15){
        return 'Zawiesina 50 mg/5 ml';
      }
      if(weight !== null){
        if(weight < 50) return 'Tabletka 50 mg';
        return 'Tabletka 100 mg';
      }
      return 'Tabletka 50 mg';
    }
    // Trimetoprim: zawiesina dla dzieci <12 lat lub <20 kg; 100 mg tabletka dla
    // 20–40 kg; 200 mg tabletka ≥40 kg.
    if(drugName === 'Trimetoprim'){
      if((age !== null && age < 12) || (weight !== null && weight < 20)){
        return 'Zawiesina 100 mg/5 ml';
      }
      if(weight !== null){
        if(weight < 40) return 'Tabletka 100 mg';
        return 'Tabletka 200 mg';
      }
      return 'Tabletka 100 mg';
    }
    // Trimetoprim-sulfametoksazol: zastosuj trzy progi – zawiesina 240 mg/5 ml
    // dla małych dzieci (<6 lat lub <30 kg); tabletka 80 mg/400 mg (480 mg)
    // dla dzieci 6–12 lat lub 30–40 kg; tabletka 160 mg/800 mg (960 mg) dla
    // ≥12 lat lub ≥40 kg.
    if(drugName === 'Trimetoprim-sulfametoksazol'){
      if(age === null && weight === null){
        return 'Tabletka 80 mg/400 mg';
      }
      if((age !== null && age < 6) || (weight !== null && weight < 30)){
        return 'Zawiesina 240 mg/5 ml';
      }
      if((age !== null && age < 12) || (weight !== null && weight < 40)){
        return 'Tabletka 80 mg/400 mg';
      }
      return 'Tabletka 160 mg/800 mg';
    }
    // Fosfomycyna: jednorazowa saszetka 3 g u kobiet i dziewcząt ≥12 lat.
    if(drugName === 'Fosfomycyna'){
      return 'Saszetka 3 g';
    }
    // Aksetyl cefuroksymu: 125 mg/5 ml <10 kg; 250 mg/5 ml 10–40 kg; tabletka 250 mg ≥40 kg.
    if(drugName === 'Aksetyl cefuroksymu'){
      if(weight !== null){
        if(weight < 10) return 'Zawiesina 125 mg/5 ml';
        if(weight < 40) return 'Zawiesina 250 mg/5 ml';
        return 'Tabletka 250 mg';
      }
      return 'Zawiesina 125 mg/5 ml';
    }
    // Cefiksym: zawiesina 100 mg/5 ml dla <40 kg; tabletka 400 mg ≥40 kg.
    if(drugName === 'Cefiksym'){
      if(weight !== null && weight < 40){
        return 'Zawiesina 100 mg/5 ml';
      }
      return 'Tabletka 400 mg';
    }
    // Ceftibuten: zawiesina 180 mg/5 ml dla <40 kg; kapsułka 400 mg ≥40 kg.
    if(drugName === 'Ceftibuten'){
      if(weight !== null && weight < 40){
        return 'Zawiesina 180 mg/5 ml';
      }
      return 'Kapsułka 400 mg';
    }
    // Amoksycylina z kwasem klawulanowym: korzystaj z istniejącej funkcji.
    if(drugName === 'Amoksycylina z kwasem klawulanowym'){
      return chooseAmoxClavDefaultForm(weight);
    }
    // Cefaleksyna: 125 mg/5 ml <10 kg; 250 mg/5 ml 10–25 kg; kapsułka 250 mg 25–40 kg; kapsułka 500 mg ≥40 kg.
    if(drugName === 'Cefaleksyna'){
      if(weight !== null){
        if(weight < 10) return 'Zawiesina 125 mg/5 ml';
        if(weight < 25) return 'Zawiesina 250 mg/5 ml';
        if(weight < 40) return 'Kapsułka 250 mg';
        return 'Kapsułka 500 mg';
      }
      return 'Zawiesina 125 mg/5 ml';
    }
    return null;
  }

  /**
   * Wybiera domyślną postać leku dla odmiedniczkowego zapalenia nerek
   * (uti_pyelonephritis). Funkcja bazuje na masie ciała (a w razie
   * nieznanej masy – na wieku) i stara się minimalizować objętość
   * podawanej dawki przy zachowaniu możliwości precyzyjnego odmierzania.
   * Dla leków podawanych dożylnie wybiera wielkość fiolki odpowiednią do
   * typowych dawek u dzieci i dorosłych. Jeśli nie ustalono reguł dla
   * danego leku, funkcja zwraca null, co pozwala zastosować ogólne
   * algorytmy.
   *
   * @param {string} drugName Nazwa leku
   * @param {number|null} weight Masa ciała w kilogramach lub null
   * @param {number|null} age Wiek w latach lub null
   * @returns {string|null} nazwa domyślnej postaci lub null
   */
  function choosePyeloDefaultForm(drugName, weight, age){
    // Jeśli nie znamy wagi ani wieku, nie sugerujemy szczegółowej postaci
    // (zwracamy null, aby zadziałały ogólne reguły).
    if(weight === null && age === null){
      return null;
    }
    // Pomocnicze zmienne progowe. Wartości progowe (20 kg, 40 kg) dobrano
    // orientacyjnie na podstawie standardowych kategorii wagowych dzieci
    // (małe <20 kg, średnie 20–40 kg, duże ≥40 kg). W razie braku wagi
    // wykorzystujemy wiek: <6 lat – traktujemy jak <20 kg, 6–12 lat – jak 20–40 kg,
    // ≥12 lat – jak ≥40 kg.
    let approxWeight = weight;
    if(approxWeight === null && age !== null){
      if(age < 6) approxWeight = 15;
      else if(age < 12) approxWeight = 30;
      else approxWeight = 50;
    }
    // Cefiksym: dzieci <20 kg – zawiesina 100 mg/5 ml; 20–40 kg – zawiesina
    // 200 mg/5 ml (nowo dodana); ≥40 kg – tabletka 400 mg.
    if(drugName === 'Cefiksym'){
      if(approxWeight < 20) return 'Zawiesina 100\u00a0mg/5\u00a0ml';
      if(approxWeight < 40) return 'Zawiesina 200\u00a0mg/5\u00a0ml';
      return 'Tabletka 400\u00a0mg';
    }
    // Ceftibuten: <20 kg – zawiesina 90 mg/5 ml; 20–40 kg – zawiesina
    // 180 mg/5 ml; ≥40 kg – kapsułka 400 mg.
    if(drugName === 'Ceftibuten'){
      if(approxWeight < 20) return 'Zawiesina 90\u00a0mg/5\u00a0ml';
      if(approxWeight < 40) return 'Zawiesina 180\u00a0mg/5\u00a0ml';
      return 'Kapsułka 400\u00a0mg';
    }
    // Aksetyl cefuroksymu (doustny): <10 kg – zawiesina 125 mg/5 ml;
    // 10–40 kg – zawiesina 250 mg/5 ml; ≥40 kg – tabletka 250 mg.
    if(drugName === 'Aksetyl cefuroksymu'){
      if(approxWeight < 10) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
      if(approxWeight < 40) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
      return 'Tabletka 250\u00a0mg';
    }
    // Cefuroksym dożylnie: <40 kg – fiolka 750 mg; ≥40 kg – fiolka 1500 mg.
    if(drugName === 'Cefuroksym (dożylnie)'){
      if(approxWeight < 40) return 'Fiolka 750\u00a0mg';
      return 'Fiolka 1500\u00a0mg';
    }
    // Cefotaksym: <40 kg – fiolka 1000 mg; ≥40 kg – fiolka 2000 mg.
    if(drugName === 'Cefotaksym'){
      if(approxWeight < 40) return 'Fiolka 1000\u00a0mg';
      return 'Fiolka 2000\u00a0mg';
    }
    // Ceftriakson: <40 kg – fiolka 1000 mg; ≥40 kg – fiolka 2000 mg.
    if(drugName === 'Ceftriakson'){
      if(approxWeight < 40) return 'Fiolka 1000\u00a0mg';
      return 'Fiolka 2000\u00a0mg';
    }
    // Cefepim: <40 kg – fiolka 1 g; ≥40 kg – fiolka 2 g.
    if(drugName === 'Cefepim'){
      if(approxWeight < 40) return 'Fiolka 1\u00a0g';
      return 'Fiolka 2\u00a0g';
    }
    // Gentamycyna: <20 kg – ampułka 40 mg/1 ml; ≥20 kg – ampułka 80 mg/2 ml.
    if(drugName === 'Gentamycyna'){
      if(approxWeight < 20) return 'Ampułka 40\u00a0mg/1\u00a0ml';
      return 'Ampułka 80\u00a0mg/2\u00a0ml';
    }
    // Amikacyna: <20 kg – ampułka 100 mg/2 ml; ≥20 kg – ampułka 500 mg/2 ml.
    if(drugName === 'Amikacyna'){
      if(approxWeight < 20) return 'Ampułka 100\u00a0mg/2\u00a0ml';
      return 'Ampułka 500\u00a0mg/2\u00a0ml';
    }
    // Cyprofloksacyna: <40 kg – roztwór 200 mg/100 ml; ≥40 kg – roztwór 400 mg/200 ml.
    if(drugName === 'Cyprofloksacyna'){
      if(approxWeight < 40) return 'Roztwór 200\u00a0mg/100\u00a0ml';
      return 'Roztwór 400\u00a0mg/200\u00a0ml';
    }
    // Cyprofloksacyna (doustna): <40 kg – tabletka 250 mg; ≥40 kg – tabletka 500 mg.
    // Dzięki temu dorośli otrzymują domyślnie tabletkę 500 mg, a u mniejszych pacjentów łatwiej dopasować dawkę.
    if(drugName === 'Cyprofloksacyna (doustna)'){
      if(approxWeight < 40) return 'Tabletka 250\u00a0mg';
      return 'Tabletka 500\u00a0mg';
    }
    // Lewofloksacyna: w leczeniu odmiedniczkowego zapalenia nerek wybieramy zawsze tabletkę 500 mg.
    if(drugName === 'Lewofloksacyna'){
      return 'Tabletka 500\u00a0mg';
    }
    // Lewofloksacyna i.v.: wariant dożylnej postaci lewofloksacyny – stosujemy wyłącznie roztwór 500 mg/100 ml.
    if(drugName === 'Lewofloksacyna i.v.'){
      return 'Roztwór 500\u00a0mg/100\u00a0ml';
    }
    // Piperacylina z tazobaktamem: dostępna tylko fiolka 4,5 g, bez względu na wagę.
    if(drugName === 'Piperacylina z tazobaktamem'){
      return 'Fiolka 4,5\u00a0g';
    }
    // Imipenem z cilastatyną: tylko fiolka 500 mg (można podawać wielokrotność). Brak innych wariantów w module.
    if(drugName === 'Imipenem z cilastatyną'){
      return 'Fiolka 500\u00a0mg';
    }
    // Meropenem: <40 kg – fiolka 500 mg; ≥40 kg – fiolka 1 g.
    if(drugName === 'Meropenem'){
      if(approxWeight < 40) return 'Fiolka 500\u00a0mg';
      return 'Fiolka 1\u00a0g';
    }
    // Doripenem: jedyna dostępna postać to fiolka 500 mg.
    if(drugName === 'Doripenem'){
      return 'Fiolka 500\u00a0mg';
    }
    // Amoksycylina z kwasem klawulanowym: wykorzystaj reguły z funkcji dla amoksyklawu.
    if(drugName === 'Amoksycylina z kwasem klawulanowym'){
      return chooseAmoxClavDefaultForm(approxWeight);
    }
    return null;
  }

  /**
   * Wybiera domyślną postać leku dla ostrego zapalenia błony śluzowej nosa i zatok
   * przynosowych (sinusitis). W tej chorobie preferuje się preparaty doustne
   * pozwalające podać wysokodawkowe schematy amoksycyliny i ko‑amoksyklawu
   * przy możliwie małej objętości. Reguły poniżej opierają się na oficjalnych
   * charakterystykach produktów leczniczych i wytycznych:
   *
   *  • **Amoksycylina** – zawiesiny 250 mg/5 ml i 500 mg/5 ml są dostępne w
   *    butelkach 60 ml i 100 ml; przy większych dawkach 500 mg/5 ml pozwala
   *    zmniejszyć objętość podawanej porcji. Dorośli
   *    otrzymują 250–500 mg co 8 h lub 750 mg–1 g co 12 h.
   *    Dlatego dla pacjentów <10 kg wybieramy słabszą zawiesinę 250 mg/5 ml,
   *    dla 10–40 kg – zawiesinę 500 mg/5 ml, a u osób ≥40 kg proponujemy
   *    tabletki 500 mg; dla bardzo dużej masy ciała (≥60 kg) domyślnie
   *    wybieramy tabletkę 1000 mg, aby zmniejszyć liczbę tabletek przy
   *    wysokodawkowym schemacie.
   *
   *  • **Amoksycylina z kwasem klawulanowym** – korzystamy z istniejącej
   *    funkcji chooseAmoxClavDefaultForm, która preferuje zawiesinę
   *    400 mg/57 mg/5 ml przy standardowych dawkach u dzieci <40 kg,
   *    zawiesinę ES 600 mg/42,9 mg/5 ml przy wysokich dawkach u dzieci <40 kg,
   *    a tabletki 875 mg/125 mg dla pacjentów ≥40 kg.
   *
   *  • **Aksetyl cefuroksymu** – w ostrym zapaleniu zatok dzieci <40 kg
   *    otrzymują 15 mg/kg co 12 h (30 mg/kg/dobę) w postaci zawiesiny,
   *    zaś pacjenci ≥40 kg przyjmują 250 mg dwa razy na dobę w postaci
   *    tabletek. Stąd wybieramy zawiesinę 125 mg/5 ml
   *    dla <10 kg, zawiesinę 250 mg/5 ml dla 10–40 kg oraz tabletkę 250 mg
   *    dla ≥40 kg.
   *
   *  • **Klarytromycyna** – dawka pediatryczna wynosi 7,5 mg/kg co 12 h
   *    (15 mg/kg/dobę) przez 10 dni, maksymalnie 500 mg/dobę;
   *    dorośli otrzymują 500 mg co 12 h przez 14 dni.
   *    Dlatego dzieci <12 kg otrzymują zawiesinę 125 mg/5 ml,
   *    12–25 kg – zawiesinę 250 mg/5 ml, 25–50 kg – tabletki 250 mg,
   *    a pacjenci ≥50 kg – tabletki 500 mg.
   *
   *  • **Azytromycyna** – dawkowanie w OZNS to 10 mg/kg/dobę przez 3 dni
   *    (schemat skrócony); dla dorosłych stosuje się 500 mg raz dziennie przez
   *    3 dni. Wybór
   *    zawiesiny 100 mg/5 ml dla <10 kg, 200 mg/5 ml dla 10–40 kg oraz
   *    tabletki 500 mg dla ≥40 kg realizuje funkcja chooseAzithroDefaultForm.
   *
   * @param {string} drugName Nazwa leku
   * @param {number|null} weight Masa ciała w kilogramach lub null
   * @param {number|null} age Wiek w latach lub null (obecnie niewykorzystywany)
   * @returns {string|null} nazwa domyślnej postaci lub null, jeśli brak reguły
   */
  function chooseSinusitisDefaultForm(drugName, weight, age){
    // Jeśli masa nie jest znana, stosujemy łagodniejsze zawiesiny
    if(weight === null || weight === undefined){
      // Brak masy – preferuj zawiesiny o najniższym stężeniu, aby umożliwić
      // precyzyjne dawkowanie u małych dzieci.
      if(drugName === 'Amoksycylina'){
        return 'Zawiesina 250\u00a0mg/5\u00a0ml';
      }
      if(drugName === 'Aksetyl cefuroksymu'){
        return 'Zawiesina 125\u00a0mg/5\u00a0ml';
      }
      if(drugName === 'Klarytromycyna'){
        return 'Zawiesina 125\u00a0mg/5\u00a0ml';
      }
      if(drugName === 'Azytromycyna'){
        return chooseAzithroDefaultForm(null);
      }
      if(drugName === 'Amoksycylina z kwasem klawulanowym'){
        return chooseAmoxClavDefaultForm(null);
      }
      return null;
    }
    // Amoksycylina
    if(drugName === 'Amoksycylina'){
      if(weight < 10) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
      if(weight < 40) return 'Zawiesina 500\u00a0mg/5\u00a0ml';
      if(weight < 60) return 'Tabletka 500\u00a0mg';
      return 'Tabletka 1000\u00a0mg';
    }
    // Amoksycylina z kwasem klawulanowym – deleguj do dedykowanej funkcji
    if(drugName === 'Amoksycylina z kwasem klawulanowym'){
      return chooseAmoxClavDefaultForm(weight);
    }
    // Aksetyl cefuroksymu
    if(drugName === 'Aksetyl cefuroksymu'){
      // Dzieci <12 lat zgodnie z CHPL powinny przyjmować zawiesiny. Jeśli wiek nie jest
      // podany, traktujemy pacjentów <40 kg jako dzieci i wybieramy zawiesinę. Stosujemy
      // stężenie 125 mg/5 ml dla mas <10 kg, a 250 mg/5 ml dla większych dzieci.
      if((age !== undefined && age !== null && age < 12) || (age == null && weight < 40)){
        if(weight < 10) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
        return 'Zawiesina 250\u00a0mg/5\u00a0ml';
      }
      if(weight < 50) return 'Tabletka 250\u00a0mg';
      return 'Tabletka 500\u00a0mg';
    }
    // Klarytromycyna
    if(drugName === 'Klarytromycyna'){
      // CHPL wskazuje, że dzieci <12 lat powinny przyjmować zawiesinę. Jeżeli wiek jest
      // nieznany, uznajemy pacjentów <40 kg za dzieci i również proponujemy zawiesinę.
      // Wybieramy stężenie 125 mg/5 ml dla mas <12 kg, a 250 mg/5 ml dla pozostałych.
      if((age !== undefined && age !== null && age < 12) || (age == null && weight < 40)){
        if(weight < 12) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
        return 'Zawiesina 250\u00a0mg/5\u00a0ml';
      }
      if(weight < 50) return 'Tabletka 250\u00a0mg';
      return 'Tabletka 500\u00a0mg';
    }
    // Azytromycyna – dla wszystkich wariantów nazwy (np. "Azytromycyna (3 dni)", "Azytromycyna (5 dni)")
    // stosuj funkcję chooseAzithroDefaultForm. Sprawdzamy początek nazwy, ignorując spacje niełamliwe.
    {
      const norm = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
      if(norm.startsWith('Azytromycyna')){
        return chooseAzithroDefaultForm(weight);
      }
    }
    return null;
  }

  /**
   * Wybiera domyślną postać antybiotyku w ostrym zapaleniu gardła i migdałków
   * podniebiennych (pharyngitis). Reguły opierają się na zaleceniach
   * terapeutycznych dla poszczególnych leków i na dostępnych stężeniach
   * preparatów. Dla każdego leku ustalono progi masy ciała, które pozwalają
   * ograniczyć objętość podawanej zawiesiny lub liczbę tabletek.
   *
   * Fenoksymetylpenicylina: dzieci o masie <15 kg – zawiesina 750 000 j.m./5 ml;
   * 15–27 kg – granulat 100 mg/ml (500 mg w 5 ml); 27–40 kg – tabletka
   * 1 000 000 j.m.; ≥40 kg – tabletka 1 500 000 j.m. Te progi nawiązują do
   * wytycznych, w których dzieci <27 kg przyjmują 250 mg co 8 h, a pacjenci
   * >27 kg oraz dorośli – 500 mg.
   *
   * Amoksycylina: <10 kg – zawiesina 250 mg/5 ml; 10–40 kg – zawiesina
   * 500 mg/5 ml; 40–60 kg – tabletka 500 mg; ≥60 kg – tabletka 1000 mg.
   *
   * Amoksycylina z kwasem klawulanowym: delegujemy do funkcji
   * chooseAmoxClavDefaultForm, ponieważ reguły dla pharyngitis nie różnią się
   * od innych wskazań – przy standardowych dawkach u dzieci <40 kg preferowana
   * jest zawiesina 400 mg/57 mg/5 ml, przy wysokich dawkach u dzieci <40 kg
   * zawiesina 600 mg/42,9 mg/5 ml (ES), a u pacjentów ≥40 kg tabletka 875 mg/125 mg.
   *
   * Cefadroksyl: zgodnie z zaleceniami IDSA dzieci <40 kg otrzymują 30 mg/kg
   * raz na dobę (maks. 1 g), natomiast pacjenci ≥40 kg – dawkę 1 g.
   * Aby ułatwić dawkowanie: <25 kg – zawiesina 250 mg/5 ml; 25–40 kg – tabletka
   * 500 mg; ≥40 kg – tabletka 1 000 mg.
   *
   * Cefaleksyna: dawka 20 mg/kg na podanie dwa razy dziennie (40 mg/kg/dobę),
   * z maksymalną pojedynczą dawką 500 mg. Dla <12 kg
   * wybieramy zawiesinę 125 mg/5 ml; dla 12–25 kg – zawiesinę 250 mg/5 ml;
   * dla 25–40 kg – kapsułkę 250 mg; dla ≥40 kg – kapsułkę 500 mg.
   *
   * Klarytromycyna: 7,5 mg/kg na dawkę dwa razy dziennie (15 mg/kg/dobę) z
   * maksymalną pojedynczą dawką 250 mg. Stąd
   * <12 kg – zawiesina 125 mg/5 ml; 12–25 kg – zawiesina 250 mg/5 ml;
   * 25–50 kg – tabletka 250 mg; ≥50 kg – tabletka 500 mg.
   *
   * Azytromycyna: korzystamy z istniejącej funkcji chooseAzithroDefaultForm,
   * ponieważ dawkowanie w pharyngitis jest takie samo jak w innych wskazaniach.
   *
   * Klindamycyna: zalecane 7 mg/kg na dawkę trzy razy dziennie (21 mg/kg/dobę)
   * z maksymalną pojedynczą dawką 300 mg. Dla
   * <15 kg – granulat 75 mg/5 ml; 15–40 kg – kapsułka 150 mg; ≥40 kg –
   * kapsułka 300 mg.
   *
   * Aksetyl cefuroksymu: dawki 20–30 mg/kg/dobę w dwóch dawkach, maks.
   * 1000 mg/dobę. Dla <10 kg – zawiesina
   * 125 mg/5 ml; 10–25 kg – zawiesina 250 mg/5 ml; 25–50 kg – tabletka
   * 250 mg; ≥50 kg – tabletka 500 mg.
   *
   * @param {string} drugName Nazwa leku
   * @param {number|null} weight Masa ciała w kilogramach lub null
   * @param {number|null} age Wiek w latach (nieużywany obecnie, ale dostępny do przyszłych modyfikacji)
   * @returns {string|null} nazwa domyślnej postaci lub null, gdy brak dedykowanych reguł
   */
  function choosePharyngitisDefaultForm(drugName, weight, age){
    // Jeśli masa nie jest podana, dla bezpieczeństwa wybieramy słabsze zawiesiny
    if(weight === null || weight === undefined){
      if(drugName === 'Fenoksymetylpenicylina'){ return 'Zawiesina 750\u00a0000\u00a0j.m./5\u00a0ml'; }
      if(drugName === 'Amoksycylina'){ return 'Zawiesina 250\u00a0mg/5\u00a0ml'; }
      if(drugName === 'Amoksycylina z kwasem klawulanowym'){ return chooseAmoxClavDefaultForm(null); }
      if(drugName === 'Cefadroksyl'){ return 'Zawiesina 250\u00a0mg/5\u00a0ml'; }
      if(drugName === 'Cefaleksyna'){ return 'Zawiesina 125\u00a0mg/5\u00a0ml'; }
      if(drugName === 'Klarytromycyna'){ return 'Zawiesina 125\u00a0mg/5\u00a0ml'; }
      {
        const norm = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
        if(norm.startsWith('Azytromycyna')){
          return chooseAzithroDefaultForm(null);
        }
      }
      if(drugName === 'Klindamycyna'){ return 'Kapsułka\u00a0150\u00a0mg'; }
      if(drugName === 'Aksetyl cefuroksymu'){ return 'Zawiesina 125\u00a0mg/5\u00a0ml'; }
      return null;
    }
    switch(drugName){
      case 'Fenoksymetylpenicylina':
        if(weight < 15) return 'Zawiesina 750\u00a0000\u00a0j.m./5\u00a0ml';
        if(weight < 27) return 'Granulat 100\u00a0mg/ml (5\u00a0ml = 500\u00a0mg)';
        if(weight < 40) return 'Tabletka 1\u00a0000\u00a0000\u00a0j.m.';
        return 'Tabletka 1\u00a0500\u00a0000\u00a0j.m.';
      case 'Amoksycylina':
        if(weight < 10) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
        if(weight < 40) return 'Zawiesina 500\u00a0mg/5\u00a0ml';
        if(weight < 60) return 'Tabletka 500\u00a0mg';
        return 'Tabletka 1000\u00a0mg';
      case 'Amoksycylina z kwasem klawulanowym':
        return chooseAmoxClavDefaultForm(weight);
      case 'Cefadroksyl':
        if(weight < 25) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
        if(weight < 40) return 'Tabletka 500\u00a0mg';
        return 'Tabletka 1\u00a0000\u00a0mg';
      case 'Cefaleksyna':
        if(weight < 12) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
        if(weight < 25) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
        if(weight < 40) return 'Kapsułka 250\u00a0mg';
        return 'Kapsułka 500\u00a0mg';
      case 'Klarytromycyna':
        // Zgodnie z Charakterystyką Produktu Leczniczego (CHPL) dzieci poniżej 12 lat
        // powinny przyjmować postać zawiesiny. W praktyce wagi ok. 40 kg odpowiadają
        // 12‑latkom, dlatego jeśli wiek nie został podany (age == null) przyjmujemy,
        // że pacjent o masie <40 kg również powinien otrzymać zawiesinę. Wybieramy
        // stężenie 125 mg/5 ml dla mas <12 kg, a 250 mg/5 ml dla większych dzieci.
        // Tabletki 250 mg i 500 mg są zarezerwowane dla nastolatków i dorosłych.
        if((age !== undefined && age !== null && age < 12) || (age == null && weight < 40)){
          if(weight < 12) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
          return 'Zawiesina 250\u00a0mg/5\u00a0ml';
        }
        // Dla nastolatków i dorosłych opieramy się na masie
        if(weight < 50) return 'Tabletka 250\u00a0mg';
        return 'Tabletka 500\u00a0mg';
      case 'Azytromycyna':
      case 'Azytromycyna (5 dni)':
      case 'Azytromycyna (3 dni)':
        // Wybierz domyślną postać azytromycyny niezależnie od wariantu schematu.
        return chooseAzithroDefaultForm(weight);
      case 'Klindamycyna':
        /*
         * Klindamycyna w leczeniu paciorkowcowego zapalenia gardła jest podawana trzy razy dziennie.
         * Dla małych dzieci producent dopuszcza jedynie kapsułki 150 mg, natomiast dla większych pacjentów
         * dostępne są kapsułki 300 mg.  Zgodnie z najnowszymi wytycznymi oraz ograniczeniami dotyczącymi
         * możliwości połykania większych kapsułek, przyjmujemy prosty próg masy: pacjenci o masie
         * <30 kg powinni otrzymać kapsułki 150 mg, natomiast pacjenci ≥30 kg – kapsułki 300 mg.  
         * Takie rozróżnienie zapewnia, że liczba kapsułek przyjmowanych w ciągu doby jest minimalna,
         * ponieważ większy rozmiar kapsułki (300 mg) pozwala podać tę samą dobową dawkę przy mniejszej
         * liczbie kapsułek, a jednocześnie nie jest zalecany u dzieci o masie poniżej 30 kg.
         */
        {
          // Jeśli masa nie została podana lub jest niepoprawna, wybieramy mniejszą kapsułkę jako bezpieczną opcję
          if(weight === undefined || weight === null || !isFinite(weight) || weight <= 0){
            // Zwracaj etykietę z twardymi spacjami (NBSP) identyczną jak w definicji DRUG_INFO.
            return 'Kapsułka\u00a0150\u00a0mg';
          }
          // Zastosuj próg 30 kg: poniżej 30 kg kapsułka 150 mg, w przeciwnym razie kapsułka 300 mg.
          if(weight < 30){
            return 'Kapsułka\u00a0150\u00a0mg';
          }
          return 'Kapsułka\u00a0300\u00a0mg';
        }
      case 'Aksetyl cefuroksymu':
        // Dzieci poniżej 12 lat według CHPL powinny otrzymywać zawiesiny. Jeśli wiek
        // nie został podany, przyjmujemy, że pacjenci o masie <40 kg również są
        // leczeni jak dzieci i powinni otrzymać zawiesinę. Ustal stężenie 125 mg/5 ml
        // dla mas <10 kg, w przeciwnym razie 250 mg/5 ml. Tabletki 250 mg i 500 mg
        // stosujemy dopiero u nastolatków i dorosłych.
        if((age !== undefined && age !== null && age < 12) || (age == null && weight < 40)){
          if(weight < 10) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
          return 'Zawiesina 250\u00a0mg/5\u00a0ml';
        }
        if(weight < 50) return 'Tabletka 250\u00a0mg';
        return 'Tabletka 500\u00a0mg';
      default:
        return null;
    }
  }

  /**
   * Dobiera moc tabletki tak, aby przy zadanej dawce dobowej osiągnąć możliwie
   * mały błąd zaokrąglenia, a przy takim samym błędzie preferować mniejszą
   * liczbę tabletek na dawkę.  Funkcja jest używana głównie dla amoksycyliny
   * w wysokodawkowych wskazaniach, gdzie dostępne są tabletki 500 mg i 1000 mg.
   *
   * @param {{name:string, mgPerTablet:number}[]} options Dostępne moce tabletek
   * @param {number} targetMgPerDay Docelowa dawka dobowa w mg
   * @param {number} dosesPerDay Liczba dawek na dobę
   * @returns {string|null} nazwa preferowanej mocy tabletki
   */
  function chooseTabletStrengthByDoseBurden(options, targetMgPerDay, dosesPerDay){
    if(!Array.isArray(options) || options.length === 0 || !isFinite(targetMgPerDay) || targetMgPerDay <= 0 || !isFinite(dosesPerDay) || dosesPerDay <= 0){
      return null;
    }
    const tolerance = 0.20;
    const mgMin = targetMgPerDay * (1 - tolerance);
    const mgMax = targetMgPerDay * (1 + tolerance);
    let bestOption = null;
    options.forEach(function(option){
      if(!option || !isFinite(option.mgPerTablet) || option.mgPerTablet <= 0) return;
      const mgPerTablet = option.mgPerTablet;
      const idealTabletsPerDose = targetMgPerDay / mgPerTablet / dosesPerDay;
      let bestTabsForOption = null;
      let bestMgPerDayForOption = null;
      let bestDiffForOption = Infinity;
      for(let offset = -4; offset <= 8; offset++){
        let candidate = Math.round(idealTabletsPerDose * 2 + offset) / 2;
        if(candidate < 0.5) candidate = 0.5;
        const candidateMgPerDay = candidate * dosesPerDay * mgPerTablet;
        if(candidateMgPerDay >= mgMin && candidateMgPerDay <= mgMax){
          const diff = Math.abs(candidateMgPerDay - targetMgPerDay);
          if(
            diff < bestDiffForOption - 1e-6 ||
            (Math.abs(diff - bestDiffForOption) < 1e-6 && (bestTabsForOption === null || candidate < bestTabsForOption))
          ){
            bestDiffForOption = diff;
            bestTabsForOption = candidate;
            bestMgPerDayForOption = candidateMgPerDay;
          }
        }
      }
      if(bestTabsForOption === null){
        bestTabsForOption = Math.ceil(idealTabletsPerDose * 2) / 2;
        bestMgPerDayForOption = bestTabsForOption * dosesPerDay * mgPerTablet;
        bestDiffForOption = Math.abs(bestMgPerDayForOption - targetMgPerDay);
      }
      const evaluated = {
        name: option.name,
        mgPerTablet: mgPerTablet,
        tabletsPerDose: bestTabsForOption,
        mgPerDay: bestMgPerDayForOption,
        diff: bestDiffForOption
      };
      if(
        !bestOption ||
        evaluated.diff < bestOption.diff - 1e-6 ||
        (Math.abs(evaluated.diff - bestOption.diff) < 1e-6 && evaluated.tabletsPerDose < bestOption.tabletsPerDose - 1e-6) ||
        (
          Math.abs(evaluated.diff - bestOption.diff) < 1e-6 &&
          Math.abs(evaluated.tabletsPerDose - bestOption.tabletsPerDose) < 1e-6 &&
          evaluated.mgPerTablet > bestOption.mgPerTablet
        )
      ){
        bestOption = evaluated;
      }
    });
    return bestOption ? bestOption.name : null;
  }

  /**
   * Wybiera domyślną postać antybiotyku w ostrym zapaleniu ucha środkowego (otitis).
   * Reguły opierają się na zaleceniach wysokodawkowej terapii amoksycyliną
   * (80–90 mg/kg mc./dobę) i amoksycyliną z kwasem klawulanowym, a także na
   * dostępnych stężeniach preparatów i objętościach opakowań. Celem jest
   * zmniejszenie liczby tabletek lub objętości zawiesiny przy dużych dawkach
   * stosowanych w OZUŚ oraz ułatwienie podawania u małych dzieci.
   *
   *  • **Amoksycylina** – w OZUŚ zaleca się wysokie dawki 80–90 mg/kg/dobę.
   *    Zawiesiny 250 mg/5 ml i 500 mg/5 ml występują w butelkach 60 ml i 100 ml,
   *    przy czym stężenie 500 mg/5 ml zmniejsza objętość podawanej porcji w wysokodawkowej kuracji.
   *    Dlatego dla pacjentów <10 kg proponujemy zawiesinę 250 mg/5 ml,
   *    dla 10–40 kg – zawiesinę 500 mg/5 ml, natomiast u pacjentów ≥40 kg
   *    porównujemy tabletki 500 mg i 1000 mg i wybieramy tę moc, która
   *    przy zachowaniu dawki daje mniejszą liczbę tabletek na dawkę.
   *
   *  • **Amoksycylina z kwasem klawulanowym** – stosuje się w przypadku braku
   *    odpowiedzi na samą amoksycylinę. Preparaty 400 mg/57 mg/5 ml (standard) i
   *    600 mg/42,9 mg/5 ml (ES) są dostępne w butelkach o pojemności 35, 70 lub 140 ml dla
   *    stężenia 400/57 oraz 50, 75, 100 lub 150 ml dla stężenia 600/42,9.
   *    Funkcja chooseAmoxClavDefaultForm preferuje u dzieci <40 kg zawiesinę
   *    400 mg/57 mg/5 ml przy standardowych dawkach oraz ES 600 mg/42,9 mg/5 ml
   *    przy wysokich dawkach, a pacjentom ≥40 kg proponuje tabletkę 875 mg/125 mg.
   *
   *  • **Aksetyl cefuroksymu (cefuroksym axetil)** – w OZUŚ stosuje się 30 mg/kg/dobę w dwóch
   *    dawkach, z maksymalną dawką dobową 1000 mg. Zawiesiny 125 mg/5 ml
   *    i 250 mg/5 ml są dostępne w butelkach 50 ml i 100 ml. Dlatego
   *    u pacjentów <10 kg wybieramy zawiesinę 125 mg/5 ml; u 10–25 kg – zawiesinę 250 mg/5 ml;
   *    u 25–50 kg – tabletkę 250 mg; a u ≥50 kg – tabletkę 500 mg (aby umożliwić 2×500 mg przy
   *    maksymalnej dawce dobowej 1000 mg).
   *
   *  • **Klarytromycyna** – rekomendowana dawka w OZUŚ to 15 mg/kg/dobę w dwóch dawkach z
   *    maksymalną dzienną dawką 500 mg. Zawiesiny 125 mg/5 ml i
   *    250 mg/5 ml są dostępne w butelkach 50–100 ml. Zalecamy: dla
   *    <12 kg – zawiesinę 125 mg/5 ml; dla 12–25 kg – zawiesinę 250 mg/5 ml; dla 25–50 kg –
   *    tabletkę 250 mg; a dla ≥50 kg – tabletkę 500 mg.
   *
   *  • **Azytromycyna** – w OZUŚ stosuje się 10 mg/kg/dobę przez 3 dni (lub 5 dni w
   *    alternatywnym schemacie). Funkcja chooseAzithroDefaultForm zwraca domyślną postać
   *    w zależności od masy ciała: zawiesina 100 mg/5 ml dla <10 kg; 200 mg/5 ml dla
   *    10–40 kg; tabletka 500 mg dla ≥40 kg.
   *
   * @param {string} drugName Nazwa leku
   * @param {number|null} weight Masa ciała w kilogramach lub null
   * @param {number|null} age Wiek w latach (obecnie nie używany)
   * @returns {string|null} nazwa domyślnej postaci lub null, gdy brak dedykowanych reguł
   */
  /**
   * Wybiera domyślną postać antybiotyku w ostrym zapaleniu ucha środkowego (OZUŚ).
   * Reguły opierają się na zaleceniach wysokodawkowej terapii amoksycyliną
   * 80–90 mg/kg mc./dobę w dwóch dawkach oraz na poszczególnych danych
   * farmakokinetycznych i dostępnych stężeniach i opakowaniach preparatów.
   *
   * • **Amoksycylina** – AAP i inne wytyczne zalecają 80–90 mg/kg mc./dobę w dwóch dawkach
   *   jako leczenie pierwszego wyboru w OZUŚ. Zawiesiny 250 mg/5 ml
   *   i 500 mg/5 ml dostępne są w butelkach 60 ml lub 100 ml, przy czym stężenie
   *   500 mg/5 ml zmniejsza objętość przyjmowanego leku.  
   *   Ustawiono progi masy ciała dla zawiesin: <10 kg – zawiesina 250 mg/5 ml;
   *   10–40 kg – zawiesina 500 mg/5 ml. U pacjentów ≥40 kg moc tabletki
   *   (500 mg vs 1000 mg) dobierana jest dynamicznie na podstawie docelowej
   *   dawki dobowej i oczekiwanej liczby tabletek na dawkę.
   *
   * • **Amoksycylina z kwasem klawulanowym** – stosowana jako drugi wybór (w razie
   *   niewrażliwości na samą amoksycylinę). Wytyczne rekomendują dawkę
   *   90 mg/kg mc./dobę amoksycyliny w dwóch dawkach, z ograniczeniem kwasu
   *   klawulanowego <10 mg/kg mc./dobę. Dlatego funkcja
   *   deleguje do istniejącej `chooseAmoxClavDefaultForm`, która proponuje
   *   zawiesinę 400/57 mg/5 ml przy standardowych dawkach u dzieci <40 kg,
   *   zawiesinę ES 600/42,9 mg/5 ml przy wysokich dawkach u dzieci <40 kg
   *   oraz tabletkę 875/125 mg dla ≥40 kg.
   *
   * • **Aksetyl cefuroksymu** – zgodnie z FDA/Drugs.com dzieci (3 mies.–12 lat)
   *   z OZUŚ powinny otrzymywać 30 mg/kg mc./dobę w dwóch dawkach, maks. 1 000 mg/dobę,
   *   a dzieci <13 lat, które mogą połykać tabletki, mogą stosować 250 mg co 12 h.
   *   Tabletki i zawiesina nie są bioekwiwalentne, dlatego przyjmujemy progi:
   *   <10 kg – zawiesina 125 mg/5 ml; 10–25 kg – zawiesina 250 mg/5 ml; 25–50 kg –
   *   tabletka 250 mg; ≥50 kg – tabletka 500 mg.
   *
   * • **Klarytromycyna** – stosowana u pacjentów uczulonych na penicyliny.
   *   Pediatryczna dawka wynosi 7,5 mg/kg mc. co 12 h (max 500 mg/dobę), a u dorosłych
   *   250–500 mg co 12 h. Zawiesiny dostępne są w stężeniach 125 mg/5 ml i 250 mg/5 ml,
   *   a buteleczki zawierają odpowiednio 1250 mg (50 ml), 2500 mg (50 i 100 ml) lub 5000 mg (100 ml) po rekonstytucji.
   *   Stąd: <12 kg – zawiesina 125 mg/5 ml; 12–25 kg – zawiesina 250 mg/5 ml;
   *   25–50 kg – tabletka 250 mg; ≥50 kg – tabletka 500 mg.
   *
   * • **Azytromycyna** – w OZUŚ stosuje się krótkie schematy 10 mg/kg mc./dobę przez 3 dni.
   *   W module korzystamy z funkcji `chooseAzithroDefaultForm`, która proponuje
   *   zawiesinę 100 mg/5 ml dla <10 kg, 200 mg/5 ml dla 10–40 kg i tabletkę 500 mg dla ≥40 kg.
   *
   * Jeśli masa ciała nie jest znana, funkcja wybiera łagodniejsze zawiesiny,
   * co ułatwia precyzyjne odmierzanie dawki u małych dzieci.
   *
   * @param {string} drugName Nazwa leku
   * @param {number|null} weight Masa ciała w kilogramach (może być null)
   * @param {number|null} age Wiek (niewykorzystywany)
   * @returns {string|null} nazwa domyślnej postaci lub null, jeśli brak rekomendacji
   */
  function chooseOtitisDefaultForm(drugName, weight, age){
    // Jeśli masa nie jest znana, wybieramy łagodniejsze zawiesiny, aby umożliwić
    // precyzyjne odmierzanie dawki u małych dzieci.
    if(weight === null || weight === undefined){
      if(drugName === 'Amoksycylina'){
        return 'Zawiesina 250\u00a0mg/5\u00a0ml';
      }
      if(drugName === 'Amoksycylina z kwasem klawulanowym'){
        return chooseAmoxClavDefaultForm(null);
      }
      if(drugName === 'Aksetyl cefuroksymu'){
        return 'Zawiesina 125\u00a0mg/5\u00a0ml';
      }
      if(drugName === 'Klarytromycyna'){
        return 'Zawiesina 125\u00a0mg/5\u00a0ml';
      }
      // Azytromycyna – dla wszystkich wariantów nazwy użyj domyślnej funkcji
      {
        const norm = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
        if(norm.startsWith('Azytromycyna')){
          return chooseAzithroDefaultForm(null);
        }
      }
      return null;
    }
    // Amoksycylina – u pacjentów >=40 kg dobierz moc tabletki dynamicznie.
    // Zamiast sztywnego progu 60 kg porównujemy, która moc (500 mg vs 1000 mg)
    // lepiej odwzorowuje domyślną wysoką dawkę w OZUŚ przy mniejszej liczbie tabletek.
    if(drugName === 'Amoksycylina'){
      if(weight < 10) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
      if(weight < 40) return 'Zawiesina 500\u00a0mg/5\u00a0ml';
      const amoxMaxInfo = GLOBAL_MAX_DAILY_DOSES && GLOBAL_MAX_DAILY_DOSES['Amoksycylina'];
      const amoxGlobalMax = amoxMaxInfo ? (weight < 40 ? amoxMaxInfo.child : amoxMaxInfo.adult) : null;
      const targetMgPerDay = amoxGlobalMax != null ? Math.min(weight * 90, amoxGlobalMax) : (weight * 90);
      const preferredTablet = chooseTabletStrengthByDoseBurden([
        { name: 'Tabletka 500\u00a0mg',  mgPerTablet: 500 },
        { name: 'Tabletka 1000\u00a0mg', mgPerTablet: 1000 }
      ], targetMgPerDay, 2);
      return preferredTablet || 'Tabletka 500\u00a0mg';
    }
    // Amoksycylina z kwasem klawulanowym – deleguj do istniejącej funkcji
    if(drugName === 'Amoksycylina z kwasem klawulanowym'){
      return chooseAmoxClavDefaultForm(weight);
    }
    // Aksetyl cefuroksymu
    if(drugName === 'Aksetyl cefuroksymu'){
      // Dla dzieci <12 lat stosujemy zawiesiny. Jeśli wiek jest nieznany, pacjenci o masie <40 kg
      // traktowani są jako dzieci i również otrzymują zawiesinę. Ustal stężenie 125 mg/5 ml
      // dla mas <10 kg, w przeciwnym razie 250 mg/5 ml. Tabletki 250 mg i 500 mg są dla
      // starszych pacjentów.
      if((age !== undefined && age !== null && age < 12) || (age == null && weight < 40)){
        if(weight < 10) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
        return 'Zawiesina 250\u00a0mg/5\u00a0ml';
      }
      if(weight < 50) return 'Tabletka 250\u00a0mg';
      return 'Tabletka 500\u00a0mg';
    }
    // Klarytromycyna
    if(drugName === 'Klarytromycyna'){
      // Dzieci <12 lat powinny otrzymywać zawiesiny. Gdy wiek nie jest dostępny, osoby <40 kg
      // traktujemy jak dzieci. Dobieramy stężenie 125 mg/5 ml dla mas <12 kg i 250 mg/5 ml
      // dla pozostałych. Tabletki stosujemy u starszych pacjentów.
      if((age !== undefined && age !== null && age < 12) || (age == null && weight < 40)){
        if(weight < 12) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
        return 'Zawiesina 250\u00a0mg/5\u00a0ml';
      }
      if(weight < 50) return 'Tabletka 250\u00a0mg';
      return 'Tabletka 500\u00a0mg';
    }
    // Azytromycyna – dla wszystkich wariantów nazwy użyj dedykowanej funkcji
    {
      const norm = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
      if(norm.startsWith('Azytromycyna')){
        return chooseAzithroDefaultForm(weight);
      }
    }
    return null;
  }

  /**
   * Wybiera domyślną postać leku dla powikłanych i innych zakażeń układu moczowego (uti_other).
   * W tym wskazaniu stosuje się zarówno antybiotyki doustne, jak i dożylne. Reguły poniżej
   * bazują na oficjalnych charakterystykach produktów leczniczych oraz zaleceniach
   * dotyczących dawkowania w powikłanych zakażeniach układu moczowego:
   *
   *  • **Amoksycylina i amoksycylina z kwasem klawulanowym** – w cięższych zakażeniach
   *    zaleca się schematy 80–90 mg/kg mc./dobę, co odpowiada ok. 30 mg/kg na dawkę podawaną
   *    trzy razy dziennie. Aby ograniczyć objętość podawanej
   *    zawiesiny, u pacjentów <10 kg proponujemy zawiesinę 250 mg/5 ml, w przedziale
   *    10–40 kg zawiesinę 500 mg/5 ml, u osób 40–60 kg tabletkę 500 mg, a u pacjentów ≥60 kg
   *    tabletkę 1000 mg. Dla preparatów z kwasem klawulanowym wykorzystujemy istniejącą funkcję
   *    `chooseAmoxClavDefaultForm`, która wybiera zawiesiny 400/57 mg/5 ml lub 600/42,9 mg/5 ml
   *    oraz tabletki 875/125 mg w zależności od masy ciała.
   *
   *  • **Cefaleksyna** – w leczeniu następczym zaleca się 25 mg/kg na dawkę 4 ×/dobę
   *    (100 mg/kg/dobę) z maksymalną dawką 1 g na podanie. Dostępne są
   *    zawiesiny 125 mg/5 ml i 250 mg/5 ml w butelkach 100 ml oraz kapsułki 250 mg i
   *    500 mg. U dzieci <10 kg wybieramy
   *    zawiesinę 125 mg/5 ml, w przedziale 10–25 kg – zawiesinę 250 mg/5 ml, u 25–50 kg
   *    kapsułkę 250 mg, a u pacjentów ≥50 kg kapsułkę 500 mg.
   *
   *  • **Furazydyna** – nitrofurantoina nie osiąga odpowiednich stężeń w tkance
   *    nerkowej i nie powinna być stosowana w powikłanych zakażeniach układu moczowego
   *    ani w odmiedniczkowym zapaleniu nerek.
   *    W kalkulatorze, u pacjentów <15 kg wskazujemy zawiesinę 50 mg/5 ml, u 15–40 kg
   *    tabletkę 50 mg, a u ≥40 kg tabletkę 100 mg. Jednak przypominamy, że lek ten
   *    nie powinien być pierwszym wyborem w powikłanych ZUM.
   *
   *  • **Fosfomycyna** – proszek 3 g (saszetka) jest przeznaczony wyłącznie do jednorazowej
   *    terapii niepowikłanego zapalenia pęcherza.
   *    W powikłanych ZUM preparat nie jest rekomendowany, dlatego domyślnie zwracamy null.
   *    Jeżeli masa ciała ≥40 kg i wiek ≥12 lat, można rozważyć saszetkę 3 g.
   *
   *  • **Cefuroksym (dożylnie)** – w powikłanych zakażeniach układu moczowego dawka wynosi
   *    50 mg/kg co 8 h (150 mg/kg/dobę). Preparat jest dostępny w fiolkach
   *    750 mg i 1500 mg; dlatego pacjenci <40 kg otrzymują fiolkę 750 mg,
   *    a ≥40 kg fiolkę 1500 mg.
   *
   *  • **Cefotaksym** – w powikłanych ZUM zaleca się 100–200 mg/kg/dobę w 3 dawkach.
   *    Fiolki 1 g i 2 g umożliwiają dostosowanie dawki; stąd <40 kg – fiolka
   *    1000 mg, ≥40 kg – fiolka 2000 mg.
   *
   *  • **Ceftriakson** – standardowa terapia to 50 mg/kg/dobę (max. 2 g/dobę).
   *    Z uwagi na dostępność fiolek 1 g i 2 g, stosujemy próg 40 kg.
   *
   *  • **Cefepim** – w powikłanych ZUM stosuje się 50 mg/kg co 8–12 h (100–150 mg/kg/dobę)
   *    . Maxipime jest dostępny w fiolkach 1 g i 2 g;
   *    pacjenci <40 kg otrzymują fiolkę 1 g, a ≥40 kg fiolkę 2 g.
   *
   *  • **Piperacylina z tazobaktamem** – u dzieci 2–12 lat podaje się ok. 112,5 mg/kg co 8 h
   *    (337,5 mg/kg/dobę). W Polsce dostępny jest wyłącznie zestaw 4,5 g
   *    (4 g piperacyliny + 0,5 g tazobaktamu), dlatego zawsze wybieramy
   *    tę fiolkę niezależnie od masy.
   *
   *  • **Imipenem z cilastatyną** – u dzieci ≥3 mies. zalecane dawki to 15–25 mg/kg co 6 h
   *    (60–100 mg/kg/dobę). Preparat jest dostępny w jedynej postaci 500 mg
   *    imipenemu z 500 mg cilastatyny w fiolce, dlatego zwracamy
   *    tę postać niezależnie od masy.
   *
   *  • **Meropenem** – umiarkowane zakażenia leczone są 20 mg/kg co 8 h (60 mg/kg/dobę),
   *    a ciężkie 40 mg/kg co 8 h (120 mg/kg/dobę). Dostępne są fiolki
   *    500 mg i 1 g; pacjenci <40 kg otrzymują fiolkę 500 mg,
   *    a ≥40 kg fiolkę 1 g.
   *
   *  • **Doripenem** – brak danych pediatrycznych; u dorosłych stosuje się 500 mg
   *    co 8 h lub 1 g co 8 h. W Polsce dostępna jest tylko fiolka
   *    500 mg; wybieramy tę postać niezależnie od masy, a aplikacja
   *    powinna wyświetlić ostrzeżenie o braku rejestracji u dzieci.
   *
   * Jeśli masa ciała nie jest znana, funkcja zwraca łagodniejsze zawiesiny i mniejsze fiolki,
   * aby ułatwić precyzyjne dawkowanie. Argument `age` jest wykorzystywany jedynie przy
   * fosfomycynie, gdzie zaleca się stosowanie saszetki 3 g tylko u pacjentów powyżej 12 roku życia.
   *
   * @param {string} drugName  nazwa leku
   * @param {number|null} weight  masa ciała w kilogramach
   * @param {number|null} age  wiek w latach (opcjonalny, używany przy fosfomycynie)
   * @returns {string|null} nazwa sugerowanej postaci leku lub null, jeżeli brak rekomendacji
   */
  function chooseUtiOtherDefaultForm(drugName, weight, age){
    // Jeśli masa nie jest znana, dobierz najmniejsze dostępne stężenie zawiesiny lub fiolkę
    if(weight === null || weight === undefined){
      switch(drugName){
        case 'Furazydyna':
          return 'Zawiesina 50 mg/5 ml';
        case 'Amoksycylina':
          return 'Zawiesina 250 mg/5 ml';
        case 'Amoksycylina z kwasem klawulanowym':
          return chooseAmoxClavDefaultForm(null);
        case 'Cefaleksyna':
          return 'Zawiesina 125 mg/5 ml';
        case 'Fosfomycyna':
          return null;
        case 'Cyprofloksacyna (doustna)':
          // Przy braku danych o masie ciała wybierz mniejszą tabletkę 250 mg.
          return 'Tabletka 250 mg';
        case 'Cyprofloksacyna (dożylna)':
          // Przy braku danych o masie ciała wybierz mniejszą fiolkę 200 mg/100 ml.
          return 'Roztwór 200 mg/100 ml';
        case 'Cefuroksym (dożylnie)':
          return 'Fiolka 750 mg';
        case 'Cefotaksym':
          return 'Fiolka 1000 mg';
        case 'Ceftriakson':
          return 'Fiolka 1000 mg';
        case 'Cefepim':
          return 'Fiolka 1 g';
        case 'Piperacylina z tazobaktamem':
          return 'Fiolka 4,5 g';
        case 'Imipenem z cilastatyną':
          return 'Fiolka 500 mg';
        case 'Meropenem':
          return 'Fiolka 500 mg';
        case 'Doripenem':
          return 'Fiolka 500 mg';
        default:
          return null;
      }
    }
    // Jeśli masa jest znana, używamy progów wagowych
    const w = weight;
    switch(drugName){
      case 'Furazydyna':
        if(w < 15) return 'Zawiesina 50 mg/5 ml';
        if(w < 40) return 'Tabletka 50 mg';
        return 'Tabletka 100 mg';
      case 'Amoksycylina':
        if(w < 10) return 'Zawiesina 250 mg/5 ml';
        if(w < 40) return 'Zawiesina 500 mg/5 ml';
        if(w < 60) return 'Tabletka 500 mg';
        return 'Tabletka 1000 mg';
      case 'Amoksycylina z kwasem klawulanowym':
        return chooseAmoxClavDefaultForm(w);
      case 'Cefaleksyna':
        if(w < 10) return 'Zawiesina 125 mg/5 ml';
        if(w < 25) return 'Zawiesina 250 mg/5 ml';
        if(w < 50) return 'Kapsułka 250 mg';
        return 'Kapsułka 500 mg';
      case 'Fosfomycyna':
        // Saszetkę 3 g można rozważyć wyłącznie u pacjentów ≥40 kg i ≥12 lat
        if(w >= 40 && age !== null && age !== undefined && age >= 12){
          return 'Saszetka 3 g';
        }
        return null;
      case 'Cyprofloksacyna (doustna)':
        // Dla doustnej cyprofloksacyny wybierz tabletkę 250 mg u mniejszych pacjentów
        // (<40 kg) i 500 mg u większych.  Przy mniejszych dawkach łatwiej
        // dopasować mg/kg, natomiast dorośli potrzebują tabletek 500 mg.
        if(w < 40) return 'Tabletka 250 mg';
        return 'Tabletka 500 mg';
      case 'Cyprofloksacyna (dożylna)':
        // Dla dożylnej cyprofloksacyny wybierz fiolkę 200 mg/100 ml u pacjentów <40 kg,
        // a 400 mg/200 ml u większych.  Pozwala to dopasować objętość
        // do masy ciała zgodnie z zaleceniami.
        return w < 40 ? 'Roztwór 200 mg/100 ml' : 'Roztwór 400 mg/200 ml';
      case 'Cefuroksym (dożylnie)':
        return w < 40 ? 'Fiolka 750 mg' : 'Fiolka 1500 mg';
      case 'Cefotaksym':
        return w < 40 ? 'Fiolka 1000 mg' : 'Fiolka 2000 mg';
      case 'Ceftriakson':
        return w < 40 ? 'Fiolka 1000 mg' : 'Fiolka 2000 mg';
      case 'Cefepim':
        return w < 40 ? 'Fiolka 1 g' : 'Fiolka 2 g';
      case 'Piperacylina z tazobaktamem':
        return 'Fiolka 4,5 g';
      case 'Imipenem z cilastatyną':
        return 'Fiolka 500 mg';
      case 'Meropenem':
        return w < 40 ? 'Fiolka 500 mg' : 'Fiolka 1 g';
      case 'Doripenem':
        return 'Fiolka 500 mg';
      default:
        return null;
    }
  }

  /**
   * Wybiera domyślną postać leku w pozaszpitalnym zapaleniu płuc u dorosłych (pneumonia_adult).
   * Reguły opierają się na zalecanych schematach leczenia IDSA/ATS i lokalnych programów
   * antybiotykowych. U dorosłych dawki są stałe i nie wymagają przeliczania mg/kg,
   * dlatego wybór postaci zależy przede wszystkim od dostępnych stężeń tabletek czy fiolek.
   *
   *  • **Amoksycylina** – wytyczne zalecają 1 g doustnie co 8 h przez 5 dni;
   *    dlatego wybieramy tabletkę 1000 mg jako domyślną postać.
   *
   *  • **Doksycyklina** – schemat 100 mg dwa razy dziennie przez 5 dni;
   *    domyślnie wybieramy tabletkę 100 mg.
   *
   *  • **Klarytromycyna** – SmPC podaje, że dorośli przyjmują 250 mg dwa razy dziennie,
   *    ale w cięższych zakażeniach dawkę zwiększa się do 500 mg dwa razy na dobę.
   *    W zapaleniu płuc stosuje się dawkę 500 mg 2 ×/dobę, dlatego wybieramy tabletkę 500 mg.
   *
   *  • **Azytromycyna** – standardowy schemat dla CAP to 500 mg w 1. dniu, następnie 250 mg
   *    raz na dobę przez 4 dni. Ponieważ nasz kalkulator
   *    zakłada 5 dni terapii z jedną dawką dziennie, wybieramy tabletkę 500 mg.
   *
   *  • **Amoksycylina z kwasem klawulanowym** – zaleca się 500/125 mg co 8 h lub
   *    875/125 mg co 12 h. Ze względu na ograniczoną liczbę dawek
   *    wybieramy tabletki 875 mg/125 mg jako domyślne.
   *
   *  • **Cefpodoksym** – dawka 200 mg co 12 h przez 5 dni;
   *    wybieramy tabletkę 200 mg.
   *
   *  • **Aksetyl cefuroksymu** – doustnie 500 mg co 12 h w CAP;
   *    domyślnie wybieramy tabletkę 500 mg.
   *
   *  • **Lewofloksacyna** – wytyczne przewidują 500 mg raz na dobę przez 7–14 dni
   *    lub 750 mg raz na dobę przez 5 dni. Ponieważ w module
   *    dostępne są jedynie tabletki 500 mg oraz roztwory 500 mg/100 ml, wybieramy tabletkę 500 mg.
   *
   *  • **Moksyfloksacyna** – stosuje się 400 mg raz na dobę przez 7–14 dni;
   *    wybieramy tabletkę 400 mg.
   *
   * Jeśli w przyszłości dodane zostaną nowe formy (np. tabletki 750 mg lewofloksacyny), funkcję
   * można rozszerzyć, aby uwzględniała również progi masy ciała i wybierała wyższe dawki u pacjentów
   * o większej masie. Aktualnie jednak u dorosłych stosuje się stałe dawki, więc masa nie jest
   * brana pod uwagę.
   *
   * @param {string} drugName  nazwa leku
   * @param {number|null} weight  masa ciała (nieużywana, może być null)
   * @param {number|null} age  wiek (nieużywany, może być null)
   * @returns {string|null} nazwa sugerowanej postaci lub null, jeśli brak reguły
   */
  function choosePneumoniaAdultDefaultForm(drugName, weight, age){
    switch(drugName){
      case 'Amoksycylina':
        return 'Tabletka 1000\u00a0mg';
      case 'Doksycyklina':
        return 'Tabletka 100\u00a0mg';
      case 'Klarytromycyna':
        // W cięższych zakażeniach zaleca się 500 mg 2 ×/dobę; używamy tej postaci
        return 'Tabletka 500\u00a0mg';
      case 'Azytromycyna (5 dni)':
        // Pięciodniowy schemat w pozaszpitalnym zapaleniu płuc u dorosłych wymaga
        // podania 0,5 g w pierwszym dniu, a następnie 0,25 g w kolejnych czterech dniach.
        // Aby ułatwić dawkowanie (połówki tabletki w dniach 2–5), jako domyślną
        // postać wybieramy tabletkę 500 mg. Dzięki temu lekarz może zalecić
        // podanie całej tabletki w 1. dniu i połowy tabletki w dniach 2–5.
        return 'Tabletka 500\u00a0mg';
      case 'Azytromycyna (3 dni)':
        // Trzydniowy schemat wymaga 500 mg na dobę, dlatego stosujemy tabletki 500 mg.
        return 'Tabletka 500\u00a0mg';
      // Usunięto wariant jednodniowy azytromycyny (2 g jednorazowo), ponieważ nie jest
      // rekomendowany w aktualnych wytycznych. Nie zwracamy domyślnej postaci dla
      // tej opcji, gdyż została usunięta z listy leków.
      case 'Amoksycylina z kwasem klawulanowym':
        // Wybieramy większą tabletkę (875/125 mg) z mniejszą liczbą dawek na dobę
        return 'Tabletka 875\u00a0mg/125\u00a0mg';
      case 'Cefpodoksym':
        return 'Tabletka 200\u00a0mg';
      case 'Aksetyl cefuroksymu':
        return 'Tabletka 500\u00a0mg';
      case 'Lewofloksacyna':
        // Jeśli w przyszłości pojawią się tabletki 750 mg, można tu dodać próg masy
        return 'Tabletka 500\u00a0mg';
      case 'Lewofloksacyna i.v.':
        // Dożylna postać lewofloksacyny – stosujemy wyłącznie roztwór 500 mg/100 ml
        return 'Roztwór 500\u00a0mg/100\u00a0ml';
      case 'Moksyfloksacyna':
        return 'Tabletka 400\u00a0mg';
      default:
        return null;
    }
  }

  /**
   * Wybiera domyślną postać farmaceutyczną dla pozaszpitalnego zapalenia płuc
   * u dzieci (indication "pneumonia_child") w zależności od masy ciała i wieku.
   * Celem jest zminimalizowanie objętości zawiesiny lub liczby tabletek przy
   * zachowaniu zgodności z charakterystyką produktu leczniczego i zalecanymi
   * dawkami. W przypadku braku informacji o masie ciała funkcja wybiera
   * najniższe dostępne stężenie (zawiesinę lub najmniejszą fiolkę).
   *
   * Reguły dla poszczególnych leków:
   *
   * • **Amoksycylina** – małe dzieci (<10 kg) otrzymują zawiesinę 250 mg/5 ml,
   *   dzieci 10–40 kg – zawiesinę 500 mg/5 ml, pacjenci 40–60 kg – tabletki 500 mg,
   *   a osoby ≥60 kg – tabletki 1000 mg. Zasada ta wynika z zaleceń, aby u
   *   pacjentów ≥40 kg stosować tabletki zamiast dużych objętości zawiesiny.
   *
   * • **Amoksycylina z kwasem klawulanowym** – delegujemy do
   *   `chooseAmoxClavDefaultForm`, które u dzieci <40 kg dobiera zawiesinę
   *   400/57 mg/5 ml przy standardowych dawkach albo 600/42,9 mg/5 ml przy
   *   wysokich dawkach, a u pacjentów ≥40 kg tabletkę 875/125 mg.
   *
   * • **Aksetyl cefuroksymu** – u dzieci <10 kg preferowana jest zawiesina
   *   125 mg/5 ml; u 10–40 kg stosuje się zawiesinę 250 mg/5 ml; młodzież
   *   40–50 kg otrzymuje tabletkę 250 mg; ≥50 kg – tabletkę 500 mg. Dzieci
   *   <12 lat (lub <40 kg, gdy wiek nieznany) powinny otrzymywać zawiesiny.
   *
   * • **Cefuroksym (dożylnie)** – dobieramy fiolkę w zależności od masy ciała:
   *   <10 kg – 250 mg; 10–20 kg – 750 mg; 20–40 kg – 1000 mg; ≥40 kg – 1500 mg.
   *   Takie progi umożliwiają dostosowanie dawki (75–100 mg/kg/dobę w 3 dawkach)
   *   bez konieczności otwierania wielu fiolek.
   *
   * • **Ampicylina** – fiolka 500 mg dla pacjentów <20 kg, fiolka 1000 mg dla
   *   ≥20 kg. Przy masie ≥40 kg lekarz może rozważyć schematy dorosłe, ale
   *   domyślna postać nadal pozostaje fiolką 1000 mg.
   *
   * • **Cefotaksym** – <20 kg używa fiolki 1000 mg, ≥20 kg – fiolki 2000 mg.
   *
   * • **Ceftriakson** – <20 kg otrzymuje fiolkę 1000 mg, ≥20 kg – fiolkę 2000 mg.
   *
   * • **Kloksacylina** – fiolka 500 mg dla <20 kg, fiolka 1000 mg dla ≥20 kg.
   *
   * • **Klarytromycyna** – stosujemy reguły z `chooseClarithroDefaultForm`
   *   (zawiesina 125 mg/5 ml dla <12 kg, zawiesina 250 mg/5 ml dla 12–40 kg,
   *   tabletka 250 mg dla ≥40 kg). W pozaszpitalnym zapaleniu płuc dawka
   *   15 mg/kg/dobę z limitem 1 000 mg/dobę jest zalecana, dlatego tabletka
   *   500 mg nie jest domyślnie proponowana u dzieci.
   *
   * • **Azytromycyna** (dowolny wariant) – korzystamy z `chooseAzithroDefaultForm`:
   *   zawiesina 100 mg/5 ml dla <10 kg, zawiesina 200 mg/5 ml dla 10–40 kg,
   *   tabletka 500 mg dla ≥40 kg.
   *
   * • **Wankomycyna** – <20 kg wybieramy fiolkę 500 mg; ≥20 kg – fiolkę 1 g.
   *
   * • **Linezolid** – dzieci <40 kg otrzymują zawiesinę 100 mg/5 ml, pacjenci
   *   ≥40 kg – tabletkę 600 mg.
   *
   * Dla leków, które nie mają zdefiniowanej reguły, funkcja zwraca null,
   * umożliwiając zastosowanie ogólnych mechanizmów wyboru (np. pierwsza
   * dostępna zawiesina) w późniejszym etapie.
   *
   * @param {string} drugName nazwa leku
   * @param {number|null} weight masa ciała w kilogramach (może być null)
   * @param {number|null} age wiek w latach (może być null; używany przy wyborze formy dla aksetylu cefuroksymu)
   * @returns {string|null} nazwa sugerowanej postaci lub null, jeśli brak reguły
   */
  function choosePneumoniaChildDefaultForm(drugName, weight, age){
    // Zastąp spacje NBSP dla porównywania nazw
    const norm = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
    // Jeśli masa ciała jest nieznana, wybieramy najłagodniejszą formę (zawiesinę lub najmniejszą fiolkę)
    const noWeight = weight === null || weight === undefined;
    switch(norm){
      case 'Amoksycylina':
        if(noWeight) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
        if(weight < 10) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
        if(weight < 40) return 'Zawiesina 500\u00a0mg/5\u00a0ml';
        if(weight < 60) return 'Tabletka 500\u00a0mg';
        return 'Tabletka 1000\u00a0mg';
      case 'Amoksycylina z kwasem klawulanowym':
        // Użyj dedykowanej funkcji do wyboru formy ko‑amoksyklawu
        return chooseAmoxClavDefaultForm(weight);
      case 'Aksetyl cefuroksymu':
        if(noWeight){
          return 'Zawiesina 125\u00a0mg/5\u00a0ml';
        }
        // Jeśli wiek <12 lat lub (wiek nieznany i <40 kg), preferuj zawiesiny
        if((age !== undefined && age !== null && age < 12) || (age == null && weight < 40)){
          if(weight < 10) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
          return 'Zawiesina 250\u00a0mg/5\u00a0ml';
        }
        if(weight < 50) return 'Tabletka 250\u00a0mg';
        return 'Tabletka 500\u00a0mg';
      case 'Cefuroksym (dożylnie)':
        if(noWeight) return 'Fiolka 250\u00a0mg';
        if(weight < 10) return 'Fiolka 250\u00a0mg';
        if(weight < 20) return 'Fiolka 750\u00a0mg';
        if(weight < 40) return 'Fiolka 1000\u00a0mg';
        return 'Fiolka 1500\u00a0mg';
      case 'Ampicylina':
        if(noWeight) return 'Fiolka 500\u00a0mg';
        if(weight < 20) return 'Fiolka 500\u00a0mg';
        return 'Fiolka 1000\u00a0mg';
      case 'Cefotaksym':
        if(noWeight) return 'Fiolka 1000\u00a0mg';
        if(weight < 20) return 'Fiolka 1000\u00a0mg';
        return 'Fiolka 2000\u00a0mg';
      case 'Ceftriakson':
        if(noWeight) return 'Fiolka 1000\u00a0mg';
        if(weight < 20) return 'Fiolka 1000\u00a0mg';
        return 'Fiolka 2000\u00a0mg';
      case 'Kloksacylina':
        if(noWeight) return 'Fiolka 500\u00a0mg';
        if(weight < 20) return 'Fiolka 500\u00a0mg';
        return 'Fiolka 1000\u00a0mg';
      case 'Klarytromycyna':
        // Deleguj do funkcji wybierającej odpowiednią postać klarytromycyny
        return chooseClarithroDefaultForm(weight);
      default:
        // Sprawdź warianty azytromycyny (np. "Azytromycyna", "Azytromycyna (3 dni)", "Azytromycyna (5 dni)")
        if(norm.startsWith('Azytromycyna')){
          return chooseAzithroDefaultForm(weight);
        }
        // Wankomycyna
        if(norm === 'Wankomycyna'){
          if(noWeight) return 'Fiolka 500\u00a0mg';
          return weight < 20 ? 'Fiolka 500\u00a0mg' : 'Fiolka 1\u00a0g';
        }
        // Linezolid
        if(norm === 'Linezolid'){
          if(noWeight) return 'Zawiesina 100\u00a0mg/5\u00a0ml';
          return weight < 40 ? 'Zawiesina 100\u00a0mg/5\u00a0ml' : 'Tabletka 600\u00a0mg';
        }
        // Teikoplanina – brak zdefiniowanych postaci, zwróć null
        return null;
    }
  }

  /**
   * Wybiera domyślną postać azytromycyny na podstawie masy ciała.
   * U małych dzieci (<10 kg) stosuje się zwykle zawiesinę 100 mg/5 ml,
   * ponieważ mniejsza koncentracja pozwala precyzyjnie odmierzać dawkę.
   * U dzieci i młodzieży o masie 10–40 kg korzystniejsza jest zawiesina
   * 200 mg/5 ml, która zmniejsza objętość przyjmowanej zawiesiny.
   * Pacjentom ≥40 kg (w tym dorosłym) zazwyczaj podaje się tabletki,
   * dlatego domyślnie proponujemy tabletkę 500 mg (jedna tabletka na dobę).
   *
   * @param {number|null} weight Masa ciała w kilogramach lub null
   * @returns {string} nazwa domyślnej postaci
   */
  function chooseAzithroDefaultForm(weight){
    if(weight === null || weight === undefined){
      return 'Zawiesina 100 mg/5 ml';
    }
    // Dzieci o masie <10 kg – zawiesina 100 mg/5 ml
    if(weight < 10){
      return 'Zawiesina 100 mg/5 ml';
    }
    // Masa 10–40 kg – zawiesina 200 mg/5 ml
    if(weight < 40){
      return 'Zawiesina 200 mg/5 ml';
    }
    // Masa ≥40 kg – tabletka 500 mg
    return 'Tabletka 500 mg';
  }

  // Nadpisz funkcje domyślnego wyboru postaci leków.

  // Wybiera domyślną postać klarytromycyny na podstawie masy ciała. Nowe definicje
  // przesłaniają wcześniejsze deklaracje, zapewniając spójne działanie nawet jeśli
  // wcześniejsze funkcje zostały przypadkowo wprowadzone w niepełnej formie.
  function chooseClarithroDefaultForm(weight){
    // Jeśli masa nie jest znana, wybieramy zawiesinę 125 mg/5 ml
    if(weight === null || weight === undefined){
      return 'Zawiesina 125 mg/5 ml';
    }
    // Masa <12 kg – zawiesina 125 mg/5 ml
    if(weight < 12){
      return 'Zawiesina 125 mg/5 ml';
    }
    // Masa 12–40 kg – zawiesina 250 mg/5 ml
    if(weight < 40){
      return 'Zawiesina 250 mg/5 ml';
    }
    // Masa ≥40 kg – tabletka 500 mg
    // Dorośli i starsze dzieci o masie ≥40 kg wymagają większej mocy preparatu; zgodnie z zaleceniami
    // stosuje się 500 mg dwa razy na dobę w leczeniu cięższych zakażeń dróg oddechowych. Wybór
    // większej tabletki zmniejsza liczbę przyjmowanych jednostek i zapewnia prawidłową dawkę.
    return 'Tabletka 500 mg';
  }

  // Wybiera domyślną postać amoksycyliny z kwasem klawulanowym na podstawie masy ciała
  // i docelowej dobowej dawki amoksycyliny. U dzieci <40 kg preferencja między
  // zawiesiną 400/57 a formulacją ES 600/42,9 zależy od dawki (standardowa vs wysoka),
  // a nie od samego progu 15 kg.
  function chooseAmoxClavDefaultForm(weight, context){
    if(weight === null || weight === undefined || weight === ''){
      return 'Zawiesina 400 mg/57 mg/5 ml';
    }
    const weightNum = (typeof weight === 'number') ? weight : parseFloat(weight);
    if(!Number.isFinite(weightNum)){
      return 'Zawiesina 400 mg/57 mg/5 ml';
    }
    if(weightNum < 40){
      return shouldPreferAmoxClavEs(weightNum, context)
        ? 'Zawiesina 600 mg/42,9 mg/5 ml (ES)'
        : 'Zawiesina 400 mg/57 mg/5 ml';
    }
    // Dla pacjentów ≥40 kg preferujemy tabletkę 875 mg/125 mg.
    return 'Tabletka 875 mg/125 mg';
  }

  /**
   * Wybiera domyślną postać farmaceutyczną dla ostrego zapalenia oskrzeli (bronchitis)
   * na podstawie masy ciała i wieku pacjenta.
   * - Dla klarytromycyny oraz azytromycyny deleguje do istniejących funkcji wybierających
   *   postać na podstawie masy (chooseClarithroDefaultForm i chooseAzithroDefaultForm).
   *   Jeśli pacjent jest dorosły (wiek ≥18 lat) i waga jest nieznana lub <40 kg,
   *   przekazujemy wartość 40 kg, aby wymusić wybór tabletki.
   * - Lewofloksacyna zawsze zwraca tabletkę 500 mg.
   * - Lewofloksacyna i.v. zawsze zwraca roztwór 500 mg/100 ml.
   * - Moksyfloksacyna zawsze zwraca tabletkę 400 mg.
   * - W pozostałych przypadkach zwraca null (brak preferencji).
   */
  function chooseBronchitisDefaultForm(drugName, weight, age){
    // Pomocnicza funkcja do obliczenia efektywnej masy dla dorosłych bez podanej wagi
    const computeEffectiveWeight = () => {
      if(age !== null && age >= 18 && (!weight || weight < 40)){
        return 40;
      }
      return weight;
    };
    if(drugName === 'Klarytromycyna'){
      const effW = computeEffectiveWeight();
      return chooseClarithroDefaultForm(effW);
    }
    if(drugName === 'Azytromycyna (5 dni)' || drugName === 'Azytromycyna (3 dni)'){
      const effW = computeEffectiveWeight();
      return chooseAzithroDefaultForm(effW);
    }
    if(drugName === 'Lewofloksacyna'){
      return 'Tabletka 500\u00a0mg';
    }
    if(drugName === 'Lewofloksacyna i.v.'){
      return 'Roztwór 500\u00a0mg/100\u00a0ml';
    }
    if(drugName === 'Moksyfloksacyna'){
      return 'Tabletka 400\u00a0mg';
    }
    return null;
  }

  // Zaktualizuj parametry suwaka, pola dawki i czasu na podstawie wybranego leku.
  function updateDoseControls(){
    const indicKey = document.getElementById('abxIndication').value;
    const drugName = document.getElementById('abxDrug').value;
    const indic = ABX_INDICATIONS[indicKey];
    const drug  = indic && indic.drugs ? indic.drugs[drugName] : null;
    const slider = document.getElementById('abxDoseSlider');
    const doseInput = document.getElementById('abxDoseInput');
    const durInput  = document.getElementById('abxDuration');
    if(!drug || !slider || !doseInput || !durInput){
      return;
    }
    // W tej funkcji nie ponownie wypełniamy listy postaci. Poprawianie listy
    // preparatów w tym miejscu powodowało resetowanie wyboru użytkownika
    // (np. przy zmianie masy ciała czy przesuwaniu suwaka). Lista postaci
    // jest odświeżana w populateDrugs() oraz w zdarzeniu zmiany masy ciała,
    // co pozwala na dynamiczny wybór domyślnej postaci bez nadpisywania
    // ręcznie wybranej opcji przez użytkownika.
    // Ustaw zakresy suwaka na podstawie zdefiniowanego zakresu dawek mgRange
    let minMg = drug.mgRange[0];
    let maxMg = drug.mgRange[1];
    let defaultMg = drug.defaultMg;
    // Pobierz masę ciała (jeśli została podana), aby dynamicznie dostosować dawki
    const weightVal = getWeight();

    // Specjalne przypadki dla amoksycyliny z klawulanianem: w zapaleniach ucha i zatok
    // (otitis, sinusitis) domyślnie stosuje się górną wartość zakresu (90 mg/kg/dobę)
    if (drugName === 'Amoksycylina z kwasem klawulanowym' && (indicKey === 'otitis' || indicKey === 'sinusitis')) {
      defaultMg = drug.mgRange[1];
    }
    // Ustal dynamiczny zakres dawek dla fenoksymetylpenicyliny w zależności od masy ciała.
    if (drugName === 'Fenoksymetylpenicylina' && weightVal) {
      /*
        Przelicznik: 1 000 000 j.m. fenoksymetylpenicyliny ≈ 654 mg. Zgodnie z CHPL
        dawki dobowej u dzieci wynoszą 50 000–100 000 j.m. na kg masy ciała, a
        minimalna dawka nie powinna być mniejsza niż 25 000 j.m./kg mc. (16 mg/kg/dobę).
        Dla uproszczenia przyjmujemy typowy zakres 50 000–100 000 j.m./kg/dobę,
        czyli około 33–65 mg/kg/dobę, jako podstawowy zakres dla pacjentów
        <40 kg. W populacji powyżej 6 lat i/lub o masie ciała ≥40 kg CHPL zaleca
        całkowitą dawkę 3–4,5 mln j.m. na dobę (podawaną w 2 lub 3 dawkach).
        Stąd przy większej masie ciała dynamicznie wyliczamy przedział dawek
        mg/kg/dobę na podstawie 3–4,5 mln j.m. (1962–2943 mg) podzielonych przez
        masę ciała. Przykładowo przy 40 kg daje to ok. 49–74 mg/kg/dobę.
      */
      const mgPerMillionUnits = 654;
      if (weightVal >= 40) {
        // 3–4,5 mln j.m./dobę przeliczamy na mg/kg/dobę
        minMg = (3 * mgPerMillionUnits) / weightVal;
        maxMg = (4.5 * mgPerMillionUnits) / weightVal;
        defaultMg = (minMg + maxMg) / 2;
      } else {
        // Dzieci <40 kg: 50 000–100 000 j.m./kg/dobę ≈ 33–65 mg/kg/dobę
        minMg = 33;
        maxMg = 65;
        defaultMg = (minMg + maxMg) / 2;
      }
    }

    // Dostosuj dawkę cefadroksylu dla pacjentów ≥40 kg: zalecana jest
    // jednorazowa dawka dobowa 1 g. Przeliczamy ją na mg/kg/dobę,
    // dzieląc 1000 mg przez masę ciała. U dzieci <40 kg pozostawiamy
    // standardowe 30 mg/kg/dobę.
    if (drugName === 'Cefadroksyl' && weightVal) {
      if (weightVal >= 40) {
        const mgPerKg = 1000 / weightVal;
        minMg = mgPerKg;
        maxMg = mgPerKg;
        defaultMg = mgPerKg;
      } else {
        // Zachowaj zdefiniowany zakres dla dzieci <40 kg
        minMg = drug.mgRange[0];
        maxMg = drug.mgRange[1];
        defaultMg = drug.defaultMg;
      }
    }
    // Dostosuj zakres i domyślną dawkę w pozaszpitalnym zapaleniu płuc u najmłodszych dzieci
    if (indicKey === 'pneumonia_child' && weightVal && weightVal <= 5) {
      // Dzieci <3 miesiące (ok. ≤5 kg) wymagają innych dawek i częstszych podań
      if (drugName === 'Cefuroksym (dożylnie)') {
        minMg = 75;
        maxMg = 150;
        defaultMg = 100;
      } else if (drugName === 'Amoksycylina z kwasem klawulanowym') {
        // W ciężkich przypadkach zaleca się 100 mg/kg/dobę w 2–3 dawkach; suwak ograniczamy do jednej wartości
        minMg = 100;
        maxMg = 100;
        defaultMg = 100;
      }
    }
    // Określ, czy dawkę należy prezentować w jednostkach (j.m.) czy w miligramach.
    const doseDisplay = document.getElementById('abxDoseDisplay');
    const formSelect = document.getElementById('abxForm');
    let isUnitMode = false;
    let selectedFormName = formSelect && formSelect.value;
    if(drugName === 'Fenoksymetylpenicylina' && selectedFormName){
      const fenoxyForms = DRUG_INFO['Fenoksymetylpenicylina'].forms;
      const meta = fenoxyForms[selectedFormName];
      if(meta && (meta.unitsPer5ml || meta.unitsPerTablet)){
        isUnitMode = true;
      }
    }
    // Jeśli włączony tryb jednostek, przelicz zakres mg/kg/dobę na j.m./kg/dobę.
    if(isUnitMode){
      const conv = 1000000 / 654; // 1 mg odpowiada ok. 1529 j.m.
      let minUnits = minMg * conv;
      let maxUnits = maxMg * conv;
      let defaultUnits = defaultMg * conv;
      // Dla fenoksymetylpenicyliny ustaw dedykowane zakresy: dzieci <40 kg 50–100 tys. j.m./kg/dobę, dorośli dynamicznie.
      if(drugName === 'Fenoksymetylpenicylina'){
        if(weightVal && weightVal < 40){
          // Zaokrąglij do pełnych tysięcy
          minUnits = 50000;
          maxUnits = 100000;
          defaultUnits = 75000;
        } else if(weightVal){
          // Dorośli: przelicz mg-range na j.m., a następnie zaokrąglij do 1000
          minUnits = minMg * conv;
          maxUnits = maxMg * conv;
          // Zaokrąglenia do pełnych tysięcy
          minUnits = Math.floor(minUnits / 1000) * 1000;
          maxUnits = Math.ceil(maxUnits / 1000) * 1000;
          defaultUnits = Math.round(((minUnits + maxUnits) / 2) / 1000) * 1000;
        }
      }
      // Zaktualizuj suwak i pole liczbowego tak, aby pracowały w jednostkach
      slider.min = minUnits;
      slider.max = maxUnits;
      // Krok 1000 j.m. pozwala wybierać pełne tysiące
      slider.step = 1000;
      slider.value = defaultUnits;
      doseInput.step = 1000;
      doseInput.value = defaultUnits;
      // Zmień etykietę jednostki
      if(doseDisplay){ doseDisplay.textContent = 'j.m./kg/dobę'; }
    } else {
      // Standardowy tryb mg/kg/dobę
      slider.min = minMg;
      slider.max = maxMg;
      slider.step = 0.5;
      // Ustal domyślną dawkę dla fenoksymetylpenicyliny (granulat) na 50 mg/kg/dobę,
      // zamiast dynamicznego uśrednienia (np. ~49 mg/kg). Pozostałe preparaty
      // korzystają z domyślnej wartości z definicji wskazania.
      let mgDefaultForSlider = defaultMg;
      if(drugName === 'Fenoksymetylpenicylina'){
        mgDefaultForSlider = 50;
      }
      slider.value = mgDefaultForSlider;
      doseInput.step = 0.1;
      doseInput.value = mgDefaultForSlider;
      if(doseDisplay){ doseDisplay.textContent = 'mg/kg/dobę'; }
    }
    // Zakres dopuszczalnych wartości dla pola dawki.  Użytkownik może wpisać
    // liczbę co najmniej dwukrotnie niższą niż minimalna rekomendowana i
    // maksymalnie trzykrotnie wyższą niż maksymalna rekomendowana dla danego
    // antybiotyku.  Ustalamy te granice zarówno w trybie miligramów, jak i
    // jednostek, na podstawie dynamicznie wyliczonych wartości suwaka.
    // Wartości referencyjne suwaka (slider.min oraz slider.max) odpowiadają
    // minimalnej i maksymalnej rekomendowanej dawce (w mg lub j.m.).  Pola
    // wprowadzania dawki mogą jednak przyjąć szerszy zakres: od połowy
    // minimalnej do trzykrotności maksymalnej wartości referencyjnej.  Do
    // obliczeń wykorzystujemy wartości zapisane w atrybutach suwaka.
    const sliderMin = parseFloat(slider.min);
    const sliderMax = parseFloat(slider.max);
    if(!isNaN(sliderMin) && !isNaN(sliderMax)){
      const allowedMin = sliderMin * 0.5;
      const allowedMax = sliderMax * 3;
      doseInput.min = allowedMin;
      doseInput.max = allowedMax;
    }

    // Jeżeli zakres minimalnej i maksymalnej dawki jest równy (brak przedziału),
    // zablokuj suwak, aby uniemożliwić przeciąganie.  Dzięki temu tor
    // suwaka zostanie wyszarzony przez regułę CSS, a użytkownik nie
    // będzie mógł zmienić wartości.  W przeciwnym wypadku upewnij się,
    // że suwak jest aktywny.
    const sliderMinVal = parseFloat(slider.min);
    const sliderMaxVal = parseFloat(slider.max);
    if(!isNaN(sliderMinVal) && !isNaN(sliderMaxVal) && sliderMinVal === sliderMaxVal){
      slider.disabled = true;
    } else {
      slider.disabled = false;
    }

    // Nie nadpisuj zawsze czasu trwania terapii.  Pozostawiamy poprzednią
    // wartość, jeżeli użytkownik wprowadził ją ręcznie.  W przeciwnym wypadku
    // ustawiamy domyślny czas trwania zalecony w definicji wskazania.  Ustaw
    // minimalną wartość na 1 dzień, aby zapobiec wprowadzaniu wartości
    // niepoprawnych (np. ujemnych lub zera).  Poniżej tej sekcji dodamy
    // dodatkowe reguły dla azytromycyny, które mogą nadpisać długość terapii.
    // Zawsze ustawiaj domyślny czas trwania na podstawie definicji wybranego leku.
    // Pozwala to na przywrócenie właściwej długości terapii po zmianie antybiotyku
    // (np. z azytromycyny 3‑dniowej na amoksycylinę), aby pole nie pozostawało
    // z poprzedniego wyboru.  Minimalna wartość to 1 dzień, aby uniknąć zer.
    durInput.min = 1;
    durInput.value = drug.duration;
    // Specjalna logika ustawiająca czas trwania terapii dla azytromycyny.
    // Gdy użytkownik wybiera wariant „Azytromycyna (5 dni)” albo podstawową
    // „Azytromycyna”, automatycznie ustawiamy 5 dni.  Dla wariantu
    // „Azytromycyna (3 dni)” ustawiamy 3 dni.  W przypadku paciorkowcowego
    // zapalenia gardła i migdałków (pharyngitis) zawsze wymuszamy 5 dni,
    // niezależnie od wariantu, ponieważ schemat 3‑dniowy nie jest
    // rekomendowany.  To zachowanie nadpisuje domyślną wartość, aby
    // zapewnić spójność z wytycznymi.
    {
      const normDrugName = (drugName || '').replace(/\u00a0/g, ' ');
      if (normDrugName.startsWith('Azytromycyna')) {
        let targetDuration;
        if (indicKey === 'pharyngitis') {
          targetDuration = 5;
        } else if (normDrugName.includes('(3 dni)')) {
          targetDuration = 3;
        } else {
          targetDuration = 5;
        }
        if (parseInt(durInput.value, 10) !== targetDuration) {
          durInput.value = targetDuration;
        }
      }
    }

    // Specjalna logika ustawiająca czas trwania terapii dla lewofloksacyny w
    // odmiedniczkowym zapaleniu nerek u dorosłych.  Zgodnie z instrukcją
    // użytkownika u osób dorosłych (wiek ≥ 18 lat) domyślny czas terapii
    // lewofloksacyną w pyelonephritis powinien wynosić 5 dni, niezależnie od
    // wartości zdefiniowanej w strukturze ABX_INDICATIONS.  W tym miejscu
    // dynamicznie nadpisujemy pole duration w formularzu, pozostawiając
    // terapeutyczne wartości dla dzieci bez zmian.
    {
      const normDrugName = (drugName || '').replace(/\u00a0/g, ' ');
      if((normDrugName === 'Lewofloksacyna' || normDrugName === 'Lewofloksacyna i.v.') && indicKey === 'uti_pyelonephritis'){
        // Oblicz wiek w latach: użyj getAge(), a w razie braku lat oblicz z miesięcy.
        let ageYears = (typeof getAge === 'function') ? getAge() : null;
        if(ageYears === null || ageYears === undefined){
          const monthsTmp = (typeof getChildAgeMonths === 'function') ? getChildAgeMonths() : null;
          if(monthsTmp !== null && monthsTmp !== undefined){
            ageYears = monthsTmp / 12;
          }
        }
        if(ageYears != null && !isNaN(ageYears) && ageYears >= 18){
          const targetDuration = 5;
          if(parseInt(durInput.value, 10) !== targetDuration){
            durInput.value = targetDuration;
          }
        }
      }
    }

    // Zaktualizuj wizualne elementy suwaka (podziałka, etykiety min/max oraz bieżąca wartość)
    updateSliderUI();

    // Po aktualizacji suwaka i pól dawki/duracji aktualizujemy widoczność
    // przycisku samodzielnego ustalania dawkowania.  Wcześniej logika
    // uzależniała wyświetlenie przycisku od posiadania niezerowego zakresu
    // suwaka.  Jednak w praktyce wiele wskazań ma stałą wartość dawki,
    // która także powinna umożliwiać rozszerzenie zakresu w trybie
    // niestandardowym (np. Cefiksym 8 mg/kg/dobę).  Dlatego wystarczy,
    // że przycisk jest ukryty tylko podczas aktywnego trybu customDoseActive;
    // w przeciwnym wypadku należy go pokazać, niezależnie od wartości
    // minimalnej i maksymalnej suwaka.  Dzięki temu użytkownik zobaczy
    // przycisk również w przypadku stałej dawki.
    {
      const customBtn = document.getElementById('abxCustomDoseBtn');
      if(customBtn){
        if(!customDoseActive){
          customBtn.style.display = 'block';
        } else {
          customBtn.style.display = 'none';
        }
      }
    }
  }

  // Główna funkcja obliczeniowa – wywoływana przy zmianie któregokolwiek z parametrów
  /**
   * Aktualizuje sekcję przycisku i listy schematów leczenia boreliozy.
   * Jeśli wybrane wskazanie nie jest „lyme”, kontener jest czyszczony i ukryty.
   * W przeciwnym razie tworzony jest przycisk z etykietą zaczerpniętą z LYME_SCHEMES,
   * który po kliknięciu przełącza widoczność listy.  Lista generowana jest
   * dynamicznie na podstawie tablicy LYME_SCHEMES.schemes i zawiera nazwy
   * manifestacji klinicznych oraz zalecane dawki dla dorosłych i dzieci.
   */
  function updateSchemesButton(){
    const container = document.getElementById('abxSchemesContainer');
    if(!container) return;
    // Wyczyść kontener z poprzedniej zawartości
    abxClearElement(container);
    const indicSelect = document.getElementById('abxIndication');
    if(!indicSelect) return;
    const selected = indicSelect.value;
    // Jeżeli nie jest to wskazanie „lyme”, zresetuj flagę i zakończ
    if(selected !== 'lyme'){
      schemesVisible = false;
      return;
    }
    // Utwórz przycisk
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = (LYME_SCHEMES && LYME_SCHEMES.label) ? LYME_SCHEMES.label : 'Schematy leczenia';
    // Styl przycisku – prosty, inspirowany pozostałymi przyciskami w interfejsie
    btn.style.background = '#ffffff';
    btn.style.color = '#000000';
    btn.style.border = '1px solid #000000';
    btn.style.borderRadius = '4px';
    btn.style.padding = '.4rem .8rem';
    btn.style.cursor = 'pointer';
    // Kontener na listę
    const list = document.createElement('div');
    list.id = 'lymeSchemesList';
    list.style.display = schemesVisible ? 'block' : 'none';
    list.style.textAlign = 'left';
    list.style.marginTop = '.6rem';
    // Funkcja renderująca listę
    function renderList(){
      abxClearElement(list);
      if(!schemesVisible){
        list.style.display = 'none';
        return;
      }
      list.style.display = 'block';
      if(!LYME_SCHEMES || !Array.isArray(LYME_SCHEMES.schemes)) return;
      LYME_SCHEMES.schemes.forEach(function(scheme){
        const cond = document.createElement('div');
        cond.style.fontWeight = '600';
        cond.style.marginTop = '.6rem';
        cond.textContent = scheme.condition;
        list.appendChild(cond);
        // Dorośli
        if(Array.isArray(scheme.adult) && scheme.adult.length > 0){
          const hdr = document.createElement('div');
          hdr.style.fontWeight = '500';
          hdr.style.marginTop = '.3rem';
          hdr.textContent = 'Dorośli:';
          list.appendChild(hdr);
          const ul = document.createElement('ul');
          ul.style.marginLeft = '20px';
          scheme.adult.forEach(function(item){
            const li = document.createElement('li');
            let text = item.drug + ': ' + item.dosage;
            if(item.route){ text += ', ' + item.route; }
            if(item.duration){ text += ', ' + item.duration; }
            if(item.frequency){ text += ' — ' + item.frequency; }
            if(item.note){ text += ' — ' + item.note; }
            li.textContent = text;
            ul.appendChild(li);
          });
          list.appendChild(ul);
        }
        // Dzieci
        if(Array.isArray(scheme.children) && scheme.children.length > 0){
          const hdr2 = document.createElement('div');
          hdr2.style.fontWeight = '500';
          hdr2.style.marginTop = '.3rem';
          hdr2.textContent = 'Dzieci:';
          list.appendChild(hdr2);
          const ul2 = document.createElement('ul');
          ul2.style.marginLeft = '20px';
          scheme.children.forEach(function(item){
            const li2 = document.createElement('li');
            let text2 = item.drug + ': ' + item.dosage;
            if(item.route){ text2 += ', ' + item.route; }
            if(item.duration){ text2 += ', ' + item.duration; }
            if(item.frequency){ text2 += ' — ' + item.frequency; }
            if(item.note){ text2 += ' — ' + item.note; }
            li2.textContent = text2;
            ul2.appendChild(li2);
          });
          list.appendChild(ul2);
        }
      });
    }
    // Początkowe wypełnienie listy
    renderList();
    // Obsługa kliknięcia – przełącza widoczność i odświeża sekcję
    btn.addEventListener('click', function(){
      schemesVisible = !schemesVisible;
      updateSchemesButton();
    });
    // Dodaj przycisk i listę do kontenera
    container.appendChild(btn);
    container.appendChild(list);
  }

  function recalc(){
    // Zaktualizuj przycisk schematów leczenia boreliozy niezależnie od pozostałych obliczeń.
    if (typeof updateSchemesButton === 'function') {
      updateSchemesButton();
    }
    const indicKey = document.getElementById('abxIndication').value;
    const indic = ABX_INDICATIONS[indicKey];
    const resultBox = document.getElementById('abxResult');
    const note      = document.getElementById('abxNote');
    // Ukryj przycisk resetu przed każdymi obliczeniami.  Będzie on
    // ewentualnie pokazany ponownie po sprawdzeniu zakresu dawki i wyniku.
    const returnBtn = document.getElementById('abxReturnBtn');
    if(returnBtn){
      // Usuń klasę show-return zamiast nadpisywać display.  Dzięki temu
      // przycisk pozostaje ukryty zgodnie z regułą CSS (display:none),
      // a JS może dodać klasę ponownie, gdy potrzebny.
      returnBtn.classList.remove('show-return');
    }
    if(!resultBox) return;
    // Jeżeli brak zdefiniowanych leków (brak wskazania) – wypisz komunikat i zakończ.
    // Może się zdarzyć, że indic jest niezdefiniowane (np. brak wyboru), dlatego
    // sprawdzamy zarówno istnienie obiektu, jak i jego pola drugs.
    if(!indic || !indic.drugs){
      if(resultBox) abxSetTrustedMarkup(resultBox, '', 'antibiotic result');
      if(note) note.textContent = indic && indic.message ? indic.message : '';
      return;
    }
    // W przeciwnym razie oblicz dawki
    const drugName = document.getElementById('abxDrug').value;
    const drugDef  = indic.drugs[drugName];
    // Pobierz masę ciała
    const weight = getWeight();
    if(!weight){
      abxSetTrustedMarkup(resultBox, '<p class="muted">Wprowadź masę ciała w sekcji „Dane użytkownika”, aby obliczyć dawkę.</p>', 'antibiotic result');
      return;
    }
    // Pobierz wartości dawki i czasu terapii
    const sliderVal = parseFloat(document.getElementById('abxDoseSlider').value);
    // Zawsze na początku resetuj wizualne oznaczenia pola dawki i etykiety suwaka.
    // Jeżeli w poprzednim obliczeniu użytkownik wybrał dawkę poza zakresem,
    // pole mogło zostać oznaczone na czerwono, a etykieta ukryta.  Przed
    // wykonaniem nowych obliczeń przywracamy te elementy do stanu początkowego.
    {
      const doseInputEl  = document.getElementById('abxDoseInput');
      const sliderLabelEl = document.getElementById('sliderValueLabel');
      if(doseInputEl){
        doseInputEl.classList.remove('dose-out-of-range');
      }
      if(sliderLabelEl){
        sliderLabelEl.style.display = '';
      }
    }

    // Flaga informująca, czy wpisana dawka wykracza poza referencyjny zakres
    // ustalony dla danego antybiotyku (pomiędzy slider.min a slider.max).  Jeżeli
    // flaga jest prawdziwa, po zakończeniu obliczeń wyświetlany będzie
    // komunikat ostrzegawczy, a suwak zostanie dezaktywowany.
    let doseOutOfRange = false;
    // Zmienna sterująca widocznością przycisku „Powrót do rekomendacji”.
    // Ustawiamy ją na false na początku; zostanie ustawiona na true, jeśli
    // dawka wyjdzie poza referencyjny zakres lub jeśli obliczona dawka mg/kg
    // przekroczy górny limit zalecanego przedziału.
    let showReturn = false;
    // Odczytaj bieżącą wartość dawki z pola liczbowego.  Synchronizacja między
    // suwakiem a polem liczbowego jest obsługiwana w funkcji attachEventListeners,
    // dlatego nie narzucamy tutaj wartości suwaka na pole.  Pozwala to na
    // wpisywanie dowolnych wartości z rozszerzonego zakresu w polu „Wybrana dawka”.
    let doseVal    = parseFloat(document.getElementById('abxDoseInput').value);
    if(isNaN(doseVal) || doseVal <= 0){
      // Jeśli wpisano złą wartość, zastąp domyślną dawką referencyjną
      doseVal = drugDef.defaultMg;
      document.getElementById('abxDoseInput').value = drugDef.defaultMg;
      document.getElementById('abxDoseSlider').value = drugDef.defaultMg;
    }
    // Sprawdź, czy wpisana wartość mieści się w rozszerzonym zakresie
    // (połowa minimalnej i trzykrotność maksymalnej dawki referencyjnej).  
    const doseSlider = document.getElementById('abxDoseSlider');
    if(doseSlider){
      const refMin = parseFloat(doseSlider.min);
      const refMax = parseFloat(doseSlider.max);
      if(!isNaN(refMin) && !isNaN(refMax)){
        const allowedMin = refMin * 0.5;
        const allowedMax = refMax * 3;
        // Jeżeli przekroczono dopuszczalne granice, ogranicz do nich wartość
        if(doseVal < allowedMin){
          doseVal = allowedMin;
          document.getElementById('abxDoseInput').value = allowedMin;
        }
        if(doseVal > allowedMax){
          doseVal = allowedMax;
          document.getElementById('abxDoseInput').value = allowedMax;
        }
        // Ustal, czy dawka mieści się w referencyjnym przedziale (bez poszerzenia).
        if(doseVal < refMin || doseVal > refMax){
          doseOutOfRange = true;
          showReturn = true;
        }
      }
    }

    // Jeżeli użytkownik włączył tryb własnego ustalania dawki (customDoseActive),
    // traktuj dawkę jako poza rekomendowanym zakresem – dzięki temu etykiety i
    // ramki pola zostaną ustawione na „Wybrana dawka”, a przycisk powrotu
    // pozostanie widoczny.  Suwak nie powinien jednak być dezaktywowany,
    // dlatego dezaktywację obsłużymy poniżej.
    if(customDoseActive){
      doseOutOfRange = true;
      showReturn = true;
    }
    let duration = parseInt(document.getElementById('abxDuration').value, 10);
    // Pozwól użytkownikowi podać dowolną liczbę dni.  Jeśli jednak wpisano
    // liczbę niepoprawną (np. zero lub ujemną), przywróć domyślne zalecenie.
    if(isNaN(duration) || duration <= 0){
      duration = drugDef.duration;
      document.getElementById('abxDuration').value = duration;
    }

    // Specjalna obsługa czasu trwania dla wariantów azytromycyny w pozaszpitalnym zapaleniu płuc u dorosłych (pneumonia_adult).
    // Aktualne wytyczne dopuszczają tylko 5‑dniowy lub 3‑dniowy kurs.  Schemat jednorazowej dawki 2 g został
    // usunięty, dlatego jeśli ustawiony czas trwania jest inny niż 5 lub 3 dni, przywracamy 5 dni.
    if(indicKey === 'pneumonia_adult' && (drugName === 'Azytromycyna (5 dni)' || drugName === 'Azytromycyna (3 dni)' || drugName === 'Azytromycyna')){
      if(duration !== 5 && duration !== 3){
        duration = 5;
        document.getElementById('abxDuration').value = duration;
      }
    }
    // Określ, czy w przypadku fenoksymetylpenicyliny wybrano preparat podawany w jednostkach (j.m.).
    let isUnitMode = false;
    if(drugName === 'Fenoksymetylpenicylina'){
      const formSelect = document.getElementById('abxForm');
      const selectedFormName = formSelect && formSelect.value;
      if(selectedFormName){
        const meta = DRUG_INFO['Fenoksymetylpenicylina'].forms[selectedFormName];
        if(meta && (meta.unitsPer5ml || meta.unitsPerTablet)){
          isUnitMode = true;
        }
      }
    }
    // Obliczenia mg na dobę na podstawie masy ciała. Jeśli dawka podana jest w j.m., przeliczamy ją na mg.
    let doseMgKg;
    let doseUnitsKg;
    if(isUnitMode){
      // Zaokrąglij dawkę do pełnych tysięcy j.m./kg
      doseUnitsKg = Math.round(doseVal / 1000) * 1000;
      // Przelicz jednostki na miligramy: 1 j.m. ≈ 0,000654 mg
      doseMgKg = doseUnitsKg * (654 / 1000000);
      // Zaktualizuj suwak i pole w razie ręcznego wpisania niepełnej wartości
      document.getElementById('abxDoseInput').value = doseUnitsKg;
      document.getElementById('abxDoseSlider').value = doseUnitsKg;
    } else {
      doseMgKg = doseVal;
      if(drugName === 'Fenoksymetylpenicylina'){
        // Oblicz równoważną dawkę w jednostkach na potrzeby dawek dobowych (nie wyświetlana)
        doseUnitsKg = doseMgKg * (1000000 / 654);
      }
    }
    let mgPerDay  = doseMgKg * weight;
    // Specjalna obsługa dla 5‑dniowego schematu azytromycyny. W schemacie tym
    // pierwszego dnia podaje się pełną dawkę, a w kolejnych dniach dawkę o połowę mniejszą.
    // Dorośli i młodzież o masie ≥40 kg otrzymują stałe wartości 500 mg pierwszego dnia i
    // 250 mg w dniach 2–5. Dzieci (<40 kg) korzystają z dawek zależnych od masy ciała
    // obliczonych powyżej (mgPerDay), przy czym w 2.–5. dniu dawka jest o połowę mniejsza.
    let azithroFiveDayFirst = null;
    let azithroFiveDayNext = null;
    let azithroFiveDayTotal = null;
    // Rozpoznaj schemat pięciodniowy na podstawie nazwy leku i długości terapii w definicji.
    {
      const normName = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
      if ((normName === 'Azytromycyna' || normName === 'Azytromycyna (5 dni)') && drugDef && drugDef.duration === 5) {
        // Ustal dawki pierwszego i kolejnych dni w mg.
        if (weight >= 40) {
          // Dorośli i cięższe dzieci: ustalone dawki 500 mg w 1. dniu, 250 mg w kolejnych.
          azithroFiveDayFirst = 500;
          azithroFiveDayNext = 250;
        } else {
          // Dzieci <40 kg: oblicz dawkę pierwszego dnia na podstawie mg/kg,
          // a w kolejnych dniach podaj połowę tej wartości.
          azithroFiveDayFirst = mgPerDay;
          azithroFiveDayNext = mgPerDay / 2;
        }
        azithroFiveDayTotal = azithroFiveDayFirst + azithroFiveDayNext * (duration - 1);
      }
    }
    // Oblicz jednostki na dobę, jeżeli dotyczy
    let iuPerDay = null;
    if(drugName === 'Fenoksymetylpenicylina'){
      // Korzystamy z doseUnitsKg jeśli dostępne, inaczej obliczamy z mg/kg
      let unitsPerKg = isUnitMode ? doseUnitsKg : (doseUnitsKg || (doseMgKg * (1000000 / 654)));
      iuPerDay = Math.round(unitsPerKg * weight);
    }
    // Zaokrąglona wartość j.m./kg (do prezentacji) jeżeli obliczona
    let iuPerKgRounded = null;
    if(drugName === 'Fenoksymetylpenicylina'){
      if(isUnitMode){
        iuPerKgRounded = Math.round(doseUnitsKg);
      } else if(doseUnitsKg){
        iuPerKgRounded = Math.round(doseUnitsKg);
      }
    }
    // Determine effective number of doses per day. Start with the default value from the drug definition.
    let dosesPerDay = drugDef.doses;
    /*
     * Zastosuj szczegółową regułę dla tabletek 875 mg/125 mg koamoksyklawu.
     * Zgodnie z Charakterystyką Produktu Leczniczego wysoka dawka amoksycyliny
     * (875 mg + 125 mg kwasu klawulanowego) może być podawana trzy razy dziennie
     * wyłącznie w wybranych ciężkich zakażeniach (ostre zapalenie ucha
     * środkowego, ostre zapalenie zatok przynosowych, pozaszpitalne zapalenie
     * płuc u dzieci i dorosłych, powikłane zakażenia dróg moczowych oraz
     * odmiedniczkowe zapalenie nerek) i tylko u pacjentów o masie ciała ≥40 kg.
     * W pozostałych wskazaniach lub przy masie <40 kg maksymalny schemat dla
     * tej postaci to 2× 1 tabletka na dobę. Dzięki temu domyślne wartości
     * zdefiniowane w ABX_INDICATIONS (3 dawki w niektórych schorzeniach skóry
     * czy ran) nie będą wymuszały potrójnej dawki dla tej konkretnej mocy.
     */
    if (drugName === 'Amoksycylina z kwasem klawulanowym') {
      const formSelectElem = document.getElementById('abxForm');
      const selectedFormRaw = formSelectElem && formSelectElem.value;
      // Zamień niełamiące spacje na zwykłe, aby porównania były bardziej odporne.
      const selectedForm = selectedFormRaw ? selectedFormRaw.replace(/\u00a0/g, ' ') : '';
      // Sprawdź, czy wybrana postać odpowiada tabletce 875 mg/125 mg.
      // Używamy tylko wyszukiwania liczb, aby uniknąć problemów z odstępami i jednostkami.
      const isHighDoseTablet = selectedForm && /\b875\b/.test(selectedForm) && /\b125\b/.test(selectedForm);
      if (isHighDoseTablet) {
        // Wskazania, w których dopuszczalny jest schemat 3×/dobę. Dodajemy tu
        // zarówno wersję dziecięcą jak i dorosłą zapalenia płuc.
        const highDoseIndic = [
          // Wysokodawkowy schemat 3×/dobę 875 mg/125 mg jest stosowany wyłącznie
          // w wybranych zakażeniach układu moczowego. W leczeniu zakażeń dróg oddechowych
          // zarówno u dzieci, jak i u dorosłych preferowane jest dawkowanie 2×/dobę,
          // dlatego wskazania takie jak zapalenie ucha, zatok czy płuc nie są uwzględniane.
          'uti_pyelonephritis',
          'uti_other'
        ];
        // Jeżeli wskazanie należy do listy, to sprawdź masę ciała.
        if (highDoseIndic.includes(indicKey)) {
          // Jeżeli masa <40 kg, ogranicz liczbę dawek do 2; inaczej użyj 3 dawek.
          const weightNum = typeof weight === 'number' ? weight : parseFloat(weight);
          if (!weightNum || weightNum < 40) {
            dosesPerDay = 2;
          } else {
            dosesPerDay = 3;
          }
        } else {
          // Wszystkie inne schorzenia – zawsze maksymalnie 2 dawki
          dosesPerDay = 2;
        }
      }
    }
    // Tablica komunikatów ostrzegawczych i informacyjnych
    const messages = [];

    // Dodaj ostrzeżenie dla dorosłych mężczyzn z niepowikłanym zakażeniem dróg
    // moczowych.  Jeżeli użytkownik wprowadzi dane osoby dorosłej (wiek ≥ 18 lat)
    // płci męskiej i wybierze wskazanie „Niepowikłane zakażenie dróg moczowych”,
    // w sekcji ostrzeżeń zostanie wyświetlony komunikat informujący, że każde
    // zakażenie układu moczowego u mężczyzny jest traktowane jako powikłane.
    {
      try {
        // Sprawdź klucz wskazania.  Wskaźnik "uti_uncomplicated" odpowiada
        // niepowikłanemu zakażeniu dróg moczowych.
        if (indicKey === 'uti_uncomplicated') {
          // Pobierz wiek w latach; jeśli pole wieku w latach jest puste,
          // oblicz na podstawie miesięcy.
          let ageYearsLocal = (typeof getAge === 'function') ? getAge() : null;
          if (ageYearsLocal === null || ageYearsLocal === undefined) {
            const monthsTmp = (typeof getChildAgeMonths === 'function') ? getChildAgeMonths() : null;
            if (monthsTmp !== null && monthsTmp !== undefined) {
              ageYearsLocal = monthsTmp / 12;
            }
          }
          // Pobierz płeć z pola #sex – wartości 'M' dla mężczyzny i 'F' dla kobiety.
          const sexElLocal = document.getElementById('sex');
          const sexVal = sexElLocal ? sexElLocal.value : null;
          if (sexVal === 'M' && ageYearsLocal != null && !isNaN(ageYearsLocal) && ageYearsLocal >= 18) {
            messages.push('Uwaga: każde zakażenie układu moczowego u mężczyzny jest traktowane jako powikłane, sugerujemy przejść do wskazania „Powikłane i inne zakażenia układu moczowego”');
          }
        }
      } catch (error) {
        logAbxWarn('Nie udało się odczytać danych użytkownika dla ostrzeżeń antybiotykoterapii', error);
      }
    }

    // Jeżeli wpisana dawka wykracza poza referencyjny przedział (między
    // slider.min a slider.max), wyświetl ostrzeżenie.  W trybie własnej dawki
    // (customDoseActive) suwak pozostaje aktywny, aby umożliwić wybór w
    // rozszerzonym zakresie.  W przeciwnym wypadku suwak jest dezaktywowany,
    // aby sygnalizować, że wybrano dawkę spoza rekomendacji.
    if(doseOutOfRange){
      const sliderEl = document.getElementById('abxDoseSlider');
      if(sliderEl){
        if(customDoseActive){
          sliderEl.disabled = false;
        } else {
          sliderEl.disabled = true;
        }
      }
      messages.push('Takie dawki w tym wskazaniu nie są rekomendowane');
    } else {
      const sliderEl = document.getElementById('abxDoseSlider');
      if(sliderEl){
        sliderEl.disabled = false;
      }
    }
    // Dodatkowo podkreśl pole „Wybrana dawka” na czerwono i ukryj etykietę
    // suwaka, gdy dawka jest poza rekomendowanym zakresem.  Dzięki temu
    // użytkownik otrzymuje czytelny sygnał ostrzegawczy, a dolna etykieta
    // nie wprowadza w błąd.
    {
      const doseInputEl   = document.getElementById('abxDoseInput');
      const sliderLabelEl = document.getElementById('sliderValueLabel');
      if(doseInputEl){
        if(doseOutOfRange){
          doseInputEl.classList.add('dose-out-of-range');
        } else {
          doseInputEl.classList.remove('dose-out-of-range');
        }
      }
      if(sliderLabelEl){
        // W trybie własnej dawki (customDoseActive) nie chowamy etykiety wartości,
        // nawet jeśli dawka wykracza poza rekomendowany zakres.  Użytkownik powinien
        // widzieć aktualnie wybraną wartość na suwaku.  W trybie standardowym
        // (gdy customDoseActive jest false) zachowujemy dotychczasowe zachowanie:
        // przy dawkach poza zakresem etykieta zostaje ukryta, aby nie wprowadzać
        // w błąd.
        if(doseOutOfRange && !customDoseActive){
          sliderLabelEl.style.display = 'none';
        } else {
          sliderLabelEl.style.display = '';
        }
      }
    }
    // Zaktualizuj etykietę pola dawki w zależności od tego, czy dawka mieści się w rekomendowanym zakresie.
    {
      const labelSpan = document.getElementById('abxDoseInputLabelText');
      if (labelSpan) {
        if (doseOutOfRange) {
          labelSpan.textContent = 'Wybrana dawka';
        } else {
          labelSpan.textContent = 'Rekomendowana dawka';
        }
      }
    }
    // Tablica na zebrane źródła (cytowania) związane z komunikatami.  Każdy
    // komunikat może odnosić się do jednego lub kilku źródeł.  Informacje
    // dotyczące źródeł są dodawane w momencie dodawania komunikatu
    // (np. przy schematach dawkowania) lub wyciągane z treści komunikatu na końcu
    // funkcji.  Później lista ta zostanie wykorzystana do budowy sekcji
    // “Źródła” wyświetlanej pod komunikatami.
    let sourcesUsed = [];
    // Pomocnicza funkcja do escapowania HTML w treściach komunikatów.  Pozwala
    // bezpiecznie wstawić tekst do kontrolowanego HTML, zamieniając znaki specjalne na
    // encje.
    const escapeHTML = (str) => abxEscapeHtml(str);

    // Pomocnicza funkcja aktualizująca zawartość pola abxNote.  Łączy wszystkie
    // komunikaty w osobne akapity, usuwa z nich identyfikatory cytowań (np. „”),
    // zbiera napotkane cytowania do listy źródeł i dołącza tabelę źródeł pod
    // komunikatami.  Cytowania w postaci referencji są również dodawane z tablicy
    // sourcesUsed, która może być uzupełniana ręcznie podczas generowania
    // komunikatów (np. dla azytromycyny).  Funkcja ta powinna być wywoływana
    // po zakończeniu obliczeń w każdej gałęzi recalc.
    function updateNoteElement(){
      // Aktualizuj sekcję schematów leczenia boreliozy przed wypełnianiem notatki
      if (typeof updateSchemesButton === 'function') {
        updateSchemesButton();
      }
      if(!note) return;
      // Kopiuj istniejące źródła, aby nie modyfikować pierwotnej tablicy
      let allSources = Array.from(sourcesUsed);
      const cleanedMessages = [];
      messages.forEach(msg => {
        if(!msg) return;
        // Znajdź wszystkie cytowania w treści komunikatu
        const citations = msg.match(/【[^】]+】/g);
        if(citations){
          citations.forEach(cit => {
            allSources.push(cit);
          });
        }
        // Usuń cytowania z komunikatu i przytnij białe znaki
        const cleaned = msg.replace(/【[^】]+】/g, '').trim();
        if(cleaned.length > 0){
          cleanedMessages.push(cleaned);
        }
      });
      // Usuń duplikaty z listy źródeł
      const uniqueSources = Array.from(new Set(allSources.filter(Boolean)));
      // === Classify messages into warnings and informational entries ===
      // Messages that relate to safety (e.g. wrong dose, inappropriate form, dose limits, hospitalization) should
      // remain in the red note area (abxNote).  All remaining messages are considered additional
      // information and will be presented in the "Dodatkowe informacje" section at the bottom of the card.
      const warningMessages = [];
      const infoMessages    = [];
      cleanedMessages.forEach(m => {
        const lower = m.toLowerCase();
        // Niektóre komunikaty, choć zawierają słowa kluczowe (np. "hospitalizacja" lub "nie"),
        // mają charakter informacyjny i powinny zostać wyświetlone w sekcji Dodatkowe informacje.
        // Konkretnie dotyczy to treści o chorobach współistniejących w pozaszpitalnym zapaleniu płuc u dorosłych
        // oraz wskazań do natychmiastowej antybiotykoterapii w ostrym zapaleniu ucha środkowego.
        const isManualInfo = (
          lower.includes('chorobami współistniejącymi') ||
          lower.includes('natychmiastowa antybiotykoterapia')
        );
        if (isManualInfo) {
          infoMessages.push(m);
          return;
        }
        // Heurystyki: traktuj komunikaty zawierające poniższe słowa jako ostrzeżenia.
        // Zwykle dotyczą one błędnego dawkowania, nieodpowiedniej postaci, konieczności hospitalizacji
        // lub innych kwestii bezpieczeństwa. Wszystkie pozostałe komunikaty zostaną wyświetlone
        // w sekcji "Dodatkowe informacje" jako wskazówki dla lekarza.
        // Komunikaty o ograniczeniu do maksymalnej dawki powinny być zawsze traktowane
        // jako ostrzeżenia, nawet jeśli nie zawierają standardowych słów kluczowych.
        // Sprawdzamy wystąpienie frazy w dowolnym miejscu (nie tylko na początku), aby
        // zapewnić właściwą klasyfikację nawet w przypadku dodatkowych znaków czy białych znaków.
        const isMaxLimitMsg = lower.includes('zastosowano ograniczenie do maksymalnej dawki');
        const isWarning = (
          isMaxLimitMsg ||
          lower.startsWith('uwaga') ||
          lower.includes('nie są rekomendowane') ||
          lower.includes('nie jest rekomendowane') ||
          (lower.includes('forma') && lower.includes('nieodpowied')) ||
          lower.includes('dawka została ograniczona') ||
          lower.includes('nieodpowiednia') ||
          lower.includes('hospitalizacja') ||
          lower.includes('nie stosować') ||
          lower.includes('nie jest skuteczna') ||
          lower.includes('wskazana wyłącznie') ||
          lower.includes('zalecana jest hospitalizacja') ||
          lower.includes('nie powinna') ||
          lower.includes('nie powinni') ||
          lower.includes('nie można') ||
          lower.includes('nie należy') ||
          lower.includes('mniejsza niż') ||
          lower.includes('zawiesinę 400') ||
          lower.includes('zawiesinę es') ||
          lower.includes('maksymalna dawka') ||
          // Obsłuż wariant „maksymalnej dawki” (inny przypadek gramatyczny), który pojawia się
          // w komunikacie o ograniczeniu do maksymalnej dawki – dzięki temu zostanie
          // zakwalifikowany jako ostrzeżenie, a nie informacja.
          lower.includes('maksymalnej dawki') ||
          lower.includes('powinny otrzymywać zawiesinę')
        );
        if(isWarning){
          warningMessages.push(m);
        } else {
          infoMessages.push(m);
        }
      });
      // === Render safety warnings into the abxNote element ===
      if(note){
        let noteHtml = '';
        warningMessages.forEach(w => {
          // Escape HTML to avoid injection.  Każdy komunikat umieszczamy w oddzielnym akapicie.
          const sanitized = escapeHTML(w);
          // Komunikaty o ograniczeniu do maksymalnej dawki lub zawierające informacje o maksymalnej dawce
          // kolorujemy na ciemno pomarańczowo, aby odróżnić je od krytycznych ostrzeżeń w kolorze czerwonym.
          const wLower = w.toLowerCase();
          const isDoseLimit = (
            wLower.includes('zastosowano ograniczenie do maksymalnej dawki') ||
            wLower.includes('maksymalna dawka') ||
            wLower.includes('maksymalnej dawki') ||
            wLower.includes('dawka została ograniczona')
          );
          if (isDoseLimit) {
            noteHtml += `<p style="color:#c76c00;">${sanitized}</p>`;
          } else {
            noteHtml += `<p>${sanitized}</p>`;
          }
        });
        abxSetTrustedMarkup(note, noteHtml, 'antibiotic note');
      }
      // === Build the 'Dodatkowe informacje' section with bullet list and sources ===
      {
        const info = document.getElementById('abxInfo');
        if(info){
          let infoHtml = '';
          if(infoMessages.length > 0){
            infoHtml += '<div style="text-align:center; font-weight:500; margin-bottom:.4rem;">Dodatkowe informacje</div>';
            infoHtml += '<ul style="text-align:left; color:black; list-style-type:disc; margin-left:20px; margin-top:.4rem;">';
            infoMessages.forEach(m => {
              infoHtml += `<li>${escapeHTML(m)}</li>`;
            });
            infoHtml += '</ul>';
          }
          if(uniqueSources.length > 0){
            const linkSet = new Set();
            uniqueSources.forEach(src => {
              const mapped = CITATION_MAP[src] || src;
              if(!linkSet.has(mapped)){
                linkSet.add(mapped);
              }
            });
            let sourcesList = '';
            linkSet.forEach(mapped => {
              const linkText = escapeHTML(mapped);
              const href = abxEscapeHtml(abxSafeUrl(mapped));
              sourcesList += `<li><a href="${href}" target="_blank" rel="noopener noreferrer">${linkText}</a></li>`;
            });
            infoHtml += '<div style="text-align:center; margin-top:.6rem;">';
            infoHtml += '<button type="button" id="abxSourcesToggle" style="background:#ffffff; color:#000000; border:1px solid #000000; border-radius:4px; padding:.4rem .8rem; cursor:pointer;">Źródła</button>';
            infoHtml += `<div id="abxSourcesList" style="display:none; margin-top:.4rem;"><ul style="text-align:left; list-style-type:disc; margin-left:20px;">${sourcesList}</ul></div>`;
            infoHtml += '</div>';
          }
          abxSetTrustedMarkup(info, infoHtml, 'antibiotic info');
          const toggleBtn = document.getElementById('abxSourcesToggle');
          if(toggleBtn){
            toggleBtn.onclick = function(){
              const list = document.getElementById('abxSourcesList');
              if(list){
                list.style.display = (list.style.display === 'none' || list.style.display === '') ? 'block' : 'none';
              }
            };
            toggleBtn.onmouseenter = function(){ this.style.backgroundColor = '#eeeeee'; };
            toggleBtn.onmouseleave = function(){ this.style.backgroundColor = '#ffffff'; };
          }
          const card = document.getElementById('antibioticTherapyCard');
          if(card){
            const recSec = document.getElementById('abxRecSection');
            if(recSec && recSec.parentNode === card){
              card.insertBefore(info, recSec.nextSibling);
            } else {
              const result = document.getElementById('abxResult');
              if(result && result.parentNode === card){
                card.insertBefore(info, result.nextSibling);
              } else {
                card.appendChild(info);
              }
            }
          }
        }
      }
      // Po zrenderowaniu sekcji informacyjnej i ostrzeżeń, nie wywołuj
      // oryginalnej logiki budowania notatek poniżej.
      return;
      let html = '';
      // Dodaj treść komunikatów jako osobne akapity
      cleanedMessages.forEach(m => {
        html += `<p>${escapeHTML(m)}</p>`;
      });
      // Jeśli są źródła, dodaj sekcję Źródła podobną do piśmiennictwa.
      // Zamiast wypisywać surowe identyfikatory w tekście komunikatu, tworzymy
      // listę numerowaną. Każda pozycja listy jest linkiem do oryginalnego
      // identyfikatora, a w treści linku znajduje się numer w nawiasach.
      if (uniqueSources.length > 0) {
        // W sekcji "Źródła" zamiast numerowanej listy wyświetlamy każdy adres
        // internetowy jako osobny wiersz listy punktowanej.  Tekst linku
        // zawiera cały adres URL (np. https://www.drugs.com/dosage/azithromycin.html),
        // dzięki czemu użytkownicy widzą od razu docelową stronę.  Jeżeli
        // identyfikator cytatu nie jest odwzorowany w CITATION_MAP, wyświetlamy
        // oryginalny identyfikator, co również umożliwia kliknięcie (choć może
        // prowadzić do pustej strony).  Korzystamy z tagu <ul> bez numeracji,
        // ponieważ numeracja nie jest istotna dla użytkownika.
        // Render sources as a bulleted list aligned to the left.  The inline
        // style forces left alignment and provides a small left margin to
        // ensure the bullets are indented even if the parent container has
        // a center alignment applied.  Without this style the list inherits
        // the centering from the surrounding note container.
        html += '<p><strong>Źródła:</strong></p><ul style="text-align:left; list-style-type:disc; margin-left:20px;">';
        // Zbuduj listę unikalnych adresów po odwzorowaniu identyfikatorów cytatów.  Jeżeli
        // kilka identyfikatorów cytuje tę samą stronę (np. różne akapity tej
        // samej publikacji), adres zostanie wyświetlony tylko raz.
        const linkSet = new Set();
        uniqueSources.forEach(src => {
          const mapped = CITATION_MAP[src] || src;
          if (!linkSet.has(mapped)) {
            linkSet.add(mapped);
          }
        });
        linkSet.forEach(mapped => {
          const linkText = escapeHTML(mapped);
          const href = abxEscapeHtml(abxSafeUrl(mapped));
          html += `<li><a href="${href}" target="_blank" rel="noopener noreferrer">${linkText}</a></li>`;
        });
        html += '</ul>';
      }
      abxSetTrustedMarkup(note, html, 'antibiotic note');
    }
    // Specjalne ostrzeżenia dla fosfomycyny: zgodnie z Charakterystyką Produktu Leczniczego
    // fosfomycyna trometamol w dawce 3 g jest wskazana do jednorazowego leczenia
    // ostrego, niepowikłanego zapalenia pęcherza moczowego u kobiet i dziewcząt
    // powyżej 12. r.ż.; stosowanie preparatu u młodszych dzieci nie zostało
    // udokumentowane i nie jest rekomendowane.  
    // Wprowadzamy dodatkowy komunikat informacyjny, aby użytkownik był świadomy,
    // że fosfomycyna nie powinna być stosowana u pacjentów <12 lat.
    if (drugName === 'Fosfomycyna') {
      const fosfoAge = getAge();
      if (fosfoAge != null && fosfoAge < 12) {
        messages.push('Fosfomycyna trometamol (3 g) jest wskazana wyłącznie u kobiet i dziewcząt \u226512 lat w leczeniu ostrego, niepowikłanego zapalenia pęcherza moczowego; stosowanie u młodszych dzieci nie jest rekomendowane.');
      }
    }
    // Dodatkowe ostrzeżenia dla niemowląt w pozaszpitalnym zapaleniu płuc
    if(indicKey === 'pneumonia_child' && weight <= 5){
      messages.push('U dzieci w wieku poniżej 3 miesięcy (\u22645 kg) zalecana jest hospitalizacja i dożylne podawanie antybiotyków. Dawki podawane są co 6–8 godzin (cefuroksym 75–150 mg/kg/dobę, amoksycylina/klawulanian 100 mg/kg/dobę, cefotaksym 50–180 mg/kg/dobę, ceftriakson 50–100 mg/kg/dobę) wraz z kloksacyliną 100 mg/kg/dobę).');
    }
    // Dodaj dodatkowe komunikaty dla wybranych leków w pozaszpitalnym zapaleniu płuc u dzieci.
    // Te wiadomości są wyświetlane po wprowadzeniu szczegółowych dawek, ale przed nałożeniem limitów dobowych.
    if (indicKey === 'pneumonia_child') {
      // Schematy azytromycyny: informacja o dwóch dopuszczalnych schematach (5‑dniowym i 3‑dniowym)
      if (drugName === 'Azytromycyna') {
        messages.push('Azytromycynę w PZP można podawać według jednego z dwóch schematów: (1) 10 mg/kg mc. w 1. dniu, następnie 5 mg/kg mc. co 24 h przez kolejne 4 doby (łącznie 5 dni), albo (2) 10 mg/kg mc. co 24 h przez 3 dni. Obliczona dawka w kalkulatorze odpowiada dawce dobowej; dopasuj schemat zgodnie z zaleceniami.');
      }
      // Informacja o czasie terapii klarytromycyną – minimum 7 dni; możliwość przedłużenia do 10 dni
      if (drugName === 'Klarytromycyna') {
        messages.push('Zalecany czas terapii klarytromycyną w PZP wynosi co najmniej 7 dni. W cięższych zakażeniach lub przy utrzymujących się objawach można przedłużyć leczenie do 10 dni.');
      }
      // Ostrzeżenie: makrolidy (klarytromycyna, azytromycyna) nie są lekami pierwszego wyboru w PZP.
      // Stosuj je wyłącznie przy podejrzeniu zakażenia atypowego (Mycoplasma pneumoniae, Chlamydophila pneumoniae),
      // zazwyczaj u dzieci ≥5 lat, lub jako dodatek do β‑laktamu.
      if (drugName === 'Klarytromycyna' || drugName === 'Azytromycyna') {
        messages.push('Uwaga: makrolidy (klarytromycyna, azytromycyna) w pozaszpitalnym zapaleniu płuc u dzieci stosuje się tylko w przypadku podejrzenia zakażenia atypowego i zazwyczaj u dzieci ≥5 lat; w innych przypadkach β‑laktamy pozostają leczeniem pierwszego wyboru.');
      }
      // Informacja dla ampicyliny – sugestia przejścia na schemat dorosły u pacjentów 40–50 kg
      if (drugName === 'Ampicylina' && weight >= 40) {
        messages.push('U pacjentów o masie 40–50 kg warto rozważyć schematy dawkowania ampicyliny stosowane u dorosłych, np. 6–8 g/dobę w 4 dawkach co 6 godzin.');
      }

      // Ogólne zalecenie dotyczące czasu terapii w nieskomplikowanym pozaszpitalnym zapaleniu płuc u dzieci
      messages.push('W nieskomplikowanym zapaleniu płuc u dzieci rozważ 5‑dniowy czas leczenia – dłużej tylko jeśli objawy się utrzymują.');
      // Przypomnienie o wirusowej etiologii – większość zapaleń płuc u dzieci <5 lat ma podłoże wirusowe, dlatego antybiotyki należy
      // stosować wyłącznie przy podejrzeniu zakażenia bakteryjnego.
      messages.push('Ponad 30% zapaleń płuc u dzieci do 5 roku życia ma etiologię wirusową; antybiotykoterapię rozważaj tylko przy wyraźnych objawach zakażenia bakteryjnego.');
      // Jeśli po 48–72 h leczenia amoksycyliną (lub amoksycyliną z kwasem klawulanowym) nie obserwuje się poprawy, należy dołączyć makrolid
      // (klarytromycynę lub azytromycynę); należy również rozważyć obecność atypowych drobnoustrojów i ewentualną hospitalizację.
      messages.push('Brak poprawy po 48–72 h leczenia amoksycyliną (lub amoksycyliną z kwasem klawulanowym) jest wskazaniem do dołączenia makrolidu, np. klarytromycyny lub azytromycyny; rozważ też atypową etiologię i potrzebę hospitalizacji.');
      // Informacja dotycząca wysokodawkowego ko‑amoksyklawu: preparaty ES (Augmentin ES, Amoksiklav ES) zawierające 6,4 mg/kg mc.
      // kwasu klawulanowego powinny być stosowane w dawce 90 mg/kg mc./dobę amoksycyliny; ko‑amoksyklaw jest wskazany jako lek
      // pierwszego wyboru, gdy dziecko przyjmowało antybiotyk β‑laktamowy w poprzednich 30 dniach.
      if (drugName === 'Amoksycylina z kwasem klawulanowym') {
        messages.push('Dawka 90 mg/kg mc./dobę amoksycyliny z 6,4 mg/kg mc./dobę kwasu klawulanowego wymaga stosowania preparatów ES (np. Augmentin ES, Amoksiklav ES). Ko‑amoksyklaw może być pierwszym wyborem, gdy dziecko otrzymywało antybiotyk β‑laktamowy w ciągu ostatnich 30 dni.');
      }
      // W przypadku późnej nadwrażliwości na penicyliny rekomenduje się aksetyl cefuroksymu; w natychmiastowej nadwrażliwości
      // (reakcja anafilaktyczna) lub podejrzeniu bakterii atypowych należy zastosować makrolid (klarytromycynę lub
      // azytromycynę) aktywny wobec Haemophilus influenzae.
      messages.push('Przy nadwrażliwości na penicyliny typu późnego można zastosować aksetyl cefuroksymu; w nadwrażliwości typu natychmiastowego lub przy podejrzeniu bakterii atypowych zalecany jest makrolid (klarytromycyna, azytromycyna) aktywny wobec Haemophilus influenzae.');
      // Przypomnienie o dominującej roli Streptococcus pneumoniae w pozaszpitalnym zapaleniu płuc u dzieci oraz o tym, że jest
      // najczęstszym czynnikiem ciężkiego przebiegu choroby.
      messages.push('Streptococcus pneumoniae jest najczęstszym czynnikiem pozaszpitalnego zapalenia płuc u dzieci i najczęściej odpowiada za ciężkie przypadki choroby.');
      // Antybiotyki rezerwowe: wankomycyna, teikoplanina i linezolid są zarezerwowane dla zakażeń wywołanych MRSA lub
      // wieloopornymi pneumokokami i powinny być stosowane tylko w ciężkich przypadkach.
      messages.push('Antybiotyki rezerwowe (wankomycyna, teikoplanina, linezolid) stosuje się wyłącznie w ciężkich zakażeniach wywołanych wieloopornymi szczepami Streptococcus pneumoniae lub MRSA.');
      // Dodaj odwołania do źródeł dla powyższych komunikatów.  Łączymy cytowania w jednej tablicy, aby uniknąć powtarzania adresów.
      sourcesUsed.push('', '', '', '', '', '', '', '');
    }

    // Dodatkowe komunikaty dla dorosłych z pozaszpitalnym zapaleniem płuc
    if (indicKey === 'pneumonia_adult') {
      // Nowe uporządkowane komunikaty dla lekarza dotyczące PZP u dorosłych
      messages.push('Większość szczepów Streptococcus pneumoniae pozostaje wrażliwa na amoksycylinę; oporność na makrolidy jest znaczna, dlatego makrolidy (azytromycyna, klarytromycyna) stosuj wyłącznie przy natychmiastowej alergii na β‑laktamy lub podejrzeniu zakażenia atypowego.');
      messages.push('U pacjentów z chorobami współistniejącymi (POChP, cukrzyca, niewydolność nerek lub krążenia, niedawna hospitalizacja, alkoholizm, przebyta grypa) preferuj terapię skojarzoną β‑laktam + makrolid lub doksycyklinę, a przy braku przeciwwskazań rozważ alternatywy drugiego rzutu.');
      messages.push('W ciężkim przebiegu PZP u dorosłych rozważ wysokodawkowe preparaty ko‑amoksyklawu (1,875/0,125 g co 12 h) wraz z dodatkową dawką amoksycyliny.');
      messages.push('Aksetyl cefuroksymu jest zalecany w późnych reakcjach nadwrażliwości na penicyliny; u pacjentów z reakcją natychmiastową lub podejrzeniem zakażenia atypowego stosuj makrolid aktywny wobec Haemophilus influenzae.');
      messages.push('Przy podejrzeniu udziału bakterii beztlenowych (alkoholizm, zaburzenia świadomości, aspiracja) lub Gram‑ujemnych pałeczek, takich jak Klebsiella pneumoniae, włącz do terapii cefalosporynę III generacji lub karbapenem.');
      messages.push('Zakażenia wywołane przez Legionella spp. związane są z klimatyzacją lub aerozolem wodnym – skuteczne są makrolidy lub fluorochinolony.');
      messages.push('Standardowy czas leczenia PZP u dorosłych wynosi 5 dni; kontynuuj antybiotykoterapię co najmniej 3 dni po uzyskaniu stabilizacji klinicznej i rozważ ponowną ocenę, jeżeli po 5 dniach brak wyraźnej poprawy.');
      // Zarejestruj wykorzystane źródła (łącznie z portalem antybiotyki.edu.pl)
      sourcesUsed.push('', '', '', '', '', '');
    }

    // Komunikaty ostrzegawcze i informacyjne dla ostrego zapalenia oskrzeli u dorosłych i dzieci
    // (wskazanie "bronchitis").  Większość przypadków ma etiologię wirusową; antybiotykoterapia jest
    // zarezerwowana dla potwierdzonych zakażeń bakteryjnych lub pacjentów z czynnikami ryzyka.
    if (indicKey === 'bronchitis') {
      // Ostrzeżenia
      // Większość przypadków ostrego zapalenia oskrzeli ma etiologię wirusową; rutynowe stosowanie antybiotyków nie jest zalecane, ponieważ nie skraca czasu choroby i sprzyja rozwojowi oporności.
      messages.push('Uwaga: większość przypadków ostrego zapalenia oskrzeli ma etiologię wirusową – rutynowe stosowanie antybiotyków nie jest zalecane, ponieważ nie skraca czasu choroby i sprzyja rozwojowi oporności.');
      // Antybiotykoterapię należy rozważyć jedynie u osób starszych z chorobami współistniejącymi lub pacjentów z objawami sugerującymi zakażenie bakteryjne.
      messages.push('Uwaga: antybiotykoterapię rozważaj jedynie u osób starszych z chorobami współistniejącymi lub u pacjentów z objawami sugerującymi zakażenie bakteryjne – w innych sytuacjach wystarczą leczenie objawowe i obserwacja.');
      // Krztusiec może objawiać się napadowym kaszlem; w takich przypadkach stosuje się makrolidy u chorego i jego bliskich.
      messages.push('Uwaga: uporczywy, napadowy kaszel trwający ponad 2 tygodnie może wskazywać na krztusiec; w takich przypadkach podaj makrolid (np. azytromycynę) choremu i jego bliskim, aby ograniczyć szerzenie się zakażenia.');
      // Fluorochinolony są lekami drugiego rzutu ze względu na ryzyko poważnych działań niepożądanych.
      messages.push('Uwaga: fluorochinolony (lewofloksacyna, moksyfloksacyna) to leki drugiego rzutu obarczone ryzykiem poważnych działań niepożądanych; stosuj je wyłącznie, gdy inne opcje są przeciwwskazane.');
      // Informacje
      messages.push('Ostre zapalenie oskrzeli najczęściej wywołują wirusy układu oddechowego – m.in. wirusy grypy, paragrypy, rhinowirusy, RSV, koronawirusy, adenowirusy i metapneumowirus; antybiotyki nie działają na infekcje wirusowe.');
      messages.push('Zielona lub żółta plwocina nie świadczy o bakteryjnym pochodzeniu choroby i sama w sobie nie stanowi wskazania do antybiotykoterapii.');
      messages.push('Leczenie ostrego zapalenia oskrzeli ma przede wszystkim charakter objawowy: odpoczynek, nawodnienie, leki przeciwgorączkowe, przeciwkaszlowe, wykrztuśne oraz leki przeciwhistaminowe pierwszej generacji lub dekongestanty; przed rozpoczęciem antybiotykoterapii należy wykluczyć zapalenie płuc.');
      messages.push('U pacjentów powyżej 75 roku życia lub z upośledzoną odpornością warto rozważyć diagnostykę – testy w kierunku grypy, SARS‑CoV‑2 i RSV oraz wykonanie zdjęcia klatki piersiowej w celu wykluczenia zapalenia płuc.');
      messages.push('U niemowląt w pierwszych miesiącach życia zapalenie oskrzelików może prowadzić do niewydolności oddechowej i wymagać hospitalizacji; w celu ograniczenia transmisji należy izolować chorych i dbać o dezynfekcję rąk.');
      messages.push('Gdy wykryje się Mycoplasma pneumoniae lub Chlamydophila pneumoniae, stosuj klarytromycynę (0,5 g co 12 h lub co 24 h u dorosłych; u dzieci 15 mg/kg mc./dobę w dwóch dawkach).');
      messages.push('W zakażeniu Bordetella pertussis zalecana jest azytromycyna: u dorosłych 500 mg w 1. dniu, następnie 250 mg w dniach 2–5 lub 500 mg przez 3 dni; u dzieci 10 mg/kg w 1. dniu, potem 5 mg/kg w dniach 2–5.');
      messages.push('Ostre zapalenie oskrzeli jest częstą przyczyną nadużywania antybiotyków; powstrzymanie się od niepotrzebnej antybiotykoterapii pomaga ograniczyć rozwój lekooporności.');
      // Zarejestruj wykorzystane źródła (unikalna lista) dla tego wskazania.  Zamiast miejscowych identyfikatorów używamy linków do artykułów PubMed/PMC.
      sourcesUsed.push(
        'https://pubmed.ncbi.nlm.nih.gov/21121518/', // Diagnosis and treatment of acute bronchitis – wirusy powodują >90% przypadków, antybiotyki zwykle nie są wskazane
        'https://pmc.ncbi.nlm.nih.gov/articles/PMC7132523/', // Principles of appropriate antibiotic use for uncomplicated acute bronchitis – ocena powinna skupić się na wykluczeniu zapalenia płuc; rutynowe antybiotyki niezalecane, wyjątek: podejrzenie krztuśca
        'https://pmc.ncbi.nlm.nih.gov/articles/PMC7107838/', // PIDS/IDSA guidelines on community-acquired pneumonia in children – zalecają azytromycynę (10 mg/kg dzień 1, potem 5 mg/kg) oraz klarytromycynę 15 mg/kg/dobę w 2 dawkach; wymieniają fluoroquinolony jako opcję dla starszych dzieci
        'https://pubmed.ncbi.nlm.nih.gov/11292120/', // Study on Mycoplasma and Chlamydia infections in children with wheezing – stosowano klarytromycynę 15 mg/kg/dobę
        'https://pubmed.ncbi.nlm.nih.gov/16340941/'  // CDC guidelines on treatment and postexposure prophylaxis of pertussis – omawiają stosowanie makrolidów, w tym azytromycyny i klarytromycyny
      );
    }

    // Komunikaty ostrzegawcze i informacyjne dla odmiedniczkowego zapalenia nerek
    // (wskazanie "uti_pyelonephritis").  Poniższe wiadomości streszczają zalecenia z polskich wytycznych
    // oraz literatury międzynarodowej: podkreślają konieczność hospitalizacji u niemowląt i pacjentów
    // z ciężkim przebiegiem, właściwy dobór antybiotyków oraz metodę pobierania moczu.
    if (indicKey === 'uti_pyelonephritis') {
      // Zależnie od wieku pacjenta wyświetlaj komunikaty dla dorosłych lub dla dzieci.
      const agePyelo = getAge();
      if (agePyelo != null && !isNaN(agePyelo) && agePyelo >= 18) {
        // Informacje dla dorosłych z niepowikłanym odmiedniczkowym zapaleniem nerek
        // Leczenie ambulatoryjne stosuje się u większości pacjentów. Antybiotykami pierwszego wyboru są fluorochinolony:
        messages.push('W ambulatoryjnym leczeniu niepowikłanego odmiedniczkowego zapalenia nerek u dorosłych antybiotykami pierwszego wyboru są fluorochinolony: ciprofloxacyna 500 mg doustnie co 12 h przez 7–10 dni, albo lewofloksacyna 500 mg raz dziennie przez 5 dni.');
        // W przypadkach wymagających hospitalizacji stosuje się antybiotyki dożylne, takie jak cefalosporyny III generacji, fluorochinolony, β‑laktamy z inhibitorem, aminoglikozydy lub karbapenemy; po poprawie klinicznej terapię należy kontynuować doustnie zgodnie z wynikami posiewu.
        messages.push('W przypadkach wymagających hospitalizacji stosuje się dożylne cefalosporyny III generacji, fluorochinolony, β‑laktamy z inhibitorem, aminoglikozydy lub karbapenemy; po poprawie klinicznej leczenie należy kontynuować doustnymi preparatami zgodnie z wynikami posiewu.');
        // Empiryczne stosowanie szerokospektralnych antybiotyków należy ograniczyć do pacjentów z wysokim ryzykiem zakażenia szczepami wieloopornymi (np. wcześniejsza kolonizacja lub zakażenie szczepem ESBL, immunosupresja); w pozostałych przypadkach leczenie powinno być dostosowane do wyników posiewu.
        messages.push('Empiryczne stosowanie szerokospektralnych antybiotyków ogranicz do pacjentów z wysokim ryzykiem zakażenia szczepem wieloopornym (np. wcześniejsza kolonizacja lub zakażenie szczepem ESBL, immunosupresja); w innych przypadkach dostosuj leczenie do wyników posiewu.');
        // Łączny czas terapii zależy od zastosowanego antybiotyku: zwykle 7 dni dla fluorochinolonów oraz 10–14 dni dla β‑laktamów lub trimetoprimu‑sulfametoksazolu.
        messages.push('Łączny czas terapii to zwykle 7 dni dla fluorochinolonów lub 10–14 dni dla β‑laktamów lub trimetoprimu‑sulfametoksazolu.');
        // Nitrofuran wątroby (nitrofurantoina), moksifloksacyna i fosfomycyna doustna nie są zalecane, ponieważ nie osiągają odpowiednich stężeń w tkance nerkowej.
        messages.push('Nitrofurantoina, moksifloksacyna i fosfomycyna doustna nie są zalecane w leczeniu odmiedniczkowego zapalenia nerek, ponieważ nie osiągają odpowiednich stężeń w tkance nerkowej.');

        // Źródła dla dorosłych
        sourcesUsed.push(
          'https://www.hopkinsguides.com/hopkins/view/Johns_Hopkins_ABX_Guide/540458/all/Pyelonephritis__Acute__Uncomplicated',
          'https://pmc.ncbi.nlm.nih.gov/articles/PMC5895837/',
          'https://www.aafp.org/pubs/afp/issues/2020/0801/p173.html'
        );
      } else {
        // Komunikaty dla dzieci (uti_pyelonephritis)
        // Dopasuj komunikaty do wieku: małe dzieci (<5 lat) i niemowlęta ≤3 miesięcy wymagają szczególnej uwagi
        const childAge = getAge();
        const childMonths = getChildAgeMonths();
        if (childAge != null && !isNaN(childAge) && childAge < 5) {
          messages.push('Uwaga: u dzieci <5 lat z gorączką powyżej 38 °C bez innego źródła infekcji należy brać pod uwagę zakażenie układu moczowego – przed podaniem antybiotyku pobierz próbkę moczu na badanie ogólne i posiew.');
        }
        if (childMonths != null && !isNaN(childMonths) && childMonths <= 3) {
          messages.push('Uwaga: niemowlęta ≤3 miesiące oraz pacjenci z odwodnieniem, nawracającymi wymiotami, niemożnością przyjmowania leków doustnie, niedoborami odporności lub ciężkim stanem klinicznym wymagają hospitalizacji i dożylnej antybiotykoterapii; po co najmniej 48–72 godzinach i ustąpieniu gorączki można kontynuować leczenie doustne.');
        }
        // Ostrzeżenie dotyczące leków o niewystarczającym stężeniu w tkance nerkowej
        messages.push('Uwaga: nitrofurantoina i trimetoprim‑sulfametoksazol nie osiągają odpowiednich stężeń w tkance nerkowej lub wykazują niską skuteczność – nie stosuj ich w leczeniu odmiedniczkowego zapalenia nerek.');
        // Ostrzeżenie dotyczące Enterococcus
        messages.push('Uwaga: w zakażeniach wywołanych przez Enterococcus nie stosuj cefalosporyn ani trimetoprim‑sulfametoksazolu; preferowane są penicyliny (amoksycylina, amoksycylina z kwasem klawulanowym, ampicylina/sulbaktam) oraz aminoglikozydy lub piperacylina z tazobaktamem.');
        // Informacje dla dzieci
        messages.push('Nie pobieraj próbek moczu do woreczków – metoda ta cechuje się wysokim odsetkiem fałszywie dodatnich wyników; do posiewu używaj cewnikowania, środkowego strumienia (u starszych dzieci) albo aspiracji nadłonowej.');
        messages.push('Cefalosporyny III generacji podawane doustnie (cefixim, ceftibuten) lub cefuroksym są pierwszym wyborem w nieciężkim odmiedniczkowym zapaleniu nerek; w cięższych przypadkach stosuje się dożylne cefalosporyny, aminoglikozydy, fluorochinolony lub karbapenemy.');
        messages.push('U noworodków i niemowląt ≤3 miesięcy oraz u pacjentów z ciężkim przebiegiem zaleca się cefalosporynę III generacji lub ampicylinę z aminoglikozydem jako terapię początkową.');
        messages.push('Antybiotykoterapię należy dostosować do wyników posiewu – po 48–72 godzinach leczenia dożylnego i ustąpieniu gorączki można przejść na leczenie doustne i kontynuować terapię przez 7–14 dni.');
        messages.push('Amoksycylina z kwasem klawulanowym powinna być stosowana tylko wtedy, gdy posiew potwierdzi wrażliwość; wysoka dawka (90 mg/kg mc. amoksycyliny i 6,4 mg/kg mc. kwasu klawulanowego na dobę) wymaga stosowania specjalnych preparatów ES lub łączenia z dodatkową amoksycyliną.');
        messages.push('Obecność bakterii takich jak Lactobacillus, Corynebacterium czy Staphylococcus epidermidis w posiewie moczu zwykle nie wskazuje na zakażenie – najczęściej są to drobnoustroje flory naturalnej lub zanieczyszczenia; decyzję o leczeniu opieraj na objawach klinicznych i dodatkowych badaniach.');

        // Źródła dla dzieci
        sourcesUsed.push(
          'https://pmc.ncbi.nlm.nih.gov/articles/PMC2941245/',
          'https://pmc.ncbi.nlm.nih.gov/articles/PMC4880363/',
          'https://www.ncbi.nlm.nih.gov/books/NBK599548/',
          'https://pmc.ncbi.nlm.nih.gov/articles/PMC2094977/',
          'https://pmc.ncbi.nlm.nih.gov/articles/PMC10135011/',
          'https://www.ncbi.nlm.nih.gov/books/NBK519537/',
          'https://pubmed.ncbi.nlm.nih.gov/18987176/'
        );
      }
    }

    // Komunikaty ostrzegawcze i informacyjne dla boreliozy (wskazanie "lyme").
    // Leczenie choroby z Lyme powinno być dostosowane do stadium i objawów; większość pacjentów
    // wymaga 10–14 dni antybiotykoterapii doustnej. Leczenie profilaktyczne po ugryzieniu
    // kleszcza jest wskazane tylko w szczególnych sytuacjach.
    if (indicKey === 'lyme') {
      // Ostrzeżenia dotyczące profilaktyki po ukąszeniu kleszcza
      messages.push('Uwaga: profilaktyczne podanie antybiotyku po ukąszeniu kleszcza jest zalecane wyłącznie, gdy: kleszcz był przyczepiony co najmniej 36 godzin, jego usunięcie nastąpiło w ciągu 72 godzin oraz ukąszenie miało miejsce na terenie o wysokiej częstości zakażeń. W innych przypadkach wystarczy obserwacja bez antybiotyków.');
      messages.push('Uwaga: do profilaktyki boreliozy stosuje się jednorazową dawkę doksycykliny (200 mg u dorosłych; 4,4 mg/kg u dzieci, maks. 200 mg). Inne antybiotyki (np. amoksycylina) nie są rekomendowane w profilaktyce.');
      // Ostrzeżenia dotyczące doboru leków i czasu terapii
      messages.push('Uwaga: makrolidy, takie jak azytromycyna, mają niższą skuteczność w leczeniu boreliozy i powinny być stosowane tylko, gdy nie można podać leków pierwszego wyboru. Monitoruj pacjenta, aby upewnić się, że objawy ustępują.');
      messages.push('Uwaga: nie przedłużaj terapii antybiotykowej poza zalecany okres 10–14 dni (lub 14–21 dni w neuroboreliozie/karditisie), ponieważ długie kuracje nie poprawiają wyników leczenia i mogą prowadzić do działań niepożądanych.');
      // Informacje edukacyjne
      messages.push('Pierwszym wyborem w leczeniu wczesnej boreliozy są doksycyklina, amoksycylina lub aksetyl cefuroksymu w odpowiednich dawkach przez 10–14 dni. Leczenie doustne jest zwykle wystarczające i preferowane ze względu na dobrą skuteczność i tolerancję.');
      messages.push('Azitromycyna w schemacie siedmiodniowym jest alternatywą dla pacjentów, którzy nie mogą przyjmować β‑laktamów lub doksycykliny; leczenie należy kontynuować 7 dni, a pacjent powinien być pod obserwacją z uwagi na mniejszą skuteczność makrolidów.');
      messages.push('W ciężkich postaciach (np. neuroborelioza, zapalenie mięśnia sercowego) zalecane są antybiotyki dożylne, przede wszystkim ceftriakson lub cefotaksym przez 14–21 dni; po poprawie klinicznej można przejść na leczenie doustne.');
      messages.push('Przebyta infekcja Borrelia nie daje trwałej odporności; reinfekcja jest możliwa po ponownym ukąszeniu kleszcza, dlatego po leczeniu ważne jest stosowanie środków zapobiegających kolejnym ugryzieniom.');
      // Źródła: odwołujemy się do stron CDC i opracowania UIC zawierających szczegółowe zalecenia dotyczące leczenia i profilaktyki boreliozy
      sourcesUsed.push(
        'https://www.cdc.gov/lyme/hcp/clinical-care/erythema-migrans-rash.html', // Tabela dawek dla doxycykliny, amoksycyliny, cefuroksymu oraz informacja o mniejszej skuteczności azytromycyny.
        'https://dig.pharmacy.uic.edu/faqs/2025-2/july-2025-faqs/what-are-the-most-up-to-date-guideline-recommendations-for-the-treatment-of-lyme-disease/', // Wytyczne IDSA/AAN/ACR dotyczące profilaktyki i leczenia boreliozy, w tym kryteria profilaktyki i dawki doksycykliny.
        'https://pubmed.ncbi.nlm.nih.gov/14770076/' // Przykładowe badanie wskazujące na skuteczność krótkiego kursu antybiotyków w wczesnej boreliozie (referencja w tabeli CDC)
      );
    }

    // Informacja o schematach azytromycyny w zależności od wskazania
    if (drugName === 'Azytromycyna' || drugName === 'Azytromycyna (3 dni)') {
      if (indicKey === 'pharyngitis') {
        // W paciorkowcowym zapaleniu gardła azytromycyna powinna być stosowana wyłącznie
        // w pięciodniowym schemacie: 10 mg/kg mc. w 1. dniu i 5 mg/kg mc./dobę w
        // dniach 2–5. U dorosłych typowy schemat to 500 mg w pierwszym dniu,
        // następnie 250 mg raz na dobę przez cztery kolejne dni. Schemat
        // trzydniowy nie jest rekomendowany w tym wskazaniu.
        messages.push('Azytromycyna w paciorkowcowym zapaleniu gardła: rekomendowany jest wyłącznie schemat 5‑dniowy – 10 mg/kg mc. w 1. dniu, a następnie 5 mg/kg mc./dobę w dniach 2–5 (u dorosłych 500 mg w 1. dniu, potem 250 mg/dobę).');
        // Dodaj odpowiednie źródła podające dawkowanie 12 mg/kg/dobę w 5‑dniowym
        // schemacie i wskazujące brak rekomendacji dla wariantu 3‑dniowego.
        sourcesUsed.push('', '');
      } else if (indicKey === 'otitis' || indicKey === 'sinusitis') {
        // W OZUŚ i ostrym zapaleniu zatok możliwe są dwa schematy: skrócony 3‑dniowy lub 5‑dniowy (10 mg/kg w 1. dniu, następnie 5 mg/kg)
        messages.push('Azytromycyna może być stosowana według dwóch schematów: (1) 10 mg/kg mc. na dobę przez 3 dni (schemat skrócony), (2) 10 mg/kg mc. w 1. dniu i 5 mg/kg mc. w dniach 2–5 (schemat 5‑dniowy).');
      }
    }

    // Informacja o schematach klarytromycyny w paciorkowcowym zapaleniu gardła
    if (drugName === 'Klarytromycyna' && indicKey === 'pharyngitis') {
      // Klarytromycyna – u dzieci dawka 15 mg/kg mc./dobę w dwóch dawkach co 12 h (maks. 250 mg na pojedynczą dawkę).
      // U dorosłych dostępne są preparaty podawane 250–500 mg co 12 h lub 500 mg do 1 g raz dziennie (tabletki o przedłużonym uwalnianiu).  
      messages.push('Klarytromycyna w paciorkowcowym zapaleniu gardła: dzieci powinny otrzymywać 15 mg/kg mc./dobę podzielone na dwie dawki co 12 h (maks. 250 mg na dawkę), natomiast dorośli – 250–500 mg co 12 h lub 500 mg do 1 g raz dziennie w preparacie o przedłużonym uwalnianiu.');
      // Dodaj źródło wytycznych CDC, które podają dawkowanie klarytromycyny 7,5 mg/kg na dawkę co 12 h u dzieci (co odpowiada 15 mg/kg mc./dobę) oraz 250–500 mg co 12 h u dorosłych.
      sourcesUsed.push('');
    }

    // W ostrym zapaleniu zatok przynosowych makrolidy są rzadko zalecane. Nowsze wytyczne i przeglądy podkreślają,
    // że makrolidy (klarytromycyna, azytromycyna) oraz trimetoprim‑sulfametoksazol nie powinny być stosowane
    // jako leczenie empiryczne z powodu wysokiej oporności Streptococcus pneumoniae. Zalecana terapia
    // pierwszego rzutu to amoksycylina lub amoksycylina z kwasem klawulanowym, a wysokodawkowy koamoksyklaw
    // (90 mg/kg mc./dobę lub 2 g dwa razy na dobę u dorosłych) jest wskazany u pacjentów z ryzykiem oporności
    //. Makrolidy i kotrimoksazol stosuje się wyłącznie w przypadku udokumentowanej
    // wrażliwości drobnoustrojów lub alergii na beta‑laktamy.
    if (indicKey === 'sinusitis' && (drugName === 'Klarytromycyna' || drugName === 'Azytromycyna')) {
      // Wysokie wskaźniki oporności Streptococcus pneumoniae na makrolidy i trimetoprim‑sulfametoksazol są
      // powodem, dla którego nie zaleca się ich empirycznego stosowania w ostrym zapaleniu zatok przynosowych.
      // Zamiast surowego identyfikatora cytowania w treści komunikatu, zachowujemy tę informację jako komentarz.
      messages.push('Uwaga: makrolidy (klarytromycyna, azytromycyna) oraz trimetoprim‑sulfametoksazol nie są zalecane do empirycznego leczenia ostrego zapalenia zatok przynosowych z powodu wysokich wskaźników oporności Streptococcus pneumoniae. Zastosuj je tylko w razie alergii na beta‑laktamy lub udokumentowanej wrażliwości patogenu.');
    }

    // W paciorkowcowym zapaleniu gardła makrolidy (klarytromycyna, azytromycyna) oraz klindamycyna
    // powinny być stosowane tylko w przypadku alergii na beta‑laktamy lub udokumentowanej wrażliwości drobnoustroju.
    // Obserwuje się rosnącą oporność Streptococcus pyogenes na te antybiotyki.
    if (indicKey === 'pharyngitis' && (drugName === 'Klarytromycyna' || drugName === 'Azytromycyna' || drugName === 'Klindamycyna')) {
      // Uwaga o ograniczeniu stosowania makrolidów i klindamycyny w paciorkowcowym zapaleniu gardła wynika z danych o
      // rosnącej oporności Streptococcus pyogenes. Aby nie wyświetlać surowych identyfikatorów cytowań w interfejsie
      // użytkownika, usuwamy je z treści komunikatu, pozostawiając powyższą informację w komentarzu.
      messages.push('Uwaga: w leczeniu paciorkowcowego zapalenia gardła makrolidy (klarytromycyna, azytromycyna) oraz klindamycyna należy stosować wyłącznie w razie alergii na beta‑laktamy lub udokumentowanej wrażliwości patogenu, ponieważ notuje się rosnącą oporność Streptococcus pyogenes na te leki.');
      // Dodaj źródło wskazujące na brak oporności paciorkowców na penicyliny oraz rosnącą oporność na makrolidy i klindamycynę.
      sourcesUsed.push('');
    }

    // W ostrym zapaleniu ucha środkowego makrolidy (klarytromycyna, azytromycyna) powinny być
    // stosowane jedynie w przypadku alergii na beta‑laktamy lub udokumentowanej wrażliwości
    // patogenu. Zalecenia podkreślają, że pierwszym wyborem jest wysokodawkowa amoksycylina
    // (80–90 mg/kg mc./dobę), a w razie braku poprawy – amoksycylina z kwasem klawulanowym
    // zgodnie z wytycznymi farmaceutycznymi. Makrolidy stanowią opcję rezerwową.
    if (indicKey === 'otitis' && (drugName === 'Klarytromycyna' || drugName === 'Azytromycyna')) {
      // Komunikat ostrzegający, że makrolidy są leczeniem rezerwowym w ostrym zapaleniu ucha środkowego.
      messages.push('Uwaga: w ostrym zapaleniu ucha środkowego pierwszym wyborem jest amoksycylina w dawce 75–90 mg/kg mc./dobę; makrolidy (klarytromycyna, azytromycyna) stosuje się wyłącznie w razie alergii na beta‑laktamy lub udokumentowanej wrażliwości patogenu.');
      // Źródło potwierdzające wysokodawkową amoksycylinę jako leczenie pierwszego rzutu i rezerwową rolę makrolidów
      sourcesUsed.push('');
    }

    // Dostosowanie długości terapii w ostrym zapaleniu ucha środkowego w zależności od wieku
    if (indicKey === 'otitis') {
      const ageYears = getAge();
      if (ageYears != null && !isNaN(ageYears)) {
        // Jeżeli wybrano azytromycynę (dowolny wariant), nie nadpisuj czasu trwania terapii.
        const normNameOt = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
        if (!normNameOt.startsWith('Azytromycyna')) {
          let recommendedDuration = duration;
          if (ageYears < 2) {
            recommendedDuration = 10;
          } else if (ageYears < 6) {
            recommendedDuration = 7;
          } else {
            recommendedDuration = 5;
          }
          if (recommendedDuration !== duration) {
            duration = recommendedDuration;
            const durInputElem = document.getElementById('abxDuration');
            if (durInputElem) {
              durInputElem.value = recommendedDuration;
            }
          }
        }
        // Dodaj komunikat informacyjny o sugerowanej długości leczenia dla innych antybiotyków (nie dotyczy azytromycyny).
        messages.push('W ostrym zapaleniu ucha środkowego sugerowana długość leczenia zależy od wieku: <2 lat – 10 dni, 2–5 lat – 7 dni, ≥6 lat – 5 dni.');
      }

      // Komunikaty uzupełniające zgodne z polskimi wytycznymi dla OZUŚ. Są one dodawane niezależnie od tego,
      // czy użytkownik podał wiek. W łagodnym przebiegu (gorączka <39 °C, umiarkowany ból, jednostronne
      // zapalenie ucha u dzieci powyżej 6 miesięcy) początkowo zaleca się odroczenie antybiotykoterapii na 2–3 dni
      // i leczenie objawowe (przeciwbólowe/przeciwzapalne). Antybiotyki włączamy dopiero przy braku poprawy.
      messages.push('W łagodnym ostrym zapaleniu ucha środkowego (gorączka <39 °C, umiarkowany ból, jednostronne zajęcie ucha u dzieci >6 mies.) zaleca się 2–3‑dniową obserwację z leczeniem objawowym; antybiotyk należy włączyć dopiero przy braku poprawy.');
      // Dodaj odpowiednie źródło dla „watchful waiting” (czujnej obserwacji) w łagodnym przebiegu OZUŚ
      sourcesUsed.push('');

      // Natychmiastowe rozpoczęcie antybiotykoterapii jest wskazane u niemowląt <6 miesięcy oraz u starszych pacjentów z
      // ciężkim przebiegiem – wysoką gorączką, wymiotami, biegunką, obustronnym zapaleniem uszu, silnym bólem lub ropnym
      // wyciekiem – a także gdy nie ma możliwości prowadzenia obserwacji lub gdy leczenie objawowe nie przynosi poprawy.
      messages.push('Natychmiastowa antybiotykoterapia jest zalecana u niemowląt <6 mies. oraz w ciężkim przebiegu z wysoką gorączką, wymiotami, biegunką, obustronnym zajęciem uszu, silnym bólem lub ropnym wyciekiem, a także gdy nie można zapewnić obserwacji lub objawy utrzymują się mimo leczenia objawowego.');
      // Źródło dla wskazań do natychmiastowego włączenia antybiotykoterapii
      sourcesUsed.push('');

      // Amoksycyliny nie należy stosować, jeżeli pacjent otrzymywał ją w ostatnim miesiącu, występuje ropne zapalenie spojówek,
      // nawracające epizody lub podejrzenie szczepów wytwarzających β‑laktamazę. W takich sytuacjach należy rozważyć
      // amoksycylinę z kwasem klawulanowym lub inny lek drugiego rzutu.
      messages.push('Jeżeli pacjent przyjmował amoksycylinę w ostatnim miesiącu, ma towarzyszące ropne zapalenie spojówek, nawracające zakażenie lub podejrzenie szczepu wytwarzającego β‑laktamazę, nie stosuj ponownie samej amoksycyliny – w takich przypadkach należy rozważyć połączenie z kwasem klawulanowym lub leki drugiego rzutu.');
      // Źródło dla ograniczeń ponownego stosowania amoksycyliny
      sourcesUsed.push('');

    } // koniec bloku if (indicKey === 'otitis')

    // Dodatkowe komunikaty dla ostrego zapalenia błony śluzowej nosa i zatok przynosowych (sinusitis)
    if (indicKey === 'sinusitis') {
      // Zalecany czas terapii różni się u dzieci i dorosłych. Dorośli zwykle wymagają 7–10 dni leczenia,
      // podczas gdy u dzieci terapia trwa 10–14 dni. W kalkulatorze automatycznie ustawiamy 7 dni
      // dla pacjentów ≥18 lat i 10 dni dla młodszych, ale informujemy użytkownika o zalecanym zakresie.
      const ageYearsSin = getAge();
      const normNameSin = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
      if (ageYearsSin != null && !isNaN(ageYearsSin)) {
        // Dla azytromycyny nie nadpisuj czasu trwania terapii – pozostaw 3 lub 5 dni w zależności od schematu.
        if (!normNameSin.startsWith('Azytromycyna')) {
          let recDur = duration;
          if (ageYearsSin >= 18) {
            recDur = 7;
          } else {
            recDur = 10;
          }
          if (recDur !== duration) {
            duration = recDur;
            const durElem = document.getElementById('abxDuration');
            if (durElem) {
              durElem.value = recDur;
            }
          }
        }
        // Przekazuj zalecenia dotyczące czasu terapii jako wskazówkę dla lekarza, nie dla pacjenta.
        messages.push('Zalecana długość terapii: u dorosłych zwykle 7–10 dni, u dzieci 10–14 dni (dostosuj w zależności od przebiegu klinicznego).');
      }
      // Czujne wyczekiwanie i leczenie objawowe – zalecenia dla lekarza (nie dla pacjenta).
      messages.push('W łagodnych przypadkach rozważ czujne wyczekiwanie i leczenie objawowe przez 7–10 dni; obserwacje wskazują, że do 80 % dzieci zdrowieje bez antybiotyków.');
      sourcesUsed.push('');
      // Informacja o preferowaniu amoksycyliny i unikaniu ko‑amoksyklawu na wstępie
      if (drugName === 'Amoksycylina z kwasem klawulanowym') {
        messages.push('Ko‑amoksyklaw rezerwuj dla pacjentów z ryzykiem oporności (np. otrzymujących wcześniej antybiotyki) lub przy braku poprawy po ok. 72 h leczenia amoksycyliną; u większości dzieci pierwszym wyborem jest sama amoksycylina.');
        sourcesUsed.push('', '');
      }
      // Informacja o ograniczonym znaczeniu cefuroksymu
      if (drugName === 'Aksetyl cefuroksymu') {
        messages.push('Doustdne cefalosporyny (np. cefuroksym) są mniej skuteczne przeciwko Streptococcus pneumoniae niż wysokodawkowa amoksycylina; rozważ je tylko u pacjentów z potwierdzoną alergią na penicyliny.');
        sourcesUsed.push('');
      }
      // Informacja o ograniczonej aktywności makrolidów
      if (drugName === 'Klarytromycyna' || drugName === 'Azytromycyna') {
        messages.push('Makrolidy (azytromycyna, klarytromycyna) mają słabą aktywność wobec Streptococcus pneumoniae i Haemophilus influenzae; stosuj je wyłącznie u pacjentów z alergią na β‑laktamy lub potwierdzoną wrażliwością drobnoustroju.');
        sourcesUsed.push('');
      }
      // Informacja o braku poprawy po 72 h – komunikat dla lekarza
      messages.push('Jeżeli pacjent nie wykazuje poprawy w ciągu ~72 godzin obserwacji lub po rozpoczęciu antybiotykoterapii, należy rozważyć zmianę leczenia i ponowną ocenę stanu klinicznego.');
      sourcesUsed.push('');
      // Informacja o leczeniu wspomagającym – formułowana jako zalecenie dla lekarza
      messages.push('Wspieraj terapię poprzez płukanie nosa solą fizjologiczną i stosowanie donosowych glikokortykosteroidów w celu zmniejszenia przekrwienia i obrzęku; unikaj przepisywania doustnych lub miejscowych środków obkurczających błonę śluzową nosa ze względu na brak dowodów na ich skuteczność i ryzyko działań niepożądanych.');
      sourcesUsed.push('');

      // Dodaj ogólny link do rekomendacji antybiotykoterapii dla zapalenia zatok; link ten będzie
      // dołączany do listy Źródeł niezależnie od wybranego antybiotyku w tym wskazaniu. 
      sourcesUsed.push('https://antybiotyki.edu.pl/rekomendacje/rekomendacje-diagnostyki-i-terapii-zakazen/');
    }

    // Ostrzeżenie dotyczące stosowania makrolidów u najmłodszych dzieci – infekcje atypowe są rzadkie
    const ageYearsForWarn = getAge();
    if (ageYearsForWarn != null && !isNaN(ageYearsForWarn)) {
      if (ageYearsForWarn < 5 && (drugName === 'Azytromycyna' || drugName === 'Klarytromycyna')) {
        messages.push('U dzieci poniżej 5 lat infekcje atypowe (Mycoplasma, Chlamydophila) są rzadkie – makrolidy należy stosować tylko przy uzasadnionym podejrzeniu patogenu atypowego.');
      }

    } // zamknięcie bloku if (ageYearsForWarn != null && !isNaN(ageYearsForWarn))

    // Ostrzeżenia dla powikłanych zakażeń układu moczowego i odmiedniczkowego zapalenia nerek:
    // Furazydyna (nitrofurantoina) i fosfomycyna nie osiągają terapeutycznych stężeń w miąższu nerek,
    // dlatego nie należy ich stosować w tych wskazaniach.
    if ((indicKey === 'uti_other' || indicKey === 'uti_pyelonephritis') && drugName === 'Furazydyna') {
      messages.push('Uwaga: furazydyna (nitrofurantoina) nie osiąga odpowiednich stężeń w tkance nerkowej – nie stosować jej w powikłanych zakażeniach układu moczowego ani odmiedniczkowym zapaleniu nerek.');
    }
    if ((indicKey === 'uti_other' || indicKey === 'uti_pyelonephritis') && drugName === 'Fosfomycyna') {
      messages.push('Uwaga: fosfomycyna nie jest skuteczna w powikłanych zakażeniach układu moczowego ani odmiedniczkowym zapaleniu nerek, gdyż nie osiąga wystarczających stężeń w miąższu nerek.');
    }
    // Ostrzeżenie dla doripenem – brak danych pediatrycznych; stosować wyłącznie u dorosłych.
    if ((indicKey === 'uti_other' || indicKey === 'uti_pyelonephritis') && drugName === 'Doripenem') {
      messages.push('Uwaga: doripenem nie jest zarejestrowany do stosowania u dzieci; standardowa dawka u dorosłych wynosi 500 mg co 8 h (1,5 g/dobę) lub 1 g co 8 h (3 g/dobę).');
    }

    // Ostrzeżenie dla dzieci z powikłanymi zakażeniami układu moczowego:
    // u pacjentów <18 lat wybierających wskazanie „Powikłane i inne zakażenia układu moczowego”
    // zalecana jest hospitalizacja i dożylne leczenie. Dodajemy ten komunikat bez względu na wybrany
    // antybiotyk, aby lekarz był świadomy, że długotrwała terapia parenteralna jest konieczna.
    if (indicKey === 'uti_other' && ageYearsForWarn != null && !isNaN(ageYearsForWarn) && ageYearsForWarn < 18) {
      messages.push('Uwaga: u dzieci z powikłanymi zakażeniami układu moczowego zalecana jest hospitalizacja i dożylna antybiotykoterapia.');
    }
    // Specjalne ostrzeżenia dla zakażeń po ugryzieniach (ssti_bite). Antybiotyki stosuje się profilaktycznie
    // tylko u pacjentów z ranami wysokiego ryzyka (głębokie, zakrwawione, zlokalizowane na twarzy lub dłoni, u osób
    // z upośledzoną odpornością). Standardowa profilaktyka trwa 3–5 dni, a leczenie klinicznego zakażenia 5–7 dni.
    // Pierwszym wyborem jest amoksycylina z kwasem klawulanowym 22,5 mg/kg mc. co 12 h (≈ 45 mg/kg mc./dobę).
    // W razie alergii na penicyliny stosuje się kombinację trimetoprim‑sulfametoksazol (4–6 mg/kg mc. trimetoprimu co 12 h)
    // z klindamycyną (10 mg/kg mc. co 8 h) lub cyprofloksacyną 20–30 mg/kg mc./dobę.
    // Nie ma potrzeby rutynowego podawania antybiotyków po drobnych, dobrze oczyszczonych ugryzieniach.
    if (indicKey === 'ssti_bite') {
      // Ta informacja o profilaktyce i leczeniu zakażeń po ugryzieniach ma charakter edukacyjny,
      // dlatego usuwamy prefiks "Uwaga" – będzie ona wyświetlana w sekcji "Dodatkowe informacje",
      // a nie jako ostrzeżenie.
      messages.push('Antybiotykoterapia po ugryzieniach jest wskazana przede wszystkim u pacjentów z ranami wysokiego ryzyka (głębokie, zlokalizowane na twarzy lub dłoni, u osób z upośledzoną odpornością). Profilaktyka trwa 3–5 dni; aktywne zakażenie leczymy 5–7 dni. Pierwszym wyborem jest amoksycylina z kwasem klawulanowym 22,5 mg/kg mc. co 12 h (≈ 45 mg/kg mc./dobę). U pacjentów z alergią na penicyliny stosuje się trimetoprim‑sulfametoksazol 4–6 mg/kg mc. co 12 h w skojarzeniu z klindamycyną 10 mg/kg mc. co 8 h lub cyprofloksacyną 20–30 mg/kg mc./dobę.');
    }
    // Specjalne ostrzeżenie dla zakażonych ran (ssti_wound). Leczenie empiryczne obejmuje przede wszystkim cefaleksynę lub amoksycylinę z kwasem klawulanowym w dawce około 22,5 mg/kg mc. co 12 h (≈ 45 mg/kg mc./dobę). Standardowa terapia trwa 5 dni; można ją wydłużyć do 7–10 dni przy wolnej poprawie. Clindamycyna oraz trimetoprim‑sulfametoksazol stosuje się jedynie przy podejrzeniu MRSA lub alergii na β‑laktamy ze względu na rosnącą oporność gronkowców.
    if (indicKey === 'ssti_wound') {
      // Komunikat dotyczący leczenia zakażonych ran przenosimy do sekcji informacyjnej, dlatego
      // usuwamy prefiks "Uwaga".
      messages.push('W zakażonych ranach leczenie empiryczne obejmuje przede wszystkim cefaleksynę lub amoksycylinę z kwasem klawulanowym w dawce około 22,5 mg/kg mc. co 12 h (≈ 45 mg/kg mc./dobę). Standardowa terapia trwa 5 dni; można ją wydłużyć do 7–10 dni przy wolnej poprawie. Clindamycyna oraz trimetoprim‑sulfametoksazol stosuje się jedynie przy podejrzeniu MRSA lub alergii na β‑laktamy ze względu na rosnącą oporność gronkowców.');
    }

    // Specjalne ostrzeżenie dla cellulitis/erysipelas (ssti_cellulitis). Terapia trwa zwykle 5 dni i
    // polega na stosowaniu wąskospektralnych β‑laktamów – pierwszym wyborem jest cefaleksyna
    // 17 mg/kg mc./dawkę co 8 h (≈50 mg/kg mc./dobę) lub amoksycylina z kwasem klawulanowym
    // 22,5 mg/kg mc. co 12 h (≈45 mg/kg mc./dobę). W razie łagodnego przebiegu
    // można zastosować penicylinę V 20 mg/kg mc. co 8 h. Clindamycyna czy
    // trimetoprim‑sulfametoksazol są zarezerwowane dla pacjentów z dużym ryzykiem MRSA lub
    // uczulonych na β‑laktamy, gdyż charakteryzują się niższą skutecznością wobec paciorkowców. Standardową długość terapii
    // (5 dni) wydłuża się do 7–10 dni tylko przy wolnej poprawie.
    if (indicKey === 'ssti_cellulitis') {
      // Komunikat dotyczący leczenia zapalenia tkanki łącznej i róży nie jest ostrzeżeniem, lecz informacją –
      // usuwamy więc prefiks "Uwaga", aby został sklasyfikowany jako informacyjny.
      messages.push('W leczeniu zapalenia tkanki łącznej i róży zaleca się 5‑dniową kurację wąskospektralnymi β‑laktamami – przede wszystkim cefaleksyną 17 mg/kg mc./dawkę co 8 h (≈50 mg/kg mc./dobę) lub amoksycyliną z kwasem klawulanowym 22,5 mg/kg mc. co 12 h (≈45 mg/kg mc./dobę). Penicylina V (20 mg/kg mc. co 8 h) może być stosowana w łagodnym przebiegu. Stosowanie klindamycyny albo trimetoprim‑sulfametoksazolu rezerwujemy dla pacjentów z potwierdzonym ryzykiem MRSA lub alergią na β‑laktamy, ponieważ mają słabszą aktywność wobec paciorkowców. Wydłużenie terapii ponad 5 dni powinno nastąpić jedynie przy wolnej poprawie klinicznej.');
    }

    // Globalne ograniczenie dawki dobowej.
    // Najpierw pobierz globalny limit dla danego antybiotyku (zależny od masy – granica 40 kg definiuje „dziecko”).
    // Ujednolicamy nazwę leku, aby wyszukiwanie kluczy było odporne na rodzaj spacji (normalna vs. niełamiąca).
    const normalizedDrugName = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
    // Pobierz globalne informacje o maksymalnej dawce dobowej z tablicy GLOBAL_MAX_DAILY_DOSES.
    // Najpierw próbujemy z nazwą znormalizowaną (zwykłe spacje), a gdy brak – z oryginalną nazwą.
    const globalMaxInfo = GLOBAL_MAX_DAILY_DOSES && (GLOBAL_MAX_DAILY_DOSES[normalizedDrugName] || GLOBAL_MAX_DAILY_DOSES[drugName]);
    let globalMax = null;
    if (globalMaxInfo) {
      // Określ grupę wiekową: w naszym podejściu dawkowanie dziecięce stosujemy wyłącznie
      // u pacjentów o masie ciała <40 kg. Starsze dzieci i młodzież z masą ≥40 kg
      // traktujemy jak dorosłych, niezależnie od wieku. Jeżeli wiek niepodany (null),
      // decyzja opiera się wyłącznie na masie.
      const ageYears = getAge();
      const isChild = weight < 40;
      globalMax = isChild ? globalMaxInfo.child : globalMaxInfo.adult;
      // Dla ostrego zapalenia błony śluzowej nosa i zatok przynosowych (sinusitis)
      // dopuszcza się wyższą całkowitą dawkę dobową ko‑amoksyklawu (4 000 mg) niż
      // globalny limit. Zgodnie z zaleceniami, w tym wskazaniu możliwe jest
      // stosowanie maksymalnie 4 g amoksycyliny z kwasem klawulanowym na dobę u
      // pacjentów zarówno <40 kg, jak i ≥40 kg. Aby nie ograniczać dawki
      // standardowym limitem 3 000 mg, wprowadzamy wyjątek w logice doboru
      // globalMax: jeśli wybranym wskazaniem jest „sinusitis” i aktualnie
      // rozważany lek to amoksycylina z kwasem klawulanowym, ustaw globalny limit
      // na 4 000 mg.
      if (indicKey === 'sinusitis') {
        const normalizedName = normalizedDrugName.toLowerCase();
        if (normalizedName === 'amoksycylina z kwasem klawulanowym') {
          globalMax = 4000;
        }
      }
    }
    // Wyznacz ostateczny limit: mniejszy z limitu z definicji leku (maxDailyMg) i globalnego limitu, jeśli oba istnieją.
    let effectiveMax = null;
    if(drugDef.maxDailyMg != null && globalMax != null){
      effectiveMax = Math.min(drugDef.maxDailyMg, globalMax);
    } else if(drugDef.maxDailyMg != null){
      effectiveMax = drugDef.maxDailyMg;
    } else if(globalMax != null){
      effectiveMax = globalMax;
    }
    // Jeżeli wyliczona dawka przekracza dozwolony limit, zredukuj ją w trybie standardowym
    // i poinformuj użytkownika.  W trybie własnego ustalania dawki (customDoseActive)
    // nie modyfikujemy mgPerDay, lecz generujemy ostrzeżenie.  Dzięki temu suwak i
    // pole wprowadzania mogą wykraczać poza zalecenia, ale użytkownik widzi
    // odpowiedni komunikat.
    if (effectiveMax != null && mgPerDay > effectiveMax) {
      if (!customDoseActive) {
        // W trybie domyślnym (rekomendowanym) przycinamy dawkę do maksymalnej wartości
        mgPerDay = effectiveMax;
        const clampedMgKg = mgPerDay / weight;
        // Aktualizuj suwak i pole liczbowego, aby odzwierciedlić ograniczenie
        const doseInputEl = document.getElementById('abxDoseInput');
        const sliderEl = document.getElementById('abxDoseSlider');
        if (doseInputEl) {
          doseInputEl.value = fmt(clampedMgKg).replace(',', '.');
        }
        if (sliderEl) {
          sliderEl.value = clampedMgKg;
        }
        // Zbuduj komunikat o ograniczeniu.  Dla leków z zakresem dawek (mgRange[min]!=mgRange[max])
        // dodaj dodatkowe wyjaśnienie, dlaczego w polu „Rekomendowana dawka” pojawia się niższa wartość.
        let msg = `Zastosowano ograniczenie do maksymalnej dawki ${effectiveMax}\u00A0mg/dobę dla tego antybiotyku.`;
        const mgRange = drugDef && Array.isArray(drugDef.mgRange) ? drugDef.mgRange : null;
        const isRangeDrug = mgRange && mgRange.length >= 2 && mgRange[0] !== mgRange[1];
        if (isRangeDrug) {
          // Wyjaśnij, że obniżona wartość mg/kg wynika z ograniczenia dobowego
          msg += ` Ze względu na limit ${effectiveMax}\u00A0mg/dobę przeliczona rekomendowana dawka wynosi ${fmt(clampedMgKg)}\u00A0mg/kg/dobę.`;
        }
        messages.push(msg);
        // Przygotuj ograniczenia suwaka dla leków z zakresem dawek.  Ustaw flagi dataset na
        // ograniczenie maksymalnej wartości, aby uniemożliwić wybór dawek powyżej limitu
        // dobowego, lub całkowicie dezaktywuj suwak, gdy minimalna dawka zakresu również
        // przekracza limit dobowy.
        if (sliderEl && isRangeDrug && typeof weight === 'number' && isFinite(weight)) {
          /*
           * Dotychczasowa logika korzystała z wartości mgRange z definicji leku, co w niektórych
           * przypadkach prowadziło do niepoprawnego zablokowania suwaka po osiągnięciu
           * maksymalnej dawki dobowej.  Wskazania takie jak paciorkowcowe zapalenie gardła
           * dynamicznie aktualizują minimalną i maksymalną wartość suwaka w funkcji masy ciała,
           * dlatego musimy obliczać minimalną dzienną dawkę w oparciu o aktualne ustawienie suwaka,
           * a nie o statyczne wartości mgRange.  Poniżej korzystamy z atrybutu
           * slider.min (wyrażonego w mg/kg/dobę lub j.m./kg/dobę) do wyznaczenia minimalnej
           * dozwolonej dawki, a następnie porównujemy ją z ograniczeniem dobowym effectiveMax.
           */
          const sliderMinVal = parseFloat(sliderEl.min);
          let minRangeMgDayDynamic;
          if (isUnitMode) {
            // W trybie jednostek slider.min jest podany w j.m./kg/dobę.  Przeliczamy go na mg/kg/dobę,
            // a następnie mnożymy przez masę ciała, aby uzyskać minimalną dzienną dawkę w mg.
            // 1 j.m. ≈ 0,000654 mg (654 mg na 1 000 000 j.m.).
            minRangeMgDayDynamic = sliderMinVal * weight * (654 / 1000000);
          } else {
            // W trybie mg slider.min jest już w mg/kg/dobę; wystarczy przemnożyć przez masę.
            minRangeMgDayDynamic = sliderMinVal * weight;
          }
          // Wyznacz maksymalną wartość suwaka w jednostkach mg/kg/dobę (lub j.m./kg/dobę) zgodną z effectiveMax.
          const mgPerKgLimit = effectiveMax / weight;
          let maxAllowedSliderVal;
          if (isUnitMode) {
            // Jeśli suwak pracuje w j.m./kg/dobę, przelicz limit mg/kg/dobę na j.m./kg/dobę.
            maxAllowedSliderVal = mgPerKgLimit * (1000000 / 654);
          } else {
            maxAllowedSliderVal = mgPerKgLimit;
          }
          if (minRangeMgDayDynamic > effectiveMax + 1e-6) {
            // Cały zakres dostępny na suwaku przekracza dopuszczalną maksymalną dawkę dobową.
            // W takiej sytuacji wyłączamy suwak i ustawiamy flagę forceMaxDose, aby
            // komunikat „Zastosowano maksymalną dobową dawkę leku” został wyświetlony, ale
            // użytkownik nadal może cofnąć się do mniejszych wartości po zdjęciu ograniczenia.
            sliderEl.dataset.forceMaxDose = 'true';
            delete sliderEl.dataset.maxLimitValue;
            sliderEl.disabled = true;
            window.sliderDisabledByLimit = true;
            window.maxValueAllowed = null;
          } else {
            // Zakres minimalnej dawki mieści się w limicie dobowym.  Nie wyłączamy suwaka,
            // lecz ograniczamy jego maksymalną wartość, aby nie przekraczał effectiveMax.
            sliderEl.dataset.forceMaxDose = 'false';
            sliderEl.dataset.maxLimitValue = String(maxAllowedSliderVal);
            sliderEl.disabled = false;
            window.sliderDisabledByLimit = false;
            window.maxValueAllowed = maxAllowedSliderVal;
          }
          window.lastEffectiveMax = effectiveMax;
        } else {
          // Nie jest to lek z zakresem dawek (mgRange nie istnieje lub ma jedną wartość),
          // albo nie można zidentyfikować wagi.  Wyczyść ograniczenia i odblokuj suwak.
          if (sliderEl) {
            delete sliderEl.dataset.forceMaxDose;
            delete sliderEl.dataset.maxLimitValue;
            sliderEl.disabled = false;
          }
          window.lastEffectiveMax = effectiveMax;
          window.maxValueAllowed = null;
          window.sliderDisabledByLimit = false;
        }
        // Zaktualizuj dynamiczną etykietę po wprowadzeniu ograniczeń
        updateSliderValueLabel();
      } else {
        // W trybie własnej dawki nie przycinaj i nie dodawaj żadnego komunikatu o limicie.
        // Użytkownik świadomie wybrał dawkę, która przekracza limit – ostrzeżenia są pomijane w tym trybie.
      }
    } else {
      // Jeżeli dawka nie przekracza limitu (lub brak limitu), usuń wszelkie ograniczenia suwaka
      // nałożone w poprzednim obliczeniu.  Ta logika działa także w trybie własnej dawki,
      // gdy nie stosujemy ograniczeń dobowych.  Dzięki temu suwak działa w pełnym zakresie,
      // a etykieta jest aktualizowana normalnie.
      const sliderResetEl = document.getElementById('abxDoseSlider');
      if (sliderResetEl) {
        delete sliderResetEl.dataset.forceMaxDose;
        delete sliderResetEl.dataset.maxLimitValue;
        // Jeśli suwak został wcześniej zdezaktywowany z powodu limitu, przywróć go.
        sliderResetEl.disabled = false;
      }
      window.maxValueAllowed = null;
      window.sliderDisabledByLimit = false;
    }

    /*
     * Specjalna obsługa dla antybiotyków, dla których zalecana jest stała dawka w mg/kg/dobę
     * (zakres mgRange ma równą wartość minimalną i maksymalną).  Jeżeli po
     * ograniczeniu do maksymalnej dawki dobowej wyliczona dawka mg/dobę jest
     * niższa niż wynikająca z nominalnej dawki mg/kg/dobę pomnożonej przez masę
     * pacjenta, pole „Rekomendowana dawka” powinno być puste i nieaktywne, a
     * etykieta wyszarzona.  W tym scenariuszu użytkownik nie powinien
     * ręcznie modyfikować dawki w mg/kg/dobę, ponieważ została ona już
     * automatycznie dostosowana do limitu dobowego (np. 400 mg/dobę dla
     * cefiksymu).  W przeciwnym wypadku (gdy dawka nie została ograniczona
     * lub lek ma zakres dawek) przywróć możliwość edycji.
     */
    {
      // Sprawdź, czy w definicji leku zakres mgRange składa się z jednej wartości (stała dawka mg/kg/dobę).
      const hasConstantDose = Array.isArray(drugDef.mgRange) && drugDef.mgRange.length >= 2 && drugDef.mgRange[0] === drugDef.mgRange[1];
      const doseInputEl = document.getElementById('abxDoseInput');
      const doseLabelEl = document.getElementById('abxDoseInputLabelText');
      const doseLabelContainer = document.getElementById('abxDoseInputLabel');
        if(hasConstantDose && typeof weight === 'number' && weight > 0){
        // Docelowa dawka mg/dobę wynikająca z nominalnej wartości mg/kg/dobę (przed ograniczeniem)
        const expectedMgPerDay = drugDef.mgRange[0] * weight;
        // Określ maksymalną dopuszczalną dawkę dobową (efektywny limit z definicji leku lub globalnych limitów).
        // Zmienne effectiveMax i globalMax są wyliczane wcześniej w funkcji recalc().
        const effectiveLimit = effectiveMax != null ? effectiveMax : null;
        // Oblicz rzeczywistą dawkę dobową po zaokrągleniu do jednostek podania (np. tabletek, ml, fiolek).
        let roundedMgPerDay = mgPerDay;
        // Spróbuj pobrać definicję aktualnie wybranej formy leku, aby określić parametry opakowania.
        // Pobierz surową nazwę wybranej postaci (zawiera niełamliwe spacje, jeśli są w definicji).  
        // Użycie surowej nazwy jako klucza jest bezpieczniejsze, ponieważ odpowiada kluczom w DRUG_INFO.
        const formSelectEl = document.getElementById('abxForm');
        const selectedFormRaw = formSelectEl && formSelectEl.value;
        // Uzyskaj metadane formy bez modyfikowania spacji – klucz musi odpowiadać definicji w DRUG_INFO.
        const drugForms = DRUG_INFO[drugName] && DRUG_INFO[drugName].forms;
        const formMeta = drugForms && selectedFormRaw ? drugForms[selectedFormRaw] : null;
        if(formMeta){
          // Liczba dawek na dobę dla tego leku (może się różnić w zależności od wybranej mocy)
          const doses = dosesPerDay;
          // Jeśli forma to tabletka, zaokrąglij do połówek tabletki.
          if(formMeta.mgPerTablet){
            const mgPerTablet = formMeta.mgPerTablet;
            const mgPerDose = mgPerDay / doses;
            // Zaokrąglij liczbę tabletek na dawkę do połówek (0,5)
            const tabletsPerDose = Math.round((mgPerDose / mgPerTablet) * 2) / 2;
            roundedMgPerDay = tabletsPerDose * mgPerTablet * doses;
          } else if(formMeta.mgPer5ml){
            // Zawiesiny: przelicz mg na ml i zaokrąglij do 0,25 ml
            const mgPerMl = formMeta.mgPer5ml / 5;
            const mgPerDose = mgPerDay / doses;
            const mlPerDose = mgPerDose / mgPerMl;
            const mlPerDoseRounded = Math.round(mlPerDose / 0.25) * 0.25;
            roundedMgPerDay = mlPerDoseRounded * mgPerMl * doses;
          } else if(formMeta.mgPerVial){
            // Fiolki: zaokrąglij do połówek fiolki
            const mgPerVial = formMeta.mgPerVial;
            const mgPerDose = mgPerDay / doses;
            const vialsPerDose = Math.round((mgPerDose / mgPerVial) * 2) / 2;
            roundedMgPerDay = vialsPerDose * mgPerVial * doses;
          }
        }

        // Zapobiegaj sytuacji, w której zaokrąglenie do jednostek podania przekracza
        // ustalony limit dobowy dla amoksycyliny lub ko‑amoksyklawu.  Chociaż mgPerDay
        // jest już ograniczony do effectiveLimit, po zaokrągleniu liczby tabletek
        // lub objętości zawiesiny realna dawka mogłaby teoretycznie minimalnie
        // przekroczyć limit (np. przy nietypowych mocach).  Aby temu zapobiec,
        // w przypadku amoksycyliny oraz amoksycyliny z kwasem klawulanowym
        // redukuj zaokrągloną dawkę do wartości effectiveLimit.
        if (effectiveLimit != null) {
          const normNameLow = normalizedDrugName.toLowerCase();
          if ((normNameLow === 'amoksycylina' || normNameLow === 'amoksycylina z kwasem klawulanowym') && roundedMgPerDay > effectiveLimit) {
            // Początkowo ogranicz zaokrągloną dawkę do efektywnego limitu.
            roundedMgPerDay = effectiveLimit;
          }
        }

        /*
         * Zapewnienie, że w schematach tabletkowych liczba tabletek na dawkę
         * nigdy nie jest ułamkiem innym niż połówka.  Po ograniczeniu dawki
         * do wartości effectiveLimit za pomocą roundedMgPerDay i mgPerDay
         * może się okazać, że mgPerDay/doses nie daje się podzielić na
         * połowę tabletki (np. 1,33 tabl.).  Aby uniknąć takich wartości,
         * obniżamy dawkę do największej wartości mniejszej lub równej
         * roundedMgPerDay, która pozwala na podział dobowej liczby mg
         * na dawki, gdzie liczba tabletek na dawkę jest wielokrotnością 0,5.
         */
        {
          // Jeśli lek jest w postaci tabletki (posiada mgPerTablet) i obliczona dawka dobowa
          // jest zdefiniowana, wymuś, aby dawka dobowa była podzielna przez liczbę mg
          // odpowiadającą wielokrotności półtabletki na dawkę.  Dzięki temu liczba
          // tabletek na pojedynczą dawkę będzie zawsze wielokrotnością 0,5.
          const doseIsTablet = formMeta && formMeta.mgPerTablet;
          if (doseIsTablet && roundedMgPerDay != null && dosesPerDay > 0) {
            const mgPerTablet = formMeta.mgPerTablet;
            // wielkość kroku (w mg/dobę) odpowiadająca połowie tabletki w każdej dawce
            const mgIncrement = mgPerTablet * 0.5 * dosesPerDay;
            const nIncrements = Math.floor(roundedMgPerDay / mgIncrement);
            if (nIncrements > 0) {
              const divisibleMgPerDay = nIncrements * mgIncrement;
              // Jeśli roundedMgPerDay nie jest dokładnie podzielne przez mgIncrement,
              // obniż wartość do najbliższego niższego kroku, aby uniknąć ułamkowych tabletek.
              if (divisibleMgPerDay < roundedMgPerDay - 1e-6) {
                roundedMgPerDay = divisibleMgPerDay;
              }
            }
          }
        }
        // Ustal, czy powinniśmy zablokować pole „Rekomendowana dawka”.
        // Blokuj w dwóch sytuacjach:
        //  1. Gdy wyliczona dawka mgPerDay (po uwzględnieniu limitów) jest mniejsza niż oczekiwana nominalna dawka mg/kg * masa,
        //     co oznacza, że została ograniczona przez maksymalną dawkę dobową.
        //  2. Gdy rzeczywista dawka po zaokrągleniu (roundedMgPerDay) osiąga lub przekracza maksymalny limit dobowy (effectiveLimit).
        let shouldDisable = false;
        // Przy stałej dawce pole wprowadzania jest zwykle blokowane w dwóch sytuacjach:
        //  1. Gdy wyliczona dawka mgPerDay (po uwzględnieniu limitów) jest mniejsza niż nominalna dawka mg/kg * masa,
        //     co oznacza, że została ograniczona przez maksymalną dawkę dobową.
        //  2. Gdy rzeczywista dawka po zaokrągleniu osiąga lub przekracza maksymalny limit dobowy.
        // W trybie własnego ustalania dawki (customDoseActive) pozwalamy jednak na ręczną edycję
        // i wyświetlanie bieżącej dawki, więc nigdy nie ustawiamy shouldDisable na true.
        if(!customDoseActive){
          if(mgPerDay < expectedMgPerDay - 0.0001){
            shouldDisable = true;
          }
          if(!shouldDisable && effectiveLimit != null && roundedMgPerDay >= effectiveLimit - 0.0001){
            shouldDisable = true;
          }
        }
        if(shouldDisable){
          // W standardowym trybie zablokuj pole i usuń jego wartość
          if(doseInputEl){
            doseInputEl.disabled = true;
            doseInputEl.value = '';
          }
          if(doseLabelEl){
            doseLabelEl.classList.add('abx-disabled-label');
          }
          if(doseLabelContainer){
            doseLabelContainer.classList.add('abx-disabled-label');
          }
        } else {
          // Włącz pole i ustaw aktualną dawkę mg/kg.  W trybie custom aktualizujemy wartość
          // zawsze, aby odzwierciedlić ruch suwaka; w standardowym tylko gdy była pusta.
          if(doseInputEl){
            if(doseInputEl.disabled){
              doseInputEl.disabled = false;
            }
            const currentDoseKg = mgPerDay / weight;
            if(customDoseActive){
              // Aktualizuj wartość na bieżąco w trybie własnej dawki
              doseInputEl.value = fmt(currentDoseKg).replace(',', '.');
            } else {
              // W standardowym trybie ustaw tylko gdy pole jest puste (używane do wyświetlania nominalnej wartości)
              if(doseInputEl.value === ''){
                doseInputEl.value = fmt(currentDoseKg).replace(',', '.');
              }
            }
          }
          if(doseLabelEl){
            doseLabelEl.classList.remove('abx-disabled-label');
          }
          if(doseLabelContainer){
            doseLabelContainer.classList.remove('abx-disabled-label');
          }
        }
      } else {
        // Jeżeli lek ma przedział dawek, zawsze włącz pole i usuń klasy wyszarzenia.
        if(doseInputEl){
          if(doseInputEl.disabled){
            doseInputEl.disabled = false;
          }
        }
        if(doseLabelEl){
          doseLabelEl.classList.remove('abx-disabled-label');
        }
        if(doseLabelContainer){
          doseLabelContainer.classList.remove('abx-disabled-label');
        }
      }
    }

    // --- Podwójna weryfikacja: sprawdź, czy dawka w przeliczeniu na kg mieści się w zalecanym zakresie ---
    // Wyznacz bieżący przelicznik mg/kg/dobę po uwzględnieniu limitów.
    const currentMgPerKg = mgPerDay / weight;
    // Ustal minimalny i maksymalny zakres dawek z definicji leku. Dla fenoksymetylpenicyliny zakres jest dynamiczny
    let rangeMin = drugDef.mgRange[0];
    let rangeMax = drugDef.mgRange[1];
    if (drugName === 'Fenoksymetylpenicylina') {
      // Ponownie oblicz zakres dla fenoksymetylpenicyliny zgodnie z masą ciała, aby ostrzeżenie było wiarygodne.
      const mgPerMillionUnits = 654;
      if (weight >= 40) {
        rangeMin = (3 * mgPerMillionUnits) / weight;
        rangeMax = (4.5 * mgPerMillionUnits) / weight;
      } else {
        rangeMin = 33;
        rangeMax = 65;
      }
    }
    // Jeśli dawka wychodzi poza zalecany przedział (z uwzględnieniem niewielkiej tolerancji), dodaj informację.
    // Ostrzegaj tylko o przekroczeniu górnej granicy zalecanego zakresu.
    // Jeżeli dawka jest niższa niż zalecane minimum z powodu ograniczeń (np. limitu dobowego),
    // nie wywołujemy sprzecznych komunikatów – taki wybór pozostawiamy klinicyście.
    if (!isNaN(currentMgPerKg) && currentMgPerKg > rangeMax * 1.02) {
      // Jeżeli przeliczona dawka mg/kg/dobę przekracza górny limit, wyświetl
      // ostrzeżenie, ale nie włączaj przycisku „Powrót do rekomendacji”.
      messages.push(`Uwaga: obliczona dawka ${fmt(currentMgPerKg)} mg/kg/dobę przekracza zalecany górny zakres ${fmt(rangeMax)} mg/kg/dobę dla tego leku w tym wskazaniu. Upewnij się że dawka jest poprawnie wprowadzona`);
    }
    // Ustalenie informacji o preparacie: jeśli lek ma wiele postaci, pobierz wybraną.
    let drugMeta = DRUG_INFO[drugName];
    let selectedForm = null;
    if(drugMeta && drugMeta.forms){
      const formSelect = document.getElementById('abxForm');
      selectedForm = formSelect && formSelect.value;
      // Jeśli nie wybrano postaci lub nie istnieje w definicji, zaproponuj domyślną
      if(!selectedForm || !drugMeta.forms[selectedForm]){
        if(drugName === 'Klarytromycyna'){
          selectedForm = chooseClarithroDefaultForm(weight);
        } else if(drugName === 'Amoksycylina z kwasem klawulanowym'){
          selectedForm = chooseAmoxClavDefaultForm(weight);
        } else {
          selectedForm = Object.keys(drugMeta.forms)[0];
        }
        if(formSelect) formSelect.value = selectedForm;
      }
      // Ostrzeżenia dotyczące wyboru postaci amoksycyliny z kwasem klawulanowym względem masy ciała i dawki
      if (drugName === 'Amoksycylina z kwasem klawulanowym') {
        // Pobierz szczegółowe informacje o wybranej postaci (stężenie, typ formy)
        const acParent = DRUG_INFO['Amoksycylina z kwasem klawulanowym'];
        const metaInfo = acParent && acParent.forms ? acParent.forms[selectedForm] : null;
        const is400Suspension = !!(metaInfo && metaInfo.formType === 'suspension' && metaInfo.mgPer5ml && metaInfo.mgPer5ml >= 390 && metaInfo.mgPer5ml <= 410);
        const isEsSuspension = !!(metaInfo && metaInfo.formType === 'suspension' && metaInfo.mgPer5ml && metaInfo.mgPer5ml >= 590 && metaInfo.mgPer5ml <= 610);
        const prefersEsSuspension = shouldPreferAmoxClavEs(weight, { indicKey, targetDoseMgKg: doseMgKg });
        // Określ, czy wybrana postać jest zgodna z zaleceniami dla danej masy ciała
        let okForWeight = false;
        if (weight != null && weight < 40) {
          // U dzieci <40 kg dopuszczalne są obie zawiesiny pediatryczne: 400/57 oraz ES 600/42,9.
          okForWeight = is400Suspension || isEsSuspension;
          if (!okForWeight) {
            messages.push('U dzieci o masie < 40 kg preferowane są zawiesiny 400 mg/57 mg/5 ml lub ES 600 mg/42,9 mg/5 ml; tabletki są zwykle wygodniejsze dopiero od masy ≥40 kg.');
          } else if (prefersEsSuspension && is400Suspension) {
            messages.push('Przy wysokich dawkach amoksycyliny u dzieci < 40 kg warto rozważyć zawiesinę ES 600 mg/42,9 mg/5 ml, która pozwala podać mniejszą objętość i ogranicza podaż kwasu klawulanowego.');
          }
        } else if (weight != null && weight >= 40) {
          // ≥40 kg: wygodniejsze są tabletki (500/125 mg lub 875/125 mg)
          if (metaInfo && metaInfo.formType === 'tablet') {
            okForWeight = true;
          }
          if (!okForWeight) {
            messages.push('Dla pacjentów ≥40 kg wygodniejsze jest stosowanie tabletek (500 mg/125 mg lub 875 mg/125 mg) zamiast zawiesin.');
          }
        }
      }
      drugMeta = drugMeta.forms[selectedForm];

      /*
       * Wprowadzenie twardego limitu dwóch tabletek 875 mg/125 mg na dobę
       * dla umiarkowanych zakażeń skóry i niepowikłanych ZUM. W tych
       * wskazaniach (ropnie/czyraki, róża/cellulitis, zakażone rany, zakażenia
       * po ugryzieniach oraz niepowikłane zakażenia dróg moczowych) zgodnie
       * z wytycznymi preferuje się schemat 2× dobę, co odpowiada
       * maksymalnie dwóm tabletkom 875 mg/125 mg na dobę u pacjentów
       * ważących ≥40 kg. Aby uniemożliwić podanie większej liczby tabletek
       * wynikającej z obliczenia mg/kg/d, poniższy blok obniża dzienną
       * dawkę amoksycyliny z kwasem klawulanowym do 1 750 mg (2 × 875 mg),
       * jeśli użytkownik wybrał tabletkę 875 mg/125 mg i wskazanie należy
       * do listy umiarkowanych zakażeń. Dodatkowo ogranicza liczbę dawek
       * dziennych do 2.
       */
      if (drugName === 'Amoksycylina z kwasem klawulanowym') {
        const formNorm = selectedForm.replace(/\u00a0/g, ' ');
        // Sprawdź, czy wybrana postać to tabletka o mocy 875 mg/125 mg
        const is875 = /\b875\b/.test(formNorm) && /\b125\b/.test(formNorm);
        // Lista wskazań umiarkowanych, w których stosujemy maksymalnie 2 tabletki na dobę
        const moderateIndic = [
          'ssti_abscess',
          'ssti_cellulitis',
          'ssti_wound',
          'ssti_bite',
          'uti_uncomplicated'
        ];
        if (is875 && moderateIndic.includes(indicKey)) {
          // Maksymalnie dwie tabletki 875 mg na dobę = 1 750 mg amoksycyliny
          const maxPerDay = (drugMeta.mgPerTablet || 875) * 2;
          // Ogranicz liczbę dawek dobowych do 2
          if (dosesPerDay > 2) {
            dosesPerDay = 2;
          }
          if (mgPerDay > maxPerDay) {
            mgPerDay = maxPerDay;
            // Aktualizuj mg/kg w polach wejściowych
            const clampedMgKg = mgPerDay / weight;
            document.getElementById('abxDoseInput').value = fmt(clampedMgKg).replace(',', '.');
            document.getElementById('abxDoseSlider').value = clampedMgKg;
            messages.push('W tym wskazaniu maksymalna dawka wynosi 2 tabletki 875/125 mg na dobę. Dawka została ograniczona.');

            // Zaktualizuj istniejący komunikat o ograniczeniu do maksymalnej dawki, aby odzwierciedlał
            // nową, obniżoną wartość mgPerDay wynikającą z limitu dwóch tabletek.  Dzięki temu
            // użytkownik widzi właściwą przeliczoną dawkę mg/kg/dobę zgodną z aktualnym limitem.
            {
              const clampedMgKg2 = mgPerDay / weight;
              for (let mi = messages.length - 2; mi >= 0; mi--) {
                if (messages[mi] && messages[mi].startsWith('Zastosowano ograniczenie do maksymalnej dawki')) {
                  messages[mi] = `Zastosowano ograniczenie do maksymalnej dawki ${mgPerDay}\u00A0mg/dobę dla tego antybiotyku. Ze względu na limit ${mgPerDay}\u00A0mg/dobę przeliczona rekomendowana dawka wynosi ${fmt(clampedMgKg2)}\u00A0mg/kg/dobę.`;
                  break;
                }
              }
            }

            // Zastosuj ograniczenia suwaka analogicznie do ograniczenia dobowego: jeśli cały zakres mg/kg
            // pomnożony przez masę ciała przekracza aktualnie wyliczoną dawkę dobową (mgPerDay),
            // dezaktywujemy suwak i ustawiamy etykietę na komunikat „Zastosowano maksymalną dobową dawkę leku”.
            // W przeciwnym wypadku ograniczamy maksymalną wartość suwaka do mgPerDay/weight.
            {
              const sliderEl = document.getElementById('abxDoseSlider');
              const mgRange = drugDef && Array.isArray(drugDef.mgRange) ? drugDef.mgRange : null;
              const isRangeDrug = mgRange && mgRange.length >= 2 && mgRange[0] !== mgRange[1];
              if (sliderEl && isRangeDrug && typeof weight === 'number' && isFinite(weight)) {
                const minRange = mgRange[0];
                const minRangeMgDay = minRange * weight;
                const maxAllowedMgKg = mgPerDay / weight;
                if (minRangeMgDay > mgPerDay + 1e-6) {
                  // Cały zakres mg/kg przekracza obecną dawkę dobową – suwak zostaje wyłączony.
                  sliderEl.dataset.forceMaxDose = 'true';
                  delete sliderEl.dataset.maxLimitValue;
                  sliderEl.disabled = true;
                  window.sliderDisabledByLimit = true;
                  window.maxValueAllowed = null;
                } else {
                  // Zakres częściowo mieści się w limitach, ogranicz max do mgPerDay/weight.
                  sliderEl.dataset.forceMaxDose = 'false';
                  sliderEl.dataset.maxLimitValue = String(maxAllowedMgKg);
                  sliderEl.disabled = false;
                  window.sliderDisabledByLimit = false;
                  window.maxValueAllowed = maxAllowedMgKg;
                }
                // Zaktualizuj dynamiczną etykietę, aby odzwierciedlić nowe ograniczenia
                updateSliderValueLabel();
              }
            }
          }
        }
      }
    }
    // Jeśli brakuje informacji o sposobie przeliczania (np. brak mgPer5ml i mgPerTablet), wypisz tylko mg
    if(!drugMeta){
      abxSetTrustedMarkup(resultBox, `<p>Dawka dobowa: ${fmt(mgPerDay)} mg (podzielona na ${dosesPerDay} dawki).</p><p>Czas terapii: ${duration} dni.</p>`, 'antibiotic result');
      // Wyświetl zebrane komunikaty wraz ze źródłami
      {
        const returnBtnInner = document.getElementById('abxReturnBtn');
        if(returnBtnInner){
          // Dodaj lub usuń klasę show-return w zależności od tego, czy
          // dawka wpisana przez użytkownika wykracza poza referencyjny zakres.
          if(showReturn){
            returnBtnInner.classList.add('show-return');
          } else {
            returnBtnInner.classList.remove('show-return');
          }
        }
        updateNoteElement();
      }
      return;
    }
    // Obliczenia dla preparatów w postaci zawiesiny
    if('mgPer5ml' in drugMeta){
      const mgPerMl   = drugMeta.mgPer5ml / 5;
      // Specjalna obsługa pięciodniowego schematu azytromycyny:  
      // W tym schemacie pierwszego dnia podajemy większą dawkę, a w kolejnych dniach dawkę mniejszą.  
      // U dorosłych pierwsza dawka jest dwukrotnie większa niż dawka bazowa (≈6 mg/kg), a u dzieci równoważna  
      // dawce bazowej (≈10 mg/kg), po czym w dniach 2–5 stosuje się połowę dawki bazowej (≈5 mg/kg).  
      // Wykryjemy tę sytuację na podstawie nazwy leku i długości terapii w definicji (duration === 5).  
      {
        const normName = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
        if (normName.startsWith('Azytromycyna') && drugDef && drugDef.duration === 5) {
          // Oblicz dawki w mg/kg/dobę na podstawie mgRange; jeśli brak zakresu, skorzystaj z mgPerDay/weight
          let baseMgPerKg = null;
          if (drugDef.mgRange && Array.isArray(drugDef.mgRange) && drugDef.mgRange.length > 0) {
            baseMgPerKg = drugDef.mgRange[0];
          } else if (weight > 0) {
            baseMgPerKg = mgPerDay / weight;
          }
          if (baseMgPerKg != null && weight > 0) {
            // Ustal dawki mg dla schematu pięciodniowego. Dorośli (masa ≥40 kg)
            // otrzymują 500 mg w 1. dniu i 250 mg w kolejnych dniach.
            // Dzieci (<40 kg) przyjmują 10 mg/kg w 1. dniu i 5 mg/kg/d w kolejnych.
            let firstDayMg;
            let nextDayMg;
            if (weight >= 40) {
              firstDayMg = 500;
              nextDayMg  = 250;
            } else {
              let firstDayMgPerKg;
              let nextDayMgPerKg;
              if (baseMgPerKg >= 6) {
                // Pediatryczny wariant: 10 mg/kg w 1. dniu, 5 mg/kg później
                firstDayMgPerKg = baseMgPerKg;
                nextDayMgPerKg  = baseMgPerKg / 2;
              } else {
                // Dorosły wariant w mg/kg – zachowaj podwojenie/dzielenie
                firstDayMgPerKg = baseMgPerKg * 2;
                nextDayMgPerKg  = baseMgPerKg;
              }
              firstDayMg = firstDayMgPerKg * weight;
              nextDayMg  = nextDayMgPerKg  * weight;
            }
            // Przelicz na objętość (ml) dla pierwszego i kolejnych dni (liczba dawek na dobę = dosesPerDay)
            const firstDayMl    = (firstDayMg / mgPerMl) / dosesPerDay;
            const nextDayMl     = (nextDayMg  / mgPerMl) / dosesPerDay;
            // Zaokrąglij do 0,25 ml
            const firstDayMlRnd = Math.round(firstDayMl / 0.25) * 0.25;
            const nextDayMlRnd  = Math.round(nextDayMl  / 0.25) * 0.25;
            // Ponownie przelicz mg z zaokrąglonych wartości, aby uniknąć rozbieżności
            const firstDayMgRnd = firstDayMlRnd * mgPerMl * dosesPerDay;
            const nextDayMgRnd  = nextDayMlRnd  * mgPerMl * dosesPerDay;
            // Oblicz przeliczone mg/kg
            const firstDayMgKgRnd = firstDayMgRnd / weight;
            const nextDayMgKgRnd  = nextDayMgRnd  / weight;
            // Całkowita objętość terapii to suma pierwszej dawki i kolejnych dawek × (czas trwania – 1)
            const totalVolumeRounded = firstDayMlRnd * dosesPerDay + nextDayMlRnd * dosesPerDay * (duration - 1);
            // Wybierz opakowanie na podstawie całkowitej objętości
            const sizes = (drugMeta.packaging || []).slice().sort((a,b) => a - b);
            let selectedSize = sizes.find(sz => sz >= totalVolumeRounded);
            let countPack = 1;
            if(!selectedSize){
              selectedSize = sizes[sizes.length - 1] || totalVolumeRounded;
              countPack = Math.ceil(totalVolumeRounded / selectedSize);
            }
            const packagingSuggestion = `${countPack} × ${selectedSize}\u00a0ml`;
            // Buduj HTML wynikowy dla schematu z podziałem dawek
            // Dodaj informację o liczbie dni z mniejszą dawką (czas trwania terapii minus pierwszy dzień).
            // Ustal frazę dla liczby podań: gdy liczba podań wynosi 1, użyj l. pojedynczej „1 raz”, w przeciwnym razie zachowaj formę „n razy”.
            const freqPhraseSplit = dosesPerDay === 1 ? '1 raz' : `${dosesPerDay}\u00a0razy`;
            const dosingLine = `<strong>Dawkowanie leku:</strong> ${freqPhraseSplit}\u00a0na dobę: w 1. dniu ${fmt(firstDayMlRnd)}\u00a0ml, następnie ${fmt(nextDayMlRnd)}\u00a0ml przez ${duration - 1}\u00a0kolejne dni`;
            const dailyDoseLine = `<strong>Dawka dobowa:</strong> ${fmt(firstDayMgRnd)}\u00a0mg w 1. dniu, następnie ${fmt(nextDayMgRnd)}\u00a0mg/dobę`;
            // Nie wyświetlaj linii z wybraną dawką (mg/kg) dla azytromycyny w schemacie 5‑dniowym.
            let html = `\n              <p>${dosingLine}</p>\n              <p>${dailyDoseLine}</p>\n              <p><strong>Przewidywana terapia:</strong> ${duration}\u00a0dni – łącznie ${fmt(totalVolumeRounded)}\u00a0ml</p>\n            `;
            // Wstaw wynik i styluj
            abxSetTrustedMarkup(resultBox, html, 'antibiotic result');
            resultBox.style.textAlign = 'center';
            resultBox.style.fontSize = '1.25rem';
            // Zachowaj przycisk resetu i komunikaty – wykorzystujemy oryginalny showReturn.
            {
              const returnBtnInner = document.getElementById('abxReturnBtn');
              if(returnBtnInner){
                if(showReturn){
                  returnBtnInner.classList.add('show-return');
                } else {
                  returnBtnInner.classList.remove('show-return');
                }
              }
            }
            // Przygotuj rekomendację dawkowania w panelu zaleceń: użyj pełnego opisu schematu
            // (pierwszy dzień i kolejne dni) zamiast tylko dawki z kolejnych dni, aby
            // odzwierciedlić prawidłowy schemat azytromycyny 5‑dniowej.
            {
              const doseStrRecommendation = `w\u00a01.\u00a0dniu ${fmt(firstDayMlRnd)}\u00a0ml, następnie ${fmt(nextDayMlRnd)}\u00a0ml`;
              setupRecommendationUI(drugName, selectedForm, dosesPerDay, doseStrRecommendation, duration);
              // Zaktualizuj sekcję notatek i dodatkowych informacji po utworzeniu rekomendacji, aby
              // kontener „Dodatkowe informacje” został umieszczony poniżej sekcji zaleceń.
              updateNoteElement();
            }
            return;
          }
        }
      }
      // Standardowe przeliczenia dla pozostałych leków w zawiesinie
      let mlPerDay  = mgPerDay / mgPerMl;
      let mlPerDose = mlPerDay / dosesPerDay;
      // Zaokrąglij objętość dawki do 0,25 ml – mniejsze objętości są trudne do odmierzenia
      const mlPerDoseRounded = Math.round(mlPerDose / 0.25) * 0.25;
      const mlPerDayRounded  = mlPerDoseRounded * dosesPerDay;
      const totalVolumeRounded = mlPerDayRounded * duration;
      // Wybierz najbliższe opakowanie. Szukamy pierwszego opakowania >= totalVolumeRounded; jeśli brak, bierzemy największe i zaokrąglamy liczbę w górę.
      const sizes = (drugMeta.packaging || []).slice().sort((a,b) => a - b);
      let selectedSize = sizes.find(sz => sz >= totalVolumeRounded);
      let count = 1;
      if(!selectedSize){
        selectedSize = sizes[sizes.length - 1] || totalVolumeRounded;
        count = Math.ceil(totalVolumeRounded / selectedSize);
      }
      const packagingSuggestion = `${count} × ${selectedSize}\u00a0ml`;
      // Oblicz efektywną dawkę mg/kg/dobę po ewentualnym ograniczeniu
      const doseMgKgEffective = mgPerDay / weight;
      let doseInfoLine;
      if (drugName === 'Fenoksymetylpenicylina' && isUnitMode && iuPerKgRounded != null) {
        // Jeśli wybrano formę jednostkową, pokazujemy dawkę w jednostkach
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${iuPerKgRounded.toLocaleString('pl-PL')}\u00a0j.m./kg\u00a0mc./dobę`;
      } else {
        // W przeciwnym razie pokazujemy mg/kg/dobę
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${fmt(doseMgKgEffective)}\u00a0mg/kg/dobę`;
      }
      // Oblicz dawkę mg na jedną dawkę (mgPerDoseCalc) do wyświetlenia w nawiasie
      const mgPerDoseCalc = mgPerDay / dosesPerDay;
      // Dawka dobowa: dla fenoksymetylpenicyliny prezentujemy dawkę dobową w jednostkach (j.m.) lub mg,
      // a w nawiasie podajemy dawkę na jedną dawkę × liczbę podań. Dla pozostałych leków również używamy
      // mg na jedną dawkę zamiast objętości w ml, aby zachować spójność prezentacji.
      let dailyDoseLine;
      if (drugName === 'Fenoksymetylpenicylina') {
        // Oblicz jednostki/dawki i mg/dawki
        const unitsPerDose = iuPerDay != null ? iuPerDay / dosesPerDay : null;
        if (isUnitMode && iuPerDay != null) {
          dailyDoseLine = `<strong>Dawka dobowa:</strong> ${iuPerDay.toLocaleString('pl-PL')}\u00a0j.m.\u00a0&nbsp;(${unitsPerDose.toLocaleString('pl-PL')}\u00a0j.m. × ${dosesPerDay})`;
        } else {
          dailyDoseLine = `<strong>Dawka dobowa:</strong> ${fmt(mgPerDay)}\u00a0mg\u00a0&nbsp;(${fmt(mgPerDoseCalc)}\u00a0mg × ${dosesPerDay})`;
        }
      } else {
        // Inne antybiotyki w zawiesinie: pokaż dawkę dobową w mg i w nawiasie mg na dawkę × liczba dawek
        dailyDoseLine = `<strong>Dawka dobowa:</strong> ${fmt(mgPerDay)}\u00a0mg\u00a0&nbsp;(${fmt(mgPerDoseCalc)}\u00a0mg × ${dosesPerDay})`;
      }
      // Przygotuj wynik dla podstawowego schematu dawkowania
      // Usuwamy etykietę „Wybrana dawka” i zmieniamy kolejność wyświetlania. Pierwsza
      // linia informuje o liczbie dawek w ciągu doby oraz objętości pojedynczej dawki w ml.
      // Ustal frazę dla liczby podań: gdy liczba podań wynosi 1, użyj l. pojedynczej „1 raz”, w przeciwnym razie zachowaj formę „n razy”.
      const freqPhrase = dosesPerDay === 1 ? '1 raz' : `${dosesPerDay}\u00a0razy`;
      const dosingLine = `<strong>Dawkowanie leku:</strong> ${freqPhrase}\u00a0na dobę po ${fmt(mlPerDoseRounded)}\u00a0ml`;
      let html = `\n        <p>${dosingLine}</p>\n        <p>${dailyDoseLine}</p>\n        <p><strong>Przewidywana terapia:</strong> ${duration}\u00a0dni – łącznie ${fmt(totalVolumeRounded)}\u00a0ml</p>\n      `;
      // Jeżeli dla wybranego leku zdefiniowano alternatywne częstości podań, oblicz dodatkowe warianty
      if (drugDef.altDoses && Array.isArray(drugDef.altDoses) && drugDef.altDoses.length > 0) {
        // Oblicz dzienną ilość ml (bez zaokrągleń), przyjętą dawkę mg/dobę i jednostki na dobę
        const mlPerDayExact = mgPerDay / mgPerMl;
        html += '<p><em>Alternatywne schematy:</em></p>';
        drugDef.altDoses.forEach(alt => {
          // Oblicz objętość na dawkę dla alternatywnej liczby podań
          const altMlPerDose = mlPerDayExact / alt;
          // Zaokrąglij do 0,25 ml jak w podstawowej kalkulacji
          const altMlPerDoseRounded = Math.round(altMlPerDose / 0.25) * 0.25;
          const altMgPerDose = mgPerDay / alt;
          if (drugName === 'Fenoksymetylpenicylina' && isUnitMode && iuPerDay != null) {
            const altUnitsPerDose = iuPerDay / alt;
            // Wyświetl alternatywę w formie „X razy na dobę po Y ml” z podaniem przybliżonej liczby jednostek
            // Ustal frazę dla liczby podań: użyj l. pojedynczej „1 raz” gdy alt = 1, w przeciwnym razie „n razy”.
            const altFreqPhrase = alt === 1 ? '1 raz' : `${alt} razy`;
            html += `<p>${altFreqPhrase} na dobę po ${fmt(altMlPerDoseRounded)}\u00a0ml (≈${altUnitsPerDose.toLocaleString('pl-PL')}\u00a0j.m. na dawkę)</p>`;
          } else {
            // Dla innych leków podaj mg w nawiasie
            // Ustal frazę dla liczby podań: użyj l. pojedynczej „1 raz” gdy alt = 1, w przeciwnym razie „n razy”.
            const altFreqPhrase = alt === 1 ? '1 raz' : `${alt} razy`;
            html += `<p>${altFreqPhrase} na dobę po ${fmt(altMlPerDoseRounded)}\u00a0ml (≈${fmt(altMgPerDose)}\u00a0mg na dawkę)</p>`;
          }
        });
      }

      // Dodaj sekcję z alternatywnymi dawkami (altTablets) dla leków w formie tabletek.
      // altTablets definiuje z góry narzuconą liczbę tabletek na dawkę (np. 1,5),
      // będącą maksymalną dawką w danym wskazaniu. Sekcja pojawia się tylko wtedy,
      // gdy lek ma zdefiniowane altTablets i wyliczona dawka dobowa dla tej liczby tabletek
      // nie przekracza górnej granicy przedziału mgRange * masa ciała.
      if (drugDef && Array.isArray(drugDef.altTablets) && drugDef.altTablets.length > 0) {
        html += '<p><em>Alternatywne dawki:</em></p>';
        drugDef.altTablets.forEach(function(tab){
          const altMgPerDose = tab * mgPerTablet;
          const altMgPerDay  = altMgPerDose * dosesPerDay;
          let allow = true;
          if (drugDef.mgRange && Array.isArray(drugDef.mgRange) && drugDef.mgRange.length > 1 && weight > 0) {
            const maxMgPerDayAllowed = drugDef.mgRange[1] * weight;
            if (altMgPerDay > maxMgPerDayAllowed) {
              allow = false;
            }
          }
          if (allow) {
            const freqAltPhrase = dosesPerDay === 1 ? '1 raz' : `${dosesPerDay}\u00a0razy`;
            html += `<p>${freqAltPhrase} na dobę po ${fmt(tab)}\u00a0tabl. (≈${fmt(altMgPerDose)}\u00a0mg na dawkę) – maksymalna dawka w tym wskazaniu</p>`;
          }
        });
      }

      // Wstaw wynik do pola, ustaw mniejszą czcionkę i wyrównaj do środka
      abxSetTrustedMarkup(resultBox, html, 'antibiotic result');
      resultBox.style.textAlign = 'center';
      // Zmniejsz czcionkę w wynikach antybiotykoterapii, aby była mniej dominująca
      resultBox.style.fontSize = '1.25rem';
      // Wyświetl zebrane komunikaty wraz ze źródłami oraz pokaż przycisk resetu, jeśli wymagany
      {
        const returnBtnInner = document.getElementById('abxReturnBtn');
        if(returnBtnInner){
          // Kontroluj widoczność przycisku przez dodanie/ usunięcie klasy
          // show-return.  Nie ustawiamy bezpośrednio display, ponieważ
          // właściwości te są obsługiwane w arkuszu CSS (domyślnie ukryte).
          if(showReturn){
            returnBtnInner.classList.add('show-return');
          } else {
            returnBtnInner.classList.remove('show-return');
          }
        }
      }
      // Sekcja zaleceń handlowych dla preparatów doustnych (zawiesina): stosuje domyślną liczbę dawek
      {
        const doseStrRecommendation = `${fmt(mlPerDoseRounded)}\u00a0ml`;
        setupRecommendationUI(drugName, selectedForm, dosesPerDay, doseStrRecommendation, duration);
      }
      // Zaktualizuj notatki i sekcję dodatkowych informacji po utworzeniu zaleceń
      updateNoteElement();
      // Nie dodajemy w tej sekcji leków przeciwgorączkowych – będą one częścią zaleceń do wklejenia
      return;
    }
    // Obliczenia dla tabletek
    if('mgPerTablet' in drugMeta){
      const mgPerTablet = drugMeta.mgPerTablet;
      // Specjalny schemat dawkowania furazydyny u dorosłych i młodzieży
      // w niepowikłanych zakażeniach układu moczowego (uti_uncomplicated).
      // Zgodnie z ChPL pierwszego dnia podaje się 100 mg cztery razy dziennie,
      // a w kolejnych dniach 100 mg trzy razy dziennie.  Tabletki 50 mg należy
      // podawać po dwie sztuki na dawkę (100 mg), natomiast tabletki 100 mg –
      // po jednej.  Poniższy blok nadpisuje wyliczenia mg/kg i liczby tabletek
      // dla furazydyny w wskazaniu "uti_uncomplicated", gdy wiek pacjenta wynosi ≥15 lat.
      {
        const normDrugName = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
        // Odczytaj aktualne wskazanie
        const indicElemLocal = document.getElementById('abxIndication');
        const indicKeyLocal  = indicElemLocal && indicElemLocal.value;
        // Wylicz wiek w latach na podstawie pola wieku lub wieku w miesiącach
        let ageYearsLocal = (typeof getAge === 'function') ? getAge() : null;
        if(ageYearsLocal === null || ageYearsLocal === undefined){
          const monthsTmp2 = (typeof getChildAgeMonths === 'function') ? getChildAgeMonths() : null;
          if(monthsTmp2 !== null && monthsTmp2 !== undefined){
            ageYearsLocal = monthsTmp2 / 12;
          }
        }
        if(normDrugName === 'Furazydyna' && indicKeyLocal === 'uti_uncomplicated' && ageYearsLocal != null && ageYearsLocal >= 15){
          // Stała dawka na jedną dawkę (mg). Dla 50 mg tabletek oznacza 2 tabletki.
          const mgPerDose = 100;
          // Schemat: 4 dawki w pierwszym dniu, 3 dawki w kolejnych dniach
          const firstDayDoses = 4;
          const nextDayDoses  = 3;
          // Liczba tabletek na jedną dawkę (może być ułamkowa)
          const tabsPerDose = mgPerDose / mgPerTablet;
          // Dawki dobowe w mg na pierwszy i następne dni
          const mgFirstDayRounded = mgPerDose * firstDayDoses;
          const mgNextDayRounded  = mgPerDose * nextDayDoses;
          // Zaokrąglij liczbę tabletek do sumy potrzebnej na cały kurs; użyj Math.ceil dla
          // pewności, że liczba tabletek jest wystarczająca (w razie liczb ułamkowych)
          const totalTabs = Math.ceil(tabsPerDose * firstDayDoses + tabsPerDose * nextDayDoses * (duration - 1));
          // Dobierz opakowanie – weź pierwsze, które pomieści wszystkie tabletki; jeśli brak,
          // wybierz największe i przemnóż wielokrotność.
          const sizesTbl = (drugMeta.packaging || []).slice().sort((a,b) => a - b);
          let selSize = sizesTbl.find(sz => sz >= totalTabs);
          let packCount = 1;
          if(!selSize){
            selSize = sizesTbl[sizesTbl.length - 1] || totalTabs;
            packCount = Math.ceil(totalTabs / selSize);
          }
          const packagingSuggestion = `${packCount} × ${selSize}\u00a0tabl.`;
          // Funkcja formatowania liczby tabletek (używa przecinka dla części dziesiętnych)
          function fmtTabs(num){
            return (Number.isInteger(num) ? num.toString() : num.toFixed(1)).replace('.', ',');
          }
          // Zbuduj linię dawkowania: 4 × X tabl., następnie 3 × X tabl.
          const dosingLine = `<strong>Dawkowanie leku:</strong> w\u00a01.\u00a0dniu ${firstDayDoses}\u00a0×\u00a0${fmtTabs(tabsPerDose)}\u00a0tabl., następnie ${nextDayDoses}\u00a0×\u00a0${fmtTabs(tabsPerDose)}\u00a0tabl. przez ${duration - 1}\u00a0kolejnych dni`;
          const dailyDoseLine = `<strong>Dawka dobowa:</strong> ${mgFirstDayRounded}\u00a0mg w\u00a01.\u00a0dniu, następnie ${mgNextDayRounded}\u00a0mg/dobę`;
          const therapyLine = `<strong>Przewidywana terapia:</strong> ${duration}\u00a0dni – łącznie ${totalTabs}\u00a0tabl.`;
          let html = `\n              <p>${dosingLine}</p>\n              <p>${dailyDoseLine}</p>\n              <p>${therapyLine}</p>\n            `;
          // Wstaw wynik do pola i ustaw styl
          abxSetTrustedMarkup(resultBox, html, 'antibiotic result');
          resultBox.style.textAlign = 'center';
          resultBox.style.fontSize = '1.25rem';
          // Przygotuj tekst do sekcji zaleceń (copy/paste) – zawiera liczbę dawek i tabletek
          {
            const doseStrRecommendation = `w\u00a01.\u00a0dniu ${firstDayDoses}\u00a0×\u00a0${fmtTabs(tabsPerDose)}\u00a0tabl., następnie ${nextDayDoses}\u00a0×\u00a0${fmtTabs(tabsPerDose)}\u00a0tabl.`;
            // Używamy liczby dawek z kolejnych dni jako parametru dosesPerDay, aby uzyskać poprawną frazę „n razy dziennie”
            setupRecommendationUI(drugName, selectedForm, nextDayDoses, doseStrRecommendation, duration);
          }
          // Aktualizuj notatki i dodatkowe informacje
          updateNoteElement();
          return;
        }
      }
      // Specjalny schemat dla azytromycyny w 5‑dniowej kuracji: w 1. dniu większa dawka niż w pozostałych dniach
      {
        const normName = drugName ? drugName.replace(/\u00a0/g, ' ') : '';
        if (normName.startsWith('Azytromycyna') && drugDef && drugDef.duration === 5) {
          // Oblicz dawki w mg/kg/dobę na podstawie mgRange lub mgPerDay/weight
          let baseMgPerKg = null;
          if (drugDef.mgRange && Array.isArray(drugDef.mgRange) && drugDef.mgRange.length > 0) {
            baseMgPerKg = drugDef.mgRange[0];
          } else if (weight > 0) {
            baseMgPerKg = mgPerDay / weight;
          }
          if (baseMgPerKg != null && weight > 0) {
            // Ustal masy w mg dla pierwszego dnia i kolejnych dni.
            // Dorośli (masa ≥40 kg) otrzymują stałe dawki 500 mg w 1. dniu i 250 mg w dniach 2–5.
            // Dzieci (<40 kg) korzystają z dawek obliczonych z mg/kg: 10 mg/kg w 1. dniu i 5 mg/kg w kolejnych dniach.
            let firstDayMg;
            let nextDayMg;
            if (weight >= 40) {
              firstDayMg = 500;
              nextDayMg  = 250;
            } else {
              // Ustal dawki mg/kg w zależności od wariantu (pediatryczny vs dorosły mgRange).
              let firstDayMgPerKg;
              let nextDayMgPerKg;
              if (baseMgPerKg >= 6) {
                // Pediatryczny wariant: 10 mg/kg w 1. dniu, 5 mg/kg później
                firstDayMgPerKg = baseMgPerKg;
                nextDayMgPerKg  = baseMgPerKg / 2;
              } else {
                // Dorosły wariant w mg/kg – zachowaj podwojenie/dzielenie
                firstDayMgPerKg = baseMgPerKg * 2;
                nextDayMgPerKg  = baseMgPerKg;
              }
              firstDayMg = firstDayMgPerKg * weight;
              nextDayMg  = nextDayMgPerKg  * weight;
            }
            // Funkcja do wyboru liczby tabletek (połówki) dla danej dawki mg
            function pickTablets(targetMg){
              const idealTabsPerDay = targetMg / mgPerTablet;
              const idealTabsPerDose = idealTabsPerDay / dosesPerDay;
              const tol = 0.20;
              const mgMinLoc = targetMg * (1 - tol);
              const mgMaxLoc = targetMg * (1 + tol);
              let best = null;
              let bestDiffLoc = Infinity;
              for(let offset = -4; offset <= 8; offset++){
                let candidate = Math.round(idealTabsPerDose * 2 + offset) / 2;
                if(candidate < 0.5) candidate = 0.5;
                const candidateMg = candidate * dosesPerDay * mgPerTablet;
                if(candidateMg >= mgMinLoc && candidateMg <= mgMaxLoc){
                  const diff = Math.abs(candidateMg - targetMg);
                  if(diff < bestDiffLoc){
                    bestDiffLoc = diff;
                    best = candidate;
                  }
                }
              }
              if(best !== null){
                const roundedMg = best * dosesPerDay * mgPerTablet;
                return {tabs: best, mg: roundedMg};
              } else {
                // Brak dopasowania w tolerancji – zaokrąglij w górę do najbliższej połowy tabletki
                const candidate = Math.ceil(idealTabsPerDose * 2) / 2;
                const roundedMg = candidate * dosesPerDay * mgPerTablet;
                return {tabs: candidate, mg: roundedMg};
              }
            }
            const firstDoseInfo = pickTablets(firstDayMg);
            const nextDoseInfo  = pickTablets(nextDayMg);
            const tabsFirst    = firstDoseInfo.tabs;
            const tabsNext     = nextDoseInfo.tabs;
            const mgFirstRounded = firstDoseInfo.mg;
            const mgNextRounded  = nextDoseInfo.mg;
            // Oblicz liczbę tabletek na całe leczenie: dawka z 1. dnia + pozostałe dni
            const totalTabs = Math.ceil(tabsFirst * dosesPerDay + tabsNext * dosesPerDay * (duration - 1));
            // Sugestia opakowania
            const sizesTbl = (drugMeta.packaging || []).slice().sort((a,b) => a - b);
            let selSize = sizesTbl.find(sz => sz >= totalTabs);
            let packCount = 1;
            if(!selSize){
              selSize = sizesTbl[sizesTbl.length - 1] || totalTabs;
              packCount = Math.ceil(totalTabs / selSize);
            }
            const packagingSuggestion = `${packCount} × ${selSize}\u00a0tabl.`;
            // Przygotuj teksty
            // Dodaj informację o liczbie dni z mniejszą dawką (czas trwania terapii minus pierwszy dzień).
            // Ustal frazę dla liczby podań: gdy liczba podań wynosi 1, użyj l. pojedynczej „1 raz”, w przeciwnym razie zachowaj formę „n razy”.
            const freqPhraseTbl = dosesPerDay === 1 ? '1 raz' : `${dosesPerDay}\u00a0razy`;
            const dosingLineTbl = `<strong>Dawkowanie leku:</strong> ${freqPhraseTbl}\u00a0na dobę: w 1. dniu ${fmt(tabsFirst)}\u00a0tabl., następnie ${fmt(tabsNext)}\u00a0tabl. przez ${duration - 1}\u00a0kolejne dni`;
            const dailyDoseLine = `<strong>Dawka dobowa:</strong> ${fmt(mgFirstRounded)}\u00a0mg w 1. dniu, następnie ${fmt(mgNextRounded)}\u00a0mg/dobę`;
            // Nie wyświetlaj linii z wybraną dawką (mg/kg) dla azytromycyny – użytkownikowi wystarczy informacja o mg na dawkę i liczbie tabletek.
            let html = `\n              <p>${dosingLineTbl}</p>\n              <p>${dailyDoseLine}</p>\n              <p><strong>Przewidywana terapia:</strong> ${duration}\u00a0dni – łącznie ${totalTabs}\u00a0tabl.</p>\n            `;
            // Ostrzeżenie dla dzieci <25 kg – dotyczy tabletek
            if(weight < 25){
              messages.push('Uwaga: dla dzieci o masie <25 kg forma tabletkowa leku jest nieodpowiednia i może nie zapewniać dokładnego dawkowania. Rozważ użycie zawiesiny, jeśli jest dostępna.');
            }
            // Wstaw wynik i styluj
            abxSetTrustedMarkup(resultBox, html, 'antibiotic result');
            resultBox.style.textAlign = 'center';
            resultBox.style.fontSize = '1.25rem';
            {
              const returnBtnInner = document.getElementById('abxReturnBtn');
              if(returnBtnInner){
                if(showReturn){
                  returnBtnInner.classList.add('show-return');
                } else {
                  returnBtnInner.classList.remove('show-return');
                }
              }
            }
            // Przygotuj rekomendację: użyj pełnego opisu schematu (pierwszy dzień i kolejne dni)
            // zamiast tylko dawki z kolejnych dni. Dzięki temu zalecenia do wklejenia
            // będą odzwierciedlać prawidłowy schemat (np. „w 1. dniu 1 tabl., następnie 0,5 tabl.”).
            {
              const doseStrRecommendation = `w\u00a01.\u00a0dniu ${fmt(tabsFirst)}\u00a0tabl., następnie ${fmt(tabsNext)}\u00a0tabl.`;
              setupRecommendationUI(drugName, selectedForm, dosesPerDay, doseStrRecommendation, duration);
            }
            // Zaktualizuj sekcję notatek i dodatkowych informacji po utworzeniu zaleceń
            updateNoteElement();
            return;
          }
        }
      }
      // Standardowe obliczenia tabletek dla pozostałych leków
      // Oblicz preferowaną liczbę tabletek na podstawie dawki i wprowadź tolerancję ±20%
      const idealTabletsPerDay = mgPerDay / mgPerTablet;
      const idealTabletsPerDose = idealTabletsPerDay / dosesPerDay;
      const tolerance = 0.20;
      const mgMin = mgPerDay * (1 - tolerance);
      const mgMax = mgPerDay * (1 + tolerance);
      let bestDose = null;
      let bestDiff = Infinity;
      // Poszukaj liczby półtabletek na dawkę, która daje dawkę dobową mieszczącą się w tolerancji
      for(let offset = -4; offset <= 8; offset++){
        let candidate = Math.round(idealTabletsPerDose * 2 + offset) / 2;
        if(candidate < 0.5) candidate = 0.5;
        const candidateMgPerDay = candidate * dosesPerDay * mgPerTablet;
        if(candidateMgPerDay >= mgMin && candidateMgPerDay <= mgMax){
          const diff = Math.abs(candidateMgPerDay - mgPerDay);
          if(diff < bestDiff){
            bestDiff = diff;
            bestDose = candidate;
          }
        }
      }
      let tabletsPerDoseRounded;
      if(bestDose !== null){
        tabletsPerDoseRounded = bestDose;
      } else {
        // Brak dopasowania w tolerancji – zaokrąglij w górę do najbliższej połowy tabletki
        tabletsPerDoseRounded = Math.ceil(idealTabletsPerDose * 2) / 2;
      }
      let tabletsPerDayRounded = tabletsPerDoseRounded * dosesPerDay;
      let mgPerDayRounded = tabletsPerDayRounded * mgPerTablet;

      // -------------------
      // Specjalna obsługa dla leków zdefiniowanych z własnym schematem liczby tabletek (altTablets).
      // Niektóre antybiotyki, takie jak doustna cyprofloksacyna w odmiedniczkowym ZUM, mają z góry
      // ustalony schemat dawkowania w tabletkach, niezależnie od masy ciała pacjenta.  W takich
      // przypadkach podstawowy schemat powinien być stały (np. 1 tabletka na dawkę), a w razie
      // konieczności podajemy alternatywny schemat z większą liczbą tabletek (np. 1,5 tabletki na dawkę).
      // Poniższy blok nadpisuje obliczone wartości liczby tabletek i mg/dobę tak, aby odpowiadały
      // podstawowemu schematowi 1 tabletka/dawkę.  Ostrzeżenia o przekroczeniu dawek mg/kg nie są
      // generowane dla tych leków, gdyż schemat jest zdefiniowany w wytycznych.
      if (drugDef && Array.isArray(drugDef.altTablets) && drugDef.altTablets.length > 0) {
        // Ustal podstawową liczbę tabletek na dawkę jako 1 (jedna pełna tabletka)
        tabletsPerDoseRounded = 1;
        tabletsPerDayRounded  = tabletsPerDoseRounded * dosesPerDay;
        mgPerDayRounded       = tabletsPerDayRounded * mgPerTablet;
        // Wartości mgMin i mgMax pozostają niezmienione, ale ostrzeżenia o przekroczeniu
        // zakresu dawek mg/kg zostaną pominięte w dalszej części funkcji (patrz niżej).
      }
      // Dodatkowe zabezpieczenie: w przypadku amoksycyliny oraz amoksycyliny z kwasem klawulanowym
      // nie dopuszczamy, aby zaokrąglona dawka dobowa przekroczyła ustalony limit (effectiveMax).
      // mgPerDay (bez zaokrągleń) został już ograniczony do effectiveMax w poprzednich krokach,
      // ale rounding może teoretycznie spowodować przekroczenie tej wartości.  Aby temu zapobiec,
      // ponownie ograniczamy mgPerDayRounded i obliczamy odpowiadającą liczbę tabletek.
      {
        const normNameLow = normalizedDrugName.toLowerCase();
        if ((normNameLow === 'amoksycylina' || normNameLow === 'amoksycylina z kwasem klawulanowym') && effectiveMax != null && mgPerDayRounded > effectiveMax) {
          // Ogranicz mgPerDayRounded do maksymalnej dopuszczalnej wartości.
          mgPerDayRounded = effectiveMax;
          tabletsPerDayRounded = mgPerDayRounded / mgPerTablet;
          tabletsPerDoseRounded = tabletsPerDayRounded / dosesPerDay;
        }
        // Dodatkowe dopasowanie: upewnij się, że liczba tabletek na dawkę jest wielokrotnością 0,5.
        // Jeśli średnia liczba tabletek na dawkę (po ograniczeniu do effectiveMax) nie jest wielokrotnością 0,5,
        // zmniejsz dawkę do największej wartości podzielnej przez mgPerTablet * 0,5 * dosesPerDay.
        // W przypadku dowolnego antybiotyku w formie tabletki upewnij się, że liczba tabletek
        // na dawkę jest wielokrotnością 0,5.  Jeżeli zaokrąglona dawka dobowa (mgPerDayRounded)
        // nie jest podzielna przez mgIncrementTbl, obniż ją do najbliższego niższego kroku.
        if (mgPerDayRounded != null && mgPerTablet) {
          const mgIncrementTbl = mgPerTablet * 0.5 * dosesPerDay;
          const nSteps = Math.floor(mgPerDayRounded / mgIncrementTbl);
          if(nSteps > 0){
            const divisibleMgDay = nSteps * mgIncrementTbl;
            if(divisibleMgDay < mgPerDayRounded - 1e-6){
              mgPerDayRounded = divisibleMgDay;
              tabletsPerDayRounded = mgPerDayRounded / mgPerTablet;
              tabletsPerDoseRounded = tabletsPerDayRounded / dosesPerDay;
            }
          }
        }
      }
      const totalTablets = Math.ceil(tabletsPerDayRounded * duration);
      // Sugestia opakowania: minimalna liczba opakowań, które pokryją liczbę tabletek
      const sizes = (drugMeta.packaging || []).slice().sort((a,b) => a - b);
      let selectedSize = sizes.find(sz => sz >= totalTablets);
      let count = 1;
      if(!selectedSize){
        selectedSize = sizes[sizes.length - 1] || totalTablets;
        count = Math.ceil(totalTablets / selectedSize);
      }
      const packagingSuggestion = `${count} × ${selectedSize}\u00a0tabl.`;
      // Oblicz efektywną dawkę mg/kg/dobę i oblicz różnicę w procentach
      const doseMgKgEffective = mgPerDayRounded / weight;
      const targetMgKg = mgPerDay / weight;
      // Dodaj ostrzeżenia o przekroczeniu lub zbyt małej dawce tylko wtedy, gdy lek nie jest objęty
      // specjalnym schematem (altTablets).  W przypadku leków z altTablets wartości mgPerDay
      // zostały dostosowane, aby nie wywoływać tych ostrzeżeń.
      if (!(drugDef && Array.isArray(drugDef.altTablets) && drugDef.altTablets.length > 0)) {
        if(mgPerDayRounded < mgMin || mgPerDayRounded > mgMax){
          const deltaPercent = Math.round((mgPerDayRounded / mgPerDay - 1) * 100);
          if(deltaPercent > 0){
            messages.push(`Wybrana forma terapii przekracza zalecaną dawkę dobową o ${deltaPercent}% (faktycznie ${fmt(doseMgKgEffective)} mg/kg/dobę zamiast ${fmt(targetMgKg)} mg/kg/dobę).`);
          } else {
            const absDelta = Math.abs(deltaPercent);
            messages.push(`Wybrana forma terapii dostarcza o ${absDelta}% mniej niż zalecana dawka dobowa (faktycznie ${fmt(doseMgKgEffective)} mg/kg/dobę zamiast ${fmt(targetMgKg)} mg/kg/dobę).`);
          }
        }
      }
      // Ostrzeżenie dla dzieci <25 kg
      if(weight < 25){
        messages.push('Uwaga: dla dzieci o masie <25 kg forma tabletkowa leku jest nieodpowiednia i może nie zapewniać dokładnego dawkowania. Rozważ użycie zawiesiny, jeśli jest dostępna.');
      }
      // Ostrzeżenie, jeśli wyliczona dawka jest mniejsza niż połowa tabletki na dawkę
      if(idealTabletsPerDose * mgPerTablet < mgPerTablet * 0.5){
        messages.push('Uwaga: obliczona dawka dobowa jest mniejsza niż połowa pojedynczej tabletki. Rozważ podanie leku w zawiesinie lub innym preparacie.');
      }
      // Przygotuj linie informacji do wyświetlenia
      let doseInfoLine;
      if (drugName === 'Fenoksymetylpenicylina' && isUnitMode && iuPerKgRounded != null) {
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${iuPerKgRounded.toLocaleString('pl-PL')}\u00a0j.m./kg\u00a0mc./dobę`;
      } else {
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${fmt(doseMgKgEffective)}\u00a0mg/kg/dobę`;
      }
      let dailyDoseLine;
      if (drugName === 'Fenoksymetylpenicylina') {
        dailyDoseLine = `<strong>Dawka dobowa:</strong> ${fmt(mgPerDayRounded)}\u00a0mg &nbsp;(${fmt(tabletsPerDayRounded)}\u00a0tabl.)`;
      } else {
        dailyDoseLine = `<strong>Dawka dobowa:</strong> ${fmt(mgPerDayRounded)}\u00a0mg &nbsp;(${fmt(tabletsPerDayRounded)}\u00a0tabl.)`;
      }
      // Skonstruuj wynik podstawowego schematu dawkowania
      // Usuwamy etykietę „Wybrana dawka” i zmieniamy format prezentacji dawkowania.
      // Ustal frazę dla liczby podań: gdy liczba podań wynosi 1, użyj l. pojedynczej „1 raz”, w przeciwnym razie zachowaj formę „n razy”.
      const freqPhraseTbl = dosesPerDay === 1 ? '1 raz' : `${dosesPerDay}\u00a0razy`;
      const dosingLineTbl = `<strong>Dawkowanie leku:</strong> ${freqPhraseTbl}\u00a0na dobę po ${fmt(tabletsPerDoseRounded)}\u00a0tabl.`;
      let html = `\n        <p>${dosingLineTbl}</p>\n        <p>${dailyDoseLine}</p>\n        <p><strong>Przewidywana terapia:</strong> ${duration}\u00a0dni – łącznie ${totalTablets}\u00a0tabl.</p>\n      `;
      // Jeśli lek posiada alternatywne schematy (np. 2–3 ×/dobę), oblicz dodatkowe warianty
      if (drugDef.altDoses && Array.isArray(drugDef.altDoses) && drugDef.altDoses.length > 0) {
        html += '<p><em>Alternatywne schematy:</em></p>';
        // Oryginalna dzienna dawka po uwzględnieniu zaokrągleń
        const mgPerDayAltBase = mgPerDayRounded;
        drugDef.altDoses.forEach(alt => {
          const altMgPerDose = mgPerDayAltBase / alt;
          // Oblicz liczbę tabletek na dawkę, zaokrąglając do połówek
          let altTabletsPerDose = Math.round((altMgPerDose / mgPerTablet) * 2) / 2;
          if (altTabletsPerDose < 0.5) altTabletsPerDose = 0.5;
          // Oblicz odpowiadającą dawkę mg/dzień na podstawie liczby tabletek
          const altMgPerDayActual = altTabletsPerDose * alt * mgPerTablet;
          // Dla penicyliny oblicz liczbę jednostek na dawkę (jeżeli dostępna informacja o unitsPerTablet)
          let altUnitsPerDose = null;
          if (drugName === 'Fenoksymetylpenicylina') {
            const unitsPerTablet = drugMeta.unitsPerTablet;
            if (unitsPerTablet) {
              altUnitsPerDose = unitsPerTablet * altTabletsPerDose;
            }
          }
          if (altUnitsPerDose != null) {
            // Ustal frazę dla liczby podań: użyj l. pojedynczej „1 raz” gdy alt = 1, w przeciwnym razie „n razy”.
            const altFreqPhraseTbl = alt === 1 ? '1 raz' : `${alt} razy`;
            html += `<p>${altFreqPhraseTbl} na dobę po ${fmt(altTabletsPerDose)}\u00a0tabl. (≈${altUnitsPerDose.toLocaleString('pl-PL')}\u00a0j.m. na dawkę)</p>`;
          } else {
            // Ustal frazę dla liczby podań: użyj l. pojedynczej „1 raz” gdy alt = 1, w przeciwnym razie „n razy”.
            const altFreqPhraseTbl2 = alt === 1 ? '1 raz' : `${alt} razy`;
            html += `<p>${altFreqPhraseTbl2} na dobę po ${fmt(altTabletsPerDose)}\u00a0tabl. (≈${fmt(altMgPerDose)}\u00a0mg na dawkę)</p>`;
          }
        });
      }

      // Jeśli zdefiniowano altTablets, dodaj sekcję prezentującą maksymalne dawki w tabletkach.
      // altTablets zawiera stałe liczby tabletek na dawkę (np. 1,5), które odpowiadają
      // maksymalnym dawkom przewidzianym w danym wskazaniu.  Wyświetl tę sekcję tylko wtedy,
      // gdy dawka dobowa wyliczona na podstawie altTablets nie przekracza górnej granicy
      // mgRange × masa ciała.
      if (drugDef && Array.isArray(drugDef.altTablets) && drugDef.altTablets.length > 0) {
        html += '<p><em>Alternatywne dawki:</em></p>';
        drugDef.altTablets.forEach(function(tab){
          const altMgPerDose = tab * mgPerTablet;
          const altMgPerDay  = altMgPerDose * dosesPerDay;
          let allow = true;
          if (drugDef.mgRange && Array.isArray(drugDef.mgRange) && drugDef.mgRange.length > 1 && weight > 0) {
            const maxMgPerDayAllowed = drugDef.mgRange[1] * weight;
            if (altMgPerDay > maxMgPerDayAllowed) {
              allow = false;
            }
          }
          if (allow) {
            const freqAltPhraseTbl = dosesPerDay === 1 ? '1 raz' : `${dosesPerDay}\u00a0razy`;
            html += `<p>${freqAltPhraseTbl} na dobę po ${fmt(tab)}\u00a0tabl. (≈${fmt(altMgPerDose)}\u00a0mg na dawkę) – maksymalna dawka w tym wskazaniu</p>`;
          }
        });
      }
      // Wstaw wynik do pola, ustaw mniejszą czcionkę i wyrównaj do środka
      abxSetTrustedMarkup(resultBox, html, 'antibiotic result');
      resultBox.style.textAlign = 'center';
      // Zmniejsz czcionkę w wynikach antybiotykoterapii
      resultBox.style.fontSize = '1.25rem';
      // Wyświetl przycisk resetu i zebrane komunikaty – widoczność kontroluje klasa show-return
      {
        const returnBtnInner = document.getElementById('abxReturnBtn');
        if(returnBtnInner){
          if(showReturn){
            returnBtnInner.classList.add('show-return');
          } else {
            returnBtnInner.classList.remove('show-return');
          }
        }
      }
      // Przygotuj sekcję zaleceń do wklejenia i następnie zaktualizuj notatki
      {
        const doseStrRecommendation = `${fmt(tabletsPerDoseRounded)}\u00a0tabl.`;
        setupRecommendationUI(drugName, selectedForm, dosesPerDay, doseStrRecommendation, duration);
      }
      updateNoteElement();
      // Nie dodajemy w tej sekcji leków przeciwgorączkowych – będą one częścią zaleceń do wklejenia
      return;
    }
    // Obliczenia dla leków w fiolkach (preparaty dożylne). Nie podajemy liczby
    // fiolek ani sugerowanego opakowania – jedynie masę substancji czynnej
    // przypadającą na całą dobę oraz na pojedynczą dawkę. Lekarz decyduje
    // indywidualnie o wykorzystaniu fiolek.
    if('mgPerVial' in drugMeta){
      const mgPerDose = mgPerDay / dosesPerDay;
      // Oblicz efektywną dawkę mg/kg/dobę
      const doseMgKgEffective = mgPerDay / weight;
      let doseInfoLine;
      if (drugName === 'Fenoksymetylpenicylina' && isUnitMode && iuPerKgRounded != null) {
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${iuPerKgRounded.toLocaleString('pl-PL')} j.m./kg mc./dobę`;
      } else {
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${fmt(doseMgKgEffective)} mg/kg/dobę`;
      }
      // Dla preparatów dożylnych usuwamy etykietę „Wybrana dawka” i prezentujemy
      // dawkowanie w formie „X razy na dobę po Y mg”.
      // Ustal frazę dla liczby podań: gdy liczba podań wynosi 1, użyj l. pojedynczej „1 raz”, w przeciwnym razie zachowaj formę „n razy”.
      const freqPhraseVial = dosesPerDay === 1 ? '1 raz' : `${dosesPerDay}\u00a0razy`;
      const dosingLineVial = `<strong>Dawkowanie leku:</strong> ${freqPhraseVial}\u00a0na dobę po ${fmt(mgPerDose)}\u00a0mg`;
      abxSetTrustedMarkup(resultBox, `
        <p>${dosingLineVial}</p>
        <p><strong>Dawka dobowa:</strong> ${fmt(mgPerDay)}\u00a0mg</p>
        <p><strong>Przewidywana terapia:</strong> ${duration}\u00a0dni</p>
      `, 'antibiotic result');
      // Zmniejsz czcionkę w wynikach
      resultBox.style.fontSize = '1.25rem';
      // Wyświetl zebrane komunikaty wraz ze źródłami oraz pokaż przycisk resetu, jeśli wymagany
      {
        const returnBtnInner = document.getElementById('abxReturnBtn');
        if(returnBtnInner){
          if(showReturn){
            returnBtnInner.classList.add('show-return');
          } else {
            returnBtnInner.classList.remove('show-return');
          }
        }
        updateNoteElement();
      }
      // Ukryj sekcję zaleceń dla preparatów dożylnych
      setupRecommendationUI('', '', 0, '', 0);
      // Nie dodajemy w tej sekcji leków przeciwgorączkowych – będą one częścią zaleceń do wklejenia
      return;
    }

    // Koniec funkcji recalc – zamknij blok obliczeń po sekcji leków dożylnych.
  }

  /**
   * Włącza tryb samodzielnego ustalania dawki dla aktualnie wybranego leku.
   * Tryb ten rozszerza zakres suwaka dawki: dolny zakres stanowi połowa
   * minimalnej wartości referencyjnej, a górny dwa razy maksymalna wartość.
   * Powoduje również zmianę etykiety z „Rekomendowana dawka” na
   * „Wybrana dawka”, wyróżnienie pola na czerwono oraz wyświetlenie
   * ostrzeżenia w sekcji notatek.  Użytkownik może powrócić do
   * rekomendowanego zakresu klikając przycisk „Powróć do rekomendowanej dawki”.
   */
  function enableCustomDose(){
    // Nie wykonuj ponownie, jeśli tryb jest już aktywny
    if(customDoseActive) return;
    const slider = document.getElementById('abxDoseSlider');
    const doseInput = document.getElementById('abxDoseInput');
    const doseLabel = document.getElementById('abxDoseInputLabelText');
    const customBtn = document.getElementById('abxCustomDoseBtn');
    const returnBtn = document.getElementById('abxReturnBtn');
    if(!slider || !doseInput){
      return;
    }
    customDoseActive = true;
    // W trybie własnej dawki nie stosujemy ograniczeń wynikających z maksymalnej dawki dobowej.
    // Usuń ewentualne flagi dataset z poprzednich obliczeń i przywróć pełną aktywność suwaka.
    if (slider) {
      delete slider.dataset.forceMaxDose;
      delete slider.dataset.maxLimitValue;
      slider.disabled = false;
    }
    // Wyzeruj zmienne globalne odpowiadające ograniczeniu dawki.
    window.maxValueAllowed = null;
    window.sliderDisabledByLimit = false;
    // Ustal bieżący zakres suwaka.  Jeżeli zakres jest niepoprawny,
    // nie rozszerzaj go – pozostaw domyślne wartości i wywołaj recalc.
    let currentMin = parseFloat(slider.min);
    let currentMax = parseFloat(slider.max);
    if(!isFinite(currentMin) || !isFinite(currentMax) || currentMax < currentMin){
      recalc();
      return;
    }
    // Oblicz nowy zakres: od połowy minimalnej referencji do 1,5 × maksymalnej
    // Zgodnie z prośbą użytkownika zakres rozszerzalny w trybie własnej dawki
    // został ograniczony z 2× do 1,5× wartości referencyjnej.  Dzięki temu suwak
    // pozwala na ustawienie dawki w przedziale 0,5–1,5 × rekomendacja zamiast
    // 0,5–2 ×.  Uwaga: currentMin i currentMax odnoszą się do aktualnego
    // przedziału dawki mg/kg/dobę wyliczonego na podstawie wybranego leku
    // (w trybie rekomendowanym currentMin == currentMax dla leków o jednej dawce).
    const newMin = currentMin * 0.5;
    const newMax = currentMax * 1.5;
    // Uaktualnij zakresy w suwaku i polu liczbowym
    slider.min = newMin;
    slider.max = newMax;
    doseInput.min = newMin;
    doseInput.max = newMax;
    // Nie zmieniaj kroku – krok pozostaje zgodny z definicją (0,5 mg lub 1000 j.m.).
    // Zaciskaj bieżącą wartość w nowym zakresie.
    // W trybie „Chcę sam ustalić dawkowanie” ustawiamy suwak w pozycji
    // odpowiadającej aktualnej wartości suwaka (która w trybie
    // rekomendowanym reprezentuje zalecaną dawkę).  Jeżeli pole
    // liczbowego jest puste (np. dla leków z jedną dawką dobową),
    // use bieżącą wartość suwaka zamiast spadać do minimalnej wartości.
    let val = parseFloat(slider.value);
    // Jeśli suwak jest wyłączony (stała dawka) albo nie ustawiono na nim żadnej
    // wartości (pusty string, 0, NaN), spróbuj odczytać wartość z pola
    // liczbowego lub – w ostateczności – z domyślnej wartości (slider.min/slider.max).
    // To pozwala ustawić suwak w pozycji rekomendowanej dawki przy wejściu
    // w tryb własnej dawki nawet dla leków z jedną dopuszczalną wartością.
    const sliderMinVal = parseFloat(slider.min);
    const sliderMaxVal = parseFloat(slider.max);
    if(!isFinite(val) || val === 0 || slider.disabled || sliderMinVal === sliderMaxVal){
      // Preferuj wartość z pola liczbowego, jeśli jest poprawna.
      const inputVal = parseFloat(doseInput.value);
      if(isFinite(inputVal)){
        val = inputVal;
      } else if(isFinite(sliderMinVal)){
        // Gdy zakres jest stały (slider.min == slider.max), to jest to rekomendowana dawka
        val = sliderMinVal;
      } else {
        // Fallback do nowego minimum rozszerzonego zakresu
        val = newMin;
      }
    }
    // Clamp to the new range
    if(val < newMin) val = newMin;
    if(val > newMax) val = newMax;
    slider.value = val;
    doseInput.value = val;
    // Upewnij się, że dynamiczna etykieta wartości suwaka jest widoczna.
    // W niektórych konfiguracjach stylów etykieta może zostać ukryta
    // (np. w wyniku zastosowania display:none).  W trybie własnej dawki
    // wymusimy jej wyświetlanie poprzez resetowanie atrybutów display i visibility.
    const valueLabel = document.getElementById('sliderValueLabel');
    if(valueLabel){
      valueLabel.style.display = 'inline-block';
      valueLabel.style.visibility = 'visible';
      valueLabel.style.opacity = '1';
      // Podnieś etykietę nad suwakiem i innymi elementami (z-index domyślnie może być zbyt niski)
      valueLabel.style.zIndex = '10';
      // Wyczyść ewentualny podpowiednik z poprzednich ograniczeń (tooltip)
      valueLabel.removeAttribute('title');
    }
    // Dodaj wyróżnienie i zmień etykietę
    doseInput.classList.add('dose-out-of-range');
    if(doseLabel){ doseLabel.textContent = 'Wybrana dawka'; }
    // Pokaż przycisk powrotu, suwak musi pozostać aktywny
    if(returnBtn){
      returnBtn.classList.add('show-return');
      // Upewnij się, że suwak jest aktywny
      slider.disabled = false;
    }
    // Ukryj przycisk custom
    if(customBtn){ customBtn.style.display = 'none'; }
    // Zaktualizuj wygląd suwaka (etykiety krańcowe) oraz przelicz wynik
    updateSliderUI();
    recalc();
  }

  // Dodaj listenery na elementy formularza, aby dynamicznie aktualizować obliczenia.
  function attachEventListeners(){
    const indicSelect = document.getElementById('abxIndication');
    const drugSelect  = document.getElementById('abxDrug');
    const slider      = document.getElementById('abxDoseSlider');
    const doseInput   = document.getElementById('abxDoseInput');
    const durInput    = document.getElementById('abxDuration');
    const weightInput = document.getElementById('weight');
    if(indicSelect){
      indicSelect.addEventListener('change', () => {
        // Zmiana wskazania resetuje tryb własnej dawki
        if(customDoseActive){
          customDoseActive = false;
        }
        populateDrugs();
        recalc();
      });
    }
    if(drugSelect){
      drugSelect.addEventListener('change', () => {
        // Po zmianie antybiotyku zresetuj tryb własnej dawki i odśwież listy.
        if(customDoseActive){
          customDoseActive = false;
        }
        populateForms();
        updateDoseControls();
        recalc();
      });
    }
    if(slider){      slider.addEventListener('input', () => {
        // Synchronizuj pole liczbowego z suwakiem
        document.getElementById('abxDoseInput').value = slider.value;
        // Zaktualizuj dynamiczną etykietę suwaka natychmiast
        updateSliderValueLabel();
        // Przelicz wyniki
        recalc();
      }); }
    if(doseInput){
      // Aktualizuj suwak i etykietę w czasie wpisywania, ale nie przeliczaj
      // wyników, aby umożliwić swobodne edytowanie liczby.  Wyniki zostaną
      // przeliczone dopiero po zatwierdzeniu (change/blur).
      doseInput.addEventListener('input', () => {
        const val = parseFloat(doseInput.value);
        if(!isNaN(val)){
          document.getElementById('abxDoseSlider').value = val;
          updateSliderValueLabel();
        }
      });
      const finalizeDose = () => { recalc(); };
      doseInput.addEventListener('change', finalizeDose);
      doseInput.addEventListener('blur', finalizeDose);
    }
    if(durInput){
      // Przeliczaj wyniki dopiero po zakończeniu edycji czasu terapii.
      const finalizeDuration = () => { recalc(); };
      durInput.addEventListener('change', finalizeDuration);
      durInput.addEventListener('blur', finalizeDuration);
    }
    // Jeśli dostępny jest wybór preparatu, uwzględnij go w obliczeniach. Po zmianie postaci
    // konieczne jest również zaktualizowanie parametrów suwaka i jego etykiety (dla form jednostkowych).
    const formSelect  = document.getElementById('abxForm');
    if(formSelect){
      formSelect.addEventListener('change', () => {
        // Zmiana preparatu resetuje tryb własnej dawki
        if(customDoseActive){
          customDoseActive = false;
        }
        updateDoseControls();
        recalc();
      });
    }
    // Aktualizuj wyniki także po zmianie masy ciała w sekcji „Dane użytkownika”
    if(weightInput){
      // Po zmianie masy ciała resetuj tryb własnej dawki i przelicz zakresy.
      weightInput.addEventListener('input', () => {
        if(customDoseActive){
          customDoseActive = false;
        }
        populateForms();
        updateDoseControls();
        recalc();
      });
    }

    // Wyłącz niezależne przeciąganie dynamicznej etykiety suwaka. Ustawienie pointer-events
    // na "none" powoduje, że etykieta nie przechwytuje zdarzeń wskaźnika i nie może
    // być używana jako uchwyt do suwaka. Użytkownik nadal może regulować wartość
    // suwaka w tradycyjny sposób, ale przeciąganie etykiety nie będzie możliwe.
    const sliderValueLabelEl = document.getElementById('sliderValueLabel');
    if (sliderValueLabelEl) {
      // Zastosuj pointer-events:none na etykiecie, aby nie przechwytywała zdarzeń
      sliderValueLabelEl.style.pointerEvents = 'none';
    }

    // Aktualizuj dostępność wskazań w zależności od wieku.  Słuchamy zmian zarówno
    // w polu lat (#age), jak i w polu miesięcy (#ageMonths), ponieważ wiek
    // pacjenta może być wpisany częściowo w obu polach.  Za każdym
    // razem, gdy użytkownik zmieni te pola, ponownie oceniana jest możliwość
    // wyboru pozaszpitalnego zapalenia płuc u dorosłych lub u dzieci.
    const ageInputYears = document.getElementById('age');
    if(ageInputYears){
      ageInputYears.addEventListener('input', () => {
        // Aktualizuj dostępność wskazań w zależności od wieku
        updateIndicationAvailability();
        // Ponownie wygeneruj listę leków, ponieważ wiek wpływa na wybór antybiotyku (np. cefiksym vs cyprofloksacyna)
        populateDrugs();
        // Zmiana wieku może wpłynąć na dawkowanie i dobór preparatu
        // (np. wiek <18 vs ≥18), dlatego przelicz wyniki i odśwież listy
        populateForms();
        updateDoseControls();
        recalc();
      });
    }
    const ageInputMonths = document.getElementById('ageMonths');
    if(ageInputMonths){
      ageInputMonths.addEventListener('input', () => {
        // Aktualizuj dostępność wskazań w zależności od wieku
        updateIndicationAvailability();
        // Ponownie wygeneruj listę leków, ponieważ zmiana wieku (w miesiącach) wpływa na wybór antybiotyku
        populateDrugs();
        // Zmiana miesięcy również może zmienić kategorię wiekową (dziecko/dorosły)
        populateForms();
        updateDoseControls();
        recalc();
      });
    }

    // Aktualizuj wyniki po zmianie płci pacjenta.
    // Zmiana płci w sekcji „Dane użytkownika” może mieć wpływ na dostępne
    // ostrzeżenia (np. zakażenia układu moczowego u mężczyzn są traktowane jako powikłane).
    const sexInput = document.getElementById('sex');
    if(sexInput){
      sexInput.addEventListener('change', () => {
        // Wystarczy ponownie przeliczyć wyniki; selekcja leków i postaci nie zależy bezpośrednio od płci.
        recalc();
      });
    }

    // Dodaj obsługę przycisku powrotu do rekomendacji.  Ten przycisk jest
    // widoczny tylko wtedy, gdy użytkownik podał dawkę poza zalecanym
    // przedziałem lub gdy dawka mg/kg/dobę przekracza górny zakres.  Po
    // kliknięciu przywracane są domyślne wartości suwaka i czasu terapii,
    // ukrywany jest przycisk oraz wykonywane jest ponowne przeliczenie.
    const returnBtn = document.getElementById('abxReturnBtn');
    if(returnBtn){
      returnBtn.addEventListener('click', () => {
        // Przywróć domyślne ustawienia suwaka i pola dawki/duracji.
        // Wyłącz tryb własnej dawki, aby powrócić do standardowego zakresu.
        if(customDoseActive){ customDoseActive = false; }
        updateDoseControls();
        // Po aktualizacji suwaka ustaw czas terapii zgodnie z definicją wskazania.
        const indicKey = document.getElementById('abxIndication').value;
        const indic = ABX_INDICATIONS[indicKey];
        if(indic && indic.drugs){
          const drugName = document.getElementById('abxDrug').value;
          const drugDef  = indic.drugs[drugName];
          const durInput  = document.getElementById('abxDuration');
          if(drugDef && durInput){
            durInput.value = drugDef.duration;
          }
        }
        // Ukryj przycisk natychmiast po kliknięciu.
        returnBtn.classList.remove('show-return');
        // Włącz ponownie suwak (mógł być dezaktywowany, gdy dawka była poza zakresem).
        const sliderEl = document.getElementById('abxDoseSlider');
        if(sliderEl){
          sliderEl.disabled = false;
        }
        // Przelicz wyniki z domyślnymi wartościami.
        recalc();
      });
    }

    // Obsługa przycisku włączającego tryb własnego ustalania dawki.
    const customBtn = document.getElementById('abxCustomDoseBtn');
    if(customBtn){
      customBtn.addEventListener('click', () => {
        enableCustomDose();
      });
    }

    // Umożliw przeciąganie suwaka chwytając za dynamiczną etykietę wartości.
    // Etykieta (sliderValueLabel) działa jak uchwyt: po naciśnięciu i przeciąganiu
    // obliczana jest nowa wartość suwaka na podstawie położenia wskaźnika.
    const valueLabel = document.getElementById('sliderValueLabel');
    if (valueLabel && slider) {
      valueLabel.addEventListener('pointerdown', (e) => {
        // Nie reaguj, jeśli suwak jest dezaktywowany (stała dawka) lub wymuszone wyłączenie z powodu limitu dobowego
        if (slider.disabled) return;
        // Zapobiegaj zaznaczaniu tekstu i wyborowi podczas przeciągania
        e.preventDefault();
        const rect = slider.getBoundingClientRect();
        const minVal = parseFloat(slider.min);
        const maxVal = parseFloat(slider.max);
        const step = parseFloat(slider.step) || 1;
        // Funkcja pomocnicza obliczająca i ustawiająca wartość suwaka na podstawie współrzędnej X.
        // Obejmuje ona ograniczenie wartości do dataset.maxLimitValue, jeśli istnieje, oraz
        // ustawienie odpowiedniej podpowiedzi (tooltip) w przypadku osiągnięcia limitu.
        const setByClientX = (clientX) => {
          // Ułamek od 0 do 1 określający pozycję względem szerokości suwaka
          const fraction = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
          let newValue = minVal + fraction * (maxVal - minVal);
          // Zaokrąglamy do najbliższego kroku (krok = slider.step)
          newValue = Math.round(newValue / step) * step;
          // Liczba miejsc po przecinku zależna od kroku (np. 0.5 → 1 miejsce)
          const decimals = (step.toString().split('.')[1] || '').length;
          newValue = parseFloat(newValue.toFixed(decimals));
          // Ogranicz do dozwolonego zakresu slidera
          newValue = Math.max(minVal, Math.min(maxVal, newValue));
          // Jeżeli ustawiono ograniczenie maksymalnej wartości (dataset.maxLimitValue), zastosuj je
          const limitStr = slider.dataset.maxLimitValue;
          if (limitStr) {
            const limitVal = parseFloat(limitStr);
            if (isFinite(limitVal) && newValue > limitVal) {
              newValue = limitVal;
              // Ustaw podpowiedź na etykiecie informującą o osiągnięciu maksymalnej dawki dobowej
              valueLabel.setAttribute('title', 'Osiągnięto maksymalną dawkę dobową');
            } else {
              // Wyczyść podpowiedź, jeśli użytkownik znajduje się poniżej limitu
              valueLabel.removeAttribute('title');
            }
          } else {
            // Brak ograniczenia – usuń ewentualny poprzedni tooltip
            valueLabel.removeAttribute('title');
          }
          slider.value = newValue;
          // Wywołaj standardową obsługę zdarzenia „input” – synchronizuje pole liczbowego, etykietę i obliczenia
          slider.dispatchEvent(new Event('input'));
        };
        // Funkcja obsługująca ruch wskaźnika
        const onPointerMove = (moveEvent) => {
          setByClientX(moveEvent.clientX);
        };
        // Funkcja kończąca przeciąganie i czyszcząca nasłuchiwacze
        const onPointerUp = (upEvent) => {
          setByClientX(upEvent.clientX);
          document.removeEventListener('pointermove', onPointerMove);
          document.removeEventListener('pointerup', onPointerUp);
        };
        // Globalne nasłuchiwacze ruchu i zakończenia przeciągania
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        // Ustaw wartość początkową od razu po naciśnięciu
        setByClientX(e.clientX);
      });
    }
  }

  /*
   * Uaktualnia wygląd suwaka dawkowania. Funkcja ustawia tekst etykiet
   * minimalnej i maksymalnej wartości, generuje podziałkę co kilka mg oraz
   * aktualizuje etykietę bieżącej wartości. Podziałka jest widoczna
   * jedynie w trybie mg/kg/dobę; w trybie jednostek pokazujemy tylko
   * etykiety skrajne i bieżącą wartość. Funkcja jest wywoływana po
   * zmianie parametrów suwaka (zakresu lub wartości domyślnej).  
   */
  function updateSliderUI(){
    const slider = document.getElementById('abxDoseSlider');
    const ticksContainer = document.getElementById('sliderTicks');
    const doseDisplay = document.getElementById('abxDoseDisplay');
    if(!slider || !ticksContainer) return;
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    // Jeśli nie można obliczyć wartości lub zakres jest niepoprawny, wyczyść podziałkę i zakończ
    if(!isFinite(min) || !isFinite(max) || max < min){
      abxSetTrustedMarkup(ticksContainer, '', 'antibiotic slider ticks');
      updateSliderValueLabel();
      return;
    }
    // Wyczyść istniejące podziałki zawsze na początku
    abxSetTrustedMarkup(ticksContainer, '', 'antibiotic slider ticks');
    // Jeżeli minimalna i maksymalna wartość są identyczne, suwak reprezentuje stałą dawkę.
    // Nie generujemy specjalnej etykiety w podziałce – bieżący komunikat będzie
    // wyświetlony w etykiecie wartości poniżej suwaka (updateSliderValueLabel).
    if(min === max){
      // Ticks pozostaną puste; wartość zostanie obliczona w updateSliderValueLabel
      updateSliderValueLabel();
      return;
    }
    /*
     * W standardowym trybie (zakres wartości >0) usuwamy drobne podziałki
     * i pionowe linie łączące etykiety z linią suwaka.  Zamiast generować
     * wiele znaczników w równych odstępach pozostawiamy jedynie etykiety
     * skrajnych wartości.  Lewa etykieta jest wyrównana do początku
     * suwaka, a prawa do końca.  Pionowe linie nie są tworzone, dzięki
     * czemu suwak wygląda lżej i czytelniej.
     */
    // Wyłącz wyróżnianie wartości
    window.currentTickInterval = null;
    // Etykieta minimalnej wartości
    const leftLabel = document.createElement('div');
    leftLabel.className = 'slider-tick-label';
    leftLabel.style.left = '0%';
    leftLabel.style.transform = 'translateX(0)';
    leftLabel.textContent = fmt(min);
    ticksContainer.appendChild(leftLabel);
    // Etykieta maksymalnej wartości
    const rightLabel = document.createElement('div');
    rightLabel.className = 'slider-tick-label';
    rightLabel.style.left = '100%';
    rightLabel.style.transform = 'translateX(-100%)';
    rightLabel.textContent = fmt(max);
    ticksContainer.appendChild(rightLabel);
    // Na koniec zaktualizuj bieżącą etykietę wartości
    updateSliderValueLabel();
  }

  /*
   * Aktualizuje pozycję i treść dynamicznej etykiety bieżącej wartości na
   * suwaku. Wywoływana zarówno po inicjalizacji podziałki, jak i
   * podczas przeciągania suwaka oraz zmiany pola liczbowego. Wyróżnia
   * etykietę, jeżeli suwak zatrzymuje się na wartości odpowiadającej
   * znacznikowi podziałki.
   */
  function updateSliderValueLabel(){
    const slider = document.getElementById('abxDoseSlider');
    const valueLabel = document.getElementById('sliderValueLabel');
    const doseDisplay = document.getElementById('abxDoseDisplay');
    if(!slider || !valueLabel) return;
    const sliderContainer = slider.closest('.dose-slider-container');
    const setMultilineLabelMode = (enabled) => {
      const isEnabled = !!enabled;
      valueLabel.classList.toggle('slider-value-label--multiline', isEnabled);
      if(sliderContainer){
        sliderContainer.classList.toggle('dose-slider-container--multiline', isEnabled);
      }
      if(isEnabled){
        valueLabel.style.left = '';
        valueLabel.style.transform = '';
      }
    };
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const val = parseFloat(slider.value);
    if(!isFinite(min) || !isFinite(max) || !isFinite(val)) return;
    // Domyślnie przywróć jednoliniowy tryb etykiety. Tryb wielowierszowy
    // włączamy tylko dla dłuższych komunikatów, aby na małych ekranach
    // etykieta mogła zawijać się do szerokości kontenera i nie wychodziła poza viewport.
    setMultilineLabelMode(false);
    // Jeżeli suwak jest całkowicie wyłączony z powodu przekroczenia limitu dobowego (forceMaxDose),
    // wyświetl specjalny komunikat i przełącz etykietę na tryb wielowierszowy.
    if (slider.dataset && slider.dataset.forceMaxDose === 'true') {
      valueLabel.textContent = 'Zastosowano maksymalną dobową dawkę leku';
      setMultilineLabelMode(true);
      return;
    }
    // Jeżeli suwak jest dezaktywowany (zakres minimalny i maksymalny są równe),
    // zastąp dynamiczną etykietę komunikatem o stałej dawce. Etykieta jest
    // automatycznie zawijana na małych ekranach, aby nie psuła widoku mobilnego.
    if(slider.disabled || min === max){
      // Ustal jednostkę (mg/kg/dobę lub j.m./kg/dobę) na podstawie pola wyświetlania
      let unitText = '';
      if(doseDisplay && typeof doseDisplay.textContent === 'string' && doseDisplay.textContent.trim().length > 0){
        unitText = doseDisplay.textContent.trim();
      } else {
        unitText = 'mg/kg/dobę';
      }
      valueLabel.textContent = `W tym wskazaniu rekomendowana jest stała dawka ${fmt(min)} ${unitText} wybranego leku`;
      setMultilineLabelMode(true);
      return;
    }
    // W przeciwnym wypadku aktualizuj etykietę bieżącej wartości jak dotychczas
    const percent = ((val - min) / (max - min)) * 100;
    // Ustaw pozycję etykiety: przyjmij procent na osi X
    valueLabel.style.left = percent + '%';
    // Format tekstu: używamy funkcji fmt() do przycięcia zer.
    const isUnitMode = doseDisplay && /j\.m/.test(doseDisplay.textContent);
    // Do dynamicznej etykiety dołączamy jednostkę (mg/kg/dobę lub j.m./kg/dobę)
    // pobraną z pola abxDoseDisplay. Dzięki temu użytkownik zawsze widzi, w
    // jakich jednostkach operuje suwak. Jeżeli z jakiegoś powodu nie
    // odnajdziemy pola abxDoseDisplay, domyślnie przyjmujemy „mg/kg/dobę”.
    let unitText = '';
    if (doseDisplay && typeof doseDisplay.textContent === 'string' && doseDisplay.textContent.trim().length > 0) {
      unitText = ' ' + doseDisplay.textContent.trim();
    } else {
      unitText = ' mg/kg/dobę';
    }
    valueLabel.textContent = fmt(val) + unitText;
    // Ensure the label never protrudes outside the slider container.
    // Compute the position of the label in pixels relative to its container and
    // adjust the horizontal transform so that the label remains fully visible.
    const containerEl = slider.parentElement;
    const containerWidth = containerEl ? containerEl.getBoundingClientRect().width : 0;
    const labelWidth = valueLabel.getBoundingClientRect().width;
    const posPx = (percent / 100) * containerWidth;
    if (containerWidth && labelWidth) {
      if (posPx - labelWidth / 2 < 0) {
        // Align to the left when the label would otherwise overflow the left edge
        valueLabel.style.transform = 'translateX(0)';
      } else if (posPx + labelWidth / 2 > containerWidth) {
        // Align to the right when the label would otherwise overflow the right edge
        valueLabel.style.transform = 'translateX(-100%)';
      } else {
        // Otherwise center the label over the slider thumb
        valueLabel.style.transform = 'translateX(-50%)';
      }
    } else {
      // Fallback: center the label
      valueLabel.style.transform = 'translateX(-50%)';
    }
    // Wyróżnij etykietę, jeśli znajduje się ona blisko znaku podziałki.
    // Obecnie, gdy podziałka jest ukryta (currentTickInterval=null), ten blok
    // pozostaje wyłączony.  Zachowujemy go na wypadek ewentualnego
    // przywrócenia podziałki w przyszłości.
    valueLabel.classList.remove('active');
    const interval = window.currentTickInterval;
    if (interval && !isUnitMode) {
      const diff = Math.abs((val - min) % interval);
      const threshold = interval * 0.1;
      if (diff < threshold || Math.abs(diff - interval) < threshold) {
        valueLabel.classList.add('active');
      }
    }
  }

  function captureAntibioticPersistState(){
    const card = document.getElementById('antibioticTherapyCard');
    if(!card) return null;
    const getValue = (id) => {
      const el = document.getElementById(id);
      if(!el) return '';
      return typeof el.value === 'string' ? el.value : String(el.value == null ? '' : el.value);
    };
    return {
      indication: getValue('abxIndication'),
      drug: getValue('abxDrug'),
      form: getValue('abxForm'),
      dose: getValue('abxDoseInput'),
      duration: getValue('abxDuration'),
      customDoseActive: !!customDoseActive,
      schemesVisible: !!schemesVisible
    };
  }

  function readSharedPersistSnapshot(){
    try {
      const adapter = (typeof window !== 'undefined' && window.VildaPersistence && typeof window.VildaPersistence.readSharedPersist === 'function')
        ? window.VildaPersistence
        : null;
      if (!adapter) return null;
      return adapter.readSharedPersist({ ensurePersist: false });
    } catch (error) {
      logAbxWarn('Nie udało się odczytać snapshotu persistence antybiotykoterapii', error);
      return null;
    }
  }

  function readAntibioticPersistFallback(){
    const snapshot = readSharedPersistSnapshot();
    if (!snapshot) return null;
    try {
      const byId = snapshot.byId && typeof snapshot.byId === 'object' ? snapshot.byId : {};
      const out = {
        indication: byId.abxIndication || '',
        drug: byId.abxDrug || '',
        form: byId.abxForm || '',
        dose: byId.abxDoseInput || '',
        duration: byId.abxDuration || '',
        customDoseActive: false,
        schemesVisible: false
      };
      return Object.values(out).some((value) => String(value || '') !== '' && value !== false) ? out : null;
    } catch (error) {
      logAbxWarn('Nie udało się zbudować fallbacku persistence antybiotykoterapii', error);
      return null;
    }
  }

  function restoreAntibioticPersistState(state){
    const saved = (state && typeof state === 'object') ? state : readAntibioticPersistFallback();
    if(!saved || typeof saved !== 'object') return false;
    mountCard();
    const indicSelect = document.getElementById('abxIndication');
    const drugSelect = document.getElementById('abxDrug');
    const formSelect = document.getElementById('abxForm');
    const doseInput = document.getElementById('abxDoseInput');
    const durInput = document.getElementById('abxDuration');
    const slider = document.getElementById('abxDoseSlider');
    if(!indicSelect || !drugSelect || !formSelect || !doseInput || !durInput || !slider) return false;

    customDoseActive = false;
    schemesVisible = !!saved.schemesVisible;

    const hasOption = (selectEl, value) => {
      if(!selectEl) return false;
      return Array.from(selectEl.options || []).some((opt) => String(opt.value) === String(value));
    };

    if(saved.indication && hasOption(indicSelect, saved.indication)) {
      indicSelect.value = saved.indication;
    }
    populateDrugs();

    if(saved.drug && hasOption(drugSelect, saved.drug)) {
      drugSelect.value = saved.drug;
    }
    populateForms();

    if(saved.form && hasOption(formSelect, saved.form)) {
      formSelect.value = saved.form;
    }
    updateDoseControls();

    if(String(saved.duration || '') !== '') {
      durInput.value = String(saved.duration);
    }

    if(saved.customDoseActive) {
      enableCustomDose();
    } else {
      customDoseActive = false;
    }

    if(String(saved.dose || '') !== '') {
      doseInput.value = String(saved.dose);
      slider.value = String(saved.dose);
    }

    if(typeof updateSchemesButton === 'function') {
      updateSchemesButton();
    }
    if(typeof updateSliderUI === 'function') {
      updateSliderUI();
    }
    recalc();
    return true;
  }

  function resetAntibioticPersistState(options){
    const opts = (options && typeof options === 'object') ? options : {};
    customDoseActive = false;
    schemesVisible = false;
    try {
      if (typeof window !== 'undefined') {
        window.lastEffectiveMax = null;
        window.maxValueAllowed = null;
        window.sliderDisabledByLimit = false;
      }
    } catch (error) { logAbxWarn('Zignorowany błąd pomocniczy w module antybiotykoterapii', error); }

    const card = document.getElementById('antibioticTherapyCard');
    if (card) {
      try { populateIndications(); } catch (error) { logAbxWarn('Zignorowany błąd pomocniczy w module antybiotykoterapii', error); }
      const indicSelect = document.getElementById('abxIndication');
      const drugSelect = document.getElementById('abxDrug');
      const formSelect = document.getElementById('abxForm');
      const doseInput = document.getElementById('abxDoseInput');
      const durInput = document.getElementById('abxDuration');
      const slider = document.getElementById('abxDoseSlider');
      const controls = document.getElementById('abxControls');
      const promptEl = document.getElementById('abxInitialPrompt');
      const note = document.getElementById('abxNote');
      const result = document.getElementById('abxResult');
      const info = document.getElementById('abxInfo');
      const schemes = document.getElementById('abxSchemesContainer');
      const customBtn = document.getElementById('abxCustomDoseBtn');
      const returnBtn = document.getElementById('abxReturnBtn');
      const doseLabel = document.getElementById('abxDoseInputLabelText');

      if (indicSelect) {
        try { indicSelect.selectedIndex = 0; } catch (error) { logAbxWarn('Zignorowany błąd pomocniczy w module antybiotykoterapii', error); }
        indicSelect.value = '';
      }
      if (drugSelect) abxClearElement(drugSelect);
      if (formSelect) abxClearElement(formSelect);
      if (doseInput) {
        doseInput.value = '';
        doseInput.classList.remove('dose-out-of-range');
      }
      if (durInput) durInput.value = '';
      if (slider) {
        slider.value = '';
        slider.disabled = false;
        try {
          delete slider.dataset.forceMaxDose;
          delete slider.dataset.maxLimitValue;
        } catch (error) { logAbxWarn('Zignorowany błąd pomocniczy w module antybiotykoterapii', error); }
      }
      if (controls) controls.style.display = 'none';
      if (promptEl) promptEl.style.display = 'block';
      if (note) note.textContent = '';
      if (result) abxClearElement(result);
      if (info) abxSetTrustedMarkup(info, '', 'antibiotic info');
      if (schemes) abxClearElement(schemes);
      if (customBtn) customBtn.style.display = 'none';
      if (returnBtn) {
        returnBtn.style.display = 'none';
        returnBtn.classList.remove('show-return');
      }
      if (doseLabel) doseLabel.textContent = 'Rekomendowana dawka';
      if (opts.hideCard) {
        try { card.style.display = 'none'; } catch (error) { logAbxWarn('Zignorowany błąd pomocniczy w module antybiotykoterapii', error); }
      }
    }

    try {
      const toggle = document.getElementById('toggleAbxTherapy');
      if (toggle) toggle.classList.remove('active-toggle');
    } catch (error) { logAbxWarn('Zignorowany błąd pomocniczy w module antybiotykoterapii', error); }
    return true;
  }

  function handleAntibioticUserStateCleared(){
    resetAntibioticPersistState({ hideCard: true });
  }

  function handleAntibioticModuleStateCleared(event){
    const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
    const scope = String(detail.scope || 'all').toLowerCase();
    if (scope === 'all' || scope === '*' || scope === 'antibiotic') {
      resetAntibioticPersistState({ hideCard: true });
    }
  }

  try {
    if(typeof window !== 'undefined') {
      window.vildaAbxPersistApi = {
        ensureMounted: mountCard,
        captureState: captureAntibioticPersistState,
        restoreState: restoreAntibioticPersistState,
        resetState: resetAntibioticPersistState
      };
      if (!window.__vildaAbxUserStateClearedBound && typeof window.addEventListener === 'function') {
        window.__vildaAbxUserStateClearedBound = true;
        window.addEventListener('vilda:user-state-cleared', handleAntibioticUserStateCleared);
        window.addEventListener('vilda:module-state-cleared', handleAntibioticModuleStateCleared);
      }
    }
  } catch (error) { logAbxWarn('Zignorowany błąd pomocniczy w module antybiotykoterapii', error); }

  // Po załadowaniu DOM rejestrujemy przycisk i obsługę jego kliknięcia.
  function setupAntibioticTherapyToggle(){
    const btn = document.getElementById('toggleAbxTherapy');
    if(btn){
      btn.addEventListener('click', function(e){
        // Używamy fazy capture, aby zatrzymać ewentualną propagację i uniknąć
        // kolizji z innymi przyciskami w module profesjonalnym.
        e.stopPropagation();
        mountCard();
        const card = document.getElementById('antibioticTherapyCard');
        if(!card) return;
        // Sprawdź aktualny stan widoczności karty
        const currentlyVisible = card.style.display !== 'none' && card.style.display !== '';
        // Przełącz widoczność karty
        card.style.display = currentlyVisible ? 'none' : 'block';
        // Podświetl przycisk, gdy karta jest widoczna; usuń podświetlenie, gdy karta jest schowana
        if(!currentlyVisible){
          btn.classList.add('active-toggle');
        } else {
          btn.classList.remove('active-toggle');
        }
      }, true);
    }
  }

  function bootAntibioticTherapyModule(){
    if (typeof window !== 'undefined' && typeof window.vildaOnReady === 'function') {
      window.vildaOnReady('antibiotic-therapy:toggle', setupAntibioticTherapyToggle);
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupAntibioticTherapyToggle, { once: true });
    } else {
      setupAntibioticTherapyToggle();
    }
  }

  bootAntibioticTherapyModule();

  // Koniec modułu antybiotykoterapii
