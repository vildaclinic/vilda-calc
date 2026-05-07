/* ==========================================================================
 * vilda_food_data.js — statyczne dane produktów, słowników makro i aktywności
 *
 * Wydzielone z app.js w kroku 8C. Plik nie zawiera logiki klinicznej ani
 * obliczeniowej; udostępnia tylko dane i proste metody dostępu.
 * ========================================================================== */

(function(global){
  'use strict';

  const VERSION = '1.0.0';

const snacks = {
  snickers: {
    name: 'Snickers 50 g', kcal: 244,
    protein_g: 4.6, carbs_g: 30.3, fat_g: 11.8, saturated_fat_g: 4.4, sugars_g: 25.5, salt_g: 0.19,
    macroCategory: 'satfat', foodGroup: 'snacks', macroSource: 'etykieta/FoodData Central',
    macroNote: 'Wartości orientacyjne dla typowego batona 50 g.'
  },
  bounty: {
    name: 'Bounty 57 g', kcal: 278,
    protein_g: 2.8, carbs_g: 34.0, fat_g: 14.8, saturated_fat_g: 12.0, sugars_g: 28.0, salt_g: 0.17,
    macroCategory: 'satfat', foodGroup: 'snacks', macroSource: 'etykieta/FoodData Central',
    macroNote: 'Wartości orientacyjne dla typowego batona 57 g.'
  },
  knoppers: {
    name: 'Knoppers 25 g', kcal: 140,
    protein_g: 2.1, carbs_g: 13.6, fat_g: 8.0, saturated_fat_g: 3.6, sugars_g: 8.5, salt_g: 0.10,
    macroCategory: 'satfat', foodGroup: 'snacks', macroSource: 'etykieta/FoodData Central',
    macroNote: 'Wartości orientacyjne dla typowej porcji 25 g.'
  },
  prince: {
    name: 'Prince Polo 50 g', kcal: 264,
    protein_g: 3.9, carbs_g: 31.0, fat_g: 13.7, saturated_fat_g: 8.0, sugars_g: 20.0, salt_g: 0.16,
    macroCategory: 'satfat', foodGroup: 'snacks', macroSource: 'etykieta/FoodData Central',
    macroNote: 'Wartości orientacyjne dla typowego wafla 50 g.'
  },
  banana: {
    name: 'Banan średni 120 g', kcal: 107,
    protein_g: 1.3, carbs_g: 27.4, fat_g: 0.4, saturated_fat_g: 0.1, sugars_g: 14.6, salt_g: 0.0,
    macroCategory: 'carbs', foodGroup: 'snacks', macroSource: 'USDA FoodData Central',
    macroNote: 'Wartości dla średniego banana, masa jadalna ok. 120 g.'
  },
  cola: {
    name: 'Napój gazowany typu cola 330 ml', kcal: 139,
    protein_g: 0.0, carbs_g: 35.0, fat_g: 0.0, saturated_fat_g: 0.0, sugars_g: 35.0, salt_g: 0.02,
    macroCategory: 'sugary_drink', foodGroup: 'snacks', macroSource: 'FoodData Central/etykieta',
    macroNote: 'Wartości orientacyjne dla puszki 330 ml.'
  },
  ice: {
    name: 'Lody waniliowe 100 g', kcal: 201,
    protein_g: 3.5, carbs_g: 23.6, fat_g: 11.0, saturated_fat_g: 6.8, sugars_g: 21.0, salt_g: 0.18,
    macroCategory: 'satfat', foodGroup: 'snacks', macroSource: 'USDA FoodData Central',
    macroNote: 'Wartości orientacyjne dla lodów waniliowych 100 g.'
  },
  chocolate: {
    name: 'Czekolada mleczna 25 g', kcal: 134,
    protein_g: 1.9, carbs_g: 14.8, fat_g: 7.5, saturated_fat_g: 4.5, sugars_g: 13.5, salt_g: 0.05,
    macroCategory: 'satfat', foodGroup: 'snacks', macroSource: 'USDA FoodData Central',
    macroNote: 'Wartości orientacyjne dla 25 g czekolady mlecznej.'
  },
  watermelon: {
    name: 'Arbuz 100 g', kcal: 30,
    protein_g: 0.6, carbs_g: 7.6, fat_g: 0.2, saturated_fat_g: 0.0, sugars_g: 6.2, salt_g: 0.0,
    macroCategory: 'carbs', foodGroup: 'snacks', macroSource: 'USDA FoodData Central',
    macroNote: 'Wartości dla części jadalnej 100 g.'
  },
  cookie: {
    name: 'Ciastko digestive 15 g', kcal: 70,
    protein_g: 1.0, carbs_g: 9.5, fat_g: 3.0, saturated_fat_g: 1.4, sugars_g: 2.6, salt_g: 0.10,
    macroCategory: 'satfat', foodGroup: 'snacks', macroSource: 'FoodData Central/etykieta',
    macroNote: 'Wartości orientacyjne dla 1 ciastka 15 g.'
  },
  twix: {
    name: 'Twix 50 g', kcal: 248,
    protein_g: 2.5, carbs_g: 32.0, fat_g: 12.0, saturated_fat_g: 7.0, sugars_g: 24.0, salt_g: 0.20,
    macroCategory: 'satfat', foodGroup: 'snacks', macroSource: 'etykieta/FoodData Central',
    macroNote: 'Wartości orientacyjne dla typowego batona 50 g.'
  },
  kitkat: {
    name: 'KitKat 45 g', kcal: 233,
    protein_g: 3.1, carbs_g: 28.5, fat_g: 11.2, saturated_fat_g: 7.0, sugars_g: 21.0, salt_g: 0.14,
    macroCategory: 'satfat', foodGroup: 'snacks', macroSource: 'etykieta/FoodData Central',
    macroNote: 'Wartości orientacyjne dla typowej porcji 45 g.'
  },
  chips: {
    name: 'Chipsy ziemniaczane 30 g', kcal: 160,
    protein_g: 1.9, carbs_g: 16.0, fat_g: 10.0, saturated_fat_g: 1.1, sugars_g: 0.2, salt_g: 0.45,
    macroCategory: 'fat', foodGroup: 'snacks', macroSource: 'USDA FoodData Central',
    macroNote: 'Wartości orientacyjne dla małej porcji chipsów 30 g.'
  },
  pretzel: {
    name: 'Paluszki słone 50 g', kcal: 190,
    protein_g: 5.0, carbs_g: 38.0, fat_g: 1.8, saturated_fat_g: 0.4, sugars_g: 2.0, salt_g: 1.5,
    macroCategory: 'carbs', foodGroup: 'snacks', macroSource: 'FoodData Central/etykieta',
    macroNote: 'Wartości orientacyjne dla porcji 50 g.'
  },
  yogurt: {
    name: 'Jogurt owocowy 150 g', kcal: 135,
    protein_g: 5.4, carbs_g: 23.0, fat_g: 2.3, saturated_fat_g: 1.4, sugars_g: 20.0, salt_g: 0.18,
    macroCategory: 'carbs', foodGroup: 'snacks', macroSource: 'USDA FoodData Central',
    macroNote: 'Wartości orientacyjne dla kubeczka 150 g.'
  }
};

const meals = {
  burger: {
    name: 'Burger z frytkami', kcal: 900,
    protein_g: 32.0, carbs_g: 95.0, fat_g: 43.0, saturated_fat_g: 13.0, sugars_g: 10.0, salt_g: 2.8,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'USDA FoodData Central/FNDDS',
    macroNote: 'Danie złożone — wartości orientacyjne dla typowego zestawu.'
  },
  pizza: {
    name: 'Pizza pepperoni (¼ 30 cm)', kcal: 650,
    protein_g: 28.0, carbs_g: 72.0, fat_g: 28.0, saturated_fat_g: 11.0, sugars_g: 6.0, salt_g: 2.3,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'USDA FoodData Central/FNDDS',
    macroNote: 'Danie złożone — wartości orientacyjne dla 1/4 pizzy 30 cm.'
  },
  pierogi: {
    name: 'Pierogi ruskie (8 szt.)', kcal: 560,
    protein_g: 18.0, carbs_g: 76.0, fat_g: 20.0, saturated_fat_g: 8.0, sugars_g: 4.0, salt_g: 2.0,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'FoodData Central/analog potrawy',
    macroNote: 'Danie złożone — wartości orientacyjne, zależne od receptury i wielkości pierogów.'
  },
  spaghetti: {
    name: 'Spaghetti bolognese 350 g', kcal: 600,
    protein_g: 28.0, carbs_g: 68.0, fat_g: 24.0, saturated_fat_g: 8.0, sugars_g: 10.0, salt_g: 2.0,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'USDA FoodData Central/FNDDS',
    macroNote: 'Danie złożone — wartości orientacyjne dla porcji 350 g.'
  },
  caesar: {
    name: 'Sałatka Cezar z kurczakiem', kcal: 450,
    protein_g: 31.0, carbs_g: 18.0, fat_g: 29.0, saturated_fat_g: 6.0, sugars_g: 4.0, salt_g: 1.7,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'USDA FoodData Central/FNDDS',
    macroNote: 'Danie złożone — wartości orientacyjne; sos i grzanki najmocniej zmieniają wynik.'
  },
  sushi: {
    name: 'Sushi 10 kawałków', kcal: 400,
    protein_g: 17.0, carbs_g: 72.0, fat_g: 5.0, saturated_fat_g: 1.0, sugars_g: 8.0, salt_g: 2.1,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'USDA FoodData Central/FNDDS',
    macroNote: 'Danie złożone — wartości orientacyjne dla zestawu 10 kawałków.'
  },
  kebab: {
    name: 'Kebab w tortilli', kcal: 800,
    protein_g: 38.0, carbs_g: 85.0, fat_g: 33.0, saturated_fat_g: 10.0, sugars_g: 8.0, salt_g: 3.2,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'FoodData Central/analog potrawy',
    macroNote: 'Danie złożone — wartości orientacyjne; sos i wielkość tortilli mogą istotnie zmienić wynik.'
  },
  pancake: {
    name: 'Naleśniki z serem (2 szt.)', kcal: 500,
    protein_g: 22.0, carbs_g: 68.0, fat_g: 16.0, saturated_fat_g: 8.0, sugars_g: 22.0, salt_g: 1.0,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'FoodData Central/analog potrawy',
    macroNote: 'Danie złożone — wartości orientacyjne dla 2 sztuk.'
  },
  schabowy: {
    name: 'Schabowy + ziemniaki', kcal: 800,
    protein_g: 38.0, carbs_g: 70.0, fat_g: 40.0, saturated_fat_g: 10.0, sugars_g: 4.0, salt_g: 2.4,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'FoodData Central/analog potrawy',
    macroNote: 'Danie złożone — wartości orientacyjne; wynik zależy od panierki, tłuszczu i dodatków.'
  },
  goulash: {
    name: 'Zupa gulaszowa 500 ml', kcal: 300,
    protein_g: 19.0, carbs_g: 22.0, fat_g: 14.0, saturated_fat_g: 5.0, sugars_g: 7.0, salt_g: 2.2,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'FoodData Central/analog potrawy',
    macroNote: 'Danie złożone — wartości orientacyjne dla porcji 500 ml.'
  },
  salmonVeg: {
    name: 'Pieczony łosoś z warzywami', kcal: 497,
    protein_g: 34.0, carbs_g: 18.0, fat_g: 33.0, saturated_fat_g: 6.0, sugars_g: 8.0, salt_g: 0.9,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'USDA FoodData Central',
    macroNote: 'Danie złożone — wartości orientacyjne dla łososia, warzyw i niewielkiej ilości tłuszczu.'
  },
  chickenVeg: {
    name: 'Kurczak z warzywami', kcal: 312,
    protein_g: 38.0, carbs_g: 18.0, fat_g: 10.0, saturated_fat_g: 2.0, sugars_g: 8.0, salt_g: 0.8,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'USDA FoodData Central',
    macroNote: 'Danie złożone — wartości orientacyjne dla piersi z kurczaka i warzyw.'
  },
  codVeg: {
    name: 'Dorsz pieczony z warzywami', kcal: 316,
    protein_g: 35.0, carbs_g: 24.0, fat_g: 8.0, saturated_fat_g: 1.2, sugars_g: 9.0, salt_g: 0.8,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'USDA FoodData Central',
    macroNote: 'Danie złożone — wartości orientacyjne dla dorsza, warzyw i małej ilości oliwy.'
  },
  chickenRice: {
    name: 'Kurczak z ryżem i warzywami', kcal: 405,
    protein_g: 33.0, carbs_g: 48.0, fat_g: 9.0, saturated_fat_g: 1.8, sugars_g: 5.0, salt_g: 0.8,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'USDA FoodData Central',
    macroNote: 'Danie złożone — wartości orientacyjne dla typowej porcji obiadowej.'
  },
  broccoliSoup: {
    name: 'Krem z brokułów 300 ml', kcal: 180,
    protein_g: 6.0, carbs_g: 18.0, fat_g: 9.0, saturated_fat_g: 3.0, sugars_g: 6.0, salt_g: 1.2,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'USDA FoodData Central/analog potrawy',
    macroNote: 'Danie złożone — wartości orientacyjne dla porcji 300 ml.'
  },
  greekSalad: {
    name: 'Sałatka grecka', kcal: 300,
    protein_g: 9.0, carbs_g: 12.0, fat_g: 23.0, saturated_fat_g: 7.0, sugars_g: 7.0, salt_g: 1.8,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'USDA FoodData Central',
    macroNote: 'Danie złożone — wartości orientacyjne; feta i oliwa najmocniej zmieniają wynik.'
  },
  chickpeaCurry: {
    name: 'Curry z ciecierzycą i warzywami', kcal: 320,
    protein_g: 12.0, carbs_g: 38.0, fat_g: 12.0, saturated_fat_g: 3.0, sugars_g: 9.0, salt_g: 1.3,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'USDA FoodData Central',
    macroNote: 'Danie złożone — wartości orientacyjne; mleczko kokosowe i ilość oleju mogą zwiększyć tłuszcz.'
  },
  vegLasagna: {
    name: 'Lasagne wegetariańska', kcal: 370,
    protein_g: 18.0, carbs_g: 46.0, fat_g: 13.0, saturated_fat_g: 6.0, sugars_g: 10.0, salt_g: 1.8,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'USDA FoodData Central/FNDDS',
    macroNote: 'Danie złożone — wartości orientacyjne dla typowej porcji.'
  },
  tofuStirfry: {
    name: 'Stir-fry z tofu i warzywami', kcal: 265,
    protein_g: 18.0, carbs_g: 18.0, fat_g: 15.0, saturated_fat_g: 2.4, sugars_g: 8.0, salt_g: 1.4,
    macroCategory: 'meal', foodGroup: 'meals', macroSource: 'USDA FoodData Central',
    macroNote: 'Danie złożone — wartości orientacyjne dla tofu, warzyw i niewielkiej ilości tłuszczu.'
  }
};

const foods = Object.assign({}, snacks, meals);

const FOOD_SELECT_GROUPS = Object.freeze([
  Object.freeze({ key: 'snacks', label: 'Przekąski i napoje' }),
  Object.freeze({ key: 'meals', label: 'Dania i zestawy' }),
  Object.freeze({ key: 'base', label: 'Produkty bazowe' }),
  Object.freeze({ key: 'other', label: 'Inne' })
]);

const MACRO_REFERENCE_FOOD_ALIASES = Object.freeze({
  carb_banana: 'banana',
  satfat_snickers_single: 'snickers',
  satfat_milk_chocolate: 'chocolate'
});

const MACRO_PRACTICE_DICTIONARY_URL_CANDIDATES = [
  './macro_examples_dictionary_pl.json',
  'macro_examples_dictionary_pl.json',
  '/macro_examples_dictionary_pl.json'
];

const MACRO_UI_COPY_URL_CANDIDATES = [
  './macro_ui_copy_pl.json',
  'macro_ui_copy_pl.json',
  '/macro_ui_copy_pl.json'
];

const MACRO_PRACTICE_FALLBACK_DICTIONARY = {
  "version": "0.2.2",
  "locale": "pl-PL",
  "purpose": "Słownik przykładów produktów i porcji do kart norm makroskładników oraz karty „Kalorie posiłków i czas spalania”. Wartości edukacyjne oparto na oficjalnych bazach składu żywności, przede wszystkim USDA FoodData Central.",
  "source_policy": {
    "generic_foods": {
      "provider": "USDA FoodData Central",
      "preferred_data_type": [
        "Foundation Foods",
        "SR Legacy",
        "FNDDS"
      ],
      "why": "Oficjalna publiczna baza składu żywności; pozwala prezentować orientacyjne wartości energii, białka, tłuszczu i węglowodanów dla typowych produktów i porcji."
    },
    "branded_foods": {
      "provider": "USDA FoodData Central / oficjalne etykiety producentów",
      "why": "Produkty markowe pozostają wyłącznie jako ostrzeżenia przy tłuszczach nasyconych; przykłady białka, tłuszczów i węglowodanów wykorzystują produkty ogólne z FDC."
    },
    "notes": [
      "Wartości w tym pliku są przykładami edukacyjnymi dla typowych porcji, a nie indywidualnym jadłospisem.",
      "Dla żywności ogólnej stosuj USDA FoodData Central; dla produktów markowych lub regionalnych wartości mogą wymagać weryfikacji z etykietą producenta albo lokalną bazą żywności.",
      "Pole install_in_food_select=false oznacza, że produkt służy tylko jako przykład w oknie „Zobacz przykłady” i nie powiększa listy wyboru w karcie kalorii."
    ]
  },
  "selection_rules": {
    "card_inline": {
      "max_examples": 3,
      "protein": [
        "najprostszy",
        "na_szybko",
        "bez_miesa"
      ],
      "carbs": [
        "porcja_bazowa",
        "na_szybko",
        "sniadanie"
      ],
      "fat": [
        "lepsze_zrodlo",
        "lepsze_zrodlo",
        "uwazaj_na"
      ],
      "satfat": [
        "warning",
        "warning",
        "warning"
      ]
    },
    "bottom_sheet": {
      "protein": {
        "sections": [
          "przykladowe_porcje_bogate_w_bialko",
          "wersja_bez_miesa"
        ],
        "max_items_per_section": 5
      },
      "carbs": {
        "sections": [
          "porcje_bazowe",
          "na_szybko"
        ],
        "max_items_per_section": 5
      },
      "fat": {
        "sections": [
          "lepsze_zrodla_tluszczu",
          "gestosc_energetyczna"
        ],
        "max_items_per_section": 6
      },
      "satfat": {
        "sections": [
          "produkty_ktore_szybko_podbijaja_nasycone"
        ],
        "max_items_per_section": 5
      }
    }
  },
  "warning_rules": {
    "saturated_fat_portion_share_of_day_cap_pct": {
      "low_max": 10,
      "medium_max": 20,
      "high_min": 21
    },
    "copy_rule": {
      "do_not_say": "pokrywa zapotrzebowanie na tłuszcze nasycone",
      "say_instead": [
        "zajmuje część dziennego pułapu",
        "ma wysoką ilość tłuszczów nasyconych w 1 porcji",
        "warto ograniczać"
      ]
    }
  },
  "products": [
    {
      "id": "protein_chicken_breast",
      "category": "protein",
      "display_name_pl": "Pierś z kurczaka",
      "default_portion": {
        "amount": 120,
        "unit": "g",
        "label_pl": "1 średnia porcja"
      },
      "role": "najprostszy",
      "hero_macro": "protein",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "chicken breast cooked roasted meat only",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "białko",
        "chude mięso"
      ],
      "notes_pl": "Chude mięso — dużo białka przy niewielkiej ilości tłuszczu.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 120,
        "energy_kcal": 198,
        "protein_g": 37.2,
        "carbs_g": 0,
        "fat_g": 4.3,
        "saturated_fat_g": 1.2
      }
    },
    {
      "id": "protein_turkey_breast",
      "category": "protein",
      "display_name_pl": "Pierś z indyka",
      "default_portion": {
        "amount": 120,
        "unit": "g",
        "label_pl": "1 średnia porcja"
      },
      "role": "najprostszy",
      "hero_macro": "protein",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "turkey breast roasted meat only",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "białko",
        "chude mięso"
      ],
      "notes_pl": "Podobna rola jak pierś z kurczaka; praktyczne chude źródło białka.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 120,
        "energy_kcal": 162,
        "protein_g": 34.8,
        "carbs_g": 0,
        "fat_g": 2.4,
        "saturated_fat_g": 0.7
      },
      "install_in_food_select": false
    },
    {
      "id": "protein_tuna_water",
      "category": "protein",
      "display_name_pl": "Tuńczyk w wodzie",
      "default_portion": {
        "amount": 100,
        "unit": "g",
        "label_pl": "1 mała puszka po odsączeniu"
      },
      "role": "na_szybko",
      "hero_macro": "protein",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "tuna canned in water drained",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "białko",
        "ryby",
        "na szybko"
      ],
      "notes_pl": "Wygodne źródło białka; przy rybach warto dbać o różnorodność gatunków.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 100,
        "energy_kcal": 116,
        "protein_g": 25.5,
        "carbs_g": 0,
        "fat_g": 0.8,
        "saturated_fat_g": 0.2
      },
      "install_in_food_select": false
    },
    {
      "id": "protein_salmon_cooked",
      "category": "protein",
      "display_name_pl": "Łosoś pieczony",
      "default_portion": {
        "amount": 120,
        "unit": "g",
        "label_pl": "1 filet"
      },
      "role": "najprostszy",
      "hero_macro": "protein",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "salmon cooked dry heat",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "białko",
        "ryby",
        "tłuszcze nienasycone"
      ],
      "notes_pl": "Dostarcza białka i tłuszczów nienasyconych; ma więcej kalorii niż chude mięso.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 120,
        "energy_kcal": 247,
        "protein_g": 26.4,
        "carbs_g": 0,
        "fat_g": 14.7,
        "saturated_fat_g": 3.1
      },
      "install_in_food_select": false
    },
    {
      "id": "protein_cod_baked",
      "category": "protein",
      "display_name_pl": "Dorsz pieczony",
      "default_portion": {
        "amount": 120,
        "unit": "g",
        "label_pl": "1 filet"
      },
      "role": "najprostszy",
      "hero_macro": "protein",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "cod Atlantic cooked dry heat",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "białko",
        "ryby",
        "chude źródło"
      ],
      "notes_pl": "Chuda ryba — dobre źródło białka przy małej ilości tłuszczu.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 120,
        "energy_kcal": 126,
        "protein_g": 27.4,
        "carbs_g": 0,
        "fat_g": 1.1,
        "saturated_fat_g": 0.2
      },
      "install_in_food_select": false
    },
    {
      "id": "protein_greek_yogurt_nonfat",
      "category": "protein",
      "display_name_pl": "Jogurt typu greckiego / skyr naturalny",
      "default_portion": {
        "amount": 1,
        "unit": "kubeczek",
        "label_pl": "1 kubeczek"
      },
      "role": "na_szybko",
      "hero_macro": "protein",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "Greek yogurt plain nonfat",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "białko",
        "nabiał",
        "na szybko"
      ],
      "notes_pl": "Szybki przykład nabiału wysokobiałkowego.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 170,
        "energy_kcal": 100,
        "protein_g": 17.3,
        "carbs_g": 6.1,
        "fat_g": 0.7,
        "saturated_fat_g": 0.3
      }
    },
    {
      "id": "protein_cottage_cheese_lowfat",
      "category": "protein",
      "display_name_pl": "Serek wiejski / cottage cheese",
      "default_portion": {
        "amount": 1,
        "unit": "kubek",
        "label_pl": "1 mały kubek"
      },
      "role": "na_szybko",
      "hero_macro": "protein",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "cottage cheese lowfat",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "białko",
        "nabiał"
      ],
      "notes_pl": "Nabiał z umiarkowaną ilością tłuszczu; wartości zależą od wariantu.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 150,
        "energy_kcal": 122,
        "protein_g": 16.8,
        "carbs_g": 5.1,
        "fat_g": 3.9,
        "saturated_fat_g": 2.4
      },
      "install_in_food_select": false
    },
    {
      "id": "protein_twarog_half_fat",
      "category": "protein",
      "display_name_pl": "Twaróg półtłusty",
      "default_portion": {
        "amount": 100,
        "unit": "g",
        "label_pl": "1/2 kostki"
      },
      "role": "najprostszy",
      "hero_macro": "protein",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "USDA FoodData Central / porównawczo produkt regionalny",
        "lookup_query": "cheese cottage dry curd / farmer cheese",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "białko",
        "nabiał"
      ],
      "notes_pl": "Polski odpowiednik sera twarogowego; wartości porcji traktuj orientacyjnie.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 100,
        "energy_kcal": 133,
        "protein_g": 18.7,
        "carbs_g": 3.5,
        "fat_g": 4.7,
        "saturated_fat_g": 3
      }
    },
    {
      "id": "protein_eggs",
      "category": "protein",
      "display_name_pl": "Jajka",
      "default_portion": {
        "amount": 2,
        "unit": "szt.",
        "label_pl": "2 sztuki"
      },
      "role": "na_szybko",
      "hero_macro": "protein",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "egg whole cooked hard-boiled",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "białko",
        "jaja"
      ],
      "notes_pl": "Łatwy punkt odniesienia; białko i tłuszcz występują tu razem.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 100,
        "energy_kcal": 144,
        "protein_g": 12.6,
        "carbs_g": 0.8,
        "fat_g": 9.5,
        "saturated_fat_g": 3.1
      }
    },
    {
      "id": "protein_tofu_natural",
      "category": "protein",
      "display_name_pl": "Tofu naturalne",
      "default_portion": {
        "amount": 150,
        "unit": "g",
        "label_pl": "1/2–3/4 kostki"
      },
      "role": "bez_miesa",
      "hero_macro": "protein",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "tofu firm prepared with calcium sulfate",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "białko",
        "bez mięsa",
        "soja"
      ],
      "notes_pl": "Bezmięsna porcja białka; zawartość zależy od twardości tofu.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 150,
        "energy_kcal": 216,
        "protein_g": 25.5,
        "carbs_g": 4.2,
        "fat_g": 12.8,
        "saturated_fat_g": 1.9
      }
    },
    {
      "id": "protein_lentils_cooked",
      "category": "protein",
      "display_name_pl": "Soczewica gotowana",
      "default_portion": {
        "amount": 1,
        "unit": "szklanka",
        "label_pl": "1 szklanka"
      },
      "role": "bez_miesa",
      "hero_macro": "protein",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "lentils mature seeds cooked boiled",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "białko",
        "bez mięsa",
        "strączki"
      ],
      "notes_pl": "Źródło białka roślinnego i węglowodanów; dobrze łączyć ze zbożami.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 180,
        "energy_kcal": 209,
        "protein_g": 16.2,
        "carbs_g": 36,
        "fat_g": 0.7,
        "saturated_fat_g": 0.1
      },
      "install_in_food_select": false
    },
    {
      "id": "protein_chickpeas_cooked",
      "category": "protein",
      "display_name_pl": "Ciecierzyca gotowana",
      "default_portion": {
        "amount": 1,
        "unit": "szklanka",
        "label_pl": "1 szklanka"
      },
      "role": "bez_miesa",
      "hero_macro": "protein",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "chickpeas cooked boiled",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "białko",
        "bez mięsa",
        "strączki"
      ],
      "notes_pl": "Strączki dostarczają białka, ale też sporo węglowodanów.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 160,
        "energy_kcal": 269,
        "protein_g": 14.5,
        "carbs_g": 45,
        "fat_g": 4.2,
        "saturated_fat_g": 0.4
      },
      "install_in_food_select": false
    },
    {
      "id": "protein_white_beans_cooked",
      "category": "protein",
      "display_name_pl": "Fasola biała gotowana",
      "default_portion": {
        "amount": 1,
        "unit": "szklanka",
        "label_pl": "1 szklanka"
      },
      "role": "bez_miesa",
      "hero_macro": "protein",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "beans white mature seeds cooked boiled without salt",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "białko",
        "bez mięsa",
        "strączki"
      ],
      "notes_pl": "Strączki dostarczają białka i węglowodanów złożonych; najlepiej łączyć je z innymi źródłami białka w ciągu dnia.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 179,
        "energy_kcal": 249,
        "protein_g": 17.4,
        "carbs_g": 44.9,
        "fat_g": 0.6,
        "saturated_fat_g": 0.1
      },
      "install_in_food_select": false
    },
    {
      "id": "carb_rice_cooked",
      "category": "carbs",
      "display_name_pl": "Ryż ugotowany",
      "default_portion": {
        "amount": 200,
        "unit": "g",
        "label_pl": "1 porcja obiadowa"
      },
      "role": "porcja_bazowa",
      "hero_macro": "carbs",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "rice white long-grain cooked",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "węglowodany",
        "porcja bazowa"
      ],
      "notes_pl": "Dobra kotwica do tłumaczenia porcji węglowodanów w obiedzie.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 200,
        "energy_kcal": 260,
        "protein_g": 5.4,
        "carbs_g": 56.4,
        "fat_g": 0.6,
        "saturated_fat_g": 0.1
      }
    },
    {
      "id": "carb_pasta_cooked",
      "category": "carbs",
      "display_name_pl": "Makaron ugotowany",
      "default_portion": {
        "amount": 200,
        "unit": "g",
        "label_pl": "1 porcja obiadowa"
      },
      "role": "porcja_bazowa",
      "hero_macro": "carbs",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "pasta cooked enriched",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "węglowodany",
        "porcja bazowa"
      ],
      "notes_pl": "Klasyczna porcja bazowa do głównego posiłku.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 200,
        "energy_kcal": 316,
        "protein_g": 11.6,
        "carbs_g": 61.6,
        "fat_g": 1.9,
        "saturated_fat_g": 0.4
      }
    },
    {
      "id": "carb_potatoes_boiled",
      "category": "carbs",
      "display_name_pl": "Ziemniaki gotowane",
      "default_portion": {
        "amount": 2,
        "unit": "szt.",
        "label_pl": "2 średnie sztuki"
      },
      "role": "porcja_bazowa",
      "hero_macro": "carbs",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "potatoes boiled cooked flesh without skin",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "węglowodany",
        "porcja bazowa"
      ],
      "notes_pl": "Porcja skrobiowa o zwykle niższej gęstości energetycznej niż suchsze produkty zbożowe.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 200,
        "energy_kcal": 174,
        "protein_g": 3.8,
        "carbs_g": 40,
        "fat_g": 0.2,
        "saturated_fat_g": 0.1
      },
      "install_in_food_select": false
    },
    {
      "id": "carb_sweet_potato_baked",
      "category": "carbs",
      "display_name_pl": "Batat pieczony",
      "default_portion": {
        "amount": 1,
        "unit": "szt.",
        "label_pl": "1 średnia sztuka"
      },
      "role": "porcja_bazowa",
      "hero_macro": "carbs",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "sweet potato cooked baked in skin without salt",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "węglowodany",
        "warzywa skrobiowe"
      ],
      "notes_pl": "Warzywo skrobiowe — może zastępować ziemniaki, ryż lub pieczywo w posiłku.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 150,
        "energy_kcal": 135,
        "protein_g": 3,
        "carbs_g": 31,
        "fat_g": 0.2,
        "saturated_fat_g": 0
      },
      "install_in_food_select": false
    },
    {
      "id": "carb_quinoa_cooked",
      "category": "carbs",
      "display_name_pl": "Komosa ryżowa gotowana",
      "default_portion": {
        "amount": 1,
        "unit": "szklanka",
        "label_pl": "1 szklanka"
      },
      "role": "porcja_bazowa",
      "hero_macro": "carbs",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "quinoa cooked",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "węglowodany",
        "porcja bazowa"
      ],
      "notes_pl": "Porcja węglowodanów z dodatkową ilością białka i tłuszczu.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 185,
        "energy_kcal": 222,
        "protein_g": 8.1,
        "carbs_g": 39.4,
        "fat_g": 3.6,
        "saturated_fat_g": 0.4
      },
      "install_in_food_select": false
    },
    {
      "id": "carb_buckwheat_cooked",
      "category": "carbs",
      "display_name_pl": "Kasza gryczana gotowana",
      "default_portion": {
        "amount": 1,
        "unit": "szklanka",
        "label_pl": "1 szklanka"
      },
      "role": "porcja_bazowa",
      "hero_macro": "carbs",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "buckwheat groats roasted cooked",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "węglowodany",
        "porcja bazowa",
        "kasza"
      ],
      "notes_pl": "Porcja kaszy do obiadu lub kolacji; zwykle lepiej syci niż produkty oczyszczone.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 168,
        "energy_kcal": 155,
        "protein_g": 5.7,
        "carbs_g": 33.5,
        "fat_g": 1,
        "saturated_fat_g": 0.2
      },
      "install_in_food_select": false
    },
    {
      "id": "carb_oats_dry",
      "category": "carbs",
      "display_name_pl": "Płatki owsiane",
      "default_portion": {
        "amount": 60,
        "unit": "g",
        "label_pl": "1 porcja śniadaniowa"
      },
      "role": "sniadanie",
      "hero_macro": "carbs",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "oats raw",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "węglowodany",
        "śniadanie"
      ],
      "notes_pl": "Praktyczny przykład śniadaniowy; zawiera też białko i tłuszcz.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 60,
        "energy_kcal": 233,
        "protein_g": 10.1,
        "carbs_g": 39.8,
        "fat_g": 4.1,
        "saturated_fat_g": 0.7
      }
    },
    {
      "id": "carb_wholegrain_bread",
      "category": "carbs",
      "display_name_pl": "Chleb pełnoziarnisty",
      "default_portion": {
        "amount": 2,
        "unit": "kromki",
        "label_pl": "2 kromki"
      },
      "role": "na_szybko",
      "hero_macro": "carbs",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "bread whole wheat",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "węglowodany",
        "pieczywo"
      ],
      "notes_pl": "Czytelny przykład do kanapek i śniadania.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 60,
        "energy_kcal": 148,
        "protein_g": 7.8,
        "carbs_g": 24,
        "fat_g": 2.5,
        "saturated_fat_g": 0.5
      }
    },
    {
      "id": "carb_banana",
      "category": "carbs",
      "display_name_pl": "Banan",
      "default_portion": {
        "amount": 1,
        "unit": "szt.",
        "label_pl": "1 średni banan"
      },
      "role": "na_szybko",
      "hero_macro": "carbs",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "banana raw",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "węglowodany",
        "owoce"
      ],
      "notes_pl": "Łatwy przykład przekąski węglowodanowej.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 118,
        "energy_kcal": 105,
        "protein_g": 1.3,
        "carbs_g": 27,
        "fat_g": 0.4,
        "saturated_fat_g": 0.1,
        "sugars_g": 14.4
      }
    },
    {
      "id": "carb_apple",
      "category": "carbs",
      "display_name_pl": "Jabłko",
      "default_portion": {
        "amount": 1,
        "unit": "szt.",
        "label_pl": "1 średnie jabłko"
      },
      "role": "na_szybko",
      "hero_macro": "carbs",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "apple raw with skin",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "węglowodany",
        "owoce"
      ],
      "notes_pl": "Przekąska z naturalnymi cukrami i błonnikiem.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 180,
        "energy_kcal": 95,
        "protein_g": 0.5,
        "carbs_g": 25,
        "fat_g": 0.3,
        "saturated_fat_g": 0.1,
        "sugars_g": 19
      },
      "install_in_food_select": false
    },
    {
      "id": "carb_kidney_beans_cooked",
      "category": "carbs",
      "display_name_pl": "Fasola czerwona gotowana",
      "default_portion": {
        "amount": 1,
        "unit": "szklanka",
        "label_pl": "1 szklanka"
      },
      "role": "porcja_bazowa",
      "hero_macro": "carbs",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "kidney beans red mature seeds cooked boiled",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "węglowodany",
        "strączki"
      ],
      "notes_pl": "Strączki łączą węglowodany, białko i błonnik.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 170,
        "energy_kcal": 225,
        "protein_g": 15.3,
        "carbs_g": 40.4,
        "fat_g": 0.9,
        "saturated_fat_g": 0.1
      },
      "install_in_food_select": false
    },
    {
      "id": "carb_corn_cooked",
      "category": "carbs",
      "display_name_pl": "Kukurydza gotowana",
      "default_portion": {
        "amount": 1,
        "unit": "szklanka",
        "label_pl": "1 szklanka"
      },
      "role": "na_szybko",
      "hero_macro": "carbs",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "corn sweet yellow cooked boiled drained",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "węglowodany",
        "warzywa skrobiowe"
      ],
      "notes_pl": "Przykład skrobiowego dodatku do posiłku.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 165,
        "energy_kcal": 143,
        "protein_g": 5.1,
        "carbs_g": 31.3,
        "fat_g": 2.2,
        "saturated_fat_g": 0.3
      },
      "install_in_food_select": false
    },
    {
      "id": "fat_olive_oil",
      "category": "fat",
      "display_name_pl": "Oliwa z oliwek",
      "default_portion": {
        "amount": 1,
        "unit": "łyżka",
        "label_pl": "1 łyżka"
      },
      "role": "lepsze_zrodlo",
      "hero_macro": "fat",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "oil olive salad or cooking",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "tłuszcz",
        "oliwa"
      ],
      "notes_pl": "Bardzo czytelne źródło tłuszczu dodanego, głównie jednonienasyconego.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 13.5,
        "energy_kcal": 119,
        "protein_g": 0,
        "carbs_g": 0,
        "fat_g": 13.5,
        "saturated_fat_g": 1.9
      }
    },
    {
      "id": "fat_canola_oil",
      "category": "fat",
      "display_name_pl": "Olej rzepakowy",
      "default_portion": {
        "amount": 1,
        "unit": "łyżka",
        "label_pl": "1 łyżka"
      },
      "role": "lepsze_zrodlo",
      "hero_macro": "fat",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "oil canola",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "tłuszcz",
        "olej roślinny"
      ],
      "notes_pl": "Olej roślinny do sałatek i gotowania; porcja 1 łyżki szybko zwiększa kaloryczność.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 14,
        "energy_kcal": 124,
        "protein_g": 0,
        "carbs_g": 0,
        "fat_g": 14,
        "saturated_fat_g": 1
      },
      "install_in_food_select": false
    },
    {
      "id": "fat_avocado",
      "category": "fat",
      "display_name_pl": "Awokado",
      "default_portion": {
        "amount": 0.5,
        "unit": "szt.",
        "label_pl": "1/2 sztuki"
      },
      "role": "lepsze_zrodlo",
      "hero_macro": "fat",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "avocados raw all commercial varieties",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "tłuszcz",
        "owoce"
      ],
      "notes_pl": "Przykład tłuszczu z produktu świeżego; zawiera też błonnik.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 75,
        "energy_kcal": 120,
        "protein_g": 1.5,
        "carbs_g": 6.4,
        "fat_g": 11,
        "saturated_fat_g": 1.6
      }
    },
    {
      "id": "fat_walnuts",
      "category": "fat",
      "display_name_pl": "Orzechy włoskie",
      "default_portion": {
        "amount": 30,
        "unit": "g",
        "label_pl": "1 garść"
      },
      "role": "lepsze_zrodlo",
      "hero_macro": "fat",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "walnuts english",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "tłuszcz",
        "orzechy"
      ],
      "notes_pl": "Mała porcja daje sporo tłuszczu i energii; dobre źródło ALA.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 30,
        "energy_kcal": 196,
        "protein_g": 4.6,
        "carbs_g": 4.1,
        "fat_g": 19.6,
        "saturated_fat_g": 1.8
      }
    },
    {
      "id": "fat_almonds",
      "category": "fat",
      "display_name_pl": "Migdały",
      "default_portion": {
        "amount": 30,
        "unit": "g",
        "label_pl": "1 garść"
      },
      "role": "lepsze_zrodlo",
      "hero_macro": "fat",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "almonds",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "tłuszcz",
        "orzechy"
      ],
      "notes_pl": "Czytelny przykład tłuszczu z orzechów.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 30,
        "energy_kcal": 174,
        "protein_g": 6.4,
        "carbs_g": 6.5,
        "fat_g": 15,
        "saturated_fat_g": 1.1
      }
    },
    {
      "id": "fat_chia_seeds",
      "category": "fat",
      "display_name_pl": "Nasiona chia",
      "default_portion": {
        "amount": 2,
        "unit": "łyżki",
        "label_pl": "2 łyżki"
      },
      "role": "lepsze_zrodlo",
      "hero_macro": "fat",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "seeds chia dried",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "tłuszcz",
        "nasiona"
      ],
      "notes_pl": "Dostarczają tłuszczu, ale też błonnika; porcje zwykle są małe.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 28,
        "energy_kcal": 138,
        "protein_g": 4.7,
        "carbs_g": 12,
        "fat_g": 8.7,
        "saturated_fat_g": 0.9
      },
      "install_in_food_select": false
    },
    {
      "id": "fat_flaxseed_ground",
      "category": "fat",
      "display_name_pl": "Siemię lniane mielone",
      "default_portion": {
        "amount": 2,
        "unit": "łyżki",
        "label_pl": "2 łyżki"
      },
      "role": "lepsze_zrodlo",
      "hero_macro": "fat",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "flaxseed ground",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "tłuszcz",
        "nasiona",
        "omega-3 ALA"
      ],
      "notes_pl": "Dodatek do owsianki, jogurtu lub koktajlu; wnosi tłuszcz, błonnik i kwas ALA.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 14,
        "energy_kcal": 75,
        "protein_g": 2.6,
        "carbs_g": 4,
        "fat_g": 5.9,
        "saturated_fat_g": 0.5
      },
      "install_in_food_select": false
    },
    {
      "id": "fat_sunflower_seeds",
      "category": "fat",
      "display_name_pl": "Pestki słonecznika",
      "default_portion": {
        "amount": 30,
        "unit": "g",
        "label_pl": "1 garść"
      },
      "role": "lepsze_zrodlo",
      "hero_macro": "fat",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "seeds sunflower seed kernels dried",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "tłuszcz",
        "nasiona"
      ],
      "notes_pl": "Poręczna porcja tłuszczu z nasion.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 30,
        "energy_kcal": 175,
        "protein_g": 6.2,
        "carbs_g": 6,
        "fat_g": 15.5,
        "saturated_fat_g": 1.5
      },
      "install_in_food_select": false
    },
    {
      "id": "fat_peanut_butter_100",
      "category": "fat",
      "display_name_pl": "Masło orzechowe 100%",
      "default_portion": {
        "amount": 2,
        "unit": "łyżki",
        "label_pl": "2 łyżki"
      },
      "role": "uwazaj_na",
      "hero_macro": "fat",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "peanut butter smooth style without salt",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "tłuszcz",
        "orzechy",
        "kaloryczne"
      ],
      "notes_pl": "Łatwo zwiększa tłuszcz i kalorie — odmierzanie porcji ma znaczenie.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 32,
        "energy_kcal": 188,
        "protein_g": 8,
        "carbs_g": 7,
        "fat_g": 16,
        "saturated_fat_g": 3.3
      }
    },
    {
      "id": "fat_tahini",
      "category": "fat",
      "display_name_pl": "Tahini",
      "default_portion": {
        "amount": 2,
        "unit": "łyżki",
        "label_pl": "2 łyżki"
      },
      "role": "uwazaj_na",
      "hero_macro": "fat",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "sesame butter tahini",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "tłuszcz",
        "sezam"
      ],
      "notes_pl": "Mała porcja pasty sezamowej wnosi dużo tłuszczu i energii.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 30,
        "energy_kcal": 178,
        "protein_g": 5.1,
        "carbs_g": 6.4,
        "fat_g": 16.1,
        "saturated_fat_g": 2.3
      },
      "install_in_food_select": false
    },
    {
      "id": "fat_salmon_cooked",
      "category": "fat",
      "display_name_pl": "Łosoś pieczony",
      "default_portion": {
        "amount": 120,
        "unit": "g",
        "label_pl": "1 filet"
      },
      "role": "lepsze_zrodlo",
      "hero_macro": "fat",
      "lookup": {
        "provider": "USDA FoodData Central",
        "data_type": "Foundation Foods / SR Legacy / FNDDS",
        "lookup_query": "salmon cooked dry heat",
        "known_values": {},
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "tłuszcz",
        "ryby",
        "białko"
      ],
      "notes_pl": "Przykład produktu, w którym tłuszcz idzie razem z białkiem.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 120,
        "energy_kcal": 247,
        "protein_g": 26.4,
        "carbs_g": 0,
        "fat_g": 14.7,
        "saturated_fat_g": 3.1
      },
      "install_in_food_select": false
    },
    {
      "id": "satfat_snickers_single",
      "category": "satfat",
      "display_name_pl": "SNICKERS baton",
      "default_portion": {
        "amount": 1,
        "unit": "szt.",
        "label_pl": "1 baton"
      },
      "role": "warning",
      "hero_macro": "saturated_fat",
      "lookup": {
        "provider": "Oficjalna etykieta producenta / USDA FoodData Central",
        "lookup_query": "SNICKERS Singles Size Chocolate Candy Bars, 1.86 oz",
        "known_values_per_portion": {
          "energy_kcal": 250,
          "fat_g": 12,
          "saturated_fat_g": 4.5,
          "carbs_g": 32,
          "sugars_g": 27,
          "protein_g": 5
        },
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "warning",
        "słodycze",
        "wysokie nasycone"
      ],
      "notes_pl": "Modelowy przykład produktu, który szybko wykorzystuje sporą część dziennego pułapu nasyconych.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 53,
        "energy_kcal": 250,
        "protein_g": 5,
        "carbs_g": 32,
        "fat_g": 12,
        "saturated_fat_g": 4.5,
        "sugars_g": 27,
        "salt_g": 0.2
      }
    },
    {
      "id": "satfat_milk_chocolate",
      "category": "satfat",
      "display_name_pl": "Czekolada mleczna",
      "default_portion": {
        "amount": 50,
        "unit": "g",
        "label_pl": "1/2 tabliczki"
      },
      "role": "warning",
      "hero_macro": "saturated_fat",
      "lookup": {
        "provider": "USDA FoodData Central / etykiety produktów",
        "lookup_query": "Chocolate, milk",
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "warning",
        "słodycze",
        "nasycone"
      ],
      "notes_pl": "Przykład „słodkie + nasycone”.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 50,
        "energy_kcal": 268,
        "protein_g": 3.8,
        "carbs_g": 30,
        "fat_g": 15,
        "saturated_fat_g": 9,
        "sugars_g": 27,
        "salt_g": 0.1
      }
    },
    {
      "id": "satfat_butter_croissant",
      "category": "satfat",
      "display_name_pl": "Croissant maślany",
      "default_portion": {
        "amount": 1,
        "unit": "szt.",
        "label_pl": "1 sztuka"
      },
      "role": "warning",
      "hero_macro": "saturated_fat",
      "lookup": {
        "provider": "USDA FoodData Central / etykiety produktów",
        "lookup_query": "Croissant",
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "warning",
        "wypiek",
        "nasycone"
      ],
      "notes_pl": "Przykład pieczywa cukierniczego z dużym udziałem tłuszczu i nasyconych.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 60,
        "energy_kcal": 240,
        "protein_g": 5,
        "carbs_g": 26,
        "fat_g": 13,
        "saturated_fat_g": 7.5,
        "sugars_g": 6,
        "salt_g": 0.5
      }
    },
    {
      "id": "satfat_kabanos",
      "category": "satfat",
      "display_name_pl": "Kabanosy",
      "default_portion": {
        "amount": 60,
        "unit": "g",
        "label_pl": "1 mała paczka"
      },
      "role": "warning",
      "hero_macro": "saturated_fat",
      "lookup": {
        "provider": "Oficjalna etykieta producenta / USDA FoodData Central",
        "lookup_query": "Sausage, dry or semi-dry",
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "warning",
        "słone",
        "nasycone"
      ],
      "notes_pl": "Przykład „słone + nasycone”.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 60,
        "energy_kcal": 320,
        "protein_g": 16,
        "carbs_g": 1.2,
        "fat_g": 26,
        "saturated_fat_g": 10,
        "salt_g": 2.2
      }
    },
    {
      "id": "satfat_yellow_cheese",
      "category": "satfat",
      "display_name_pl": "Ser żółty",
      "default_portion": {
        "amount": 40,
        "unit": "g",
        "label_pl": "2–3 plastry"
      },
      "role": "warning",
      "hero_macro": "saturated_fat",
      "lookup": {
        "provider": "USDA FoodData Central / etykiety produktów",
        "lookup_query": "Cheese, edam",
        "data_type_hint": "Foundation Foods / FNDDS / SR Legacy"
      },
      "ui_tags": [
        "warning",
        "nabiał",
        "nasycone"
      ],
      "notes_pl": "Codzienny produkt, który potrafi szybko podbić nasycone.",
      "resolved_nutrients_per_portion": {
        "portion_mass_g": 40,
        "energy_kcal": 142,
        "protein_g": 10.4,
        "carbs_g": 0.2,
        "fat_g": 11,
        "saturated_fat_g": 7.2,
        "salt_g": 0.8
      }
    }
  ],
  "combination_examples": {
    "protein_sets": [],
    "carbs_sets": [],
    "fat_sets": [],
    "protein_mixed_day": [],
    "plant_protein_note": "Przy białku roślinnym warto łączyć różne źródła, np. strączki + produkty zbożowe + orzechy."
  },
  "integration_hints": {
    "nutrition_norms_card": {
      "preview_builder": "macroExamplesBuildPreview(targets, dictionary)",
      "bottom_sheet_builder": "macroExamplesBuildSheet(macroType, target, dictionary, copy)"
    },
    "meal_card": {
      "extra_line_1": "B {{protein_g}} g • W {{carbs_g}} g • T {{fat_g}} g",
      "extra_line_2_mode": [
        "goal_share",
        "warning"
      ],
      "warning_chip_source": "saturated_fat_portion_share_of_day_cap_pct"
    }
  },
  "reference_caps": {
    "saturated_fat_g": 20
  }
};

