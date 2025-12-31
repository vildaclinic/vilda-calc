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
  // Definicja leków: zawartość substancji w 5 ml oraz dostępne objętości
  // opakowań syropów. Dane te zaczerpnięto z oficjalnych serwisów
  // farmaceutycznych i kart produktów producentów (np. doz.pl)【724546245777698†screenshot】.
  const DRUG_INFO = {
    // Monopreparaty: zawiesiny lub roztwory, klucze stanowią nazwy leków.
    // Amoksycylina występuje w dwóch głównych stężeniach zawiesin do stosowania
    // doustnego: 250 mg/5 ml oraz 500 mg/5 ml. Zgodnie z Charakterystyką
    // Produktu Leczniczego dla preparatu Amotaks, granulat o mocy 500 mg/5 ml
    // rekonstrukuje się do 60 ml lub 100 ml zawiesiny【202708336831534†L1085-L1132】.
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
          // odpowiednio 60 ml lub 100 ml zawiesiny【202708336831534†L1104-L1132】.
          packaging: [60, 100],
          formType: 'suspension'
        },
        // Wprowadzenie tabletek amoksycyliny na podstawie Charakterystyki Produktu Leczniczego:
        // Amoxicillin MIP Pharma 500 mg i 1000 mg w blistrach po 8 lub 24 (500 mg) oraz 8 lub 16 (1000 mg) tabletek【48486770934528†L1010-L1013】.
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
        // Ulotka preparatu Duomox podaje, że każda z mocy 250 mg, 375 mg, 500 mg, 750 mg i 1 g jest pakowana po 20 tabletek【728270158523889†L558-L569】.
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
    // dostępna w butelkach 35 ml, 70 ml, 100 ml oraz 140 ml【406332432356125†L468-L487】. Wysokodawkowa
    // zawiesina ES 600 mg/5 ml (600 mg amoksycyliny + 42,9 mg kwasu
    // klawulanowego w 5 ml) jest dostępna w butelkach 50 ml i 100 ml【759532590181075†L450-L503】.
    // Tabletki powlekane i do sporządzania zawiesiny (QuickTab/Co‑amoxiclav) zawierają
    // odpowiednio 500 mg + 125 mg lub 875 mg + 125 mg amoksycyliny i są sprzedawane
    // w opakowaniach po 14 lub 30 sztuk【70338428334129†L1011-L1016】.
    'Amoksycylina z kwasem klawulanowym': {
      forms: {
        'Zawiesina 400 mg/57 mg/5 ml': {
          // Każde 5 ml standardowej zawiesiny zawiera 400 mg amoksycyliny i
          // 57 mg kwasu klawulanowego. Zgodnie z ulotką, przygotowana
          // zawiesina jest dostępna w butelkach pozwalających uzyskać 35 ml,
          // 70 ml lub 140 ml roztworu【406332432356125†L468-L487】, dlatego zestaw
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
        // Zawiesina doustna 125 mg/5 ml i 250 mg/5 ml w butelkach 50 ml i 100 ml【689103595859727†L0-L13】【203996553169954†L260-L266】.
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
        // Tabletki aksetylu cefuroksymu są sprzedawane w blistrach po 10 sztuk【206863740369237†L529-L533】.
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
        // 750 mg, 1000 mg i 1500 mg【986456471617472†L0-L6】. W materiałach
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
    // w butelkach 60 ml i 100 ml【123300810807228†L1846-L1851】; zawiesina
    // 250 mg/5 ml w butelkach 50 ml, 60 ml i 100 ml【102936785600878†L700-L703】; tabletki
    // 250 mg sprzedawane są w opakowaniach po 10 i 14 sztuk【847278878374628†L1832-L1835】;
    // tabletki 500 mg w opakowaniach po 14, 20 i 42 sztuki【553357385643251†L1797-L1802】.
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
    // po rekonstytucji daje 20 ml zawiesiny【422551086230723†L1649-L1653】. Dla stężenia 200 mg/5 ml
    // istnieje kilka wariantów: 600 mg (15 ml), 800 mg (20 ml), 900 mg (22,5 ml), 1200 mg (30 ml)
    // oraz 1500 mg (37,5 ml)【422551086230723†L1654-L1672】. Sumamed forte 200 mg/5 ml oferuje
    // butelki do sporządzenia 20 ml, 30 ml i 37,5 ml zawiesiny【923333179549339†L559-L562】.
    // Tabletki zawierają 250 mg lub 500 mg azytromycyny; najczęściej sprzedawane
    // są w opakowaniach po 6 tabletek (250 mg) lub 3 tabletki (500 mg), co
    // odpowiada standardowym kuracjom 3‑ i 5‑dniowym.
    'Azytromycyna': {
      forms: {
        'Zawiesina 100 mg/5 ml': {
          // 5 ml zawiesiny zawiera 100 mg azytromycyny, butelka po rekonstrukcji 20 ml【422551086230723†L1649-L1653】.
          mgPer5ml: 100,
          packaging: [20],
          formType: 'suspension'
        },
        'Zawiesina 200 mg/5 ml': {
          // 5 ml zawiesiny zawiera 200 mg azytromycyny; dostępne warianty objętości
          // po rekonstytucji to 15 ml, 20 ml, 22,5 ml, 30 ml i 37,5 ml【422551086230723†L1654-L1672】.
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
            sztuk w blistrach【248456555946661†L499-L510】. W kalkulatorze
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
            po 2, 3, 6 lub nawet 30 sztuk【248456555946661†L512-L519】. W kalkulatorze
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
    // opakowania zawierające 1, 10, 25 lub 50 fiolki【136686595724070†L290-L297】.
    'Cefotaksym': {
      forms: {
        // Zgodnie z polską Charakterystyką Produktu Leczniczego Biotaksym
        // (cefuroksym sodowy, Polpharma) fiolka o pojemności 26 ml zawiera 1 g
        // lub 2 g cefotaksymu i opakowanie może zawierać 1 lub 10 fiolek【409289296472662†L970-L980】.
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
    // fiolek 1 g oraz 1 lub 10 fiolek 2 g【293301184886378†L405-L409】.
    'Ceftriakson': {
      forms: {
        // Charakterystyka produktu leczniczego Ceftriaxon Kabi 1 g (Fresenius Kabi)
        // podaje, że wielkości opakowań to 5 i 10 fiolek【765030907120407†L1485-L1491】.
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
    // lub 100 fiolek【982204843025270†L317-L321】.
    // Fenoksymetylpenicylina (penicylina V) – lek pierwszego wyboru w
    // paciorkowcowym zapaleniu gardła i migdałków. Dostępna w postaci
    // zawiesin i tabletek. Jedna dawka 5 ml zawiesiny Ospen 750 zawiera
    // 750 000 j.m. (jednostek międzynarodowych) fenoksymetylpenicyliny【434395716885121†L774-L808】.
    // Granulat Polcylin 100 mg/ml po odtworzeniu daje stężenie 100 mg/ml
    // (500 mg w 5 ml), dostępny w butelkach 60 ml i 125 ml【434395716885121†L774-L808】.
    // Tabletki powlekane Ospen zawierają 1 000 000 j.m. lub 1 500 000 j.m.
    // fenoksymetylpenicyliny i są pakowane po 30 sztuk【434395716885121†L774-L808】.
    'Fenoksymetylpenicylina': {
      forms: {
        /*
         * Ospen 750 000 j.m./5 ml – zawiesina o stężeniu 750 000 jednostek
         * fenoksymetylpenicyliny w 5 ml. Zgodnie z przelicznikiem 1 000 000 j.m.
         * odpowiada ok. 654 mg fenoksymetylpenicyliny, więc 750 000 j.m. daje
         * 0,75 × 654 mg ≈ 490 mg w 5 ml. W kalkulatorze używamy wartości 490 mg
         * jako mgPer5ml. Preparat dostępny w butelkach 150 ml【434395716885121†L774-L808】.
         */
        'Zawiesina 750 000 j.m./5 ml': {
          // Ospen 750 zawiera 750 000 j.m. w 5 ml; odpowiada to ok. 490 mg【434395716885121†L774-L808】.
          mgPer5ml: 490,
          // Liczba jednostek międzynarodowych na 5 ml (do użytku przy przeliczaniu).
          unitsPer5ml: 750000,
          // Ulotka Ospen 750 wskazuje, że gotowa zawiesina jest dostępna w butelkach 60 ml
          // lub 150 ml【369903302182571†L520-L527】.
          packaging: [60, 150],
          formType: 'suspension'
        },
        // Polcylin 100 mg/ml to granulat do sporządzania zawiesiny; w 5 ml
        // zawiera 500 mg fenoksymetylpenicyliny. Dostępne butelki 60 ml i 125 ml【434395716885121†L774-L808】.
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
         * zazwyczaj po 30 tabletek【434395716885121†L774-L808】.
         */
        'Tabletka 1 000 000 j.m.': {
          // Jedna tabletka zawiera 1 000 000 j.m. fenoksymetylpenicyliny, co odpowiada ok. 654 mg【771311657500760†L12-L18】.
          mgPerTablet: 654,
          unitsPerTablet: 1000000,
          packaging: [30],
          formType: 'tablet'
        },
        'Tabletka 1 500 000 j.m.': {
          // Jedna tabletka zawiera 1 500 000 j.m. (≈ 981 mg)【771311657500760†L12-L18】.
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
     * dostępne są zawiesiny 250 mg/5 ml (Valdocef) w butelkach 100 ml【23755977830815†L910-L924】.
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
     * każda w butelkach 100 ml【925965375433259†L387-L387】. Dostępne są również
     * kapsułki 250 mg i 500 mg pakowane w blistry po 16 kapsułek【724235995599015†L446-L449】.
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
     * o przedłużonym uwalnianiu 375 mg (MR) i 500 mg【402805744907835†screenshot】.  
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
     * oraz 80 ml gotowego roztworu【463090470837982†L620-L623】. Kapsułki 150 mg
     * są pakowane po 12, 16 lub 100 sztuk, natomiast kapsułki 300 mg po 16 sztuk【64252282737176†L680-L687】.
     */
    'Klindamycyna': {
      forms: {
        // Preparat Dalacin C jest sprzedawany w postaci granulatu do sporządzania
        // zawiesiny; po rekonstytucji 5 ml zawiera 75 mg klindamycyny i
        // powstaje 80 ml gotowego roztworu【463090470837982†L620-L623】. Nazwa "Granulat"
        // lepiej odzwierciedla postać handlową niż ogólne "Zawiesina", dlatego
        // stosujemy tę etykietę w definicji formy.
        'Granulat 75 mg/5 ml': {
          mgPer5ml: 75,
          packaging: [80],
          formType: 'suspension'
        },
        // Kapsułki 150 mg pakowane są po 12, 16 lub 100 sztuk【64252282737176†L680-L687】.
        'Kapsułka 150 mg': {
          mgPerTablet: 150,
          packaging: [12, 16, 100],
          formType: 'tablet'
        },
        // Kapsułki 300 mg pakowane są po 16 sztuk【64252282737176†L680-L687】.
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
        // 5 ml zawiesiny odpowiada 50 mg furazydyny. Butelka zawiera 140 ml przygotowanego roztworu【305154790840983†L5-L36】【305154790840983†L520-L537】.
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
        // wynosi przeciętnie 480 mg kotrimoksazolu co 12 h【705892490472690†L106-L113】.
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
        // Bardziej stężona zawiesina 200 mg/5 ml pozwala zmniejszyć objętość podawanej
        // dawki u większych dzieci. Według ulotki preparatu Suprax dostępne są
        // butelki 50 ml, 75 ml i 100 ml【2804955795389†L410-L434】.
        'Zawiesina 200 mg/5 ml': {
          mgPer5ml: 200,
          packaging: [50, 75, 100],
          formType: 'suspension'
        },
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
        // wspomina o butelkach 60 ml, 90 ml i 120 ml【47187464076196†L990-L1005】.
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
     * Lewofloksacyna – fluorochinolon o szerokim spektrum aktywności, stosowany
     * w powikłanych zakażeniach dróg moczowych i odmiedniczkowym zapaleniu
     * nerek. Tabletki 500 mg są najczęściej sprzedawane w opakowaniach po 10
     * lub 20 sztuk; roztwór do infuzji zawiera 500 mg leku w 100 ml.
     */
    'Lewofloksacyna': {
      forms: {
        'Tabletka 500 mg': {
          mgPerTablet: 500,
          packaging: [10, 20],
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
     * Doksycyklina – tetracyklina stosowana doustnie w zakażeniach dróg oddechowych.
     * Preparaty w Polsce najczęściej zawierają 100 mg doksycykliny w kapsułce lub tabletce.
     * Standardowe opakowania zawierają 10 lub 20 sztuk【134088552160192†L41-L56】.
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
     * stosuje się 200 mg dwa razy na dobę【134088552160192†L63-L92】. Przyjmujemy opakowania
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
     * 5 lub 10 tabletek【134088552160192†L120-L127】.
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
      'Zawiesina 750 000 j.m./5 ml': ['Ospen 750', 'Polcillin 750'],
      // Uwaga: w formularzu granulat fenoksymetylpenicyliny opisany jest jako "Granulat 100 mg/ml (5 ml = 500 mg)".
      // Dlatego klucz w mapie musi dokładnie odpowiadać tej etykiecie, aby brandy mogły zostać znalezione.
      'Granulat 100 mg/ml (5 ml = 500 mg)': ['Polcillin 100 mg/ml'],
      'Tabletka 1 000 000 j.m.': ['Ospen 1000'],
      'Tabletka 1 500 000 j.m.': ['Ospen 1500']
    },
    'Amoksycylina': {
      // Zawiesina 250 mg/5 ml – brandy: Amotaks, Ospamox, Hiconcil. Dodajemy też wpisy z normalnymi spacjami,
      // aby obsłużyć etykiety formularza z łańcuchem "mg/5 ml".
      'Zawiesina 250 mg/5 ml': ['Amotaks', 'Ospamox', 'Hiconcil'],
      'Zawiesina 250 mg/5 ml': ['Amotaks', 'Ospamox', 'Hiconcil'],
      // Zawiesina 500 mg/5 ml: na rynku dostępne są Amotaks i Ospamox – warianty "Forte" i Hiconcil 500 mg/5 ml nie istnieją【17†L78-L86】【17†L95-L103】.
      'Zawiesina 500 mg/5 ml': ['Amotaks', 'Ospamox'],
      'Zawiesina 500 mg/5 ml': ['Amotaks', 'Ospamox'],
      // Tabletki (monopreparaty amoksycyliny) – na podstawie CHPL Amoxicillin MIP Pharma【48486770934528†L1010-L1013】.
      'Tabletka 500 mg': ['Amoxicillin MIP', 'Ospamox', 'Hiconcil', 'Amotaks'],
      // Tabletka 1000 mg: dostępne są Amoxicillin MIP Pharma, Ospamox 1000 mg i Amotaks 1 g. Hiconcil 1 g nie jest dostępny【28†L112-L120】.
      'Tabletka 1000 mg': ['Amoxicillin MIP', 'Ospamox 1 g', 'Amotaks 1 g'],
      // Tabletki do sporządzania zawiesiny ("Dis") – o różnych mocach; popularne brandy to Duomox oraz warianty Amotaks Dis/Ospamox Dis.
      'Tabletka do sporządzania zawiesiny 250 mg': ['Duomox 250'],
      'Tabletka do sporządzania zawiesiny 375 mg': ['Duomox 375'],
      // Tabletki do sporządzania zawiesiny 500 mg: Ospamox Dis w tej formie nie jest dostępny – usuwamy go【21†L163-L171】.
      'Tabletka do sporządzania zawiesiny 500 mg': ['Duomox 500', 'Amotaks Dis'],
      'Tabletka do sporządzania zawiesiny 750 mg': ['Duomox 750', 'Amotaks Dis 750'],
      'Tabletka do sporządzania zawiesiny 1 g': ['Duomox 1000', 'Amotaks Dis 1000']
    },
    'Amoksycylina z kwasem klawulanowym': {
      'Zawiesina 400 mg/57 mg/5 ml': ['Amoksiklav', 'Augmentin', 'Taromentin'],
      'Zawiesina 600 mg/42,9 mg/5 ml (ES)': ['Amoksiklav ES', 'Augmentin ES'],
      'Tabletka 500 mg/125 mg': ['Amoksiklav', 'Augmentin'],
      // Tabletka 875 mg/125 mg: w Polsce stosuje się nazwy Amoksiklav 875 mg/125 mg i Augmentin 875 mg/125 mg (często oznaczane jako 1 g),
      // określenie "Forte" w przypadku tabletek jest nieoficjalne【32†L29-L37】【36†L94-L102】.
      'Tabletka 875 mg/125 mg': ['Amoksiklav', 'Augmentin', 'Amoksiklav Quicktab']
    },
    'Aksetyl cefuroksymu': {
      'Zawiesina 125 mg/5 ml': ['Zinnat', 'Ceroxim'],
      // Wersje „Forte” (250 mg/5 ml i tabletki 500 mg) nie są zarejestrowane w Polsce【881048865350420†L100-L104】, dlatego pozostawiamy podstawowe nazwy.
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
    'Klindamycyna': {
      // Preparat Dalacin C występuje w postaci granulatu do sporządzania
      // zawiesiny 75 mg/5 ml oraz w kapsułkach 150 mg i 300 mg. Zgodnie z
      // definicją form powyżej, klucze w mapie muszą dokładnie odpowiadać
      // etykietom formularza, aby nazwy handlowe były prawidłowo przypisywane.
      'Granulat 75 mg/5 ml': ['Dalacin C'],
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
      'Zawiesina 100 mg/5 ml': ['Suprax', 'Ranfix'],
      'Zawiesina 100 mg/5 ml': ['Suprax', 'Ranfix'],
      'Tabletka 400 mg': ['Suprax 400', 'Ranfix 400'],
      'Tabletka 400 mg': ['Suprax 400', 'Ranfix 400']
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
     * Lewofloksacyna – fluorochinolon. W Polsce dostępne preparaty to Tavanic
     * oraz Levoxa (tabletki) i Tavanic w infuzji.
     */
    'Lewofloksacyna': {
      'Tabletka 500 mg': ['Tavanic', 'Levoxa'],
      'Tabletka 500 mg': ['Tavanic', 'Levoxa'],
      'Roztwór 500 mg/100 ml': ['Tavanic i.v.'],
      'Roztwór 500 mg/100 ml': ['Tavanic i.v.']
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
  function buildAntipyreticLine(weight, age){
    // Określ, czy stosować preparaty Forte. Zgodnie z zaleceniem:
    // * u młodszych/lżejszych dzieci (<10 kg lub <12 mies.) stosujemy preparaty
    //   standardowe (niższe stężenie);
    // * u starszych/cięższych dzieci (≥10 kg lub ≥1 rok) stosujemy preparaty
    //   Forte (wyższe stężenie).  Wartość `age` może być null, gdy wiek nie
    //   został wprowadzony; wówczas decyzja opiera się wyłącznie na masie.
    let useForte = false;
    // Ustal czy dziecko spełnia kryterium masy lub wieku dla preparatu Forte.
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
    // Obliczenia dla Pedicetamolu (100 mg/ml), dostępnego dla dzieci ≤32 kg. Nie zaokrąglamy
    // do 0,25 ml – stosujemy pełne przeliczenie z dokładnością do dwóch miejsc.
    let pedPart = '';
    if(weight <= 32){
      // Oblicz objętość Pedicetamolu (100 mg/ml). Dawki 15 mg/kg co 6 h i 10 mg/kg co 4 h.
      // Zaokrąglij wynik do 0,1 ml (jedno miejsce po przecinku), ponieważ lek ten wymaga
      // precyzyjnego dawkowania. Zmienna fmt w dalszej części sformatuje
      // wynik do dwóch miejsc, zachowując 0,10 ml jako 0,10 czy 0,20 ml.
      let pedVol6 = (weight * 15) / 100;
      let pedVol4 = (weight * 10) / 100;
      // Rounding to nearest 0,1 ml
      pedVol6 = Math.round(pedVol6 * 10) / 10;
      pedVol4 = Math.round(pedVol4 * 10) / 10;
      const pedVol6Str = fmt(pedVol6);
      const pedVol4Str = fmt(pedVol4);
      pedPart = `; Pedicetamol – ${pedVol6Str} ml na dawkę (15 mg/kg) co 6 godzin lub ${pedVol4Str} ml na dawkę (10 mg/kg) co 4 godziny`;
    }
    return `Leki przeciwgorączkowe: ibuprofen np. ${iboBrands} – ${iboMlStr} ml na dawkę, maksymalnie 4 × na dobę (co 6 godzin); paracetamol np. ${parBrand} – ${parVol6Str} ml na dawkę (15 mg/kg) co 6 godzin lub ${parVol4Str} ml na dawkę (10 mg/kg) co 4 godziny${pedPart}.`;
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
  function generateRecommendation(brandName, dosesPerDay, doseStr, duration){
    const firstLine = `${brandName} – ${dosesPerDay} × dziennie po ${doseStr} przez ${duration} dni.`;
    const secondLine = 'Probiotyk 1 × dziennie przez 14 dni.';
    // Dodaj punkt 3 z lekami przeciwgorączkowymi, jeśli znane są dane pacjenta
    const weight = (typeof getWeight === 'function') ? getWeight() : null;
    const ageVal = (typeof getAge === 'function') ? getAge() : null;
    let base = `1. ${firstLine}\n2. ${secondLine}`;
    if(weight && weight > 0){
      const third = buildAntipyreticLine(weight, ageVal);
      base += `\n3. ${third}`;
    }
    // Dodaj punkt 4 z czerwonymi flagami, jeśli są dostępne
    const red = buildRedFlagsLine();
    if(red){
      base += `\n4. ${red}`;
    }
    return base;
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
    recSection.innerHTML = '';
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
    // Uzyskaj listę nazw handlowych dla kombinacji lek/form
    const brandListMap = BRAND_NAMES[drugName];
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
    // Przygotuj sekcję interfejsu – instrukcja i przyciski są wyśrodkowane
    recSection.style.display = 'block';
    recSection.style.textAlign = 'center';
    recSection.innerHTML = `
      <div id="abxBrandUI" style="border-top: 1px solid #eee; padding-top: .6rem; text-align:center;">
        <p style="margin:.4rem 0 .8rem 0; font-weight:500;">Chcesz mieć gotowe zalecenia? Wybierz nazwę handlową preparatu a potem kliknij „Zalecenia do wklejenia”.</p>
        <div style="display:flex; gap:.6rem; flex-wrap:wrap; justify-content:center; align-items:center; margin-bottom:.4rem;">
          <button id="abxBrandToggle" type="button">Nazwa handlowa</button>
          <button id="abxCopyRec" type="button">Zalecenia do wklejenia</button>
        </div>
        <div id="abxBrandList" style="display:none; text-align:center;"></div>
      </div>
    `;
    const listContainer = recSection.querySelector('#abxBrandList');
    // Wypełnij listę przyciskami dla nazw handlowych
    listContainer.innerHTML = brandList.map((bn, idx) => {
      return `<button type="button" class="abx-brand-option" data-index="${idx}" style="margin:.2rem .4rem .2rem 0;">${bn}</button>`;
    }).join('');
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
        // Przełącz widoczność listy nazw handlowych
        const cur = listContainer.style.display;
        const isHidden = (cur === 'none' || cur === '');
        listContainer.style.display = isHidden ? 'block' : 'none';
        // Podświetl przycisk, gdy lista jest widoczna, w przeciwnym razie usuń podświetlenie
        if(isHidden){
          toggleBtn.classList.add('active-toggle');
        } else {
          toggleBtn.classList.remove('active-toggle');
        }
      });
    }
    // Obsługa kopiowania zaleceń do schowka
    const copyBtn = recSection.querySelector('#abxCopyRec');
    if(copyBtn){
      copyBtn.addEventListener('click', () => {
        const brandName = brandList[selectedIndex];
        const recText = generateRecommendation(brandName, dosesPerDay, doseStr, duration);
        if(navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(recText).then(() => {
            const oldTxt = copyBtn.textContent;
            copyBtn.textContent = 'Skopiowano!';
            // Podświetl przycisk na turkusowo; klasa zostaje aż do kolejnego kliknięcia lub odświeżenia
            copyBtn.classList.add('active-toggle');
            setTimeout(() => { copyBtn.textContent = oldTxt; }, 2000);
          }).catch(() => {
            alert(recText);
          });
        } else {
          alert(recText);
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
  // co odpowiada ok. 2 943 mg fenoksymetylpenicyliny na dobę【727082293663807†L322-L333】.
  // Dorośli o masie <60 kg oraz dzieci i młodzież o masie >40 kg otrzymują
  // zazwyczaj 3 mln j.m./dobę (1 mln j.m. 3 ×/dobę), czyli ok. 1 962 mg/dobę【727082293663807†L322-L343】.
  // U dzieci (zwłaszcza <40 kg) dawki są podawane w zakresie 50 000–100 000 j.m./kg/dobę
  // (≈33–65 mg/kg/dobę)【727082293663807†L337-L343】, co przy 40 kg masy ciała daje
  // maksymalnie ok. 2 600 mg/dobę. Aby odzwierciedlić te wartości i uniknąć
  // ograniczania dobowej dawki do zbyt niskiej wartości 1 000 mg, podnosimy
  // globalne limity: do 2 600 mg/dobę u dzieci (<40 kg) i 3 000 mg/dobę u
  // pacjentów dorosłych (≥40 kg). Te limity odpowiadają odpowiednio około
  // 4 mln j.m. i 4,6 mln j.m. na dobę i są zgodne z zaleceniami ChPL.
  'Fenoksymetylpenicylina': { child: 2600, adult: 3000 },
  // Amoksycylina: w ostrym zapaleniu zatok i ucha oraz innych zakażeniach górnych
  // dróg oddechowych stosuje się zarówno standardowe dawki 45 mg/kg/dobę, jak i
  // wysokodawkowe schematy 80–90 mg/kg/dobę w 2 podaniach. Wytyczne AAP/MedStar
  // dopuszczają podawanie 80–90 mg/kg/dobę z limitem 2 g na dawkę (≈4 g/dobę)【81070388668444†L75-L105】.
  // Aby umożliwić pełne wykorzystanie schematu 90 mg/kg/dobę u dzieci o masie 40 kg
  // (3 600 mg/dobę), zwiększamy pediatryczny limit z 3 000 mg do 3 600 mg/dobę.
  // Limit dla dorosłych pozostaje 4 000 mg/dobę.
  'Amoksycylina': { child: 3600, adult: 4000 },
  // Amoksycylina z kwasem klawulanowym (koamoksyklaw) – zgodnie z wytycznymi,
  // standardowa dawka wynosi 45 mg/kg/dobę, a wysokodawkowa 80–90 mg/kg/dobę
  // amoksycyliny w dwóch dawkach【81070388668444†L75-L105】. Preparaty o wysokiej
  // zawartości amoksycyliny (np. Augmentin ES 600 mg/5 ml) umożliwiają podawanie
  // maksymalnie 2 g na dawkę (4 g/dobę). Poprzedni limit 3 000 mg/dobę mógł
  // ograniczać pełną dawkę u większych dzieci (~40 kg), dlatego zwiększamy
  // pediatryczny limit do 3 600 mg/dobę. Limit dla dorosłych pozostaje 4 000 mg/dobę.
  'Amoksycylina z kwasem klawulanowym': { child: 3600, adult: 4000 },
  // Duplicate entry with non-breaking spaces (\u00a0) for UI strings that use NBSP.
  // Ujednolicamy limity dobowej dawki ko‑amoksyklawu z czystą amoksycyliną: 3 600 mg/dobę
  // u dzieci <40 kg i 4 000 mg/dobę u pacjentów ≥40 kg. Poprzednio stosowano 3 000/4 000 mg;
  // aktualizacja pozwala na podanie pełnej dawki 90 mg/kg/dobę u pacjentów o masie 40 kg【81070388668444†L75-L105】.
  'Amoksycylina\u00a0z\u00a0kwasem\u00a0klawulanowym': { child: 3600, adult: 4000 },
  // Cefaleksyna – w powikłanych zakażeniach układu moczowego dawki mogą sięgać 25 mg/kg
  // cztery razy na dobę (100 mg/kg/dobę), co u pacjentów ważących 40 kg daje 4 000 mg/dobę【892923089545176†L120-L157】.
  // Aby umożliwić stosowanie pełnych dawek w ciężkich zakażeniach, zwiększamy limit pediatryczny z 2 000 mg do 4 000 mg/dobę,
  // pozostawiając limit dorosłych bez zmian (4 000 mg). W innych wskazaniach dawkę ogranicza lokalny parametr maxDailyMg.
  'Cefaleksyna': { child: 4000, adult: 4000 },
  'Cefadroksyl': { child: 1000, adult: 1000 },
  // Aksetyl cefuroksymu (cefuroksym doustny) – w leczeniu niepowikłanych zakażeń układu moczowego
  // zaleca się 15 mg/kg mc. dwa razy na dobę (30 mg/kg/dobę) z maksymalną dawką 250 mg na
  // pojedynczą dawkę, co odpowiada 500 mg/dobę【980804879034716†L68-L107】.  
  // Dlatego ograniczamy zarówno dziecięcy, jak i dorosły limit do 500 mg/dobę, aby nie przekroczyć
  // maksymalnej dawki wynikającej z CHPL.
  // Aksetyl cefuroksymu (cefuroksym doustny) – maksymalna dobowa dawka zależy od wskazania.
  // W niepowikłanych zakażeniach układu moczowego zaleca się 15 mg/kg mc. dwa razy na dobę
  // (30 mg/kg/dobę), co daje maks. 250 mg na dawkę (500 mg/dobę)【980804879034716†L68-L106】.
  // Jednak w ostrym zapaleniu zatok przynosowych oraz zapaleniu ucha środkowego stosuje się
  // 30 mg/kg mc./dobę w dwóch dawkach z limitem 500 mg na dawkę, czyli do 1 000 mg/dobę【479311936043478†L540-L545】.
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
  // Klindamycyna – standard 20–30 mg/kg/dobę u dzieci (max 900 mg), do 1,8 g/dobę u dorosłych.
  'Klindamycyna': { child: 900, adult: 1800 },
  // Cefiksym – zazwyczaj 400 mg/dobę zarówno u dzieci jak i u dorosłych.
  'Cefiksym': { child: 400, adult: 400 },
  // Ceftibuten – podobnie jak cefiksym, 9 mg/kg/dobę (max 400 mg).
  'Ceftibuten': { child: 400, adult: 400 },
  // Cefaklor – w preparatach doustnych IR maksymalnie 1 g/dobę zarówno u dzieci, jak i u dorosłych. Wersja o przedłużonym uwalnianiu (375 mg co 12 h) daje 750 mg/dobę.
  // Dlatego przyjmujemy bezpieczny limit 1 g/dobę dla obu grup.
  'Cefaklor': { child: 1000, adult: 1000 },
  // Furazydyna (nitrofurantoina) – zgodnie z zaleceniami 5–7 mg/kg/dobę w czterech dawkach u dzieci; maksymalnie 400 mg/dobę u dzieci i dorosłych【450746999578656†L165-L171】.
  'Furazydyna': { child: 400, adult: 400 },
  // Trimetoprim – dzieci zwykle otrzymują 5 mg/kg co 12 h (max 200 mg na dawkę),
  // co odpowiada ok. 400 mg/dobę czystego trimetoprimu【233094300590923†L111-L115】. U dorosłych
  // stosuje się 100 mg co 12 h (200 mg/dobę) lub 200 mg jednorazowo【233094300590923†L90-L94】.
  // Trimetoprim – w niepowikłanych zakażeniach dróg moczowych dorośli otrzymują 200 mg co 12 h
  // (400 mg/dobę), a dzieci 6–12 lat 2–4 mg/kg mc. co 12 h (4–8 mg/kg/dobę)【159909727498009†L1158-L1195】.  
  // Wcześniejszy limit 200 mg/dobę dla dorosłych powodował niedodawkowanie; podnosimy go do 400 mg.  
  'Trimetoprim': { child: 400, adult: 400 },
  // Trimetoprim‑sulfametoksazol (kotrimoksazol) – ograniczenia dotyczą całkowitej
  // zawartości obu składników (trimetoprimu i sulfametoksazolu). U dzieci dawka
  // dobowo 6 mg trimetoprimu + 30 mg sulfametoksazolu/kg masy ciała odpowiada
  // ok. 36 mg/kg/dobę całkowitej substancji czynnej【660236872666545†L79-L83】. U pacjenta
  // o masie 20 kg daje to ~720 mg/dobę; dlatego wcześniejszy limit 480 mg/dobę
  // powodował niedodawkowanie. Zaktualizowano limit pediatryczny do 960 mg/dobę,
  // co pozwala na zastosowanie pełnej dawki u dzieci o masie do ~26–30 kg. U
  // dorosłych stosuje się 160 mg trimetoprimu + 800 mg sulfametoksazolu co 12 h
  // (960 mg na dawkę, 1 920 mg/dobę) w cięższych zakażeniach【660236872666545†L79-L83】.
  'Trimetoprim-sulfametoksazol': { child: 960, adult: 1920 },
  // Fosfomycyna – pojedyncza dawka 3 g (3000 mg) u dorosłych i dzieci ≥12 lat.
  'Fosfomycyna': { child: 3000, adult: 3000 },
  // Fluorochinolony: ustawiono umiarkowane limity, choć rzadko stosowane u dzieci.
  'Ciprofloxacyna': { child: 1000, adult: 1500 },
  'Cyprofloksacyna': { child: 1000, adult: 1500 },
  'Lewofloksacyna': { child: 500, adult: 1000 },
  // Doksycyklina – standardowa dawka u dorosłych wynosi 100 mg co 12 h (200 mg/dobę).
  // Ograniczamy dobowe spożycie do 200 mg u dzieci i dorosłych.
  'Doksycyklina': { child: 200, adult: 200 },
  // Cefpodoksym – w pozaszpitalnym zapaleniu płuc podaje się 200 mg dwa razy na dobę.
  // Maksymalna dawka dobowa wynosi 400 mg【134088552160192†L63-L92】.
  'Cefpodoksym': { child: 400, adult: 400 },
  // Moksyfloksacyna – fluoroquinolon, którego zalecana dawka wynosi 400 mg raz na dobę.
  // Limitujemy całkowitą dawkę do 400 mg/dobę u dzieci i dorosłych【134088552160192†L120-L127】.
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
  // co przy masie 40 kg daje około 240 mg/dobę【811949273617179†L158-L175】.
  // Ustalamy górny limit 240 mg/dobę dla obu grup, zapobiegając przekroczeniu zalecanych dawek.
  'Gentamycyna': { child: 240, adult: 240 },
  // Piperacylina z tazobaktamem – 112,5 mg/kg co 8 h u dzieci (około 13 500 mg/dobę dla 40 kg) i 4,5 g co 8 h u dorosłych【101103782443135†L160-L170】.
  // Ustalono limit 13 500 mg/dobę zarówno dla dzieci, jak i dorosłych.
  'Piperacylina z tazobaktamem': { child: 13500, adult: 13500 },
  // Imipenem z cilastatyną – maksymalna dobowa dawka wynosi 4 g u dorosłych i dzieci starszych【496788431355108†L1149-L1155】.
  'Imipenem z cilastatyną': { child: 4000, adult: 4000 },
  // Meropenem – zazwyczaj stosuje się do 6 g/dobę u dzieci i dorosłych w ciężkich zakażeniach【265555727539503†L160-L182】.
  'Meropenem': { child: 6000, adult: 6000 },
  // Doripenem – u dorosłych 500 mg co 8 h (1,5 g/dobę) lub 1 g co 8 h (3 g/dobę) w ciężkich zakażeniach【453653223660162†L48-L58】.
  // Brak danych pediatrycznych; przyjmujemy konserwatywny limit 3 000 mg/dobę dla obu grup.
  'Doripenem': { child: 3000, adult: 3000 },
  // Cefuroksym (dożylnie) – maksymalnie 4,5 g/dobę (1,5 g co 8 h) zarówno u dzieci ≥40 kg, jak i dorosłych【952311008969875†L160-L167】.
  'Cefuroksym (dożylnie)': { child: 4500, adult: 4500 },
  // Cefotaksym – u dorosłych zwykle do 6 g/dobę (1–2 g co 8 h), sporadycznie do 12 g; u dzieci do 100 mg/kg/dobę (≈4–6 g przy masie 40 kg)【890074162704657†L119-L133】.
  // Ustalamy konserwatywny limit 6 000 mg/dobę dla obu grup.
  'Cefotaksym': { child: 6000, adult: 6000 },
  // Ceftriakson – jedna dawka 1–2 g/dobę u dorosłych; dzieci do 50 mg/kg/dobę (max 2 g)【360573216427241†L1750-L1760】.
  'Ceftriakson': { child: 2000, adult: 2000 },
  // Cefepim – maksymalnie 6 g/dobę u dorosłych i dzieci (50–150 mg/kg/dobę przy masie 40 kg)【63965750869139†L409-L417】.
  'Cefepim': { child: 6000, adult: 6000 },
  // Amikacyna – limit 1,5 g/dobę dla dzieci i dorosłych zgodnie z wytycznymi【769176637956512†L71-L103】.
  'Amikacyna': { child: 1500, adult: 1500 }
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
        // 2–3 mln j.m. na dobę w dwóch dawkach【434395716885121†L774-L808】. Zakres mgRange i dawka będą
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
        // streptokokowym zapaleniu gardła【882452971985730†L84-L99】. Zmniejszamy zakres do jednej
        // wartości 50 mg/kg/dobę i aktualizujemy domyślną dawkę do 50 mg/kg/dobę.
        // Amoksycylina – w leczeniu paciorkowcowego zapalenia gardła dawkę dobową
        // 50 mg/kg mc. zwykle podaje się w dwóch podaniach przez 10 dni. Zgodnie
        // z charakterystyką leku i informacjami dla pacjenta, typowy zakres
        // dobowych dawek amoksycyliny u dorosłych wynosi 0,75–3 g, a u dzieci
        // 40–90 mg/kg mc./dobę z maksymalną dawką 3 g na dobę【106179120457537†L390-L401】.
        // Aby uniknąć obliczeń przekraczających 3 g/dobę w tym wskazaniu,
        // dodano lokalne ograniczenie maxDailyMg: 3000 mg.
        'Amoksycylina':        { mgRange: [50, 50], defaultMg: 50, doses: 2, duration: 10, maxDailyMg: 3000 },
        // Amoksycylina z kwasem klawulanowym – w tej jednostce chorobowej nie ma
        // konieczności stosowania wysokich dawek. Na podstawie Charakterystyki
        // Produktu Leczniczego Augmentin oraz wytycznych przyjmujemy zakres
        // 25–45 mg/kg/dobę amoksycyliny w dwóch dawkach (standardowy schemat 25–45 mg/kg/dobę,
        // bez przekraczania 45 mg/kg/dobę)【592487758691093†L131-L146】. Domyślna wartość to 40 mg/kg/dobę.
        // Amoksycylina z kwasem klawulanowym – w infekcjach górnych dróg
        // oddechowych u pacjentów o masie ≥ 40 kg stosuje się 1 g (875 mg + 125 mg)
        // dwa razy na dobę lub 625 mg (500 mg + 125 mg) trzy razy na dobę, a u
        // dzieci <40 kg zakres dawek wynosi 25–45 mg amoksycyliny/kg mc./dobę w
        // dwóch podaniach【389257246499714†L470-L478】. Dawka 45 mg/kg mc./dobę u dziecka
        // ważącego 40 kg odpowiada 1 800 mg amoksycyliny na dobę. Aby ograniczyć
        // kalkulator do rozsądnych wartości i nie przekraczać 3 g amoksycyliny
        // na dobę, wprowadzono lokalny limit maxDailyMg: 3000 mg dla tego
        // wskazania【389257246499714†L470-L478】.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 40, doses: 2, duration: 10, maxDailyMg: 3000 },
        // Cefadroksyl: jednorazowa dawka dobowa 30 mg/kg (dzieci < 40 kg) lub 1 g
        // (pacjenci ≥ 40 kg) – zgodnie z zaleceniami IDSA i ChPL【230220470390240†L113-L134】.
        // Dawka podawana raz dziennie przez 10 dni.
        // Cefadroksyl: dawka dobowa 30 mg/kg mc. (dzieci <40 kg) lub 1 g (≥40 kg),
        // podawana jednorazowo lub w dwóch dawkach co 12 h. Aby ułatwić kliniczne
        // dostosowanie do schematu 8–12 h, przyjmujemy domyślnie 1 dawkę/dobę
        // i udostępniamy alternatywny wariant dwóch dawek poprzez altDoses.
        'Cefadroksyl': { mgRange: [30, 30], defaultMg: 30, doses: 1, altDoses: [2], duration: 10, maxDailyMg: 1000 },
        // Cefaleksyna: zalecana jest 20 mg/kg na dawkę podawaną dwa razy dziennie
        // (40 mg/kg/dobę) przez 10 dni, maksymalnie 500 mg na dawkę【366853155809925†L270-L295】.
        // Redukujemy liczbę dawek do 2 i ustawiamy stały zakres 40 mg/kg/dobę.
        'Cefaleksyna': { mgRange: [40, 40], defaultMg: 40, doses: 2, duration: 10, maxDailyMg: 1000 },
        // Klarytromycyna: dawka 15 mg/kg mc./dobę podzielona na dwie dawki co 12 h
        // jest podstawowym schematem terapii paciorkowcowego zapalenia gardła u dzieci.【913878657539518†screenshot】
        // Zgodnie z Charakterystyką Produktu Leczniczego u dorosłych można stosować
        // dawkę 500 mg lub 1 000 mg raz na dobę (tabletki o przedłużonym
        // uwalnianiu). Aby umożliwić obliczenia dla tych wariantów,
        // zwiększamy limit dobowy do 1 000 mg i dodajemy alternatywną opcję
        // dawkowania raz na dobę poprzez altDoses.  
        'Klarytromycyna':      { mgRange: [15, 15], defaultMg: 15, doses: 2, altDoses: [1], duration: 10, maxDailyMg: 1000 },
        // Azytromycyna: w paciorkowcowym zapaleniu gardła rekomendowany jest 5‑dniowy
        // schemat 12 mg/kg/dobę jednorazowo przez 5 dni (dzień 1: 12 mg/kg, dni 2–5:
        // 6 mg/kg)【156393803632411†L74-L82】. Ustalamy stałą dawkę 12 mg/kg/dobę i długość
        // terapii 5 dni, z limitem 500 mg/dobę.
        // Azytromycyna – zgodnie z rozszerzonymi wytycznymi dla ostrego zapalenia gardła i
        // migdałków podniebiennych stosuje się dwa warianty terapii. Kuracja
        // 5‑dniowa wymaga podania 10–12 mg/kg mc./dobę raz na dobę, z
        // maksymalną dawką 500 mg/dobę; u dorosłych typowym schematem jest
        // 500 mg w 1. dniu i 250 mg/dobę przez kolejne cztery dni. Przyjęcie
        // zakresu 10–12 mg/kg mc./dobę pozwala dostosować dawkę do masy ciała,
        // a limit 500 mg zapobiega przekroczeniu maksymalnej dobowej dawki
        // zalecanej u dzieci【913878657539518†screenshot】.  
        'Azytromycyna':        { mgRange: [10, 12], defaultMg: 12, doses: 1, duration: 5, maxDailyMg: 500 },

        // Azytromycyna (3 dni) – alternatywna trzydniowa kuracja dla
        // paciorkowcowego zapalenia gardła u dzieci.  W krótszym schemacie
        // stosuje się 20 mg/kg mc./dobę raz dziennie przez 3 dni, nie
        // przekraczając 500 mg/dobę【913878657539518†screenshot】.  Dodajemy tylko jedną
        // wersję nazwy z normalną spacją, aby uniknąć duplikatów w menu.
        // Dzięki temu w liście antybiotyków pojawi się jasna opcja „Azytromycyna (3 dni)”.
        'Azytromycyna (3 dni)': { mgRange: [20, 20], defaultMg: 20, doses: 1, duration: 3, maxDailyMg: 500 },
        // Klindamycyna – w leczeniu paciorkowcowego zapalenia gardła zalecane jest
        // 7 mg/kg na dawkę trzy razy dziennie (21 mg/kg/dobę) z maksymalną dawką
        // 300 mg na dawkę (900 mg/dobę)【366853155809925†L284-L287】. Dostosowujemy zakres i
        // limit dobowy zgodnie z tymi zaleceniami.
        'Klindamycyna':       { mgRange: [21, 21], defaultMg: 21, doses: 3, duration: 10, maxDailyMg: 900 },
        // Aksetyl cefuroksymu (cefalosporyna II generacji) – 20–30 mg/kg/dobę w dwóch dawkach, max 1 000 mg/dobę【434395716885121†L774-L808】.
        'Aksetyl cefuroksymu':   { mgRange: [20, 30], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 1000 }
        ,
        // Cefaklor: w zapaleniu gardła stosuje się 20–40 mg/kg mc./dobę podzielone co 8–12 h
        // (2–3 dawki/dobę) z maksymalną dawką 1 g/dobę【402805744907835†screenshot】.  
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
        // przez 7–10 dni (krótszy czas u starszych dzieci)【47766902999983†L365-L388】.
        // Ustawiamy zakres 80–90 mg/kg mc./dobę i domyślną dawkę 90 mg/kg mc.;
        // kalkulator skoryguje czas terapii w zależności od wieku.
        'Amoksycylina':        { mgRange: [80, 90], defaultMg: 90, doses: 2, duration: 7, firstChoice: true },
        // Dla preparatu Amoksiklav ES (600 mg/42,9 mg/5 ml) ChPL podaje, że zwykle stosowana
        // dawka u dzieci to 90 mg amoksycyliny + 6,4 mg kwasu klawulanowego na kg mc. na dobę
        // w dwóch dawkach【759532590181075†L190-L202】. W przypadkach ostrego zapalenia ucha środkowego
        // aktualne wytyczne zalecają wysoką dawkę amoksycyliny 80–90 mg/kg mc./dobę (z ograniczeniem
        // kwasu klawulanowego <10 mg/kg mc./dobę), podawaną w dwóch dawkach【47766902999983†L365-L388】.
        // Dlatego ustawiamy zakres na 80–90 mg/kg mc./dobę i domyślną wartość 90 mg/kg mc. Dzielenie
        // dawki na dwie części ogranicza ilość kwasu klawulanowego i poprawia tolerancję.
        // Amoksycylina z kwasem klawulanowym – stosowana w OZUŚ w przypadku braku
        // odpowiedzi na samą amoksycylinę lub w sytuacjach, gdy podejrzewa się
        // oporne bakterie. Wysoka dawka amoksycyliny 80–90 mg/kg mc./dobę
        // (przy zachowaniu stosunku kwas klawulanowy <10 mg/kg mc./dobę) jest
        // rekomendowana, dzielona na dwie dawki【47766902999983†L365-L388】. Dlatego
        // zmieniamy zakres na 80–90 mg/kg mc./dobę i pozostawiamy domyślnie 90 mg/kg mc.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [80, 90], defaultMg: 90, doses: 2, duration: 7 },
        // Cefuroksym: w OZUŚ stosuje się 30 mg/kg/dobę w dwóch dawkach przez 5–10 dni,
        // przy czym maksymalna dawka dobowa nie powinna przekroczyć 500 mg【479311936043478†L444-L450】.
        // W OZUŚ maksymalną dawkę dobową cefuroksymu doustnego zwiększono do 1000 mg,
        // aby umożliwić podawanie 2×500 mg u starszych dzieci (zamiast ograniczenia
        // do 500 mg/dobę). Zakres mg/kg pozostaje 30 mg/kg/dobę w dwóch dawkach.
        // Aksetyl cefuroksymu – według zaleceń stosuje się 30 mg/kg mc./dobę w dwóch dawkach
        // przez 5–10 dni. Wartość 30 mg/kg mc. pozostaje bez zmian, ale domyślny czas
        // terapii zwiększamy do 10 dni (kalkulator skróci go dla starszych dzieci)【565862944814290†L430-L440】.
        'Aksetyl cefuroksymu':   { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 1000 },
        // Klarytromycyna: dawka 15 mg/kg/dobę (7,5 mg/kg dwa razy na dobę) z limitem 1 000 mg/dobę【123300810807228†L69-L75】.
        // Klarytromycyna – u dzieci z alergią na beta‑laktamy dawka 15 mg/kg mc./dobę
        // (7,5 mg/kg co 12 h) jest podawana przez 10 dni. Maksymalna dawka na dawkę
        // wynosi 250 mg, co odpowiada 500 mg/dobę【484103804672850†L1869-L1874】. Zmieniamy limit
        // dobowy na 500 mg i domyślny czas terapii na 10 dni.
        // Klarytromycyna – dawka 15 mg/kg mc./dobę podzielona na dwie
        // dawki co 12 h jest podstawowym schematem leczenia paciorkowcowego
        // zapalenia gardła u dzieci【913878657539518†screenshot】.  
        // W ulotkach dla dorosłych dopuszcza się jednak podawanie 500 mg lub
        // nawet 1000 mg raz na dobę w postaci tabletek o zmodyfikowanym
        // uwalnianiu. Aby odzwierciedlić te możliwości, zwiększamy limit
        // dobowy do 1 000 mg i dodajemy alternatywną opcję dawkowania raz na
        // dobę poprzez altDoses.  
        'Klarytromycyna':      { mgRange: [15, 15], defaultMg: 15, doses: 2, altDoses: [1], duration: 10, maxDailyMg: 1000 },
        // Azytromycyna w ostrym zapaleniu ucha środkowego jest opcją rezerwową. Zalecany
        // jest skrócony 3‑dniowy schemat 10 mg/kg mc./dobę; alternatywnie można
        // podać 5‑dniową terapię (10 mg/kg w 1. dniu, następnie 5 mg/kg/dobę przez 4 dni).
        // Ustawiamy domyślnie 10 mg/kg/dobę w jednej dawce z 3‑dniowym czasem
        // terapii. Limit dobowy pozostaje 500 mg.
        'Azytromycyna':        { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 3, maxDailyMg: 500 }
      }
    },
    'sinusitis': {
      label: 'Ostre zapalenie błony śluzowej nosa i zatok przynosowych',
      drugs: {
        // W ostrym zapaleniu zatok przynosowych stosuje się zarówno standardowe, jak i wysokie dawki amoksycyliny.
        // Zgodnie z Charakterystyką Produktu Leczniczego Ospamox dzieci <40 kg mogą otrzymywać 20–90 mg/kg mc./dobę,
        // przy czym schemat dwudawkowy (co 12 h) stosuje się wyłącznie przy górnych granicach zakresu【275268803492293†L149-L180】.
        // Nowsze przeglądy i wytyczne (np. Leung 2020) sugerują standardową dawkę 45 mg/kg/dobę lub wysokodawkowy
        // schemat 90 mg/kg/dobę w 2 dawkach u pacjentów z ryzykiem zakażeń lekoopornych【268980849570181†L578-L585】.
        // Ujednolicamy zakres dawki do 45–90 mg/kg mc./dobę i pozostawiamy domyślnie 80 mg/kg mc./dobę w dwóch dawkach.
        'Amoksycylina':        { mgRange: [45, 90], defaultMg: 80, doses: 2, duration: 10, firstChoice: true },
        // Dla preparatów ko‑amoksyklawu (np. Augmentin ES) Charakterystyka Produktu Leczniczego zaleca
        // podawanie 90 mg/kg mc./dobę składnika amoksycyliny w dwóch dawkach przez 10 dni【373474941841921†L36-L44】.
        // Zgodnie z nowszymi wytycznymi, standardową dawką w niepowikłanych przypadkach może być 45 mg/kg mc./dobę,
        // natomiast u pacjentów z ryzykiem oporności lub cięższą chorobą stosuje się 90 mg/kg mc./dobę【268980849570181†L578-L585】.
        // Dlatego poszerzamy zakres dawki do 45–90 mg/kg mc./dobę, zachowując liczbę dawek 2/dobę i domyślne 90 mg/kg mc./dobę.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [45, 90], defaultMg: 90, doses: 2, duration: 10 },
        // Cefuroksym: w OZNZ stosuje się 30 mg/kg/dobę w dwóch dawkach, nie przekraczając 500 mg na dawkę
        // (czyli 1000 mg/dobę)【479311936043478†L540-L545】.
        'Aksetyl cefuroksymu':   { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 10, maxDailyMg: 1000 },
        // Klarytromycyna: 15 mg/kg/dobę w dwóch dawkach, z limitem 1 000 mg/dobę【123300810807228†L69-L75】.
        'Klarytromycyna':      { mgRange: [15, 15], defaultMg: 15, doses: 2, duration: 10, maxDailyMg: 1000 },
        // Azytromycyna jest opcją rezerwową w ostrym zapaleniu zatok przynosowych. Zalecany
        // jest 3‑dniowy kurs 10 mg/kg mc./dobę; alternatywnie można zastosować schemat
        // 5‑dniowy (10 mg/kg w 1. dniu, następnie 5 mg/kg/dobę). Ustawiamy domyślnie
        // 10 mg/kg/dobę w jednej dawce z 3‑dniowym czasem terapii. Limit dobowy pozostaje 500 mg.
        'Azytromycyna':        { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 3, maxDailyMg: 500 }
      }
    },
    'pneumonia_child': {
      label: 'Pozaszpitalne zapalenie płuc u dzieci',
      drugs: {
        // Amoksycylina: wg wytycznych dla łagodnego, pozaszpitalnego zapalenia płuc
        // stosuje się wysokodawkowy schemat 80–90 mg/kg mc./dobę w 3 dawkach (co 8 h). 
        // Taka terapia trwa zazwyczaj 5 dni, o ile dziecko pozostaje bez gorączki i klinicznie się poprawia
        // przez co najmniej 48 h【413082600044082†L206-L221】【353932149311416†L15-L24】. 
        'Amoksycylina':        { mgRange: [80, 90], defaultMg: 90, doses: 3, duration: 5, firstChoice: true },
        // Amoksycylina z kwasem klawulanowym: wysokodawkowa terapia 80–90 mg/kg mc./dobę amoksycyliny 
        // podawana co 12 h (2 dawki/dobę) jest preferowana w przypadku podejrzenia oporności
        // pneumokoków lub braku odpowiedzi na samą amoksycylinę【413082600044082†L206-L221】. 
        // Zmniejszamy czas terapii do 5 dni zgodnie z nowymi rekomendacjami dla łagodnych infekcji. 
        'Amoksycylina z kwasem klawulanowym': { mgRange: [80, 90], defaultMg: 90, doses: 2, duration: 5 },
        // Aksetyl cefuroksymu: zalecane jest 15 mg/kg mc. co 12 h (czyli 30 mg/kg mc./dobę) z maks. 500 mg/dobę; 
        // stosujemy stałą wartość 30 mg/kg mc./dobę w dwóch dawkach【196723644067208†L684-L709】. 
        'Aksetyl cefuroksymu':   { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 7, maxDailyMg: 500 },
        // Postać dożylna cefuroksymu dla cięższych zakażeń lub niemowląt (3 tydzień–3 miesiąc).  
        // Dawkowanie 50–100 mg/kg mc./dobę w 3 dawkach jest zgodne z wytycznymi; 
        // obniżamy domyślną wartość do 80 mg/kg, aby lepiej odpowiadała zakresowi terapeutycznemu. 
        'Cefuroksym (dożylnie)': { mgRange: [50, 100], defaultMg: 80, doses: 3, duration: 7, maxDailyMg: 4000 },
        // Ampicylina – w umiarkowanym i ciężkim CAP podaje się 50 mg/kg mc. co 6 h (200 mg/kg/dobę) i 
        // zwykle przez 7 dni【413082600044082†L247-L252】. Ustawiamy zatem stałą dawkę 200 mg/kg mc./dobę. 
        'Ampicylina':         { mgRange: [200, 200], defaultMg: 200, doses: 4, duration: 7, maxDailyMg: 4000 },
        // Cefotaksym – rekomendowane przez PIDS/IDSA 150 mg/kg mc./dobę (50 mg/kg co 8 h) w leczeniu CAP【50150727335696†L948-L1005】. 
        // Stosujemy stałą wartość 150 mg/kg/dobę z 3 dawkami. 
        'Cefotaksym':         { mgRange: [150, 150], defaultMg: 150, doses: 3, duration: 7, maxDailyMg: 6000 },
        // Ceftriakson – w cięższym CAP stosuje się 50–75 mg/kg mc. w pojedynczej dawce na dobę (max 2 g)【413082600044082†L259-L264】. 
        // Skracamy czas terapii do 5 dni, zgodnie z nowszymi doniesieniami o krótszym leczeniu. 
        'Ceftriakson':        { mgRange: [50, 75], defaultMg: 75, doses: 1, duration: 5, maxDailyMg: 2000 },
        // Kloksacylina – dla zakażeń gronkowcowych podaje się 25–50 mg/kg co 6 h (100–200 mg/kg mc./dobę)【992306987251676†L84-L88】. 
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
        'Azytromycyna':        { mgRange: [10, 10], defaultMg: 10, doses: 1, duration: 5, maxDailyMg: 500 }
      }
    },
    'pneumonia_adult': {
      label: 'Pozaszpitalne zapalenie płuc u dorosłych',
      /*
       * Sekcja dla dorosłych dotyczy pozaszpitalnego zapalenia płuc (CAP).
       * Zgodnie z aktualnymi wytycznymi IDSA/ATS i lokalnymi programami
       * antybiotykowymi, leczenie trwa minimum 5 dni; należy kontynuować
       * antybiotykoterapię co najmniej 48 h po ustąpieniu gorączki i
       * poprawie klinicznej【134088552160192†L37-L56】. Poniższe schematy są
       * przeznaczone dla pacjentów leczonych ambulatoryjnie.
       *
       * – Dorośli bez chorób współistniejących i bez ryzyka lekooporności:
       *   • amoksycylina 1 g co 8 h przez 5 dni【134088552160192†L41-L56】;
       *   • doksycyklina 100 mg co 12 h przez 5 dni【134088552160192†L41-L56】;
       *   • makrolid (np. azytromycyna 500 mg w 1. dniu, następnie 250 mg raz na dobę przez kolejne 4 dni
       *     lub klarytromycyna 500 mg dwa razy na dobę) jest dopuszczalny tylko w regionach
       *     o niskiej (<25 %) oporności pneumokoków【354719116646841†L630-L646】.
       *
       * – Dorośli z chorobami współistniejącymi lub innymi czynnikami ryzyka: stosuje się
       *   terapię skojarzoną β‑laktam + makrolid/doksycyklina【134088552160192†L63-L92】. Do wyboru:
       *   • amoksycylina + kwas klawulanowy 500/125 mg 3 ×/dobę, 875/125 mg 2 ×/dobę
       *     lub 2 g/125 mg 2 ×/dobę przez 5 dni【134088552160192†L63-L92】;
       *   • cefpodoksym 200 mg 2 ×/dobę lub cefuroksym 500 mg 2 ×/dobę przez 5 dni【134088552160192†L63-L92】;
       *   plus azytromycyna 500 mg w 1. dniu, następnie 250 mg raz na dobę przez 4 dni【134088552160192†L63-L92】
       *     lub doksycyklina 100 mg 2 ×/dobę【134088552160192†L63-L92】.
       *
       * – Dorośli z alergią na β‑laktamy: monoterapia fluorochinolonem oddechowym:
       *   • lewofloksacyna 750 mg raz na dobę przez 5 dni【134088552160192†L120-L127】;
       *   • moksyfloksacyna 400 mg raz na dobę przez 5 dni【134088552160192†L120-L125】.
       *   Fluorochinolony nie powinny być stosowane jako lek pierwszego wyboru ze względu
       *   na ryzyko działań niepożądanych i zakażeń Clostridioides difficile【669118165566163†L315-L327】.
       */
      // Wskazanie dla dorosłych – pozaszpitalne zapalenie płuc. Określamy dawki w mg/kg/dobę
      // na podstawie zalecanych stałych dawek z wytycznych. Leczenie trwa co najmniej 5 dni;
      // terapię należy kontynuować przez 48 h po ustąpieniu gorączki i poprawie klinicznej【134088552160192†L37-L56】.
      drugs: {
        'Amoksycylina': { mgRange: [43, 43], defaultMg: 43, doses: 3, duration: 5, firstChoice: true },
        'Doksycyklina': { mgRange: [3, 3], defaultMg: 3, doses: 2, duration: 5, maxDailyMg: 200 },
        'Klarytromycyna': { mgRange: [14, 14], defaultMg: 14, doses: 2, duration: 5, maxDailyMg: 1000 },
        'Azytromycyna': { mgRange: [7, 7], defaultMg: 7, doses: 1, duration: 5, maxDailyMg: 500 },
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 30, doses: 2, duration: 5, maxDailyMg: 4000 },
        'Cefpodoksym': { mgRange: [6, 6], defaultMg: 6, doses: 2, duration: 5, maxDailyMg: 400 },
        'Aksetyl cefuroksymu': { mgRange: [14, 14], defaultMg: 14, doses: 2, duration: 5, maxDailyMg: 1000 },
        'Lewofloksacyna': { mgRange: [11, 11], defaultMg: 11, doses: 1, duration: 5, maxDailyMg: 750 },
        'Moksyfloksacyna': { mgRange: [6, 6], defaultMg: 6, doses: 1, duration: 5, maxDailyMg: 400 }
      },
      message: 'Sekcja Antybiotykoterapia dotyczy dawek pediatrycznych. U dorosłych z pozaszpitalnym zapaleniem płuc stosuje się ustalone schematy leczenia.\n' +
        'Minimalny czas terapii wynosi 5 dni; leczenie należy kontynuować co najmniej 48 h po ustąpieniu gorączki i poprawie klinicznej【134088552160192†L37-L56】.\n' +
        '\n' +
        'Zalecenia dla zdrowych pacjentów bez chorób współistniejących:\n' +
        '• amoksycylina 1 g 3 ×/dobę przez 5 dni【134088552160192†L41-L56】;\n' +
        '• doksycyklina 100 mg 2 ×/dobę przez 5 dni【134088552160192†L41-L56】;\n' +
        '• makrolid (azytromycyna 500 mg w 1. dniu, następnie 250 mg/dobę przez 4 dni lub klarytromycyna 500 mg 2 ×/dobę) tylko w regionach o niskiej oporności pneumokoków【354719116646841†L630-L646】.\n' +
        '\n' +
        'Zalecenia dla pacjentów z chorobami współistniejącymi lub ryzykiem lekooporności:\n' +
        '• amoksycylina + kwas klawulanowy 500/125 mg 3 ×/dobę, 875/125 mg 2 ×/dobę lub 2 g/125 mg 2 ×/dobę przez 5 dni【134088552160192†L63-L92】;\n' +
        '• cefpodoksym 200 mg 2 ×/dobę lub cefuroksym 500 mg 2 ×/dobę przez 5 dni【134088552160192†L63-L92】;\n' +
        '• do wybranego β‑laktamu dodaj azytromycynę (500 mg w 1. dniu, następnie 250 mg/dobę przez 4 dni) lub doksycyklinę 100 mg 2 ×/dobę【134088552160192†L63-L92】.\n' +
        '\n' +
        'W przypadku alergii na β‑laktamy można rozważyć fluorochinolon oddechowy: lewofloksacyna 750 mg 1 ×/dobę przez 5 dni lub moksyfloksacyna 400 mg 1 ×/dobę przez 5 dni【134088552160192†L120-L127】. Fluorochinolony stosuje się tylko, gdy inne opcje są przeciwwskazane, ze względu na ryzyko działań niepożądanych i zakażeń C. difficile【669118165566163†L315-L327】.'
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
        // powinny otrzymywać 5–7 mg/kg mc./dobę w dwóch lub trzech dawkach; terapia trwa 7–10 dni【819474232703008†L49-L52】.
        // U osób dorosłych stosuje się podobne dawki z limitem 400 mg/dobę. Tutaj przyjmujemy 2 dawki
        // i minimalny czas leczenia 7 dni. W razie potrzeby lekarz może zalecić 3 dawki na dobę.
        'Furazydyna': { mgRange: [5, 7], defaultMg: 6, doses: 2, duration: 7, firstChoice: true },

        // Trimetoprim – w monoterapii dzieci 6–12 lat powinny otrzymywać 2–4 mg/kg mc. co 12 h
        // (4–8 mg/kg mc./dobę), natomiast dorośli i dzieci ≥12 lat 100–200 mg co 12 h. Zgodnie z
        // najnowszymi wytycznymi PTU (2024) niepowikłane zakażenie układu moczowego leczymy
        // przez 5 dni, stosując 200 mg co 12 h (≈ 400 mg/dobę)【159909727498009†L1158-L1195】.
        'Trimetoprim': { mgRange: [4, 8], defaultMg: 6, doses: 2, duration: 5 },

        // Trimetoprim‑sulfametoksazol (kotrimoksazol) – dawki odnoszą się do składnika trimetoprimu.
        // Charakterystyki i wytyczne podają 6 mg trimetoprimu + 30 mg sulfametoksazolu na kg mc.
        // na dobę w 2 dawkach, co odpowiada ok. 36 mg/kg mc./dobę. Leczenie trwa co najmniej 5 dni
        // i 2 dni po ustąpieniu objawów【660236872666545†L79-L83】【660236872666545†L121-L124】.
        'Trimetoprim-sulfametoksazol': { mgRange: [36, 36], defaultMg: 36, doses: 2, duration: 5 },

        // Fosfomycyna trometamol – w niepowikłanym zapaleniu pęcherza moczowego u kobiet i dziewcząt
        // powyżej 12 roku życia stosuje się jedną dawkę 3 g (3000 mg)【472729322937420†L250-L259】.
        // Lek nie jest zalecany u młodszych dzieci; aby uzyskać 3 g u osoby o masie ok. 40 kg
        // przyjmujemy przelicznik 75 mg/kg mc./dobę. Dawka jest jednorazowa, a globalny limit 3000 mg
        // zapobiega przekroczeniu tej wartości u pacjentów o większej masie ciała.
        'Fosfomycyna': { mgRange: [75, 75], defaultMg: 75, doses: 1, duration: 1 },

        // Aksetyl cefuroksymu – w niepowikłanym zakażeniu dróg moczowych zaleca się 15 mg/kg mc.
        // dwa razy na dobę (30 mg/kg mc./dobę) z maksymalną dawką 250 mg na dawkę (500 mg/dobę)
        // przez 5–10 dni【656974634179548†L90-L105】. Ustawiamy stałą wartość 30 mg/kg mc./dobę
        // i skracamy czas terapii do 7 dni.
        // W niepowikłanych zakażeniach układu moczowego zalecana jest dawka 15 mg/kg mc. dwa razy
        // na dobę (30 mg/kg mc./dobę) z maksymalną dawką 250 mg na dawkę (500 mg/dobę)【656974634179548†L90-L105】.
        // Choć globalny limit dla cefuroksymu doustnego wynosi 1 000 mg/dobę (stosowany w zapaleniu zatok
        // i ucha środkowego), dla tej jednostki chorobowej ograniczamy dawkę do 500 mg/dobę, aby nie
        // przekraczać zaleceń dla zakażeń dróg moczowych. Poniższe pole maxDailyMg wymusza niższy limit.
        'Aksetyl cefuroksymu': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 7, maxDailyMg: 500 },

        // Cefiksym – dzieci od 6 miesięcy do 12 lat otrzymują 8 mg/kg mc./dobę w jednej dawce (lub
        // 4 mg/kg co 12 h); maksymalna dawka dobowa to 400 mg. U osób ≥12 lat podaje się 400 mg
        // w jednej dawce【918558300544367†L186-L199】. Czas leczenia niepowikłanego ZUM wynosi 7 dni.
        'Cefiksym': { mgRange: [8, 8], defaultMg: 8, doses: 1, duration: 7 },

        // Ceftibuten – u dzieci ≥6 miesięcy stosuje się 9 mg/kg mc./dobę raz na dobę (max 400 mg/dobę);
        // u młodzieży ≥12 lat 400 mg raz na dobę【831558045112527†L145-L151】. Terapia ZUM trwa 7–10 dni;
        // przyjmujemy 7 dni jako minimalny schemat.
        'Ceftibuten': { mgRange: [9, 9], defaultMg: 9, doses: 1, duration: 7 },

        // Amoksycylina z kwasem klawulanowym – w niepowikłanym ZUM zaleca się
        // 25–45 mg/kg mc./dobę amoksycyliny z kwasem klawulanowym w dwóch dawkach podzielonych
        // (co 12 h), z maksymalną dawką pojedynczą 875 mg/125 mg i terapią 7 dni【441247308496709†L122-L132】.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 35, doses: 2, duration: 7 },

        // Cefaleksyna – dzieci <12 lat otrzymują 25–50 mg/kg mc./dobę w 2 dawkach co 12 h; w ciężkich
        // zakażeniach dawkę można podwoić. W zapaleniu pęcherza moczowego zaleca się 7–14 dni leczenia
        //【669584026894856†L30-L76】【669584026894856†L92-L98】. Stosujemy 2 dawki dziennie i domyślną dawkę 37,5 mg/kg.
        'Cefaleksyna': { mgRange: [25, 50], defaultMg: 37.5, doses: 2, duration: 7 }
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
        'Ceftibuten': { mgRange: [9, 9], defaultMg: 9, doses: 1, duration: 10 },
        // Dostosowano zakresy dawek i liczby podań do aktualnych wytycznych PTNFD i CHPL.
        // Aksetyl cefuroksymu: dla pyelonephritis rekomenduje się 30 mg/kg/dobę w 2 dawkach【64532254697819†L1566-L1577】,
        // więc ustawiamy stały zakres 30 mg/kg/dobę (2 dawki).
        'Aksetyl cefuroksymu': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 10 },
        // Cefuroksym (dożylnie): zalecany zakres 50–100 mg/kg/dobę w 3 dawkach, z typową dawką ok. 60 mg/kg/dobę【952311008969875†L160-L167】.
        // Obniżono dolną granicę do 50 mg/kg/dobę i zmniejszono domyślną dawkę do 75 mg/kg/dobę.
        'Cefuroksym (dożylnie)': { mgRange: [50, 100], defaultMg: 75, doses: 3, duration: 10 },
        // Cefotaksym: u dzieci do 12 lat stosuje się 50–100 mg/kg/dobę w 2–4 dawkach, a u dorosłych 3–6 g/dobę【890074162704657†L119-L133】.
        // Zawężamy górną granicę do 100 mg/kg/dobę i ustawiamy domyślnie 80 mg/kg/dobę.
        'Cefotaksym': { mgRange: [50, 100], defaultMg: 80, doses: 3, duration: 10 },
        // Ceftriakson: w pyelonephritis podaje się 20–50 mg/kg mc. raz na dobę (max 2 g/dobę)【360573216427241†L1750-L1760】.
        'Ceftriakson': { mgRange: [20, 50], defaultMg: 40, doses: 1, duration: 10 },
        // Cefepim: zalecane 50 mg/kg co 12 h (lub co 8 h w cięższych zakażeniach), czyli 60–100 mg/kg/dobę【63965750869139†L409-L417】.
        // Pozostawiamy zakres 50–100 mg/kg/dobę i redukujemy domyślną dawkę do 70 mg/kg/dobę.
        'Cefepim': { mgRange: [50, 100], defaultMg: 70, doses: 2, duration: 10 },
        // Gentamycyna: w powikłanych ZUM u dzieci >2 mies. 3–6 mg/kg/dobę w pojedynczej dawce, u niemowląt 4,5–7,5 mg/kg【811949273617179†L158-L175】.
        // Ustawiamy zakres 3–6 mg/kg/dobę i domyślnie 5 mg/kg, jedna dawka.
        'Gentamycyna': { mgRange: [3, 6], defaultMg: 5, doses: 1, duration: 7 },
        // Amikacyna: dzieci 4 tyg.–11 lat 15–20 mg/kg/dobę (1×/dobę lub 7,5 mg/kg co 12 h), dorośli 15 mg/kg/dobę【769176637956512†L71-L103】.
        // Zakres 15–20 mg/kg/dobę, domyślnie 15 mg/kg.
        'Amikacyna': { mgRange: [15, 20], defaultMg: 15, doses: 1, duration: 7 },
        // Cyprofloksacyna: w ostrym odmiedniczkowym zapaleniu nerek u dzieci 6–10 mg/kg co 8 h (3 dawki), czyli 18–30 mg/kg/dobę (max 400 mg na dawkę)【832677245622068†L325-L336】.
        // Ustawiamy zakres 18–30 mg/kg/dobę, domyślnie 24 mg/kg, i zwiększamy liczbę dawek do 3.
        'Cyprofloksacyna': { mgRange: [18, 30], defaultMg: 24, doses: 3, duration: 10 },
        // Lewofloksacyna: brak jednoznacznych zaleceń pediatrycznych – stosuje się 10–15 mg/kg/dobę raz na dobę u dzieci starszych, a u dorosłych 500 mg/dobę.
        // Redukujemy górną granicę do 15 mg/kg/dobę i domyślną dawkę do 10 mg/kg.
        'Lewofloksacyna': { mgRange: [10, 15], defaultMg: 10, doses: 1, duration: 10 },
        // Piperacylina z tazobaktamem: w odmiedniczkowym ZUM dzieci 2–12 lat otrzymują 112,5 mg/kg co 8 h (tj. 337,5 mg/kg/dobę), dorośli 4,5 g co 8 h【101103782443135†L160-L170】.
        // Dopasowujemy zakres 300–337,5 mg/kg/dobę i domyślną dawkę 337 mg/kg, pozostawiając 3 dawki.
        'Piperacylina z tazobaktamem': { mgRange: [300, 337.5], defaultMg: 337, doses: 3, duration: 10 },
        // Imipenem z cilastatyną: dzieci ≥3 mies. 15–25 mg/kg co 6 h, czyli 60–100 mg/kg/dobę【496788431355108†L1149-L1155】.
        // Zmieniamy zakres na 60–100 mg/kg/dobę, domyślnie 80 mg/kg, i zwiększamy liczbę dawek do 4.
        'Imipenem z cilastatyną': { mgRange: [60, 100], defaultMg: 80, doses: 4, duration: 10 },
        // Meropenem: u dzieci 20 mg/kg co 8 h (60 mg/kg/dobę) w umiarkowanych zakażeniach; w cięższych 40 mg/kg co 8 h (120 mg/kg/dobę)【265555727539503†L160-L182】.
        // Zakres pozostaje 60–120 mg/kg/dobę, ale domyślną dawkę redukujemy do 80 mg/kg.
        'Meropenem': { mgRange: [60, 120], defaultMg: 80, doses: 3, duration: 10 },
        // Doripenem: brak zaleceń pediatrycznych, u dorosłych 500 mg co 8 h (1,5 g/dobę) lub 1 g co 8 h (3 g/dobę)【453653223660162†L48-L58】.
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
        // Furazydyna (nitrofurantoina) – nie osiąga odpowiednich stężeń w tkance nerkowej, dlatego nie zaleca się jej w leczeniu powikłanych zakażeń układu moczowego ani odmiedniczkowego zapalenia nerek【368431203664830†L98-L124】【368431203664830†L148-L151】.  
        // Zachowujemy jednak zakres 5–7 mg/kg/dobę jako orientacyjną dawkę, ale usuwamy oznaczenie firstChoice.
        'Furazydyna': { mgRange: [5, 7], defaultMg: 6, doses: 4, duration: 7 },
        // Amoksycylina – w leczeniu powikłanych ZUM zaleca się wysokodawkowy schemat 80–90 mg/kg/dobę (30 mg/kg/dawka × 3), stosowany przez 10 dni【892923089545176†L120-L157】.  
        'Amoksycylina': { mgRange: [80, 90], defaultMg: 90, doses: 3, duration: 10 },
        // Amoksycylina z kwasem klawulanowym – w powikłanych zakażeniach układu moczowego i odmiedniczkowym zapaleniu nerek używa się 45 mg/kg amoksycyliny na dawkę podawaną co 12 h (2 dawki), co odpowiada 90 mg/kg/dobę【892923089545176†L120-L157】.  
        'Amoksycylina z kwasem klawulanowym': { mgRange: [80, 90], defaultMg: 90, doses: 2, duration: 10 },
        // Cefaleksyna – doustna cefalosporyna I generacji stosowana w terapii następczej. Przy pyelonephritis zaleca się 25 mg/kg/dawkę 4 ×/dobę (czyli 100 mg/kg/dobę), z maksymalną dawką 1 g na podanie【892923089545176†L120-L157】.  
        'Cefaleksyna': { mgRange: [75, 100], defaultMg: 100, doses: 4, duration: 10, maxDailyMg: 4000 },
        // Fosfomycyna – pojedyncza dawka 3 g stosowana jest wyłącznie w niepowikłanych zakażeniach dolnych dróg moczowych. W powikłanych zakażeniach i odmiedniczkowym zapaleniu nerek nie jest rekomendowana【368431203664830†L98-L124】【368431203664830†L148-L151】.  
        'Fosfomycyna': { mgRange: [50, 50], defaultMg: 50, doses: 1, duration: 1 },
        // Cefuroksym (dożylnie) – w cięższych zakażeniach układu moczowego dawka wynosi 50 mg/kg co 8 h do 150 mg/kg/dobę; górna granica stosowana w ciężkich zakażeniach【952311008969875†L160-L167】.  
        'Cefuroksym (dożylnie)': { mgRange: [75, 150], defaultMg: 100, doses: 3, duration: 10 },
        // Cefotaksym – w powikłanych zakażeniach układu moczowego i odmiedniczkowym zapaleniu nerek zalecane jest 100–200 mg/kg/dobę w 3 dawkach【892923089545176†L32-L64】.  
        'Cefotaksym': { mgRange: [100, 200], defaultMg: 150, doses: 3, duration: 10 },
        // Ceftriakson – terapia parenteralna 50 mg/kg/dobę w jednej dawce do maks. 2 g/dobę【892923089545176†L58-L64】.  
        'Ceftriakson': { mgRange: [50, 50], defaultMg: 50, doses: 1, duration: 10 },
        // Cefepim – w powikłanych zakażeniach układu moczowego stosuje się 50 mg/kg co 8–12 h (100–150 mg/kg/dobę); przyjmujemy zakres 100–150 mg/kg/dobę【628904646534671†L47-L79】.  
        'Cefepim': { mgRange: [100, 150], defaultMg: 100, doses: 3, duration: 10 },
        // Piperacylina z tazobaktamem – u dzieci 2–12 lat 112,5 mg/kg co 8 h (337,5 mg/kg/dobę); przyjmujemy zakres 270–337,5 mg/kg/dobę z domyślną wartością 300 mg/kg【101103782443135†L160-L170】.  
        'Piperacylina z tazobaktamem': { mgRange: [270, 337.5], defaultMg: 300, doses: 3, duration: 10 },
        // Imipenem z cilastatyną – dzieci ≥3 mies. otrzymują 15–25 mg/kg co 6 h (60–100 mg/kg/dobę)【496788431355108†L1149-L1155】.  
        'Imipenem z cilastatyną': { mgRange: [60, 100], defaultMg: 80, doses: 4, duration: 10 },
        // Meropenem – w umiarkowanych zakażeniach 20 mg/kg co 8 h (60 mg/kg/dobę); w cięższych 40 mg/kg co 8 h (120 mg/kg/dobę)【265555727539503†L160-L182】.  
        'Meropenem': { mgRange: [60, 120], defaultMg: 80, doses: 3, duration: 10 },
        // Doripenem – brak danych pediatrycznych; u dorosłych stosuje się 500 mg co 8 h (1,5 g/dobę) lub 1 g co 8 h (3 g/dobę)【453653223660162†L48-L58】.  
        // Pozostawiamy zakres 60–120 mg/kg/dobę i trzy dawki, ale dodajemy komunikat ostrzegawczy w kalkulatorze.  
        'Doripenem': { mgRange: [60, 120], defaultMg: 80, doses: 3, duration: 10 }
      }
    }
    ,
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
        // preferuje się klindamycynę lub kotrimoksazol przez 5 dni【409625707964542†L755-L774】.
        'Cefaleksyna': { mgRange: [25, 50], defaultMg: 40, doses: 4, duration: 5 },
        'Cefadroksyl': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 5 },
        // Klindamycyna stosowana jest w dawce 10 mg/kg co 8 godzin (≈30 mg/kg/dobę)
        // maks. 450 mg na dawkę; czas leczenia 5 dni【409625707964542†L762-L770】.
        'Klindamycyna': { mgRange: [30, 30], defaultMg: 30, doses: 3, duration: 5, firstChoice: true },
        // Zmodyfikowano parametry dawkowania amoksycyliny z kwasem klawulanowym
        // dla ropni i czyraków. Umiarkowane infekcje skóry leczymy dawką
        // 25–45 mg/kg/dobę w dwóch podaniach. Czas terapii skrócono do 5 dni,
        // ponieważ krótsze kuracje są wystarczające【409625707964542†L714-L736】.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 35, doses: 2, duration: 5 },
        // Cefazolina dożylna w leczeniu ropni jest stosowana w dawce 33 mg/kg/dawkę
        // co 8 godzin (≈100 mg/kg/dobę)【852377925409726†L490-L497】. Dlatego zwiększono górny limit
        // i skrócono czas terapii do 5 dni.
        'Cefazolina': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 5 },
        // Metronidazol stosuje się pomocniczo w zakażeniach beztlenowych skóry;
        // terapię skrócono do 5 dni.
        'Metronidazol': { mgRange: [10, 15], defaultMg: 12, doses: 3, duration: 5 },
        'Wankomycyna': { mgRange: [40, 60], defaultMg: 45, doses: 2, duration: 7 },
        'Linezolid': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 7 },
        // Dodano kotrimoksazol (trimetoprim‑sulfametoksazol) jako alternatywę
        // dla MRSA – 4–6 mg trimetoprimu/kg co 12 h przez 5 dni【409625707964542†L772-L775】.
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
        // wydłużony do 7–10 dni przy powolnej poprawie【904925423924891†L59-L82】. Zmieniamy
        // zakres na 50–60 mg/kg mc./dobę, skracamy terapię do 5 dni i pozostawiamy 3 dawki.
        'Fenoksymetylpenicylina': { mgRange: [50, 60], defaultMg: 55, doses: 3, duration: 5, firstChoice: true },
        // Amoksycylina – zgodnie z wytycznymi pediatrycznymi stosuje się
        // 12,5 mg/kg mc. co 8 h (≈37,5 mg/kg mc./dobę), maks. 500 mg na dawkę【904925423924891†L59-L82】.
        // Aby uwzględnić wyższą skuteczność przy 3 dawkach oraz tolerancję, ustawiamy
        // zakres 40–50 mg/kg mc./dobę, domyślną wartość 45 mg/kg mc./dobę i
        // 3 dawki przez 5 dni.
        'Amoksycylina': { mgRange: [40, 50], defaultMg: 45, doses: 3, duration: 5 },
        // Amoksycylina z kwasem klawulanowym – w umiarkowanym cellulitisie
        // stosuje się 22,5 mg/kg mc. amoksycyliny co 12 h (≈45 mg/kg mc./dobę) przez 5 dni【484053453334385†L155-L176】.
        // Ustawiamy zakres 40–45 mg/kg mc./dobę, domyślną wartość 45 mg i 2 dawki.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [40, 45], defaultMg: 45, doses: 2, duration: 5 },
        // Cefaleksyna – lek pierwszego wyboru w cellulitis/ róży: 17 mg/kg mc./dawkę co 8 h
        // (≈50 mg/kg mc./dobę) przez 5 dni【484053453334385†L155-L176】. Zmniejszamy liczbę dawek do 3.
        'Cefaleksyna': { mgRange: [25, 50], defaultMg: 50, doses: 3, duration: 5 },
        // Cefadroksyl – 30 mg/kg mc./dobę w dwóch dawkach stanowi alternatywę; skracamy terapię do 5 dni.
        'Cefadroksyl': { mgRange: [30, 30], defaultMg: 30, doses: 2, duration: 5 },
        // Klindamycyna – dawka 10 mg/kg mc. co 8 h (≈30 mg/kg mc./dobę) przez 5 dni【484053453334385†L191-L194】.
        'Klindamycyna': { mgRange: [20, 30], defaultMg: 30, doses: 3, duration: 5 },
        // Cefuroksym i.v. – zakres 75–100 mg/kg mc./dobę w 3 dawkach pozostaje, skracamy terapię do 5 dni.
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 5 },
        // Cefazolina – zalecana dawka 25 mg/kg mc. co 8 h (≈75 mg/kg/dobę); skracamy terapię do 5 dni【484053453334385†L165-L166】.
        'Cefazolina': { mgRange: [75, 100], defaultMg: 90, doses: 3, duration: 5 },
        // Kloksacylina – w leczeniu MSSA dawkuje się 12,5 mg/kg mc. co 6 h (≈50 mg/kg mc./dobę). Ustawiamy
        // zakres 50–100 mg/kg mc./dobę z domyślną 75 mg, 4 dawki i 5 dni terapii.
        'Kloksacylina': { mgRange: [50, 100], defaultMg: 75, doses: 4, duration: 5 },
        // Benzylopenicylina – stosuje się 50 000–100 000 j.m./kg mc. (≈33–65 mg/kg mc./dobę);
        // skracamy terapię do 5 dni i pozostawiamy 4 dawki.
        'Benzylopenicylina': { mgRange: [50, 75], defaultMg: 60, doses: 4, duration: 5 },
        // Wankomycyna – w ciężkich przypadkach stosuje się 15 mg/kg mc. co 6 h (≈60 mg/kg mc./dobę);
        // pozostawiamy 4 dawki i ograniczamy terapię do 7 dni【852377925409726†L154-L172】.
        'Wankomycyna': { mgRange: [60, 60], defaultMg: 60, doses: 4, duration: 7 },
        // Linezolid – dawka 10 mg/kg mc. co 8 h (<12 lat) czyli 30 mg/kg mc./dobę;
        // u starszych dzieci stosuje się 600 mg co 12 h. Ustawiamy 3 dawki i 7 dni terapii【904925423924891†L287-L290】.
        'Linezolid': { mgRange: [30, 30], defaultMg: 30, doses: 3, duration: 7 },
        // Dodajemy trimetoprim‑sulfametoksazol jako lek alternatywny na MRSA; dawka 4–6 mg/kg mc. trimetoprimu
        // co 12 h (≈8–12 mg/kg mc./dobę) przez 5 dni【484053453334385†L215-L216】.
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
        // Skracamy terapię zakażonych ran do 5 dni dla większości doustnych leków, zgodnie z zaleceniami pediatrycznymi dla cellulitis/erysipelas【904925423924891†L62-L80】【484053453334385†L155-L176】.
        // Amoksycylina z kwasem klawulanowym – 22,5 mg/kg mc. co 12 h (≈45 mg/kg mc./dobę) przez 5 dni jest standardem w leczeniu umiarkowanych zakażeń skóry【484053453334385†L155-L176】.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 35, doses: 2, duration: 5, firstChoice: true },
        // Cefaleksyna – w leczeniu cellulitis stosuje się 12,5–17 mg/kg/dawkę co 8 h (25–50 mg/kg mc./dobę) przez 5 dni【904925423924891†L62-L80】. Zmniejszamy liczbę dawek do 3.
        'Cefaleksyna': { mgRange: [25, 50], defaultMg: 40, doses: 3, duration: 5 },
        // Cefuroksym i.v. – zakres 75–100 mg/kg mc./dobę w 3 dawkach utrzymujemy, ale skracamy terapię do 5 dni.
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 5 },
        // Cefazolina – zalecane jest ok. 33 mg/kg/dawkę co 8 h (≈100 mg/kg/dobę) w umiarkowanych zakażeniach【484053453334385†L165-L168】. Zmieniamy zakres na 75–100 mg/kg/dobę z domyślną wartością 90 mg i skracamy terapię do 5 dni.
        'Cefazolina': { mgRange: [75, 100], defaultMg: 90, doses: 3, duration: 5 },
        // Klindamycyna – 10 mg/kg/dawkę co 8 h (≈30 mg/kg mc./dobę) przez 5 dni【484053453334385†L191-L194】. Ustawiamy domyślną dawkę 30 mg/kg mc./dobę.
        'Klindamycyna': { mgRange: [20, 30], defaultMg: 30, doses: 3, duration: 5 },
        // Metronidazol – stosuje się 10 mg/kg mc. co 12 h (20 mg/kg mc./dobę) w terapii skojarzonej【760797221558041†L240-L247】. Zmieniamy na 2 dawki i 5 dni.
        'Metronidazol': { mgRange: [20, 20], defaultMg: 20, doses: 2, duration: 5 },
        // Cyprofloksacyna – u dzieci z alergią na beta‑laktamy stosuje się 20–30 mg/kg mc./dobę w dwóch dawkach【923343977244963†L51-L92】. Skracamy terapię do 5 dni.
        'Cyprofloksacyna': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 5 },
        // Piperacylina z tazobaktamem – pozostaje bez zmian (3 dawki przez 10 dni) dla ciężkich zakażeń.
        'Piperacylina z tazobaktamem': { mgRange: [200, 300], defaultMg: 240, doses: 3, duration: 10 },
        // Wankomycyna – w ciężkich zakażeniach skóry stosuje się 15 mg/kg/dawkę co 6 h (≈60 mg/kg mc./dobę). Ustawiamy zakres 60 mg/kg mc./dobę, 4 dawki dziennie i 7 dni terapii【904925423924891†L280-L282】.
        'Wankomycyna': { mgRange: [60, 60], defaultMg: 60, doses: 4, duration: 7 },
        // Linezolid – dawka 10 mg/kg/dawkę co 8 h (<12 lat) czyli 30 mg/kg mc./dobę z maksymalnie 600 mg/dawkę; dla starszych 600 mg co 12 h【904925423924891†L287-L290】. Ustawiamy 3 dawki i 7 dni terapii.
        'Linezolid': { mgRange: [30, 30], defaultMg: 30, doses: 3, duration: 7 },
        // Dodajemy trimetoprim‑sulfametoksazol jako lek alternatywny na MRSA. Dawka 4–6 mg/kg mc. trimetoprimu co 12 h (8–12 mg/kg mc./dobę) przez 5 dni【484053453334385†L148-L150】.
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
        // Wytyczne pediatryczne zalecają dawkę około 22,5 mg/kg mc. co 12 h (czyli ~45 mg/kg mc./dobę), maksymalnie 875 mg na dawkę【31704952314751†L136-L154】【760797221558041†L240-L247】.
        // Leczenie najczęściej trwa 5 dni; dłuższy kurs (do 7 dni) rezerwuje się dla aktywnych zakażeń【31704952314751†L136-L154】.
        'Amoksycylina z kwasem klawulanowym': { mgRange: [25, 45], defaultMg: 40, doses: 2, duration: 5, firstChoice: true },
        // Cefuroksym i.v. jest rzadko stosowany w zakażeniach po ugryzieniach; najczęściej stosuje się ampicylinę/sulbaktam lub ceftriakson z metronidazolem.
        // Pozostawiamy dawkę w dotychczasowym zakresie, lecz skracamy terapię do 5 dni w lżejszych przypadkach.
        'Cefuroksym (dożylnie)': { mgRange: [75, 100], defaultMg: 100, doses: 3, duration: 5 },
        // Klindamycyna: zalecana dawka to 10 mg/kg mc. co 8 h (≈30 mg/kg mc./dobę) w skojarzeniu z innymi lekami przy alergii na penicyliny【923343977244963†L51-L92】.
        // Ustawiamy zakres 20–30 mg/kg mc./dobę, domyślną wartość 30 mg/kg mc./dobę i skracamy czas terapii do 5 dni.
        'Klindamycyna': { mgRange: [20, 30], defaultMg: 30, doses: 3, duration: 5 },
        // Cyprofloksacyna jest stosowana u dzieci z alergią na beta‑laktamy w skojarzeniu z trimetoprim‑sulfametoksazolem lub klindamycyną.
        // Zalecane dzienne dawki mieszczą się w zakresie 20–30 mg/kg mc., podawane w dwóch dawkach【923343977244963†L51-L92】. Skracamy czas terapii do 5 dni.
        'Cyprofloksacyna': { mgRange: [20, 30], defaultMg: 25, doses: 2, duration: 5 },
        // Metronidazol w schemacie doustnym podaje się 10 mg/kg mc. co 12 h (20 mg/kg mc./dobę) jako część terapii skojarzonej, np. z trimetoprim‑sulfametoksazolem【760797221558041†L240-L247】.
        // Redukujemy liczbę dawek do 2 na dobę i skracamy terapię do 5 dni.
        'Metronidazol': { mgRange: [20, 20], defaultMg: 20, doses: 2, duration: 5 },
        // Dodajemy trimetoprim‑sulfametoksazol (kotrimoksazol) jako opcję dla pacjentów uczulonych na penicyliny lub z podejrzeniem MRSA.
        // Zalecana dawka trimetoprimu 4–6 mg/kg mc. co 12 h (8–12 mg/kg mc./dobę) przez 5 dni【923343977244963†L51-L92】【760797221558041†L240-L247】.
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

  // Formatowanie liczb: używamy polskich separatorów i dwóch miejsc po przecinku.
  function fmt(n){
    if (!isFinite(n)) return '–';
    return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('.', ',');
  }

  // Główna funkcja tworząca element karty antybiotykoterapii.
  function createCard(){
    const card = document.createElement('section');
    card.id = 'antibioticTherapyCard';
    card.className = 'result-card animate-in';
    card.style.margin = '1rem 0';
    card.innerHTML = `
      <h2 style="text-align:center;">Antybiotykoterapia</h2>
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
        <label style="display:block; margin-top:.4rem;">
          Dawka (<span id="abxDoseDisplay">mg/kg/dobę</span>)
          <input type="range" id="abxDoseSlider" style="width:100%;">
        </label>
        <div style="display:flex; gap:.75rem; flex-wrap:wrap; margin-top:.6rem;">
          <label style="flex:1 1 200px; min-width:200px;">
            Wybrana dawka
            <input type="number" id="abxDoseInput" step="0.1" min="0" style="width:100%;" />
          </label>
          <label style="flex:1 1 180px; min-width:180px;">
            Czas terapii (dni)
            <input type="number" id="abxDuration" min="1" step="1" style="width:100%;" />
          </label>
        </div>
      </div>
      <div id="abxNote" class="muted" style="margin-top:.6rem;"></div>
      <div id="abxResult" class="result-box" style="margin-top:.9rem;"></div>
    `;
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
    indicSelect.innerHTML = '';
    INDICATION_ORDER.forEach(key => {
      const def = ABX_INDICATIONS[key];
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = def.label;
      indicSelect.appendChild(opt);
    });
    // Ustaw pierwsze wskazanie jako domyślne
    indicSelect.value = INDICATION_ORDER[0];
    populateDrugs();
  }

  // Uzupełnij listę leków na podstawie wybranego wskazania.
  function populateDrugs(){
    const indicKey = document.getElementById('abxIndication').value;
    const indic = ABX_INDICATIONS[indicKey];
    const drugSelect = document.getElementById('abxDrug');
    if(!drugSelect) return;
    drugSelect.innerHTML = '';
    // Jeżeli dla wskazania nie zdefiniowano leków, ukryj kontrolki i wyświetl komunikat
    const controls = document.getElementById('abxControls');
    const note     = document.getElementById('abxNote');
    if(!indic.drugs){
      if(controls) controls.style.display = 'none';
      if(note)     note.textContent = indic.message || '';
      document.getElementById('abxResult').innerHTML = '';
      return;
    }
    // W przeciwnym razie pokaż kontrolki i wstaw opcje
    if(controls) controls.style.display = 'block';
    if(note)     note.textContent = '';
    const drugKeys = Object.keys(indic.drugs);
    drugKeys.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      const isFirst = indic.drugs[name].firstChoice;
      // Wyświetl nazwę z oznaczeniem "i.v" dla leków dożylnych. Ustalamy to
      // na podstawie definicji DRUG_INFO: jeśli którakolwiek postać leku posiada
      // parametr mgPerVial, uznajemy lek za dożylny i dopisujemy " i.v" do
      // etykiety. Dzięki temu użytkownik łatwo rozróżni preparaty doustne od
      // dożylnych.
      let displayName = name;
      const info = DRUG_INFO[name];
      if (info && info.forms) {
        const formNames = Object.keys(info.forms);
        if (formNames.some(fn => 'mgPerVial' in info.forms[fn])) {
          displayName = `${name} i.v`;
        }
      }
      opt.textContent = isFirst ? `${displayName} (I wyboru)` : displayName;
      drugSelect.appendChild(opt);
    });
    // Domyślnie wybierz lek pierwszego wyboru, jeśli istnieje
    const defaultDrug = drugKeys.find(n => indic.drugs[n].firstChoice) || drugKeys[0];
    drugSelect.value = defaultDrug;
    // Po zmianie leku uzupełnij listę preparatów (jeśli dotyczy)
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
      formSelect.innerHTML = '';
      const forms = Object.keys(drugInfo.forms);
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
      const age    = getAge();
      const indicElem = document.getElementById('abxIndication');
      const indicKey  = indicElem && indicElem.value;
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
      } else if(indicKey === 'pneumonia_adult'){
        // Pozaszpitalne zapalenie płuc u dorosłych ma ustalone dawki niezależne od masy ciała.
        // Wybieramy odpowiednie tabletki lub fiolki na podstawie zaleceń IDSA/ATS oraz
        // dostępnych mocy preparatów. W większości przypadków u dorosłych stosuje się
        // doustne tabletki: amoksycylina 1 g trzy razy dziennie【548121027409041†L206-L247】,
        // doksycyklina 100 mg dwa razy dziennie【244960183512952†L20-L36】,
        // klarytromycyna 250–500 mg dwa razy dziennie (w cięższych zakażeniach 500 mg)【112691869839516†L205-L211】,
        // azytromycyna 500 mg w 1. dniu, następnie 250 mg/dzień【769803703970612†L136-L147】,
        // amoksycylina z kwasem klawulanowym 875/125 mg lub 500/125 mg【990359539008422†L132-L141】,
        // cefpodoksym 200 mg co 12 h【608895700919138†L146-L149】,
        // aksetyl cefuroksymu 500 mg co 12 h【792056642001203†L174-L184】,
        // lewofloksacyna 500–750 mg raz na dobę【679841742834900†L127-L131】 oraz
        // moksyfloksacyna 400 mg raz na dobę【255331690518457†L102-L116】. Na podstawie tych zaleceń
        // oraz dostępnych form w DRUG_INFO ustalamy domyślne postacie.
        const pneuForm = choosePneumoniaAdultDefaultForm(drugName, weight, age);
        if(pneuForm && drugInfo.forms[pneuForm]){
          defaultForm = pneuForm;
        }
      }
      // Jeżeli nie ustalono domyślnej postaci, zastosuj ogólną regułę wagową: dla pacjentów <35 kg
      // domyślnie wybierz pierwszą zawiesinę.
      if(!defaultForm && weight && weight < 35){
        for (const fn of forms) {
          const f = drugInfo.forms[fn];
          if (f && f.formType === 'suspension') {
            defaultForm = fn;
            break;
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
      formSelect.innerHTML = '';
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
 * Wybiera domyślną postać amoksycyliny z kwasem klawulanowym na podstawie masy ciała.
 * Standardowa zawiesina 400 mg/57 mg/5 ml jest wygodna w dawkowaniu u małych dzieci.
 * Wysokodawkowa zawiesina ES 600 mg/42,9 mg/5 ml pozwala podać wymaganą ilość
 * amoksycyliny przy mniejszej objętości i zalecana jest u dzieci o większej masie
 * (powyżej ~15 kg), zwłaszcza gdy konieczne są dawki >70 mg/kg/dobę【406332432356125†L197-L202】. U pacjentów o masie ≥40 kg
 * preferowane są tabletki 875 mg/125 mg, które można podawać trzy razy dziennie w
 * cięższych zakażeniach (zapalenie ucha, zatok, płuc, odmiedniczkowe zapalenie nerek)【560332943530599†L118-L129】.
 *
 * @param {number|null} weight Masa ciała w kilogramach lub null, jeśli nieznana
 * @returns {string} nazwa domyślnej postaci
 */
function chooseAmoxClavDefaultForm(weight){
  if(weight === null || weight === undefined){
    return 'Zawiesina 400 mg/57 mg/5 ml';
  }
  // Dzieci do ~15 kg najłatwiej leczyć standardową zawiesiną 400 mg/57 mg/5 ml
  if(weight < 15){
    return 'Zawiesina 400 mg/57 mg/5 ml';
  }
  // Dzieci 15–40 kg: w zakażeniach wymagających wysokich dawek (70–90 mg/kg)
  // korzystniejsza jest zawiesina ES 600 mg/42,9 mg/5 ml, gdyż pozwala podać
  // mniej mililitrów i zawiera mniejszą ilość kwasu klawulanowego w stosunku
  // do amoksycyliny【759532590181075†L450-L503】.
  if(weight < 40){
    return 'Zawiesina 600 mg/42,9 mg/5 ml (ES)';
  }
  // U pacjentów ≥40 kg domyślnie proponujemy tabletki o mocy 875 mg/125 mg.
  // Charakterystyki preparatów 875 mg/125 mg podają, że wysoka dawka
  // (875 mg amoksycyliny + 125 mg kwasu klawulanowego) stosowana jest trzy razy
  // dziennie w infekcjach takich jak zapalenie ucha, zatok czy płuc【560332943530599†L118-L129】.
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
    // pacjentów <50 kg; tabletki 100 mg dla osób ≥50 kg【570955172307667†L249-L274】【707745312262399†L256-L297】.
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
    // 20–40 kg; 200 mg tabletka ≥40 kg【159909727498009†L1158-L1195】.
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
    // ≥12 lat lub ≥40 kg【705892490472690†L106-L113】.
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
    // Fosfomycyna: jednorazowa saszetka 3 g u kobiet i dziewcząt ≥12 lat【472729322937420†L250-L259】.
    if(drugName === 'Fosfomycyna'){
      return 'Saszetka 3 g';
    }
    // Aksetyl cefuroksymu: 125 mg/5 ml <10 kg; 250 mg/5 ml 10–40 kg; tabletka 250 mg ≥40 kg【656974634179548†L90-L105】.
    if(drugName === 'Aksetyl cefuroksymu'){
      if(weight !== null){
        if(weight < 10) return 'Zawiesina 125 mg/5 ml';
        if(weight < 40) return 'Zawiesina 250 mg/5 ml';
        return 'Tabletka 250 mg';
      }
      return 'Zawiesina 125 mg/5 ml';
    }
    // Cefiksym: zawiesina 100 mg/5 ml dla <40 kg; tabletka 400 mg ≥40 kg【918558300544367†L186-L199】.
    if(drugName === 'Cefiksym'){
      if(weight !== null && weight < 40){
        return 'Zawiesina 100 mg/5 ml';
      }
      return 'Tabletka 400 mg';
    }
    // Ceftibuten: zawiesina 180 mg/5 ml dla <40 kg; kapsułka 400 mg ≥40 kg【831558045112527†L145-L151】.
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
    // Cefaleksyna: 125 mg/5 ml <10 kg; 250 mg/5 ml 10–25 kg; kapsułka 250 mg 25–40 kg; kapsułka 500 mg ≥40 kg【669584026894856†L30-L76】【669584026894856†L92-L98】.
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
    // 200 mg/5 ml (nowo dodana); ≥40 kg – tabletka 400 mg【2804955795389†L410-L434】.
    if(drugName === 'Cefiksym'){
      if(approxWeight < 20) return 'Zawiesina 100\u00a0mg/5\u00a0ml';
      if(approxWeight < 40) return 'Zawiesina 200\u00a0mg/5\u00a0ml';
      return 'Tabletka 400\u00a0mg';
    }
    // Ceftibuten: <20 kg – zawiesina 90 mg/5 ml; 20–40 kg – zawiesina
    // 180 mg/5 ml; ≥40 kg – kapsułka 400 mg【47187464076196†L990-L1005】.
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
    // Cefotaksym: <40 kg – fiolka 1000 mg; ≥40 kg – fiolka 2000 mg【646197711799739†L6-L14】.
    if(drugName === 'Cefotaksym'){
      if(approxWeight < 40) return 'Fiolka 1000\u00a0mg';
      return 'Fiolka 2000\u00a0mg';
    }
    // Ceftriakson: <40 kg – fiolka 1000 mg; ≥40 kg – fiolka 2000 mg【785655133783319†L35-L38】.
    if(drugName === 'Ceftriakson'){
      if(approxWeight < 40) return 'Fiolka 1000\u00a0mg';
      return 'Fiolka 2000\u00a0mg';
    }
    // Cefepim: <40 kg – fiolka 1 g; ≥40 kg – fiolka 2 g【196780833106619†L26-L29】.
    if(drugName === 'Cefepim'){
      if(approxWeight < 40) return 'Fiolka 1\u00a0g';
      return 'Fiolka 2\u00a0g';
    }
    // Gentamycyna: <20 kg – ampułka 40 mg/1 ml; ≥20 kg – ampułka 80 mg/2 ml【667278323257824†L137-L142】.
    if(drugName === 'Gentamycyna'){
      if(approxWeight < 20) return 'Ampułka 40\u00a0mg/1\u00a0ml';
      return 'Ampułka 80\u00a0mg/2\u00a0ml';
    }
    // Amikacyna: <20 kg – ampułka 100 mg/2 ml; ≥20 kg – ampułka 500 mg/2 ml【223273754127763†L970-L1023】.
    if(drugName === 'Amikacyna'){
      if(approxWeight < 20) return 'Ampułka 100\u00a0mg/2\u00a0ml';
      return 'Ampułka 500\u00a0mg/2\u00a0ml';
    }
    // Cyprofloksacyna: <40 kg – roztwór 200 mg/100 ml; ≥40 kg – roztwór 400 mg/200 ml【884745700927222†L157-L160】.
    if(drugName === 'Cyprofloksacyna'){
      if(approxWeight < 40) return 'Roztwór 200\u00a0mg/100\u00a0ml';
      return 'Roztwór 400\u00a0mg/200\u00a0ml';
    }
    // Lewofloksacyna: <40 kg – roztwór 500 mg/100 ml; ≥40 kg – tabletka 500 mg【444185037606548†L1080-L1087】.
    if(drugName === 'Lewofloksacyna'){
      if(approxWeight < 40) return 'Roztwór 500\u00a0mg/100\u00a0ml';
      return 'Tabletka 500\u00a0mg';
    }
    // Piperacylina z tazobaktamem: dostępna tylko fiolka 4,5 g, bez względu na wagę【856708597580212†L24-L27】.
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
    // Doripenem: jedyna dostępna postać to fiolka 500 mg【453653223660162†L48-L58】.
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
   *    zmniejszyć objętość podawanej porcji【743170703614183†L1088-L1092】. Dorośli
   *    otrzymują 250–500 mg co 8 h lub 750 mg–1 g co 12 h【743170703614183†L213-L223】.
   *    Dlatego dla pacjentów <10 kg wybieramy słabszą zawiesinę 250 mg/5 ml,
   *    dla 10–40 kg – zawiesinę 500 mg/5 ml, a u osób ≥40 kg proponujemy
   *    tabletki 500 mg; dla bardzo dużej masy ciała (≥60 kg) domyślnie
   *    wybieramy tabletkę 1000 mg, aby zmniejszyć liczbę tabletek przy
   *    wysokodawkowym schemacie.
   *
   *  • **Amoksycylina z kwasem klawulanowym** – korzystamy z istniejącej
   *    funkcji chooseAmoxClavDefaultForm, która uwzględnia, że standardowa
   *    zawiesina 400 mg/57 mg/5 ml jest odpowiednia dla małych dzieci,
   *    zawiesina ES 600 mg/42,9 mg/5 ml dla dzieci 15–40 kg, a tabletki
   *    875 mg/125 mg dla pacjentów ≥40 kg【768775856011286†L270-L283】.
   *
   *  • **Aksetyl cefuroksymu** – w ostrym zapaleniu zatok dzieci <40 kg
   *    otrzymują 15 mg/kg co 12 h (30 mg/kg/dobę) w postaci zawiesiny,
   *    zaś pacjenci ≥40 kg przyjmują 250 mg dwa razy na dobę w postaci
   *    tabletek【394695005999241†L770-L782】. Stąd wybieramy zawiesinę 125 mg/5 ml
   *    dla <10 kg, zawiesinę 250 mg/5 ml dla 10–40 kg oraz tabletkę 250 mg
   *    dla ≥40 kg.
   *
   *  • **Klarytromycyna** – dawka pediatryczna wynosi 7,5 mg/kg co 12 h
   *    (15 mg/kg/dobę) przez 10 dni, maksymalnie 500 mg/dobę【906701828520190†L344-L353】;
   *    dorośli otrzymują 500 mg co 12 h przez 14 dni【906701828520190†L125-L129】.
   *    Dlatego dzieci <12 kg otrzymują zawiesinę 125 mg/5 ml,
   *    12–25 kg – zawiesinę 250 mg/5 ml, 25–50 kg – tabletki 250 mg,
   *    a pacjenci ≥50 kg – tabletki 500 mg.
   *
   *  • **Azytromycyna** – dawkowanie w OZNS to 10 mg/kg/dobę przez 3 dni
   *    (schemat skrócony); dla dorosłych stosuje się 500 mg raz dziennie przez
   *    3 dni【435858598662885†L255-L262】【435858598662885†L1028-L1034】. Wybór
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
      if(weight < 10) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
      if(weight < 40) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
      return 'Tabletka 250\u00a0mg';
    }
    // Klarytromycyna
    if(drugName === 'Klarytromycyna'){
      if(weight < 12) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
      if(weight < 25) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
      if(weight < 50) return 'Tabletka 250\u00a0mg';
      return 'Tabletka 500\u00a0mg';
    }
    // Azytromycyna – użyj istniejącej funkcji
    if(drugName === 'Azytromycyna'){
      return chooseAzithroDefaultForm(weight);
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
   * >27 kg oraz dorośli – 500 mg【560839460156620†L43-L51】.
   *
   * Amoksycylina: <10 kg – zawiesina 250 mg/5 ml; 10–40 kg – zawiesina
   * 500 mg/5 ml; 40–60 kg – tabletka 500 mg; ≥60 kg – tabletka 1000 mg.
   *
   * Amoksycylina z kwasem klawulanowym: delegujemy do funkcji
   * chooseAmoxClavDefaultForm, ponieważ reguły dla pharyngitis nie różnią się
   * od innych wskazań – u najmłodszych dzieci preferowana jest zawiesina
   * 400 mg/57 mg/5 ml, u dzieci 15–40 kg zawiesina 600 mg/42,9 mg/5 ml (ES),
   * a u pacjentów ≥40 kg tabletka 875 mg/125 mg.
   *
   * Cefadroksyl: zgodnie z zaleceniami IDSA dzieci <40 kg otrzymują 30 mg/kg
   * raz na dobę (maks. 1 g), natomiast pacjenci ≥40 kg – dawkę 1 g【230220470390240†L113-L134】.
   * Aby ułatwić dawkowanie: <25 kg – zawiesina 250 mg/5 ml; 25–40 kg – tabletka
   * 500 mg; ≥40 kg – tabletka 1 000 mg.
   *
   * Cefaleksyna: dawka 20 mg/kg na podanie dwa razy dziennie (40 mg/kg/dobę),
   * z maksymalną pojedynczą dawką 500 mg【366853155809925†L270-L295】. Dla <12 kg
   * wybieramy zawiesinę 125 mg/5 ml; dla 12–25 kg – zawiesinę 250 mg/5 ml;
   * dla 25–40 kg – kapsułkę 250 mg; dla ≥40 kg – kapsułkę 500 mg.
   *
   * Klarytromycyna: 7,5 mg/kg na dawkę dwa razy dziennie (15 mg/kg/dobę) z
   * maksymalną pojedynczą dawką 250 mg【366853155809925†L293-L296】. Stąd
   * <12 kg – zawiesina 125 mg/5 ml; 12–25 kg – zawiesina 250 mg/5 ml;
   * 25–50 kg – tabletka 250 mg; ≥50 kg – tabletka 500 mg.
   *
   * Azytromycyna: korzystamy z istniejącej funkcji chooseAzithroDefaultForm,
   * ponieważ dawkowanie w pharyngitis jest takie samo jak w innych wskazaniach.
   *
   * Klindamycyna: zalecane 7 mg/kg na dawkę trzy razy dziennie (21 mg/kg/dobę)
   * z maksymalną pojedynczą dawką 300 mg【366853155809925†L284-L287】. Dla
   * <15 kg – granulat 75 mg/5 ml; 15–40 kg – kapsułka 150 mg; ≥40 kg –
   * kapsułka 300 mg.
   *
   * Aksetyl cefuroksymu: dawki 20–30 mg/kg/dobę w dwóch dawkach, maks.
   * 1000 mg/dobę【434395716885121†L774-L808】. Dla <10 kg – zawiesina
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
      if(drugName === 'Azytromycyna' || drugName === 'Azytromycyna (3 dni)'){ return chooseAzithroDefaultForm(null); }
      if(drugName === 'Klindamycyna'){ return 'Granulat 75\u00a0mg/5\u00a0ml'; }
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
        if(weight < 12) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
        if(weight < 25) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
        if(weight < 50) return 'Tabletka 250\u00a0mg';
        return 'Tabletka 500\u00a0mg';
      case 'Azytromycyna':
      case 'Azytromycyna (3 dni)':
        return chooseAzithroDefaultForm(weight);
      case 'Klindamycyna':
        if(weight < 15) return 'Granulat 75\u00a0mg/5\u00a0ml';
        if(weight < 40) return 'Kapsułka 150\u00a0mg';
        return 'Kapsułka 300\u00a0mg';
      case 'Aksetyl cefuroksymu':
        if(weight < 10) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
        if(weight < 25) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
        if(weight < 50) return 'Tabletka 250\u00a0mg';
        return 'Tabletka 500\u00a0mg';
      default:
        return null;
    }
  }

  /**
   * Wybiera domyślną postać antybiotyku w ostrym zapaleniu ucha środkowego (otitis).
   * Reguły opierają się na zaleceniach wysokodawkowej terapii amoksycyliną
   * (80–90 mg/kg mc./dobę) i amoksycyliną z kwasem klawulanowym, a także na
   * dostępnych stężeniach preparatów i objętościach opakowań. Celem jest
   * zmniejszenie liczby tabletek lub objętości zawiesiny przy dużych dawkach
   * stosowanych w OZUŚ oraz ułatwienie podawania u małych dzieci.
   *
   *  • **Amoksycylina** – w OZUŚ zaleca się wysokie dawki 80–90 mg/kg/dobę【69589037631869†L860-L881】.
   *    Zawiesiny 250 mg/5 ml i 500 mg/5 ml występują w butelkach 60 ml i 100 ml【202708336831534†L1104-L1132】,
   *    przy czym stężenie 500 mg/5 ml zmniejsza objętość podawanej porcji w wysokodawkowej kuracji.
   *    Dlatego dla pacjentów <10 kg proponujemy zawiesinę 250 mg/5 ml;
   *    dla 10–40 kg – zawiesinę 500 mg/5 ml; dla 40–60 kg – tabletkę 500 mg;
   *    a dla ≥60 kg – tabletkę 1000 mg.
   *
   *  • **Amoksycylina z kwasem klawulanowym** – stosuje się w przypadku braku
   *    odpowiedzi na samą amoksycylinę. Preparaty 400 mg/57 mg/5 ml (standard) i
   *    600 mg/42,9 mg/5 ml (ES) są dostępne w butelkach o pojemności 35, 70 lub 140 ml dla
   *    stężenia 400/57【606715700702725†L1139-L1141】 oraz 50, 75, 100 lub 150 ml dla stężenia 600/42,9【978121939033375†L786-L842】.
   *    Funkcja chooseAmoxClavDefaultForm uwzględnia, że dzieci <15 kg powinny
   *    otrzymywać zawiesinę 400 mg/57 mg/5 ml, dzieci 15–40 kg – zawiesinę ES 600 mg/42,9 mg/5 ml,
   *    a pacjenci ≥40 kg – tabletkę 875 mg/125 mg.
   *
   *  • **Aksetyl cefuroksymu (cefuroksym axetil)** – w OZUŚ stosuje się 30 mg/kg/dobę w dwóch
   *    dawkach, z maksymalną dawką dobową 1000 mg【565862944814290†L430-L440】. Zawiesiny 125 mg/5 ml
   *    i 250 mg/5 ml są dostępne w butelkach 50 ml i 100 ml【708693611805844†L840-L860】. Dlatego
   *    u pacjentów <10 kg wybieramy zawiesinę 125 mg/5 ml; u 10–25 kg – zawiesinę 250 mg/5 ml;
   *    u 25–50 kg – tabletkę 250 mg; a u ≥50 kg – tabletkę 500 mg (aby umożliwić 2×500 mg przy
   *    maksymalnej dawce dobowej 1000 mg).
   *
   *  • **Klarytromycyna** – rekomendowana dawka w OZUŚ to 15 mg/kg/dobę w dwóch dawkach z
   *    maksymalną dzienną dawką 500 mg【123300810807228†L69-L75】. Zawiesiny 125 mg/5 ml i
   *    250 mg/5 ml są dostępne w butelkach 50–100 ml【3329163548135†L27-L31】. Zalecamy: dla
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
   *   jako leczenie pierwszego wyboru w OZUŚ【228312492971791†L143-L150】. Zawiesiny 250 mg/5 ml
   *   i 500 mg/5 ml dostępne są w butelkach 60 ml lub 100 ml, przy czym stężenie
   *   500 mg/5 ml zmniejsza objętość przyjmowanego leku【910691948112598†L1088-L1092】.  
   *   Ustawiono progi masy ciała: <10 kg – zawiesina 250 mg/5 ml; 10–40 kg –
   *   zawiesina 500 mg/5 ml; 40–60 kg – tabletka 500 mg; ≥60 kg – tabletka 1000 mg.
   *
   * • **Amoksycylina z kwasem klawulanowym** – stosowana jako drugi wybór (w razie
   *   niewrażliwości na samą amoksycylinę). Wytyczne rekomendują dawkę
   *   90 mg/kg mc./dobę amoksycyliny w dwóch dawkach, z ograniczeniem kwasu
   *   klawulanowego <10 mg/kg mc./dobę【228312492971791†L143-L150】. Dlatego funkcja
   *   deleguje do istniejącej `chooseAmoxClavDefaultForm`, która proponuje
   *   zawiesinę 400/57 mg/5 ml dla <15 kg, zawiesinę ES 600/42,9 mg/5 ml dla
   *   15–40 kg oraz tabletkę 875/125 mg dla ≥40 kg.
   *
   * • **Aksetyl cefuroksymu** – zgodnie z FDA/Drugs.com dzieci (3 mies.–12 lat)
   *   z OZUŚ powinny otrzymywać 30 mg/kg mc./dobę w dwóch dawkach, maks. 1 000 mg/dobę【899192102383180†L203-L209】,
   *   a dzieci <13 lat, które mogą połykać tabletki, mogą stosować 250 mg co 12 h【899192102383180†L156-L164】.
   *   Tabletki i zawiesina nie są bioekwiwalentne, dlatego przyjmujemy progi:
   *   <10 kg – zawiesina 125 mg/5 ml; 10–25 kg – zawiesina 250 mg/5 ml; 25–50 kg –
   *   tabletka 250 mg; ≥50 kg – tabletka 500 mg.
   *
   * • **Klarytromycyna** – stosowana u pacjentów uczulonych na penicyliny.
   *   Pediatryczna dawka wynosi 7,5 mg/kg mc. co 12 h (max 500 mg/dobę), a u dorosłych
   *   250–500 mg co 12 h. Zawiesiny dostępne są w stężeniach 125 mg/5 ml i 250 mg/5 ml,
   *   a buteleczki zawierają odpowiednio 1250 mg (50 ml), 2500 mg (50 i 100 ml) lub 5000 mg (100 ml) po rekonstytucji【3329163548135†L27-L31】.
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
      if(drugName === 'Azytromycyna'){
        return chooseAzithroDefaultForm(null);
      }
      return null;
    }
    // Amoksycylina – progi masy ciała
    if(drugName === 'Amoksycylina'){
      if(weight < 10) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
      if(weight < 40) return 'Zawiesina 500\u00a0mg/5\u00a0ml';
      if(weight < 60) return 'Tabletka 500\u00a0mg';
      return 'Tabletka 1000\u00a0mg';
    }
    // Amoksycylina z kwasem klawulanowym – deleguj do istniejącej funkcji
    if(drugName === 'Amoksycylina z kwasem klawulanowym'){
      return chooseAmoxClavDefaultForm(weight);
    }
    // Aksetyl cefuroksymu
    if(drugName === 'Aksetyl cefuroksymu'){
      if(weight < 10) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
      if(weight < 25) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
      if(weight < 50) return 'Tabletka 250\u00a0mg';
      return 'Tabletka 500\u00a0mg';
    }
    // Klarytromycyna
    if(drugName === 'Klarytromycyna'){
      if(weight < 12) return 'Zawiesina 125\u00a0mg/5\u00a0ml';
      if(weight < 25) return 'Zawiesina 250\u00a0mg/5\u00a0ml';
      if(weight < 50) return 'Tabletka 250\u00a0mg';
      return 'Tabletka 500\u00a0mg';
    }
    // Azytromycyna – użyj dedykowanej funkcji
    if(drugName === 'Azytromycyna'){
      return chooseAzithroDefaultForm(weight);
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
   *    trzy razy dziennie【892923089545176†L120-L157】. Aby ograniczyć objętość podawanej
   *    zawiesiny, u pacjentów <10 kg proponujemy zawiesinę 250 mg/5 ml, w przedziale
   *    10–40 kg zawiesinę 500 mg/5 ml, u osób 40–60 kg tabletkę 500 mg, a u pacjentów ≥60 kg
   *    tabletkę 1000 mg. Dla preparatów z kwasem klawulanowym wykorzystujemy istniejącą funkcję
   *    `chooseAmoxClavDefaultForm`, która wybiera zawiesiny 400/57 mg/5 ml lub 600/42,9 mg/5 ml
   *    oraz tabletki 875/125 mg w zależności od masy ciała【768775856011286†L270-L283】.
   *
   *  • **Cefaleksyna** – w leczeniu następczym zaleca się 25 mg/kg na dawkę 4 ×/dobę
   *    (100 mg/kg/dobę) z maksymalną dawką 1 g na podanie【892923089545176†L120-L157】. Dostępne są
   *    zawiesiny 125 mg/5 ml i 250 mg/5 ml w butelkach 100 ml oraz kapsułki 250 mg i
   *    500 mg【66644751508260†L270-L291】【66644751508260†L389-L391】. U dzieci <10 kg wybieramy
   *    zawiesinę 125 mg/5 ml, w przedziale 10–25 kg – zawiesinę 250 mg/5 ml, u 25–50 kg
   *    kapsułkę 250 mg, a u pacjentów ≥50 kg kapsułkę 500 mg.
   *
   *  • **Furazydyna** – nitrofurantoina nie osiąga odpowiednich stężeń w tkance
   *    nerkowej i nie powinna być stosowana w powikłanych zakażeniach układu moczowego
   *    ani w odmiedniczkowym zapaleniu nerek【368431203664830†L98-L124】【368431203664830†L148-L151】.
   *    W kalkulatorze, u pacjentów <15 kg wskazujemy zawiesinę 50 mg/5 ml, u 15–40 kg
   *    tabletkę 50 mg, a u ≥40 kg tabletkę 100 mg. Jednak przypominamy, że lek ten
   *    nie powinien być pierwszym wyborem w powikłanych ZUM.
   *
   *  • **Fosfomycyna** – proszek 3 g (saszetka) jest przeznaczony wyłącznie do jednorazowej
   *    terapii niepowikłanego zapalenia pęcherza【368431203664830†L98-L124】【368431203664830†L148-L151】.
   *    W powikłanych ZUM preparat nie jest rekomendowany, dlatego domyślnie zwracamy null.
   *    Jeżeli masa ciała ≥40 kg i wiek ≥12 lat, można rozważyć saszetkę 3 g.
   *
   *  • **Cefuroksym (dożylnie)** – w powikłanych zakażeniach układu moczowego dawka wynosi
   *    50 mg/kg co 8 h (150 mg/kg/dobę)【952311008969875†L160-L167】. Preparat jest dostępny w fiolkach
   *    750 mg i 1500 mg【177294100088576†L14-L22】; dlatego pacjenci <40 kg otrzymują fiolkę 750 mg,
   *    a ≥40 kg fiolkę 1500 mg.
   *
   *  • **Cefotaksym** – w powikłanych ZUM zaleca się 100–200 mg/kg/dobę w 3 dawkach【892923089545176†L32-L64】.
   *    Fiolki 1 g i 2 g umożliwiają dostosowanie dawki【646197711799739†L6-L14】; stąd <40 kg – fiolka
   *    1000 mg, ≥40 kg – fiolka 2000 mg.
   *
   *  • **Ceftriakson** – standardowa terapia to 50 mg/kg/dobę (max. 2 g/dobę)【892923089545176†L58-L64】.
   *    Z uwagi na dostępność fiolek 1 g i 2 g【785655133783319†L35-L38】, stosujemy próg 40 kg.
   *
   *  • **Cefepim** – w powikłanych ZUM stosuje się 50 mg/kg co 8–12 h (100–150 mg/kg/dobę)
   *    【628904646534671†L47-L79】. Maxipime jest dostępny w fiolkach 1 g i 2 g【899210895059769†L26-L29】;
   *    pacjenci <40 kg otrzymują fiolkę 1 g, a ≥40 kg fiolkę 2 g.
   *
   *  • **Piperacylina z tazobaktamem** – u dzieci 2–12 lat podaje się ok. 112,5 mg/kg co 8 h
   *    (337,5 mg/kg/dobę)【101103782443135†L160-L170】. W Polsce dostępny jest wyłącznie zestaw 4,5 g
   *    (4 g piperacyliny + 0,5 g tazobaktamu)【293514168711086†L34-L50】, dlatego zawsze wybieramy
   *    tę fiolkę niezależnie od masy.
   *
   *  • **Imipenem z cilastatyną** – u dzieci ≥3 mies. zalecane dawki to 15–25 mg/kg co 6 h
   *    (60–100 mg/kg/dobę)【496788431355108†L1149-L1155】. Preparat jest dostępny w jedynej postaci 500 mg
   *    imipenemu z 500 mg cilastatyny w fiolce【724751456698437†L1598-L1606】, dlatego zwracamy
   *    tę postać niezależnie od masy.
   *
   *  • **Meropenem** – umiarkowane zakażenia leczone są 20 mg/kg co 8 h (60 mg/kg/dobę),
   *    a ciężkie 40 mg/kg co 8 h (120 mg/kg/dobę)【265555727539503†L160-L182】. Dostępne są fiolki
   *    500 mg i 1 g【629995849854808†L2442-L2447】; pacjenci <40 kg otrzymują fiolkę 500 mg,
   *    a ≥40 kg fiolkę 1 g.
   *
   *  • **Doripenem** – brak danych pediatrycznych; u dorosłych stosuje się 500 mg
   *    co 8 h lub 1 g co 8 h【453653223660162†L48-L58】. W Polsce dostępna jest tylko fiolka
   *    500 mg【293867290567491†L1779-L1787】; wybieramy tę postać niezależnie od masy, a aplikacja
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
   *  • **Amoksycylina** – wytyczne zalecają 1 g doustnie co 8 h przez 5 dni【548121027409041†L206-L247】;
   *    dlatego wybieramy tabletkę 1000 mg jako domyślną postać.
   *
   *  • **Doksycyklina** – schemat 100 mg dwa razy dziennie przez 5 dni【244960183512952†L20-L36】;
   *    domyślnie wybieramy tabletkę 100 mg.
   *
   *  • **Klarytromycyna** – SmPC podaje, że dorośli przyjmują 250 mg dwa razy dziennie,
   *    ale w cięższych zakażeniach dawkę zwiększa się do 500 mg dwa razy na dobę【112691869839516†L205-L211】.
   *    W zapaleniu płuc stosuje się dawkę 500 mg 2 ×/dobę, dlatego wybieramy tabletkę 500 mg.
   *
   *  • **Azytromycyna** – standardowy schemat dla CAP to 500 mg w 1. dniu, następnie 250 mg
   *    raz na dobę przez 4 dni【769803703970612†L136-L147】. Ponieważ nasz kalkulator
   *    zakłada 5 dni terapii z jedną dawką dziennie, wybieramy tabletkę 500 mg.
   *
   *  • **Amoksycylina z kwasem klawulanowym** – zaleca się 500/125 mg co 8 h lub
   *    875/125 mg co 12 h【990359539008422†L132-L141】. Ze względu na ograniczoną liczbę dawek
   *    wybieramy tabletki 875 mg/125 mg jako domyślne.
   *
   *  • **Cefpodoksym** – dawka 200 mg co 12 h przez 5 dni【608895700919138†L146-L149】;
   *    wybieramy tabletkę 200 mg.
   *
   *  • **Aksetyl cefuroksymu** – doustnie 500 mg co 12 h w CAP【792056642001203†L174-L184】;
   *    domyślnie wybieramy tabletkę 500 mg.
   *
   *  • **Lewofloksacyna** – wytyczne przewidują 500 mg raz na dobę przez 7–14 dni
   *    lub 750 mg raz na dobę przez 5 dni【679841742834900†L127-L131】. Ponieważ w module
   *    dostępne są jedynie tabletki 500 mg oraz roztwory 500 mg/100 ml, wybieramy tabletkę 500 mg.
   *
   *  • **Moksyfloksacyna** – stosuje się 400 mg raz na dobę przez 7–14 dni【255331690518457†L102-L116】;
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
      case 'Azytromycyna':
        return 'Tabletka 500\u00a0mg';
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
      case 'Moksyfloksacyna':
        return 'Tabletka 400\u00a0mg';
      default:
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
    // Masa ≥40 kg – tabletka 250 mg
    return 'Tabletka 250 mg';
  }

  // Wybiera domyślną postać amoksycyliny z kwasem klawulanowym na podstawie masy ciała.
  // Dzieci <15 kg – standardowa zawiesina 400 mg/57 mg/5 ml, dzieci 15–40 kg – zawiesina ES 600 mg/42,9 mg/5 ml,
  // dorośli i starsze dzieci – tabletka 875 mg/125 mg. Wysokodawkowe tabletki 875 mg/125 mg są
  // zalecane trzykrotnie na dobę w cięższych zakażeniach, zgodnie z CHPL【560332943530599†L118-L129】.
  function chooseAmoxClavDefaultForm(weight){
    if(weight === null || weight === undefined){
      return 'Zawiesina 400 mg/57 mg/5 ml';
    }
    if(weight < 15){
      return 'Zawiesina 400 mg/57 mg/5 ml';
    }
    if(weight < 40){
      return 'Zawiesina 600 mg/42,9 mg/5 ml (ES)';
    }
    // Dla pacjentów ≥40 kg preferujemy tabletkę 875 mg/125 mg, ponieważ przy
    // trzykrotnym dawkowaniu w wysokich infekcjach daje to 2625 mg
    // amoksycyliny na dobę – zgodnie z maksymalną dobową dawką dla dorosłych
    // przytoczoną w CHPL【560332943530599†L118-L129】.
    return 'Tabletka 875 mg/125 mg';
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
        minimalna dawka nie powinna być mniejsza niż 25 000 j.m./kg mc. (16 mg/kg/dobę)【771311657500760†L74-L95】.
        Dla uproszczenia przyjmujemy typowy zakres 50 000–100 000 j.m./kg/dobę,
        czyli około 33–65 mg/kg/dobę, jako podstawowy zakres dla pacjentów
        <40 kg. W populacji powyżej 6 lat i/lub o masie ciała ≥40 kg CHPL zaleca
        całkowitą dawkę 3–4,5 mln j.m. na dobę (podawaną w 2 lub 3 dawkach)【771311657500760†L74-L95】.
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
    // Ustaw domyślny czas trwania terapii
    durInput.value = drug.duration;
  }

  // Główna funkcja obliczeniowa – wywoływana przy zmianie któregokolwiek z parametrów
  function recalc(){
    const indicKey = document.getElementById('abxIndication').value;
    const indic = ABX_INDICATIONS[indicKey];
    const resultBox = document.getElementById('abxResult');
    const note      = document.getElementById('abxNote');
    if(!resultBox) return;
    // Jeżeli brak zdefiniowanych leków – wypisz komunikat i zakończ
    if(!indic.drugs){
      resultBox.innerHTML = '';
      if(note) note.textContent = indic.message || '';
      return;
    }
    // W przeciwnym razie oblicz dawki
    const drugName = document.getElementById('abxDrug').value;
    const drugDef  = indic.drugs[drugName];
    // Pobierz masę ciała
    const weight = getWeight();
    if(!weight){
      resultBox.innerHTML = '<p class="muted">Wprowadź masę ciała w sekcji „Dane użytkownika”, aby obliczyć dawkę.</p>';
      return;
    }
    // Pobierz wartości dawki i czasu terapii
    const sliderVal = parseFloat(document.getElementById('abxDoseSlider').value);
    let doseVal    = parseFloat(document.getElementById('abxDoseInput').value);
    // Synchronizuj suwak i pole liczbowego: jeśli użytkownik edytował jedno, przyjmujemy jego wartość
    if(!isNaN(sliderVal) && sliderVal !== doseVal){
      doseVal = sliderVal;
      document.getElementById('abxDoseInput').value = sliderVal;
    }
    if(isNaN(doseVal) || doseVal <= 0){
      // Jeśli wpisano złą wartość, zastąp domyślną
      doseVal = drugDef.defaultMg;
      document.getElementById('abxDoseInput').value = drugDef.defaultMg;
      document.getElementById('abxDoseSlider').value = drugDef.defaultMg;
    }
    let duration = parseInt(document.getElementById('abxDuration').value, 10);
    if(isNaN(duration) || duration <= 0){
      duration = drugDef.duration;
      document.getElementById('abxDuration').value = duration;
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
    // Specjalne ostrzeżenia dla fosfomycyny: zgodnie z Charakterystyką Produktu Leczniczego
    // fosfomycyna trometamol w dawce 3 g jest wskazana do jednorazowego leczenia
    // ostrego, niepowikłanego zapalenia pęcherza moczowego u kobiet i dziewcząt
    // powyżej 12. r.ż.; stosowanie preparatu u młodszych dzieci nie zostało
    // udokumentowane i nie jest rekomendowane【236868069090257†L42-L46】【236868069090257†L59-L62】.  
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
      messages.push('U dzieci w wieku poniżej 3 miesięcy (\u22645 kg) zalecana jest hospitalizacja i dożylne podawanie antybiotyków. Dawki podawane są co 6–8 godzin (cefuroksym 75–150 mg/kg/dobę, amoksycylina/klawulanian 100 mg/kg/dobę, cefotaksym 50–180 mg/kg/dobę, ceftriakson 50–100 mg/kg/dobę) wraz z kloksacyliną 100 mg/kg/dobę)【934018487152624†L1040-L1062】.');
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
      // zazwyczaj u dzieci ≥5 lat, lub jako dodatek do β‑laktamu【196723644067208†L386-L390】【196723644067208†L520-L542】.
      if (drugName === 'Klarytromycyna' || drugName === 'Azytromycyna') {
        messages.push('Uwaga: makrolidy (klarytromycyna, azytromycyna) w pozaszpitalnym zapaleniu płuc u dzieci stosuje się tylko w przypadku podejrzenia zakażenia atypowego i zazwyczaj u dzieci ≥5 lat; w innych przypadkach β‑laktamy pozostają leczeniem pierwszego wyboru【196723644067208†L386-L390】【196723644067208†L520-L542】.');
      }
      // Informacja dla ampicyliny – sugestia przejścia na schemat dorosły u pacjentów 40–50 kg
      if (drugName === 'Ampicylina' && weight >= 40) {
        messages.push('U pacjentów o masie 40–50 kg warto rozważyć schematy dawkowania ampicyliny stosowane u dorosłych, np. 6–8 g/dobę w 4 dawkach co 6 godzin.');
      }

      // Ogólne zalecenie dotyczące czasu terapii w nieskomplikowanym pozaszpitalnym zapaleniu płuc u dzieci
      messages.push('W nieskomplikowanym zapaleniu płuc u dzieci rozważ 5‑dniowy czas leczenia – dłużej tylko jeśli objawy się utrzymują.');
    }

    // Informacja o schematach azytromycyny w zależności od wskazania
    if (drugName === 'Azytromycyna' || drugName === 'Azytromycyna (3 dni)') {
      if (indicKey === 'pharyngitis') {
        // W paciorkowcowym zapaleniu gardła dla azytromycyny dostępne są dwa
        // schematy: 5‑dniowy i 3‑dniowy. W schemacie 5‑dniowym podaje się
        // 10–12 mg/kg mc./dobę raz na dobę przez 5 dni (u dorosłych często
        // stosuje się 500 mg w 1. dniu, następnie 250 mg/dobę w dniach 2–5). W
        // schemacie 3‑dniowym dawkę zwiększa się do 20 mg/kg mc./dobę (jednorazowo
        // na dobę) przez 3 dni; maksymalna dawka dobowa wynosi 500 mg【913878657539518†screenshot】.
        messages.push('Azytromycyna w paciorkowcowym zapaleniu gardła: rekomendowane są dwa schematy – (1) 5‑dniowy 10–12 mg/kg mc./dobę raz dziennie (u dorosłych często 500 mg w 1. dniu, następnie 250 mg/dobę), (2) 3‑dniowy 20 mg/kg mc./dobę raz dziennie (maks. 500 mg/dobę)【913878657539518†screenshot】.');
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
    }

    // W ostrym zapaleniu zatok przynosowych makrolidy są rzadko zalecane. Nowsze wytyczne i przeglądy podkreślają,
    // że makrolidy (klarytromycyna, azytromycyna) oraz trimetoprim‑sulfametoksazol nie powinny być stosowane
    // jako leczenie empiryczne z powodu wysokiej oporności Streptococcus pneumoniae. Zalecana terapia
    // pierwszego rzutu to amoksycylina lub amoksycylina z kwasem klawulanowym, a wysokodawkowy koamoksyklaw
    // (90 mg/kg mc./dobę lub 2 g dwa razy na dobę u dorosłych) jest wskazany u pacjentów z ryzykiem oporności
    //【169207162538004†L730-L744】. Makrolidy i kotrimoksazol stosuje się wyłącznie w przypadku udokumentowanej
    // wrażliwości drobnoustrojów lub alergii na beta‑laktamy.
    if (indicKey === 'sinusitis' && (drugName === 'Klarytromycyna' || drugName === 'Azytromycyna')) {
      messages.push('Uwaga: makrolidy (klarytromycyna, azytromycyna) oraz trimetoprim‑sulfametoksazol nie są zalecane do empirycznego leczenia ostrego zapalenia zatok przynosowych z powodu wysokich wskaźników oporności Streptococcus pneumoniae. Zastosuj je tylko w razie alergii na beta‑laktamy lub udokumentowanej wrażliwości patogenu【169207162538004†L730-L744】.');
    }

    // W paciorkowcowym zapaleniu gardła makrolidy (klarytromycyna, azytromycyna) oraz klindamycyna
    // powinny być stosowane tylko w przypadku alergii na beta‑laktamy lub udokumentowanej wrażliwości drobnoustroju.
    // Obserwuje się rosnącą oporność Streptococcus pyogenes na te antybiotyki【295251758699550†L291-L295】.
    if (indicKey === 'pharyngitis' && (drugName === 'Klarytromycyna' || drugName === 'Azytromycyna' || drugName === 'Klindamycyna')) {
      messages.push('Uwaga: w leczeniu paciorkowcowego zapalenia gardła makrolidy (klarytromycyna, azytromycyna) oraz klindamycyna należy stosować wyłącznie w razie alergii na beta‑laktamy lub udokumentowanej wrażliwości patogenu, ponieważ notuje się rosnącą oporność Streptococcus pyogenes na te leki【295251758699550†L291-L295】.');
    }

    // W ostrym zapaleniu ucha środkowego makrolidy (klarytromycyna, azytromycyna) powinny być
    // stosowane jedynie w przypadku alergii na beta‑laktamy lub udokumentowanej wrażliwości
    // patogenu. Zalecenia podkreślają, że pierwszym wyborem jest wysokodawkowa amoksycylina
    // (80–90 mg/kg mc./dobę), a w razie braku poprawy – amoksycylina z kwasem klawulanowym
    //【47766902999983†L365-L388】. Makrolidy stanowią opcję rezerwową.
    if (indicKey === 'otitis' && (drugName === 'Klarytromycyna' || drugName === 'Azytromycyna')) {
      messages.push('Uwaga: w ostrym zapaleniu ucha środkowego pierwszym wyborem jest amoksycylina w dawce 80–90 mg/kg mc./dobę; makrolidy (klarytromycyna, azytromycyna) stosuje się wyłącznie w razie alergii na beta‑laktamy lub udokumentowanej wrażliwości patogenu【47766902999983†L365-L388】.');
    }

    // Dostosowanie długości terapii w ostrym zapaleniu ucha środkowego w zależności od wieku
    if (indicKey === 'otitis') {
      const ageYears = getAge();
      if (ageYears != null && !isNaN(ageYears)) {
        let recommendedDuration = duration;
        if (ageYears < 2) {
          recommendedDuration = 10;
        } else if (ageYears < 6) {
          recommendedDuration = 7;
        } else {
          recommendedDuration = 5;
        }
        // Ustaw wyliczony czas w polu, jeśli różni się od bieżącego
        if (recommendedDuration !== duration) {
          duration = recommendedDuration;
          const durInputElem = document.getElementById('abxDuration');
          if (durInputElem) {
            durInputElem.value = recommendedDuration;
          }
        }
        messages.push('W ostrym zapaleniu ucha środkowego sugerowana długość leczenia zależy od wieku: <2 lat – 10 dni, 2–5 lat – 7 dni, ≥6 lat – 5 dni.');
      }
    }

    // Ostrzeżenie dotyczące stosowania makrolidów u najmłodszych dzieci – infekcje atypowe są rzadkie
    const ageYearsForWarn = getAge();
    if (ageYearsForWarn != null && !isNaN(ageYearsForWarn)) {
      if (ageYearsForWarn < 5 && (drugName === 'Azytromycyna' || drugName === 'Klarytromycyna')) {
        messages.push('U dzieci poniżej 5 lat infekcje atypowe (Mycoplasma, Chlamydophila) są rzadkie – makrolidy należy stosować tylko przy uzasadnionym podejrzeniu patogenu atypowego.');
      }

    // Ostrzeżenia dla powikłanych zakażeń układu moczowego i odmiedniczkowego zapalenia nerek:
    // Furazydyna (nitrofurantoina) i fosfomycyna nie osiągają terapeutycznych stężeń w miąższu nerek,
    // dlatego nie należy ich stosować w tych wskazaniach【368431203664830†L98-L124】【368431203664830†L148-L151】.
    if ((indicKey === 'uti_other' || indicKey === 'uti_pyelonephritis') && drugName === 'Furazydyna') {
      messages.push('Uwaga: furazydyna (nitrofurantoina) nie osiąga odpowiednich stężeń w tkance nerkowej – nie stosować jej w powikłanych zakażeniach układu moczowego ani odmiedniczkowym zapaleniu nerek【368431203664830†L98-L124】【368431203664830†L148-L151】.');
    }
    if ((indicKey === 'uti_other' || indicKey === 'uti_pyelonephritis') && drugName === 'Fosfomycyna') {
      messages.push('Uwaga: fosfomycyna nie jest skuteczna w powikłanych zakażeniach układu moczowego ani odmiedniczkowym zapaleniu nerek, gdyż nie osiąga wystarczających stężeń w miąższu nerek【368431203664830†L98-L124】【368431203664830†L148-L151】.');
    }
    // Ostrzeżenie dla doripenem – brak danych pediatrycznych; stosować wyłącznie u dorosłych.
    if ((indicKey === 'uti_other' || indicKey === 'uti_pyelonephritis') && drugName === 'Doripenem') {
      messages.push('Uwaga: doripenem nie jest zarejestrowany do stosowania u dzieci; standardowa dawka u dorosłych wynosi 500 mg co 8 h (1,5 g/dobę) lub 1 g co 8 h (3 g/dobę)【453653223660162†L48-L58】.');
    }
    // Specjalne ostrzeżenia dla zakażeń po ugryzieniach (ssti_bite). Antybiotyki stosuje się profilaktycznie
    // tylko u pacjentów z ranami wysokiego ryzyka (głębokie, zakrwawione, zlokalizowane na twarzy lub dłoni, u osób
    // z upośledzoną odpornością). Standardowa profilaktyka trwa 3–5 dni, a leczenie klinicznego zakażenia 5–7 dni.
    // Pierwszym wyborem jest amoksycylina z kwasem klawulanowym 22,5 mg/kg mc. co 12 h (≈ 45 mg/kg mc./dobę)【31704952314751†L136-L154】【760797221558041†L240-L247】.
    // W razie alergii na penicyliny stosuje się kombinację trimetoprim‑sulfametoksazol (4–6 mg/kg mc. trimetoprimu co 12 h)
    // z klindamycyną (10 mg/kg mc. co 8 h) lub cyprofloksacyną 20–30 mg/kg mc./dobę【923343977244963†L51-L92】.
    // Nie ma potrzeby rutynowego podawania antybiotyków po drobnych, dobrze oczyszczonych ugryzieniach.
    if (indicKey === 'ssti_bite') {
      messages.push('Uwaga: antybiotykoterapia po ugryzieniach jest wskazana przede wszystkim u pacjentów z ranami wysokiego ryzyka (głębokie, zlokalizowane na twarzy lub dłoni, u osób z upośledzoną odpornością). Profilaktyka trwa 3–5 dni; aktywne zakażenie leczymy 5–7 dni. Pierwszym wyborem jest amoksycylina z kwasem klawulanowym 22,5 mg/kg mc. co 12 h (≈ 45 mg/kg mc./dobę)【31704952314751†L136-L154】【760797221558041†L240-L247】. U pacjentów z alergią na penicyliny stosuje się trimetoprim‑sulfametoksazol 4–6 mg/kg mc. co 12 h w skojarzeniu z klindamycyną 10 mg/kg mc. co 8 h lub cyprofloksacyną 20–30 mg/kg mc./dobę【923343977244963†L51-L92】.');
    }
    // Specjalne ostrzeżenie dla zakażonych ran (ssti_wound). Leczenie empiryczne obejmuje przede wszystkim cefaleksynę lub amoksycylinę z kwasem klawulanowym w dawce około 22,5 mg/kg mc. co 12 h (≈ 45 mg/kg mc./dobę). Standardowa terapia trwa 5 dni; można ją wydłużyć do 7–10 dni przy wolnej poprawie【904925423924891†L62-L80】【484053453334385†L155-L176】. Clindamycyna oraz trimetoprim‑sulfametoksazol stosuje się jedynie przy podejrzeniu MRSA lub alergii na β‑laktamy ze względu na rosnącą oporność gronkowców【484053453334385†L191-L200】.
    if (indicKey === 'ssti_wound') {
      messages.push('Uwaga: w zakażonych ranach leczenie empiryczne obejmuje przede wszystkim cefaleksynę lub amoksycylinę z kwasem klawulanowym w dawce około 22,5 mg/kg mc. co 12 h (≈ 45 mg/kg mc./dobę). Standardowa terapia trwa 5 dni; można ją wydłużyć do 7–10 dni przy wolnej poprawie【904925423924891†L62-L80】【484053453334385†L155-L176】. Clindamycyna oraz trimetoprim‑sulfametoksazol stosuje się jedynie przy podejrzeniu MRSA lub alergii na β‑laktamy ze względu na rosnącą oporność gronkowców【484053453334385†L191-L200】.');
    }

    // Specjalne ostrzeżenie dla cellulitis/erysipelas (ssti_cellulitis). Terapia trwa zwykle 5 dni i
    // polega na stosowaniu wąskospektralnych β‑laktamów – pierwszym wyborem jest cefaleksyna
    // 17 mg/kg mc./dawkę co 8 h (≈50 mg/kg mc./dobę) lub amoksycylina z kwasem klawulanowym
    // 22,5 mg/kg mc. co 12 h (≈45 mg/kg mc./dobę)【484053453334385†L155-L176】. W razie łagodnego przebiegu
    // można zastosować penicylinę V 20 mg/kg mc. co 8 h. Clindamycyna czy
    // trimetoprim‑sulfametoksazol są zarezerwowane dla pacjentów z dużym ryzykiem MRSA lub
    // uczulonych na β‑laktamy, gdyż charakteryzują się niższą skutecznością wobec paciorkowców【904925423924891†L59-L82】【852377925409726†L154-L172】. Standardową długość terapii
    // (5 dni) wydłuża się do 7–10 dni tylko przy wolnej poprawie【904925423924891†L62-L82】.
    if (indicKey === 'ssti_cellulitis') {
      messages.push('Uwaga: w leczeniu zapalenia tkanki łącznej i róży zaleca się 5‑dniową kurację wąskospektralnymi β‑laktamami – przede wszystkim cefaleksyną 17 mg/kg mc./dawkę co 8 h (≈50 mg/kg mc./dobę) lub amoksycyliną z kwasem klawulanowym 22,5 mg/kg mc. co 12 h (≈45 mg/kg mc./dobę)【484053453334385†L155-L176】. Penicylina V (20 mg/kg mc. co 8 h) może być stosowana w łagodnym przebiegu. Stosowanie klindamycyny albo trimetoprim‑sulfametoksazolu rezerwujemy dla pacjentów z potwierdzonym ryzykiem MRSA lub alergią na β‑laktamy, ponieważ mają słabszą aktywność wobec paciorkowców【904925423924891†L59-L82】【852377925409726†L154-L172】. Wydłużenie terapii ponad 5 dni powinno nastąpić jedynie przy wolnej poprawie klinicznej【904925423924891†L62-L82】.');
    }
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
      // Nowa logika: dziecko tylko wtedy, gdy waga < 40 kg. Wiek nie wpływa na
      // klasyfikację (starsze dzieci o masie ≥40 kg otrzymują dawkowanie dorosłych).
      const isChild = weight < 40;
      globalMax = isChild ? globalMaxInfo.child : globalMaxInfo.adult;
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
    // Jeżeli wyliczona dawka przekracza dozwolony limit, zredukuj ją i poinformuj użytkownika.
    if(effectiveMax != null && mgPerDay > effectiveMax){
      mgPerDay = effectiveMax;
      const clampedMgKg = mgPerDay / weight;
      // Aktualizuj suwak i pole liczbowego, aby odzwierciedlić ograniczenie
      document.getElementById('abxDoseInput').value = fmt(clampedMgKg).replace(',', '.');
      document.getElementById('abxDoseSlider').value = clampedMgKg;
      messages.push(`Zastosowano ograniczenie do maksymalnej dawki ${effectiveMax}\u00A0mg/dobę dla tego antybiotyku.`);
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
      messages.push(`Uwaga: obliczona dawka ${fmt(currentMgPerKg)} mg/kg/dobę przekracza zalecany górny zakres ${fmt(rangeMax)} mg/kg/dobę dla tego leku. Skonsultuj dawkowanie z lekarzem.`);
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
      // Ostrzeżenia dotyczące wyboru postaci amoksycyliny z kwasem klawulanowym względem masy ciała
      if(drugName === 'Amoksycylina z kwasem klawulanowym'){
        const formLower = selectedForm.toLowerCase();
        if(weight < 15){
          if(formLower.includes('600') || formLower.includes('es') || formLower.includes('tabletka')){
            messages.push('Dzieci o masie <\u00A015\u00A0kg powinny otrzymywać zawiesinę 400\u00A0mg/57\u00A0mg/5\u00A0ml; inne postaci mogą być trudne w dawkowaniu i dostarczają więcej kwasu klawulanowego.');
          }
        } else if(weight < 40){
          if(formLower.includes('400') || formLower.includes('57') || (formLower.includes('tabletka'))){
            messages.push('U dzieci 15–40\u00A0kg preferuje się zawiesinę ES 600\u00A0mg/42,9\u00A0mg/5\u00A0ml, która pozwala na podawanie dużych dawek amoksycyliny mniejszą objętością oraz ogranicza podaż kwasu klawulanowego.');
          }
        } else {
          if(formLower.includes('zawiesina')){
            messages.push('Dla pacjentów \u226540\u00A0kg wygodniejsze jest stosowanie tabletek (500\u00A0mg/125\u00A0mg lub 875\u00A0mg/125\u00A0mg) zamiast zawiesin.');
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
            // Usuń ogólny komunikat o ograniczeniu do maksymalnej dawki (jeśli został dodany wcześniej),
            // aby nie wprowadzać w błąd wartościami jak 2625 mg. W umiarkowanych zakażeniach
            // komunikat ten zastępowany jest powyższym.
            for (let mi = messages.length - 2; mi >= 0; mi--) {
              if (messages[mi] && messages[mi].startsWith('Zastosowano ograniczenie do maksymalnej dawki')) {
                messages.splice(mi, 1);
                break;
              }
            }
          }
        }
      }
    }
    // Jeśli brakuje informacji o sposobie przeliczania (np. brak mgPer5ml i mgPerTablet), wypisz tylko mg
    if(!drugMeta){
      resultBox.innerHTML = `<p>Dawka dobowa: ${fmt(mgPerDay)} mg (podzielona na ${dosesPerDay} dawki).</p><p>Czas terapii: ${duration} dni.</p>`;
      // Wyświetl zebrane komunikaty, jeśli istnieją
      if(note){ note.textContent = messages.join(' '); }
      return;
    }
    // Obliczenia dla preparatów w postaci zawiesiny
    if('mgPer5ml' in drugMeta){
      const mgPerMl   = drugMeta.mgPer5ml / 5;
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
      const packagingSuggestion = `${count} × ${selectedSize} ml`;
      // Oblicz efektywną dawkę mg/kg/dobę po ewentualnym ograniczeniu
      const doseMgKgEffective = mgPerDay / weight;
      let doseInfoLine;
      if (drugName === 'Fenoksymetylpenicylina' && isUnitMode && iuPerKgRounded != null) {
        // Jeśli wybrano formę jednostkową, pokazujemy dawkę w jednostkach
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${iuPerKgRounded.toLocaleString('pl-PL')} j.m./kg mc./dobę`;
      } else {
        // W przeciwnym razie pokazujemy mg/kg/dobę
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${fmt(doseMgKgEffective)} mg/kg/dobę`;
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
          dailyDoseLine = `<strong>Dawka dobowa:</strong> ${iuPerDay.toLocaleString('pl-PL')} j.m. &nbsp;(${unitsPerDose.toLocaleString('pl-PL')} j.m. × ${dosesPerDay})`;
        } else {
          dailyDoseLine = `<strong>Dawka dobowa:</strong> ${fmt(mgPerDay)} mg &nbsp;(${fmt(mgPerDoseCalc)} mg × ${dosesPerDay})`;
        }
      } else {
        // Inne antybiotyki w zawiesinie: pokaż dawkę dobową w mg i w nawiasie mg na dawkę × liczba dawek
        dailyDoseLine = `<strong>Dawka dobowa:</strong> ${fmt(mgPerDay)} mg &nbsp;(${fmt(mgPerDoseCalc)} mg × ${dosesPerDay})`;
      }
      // Przygotuj wynik dla podstawowego schematu dawkowania
      let html = `
        <p>${doseInfoLine}</p>
        <p>${dailyDoseLine}</p>
        <p><strong>Dawka jednostkowa:</strong> ${fmt(mlPerDoseRounded)} ml × ${dosesPerDay} na dobę</p>
        <p><strong>Przewidywana terapia:</strong> ${duration} dni – łącznie ${fmt(totalVolumeRounded)} ml</p>
      `;
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
            html += `<p>${alt}&times;/dobę: ${altUnitsPerDose.toLocaleString('pl-PL')} j.m. (${fmt(altMgPerDose)} mg) – ${fmt(altMlPerDoseRounded)} ml na dawkę</p>`;
          } else {
            html += `<p>${alt}&times;/dobę: ${fmt(altMgPerDose)} mg – ${fmt(altMlPerDoseRounded)} ml na dawkę</p>`;
          }
        });
      }
      // Wstaw wynik do pola i wyrównaj do środka
      resultBox.innerHTML = html;
      resultBox.style.textAlign = 'center';
      // Wyświetl zebrane komunikaty
      if(note){ note.textContent = messages.join(' '); }
      // Sekcja zaleceń handlowych dla preparatów doustnych (zawiesina): stosuje domyślną liczbę dawek
      const doseStrRecommendation = `${fmt(mlPerDoseRounded)} ml`;
      setupRecommendationUI(drugName, selectedForm, dosesPerDay, doseStrRecommendation, duration);
      // Nie dodajemy w tej sekcji leków przeciwgorączkowych – będą one częścią zaleceń do wklejenia
      return;
    }
    // Obliczenia dla tabletek
    if('mgPerTablet' in drugMeta){
      const mgPerTablet = drugMeta.mgPerTablet;
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
      const tabletsPerDayRounded = tabletsPerDoseRounded * dosesPerDay;
      const mgPerDayRounded = tabletsPerDayRounded * mgPerTablet;
      const totalTablets = Math.ceil(tabletsPerDayRounded * duration);
      // Sugestia opakowania: minimalna liczba opakowań, które pokryją liczbę tabletek
      const sizes = (drugMeta.packaging || []).slice().sort((a,b) => a - b);
      let selectedSize = sizes.find(sz => sz >= totalTablets);
      let count = 1;
      if(!selectedSize){
        selectedSize = sizes[sizes.length - 1] || totalTablets;
        count = Math.ceil(totalTablets / selectedSize);
      }
      const packagingSuggestion = `${count} × ${selectedSize} tabl.`;
      // Oblicz efektywną dawkę mg/kg/dobę i oblicz różnicę w procentach
      const doseMgKgEffective = mgPerDayRounded / weight;
      const targetMgKg = mgPerDay / weight;
      if(mgPerDayRounded < mgMin || mgPerDayRounded > mgMax){
        const deltaPercent = Math.round((mgPerDayRounded / mgPerDay - 1) * 100);
        if(deltaPercent > 0){
          messages.push(`Wybrana forma terapii przekracza zalecaną dawkę dobową o ${deltaPercent}% (faktycznie ${fmt(doseMgKgEffective)} mg/kg/dobę zamiast ${fmt(targetMgKg)} mg/kg/dobę).`);
        } else {
          const absDelta = Math.abs(deltaPercent);
          messages.push(`Wybrana forma terapii dostarcza o ${absDelta}% mniej niż zalecana dawka dobowa (faktycznie ${fmt(doseMgKgEffective)} mg/kg/dobę zamiast ${fmt(targetMgKg)} mg/kg/dobę).`);
        }
      }
      // Ostrzeżenie dla dzieci <25 kg
      if(weight < 25){
        messages.push('Uwaga: dla dzieci o masie <25 kg forma tabletkowa może nie zapewniać dokładnego dawkowania. Rozważ użycie zawiesiny, jeśli jest dostępna.');
      }
      // Ostrzeżenie, jeśli wyliczona dawka jest mniejsza niż połowa tabletki na dawkę
      if(idealTabletsPerDose * mgPerTablet < mgPerTablet * 0.5){
        messages.push('Uwaga: obliczona dawka dobowa jest mniejsza niż połowa pojedynczej tabletki. Rozważ podanie leku w zawiesinie lub innym preparacie.');
      }
      // Przygotuj linie informacji do wyświetlenia
      let doseInfoLine;
      if (drugName === 'Fenoksymetylpenicylina' && isUnitMode && iuPerKgRounded != null) {
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${iuPerKgRounded.toLocaleString('pl-PL')} j.m./kg mc./dobę`;
      } else {
        doseInfoLine = `<strong>Wybrana dawka:</strong> ${fmt(doseMgKgEffective)} mg/kg/dobę`;
      }
      let dailyDoseLine;
      if (drugName === 'Fenoksymetylpenicylina') {
        dailyDoseLine = `<strong>Dawka dobowa:</strong> ${fmt(mgPerDayRounded)} mg &nbsp;(${fmt(tabletsPerDayRounded)} tabl.)`;
      } else {
        dailyDoseLine = `<strong>Dawka dobowa:</strong> ${fmt(mgPerDayRounded)} mg &nbsp;(${fmt(tabletsPerDayRounded)} tabl.)`;
      }
      // Skonstruuj wynik podstawowego schematu dawkowania
      let html = `
        <p>${doseInfoLine}</p>
        <p>${dailyDoseLine}</p>
        <p><strong>Dawka jednostkowa:</strong> ${fmt(tabletsPerDoseRounded)} tabl. × ${dosesPerDay} na dobę</p>
        <p><strong>Przewidywana terapia:</strong> ${duration} dni – łącznie ${totalTablets} tabl.</p>
      `;
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
            html += `<p>${alt}&times;/dobę: ${altUnitsPerDose.toLocaleString('pl-PL')} j.m. (≈${fmt(altMgPerDose)} mg) – ${fmt(altTabletsPerDose)} tabl. na dawkę</p>`;
          } else {
            html += `<p>${alt}&times;/dobę: ${fmt(altMgPerDose)} mg – ${fmt(altTabletsPerDose)} tabl. na dawkę</p>`;
          }
        });
      }
      // Wstaw wynik do pola i wyrównaj do środka
      resultBox.innerHTML = html;
      resultBox.style.textAlign = 'center';
      if(note){ note.textContent = messages.join(' '); }
      const doseStrRecommendation = `${fmt(tabletsPerDoseRounded)} tabl.`;
      setupRecommendationUI(drugName, selectedForm, dosesPerDay, doseStrRecommendation, duration);
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
      resultBox.innerHTML = `
        <p>${doseInfoLine}</p>
        <p><strong>Dawka dobowa:</strong> ${fmt(mgPerDay)} mg</p>
        <p><strong>Dawka jednostkowa:</strong> ${fmt(mgPerDose)} mg × ${dosesPerDay} na dobę</p>
        <p><strong>Przewidywana terapia:</strong> ${duration} dni</p>
      `;
      if(note){ note.textContent = messages.join(' '); }
      // Ukryj sekcję zaleceń dla preparatów dożylnych
      setupRecommendationUI('', '', 0, '', 0);
      // Nie dodajemy w tej sekcji leków przeciwgorączkowych – będą one częścią zaleceń do wklejenia
      return;
    }
  }

  // Dodaj listenery na elementy formularza, aby dynamicznie aktualizować obliczenia.
  function attachEventListeners(){
    const indicSelect = document.getElementById('abxIndication');
    const drugSelect  = document.getElementById('abxDrug');
    const slider      = document.getElementById('abxDoseSlider');
    const doseInput   = document.getElementById('abxDoseInput');
    const durInput    = document.getElementById('abxDuration');
    const weightInput = document.getElementById('weight');
    if(indicSelect){ indicSelect.addEventListener('change', () => { populateDrugs(); recalc(); }); }
    if(drugSelect){
      drugSelect.addEventListener('change', () => {
        // Po zmianie antybiotyku należy ponownie wypełnić listę postaci,
        // aby wyświetlić odpowiednie preparaty dla nowo wybranego leku.
        populateForms();
        updateDoseControls();
        recalc();
      });
    }
    if(slider){      slider.addEventListener('input', () => { document.getElementById('abxDoseInput').value = slider.value; recalc(); }); }
    if(doseInput){   doseInput.addEventListener('input', () => { const val = parseFloat(doseInput.value); if(!isNaN(val)) document.getElementById('abxDoseSlider').value = val; recalc(); }); }
    if(durInput){    durInput.addEventListener('input', recalc); }
    // Jeśli dostępny jest wybór preparatu, uwzględnij go w obliczeniach. Po zmianie postaci
    // konieczne jest również zaktualizowanie parametrów suwaka i jego etykiety (dla form jednostkowych).
    const formSelect  = document.getElementById('abxForm');
    if(formSelect){ formSelect.addEventListener('change', () => { updateDoseControls(); recalc(); }); }
    // Aktualizuj wyniki także po zmianie masy ciała w sekcji „Dane użytkownika”
    if(weightInput){
      // Po zmianie masy ciała należy przeliczyć domyślne zakresy dawek oraz
      // potencjalnie zmienić domyślne postaci niektórych leków (klarytromycyna,
      // amoksycylina z kwasem klawulanowym, azytromycyna). Dlatego najpierw
      // odświeżamy listę postaci, a następnie aktualizujemy suwak i obliczenia.
      weightInput.addEventListener('input', () => {
        populateForms();
        updateDoseControls();
        recalc();
      });
    }
  }

  // Po załadowaniu DOM rejestrujemy przycisk i obsługę jego kliknięcia.
  document.addEventListener('DOMContentLoaded', function(){
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
  });

  // Koniec modułu antybiotykoterapii