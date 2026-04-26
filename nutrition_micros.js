(function(window, document) {
  'use strict';

  const MICRONORMS_RESOURCE_CANDIDATES = {
    norms: ['/micronorms_norms.json', 'micronorms_norms.json', './micronorms_norms.json'],
    ul: ['/micronorms_ul.json', 'micronorms_ul.json', './micronorms_ul.json'],
    safeLevels: ['/micronorms_safe_levels.json', 'micronorms_safe_levels.json', './micronorms_safe_levels.json'],
    quicksets: ['/micronorms_quicksets.json', 'micronorms_quicksets.json', './micronorms_quicksets.json']
  };

  const MICRONORMS_EMBEDDED_FALLBACK = {"norms":{"source":{"title":"Normy żywienia dla populacji Polski","edition":2024,"tables":[23,24,25,26,27,28,29]},"records":[{"id":"calcium__all__default__6_11","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":260,"notes":[]},{"id":"calcium__all__default__12_47","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":500,"rda":700,"ai":null,"notes":[]},{"id":"calcium__all__default__48_83","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":800,"rda":1000,"ai":null,"notes":[]},{"id":"calcium__all__default__84_119","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":800,"rda":1000,"ai":null,"notes":[]},{"id":"calcium__female__default__120_155","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":1100,"rda":1300,"ai":null,"notes":[]},{"id":"calcium__female__default__156_191","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":1100,"rda":1300,"ai":null,"notes":[]},{"id":"calcium__female__default__192_227","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1100,"rda":1300,"ai":null,"notes":[]},{"id":"calcium__female__default__228_371","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":800,"rda":1000,"ai":null,"notes":[]},{"id":"calcium__female__default__372_611","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":800,"rda":1000,"ai":null,"notes":[]},{"id":"calcium__female__default__612_791","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":1000,"rda":1200,"ai":null,"notes":[]},{"id":"calcium__female__default__792_911","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":1000,"rda":1200,"ai":null,"notes":[]},{"id":"calcium__female__default__912_null","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":1000,"rda":1200,"ai":null,"notes":[]},{"id":"calcium__female__lactation__0_227","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1100,"rda":1300,"ai":null,"notes":[]},{"id":"calcium__female__lactation__228_null","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":800,"rda":1000,"ai":null,"notes":[]},{"id":"calcium__female__pregnancy__0_227","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1100,"rda":1300,"ai":null,"notes":[]},{"id":"calcium__female__pregnancy__228_null","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":800,"rda":1000,"ai":null,"notes":[]},{"id":"calcium__male__default__120_155","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":1100,"rda":1300,"ai":null,"notes":[]},{"id":"calcium__male__default__156_191","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":1100,"rda":1300,"ai":null,"notes":[]},{"id":"calcium__male__default__192_227","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1100,"rda":1300,"ai":null,"notes":[]},{"id":"calcium__male__default__228_371","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":800,"rda":1000,"ai":null,"notes":[]},{"id":"calcium__male__default__372_611","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":800,"rda":1000,"ai":null,"notes":[]},{"id":"calcium__male__default__612_791","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":800,"rda":1000,"ai":null,"notes":[]},{"id":"calcium__male__default__792_911","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":1000,"rda":1200,"ai":null,"notes":[]},{"id":"calcium__male__default__912_null","nutrient_id":"calcium","nutrient_label_pl":"Wapń","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":1000,"rda":1200,"ai":null,"notes":[]},{"id":"chloride__all__default__6_11","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":570,"notes":[]},{"id":"chloride__all__default__12_47","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1150,"notes":[]},{"id":"chloride__all__default__48_83","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1550,"notes":[]},{"id":"chloride__all__default__84_119","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1850,"notes":[]},{"id":"chloride__female__default__120_155","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2000,"notes":[]},{"id":"chloride__female__default__156_191","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__female__default__192_227","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__female__default__228_371","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__female__default__372_611","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__female__default__612_791","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__female__default__792_911","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__female__default__912_null","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__female__lactation__0_227","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__female__lactation__228_null","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__female__pregnancy__0_227","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__female__pregnancy__228_null","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__male__default__120_155","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2000,"notes":[]},{"id":"chloride__male__default__156_191","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__male__default__192_227","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__male__default__228_371","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__male__default__372_611","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__male__default__612_791","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__male__default__792_911","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"chloride__male__default__912_null","nutrient_id":"chloride","nutrient_label_pl":"Chlor","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2300,"notes":[]},{"id":"copper__all__default__6_11","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":0.3,"notes":[]},{"id":"copper__all__default__12_47","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":0.25,"rda":0.3,"ai":null,"notes":[]},{"id":"copper__all__default__48_83","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":0.3,"rda":0.4,"ai":null,"notes":[]},{"id":"copper__all__default__84_119","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":0.5,"rda":0.7,"ai":null,"notes":[]},{"id":"copper__female__default__120_155","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":0.5,"rda":0.7,"ai":null,"notes":[]},{"id":"copper__female__default__156_191","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"copper__female__default__192_227","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"copper__female__default__228_371","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"copper__female__default__372_611","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"copper__female__default__612_791","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"copper__female__default__792_911","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"copper__female__default__912_null","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"copper__female__lactation__0_227","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1,"rda":1.3,"ai":null,"notes":[]},{"id":"copper__female__lactation__228_null","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":1,"rda":1.3,"ai":null,"notes":[]},{"id":"copper__female__pregnancy__0_227","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":0.8,"rda":1,"ai":null,"notes":[]},{"id":"copper__female__pregnancy__228_null","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":0.8,"rda":1,"ai":null,"notes":[]},{"id":"copper__male__default__120_155","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":0.5,"rda":0.7,"ai":null,"notes":[]},{"id":"copper__male__default__156_191","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"copper__male__default__192_227","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"copper__male__default__228_371","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"copper__male__default__372_611","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"copper__male__default__612_791","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"copper__male__default__792_911","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"copper__male__default__912_null","nutrient_id":"copper","nutrient_label_pl":"Miedź","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"fluoride__all__default__6_11","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":0.5,"notes":[]},{"id":"fluoride__all__default__12_47","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":0.7,"notes":[]},{"id":"fluoride__all__default__48_83","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1,"notes":[]},{"id":"fluoride__all__default__84_119","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1.2,"notes":[]},{"id":"fluoride__female__default__120_155","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2,"notes":[]},{"id":"fluoride__female__default__156_191","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3,"notes":[]},{"id":"fluoride__female__default__192_227","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3,"notes":[]},{"id":"fluoride__female__default__228_371","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3,"notes":[]},{"id":"fluoride__female__default__372_611","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3,"notes":[]},{"id":"fluoride__female__default__612_791","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3,"notes":[]},{"id":"fluoride__female__default__792_911","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3,"notes":[]},{"id":"fluoride__female__default__912_null","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3,"notes":[]},{"id":"fluoride__female__lactation__0_227","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3,"notes":[]},{"id":"fluoride__female__lactation__228_null","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3,"notes":[]},{"id":"fluoride__female__pregnancy__0_227","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3,"notes":[]},{"id":"fluoride__female__pregnancy__228_null","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3,"notes":[]},{"id":"fluoride__male__default__120_155","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2,"notes":[]},{"id":"fluoride__male__default__156_191","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3,"notes":[]},{"id":"fluoride__male__default__192_227","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3,"notes":[]},{"id":"fluoride__male__default__228_371","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":4,"notes":[]},{"id":"fluoride__male__default__372_611","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":4,"notes":[]},{"id":"fluoride__male__default__612_791","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":4,"notes":[]},{"id":"fluoride__male__default__792_911","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":4,"notes":[]},{"id":"fluoride__male__default__912_null","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":4,"notes":[]},{"id":"iodine__all__default__6_11","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":70,"notes":[]},{"id":"iodine__all__default__12_47","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":65,"rda":90,"ai":null,"notes":[]},{"id":"iodine__all__default__48_83","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":65,"rda":90,"ai":null,"notes":[]},{"id":"iodine__all__default__84_119","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":70,"rda":100,"ai":null,"notes":[]},{"id":"iodine__female__default__120_155","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":75,"rda":120,"ai":null,"notes":[]},{"id":"iodine__female__default__156_191","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":95,"rda":150,"ai":null,"notes":[]},{"id":"iodine__female__default__192_227","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":95,"rda":150,"ai":null,"notes":[]},{"id":"iodine__female__default__228_371","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":95,"rda":150,"ai":null,"notes":[]},{"id":"iodine__female__default__372_611","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":95,"rda":150,"ai":null,"notes":[]},{"id":"iodine__female__default__612_791","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":95,"rda":150,"ai":null,"notes":[]},{"id":"iodine__female__default__792_911","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":95,"rda":150,"ai":null,"notes":[]},{"id":"iodine__female__default__912_null","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":95,"rda":150,"ai":null,"notes":[]},{"id":"iodine__female__lactation__0_227","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":210,"rda":290,"ai":null,"notes":[]},{"id":"iodine__female__lactation__228_null","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":210,"rda":290,"ai":null,"notes":[]},{"id":"iodine__female__pregnancy__0_227","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":160,"rda":220,"ai":null,"notes":[]},{"id":"iodine__female__pregnancy__228_null","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":160,"rda":220,"ai":null,"notes":[]},{"id":"iodine__male__default__120_155","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":75,"rda":120,"ai":null,"notes":[]},{"id":"iodine__male__default__156_191","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":95,"rda":150,"ai":null,"notes":[]},{"id":"iodine__male__default__192_227","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":95,"rda":150,"ai":null,"notes":[]},{"id":"iodine__male__default__228_371","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":95,"rda":150,"ai":null,"notes":[]},{"id":"iodine__male__default__372_611","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":95,"rda":150,"ai":null,"notes":[]},{"id":"iodine__male__default__612_791","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":95,"rda":150,"ai":null,"notes":[]},{"id":"iodine__male__default__792_911","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":95,"rda":150,"ai":null,"notes":[]},{"id":"iodine__male__default__912_null","nutrient_id":"iodine","nutrient_label_pl":"Jod","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":95,"rda":150,"ai":null,"notes":[]},{"id":"iron__all__default__6_11","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"RDA","ear":7,"rda":11,"ai":null,"notes":[]},{"id":"iron__all__default__12_47","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":3,"rda":7,"ai":null,"notes":[]},{"id":"iron__all__default__48_83","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":4,"rda":10,"ai":null,"notes":[]},{"id":"iron__all__default__84_119","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":4,"rda":10,"ai":null,"notes":[]},{"id":"iron__female__default__120_155__post_menarche","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":"post_menarche","norm_kind":"RDA","ear":8,"rda":15,"ai":null,"notes":["Po wystąpieniu miesiączki."]},{"id":"iron__female__default__120_155__pre_menarche","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":"pre_menarche","norm_kind":"RDA","ear":7,"rda":10,"ai":null,"notes":["Przed wystąpieniem miesiączki."]},{"id":"iron__female__default__156_191","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":8,"rda":15,"ai":null,"notes":[]},{"id":"iron__female__default__192_227","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":8,"rda":15,"ai":null,"notes":[]},{"id":"iron__female__default__228_371","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":8,"rda":18,"ai":null,"notes":[]},{"id":"iron__female__default__372_611","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":8,"rda":18,"ai":null,"notes":[]},{"id":"iron__female__default__612_791","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":6,"rda":10,"ai":null,"notes":[]},{"id":"iron__female__default__792_911","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":6,"rda":10,"ai":null,"notes":[]},{"id":"iron__female__default__912_null","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":6,"rda":10,"ai":null,"notes":[]},{"id":"iron__female__lactation__0_227","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":7,"rda":10,"ai":null,"notes":[]},{"id":"iron__female__lactation__228_null","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":7,"rda":10,"ai":null,"notes":[]},{"id":"iron__female__pregnancy__0_227","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":23,"rda":27,"ai":null,"notes":[]},{"id":"iron__female__pregnancy__228_null","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":23,"rda":27,"ai":null,"notes":[]},{"id":"iron__male__default__120_155","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":7,"rda":10,"ai":null,"notes":[]},{"id":"iron__male__default__156_191","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":8,"rda":12,"ai":null,"notes":[]},{"id":"iron__male__default__192_227","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":8,"rda":12,"ai":null,"notes":[]},{"id":"iron__male__default__228_371","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":6,"rda":10,"ai":null,"notes":[]},{"id":"iron__male__default__372_611","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":6,"rda":10,"ai":null,"notes":[]},{"id":"iron__male__default__612_791","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":6,"rda":10,"ai":null,"notes":[]},{"id":"iron__male__default__792_911","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":6,"rda":10,"ai":null,"notes":[]},{"id":"iron__male__default__912_null","nutrient_id":"iron","nutrient_label_pl":"Żelazo","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":6,"rda":10,"ai":null,"notes":[]},{"id":"magnesium__all__default__6_11","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":70,"notes":[]},{"id":"magnesium__all__default__12_47","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":65,"rda":80,"ai":null,"notes":[]},{"id":"magnesium__all__default__48_83","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":110,"rda":130,"ai":null,"notes":[]},{"id":"magnesium__all__default__84_119","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":110,"rda":130,"ai":null,"notes":[]},{"id":"magnesium__female__default__120_155","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":200,"rda":240,"ai":null,"notes":[]},{"id":"magnesium__female__default__156_191","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":300,"rda":360,"ai":null,"notes":[]},{"id":"magnesium__female__default__192_227","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":300,"rda":360,"ai":null,"notes":[]},{"id":"magnesium__female__default__228_371","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":255,"rda":310,"ai":null,"notes":[]},{"id":"magnesium__female__default__372_611","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":265,"rda":320,"ai":null,"notes":[]},{"id":"magnesium__female__default__612_791","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":265,"rda":320,"ai":null,"notes":[]},{"id":"magnesium__female__default__792_911","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":265,"rda":320,"ai":null,"notes":[]},{"id":"magnesium__female__default__912_null","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":265,"rda":320,"ai":null,"notes":[]},{"id":"magnesium__female__lactation__0_227","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":300,"rda":360,"ai":null,"notes":[]},{"id":"magnesium__female__lactation__228_null","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":265,"rda":320,"ai":null,"notes":[]},{"id":"magnesium__female__pregnancy__0_227","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":335,"rda":400,"ai":null,"notes":[]},{"id":"magnesium__female__pregnancy__228_null","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":300,"rda":360,"ai":null,"notes":[]},{"id":"magnesium__male__default__120_155","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":200,"rda":240,"ai":null,"notes":[]},{"id":"magnesium__male__default__156_191","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":340,"rda":410,"ai":null,"notes":[]},{"id":"magnesium__male__default__192_227","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":340,"rda":410,"ai":null,"notes":[]},{"id":"magnesium__male__default__228_371","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":330,"rda":400,"ai":null,"notes":[]},{"id":"magnesium__male__default__372_611","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":350,"rda":420,"ai":null,"notes":[]},{"id":"magnesium__male__default__612_791","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":350,"rda":420,"ai":null,"notes":[]},{"id":"magnesium__male__default__792_911","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":350,"rda":420,"ai":null,"notes":[]},{"id":"magnesium__male__default__912_null","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":350,"rda":420,"ai":null,"notes":[]},{"id":"manganese__all__default__6_11","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":0.6,"notes":[]},{"id":"manganese__all__default__12_47","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1.2,"notes":[]},{"id":"manganese__all__default__48_83","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1.5,"notes":[]},{"id":"manganese__all__default__84_119","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1.5,"notes":[]},{"id":"manganese__female__default__120_155","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1.6,"notes":[]},{"id":"manganese__female__default__156_191","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1.6,"notes":[]},{"id":"manganese__female__default__192_227","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1.6,"notes":[]},{"id":"manganese__female__default__228_371","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1.8,"notes":[]},{"id":"manganese__female__default__372_611","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1.8,"notes":[]},{"id":"manganese__female__default__612_791","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1.8,"notes":[]},{"id":"manganese__female__default__792_911","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1.8,"notes":[]},{"id":"manganese__female__default__912_null","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1.8,"notes":[]},{"id":"manganese__female__lactation__0_227","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2.6,"notes":[]},{"id":"manganese__female__lactation__228_null","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2.6,"notes":[]},{"id":"manganese__female__pregnancy__0_227","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2,"notes":[]},{"id":"manganese__female__pregnancy__228_null","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2,"notes":[]},{"id":"manganese__male__default__120_155","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1.9,"notes":[]},{"id":"manganese__male__default__156_191","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2.2,"notes":[]},{"id":"manganese__male__default__192_227","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2.2,"notes":[]},{"id":"manganese__male__default__228_371","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2.3,"notes":[]},{"id":"manganese__male__default__372_611","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2.3,"notes":[]},{"id":"manganese__male__default__612_791","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2.3,"notes":[]},{"id":"manganese__male__default__792_911","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2.3,"notes":[]},{"id":"manganese__male__default__912_null","nutrient_id":"manganese","nutrient_label_pl":"Mangan","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2.3,"notes":[]},{"id":"molybdenum__all__default__6_11","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":10,"notes":[]},{"id":"molybdenum__all__default__12_47","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"molybdenum__all__default__48_83","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":20,"notes":[]},{"id":"molybdenum__all__default__84_119","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":30,"notes":[]},{"id":"molybdenum__female__default__120_155","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":45,"notes":[]},{"id":"molybdenum__female__default__156_191","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":50,"notes":[]},{"id":"molybdenum__female__default__192_227","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":60,"notes":[]},{"id":"molybdenum__female__default__228_371","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"molybdenum__female__default__372_611","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"molybdenum__female__default__612_791","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"molybdenum__female__default__792_911","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"molybdenum__female__default__912_null","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"molybdenum__female__lactation__0_227","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"molybdenum__female__lactation__228_null","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"molybdenum__female__pregnancy__0_227","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"molybdenum__female__pregnancy__228_null","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"molybdenum__male__default__120_155","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":45,"notes":[]},{"id":"molybdenum__male__default__156_191","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":50,"notes":[]},{"id":"molybdenum__male__default__192_227","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":60,"notes":[]},{"id":"molybdenum__male__default__228_371","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"molybdenum__male__default__372_611","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"molybdenum__male__default__612_791","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"molybdenum__male__default__792_911","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"molybdenum__male__default__912_null","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","category":"mineral","table":29,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"phosphorus__all__default__6_11","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":300,"notes":[]},{"id":"phosphorus__all__default__12_47","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":380,"rda":460,"ai":null,"notes":[]},{"id":"phosphorus__all__default__48_83","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":410,"rda":500,"ai":null,"notes":[]},{"id":"phosphorus__all__default__84_119","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":500,"rda":600,"ai":null,"notes":[]},{"id":"phosphorus__female__default__120_155","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":1050,"rda":1250,"ai":null,"notes":[]},{"id":"phosphorus__female__default__156_191","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":1050,"rda":1250,"ai":null,"notes":[]},{"id":"phosphorus__female__default__192_227","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1050,"rda":1250,"ai":null,"notes":[]},{"id":"phosphorus__female__default__228_371","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":580,"rda":700,"ai":null,"notes":[]},{"id":"phosphorus__female__default__372_611","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":580,"rda":700,"ai":null,"notes":[]},{"id":"phosphorus__female__default__612_791","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":580,"rda":700,"ai":null,"notes":[]},{"id":"phosphorus__female__default__792_911","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":580,"rda":700,"ai":null,"notes":[]},{"id":"phosphorus__female__default__912_null","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":580,"rda":700,"ai":null,"notes":[]},{"id":"phosphorus__female__lactation__0_227","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1050,"rda":1250,"ai":null,"notes":[]},{"id":"phosphorus__female__lactation__228_null","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":580,"rda":700,"ai":null,"notes":[]},{"id":"phosphorus__female__pregnancy__0_227","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1050,"rda":1250,"ai":null,"notes":[]},{"id":"phosphorus__female__pregnancy__228_null","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":580,"rda":700,"ai":null,"notes":[]},{"id":"phosphorus__male__default__120_155","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":1050,"rda":1250,"ai":null,"notes":[]},{"id":"phosphorus__male__default__156_191","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":1050,"rda":1250,"ai":null,"notes":[]},{"id":"phosphorus__male__default__192_227","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1050,"rda":1250,"ai":null,"notes":[]},{"id":"phosphorus__male__default__228_371","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":580,"rda":700,"ai":null,"notes":[]},{"id":"phosphorus__male__default__372_611","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":580,"rda":700,"ai":null,"notes":[]},{"id":"phosphorus__male__default__612_791","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":580,"rda":700,"ai":null,"notes":[]},{"id":"phosphorus__male__default__792_911","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":580,"rda":700,"ai":null,"notes":[]},{"id":"phosphorus__male__default__912_null","nutrient_id":"phosphorus","nutrient_label_pl":"Fosfor","category":"mineral","table":27,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":580,"rda":700,"ai":null,"notes":[]},{"id":"potassium__all__default__6_11","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":750,"notes":[]},{"id":"potassium__all__default__12_47","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":800,"notes":[]},{"id":"potassium__all__default__48_83","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1100,"notes":[]},{"id":"potassium__all__default__84_119","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1800,"notes":[]},{"id":"potassium__female__default__120_155","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2400,"notes":[]},{"id":"potassium__female__default__156_191","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3000,"notes":[]},{"id":"potassium__female__default__192_227","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3500,"notes":[]},{"id":"potassium__female__default__228_371","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3500,"notes":[]},{"id":"potassium__female__default__372_611","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3500,"notes":[]},{"id":"potassium__female__default__612_791","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3500,"notes":[]},{"id":"potassium__female__default__792_911","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3500,"notes":[]},{"id":"potassium__female__default__912_null","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3500,"notes":[]},{"id":"potassium__female__lactation__0_227","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":4000,"notes":[]},{"id":"potassium__female__lactation__228_null","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":4000,"notes":[]},{"id":"potassium__female__pregnancy__0_227","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3500,"notes":[]},{"id":"potassium__female__pregnancy__228_null","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3500,"notes":[]},{"id":"potassium__male__default__120_155","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":2400,"notes":[]},{"id":"potassium__male__default__156_191","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3000,"notes":[]},{"id":"potassium__male__default__192_227","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3500,"notes":[]},{"id":"potassium__male__default__228_371","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3500,"notes":[]},{"id":"potassium__male__default__372_611","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3500,"notes":[]},{"id":"potassium__male__default__612_791","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3500,"notes":[]},{"id":"potassium__male__default__792_911","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3500,"notes":[]},{"id":"potassium__male__default__912_null","nutrient_id":"potassium","nutrient_label_pl":"Potas","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3500,"notes":[]},{"id":"selenium__all__default__6_11","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":20,"notes":[]},{"id":"selenium__all__default__12_47","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":17,"rda":20,"ai":null,"notes":[]},{"id":"selenium__all__default__48_83","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":23,"rda":30,"ai":null,"notes":[]},{"id":"selenium__all__default__84_119","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":23,"rda":30,"ai":null,"notes":[]},{"id":"selenium__female__default__120_155","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":35,"rda":40,"ai":null,"notes":[]},{"id":"selenium__female__default__156_191","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":45,"rda":55,"ai":null,"notes":[]},{"id":"selenium__female__default__192_227","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":45,"rda":55,"ai":null,"notes":[]},{"id":"selenium__female__default__228_371","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":45,"rda":55,"ai":null,"notes":[]},{"id":"selenium__female__default__372_611","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":45,"rda":55,"ai":null,"notes":[]},{"id":"selenium__female__default__612_791","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":45,"rda":55,"ai":null,"notes":[]},{"id":"selenium__female__default__792_911","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":45,"rda":55,"ai":null,"notes":[]},{"id":"selenium__female__default__912_null","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":45,"rda":55,"ai":null,"notes":[]},{"id":"selenium__female__lactation__0_227","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":60,"rda":70,"ai":null,"notes":[]},{"id":"selenium__female__lactation__228_null","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":60,"rda":70,"ai":null,"notes":[]},{"id":"selenium__female__pregnancy__0_227","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":50,"rda":60,"ai":null,"notes":[]},{"id":"selenium__female__pregnancy__228_null","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":50,"rda":60,"ai":null,"notes":[]},{"id":"selenium__male__default__120_155","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":35,"rda":40,"ai":null,"notes":[]},{"id":"selenium__male__default__156_191","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":45,"rda":55,"ai":null,"notes":[]},{"id":"selenium__male__default__192_227","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":45,"rda":55,"ai":null,"notes":[]},{"id":"selenium__male__default__228_371","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":45,"rda":55,"ai":null,"notes":[]},{"id":"selenium__male__default__372_611","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":45,"rda":55,"ai":null,"notes":[]},{"id":"selenium__male__default__612_791","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":45,"rda":55,"ai":null,"notes":[]},{"id":"selenium__male__default__792_911","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":45,"rda":55,"ai":null,"notes":[]},{"id":"selenium__male__default__912_null","nutrient_id":"selenium","nutrient_label_pl":"Selen","category":"mineral","table":28,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":45,"rda":55,"ai":null,"notes":[]},{"id":"sodium__all__default__6_11","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":370,"notes":[]},{"id":"sodium__all__default__12_47","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":750,"notes":[]},{"id":"sodium__all__default__48_83","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1000,"notes":[]},{"id":"sodium__all__default__84_119","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1200,"notes":[]},{"id":"sodium__female__default__120_155","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1300,"notes":[]},{"id":"sodium__female__default__156_191","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__female__default__192_227","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__female__default__228_371","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__female__default__372_611","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__female__default__612_791","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__female__default__792_911","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__female__default__912_null","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__female__lactation__0_227","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__female__lactation__228_null","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__female__pregnancy__0_227","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__female__pregnancy__228_null","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__male__default__120_155","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1300,"notes":[]},{"id":"sodium__male__default__156_191","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__male__default__192_227","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__male__default__228_371","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__male__default__372_611","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__male__default__612_791","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__male__default__792_911","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"sodium__male__default__912_null","nutrient_id":"sodium","nutrient_label_pl":"Sód","category":"mineral","table":29,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":1500,"notes":[]},{"id":"zinc__all__default__6_11","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"RDA","ear":2.5,"rda":3,"ai":null,"notes":[]},{"id":"zinc__all__default__12_47","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":2.5,"rda":3,"ai":null,"notes":[]},{"id":"zinc__all__default__48_83","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":4,"rda":5,"ai":null,"notes":[]},{"id":"zinc__all__default__84_119","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":4,"rda":5,"ai":null,"notes":[]},{"id":"zinc__female__default__120_155","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":7,"rda":8,"ai":null,"notes":[]},{"id":"zinc__female__default__156_191","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":7.3,"rda":9,"ai":null,"notes":[]},{"id":"zinc__female__default__192_227","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":7.3,"rda":9,"ai":null,"notes":[]},{"id":"zinc__female__default__228_371","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":6.8,"rda":8,"ai":null,"notes":[]},{"id":"zinc__female__default__372_611","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":6.8,"rda":8,"ai":null,"notes":[]},{"id":"zinc__female__default__612_791","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":6.8,"rda":8,"ai":null,"notes":[]},{"id":"zinc__female__default__792_911","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":6.8,"rda":8,"ai":null,"notes":[]},{"id":"zinc__female__default__912_null","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":6.8,"rda":8,"ai":null,"notes":[]},{"id":"zinc__female__lactation__0_227","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":10.9,"rda":13,"ai":null,"notes":[]},{"id":"zinc__female__lactation__228_null","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":10.4,"rda":12,"ai":null,"notes":[]},{"id":"zinc__female__pregnancy__0_227","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":10.5,"rda":12,"ai":null,"notes":[]},{"id":"zinc__female__pregnancy__228_null","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":9.5,"rda":11,"ai":null,"notes":[]},{"id":"zinc__male__default__120_155","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":7,"rda":8,"ai":null,"notes":[]},{"id":"zinc__male__default__156_191","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":8.5,"rda":11,"ai":null,"notes":[]},{"id":"zinc__male__default__192_227","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":8.5,"rda":11,"ai":null,"notes":[]},{"id":"zinc__male__default__228_371","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":9.4,"rda":11,"ai":null,"notes":[]},{"id":"zinc__male__default__372_611","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":9.4,"rda":11,"ai":null,"notes":[]},{"id":"zinc__male__default__612_791","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":9.4,"rda":11,"ai":null,"notes":[]},{"id":"zinc__male__default__792_911","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":9.4,"rda":11,"ai":null,"notes":[]},{"id":"zinc__male__default__912_null","nutrient_id":"zinc","nutrient_label_pl":"Cynk","category":"mineral","table":28,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":9.4,"rda":11,"ai":null,"notes":[]},{"id":"biotin__all__default__6_11","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":6,"notes":[]},{"id":"biotin__all__default__12_47","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":20,"notes":[]},{"id":"biotin__all__default__48_83","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":25,"notes":[]},{"id":"biotin__all__default__84_119","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":25,"notes":[]},{"id":"biotin__female__default__120_155","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":35,"notes":[]},{"id":"biotin__female__default__156_191","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":35,"notes":[]},{"id":"biotin__female__default__192_227","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":35,"notes":[]},{"id":"biotin__female__default__228_371","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":40,"notes":[]},{"id":"biotin__female__default__372_611","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":40,"notes":[]},{"id":"biotin__female__default__612_791","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":40,"notes":[]},{"id":"biotin__female__default__792_911","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":40,"notes":[]},{"id":"biotin__female__default__912_null","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":40,"notes":[]},{"id":"biotin__female__lactation__0_227","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":45,"notes":[]},{"id":"biotin__female__lactation__228_null","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":45,"notes":[]},{"id":"biotin__female__pregnancy__0_227","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":40,"notes":[]},{"id":"biotin__female__pregnancy__228_null","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":40,"notes":[]},{"id":"biotin__male__default__120_155","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":35,"notes":[]},{"id":"biotin__male__default__156_191","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":35,"notes":[]},{"id":"biotin__male__default__192_227","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":35,"notes":[]},{"id":"biotin__male__default__228_371","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":40,"notes":[]},{"id":"biotin__male__default__372_611","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":40,"notes":[]},{"id":"biotin__male__default__612_791","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":40,"notes":[]},{"id":"biotin__male__default__792_911","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":40,"notes":[]},{"id":"biotin__male__default__912_null","nutrient_id":"biotin","nutrient_label_pl":"Biotyna","category":"vitamin","table":25,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":40,"notes":[]},{"id":"choline__all__default__6_11","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":150,"notes":[]},{"id":"choline__all__default__12_47","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":200,"notes":[]},{"id":"choline__all__default__48_83","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":250,"notes":[]},{"id":"choline__all__default__84_119","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":250,"notes":[]},{"id":"choline__female__default__120_155","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":375,"notes":[]},{"id":"choline__female__default__156_191","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":400,"notes":[]},{"id":"choline__female__default__192_227","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":400,"notes":[]},{"id":"choline__female__default__228_371","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":425,"notes":[]},{"id":"choline__female__default__372_611","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":425,"notes":[]},{"id":"choline__female__default__612_791","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":425,"notes":[]},{"id":"choline__female__default__792_911","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":425,"notes":[]},{"id":"choline__female__default__912_null","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":425,"notes":[]},{"id":"choline__female__lactation__0_227","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":550,"notes":[]},{"id":"choline__female__lactation__228_null","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":550,"notes":[]},{"id":"choline__female__pregnancy__0_227","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":450,"notes":[]},{"id":"choline__female__pregnancy__228_null","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":450,"notes":[]},{"id":"choline__male__default__120_155","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":375,"notes":[]},{"id":"choline__male__default__156_191","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":550,"notes":[]},{"id":"choline__male__default__192_227","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":550,"notes":[]},{"id":"choline__male__default__228_371","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":550,"notes":[]},{"id":"choline__male__default__372_611","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":550,"notes":[]},{"id":"choline__male__default__612_791","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":550,"notes":[]},{"id":"choline__male__default__792_911","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":550,"notes":[]},{"id":"choline__male__default__912_null","nutrient_id":"choline","nutrient_label_pl":"Cholina","category":"vitamin","table":26,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":550,"notes":[]},{"id":"folate__all__default__6_11","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":80,"notes":[]},{"id":"folate__all__default__12_47","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":120,"rda":150,"ai":null,"notes":[]},{"id":"folate__all__default__48_83","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":160,"rda":200,"ai":null,"notes":[]},{"id":"folate__all__default__84_119","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":250,"rda":300,"ai":null,"notes":[]},{"id":"folate__female__default__120_155","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":250,"rda":300,"ai":null,"notes":[]},{"id":"folate__female__default__156_191","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":330,"rda":400,"ai":null,"notes":[]},{"id":"folate__female__default__192_227","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":330,"rda":400,"ai":null,"notes":[]},{"id":"folate__female__default__228_371","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":320,"rda":400,"ai":null,"notes":[]},{"id":"folate__female__default__372_611","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":320,"rda":400,"ai":null,"notes":[]},{"id":"folate__female__default__612_791","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":320,"rda":400,"ai":null,"notes":[]},{"id":"folate__female__default__792_911","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":320,"rda":400,"ai":null,"notes":[]},{"id":"folate__female__default__912_null","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":320,"rda":400,"ai":null,"notes":[]},{"id":"folate__female__lactation__0_227","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":450,"rda":500,"ai":null,"notes":[]},{"id":"folate__female__lactation__228_null","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":450,"rda":500,"ai":null,"notes":[]},{"id":"folate__female__pregnancy__0_227","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":520,"rda":600,"ai":null,"notes":[]},{"id":"folate__female__pregnancy__228_null","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":520,"rda":600,"ai":null,"notes":[]},{"id":"folate__male__default__120_155","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":250,"rda":300,"ai":null,"notes":[]},{"id":"folate__male__default__156_191","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":330,"rda":400,"ai":null,"notes":[]},{"id":"folate__male__default__192_227","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":330,"rda":400,"ai":null,"notes":[]},{"id":"folate__male__default__228_371","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":320,"rda":400,"ai":null,"notes":[]},{"id":"folate__male__default__372_611","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":320,"rda":400,"ai":null,"notes":[]},{"id":"folate__male__default__612_791","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":320,"rda":400,"ai":null,"notes":[]},{"id":"folate__male__default__792_911","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":320,"rda":400,"ai":null,"notes":[]},{"id":"folate__male__default__912_null","nutrient_id":"folate","nutrient_label_pl":"Foliany","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":320,"rda":400,"ai":null,"notes":[]},{"id":"niacin__all__default__6_11","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"niacin__all__default__12_47","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":5,"rda":6,"ai":null,"notes":[]},{"id":"niacin__all__default__48_83","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":6,"rda":8,"ai":null,"notes":[]},{"id":"niacin__all__default__84_119","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":9,"rda":12,"ai":null,"notes":[]},{"id":"niacin__female__default__120_155","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":9,"rda":12,"ai":null,"notes":[]},{"id":"niacin__female__default__156_191","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":11,"rda":14,"ai":null,"notes":[]},{"id":"niacin__female__default__192_227","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":11,"rda":14,"ai":null,"notes":[]},{"id":"niacin__female__default__228_371","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":11,"rda":14,"ai":null,"notes":[]},{"id":"niacin__female__default__372_611","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":11,"rda":14,"ai":null,"notes":[]},{"id":"niacin__female__default__612_791","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":11,"rda":14,"ai":null,"notes":[]},{"id":"niacin__female__default__792_911","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":11,"rda":14,"ai":null,"notes":[]},{"id":"niacin__female__default__912_null","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":11,"rda":14,"ai":null,"notes":[]},{"id":"niacin__female__lactation__0_227","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":13,"rda":17,"ai":null,"notes":[]},{"id":"niacin__female__lactation__228_null","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":13,"rda":17,"ai":null,"notes":[]},{"id":"niacin__female__pregnancy__0_227","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":14,"rda":18,"ai":null,"notes":[]},{"id":"niacin__female__pregnancy__228_null","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":14,"rda":18,"ai":null,"notes":[]},{"id":"niacin__male__default__120_155","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":9,"rda":12,"ai":null,"notes":[]},{"id":"niacin__male__default__156_191","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":12,"rda":16,"ai":null,"notes":[]},{"id":"niacin__male__default__192_227","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":12,"rda":16,"ai":null,"notes":[]},{"id":"niacin__male__default__228_371","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":12,"rda":16,"ai":null,"notes":[]},{"id":"niacin__male__default__372_611","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":12,"rda":16,"ai":null,"notes":[]},{"id":"niacin__male__default__612_791","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":12,"rda":16,"ai":null,"notes":[]},{"id":"niacin__male__default__792_911","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":12,"rda":16,"ai":null,"notes":[]},{"id":"niacin__male__default__912_null","nutrient_id":"niacin","nutrient_label_pl":"Niacyna","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":12,"rda":16,"ai":null,"notes":[]},{"id":"pantothenic_acid__all__default__6_11","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":3,"notes":[]},{"id":"pantothenic_acid__all__default__12_47","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":4,"notes":[]},{"id":"pantothenic_acid__all__default__48_83","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":4,"notes":[]},{"id":"pantothenic_acid__all__default__84_119","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":4,"notes":[]},{"id":"pantothenic_acid__female__default__120_155","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":4,"notes":[]},{"id":"pantothenic_acid__female__default__156_191","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"pantothenic_acid__female__default__192_227","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"pantothenic_acid__female__default__228_371","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"pantothenic_acid__female__default__372_611","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"pantothenic_acid__female__default__612_791","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"pantothenic_acid__female__default__792_911","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"pantothenic_acid__female__default__912_null","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"pantothenic_acid__female__lactation__0_227","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":7,"notes":[]},{"id":"pantothenic_acid__female__lactation__228_null","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":7,"notes":[]},{"id":"pantothenic_acid__female__pregnancy__0_227","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":6,"notes":[]},{"id":"pantothenic_acid__female__pregnancy__228_null","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":6,"notes":[]},{"id":"pantothenic_acid__male__default__120_155","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":4,"notes":[]},{"id":"pantothenic_acid__male__default__156_191","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"pantothenic_acid__male__default__192_227","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"pantothenic_acid__male__default__228_371","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"pantothenic_acid__male__default__372_611","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"pantothenic_acid__male__default__612_791","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"pantothenic_acid__male__default__792_911","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"pantothenic_acid__male__default__912_null","nutrient_id":"pantothenic_acid","nutrient_label_pl":"Kwas pantotenowy","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"riboflavin__all__default__6_11","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":0.4,"notes":[]},{"id":"riboflavin__all__default__12_47","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":0.4,"rda":0.5,"ai":null,"notes":[]},{"id":"riboflavin__all__default__48_83","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":0.5,"rda":0.6,"ai":null,"notes":[]},{"id":"riboflavin__all__default__84_119","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":0.8,"rda":0.9,"ai":null,"notes":[]},{"id":"riboflavin__female__default__120_155","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":0.8,"rda":1,"ai":null,"notes":[]},{"id":"riboflavin__female__default__156_191","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1.1,"ai":null,"notes":[]},{"id":"riboflavin__female__default__192_227","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1.1,"ai":null,"notes":[]},{"id":"riboflavin__female__default__228_371","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1.1,"ai":null,"notes":[]},{"id":"riboflavin__female__default__372_611","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1.1,"ai":null,"notes":[]},{"id":"riboflavin__female__default__612_791","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1.1,"ai":null,"notes":[]},{"id":"riboflavin__female__default__792_911","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1.1,"ai":null,"notes":[]},{"id":"riboflavin__female__default__912_null","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1.1,"ai":null,"notes":[]},{"id":"riboflavin__female__lactation__0_227","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1.3,"rda":1.6,"ai":null,"notes":[]},{"id":"riboflavin__female__lactation__228_null","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":1.3,"rda":1.6,"ai":null,"notes":[]},{"id":"riboflavin__female__pregnancy__0_227","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1.2,"rda":1.4,"ai":null,"notes":[]},{"id":"riboflavin__female__pregnancy__228_null","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":1.2,"rda":1.4,"ai":null,"notes":[]},{"id":"riboflavin__male__default__120_155","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1,"ai":null,"notes":[]},{"id":"riboflavin__male__default__156_191","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"riboflavin__male__default__192_227","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"riboflavin__male__default__228_371","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"riboflavin__male__default__372_611","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"riboflavin__male__default__612_791","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"riboflavin__male__default__792_911","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"riboflavin__male__default__912_null","nutrient_id":"riboflavin","nutrient_label_pl":"Ryboflawina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"thiamine__all__default__6_11","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":0.3,"notes":[]},{"id":"thiamine__all__default__12_47","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":0.4,"rda":0.5,"ai":null,"notes":[]},{"id":"thiamine__all__default__48_83","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":0.5,"rda":0.6,"ai":null,"notes":[]},{"id":"thiamine__all__default__84_119","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.9,"ai":null,"notes":[]},{"id":"thiamine__female__default__120_155","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":0.8,"rda":1,"ai":null,"notes":[]},{"id":"thiamine__female__default__156_191","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1.1,"ai":null,"notes":[]},{"id":"thiamine__female__default__192_227","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1.1,"ai":null,"notes":[]},{"id":"thiamine__female__default__228_371","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1.1,"ai":null,"notes":[]},{"id":"thiamine__female__default__372_611","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1.1,"ai":null,"notes":[]},{"id":"thiamine__female__default__612_791","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1.1,"ai":null,"notes":[]},{"id":"thiamine__female__default__792_911","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1.1,"ai":null,"notes":[]},{"id":"thiamine__female__default__912_null","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1.1,"ai":null,"notes":[]},{"id":"thiamine__female__lactation__0_227","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1.3,"rda":1.5,"ai":null,"notes":[]},{"id":"thiamine__female__lactation__228_null","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":1.3,"rda":1.5,"ai":null,"notes":[]},{"id":"thiamine__female__pregnancy__0_227","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1.2,"rda":1.4,"ai":null,"notes":[]},{"id":"thiamine__female__pregnancy__228_null","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":1.2,"rda":1.4,"ai":null,"notes":[]},{"id":"thiamine__male__default__120_155","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":0.9,"rda":1,"ai":null,"notes":[]},{"id":"thiamine__male__default__156_191","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":1,"rda":1.2,"ai":null,"notes":[]},{"id":"thiamine__male__default__192_227","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1,"rda":1.2,"ai":null,"notes":[]},{"id":"thiamine__male__default__228_371","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"thiamine__male__default__372_611","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"thiamine__male__default__612_791","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"thiamine__male__default__792_911","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"thiamine__male__default__912_null","nutrient_id":"thiamine","nutrient_label_pl":"Tiamina","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"vitamin_a__all__default__6_11","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":350,"notes":[]},{"id":"vitamin_a__all__default__12_47","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":280,"rda":400,"ai":null,"notes":[]},{"id":"vitamin_a__all__default__48_83","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":300,"rda":450,"ai":null,"notes":[]},{"id":"vitamin_a__all__default__84_119","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":350,"rda":500,"ai":null,"notes":[]},{"id":"vitamin_a__female__default__120_155","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":430,"rda":600,"ai":null,"notes":[]},{"id":"vitamin_a__female__default__156_191","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":490,"rda":700,"ai":null,"notes":[]},{"id":"vitamin_a__female__default__192_227","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":490,"rda":700,"ai":null,"notes":[]},{"id":"vitamin_a__female__default__228_371","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":500,"rda":700,"ai":null,"notes":[]},{"id":"vitamin_a__female__default__372_611","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":500,"rda":700,"ai":null,"notes":[]},{"id":"vitamin_a__female__default__612_791","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":500,"rda":700,"ai":null,"notes":[]},{"id":"vitamin_a__female__default__792_911","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":500,"rda":700,"ai":null,"notes":[]},{"id":"vitamin_a__female__default__912_null","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":500,"rda":700,"ai":null,"notes":[]},{"id":"vitamin_a__female__lactation__0_227","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":880,"rda":1200,"ai":null,"notes":[]},{"id":"vitamin_a__female__lactation__228_null","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":900,"rda":1300,"ai":null,"notes":[]},{"id":"vitamin_a__female__pregnancy__0_227","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":530,"rda":750,"ai":null,"notes":[]},{"id":"vitamin_a__female__pregnancy__228_null","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":530,"rda":770,"ai":null,"notes":[]},{"id":"vitamin_a__male__default__120_155","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":450,"rda":600,"ai":null,"notes":[]},{"id":"vitamin_a__male__default__156_191","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":630,"rda":900,"ai":null,"notes":[]},{"id":"vitamin_a__male__default__192_227","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":630,"rda":900,"ai":null,"notes":[]},{"id":"vitamin_a__male__default__228_371","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":630,"rda":900,"ai":null,"notes":[]},{"id":"vitamin_a__male__default__372_611","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":630,"rda":900,"ai":null,"notes":[]},{"id":"vitamin_a__male__default__612_791","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":630,"rda":900,"ai":null,"notes":[]},{"id":"vitamin_a__male__default__792_911","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":630,"rda":900,"ai":null,"notes":[]},{"id":"vitamin_a__male__default__912_null","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":630,"rda":900,"ai":null,"notes":[]},{"id":"vitamin_b12__all__default__6_11","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":0.5,"notes":[]},{"id":"vitamin_b12__all__default__12_47","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":0.7,"rda":0.8,"ai":null,"notes":[]},{"id":"vitamin_b12__all__default__48_83","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":1,"rda":1.2,"ai":null,"notes":[]},{"id":"vitamin_b12__all__default__84_119","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":1.5,"rda":1.8,"ai":null,"notes":[]},{"id":"vitamin_b12__female__default__120_155","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":1.5,"rda":1.8,"ai":null,"notes":[]},{"id":"vitamin_b12__female__default__156_191","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":2,"rda":2.4,"ai":null,"notes":[]},{"id":"vitamin_b12__female__default__192_227","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":2,"rda":2.4,"ai":null,"notes":[]},{"id":"vitamin_b12__female__default__228_371","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":2,"rda":2.4,"ai":null,"notes":[]},{"id":"vitamin_b12__female__default__372_611","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":2,"rda":2.4,"ai":null,"notes":[]},{"id":"vitamin_b12__female__default__612_791","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":2,"rda":2.4,"ai":null,"notes":[]},{"id":"vitamin_b12__female__default__792_911","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":2,"rda":2.4,"ai":null,"notes":[]},{"id":"vitamin_b12__female__default__912_null","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":2,"rda":2.4,"ai":null,"notes":[]},{"id":"vitamin_b12__female__lactation__0_227","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":2.4,"rda":2.8,"ai":null,"notes":[]},{"id":"vitamin_b12__female__lactation__228_null","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":2.4,"rda":2.8,"ai":null,"notes":[]},{"id":"vitamin_b12__female__pregnancy__0_227","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":2.2,"rda":2.6,"ai":null,"notes":[]},{"id":"vitamin_b12__female__pregnancy__228_null","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":2.2,"rda":2.6,"ai":null,"notes":[]},{"id":"vitamin_b12__male__default__120_155","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":1.5,"rda":1.8,"ai":null,"notes":[]},{"id":"vitamin_b12__male__default__156_191","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":2,"rda":2.4,"ai":null,"notes":[]},{"id":"vitamin_b12__male__default__192_227","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":2,"rda":2.4,"ai":null,"notes":[]},{"id":"vitamin_b12__male__default__228_371","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":2,"rda":2.4,"ai":null,"notes":[]},{"id":"vitamin_b12__male__default__372_611","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":2,"rda":2.4,"ai":null,"notes":[]},{"id":"vitamin_b12__male__default__612_791","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":2,"rda":2.4,"ai":null,"notes":[]},{"id":"vitamin_b12__male__default__792_911","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":2,"rda":2.4,"ai":null,"notes":[]},{"id":"vitamin_b12__male__default__912_null","nutrient_id":"vitamin_b12","nutrient_label_pl":"Kobalamina (B12)","category":"vitamin","table":26,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":2,"rda":2.4,"ai":null,"notes":[]},{"id":"vitamin_b6__all__default__6_11","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":0.4,"notes":[]},{"id":"vitamin_b6__all__default__12_47","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":0.4,"rda":0.5,"ai":null,"notes":[]},{"id":"vitamin_b6__all__default__48_83","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":0.5,"rda":0.6,"ai":null,"notes":[]},{"id":"vitamin_b6__all__default__84_119","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":0.8,"rda":1,"ai":null,"notes":[]},{"id":"vitamin_b6__female__default__120_155","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":1,"rda":1.2,"ai":null,"notes":[]},{"id":"vitamin_b6__female__default__156_191","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":1,"rda":1.2,"ai":null,"notes":[]},{"id":"vitamin_b6__female__default__192_227","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1,"rda":1.2,"ai":null,"notes":[]},{"id":"vitamin_b6__female__default__228_371","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"vitamin_b6__female__default__372_611","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"vitamin_b6__female__default__612_791","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":1.3,"rda":1.5,"ai":null,"notes":[]},{"id":"vitamin_b6__female__default__792_911","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":1.3,"rda":1.5,"ai":null,"notes":[]},{"id":"vitamin_b6__female__default__912_null","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":1.3,"rda":1.5,"ai":null,"notes":[]},{"id":"vitamin_b6__female__lactation__0_227","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1.7,"rda":2,"ai":null,"notes":[]},{"id":"vitamin_b6__female__lactation__228_null","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":1.7,"rda":2,"ai":null,"notes":[]},{"id":"vitamin_b6__female__pregnancy__0_227","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1.6,"rda":1.9,"ai":null,"notes":[]},{"id":"vitamin_b6__female__pregnancy__228_null","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":1.6,"rda":1.9,"ai":null,"notes":[]},{"id":"vitamin_b6__male__default__120_155","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":1,"rda":1.2,"ai":null,"notes":[]},{"id":"vitamin_b6__male__default__156_191","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"vitamin_b6__male__default__192_227","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"vitamin_b6__male__default__228_371","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"vitamin_b6__male__default__372_611","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":1.1,"rda":1.3,"ai":null,"notes":[]},{"id":"vitamin_b6__male__default__612_791","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":1.4,"rda":1.7,"ai":null,"notes":[]},{"id":"vitamin_b6__male__default__792_911","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":1.4,"rda":1.7,"ai":null,"notes":[]},{"id":"vitamin_b6__male__default__912_null","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","category":"vitamin","table":25,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":1.4,"rda":1.7,"ai":null,"notes":[]},{"id":"vitamin_c__all__default__6_11","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":20,"notes":[]},{"id":"vitamin_c__all__default__12_47","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"RDA","ear":30,"rda":40,"ai":null,"notes":[]},{"id":"vitamin_c__all__default__48_83","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"RDA","ear":40,"rda":50,"ai":null,"notes":[]},{"id":"vitamin_c__all__default__84_119","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"RDA","ear":40,"rda":50,"ai":null,"notes":[]},{"id":"vitamin_c__female__default__120_155","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":40,"rda":50,"ai":null,"notes":[]},{"id":"vitamin_c__female__default__156_191","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":55,"rda":65,"ai":null,"notes":[]},{"id":"vitamin_c__female__default__192_227","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":55,"rda":65,"ai":null,"notes":[]},{"id":"vitamin_c__female__default__228_371","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":60,"rda":75,"ai":null,"notes":[]},{"id":"vitamin_c__female__default__372_611","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":60,"rda":75,"ai":null,"notes":[]},{"id":"vitamin_c__female__default__612_791","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":60,"rda":75,"ai":null,"notes":[]},{"id":"vitamin_c__female__default__792_911","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":60,"rda":75,"ai":null,"notes":[]},{"id":"vitamin_c__female__default__912_null","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":60,"rda":75,"ai":null,"notes":[]},{"id":"vitamin_c__female__lactation__0_227","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":95,"rda":115,"ai":null,"notes":[]},{"id":"vitamin_c__female__lactation__228_null","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":100,"rda":120,"ai":null,"notes":[]},{"id":"vitamin_c__female__pregnancy__0_227","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":65,"rda":80,"ai":null,"notes":[]},{"id":"vitamin_c__female__pregnancy__228_null","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":70,"rda":85,"ai":null,"notes":[]},{"id":"vitamin_c__male__default__120_155","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"RDA","ear":40,"rda":50,"ai":null,"notes":[]},{"id":"vitamin_c__male__default__156_191","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"RDA","ear":65,"rda":75,"ai":null,"notes":[]},{"id":"vitamin_c__male__default__192_227","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"RDA","ear":65,"rda":75,"ai":null,"notes":[]},{"id":"vitamin_c__male__default__228_371","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"RDA","ear":75,"rda":90,"ai":null,"notes":[]},{"id":"vitamin_c__male__default__372_611","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"RDA","ear":75,"rda":90,"ai":null,"notes":[]},{"id":"vitamin_c__male__default__612_791","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"RDA","ear":75,"rda":90,"ai":null,"notes":[]},{"id":"vitamin_c__male__default__792_911","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"RDA","ear":75,"rda":90,"ai":null,"notes":[]},{"id":"vitamin_c__male__default__912_null","nutrient_id":"vitamin_c","nutrient_label_pl":"Witamina C","category":"vitamin","table":24,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"RDA","ear":75,"rda":90,"ai":null,"notes":[]},{"id":"vitamin_d__all__default__6_11","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":10,"notes":[]},{"id":"vitamin_d__all__default__12_47","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__all__default__48_83","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__all__default__84_119","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__female__default__120_155","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__female__default__156_191","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__female__default__192_227","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__female__default__228_371","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__female__default__372_611","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__female__default__612_791","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__female__default__792_911","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__female__default__912_null","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__female__lactation__0_227","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__female__lactation__228_null","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__female__pregnancy__0_227","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__female__pregnancy__228_null","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__male__default__120_155","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__male__default__156_191","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__male__default__192_227","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__male__default__228_371","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__male__default__372_611","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__male__default__612_791","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__male__default__792_911","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_d__male__default__912_null","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_e__all__default__6_11","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":5,"notes":[]},{"id":"vitamin_e__all__default__12_47","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":6,"notes":[]},{"id":"vitamin_e__all__default__48_83","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":6,"notes":[]},{"id":"vitamin_e__all__default__84_119","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":7,"notes":[]},{"id":"vitamin_e__female__default__120_155","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":8,"notes":[]},{"id":"vitamin_e__female__default__156_191","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":8,"notes":[]},{"id":"vitamin_e__female__default__192_227","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":8,"notes":[]},{"id":"vitamin_e__female__default__228_371","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":8,"notes":[]},{"id":"vitamin_e__female__default__372_611","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":8,"notes":[]},{"id":"vitamin_e__female__default__612_791","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":8,"notes":[]},{"id":"vitamin_e__female__default__792_911","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":8,"notes":[]},{"id":"vitamin_e__female__default__912_null","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":8,"notes":[]},{"id":"vitamin_e__female__lactation__0_227","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":11,"notes":[]},{"id":"vitamin_e__female__lactation__228_null","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":11,"notes":[]},{"id":"vitamin_e__female__pregnancy__0_227","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":10,"notes":[]},{"id":"vitamin_e__female__pregnancy__228_null","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":10,"notes":[]},{"id":"vitamin_e__male__default__120_155","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":10,"notes":[]},{"id":"vitamin_e__male__default__156_191","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":10,"notes":[]},{"id":"vitamin_e__male__default__192_227","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":10,"notes":[]},{"id":"vitamin_e__male__default__228_371","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":10,"notes":[]},{"id":"vitamin_e__male__default__372_611","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":10,"notes":[]},{"id":"vitamin_e__male__default__612_791","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":10,"notes":[]},{"id":"vitamin_e__male__default__792_911","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":10,"notes":[]},{"id":"vitamin_e__male__default__912_null","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","category":"vitamin","table":23,"unit":"mg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":10,"notes":[]},{"id":"vitamin_k__all__default__6_11","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":6,"age_max_months":11,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":8.5,"notes":[]},{"id":"vitamin_k__all__default__12_47","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":15,"notes":[]},{"id":"vitamin_k__all__default__48_83","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":20,"notes":[]},{"id":"vitamin_k__all__default__84_119","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":119,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":25,"notes":[]},{"id":"vitamin_k__female__default__120_155","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":40,"notes":[]},{"id":"vitamin_k__female__default__156_191","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":50,"notes":[]},{"id":"vitamin_k__female__default__192_227","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":55,"notes":[]},{"id":"vitamin_k__female__default__228_371","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":55,"notes":[]},{"id":"vitamin_k__female__default__372_611","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":55,"notes":[]},{"id":"vitamin_k__female__default__612_791","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":55,"notes":[]},{"id":"vitamin_k__female__default__792_911","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":55,"notes":[]},{"id":"vitamin_k__female__default__912_null","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":55,"notes":[]},{"id":"vitamin_k__female__lactation__0_227","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":55,"notes":[]},{"id":"vitamin_k__female__lactation__228_null","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":55,"notes":[]},{"id":"vitamin_k__female__pregnancy__0_227","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":55,"notes":[]},{"id":"vitamin_k__female__pregnancy__228_null","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":228,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":55,"notes":[]},{"id":"vitamin_k__male__default__120_155","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":120,"age_max_months":155,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":40,"notes":[]},{"id":"vitamin_k__male__default__156_191","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":156,"age_max_months":191,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":50,"notes":[]},{"id":"vitamin_k__male__default__192_227","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":192,"age_max_months":227,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"vitamin_k__male__default__228_371","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":228,"age_max_months":371,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"vitamin_k__male__default__372_611","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":372,"age_max_months":611,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"vitamin_k__male__default__612_791","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":612,"age_max_months":791,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"vitamin_k__male__default__792_911","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":792,"age_max_months":911,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]},{"id":"vitamin_k__male__default__912_null","nutrient_id":"vitamin_k","nutrient_label_pl":"Witamina K","category":"vitamin","table":23,"unit":"µg/d","sex":"male","physiology":"default","age_min_months":912,"age_max_months":null,"variant":null,"norm_kind":"AI","ear":null,"rda":null,"ai":65,"notes":[]}]},"ul":{"source":{"title":"Normy żywienia dla populacji Polski","edition":2024,"tables":[30,31]},"records":[{"id":"calcium__ul__all__default__216_null","nutrient_id":"calcium","nutrient_label_pl":"Wapń","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":2500,"scope":"all_sources","notes":[]},{"id":"calcium__ul__female__lactation__0_null","nutrient_id":"calcium","nutrient_label_pl":"Wapń","safety_type":"UL","table":31,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":2500,"scope":"all_sources","notes":[]},{"id":"calcium__ul__female__pregnancy__0_null","nutrient_id":"calcium","nutrient_label_pl":"Wapń","safety_type":"UL","table":31,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":2500,"scope":"all_sources","notes":[]},{"id":"copper__ul__all__default__12_47","nutrient_id":"copper","nutrient_label_pl":"Miedź","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"value":1,"scope":"all_sources","notes":[]},{"id":"copper__ul__all__default__48_83","nutrient_id":"copper","nutrient_label_pl":"Miedź","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":2,"scope":"all_sources","notes":[]},{"id":"copper__ul__all__default__84_131","nutrient_id":"copper","nutrient_label_pl":"Miedź","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":3,"scope":"all_sources","notes":[]},{"id":"copper__ul__all__default__132_179","nutrient_id":"copper","nutrient_label_pl":"Miedź","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":4,"scope":"all_sources","notes":[]},{"id":"copper__ul__all__default__180_215","nutrient_id":"copper","nutrient_label_pl":"Miedź","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":4,"scope":"all_sources","notes":[]},{"id":"copper__ul__all__default__216_null","nutrient_id":"copper","nutrient_label_pl":"Miedź","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":5,"scope":"all_sources","notes":[]},{"id":"copper__ul__female__lactation__0_null","nutrient_id":"copper","nutrient_label_pl":"Miedź","safety_type":"UL","table":31,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":5,"scope":"all_sources","notes":[]},{"id":"copper__ul__female__pregnancy__0_null","nutrient_id":"copper","nutrient_label_pl":"Miedź","safety_type":"UL","table":31,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":5,"scope":"all_sources","notes":[]},{"id":"fluoride__ul__all__default__12_47","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"value":1.5,"scope":"all_sources","notes":[]},{"id":"fluoride__ul__all__default__48_83","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":2.5,"scope":"all_sources","notes":[]},{"id":"fluoride__ul__all__default__84_131","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":5,"scope":"all_sources","notes":[]},{"id":"fluoride__ul__all__default__132_179","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":7,"scope":"all_sources","notes":[]},{"id":"fluoride__ul__all__default__180_215","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":7,"scope":"all_sources","notes":[]},{"id":"fluoride__ul__all__default__216_null","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":7,"scope":"all_sources","notes":[]},{"id":"fluoride__ul__female__lactation__0_null","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","safety_type":"UL","table":31,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":7,"scope":"all_sources","notes":[]},{"id":"fluoride__ul__female__pregnancy__0_null","nutrient_id":"fluoride","nutrient_label_pl":"Fluor","safety_type":"UL","table":31,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":7,"scope":"all_sources","notes":[]},{"id":"folic_acid__ul__all__default__4_6","nutrient_id":"folic_acid","nutrient_label_pl":"Kwas foliowy","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":4,"age_max_months":6,"value":200,"scope":"all_sources","notes":[]},{"id":"folic_acid__ul__all__default__7_11","nutrient_id":"folic_acid","nutrient_label_pl":"Kwas foliowy","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":7,"age_max_months":11,"value":200,"scope":"all_sources","notes":[]},{"id":"folic_acid__ul__all__default__12_47","nutrient_id":"folic_acid","nutrient_label_pl":"Kwas foliowy","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"value":200,"scope":"all_sources","notes":[]},{"id":"folic_acid__ul__all__default__48_83","nutrient_id":"folic_acid","nutrient_label_pl":"Kwas foliowy","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":300,"scope":"all_sources","notes":[]},{"id":"folic_acid__ul__all__default__84_131","nutrient_id":"folic_acid","nutrient_label_pl":"Kwas foliowy","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":400,"scope":"all_sources","notes":[]},{"id":"folic_acid__ul__all__default__132_179","nutrient_id":"folic_acid","nutrient_label_pl":"Kwas foliowy","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":600,"scope":"all_sources","notes":[]},{"id":"folic_acid__ul__all__default__180_215","nutrient_id":"folic_acid","nutrient_label_pl":"Kwas foliowy","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":800,"scope":"all_sources","notes":[]},{"id":"folic_acid__ul__all__default__216_null","nutrient_id":"folic_acid","nutrient_label_pl":"Kwas foliowy","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":1000,"scope":"all_sources","notes":[]},{"id":"folic_acid__ul__female__lactation__0_null","nutrient_id":"folic_acid","nutrient_label_pl":"Kwas foliowy","safety_type":"UL","table":30,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":1000,"scope":"all_sources","notes":[]},{"id":"folic_acid__ul__female__pregnancy__0_null","nutrient_id":"folic_acid","nutrient_label_pl":"Kwas foliowy","safety_type":"UL","table":30,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":1000,"scope":"all_sources","notes":[]},{"id":"iodine__ul__all__default__12_47","nutrient_id":"iodine","nutrient_label_pl":"Jod","safety_type":"UL","table":31,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"value":200,"scope":"all_sources","notes":[]},{"id":"iodine__ul__all__default__48_83","nutrient_id":"iodine","nutrient_label_pl":"Jod","safety_type":"UL","table":31,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":250,"scope":"all_sources","notes":[]},{"id":"iodine__ul__all__default__84_131","nutrient_id":"iodine","nutrient_label_pl":"Jod","safety_type":"UL","table":31,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":300,"scope":"all_sources","notes":[]},{"id":"iodine__ul__all__default__132_179","nutrient_id":"iodine","nutrient_label_pl":"Jod","safety_type":"UL","table":31,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":450,"scope":"all_sources","notes":[]},{"id":"iodine__ul__all__default__180_215","nutrient_id":"iodine","nutrient_label_pl":"Jod","safety_type":"UL","table":31,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":500,"scope":"all_sources","notes":[]},{"id":"iodine__ul__all__default__216_null","nutrient_id":"iodine","nutrient_label_pl":"Jod","safety_type":"UL","table":31,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":600,"scope":"all_sources","notes":[]},{"id":"iodine__ul__female__lactation__0_null","nutrient_id":"iodine","nutrient_label_pl":"Jod","safety_type":"UL","table":31,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":600,"scope":"all_sources","notes":[]},{"id":"iodine__ul__female__pregnancy__0_null","nutrient_id":"iodine","nutrient_label_pl":"Jod","safety_type":"UL","table":31,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":600,"scope":"all_sources","notes":[]},{"id":"magnesium__ul__all__default__48_83","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":250,"scope":"supplements_water_fortified_only","notes":["Magnez w formie łatwo dysocjujących soli lub tlenku magnezu – suplementy diety, woda, żywność wzbogacana w magnez."]},{"id":"magnesium__ul__all__default__84_131","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":250,"scope":"supplements_water_fortified_only","notes":["Magnez w formie łatwo dysocjujących soli lub tlenku magnezu – suplementy diety, woda, żywność wzbogacana w magnez."]},{"id":"magnesium__ul__all__default__132_179","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":250,"scope":"supplements_water_fortified_only","notes":["Magnez w formie łatwo dysocjujących soli lub tlenku magnezu – suplementy diety, woda, żywność wzbogacana w magnez."]},{"id":"magnesium__ul__all__default__180_215","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":250,"scope":"supplements_water_fortified_only","notes":["Magnez w formie łatwo dysocjujących soli lub tlenku magnezu – suplementy diety, woda, żywność wzbogacana w magnez."]},{"id":"magnesium__ul__all__default__216_null","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":250,"scope":"supplements_water_fortified_only","notes":["Magnez w formie łatwo dysocjujących soli lub tlenku magnezu – suplementy diety, woda, żywność wzbogacana w magnez."]},{"id":"magnesium__ul__female__lactation__0_null","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","safety_type":"UL","table":31,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":250,"scope":"supplements_water_fortified_only","notes":["Magnez w formie łatwo dysocjujących soli lub tlenku magnezu – suplementy diety, woda, żywność wzbogacana w magnez."]},{"id":"magnesium__ul__female__pregnancy__0_null","nutrient_id":"magnesium","nutrient_label_pl":"Magnez","safety_type":"UL","table":31,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":250,"scope":"supplements_water_fortified_only","notes":["Magnez w formie łatwo dysocjujących soli lub tlenku magnezu – suplementy diety, woda, żywność wzbogacana w magnez."]},{"id":"molybdenum__ul__all__default__12_47","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"value":0.1,"scope":"all_sources","notes":[]},{"id":"molybdenum__ul__all__default__48_83","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":0.2,"scope":"all_sources","notes":[]},{"id":"molybdenum__ul__all__default__84_131","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":0.25,"scope":"all_sources","notes":[]},{"id":"molybdenum__ul__all__default__132_179","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":0.4,"scope":"all_sources","notes":[]},{"id":"molybdenum__ul__all__default__180_215","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":0.5,"scope":"all_sources","notes":[]},{"id":"molybdenum__ul__all__default__216_null","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":0.6,"scope":"all_sources","notes":[]},{"id":"molybdenum__ul__female__lactation__0_null","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","safety_type":"UL","table":31,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":0.6,"scope":"all_sources","notes":[]},{"id":"molybdenum__ul__female__pregnancy__0_null","nutrient_id":"molybdenum","nutrient_label_pl":"Molibden","safety_type":"UL","table":31,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":7,"scope":"all_sources","notes":["Wartość zapisana w źródłowej tabeli jako „7”; prawdopodobny zapis wymagający weryfikacji redakcyjnej."]},{"id":"niacin_acid__ul__all__default__12_47","nutrient_id":"niacin_acid","nutrient_label_pl":"Kwas nikotynowy","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"value":2,"scope":"all_sources","notes":[]},{"id":"niacin_acid__ul__all__default__48_83","nutrient_id":"niacin_acid","nutrient_label_pl":"Kwas nikotynowy","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":3,"scope":"all_sources","notes":[]},{"id":"niacin_acid__ul__all__default__84_131","nutrient_id":"niacin_acid","nutrient_label_pl":"Kwas nikotynowy","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":4,"scope":"all_sources","notes":[]},{"id":"niacin_acid__ul__all__default__132_179","nutrient_id":"niacin_acid","nutrient_label_pl":"Kwas nikotynowy","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":6,"scope":"all_sources","notes":[]},{"id":"niacin_acid__ul__all__default__180_215","nutrient_id":"niacin_acid","nutrient_label_pl":"Kwas nikotynowy","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":8,"scope":"all_sources","notes":[]},{"id":"niacin_acid__ul__all__default__216_null","nutrient_id":"niacin_acid","nutrient_label_pl":"Kwas nikotynowy","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":10,"scope":"all_sources","notes":[]},{"id":"niacinamide__ul__all__default__12_47","nutrient_id":"niacinamide","nutrient_label_pl":"Amid kwasu nikotynowego","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"value":150,"scope":"all_sources","notes":[]},{"id":"niacinamide__ul__all__default__48_83","nutrient_id":"niacinamide","nutrient_label_pl":"Amid kwasu nikotynowego","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":220,"scope":"all_sources","notes":[]},{"id":"niacinamide__ul__all__default__84_131","nutrient_id":"niacinamide","nutrient_label_pl":"Amid kwasu nikotynowego","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":350,"scope":"all_sources","notes":[]},{"id":"niacinamide__ul__all__default__132_179","nutrient_id":"niacinamide","nutrient_label_pl":"Amid kwasu nikotynowego","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":500,"scope":"all_sources","notes":[]},{"id":"niacinamide__ul__all__default__180_215","nutrient_id":"niacinamide","nutrient_label_pl":"Amid kwasu nikotynowego","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":700,"scope":"all_sources","notes":[]},{"id":"niacinamide__ul__all__default__216_null","nutrient_id":"niacinamide","nutrient_label_pl":"Amid kwasu nikotynowego","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":900,"scope":"all_sources","notes":[]},{"id":"selenium__ul__all__default__4_6","nutrient_id":"selenium","nutrient_label_pl":"Selen","safety_type":"UL","table":31,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":4,"age_max_months":6,"value":45,"scope":"all_sources","notes":[]},{"id":"selenium__ul__all__default__7_11","nutrient_id":"selenium","nutrient_label_pl":"Selen","safety_type":"UL","table":31,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":7,"age_max_months":11,"value":55,"scope":"all_sources","notes":[]},{"id":"selenium__ul__all__default__12_47","nutrient_id":"selenium","nutrient_label_pl":"Selen","safety_type":"UL","table":31,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"value":70,"scope":"all_sources","notes":[]},{"id":"selenium__ul__all__default__48_83","nutrient_id":"selenium","nutrient_label_pl":"Selen","safety_type":"UL","table":31,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":95,"scope":"all_sources","notes":[]},{"id":"selenium__ul__all__default__84_131","nutrient_id":"selenium","nutrient_label_pl":"Selen","safety_type":"UL","table":31,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":130,"scope":"all_sources","notes":[]},{"id":"selenium__ul__all__default__132_179","nutrient_id":"selenium","nutrient_label_pl":"Selen","safety_type":"UL","table":31,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":180,"scope":"all_sources","notes":[]},{"id":"selenium__ul__all__default__180_215","nutrient_id":"selenium","nutrient_label_pl":"Selen","safety_type":"UL","table":31,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":230,"scope":"all_sources","notes":[]},{"id":"selenium__ul__all__default__216_null","nutrient_id":"selenium","nutrient_label_pl":"Selen","safety_type":"UL","table":31,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":255,"scope":"all_sources","notes":[]},{"id":"selenium__ul__female__lactation__0_null","nutrient_id":"selenium","nutrient_label_pl":"Selen","safety_type":"UL","table":31,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":255,"scope":"all_sources","notes":[]},{"id":"selenium__ul__female__pregnancy__0_null","nutrient_id":"selenium","nutrient_label_pl":"Selen","safety_type":"UL","table":31,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":255,"scope":"all_sources","notes":[]},{"id":"vitamin_a__ul__all__default__4_6","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":4,"age_max_months":6,"value":600,"scope":"all_sources","notes":[]},{"id":"vitamin_a__ul__all__default__7_11","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":7,"age_max_months":11,"value":600,"scope":"all_sources","notes":[]},{"id":"vitamin_a__ul__all__default__12_47","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"value":800,"scope":"all_sources","notes":[]},{"id":"vitamin_a__ul__all__default__48_83","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":1100,"scope":"all_sources","notes":[]},{"id":"vitamin_a__ul__all__default__84_131","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":1500,"scope":"all_sources","notes":[]},{"id":"vitamin_a__ul__all__default__132_179","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":2000,"scope":"all_sources","notes":[]},{"id":"vitamin_a__ul__all__default__180_215","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":2600,"scope":"all_sources","notes":[]},{"id":"vitamin_a__ul__all__default__216_null","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":3000,"scope":"all_sources","notes":[]},{"id":"vitamin_a__ul__female__lactation__0_null","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","safety_type":"UL","table":30,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":3000,"scope":"all_sources","notes":[]},{"id":"vitamin_a__ul__female__pregnancy__0_null","nutrient_id":"vitamin_a","nutrient_label_pl":"Witamina A","safety_type":"UL","table":30,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":3000,"scope":"all_sources","notes":[]},{"id":"vitamin_b6__ul__all__default__4_6","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":4,"age_max_months":6,"value":2.2,"scope":"all_sources","notes":[]},{"id":"vitamin_b6__ul__all__default__7_11","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":7,"age_max_months":11,"value":2.5,"scope":"all_sources","notes":[]},{"id":"vitamin_b6__ul__all__default__12_47","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"value":3.2,"scope":"all_sources","notes":[]},{"id":"vitamin_b6__ul__all__default__48_83","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":4.5,"scope":"all_sources","notes":[]},{"id":"vitamin_b6__ul__all__default__84_131","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":6.1,"scope":"all_sources","notes":[]},{"id":"vitamin_b6__ul__all__default__132_179","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":8.6,"scope":"all_sources","notes":[]},{"id":"vitamin_b6__ul__all__default__180_215","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":10.7,"scope":"all_sources","notes":[]},{"id":"vitamin_b6__ul__all__default__216_null","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":12,"scope":"all_sources","notes":[]},{"id":"vitamin_b6__ul__female__lactation__0_null","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","safety_type":"UL","table":30,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":12,"scope":"all_sources","notes":[]},{"id":"vitamin_b6__ul__female__pregnancy__0_null","nutrient_id":"vitamin_b6","nutrient_label_pl":"Witamina B6","safety_type":"UL","table":30,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":12,"scope":"all_sources","notes":[]},{"id":"vitamin_d__ul__all__default__7_11","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":7,"age_max_months":11,"value":35,"scope":"all_sources","notes":[]},{"id":"vitamin_d__ul__all__default__12_47","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"value":50,"scope":"all_sources","notes":[]},{"id":"vitamin_d__ul__all__default__48_83","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":50,"scope":"all_sources","notes":[]},{"id":"vitamin_d__ul__all__default__84_131","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":50,"scope":"all_sources","notes":[]},{"id":"vitamin_d__ul__all__default__132_179","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":100,"scope":"all_sources","notes":[]},{"id":"vitamin_d__ul__all__default__180_215","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":100,"scope":"all_sources","notes":[]},{"id":"vitamin_d__ul__all__default__216_null","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","safety_type":"UL","table":30,"unit":"µg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":100,"scope":"all_sources","notes":[]},{"id":"vitamin_d__ul__female__lactation__0_null","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","safety_type":"UL","table":30,"unit":"µg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":100,"scope":"all_sources","notes":[]},{"id":"vitamin_d__ul__female__pregnancy__0_null","nutrient_id":"vitamin_d","nutrient_label_pl":"Witamina D","safety_type":"UL","table":30,"unit":"µg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":100,"scope":"all_sources","notes":[]},{"id":"vitamin_e__ul__all__default__4_6","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":4,"age_max_months":6,"value":50,"scope":"all_sources","notes":[]},{"id":"vitamin_e__ul__all__default__7_11","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":7,"age_max_months":11,"value":60,"scope":"all_sources","notes":[]},{"id":"vitamin_e__ul__all__default__12_47","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"value":100,"scope":"all_sources","notes":[]},{"id":"vitamin_e__ul__all__default__48_83","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":120,"scope":"all_sources","notes":[]},{"id":"vitamin_e__ul__all__default__84_131","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":160,"scope":"all_sources","notes":[]},{"id":"vitamin_e__ul__all__default__132_179","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":220,"scope":"all_sources","notes":[]},{"id":"vitamin_e__ul__all__default__180_215","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":260,"scope":"all_sources","notes":[]},{"id":"vitamin_e__ul__all__default__216_null","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","safety_type":"UL","table":30,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":300,"scope":"all_sources","notes":[]},{"id":"vitamin_e__ul__female__lactation__0_null","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","safety_type":"UL","table":30,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":300,"scope":"all_sources","notes":[]},{"id":"vitamin_e__ul__female__pregnancy__0_null","nutrient_id":"vitamin_e","nutrient_label_pl":"Witamina E","safety_type":"UL","table":30,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":300,"scope":"all_sources","notes":[]},{"id":"zinc__ul__all__default__12_47","nutrient_id":"zinc","nutrient_label_pl":"Cynk","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"value":7,"scope":"all_sources","notes":[]},{"id":"zinc__ul__all__default__48_83","nutrient_id":"zinc","nutrient_label_pl":"Cynk","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":10,"scope":"all_sources","notes":[]},{"id":"zinc__ul__all__default__84_131","nutrient_id":"zinc","nutrient_label_pl":"Cynk","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":13,"scope":"all_sources","notes":[]},{"id":"zinc__ul__all__default__132_179","nutrient_id":"zinc","nutrient_label_pl":"Cynk","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":18,"scope":"all_sources","notes":[]},{"id":"zinc__ul__all__default__180_215","nutrient_id":"zinc","nutrient_label_pl":"Cynk","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":22,"scope":"all_sources","notes":[]},{"id":"zinc__ul__all__default__216_null","nutrient_id":"zinc","nutrient_label_pl":"Cynk","safety_type":"UL","table":31,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":25,"scope":"all_sources","notes":[]},{"id":"zinc__ul__female__lactation__0_null","nutrient_id":"zinc","nutrient_label_pl":"Cynk","safety_type":"UL","table":31,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":25,"scope":"all_sources","notes":[]},{"id":"zinc__ul__female__pregnancy__0_null","nutrient_id":"zinc","nutrient_label_pl":"Cynk","safety_type":"UL","table":31,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":25,"scope":"all_sources","notes":[]}]},"safeLevels":{"source":{"title":"Normy żywienia dla populacji Polski","edition":2024,"tables":[32]},"records":[{"id":"iron__safe_level__all__default__4_6","nutrient_id":"iron","nutrient_label_pl":"Żelazo","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":4,"age_max_months":6,"value":5,"scope":"all_sources","notes":[]},{"id":"iron__safe_level__all__default__7_11","nutrient_id":"iron","nutrient_label_pl":"Żelazo","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":7,"age_max_months":11,"value":5,"scope":"all_sources","notes":[]},{"id":"iron__safe_level__all__default__12_47","nutrient_id":"iron","nutrient_label_pl":"Żelazo","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":47,"value":10,"scope":"all_sources","notes":[]},{"id":"iron__safe_level__all__default__48_83","nutrient_id":"iron","nutrient_label_pl":"Żelazo","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":48,"age_max_months":83,"value":15,"scope":"all_sources","notes":[]},{"id":"iron__safe_level__all__default__84_131","nutrient_id":"iron","nutrient_label_pl":"Żelazo","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":20,"scope":"all_sources","notes":[]},{"id":"iron__safe_level__all__default__132_179","nutrient_id":"iron","nutrient_label_pl":"Żelazo","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":179,"value":30,"scope":"all_sources","notes":[]},{"id":"iron__safe_level__all__default__180_215","nutrient_id":"iron","nutrient_label_pl":"Żelazo","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":180,"age_max_months":215,"value":35,"scope":"all_sources","notes":[]},{"id":"iron__safe_level__all__default__216_null","nutrient_id":"iron","nutrient_label_pl":"Żelazo","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":40,"scope":"all_sources","notes":[]},{"id":"iron__safe_level__female__lactation__0_null","nutrient_id":"iron","nutrient_label_pl":"Żelazo","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":40,"scope":"all_sources","notes":[]},{"id":"iron__safe_level__female__pregnancy__0_null","nutrient_id":"iron","nutrient_label_pl":"Żelazo","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":40,"scope":"all_sources","notes":[]},{"id":"manganese__safe_level__all__default__4_6","nutrient_id":"manganese","nutrient_label_pl":"Mangan","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":4,"age_max_months":6,"value":2,"scope":"all_sources","notes":[]},{"id":"manganese__safe_level__all__default__7_11","nutrient_id":"manganese","nutrient_label_pl":"Mangan","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":7,"age_max_months":11,"value":2,"scope":"all_sources","notes":[]},{"id":"manganese__safe_level__all__default__12_35","nutrient_id":"manganese","nutrient_label_pl":"Mangan","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":12,"age_max_months":35,"value":4,"scope":"all_sources","notes":[]},{"id":"manganese__safe_level__all__default__36_83","nutrient_id":"manganese","nutrient_label_pl":"Mangan","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":36,"age_max_months":83,"value":5,"scope":"all_sources","notes":[]},{"id":"manganese__safe_level__all__default__84_131","nutrient_id":"manganese","nutrient_label_pl":"Mangan","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":84,"age_max_months":131,"value":6,"scope":"all_sources","notes":[]},{"id":"manganese__safe_level__all__default__132_167","nutrient_id":"manganese","nutrient_label_pl":"Mangan","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":132,"age_max_months":167,"value":6,"scope":"all_sources","notes":[]},{"id":"manganese__safe_level__all__default__168_215","nutrient_id":"manganese","nutrient_label_pl":"Mangan","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":168,"age_max_months":215,"value":7,"scope":"all_sources","notes":[]},{"id":"manganese__safe_level__all__default__216_null","nutrient_id":"manganese","nutrient_label_pl":"Mangan","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"all","physiology":"default","age_min_months":216,"age_max_months":null,"value":8,"scope":"all_sources","notes":[]},{"id":"manganese__safe_level__female__lactation__0_null","nutrient_id":"manganese","nutrient_label_pl":"Mangan","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null,"value":8,"scope":"all_sources","notes":[]},{"id":"manganese__safe_level__female__pregnancy__0_null","nutrient_id":"manganese","nutrient_label_pl":"Mangan","safety_type":"SAFE_LEVEL","table":32,"unit":"mg/d","sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null,"value":8,"scope":"all_sources","notes":[]}]},"quicksets":{"source":{"title":"Reguły produktowe karty „Najważniejsze dla Ciebie”","edition":1,"based_on":"Projekt karty witamin i składników mineralnych dla wagaiwzrost.pl"},"rules":[{"id":"default_child_6_119","conditions":{"sex":"all","physiology":"default","age_min_months":6,"age_max_months":119},"nutrients":["vitamin_d","calcium","iron","iodine","folate","selenium"]},{"id":"male_120_227","conditions":{"sex":"male","physiology":"default","age_min_months":120,"age_max_months":227},"nutrients":["vitamin_d","calcium","iron","iodine","zinc","folate"]},{"id":"female_120_227","conditions":{"sex":"female","physiology":"default","age_min_months":120,"age_max_months":227},"nutrients":["vitamin_d","calcium","iron","iodine","folate","vitamin_b12"]},{"id":"male_adult","conditions":{"sex":"male","physiology":"default","age_min_months":228,"age_max_months":null},"nutrients":["vitamin_d","calcium","iodine","zinc","folate","vitamin_b12"]},{"id":"female_adult","conditions":{"sex":"female","physiology":"default","age_min_months":228,"age_max_months":null},"nutrients":["vitamin_d","calcium","iron","iodine","folate","vitamin_b12"]},{"id":"pregnancy","conditions":{"sex":"female","physiology":"pregnancy","age_min_months":0,"age_max_months":null},"nutrients":["vitamin_d","calcium","iron","iodine","folate","choline"]},{"id":"lactation","conditions":{"sex":"female","physiology":"lactation","age_min_months":0,"age_max_months":null},"nutrients":["vitamin_d","calcium","iodine","choline","vitamin_b12","selenium"]}]}};

  let MICRONORMS_INIT_DONE = false;

  const MICRONORMS_STATE = {
    norms: null,
    ul: null,
    safeLevels: null,
    quicksets: null,
    ready: false,
    source: null,
    loadPromise: null
  };

  const MICRONORMS_UI_STATE = {
    ironVariant: null
  };

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : NaN;
  }

  function parseOptionalNumber(value) {
    if (value == null) return NaN;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const raw = String(value).replace(',', '.').trim();
    if (!raw) return NaN;
    const num = Number(raw);
    return Number.isFinite(num) ? num : NaN;
  }

  function firstFiniteNumber() {
    for (let i = 0; i < arguments.length; i += 1) {
      const num = parseOptionalNumber(arguments[i]);
      if (Number.isFinite(num)) return num;
    }
    return NaN;
  }

  function deepClone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }

  function normalizeSex(value) {
    const raw = String(value == null ? '' : value).trim().toUpperCase();
    return raw === 'F' || raw === 'K' || raw === 'FEMALE' || raw === 'WOMAN' || raw === 'KOBIETA'
      ? 'female'
      : 'male';
  }

  function normalizeSexCode(value) {
    return normalizeSex(value) === 'female' ? 'F' : 'M';
  }

  function normalizeDataSource(value) {
    const raw = String(value == null ? '' : value).trim().toUpperCase();
    if (raw === 'PALCZEWSKA' || raw === 'PALCZEWSKA_NIEDZWIECKA' || raw === 'PALCZEWSKA-NIEDZWIECKA') return 'PALCZEWSKA';
    if (raw === 'WHO') return 'WHO';
    if (raw === 'OLAF' || raw === 'OLA') return 'OLAF';
    return '';
  }

  function normalizePhysiology(value) {
    const raw = String(value == null ? '' : value).trim().toLowerCase();
    if (raw === 'pregnancy' || raw === 'ciaza' || raw === 'ciąża' || raw === 'pregnant') return 'pregnancy';
    if (raw === 'lactation' || raw === 'karmienie' || raw === 'lactating' || raw === 'breastfeeding') return 'lactation';
    return 'default';
  }

  function normalizeVariantPreference(value) {
    const raw = String(value == null ? '' : value).trim().toLowerCase();
    if (raw === 'pre_menarche' || raw === 'before_menarche' || raw === 'przed_miesiączką' || raw === 'przed_miesiaczka') {
      return 'pre_menarche';
    }
    if (raw === 'post_menarche' || raw === 'after_menarche' || raw === 'po_miesiączce' || raw === 'po_miesiaczce') {
      return 'post_menarche';
    }
    return null;
  }

  function normalizeAgeMonths(profile) {
    if (!profile || typeof profile !== 'object') return NaN;
    if (isFiniteNumber(profile.ageTotalMonths)) return Number(profile.ageTotalMonths);
    if (isFiniteNumber(profile.ageMonthsTotal)) return Number(profile.ageMonthsTotal);
    if (isFiniteNumber(profile.ageMonths) && !isFiniteNumber(profile.ageYears)) return Number(profile.ageMonths);
    const ageYears = toNumber(profile.ageYears);
    const ageMonths = toNumber(profile.ageMonths);
    if (Number.isFinite(ageYears) && Number.isFinite(ageMonths)) {
      return Math.max(0, Math.round(ageYears * 12 + ageMonths));
    }
    if (Number.isFinite(ageYears)) {
      return Math.max(0, Math.round(ageYears * 12));
    }
    if (Number.isFinite(ageMonths)) {
      return Math.max(0, Math.round(ageMonths));
    }
    return NaN;
  }

  function nutritionMicrosNormalizeProfile(profile) {
    const src = profile && typeof profile === 'object' ? profile : {};
    const ageMonths = normalizeAgeMonths(src);
    const sex = normalizeSex(src.sex);
    const sexCode = normalizeSexCode(src.sexCode || src.sex);
    const physiology = normalizePhysiology(src.physiology);
    const variantPreference = Object.assign({}, src.variantPreference && typeof src.variantPreference === 'object' ? src.variantPreference : {});

    const weightKg = firstFiniteNumber(src.weightKg, src.weight, src.massKg, src.bodyWeightKg);
    const heightCm = firstFiniteNumber(src.heightCm, src.height, src.statureCm, src.bodyHeightCm);
    const heightM = Number.isFinite(heightCm) ? heightCm / 100 : NaN;
    const bmiFromProfile = firstFiniteNumber(src.bmi, src.bmiValue);
    const bmi = Number.isFinite(bmiFromProfile)
      ? bmiFromProfile
      : (Number.isFinite(weightKg) && Number.isFinite(heightM) && heightM > 0 ? weightKg / (heightM * heightM) : NaN);
    const dataSource = normalizeDataSource(src.dataSource || src.bmiSource || src.source || src.centileSource);
    const bmiPercentileFromProfile = firstFiniteNumber(src.bmiPercentile, src.bmiCentile, src.bmiPerc);
    const bmiPercentile = Number.isFinite(bmiPercentileFromProfile)
      ? bmiPercentileFromProfile
      : nutritionMicrosEstimateBmiPercentile({ ageMonths, sexCode, bmi, dataSource });
    const bmiStatus = nutritionMicrosClassifyBmi({ ageMonths, bmi, bmiPercentile });

    const ironVariant = normalizeVariantPreference(
      src.ironVariant ||
      src.menstruationVariant ||
      src.menarcheVariant ||
      src.menstruationStatus ||
      (variantPreference.iron || variantPreference.iron_status || variantPreference.menarche)
    );

    if (ironVariant) {
      variantPreference.iron = ironVariant;
    }

    return {
      ageMonths: Number.isFinite(ageMonths) ? ageMonths : NaN,
      ageYears: Number.isFinite(ageMonths) ? Math.floor(ageMonths / 12) : NaN,
      sex,
      sexCode,
      physiology,
      weightKg: Number.isFinite(weightKg) ? weightKg : NaN,
      heightCm: Number.isFinite(heightCm) ? heightCm : NaN,
      bmi: Number.isFinite(bmi) ? bmi : NaN,
      bmiPercentile: Number.isFinite(bmiPercentile) ? bmiPercentile : NaN,
      bmiStatus,
      bmiStatusLabel: nutritionMicrosBmiStatusLabel(bmiStatus),
      dataSource,
      hasCompleteAnthro: Number.isFinite(weightKg) && Number.isFinite(heightCm) && Number.isFinite(bmi),
      variantPreference
    };
  }

  async function fetchJsonCandidates(candidates) {
    if (typeof fetch !== 'function') return null;
    const list = Array.isArray(candidates) ? candidates : [];
    for (const candidate of list) {
      if (!candidate) continue;
      try {
        const response = await fetch(candidate, { cache: 'no-cache' });
        if (!response || !response.ok) continue;
        return await response.json();
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 180 });
    }
  }
    }
    return null;
  }

  function nutritionMicrosDispatchReady() {
    try {
      window.dispatchEvent(new CustomEvent('nutritionMicrosDataReady', {
        detail: nutritionMicrosGetDataSnapshot()
      }));
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 192 });
    }
  }
  }

  function setStateResources(bundle, source) {
    if (!bundle || !bundle.norms || !bundle.ul || !bundle.safeLevels) return null;
    MICRONORMS_STATE.norms = deepClone(bundle.norms);
    MICRONORMS_STATE.ul = deepClone(bundle.ul);
    MICRONORMS_STATE.safeLevels = deepClone(bundle.safeLevels);
    MICRONORMS_STATE.quicksets = bundle.quicksets ? deepClone(bundle.quicksets) : { rules: [] };
    MICRONORMS_STATE.ready = true;
    MICRONORMS_STATE.source = source || 'network';
    nutritionMicrosDispatchReady();
    return nutritionMicrosGetDataSnapshot();
  }

  const applyBundleFromSource = setStateResources;

  function getEmbeddedFallbackBundle() {
    try {
      if (!MICRONORMS_EMBEDDED_FALLBACK || typeof MICRONORMS_EMBEDDED_FALLBACK !== 'object') return null;
      return deepClone(MICRONORMS_EMBEDDED_FALLBACK);
    } catch (_) {
      return null;
    }
  }

  function bindNutritionMicrosProfileListeners() {
    const fieldIds = [
      'age', 'ageMonths', 'sex', 'weight', 'height', 'microsPhysiology', 'physiology', 'pregnancyState',
      'microsPregnancy', 'pregnancyToggle', 'microsLactation', 'lactationToggle',
      'microsIronVariant', 'ironVariant', 'menarcheStatus', 'menstruationStatus',
      'sourcePalczewska', 'sourceOlaf', 'sourceWho'
    ];
    fieldIds.forEach((id) => {
      const node = el(id);
      if (!node || node.__nutritionMicrosProfileBound) return;
      node.__nutritionMicrosProfileBound = true;
      const rerender = function() {
        try { renderNutritionMicrosCardFromDom(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 232 });
    }
  }
      };
      try { node.addEventListener('input', rerender); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 234 });
    }
  }
      try { node.addEventListener('change', rerender); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 235 });
    }
  }
    });
  }

  function scheduleNutritionMicrosBootstrapRender() {
    const delays = [0, 60, 180, 500];
    delays.forEach((delay) => {
      setTimeout(function() {
        try { renderNutritionMicrosCardFromDom(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 243 });
    }
  }
      }, delay);
    });
  }

  async function nutritionMicrosEnsureData(forceReload) {
    if (MICRONORMS_STATE.ready && !forceReload) {
      return nutritionMicrosGetDataSnapshot();
    }
    if (MICRONORMS_STATE.loadPromise && !forceReload) {
      return MICRONORMS_STATE.loadPromise;
    }

    MICRONORMS_STATE.loadPromise = (async function() {
      try {
        const bundle = {
          norms: await fetchJsonCandidates(MICRONORMS_RESOURCE_CANDIDATES.norms),
          ul: await fetchJsonCandidates(MICRONORMS_RESOURCE_CANDIDATES.ul),
          safeLevels: await fetchJsonCandidates(MICRONORMS_RESOURCE_CANDIDATES.safeLevels),
          quicksets: await fetchJsonCandidates(MICRONORMS_RESOURCE_CANDIDATES.quicksets)
        };
        if (bundle.norms && bundle.ul && bundle.safeLevels && bundle.quicksets) {
          return applyBundleFromSource(bundle, 'network');
        }
        const embeddedFallback = getEmbeddedFallbackBundle();
        if (embeddedFallback) {
          return applyBundleFromSource(embeddedFallback, 'embedded_fallback');
        }
        throw new Error('MICRONORMS_LOAD_FAILED');
      } catch (_) {
        const embeddedFallback = getEmbeddedFallbackBundle();
        if (embeddedFallback) {
          return applyBundleFromSource(embeddedFallback, 'embedded_fallback');
        }
        throw _;
      }
    })();

    try {
      return await MICRONORMS_STATE.loadPromise;
    } finally {
      MICRONORMS_STATE.loadPromise = null;
    }
  }

  function nutritionMicrosGetDataSnapshot() {
    if (!MICRONORMS_STATE.ready || !MICRONORMS_STATE.norms || !MICRONORMS_STATE.ul || !MICRONORMS_STATE.safeLevels) {
      return null;
    }
    return {
      norms: MICRONORMS_STATE.norms,
      ul: MICRONORMS_STATE.ul,
      safeLevels: MICRONORMS_STATE.safeLevels,
      quicksets: MICRONORMS_STATE.quicksets || { rules: [] },
      source: MICRONORMS_STATE.source || 'network'
    };
  }

  function matchesAge(record, ageMonths) {
    if (!record || !Number.isFinite(ageMonths)) return false;
    const min = toNumber(record.age_min_months);
    const max = record.age_max_months == null ? null : toNumber(record.age_max_months);
    if (Number.isFinite(min) && ageMonths < min) return false;
    if (Number.isFinite(max) && ageMonths > max) return false;
    return true;
  }

  function matchesSex(record, sex) {
    const recSex = String(record && record.sex || 'all');
    return recSex === 'all' || recSex === sex;
  }

  function matchesPhysiology(record, physiology) {
    return String(record && record.physiology || 'default') === String(physiology || 'default');
  }

  function resolveVariantMatch(records, nutrientId, variantPreference) {
    const list = Array.isArray(records) ? records.slice() : [];
    if (list.length <= 1) {
      return { selected: list[0] || null, alternatives: list.length > 1 ? list : [], unresolved: false };
    }
    const preferredVariant = variantPreference && typeof variantPreference === 'object'
      ? normalizeVariantPreference(variantPreference[nutrientId] || variantPreference.iron)
      : null;
    if (preferredVariant) {
      const selected = list.find((item) => String(item && item.variant || '') === preferredVariant) || null;
      if (selected) {
        return { selected, alternatives: list.filter((item) => item !== selected), unresolved: false };
      }
    }
    const unversioned = list.find((item) => !item || item.variant == null);
    if (unversioned) {
      return { selected: unversioned, alternatives: list.filter((item) => item !== unversioned), unresolved: false };
    }
    return { selected: null, alternatives: list, unresolved: true };
  }

  function buildTargetValue(record) {
    if (!record || typeof record !== 'object') return null;
    if (isFiniteNumber(record.rda)) return record.rda;
    if (isFiniteNumber(record.ai)) return record.ai;
    if (isFiniteNumber(record.ear)) return record.ear;
    return null;
  }

  function buildNormEntry(nutrientId, records, variantPreference) {
    const resolution = resolveVariantMatch(records, nutrientId, variantPreference);
    const selected = resolution.selected;
    const base = selected || (resolution.alternatives && resolution.alternatives[0]) || null;
    if (!base) return null;
    return {
      nutrient_id: nutrientId,
      nutrient_label_pl: base.nutrient_label_pl,
      category: base.category,
      unit: base.unit,
      table: base.table,
      norm_kind: base.norm_kind,
      target_value: buildTargetValue(selected),
      target_type: selected ? (isFiniteNumber(selected.rda) ? 'RDA' : (isFiniteNumber(selected.ai) ? 'AI' : 'EAR')) : null,
      ear: selected ? selected.ear : null,
      rda: selected ? selected.rda : null,
      ai: selected ? selected.ai : null,
      variant: selected ? selected.variant : null,
      notes: selected ? (Array.isArray(selected.notes) ? selected.notes.slice() : []) : [],
      record: selected,
      alternatives: resolution.alternatives.map((item) => ({
        variant: item.variant || null,
        ear: item.ear,
        rda: item.rda,
        ai: item.ai,
        notes: Array.isArray(item.notes) ? item.notes.slice() : []
      })),
      unresolved_variant: resolution.unresolved
    };
  }

  function buildSafetyEntry(record) {
    if (!record) return null;
    return {
      nutrient_id: record.nutrient_id,
      nutrient_label_pl: record.nutrient_label_pl,
      unit: record.unit,
      table: record.table,
      safety_type: record.safety_type,
      value: record.value,
      scope: record.scope,
      notes: Array.isArray(record.notes) ? record.notes.slice() : [],
      record: record
    };
  }

  function selectQuickSet(profile, resolved) {
    const snapshot = nutritionMicrosGetDataSnapshot();
    const rules = snapshot && snapshot.quicksets && Array.isArray(snapshot.quicksets.rules)
      ? snapshot.quicksets.rules
      : [];
    const ageMonths = profile && profile.ageMonths;
    const physiology = profile && profile.physiology;
    const sex = profile && profile.sex;
    let rule = null;
    for (const candidate of rules) {
      const conditions = candidate && candidate.conditions ? candidate.conditions : {};
      const condSex = String(conditions.sex || 'all');
      const condPhysiology = String(conditions.physiology || 'all');
      const condMin = conditions.age_min_months == null ? null : toNumber(conditions.age_min_months);
      const condMax = conditions.age_max_months == null ? null : toNumber(conditions.age_max_months);
      if (condSex !== 'all' && condSex !== sex) continue;
      if (condPhysiology !== 'all' && condPhysiology !== physiology) continue;
      if (Number.isFinite(condMin) && ageMonths < condMin) continue;
      if (Number.isFinite(condMax) && ageMonths > condMax) continue;
      rule = candidate;
      break;
    }
    const nutrientIds = rule && Array.isArray(rule.nutrients) ? rule.nutrients.slice() : [];
    const map = resolved && resolved.byId ? resolved.byId : {};
    return nutrientIds
      .map((id) => map[id])
      .filter(Boolean);
  }

  function nutritionMicrosResolveProfile(profile, options) {
    const snapshot = nutritionMicrosGetDataSnapshot();
    if (!snapshot) return null;

    const normalized = nutritionMicrosNormalizeProfile(profile);
    const ageMonths = normalized.ageMonths;
    if (!Number.isFinite(ageMonths)) return null;

    const normRecords = Array.isArray(snapshot.norms.records) ? snapshot.norms.records : [];
    const groupedNorms = {};
    for (const record of normRecords) {
      if (!matchesSex(record, normalized.sex)) continue;
      if (!matchesPhysiology(record, normalized.physiology)) continue;
      if (!matchesAge(record, ageMonths)) continue;
      const nutrientId = String(record.nutrient_id || '');
      if (!nutrientId) continue;
      if (!groupedNorms[nutrientId]) groupedNorms[nutrientId] = [];
      groupedNorms[nutrientId].push(record);
    }

    const byId = {};
    const vitamins = [];
    const minerals = [];

    Object.keys(groupedNorms).sort().forEach((nutrientId) => {
      const entry = buildNormEntry(nutrientId, groupedNorms[nutrientId], normalized.variantPreference);
      if (!entry) return;
      byId[nutrientId] = entry;
      if (entry.category === 'vitamin') vitamins.push(entry);
      else minerals.push(entry);
    });

    vitamins.sort((a, b) => String(a.nutrient_label_pl).localeCompare(String(b.nutrient_label_pl), 'pl'));
    minerals.sort((a, b) => String(a.nutrient_label_pl).localeCompare(String(b.nutrient_label_pl), 'pl'));

    const ulRecords = Array.isArray(snapshot.ul.records) ? snapshot.ul.records : [];
    const safeRecords = Array.isArray(snapshot.safeLevels.records) ? snapshot.safeLevels.records : [];

    const ulEntries = ulRecords
      .filter((record) => matchesSex(record, normalized.sex) && matchesPhysiology(record, normalized.physiology) && matchesAge(record, ageMonths))
      .map(buildSafetyEntry)
      .filter(Boolean)
      .sort((a, b) => String(a.nutrient_label_pl).localeCompare(String(b.nutrient_label_pl), 'pl'));

    const safeLevelEntries = safeRecords
      .filter((record) => matchesSex(record, normalized.sex) && matchesPhysiology(record, normalized.physiology) && matchesAge(record, ageMonths))
      .map(buildSafetyEntry)
      .filter(Boolean)
      .sort((a, b) => String(a.nutrient_label_pl).localeCompare(String(b.nutrient_label_pl), 'pl'));

    const resolved = {
      profile: normalized,
      vitamins,
      minerals,
      nutrients: vitamins.concat(minerals),
      byId,
      quickSet: [],
      safety: {
        ul: ulEntries,
        safe_levels: safeLevelEntries
      },
      meta: {
        source: snapshot.source || 'network',
        source_tables_norms: snapshot.norms && snapshot.norms.source ? snapshot.norms.source.tables : [],
        source_tables_ul: snapshot.ul && snapshot.ul.source ? snapshot.ul.source.tables : [],
        source_tables_safe_levels: snapshot.safeLevels && snapshot.safeLevels.source ? snapshot.safeLevels.source.tables : []
      }
    };

    resolved.quickSet = selectQuickSet(normalized, resolved);

    if (options && options.clone === true) {
      return deepClone(resolved);
    }
    return resolved;
  }

  async function nutritionMicrosResolveProfileAsync(profile, options) {
    await nutritionMicrosEnsureData();
    return nutritionMicrosResolveProfile(profile, options);
  }

  function nutritionMicrosGetAgeBand(ageYears, ageMonths) {
    const normalized = nutritionMicrosNormalizeProfile({ ageYears, ageMonths });
    const months = normalized.ageMonths;
    if (!Number.isFinite(months)) return null;
    if (months < 6) return { kind: 'infant_0_5', ageMonths: months };
    if (months <= 11) return { kind: 'infant_6_11', ageMonths: months };
    if (months <= 47) return { kind: 'years_1_3', ageMonths: months };
    if (months <= 83) return { kind: 'years_4_6', ageMonths: months };
    if (months <= 119) return { kind: 'years_7_9', ageMonths: months };
    if (months <= 155) return { kind: 'years_10_12', ageMonths: months };
    if (months <= 191) return { kind: 'years_13_15', ageMonths: months };
    if (months <= 227) return { kind: 'years_16_18', ageMonths: months };
    if (months <= 371) return { kind: 'years_19_30', ageMonths: months };
    if (months <= 611) return { kind: 'years_31_50', ageMonths: months };
    if (months <= 791) return { kind: 'years_51_65', ageMonths: months };
    if (months <= 911) return { kind: 'years_66_75', ageMonths: months };
    return { kind: 'years_over_75', ageMonths: months };
  }

  function nutritionMicrosEstimateBmiPercentile(profile) {
    const ageMonths = profile && Number.isFinite(profile.ageMonths) ? Number(profile.ageMonths) : NaN;
    const bmi = profile && Number.isFinite(profile.bmi) ? Number(profile.bmi) : NaN;
    if (!Number.isFinite(ageMonths) || !Number.isFinite(bmi) || ageMonths >= 216) return NaN;

    const sexCode = normalizeSexCode(profile && profile.sexCode);
    const dataSource = normalizeDataSource(profile && profile.dataSource);
    const ageYearsExact = ageMonths / 12;

    if (dataSource === 'PALCZEWSKA') {
      try {
        if (typeof calcPercentileStatsPal === 'function') {
          const stats = calcPercentileStatsPal(bmi, sexCode, ageYearsExact, 'BMI');
          const percentile = stats && parseOptionalNumber(stats.percentile);
          if (Number.isFinite(percentile)) return percentile;
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 540 });
    }
  }
    }

    let originalSource;
    let changedSource = false;
    try {
      if (typeof bmiSource !== 'undefined') {
        originalSource = bmiSource;
        if (dataSource) {
          bmiSource = dataSource;
          changedSource = true;
        }
      }
    } catch (_) {
      changedSource = false;
    }

    try {
      if (typeof bmiPercentileChild === 'function') {
        const percentile = parseOptionalNumber(bmiPercentileChild(bmi, sexCode, Math.round(ageMonths)));
        if (Number.isFinite(percentile)) return percentile;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 564 });
    }
  } finally {
      if (changedSource) {
        try { bmiSource = originalSource; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 568 });
    }
  }
      }
    }
    return NaN;
  }

  function nutritionMicrosClassifyBmi(profile) {
    const ageMonths = profile && Number.isFinite(profile.ageMonths) ? Number(profile.ageMonths) : NaN;
    const bmi = profile && Number.isFinite(profile.bmi) ? Number(profile.bmi) : NaN;
    const percentile = profile && Number.isFinite(profile.bmiPercentile) ? Number(profile.bmiPercentile) : NaN;
    if (!Number.isFinite(ageMonths) || !Number.isFinite(bmi)) return 'unknown';
    if (ageMonths < 216) {
      if (!Number.isFinite(percentile)) return 'unknown';
      if (percentile >= 97) return 'obesity';
      if (percentile >= 85) return 'overweight';
      if (percentile < 3) return 'underweight';
      return 'normal';
    }
    if (bmi >= 30) return 'obesity';
    if (bmi >= 25) return 'overweight';
    if (bmi < 18.5) return 'underweight';
    return 'normal';
  }

  function nutritionMicrosBmiStatusLabel(status) {
    if (status === 'obesity') return 'otyłość';
    if (status === 'overweight') return 'nadwaga';
    if (status === 'underweight') return 'niedowaga';
    if (status === 'normal') return 'zakres prawidłowy';
    return 'brak klasyfikacji';
  }

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.escapeHtml === 'function') {
      return window.VildaHtml.escapeHtml(arguments[0]);
    }
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }


  function nutritionMicrosSetTrustedHtml(element, markup, context) {
    if (!element) return false;
    const html = markup == null ? '' : String(markup);
    try {
      if (window.VildaHtml && typeof window.VildaHtml.setTrustedHtml === 'function') {
        return window.VildaHtml.setTrustedHtml(element, html, { context: context || 'nutrition-micros' });
      }
      element.textContent = html;
      return true;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { helper: 'setTrustedHtml', context: context || '' });
      }
      return false;
    }
  }

  function nutritionMicrosClearHtml(element) {
    if (!element) return false;
    try {
      if (window.VildaHtml && typeof window.VildaHtml.clearHtml === 'function') return window.VildaHtml.clearHtml(element);
      element.textContent = '';
      return true;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { helper: 'clearHtml' });
      }
      return false;
    }
  }

  function nutritionMicrosHasHtmlContent(element) {
    if (!element) return false;
    try {
      if (window.VildaHtml && typeof window.VildaHtml.hasHtmlContent === 'function') return window.VildaHtml.hasHtmlContent(element);
      return !!String(element.textContent || '').trim();
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { helper: 'hasHtmlContent' });
      }
      return false;
    }
  }

  function formatNumber(value, digits) {
    if (!isFiniteNumber(value)) return '—';
    const precision = Number.isFinite(digits) ? Math.max(0, digits) : 0;
    const rounded = Number(value.toFixed(precision));
    return String(rounded).replace('.', ',');
  }

  function guessPrecision(value) {
    if (!isFiniteNumber(value)) return 0;
    const num = Math.abs(Number(value));
    if (Math.abs(num - Math.round(num)) < 0.0001) return 0;
    if (Math.abs(num * 10 - Math.round(num * 10)) < 0.0001) return 1;
    return 2;
  }

  function formatValueWithUnit(value, unit) {
    if (!isFiniteNumber(value)) return '—';
    return `${formatNumber(value, guessPrecision(value))} ${String(unit || '').trim()}`.trim();
  }

  function formatRangeWithUnit(range, unit) {
    if (!Array.isArray(range) || range.length !== 2 || !isFiniteNumber(range[0]) || !isFiniteNumber(range[1])) return '—';
    const min = Number(range[0]);
    const max = Number(range[1]);
    const precision = Math.max(guessPrecision(min), guessPrecision(max));
    if (Math.abs(min - max) < 0.0001) {
      return `${formatNumber(min, precision)} ${String(unit || '').trim()}`.trim();
    }
    return `${formatNumber(min, precision)}–${formatNumber(max, precision)} ${String(unit || '').trim()}`.trim();
  }

  function nutritionMicrosIsVitaminD(nutrientId) {
    return String(nutrientId || '').trim().toLowerCase() === 'vitamin_d';
  }

  function nutritionMicrosIsMicrogramPerDayUnit(unit) {
    const normalized = String(unit || '').trim().toLowerCase()
      .replace(/μ/g, 'µ')
      .replace(/mcg/g, 'µg')
      .replace(/ug/g, 'µg')
      .replace(/\s+/g, '');
    return normalized === 'µg/d' || normalized === 'µg/dobę' || normalized === 'µg/dobe' || normalized === 'µg/day';
  }

  function nutritionMicrosFormatIuValueFromMicrograms(value) {
    if (!isFiniteNumber(value)) return '—';
    const iu = Number(value) * 40;
    return `${formatNumber(iu, guessPrecision(iu))} IU/dobę`;
  }

  function nutritionMicrosFormatIuRangeFromMicrograms(range) {
    if (!Array.isArray(range) || range.length !== 2 || !isFiniteNumber(range[0]) || !isFiniteNumber(range[1])) return '—';
    const min = Number(range[0]) * 40;
    const max = Number(range[1]) * 40;
    const precision = Math.max(guessPrecision(min), guessPrecision(max));
    if (Math.abs(min - max) < 0.0001) {
      return `${formatNumber(min, precision)} IU/dobę`;
    }
    return `${formatNumber(min, precision)}–${formatNumber(max, precision)} IU/dobę`;
  }

  function nutritionMicrosFormatValue(value, unit, nutrientId) {
    const base = formatValueWithUnit(value, unit);
    if (base === '—') return base;
    if (nutritionMicrosIsVitaminD(nutrientId) && nutritionMicrosIsMicrogramPerDayUnit(unit)) {
      return `${base} (${nutritionMicrosFormatIuValueFromMicrograms(value)})`;
    }
    return base;
  }

  function nutritionMicrosFormatRange(range, unit, nutrientId) {
    const base = formatRangeWithUnit(range, unit);
    if (base === '—') return base;
    if (nutritionMicrosIsVitaminD(nutrientId) && nutritionMicrosIsMicrogramPerDayUnit(unit)) {
      return `${base} (${nutritionMicrosFormatIuRangeFromMicrograms(range)})`;
    }
    return base;
  }

  const MICRONORMS_ABBREVIATIONS = {
    RDA: {
      title: 'RDA — Recommended Dietary Allowance; zalecane spożycie dzienne',
      description: 'zalecane spożycie dzienne, czyli poziom pokrywający zapotrzebowanie prawie wszystkich zdrowych osób w danej grupie.'
    },
    AI: {
      title: 'AI — Adequate Intake; wystarczające spożycie',
      description: 'wystarczające spożycie; stosowane, gdy nie można wyznaczyć EAR/RDA, ale dostępne dane pozwalają oszacować poziom uznawany za adekwatny.'
    },
    EAR: {
      title: 'EAR — Estimated Average Requirement; średnie zapotrzebowanie',
      description: 'średnie zapotrzebowanie, czyli poziom pokrywający potrzeby około połowy zdrowych osób w danej grupie.'
    },
    UL: {
      title: 'UL — Tolerable Upper Intake Level; górny tolerowany poziom spożycia',
      description: 'górny tolerowany poziom spożycia; nie jest celem dziennym, tylko granicą, której zwyczajowo nie należy przekraczać.'
    }
  };

  function nutritionMicrosAbbrHtml(code) {
    const key = String(code || '').trim().toUpperCase();
    const item = MICRONORMS_ABBREVIATIONS[key];
    if (!item) return escapeHtml(code);
    const tooltipText = escapeHtml(`${item.title}. ${item.description}`);
    return `<abbr class="nutrition-micros-abbr" data-micros-tooltip="${tooltipText}" aria-label="${tooltipText}" tabindex="0">${escapeHtml(key)}</abbr>`;
  }


  const MICRONORMS_FOOD_EXAMPLES = {
    calcium: {
      label: 'Wapń',
      unit: 'mg',
      sourceNote: 'Wartości porcji są orientacyjne; przy produktach wzbogacanych sprawdź etykietę.',
      intro: 'Łącz produkty mleczne lub wzbogacane z innymi źródłami; nie trzeba realizować celu jednym produktem.',
      cautions: [
        'Przy chorobach nerek, kamicy nerkowej lub suplementacji wapniem interpretację podaży wapnia warto omówić z lekarzem.'
      ],
      foods: [
        { id: 'yogurt', name: 'Jogurt naturalny, niskotłuszczowy', portion: '1 kubek ok. 240 g', value: 415, note: 'Bardzo praktyczne źródło wapnia.' },
        { id: 'milk', name: 'Mleko', portion: '1 szklanka', value: 300, note: 'Zawartość zależy od produktu i porcji.' },
        { id: 'mozzarella', name: 'Mozzarella / ser podpuszczkowy', portion: 'ok. 40–45 g', value: 330, note: 'Porcja sera może dostarczyć dużo wapnia, ale zwykle także sól i tłuszcz nasycony.' },
        { id: 'sardines', name: 'Sardynki z ośćmi', portion: 'ok. 85 g', value: 325, note: 'Źródło wapnia, jeśli zjadane są miękkie ości.' },
        { id: 'tofu', name: 'Tofu koagulowane solami wapnia', portion: '½ szklanki', value: 250, note: 'Dotyczy tofu z dodatkiem soli wapniowych — warto sprawdzić etykietę.' },
        { id: 'soymilk', name: 'Napój sojowy wzbogacany w wapń', portion: '1 szklanka', value: 300, note: 'Tylko jeśli produkt jest wzbogacany w wapń.' }
      ],
      sets: [
        { title: 'Prosty wariant mleczny', foodIds: ['yogurt', 'milk', 'mozzarella'] },
        { title: 'Wariant z rybą', foodIds: ['yogurt', 'milk', 'sardines'] },
        { title: 'Wariant mieszany / roślinny', foodIds: ['tofu', 'soymilk', 'yogurt'] }
      ]
    },
    iron: {
      label: 'Żelazo',
      unit: 'mg',
      sourceNote: 'Żelazo hemowe z mięsa i owoców morza jest zwykle lepiej przyswajalne niż żelazo niehemowe z produktów roślinnych.',
      intro: 'Przy produktach roślinnych warto łączyć źródła żelaza z witaminą C, np. warzywami lub owocami.',
      cautions: [
        'Przy ciąży, obfitych miesiączkach, niedokrwistości lub niskiej ferrytynie sama dieta może nie wystarczyć — decyzję o suplementacji podejmuje lekarz.'
      ],
      foods: [
        { id: 'fortified_cereal', name: 'Płatki śniadaniowe wzbogacane w żelazo', portion: '1 porcja', value: 18, note: 'Tylko jeśli produkt jest fortyfikowany — sprawdź etykietę.' },
        { id: 'oysters', name: 'Ostrygi', portion: 'ok. 85 g', value: 8, note: 'Bardzo bogate źródło żelaza hemowego.' },
        { id: 'white_beans', name: 'Biała fasola', portion: '1 szklanka', value: 8, note: 'Źródło żelaza niehemowego.' },
        { id: 'beef_liver', name: 'Wątroba wołowa', portion: 'ok. 85 g', value: 5, note: 'Bogate źródło, ale nie jest produktem do codziennego stosowania; w ciąży wymaga ostrożności.' },
        { id: 'lentils', name: 'Soczewica gotowana', portion: '½ szklanki', value: 3, note: 'Warto łączyć z warzywami/owocami bogatymi w witaminę C.' },
        { id: 'spinach', name: 'Szpinak gotowany', portion: '½ szklanki', value: 3, note: 'Zawiera żelazo, ale jego przyswajalność jest niższa niż z mięsa.' },
        { id: 'tofu', name: 'Tofu', portion: '½ szklanki', value: 3, note: 'Źródło żelaza niehemowego.' }
      ],
      sets: [
        { title: 'Wariant roślinny', foodIds: ['white_beans', 'lentils', 'spinach', 'tofu'] },
        { title: 'Wariant z produktem fortyfikowanym', foodIds: ['fortified_cereal', 'lentils'] },
        { title: 'Wariant z mięsem/owocami morza', foodIds: ['oysters', 'lentils', 'spinach'] }
      ]
    },
    iodine: {
      label: 'Jod',
      unit: 'µg',
      sourceNote: 'Zawartość jodu w nabiale, rybach i glonach jest zmienna; glony mogą mieć bardzo dużo jodu.',
      intro: 'Najpraktyczniejsze źródła to ryby morskie, nabiał, jaja oraz sól jodowana stosowana rozsądnie.',
      cautions: [
        'Sól jodowana nie powinna być pretekstem do zwiększania spożycia soli. Przy chorobach tarczycy suplementację jodu omawia się z lekarzem.'
      ],
      foods: [
        { id: 'cod', name: 'Dorsz pieczony', portion: 'ok. 85 g', value: 146, note: 'Jedna porcja zwykle pokrywa dużą część celu dziennego u dorosłych.' },
        { id: 'nori', name: 'Nori suszone', portion: 'ok. 5 g / 2 łyżki płatków', value: 116, note: 'Zawartość jodu w glonach bywa bardzo zmienna.' },
        { id: 'greek_yogurt', name: 'Jogurt grecki naturalny', portion: '¾ szklanki', value: 87, note: 'Wartość orientacyjna; nabiał ma zmienną zawartość jodu.' },
        { id: 'milk', name: 'Mleko', portion: '1 szklanka', value: 84, note: 'Wartość orientacyjna.' },
        { id: 'iodized_salt', name: 'Sól kuchenna jodowana', portion: '¼ łyżeczki', value: 78, note: 'Uwzględniaj ogólne ograniczenie soli w diecie.' },
        { id: 'egg', name: 'Jajko gotowane', portion: '1 sztuka', value: 31, note: 'Uzupełniające źródło jodu.' }
      ],
      sets: [
        { title: 'Wariant z rybą', foodIds: ['cod', 'milk', 'egg'] },
        { title: 'Wariant bez ryby', foodIds: ['milk', 'greek_yogurt', 'egg', 'iodized_salt'] },
        { title: 'Wariant z glonami', foodIds: ['nori', 'milk', 'egg'] }
      ]
    },
    zinc: {
      label: 'Cynk',
      unit: 'mg',
      sourceNote: 'Cynk z produktów zwierzęcych jest zwykle lepiej przyswajalny niż cynk z dużej ilości produktów zbożowych i strączkowych.',
      intro: 'W praktyce cynk najłatwiej uzupełniać przez mięso, owoce morza, pestki, nabiał, płatki owsiane i strączki.',
      cautions: [
        'Bardzo wysokie dawki cynku z suplementów mogą zaburzać gospodarkę miedzią; przykłady dotyczą żywności, nie suplementów.'
      ],
      foods: [
        { id: 'oysters', name: 'Ostrygi', portion: 'ok. 85 g', value: 32, note: 'Bardzo wysokie źródło; nie jest typowym codziennym punktem odniesienia.' },
        { id: 'beef', name: 'Wołowina pieczona', portion: 'ok. 85 g', value: 3.8, note: 'Źródło cynku o dobrej biodostępności.' },
        { id: 'crab', name: 'Krab gotowany', portion: 'ok. 85 g', value: 3.2, note: 'Dobre źródło cynku.' },
        { id: 'oats', name: 'Płatki owsiane gotowane', portion: '1 szklanka', value: 2.3, note: 'Źródło roślinne; fityniany mogą ograniczać wchłanianie cynku.' },
        { id: 'pumpkin_seeds', name: 'Pestki dyni prażone', portion: 'ok. 28 g', value: 2.2, note: 'Praktyczny dodatek do posiłku.' },
        { id: 'lentils', name: 'Soczewica gotowana', portion: '½ szklanki', value: 1.3, note: 'Źródło roślinne.' },
        { id: 'greek_yogurt', name: 'Jogurt grecki naturalny', portion: 'ok. 170 g', value: 1.0, note: 'Uzupełniające źródło cynku.' }
      ],
      sets: [
        { title: 'Wariant mieszany', foodIds: ['beef', 'pumpkin_seeds', 'oats', 'lentils', 'greek_yogurt'] },
        { title: 'Wariant z owocami morza', foodIds: ['crab', 'pumpkin_seeds', 'oats', 'greek_yogurt'] },
        { title: 'Bardzo bogate źródło — ostrożnie', foodIds: ['oysters'] }
      ]
    },
    folate: {
      label: 'Foliany',
      unit: 'µg DFE',
      sourceNote: 'Wartości podano jako ekwiwalenty folianów diety (DFE), jeżeli źródło tak je raportuje.',
      intro: 'Najpraktyczniejsze źródła to ciemnozielone warzywa liściaste, strączki i część warzyw.',
      cautions: [
        'W ciąży i przed ciążą zalecenia dotyczące kwasu foliowego/folianów są osobnym tematem — dieta nie zastępuje indywidualnych zaleceń lekarskich.'
      ],
      foods: [
        { id: 'beef_liver', name: 'Wątroba wołowa', portion: 'ok. 85 g', value: 215, note: 'Bardzo bogate źródło, ale w ciąży nie powinno być traktowane jako rutynowy sposób pokrywania normy.' },
        { id: 'spinach_cooked', name: 'Szpinak gotowany', portion: '½ szklanki', value: 131, note: 'Jedno z najbogatszych warzywnych źródeł folianów.' },
        { id: 'black_eyed_peas', name: 'Fasola/groszek czarne oczko', portion: '½ szklanki', value: 105, note: 'Strączki są praktycznym źródłem folianów.' },
        { id: 'asparagus', name: 'Szparagi gotowane', portion: '4 sztuki', value: 89, note: 'Dobre źródło folianów.' },
        { id: 'brussels_sprouts', name: 'Brukselka gotowana', portion: '½ szklanki', value: 78, note: 'Źródło folianów i błonnika.' },
        { id: 'romaine', name: 'Sałata rzymska', portion: '1 szklanka', value: 64, note: 'Może uzupełniać podaż folianów.' },
        { id: 'avocado', name: 'Awokado', portion: '½ szklanki', value: 59, note: 'Uzupełniające źródło folianów.' },
        { id: 'broccoli', name: 'Brokuły gotowane', portion: '½ szklanki', value: 52, note: 'Uzupełniające źródło folianów.' }
      ],
      sets: [
        { title: 'Wariant warzywno-strączkowy', foodIds: ['spinach_cooked', 'black_eyed_peas', 'asparagus', 'brussels_sprouts'] },
        { title: 'Wariant zielonych warzyw', foodIds: ['spinach_cooked', 'asparagus', 'brussels_sprouts', 'romaine', 'broccoli'] },
        { title: 'Wariant z bardzo bogatym źródłem', foodIds: ['beef_liver', 'spinach_cooked', 'broccoli'] }
      ]
    }
  };

  function nutritionMicrosHasFoodExamples(nutrientId) {
    return !!MICRONORMS_FOOD_EXAMPLES[String(nutrientId || '')];
  }

  function nutritionMicrosExamplesUnit(nutrientId, fallbackUnit) {
    const data = MICRONORMS_FOOD_EXAMPLES[String(nutrientId || '')];
    if (data && data.unit) return data.unit;
    return String(fallbackUnit || '').replace(/\/d\b/g, '').trim() || '';
  }

  function nutritionMicrosFormatFoodValue(value, unit) {
    if (!isFiniteNumber(value)) return '—';
    return `${formatNumber(value, guessPrecision(value))} ${unit}`.trim();
  }

  function nutritionMicrosFormatPercent(value) {
    if (!Number.isFinite(value)) return '—';
    if (value >= 100) return `${Math.round(value)}%`;
    if (value >= 10) return `${Math.round(value)}%`;
    return `${formatNumber(value, 1)}%`;
  }

  function nutritionMicrosChipTone(percent) {
    if (!Number.isFinite(percent)) return 'low';
    if (percent >= 100) return 'high';
    if (percent >= 40) return 'medium';
    return 'low';
  }

  function nutritionMicrosPortionCountText(value, target) {
    if (!isFiniteNumber(value) || !isFiniteNumber(target) || value <= 0 || target <= 0) return '';
    const count = Number(target) / Number(value);
    if (count <= 1.05) return '1 porcja lub mniej';
    if (count < 2) return `około ${formatNumber(count, 1)} porcji`;
    if (count < 10) return `około ${formatNumber(count, count < 4 ? 1 : 0)} porcji`;
    return 'bardzo dużo porcji — lepiej łączyć różne źródła';
  }

  function nutritionMicrosFoodById(data, id) {
    const foods = data && Array.isArray(data.foods) ? data.foods : [];
    return foods.find(function(food) { return String(food && food.id) === String(id); }) || null;
  }

  function nutritionMicrosExamplesTargetFromEntry(entry) {
    if (!entry) return null;
    const unit = nutritionMicrosExamplesUnit(entry.id, entry.unit);
    if (Array.isArray(entry.targetRange) && isFiniteNumber(entry.targetRange[1])) {
      return {
        value: Number(entry.targetRange[1]),
        unit,
        text: `${escapeHtml(entry.valueText)}; przykłady liczone dla wyższej wartości z zakresu`
      };
    }
    if (isFiniteNumber(entry.targetValue)) {
      return {
        value: Number(entry.targetValue),
        unit,
        text: escapeHtml(entry.valueText)
      };
    }
    return null;
  }

  function nutritionMicrosRenderFoodExamplesButton(entry, placement) {
    if (!entry || !entry.examplesAvailable) return '';
    const context = placement === 'table' ? 'nutrition-micros-examples-action--table' : 'nutrition-micros-examples-action--box';
    return `
      <div class="nutrition-micros-examples-action ${context}">
        <button type="button" class="nutrition-practice-cta nutrition-micros-examples-button" data-micros-examples="${escapeHtml(entry.id)}">
          Zobacz przykłady
        </button>
      </div>`;
  }

  function nutritionMicrosBuildExamplesFoodHtml(food, target, unit) {
    const value = Number(food && food.value);
    const percent = target && isFiniteNumber(target.value) && value > 0 ? (value / Number(target.value)) * 100 : null;
    const chipText = Number.isFinite(percent) ? `ok. ${nutritionMicrosFormatPercent(percent)} celu` : 'wartość orientacyjna';
    const chipTone = nutritionMicrosChipTone(percent);
    const portionText = nutritionMicrosPortionCountText(value, target && target.value);
    const mainBits = [
      nutritionMicrosFormatFoodValue(value, unit),
      portionText ? `tylko tym produktem: ${portionText}` : ''
    ].filter(Boolean);
    return `
      <div class="nutrition-practice-sheet-item nutrition-micros-examples-item">
        <div class="nutrition-practice-sheet-item-head">
          <strong>${escapeHtml(food && food.name)}</strong>
          <span class="nutrition-practice-sheet-item-portion">${escapeHtml(food && food.portion)}</span>
        </div>
        <span class="nutrition-practice-chip nutrition-practice-chip--${chipTone}">${escapeHtml(chipText)}</span>
        <div class="nutrition-practice-sheet-item-main">${escapeHtml(mainBits.join(' • '))}</div>
        ${food && food.note ? `<div class="nutrition-practice-sheet-item-note">${escapeHtml(food.note)}</div>` : ''}
      </div>`;
  }

  function nutritionMicrosBuildExamplesSetHtml(set, data, target, unit) {
    const foods = (Array.isArray(set && set.foodIds) ? set.foodIds : [])
      .map(function(id) { return nutritionMicrosFoodById(data, id); })
      .filter(Boolean);
    const total = foods.reduce(function(sum, food) {
      return sum + (isFiniteNumber(food.value) ? Number(food.value) : 0);
    }, 0);
    const percent = target && isFiniteNumber(target.value) && total > 0 ? (total / Number(target.value)) * 100 : null;
    const chipText = Number.isFinite(percent) ? `ok. ${nutritionMicrosFormatPercent(percent)} celu` : 'zestaw orientacyjny';
    const chipTone = nutritionMicrosChipTone(percent);
    const names = foods.map(function(food) { return `${food.name} (${food.portion})`; }).join(' + ');
    return `
      <div class="nutrition-practice-sheet-item nutrition-micros-examples-set">
        <div class="nutrition-practice-sheet-item-head">
          <strong>${escapeHtml(set && set.title)}</strong>
          <span class="nutrition-practice-sheet-item-portion">${escapeHtml(nutritionMicrosFormatFoodValue(total, unit))}</span>
        </div>
        <span class="nutrition-practice-chip nutrition-practice-chip--${chipTone}">${escapeHtml(chipText)}</span>
        <div class="nutrition-practice-sheet-item-main">${escapeHtml(names)}</div>
        <div class="nutrition-practice-sheet-item-note">To przykład orientacyjny, nie obowiązkowy jadłospis. W praktyce podaż składnika rozkłada się na wiele produktów w ciągu dnia.</div>
      </div>`;
  }

  function nutritionMicrosExamplesContextNote(nutrientId, profile) {
    const physiology = profile && profile.physiology ? String(profile.physiology) : 'default';
    if (String(nutrientId) === 'folate' && (physiology === 'pregnancy' || physiology === 'lactation')) {
      return 'Ciąża i laktacja: przykłady żywności pomagają zwiększać podaż folianów, ale nie zastępują zaleceń dotyczących kwasu foliowego/folianów ustalanych indywidualnie.';
    }
    if (String(nutrientId) === 'iron' && physiology === 'pregnancy') {
      return 'Ciąża: zapotrzebowanie na żelazo jest wysokie, a suplementacja bywa konieczna; przykłady żywności nie zastępują oceny morfologii, ferrytyny i zaleceń lekarza.';
    }
    if (String(nutrientId) === 'iodine' && (physiology === 'pregnancy' || physiology === 'lactation')) {
      return 'Ciąża i laktacja: zapotrzebowanie na jod jest większe; przy chorobach tarczycy lub suplementacji dawkę należy ustalić z lekarzem.';
    }
    return '';
  }

  function nutritionMicrosFindExamplesEntryInModel(model, nutrientId) {
    const id = String(nutrientId || '');
    const pools = [model && model.quickSet, model && model.vitamins, model && model.minerals];
    for (let i = 0; i < pools.length; i += 1) {
      const found = (Array.isArray(pools[i]) ? pools[i] : []).find(function(entry) {
        return String(entry && entry.id) === id;
      });
      if (found) return found;
    }
    return null;
  }

  function nutritionMicrosBuildFoodExamplesSheetContent(entry, model) {
    const data = entry && MICRONORMS_FOOD_EXAMPLES[String(entry.id || '')];
    const target = nutritionMicrosExamplesTargetFromEntry(entry);
    if (!data || !target || !isFiniteNumber(target.value) || target.value <= 0) return null;
    const unit = data.unit || target.unit || nutritionMicrosExamplesUnit(entry.id, entry.unit);
    const foodsHtml = (Array.isArray(data.foods) ? data.foods : [])
      .map(function(food) { return nutritionMicrosBuildExamplesFoodHtml(food, target, unit); })
      .join('');
    const setsHtml = (Array.isArray(data.sets) ? data.sets : [])
      .map(function(set) { return nutritionMicrosBuildExamplesSetHtml(set, data, target, unit); })
      .join('');
    const contextNote = nutritionMicrosExamplesContextNote(entry.id, model && model.profile);
    const cautionItems = uniqueStrings([contextNote].concat(data.cautions || [])).map(function(text) {
      return `<li>${escapeHtml(text)}</li>`;
    }).join('');
    const bodyHtml = `
      <section class="nutrition-practice-sheet-section nutrition-micros-examples-intro">
        <div class="nutrition-micros-examples-target">Cel z karty: <strong>${target.text}</strong></div>
        <p>${escapeHtml(data.intro || 'Poniżej pokazano przykładowe porcje produktów, które mogą pomagać pokrywać cel dzienny.')}</p>
      </section>
      <section class="nutrition-practice-sheet-section">
        <h4>Przykładowe porcje</h4>
        <div class="nutrition-practice-sheet-list">${foodsHtml}</div>
      </section>
      ${setsHtml ? `<section class="nutrition-practice-sheet-section"><h4>Przykładowe zestawy na dzień</h4><div class="nutrition-practice-sheet-list">${setsHtml}</div></section>` : ''}
      ${cautionItems ? `<section class="nutrition-practice-sheet-section nutrition-micros-examples-cautions"><h4>Ważne</h4><ul>${cautionItems}</ul></section>` : ''}`;
    return {
      title: `${data.label || entry.label} — przykłady pokrycia normy`,
      subtitle: 'Orientacyjne porcje żywności. Wartości mogą różnić się zależnie od produktu, producenta, obróbki i wielkości porcji.',
      bodyHtml,
      footerHtml: `${escapeHtml(data.sourceNote || 'Wartości są orientacyjne.')} Przykłady służą edukacji i nie zastępują indywidualnego jadłospisu.`
    };
  }

  function nutritionMicrosSetExamplesSheetHeight(root) {
    if (!root || !window || !window.visualViewport) return;
    try { root.style.setProperty('--nutrition-practice-sheet-vh', `${window.visualViewport.height}px`); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 1018 });
    }
  }
  }

  function nutritionMicrosEnsureFoodExamplesSheet() {
    let root = el('nutritionMicrosExamplesSheet');
    if (root) return root;
    if (!document || typeof document.createElement !== 'function' || !document.body) return null;
    root = document.createElement('div');
    root.id = 'nutritionMicrosExamplesSheet';
    root.className = 'nutrition-practice-sheet nutrition-micros-examples-sheet';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'nutritionMicrosExamplesSheetTitle');
    nutritionMicrosSetTrustedHtml(root, `
      <div class="nutrition-practice-sheet-backdrop" data-micros-examples-close></div>
      <div class="nutrition-practice-sheet-panel" role="document">
        <div class="nutrition-practice-sheet-handle" aria-hidden="true"></div>
        <header class="nutrition-practice-sheet-header">
          <div class="nutrition-practice-sheet-header-copy">
            <h3 id="nutritionMicrosExamplesSheetTitle"></h3>
            <p id="nutritionMicrosExamplesSheetSubtitle"></p>
          </div>
          <button type="button" class="nutrition-practice-sheet-close" aria-label="Zamknij" data-micros-examples-close>×</button>
        </header>
        <div id="nutritionMicrosExamplesSheetBody" class="nutrition-practice-sheet-body"></div>
        <footer id="nutritionMicrosExamplesSheetFooter" class="nutrition-practice-sheet-footer"></footer>
      </div>`, 'nutrition-micros:examples-sheet-shell');
    document.body.appendChild(root);
    root.addEventListener('click', function(event) {
      const target = event && event.target;
      if (target && typeof target.closest === 'function' && target.closest('[data-micros-examples-close]')) {
        nutritionMicrosCloseFoodExamplesSheet();
      }
    });
    nutritionMicrosSetExamplesSheetHeight(root);
    return root;
  }

  function nutritionMicrosCloseFoodExamplesSheet() {
    const root = el('nutritionMicrosExamplesSheet');
    if (!root) return;
    root.hidden = true;
    if (document && document.body && document.body.classList) document.body.classList.remove('nutrition-practice-sheet-open');
  }

  function nutritionMicrosOpenFoodExamplesSheet(nutrientId) {
    const model = nutritionMicrosBuildCardModel(nutritionMicrosReadProfileFromDom());
    const entry = nutritionMicrosFindExamplesEntryInModel(model, nutrientId);
    const content = nutritionMicrosBuildFoodExamplesSheetContent(entry, model);
    if (!content) return;
    const root = nutritionMicrosEnsureFoodExamplesSheet();
    if (!root) return;
    nutritionMicrosSetExamplesSheetHeight(root);
    const title = el('nutritionMicrosExamplesSheetTitle');
    const subtitle = el('nutritionMicrosExamplesSheetSubtitle');
    const body = el('nutritionMicrosExamplesSheetBody');
    const footer = el('nutritionMicrosExamplesSheetFooter');
    if (title) title.textContent = content.title || '';
    if (subtitle) subtitle.textContent = content.subtitle || '';
    if (body) nutritionMicrosSetTrustedHtml(body, content.bodyHtml || '', 'nutrition-micros:examples-body');
    if (footer) nutritionMicrosSetTrustedHtml(footer, content.footerHtml || '', 'nutrition-micros:examples-footer');
    root.hidden = false;
    if (document && document.body && document.body.classList) document.body.classList.add('nutrition-practice-sheet-open');
    const closeButton = root.querySelector && root.querySelector('[data-micros-examples-close].nutrition-practice-sheet-close');
    if (closeButton && closeButton.focus) {
      try { closeButton.focus({ preventScroll: true }); } catch (_) { try { closeButton.focus(); } catch (__) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', __, { line: 1084 });
    }
  } }
    }
  }

  function uniqueStrings(values) {
    const seen = new Set();
    const out = [];
    (Array.isArray(values) ? values : []).forEach((item) => {
      const key = String(item || '').trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(key);
    });
    return out;
  }

  function nutritionMicrosScopeText(scope) {
    const raw = String(scope || '').trim();
    if (raw === 'supplements_water_fortified_only') {
      return 'Dotyczy suplementów diety, wody i żywności wzbogacanej.';
    }
    if (raw === 'all_sources') {
      return 'Dotyczy całkowitego zwyczajowego spożycia ze wszystkich źródeł.';
    }
    return '';
  }

  function nutritionMicrosSafetyTypeLabel(safetyType, proMode) {
    const raw = String(safetyType || '').trim().toUpperCase();
    if (raw === 'SAFE_LEVEL') {
      return proMode ? 'Safe level' : 'Bezpieczny poziom';
    }
    if (raw === 'UL') {
      return proMode ? 'UL' : 'Górna granica bezpieczeństwa';
    }
    return proMode ? raw : raw;
  }

  function nutritionMicrosIsFemale1012(profile) {
    if (!profile || profile.sex !== 'female' || profile.physiology !== 'default') return false;
    return Number.isFinite(profile.ageMonths) && profile.ageMonths >= 120 && profile.ageMonths <= 155;
  }

  function nutritionMicrosBuildControls(profile) {
    if (!nutritionMicrosIsFemale1012(profile)) return null;
    const selected = normalizeVariantPreference(MICRONORMS_UI_STATE.ironVariant || (profile.variantPreference && profile.variantPreference.iron) || null);
    return {
      ironVariant: {
        selected: selected || '',
        label: 'Żelazo 10–12 lat',
        help: 'W tym wieku zapotrzebowanie na żelazo rośnie po wystąpieniu miesiączki.',
        options: [
          { value: '', label: 'Nie wiem — pokaż zakres' },
          { value: 'pre_menarche', label: 'Przed wystąpieniem miesiączki' },
          { value: 'post_menarche', label: 'Po wystąpieniu miesiączki' }
        ]
      }
    };
  }

  function nutritionMicrosReadProfileFromDom() {
    const ageYears = toNumber(el('age') && el('age').value);
    const ageMonths = toNumber(el('ageMonths') && el('ageMonths').value);
    const sexValue = (el('sex') && el('sex').value) || 'M';
    const weightKg = parseOptionalNumber(el('weight') && el('weight').value);
    const heightCm = parseOptionalNumber(el('height') && el('height').value);

    let physiology = 'default';
    const physiologyField = el('microsPhysiology') || el('physiology') || el('pregnancyState');
    if (physiologyField && physiologyField.value) physiology = physiologyField.value;

    const pregnancyToggle = el('microsPregnancy') || el('pregnancyToggle');
    const lactationToggle = el('microsLactation') || el('lactationToggle');
    if (pregnancyToggle && pregnancyToggle.checked) physiology = 'pregnancy';
    if (lactationToggle && lactationToggle.checked) physiology = 'lactation';

    let dataSource = '';
    try {
      const selectedSource = document && typeof document.querySelector === 'function'
        ? document.querySelector('input[name="dataSource"]:checked')
        : null;
      dataSource = normalizeDataSource(selectedSource && selectedSource.value);
    } catch (_) {
      dataSource = '';
    }

    const variantPreference = {};
    const ironVariantField = el('microsIronVariant') || el('ironVariant') || el('menarcheStatus') || el('menstruationStatus');
    const ironVariantValue = (ironVariantField && ironVariantField.value) || MICRONORMS_UI_STATE.ironVariant || null;
    if (ironVariantValue) variantPreference.iron = ironVariantValue;

    return {
      ageYears: isFiniteNumber(ageYears) ? ageYears : NaN,
      ageMonths: isFiniteNumber(ageMonths) ? ageMonths : (isFiniteNumber(ageYears) ? 0 : NaN),
      sex: sexValue,
      weightKg,
      heightCm,
      dataSource,
      physiology,
      variantPreference
    };
  }

  function nutritionMicrosResolveTargetType(entry) {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.target_type) return String(entry.target_type);
    if (isFiniteNumber(entry.rda)) return 'RDA';
    if (isFiniteNumber(entry.ai)) return 'AI';
    if (isFiniteNumber(entry.ear)) return 'EAR';
    return null;
  }

  function nutritionMicrosCollectAlternativeRange(alternatives, key) {
    const values = (Array.isArray(alternatives) ? alternatives : [])
      .map((item) => Number(item && item[key]))
      .filter((value) => Number.isFinite(value));
    if (!values.length) return null;
    return [Math.min.apply(null, values), Math.max.apply(null, values)];
  }

  function nutritionMicrosBuildEntryView(entry, proMode) {
    if (!entry) return null;
    const targetType = nutritionMicrosResolveTargetType(entry);
    const unresolved = !!entry.unresolved_variant;
    const view = {
      id: entry.nutrient_id,
      label: entry.nutrient_label_pl,
      category: entry.category,
      table: entry.table,
      unit: entry.unit,
      targetType,
      valueText: '—',
      summaryText: '',
      noteText: '',
      unresolved,
      earValue: isFiniteNumber(entry.ear) ? Number(entry.ear) : null,
      earRange: null,
      targetValue: null,
      targetRange: null,
      examplesAvailable: false
    };

    if (unresolved) {
      const targetKey = targetType === 'AI' ? 'ai' : (targetType === 'EAR' ? 'ear' : 'rda');
      const targetRange = nutritionMicrosCollectAlternativeRange(entry.alternatives, targetKey);
      const earRange = nutritionMicrosCollectAlternativeRange(entry.alternatives, 'ear');
      view.earRange = earRange;
      view.targetRange = targetRange;
      view.targetValue = targetRange && isFiniteNumber(targetRange[1]) ? Number(targetRange[1]) : null;
      view.examplesAvailable = !!proMode && nutritionMicrosHasFoodExamples(view.id) && isFiniteNumber(view.targetValue);
      view.valueText = nutritionMicrosFormatRange(targetRange, entry.unit, entry.nutrient_id);
      view.summaryText = proMode
        ? uniqueStrings([
            targetRange ? `${targetType || 'Cel'} ${nutritionMicrosFormatRange(targetRange, entry.unit, entry.nutrient_id)}` : '',
            earRange ? `EAR ${nutritionMicrosFormatRange(earRange, entry.unit, entry.nutrient_id)}` : ''
          ]).join(' • ')
        : 'Wartość zależy od tego, czy wystąpiła już miesiączka.';
      view.noteText = uniqueStrings((entry.alternatives || []).flatMap((item) => Array.isArray(item.notes) ? item.notes : [])).join(' • ');
      return view;
    }

    view.targetValue = isFiniteNumber(entry.target_value) ? Number(entry.target_value) : null;
    view.examplesAvailable = !!proMode && nutritionMicrosHasFoodExamples(view.id) && isFiniteNumber(view.targetValue);
    view.valueText = nutritionMicrosFormatValue(entry.target_value, entry.unit, entry.nutrient_id);
    if (proMode) {
      if (targetType === 'RDA' && isFiniteNumber(entry.rda) && isFiniteNumber(entry.ear)) {
        view.summaryText = `RDA ${nutritionMicrosFormatValue(entry.rda, entry.unit, entry.nutrient_id)} • EAR ${nutritionMicrosFormatValue(entry.ear, entry.unit, entry.nutrient_id)}`;
      } else if (targetType === 'AI' && isFiniteNumber(entry.ai)) {
        view.summaryText = `AI ${nutritionMicrosFormatValue(entry.ai, entry.unit, entry.nutrient_id)}`;
      } else if (targetType === 'EAR' && isFiniteNumber(entry.ear)) {
        view.summaryText = `EAR ${nutritionMicrosFormatValue(entry.ear, entry.unit, entry.nutrient_id)}`;
      }
    } else {
      if (targetType === 'RDA') view.summaryText = 'Zalecany cel dzienny';
      else if (targetType === 'AI') view.summaryText = 'Poziom wystarczający';
      else if (targetType === 'EAR') view.summaryText = 'Średnie zapotrzebowanie';
    }
    view.noteText = uniqueStrings(Array.isArray(entry.notes) ? entry.notes : []).join(' • ');
    return view;
  }

  function nutritionMicrosSortByQuickSetPriority(entries, quickSetIds) {
    const priority = new Map();
    (Array.isArray(quickSetIds) ? quickSetIds : []).forEach((id, index) => {
      if (!priority.has(id)) priority.set(String(id), index);
    });
    return (Array.isArray(entries) ? entries : []).slice().sort((a, b) => {
      const pa = priority.has(String(a && a.nutrient_id)) ? priority.get(String(a && a.nutrient_id)) : Number.MAX_SAFE_INTEGER;
      const pb = priority.has(String(b && b.nutrient_id)) ? priority.get(String(b && b.nutrient_id)) : Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return String(a && a.nutrient_label_pl || '').localeCompare(String(b && b.nutrient_label_pl || ''), 'pl');
    });
  }

  function nutritionMicrosBuildSafetyViewEntries(entries, proMode) {
    return (Array.isArray(entries) ? entries : []).map((entry) => {
      const typeLabel = nutritionMicrosSafetyTypeLabel(entry.safety_type, proMode);
      const scopeText = nutritionMicrosScopeText(entry.scope);
      const noteParts = uniqueStrings([scopeText].concat(Array.isArray(entry.notes) ? entry.notes : []));
      return {
        id: entry.nutrient_id,
        label: entry.nutrient_label_pl,
        typeLabel,
        valueText: nutritionMicrosFormatValue(entry.value, entry.unit, entry.nutrient_id),
        noteText: noteParts.join(' • '),
        table: entry.table,
        safetyType: entry.safety_type
      };
    });
  }


  function nutritionMicrosFormatDoseMicrograms(iu) {
    if (!Number.isFinite(iu)) return '—';
    return `${formatNumber(iu / 40, guessPrecision(iu / 40))} µg/dobę`;
  }

  function nutritionMicrosFormatSupplementDose(iu) {
    if (!Number.isFinite(iu)) return '—';
    return `${formatNumber(iu, 0)} IU/dobę (${nutritionMicrosFormatDoseMicrograms(iu)})`;
  }

  function nutritionMicrosAgeGroupLabel(ageMonths, physiology) {
    if (physiology === 'pregnancy') return 'ciąża';
    if (physiology === 'lactation') return 'laktacja';
    if (!Number.isFinite(ageMonths)) return 'brak wieku';
    if (ageMonths < 6) return 'niemowlę 0–5 miesięcy';
    if (ageMonths < 12) return 'niemowlę 6–11 miesięcy';
    if (ageMonths < 48) return 'dziecko 1–3 lata';
    if (ageMonths < 132) return 'dziecko 4–10 lat';
    if (ageMonths < 228) return 'młodzież 11–18 lat';
    if (ageMonths < 780) return 'dorosły 19–64 lata';
    if (ageMonths < 912) return 'senior 65–75 lat';
    return 'osoba powyżej 75 lat';
  }

  function nutritionMicrosBmiReasonText(profile) {
    const status = profile && profile.bmiStatus;
    const ageMonths = profile && Number.isFinite(profile.ageMonths) ? Number(profile.ageMonths) : NaN;
    const bmi = profile && Number.isFinite(profile.bmi) ? Number(profile.bmi) : NaN;
    const percentile = profile && Number.isFinite(profile.bmiPercentile) ? Number(profile.bmiPercentile) : NaN;
    if (!Number.isFinite(bmi)) return 'BMI: brak pełnych danych masy ciała i wzrostu.';
    if (Number.isFinite(ageMonths) && ageMonths < 216) {
      if (Number.isFinite(percentile)) {
        return `BMI ${formatNumber(bmi, 1)} kg/m², centyl BMI ${formatNumber(percentile, 0)} — ${nutritionMicrosBmiStatusLabel(status)}.`;
      }
      return `BMI ${formatNumber(bmi, 1)} kg/m² — nie udało się automatycznie wyznaczyć centyla BMI, więc nie dodano korekty dla nadwagi/otyłości.`;
    }
    return `BMI ${formatNumber(bmi, 1)} kg/m² — ${nutritionMicrosBmiStatusLabel(status)}.`;
  }

  function nutritionMicrosBuildMissingVitaminDModel(profile) {
    const ageMonths = profile && Number.isFinite(profile.ageMonths) ? Number(profile.ageMonths) : NaN;
    return {
      available: false,
      ageGroupLabel: nutritionMicrosAgeGroupLabel(ageMonths, profile && profile.physiology),
      teaserValue: 'uzupełnij masę i wzrost',
      doseText: '—',
      reasonItems: [
        `Wiek: ${nutritionMicrosAgeGroupLabel(ageMonths, profile && profile.physiology)}.`,
        'Aby dobrać dawkę profilaktyczną z zakresu zależnego od masy ciała i BMI, uzupełnij masę ciała i wzrost w karcie Dane użytkownika.'
      ],
      noteText: 'Po uzupełnieniu danych aplikacja przeliczy dawkę automatycznie.',
      warningText: 'W przypadku rozpoznanego niedoboru witaminy D dawkowanie powinno być ustalone indywidualnie, zwykle z uwzględnieniem stężenia 25(OH)D.',
      sourceText: 'Na podstawie polskich rekomendacji profilaktyki niedoboru witaminy D, norm NIZP PZH oraz zaleceń Endocrine Society 2024.'
    };
  }

  function nutritionMicrosBuildVitaminDSupplementModel(profile) {
    if (!profile || !Number.isFinite(profile.ageMonths)) return null;
    const ageMonths = Number(profile.ageMonths);
    const weightKg = Number.isFinite(profile.weightKg) ? Number(profile.weightKg) : NaN;
    const hasCompleteAnthro = !!profile.hasCompleteAnthro;
    const status = profile.bmiStatus || 'unknown';
    const elevatedBmi = status === 'overweight' || status === 'obesity';
    const obesity = status === 'obesity';
    const physiology = profile.physiology || 'default';
    const reasonItems = [];
    let iu = NaN;
    let contextText = '';
    let seasonText = '';
    let bmiWarning = '';
    let selectedFromHigherRange = false;

    reasonItems.push(`Wiek: ${nutritionMicrosAgeGroupLabel(ageMonths, physiology)}.`);
    if (Number.isFinite(weightKg)) reasonItems.push(`Masa ciała: ${formatNumber(weightKg, 1)} kg.`);
    reasonItems.push(nutritionMicrosBmiReasonText(profile));

    if (physiology === 'pregnancy' || physiology === 'lactation') {
      iu = 2000;
      contextText = physiology === 'pregnancy'
        ? 'Ciąża: przy braku kontroli 25(OH)D rekomendacje polskie wskazują zwykle 2000 IU/dobę.'
        : 'Laktacja: przy braku kontroli 25(OH)D rekomendacje polskie wskazują zwykle 2000 IU/dobę.';
      seasonText = 'W ciąży i w okresie laktacji dawkę najlepiej prowadzić pod kontrolą 25(OH)D i zaleceń lekarza.';
      if (elevatedBmi) {
        bmiWarning = 'Nadwaga lub otyłość może zwiększać praktyczne zapotrzebowanie na witaminę D, ale w ciąży i laktacji wyższe dawki powinny być ustalane indywidualnie z lekarzem.';
      }
    } else if (ageMonths < 6) {
      iu = 400;
      contextText = 'Niemowlęta 0–6 miesięcy: dawka profilaktyczna zwykle 400 IU/dobę od pierwszych dni życia.';
      seasonText = 'Dawka profilaktyczna jest zwykle całoroczna i niezależna od sposobu karmienia.';
    } else if (ageMonths < 12) {
      iu = 400;
      contextText = 'Niemowlęta 6–12 miesięcy: zakres profilaktyczny wynosi zwykle 400–600 IU/dobę; automatycznie wybrano 400 IU/dobę, bo aplikacja nie zna podaży z mieszanek i żywności wzbogacanej.';
      seasonText = 'Przy małej podaży witaminy D z diety lekarz może zalecić wyższą wartość z zakresu, np. 600 IU/dobę.';
    } else if (ageMonths < 48) {
      iu = elevatedBmi ? 1200 : 600;
      selectedFromHigherRange = elevatedBmi;
      contextText = elevatedBmi
        ? 'Dzieci 1–3 lata: dawka bazowa to zwykle 600 IU/dobę; przy nadwadze/otyłości uwzględniono wyższe praktyczne zapotrzebowanie.'
        : 'Dzieci 1–3 lata: dawka profilaktyczna zwykle 600 IU/dobę.';
      seasonText = 'W tej grupie wieku suplementacja jest zwykle całoroczna.';
    } else if (ageMonths < 132) {
      if (!hasCompleteAnthro) return nutritionMicrosBuildMissingVitaminDModel(profile);
      if (elevatedBmi) {
        if (weightKg < 30) iu = 1200;
        else if (weightKg <= 50) iu = 1600;
        else iu = 2000;
        selectedFromHigherRange = true;
      } else if (weightKg < 25) iu = 600;
      else if (weightKg <= 40) iu = 800;
      else iu = 1000;
      contextText = elevatedBmi
        ? 'Dzieci 4–10 lat: zakres bazowy to zwykle 600–1000 IU/dobę; przy nadwadze/otyłości dobrano wyższy zakres, nie przekraczając automatycznego limitu dla wieku.'
        : 'Dzieci 4–10 lat: dawkę wybrano z zakresu 600–1000 IU/dobę zależnie od masy ciała.';
      seasonText = 'Od maja do września suplementacja może nie być konieczna, jeżeli dziecko codziennie przebywa na słońcu z odkrytymi przedramionami i podudziami przez 15–30 minut między 10:00 a 15:00, bez filtra UV; jeżeli ten warunek nie jest spełniony, dawka profilaktyczna jest zalecana przez cały rok.';
    } else if (ageMonths < 228) {
      if (!hasCompleteAnthro) return nutritionMicrosBuildMissingVitaminDModel(profile);
      if (elevatedBmi) {
        if (weightKg < 70) iu = 2000;
        else if (weightKg <= 90) iu = 3000;
        else iu = 4000;
        selectedFromHigherRange = true;
      } else if (weightKg < 50) iu = 1000;
      else if (weightKg <= 70) iu = 1500;
      else iu = 2000;
      contextText = elevatedBmi
        ? 'Młodzież 11–18 lat: zakres bazowy to zwykle 1000–2000 IU/dobę; przy nadwadze/otyłości dobrano wyższą dawkę profilaktyczną zależnie od masy ciała.'
        : 'Młodzież 11–18 lat: dawkę wybrano z zakresu 1000–2000 IU/dobę zależnie od masy ciała.';
      seasonText = 'Od maja do września suplementacja może nie być konieczna, jeżeli dziecko codziennie przebywa na słońcu z odkrytymi przedramionami i podudziami przez 15–30 minut między 10:00 a 15:00, bez filtra UV; jeżeli ten warunek nie jest spełniony, dawka profilaktyczna jest zalecana przez cały rok.';
    } else if (ageMonths < 780) {
      if (!hasCompleteAnthro) return nutritionMicrosBuildMissingVitaminDModel(profile);
      if (status === 'obesity' || weightKg > 110) {
        iu = 4000;
        selectedFromHigherRange = true;
      } else if (status === 'overweight') {
        if (weightKg < 80) iu = 2000;
        else if (weightKg <= 110) iu = 3000;
        else iu = 4000;
        selectedFromHigherRange = true;
      } else if (weightKg < 60) iu = 1000;
      else if (weightKg <= 80) iu = 1500;
      else iu = 2000;
      contextText = elevatedBmi || weightKg > 110
        ? 'Dorośli 19–64 lata: zakres bazowy to zwykle 1000–2000 IU/dobę przy niewystarczającej ekspozycji słonecznej; przy nadwadze/otyłości dobrano wyższy zakres profilaktyczny.'
        : 'Dorośli 19–64 lata: dawkę wybrano z zakresu 1000–2000 IU/dobę zależnie od masy ciała i przy założeniu niewystarczającej ekspozycji słonecznej.';
      seasonText = 'To dawka do rozważenia przy niewystarczającej ekspozycji słonecznej i małej podaży z diety; nie jest dawką leczniczą.';
    } else if (ageMonths < 912) {
      if (!hasCompleteAnthro) return nutritionMicrosBuildMissingVitaminDModel(profile);
      if (status === 'obesity' || weightKg > 110) {
        iu = 4000;
        selectedFromHigherRange = true;
      } else if (status === 'overweight') {
        if (weightKg < 80) iu = 2000;
        else if (weightKg <= 110) iu = 3000;
        else iu = 4000;
        selectedFromHigherRange = true;
      } else if (weightKg < 60) iu = 1000;
      else if (weightKg <= 80) iu = 1500;
      else iu = 2000;
      contextText = elevatedBmi || weightKg > 110
        ? 'Seniorzy 65–75 lat: zakres bazowy to zwykle 1000–2000 IU/dobę przez cały rok; przy nadwadze/otyłości dobrano wyższą dawkę profilaktyczną.'
        : 'Seniorzy 65–75 lat: dawkę wybrano z zakresu 1000–2000 IU/dobę zależnie od masy ciała.';
      seasonText = 'W tej grupie wieku suplementacja jest zwykle całoroczna ze względu na mniejszą syntezę skórną.';
    } else {
      if (!hasCompleteAnthro) return nutritionMicrosBuildMissingVitaminDModel(profile);
      if (elevatedBmi) {
        iu = 4000;
        selectedFromHigherRange = true;
      } else if (weightKg < 60) iu = 2000;
      else if (weightKg <= 80) iu = 3000;
      else iu = 4000;
      contextText = elevatedBmi
        ? 'Osoby powyżej 75 lat: zakres profilaktyczny to zwykle 2000–4000 IU/dobę przez cały rok; przy nadwadze/otyłości dobrano górną wartość automatycznego zakresu.'
        : 'Osoby powyżej 75 lat: dawkę wybrano z zakresu 2000–4000 IU/dobę zależnie od masy ciała.';
      seasonText = 'W tej grupie wieku suplementacja jest zwykle całoroczna.';
    }

    if (elevatedBmi && !bmiWarning) {
      bmiWarning = obesity
        ? 'Otyłość: dawki witaminy D mogą być większe niż u osób z prawidłową masą ciała, ale długotrwałe stosowanie wyższych dawek powinno być konsultowane z lekarzem, zwłaszcza przy chorobach przewlekłych lub lekach wpływających na metabolizm witaminy D.'
        : 'Nadwaga: zapotrzebowanie praktyczne na witaminę D może być większe; aplikacja dobrała dawkę z wyższego zakresu profilaktycznego. Długotrwałą suplementację warto omówić z lekarzem lub dietetykiem.';
    }

    if (!Number.isFinite(iu)) return nutritionMicrosBuildMissingVitaminDModel(profile);
    return {
      available: true,
      doseIU: iu,
      doseMcg: iu / 40,
      doseText: nutritionMicrosFormatSupplementDose(iu),
      teaserValue: `${formatNumber(iu, 0)} IU/dobę`,
      ageGroupLabel: nutritionMicrosAgeGroupLabel(ageMonths, physiology),
      reasonItems: reasonItems.concat([contextText]).filter(Boolean),
      seasonText,
      bmiWarning,
      selectedFromHigherRange,
      noteText: 'Wartość AI w tabeli norm żywieniowych oznacza normę żywieniową, a nie dawkę leczniczą ani pełną rekomendację suplementacyjną.',
      warningText: 'Leczenie potwierdzonego niedoboru witaminy D wymaga indywidualnej decyzji medycznej, zwykle z uwzględnieniem stężenia 25(OH)D. Nie przekraczaj górnych granic bezpieczeństwa bez zaleceń lekarza.',
      sourceText: 'Na podstawie polskich rekomendacji profilaktyki niedoboru witaminy D, norm NIZP PZH oraz zaleceń Endocrine Society 2024. Przelicznik: 1 µg = 40 IU.'
    };
  }

  function nutritionMicrosBuildMessages(profile, resolved, ageBand, controls) {
    const messages = [];
    if (!Number.isFinite(profile && profile.ageMonths)) return messages;
    if (ageBand && ageBand.kind === 'infant_0_5') {
      messages.push({
        tone: 'info centered',
        text: 'W pierwszych 6 miesiącach życia nie pokazujemy tutaj liczbowych norm witamin i składników mineralnych. Przyjmuje się, że ich podaż odpowiada mleku kobiecemu.'
      });
      return messages;
    }
    const unresolved = (resolved && Array.isArray(resolved.nutrients) ? resolved.nutrients : []).filter((item) => item && item.unresolved_variant);
    if (unresolved.length) {
      messages.push({
        tone: controls && controls.ironVariant ? 'info' : 'warn',
        text: controls && controls.ironVariant
          ? 'Możesz doprecyzować normę żelaza, wybierając poniżej, czy wystąpiła już miesiączka.'
          : 'Niektóre wartości zależą od dodatkowych informacji. Dla żelaza u dziewcząt w wieku 10–12 lat znaczenie ma to, czy wystąpiła już miesiączka.'
      });
    }
    return messages;
  }

  function nutritionMicrosBuildCardModel(profile, options) {
    const normalized = nutritionMicrosNormalizeProfile(profile);
    if (!Number.isFinite(normalized.ageMonths)) return null;
    const resolved = nutritionMicrosResolveProfile(profile, options);
    if (!resolved) return null;

    const proMode = !!(window && window.professionalMode);
    const ageBand = nutritionMicrosGetAgeBand(normalized.ageYears, normalized.ageMonths % 12);
    const controls = nutritionMicrosBuildControls(resolved.profile);
    const quickEntriesSource = Array.isArray(resolved.quickSet) && resolved.quickSet.length
      ? resolved.quickSet
      : (Array.isArray(resolved.nutrients) ? resolved.nutrients.slice(0, 6) : []);

    const vitaminDSupplement = nutritionMicrosBuildVitaminDSupplementModel(resolved.profile);
    const quickSet = quickEntriesSource.map((entry) => nutritionMicrosBuildEntryView(entry, proMode)).filter(Boolean);
    quickSet.forEach((entry) => {
      if (entry && entry.id === 'vitamin_d' && vitaminDSupplement) {
        entry.vitaminDSupplement = vitaminDSupplement;
      }
    });
    const vitamins = (resolved.vitamins || []).map((entry) => nutritionMicrosBuildEntryView(entry, proMode)).filter(Boolean);
    const minerals = (resolved.minerals || []).map((entry) => nutritionMicrosBuildEntryView(entry, proMode)).filter(Boolean);

    const quickSetIds = quickEntriesSource.map((entry) => entry && entry.nutrient_id).filter(Boolean);
    const safetyUlEntries = nutritionMicrosBuildSafetyViewEntries(
      nutritionMicrosSortByQuickSetPriority(resolved.safety && resolved.safety.ul, quickSetIds),
      proMode
    );
    const safetySafeEntries = nutritionMicrosBuildSafetyViewEntries(
      nutritionMicrosSortByQuickSetPriority(resolved.safety && resolved.safety.safe_levels, quickSetIds),
      proMode
    );

    return {
      profile: resolved.profile,
      ageBand,
      proMode,
      controls,
      introText: proMode
        ? 'Pokazujemy docelowe wartości norm oraz, w trybie profesjonalnym, średnie zapotrzebowanie tam, gdzie zostało określone.'
        : 'Pokazujemy zalecany cel dzienny albo poziom wystarczający dla danej grupy wieku i płci.',
      quickSet,
      vitamins,
      minerals,
      vitaminDSupplement,
      safety: {
        introText: 'To nie są cele dzienne. To granice bezpieczeństwa, których nie należy zwyczajowo przekraczać przy suplementacji.',
        ul: safetyUlEntries,
        safeLevels: safetySafeEntries
      },
      messages: nutritionMicrosBuildMessages(normalized, resolved, ageBand, controls),
      meta: {
        sourceTitle: 'Normy żywienia dla populacji Polski, 2024',
        sourceTables: 'Tabele 23–32'
      }
    };
  }

  function nutritionMicrosRenderMessage(message) {
    if (!message) return '';
    const tone = String(message.tone || 'info').split(/\s+/).filter(Boolean);
    const classes = ['nutrition-norms-message'].concat(tone.map((part) => `nutrition-norms-message--${escapeHtml(part)}`)).join(' ');
    return `<div class="${classes}">${escapeHtml(message.text || '')}</div>`;
  }

  function nutritionMicrosRenderVitaminDSupplementPanel(model, panelId) {
    if (!model) return '';
    const safePanelId = escapeHtml(panelId || 'nutritionMicrosVitDSupplementPanel');
    const reasonHtml = (Array.isArray(model.reasonItems) ? model.reasonItems : [])
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');
    const doseHtml = model.available
      ? `<p class="nutrition-micros-vitd-dose"><strong>Sugerowana dawka profilaktyczna:</strong> ${escapeHtml(model.doseText)}</p>`
      : `<p class="nutrition-micros-vitd-dose nutrition-micros-vitd-dose--missing"><strong>Nie można jeszcze dobrać dawki:</strong> ${escapeHtml(model.teaserValue)}</p>`;
    const warningHtml = model.bmiWarning
      ? `<p class="nutrition-micros-vitd-warning">${escapeHtml(model.bmiWarning)}</p>`
      : '';
    const seasonHtml = model.seasonText
      ? `<p class="nutrition-micros-vitd-season">${escapeHtml(model.seasonText)}</p>`
      : '';

    return `
      <div class="nutrition-micros-vitd-supplement">
        <button type="button" class="nutrition-micros-vitd-toggle" aria-expanded="false" aria-controls="${safePanelId}">
          <span>Profilaktyczna suplementacja</span>
          <strong>${escapeHtml(model.teaserValue)}</strong>
          <span class="nutrition-micros-vitd-chevron" aria-hidden="true">▾</span>
        </button>
        <div id="${safePanelId}" class="nutrition-micros-vitd-panel" hidden>
          <div class="nutrition-micros-vitd-title">Witamina D — profilaktyczna suplementacja</div>
          ${doseHtml}
          ${model.noteText ? `<p>${escapeHtml(model.noteText)}</p>` : ''}
          ${reasonHtml ? `<ul class="nutrition-micros-vitd-reasons">${reasonHtml}</ul>` : ''}
          ${seasonHtml}
          ${warningHtml}
          ${model.warningText ? `<p class="nutrition-micros-vitd-warning">${escapeHtml(model.warningText)}</p>` : ''}
          ${model.sourceText ? `<p class="nutrition-micros-vitd-source">${escapeHtml(model.sourceText)}</p>` : ''}
        </div>
      </div>`;
  }

  function nutritionMicrosRenderQuickBox(entry) {
    if (!entry) return '';
    const badge = entry.targetType ? `<span class="nutrition-micros-badge">${nutritionMicrosAbbrHtml(entry.targetType)}</span>` : '';
    const note = entry.noteText ? `<p class="nutrition-micros-note">${escapeHtml(entry.noteText)}</p>` : '';
    const supplement = entry.vitaminDSupplement
      ? nutritionMicrosRenderVitaminDSupplementPanel(entry.vitaminDSupplement, 'nutritionMicrosVitDSupplementPanel')
      : '';
    const examples = entry.examplesAvailable ? nutritionMicrosRenderFoodExamplesButton(entry, 'box') : '';
    const classes = ['card', 'result-box', 'nutrition-micros-box'];
    if (entry.id === 'vitamin_d') classes.push('nutrition-micros-box--vitamin-d');
    return `
      <div class="${classes.join(' ')}">
        <div class="nutrition-micros-box-head">
          <h3>${escapeHtml(entry.label)}</h3>
          ${badge}
        </div>
        <div class="nutrition-norms-value nutrition-micros-value">${escapeHtml(entry.valueText)}</div>
        ${entry.summaryText ? `<p class="nutrition-norms-sub nutrition-micros-sub">${nutritionMicrosRenderSummaryText(entry.summaryText)}</p>` : ''}
        ${note}
        ${supplement}
        ${examples}
      </div>`;
  }

  function nutritionMicrosRenderControls(controls) {
    if (!controls || !controls.ironVariant) return '';
    const control = controls.ironVariant;
    const optionsHtml = (Array.isArray(control.options) ? control.options : []).map((option) => {
      const selected = String(option.value) === String(control.selected || '') ? ' selected' : '';
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
    }).join('');
    return `
      <div class="nutrition-micros-control-box">
        <label class="nutrition-micros-control-label" for="microsIronVariant">${escapeHtml(control.label)}</label>
        <select id="microsIronVariant" class="nutrition-micros-control-select">
          ${optionsHtml}
        </select>
        ${control.help ? `<p class="nutrition-micros-control-help">${escapeHtml(control.help)}</p>` : ''}
      </div>`;
  }

  function nutritionMicrosRenderSummaryText(text) {
    if (!text) return '';
    return escapeHtml(text).replace(/\b(RDA|AI|EAR|UL)\b/g, function(match) {
      return nutritionMicrosAbbrHtml(match);
    });
  }

  function nutritionMicrosRenderLegend() {
    const items = ['RDA', 'AI', 'EAR', 'UL'].map(function(code) {
      const item = MICRONORMS_ABBREVIATIONS[code];
      return `
        <div class="nutrition-micros-legend-item">
          <dt>${nutritionMicrosAbbrHtml(code)}</dt>
          <dd>${escapeHtml(item.description)}</dd>
        </div>`;
    }).join('');

    return `
      <div class="nutrition-micros-legend" aria-label="Legenda skrótów norm żywieniowych">
        <div class="nutrition-micros-legend-title">Legenda skrótów</div>
        <dl class="nutrition-micros-legend-list">${items}</dl>
        <p class="nutrition-micros-legend-note"><strong>Witamina D:</strong> 1 µg = 40 IU, dlatego wartości w tej karcie są podawane równolegle w µg/d i IU/dobę.</p>
      </div>`;
  }

  function nutritionMicrosGetEarColumnText(entry) {
    if (!entry) return '—';
    if (entry.unresolved) {
      return entry.earRange ? nutritionMicrosFormatRange(entry.earRange, entry.unit, entry.id) : '—';
    }
    if (entry.targetType === 'RDA' && isFiniteNumber(entry.earValue)) {
      return nutritionMicrosFormatValue(entry.earValue, entry.unit, entry.id);
    }
    return '—';
  }

  function nutritionMicrosRenderTableSection(title, entries, proMode) {
    const rows = (Array.isArray(entries) ? entries : []).map((entry) => {
      const typeCell = entry.targetType ? nutritionMicrosAbbrHtml(entry.targetType) : '—';
      const extraCell = proMode ? `<td>${escapeHtml(nutritionMicrosGetEarColumnText(entry))}</td>` : '';
      const examplesAction = entry.examplesAvailable ? nutritionMicrosRenderFoodExamplesButton(entry, 'table') : '';
      return `
        <tr>
          <td>
            <strong>${escapeHtml(entry.label)}</strong>
            ${entry.noteText ? `<div class="nutrition-micros-row-note">${escapeHtml(entry.noteText)}</div>` : ''}
            ${examplesAction}
          </td>
          <td>${escapeHtml(entry.valueText)}</td>
          <td>${typeCell}</td>
          ${extraCell}
        </tr>`;
    }).join('');

    const colgroup = proMode
      ? '<colgroup><col style="width:40%"><col style="width:24%"><col style="width:16%"><col style="width:20%"></colgroup>'
      : '<colgroup><col style="width:48%"><col style="width:28%"><col style="width:24%"></colgroup>';
    const head = proMode
      ? '<thead><tr><th>Składnik</th><th>Cel dzienny</th><th>Typ normy</th><th>' + nutritionMicrosAbbrHtml('EAR') + '</th></tr></thead>'
      : '<thead><tr><th>Składnik</th><th>Cel dzienny</th><th>Typ normy</th></tr></thead>';

    return `
      <details class="nutrition-micros-details">
        <summary>${escapeHtml(title)}</summary>
        <div class="nutrition-micros-table-wrap">
          <table class="nutrition-micros-table">
            ${colgroup}
            ${head}
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>`;
  }

  function nutritionMicrosRenderSafetyTable(title, entries, proMode) {
    if (!Array.isArray(entries) || !entries.length) return '';
    const head = proMode
      ? '<thead><tr><th>Składnik</th><th>Granica bezpieczeństwa</th><th>Typ</th></tr></thead>'
      : '<thead><tr><th>Składnik</th><th>Granica bezpieczeństwa</th></tr></thead>';
    const colgroup = proMode
      ? '<colgroup><col style="width:44%"><col style="width:26%"><col style="width:30%"></colgroup>'
      : '<colgroup><col style="width:60%"><col style="width:40%"></colgroup>';
    const rows = entries.map((entry) => {
      const typeCell = proMode ? `<td>${String(entry.typeLabel || '').toUpperCase() === 'UL' ? nutritionMicrosAbbrHtml('UL') : escapeHtml(entry.typeLabel)}</td>` : '';
      return `
        <tr>
          <td>
            <strong>${escapeHtml(entry.label)}</strong>
            ${entry.noteText ? `<div class="nutrition-micros-row-note">${escapeHtml(entry.noteText)}</div>` : ''}
          </td>
          <td>${escapeHtml(entry.valueText)}</td>
          ${typeCell}
        </tr>`;
    }).join('');
    return `
      <div class="nutrition-micros-safety-block">
        <div class="nutrition-micros-safety-title">${escapeHtml(title)}</div>
        <div class="nutrition-micros-table-wrap">
          <table class="nutrition-micros-table nutrition-micros-table--safety">
            ${colgroup}
            ${head}
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function nutritionMicrosRenderSafetySection(safety, proMode) {
    const hasUl = safety && Array.isArray(safety.ul) && safety.ul.length;
    const hasSafe = safety && Array.isArray(safety.safeLevels) && safety.safeLevels.length;
    if (!hasUl && !hasSafe) return '';
    return `
      <details class="nutrition-micros-details nutrition-micros-details--safety">
        <summary>Bezpieczeństwo suplementacji</summary>
        ${safety && safety.introText ? `<p class="nutrition-micros-safety-intro">${escapeHtml(safety.introText)}</p>` : ''}
        ${hasUl ? nutritionMicrosRenderSafetyTable('Górne granice bezpieczeństwa', safety.ul, proMode) : ''}
        ${hasSafe ? nutritionMicrosRenderSafetyTable('Bezpieczne poziomy spożycia', safety.safeLevels, proMode) : ''}
      </details>`;
  }

  function nutritionMicrosRenderCard(model) {
    const messagesHtml = (model.messages || []).length
      ? `<div class="nutrition-norms-messages">${(model.messages || []).map(nutritionMicrosRenderMessage).join('')}</div>`
      : '';
    const controlsHtml = model.controls ? nutritionMicrosRenderControls(model.controls) : '';
    const legendHtml = nutritionMicrosRenderLegend();

    if (model.ageBand && model.ageBand.kind === 'infant_0_5') {
      return `
        ${messagesHtml}
        ${model.vitaminDSupplement ? nutritionMicrosRenderVitaminDSupplementPanel(model.vitaminDSupplement, 'nutritionMicrosVitDSupplementPanelInfant') : ''}
        <div class="nutrition-norms-meta"><strong>${escapeHtml(model.meta.sourceTitle)}</strong><br>${escapeHtml(model.meta.sourceTables)}</div>`;
    }

    return `
      <p class="nutrition-norms-summary">${escapeHtml(model.introText)}</p>
      ${legendHtml}
      ${messagesHtml}
      ${controlsHtml}
      <div class="nutrition-micros-section-title">Najważniejsze dla Ciebie</div>
      <div class="nutrition-micros-grid">${(model.quickSet || []).map(nutritionMicrosRenderQuickBox).join('')}</div>
      ${nutritionMicrosRenderTableSection('Pełna tabela witamin', model.vitamins, model.proMode)}
      ${nutritionMicrosRenderTableSection('Pełna tabela składników mineralnych', model.minerals, model.proMode)}
      ${nutritionMicrosRenderSafetySection(model.safety, model.proMode)}
      <div class="nutrition-norms-meta"><strong>${escapeHtml(model.meta.sourceTitle)}</strong><br>${escapeHtml(model.meta.sourceTables)}</div>`;
  }

  function nutritionMicrosReadCollapseStates() {
    try {
      const persistence = (typeof window !== 'undefined') ? window.VildaPersistence : null;
      const parsed = persistence && typeof persistence.readPreferenceJSON === 'function'
        ? persistence.readPreferenceJSON('CARD_COLLAPSE_STATE', {})
        : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function nutritionMicrosIsCardOpen() {
    const states = nutritionMicrosReadCollapseStates();
    return states.nutritionMicrosCard === true;
  }

  function nutritionMicrosSaveCardOpen(open) {
    try {
      const persistence = (typeof window !== 'undefined') ? window.VildaPersistence : null;
      if (!persistence || typeof persistence.writePreferenceJSON !== 'function') return;
      const states = nutritionMicrosReadCollapseStates();
      states.nutritionMicrosCard = !!open;
      persistence.writePreferenceJSON('CARD_COLLAPSE_STATE', states, { force: true });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 1831 });
    }
  }
  }

  function nutritionMicrosApplyVisibility(available) {
    const section = el('nutritionMicrosSection');
    const card = el('nutritionMicrosCard');
    const toggle = el('toggleNutritionMicrosCard');
    const isAvailable = available !== false;
    const isOpen = isAvailable && nutritionMicrosIsCardOpen();

    if (section) section.style.display = isAvailable ? '' : 'none';
    if (card) card.style.display = isOpen ? 'block' : 'none';
    if (toggle) {
      toggle.setAttribute('aria-controls', 'nutritionMicrosCard');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
  }

  function bindNutritionMicrosToggle() {
    const toggle = el('toggleNutritionMicrosCard');
    if (!toggle || toggle.dataset.nutritionMicrosToggleBound === '1') return;

    toggle.setAttribute('aria-controls', 'nutritionMicrosCard');
    toggle.setAttribute('aria-expanded', nutritionMicrosIsCardOpen() ? 'true' : 'false');
    toggle.addEventListener('click', function() {
      const card = el('nutritionMicrosCard');
      const mount = el('nutritionMicrosMount');
      let currentlyOpen = nutritionMicrosIsCardOpen();
      try {
        if (card && typeof window.getComputedStyle === 'function') {
          currentlyOpen = window.getComputedStyle(card).display !== 'none';
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 1865 });
    }
  }

      const nextOpen = !currentlyOpen;
      nutritionMicrosSaveCardOpen(nextOpen);
      if (nextOpen && (!window.nutritionMicrosLastModel || !mount || !nutritionMicrosHasHtmlContent(mount))) {
        try { renderNutritionMicrosCardFromDom(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 1872 });
    }
  }
      }
      nutritionMicrosApplyVisibility(!!window.nutritionMicrosLastModel || !!(mount && nutritionMicrosHasHtmlContent(mount)));
    });
    toggle.dataset.nutritionMicrosToggleBound = '1';
  }

  function clearNutritionMicrosCard() {
    const mount = el('nutritionMicrosMount');
    if (mount) nutritionMicrosClearHtml(mount);
    window.nutritionMicrosLastModel = null;
    nutritionMicrosApplyVisibility(false);
  }

  function renderNutritionMicrosCardFromDom() {
    const card = el('nutritionMicrosCard');
    const mount = el('nutritionMicrosMount');
    if (!card || !mount) return null;

    const profile = nutritionMicrosReadProfileFromDom();
    const ageMonths = normalizeAgeMonths(profile);
    if (!Number.isFinite(ageMonths)) {
      clearNutritionMicrosCard();
      return null;
    }

    const model = nutritionMicrosBuildCardModel(profile);
    if (!model) {
      clearNutritionMicrosCard();
      return null;
    }

    nutritionMicrosSetTrustedHtml(mount, nutritionMicrosRenderCard(model), 'nutrition-micros:card');
    bindNutritionMicrosInteractions();
    bindNutritionMicrosToggle();
    window.nutritionMicrosLastModel = model;
    nutritionMicrosApplyVisibility(true);
    return model;
  }

  function ensureNutritionMicrosCardShell() {
    const title = 'Normy żywieniowe: witaminy i składniki mineralne';
    const anchor = el('nutritionNormsSection') || el('nutritionNormsCard');
    let section = el('nutritionMicrosSection');
    let card = el('nutritionMicrosCard');

    if (!section) {
      if (!document || typeof document.createElement !== 'function') return null;
      section = document.createElement('div');
      section.id = 'nutritionMicrosSection';
      section.style.display = 'none';
      section.style.marginTop = '0';

      if (card && card.parentNode) {
        card.parentNode.insertBefore(section, card);
        section.appendChild(card);
      } else if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(section, anchor.nextSibling);
      } else {
        return null;
      }
    }

    let toggle = el('toggleNutritionMicrosCard');
    if (!toggle) {
      if (!document || typeof document.createElement !== 'function') return null;
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.id = 'toggleNutritionMicrosCard';
      toggle.textContent = title;
      toggle.style.backgroundColor = '#00838d';
      toggle.style.color = 'white';
      toggle.style.padding = '0.6rem 1.2rem';
      toggle.style.border = 'none';
      toggle.style.borderRadius = '4px';
      toggle.style.fontSize = '1rem';
      toggle.style.fontWeight = '600';
      toggle.style.cursor = 'pointer';
      toggle.style.display = 'block';
      toggle.style.margin = '0 auto';
      section.insertBefore(toggle, section.firstChild);
    }

    if (!card) {
      if (!document || typeof document.createElement !== 'function') return null;
      card = document.createElement('div');
      card.id = 'nutritionMicrosCard';
      card.className = 'card nutrition-micros-card';
      card.style.display = 'none';
      card.style.marginTop = '1rem';
      section.appendChild(card);
    } else if (card.parentNode !== section) {
      section.appendChild(card);
    }

    if (!el('nutritionMicrosMount')) {
      nutritionMicrosSetTrustedHtml(card, '<h2 style="text-align:center;">' + title + '</h2><div id="nutritionMicrosMount"></div>', 'nutrition-micros:card-shell');
    }

    bindNutritionMicrosToggle();
    nutritionMicrosApplyVisibility(false);
    return card;
  }


  function nutritionMicrosEnsureTooltipElement() {
    let tooltip = el('nutritionMicrosTooltip');
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.id = 'nutritionMicrosTooltip';
    tooltip.className = 'nutrition-micros-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function nutritionMicrosPositionTooltip(target, tooltip) {
    if (!target || !tooltip) return;
    const rect = target.getBoundingClientRect();
    const gap = 8;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 320;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 320;
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    tooltip.hidden = false;
    tooltip.classList.add('is-measuring');
    const tipRect = tooltip.getBoundingClientRect();
    const tipWidth = tipRect.width || 260;
    const tipHeight = tipRect.height || 44;
    let left = rect.left + (rect.width / 2) - (tipWidth / 2);
    left = Math.max(8, Math.min(left, viewportWidth - tipWidth - 8));
    let top = rect.top - tipHeight - gap;
    if (top < 8) top = Math.min(rect.bottom + gap, viewportHeight - tipHeight - 8);
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.classList.remove('is-measuring');
  }

  function nutritionMicrosShowTooltip(target) {
    if (!target || !target.getAttribute) return;
    const text = target.getAttribute('data-micros-tooltip');
    if (!text) return;
    const tooltip = nutritionMicrosEnsureTooltipElement();
    tooltip.textContent = text;
    tooltip.hidden = false;
    target.setAttribute('aria-describedby', 'nutritionMicrosTooltip');
    nutritionMicrosPositionTooltip(target, tooltip);
    window.requestAnimationFrame(function() {
      tooltip.classList.add('is-visible');
      nutritionMicrosPositionTooltip(target, tooltip);
    });
  }

  function nutritionMicrosHideTooltip(target) {
    const tooltip = el('nutritionMicrosTooltip');
    if (!tooltip) return;
    tooltip.classList.remove('is-visible');
    tooltip.hidden = true;
    if (target && target.removeAttribute) target.removeAttribute('aria-describedby');
  }

  function bindNutritionMicrosAbbreviationTooltips() {
    if (!document || document.__nutritionMicrosAbbrTooltipsBound) return;
    document.addEventListener('mouseover', function(event) {
      const target = event && event.target && typeof event.target.closest === 'function'
        ? event.target.closest('.nutrition-micros-abbr[data-micros-tooltip]')
        : null;
      if (!target) return;
      nutritionMicrosShowTooltip(target);
    });
    document.addEventListener('mouseout', function(event) {
      const target = event && event.target && typeof event.target.closest === 'function'
        ? event.target.closest('.nutrition-micros-abbr[data-micros-tooltip]')
        : null;
      if (!target) return;
      const related = event.relatedTarget;
      if (related && typeof target.contains === 'function' && target.contains(related)) return;
      nutritionMicrosHideTooltip(target);
    });
    document.addEventListener('focusin', function(event) {
      const target = event && event.target && event.target.matches && event.target.matches('.nutrition-micros-abbr[data-micros-tooltip]')
        ? event.target
        : null;
      if (target) nutritionMicrosShowTooltip(target);
    });
    document.addEventListener('focusout', function(event) {
      const target = event && event.target && event.target.matches && event.target.matches('.nutrition-micros-abbr[data-micros-tooltip]')
        ? event.target
        : null;
      if (target) nutritionMicrosHideTooltip(target);
    });
    document.addEventListener('keydown', function(event) {
      if (event && event.key === 'Escape') {
        nutritionMicrosHideTooltip(document.activeElement);
        nutritionMicrosCloseFoodExamplesSheet();
      }
    });
    window.addEventListener('scroll', function() { nutritionMicrosHideTooltip(document.activeElement); }, true);
    window.addEventListener('resize', function() { nutritionMicrosHideTooltip(document.activeElement); });
    document.__nutritionMicrosAbbrTooltipsBound = true;
  }

  function bindNutritionMicrosInteractions() {
    const mount = el('nutritionMicrosMount');
    if (!mount || mount.__nutritionMicrosBound) return;
    mount.addEventListener('change', function(event) {
      const target = event && event.target;
      if (!target || target.id !== 'microsIronVariant') return;
      MICRONORMS_UI_STATE.ironVariant = target.value || null;
      renderNutritionMicrosCardFromDom();
    });
    mount.addEventListener('click', function(event) {
      const target = event && event.target;
      const examplesButton = target && typeof target.closest === 'function' ? target.closest('[data-micros-examples]') : null;
      if (examplesButton) {
        event.preventDefault();
        nutritionMicrosOpenFoodExamplesSheet(examplesButton.getAttribute('data-micros-examples'));
        return;
      }
      const button = target && typeof target.closest === 'function' ? target.closest('.nutrition-micros-vitd-toggle') : null;
      if (!button) return;
      const panelId = button.getAttribute('aria-controls');
      const panel = panelId ? el(panelId) : null;
      const nextOpen = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
      if (panel) panel.hidden = !nextOpen;
    });
    mount.__nutritionMicrosBound = true;
  }

  function wrapNutritionMicrosIntoUpdate() {
    if (typeof window.update !== 'function' || window.update.__nutritionMicrosWrapped) return;
    const original = window.update;
    const wrapped = function nutritionMicrosWrappedUpdate() {
      const result = original.apply(this, arguments);
      try { renderNutritionMicrosCardFromDom(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 2108 });
    }
  }
      return result;
    };
    wrapped.__nutritionMicrosWrapped = true;
    wrapped.__nutritionMicrosOriginal = original;
    window.update = wrapped;
    try { update = wrapped; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 2114 });
    }
  }
  }

  function initMicronormsModule() {
    ensureNutritionMicrosCardShell();
    bindNutritionMicrosAbbreviationTooltips();
    bindNutritionMicrosProfileListeners();
    if (MICRONORMS_INIT_DONE) {
      scheduleNutritionMicrosBootstrapRender();
      return;
    }
    MICRONORMS_INIT_DONE = true;
    wrapNutritionMicrosIntoUpdate();
    try {
      window.addEventListener('nutritionMicrosDataReady', function() {
        try { renderNutritionMicrosCardFromDom(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 2129 });
    }
  }
      });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 2131 });
    }
  }
    try {
      window.addEventListener('vildaResultsModeChanged', function() {
        try { renderNutritionMicrosCardFromDom(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 2136 });
    }
  }
      });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 2138 });
    }
  }
    try {
      window.addEventListener('pageshow', function() {
        bindNutritionMicrosProfileListeners();
        scheduleNutritionMicrosBootstrapRender();
      });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 2146 });
    }
  }
    try {
      const bootOnWindowLoad = function() {
        bindNutritionMicrosProfileListeners();
        scheduleNutritionMicrosBootstrapRender();
      };
      if (typeof window.vildaOnLoad === 'function') {
        window.vildaOnLoad('nutrition-micros:load-refresh', bootOnWindowLoad, { once: false });
      } else {
        window.addEventListener('load', bootOnWindowLoad, { once: true, passive: true });
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 2159 });
    }
  }
    try {
      nutritionMicrosEnsureData()
        .then(function() { return renderNutritionMicrosCardFromDom(); })
        .catch(function() {
          try { renderNutritionMicrosCardFromDom(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 2166 });
    }
  }
        });
    } catch (_) {
      try { renderNutritionMicrosCardFromDom(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 2169 });
    }
  }
    }
    scheduleNutritionMicrosBootstrapRender();
  }

  window.nutritionMicrosEnsureData = nutritionMicrosEnsureData;
  window.nutritionMicrosGetDataSnapshot = nutritionMicrosGetDataSnapshot;
  window.nutritionMicrosNormalizeProfile = nutritionMicrosNormalizeProfile;
  window.nutritionMicrosGetAgeBand = nutritionMicrosGetAgeBand;
  window.nutritionMicrosResolveProfile = nutritionMicrosResolveProfile;
  window.nutritionMicrosResolveProfileAsync = nutritionMicrosResolveProfileAsync;
  window.nutritionMicrosSelectQuickSet = selectQuickSet;
  window.nutritionMicrosReadProfileFromDom = nutritionMicrosReadProfileFromDom;
  window.nutritionMicrosBuildCardModel = nutritionMicrosBuildCardModel;
  window.nutritionMicrosBuildVitaminDSupplementModel = nutritionMicrosBuildVitaminDSupplementModel;
  window.nutritionMicrosBuildFoodExamplesSheetContent = nutritionMicrosBuildFoodExamplesSheetContent;
  window.renderNutritionMicrosCardFromDom = renderNutritionMicrosCardFromDom;
  window.clearNutritionMicrosCard = clearNutritionMicrosCard;

  if (typeof window !== 'undefined' && typeof window.vildaOnReady === 'function') {
    window.vildaOnReady('nutrition-micros:init', initMicronormsModule);
  } else if (document && typeof document.addEventListener === 'function') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initMicronormsModule, { once: true });
    } else {
      initMicronormsModule();
    }
  } else {
    try { initMicronormsModule(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('nutrition_micros.js', _, { line: 2197 });
    }
  }
  }
})(window, document);