const MACRO_PRACTICE_FALLBACK_COPY = {
  "version": "0.2.1",
  "locale": "pl-PL",
  "card_inline": {
    "protein_summary": "Przykłady pokazują, jak z kilku porcji zbudować dzienny cel białka.",
    "carbs_summary": "Przykłady pokazują porcje, które pomagają rozłożyć węglowodany na cały dzień.",
    "fat_summary": "Przykłady pokazują, jak szybko sumuje się tłuszcz i które źródła wybierać częściej.",
    "satfat_summary": "Im mniej, tym lepiej. To nie jest cel do dobicia.",
    "cta_examples": "Zobacz przykłady"
  },
  "bottom_sheet": {
    "common": {
      "cta_close": "Zamknij",
      "disclaimer_examples": "To orientacyjne przykłady produktów i porcji opracowane na podstawie USDA FoodData Central. Nie musisz zjadać jednego produktu, żeby osiągnąć cel dnia; rzeczywista zawartość składników zależy od produktu, obróbki i porcji.",
      "disclaimer_warning": "To nie jest „cel do dobicia”. Chodzi o produkty, które szybko podbijają tłuszcze nasycone w 1 porcji."
    },
    "protein": {
      "title": "Białko — przykłady porcji z żywności",
      "subtitle": "Cel do planowania: {{target_g}} g/d",
      "section_simple": "Źródła zwierzęce i mieszane",
      "section_meatless": "Źródła roślinne i bezmięsne",
      "row_goal_share": "ok. {{pct}} celu",
      "row_good_choice": "Przykład porcji, którą łatwo włączyć do posiłku.",
      "row_meatless_note": "Białko roślinne najlepiej planować z różnych źródeł w ciągu dnia.",
      "intro": "Poniżej pokazano przykładowe porcje produktów, które mogą pomagać pokrywać dzienny cel białka. Nie trzeba realizować celu jednym produktem — zwykle rozkłada się go na kilka posiłków.",
      "target_label": "Cel do plakietek",
      "section_examples": "Przykładowe porcje",
      "chip_goal_share": "ok. {{pct}} celu"
    },
    "carbs": {
      "title": "Węglowodany — przykłady porcji z żywności",
      "subtitle": "Cel do planowania: {{target_g}} g/d",
      "section_base": "Porcje bazowe do posiłku",
      "section_quick": "Szybkie porcje i dodatki",
      "row_goal_share": "ok. {{pct}} celu",
      "row_base_note": "Porcja bazowa, którą łatwo wkomponować w główny posiłek.",
      "row_quick_note": "Szybka porcja węglowodanów; ilość cukrów i błonnika zależy od produktu.",
      "footer": "Węglowodany najlepiej rozkładać na kilka posiłków i wybierać częściej produkty zbożowe, warzywa skrobiowe, owoce oraz strączki.",
      "intro": "Poniżej pokazano przykładowe porcje produktów węglowodanowych. Najlepiej rozkładać je na kilka posiłków i wybierać częściej produkty zbożowe, warzywa skrobiowe, owoce i strączki.",
      "target_label": "Cel do plakietek",
      "section_examples": "Przykładowe porcje",
      "chip_goal_share": "ok. {{pct}} celu"
    },
    "fat": {
      "title": "Tłuszcze — przykłady porcji z żywności",
      "subtitle": "Zakres do planowania: {{target_min_g}}–{{target_max_g}} g/d",
      "section_better": "Źródła tłuszczów nienasyconych",
      "section_watch": "Produkty, z którymi łatwo przesadzić",
      "row_range_share": "ok. {{pct}} celu",
      "row_better_note": "Dobry przykład źródła tłuszczu nienasyconego lub produktu z korzystniejszym profilem tłuszczu.",
      "row_watch_note": "Warto odmierzać porcję — takie produkty szybko zwiększają tłuszcz i kalorie.",
      "footer": "W tłuszczach liczy się ilość i jakość. Częściej wybieraj źródła nienasycone, a tłuszcze nasycone traktuj jako składnik do ograniczania.",
      "intro": "Poniżej pokazano, ile tłuszczu wnoszą typowe porcje. W praktyce liczy się nie tylko ilość, ale też jakość — częściej wybieraj tłuszcze nienasycone, a ograniczaj źródła tłuszczów nasyconych.",
      "target_label": "Cel do plakietek",
      "section_examples": "Przykładowe porcje",
      "chip_goal_share": "ok. {{pct}} celu"
    },
    "satfat": {
      "title": "Tłuszcze nasycone — warto ograniczać",
      "subtitle": "Tu nie pokazujemy „celu dnia”. Pokazujemy, które porcje szybko podbijają nasycone.",
      "section_warning": "Produkty, które szybko podbijają nasycone",
      "row_portion_share": "Ta porcja zajmuje około {{pct}}% dziennego pułapu tłuszczów nasyconych.",
      "row_high": "Wysoka ilość tłuszczów nasyconych w 1 porcji.",
      "row_medium": "Średnia ilość tłuszczów nasyconych w 1 porcji.",
      "row_low": "Niska ilość tłuszczów nasyconych w 1 porcji.",
      "footer": "W praktyce chodzi o to, żeby takie produkty nie dominowały w codziennym jedzeniu."
    }
  },
  "chips": {
    "low": "niska ilość",
    "medium": "średnia ilość",
    "high": "wysoka ilość"
  },
  "meal_card": {
    "line_macros": "B {{protein_g}} g • W {{carbs_g}} g • T {{fat_g}} g",
    "line_goal_share": "Pokrywa: białko {{protein_pct}}% • węglowodany {{carbs_pct}}% • tłuszcz {{fat_pct}}%",
    "line_warning_satfat": "Tłuszcze nasycone: {{level_label}} w 1 porcji",
    "line_warning_salt": "Sól: {{level_label}} w 1 porcji",
    "line_warning_sugars": "Cukry: {{level_label}} w 1 porcji"
  },
  "tooltips": {
    "plant_protein": "Białka roślinne najlepiej oceniać w mieszance różnych produktów, a nie po jednym produkcie.",
    "saturated_fat": "Dla tłuszczów nasyconych nie pokazujemy „celu do dobicia”. Chodzi o ograniczanie produktów, które szybko wykorzystują sporą część dziennego pułapu.",
    "fat_quality": "W praktyce lepiej częściej wybierać oliwę, orzechy, nasiona, awokado i ryby niż produkty z dużą ilością tłuszczów nasyconych."
  },
  "empty_states": {
    "no_examples": "Brakuje jeszcze przykładów dla tej kategorii.",
    "no_target": "Najpierw oblicz cel dnia, żeby pokazać przykłady."
  }
};

const ACTIVITY_BURN_LIBRARY = Object.freeze({
  run:        Object.freeze({ key: 'run',        name: '🏃 Bieganie 8 km/h',             MET: 8.0, speedKmh: 8 }),
  bike:       Object.freeze({ key: 'bike',       name: '🚴 Rower 16 km/h',              MET: 6.0, speedKmh: 16 }),
  swim:       Object.freeze({ key: 'swim',       name: '🏊 Pływanie rekreacyjne',        MET: 7.5, speedKmh: 3 }),
  walk:       Object.freeze({ key: 'walk',       name: '🚶 Spacer 5 km/h',              MET: 3.0, speedKmh: 5 }),
  swimFast:   Object.freeze({ key: 'swimFast',   name: '🏊‍♂️ Pływanie intensywne',      MET: 9.8, speedKmh: 3 }),
  bike20:     Object.freeze({ key: 'bike20',     name: '🚴‍♂️ Rower 20 km/h',            MET: 8.0, speedKmh: 20 }),
  elliptical: Object.freeze({ key: 'elliptical', name: '🏃‍♂️ Orbitrek (średnie tempo)', MET: 5.0, speedKmh: null }),
  gaming:     Object.freeze({ key: 'gaming',     name: '🎮 Granie na komputerze',       MET: 1.3, speedKmh: null }),
  tennis:     Object.freeze({ key: 'tennis',     name: '🎾 Tenis',                       MET: 7.0, speedKmh: 5 }),
  basketball: Object.freeze({ key: 'basketball', name: '🏀 Koszykówka',                  MET: 6.5, speedKmh: 6 }),
  football:   Object.freeze({ key: 'football',   name: '⚽ Piłka nożna',                 MET: 7.0, speedKmh: 7 }),
  dance:      Object.freeze({ key: 'dance',      name: '💃 Taniec',                      MET: 5.0, speedKmh: 4 })
});

const ACTIVITY_BURN_PRESETS = Object.freeze({
  food_times: Object.freeze({
    key: 'food_times',
    activityKeys: Object.freeze(['run', 'bike', 'swim', 'walk', 'swimFast', 'bike20', 'elliptical', 'gaming']),
    includeDistance: false,
    applyChildFactor: true,
    tableHeader: 'Czas spalania'
  }),
  bmi_journey: Object.freeze({
    key: 'bmi_journey',
    activityKeys: Object.freeze(['walk', 'bike', 'bike20', 'run', 'swim', 'tennis', 'basketball', 'football', 'dance']),
    includeDistance: true,
    applyChildFactor: false,
    tableHeader: 'Dystans / Czas do normy'
  })
});

const ACTIVITY_BURN_ROUTE_EXAMPLES = Object.freeze([
  Object.freeze({ miasta: 'Poznań – Berlin', km: 240 }),
  Object.freeze({ miasta: 'Kraków – Wiedeń', km: 330 }),
  Object.freeze({ miasta: 'Gdańsk – Wilno', km: 400 }),
  Object.freeze({ miasta: 'Wrocław – Budapeszt', km: 550 }),
  Object.freeze({ miasta: 'Warszawa – Praga', km: 680 }),
  Object.freeze({ miasta: 'Poznań – Paryż', km: 1200 }),
  Object.freeze({ miasta: 'Warszawa – Paryż', km: 1600 }),
  Object.freeze({ miasta: 'Kraków – Paryż', km: 1500 }),
  Object.freeze({ miasta: 'Wrocław – Amsterdam', km: 1100 }),
  Object.freeze({ miasta: 'Poznań – Barcelona', km: 2100 }),
  Object.freeze({ miasta: 'Warszawa – Barcelona', km: 2300 }),
  Object.freeze({ miasta: 'Warszawa – Rzym', km: 1800 })
]);

const activities = Object.freeze(
  ACTIVITY_BURN_PRESETS.food_times.activityKeys.reduce((acc, key) => {
    const def = ACTIVITY_BURN_LIBRARY[key];
    acc[key] = { name: def.name, MET: def.MET, speed: def.speedKmh };
    return acc;
  }, {})
);

  function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  const api = Object.freeze({
    version: VERSION,
    snacks,
    meals,
    foods,
    foodSelectGroups: FOOD_SELECT_GROUPS,
    macroReferenceFoodAliases: MACRO_REFERENCE_FOOD_ALIASES,
    macroPracticeDictionaryUrlCandidates: MACRO_PRACTICE_DICTIONARY_URL_CANDIDATES,
    macroUiCopyUrlCandidates: MACRO_UI_COPY_URL_CANDIDATES,
    macroPracticeFallbackDictionary: MACRO_PRACTICE_FALLBACK_DICTIONARY,
    macroPracticeFallbackCopy: MACRO_PRACTICE_FALLBACK_COPY,
    activityBurnLibrary: ACTIVITY_BURN_LIBRARY,
    activityBurnPresets: ACTIVITY_BURN_PRESETS,
    activityBurnRouteExamples: ACTIVITY_BURN_ROUTE_EXAMPLES,
    activities,
    getFood(key) {
      const normalizedKey = String(key || '');
      return hasOwn(foods, normalizedKey) ? foods[normalizedKey] : null;
    },
    hasFood(key) {
      return hasOwn(foods, String(key || ''));
    },
    getSnack(key) {
      const normalizedKey = String(key || '');
      return hasOwn(snacks, normalizedKey) ? snacks[normalizedKey] : null;
    },
    getMeal(key) {
      const normalizedKey = String(key || '');
      return hasOwn(meals, normalizedKey) ? meals[normalizedKey] : null;
    },
    getActivityDefinition(key) {
      const normalizedKey = String(key || '');
      return hasOwn(ACTIVITY_BURN_LIBRARY, normalizedKey) ? ACTIVITY_BURN_LIBRARY[normalizedKey] : null;
    },
    getActivityPreset(key) {
      const normalizedKey = String(key || '');
      return hasOwn(ACTIVITY_BURN_PRESETS, normalizedKey) ? ACTIVITY_BURN_PRESETS[normalizedKey] : null;
    },
    versionInfo() {
      return {
        version: VERSION,
        snacks: Object.keys(snacks).length,
        meals: Object.keys(meals).length,
        foods: Object.keys(foods).length,
        activities: Object.keys(ACTIVITY_BURN_LIBRARY).length
      };
    }
  });

  global.VildaFoodData = api;
  global.vildaFoodData = api;
  global.vildaFoodDataVersion = function(){ return VERSION; };
})(typeof window !== 'undefined' ? window : globalThis);
