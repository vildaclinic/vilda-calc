(function(){function e(){["percSbp","zSbp","percDbp","zDbp","headCircPercentile","headCircSD","chestCircPercentile","chestCircSD","wfhPercentile","wfhSD","wfhSource","colePercentValue","advancedGrowthData"].forEach(function(i){try{let a=window[i];Object.defineProperty(window,i,{configurable:!0,enumerable:!0,get(){return a},set(n){if(a=n,typeof updateProfessionalSummaryCard=="function")try{updateProfessionalSummaryCard()}catch(r){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",r,{line:12550})}}})}catch(a){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",a,{line:12554})}})}typeof window<"u"&&typeof window.vildaAppOnReady=="function"&&window.vildaAppOnReady("app:summary-live-updates",e)})();function getProfessionalSummaryLineTone(e){try{if(!e||typeof e!="string")return"normal";const t=e.toLowerCase(),i=typeof getAgeDecimal=="function"?getAgeDecimal():NaN,a=typeof patientReportIsAdultAgeForCurrentMode=="function"?patientReportIsAdultAgeForCurrentMode(i):typeof patientReportIsAdultAge=="function"?patientReportIsAdultAge(i):isFinite(i)&&i>=18,n=parseFloat(document.getElementById("weight")?.value)||0,r=parseFloat(document.getElementById("height")?.value)||0,o=a&&r>0&&n>0&&typeof BMI=="function"?BMI(n,r):null,l=a?patientReportGetAdultBmiAssessment(o):null,c=s=>{const p=s.match(/([<>]?)\s*([\d]+(?:[\.,]\d+)?)[^\d]*centyl/i);if(!p)return null;let d=parseFloat(String(p[2]).replace(",","."));return p[1]&&p[1].includes("<")&&(d=0),p[1]&&p[1].includes(">")&&(d=100),isNaN(d)?null:d};if(a){if(t.startsWith("wska\u017Anik cole")||t.startsWith("wzrost")||t.startsWith("tempo wzrastania")||t.startsWith("aktualne tempo")||t.startsWith("sds tempa")||t.startsWith("mph")||t.startsWith("hsds"))return"normal";if(t.startsWith("ci\u015Bnienie")){if(window.adultVitalsApi&&typeof window.adultVitalsApi.getState=="function"&&typeof window.adultVitalsApi.classifyBloodPressure=="function"){const s=window.adultVitalsApi.getState(),d=(window.adultVitalsApi&&typeof window.adultVitalsApi.hasAnyMeasurement=="function"?window.adultVitalsApi.hasAnyMeasurement(s):!1)?s.guidelineKey:"ESC",u=window.adultVitalsApi.classifyBloodPressure(s.sbp,s.dbp,d);return u&&u.tone||"normal"}return"normal"}if(t.startsWith("t\u0119tno")||t.startsWith("hr ")){if(window.adultVitalsApi&&typeof window.adultVitalsApi.getState=="function"&&typeof window.adultVitalsApi.classifyHeartRate=="function"){const s=window.adultVitalsApi.getState(),p=window.adultVitalsApi.classifyHeartRate(s.hr,{athlete:s.athlete,betaBlocker:s.betaBlocker});return p&&p.tone||"normal"}return"normal"}if(t.startsWith("waga")||t.startsWith("bmi"))return l&&l.tone||"normal"}if(t.startsWith("bmi:")){const s=parseFloat(document.getElementById("weight")?.value)||0,p=parseFloat(document.getElementById("height")?.value)||0,d=typeof getAgeDecimal=="function"?getAgeDecimal():0,u=document.getElementById("sex")?.value||"M";if(p>0&&s>0){let w=null;if(typeof BMI=="function"&&(w=BMI(s,p)),w&&!isNaN(w)){let f=null;const g=Math.round(d*12);typeof bmiCategoryChild=="function"&&d>=CHILD_AGE_MIN&&d<=CHILD_AGE_MAX?f=bmiCategoryChild(w,u,g):typeof bmiCategory=="function"&&(f=bmiCategory(w));/* P-TON-3: ton BMI z koloru silnika. Dotad brano etykiete z bmiCategoryChild/bmiCategory
   i dopasowywano napis. Skutek: dziecko z centylem BMI ponizej 3 i dorosly z BMI < 18,5
   dostawali w podsumowaniu ton ostrzegawczy, a na karcie glownej — alarmowy. */const KB=d>=CHILD_AGE_MIN&&d<=CHILD_AGE_MAX&&typeof bmiKategoriaChild=="function"?bmiKategoriaChild(w,u,g):typeof bmiKategoriaDorosly=="function"?bmiKategoriaDorosly(w):null,kk=KB&&KB.kolor||null;if(kk)return kk==="alert"?"danger":"warn";const b=String(f||"");return b?"normal":"normal"}}return"normal"}if(t.startsWith("wska\u017Anik cole")){/* P-TON-3: wartosc wskaznika bierzemy z window.colePercentValue — tej samej liczby, z ktorej
   zbudowano wiersz — a kategorie z VildaBmi.kategoriaCole. Dotad liczba byla WYCIAGANA
   WYRAZENIEM REGULARNYM Z WYDRUKOWANEGO TEKSTU, wiec zmiana formatu wiersza gasila kolor.
   Progi sa te same (90/110/120), wiec zaden werdykt sie nie zmienia. */const cv=typeof window<"u"&&typeof window.colePercentValue=="number"?window.colePercentValue:null,CB=typeof window<"u"?window.VildaBmi:null;if(cv!==null&&isFinite(cv)&&CB&&typeof CB.kategoriaCole=="function"){const kc=CB.kategoriaCole(cv);if(kc&&kc.kolor)return kc.kolor==="alert"?"danger":"warn"}return"normal"}if(t.startsWith("whr:")){const s=typeof getAgeDecimal=="function"?getAgeDecimal():0,p=document.getElementById("sex")?.value||"M",d=parseFloat(document.getElementById("weight")?.value)||0,u=parseFloat(document.getElementById("height")?.value)||0,w=parseFloat(document.getElementById("waistCm")?.value)||0,f=parseFloat(document.getElementById("hipCm")?.value)||0;let g=null;typeof BMI=="function"&&d>0&&u>0&&(g=BMI(d,u));const b=typeof window<"u"&&typeof window.bmiPercentileValue=="number"?window.bmiPercentileValue:null,z=typeof window<"u"&&typeof window.coleCatValue=="string"?window.coleCatValue:null;if(typeof interpretWHR=="function"&&s&&p&&w>0&&f>0)try{const m=interpretWHR(s,p,w,f,g,b,z);if(m&&m.state)return m.state==="bad"?"danger":m.state==="warn"?"warn":"normal"}catch(m){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",m,{line:12680})}const k=e.match(/whr:\s*([\d]+(?:[\.,]\d+)?)/i);if(k){const m=parseFloat(String(k[1]).replace(",","."));let h=.9;try{typeof ADULT_WHR_LIMIT<"u"&&ADULT_WHR_LIMIT&&(h=ADULT_WHR_LIMIT[p]||h)}catch(y){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",y,{line:12690})}if(m>h)return"danger"}return"normal"}if(t.startsWith("hsds")){try{const s=e.match(/hsds\s*[-‑\u2212]\s*mpsds\s*[:=]\s*([-+\u2212]?\d+(?:[\.,]\d+)?)/i);if(s){const p=parseFloat(String(s[1]).replace(",",".").replace("\u2212","-"));if(!isNaN(p)){const d=Math.abs(p);if(d>=2)return"danger";if(d>=1.5)return"warn"}}}catch(s){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",s,{line:12707})}return"normal"}if(t.startsWith("mph")){try{const s=e.match(/(?:z[-‑]?score\s*[:=]|mpsds)\s*([-+\u2212]?\d+(?:[\.,]\d+)?)/i);if(s){const p=parseFloat(String(s[1]).replace(",",".").replace("\u2212","-"));if(!isNaN(p)){const d=Math.abs(p);if(d>=2)return"danger";if(d>=1.5)return"warn"}}}catch(s){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",s,{line:12722})}return"normal"}/* P-TEMPO etap 2: SDS tempa to liczba opisowa, nie alarm (decyzja wlasciciela 2026-09-09) — nigdy nie koloruje sie jak centyl wzrostu. */if(t.startsWith("sds tempa"))return"normal";if(t.startsWith("aktualne tempo")||t.startsWith("tempo wzrastania"))return t.includes("poniżej normy")?"danger":t.includes("do oceny")?"warn":"normal";if(t.includes("centyl")){const s=c(e);if(s!==null){if(t.startsWith("proporcja masy do wysoko\u015Bci")&&t.includes("(who"))return s<2.3||s>99.85?"danger":s>97.7?"warn":"normal";if(t.startsWith("obw\xF3d g\u0142owy")||t.startsWith("obw\xF3d klatki")||t.startsWith("proporcja masy do wysoko\u015Bci"))return s<3||s>97?"danger":s<10||s>90?"warn":"normal";const p=t.startsWith("waga")||t.startsWith("weight"),d=t.startsWith("wzrost")||t.startsWith("height");/* P-TON-3: centyl bierzemy z globalnej wartosci wyniku, nie z tekstu wiersza; pasmo masy
   pochodzi z silnika (te same progi 3/10/90/97, co karta glowna i karta raportu po P-MASA).
   Rozjazd, ktory to zdejmuje: centyl masy dokladnie 3,0 mial tu alarm, a na obu kartach
   juz ostrzezenie. Wzrost zachowuje wlasna regule — nie nalezy do tej serii. */if(p){const wv=typeof window<"u"&&typeof window.lastWeightPercentile=="number"?window.lastWeightPercentile:s,MS=typeof window<"u"?window.VildaMasa:null;if(MS&&typeof MS.kategoria=="function"){const km=MS.kategoria(wv);if(km&&km.klucz!=="brak")return km.kolor==="alert"?"danger":km.kolor==="improve"?"warn":"normal"}return wv<3||wv>=97?"danger":wv<10||wv>=90?"warn":"normal"}if(d){const hv=typeof window<"u"&&typeof window.lastHeightPercentile=="number"?window.lastHeightPercentile:s;return hv<=3?"danger":hv>3&&hv<10||hv>97?"warn":"normal"}if(s<=3||s>=97)return"danger";if(s<=5||s>=95)return"warn"}}return"normal"}catch{return"normal"}}function getProfessionalSummaryLineColor(e){const t=getProfessionalSummaryLineTone(e);return t==="danger"?"var(--danger)":t==="warn"?"#c75d00":"var(--primary)"}function patientReportFormatSummaryLineWithValue(e,t,i){const a=String(e||"").trim(),n=String(t||"").trim(),r=String(i||"").trim();return n&&r?`${a}: ${n}, ${r}`:n?`${a}: ${n}`:r?`${a}: ${r}`:a?`${a}:`:""}function patientReportFormatNutritionNormsKcal(e){return typeof e!="number"||!isFinite(e)?"\u2014":`${patientReportFormatNumber(e,0)} kcal/d`}function patientReportFormatNutritionNormsPercentRange(e){if(!Array.isArray(e)||e.length!==2)return"\u2014";const t=e[0],i=e[1];return typeof t=="number"&&isFinite(t)&&typeof i=="number"&&isFinite(i)?Math.abs(t-i)<.5?`oko\u0142o ${patientReportFormatNumber((t+i)/2,0)}% energii`:`${patientReportFormatNumber(t,0)}\u2013${patientReportFormatNumber(i,0)}% energii`:"\u2014"}function patientReportFormatNutritionNormsGramRange(e,t){if(!Array.isArray(e)||e.length!==2)return"\u2014";const i=e[0],a=e[1];if(!(typeof i=="number"&&isFinite(i)&&typeof a=="number"&&isFinite(a)))return"\u2014";const n=Number.isFinite(t)?t:0;return Math.abs(i-a)<Math.max(.05,n===0?.5:.05)?`${patientReportFormatNumber((i+a)/2,n)} g/d`:`${patientReportFormatNumber(i,n)}\u2013${patientReportFormatNumber(a,n)} g/d`}function patientReportBuildNutritionNormsModelFromCurrentState(e){if(typeof window>"u"||typeof window.nutritionNormsBuildCardModel!="function")return null;const t=typeof getAgeDecimal=="function"?getAgeDecimal():parseFloat(document.getElementById("age")?.value),i=parseFloat(document.getElementById("ageMonths")?.value||"0"),a=document.getElementById("sex")?.value||"M",n=parseFloat(document.getElementById("weight")?.value),r=parseFloat(document.getElementById("height")?.value),o=parseFloat(document.getElementById("palFactor")?.value),c={...window.nutritionNormsUiState&&typeof window.nutritionNormsUiState=="object"?window.nutritionNormsUiState:{},...e||{}};try{return window.nutritionNormsBuildCardModel({ageYears:t,ageMonthsOpt:i,sex:a,weightKg:n,heightCm:r,mainPal:o},c)}catch{return null}}function patientReportBuildNutritionNormsPalLabel(e){const t=e&&e.energy;if(!t)return"";if(t.palMode==="fixed"&&typeof t.usedPal=="number"&&isFinite(t.usedPal))return`PAL ${patientReportFormatNumber(t.usedPal,1)}`;const i=Array.isArray(t.items)?t.items.filter(a=>a&&typeof a.pal=="number"&&isFinite(a.pal)):[];return t.palMode==="range"&&i.length>1?`zakres PAL ${patientReportFormatNumber(i[0].pal,1)}\u2013${patientReportFormatNumber(i[i.length-1].pal,1)}`:t.palMode==="single"&&e&&e.ageBand&&e.ageBand.kind==="infant_6_11"?"wg Butte":""}function patientReportBuildNutritionNormsActivityDescription(e){const t=e&&e.energy;if(!t)return"";if(e&&e.ageBand&&e.ageBand.kind==="infant_6_11")return"Przedstawiono obliczenia energii wed\u0142ug modelu dla niemowl\u0105t w drugiej po\u0142owie 1. roku \u017Cycia.";if(t.palMode==="range"||t.mode==="range")return"Przedstawiono obliczenia dla zakresu poziom\xF3w aktywno\u015Bci fizycznej.";const i=Number(t.usedPal);if(!isFinite(i))return"";let a="wybranego poziomu aktywno\u015Bci fizycznej";return i<=1.4?a="ma\u0142ej aktywno\u015Bci fizycznej":i<=1.6?a="umiarkowanej aktywno\u015Bci fizycznej":i<=1.8?a="aktywnego trybu \u017Cycia":a="bardzo aktywnego trybu \u017Cycia",`Przedstawiono obliczenia dla ${a}.`}function patientReportBuildNutritionNormsActivityPhrase(e){const t=e&&e.energy;if(!t)return"";if(e&&e.ageBand&&e.ageBand.kind==="infant_6_11")return"wed\u0142ug modelu dla niemowl\u0105t w drugiej po\u0142owie 1. roku \u017Cycia";if(t.palMode==="range"||t.mode==="range")return"dla zakresu poziom\xF3w aktywno\u015Bci fizycznej";const i=Number(t.usedPal);return isFinite(i)?i<=1.4?"przy ma\u0142ej aktywno\u015Bci fizycznej":i<=1.6?"przy umiarkowanej aktywno\u015Bci fizycznej":i<=1.8?"przy aktywnym trybie \u017Cycia":"przy bardzo aktywnym trybie \u017Cycia":""}function patientReportBuildNutritionNormsEnergyText(e){if(!e||!e.energy)return"\u2014";const t=e.energy;return e.ageBand&&e.ageBand.kind==="infant_0_6"?"brak norm liczbowych":t.available?(t.mode==="single"||t.mode==="fixed")&&Array.isArray(t.items)&&t.items[0]?patientReportFormatNutritionNormsKcal(t.items[0].teeKcal):Array.isArray(t.range)&&t.range.length===2?t.range[0]===t.range[1]?patientReportFormatNutritionNormsKcal(t.range[0]):`${patientReportFormatNumber(t.range[0],0)}\u2013${patientReportFormatNumber(t.range[1],0)} kcal/d`:"\u2014":"\u2014"}function patientReportBuildNutritionNormsProteinText(e,t){const i=t||{},a=e&&e.protein;if(!a||!a.targets)return"\u2014";const n=a.targets;if(!n.available)return"brak norm liczbowych";const r=patientReportFormatNutritionNormsPercentRange(a.planningPercentRange),o=patientReportFormatNutritionNormsGramRange(a.planningGramRange,0);return i.planning?r!=="\u2014"&&o!=="\u2014"?`${r} \u2794 ${o}`:o!=="\u2014"?o:r!=="\u2014"?r:"\u2014":a.main?i.includeEar&&i.verbose?`\u015Arednie zapotrzebowanie (EAR): ${patientReportFormatNumber(a.main.earGDay,0)} g/d \u2022 Zalecane spo\u017Cycie (RDA): ${patientReportFormatNumber(a.main.rdaGDay,0)} g/d`:i.includeEar?`${patientReportFormatNumber(a.main.earGDay,0)} / ${patientReportFormatNumber(a.main.rdaGDay,0)} g/d`:`${patientReportFormatNumber(a.main.rdaGDay,0)} g/d`:i.includeEar&&i.verbose?`\u015Arednie zapotrzebowanie (EAR): ${patientReportFormatNumber(n.ear_g_per_kg,2)} g/kg \u2022 Zalecane spo\u017Cycie (RDA): ${patientReportFormatNumber(n.rda_g_per_kg,2)} g/kg`:i.includeEar?`${patientReportFormatNumber(n.ear_g_per_kg,2)} / ${patientReportFormatNumber(n.rda_g_per_kg,2)} g/kg`:`${patientReportFormatNumber(n.rda_g_per_kg,2)} g/kg`}function patientReportBuildNutritionNormsMacroShortText(e){if(!e)return"\u2014";const t=patientReportFormatNutritionNormsGramRange(e.gramRange,0);return t!=="\u2014"?t:patientReportFormatNutritionNormsPercentRange(e.percentRange)}function patientReportBuildNutritionNormsMacroDetailedText(e){if(!e)return"\u2014";const t=patientReportFormatNutritionNormsPercentRange(e.percentRange),i=patientReportFormatNutritionNormsGramRange(e.gramRange,0);return t!=="\u2014"&&i!=="\u2014"?`${t} \u2794 ${i}`:i!=="\u2014"?i:t}function patientReportBuildNutritionNormsContextLabel(e){const t=[],i=String(e?.energy?.basisLabel||"").trim(),a=patientReportBuildNutritionNormsPalLabel(e);return i&&t.push(i),a&&t.push(a),t.join("; ")}function patientReportShouldIncludeNutritionInSummary(e){return e&&e.ui&&e.ui.state&&typeof e.ui.state.includeInSummary=="boolean"?e.ui.state.includeInSummary:typeof window<"u"&&window.nutritionNormsUiState&&typeof window.nutritionNormsUiState.includeInSummary=="boolean"?window.nutritionNormsUiState.includeInSummary:!1}function patientReportBuildNutritionSummaryLinesFromModel(e){if(!e)return[];if(!patientReportShouldIncludeNutritionInSummary(e))return[];if(e.ageBand&&e.ageBand.kind==="infant_0_6")return["Normy \u017Cywieniowe: poni\u017Cej 6 miesi\u0119cy nie prezentujemy liczbowych norm energii i makrosk\u0142adnik\xF3w."];const t=patientReportBuildNutritionNormsEnergyText(e),i=patientReportBuildNutritionNormsActivityPhrase(e),a=t!=="\u2014"?`Szacowane dzienne zapotrzebowanie na energi\u0119 do planowania diety${i?` ${i}`:""}: ${t}.`:"Szacowane dzienne zapotrzebowanie na energi\u0119 do planowania diety: brak danych do wylicze\u0144.",n=patientReportBuildNutritionNormsProteinText(e,{planning:!0,includeEar:!1}),r=patientReportBuildNutritionNormsMacroDetailedText(e.fat),o=patientReportBuildNutritionNormsMacroDetailedText(e.carbs),l=`Makrosk\u0142adniki do planowania diety: bia\u0142ko ${n}; t\u0142uszcz ${r}; w\u0119glowodany ${o}.`;return[a,l].filter(Boolean)}function patientReportBuildNutritionSummaryLines(){const e=patientReportBuildNutritionNormsModelFromCurrentState();return patientReportBuildNutritionSummaryLinesFromModel(e)}function patientReportBuildNutritionCardFromModel(e){if(!e)return{kind:"nutrition-norms",title:"Normy \u017Cywieniowe",subtitle:"Energia i makrosk\u0142adniki",badge:"Brak danych",value:"\u2014",note:"Nie uda\u0142o si\u0119 odczyta\u0107 modelu norm \u017Cywieniowych dla bie\u017C\u0105cych danych.",rows:[],tableHeaders:["Sk\u0142adnik","Warto\u015B\u0107"]};if(e.ageBand&&e.ageBand.kind==="infant_0_6")return{kind:"nutrition-norms",title:"Normy \u017Cywieniowe",subtitle:"Energia i makrosk\u0142adniki",badge:"Informacyjnie",value:"brak norm liczbowych",note:"Dla wieku poni\u017Cej 6 miesi\u0119cy normy nie podaj\u0105 liczbowej energii i makrosk\u0142adnik\xF3w; standardem pozostaje mleko kobiece.",rows:[],tableHeaders:["Sk\u0142adnik","Warto\u015B\u0107"]};const t=[];t.push({label:"W\u0119glowodany",valueText:patientReportBuildNutritionNormsMacroDetailedText(e.carbs)}),t.push({label:"Bia\u0142ko",valueText:patientReportBuildNutritionNormsProteinText(e,{planning:!0})}),t.push({label:"T\u0142uszcze",valueText:patientReportBuildNutritionNormsMacroDetailedText(e.fat)});const i=[];e.notes&&e.notes.averageText&&i.push(e.notes.averageText),e.notes&&e.notes.sourceLong&&i.push(e.notes.sourceLong);const a=patientReportBuildNutritionNormsActivityDescription(e);return a&&i.push(a),e.fat&&e.fat.lowActivityNote&&i.push(e.fat.lowActivityNote),e.energy&&e.energy.clinicalPal&&i.push("Przyjęty poziom aktywności fizycznej (PAL) leży poza Normami 2024 dla tej grupy wieku — wybrany na podstawie oceny klinicznej; energię policzono metodą norm."),{kind:"nutrition-norms",title:"Normy \u017Cywieniowe",subtitle:"Energia i makrosk\u0142adniki",badge:e.energy&&e.energy.available?"Normy":"Informacyjnie",value:patientReportBuildNutritionNormsEnergyText(e),note:i.join(" "),rows:t,tableHeaders:["Sk\u0142adnik","Warto\u015B\u0107"]}}function patientReportBuildNutritionCard(){return patientReportBuildNutritionCardFromModel(patientReportBuildNutritionNormsModelFromCurrentState())}typeof window<"u"&&(window.patientReportBuildNutritionNormsModelFromCurrentState=patientReportBuildNutritionNormsModelFromCurrentState,window.patientReportBuildNutritionSummaryLinesFromModel=patientReportBuildNutritionSummaryLinesFromModel,window.patientReportBuildNutritionSummaryLines=patientReportBuildNutritionSummaryLines,window.patientReportBuildNutritionCardFromModel=patientReportBuildNutritionCardFromModel,window.patientReportBuildNutritionCard=patientReportBuildNutritionCard);function getFormattedProfessionalSummaryLines(){let e="";try{e=typeof generateMetabolicSummary=="function"&&generateMetabolicSummary()||""}catch{e=""}if(!String(e||"").trim())return[];let t=String(e).split(`
`).map(i=>i.trim()).filter(Boolean);try{const i=typeof getAgeDecimal=="function"?getAgeDecimal():NaN;(typeof patientReportIsAdultAgeForCurrentMode=="function"?patientReportIsAdultAgeForCurrentMode(i):typeof patientReportIsAdultAge=="function"?patientReportIsAdultAge(i):isFinite(i)&&i>=18)&&(t=t.filter(n=>!/^\s*wskaźnik\s*cole/i.test(String(n||"").replace(/ /g," "))))}catch(i){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",i,{line:13127})}try{const i=(document.getElementById("weight")?.value||"").trim(),a=(document.getElementById("height")?.value||"").trim(),n=(document.getElementById("bpSystolic")?.value||"").trim(),r=(document.getElementById("bpDiastolic")?.value||"").trim(),o=(document.getElementById("headCircumference")?.value||"").trim(),l=(document.getElementById("chestCircumference")?.value||"").trim();t=t.map(function(c){if(c.startsWith("Waga:")){const s=c.slice(c.indexOf(":")+1).trim(),p=i?i+" kg":"";return patientReportFormatSummaryLineWithValue("Waga",p,s)}if(c.startsWith("Wzrost:")){const s=c.slice(c.indexOf(":")+1).trim(),p=a?a+" cm":"";return patientReportFormatSummaryLineWithValue("Wzrost",p,s)}if(c.startsWith("Ci\u015Bnienie skurczowe")){const s=c.slice(c.indexOf(":")+1).trim();return"RR skurczowe: "+(n?n+" mmHg, ":"")+s}if(c.startsWith("Ci\u015Bnienie rozkurczowe")){const s=c.slice(c.indexOf(":")+1).trim();return"RR rozkurczowe: "+(r?r+" mmHg, ":"")+s}if(c.startsWith("Obw\xF3d g\u0142owy")){const s=c.slice(c.indexOf(":")+1).trim();return"Obw\xF3d g\u0142owy: "+(o?o+" cm, ":"")+s}if(c.startsWith("Obw\xF3d klatki piersiowej")){const s=c.slice(c.indexOf(":")+1).trim();return"Obw\xF3d kl. piersiowej: "+(l?l+" cm, ":"")+s}if(/^MPH \(mid[-‑]parental height\):/i.test(c)){let s=c.replace(/^MPH \(mid[^)]*\):/i,"MPH:");return s=s.replace(/z-score:/i,"Z-score:"),s}return c})}catch(i){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",i,{line:13175})}return t}/* Wrapper akcji karty podsumowania (.current-summary-actions) jest ZACHOWYWANY miedzy
   przeliczeniami karty, a nie kasowany i budowany od nowa.

   Dlaczego: klikniecie zaczyna sie od `mousedown`, ktory zabiera fokus polu formularza;
   `blur` pola przelicza karte, a przebudowa wrappera podmieniala wezel przycisku miedzy
   `mousedown` a `mouseup`. Przegladarka sklada zdarzenie `click` tylko wtedy, gdy oba
   trafiaja w ten sam wezel — wiec PIERWSZE klikniecie zaraz po wpisaniu wartosci ginelo
   bez sladu i przycisk wygladal na martwy. Drugie dzialalo, bo fokus byl juz zdjety.

   Ten sam wezel pod kursorem przed i po przeliczeniu = klik dochodzi. Przy zmianie karty
   docelowej (uklad jedno- i dwukolumnowy) wrapper jest PRZENOSZONY — appendChild przenosi
   wezel, wiec tozsamosc przycisku zostaje. Strazniku: tests/e2e/podsumowanie-akcje-klikniecie.spec.mjs */
function attachPatientReportActionToSummaryCard(e){try{const usunWrapper=n=>{try{n.remove()}catch(r){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",r,{line:13183})}},wrappery=Array.prototype.slice.call(document.querySelectorAll(".current-summary-actions"));const t=e||{};if(!t.shouldShow||!(t.isDocPro||t.proMode)){wrappery.forEach(usunWrapper);if(typeof window.adjustSummaryCardsHeight=="function")try{window.adjustSummaryCardsHeight()}catch(n){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",n,{line:13189})}return}let i=null;if(t.prevVisible?i=document.getElementById("porownaniePozostale"):i=document.getElementById("currentSummaryCard"),!i){wrappery.forEach(usunWrapper);if(typeof window.adjustSummaryCardsHeight=="function")try{window.adjustSummaryCardsHeight()}catch(n){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",n,{line:13206})}return}let a=wrappery.length?wrappery[0]:null;for(let k9=1;k9<wrappery.length;k9+=1)usunWrapper(wrappery[k9]);a&&!a.querySelector("[data-patient-report-pdf-btn]")&&(usunWrapper(a),a=null);a?a.parentNode!==i&&i.appendChild(a):(a=document.createElement("div"),a.className="current-summary-actions",vildaAppSetTrustedHtml(a,`
      <button type="button" class="patient-report-summary-btn" data-patient-report-pdf-btn>
        Raport PDF dla pacjenta
      </button>
      
    `,"app:actionWrap"),i.appendChild(a));if(typeof window.adjustSummaryCardsHeight=="function")try{window.adjustSummaryCardsHeight()}catch(n){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",n,{line:13222})}}catch(t){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",t,{line:13224})}}/* Prognozy pozostalych metod — za przyciskiem w karcie (decyzja wlasciciela 2026-09-15).
   Karta przelicza sie przy KAZDYM ruchu w formularzu, wiec stan „rozwiniete" musimy
   przeniesc przez przebudowe; czytamy go z poprzedniego wezla, zanim zniknie. */
function Bd1(lines,prevVisible,open){try{Array.prototype.slice.call(document.querySelectorAll(".current-summary-prognosis")).forEach(function(el){try{el.remove()}catch(_){}});if(!Array.isArray(lines)||!lines.length)return;const host=prevVisible?document.getElementById("porownaniePozostale"):document.getElementById("currentSummaryCard");if(!host)return;const body=host.querySelector(".summary-content")||host;const det=document.createElement("details");det.className="current-summary-prognosis";det.open=open===!0;const sum=document.createElement("summary");sum.textContent="Pozosta\u0142e metody prognozy ("+lines.length+")";det.appendChild(sum);const box=document.createElement("div");box.className="current-summary-prognosis-body";/* GROWTH-PRED-PUBLIKACJA (2026-09-15): wiersze metod niosa wartosci z publikacji, a konsensus wyzej liczy sie z wartosci po korektach aplikacji — bez tej linijki po rozwinieciu bloku arytmetyka nie da sie pogodzic. */const nota=document.createElement("div");nota.className="current-summary-prognosis-nota";nota.textContent="Warto\u015Bci metod jak w publikacjach. Konsensus powy\u017Cej liczony jest z warto\u015Bci po korektach aplikacji, dlatego nie jest ich \u015Bredni\u0105.";box.appendChild(nota);lines.forEach(function(t){const row=document.createElement("div");row.className="current-summary-row";const col=getProfessionalSummaryLineColor(t);col&&(row.style.color=col);row.textContent=typeof t=="string"?t.replace(/(\d)\.(\d)/g,"$1,$2"):t;box.appendChild(row)});det.appendChild(box);body.appendChild(det)}catch(err){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("vilda_patient_report.js",err,{line:"prognozy-szczegoly"})}}
function updateProfessionalSummaryCard(e){const t=document.getElementById("currentSummaryCard"),i=document.getElementById("currentSummaryWrap"),n=document.getElementById("currentSummaryContent");if(!t||!i||!n)return;const o=typeof window<"u"&&window.location&&window.location.pathname&&window.location.pathname.includes("docpro.html");let l=!1;typeof professionalMode<"u"?l=!!professionalMode:typeof window<"u"&&typeof window.professionalMode<"u"&&(l=!!window.professionalMode);const Bd9=(function(){try{const el=document.querySelector(".current-summary-prognosis");return!!(el&&el.open)}catch(_){return!1}})(),c=o||l?getFormattedProfessionalSummaryLines():[],p=Array.isArray(c)&&c.some(function(m){return!/^\s*MPH\b/i.test(String(m||""))});/* P-OSTATNI-2a (2026-09-17): gdy widac karte „Porownanie z poprzednim pomiarem" (sciezka Wczytaj pacjenta → Nowy pomiar), osobna karta Podsumowania znika — jej linie ida do tabeli porownania (podpis pod „Dzis") i do sekcji „Pozostale wyniki" w tej samej karcie; tam tez laduja przyciski (PDF, opis) i prognozy. Do SW 1.0.979 karta dzielila sie na Left/Right po obu kolumnach. */const d=document.getElementById("prevSummaryCard"),dw=document.getElementById("prevSummaryWrap"),host=document.getElementById("porownaniePozostale"),u=!!(d&&dw&&host&&d.style.display!=="none"&&dw.style.display!=="none"),ustawHost=function(pokaz){if(!host)return;host.hidden=!pokaz;const lab=host.querySelector(".pro-summary-label");lab&&(lab.style.display=pokaz&&(l||o)?"block":"none"),host.classList.toggle("pro",!!(pokaz&&(l||o)))},odswiezPorownanie=function(){if(u&&typeof window.updatePrevSummaryDiff=="function")try{window.updatePrevSummaryDiff()}catch(m){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("vilda_patient_report.js",m,{line:"porownanie-odswiez"})}};if(!p){t.style.display="none",i.style.display="none",host&&(vildaAppClearHtml(host.querySelector(".summary-content")),ustawHost(!1)),window.__vildaLinieDoTabeli=null,Bd1([],u,!1),attachPatientReportActionToSummaryCard({shouldShow:!1,isDocPro:o,proMode:l,prevVisible:u}),odswiezPorownanie();return}/* Konsensus zostaje w karcie; prognozy pozostalych metod ida za przycisk (2026-09-15). */const Bd0=(function(){try{const api=window.VildaGrowthPredictionLines;if(api&&typeof api.podziel=="function"){const r=api.podziel(c);if(r&&Array.isArray(r.widoczne)&&Array.isArray(r.pozostale))return r}}catch(_){}return{widoczne:c,pozostale:[]}})(),Bd2=Bd0.widoczne;function b(m){const h=document.createElement("div");return h.className="current-summary-col",m.forEach(y=>{const x=document.createElement("div");x.className="current-summary-row";const v=getProfessionalSummaryLineColor(y);v&&(x.style.color=v);const T=typeof y=="string"?y.replace(/(\d)\.(\d)/g,"$1,$2"):y;x.textContent=T,h.appendChild(x)}),h}if(u){t.style.display="none",i.style.display="none",vildaAppClearHtml(n);const podz=(function(){try{const api=window.VildaSummaryCards;if(api&&typeof api.__podzialWierszy=="function"){const r=api.__podzialWierszy(Bd2);if(r&&r.doTabeli&&Array.isArray(r.pozostale))return r}}catch(_){}return{doTabeli:{},pozostale:Bd2}})();window.__vildaLinieDoTabeli=podz.doTabeli;const body=host.querySelector(".summary-content")||host;vildaAppClearHtml(body);const m=document.createElement("div");m.className="current-summary-columns",m.appendChild(b(podz.pozostale)),body.appendChild(m),ustawHost(!0)}else{window.__vildaLinieDoTabeli=null,host&&(vildaAppClearHtml(host.querySelector(".summary-content")),ustawHost(!1)),vildaAppClearHtml(n);const m=document.createElement("div");m.className="current-summary-columns",m.appendChild(b(Bd2)),n.appendChild(m),i.style.display="block",t.style.display="block"}Bd1(Bd0.pozostale,u,Bd9);try{attachPatientReportActionToSummaryCard({shouldShow:p,isDocPro:o,proMode:l,prevVisible:u})}catch(m){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",m,{line:13416})}odswiezPorownanie()}function patientReportEscapeHtml(e){return typeof window<"u"&&window.VildaHtml&&typeof window.VildaHtml.escapeHtml=="function"?window.VildaHtml.escapeHtml(e):String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function patientReportFormatNumber(e,t){return typeof e!="number"||!isFinite(e)?"\u2014":e.toFixed(Number.isFinite(t)?t:1).replace(".",",")}function patientReportDecodeCentile(e){return String(e??"").replace(/&lt;/g,"<").replace(/&gt;/g,">")}function patientReportFormatPercentile(e){if(typeof e!="number"||!isFinite(e))return"\u2014";if(typeof formatCentile=="function")try{const t=formatCentile(e),i=typeof centylWord=="function"?centylWord(t):"centyl";return`${patientReportDecodeCentile(t)} ${i}`}catch(t){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",t,{line:13447})}return`${patientReportFormatNumber(e,0)} centyl`}function patientReportFormatAge(e){if(typeof e!="number"||!isFinite(e)||e<0)return"\u2014";const t=Math.round(e*12);if(typeof advHistoryFormatAgeMonths=="function")try{return advHistoryFormatAgeMonths(t)}catch(n){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",n,{line:13456})}const i=Math.floor(t/12),a=t-i*12;return`${i} l. ${a} mies.`}function patientReportSanitizeFilename(e){return String(e||"").replace(/ł/g,"l").replace(/Ł/g,"L").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,48)}const PATIENT_REPORT_ADULT_REFERENCE_AGE=18,PATIENT_REPORT_ADULT_PDF_START_AGE=19,PATIENT_REPORT_MODE_WINDOW_KEY="__patientReportAgeMode",PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE=Object.freeze({WEIGHT_KG:1,HEIGHT_CM:1,BMI:.2,/* P-RAPORT rata S (decyzja właściciela 2026-09-22): karty dziecka — w tolerancji jedno zdanie zamiast „To o 0,2 …”; masa względna do odniesienia (2 %: 0,2 kg u 10 kg, 0,6 kg u 30 kg). */DZIECKO:Object.freeze({BMI:.2,COLE_PKT:1,HEIGHT_CM:1,WEIGHT_REL:.02})}),PATIENT_REPORT_PRZECIETNE_WIEK="Wynik mieści się w wartościach przeciętnych dla wieku.",PATIENT_REPORT_PRZECIETNE_WIEK_PLEC="Wynik mieści się w wartościach przeciętnych dla wieku i płci.",PATIENT_REPORT_ADULT_HEIGHT_PL={M:[{minAge:19,maxAge:29,ageLabel:"19\u201329 lat",p10:173,p50:179,p90:186.5,bmi22WeightP10:65.8,bmi22WeightP50:70.5,bmi22WeightP90:76.5},{minAge:30,maxAge:59,ageLabel:"30\u201359 lat",p10:170,p50:178,p90:185,bmi22WeightP10:63.6,bmi22WeightP50:69.7,bmi22WeightP90:75.3},{minAge:60,maxAge:74,ageLabel:"60\u201374 lat",p10:168,p50:176,p90:183,bmi22WeightP10:62.1,bmi22WeightP50:68.1,bmi22WeightP90:73.7},{minAge:75,maxAge:200,ageLabel:"\u2265 75 lat",p10:167,p50:174.5,p90:180,bmi22WeightP10:61.4,bmi22WeightP50:67,bmi22WeightP90:71.3}],F:[{minAge:19,maxAge:29,ageLabel:"19\u201329 lat",p10:160,p50:166.9,p90:174,bmi22WeightP10:56.3,bmi22WeightP50:61.2,bmi22WeightP90:66.6},{minAge:30,maxAge:59,ageLabel:"30\u201359 lat",p10:160,p50:165,p90:172,bmi22WeightP10:56.3,bmi22WeightP50:59.9,bmi22WeightP90:65.1},{minAge:60,maxAge:74,ageLabel:"60\u201374 lat",p10:158.9,p50:165,p90:170,bmi22WeightP10:55.5,bmi22WeightP50:59.9,bmi22WeightP90:63.6},{minAge:75,maxAge:200,ageLabel:"\u2265 75 lat",p10:155.1,p50:162,p90:169,bmi22WeightP10:52.9,bmi22WeightP50:57.7,bmi22WeightP90:62.8}]},PATIENT_REPORT_ADULT_BMI_MEDIAN_PL={M:[{minAge:19,maxAge:30,ageLabel:"18\u201330 lat",medianBmi:24.52},{minAge:31,maxAge:50,ageLabel:"31\u201350 lat",medianBmi:25.18},{minAge:51,maxAge:64,ageLabel:"51\u201364 lat",medianBmi:26.79},{minAge:65,maxAge:74,ageLabel:"65\u201374 lat",medianBmi:27.1},{minAge:75,maxAge:200,ageLabel:"\u2265 75 lat",medianBmi:26.7}],F:[{minAge:19,maxAge:30,ageLabel:"18\u201330 lat",medianBmi:22.18},{minAge:31,maxAge:50,ageLabel:"31\u201350 lat",medianBmi:24.65},{minAge:51,maxAge:64,ageLabel:"51\u201364 lat",medianBmi:26.93},{minAge:65,maxAge:74,ageLabel:"65\u201374 lat",medianBmi:26.3},{minAge:75,maxAge:200,ageLabel:"\u2265 75 lat",medianBmi:26.1}]};function patientReportGetCurrentMode(){try{if(typeof window<"u"&&String(window[PATIENT_REPORT_MODE_WINDOW_KEY]||"").toLowerCase()==="pdf")return"pdf"}catch(e){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",e,{line:13519})}return"ui"}function patientReportRunWithMode(e,t){if(typeof t!="function")return null;const i=String(e||"").toLowerCase()==="pdf"?"pdf":"ui";let a=!1,n;try{typeof window<"u"&&(a=Object.prototype.hasOwnProperty.call(window,PATIENT_REPORT_MODE_WINDOW_KEY),n=a?window[PATIENT_REPORT_MODE_WINDOW_KEY]:void 0,window[PATIENT_REPORT_MODE_WINDOW_KEY]=i)}catch(r){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",r,{line:13534})}try{return t()}finally{try{typeof window<"u"&&(a?window[PATIENT_REPORT_MODE_WINDOW_KEY]=n:delete window[PATIENT_REPORT_MODE_WINDOW_KEY])}catch(r){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",r,{line:13546})}}}function patientReportIsAdultAgeForMode(e,t){const i=Number(e);if(!isFinite(i))return!1;const a=String(t||"").toLowerCase()==="pdf"?PATIENT_REPORT_ADULT_PDF_START_AGE:PATIENT_REPORT_ADULT_REFERENCE_AGE;return i>=a}function patientReportIsAdultAgeForCurrentMode(e){return patientReportIsAdultAgeForMode(e,patientReportGetCurrentMode())}function patientReportIsAdultPdfAge(e){return patientReportIsAdultAgeForMode(e,"pdf")}function patientReportGetCompletedYears(e){const t=Number(e);return!isFinite(t)||t<0?NaN:Math.floor(t)}function patientReportGetAdultPopulationSexLabel(e,t){const a=String(e||"").toUpperCase()==="F"?"kobiet":"m\u0119\u017Cczyzn";return(t||{}).capitalized?`${a.charAt(0).toUpperCase()}${a.slice(1)}`:a}function patientReportGetAdultHeightPopulationRef(e,t){const i=String(e||"").toUpperCase()==="F"?"F":"M",a=patientReportGetCompletedYears(t);if(!isFinite(a))return null;const r=(PATIENT_REPORT_ADULT_HEIGHT_PL[i]||[]).find(o=>a>=o.minAge&&a<=o.maxAge);return r?{...r,sexKey:i}:null}function patientReportGetAdultBmiMedianRef(e,t){const i=String(e||"").toUpperCase()==="F"?"F":"M",a=patientReportGetCompletedYears(t);if(!isFinite(a))return null;const r=(PATIENT_REPORT_ADULT_BMI_MEDIAN_PL[i]||[]).find(o=>a>=o.minAge&&a<=o.maxAge);return r?{...r,sexKey:i}:null}function patientReportWeightForBmi(e,t){const i=Number(e),a=Number(t);if(!(isFinite(i)&&i>0&&isFinite(a)&&a>0))return null;const n=i/100;return a*n*n}function patientReportResolveAdultHeightPosition(e,t,i){const a=patientReportGetAdultHeightPopulationRef(t,i),n=Number(e);if(!a||!(isFinite(n)&&n>0))return{available:!1,reference:a};let r="50-90",o="50\u201390 centyl";return n<a.p10?(r="<10",o="<10 centyl"):n<a.p50?(r="10-50",o="10\u201350 centyl"):n>a.p90&&(r=">90",o=">90 centyl"),{available:!0,height:n,p10:a.p10,p50:a.p50,p90:a.p90,ageLabel:a.ageLabel,sexGroupLabel:patientReportGetAdultPopulationSexLabel(t),bandKey:r,badge:o,reference:a}}function patientReportIsAdultAge(e){const t=Number(e);return isFinite(t)&&t>=PATIENT_REPORT_ADULT_REFERENCE_AGE}function patientReportGetReferenceAgeYears(e){const t=Number(e);return!isFinite(t)||t<=0?t:patientReportIsAdultAge(t)?PATIENT_REPORT_ADULT_REFERENCE_AGE:t}function patientReportGetSexLabel(e,t){const i=String(e||"").toUpperCase()==="F";return patientReportIsAdultAge(t)?i?"Kobieta":"M\u0119\u017Cczyzna":i?"Dziewczynka":"Ch\u0142opiec"}function patientReportGetAgeReferenceLabel(e,t){const i=t||{},a=String(i.adultText||"dla doros\u0142ych"),n=String(i.childText||"dla tego wieku");return patientReportIsAdultAge(e)?a:n}function patientReportReplaceAdultReferenceText(e){let t=String(e||"").trim();return t&&([[/^Nie wszystkie najważniejsze wyniki mieszczą się obecnie w typowym zakresie dla wieku i płci\.$/gi,"Nie wszystkie najwa\u017Cniejsze wyniki mieszcz\u0105 si\u0119 obecnie w typowym zakresie."],[/^Najważniejsze wyniki mieszczą się obecnie w typowym zakresie dla wieku i płci\.$/gi,"Najwa\u017Cniejsze wyniki mieszcz\u0105 si\u0119 obecnie w typowym zakresie."],[/Wzrost znajduje się wyraźnie poniżej typowego zakresu dla wieku i płci\./gi,"Wzrost znajduje si\u0119 wyra\u017Anie poni\u017Cej typowego zakresu wzgl\u0119dem siatek centylowych."],[/Wzrost znajduje się w niskim zakresie centylowym dla wieku i płci\./gi,"Wzrost znajduje si\u0119 w niskim zakresie centylowym wzgl\u0119dem siatek centylowych."],[/Wzrost wymaga interpretacji względem siatek centylowych dla wieku i płci\./gi,"Wzrost wymaga interpretacji wzgl\u0119dem siatek centylowych."],[/Taki układ wyników wymaga szczególnie uważnej oceny wzrastania i stanu odżywienia dziecka\./gi,"Taki uk\u0142ad wynik\xF3w wymaga szczeg\xF3lnie uwa\u017Cnej oceny stanu od\u017Cywienia i ca\u0142o\u015Bciowego obrazu klinicznego."],[/Szczególnie ważne jest porównanie obecnego wzrostu z wcześniejszymi pomiarami i oceną tempa wzrastania\./gi,"Warto por\xF3wna\u0107 obecny wzrost z wcze\u015Bniejszymi pomiarami i interpretowa\u0107 wynik w szerszym kontek\u015Bcie klinicznym."],[/Szczególnie ważna jest ocena tempa wzrastania w kolejnych pomiarach\./gi,"Wynik warto interpretowa\u0107 w szerszym kontek\u015Bcie klinicznym."],[/Równocześnie wzrost wymaga oceny względem siatek centylowych i tempa wzrastania\./gi,""],[/Wynik warto interpretować także w odniesieniu do wzrostu rodziców i całego obrazu klinicznego\./gi,"Wynik warto interpretowa\u0107 w odniesieniu do ca\u0142ego obrazu klinicznego."],[/W takiej sytuacji równie ważna jak ocena masy ciała jest analiza tempa wzrastania i całego przebiegu wzrostu\./gi,"W takiej sytuacji wynik warto interpretowa\u0107 \u0142\u0105cznie z ocen\u0105 stanu od\u017Cywienia i ca\u0142ego obrazu klinicznego."],[/Taki wynik wymaga uważnej obserwacji tempa wzrastania i przyrostu masy ciała w czasie\./gi,"Taki wynik wymaga kontroli masy cia\u0142a w kolejnych pomiarach i interpretacji klinicznej."],[/w odniesieniu do wieku, płci i wzrostu/gi,"w odniesieniu do p\u0142ci, wzrostu i przyj\u0119tych norm"],[/w odniesieniu do wieku, wzrostu oraz warunków pomiaru/gi,"w odniesieniu do wzrostu, warunk\xF3w pomiaru i przyj\u0119tych norm"],[/w kontekście wieku i wzrostu/gi,"w kontek\u015Bcie wzrostu i przyj\u0119tych norm"],[/norm dla wieku oraz warunków pomiaru/gi,"przyj\u0119tych norm oraz warunk\xF3w pomiaru"],[/norm dla wieku i warunków pomiaru/gi,"przyj\u0119tych norm i warunk\xF3w pomiaru"],[/siatek centylowych dla wieku i płci/gi,"siatek centylowych"],[/typowym zakresie dla wieku i płci/gi,"typowym zakresie"],[/typowych wartości dla wieku(?! 18 lat)/gi,"typowych warto\u015Bci wzgl\u0119dem przyj\u0119tych norm"],[/typowym zakresie dla wieku(?! 18 lat)/gi,"typowym zakresie wzgl\u0119dem przyj\u0119tych norm"],[/norm dla wieku(?! 18 lat)/gi,"przyj\u0119tych norm"],[/siatek centylowych dla wieku(?! 18 lat)/gi,"siatek centylowych"],[/dla wieku i wzrostu/gi,"wzgl\u0119dem przyj\u0119tych norm i wzrostu"],[/dla wieku(?! 18 lat)/gi,"wzgl\u0119dem przyj\u0119tych norm"]].forEach(([a,n])=>{t=t.replace(a,n)}),t.replace(/\s{2,}/g," ").trim())}function patientReportAdaptHeadlineForAdultReference(e){const t=e||{};return{...t,title:patientReportReplaceAdultReferenceText(t.title),text:patientReportReplaceAdultReferenceText(t.text),subtext:patientReportReplaceAdultReferenceText(t.subtext)}}function patientReportAdaptHighlightsForAdultReference(e){return(e||[]).map(t=>({...t||{},text:patientReportReplaceAdultReferenceText(t&&t.text)}))}function patientReportGetPreferredSource(){let e="";try{typeof advHistoryGetPreferredSource=="function"&&(e=String(advHistoryGetPreferredSource()||"").toUpperCase())}catch(t){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",t,{line:13723})}if(!e)try{typeof bmiSource<"u"&&bmiSource&&(e=String(bmiSource).toUpperCase())}catch(t){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",t,{line:13729})}e||(e="OLAF");try{const t=typeof getAgeDecimal=="function"?getAgeDecimal():NaN;if(typeof patientReportIsAdultAge=="function"&&patientReportIsAdultAge(t))return"OLAF"}catch(t){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",t,{line:13737})}return e}function patientReportGetMetricMedian(e,t,i,a,n){const r=String(a||patientReportGetPreferredSource()).toUpperCase();if(n&&n.result&&typeof n.result.median=="number"&&isFinite(n.result.median))return n.result.median;if(e==="BMI"){const T0=patientReportBmiSilnik(),m=T0?T0.mediana(t,i*12,r):null;return m&&typeof m.mediana=="number"&&isFinite(m.mediana)?m.mediana:null}const o=Math.round(i*12);if(!isFinite(o)||o<0)return null;try{if(r==="PALCZEWSKA"&&typeof getPalCentile=="function"){const l=e==="WT"?"WT":e==="HT"?"HT":"BMI",c=getPalCentile(t,o,50,l);return typeof c=="number"&&isFinite(c)?c:null}}catch(l){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",l,{line:13754})}return null}function patientReportFormatCompactNumber(e,t){if(typeof e!="number"||!isFinite(e))return"\u2014";const i=Number.isFinite(t)?Math.max(0,t):1,a=Number(e.toFixed(i));return String(a).replace(".",",")}function patientReportFormatScaleValue(e,t,i){if(typeof e!="number"||!isFinite(e))return"";const a=patientReportFormatCompactNumber(e,i);return t?`${a} ${t}`:a}function patientReportLmsValueForPercentile(e,t){if(!Array.isArray(e)||e.length<3||typeof t!="number"||!isFinite(t))return null;const[i,a,n]=e;if(![i,a,n].every(l=>typeof l=="number"&&isFinite(l))||a<=0||n<=0)return null;const r=Math.min(99.9,Math.max(.1,t)),o=typeof normInv=="function"?normInv(r/100):null;if(typeof o!="number"||!isFinite(o))return null;if(i!==0){const l=1+i*n*o;return l<=0?null:a*Math.pow(l,1/i)}return a*Math.exp(n*o)}function patientReportGetPalMetricValueAtPercentile(e,t,i,a){if(typeof getPalCentile!="function"||typeof a!="number"||!isFinite(a))return null;const n=Math.round(i*12);if(!isFinite(n)||n<0)return null;const r=e==="WT"?"WT":e==="HT"?"HT":"BMI";try{const d=getPalCentile(t,n,a,r);if(typeof d=="number"&&isFinite(d))return d}catch(d){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",d,{line:13796})}const o=[3,10,25,50,75,90,97].map(d=>({centile:d,value:getPalCentile(t,n,d,r)})).filter(d=>typeof d.value=="number"&&isFinite(d.value)).sort((d,u)=>d.centile-u.centile);if(o.length<2)return null;let l=o[0],c=o[1];if(a<=o[0].centile)l=o[0],c=o[1];else if(a>=o[o.length-1].centile)l=o[o.length-2],c=o[o.length-1];else for(let d=0;d<o.length-1;d+=1)if(a>=o[d].centile&&a<=o[d+1].centile){l=o[d],c=o[d+1];break}const s=c.centile-l.centile;if(!isFinite(s)||s===0)return l.value;const p=(a-l.centile)/s;return l.value+p*(c.value-l.value)}function patientReportGetMetricValueAtPercentile(e,t,i,a,n){const r=String(n||patientReportGetPreferredSource()).toUpperCase();/* P-SDS-2: wartosc wzrostu dla centyla z odwrotnosci silnika (ta sama regula siatki, takze Palczewska). */if(e==="HT"&&typeof window<"u"&&window.VildaSdsWzrostu&&typeof window.VildaSdsWzrostu.wartoscDlaSds=="function"&&typeof a=="number"&&isFinite(a)){const Ts=window.VildaSdsWzrostu,wq=Ts.wartoscDlaSds({sds:Ts.sdsZCentyla(Math.min(99.9,Math.max(.1,a))),plec:t,wiekMies:i*12,zrodlo:r});return wq&&isFinite(wq.wzrost)?wq.wzrost:null}if(e==="HT")return null;return r==="PALCZEWSKA"?patientReportGetPalMetricValueAtPercentile(e,t,i,a):patientReportLmsValueForPercentile(e==="BMI"?typeof advHistoryGetBmiLMSForSource=="function"?advHistoryGetBmiLMSForSource(r,t,i):null:typeof advHistoryGetChildLMSForSource=="function"?advHistoryGetChildLMSForSource(r,t,i,e==="WT"?"WT":"HT"):null,a)}function patientReportBuildScaleValueLabels(e,t,i,a){return(e==="BMI"?[{percentile:5,unit:""},{percentile:95,unit:""}]:[{percentile:3,unit:""},{percentile:97,unit:""}]).map(r=>{const o=patientReportGetMetricValueAtPercentile(e,t,i,r.percentile,a);return typeof o!="number"||!isFinite(o)?null:{pos:r.percentile,label:patientReportFormatScaleValue(o,r.unit,1)}}).filter(Boolean)}function patientReportTolerancjaMasyDziecka(med){const T=PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.DZIECKO;return typeof med=="number"&&isFinite(med)&&med>0?med*T.WEIGHT_REL:null}function patientReportBuildMedianReference(e,t,i,a){const n=a||{},r=Number.isFinite(n.digits)?n.digits:1,o=String(n.medianUnit==null?n.unit||"":n.medianUnit),l=String(n.diffUnit==null?n.unit||"":n.diffUnit),c=String(n.friendlyLabel||`Przeci\u0119tna ${String(e||"").toLowerCase()} dla tego wieku`),s=String(n.unavailableText||"Brak por\xF3wnania do typowej warto\u015Bci dla wieku."),p=String(n.exactText||"To dok\u0142adnie tyle, ile wynosi warto\u015B\u0107 odniesienia."),d=String(n.nearText||n.equalText||"To prawie tyle samo co warto\u015B\u0107 przeci\u0119tna."),u=Number.isFinite(n.exactTolerance)?Math.max(0,Number(n.exactTolerance)):0,w=Number.isFinite(n.nearTolerance)?Math.max(0,Number(n.nearTolerance)):null;if(typeof t!="number"||!isFinite(t)||typeof i!="number"||!isFinite(i))return{available:!1,label:c,medianText:s,diffText:"",neutral:!0};const f=(m,h)=>{const y=patientReportFormatNumber(m,r);return h?`${y} ${h}`:y},g=t-i,b=Math.abs(g);/* P-RAPORT rata S: różnica po zaokrągleniu „0,0” to brak odchylenia (17,13 vs 17,16 dawało „To o 0,0 pkt poniżej”). */if(patientReportFormatNumber(t,r)===patientReportFormatNumber(i,r)||u>0&&b<=u||Number(patientReportFormatNumber(b,r).replace(",","."))===0)return{available:!0,label:c,medianText:f(i,o),diffText:p,neutral:!0};if(typeof w=="number"&&b<=w)return{available:!0,label:c,medianText:f(i,o),diffText:d,neutral:!0};const k=g>0?"powy\u017Cej tej warto\u015Bci":"poni\u017Cej tej warto\u015Bci";return{available:!0,label:c,medianText:f(i,o),diffText:`To o ${f(b,l)} ${k}.`,neutral:!1}}function patientReportToneColor(e){return e==="danger"?"#c62828":e==="warn"?"#c75d00":"#00838d"}/* P-MASA-2 (audyt werdyktow 2026-09-18, decyzja wlasciciela "ruszaj z 1 i 2"):
   karta "Masa ciala" i karta "BMI" stoja obok siebie i potrafia powiedziec co innego o tym
   samym dziecku - masa "w typowym zakresie dla wieku" przy BMI "Nadwaga". To NIE jest usterka
   rachunku: centyl masy odnosi mase do WIEKU, a BMI do WZROSTU, wiec u dziecka nizszego od
   rowiesnikow ta sama masa daje wyzsze BMI. Wada bylo milczenie o tym. Zdanie dokladamy do noty
   karty masy WYLACZNIE wtedy, gdy oba werdykty faktycznie wskazuja w rozne strony, i nigdy nie
   podwazamy zadnego z nich. Rozstrzyga o tym silnik (VildaMasa), nie ten plik - zeby regula
   miala jedno miejsce. Doroslych pomijamy: tam ton masy i BMI pochodzi z JEDNEJ oceny, wiec
   rozjazd jest niemozliwy z definicji. */
function patientReportMasaWobecBmi(nota,dorosly,centylMasy,modelBmi){try{if(dorosly)return nota;var Ms=typeof window<"u"?window.VildaMasa:null;if(!Ms||typeof Ms.wyjasnienieWzgledemBmi!="function")return nota;var w=Ms.wyjasnienieWzgledemBmi({centylMasy:centylMasy,kategoriaBmi:modelBmi&&modelBmi.kategoria||null});return w&&w.rozne&&w.zdanie?patientReportAppendSentence(patientReportEnsureSentence(nota),w.zdanie):nota}catch(e){return nota}}
/* P-MASA-3b (decyzja wlasciciela 2026-09-18: "dopnij raport do silnika"): czwarta i ostatnia
   kopia progow masy. Raport mial tekst na progach ostrych (e<3) i ton na nieostrych (x<=3),
   wiec dziecko z centylem DOKLADNIE 3,0 czytalo "ponizej typowego zakresu" przy czerwonej
   ramce. Rozjazd byl waski (wylacznie ten jeden punkt), ale byl to osobny zestaw progow.
   Teraz tekst i ton wychodza z jednego pasma. Zapas jest LUSTREM PROGI silnika na wypadek
   braku skryptu; test przemiata caly zakres i pilnuje, ze lustro i silnik daja to samo. */
function patientReportPasmoMasy(e){if(typeof e!="number"||!isFinite(e))return null;try{const t=typeof window<"u"?window.VildaMasa:null;if(t&&typeof t.kategoria=="function"){const n=t.kategoria(e);if(n&&n.klucz&&n.klucz!=="brak")return n.klucz}}catch(t){}return e<3?"niedobor":e<10?"niska":e<90?"typowa":e<97?"podwyzszona":"wysoka"}
function patientReportTonMasy(e){const t=patientReportPasmoMasy(e);return t==="niedobor"||t==="wysoka"?"danger":t==="niska"||t==="podwyzszona"?"warn":"normal"}
function patientReportDescribeWeight(e,t){const i=!!(t&&t.adultReference),n=patientReportPasmoMasy(e);if(n===null)return"bez por\xF3wnania centylowego";const a=i?" w przyj\u0119tym odniesieniu centylowym":"";return n==="niedobor"?"znacznie poni\u017Cej typowego zakresu"+a:n==="niska"?"poni\u017Cej typowego zakresu"+a:n==="typowa"?i?"w typowym zakresie"+a:"w typowym zakresie dla wieku":n==="podwyzszona"?"powy\u017Cej typowego zakresu"+a:"wyra\u017Anie powy\u017Cej typowego zakresu"+a}function patientReportDescribeHeight(e,t){const i=!!(t&&t.adultReference);return typeof e!="number"||!isFinite(e)?"bez por\xF3wnania centylowego":i?e<=3?"wyra\u017Anie poni\u017Cej typowego zakresu w przyj\u0119tym odniesieniu centylowym":e<=10?"w niskim zakresie centylowym w przyj\u0119tym odniesieniu centylowym":e<=90?"w typowym zakresie w przyj\u0119tym odniesieniu centylowym":e<=97?"w wysokim zakresie centylowym w przyj\u0119tym odniesieniu centylowym":"wyra\u017Anie powy\u017Cej typowego zakresu w przyj\u0119tym odniesieniu centylowym":e<=3?"wyra\u017Anie poni\u017Cej typowego zakresu dla wieku":e<=10?"w niskim zakresie centylowym dla wieku":e<=90?"w typowym zakresie dla wieku":e<=97?"w wysokim zakresie centylowym dla wieku":"wyra\u017Anie powy\u017Cej typowego zakresu dla wieku"}/* P-BMI-2: raport pyta o BMI jeden silnik (vilda_bmi.js); bez silnika zostaje dotychczasowa droga przez app.js. */function patientReportBmiSilnik(){const T=typeof window<"u"&&window.VildaBmi;return T&&typeof T.ocen=="function"?T:null}function patientReportDescribeBmi(e){const t=String(e||"");return t?t.startsWith("Brak")?"bez pe\u0142nej interpretacji":t.includes("Oty\u0142o\u015B\u0107")?"BMI wyra\u017Anie powy\u017Cej typowego zakresu":t==="Nadwaga"?"BMI powy\u017Cej typowego zakresu":t==="Niedowaga"?"BMI poni\u017Cej typowego zakresu":"BMI w typowym zakresie":"bez pe\u0142nej interpretacji"}function patientReportGetAdultBmiAssessment(e){const t={state:"normal",tone:"normal",badge:"W zakresie",bmiNote:"BMI mie\u015Bci si\u0119 w zakresie prawid\u0142owym dla doros\u0142ych.",weightNote:"Ocena masy cia\u0142a u doros\u0142ych opiera si\u0119 przede wszystkim na BMI oraz na odniesieniu do masy referencyjnej dla wzrostu.",headlineTitle:"",headlineText:"",highlightText:""};return typeof e=="number"&&isFinite(e)?e>=40?{state:"obesity-3",tone:"danger",badge:"Oty\u0142o\u015B\u0107 III stopnia",bmiNote:"BMI wskazuje na oty\u0142o\u015B\u0107 III stopnia,",weightNote:"Masa cia\u0142a odpowiada oty\u0142o\u015Bci III stopnia w klasyfikacji BMI,",headlineTitle:"BMI wskazuje na oty\u0142o\u015B\u0107 III stopnia.",headlineText:"Wynik wymaga leczenia i regularnej kontroli zgodnie z ustaleniami z wizyty.",highlightText:"BMI wskazuje na oty\u0142o\u015B\u0107 III stopnia."}:e>=35?{state:"obesity-2",tone:"danger",badge:"Oty\u0142o\u015B\u0107 II stopnia",bmiNote:"BMI wskazuje na oty\u0142o\u015B\u0107 II stopnia,",weightNote:"Masa cia\u0142a odpowiada oty\u0142o\u015Bci II stopnia w klasyfikacji BMI,",headlineTitle:"BMI wskazuje na oty\u0142o\u015B\u0107 II stopnia.",headlineText:"Wynik wymaga leczenia i regularnej kontroli zgodnie z ustaleniami z wizyty.",highlightText:"BMI wskazuje na oty\u0142o\u015B\u0107 II stopnia."}:e>=30?{state:"obesity-1",tone:"danger",badge:"Oty\u0142o\u015B\u0107 I stopnia",bmiNote:"BMI wskazuje na oty\u0142o\u015B\u0107 I stopnia,",weightNote:"Masa cia\u0142a odpowiada oty\u0142o\u015Bci I stopnia w klasyfikacji BMI,",headlineTitle:"BMI wskazuje na oty\u0142o\u015B\u0107 I stopnia.",headlineText:"Wynik wymaga zmiany nawyk\xF3w i regularnej kontroli masy cia\u0142a zgodnie z ustaleniami z wizyty.",highlightText:"BMI wskazuje na oty\u0142o\u015B\u0107 I stopnia."}:e>=ADULT_BMI.OVER?{state:"overweight",tone:"warn",badge:"Nadwaga",bmiNote:"BMI wskazuje na nadwag\u0119,",weightNote:"Masa cia\u0142a odpowiada nadwadze w klasyfikacji BMI,",headlineTitle:"BMI wskazuje na nadwag\u0119.",headlineText:"Warto rozwa\u017Cy\u0107 modyfikacj\u0119 nawyk\xF3w \u017Cywieniowych i aktywno\u015Bci fizycznej. Zalecana konsultacja dietetyczna.",highlightText:"BMI wskazuje na nadwag\u0119."}:e>=24?{state:"upper-normal",tone:"warn",badge:"Do obserwacji",bmiNote:"BMI mie\u015Bci si\u0119 jeszcze w normie, jednak zbli\u017Ca si\u0119 do jej g\xF3rnej granicy. Warto rozwa\u017Cy\u0107 modyfikacj\u0119 nawyk\xF3w \u017Cywieniowych i stylu \u017Cycia.",weightNote:"Masa cia\u0142a jest jeszcze zgodna z prawid\u0142owym BMI dla doros\u0142ych, ale wynik zbli\u017Ca si\u0119 do g\xF3rnej granicy normy.",headlineTitle:"BMI mie\u015Bci si\u0119 jeszcze w normie, ale zbli\u017Ca si\u0119 do g\xF3rnej granicy.",headlineText:"To dobry moment, aby rozwa\u017Cy\u0107 modyfikacj\u0119 nawyk\xF3w \u017Cywieniowych i stylu \u017Cycia oraz obserwowa\u0107 trend kolejnych pomiar\xF3w.",highlightText:"BMI mie\u015Bci si\u0119 jeszcze w normie, ale zbli\u017Ca si\u0119 do g\xF3rnej granicy."}:e<ADULT_BMI.UNDER?{state:"underweight",tone:"warn",badge:"Niedowaga",bmiNote:"BMI wskazuje na niedowag\u0119,",weightNote:"Masa cia\u0142a odpowiada niedowadze w klasyfikacji BMI,",headlineTitle:"BMI wskazuje na niedowag\u0119.",headlineText:"Wynik warto interpretowa\u0107 w kontek\u015Bcie stanu od\u017Cywienia i ewentualnych przyczyn niedoboru masy cia\u0142a.",highlightText:"BMI wskazuje na niedowag\u0119."}:t:t}function patientReportGetAdultHeightInfoNote(e){if(!e||!e.available)return"Brak por\xF3wnania do doros\u0142ej populacji w Polsce dla tej grupy wieku.";const t=`doros\u0142ych ${e.sexGroupLabel} w Polsce w wieku ${e.ageLabel}`;return e.bandKey==="<10"?`Wzrost jest poni\u017Cej 10. centyla ${t}.`:e.bandKey==="10-50"?`Wzrost mie\u015Bci si\u0119 mi\u0119dzy 10. a 50. centylem ${t}.`:e.bandKey==="50-90"?`Wzrost mie\u015Bci si\u0119 mi\u0119dzy 50. a 90. centylem ${t}.`:`Wzrost jest powy\u017Cej 90. centyla ${t}.`}function patientReportBuildAdultPopulationGroupText(e,t){const i=patientReportGetAdultPopulationSexLabel(e),a=String(t||"").trim();return a?`${i} w wieku ${a} w Polsce`:`${i} w Polsce`}function patientReportBuildAdultPopulationComparison(e,t,i){const a=i||{},n=Number.isFinite(a.digits)?Number(a.digits):1,r=Number.isFinite(a.nearTolerance)?Math.max(0,Number(a.nearTolerance)):null;if(!(typeof e=="number"&&isFinite(e)&&typeof t=="number"&&isFinite(t)))return{available:!1,state:"unavailable",diff:null,absDiff:null,digits:n,formattedReference:"\u2014",formattedDiff:"\u2014"};const o=e-t,l=Math.abs(o),c=patientReportFormatNumber(e,n)===patientReportFormatNumber(t,n);let s=o>0?"above":"below";return c?s="exact":typeof r=="number"&&l<=r&&(s="near"),{available:!0,state:s,diff:o,absDiff:l,digits:n,formattedReference:patientReportFormatNumber(t,n),formattedDiff:patientReportFormatNumber(l,n)}}function patientReportGetAdultHeightBandSummaryFragment(e){return!e||!e.available?"":e.bandKey==="<10"?"jest poni\u017Cej 10. centyla tej grupy":e.bandKey==="10-50"?"mie\u015Bci si\u0119 mi\u0119dzy 10. a 50. centylem tej grupy":e.bandKey==="50-90"?"mie\u015Bci si\u0119 mi\u0119dzy 50. a 90. centylem tej grupy":"jest powy\u017Cej 90. centyla tej grupy"}function patientReportBuildAdultWeightPopulationSummaryText(e,t,i,a){const n=patientReportGetAdultBmiMedianRef(i,a),r=n?patientReportWeightForBmi(t,n.medianBmi):null,o=patientReportBuildAdultPopulationComparison(e,r,{digits:1,nearTolerance:PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.WEIGHT_KG});if(!o.available)return"brak por\xF3wnania do doros\u0142ej populacji w Polsce.";const l=patientReportBuildAdultPopulationGroupText(i,n&&n.ageLabel);return o.state==="exact"?`przy Twoim wzro\u015Bcie jest taka sama jak przeci\u0119tna masa ${l}.`:o.state==="near"?`przy Twoim wzro\u015Bcie jest bardzo zbli\u017Cona do przeci\u0119tnej masy ${l}.`:o.state==="above"?`przy Twoim wzro\u015Bcie jest o ${o.formattedDiff} kg wy\u017Csza ni\u017C przeci\u0119tna masa ${l}.`:`przy Twoim wzro\u015Bcie jest o ${o.formattedDiff} kg ni\u017Csza ni\u017C przeci\u0119tna masa ${l}.`}function patientReportBuildAdultHeightPopulationSummaryText(e,t,i){const a=patientReportResolveAdultHeightPosition(e,t,i),n=patientReportBuildAdultPopulationComparison(e,a&&a.available?a.p50:null,{digits:1,nearTolerance:PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.HEIGHT_CM});if(!a||!a.available||!n.available)return"brak por\xF3wnania do doros\u0142ej populacji w Polsce.";const r=patientReportBuildAdultPopulationGroupText(t,a.ageLabel),o=patientReportGetAdultHeightBandSummaryFragment(a);return n.state==="exact"?`jest dok\u0142adnie r\xF3wny przeci\u0119tnemu wzrostowi ${r}.`:n.state==="near"?`jest bardzo zbli\u017Cony do przeci\u0119tnego wzrostu ${r}.`:n.state==="above"?`jest o ${n.formattedDiff} cm wy\u017Cszy od przeci\u0119tnego wzrostu ${r} i ${o}.`:`jest o ${n.formattedDiff} cm ni\u017Cszy od przeci\u0119tnego wzrostu ${r} i ${o}.`}function patientReportBuildAdultBmiPopulationSummaryText(e,t,i){const a=patientReportGetAdultBmiMedianRef(t,i),n=patientReportBuildAdultPopulationComparison(e,a&&a.medianBmi,{digits:1,nearTolerance:PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.BMI});if(!n.available)return"brak por\xF3wnania do doros\u0142ej populacji w Polsce.";const r=patientReportBuildAdultPopulationGroupText(t,a&&a.ageLabel);return n.state==="exact"?`to dok\u0142adnie przeci\u0119tne BMI ${r}.`:n.state==="near"?`to BMI bardzo zbli\u017Cone do przeci\u0119tnego BMI ${r}.`:n.state==="above"?`to o ${n.formattedDiff} pkt wi\u0119cej ni\u017C przeci\u0119tne BMI ${r}.`:`to o ${n.formattedDiff} pkt mniej ni\u017C przeci\u0119tne BMI ${r}.`}function patientReportGetAdultBmiWeightDelta(e,t){if(!(typeof e=="number"&&isFinite(e)&&e>0)||!(typeof t=="number"&&isFinite(t)&&t>0))return null;const i=t/100;if(!(i>0))return null;const a=i*i,n=typeof BMI=="function"?BMI(e,t):e/a;if(!(typeof n=="number"&&isFinite(n)))return null;const r=ADULT_BMI.UNDER*a,o=24.9*a,l=Math.max(0,r-e),c=Math.max(0,e-o),s=Math.max(0,o-e);let p="normal";return c>.049?p="above-normal":l>.049?p="underweight":n>=24&&(p="upper-normal"),{state:p,bmi:n,lowerWeight:r,upperWeight:o,kgToLower:l,kgAboveUpper:c,kgToUpper:s}}function patientReportBuildAdultBmiWeightDeltaSentence(e,t,i){const a=patientReportGetAdultBmiWeightDelta(e,t);if(!a)return"";const n=i||{},r=Number.isFinite(n.digits)?n.digits:1,o=s=>`${patientReportFormatNumber(Math.max(0,s),r)} kg`,l=!!n.lowercaseStart,c=s=>{const p=String(s||"");return!l||!p?p:p.charAt(0).toLowerCase()+p.slice(1)};if(a.state==="above-normal"){const s=n.omitAdultQualifier?"":" dla doros\u0142ych";return c(`Aby BMI wr\xF3ci\u0142o do zakresu prawid\u0142owego${s}, nale\u017Ca\u0142oby zredukowa\u0107 mas\u0119 cia\u0142a o ok. ${o(a.kgAboveUpper)}.`)}if(a.state==="underweight"){const s=n.omitAdultQualifier?"":" dla doros\u0142ych";return n.preferPlainNormalRange?c(`Aby BMI wr\xF3ci\u0142o do zakresu prawid\u0142owego${s}, nale\u017Ca\u0142oby zwi\u0119kszy\u0107 mas\u0119 cia\u0142a o ok. ${o(a.kgToLower)}.`):c(`Aby BMI osi\u0105gn\u0119\u0142o doln\u0105 granic\u0119 zakresu prawid\u0142owego${s}, nale\u017Ca\u0142oby zwi\u0119kszy\u0107 mas\u0119 cia\u0142a o ok. ${o(a.kgToLower)}.`)}return a.state==="upper-normal"?c(`Do g\xF3rnej granicy zakresu prawid\u0142owego BMI dla doros\u0142ych pozostaje ok. ${o(a.kgToUpper)}.`):n.includeNormalReserve?c(`BMI mie\u015Bci si\u0119 w prawid\u0142owym zakresie dla doros\u0142ych. Do g\xF3rnej granicy normy pozostaje ok. ${o(a.kgToUpper)}.`):""}function patientReportGetAdultBmiSummaryStatusLabel(e){const t=String(e||"").trim();return t==="underweight"?"niedowaga":t==="overweight"?"nadwaga":t==="obesity-1"?"oty\u0142o\u015B\u0107 I stopnia":t==="obesity-2"?"oty\u0142o\u015B\u0107 II stopnia":t==="obesity-3"?"oty\u0142o\u015B\u0107 III stopnia":t==="upper-normal"?"w zakresie prawid\u0142owym dla doros\u0142ych, ale blisko g\xF3rnej granicy":"w zakresie prawid\u0142owym dla doros\u0142ych"}function patientReportScaleGradient(){return"linear-gradient(90deg, #ffd7d7 0%, #ffc9c9 10%, #ffe4b8 17%, #d7f2f3 25%, #b3eaed 50%, #d7f2f3 75%, #ffe4b8 83%, #ffc9c9 90%, #ffd7d7 100%)"}function patientReportMapValueToScalePercent(e,t,i){const a=Number.isFinite(t)?t:0,n=Number.isFinite(i)?i:100;return!(typeof e=="number"&&isFinite(e))||!isFinite(a)||!isFinite(n)||n<=a?0:(Math.max(a,Math.min(n,e))-a)/(n-a)*100}function patientReportBuildAdultBmiScaleModel(e){if(!(typeof e=="number"&&isFinite(e)))return null;const t=15,i=40,a=18.5,n=24,r=25,o=30,l=35,c=40,s=patientReportMapValueToScalePercent(a,t,i),p=patientReportMapValueToScalePercent(n,t,i),d=patientReportMapValueToScalePercent(r,t,i),u=patientReportMapValueToScalePercent(o,t,i),w=patientReportMapValueToScalePercent(l,t,i),f=patientReportMapValueToScalePercent(c,t,i),g=`linear-gradient(90deg,
    #ffe4b8 0%, #ffe4b8 ${s}%,
    #b3eaed ${s}%, #b3eaed ${p}%,
    #ffe9c8 ${p}%, #ffe9c8 ${d}%,
    #ffd3a6 ${d}%, #ffd3a6 ${u}%,
    #ffc9c9 ${u}%, #ffc9c9 ${w}%,
    #ffb1b1 ${w}%, #ffb1b1 ${f}%
  )`,b=(z,k=null,m=null)=>({pos:patientReportMapValueToScalePercent(z,t,i),label:patientReportFormatNumber(z,m??(z%1?1:0)),safePos:k??patientReportMapValueToScalePercent(z,t,i)});return{marker:patientReportMapValueToScalePercent(e,t,i),ticks:[b(a,Math.max(8,s),1),b(r),b(o),b(l),b(c,94.5)],valueLabels:[{pos:patientReportMapValueToScalePercent((t+a)/2,t,i),safePos:8.5,label:"Niedowaga"},{pos:patientReportMapValueToScalePercent((a+r)/2,t,i),safePos:30.5,label:"Norma"},{pos:patientReportMapValueToScalePercent((r+o)/2,t,i),label:"Nadwaga"},{pos:patientReportMapValueToScalePercent((o+i)/2,t,i),safePos:82,label:"Oty\u0142o\u015B\u0107"}],gradient:g}}function patientReportBuildAdultHeightScaleModel(e){if(!e||!e.available)return null;const t=Number(e.p10),i=Number(e.p50),a=Number(e.p90),n=Number(e.height);if(![t,i,a,n].every(g=>typeof g=="number"&&isFinite(g)))return null;const r=Math.max(1,i-t),o=Math.max(1,a-i),l=Math.max(0,t-r),c=a+o,s=patientReportMapValueToScalePercent(t,l,c),p=patientReportMapValueToScalePercent(i,l,c),d=patientReportMapValueToScalePercent(a,l,c),u=`linear-gradient(90deg,
    #ffe4b8 0%, #ffe4b8 ${s}%,
    #d7f2f3 ${s}%, #d7f2f3 ${d}%,
    #ffe4b8 ${d}%, #ffe4b8 100%
  )`,w=(g,b,z)=>({pos:g,label:b,safePos:z}),f=(g,b)=>({pos:patientReportMapValueToScalePercent(g,l,c),safePos:b,label:patientReportFormatScaleValue(g,"cm",1)});return{marker:patientReportMapValueToScalePercent(n,l,c),ticks:[w(s,"10c",Math.max(10,s)),w(p,"50c",p),w(d,"90c",Math.min(90,d))],valueLabels:[f(t,Math.max(10,s)),f(i,p),f(a,Math.min(90,d))],gradient:u}}function patientReportGetAdultBmiRangeKey(e){return typeof e=="number"&&isFinite(e)?e<ADULT_BMI.UNDER?"underweight":e<ADULT_BMI.OVER?"normal":e<30?"overweight":e<35?"obesity-1":e<40?"obesity-2":"obesity-3":""}function patientReportBuildAdultBmiRangesTableHtml(e,t){const i=patientReportGetAdultBmiRangeKey(e),a=String(t||"normal");return`
    <div class="patient-report-bmi-ranges-box">
      <div class="patient-report-bmi-ranges-title">Normy BMI dla doros\u0142ych</div>
      <table class="patient-report-bmi-ranges-table" role="presentation" aria-hidden="true">
        <tbody>${[{key:"underweight",label:"Niedowaga",range:"< 18,5"},{key:"normal",label:"Norma",range:"18,5\u201324,9"},{key:"overweight",label:"Nadwaga",range:"25,0\u201329,9"},{key:"obesity-1",label:"Oty\u0142o\u015B\u0107 I\xB0",range:"30,0\u201334,9"},{key:"obesity-2",label:"Oty\u0142o\u015B\u0107 II\xB0",range:"35,0\u201339,9"},{key:"obesity-3",label:"Oty\u0142o\u015B\u0107 III\xB0",range:"\u2265 40,0"}].map(o=>`
      <tr class="patient-report-bmi-ranges-row${o.key===i?` is-active tone-${patientReportEscapeHtml(a)}`:""}">
        <td>${patientReportEscapeHtml(o.label)}</td>
        <td class="patient-report-bmi-ranges-value">${patientReportEscapeHtml(o.range)}</td>
      </tr>`).join("")}</tbody>
      </table>
    </div>`}function patientReportBuildScaleModel(e,t,i){if(typeof t!="number"||!isFinite(t))return null;const a=Math.max(0,Math.min(100,t));return e==="BMI"?{marker:a,ticks:[{pos:5,label:"5c",safePos:7},{pos:50,label:"50c",safePos:50},{pos:85,label:"85c",safePos:85},{pos:95,label:"95c",safePos:93}],valueLabels:Array.isArray(i)?i:[],gradient:patientReportScaleGradient()}:{marker:a,ticks:[{pos:3,label:"3c",safePos:6.5},{pos:50,label:"50c",safePos:50},{pos:97,label:"97c",safePos:93.5}],valueLabels:Array.isArray(i)?i:[],gradient:patientReportScaleGradient()}}function patientReportCollectAllTrendPoints(){const e=[];try{if(typeof advGrowthCollectAllPointsForReport=="function"){const r=advGrowthCollectAllPointsForReport();Array.isArray(r)&&r.forEach(o=>{!o||typeof o.ageMonths!="number"||!isFinite(o.ageMonths)||e.push({ageMonths:o.ageMonths,weight:typeof o.weight=="number"&&isFinite(o.weight)?o.weight:null,height:typeof o.height=="number"&&isFinite(o.height)?o.height:null,current:o.pointType==="current"})})}}catch(r){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",r,{line:14462})}const t=typeof getAgeDecimal=="function"?getAgeDecimal():0,i=Math.round(t*12),a=parseFloat(document.getElementById("height")?.value),n=parseFloat(document.getElementById("weight")?.value);return isFinite(i)&&i>=0&&(!isNaN(a)||!isNaN(n))&&(e.some(o=>{if(o.ageMonths!==i)return!1;const l=o.height==null&&isNaN(a)||typeof o.height=="number"&&!isNaN(a)&&Math.abs(o.height-a)<.05,c=o.weight==null&&isNaN(n)||typeof o.weight=="number"&&!isNaN(n)&&Math.abs(o.weight-n)<.05;return l&&c})||e.push({ageMonths:i,weight:isNaN(n)?null:n,height:isNaN(a)?null:a,current:!0})),e.slice().sort((r,o)=>r.ageMonths-o.ageMonths)}function patientReportBuildTrendSeries(e,t){const i=[];return(e||[]).forEach((a,n)=>{let r=null;t==="BMI"?typeof a.weight=="number"&&typeof a.height=="number"&&typeof BMI=="function"&&(r=BMI(a.weight,a.height)):t==="WT"?r=a.weight:t==="HT"&&(r=a.height),!(typeof r!="number"||!isFinite(r))&&i.push({x:a.ageMonths,y:r,current:!!a.current,label:typeof advHistoryFormatAgeMonths=="function"?advHistoryFormatAgeMonths(a.ageMonths):`${Math.floor(a.ageMonths/12)} l.`})}),i}function patientReportBuildTrendPeriodLabel(e){const t=Math.max(0,Math.round(Number(e)||0));return!isFinite(t)||t<=0?"Od poprzedniego pomiaru":t===1?"W ostatnim miesi\u0105cu":t===12?"W okresie ostatniego roku":t<7?`W ostatnich ${t} miesi\u0105cach`:t<12?`W ci\u0105gu ostatnich ${t} miesi\u0119cy`:t%12===0?`W okresie ostatnich ${t/12} lat`:`W ci\u0105gu ostatnich ${t} miesi\u0119cy`}function patientReportBuildTrendDeltaText(e,t,i){if(!Array.isArray(e)||e.length<2)return"";const a=e[e.length-2],n=e[e.length-1],r=n.y-a.y,o=Math.round((n.x||0)-(a.x||0)),l=patientReportBuildTrendPeriodLabel(o),c=patientReportFormatNumber(Math.abs(r),Number.isFinite(i)?i:1),s=String(t||"").trim();return Math.abs(r)<.05?`${l}: bez wi\u0119kszej zmiany.`:`${l}: ${r>0?"+":"-"}${c}${s?` ${s}`:""}.`}function patientReportBuildSparklineSvg(e,t){if(!Array.isArray(e)||e.length<2)return"";const i=t||{},a=360,n=118,r=14,o=14,l=24,c=e.map(j=>j.x),s=e.map(j=>j.y);let p=Math.min.apply(null,c),d=Math.max.apply(null,c),u=Math.min.apply(null,s),w=Math.max.apply(null,s);if(!isFinite(p)||!isFinite(d)||!isFinite(u)||!isFinite(w))return"";if(d===p&&(d=p+1),w===u){const j=Math.max(1,Math.abs(w)*.05);u-=j,w+=j}const f=a-r*2,g=n-o-l,b=j=>r+(j-p)/(d-p)*f,z=j=>o+(1-(j-u)/(w-u))*g,k=e.map((j,B)=>`${B===0?"M":"L"} ${b(j.x).toFixed(2)} ${z(j.y).toFixed(2)}`).join(" "),m=`${k} L ${b(e[e.length-1].x).toFixed(2)} ${(o+g).toFixed(2)} L ${b(e[0].x).toFixed(2)} ${(o+g).toFixed(2)} Z`,h=e[e.length-1],y=e[0],x=e.map(j=>{const B=b(j.x).toFixed(2),P=z(j.y).toFixed(2),M=j.current?4.8:3.4,I=j.current?"#7c3aed":"#00838d",C=j.current?"#ffffff":"#e8f6f6";return`<circle cx="${B}" cy="${P}" r="${M}" fill="${I}" stroke="${C}" stroke-width="2" />`}).join(""),v=patientReportEscapeHtml(y.label||""),T=patientReportEscapeHtml(h.label||""),S=patientReportEscapeHtml(`${patientReportFormatNumber(h.y,Number.isFinite(i.digits)?i.digits:1)} ${i.unit||""}`.trim()),R=`patientSparkFill_${Math.random().toString(36).slice(2,10)}`;return`
    <svg viewBox="0 0 ${a} ${n}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Trend ${patientReportEscapeHtml(i.title||"")}">
      <defs>
        <linearGradient id="${R}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#00838d" stop-opacity="0.24" />
          <stop offset="100%" stop-color="#00838d" stop-opacity="0.03" />
        </linearGradient>
      </defs>
      <line x1="${r}" y1="${(o+g).toFixed(2)}" x2="${(r+f).toFixed(2)}" y2="${(o+g).toFixed(2)}" stroke="#d6e7e7" stroke-width="1.5" />
      <path d="${m}" fill="url(#${R})" stroke="none" />
      <path d="${k}" fill="none" stroke="#00838d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      ${x}
      <text x="${r}" y="${n-5}" font-size="12" fill="#6b7d7d">${v}</text>
      <text x="${r+f}" y="${n-5}" font-size="12" fill="#6b7d7d" text-anchor="end">${T}</text>
      <rect x="${a-112}" y="6" width="104" height="20" rx="10" fill="#f4f7fb" stroke="#dbe7f2" />
      <text x="${a-60}" y="20" font-size="11.5" fill="#37556a" text-anchor="middle">${S}</text>
    </svg>`}function patientReportSplitSummaryLine(e){const t=String(e||"").trim(),i=t.indexOf(":");return i<=0?{label:t,value:""}:{label:t.slice(0,i).trim(),value:t.slice(i+1).trim()}}function patientReportGroupSummaryLines(e){const t=[{key:"main",title:"Waga, wzrost i BMI",intro:"Najwa\u017Cniejsze wska\u017Aniki z bie\u017C\u0105cego pomiaru.",items:[]},{key:"body",title:"Obwody i proporcje cia\u0142a",intro:"Pomocnicze pomiary budowy cia\u0142a.",items:[]},{key:"cardio",title:"Ci\u015Bnienie i dodatkowe pomiary",intro:"Pomiary dodatkowe wykonane podczas wizyty.",items:[]},{key:"growth",title:"Tempo wzrastania i potencja\u0142",intro:"Wska\u017Aniki przydatne w ocenie wzrastania w czasie.",items:[]},{key:"other",title:"Pozosta\u0142e wyniki",intro:"Dodatkowe informacje z cz\u0119\u015Bci profesjonalnej.",items:[]}],i=a=>{const n=String(a||"").toLowerCase();return n.startsWith("waga")||n.startsWith("wzrost")||n.startsWith("bmi")||n.startsWith("pow. cia\u0142a")||n.startsWith("wska\u017Anik cole")||n.startsWith("proporcja masy")?"main":n.startsWith("obw\xF3d talii")||n.startsWith("obw\xF3d bioder")||n.startsWith("whr")?"body":n.startsWith("rr ")||n.startsWith("ci\u015Bnienie")||n.startsWith("obw\xF3d g\u0142owy")||n.startsWith("obw\xF3d kl.")?"cardio":n.startsWith("aktualne tempo")||n.startsWith("tempo wzrastania")||n.startsWith("sds tempa")||n.startsWith("mph")||n.startsWith("hsds")?"growth":"other"};return(e||[]).forEach(a=>{const n=i(a),r=t.find(l=>l.key===n)||t[t.length-1],o=patientReportSplitSummaryLine(a);r.items.push({raw:a,label:o.label,value:o.value,tone:getProfessionalSummaryLineTone(a)})}),t.filter(a=>a.items.length)}function patientReportCollectHighlights(e){const t=[],i=typeof getAgeDecimal=="function"?getAgeDecimal():NaN,a=typeof patientReportIsAdultAgeForCurrentMode=="function"?patientReportIsAdultAgeForCurrentMode(i):typeof patientReportIsAdultAge=="function"?patientReportIsAdultAge(i):isFinite(i)&&i>=18,n=parseFloat(document.getElementById("weight")?.value)||0,r=parseFloat(document.getElementById("height")?.value)||0,o=a&&r>0&&n>0&&typeof BMI=="function"?BMI(n,r):null,l=a?patientReportGetAdultBmiAssessment(o):null,c=(s,p)=>{s&&(t.some(d=>d.text===s)||t.push({text:s,tone:p||"warn"}))};return(e||[]).forEach(s=>{const p=getProfessionalSummaryLineTone(s);if(p==="normal")return;const d=String(s||"").toLowerCase();if(a){if(d.startsWith("wzrost")||d.startsWith("tempo wzrastania")||d.startsWith("aktualne tempo")||d.startsWith("mph")||d.startsWith("hsds"))return;if(d.startsWith("waga")||d.startsWith("bmi")){const u=l&&l.highlightText?l.highlightText:"Ocena masy cia\u0142a u doros\u0142ych powinna by\u0107 interpretowana przede wszystkim \u0142\u0105cznie z BMI.";c(u,l&&l.tone?l.tone:p);return}}d.startsWith("proporcja masy do wysoko\u015Bci")?c("Proporcja masy do wysoko\u015Bci cia\u0142a jest poza typowym zakresem centylowym.",p):d.startsWith("obw\xF3d g\u0142owy")?c("Obw\xF3d g\u0142owy jest poza typowym zakresem centylowym dla wieku i p\u0142ci.",p):d.startsWith("obw\xF3d klatki")?c("Obw\xF3d klatki piersiowej jest poza typowym zakresem centylowym dla wieku i p\u0142ci.",p):d.startsWith("bmi")?c("BMI wymaga om\xF3wienia w kontek\u015Bcie wieku i wzrostu.",p):d.startsWith("waga")?c("Masa cia\u0142a jest poza typowym zakresem dla wieku.",p):d.startsWith("wzrost")?c("Wzrost znajduje si\u0119 poza typowym zakresem centylowym.",p):d.startsWith("rr ")||d.startsWith("ci\u015Bnienie")?c("Ci\u015Bnienie t\u0119tnicze wymaga kontroli w kolejnych pomiarach.",p):d.startsWith("whr")?c("Rozk\u0142ad tkanki t\u0142uszczowej warto ocenia\u0107 \u0142\u0105cznie z innymi wynikami.",p):d.startsWith("wska\u017Anik cole")?c("Wska\u017Anik Cole\u2019a pomaga oceni\u0107 mas\u0119 cia\u0142a wzgl\u0119dem wzrostu.",p):d.startsWith("tempo wzrastania")||d.startsWith("aktualne tempo")?c("Tempo wzrastania trzeba interpretowa\u0107 w odniesieniu do czasu mi\u0119dzy pomiarami.",p):(d.startsWith("mph")||d.startsWith("hsds"))&&c("Wzrost warto ocenia\u0107 tak\u017Ce wzgl\u0119dem potencja\u0142u rodzinnego.",p)}),t.slice(0,4)}function patientReportHeadlineIssueGroupKey(e){const t=String(e||"").toLowerCase().trim();if(!t)return"";if(t.startsWith("rr ")||t.startsWith("ci\u015Bnienie"))return"blood-pressure";if(t.startsWith("t\u0119tno")||t.startsWith("hr "))return"heart-rate";if(t.startsWith("waga")||t.startsWith("bmi")||t.startsWith("wska\u017Anik cole"))return"body-mass";if(t.startsWith("wzrost")||t.startsWith("tempo wzrastania")||t.startsWith("aktualne tempo")||t.startsWith("sds tempa")||t.startsWith("mph")||t.startsWith("hsds"))return"growth";if(t.startsWith("whr"))return"fat-distribution";const i=patientReportSplitSummaryLine(e);return String(i&&i.label||"").toLowerCase().trim()||t}function patientReportCollectFlaggedSummaryItems(e){const t=[];return(e||[]).forEach(i=>{const a=getProfessionalSummaryLineTone(i);a!=="normal"&&t.push({line:i,tone:a,lc:String(i||"").toLowerCase(),split:patientReportSplitSummaryLine(i),group:patientReportHeadlineIssueGroupKey(i)})}),t}function patientReportAppendSentence(e,t){const i=String(e||"").trim(),a=String(t||"").trim();return i?a?`${i} ${a}`:i:a}function patientReportEnsureSentence(e){const t=String(e||"").trim();if(!t)return"";const i=t.replace(/[\s,;:]+$/,"");return i?/[.!?]$/.test(i)?i:`${i}.`:""}function patientReportFormatIssueList(e){const t=(e||[]).map(i=>String(i||"").trim()).filter(Boolean);return t.length?t.length===1?t[0]:t.length===2?`${t[0]} oraz ${t[1]}`:`${t.slice(0,-1).join(", ")} oraz ${t[t.length-1]}`:""}function patientReportBuildAdditionalIssueSentence(e,t){const i=new Set(Array.isArray(t)?t.filter(Boolean):[]),a=typeof getAgeDecimal=="function"?getAgeDecimal():NaN,n=typeof patientReportIsAdultAgeForCurrentMode=="function"?patientReportIsAdultAgeForCurrentMode(a):typeof patientReportIsAdultAge=="function"?patientReportIsAdultAge(a):isFinite(a)&&a>=18,r=typeof patientReportGetCurrentBasics=="function"?patientReportGetCurrentBasics():null,o=n?patientReportGetAdultBmiAssessment(r&&r.bmi):null,l=[];if((e||[]).forEach(s=>{const p=String(s&&s.group||"").trim();!p||i.has(p)||l.includes(p)||n&&p==="growth"||l.push(p)}),!l.length)return"";if(l.length===1){const s=l[0];if(s==="blood-pressure")return n?"R\xF3wnocze\u015Bnie wynik ci\u015Bnienia t\u0119tniczego wymaga potwierdzenia w kolejnych pomiarach.":"R\xF3wnocze\u015Bnie ci\u015Bnienie t\u0119tnicze wymaga dalszej kontroli i interpretacji w kolejnych pomiarach.";if(s==="heart-rate")return n?"R\xF3wnocze\u015Bnie t\u0119tno spoczynkowe nale\u017Cy interpretowa\u0107 \u0142\u0105cznie z objawami, aktywno\u015Bci\u0105 i stosowanymi lekami.":"R\xF3wnocze\u015Bnie t\u0119tno wymaga odniesienia do norm dla wieku i warunk\xF3w pomiaru.";if(s==="growth")return"R\xF3wnocze\u015Bnie wzrost wymaga oceny wzgl\u0119dem siatek centylowych i tempa wzrastania.";if(s==="body-mass"){if(n)return o&&o.state==="upper-normal"?"R\xF3wnocze\u015Bnie BMI mie\u015Bci si\u0119 jeszcze w normie, ale zbli\u017Ca si\u0119 do g\xF3rnej granicy.":o&&(o.state==="overweight"||String(o.state||"").startsWith("obesity"))?"R\xF3wnocze\u015Bnie BMI wskazuje na nadmiar masy cia\u0142a.":o&&o.state==="underweight"?"R\xF3wnocze\u015Bnie BMI wskazuje na niedowag\u0119.":"R\xF3wnocze\u015Bnie mas\u0119 cia\u0142a u doros\u0142ych warto interpretowa\u0107 przede wszystkim \u0142\u0105cznie z BMI.";const p=(e||[]).filter(u=>u&&u.group==="body-mass");return p.some(u=>u.lc.startsWith("wska\u017Anik cole"))&&!p.some(u=>u.lc.startsWith("bmi")||u.lc.startsWith("waga"))?"R\xF3wnocze\u015Bnie wska\u017Anik Cole\u2019a jest poza typowym zakresem i warto interpretowa\u0107 go \u0142\u0105cznie z BMI oraz wzrostem.":"R\xF3wnocze\u015Bnie parametry masy cia\u0142a s\u0105 poza typowym zakresem dla wieku."}return s==="fat-distribution"?"R\xF3wnocze\u015Bnie rozk\u0142ad tkanki t\u0142uszczowej wymaga dodatkowej oceny wraz z pozosta\u0142ymi wynikami.":"R\xF3wnocze\u015Bnie dodatkowej oceny wymaga jeszcze jeden parametr z podsumowania."}const c=l.map(s=>s==="blood-pressure"?"ci\u015Bnienie t\u0119tnicze":s==="heart-rate"?n?"t\u0119tno spoczynkowe":"t\u0119tno":s==="growth"?"wzrost":s==="body-mass"?n?"masa cia\u0142a i BMI":"parametry masy cia\u0142a":s==="fat-distribution"?"rozk\u0142ad tkanki t\u0142uszczowej":"inne parametry z podsumowania");return`R\xF3wnocze\u015Bnie dodatkowej oceny wymagaj\u0105 ${patientReportFormatIssueList(c)}.`}function patientReportBuildFlaggedSummaryHeadline(e){const t=patientReportCollectFlaggedSummaryItems(e);if(!t.length)return null;const i=typeof patientReportGetCurrentBasics=="function"?patientReportGetCurrentBasics():null,a=!!(i&&i.isAdult),n=a?patientReportGetAdultBmiAssessment(i&&i.bmi):null,r=t.some(u=>u.tone==="danger"),o=t.find(u=>u.tone==="danger")||t[0];let l=r?"Wynik nieprawid\u0142owy":"Wymaga om\xF3wienia",c=r?"danger":"warn",s="Nie wszystkie najwa\u017Cniejsze wyniki mieszcz\u0105 si\u0119 obecnie w typowym zakresie dla wieku i p\u0142ci.",p="",d="";if(a&&(o.lc.startsWith("waga")||o.lc.startsWith("bmi"))&&n&&n.state&&n.state!=="normal")l=n.badge||l,c=n.tone||c,s=n.headlineTitle||s,p=n.headlineText||"",d="";else if(o.lc.startsWith("wska\u017Anik cole")){/* P-TON-3b: wartosc wskaznika z window.colePercentValue — tej samej liczby, z ktorej
   zbudowano wiersz. Wyrazenie regularne na wydrukowanym tekscie zostaje tylko jako zapas. */const cv0=typeof window<"u"&&typeof window.colePercentValue=="number"&&isFinite(window.colePercentValue)?window.colePercentValue:null,u=cv0===null?o.line.match(/([\d]+(?:[\.,]\d+)?)\s*%/):null,w=cv0!==null?cv0:u?parseFloat(String(u[1]).replace(",",".")):null,f=patientReportClassifyCole(w);f&&f.category==="Nadwaga"?(s="Wska\u017Anik Cole\u2019a wskazuje obecnie na nadwag\u0119.",p="Pomimo tego, \u017Ce waga i BMI s\u0105 jeszcze w normie, wska\u017Anik Cole\u2019a mo\u017Ce by\u0107 pierwszym sygna\u0142em nadwagi u dziecka."):f&&f.category==="Oty\u0142o\u015B\u0107"?(s="Wska\u017Anik Cole\u2019a wskazuje obecnie na oty\u0142o\u015B\u0107.",p="Oznacza to, \u017Ce masa cia\u0142a wzgl\u0119dem wzrostu i wieku jest wyra\u017Anie powy\u017Cej typowego zakresu.",l="Wynik nieprawid\u0142owy",c="danger"):f&&f.category==="Niedowaga"?(s="Wska\u017Anik Cole\u2019a wskazuje obecnie na niedowag\u0119.",p="Oznacza to, \u017Ce masa cia\u0142a wzgl\u0119dem wzrostu i wieku jest poni\u017Cej typowego zakresu."):p="Wska\u017Anik Cole\u2019a wymaga om\xF3wienia w odniesieniu do wieku, p\u0142ci i wzrostu.",d=""}else if(o.lc.startsWith("waga"))s="Masa cia\u0142a znajduje si\u0119 obecnie poza typowym zakresem dla wieku.",p="Wynik nale\u017Cy interpretowa\u0107 \u0142\u0105cznie z wzrostem, BMI i przebiegiem wcze\u015Bniejszych pomiar\xF3w.";else if(o.lc.startsWith("wzrost"))s="Wzrost wymaga interpretacji wzgl\u0119dem siatek centylowych dla wieku i p\u0142ci.",p="Taki wynik warto ocenia\u0107 razem z tempem wzrastania i danymi z wcze\u015Bniejszych wizyt.";else if(o.lc.startsWith("bmi"))s="BMI wymaga obecnie dodatkowego om\xF3wienia.",p="Oznacza to, \u017Ce nie wszystkie parametry z bie\u017C\u0105cego pomiaru mieszcz\u0105 si\u0119 w typowym zakresie dla wieku i p\u0142ci.";else if(o.lc.startsWith("rr ")||o.lc.startsWith("ci\u015Bnienie"))if(a&&window.adultVitalsApi&&typeof window.adultVitalsApi.getState=="function"&&typeof window.adultVitalsApi.classifyBloodPressure=="function"){const u=window.adultVitalsApi.getState(),f=(window.adultVitalsApi&&typeof window.adultVitalsApi.hasAnyMeasurement=="function"?window.adultVitalsApi.hasAnyMeasurement(u):!1)?u.guidelineKey:"ESC",g=window.adultVitalsApi.classifyBloodPressure(u.sbp,u.dbp,f);g&&g.key&&g.key!=="normal"&&g.key!=="missing"&&g.key!=="partial"?(l=g.badge||l,c=g.tone||c,s=g.headlineTitle||"Ci\u015Bnienie t\u0119tnicze wymaga obecnie kontroli.",p=g.headlineText||"Wynik znajduje si\u0119 poza typowym zakresem dla doros\u0142ych."):(s="Ci\u015Bnienie t\u0119tnicze u doros\u0142ych nale\u017Cy ocenia\u0107 w kolejnych pomiarach.",p="Pojedynczy odczyt warto interpretowa\u0107 w warunkach pe\u0142nego spoczynku i potwierdzi\u0107 w kolejnych pomiarach.")}else s="Ci\u015Bnienie t\u0119tnicze wymaga obecnie kontroli i interpretacji w kolejnych pomiarach.",p="Uzyskany pomiar nale\u017Cy ocenia\u0107 w odniesieniu do wieku, wzrostu oraz warunk\xF3w pomiaru.";else if(o.lc.startsWith("t\u0119tno")){if(a&&window.adultVitalsApi&&typeof window.adultVitalsApi.getState=="function"&&typeof window.adultVitalsApi.classifyHeartRate=="function"){const u=window.adultVitalsApi.getState(),w=window.adultVitalsApi.classifyHeartRate(u.hr,{athlete:u.athlete,betaBlocker:u.betaBlocker});w&&w.key&&w.key!=="normal"&&w.key!=="missing"?(l=w.badge||l,c=w.tone||c,s=w.headlineTitle||"T\u0119tno spoczynkowe wymaga obecnie kontroli.",p=w.headlineText||"Wynik odbiega od typowego zakresu t\u0119tna spoczynkowego dla doros\u0142ych."):(s="T\u0119tno spoczynkowe u doros\u0142ych nale\u017Cy ocenia\u0107 w pe\u0142nym spoczynku.",p="Do interpretacji potrzebny jest rzeczywisty pomiar t\u0119tna spoczynkowego oraz kontekst kliniczny.")}}else o.lc.startsWith("whr")?(s="Rozk\u0142ad tkanki t\u0142uszczowej wymaga dodatkowej oceny.",p="Wynik warto interpretowa\u0107 \u0142\u0105cznie z mas\u0105 cia\u0142a, BMI i obwodem talii."):o.lc.startsWith("tempo wzrastania")||o.lc.startsWith("aktualne tempo")?(s="Tempo wzrastania wymaga obecnie uwa\u017Cniejszej obserwacji.",p="Najwi\u0119cej informacji daje por\xF3wnanie kilku kolejnych pomiar\xF3w w czasie."):(o.lc.startsWith("mph")||o.lc.startsWith("hsds"))&&(s="Wzrost warto odnie\u015B\u0107 r\xF3wnie\u017C do potencja\u0142u rodzinnego.",p="Ten wynik nie mie\u015Bci si\u0119 w pe\u0142ni w typowym zakresie i powinien by\u0107 interpretowany razem z pozosta\u0142ymi danymi.");if(!p){const u=String(o.split&&o.split.label||"").trim();p=u?`Szczeg\xF3lnej uwagi wymaga parametr: ${u}.`:"Wynik wymaga om\xF3wienia w kontek\u015Bcie ca\u0142ego badania."}return p=patientReportAppendSentence(p,patientReportBuildAdditionalIssueSentence(t,[o.group])),{badge:l,tone:c,title:s,text:p,subtext:d,primaryGroup:o.group,issueGroups:Array.from(new Set(t.map(u=>u.group).filter(Boolean)))}}function patientReportGetWeightDirectionFromPercentile(e){return typeof e!="number"||!isFinite(e)?"":e<10?"low":e>=90?"high":"normal"}function patientReportGetBmiDirectionFromCategory(e){const t=patientReportNormalizeBmiCategory(e);return t==="underweight"?"low":t==="overweight"||t==="obesity"?"high":t==="normal"?"normal":""}function patientReportDescribeBodyMassHeadlineTarget(e,t){const i=Array.isArray(e)?e:[],a=i.find(s=>s&&s.key==="WT")||null,n=i.find(s=>s&&s.key==="BMI")||null,r=patientReportGetWeightDirectionFromPercentile(a&&a.percentile),o=patientReportGetBmiDirectionFromCategory(n&&n.category),l=r===t,c=o===t;return l&&c?{subject:"Masa cia\u0142a i BMI",inlineSubject:"masa cia\u0142a i BMI",verb:"s\u0105",count:2,weightDirection:r,bmiDirection:o}:l?{subject:"Masa cia\u0142a",inlineSubject:"masa cia\u0142a",verb:"jest",count:1,weightDirection:r,bmiDirection:o}:c?{subject:"BMI",inlineSubject:"BMI",verb:"jest",count:1,weightDirection:r,bmiDirection:o}:{subject:"Parametry masy cia\u0142a",inlineSubject:"parametry masy cia\u0142a",verb:"s\u0105",count:0,weightDirection:r,bmiDirection:o}}function patientReportBuildBodyMassRangeSentence(e,t,i){const a=i||{},n=patientReportDescribeBodyMassHeadlineTarget(e,t),r=a.inline?n.inlineSubject:n.subject,o=String(a.modifier||"").trim(),l=t==="high"?"powy\u017Cej typowego zakresu dla wieku":"poni\u017Cej typowego zakresu dla wieku",c=String(a.rangeText||l).trim();return`${r} ${n.verb}${o?` ${o}`:""} ${c}`.replace(/\s+/g," ").trim()}function patientReportBuildHeadline(e,t,i,a){const n=e.find(y=>y.key==="BMI")||null,r=e.find(y=>y.key==="HT")||null,o=String(n&&n.category||""),l=patientReportNormalizeBmiCategory(o),c=typeof patientReportGetCurrentBasics=="function"?patientReportGetCurrentBasics():null,s=!!(c&&c.isAdult),p=s?patientReportGetAdultBmiAssessment(c&&c.bmi):null,d=r&&typeof r.percentile=="number"&&isFinite(r.percentile)?r.percentile:null,u=Number(t)>0,w="Najwa\u017Cniejsze wyniki mieszcz\u0105 si\u0119 obecnie w typowym zakresie dla wieku i p\u0142ci.",f=patientReportCollectFlaggedSummaryItems(a),g=new Set;let b=o||"Ocena bie\u017C\u0105cego pomiaru",z=n?n.tone:"normal",k=w,m="",h="";if(s&&p&&p.state&&p.state!=="normal")g.add("body-mass"),b=p.badge||b,z=p.tone||z,k=p.headlineTitle||k,m=patientReportAppendSentence(p.headlineText||m,patientReportZdanieKrokuZFormularza()),h="";else if(!s&&typeof d=="number"&&isFinite(d)&&d<=10){g.add("growth");const y=u?"Szczeg\xF3lnie wa\u017Cne jest por\xF3wnanie obecnego wzrostu z wcze\u015Bniejszymi pomiarami i ocen\u0105 tempa wzrastania.":"Szczeg\xF3lnie wa\u017Cna jest ocena tempa wzrastania w kolejnych pomiarach.",x="Wynik warto interpretowa\u0107 tak\u017Ce w odniesieniu do wzrostu rodzic\xF3w i ca\u0142ego obrazu klinicznego.";d<=3?(b="Niski wzrost",z="danger",l==="obesity"||l==="overweight"?(g.add("body-mass"),k=`Wzrost znajduje si\u0119 wyra\u017Anie poni\u017Cej typowego zakresu, a ${patientReportBuildBodyMassRangeSentence(e,"high",{inline:!0,modifier:"jednocze\u015Bnie",rangeText:"powy\u017Cej normy dla wieku"})}.`,m=""):l==="underweight"?(g.add("body-mass"),k=`Wzrost znajduje si\u0119 wyra\u017Anie poni\u017Cej typowego zakresu, a ${patientReportBuildBodyMassRangeSentence(e,"low",{inline:!0,modifier:"dodatkowo",rangeText:"poni\u017Cej normy dla wieku"})}.`,m="Taki uk\u0142ad wynik\xF3w wymaga szczeg\xF3lnie uwa\u017Cnej oceny wzrastania i stanu od\u017Cywienia dziecka."):(k="Wzrost znajduje si\u0119 wyra\u017Anie poni\u017Cej typowego zakresu dla wieku i p\u0142ci.",m=""),h=`${y} ${x}`):(b="Niski wzrost",z=l==="obesity"?"danger":"warn",l==="obesity"||l==="overweight"?(g.add("body-mass"),k=`Wzrost znajduje si\u0119 w niskim zakresie centylowym, a ${patientReportBuildBodyMassRangeSentence(e,"high",{inline:!0,modifier:"jednocze\u015Bnie",rangeText:"powy\u017Cej typowego zakresu"})}.`,m="W takiej sytuacji r\xF3wnie wa\u017Cna jak ocena masy cia\u0142a jest analiza tempa wzrastania i ca\u0142ego przebiegu wzrostu."):l==="underweight"?(g.add("body-mass"),k=`Wzrost znajduje si\u0119 w niskim zakresie centylowym, a ${patientReportBuildBodyMassRangeSentence(e,"low",{inline:!0,modifier:"dodatkowo",rangeText:"poni\u017Cej typowego zakresu"})}.`,m="Taki wynik wymaga uwa\u017Cnej obserwacji tempa wzrastania i przyrostu masy cia\u0142a w czasie."):(k="Wzrost znajduje si\u0119 w niskim zakresie centylowym dla wieku i p\u0142ci.",m=""),h=`${y} ${x}`)}else o.includes("Oty\u0142o\u015B\u0107")?(g.add("body-mass"),k=`${patientReportBuildBodyMassRangeSentence(e,"high",{modifier:"obecnie wyra\u017Anie",rangeText:"powy\u017Cej typowych warto\u015Bci dla wieku"})}.`,m=patientReportZdanieKrokuZFormularza()||"Najwa\u017Cniejsze jest obserwowanie trendu w kolejnych pomiarach i ocenianie, czy wynik stopniowo przesuwa si\u0119 w stron\u0119 bardziej typowego zakresu.",z="danger"):o==="Nadwaga"?(g.add("body-mass"),k=`${patientReportBuildBodyMassRangeSentence(e,"high",{modifier:"obecnie",rangeText:"powy\u017Cej typowego zakresu dla wieku"})}.`,m=patientReportAppendSentence("Najwa\u017Cniejsze jest obserwowanie trendu kolejnych pomiar\xF3w i konsekwentne trzymanie si\u0119 zalece\u0144 ustalonych podczas wizyty.",patientReportZdanieKrokuZFormularza()),z="warn"):o==="Niedowaga"&&(g.add("body-mass"),k=`${patientReportBuildBodyMassRangeSentence(e,"low",{modifier:"obecnie",rangeText:"poni\u017Cej typowego zakresu dla wieku"})}.`,m="W kolejnych wizytach warto sprawdza\u0107, czy wynik wraca w kierunku typowych warto\u015Bci dla wieku i wzrostu.",z="warn");if(k===w){const y=patientReportBuildFlaggedSummaryHeadline(a);y&&(b=y.badge||b,z=y.tone||z,k=y.title||k,m=y.text||m,h=y.subtext||h,(y.issueGroups||[]).forEach(x=>{x&&g.add(x)}))}else m=patientReportAppendSentence(m,patientReportBuildAdditionalIssueSentence(f,Array.from(g)));return f.some(y=>y.tone==="danger")?z="danger":f.length&&z==="normal"&&(z="warn"),Array.isArray(i)&&i.length&&z==="normal"&&(z=i.some(y=>y.tone==="danger")?"danger":"warn",b="Wymaga om\xF3wienia",k===w&&(k="Nie wszystkie najwa\u017Cniejsze wyniki mieszcz\u0105 si\u0119 obecnie w typowym zakresie dla wieku i p\u0142ci.",m="Co najmniej jeden z parametr\xF3w z podsumowania wymaga dodatkowego om\xF3wienia.")),{badge:b,tone:z,title:k,text:m,subtext:h}}function patientReportBuildMetricCards(){const e=typeof getAgeDecimal=="function"?getAgeDecimal():0,t=document.getElementById("sex")?.value||"M",i=parseFloat(document.getElementById("weight")?.value),a=parseFloat(document.getElementById("height")?.value),n=!isNaN(i)&&!isNaN(a)&&typeof BMI=="function"?BMI(i,a):null,r=patientReportGetPreferredSource(),o=patientReportIsAdultAgeForCurrentMode(e),l=e>0&&!o,c=patientReportGetReferenceAgeYears(e),s=l&&typeof c=="number"&&isFinite(c)&&c>0&&c<=PATIENT_REPORT_ADULT_REFERENCE_AGE,p=patientReportCollectAllTrendPoints(),d=o?patientReportGetAdultBmiAssessment(n):null,u=o?patientReportBuildAdultBmiWeightDeltaSentence(i,a):"",f=!!(o&&d&&new Set(["overweight","obesity-1","obesity-2","obesity-3","underweight"]).has(d.state)),g=!!(d&&d.state==="underweight"),b=f?patientReportBuildAdultBmiWeightDeltaSentence(i,a,{preferPlainNormalRange:g}):u,z=f?patientReportBuildAdultBmiWeightDeltaSentence(i,a,{lowercaseStart:!0,omitAdultQualifier:!0,preferPlainNormalRange:g}):u,k=s&&!isNaN(i)&&typeof advHistoryResolveMetric=="function"?advHistoryResolveMetric("WT",i,t,c,r):{result:null,source:null,reason:""},m=s&&!isNaN(a)&&typeof advHistoryResolveMetric=="function"?advHistoryResolveMetric("HT",a,t,c,r):{result:null,source:null,reason:""},Bm=l&&typeof n=="number"&&isFinite(n)&&patientReportBmiSilnik()?patientReportBmiSilnik().ocen({bmi:n,plec:t,wiekMies:e*12,zrodlo:r}):null,h=Bm?typeof Bm.centyl=="number"&&isFinite(Bm.centyl)?{result:{percentile:Bm.centyl,sd:Bm.sds,median:Bm.mediana},source:Bm.siatka,reason:Bm.powod||""}:{result:null,source:null,reason:Bm.powod||""}:{result:null,source:null,reason:""},y=typeof n=="number"&&isFinite(n)?Bm?Bm.kategoria&&Bm.kategoria.klucz!=="brak"?Bm.kategoria.etykieta:"":l?"":typeof window.bmiCategory=="function"?window.bmiCategory(n):typeof bmiCategory=="function"?bmiCategory(n):"":"",x=k&&k.result?k.result.percentile:null,v=m&&m.result?m.result.percentile:null,T=h&&h.result?h.result.percentile:null,S=l?patientReportGetMetricMedian("WT",t,c,k.source,k):null,R=l?patientReportGetMetricMedian("HT",t,c,m.source,m):null,j=l?patientReportGetMetricMedian("BMI",t,c,h.source,h):null,/* rata Q: SH — masa dla mediany BMI przy wzroscie dziecka (decyzja 1); DR/KR — drabinka celow i pierwszy krok (te same, co plan PDF); AD — granice normy doroslego z funkcji produkcyjnej (decyzje 2 i 3). Odniesienia do BMI 22 i srednich populacyjnych usuniete. */SH=l&&typeof j=="number"&&isFinite(j)&&isFinite(a)&&a>0?j*(a/100)*(a/100):null,DR=!isNaN(i)&&!isNaN(a)&&(l||o)?patientReportDrabinka({wzrostCm:a,masaKg:i,plec:t,wiekMies:e*12,zrodlo:r,dorosly:o}):null,KR=patientReportKrokReference(DR,i),AD=o?patientReportGetAdultBmiWeightDelta(i,a):null,D="Przeci\u0119tna masa dla tego wieku",_="Przeci\u0119tny wzrost dla tego wieku",W=[];if(!isNaN(i)){const A=patientReportBuildTrendSeries(p,"WT"),N=o?d&&d.tone||"normal":patientReportTonMasy(x),L=o?patientReportEnsureSentence(d&&d.weightNote||"Ocena masy cia\u0142a u doros\u0142ych opiera si\u0119 przede wszystkim na BMI."):patientReportDescribeWeight(x);W.push({key:"WT",title:"Masa cia\u0142a",value:`${patientReportFormatNumber(i,1)} kg`,badge:o?d&&d.badge||y||"\u2014":patientReportFormatPercentile(x),percentile:o?null:x,tone:N,/* P-DS-5 (decyzja D4): raport nazywa siatke specjalnej populacji takze przy masie i wzroscie, nie tylko przy BMI. */note:patientReportMasaWobecBmi(k&&k.source==="DS"?patientReportAppendSentence(L,"wg siatki dla zespo\u0142u Downa (Zemel 2015)"):L,o,x,Bm),reference:o?patientReportAdultMassReference(i,AD,d):patientReportBuildMedianReference("Masa",i,SH!=null?SH:S,{friendlyLabel:SH!=null?"Przeci\u0119tna masa dla tego wzrostu i wieku":D,medianUnit:"kg",diffUnit:"kg",digits:1,nearTolerance:patientReportTolerancjaMasyDziecka(SH!=null?SH:S),exactText:PATIENT_REPORT_PRZECIETNE_WIEK,nearText:PATIENT_REPORT_PRZECIETNE_WIEK}),secondaryReference:KR,scale:o?null:typeof x=="number"&&isFinite(x)?patientReportBuildScaleModel("WT",x,patientReportBuildScaleValueLabels("WT",t,c,k.source)):null,hideEmptyScale:o,sparkline:patientReportBuildSparklineSvg(A,{title:"masa cia\u0142a",unit:"kg",digits:1}),trendText:patientReportBuildTrendDeltaText(A,"kg",1)})}if(!isNaN(a)){const A=patientReportBuildTrendSeries(p,"HT"),N=o?"normal":typeof v=="number"&&isFinite(v)?v<=3?"danger":v>3&&v<=10||v>97?"warn":"normal":"normal",L=o?"Wzrost s\u0142u\u017Cy do obliczenia BMI i zakresu prawid\u0142owej masy cia\u0142a.":patientReportDescribeHeight(v);W.push({key:"HT",title:"Wzrost",value:`${patientReportFormatNumber(a,1)} cm`,badge:o?"":patientReportFormatPercentile(v),hideBadge:o,percentile:o?null:v,tone:N,note:m&&m.source==="DS"?patientReportAppendSentence(L,"wg siatki dla zespo\u0142u Downa (Zemel 2015)"):L,reference:o?patientReportAdultHeightRangeReference(i,AD):patientReportBuildMedianReference("Wzrost",a,R,{friendlyLabel:_,medianUnit:"cm",diffUnit:"cm",digits:1,nearTolerance:PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.DZIECKO.HEIGHT_CM,exactText:PATIENT_REPORT_PRZECIETNE_WIEK,nearText:PATIENT_REPORT_PRZECIETNE_WIEK}),hideEmptyScale:o,scale:o?null:typeof v=="number"&&isFinite(v)?patientReportBuildScaleModel("HT",v,patientReportBuildScaleValueLabels("HT",t,c,m.source)):null,sparkline:patientReportBuildSparklineSvg(A,{title:"wzrost",unit:"cm",digits:1}),trendText:patientReportBuildTrendDeltaText(A,"cm",1)})}if(typeof n=="number"&&isFinite(n)){const A=patientReportBuildTrendSeries(p,"BMI"),N=o?d&&d.tone||"normal":Bm&&Bm.kategoria?Bm.kategoria.kolor==="alert"?"danger":Bm.kategoria.kolor==="improve"?"warn":"normal":"normal",L=o?patientReportAppendSentence(d&&d.bmiNote||patientReportDescribeBmi(y),z):patientReportDescribeBmi(y);W.push({key:"BMI",title:"BMI",value:patientReportFormatNumber(n,1),badge:o?d&&d.badge||y||patientReportFormatPercentile(T):y||patientReportFormatPercentile(T),percentile:o?null:T,category:y,tone:N,/* P-DS-4 (decyzja D4): raport nazywa siatke specjalnej populacji przy wyniku BMI. */note:Bm&&Bm.siatka==="DS"?patientReportAppendSentence(L,"wg siatki dla zespołu Downa (Zemel 2015)"):L,reference:o?patientReportAdultBmiRangeReference(n,AD):patientReportBuildMedianReference("BMI",n,j,{friendlyLabel:"Przeci\u0119tne BMI dla tego wieku",medianUnit:"",diffUnit:"pkt",digits:1,nearTolerance:PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.DZIECKO.BMI,exactText:PATIENT_REPORT_PRZECIETNE_WIEK,nearText:PATIENT_REPORT_PRZECIETNE_WIEK}),extraHtml:o?patientReportBuildAdultBmiRangesTableHtml(n,N):"",scale:l?patientReportBuildScaleModel("BMI",T,patientReportBuildScaleValueLabels("BMI",t,c,h.source)):o?patientReportBuildAdultBmiScaleModel(n):null,hideEmptyScale:!1,sparkline:patientReportBuildSparklineSvg(A,{title:"BMI",unit:"",digits:1}),trendText:patientReportBuildTrendDeltaText(A,"pkt",1)})}return{cards:W,historyCount:p.filter(A=>A&&A.current!==!0).length,preferredSource:r,isChild:l,isAdult:o,referenceAgeYears:c}}function patientReportGetCurrentBasics(){const e=typeof getAgeDecimal=="function"?getAgeDecimal():0,t=document.getElementById("sex")?.value||"M",i=parseFloat(document.getElementById("weight")?.value),a=parseFloat(document.getElementById("height")?.value),n=!isNaN(i)&&!isNaN(a)&&typeof BMI=="function"?BMI(i,a):null,r=patientReportIsAdultAgeForCurrentMode(e);return{ageYears:e,sex:t,weight:i,height:a,bmi:n,isChild:e>0&&!r,isAdult:r,referenceAgeYears:patientReportGetReferenceAgeYears(e)}}function patientReportClassifyCole(e){if(typeof e!="number"||!isFinite(e))return{category:"Brak danych",tone:"normal",note:"Nie uda\u0142o si\u0119 wyliczy\u0107 wska\u017Anika Cole\u2019a dla tego pomiaru."};const T0=patientReportBmiSilnik();if(!T0)return{category:"Brak danych",tone:"normal",note:"Nie uda\u0142o si\u0119 wyliczy\u0107 wska\u017Anika Cole\u2019a dla tego pomiaru."};/* P-TON-3b: ton z KOLORU silnika, nie z wlasnego mapowania. Rata 2 przepiela kafelek
   Cole a na kolor silnika (niedowaga = alert), a ten klasyfikator zostal przy "warn" —
   przez chwile karta i naglowek raportu mowily o tym samym dziecku co innego. Rozbieznosc
   powstala w racie 2 i jest tu domykana. */const KC=T0.kategoriaCole(e),k=KC.klucz,T=KC.kolor==="alert"?"danger":KC.kolor==="improve"?"warn":"normal";return k==="niedowaga"?{category:"Niedowaga",tone:T,note:"Masa wzgl\u0119dem wzrostu i wieku jest obecnie poni\u017Cej typowego zakresu."}:k==="otylosc"?{category:"Oty\u0142o\u015B\u0107",tone:T,note:"Wska\u017Anik Cole\u2019a potwierdza wyra\u017Any nadmiar masy cia\u0142a wzgl\u0119dem wzrostu i wieku."}:k==="nadwaga"?{category:"Nadwaga",tone:T,note:"Wska\u017Anik Cole\u2019a wskazuje na mas\u0119 cia\u0142a powy\u017Cej typowego zakresu dla wzrostu i wieku."}:{category:"W normie",tone:"normal",note:"Masa wzgl\u0119dem wzrostu i wieku mie\u015Bci si\u0119 obecnie w typowym zakresie."}}function patientReportBuildColeScaleModel(e){if(typeof e!="number"||!isFinite(e))return null;const t=70,i=130,a=Math.max(t,Math.min(i,e)),n=r=>(r-t)/(i-t)*100;return{marker:n(a),ticks:[{pos:n(90),label:"90%",safePos:n(90)},{pos:n(100),label:"100%",safePos:n(100)},{pos:n(110),label:"110%",safePos:n(110)},{pos:n(120),label:"120%",safePos:n(120)}],gradient:"linear-gradient(90deg, #ffd7d7 0%, #ffc7c7 16.666%, #ffe2b7 28.333%, #d7f2f3 33.333%, #b3eaed 50%, #d7f2f3 66.666%, #ffe2b7 71.666%, #ffc7c7 83.333%, #ffd7d7 100%)"}}function patientReportNormalizeBmiCategory(e){const t=String(e||"").trim().toLowerCase();return t?t.includes("niedowaga")?"underweight":t.includes("prawid")?"normal":t.includes("nadwaga")?"overweight":t.includes("oty\u0142o\u015B\u0107")?"obesity":"":""}function patientReportNormalizeColeCategory(e){const t=String(e||"").trim().toLowerCase();return t?t.includes("niedowaga")?"underweight":t.includes("norm")?"normal":t.includes("nadwaga")?"overweight":t.includes("oty\u0142o\u015B\u0107")?"obesity":"":""}function patientReportBuildColeBmiExplanation(e,t){const i=String(e||"").trim(),a=String(t||"").trim(),n=patientReportNormalizeBmiCategory(i),r=patientReportNormalizeColeCategory(a);if(!n||!r)return"Wska\u017Anik Cole\u2019a por\xF3wnuje BMI do przeci\u0119tnej warto\u015Bci dla wieku i p\u0142ci (100%), dlatego mo\u017Ce r\xF3\u017Cni\u0107 si\u0119 od samej kategorii BMI.";let l={"underweight|underweight":"BMI i wska\u017Anik Cole\u2019a s\u0105 zgodne: oba wskazuj\u0105, \u017Ce masa cia\u0142a wzgl\u0119dem wzrostu jest poni\u017Cej typowego zakresu dla wieku.","underweight|normal":"BMI jest ju\u017C poni\u017Cej progu centylowego, a wska\u017Anik Cole\u2019a jeszcze mie\u015Bci si\u0119 w normie. Zwykle oznacza to wynik bliski granicy, gdzie jedna metoda reaguje wcze\u015Bniej ni\u017C druga.","underweight|overweight":"BMI sugeruje niedob\xF3r masy, a wska\u017Anik Cole\u2019a nadmiar masy. Taki rozjazd nie jest typowy i warto jeszcze raz sprawdzi\u0107 pomiary oraz interpretowa\u0107 wynik \u0142\u0105cznie z lekarzem.","underweight|obesity":"BMI sugeruje niedob\xF3r masy, a wska\u017Anik Cole\u2019a oty\u0142o\u015B\u0107. Taki uk\u0142ad nie jest typowy i wymaga ponownego sprawdzenia danych pomiarowych oraz ca\u0142o\u015Bciowej oceny lekarskiej.","normal|underweight":"BMI jest jeszcze w szerokim zakresie normy centylowej, ale wska\u017Anik Cole\u2019a pokazuje, \u017Ce masa cia\u0142a jest ju\u017C bli\u017Cej dolnej granicy wzgl\u0119dem warto\u015Bci przeci\u0119tnej dla wieku i p\u0142ci. To sygna\u0142 do obserwacji kolejnych pomiar\xF3w.","normal|normal":"BMI i wska\u017Anik Cole\u2019a s\u0105 zgodne: oba pokazuj\u0105, \u017Ce masa cia\u0142a wzgl\u0119dem wzrostu mie\u015Bci si\u0119 obecnie w typowym zakresie.","normal|overweight":"BMI jest jeszcze w szerokim zakresie normy centylowej, ale wska\u017Anik Cole\u2019a por\xF3wnuje BMI do warto\u015Bci przeci\u0119tnej dla wieku i p\u0142ci. Dlatego mo\u017Ce jako pierwszy pokaza\u0107 nadwag\u0119, gdy BMI dziecka jest ju\u017C wyra\u017Anie powy\u017Cej mediany, cho\u0107 nie przekroczy\u0142o jeszcze progu nadwagi na siatkach BMI.","normal|obesity":"Klasyfikacja BMI jest jeszcze ni\u017Csza, ale wska\u017Anik Cole\u2019a pokazuje ju\u017C bardzo du\u017Cy nadmiar masy wzgl\u0119dem warto\u015Bci przeci\u0119tnej dla wieku i p\u0142ci. Taki wynik wymaga dok\u0142adniejszej oceny i kontroli kolejnych pomiar\xF3w.","overweight|underweight":"BMI wskazuje nadmiar masy, a wska\u017Anik Cole\u2019a wynik poni\u017Cej normy. Taki rozjazd nie jest typowy i warto sprawdzi\u0107 poprawno\u015B\u0107 pomiar\xF3w oraz interpretacj\u0119 wyniku z lekarzem.","overweight|normal":"BMI wskazuje nadwag\u0119, a wska\u017Anik Cole\u2019a jest jeszcze w normie. Obie metody u\u017Cywaj\u0105 innych prog\xF3w, wi\u0119c przy wyniku blisko granicy BMI mo\u017Ce przej\u015B\u0107 do kategorii nadwagi wcze\u015Bniej ni\u017C Cole.","overweight|overweight":"BMI i wska\u017Anik Cole\u2019a s\u0105 zgodne: oba wskazuj\u0105 na nadmiar masy cia\u0142a wzgl\u0119dem wzrostu i wieku.","overweight|obesity":"BMI wskazuje nadwag\u0119, a wska\u017Anik Cole\u2019a ju\u017C oty\u0142o\u015B\u0107. Cole por\xF3wnuje BMI bezpo\u015Brednio do przeci\u0119tnej warto\u015Bci dla wieku i p\u0142ci, dlatego mo\u017Ce mocniej pokaza\u0107 nasilony nadmiar masy.","obesity|underweight":"BMI wskazuje oty\u0142o\u015B\u0107, a wska\u017Anik Cole\u2019a wynik poni\u017Cej normy. Taki rozjazd nie jest typowy i wymaga ponownego sprawdzenia danych pomiarowych oraz oceny ca\u0142ego obrazu klinicznego.","obesity|normal":"BMI wskazuje oty\u0142o\u015B\u0107, a wska\u017Anik Cole\u2019a jest jeszcze w normie. Taki rozjazd nie jest typowy; warto zweryfikowa\u0107 pomiar wzrostu i masy oraz om\xF3wi\u0107 wynik \u0142\u0105cznie z lekarzem.","obesity|overweight":"Obie metody pokazuj\u0105 nadmiar masy, ale BMI ocenia go ju\u017C jako oty\u0142o\u015B\u0107, a wska\u017Anik Cole\u2019a jeszcze jako nadwag\u0119. Zwykle oznacza to wynik bliski granicy mi\u0119dzy tymi kategoriami.","obesity|obesity":"BMI i wska\u017Anik Cole\u2019a s\u0105 zgodne: oba wskazuj\u0105 na oty\u0142o\u015B\u0107, czyli wyra\u017Any nadmiar masy cia\u0142a wzgl\u0119dem wieku i wzrostu."}[`${n}|${r}`]||"BMI i wska\u017Anik Cole\u2019a korzystaj\u0105 z r\xF3\u017Cnych prog\xF3w odniesienia. BMI opiera si\u0119 na kategoriach centylowych, a Cole por\xF3wnuje wynik do warto\u015Bci przeci\u0119tnej dla wieku i p\u0142ci, dlatego czasem jedna metoda pokazuje wy\u017Csz\u0105 kategori\u0119 wcze\u015Bniej ni\u017C druga.";return i.toLowerCase().includes("olbrzym")&&r==="obesity"?l="BMI pokazuje bardzo du\u017Cy nadmiar masy cia\u0142a, a wska\u017Anik Cole\u2019a r\xF3wnie\u017C potwierdza oty\u0142o\u015B\u0107. Oba wyniki wskazuj\u0105 na wyra\u017Ane przekroczenie typowego zakresu dla wieku i wzrostu.":i.toLowerCase().includes("olbrzym")&&r==="overweight"&&(l="BMI pokazuje bardzo du\u017Cy nadmiar masy cia\u0142a, a wska\u017Anik Cole\u2019a ni\u017Csz\u0105 kategori\u0119. Obie metody potwierdzaj\u0105 nadmiar masy, ale korzystaj\u0105 z innych prog\xF3w odniesienia."),l}function patientReportBuildColeCard(){const e=patientReportGetCurrentBasics();if(!e.isChild||typeof e.bmi!="number"||!isFinite(e.bmi))return{key:"COLE",title:"Wska\u017Anik Cole\u2019a",value:"\u2014",badge:"Brak danych",tone:"normal",note:"Por\xF3wnanie do wska\u017Anika Cole\u2019a jest dost\u0119pne po wyliczeniu BMI u dziecka.",explanation:"",reference:{available:!1},scale:null,sparkline:"",trendText:""};const t=patientReportGetPreferredSource(),T0=patientReportBmiSilnik(),C0=T0?T0.cole({bmi:e.bmi,plec:e.sex,wiekMies:e.ageYears*12,zrodlo:t}):null,a=C0?C0.mediana:null;if(typeof a!="number"||!isFinite(a)||a<=0)return{key:"COLE",title:"Wska\u017Anik Cole\u2019a",value:"\u2014",badge:"Brak danych",tone:"normal",note:"Nie uda\u0142o si\u0119 wyznaczy\u0107 warto\u015Bci odniesienia dla wieku i p\u0142ci.",explanation:"",reference:{available:!1},scale:null,sparkline:"",trendText:""};const n=e.ageYears*12,r=typeof bmiCategoryChild=="function"?bmiCategoryChild(e.bmi,e.sex,n):"",o=C0?C0.cole:e.bmi/a*100,l=patientReportClassifyCole(o);return{key:"COLE",title:"Wska\u017Anik Cole\u2019a",value:`${patientReportFormatNumber(o,1)}\u00A0%`,badge:l.category,tone:l.tone,note:l.note,explanation:patientReportBuildColeBmiExplanation(r,l.category),reference:patientReportBuildMedianReference("Wska\u017Anik Cole'a",o,100,{friendlyLabel:"Warto\u015B\u0107 odniesienia",medianUnit:"%",diffUnit:"pkt",digits:1,nearTolerance:PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.DZIECKO.COLE_PKT,exactText:PATIENT_REPORT_PRZECIETNE_WIEK_PLEC,nearText:PATIENT_REPORT_PRZECIETNE_WIEK_PLEC}),scale:patientReportBuildColeScaleModel(o),sparkline:"",trendText:""}}function patientReportBuildBmrCard(){return patientReportBuildNutritionCard()}function patientReportBuildVitalItem(e){const t=e||{},i=Number.isFinite(t.digits)?t.digits:0,a=String(t.unit||""),n=s=>{const p=patientReportFormatNumber(s,i);return a?`${p} ${a}`:p},r=(s,p)=>{const d=t[s];return typeof d=="function"?String(d(p,t)||""):typeof d=="string"&&d.trim()?d:""};if(!(typeof t.median=="number"&&isFinite(t.median)&&typeof t.min=="number"&&isFinite(t.min)&&typeof t.max=="number"&&isFinite(t.max)))return{kind:t.kind||"",label:t.label||"",unavailable:!0,message:t.message||"Brak danych odniesienia dla tego pomiaru."};let o="normal",l="",c="missing";return typeof t.value=="number"&&isFinite(t.value)&&(t.value<t.min?(o="warn",c="low",l=r("lowStatusText",t.value)||"Wynik jest poni\u017Cej zakresu prawid\u0142owego."):t.value>t.max?(o=typeof t.highDangerThreshold=="number"&&isFinite(t.highDangerThreshold)&&t.value>=t.highDangerThreshold?"danger":"warn",c="high",l=r("highStatusText",t.value)||"Wynik jest powy\u017Cej zakresu prawid\u0142owego."):(c="normal",l=r("normalStatusText",t.value)||"Wynik mie\u015Bci si\u0119 w zakresie prawid\u0142owym.")),{kind:t.kind||"",label:t.label||"",medianText:n(t.median),rangeText:`${n(t.min)} \u2013 ${n(t.max)}`,valueText:typeof t.value=="number"&&isFinite(t.value)?n(t.value):"",statusText:l,tone:o,state:c}}function patientReportBuildVitalsCard(){const e=patientReportGetCurrentBasics(),t=patientReportGetReferenceAgeYears(e.ageYears),i=!!e.isAdult;if(i)return window.adultVitalsApi&&typeof window.adultVitalsApi.buildReportCardData=="function"?window.adultVitalsApi.buildReportCardData():{title:"Ci\u015Bnienie i t\u0119tno",badge:"Informacyjnie",tone:"normal",subtitle:"Klasyfikacja ESC/PTK dla doros\u0142ych",note:"Nie uda\u0142o si\u0119 odczyta\u0107 modu\u0142u pomiar\xF3w RR i t\u0119tna dla doros\u0142ych. Pokazano kart\u0119 informacyjn\u0105.",items:[{label:"Ci\u015Bnienie t\u0119tnicze",unavailable:!0,message:"Normy dla doros\u0142ych b\u0119d\u0105 dost\u0119pne po za\u0142adowaniu modu\u0142u."},{label:"T\u0119tno spoczynkowe",unavailable:!0,message:"Normy dla doros\u0142ych b\u0119d\u0105 dost\u0119pne po za\u0142adowaniu modu\u0142u."}],hideMissingMeasurementLabels:!1};const a=parseFloat(document.getElementById("bpSystolic")?.value),n=parseFloat(document.getElementById("bpDiastolic")?.value),r=parseFloat(document.getElementById("heartRate")?.value),o=void 0;let l=null,c=null;try{window.bpModuleApi&&typeof window.bpModuleApi.getPediatricBpReference=="function"&&(l=window.bpModuleApi.getPediatricBpReference({ageYears:t,sex:e.sex,heightCm:e.height,datasetChoice:o}))}catch{l=null}try{isFinite(a)&&isFinite(n)&&window.bpModuleApi&&typeof window.bpModuleApi.computePediatricBp=="function"&&(c=window.bpModuleApi.computePediatricBp({ageYears:t,sex:e.sex,heightCm:e.height,sbp:a,dbp:n,datasetChoice:o}))}catch{c=null}const s="Normy ci\u015Bnienia w tym raporcie pokazujemy dla wieku 3\u201318 lat po wpisaniu wzrostu.",p="Normy t\u0119tna poka\u017Cemy po wyliczeniu wieku pacjenta.",d=[];l&&l.ok&&l.reference?(d.push(patientReportBuildVitalItem({kind:"sbp",label:"Ci\u015Bnienie skurczowe",unit:"mm Hg",digits:0,median:l.reference.sbpP50,min:l.reference.sbpP10,max:l.reference.sbpP90,highDangerThreshold:l.reference.sbpP95,value:isFinite(a)?a:null,lowStatusText:"Ci\u015Bnienie skurczowe jest poni\u017Cej zakresu prawid\u0142owego.",highStatusText:"Ci\u015Bnienie skurczowe jest powy\u017Cej zakresu prawid\u0142owego.",normalStatusText:"Ci\u015Bnienie skurczowe mie\u015Bci si\u0119 w zakresie prawid\u0142owym."})),d.push(patientReportBuildVitalItem({kind:"dbp",label:"Ci\u015Bnienie rozkurczowe",unit:"mm Hg",digits:0,median:l.reference.dbpP50,min:l.reference.dbpP10,max:l.reference.dbpP90,highDangerThreshold:l.reference.dbpP95,value:isFinite(n)?n:null,lowStatusText:"Ci\u015Bnienie rozkurczowe jest poni\u017Cej zakresu prawid\u0142owego.",highStatusText:"Ci\u015Bnienie rozkurczowe jest powy\u017Cej zakresu prawid\u0142owego.",normalStatusText:"Ci\u015Bnienie rozkurczowe mie\u015Bci si\u0119 w zakresie prawid\u0142owym."}))):(d.push({label:"Ci\u015Bnienie skurczowe",unavailable:!0,message:s}),d.push({label:"Ci\u015Bnienie rozkurczowe",unavailable:!0,message:s}));let u=null;try{if(t>0&&t<=PATIENT_REPORT_ADULT_REFERENCE_AGE&&window.vitalSigns&&typeof window.vitalSigns.getHrValues=="function"){const C=String(document.getElementById("hrPopulation")?.value||"healthy"),$=parseFloat(document.getElementById("hrTemperature")?.value),E={population:C};isFinite($)&&(E.temperature=$);const F=window.vitalSigns.getHrValues(t,E),FA=isFinite(r)&&typeof window.vitalSigns.getHrAssessment=="function"?window.vitalSigns.getHrAssessment(t,r,E):null;if(F&&typeof F.median=="number"&&isFinite(F.median)){u=patientReportBuildVitalItem({kind:"hr",label:"T\u0119tno",unit:"ud./min",digits:0,median:F.median,min:F.p10,max:F.p90,value:isFinite(r)?r:null,lowStatusText:"T\u0119tno poni\u017Cej typowego zakresu dla wieku (10.\u201390. centyl).",highStatusText:"T\u0119tno powy\u017Cej typowego zakresu dla wieku (10.\u201390. centyl).",normalStatusText:"T\u0119tno w typowym zakresie dla wieku (10.\u201390. centyl)."});if(u&&!u.unavailable){u.referenceRows=[{label:"50. centyl",value:u.medianText||"\u2014"},{label:"Typowy zakres (10.\u201390. centyl)",value:u.rangeText||"\u2014"}];if(FA&&typeof FA.percentile=="number"&&isFinite(FA.percentile)){const q=FA.percentile,qi=Math.round(q);q<3?(u.tone="danger",u.state="low",u.statusText="T\u0119tno na <3. centylu dla wieku \u2014 znacznie poni\u017Cej normy."):q<10?(u.tone="warn",u.state="low",u.statusText="T\u0119tno na "+qi+". centylu dla wieku \u2014 poni\u017Cej typowego zakresu (10.\u201390. centyl)."):q<=90?(u.tone="normal",u.state="normal",u.statusText="T\u0119tno na "+qi+". centylu \u2014 w typowym zakresie dla wieku (10.\u201390. centyl)."):q<=97?(u.tone="warn",u.state="high",u.statusText="T\u0119tno na "+qi+". centylu dla wieku \u2014 powy\u017Cej typowego zakresu (10.\u201390. centyl)."):(u.tone="danger",u.state="high",u.statusText="T\u0119tno na >97. centylu dla wieku \u2014 znacznie powy\u017Cej normy.")}}}}}catch{u=null}u||(u={label:"T\u0119tno",unavailable:!0,message:p}),d.push(u);let rr=null;try{if(t>0&&t<=PATIENT_REPORT_ADULT_REFERENCE_AGE&&window.vitalSigns&&typeof window.vitalSigns.getRrValues=="function"){const RD=parseFloat(document.getElementById("respiratoryRateInput")?.value),RS=String(document.getElementById("respState")?.value||"awake"),RP=String(document.getElementById("respPopulation")?.value||"healthy"),RT=parseFloat(document.getElementById("respTemperature")?.value),RO={population:RP,state:RS};isFinite(RT)&&(RO.temperature=RT);const RV=window.vitalSigns.getRrValues(t,RO);if(!(RV&&typeof RV.median=="number"&&isFinite(RV.median))){RS==="sleep"&&RP!=="hospital"&&t*12>54&&(rr={kind:"rr",label:"Liczba oddech\xF3w",unavailable:!0,message:"Normy oddechu we \u015Bnie (Herbert 2020) obejmuj\u0105 wiek do 4,5 roku \u017Cycia \u2014 oce\u0144 liczb\u0119 oddech\xF3w w czuwaniu."})}else{const RA=isFinite(RD)&&typeof window.vitalSigns.getRrAssessment=="function"?window.vitalSigns.getRrAssessment(t,RD,RO):null;rr=patientReportBuildVitalItem({kind:"rr",label:"Liczba oddech\xF3w",unit:"/min",digits:0,median:RV.median,min:RV.p10,max:RV.p90,value:isFinite(RD)?RD:null,lowStatusText:"Liczba oddech\xF3w poni\u017Cej typowego zakresu dla wieku (10.\u201390. centyl).",highStatusText:"Liczba oddech\xF3w powy\u017Cej typowego zakresu dla wieku (10.\u201390. centyl).",normalStatusText:"Liczba oddech\xF3w w typowym zakresie dla wieku (10.\u201390. centyl)."});if(rr&&!rr.unavailable){rr.referenceRows=[{label:"50. centyl",value:rr.medianText||"\u2014"},{label:"Typowy zakres (10.\u201390. centyl)",value:rr.rangeText||"\u2014"}];if(RA&&typeof RA.percentile=="number"&&isFinite(RA.percentile)){const q=RA.percentile,qi=Math.round(q);q<3?(rr.tone="danger",rr.state="low",rr.statusText="Liczba oddech\xF3w na <3. centylu dla wieku \u2014 znacznie poni\u017Cej normy."):q<10?(rr.tone="warn",rr.state="low",rr.statusText="Liczba oddech\xF3w na "+qi+". centylu dla wieku \u2014 poni\u017Cej typowego zakresu (10.\u201390. centyl)."):q<=90?(rr.tone="normal",rr.state="normal",rr.statusText="Liczba oddech\xF3w na "+qi+". centylu \u2014 w typowym zakresie dla wieku (10.\u201390. centyl)."):q<=97?(rr.tone="warn",rr.state="high",rr.statusText="Liczba oddech\xF3w na "+qi+". centylu dla wieku \u2014 powy\u017Cej typowego zakresu (10.\u201390. centyl)."):(rr.tone="danger",rr.state="high",rr.statusText="Liczba oddech\xF3w na >97. centylu dla wieku \u2014 znacznie powy\u017Cej normy.")}}}}}catch{rr=null}rr||(rr={label:"Liczba oddech\xF3w",unavailable:!0,message:p}),d.push(rr);const w=d.filter(C=>C&&!C.unavailable),f=w.filter(C=>C.valueText),g=f.length>0,b=w.length>0&&!g,z=f.filter(C=>C.kind==="sbp"||C.kind==="dbp"),k=f.find(C=>C.kind==="hr")||null,kr=f.find(C=>C.kind==="rr")||null,rrLow=!!(kr&&kr.state==="low"),rrHigh=!!(kr&&kr.state==="high"),m=z.some(C=>C.state==="low"),h=z.some(C=>C.state==="high"&&C.tone!=="danger")||!!(c&&c.ok&&c.severity==="high"),y=z.some(C=>C.state==="high"&&C.tone==="danger")||!!(c&&c.ok&&(c.severity==="stage1"||c.severity==="stage2")),x=!!(k&&k.state==="low"),v=!!(k&&k.state==="high"),T=g&&f.every(C=>C.state==="normal"),S="Normy dla wieku",R="Pokazano warto\u015Bci referencyjne dla wieku.",j="Normy dla wieku b\u0119d\u0105 dost\u0119pne po uzupe\u0142nieniu danych pacjenta.";let B="normal",P=g?S:"Informacyjnie",M=w.length?R:j;return y?(B="danger",P="Poza norm\u0105",M=v?i?"Ci\u015Bnienie t\u0119tnicze jest powy\u017Cej przyj\u0119tych norm dla p\u0142ci i wzrostu, a t\u0119tno jest powy\u017Cej typowego zakresu dla wieku (10.\u201390. centyl).":"Ci\u015Bnienie t\u0119tnicze jest powy\u017Cej normy dla p\u0142ci, wieku i wzrostu, a t\u0119tno jest powy\u017Cej typowego zakresu dla wieku (10.\u201390. centyl).":i?"Ci\u015Bnienie t\u0119tnicze jest powy\u017Cej przyj\u0119tych norm dla p\u0142ci i wzrostu.":"Ci\u015Bnienie t\u0119tnicze jest powy\u017Cej normy dla p\u0142ci, wieku i wzrostu."):h?(B="warn",P="Do kontroli",M=v?i?"Ci\u015Bnienie t\u0119tnicze jest w g\xF3rnym zakresie przyj\u0119tych norm, a t\u0119tno jest powy\u017Cej typowego zakresu dla wieku (10.\u201390. centyl).":"Ci\u015Bnienie t\u0119tnicze jest w g\xF3rnym zakresie, a t\u0119tno jest powy\u017Cej typowego zakresu dla wieku (10.\u201390. centyl).":i?"Ci\u015Bnienie t\u0119tnicze jest w g\xF3rnym zakresie przyj\u0119tych norm i warto je skontrolowa\u0107 w kolejnych pomiarach.":"Ci\u015Bnienie t\u0119tnicze jest w g\xF3rnym zakresie i warto je skontrolowa\u0107 w kolejnych pomiarach."):m?(B="warn",P="Do kontroli",M=v?i?"Ci\u015Bnienie t\u0119tnicze jest poni\u017Cej zakresu prawid\u0142owego wzgl\u0119dem przyj\u0119tych norm, a t\u0119tno jest powy\u017Cej typowego zakresu dla wieku (10.\u201390. centyl).":"Ci\u015Bnienie t\u0119tnicze jest poni\u017Cej zakresu prawid\u0142owego, a t\u0119tno jest powy\u017Cej typowego zakresu dla wieku (10.\u201390. centyl).":i?"Ci\u015Bnienie t\u0119tnicze jest poni\u017Cej zakresu prawid\u0142owego wzgl\u0119dem przyj\u0119tych norm.":"Ci\u015Bnienie t\u0119tnicze jest poni\u017Cej zakresu prawid\u0142owego."):v?(B="warn",P="Do kontroli",M=i?"T\u0119tno jest powy\u017Cej typowego zakresu dla wieku (10.\u201390. centyl).":"T\u0119tno jest powy\u017Cej typowego zakresu dla wieku (10.\u201390. centyl)."):x?(B="warn",P="Do kontroli",M=i?"T\u0119tno jest poni\u017Cej typowego zakresu dla wieku (10.\u201390. centyl).":"T\u0119tno jest poni\u017Cej typowego zakresu dla wieku (10.\u201390. centyl)."):rrHigh?(B="warn",P="Do kontroli",M="Liczba oddech\xF3w jest powy\u017Cej typowego zakresu dla wieku (10.\u201390. centyl)."):rrLow?(B="warn",P="Do kontroli",M="Liczba oddech\xF3w jest poni\u017Cej typowego zakresu dla wieku (10.\u201390. centyl)."):T?(P="W zakresie",M=i?"Podane pomiary mieszcz\u0105 si\u0119 w zakresie prawid\u0142owym wzgl\u0119dem przyj\u0119tych norm.":"Podane pomiary mieszcz\u0105 si\u0119 w zakresie prawid\u0142owym."):g&&(P="W zakresie",M=i?"Pokazano przyj\u0119te normy i odniesienie do podanych pomiar\xF3w.":"Pokazano warto\u015Bci referencyjne dla wieku i odniesienie do podanych pomiar\xF3w."),{title:"Ci\u015Bnienie, t\u0119tno i oddechy",badge:P,tone:B,subtitle:g&&B==="normal"?i?"Normy referencyjne i odniesienie do podanych pomiar\xF3w.":"Normy dla wieku i odniesienie do podanych pomiar\xF3w.":"",note:M,items:d,hideMissingMeasurementLabels:b}}function patientReportBuildBmrCardHtml(e){const t=Array.isArray(e?.tableHeaders)&&e.tableHeaders.length>=2?e.tableHeaders:["Sk\u0142adnik","Warto\u015B\u0107"],i=e?.kind==="nutrition-norms"||e?.kind==="energy-demand"||String(e?.title||"").trim().toLowerCase()==="normy \u017Cywieniowe",a=i?" patient-report-support-card--nutrition-norms":"",n=e?.kind==="energy-demand"?" patient-report-bmr-table--energy":i?" patient-report-bmr-table--nutrition-norms":"",r=typeof e?.subtitle=="string"?e.subtitle.trim():"",o=r?`<div class="patient-report-support-subtitle">${patientReportEscapeHtml(r)}</div>`:"",l=e?.note?`<div class="patient-report-support-note">${patientReportEscapeHtml(e.note||"")}</div>`:"",c=Array.isArray(e?.rows)&&e.rows.length?e.rows.map(s=>{const p=s&&typeof s.valueText=="string"&&s.valueText.trim()?s.valueText.trim():s&&typeof s.value=="number"&&isFinite(s.value)?patientReportFormatNumber(s.value,Number.isFinite(s.digits)?s.digits:0):"\u2014";return`
        <tr${s&&s.highlighted?' class="is-highlighted"':""}>
          <td>${patientReportEscapeHtml(s&&s.label||"")}${s&&s.detail?`<div class="patient-report-bmr-row-detail">${patientReportEscapeHtml(s.detail)}</div>`:""}</td>
          <td>${patientReportEscapeHtml(p)}</td>
        </tr>`}).join(""):'<tr><td colspan="2">Brak dodatkowych pozycji do pokazania.</td></tr>';return`
    <article class="patient-report-support-card tone-normal${a}">
      <div class="patient-report-support-top">
        <div>
          <div class="patient-report-support-title">${patientReportEscapeHtml(e?.title||"Zapotrzebowanie energetyczne")}</div>
          ${o}
          <div class="patient-report-support-value">${patientReportEscapeHtml(e?.value||"\u2014")}</div>
        </div>
        <div class="patient-report-metric-badge tone-normal">${patientReportEscapeHtml(e?.badge||"Informacyjnie")}</div>
      </div>
      ${l}
      <div class="patient-report-bmr-table-wrap">
        <table class="patient-report-bmr-table${n}">
          <thead>
            <tr>
              <th>${patientReportEscapeHtml(t[0]||"Sk\u0142adnik")}</th>
              <th>${patientReportEscapeHtml(t[1]||"Warto\u015B\u0107")}</th>
            </tr>
          </thead>
          <tbody>${c}</tbody>
        </table>
      </div>
    </article>`}function patientReportBuildVitalsCardHtml(e){const t=!!e?.hideMissingMeasurementLabels,i=typeof e?.subtitle=="string"?e.subtitle.trim():"",a=typeof e?.badge=="string"?e.badge.trim():"",n=typeof e?.note=="string"?e.note.trim():"",o=!!i&&i.toLowerCase()!==a.toLowerCase()?`<div class="patient-report-support-subtitle">${patientReportEscapeHtml(i)}</div>`:"",l=n?`<div class="patient-report-support-note">${patientReportEscapeHtml(n)}</div>`:"",c=(e?.items||[]).map(s=>{if(s.unavailable)return`
        <div class="patient-report-vital-item is-unavailable">
          <div class="patient-report-vital-item-title">${patientReportEscapeHtml(s.label||"")}</div>
          <div class="patient-report-vital-empty">${patientReportEscapeHtml(s.message||"Brak danych odniesienia.")}</div>
        </div>`;const p=!!(e?.valueFirst||s?.valueFirst),d=s.valueText?`<div class="patient-report-vital-row is-value tone-${patientReportEscapeHtml(s.tone||"normal")}"><span class="patient-report-vital-label">Wynik pacjenta</span><strong>${patientReportEscapeHtml(s.valueText||"")}</strong></div>`:"",u=s.statusText?`<div class="patient-report-vital-status tone-${patientReportEscapeHtml(s.tone||"normal")}">${patientReportEscapeHtml(s.statusText||"")}</div>`:t?"":'<div class="patient-report-vital-status tone-normal">Brak wpisanego pomiaru.</div>',f=(Array.isArray(s.referenceRows)&&s.referenceRows.length?s.referenceRows:[{label:"50 centyl",value:s.medianText||"\u2014"},{label:"Zakres prawid\u0142owy",value:s.rangeText||"\u2014"}]).map(b=>`
        <div class="patient-report-vital-row${b&&b.highlighted?" is-highlighted":""}"><span>${patientReportEscapeHtml(b&&b.label||"")}</span><strong>${patientReportEscapeHtml(b&&b.value||"\u2014")}</strong></div>`).join(""),g=p?`${d}${u}${f}`:`${f}${d}${u}`;return`
      <div class="patient-report-vital-item tone-${patientReportEscapeHtml(s.tone||"normal")}${p?" is-value-first":""}">
        <div class="patient-report-vital-item-title">${patientReportEscapeHtml(s.label||"")}</div>
        ${g}
      </div>`}).join("");return`
    <article class="patient-report-support-card tone-${patientReportEscapeHtml(e?.tone||"normal")}">
      <div class="patient-report-support-top">
        <div>
          <div class="patient-report-support-title">${patientReportEscapeHtml(e?.title||"Ci\u015Bnienie i t\u0119tno")}</div>
          ${o}
        </div>
        <div class="patient-report-metric-badge tone-${patientReportEscapeHtml(e?.tone||"normal")}">${patientReportEscapeHtml(e?.badge||"Informacyjnie")}</div>
      </div>
      ${l}
      <div class="patient-report-vital-list">${c}</div>
    </article>`}function patientReportBuildSecondaryCardsHtml(e){const t=[];return e&&e.isAdult||t.push(patientReportBuildMetricCardsHtml([e.coleCard||patientReportBuildColeCard()])),t.push(patientReportBuildBmrCardHtml(e.nutritionCard||e.bmrCard||patientReportBuildNutritionCard())),t.push(patientReportBuildVitalsCardHtml(e.vitalsCard||patientReportBuildVitalsCard())),t.join("")}function patientReportBuildModel(){return patientReportRunWithMode("pdf",()=>{const e=(document.getElementById("name")?.value||document.getElementById("advName")?.value||"").trim(),t=document.getElementById("sex")?.value||"M",i=typeof getAgeDecimal=="function"?getAgeDecimal():0,a=patientReportIsAdultAgeForCurrentMode(i),n=patientReportGetPreferredSource(),r=typeof advHistorySourceLabel=="function"?advHistorySourceLabel(n):String(n||""),o=a?"Normy \u017Cywienia dla populacji Polski, NIZP PZH \u2013 PIB, 2024. Klasyfikacja BMI u doros\u0142ych wed\u0142ug WHO.":r,l=a?["1. Normy \u017Cywienia dla populacji Polski, NIZP PZH \u2013 PIB, 2024.","2. Klasyfikacja BMI u doros\u0142ych wed\u0142ug WHO."]:[],c=a?"G\u0142\xF3wne \u017Ar\xF3d\u0142a danych":"Por\xF3wnania centylowe",s=patientReportBuildMetricCards();let p=getFormattedProfessionalSummaryLines();a&&(p=(p||[]).filter(g=>!/^\s*wskaźnik\s*cole/i.test(String(g||"").replace(/ /g," "))));let d=patientReportCollectHighlights(p),u=patientReportBuildNaglowek(s,d,p,a);a&&(d=patientReportAdaptHighlightsForAdultReference(d));/* rata Q: czipy dat (pomiar z sejfu albo dzis) i karta energii z generatora zalecen zamiast karty norm. */const dc=patientReportBuildDateChips(new Date),w=dc.generatedLabel,f=patientReportBuildEnergyCard();return{title:"Raport po wizycie",subtitle:"",name:e,sexLabel:patientReportGetSexLabel(t,i),ageLabel:patientReportFormatAge(i),generatedLabel:w,measurementLabel:dc.measurementLabel,measurementSource:dc.measurementSource,dateChipsSameDay:dc.sameDay,sourceLabel:o,sourceLabelPrefix:c,sourceLines:l,metricCards:s.cards,historyCount:s.historyCount,isChild:s.isChild,isAdult:a,showColeCard:!a,secondaryCardCount:a?2:3,summaryLines:p,highlights:d,headline:u,coleCard:patientReportBuildColeCard(),nutritionCard:f,bmrCard:f,vitalsCard:patientReportBuildVitalsCard()}})}function patientReportBuildScaleHtml(e,t,i){const a=!!(i&&i.suppressEmpty);if(!e)return a?"":'<div class="patient-report-scale-empty">Por\xF3wnanie centylowe niedost\u0119pne dla tego wyniku.</div>';const n=(e.valueLabels||[]).map(o=>`<span class="patient-report-scale-value-label" style="left:${typeof o.safePos=="number"&&isFinite(o.safePos)?o.safePos:typeof o.pos=="number"&&isFinite(o.pos)?o.pos:0}%">${patientReportEscapeHtml(o.label||"")}</span>`).join(""),r=(e.ticks||[]).map(o=>{const l=typeof o.safePos=="number"&&isFinite(o.safePos)?o.safePos:o.pos;return`
      <span class="patient-report-scale-tick-line" style="left:${o.pos}%;"></span>
      <span class="patient-report-scale-tick-label" style="left:${l}%;">${patientReportEscapeHtml(o.label)}</span>`}).join("");return`
    <div class="patient-report-scale">
      ${n}
      <span class="patient-report-scale-track" style="background:${e.gradient};"></span>
      ${r}
      <span class="patient-report-scale-marker tone-${patientReportEscapeHtml(t||"normal")}" style="left:${e.marker}%;"></span>
    </div>`}function patientReportBuildReferenceHtml(e,t){const i=patientReportEscapeHtml(t||"normal"),a=patientReportEscapeHtml(e&&(e.emptyMessage||e.medianText)||"Brak por\xF3wnania do typowej warto\u015Bci dla wieku.");return!e||e.available===!1?`
      <div class="patient-report-metric-reference-box tone-${i} is-empty">
        <div class="patient-report-metric-reference-empty">${a}</div>
      </div>`:`
    <div class="patient-report-metric-reference-box tone-${i}${e.neutral?" is-neutral":""}">
      <div class="patient-report-metric-reference-kicker">${patientReportEscapeHtml(e.label||"")}</div>
      <div class="patient-report-metric-reference-main">${patientReportEscapeHtml(e.medianText||"")}</div>
      <div class="patient-report-metric-reference-diff">${patientReportEscapeHtml(e.diffText||"")}</div>
    </div>`}function patientReportBuildHighlightsHtml(e){return!Array.isArray(e)||!e.length?'<div class="patient-report-muted-box">Brak dodatkowych ostrze\u017Ce\u0144 do wyr\xF3\u017Cnienia na pierwszej stronie.</div>':`<div class="patient-report-highlight-list">${e.map(t=>`<div class="patient-report-highlight tone-${patientReportEscapeHtml(t.tone||"warn")}">${patientReportEscapeHtml(t.text)}</div>`).join("")}</div>`}function patientReportBuildMetricCardsHtml(e){return(e||[]).map(t=>{const i=t.trendText&&String(t.trendText).trim()?`<div class="patient-report-metric-trend-caption">${patientReportEscapeHtml(t.trendText||"")}</div>`:"",a=t.sparkline?`${i}<div class="patient-report-trend-svg">${t.sparkline}</div>`:"",n=t.explanation&&String(t.explanation).trim()?`
        <div class="patient-report-metric-context tone-${patientReportEscapeHtml(t.tone||"normal")}">
          <div class="patient-report-metric-context-title">Jak to rozumie\u0107 wzgl\u0119dem BMI?</div>
          <div class="patient-report-metric-context-text">${patientReportEscapeHtml(t.explanation||"")}</div>
        </div>`:"",r=t.hideReference?"":[patientReportBuildReferenceHtml(t.reference,t.referenceTone||t.tone),t.secondaryReference?patientReportBuildReferenceHtml(t.secondaryReference,t.secondaryReferenceTone||t.tone):""].join(""),o=t.extraHtml&&String(t.extraHtml).trim()?String(t.extraHtml):"";return`
      <article class="patient-report-metric-card tone-${patientReportEscapeHtml(t.tone||"normal")}">
        <div class="patient-report-metric-top">
          <div>
            <div class="patient-report-metric-title">${patientReportEscapeHtml(t.title)}</div>
            <div class="patient-report-metric-value">${patientReportEscapeHtml(t.value)}</div>
          </div>
          ${t.hideBadge?"":`<div class="patient-report-metric-badge tone-${patientReportEscapeHtml(t.tone||"normal")}">${patientReportEscapeHtml(t.badge||"\u2014")}</div>`}
        </div>
        <div class="patient-report-metric-note">${patientReportEscapeHtml(t.note||"")}</div>
        ${patientReportBuildScaleHtml(t.scale,t.tone,{suppressEmpty:!!t.hideEmptyScale})}
        ${o}
        ${r}
        ${n}
        ${a}
      </article>`}).join("")}function patientReportBuildSafeTitleHtml(e){const t=String(e??"").trim().replace(/\s+/g," ");if(!t)return"";const i=new Set(["a","i","o","u","w","z","na","do","od","po","za","we","ze","ku"]),a=t.split(" ").filter(Boolean),n=[];for(let r=0;r<a.length;r+=1){const o=a[r],l=String(o||"").toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/g,"");if(l&&i.has(l)&&r+1<a.length){n.push(`${patientReportEscapeHtml(o)}&nbsp;${patientReportEscapeHtml(a[r+1])}`),r+=1;continue}n.push(patientReportEscapeHtml(o))}return n.map(r=>`<span class="patient-report-title-group">${r}</span>`).join(" ")}function patientReportBuildMetaHtml(e){const t=(n,r)=>n?`<span class="patient-report-meta-chip${r?` patient-report-meta-chip-${r}`:""}">${patientReportEscapeHtml(n)}</span>`:"",i=[],a=[],/* rata Q: data pomiaru; gdy pomiar i raport z tego samego dnia — jeden czip */dt=e.measurementLabel?e.dateChipsSameDay?[t(`Pomiar i raport: ${e.generatedLabel}`,"generated")]:[t(`Pomiar: ${e.measurementLabel}`,"measured"),t(`Raport: ${e.generatedLabel}`,"generated")]:[t(e.generatedLabel,"generated")];return e.name?(i.push(t(`Pacjent: ${e.name}`,"name")),i.push(t(`Wiek: ${e.ageLabel}`,"age")),a.push(t(`P\u0142e\u0107: ${e.sexLabel}`,"sex")),dt.forEach(x=>a.push(x))):(i.push(t(`P\u0142e\u0107: ${e.sexLabel}`,"sex")),i.push(t(`Wiek: ${e.ageLabel}`,"age")),dt.forEach(x=>a.push(x))),[i,a].filter(n=>n.some(Boolean)).map((n,r)=>`<div class="patient-report-meta-row patient-report-meta-row-${r+1}">${n.join("")}</div>`).join("")}function patientReportBuildHtml(e){const t=patientReportBuildMetaHtml(e),i=patientReportBuildMetricCardsHtml(e.metricCards),a=patientReportBuildSecondaryCardsHtml(e),n=!!(e&&e.isAdult),r=n?Array.isArray(e&&e.sourceLines)&&e.sourceLines.length?`
          <div class="patient-report-footer-source">
            <div class="patient-report-footer-source-title">${patientReportEscapeHtml(e.sourceLabelPrefix||"G\u0142\xF3wne \u017Ar\xF3d\u0142a danych")}</div>
            <div class="patient-report-footer-source-list">
              ${e.sourceLines.map(o=>`<div class="patient-report-footer-source-line">${patientReportEscapeHtml(o||"")}</div>`).join("")}
            </div>
          </div>`:`
          <div class="patient-report-footer-source">
            <div class="patient-report-footer-source-title">${patientReportEscapeHtml(e.sourceLabelPrefix||"G\u0142\xF3wne \u017Ar\xF3d\u0142a danych")}</div>
            <div class="patient-report-footer-source-list">
              <div class="patient-report-footer-source-line">${patientReportEscapeHtml(e.sourceLabel||"\u2014")}</div>
            </div>
          </div>`:`
          <div class="patient-report-footer-source patient-report-footer-source-compact">
            <span class="patient-report-footer-source-title">${patientReportEscapeHtml(e.sourceLabelPrefix||"Por\xF3wnania centylowe")}:</span>
            <span class="patient-report-footer-source-inline">${patientReportEscapeHtml(e.sourceLabel||"\u2014")}</span>
          </div>`;return`
    <div class="patient-report-pdf-root">
      <style>
        .patient-report-pdf-root {
          width: 1240px;
          background: #f3f9f9;
          color: #183132;
          font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          -webkit-text-size-adjust: none;
          text-size-adjust: none;
        }
        .patient-report-page {
          width: 1240px;
          min-height: 1754px;
          background: linear-gradient(180deg, #f7fbfb 0%, #ffffff 22%, #ffffff 100%);
          /* rata Q: dol strony rezerwuje miejsce na stopke (position:absolute), zeby tresc nigdy pod nia nie wchodzila */
          padding: 56px 58px 130px;
          box-sizing: border-box;
          position: relative;
        }
        .patient-report-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
        }
        .patient-report-brand {
          flex: 1 1 auto;
          min-width: 0;
          max-width: none;
        }
        .patient-report-brand-kicker {
          display: block;
          padding: 0;
          border-radius: 0;
          background: none;
          color: #006a73;
          font-size: 24px;
          font-weight: 900;
          letter-spacing: 0;
          line-height: 1.08;
          white-space: nowrap;
          font-variant-ligatures: none;
          font-feature-settings: 'liga' 0, 'kern' 1;
        }
        .patient-report-title {
          margin: 16px 0 0;
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          column-gap: 0.22em;
          row-gap: 0.08em;
          max-width: 100%;
          font-size: 42px;
          line-height: 1.08;
          font-weight: 800;
          color: #10292a;
          word-break: keep-all;
          overflow-wrap: normal;
          hyphens: none;
        }
        .patient-report-title-group {
          display: block;
          white-space: nowrap;
        }
        .patient-report-subtitle {
          margin: 12px 0 0;
          font-size: 21px;
          line-height: 1.4;
          color: #496364;
          max-width: 760px;
        }
        .patient-report-meta {
          flex: 0 1 auto;
          width: fit-content;
          max-width: 52%;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
          align-items: flex-end;
        }
        .patient-report-meta-row {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          align-items: stretch;
          width: fit-content;
          max-width: 100%;
          min-width: 0;
          margin-left: auto;
        }
        .patient-report-meta-chip {
          width: fit-content;
          max-width: 100%;
          min-width: 0;
          padding: 10px 15px;
          border-radius: 14px;
          background: #ffffff;
          border: 1px solid #d7e6e6;
          font-size: 17px;
          font-weight: 600;
          line-height: 1.28;
          color: #324b4c;
          box-sizing: border-box;
          white-space: nowrap;
        }
        .patient-report-meta-chip-age,
        .patient-report-meta-chip-sex,
        .patient-report-meta-chip-generated {
          flex: 0 0 auto;
        }
        .patient-report-meta-chip-name {
          flex: 0 1 auto;
          width: auto;
          max-width: 100%;
          text-align: left;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .patient-report-hero {
          margin-top: 28px;
          border-radius: 28px;
          background: linear-gradient(135deg, #0f7d86 0%, #14939c 100%);
          color: white;
          padding: 26px 30px 24px;
          box-shadow: 0 22px 48px rgba(0, 131, 141, 0.18);
        }
        .patient-report-hero h2 {
          margin: 0;
          font-size: 34px;
          line-height: 1.16;
          font-weight: 800;
        }
        .patient-report-hero p {
          margin: 14px 0 0;
          font-size: 20px;
          line-height: 1.46;
          max-width: 1000px;
        }
        .patient-report-grid-3 {
          margin-top: 22px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }
        .patient-report-secondary-grid {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
          align-items: stretch;
        }
        .patient-report-secondary-grid.is-two-col {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .patient-report-metric-card,
        .patient-report-detail-group,
        .patient-report-info-box,
        .patient-report-muted-box {
          background: #ffffff;
          border-radius: 24px;
          border: 1px solid #dbe8e8;
          box-shadow: 0 12px 30px rgba(15, 77, 84, 0.08);
        }
        .patient-report-metric-card {
          padding: 20px 18px 16px;
          border-width: 3px;
          border-color: #cfe3e4;
          box-shadow: 0 14px 34px rgba(15, 77, 84, 0.10);
        }
        .patient-report-metric-card.tone-danger { border-color: rgba(198, 40, 40, 0.44); }
        .patient-report-metric-card.tone-warn { border-color: rgba(199, 93, 0, 0.42); }
        .patient-report-metric-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: flex-start;
        }
        .patient-report-metric-title {
          font-size: 20px;
          line-height: 1.2;
          color: #1d5053;
          font-weight: 800;
        }
        .patient-report-metric-value {
          margin-top: 8px;
          font-size: 38px;
          line-height: 1;
          font-weight: 800;
          color: #102a2b;
        }
        .patient-report-metric-badge {
          flex: 0 0 auto;
          max-width: 44%;
          padding: 7px 11px;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 700;
          text-align: right;
          background: rgba(0, 131, 141, 0.10);
          color: #006a73;
        }
        .patient-report-metric-badge.tone-warn { background: rgba(199, 93, 0, 0.12); color: #9a4a00; }
        .patient-report-metric-badge.tone-danger { background: rgba(198, 40, 40, 0.12); color: #a32020; }
        .patient-report-metric-note {
          margin-top: 8px;
          font-size: 18px;
          line-height: 1.38;
          color: #335152;
          min-height: 46px;
        }
        .patient-report-scale {
          position: relative;
          height: 82px;
          margin-top: 16px;
        }
        .patient-report-scale-value-label {
          position: absolute;
          top: 5px;
          transform: translateX(-50%);
          font-size: 13px;
          line-height: 1.2;
          font-weight: 700;
          color: #51696a;
          white-space: nowrap;
          z-index: 4;
          pointer-events: none;
        }
        .patient-report-scale-track {
          position: absolute;
          left: 0;
          right: 0;
          top: 22px;
          height: 30px;
          border-radius: 999px;
          overflow: hidden;
          border: 1.6px solid #c4dcde;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.85);
        }
        .patient-report-scale-empty {
          margin-top: 18px;
          padding: 10px 12px;
          border-radius: 16px;
          background: #f5fbfb;
          font-size: 16px;
          color: #5a7071;
        }
        .patient-report-scale-tick-line {
          position: absolute;
          top: 28px;
          transform: translateX(-50%);
          width: 2px;
          height: 18px;
          background: rgba(16, 41, 42, 0.30);
          z-index: 2;
        }
        .patient-report-scale-tick-label {
          position: absolute;
          top: 58px;
          transform: translateX(-50%);
          font-size: 13px;
          font-weight: 700;
          color: #51696a;
          background: rgba(255,255,255,0.92);
          padding: 1px 6px;
          border-radius: 999px;
          white-space: nowrap;
          z-index: 2;
        }
        .patient-report-scale-marker {
          position: absolute;
          top: 37px;
          transform: translate(-50%, -50%);
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #00838d;
          border: 4px solid white;
          box-shadow: 0 4px 16px rgba(0,0,0,0.18);
          z-index: 3;
        }
        .patient-report-scale-marker.tone-warn { background: #c75d00; }
        .patient-report-scale-marker.tone-danger { background: #c62828; }
        .patient-report-bmi-ranges-box {
          margin-top: 12px;
          border-radius: 18px;
          overflow: hidden;
          background: #f8fbfb;
          border: 1px solid #dbe7e7;
        }
        .patient-report-bmi-ranges-title {
          padding: 10px 12px 8px;
          font-size: 15px;
          line-height: 1.2;
          font-weight: 800;
          color: #2f666a;
          background: linear-gradient(180deg, rgba(0, 131, 141, 0.08) 0%, rgba(0, 131, 141, 0.03) 100%);
          border-bottom: 1px solid #e2eded;
        }
        .patient-report-bmi-ranges-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .patient-report-bmi-ranges-row td {
          padding: 7px 10px;
          font-size: 14px;
          line-height: 1.28;
          color: #355253;
          border-top: 1px solid #e7efef;
        }
        .patient-report-bmi-ranges-row:first-child td {
          border-top: none;
        }
        .patient-report-bmi-ranges-value {
          text-align: right;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          color: #1e4447;
          font-weight: 700;
        }
        .patient-report-bmi-ranges-row.is-active td {
          font-weight: 800;
          background: rgba(0, 131, 141, 0.08);
        }
        .patient-report-bmi-ranges-row.is-active.tone-warn td {
          background: rgba(199, 93, 0, 0.10);
        }
        .patient-report-bmi-ranges-row.is-active.tone-danger td {
          background: rgba(198, 40, 40, 0.10);
        }
        .patient-report-metric-reference-box {
          margin-top: 12px;
          padding: 12px 14px 11px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(0, 131, 141, 0.08) 0%, rgba(0, 131, 141, 0.04) 100%);
          border: 1.6px solid rgba(0, 131, 141, 0.18);
          min-height: 70px;
          text-align: center;
        }
        .patient-report-metric-reference-box.tone-warn {
          background: linear-gradient(180deg, rgba(199, 93, 0, 0.10) 0%, rgba(199, 93, 0, 0.05) 100%);
          border-color: rgba(199, 93, 0, 0.22);
        }
        .patient-report-metric-reference-box.tone-danger {
          background: linear-gradient(180deg, rgba(198, 40, 40, 0.10) 0%, rgba(198, 40, 40, 0.05) 100%);
          border-color: rgba(198, 40, 40, 0.22);
        }
        .patient-report-metric-reference-box.is-neutral {
          background: linear-gradient(180deg, rgba(0, 131, 141, 0.06) 0%, rgba(0, 131, 141, 0.03) 100%);
        }
        .patient-report-metric-reference-kicker {
          font-size: 16px;
          line-height: 1.25;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: none;
          color: #2f666a;
        }
        .patient-report-metric-reference-main {
          margin-top: 6px;
          font-size: 24px;
          line-height: 1.08;
          font-weight: 800;
          color: #0f2b2d;
        }
        .patient-report-metric-reference-diff {
          margin-top: 6px;
          font-size: 17px;
          line-height: 1.35;
          font-weight: 700;
          color: #2e5053;
        }
        .patient-report-metric-reference-empty {
          font-size: 16px;
          line-height: 1.45;
          color: #4a6263;
        }
        .patient-report-metric-context {
          margin-top: 10px;
          padding: 11px 13px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(0, 131, 141, 0.07) 0%, rgba(0, 131, 141, 0.03) 100%);
          border: 1.5px solid rgba(0, 131, 141, 0.16);
        }
        .patient-report-metric-context.tone-warn {
          background: linear-gradient(180deg, rgba(199, 93, 0, 0.09) 0%, rgba(199, 93, 0, 0.04) 100%);
          border-color: rgba(199, 93, 0, 0.18);
        }
        .patient-report-metric-context.tone-danger {
          background: linear-gradient(180deg, rgba(198, 40, 40, 0.09) 0%, rgba(198, 40, 40, 0.04) 100%);
          border-color: rgba(198, 40, 40, 0.18);
        }
        .patient-report-metric-context-title {
          font-size: 15px;
          line-height: 1.25;
          font-weight: 800;
          color: #2f666a;
        }
        .patient-report-metric-context-text {
          margin-top: 6px;
          font-size: 16px;
          line-height: 1.42;
          color: #355253;
        }
        .patient-report-metric-trend-caption {
          margin-top: 10px;
          font-size: 16px;
          color: #5a7071;
          min-height: 24px;
          text-align: center;
        }
        .patient-report-trend-svg {
          margin-top: 5px;
          border-radius: 18px;
          background: #f7fbfb;
          border: 1px solid #e0ecec;
          padding: 7px;
        }
        .patient-report-support-card {
          background: #ffffff;
          border-radius: 24px;
          border: 3px solid #cfe3e4;
          box-shadow: 0 14px 34px rgba(15, 77, 84, 0.10);
          padding: 18px 17px 16px;
          min-height: 100%;
        }
        .patient-report-support-card.tone-warn { border-color: rgba(199, 93, 0, 0.42); }
        .patient-report-support-card.tone-danger { border-color: rgba(198, 40, 40, 0.44); }
        .patient-report-support-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .patient-report-support-title {
          font-size: 19px;
          line-height: 1.2;
          color: #1d5053;
          font-weight: 800;
        }
        .patient-report-support-subtitle {
          margin-top: 8px;
          font-size: 16px;
          line-height: 1.35;
          color: #5a7071;
        }
        .patient-report-support-value {
          margin-top: 8px;
          font-size: 33px;
          line-height: 1.05;
          font-weight: 800;
          color: #102a2b;
        }
        .patient-report-support-note {
          margin-top: 8px;
          font-size: 16px;
          line-height: 1.42;
          color: #345153;
          min-height: 44px;
        }
        .patient-report-bmr-table-wrap {
          margin-top: 10px;
          border-radius: 18px;
          border: 1px solid #d9e8e8;
          overflow: hidden;
          background: #fbfefe;
        }
        .patient-report-bmr-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 15px;
          line-height: 1.35;
        }
        .patient-report-bmr-table th,
        .patient-report-bmr-table td {
          padding: 8px 9px;
          text-align: left;
          vertical-align: top;
          border-bottom: 1px solid #e6f0f0;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .patient-report-bmr-table th:first-child,
        .patient-report-bmr-table td:first-child {
          width: 31%;
        }
        .patient-report-bmr-table th:last-child,
        .patient-report-bmr-table td:last-child {
          text-align: left;
          white-space: normal;
          width: 69%;
        }
        .patient-report-bmr-table--nutrition-norms {
          font-size: 14px;
        }
        /* rata Q: tabela „Zapotrzebowanie energetyczne” — dluzsze etykiety musza sie zawijac */
        .patient-report-bmr-table--energy {
          font-size: 14px;
        }
        .patient-report-bmr-table--energy th:first-child,
        .patient-report-bmr-table--energy td:first-child {
          width: 56%;
          white-space: normal;
          overflow-wrap: normal;
          word-break: normal;
          hyphens: none;
        }
        .patient-report-bmr-table--energy th:last-child,
        .patient-report-bmr-table--energy td:last-child {
          width: 44%;
          white-space: normal;
          font-variant-numeric: tabular-nums;
        }
        .patient-report-bmr-table--nutrition-norms th,
        .patient-report-bmr-table--nutrition-norms td {
          padding-left: 7px;
          padding-right: 7px;
        }
        .patient-report-bmr-table--nutrition-norms th:first-child,
        .patient-report-bmr-table--nutrition-norms td:first-child {
          width: 42%;
          white-space: nowrap;
          overflow-wrap: normal;
          word-break: normal;
          hyphens: none;
          letter-spacing: -0.01em;
        }
        .patient-report-bmr-table--nutrition-norms th:last-child,
        .patient-report-bmr-table--nutrition-norms td:last-child {
          width: 58%;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .patient-report-bmr-table thead th {
          background: #f4fbfb;
          color: #315153;
          font-size: 14px;
          font-weight: 800;
        }
        .patient-report-bmr-table tbody tr.is-highlighted td {
          position: relative;
          background: linear-gradient(180deg, rgba(0, 131, 141, 0.10) 0%, rgba(0, 131, 141, 0.05) 100%);
          font-weight: 800;
          color: #0f4f53;
        }
        .patient-report-bmr-table tbody tr.is-highlighted td::before {
          content: '';
          position: absolute;
          inset: 0;
          border-top: 2px solid rgba(0, 131, 141, 0.22);
          border-bottom: 2px solid rgba(0, 131, 141, 0.22);
          pointer-events: none;
        }
        .patient-report-bmr-table tbody tr.is-highlighted td:first-child::before {
          border-left: 2px solid rgba(0, 131, 141, 0.22);
        }
        .patient-report-bmr-table tbody tr.is-highlighted td:last-child::before {
          border-right: 2px solid rgba(0, 131, 141, 0.22);
        }
        .patient-report-bmr-table .patient-report-bmr-row-detail {           margin-top: 2px;           font-size: 12px;           font-weight: 500;           line-height: 1.3;           color: #5b7477;         }         .patient-report-bmr-table tbody tr:last-child td {
          border-bottom: none;
        }
        .patient-report-vital-list {
          margin-top: 10px;
          display: grid;
          gap: 10px;
        }
        .patient-report-vital-item {
          border-radius: 18px;
          border: 1.5px solid #d9e8e8;
          background: #fbfefe;
          padding: 11px 11px 10px;
        }
        .patient-report-vital-item.tone-warn { border-color: rgba(199, 93, 0, 0.24); background: rgba(199, 93, 0, 0.05); }
        .patient-report-vital-item.tone-danger { border-color: rgba(198, 40, 40, 0.25); background: rgba(198, 40, 40, 0.05); }
        .patient-report-vital-item-title {
          font-size: 16px;
          line-height: 1.25;
          font-weight: 800;
          color: #183c3f;
        }
        .patient-report-vital-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: baseline;
          margin-top: 7px;
          font-size: 14.5px;
          line-height: 1.3;
          color: #4a6465;
        }
        .patient-report-vital-row strong {
          font-size: 16px;
          line-height: 1.2;
          color: #103132;
          text-align: right;
        }
        .patient-report-vital-row.is-value {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid #dceaea;
        }
        .patient-report-vital-row.is-value .patient-report-vital-label {
          font-weight: 800;
          color: #103132;
        }
        .patient-report-vital-row.is-value strong { font-size: 16px; }
        .patient-report-vital-item.is-value-first .patient-report-vital-row.is-value {
          margin-top: 9px;
          padding: 10px 12px;
          border-top: 0;
          border-radius: 13px;
          background: rgba(0, 131, 141, 0.10);
          border: 1px solid rgba(0, 131, 141, 0.16);
        }
        .patient-report-vital-item.is-value-first.tone-warn .patient-report-vital-row.is-value {
          background: rgba(199, 93, 0, 0.11);
          border-color: rgba(199, 93, 0, 0.22);
        }
        .patient-report-vital-item.is-value-first.tone-danger .patient-report-vital-row.is-value {
          background: rgba(198, 40, 40, 0.10);
          border-color: rgba(198, 40, 40, 0.20);
        }
        .patient-report-vital-item.is-value-first .patient-report-vital-row.is-value strong {
          font-size: 18px;
          font-weight: 900;
        }
        .patient-report-vital-item.is-value-first .patient-report-vital-status {
          margin-top: 8px;
          padding: 8px 10px;
          border-radius: 11px;
          background: rgba(255, 255, 255, 0.72);
          font-weight: 700;
        }
        .patient-report-vital-row.is-highlighted {
          padding: 7px 10px;
          border-radius: 11px;
          background: rgba(0, 131, 141, 0.08);
          color: #0f4043;
        }
        .patient-report-vital-row.is-highlighted strong { color: #0b3f43; }
        .patient-report-vital-status {
          margin-top: 7px;
          font-size: 14.5px;
          line-height: 1.4;
          color: #486263;
        }
        .patient-report-vital-status.tone-warn { color: #9a4a00; }
        .patient-report-vital-status.tone-danger { color: #a32020; }
        .patient-report-vital-empty {
          margin-top: 7px;
          font-size: 14.5px;
          line-height: 1.4;
          color: #5a7071;
        }
        .patient-report-grid-2 {
          margin-top: 22px;
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 18px;
        }
        .patient-report-info-box {
          padding: 24px 24px 22px;
        }
        .patient-report-info-box h3,
        .patient-report-detail-group h3 {
          margin: 0;
          font-size: 24px;
          line-height: 1.15;
          color: #123132;
        }
        .patient-report-info-box p,
        .patient-report-detail-group p {
          margin: 10px 0 0;
          font-size: 17px;
          line-height: 1.5;
          color: #4d6667;
        }
        .patient-report-highlight-list {
          display: grid;
          gap: 12px;
          margin-top: 16px;
        }
        .patient-report-highlight {
          border-radius: 16px;
          padding: 13px 14px;
          font-size: 16px;
          line-height: 1.45;
          background: rgba(0, 131, 141, 0.08);
          color: #006a73;
          border: 1px solid rgba(0, 131, 141, 0.16);
        }
        .patient-report-highlight.tone-warn {
          background: rgba(199, 93, 0, 0.10);
          color: #9a4a00;
          border-color: rgba(199, 93, 0, 0.18);
        }
        .patient-report-highlight.tone-danger {
          background: rgba(198, 40, 40, 0.10);
          color: #a32020;
          border-color: rgba(198, 40, 40, 0.18);
        }
        .patient-report-muted-box {
          padding: 18px 20px;
          font-size: 16px;
          line-height: 1.45;
          color: #5f7475;
        }
        .patient-report-footer {
          position: absolute;
          left: 58px;
          right: 58px;
          bottom: 34px;
          display: flex;
          flex-direction: column;
          gap: 7px;
          align-items: stretch;
          padding-top: 10px;
          border-top: 1px solid #dde8e8;
          font-size: 13px;
          line-height: 1.38;
          color: #6b7d7d;
        }
        .patient-report-footer-note {
          min-width: 0;
          display: block;
          text-align: left;
          text-justify: auto;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
          word-spacing: normal;
          letter-spacing: 0;
          -webkit-hyphens: none;
          hyphens: none;
        }
        .patient-report-footer-source {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
          text-align: left;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
          word-spacing: normal;
          letter-spacing: 0;
          font-weight: 400;
        }
        .patient-report-footer-source-title {
          font-weight: 700;
        }
        .patient-report-footer-source-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .patient-report-footer-source-line {
          min-width: 0;
          display: block;
        }
        .patient-report-page.is-child .patient-report-footer {
          bottom: 38px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: end;
          column-gap: 18px;
          row-gap: 0;
          padding-top: 0;
          border-top: none;
          font-size: 14px;
          line-height: 1.35;
        }
        .patient-report-page.is-child .patient-report-footer-note {
          display: block;
        }
        .patient-report-page.is-child .patient-report-footer-source {
          display: block;
          text-align: right;
          white-space: nowrap;
          overflow-wrap: normal;
          word-break: normal;
        }
        .patient-report-page.is-child .patient-report-footer-source-compact {
          font-weight: 400;
        }
        .patient-report-page.is-child .patient-report-footer-source-title,
        .patient-report-page.is-child .patient-report-footer-source-inline {
          display: inline;
          white-space: nowrap;
        }
        .patient-report-page.is-child .patient-report-footer-source-title {
          margin-right: 4px;
          font-weight: 700;
        }
      </style>
      <section class="patient-report-page ${n?"is-adult":"is-child"}">
        <div class="patient-report-header">
          <div class="patient-report-brand">
            <div class="patient-report-brand-kicker">wagaiwzrost.pl</div>
            <h1 class="patient-report-title" aria-label="${patientReportEscapeHtml(e.title)}">${patientReportBuildSafeTitleHtml(e.title)}</h1>
            ${e.subtitle?`<p class="patient-report-subtitle">${patientReportEscapeHtml(e.subtitle)}</p>`:""}
          </div>
          <div class="patient-report-meta">${t}</div>
        </div>
        <section class="patient-report-hero tone-${patientReportEscapeHtml(e.headline.tone||"normal")}">
          <h2>${patientReportEscapeHtml(e.headline.title||"")}</h2>
          ${e.headline.text?`<p>${patientReportEscapeHtml(e.headline.text||"")}</p>`:""}
          ${e.headline.subtext?`<p>${patientReportEscapeHtml(e.headline.subtext||"")}</p>`:""}
        </section>
        <section class="patient-report-grid-3">
          ${i}
        </section>
        <section class="patient-report-secondary-grid${e.secondaryCardCount===2?" is-two-col":""}">
          ${a}
        </section>
        <div class="patient-report-footer">
          <div class="patient-report-footer-note">Raport ma charakter informacyjny i stanowi uzupe\u0142nienie om\xF3wienia wynik\xF3w podczas wizyty.</div>
          ${r}
        </div>
      </section>
    </div>`}function patientReportShowToast(e){/* P-DYMKI: dymek przez jeden modul (vilda_dymek.js); pozycje wzgledem docka i strzalki daje klasa .vilda-dymek, nie style inline. *//* Nazwa zostaje: wola ja 9 modulow (obwody, wzrastanie podstawowe, GH, klirens...). */(function(tx){var D=typeof window<"u"?window.VildaDymek:null;if(D&&typeof D.pokaz=="function")return D.pokaz(tx,{czas:2800});typeof vildaLogAppWarn=="function"&&vildaLogAppWarn("dymki","Brak modu\u0142u dymk\u00F3w (vilda_dymek.js) \u2014 komunikat nie zosta\u0142 pokazany",null,{tekst:tx})})(e||"Raport PDF zosta\u0142 wygenerowany.")}function patientReportDelay(e){return new Promise(t=>setTimeout(t,e))}async function patientReportWaitForStableLayout(){if(document.fonts&&document.fonts.ready)try{await document.fonts.ready}catch(e){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",e,{line:17049})}await new Promise(e=>requestAnimationFrame(()=>requestAnimationFrame(e)))}function patientReportCreateRenderHost(e){const t=document.createElement("div"),i=Math.max(1,Number(e)||0);return t.style.position="absolute",t.style.left="-20000px",t.style.top="0",t.style.width=`${i}px`,t.style.maxWidth=`${i}px`,t.style.zIndex="-1",t.style.pointerEvents="none",t.style.opacity="1",t.style.webkitTextSizeAdjust="none",t.style.textSizeAdjust="none",t.setAttribute("aria-hidden","true"),t}const PATIENT_REPORT_PDF_RENDER_SCALE=2.25,PATIENT_REPORT_PDF_MAX_EXPORT_WIDTH=2200,PATIENT_REPORT_PDF_JPEG_QUALITY=.92,PATIENT_REPORT_PDF_PNG_RATIO_LIMIT=1.4,PATIENT_REPORT_PDF_PNG_RATIO_LIMIT_PREFERRED=1.7,PATIENT_REPORT_PDF_VISIT_PREFERRED_FORMAT="JPEG",PATIENT_REPORT_PDF_IMAGE_COMPRESSION="FAST";function patientReportResolveRenderScale(e,t={}){const i=Number.isFinite(t.desiredScale)&&t.desiredScale>0?t.desiredScale:PATIENT_REPORT_PDF_RENDER_SCALE,a=Number.isFinite(t.maxExportWidth)&&t.maxExportWidth>0?t.maxExportWidth:PATIENT_REPORT_PDF_MAX_EXPORT_WIDTH;let n=0;if(Number.isFinite(e)&&e>0?n=e:e&&typeof e=="object"&&(n=(typeof e.getBoundingClientRect=="function"?e.getBoundingClientRect().width:0)||e.offsetWidth||e.clientWidth||e.scrollWidth||0),!(n>0)||!(a>0))return i;const r=a/n;return!Number.isFinite(r)||r<=0?i:Math.max(1,Math.min(i,r))}function patientReportResizeCanvasForPdf(e,t=PATIENT_REPORT_PDF_MAX_EXPORT_WIDTH){if(!e||!e.width||!e.height||!Number.isFinite(t)||t<=0||e.width<=t)return e;const i=t/e.width,a=Math.max(1,Math.round(e.width*i)),n=Math.max(1,Math.round(e.height*i)),r=document.createElement("canvas");r.width=a,r.height=n;const o=r.getContext("2d",{alpha:!1});if(!o)return e;o.fillStyle="#ffffff",o.fillRect(0,0,a,n),o.imageSmoothingEnabled=!0;try{o.imageSmoothingQuality="high"}catch(l){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",l,{line:17130})}return o.drawImage(e,0,0,a,n),r}function patientReportEstimateDataUrlBytes(e){if(!e||typeof e!="string")return Number.POSITIVE_INFINITY;const t=e.indexOf(",");if(t<0)return Number.POSITIVE_INFINITY;const i=e.length-t-1;return Math.ceil(i*3/4)}function patientReportCanvasToPdfImage(e,t={}){const i=!!(t&&t.preferPng),a=String(t&&t.preferredFormat?t.preferredFormat:"").trim().toUpperCase(),n=!!(t&&t.skipPngProbe),r=Number.isFinite(t&&t.maxWidth)&&t.maxWidth>0?t.maxWidth:PATIENT_REPORT_PDF_MAX_EXPORT_WIDTH,o=Number.isFinite(t&&t.jpegQuality)?t.jpegQuality:PATIENT_REPORT_PDF_JPEG_QUALITY,l=Math.max(.5,Math.min(1,o)),c=patientReportResizeCanvasForPdf(e,r);let s,p;function d(z){const k=z==="PNG"?"PNG":"JPEG",m=k==="PNG"?"image/png":"image/jpeg";try{const h=c.toDataURL(m,k==="JPEG"?l:void 0);if(typeof h=="string"&&h.startsWith(`data:${m}`))return{dataUrl:h,format:k}}catch(h){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",h,{line:17167})}return null}function u(){return typeof s>"u"&&(s=d("JPEG")||!1),s||null}function w(){return typeof p>"u"&&(p=d("PNG")||!1),p||null}if(a==="PNG")return w()||u()||{dataUrl:c.toDataURL("image/png"),format:"PNG"};if(a==="JPEG"||a==="JPG")return u()||w()||{dataUrl:c.toDataURL("image/png"),format:"PNG"};if(n)return(i?w()||u():u()||w())||{dataUrl:c.toDataURL("image/png"),format:"PNG"};const f=u(),g=w();if(f&&g){const z=patientReportEstimateDataUrlBytes(f.dataUrl),k=patientReportEstimateDataUrlBytes(g.dataUrl),m=i?PATIENT_REPORT_PDF_PNG_RATIO_LIMIT_PREFERRED:PATIENT_REPORT_PDF_PNG_RATIO_LIMIT;return Number.isFinite(z)&&Number.isFinite(k)&&k<=z*m?g:f}return g||f||{dataUrl:c.toDataURL("image/png"),format:"PNG"}}let __patientReportPdfInFlight=!1;/* P-PDF-IOS rata J (2026-09-22): na iOS z ekranu glownego (PWA) atrybut download jest ignorowany, wiec plik znikal mimo toastu "wygenerowano". Tam PDF idzie do arkusza udostepniania (navigator.share z plikiem — ta sama droga, co w wydruku postepow); poza tym zwykle pobranie. Pomocnik oddaje obietnice z droga: "pobierz" | "udostepnij" | "anulowane" | "brak"; dotychczasowi wywolujacy moga ja zignorowac. */function patientReportIosStandalone(){try{if(!/iPhone|iPad|iPod/i.test(navigator.userAgent||""))return!1;return!!(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===!0)}catch{return!1}}function patientReportCanShareFiles(){try{return typeof navigator.share=="function"&&typeof navigator.canShare=="function"&&typeof File=="function"&&navigator.canShare({files:[new File([new Blob(["x"])],"x.pdf",{type:"application/pdf"})]})}catch{return!1}}function patientReportSaveBlobLink(e,i){const a=URL.createObjectURL(e),n=document.createElement("a");n.href=a,n.download=i,document.body.appendChild(n),n.click(),setTimeout(()=>{try{URL.revokeObjectURL(a)}catch(r){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",r,{line:17230})}try{n.remove()}catch(r){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",r,{line:17231})}},0)}function patientReportDeliverFiles(list){const pliki=(Array.isArray(list)?list:[]).filter(q=>q&&q.blob instanceof Blob).map(q=>({blob:q.blob,nazwa:String(q.filename||"raport.pdf").trim()||"raport.pdf"}));if(!pliki.length)return Promise.resolve({droga:"brak"});if(patientReportIosStandalone()){if(!patientReportCanShareFiles())return Promise.resolve({droga:"brak"});const files=pliki.map(q=>new File([q.blob],q.nazwa,{type:q.blob.type||"application/pdf"}));return navigator.share({files:files,title:pliki[0].nazwa}).then(()=>({droga:"udostepnij"})).catch(err=>{if(err&&(err.name==="AbortError"||err.name==="NotAllowedError"))return{droga:"anulowane"};throw err})}return pliki.forEach(q=>patientReportSaveBlobLink(q.blob,q.nazwa)),Promise.resolve({droga:"pobierz"})}function patientReportDownloadBlob(e,t){return e instanceof Blob?patientReportDeliverFiles([{blob:e,filename:t}]):Promise.resolve({droga:"brak"})}function patientReportToastPoZapisie(w,ok){return w&&w.droga==="udostepnij"?"PDF przekazany do arkusza udost\u0119pniania \u2013 wybierz \u201EZapisz do Plik\xF3w\u201D albo aplikacj\u0119.":w&&w.droga==="anulowane"?"Udost\u0119pnianie PDF anulowane.":w&&w.droga==="brak"?"Ta przegl\u0105darka nie pozwala zapisa\u0107 PDF z aplikacji na ekranie g\u0142\xF3wnym \u2013 otw\xF3rz stron\u0119 w Safari.":ok}async function patientReportRunExternalPdfTask(e,t,i){if(__patientReportPdfInFlight)return!1;__patientReportPdfInFlight=!0;const a=e||null,n=a&&a.childNodes?Array.prototype.slice.call(a.childNodes).map(function(o){return o.cloneNode(!0)}):null,r=a?a.textContent:"";a&&(a.disabled=!0,a.textContent=i||"Przygotowywanie PDF\u2026");try{return await t(),!0}finally{a&&(a.disabled=!1,n&&n.length?vildaAppRestoreClonedChildren(a,n,"app:button-restore"):a.textContent=r||"Raport PDF dla pacjenta"),__patientReportPdfInFlight=!1}}async function patientReportBuildPdfPackage(){const e=getFormattedProfessionalSummaryLines();if(!Array.isArray(e)||!e.length)throw new Error("Brak danych do wygenerowania raportu PDF.");if(typeof window<"u"&&typeof window.vildaEnsurePdfLibraries=="function")try{await window.vildaEnsurePdfLibraries()}catch{}vildaEnsureGlobalDependencyContract("patient-report-pdf",{silent:!0,showUi:!0,message:"Brakuje bibliotek potrzebnych do wygenerowania raportu pacjenta PDF."});const t=vildaRequireGlobalFunction("jspdf.jsPDF","patient-report-pdf",{silent:!0}),i=vildaRequireGlobalFunction("html2canvas","patient-report-pdf",{silent:!0});if(!t||!i)throw new Error("Brakuje bibliotek potrzebnych do wygenerowania PDF.");const a=patientReportCreateRenderHost(1240);try{const n=patientReportBuildModel();vildaAppSetTrustedHtml(a,patientReportBuildHtml(n),"app:host"),document.body.appendChild(a),await patientReportWaitForStableLayout();const r=Array.from(a.querySelectorAll(".patient-report-page"));if(!r.length)throw new Error("Brak stron raportu do renderowania.");const o=new t({orientation:"portrait",unit:"mm",format:"a4",compress:!0,putOnlyUsedFonts:!0});o.setProperties({title:"Raport po wizycie",subject:"Raport po wizycie",author:"wagaiwzrost.pl"});for(let c=0;c<r.length;c+=1){const s=r[c],p=patientReportResolveRenderScale(s),d=await i(s,{scale:p,useCORS:!0,backgroundColor:"#ffffff",logging:!1,imageTimeout:0}),u=patientReportCanvasToPdfImage(d,{preferredFormat:PATIENT_REPORT_PDF_VISIT_PREFERRED_FORMAT,skipPngProbe:!0});c>0&&o.addPage(),o.addImage(u.dataUrl,u.format,0,0,210,297,void 0,PATIENT_REPORT_PDF_IMAGE_COMPRESSION)}const l=patientReportSanitizeFilename(n.name||"pacjent");return{blob:o.output("blob"),filename:`Raport_po_wizycie_${l||"pacjent"}.pdf`}}finally{try{a.remove()}catch(n){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",n,{line:17319})}}}async function generatePatientReportPdf(e){try{await patientReportRunExternalPdfTask(e,async()=>{const t=await patientReportBuildPdfPackage();if(!t||!(t.blob instanceof Blob))throw new Error("Nie uda\u0142o si\u0119 przygotowa\u0107 pliku PDF.");const w0=await patientReportDownloadBlob(t.blob,t.filename);patientReportShowToast(patientReportToastPoZapisie(w0,"Raport PDF zosta\u0142 wygenerowany."))},"Przygotowywanie PDF\u2026")}catch(t){vildaLogAppError("patient-report-pdf","B\u0142\u0105d generowania raportu PDF dla pacjenta",t),console.error("B\u0142\u0105d generowania raportu PDF dla pacjenta:",t),t&&t.vildaDependencyError||patientReportShowToast(t&&t.message?t.message:"Nie uda\u0142o si\u0119 wygenerowa\u0107 raportu PDF. Spr\xF3buj ponownie.")}}function patientReportGetCentileChartSelectionState(){let e=null;try{vildaEnsureGlobalDependencyContract("patient-report-centile-chart",{silent:!0,message:"Brakuje danych lub funkcji potrzebnych do wygenerowania wykres\xF3w centylowych."});const o=vildaRequireGlobalFunction("getCentileChartState","patient-report-centile-chart",{silent:!0});e=o?o():null}catch(o){vildaLogAppWarn("patient-report-centile-chart","Nie uda\u0142o si\u0119 odczyta\u0107 stanu siatki centylowej do raportu",o),e=null}const t=String(e&&e.source?e.source:"").toUpperCase(),i=advHistorySourceLabel(t||""),a=vildaRequireGlobalFunction("generatePalczewskaCentileCharts","patient-report-centile-chart",{silent:!0}),n=vildaRequireGlobalFunction("generateCentileChart","patient-report-centile-chart",{silent:!0});return{available:!!(e&&e.visible!==!1&&e.supported&&(t==="PALCZEWSKA"&&a||n)),source:t,sourceLabel:i,message:e&&e.message?e.message:"",hint:e&&e.hint?e.hint:""}}async function generatePatientCentileChartPdf(e){const t=patientReportGetCentileChartSelectionState();if(!t.available){const i=vildaCheckGlobalDependencyContract("patient-report-centile-chart",{silent:!0});i&&i.ok===!1?vildaEnsureGlobalDependencyContract("patient-report-centile-chart",{silent:!0,showUi:!0,throwOnMissing:!1,message:"Brakuje danych lub funkcji potrzebnych do wygenerowania wykres\xF3w centylowych."}):patientReportShowToast(t.message||"Siatka centylowa nie jest obecnie dost\u0119pna.");return}try{await patientReportRunExternalPdfTask(e,async()=>{if(t.source==="PALCZEWSKA"){const a=vildaRequireGlobalFunction("generatePalczewskaCentileCharts","patient-report-centile-chart");if(!a)throw new Error("Generator siatek Palczewska nie jest obecnie dost\u0119pny.");await a();return}const i=typeof window<"u"?window.overrideCentileSource:void 0;try{typeof window<"u"&&(window.overrideCentileSource=t.source||void 0);const a=vildaRequireGlobalFunction("generateCentileChart","patient-report-centile-chart");if(!a)throw new Error("Generator siatek centylowych nie jest obecnie dost\u0119pny.");await a()}finally{typeof window<"u"&&(window.overrideCentileSource=i)}},"Przygotowywanie PDF\u2026")}catch(i){vildaLogAppError("patient-report-centile-chart","B\u0142\u0105d generowania siatki centylowej z okna wyboru PDF",i),console.error("B\u0142\u0105d generowania siatki centylowej z okna wyboru PDF:",i),patientReportShowToast("Nie uda\u0142o si\u0119 wygenerowa\u0107 siatki centylowej. Spr\xF3buj ponownie.")}}function patientReportHasAdvancedGrowthPdfAvailable(){try{const e=vildaRequireGlobalFunction("advGrowthCollectHistoricalPointsForReport","patient-report-advanced-growth",{silent:!0}),t=vildaRequireGlobalFunction("generateAdvancedGrowthPdfReport","patient-report-advanced-growth",{silent:!0});return!!(e&&e().length>=1&&t)}catch{return!1}}async function generatePatientAdvancedGrowthPdf(e){if(!patientReportHasAdvancedGrowthPdfAvailable()){const t=vildaCheckGlobalDependencyContract("patient-report-advanced-growth",{silent:!0});t&&t.ok===!1?vildaEnsureGlobalDependencyContract("patient-report-advanced-growth",{silent:!0,showUi:!0,throwOnMissing:!1,message:"Brakuje funkcji potrzebnych do raportu zaawansowanego wzrastania."}):patientReportShowToast("Raport wzrastania nie jest obecnie dost\u0119pny.");return}try{await patientReportRunExternalPdfTask(e,async()=>{const t=vildaRequireGlobalFunction("generateAdvancedGrowthPdfReport","patient-report-advanced-growth");if(!t)throw new Error("Generator raportu wzrastania nie jest obecnie dost\u0119pny.");await t()},"Przygotowywanie PDF\u2026")}catch(t){console.error("B\u0142\u0105d generowania raportu wzrastania z okna wyboru PDF:",t),patientReportShowToast("Nie uda\u0142o si\u0119 wygenerowa\u0107 raportu wzrastania. Spr\xF3buj ponownie.")}}function patientReportGetPdfChoiceOptions(){const e=[];try{const i=getFormattedProfessionalSummaryLines();Array.isArray(i)&&i.length&&e.push({value:"visit",title:"Raport po wizycie",description:"Pe\u0142ny raport z podsumowaniem wynik\xF3w, interpretacj\u0105 i kartami pomocniczymi.",checkedByDefault:!0})}catch(i){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",i,{line:17469})}try{typeof window<"u"&&typeof window.dietRecommendationsHasPdfAvailable=="function"&&window.dietRecommendationsHasPdfAvailable()&&e.push({value:"diet",title:"Raport zalece\u0144 dietetycznych",description:"Jednostronicowy plan pacjenta: zapotrzebowanie energetyczne, cel masy cia\u0142a i zalecenia wynikaj\u0105ce ze stanu od\u017Cywienia.",checkedByDefault:!1})}catch(i){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",i,{line:17482})}const t=patientReportGetCentileChartSelectionState();return t.available&&e.push({value:"centile",title:`Siatka centylowa${t.sourceLabel?` (${t.sourceLabel})`:""}`,description:"PDF z aktualn\u0105 siatk\u0105 centylow\u0105 zgodn\u0105 z wcze\u015Bniej wybranym \u017Ar\xF3d\u0142em danych.",checkedByDefault:!1}),patientReportHasAdvancedGrowthPdfAvailable()&&e.push({value:"growth",title:"Raport wzrastania",description:"Raport z karty Zaawansowane obliczenia wzrostowe, je\u015Bli dost\u0119pne s\u0105 punkty historyczne.",checkedByDefault:!1}),e.length&&!e.some(i=>i.checkedByDefault)&&(e[0].checkedByDefault=!0),e}function patientReportGetPdfChoiceOptionMeta(e){return patientReportGetPdfChoiceOptions().find(t=>t.value===e)||null}function patientReportResolveFilenameBase(){let e="";try{const t=typeof patientReportBuildModel=="function"?patientReportBuildModel():null;e=String(t&&t.name||document.getElementById("name")?.value||document.getElementById("advName")?.value||"")}catch{e=String(document.getElementById("name")?.value||document.getElementById("advName")?.value||"")}return patientReportSanitizeFilename(e||"pacjent")||"pacjent"}function patientReportBuildPdfPageSpecFromCanvas(e,t){if(!e)return null;const i=t||{},a=i.orientation==="landscape"?"landscape":"portrait",n=a==="landscape"?297:210,r=a==="landscape"?210:297;let o=i.format==="PNG"?"PNG":"JPEG",l="";const c=String(i.preferredFormat||"").trim().toUpperCase(),s=patientReportCanvasToPdfImage(e,{preferredFormat:c||(i.strategy==="patient"?PATIENT_REPORT_PDF_VISIT_PREFERRED_FORMAT:o),preferPng:o==="PNG",skipPngProbe:!0,jpegQuality:Number.isFinite(i.jpegQuality)?i.jpegQuality:PATIENT_REPORT_PDF_JPEG_QUALITY,maxWidth:Number.isFinite(i.maxWidth)?i.maxWidth:PATIENT_REPORT_PDF_MAX_EXPORT_WIDTH});return o=s&&s.format?s.format:o,l=s&&s.dataUrl?s.dataUrl:"",{orientation:a,format:o,dataUrl:l,widthMm:Number.isFinite(i.widthMm)?i.widthMm:n,heightMm:Number.isFinite(i.heightMm)?i.heightMm:r}}/* ADV-REPORT-8 (zgloszenie wlasciciela 2026-09-13): krajacz tnie po GRANICACH BLOKOW, gdy wolajacy je poda. Wczesniej szedl stalym krokiem co wysokosc arkusza, wiec wiersz tabeli bywal przeciety poziomo w polowie. Planista jest ten sam, co w karcie wzrostowej (advGrowthPlanRasterPages), zeby obie drogi tnaly tak samo. Bez granic zachowanie zostaje stare. */function patientReportResolveRasterPagePlanner(){try{const e=typeof window<"u"&&window.VildaAdvancedGrowth?window.VildaAdvancedGrowth.advGrowthPlanRasterPages:null;return typeof e=="function"?e:null}catch{return null}}function patientReportSliceCanvasToPageSpecs(e,t){if(!e)return[];const i=t||{},a=i.orientation==="landscape"?"landscape":"portrait",n=a==="landscape"?297:210,r=a==="landscape"?210:297,o=Math.max(1,Math.floor(e.width*r/n)),l=[],g=Array.isArray(i.boundaries)?i.boundaries:null,pl=g&&g.length?patientReportResolveRasterPagePlanner():null,zk=pl?pl(g,e.height,o):null,zakresy=Array.isArray(zk)&&zk.length?zk:null;if(zakresy){for(let c=0;c<zakresy.length;c+=1){const y0=Math.max(0,Math.round(zakresy[c][0])),s=Math.max(1,Math.round(zakresy[c][1]-zakresy[c][0])),p=document.createElement("canvas");p.width=e.width,p.height=s;const d=p.getContext("2d");d&&(d.fillStyle="#ffffff",d.fillRect(0,0,p.width,p.height),d.drawImage(e,0,y0,e.width,s,0,0,e.width,s),l.push(patientReportBuildPdfPageSpecFromCanvas(p,{orientation:a,format:i.format==="JPEG"?"JPEG":"PNG",widthMm:n,heightMm:s*n/e.width})))}return l.filter(Boolean)}for(let c=0;c<e.height;c+=o){const s=Math.min(o,e.height-c),p=document.createElement("canvas");p.width=e.width,p.height=s;const d=p.getContext("2d");d&&(d.drawImage(e,0,c,e.width,s,0,0,e.width,s),l.push(patientReportBuildPdfPageSpecFromCanvas(p,{orientation:a,format:i.format==="JPEG"?"JPEG":"PNG",widthMm:n,heightMm:s*n/e.width})))}return l.filter(Boolean)}async function patientReportCollectVisitPdfPages(){const e=getFormattedProfessionalSummaryLines();if(!Array.isArray(e)||!e.length)throw new Error("Brak danych do wygenerowania raportu po wizycie.");if(typeof window<"u"&&typeof window.vildaEnsurePdfLibraries=="function")try{await window.vildaEnsurePdfLibraries()}catch{}vildaEnsureGlobalDependencyContract("patient-report-visit-pages",{silent:!0,showUi:!0,message:"Brakuje bibliotek potrzebnych do wygenerowania dodatkowych stron raportu."});const t=vildaRequireGlobalFunction("jspdf.jsPDF","patient-report-visit-pages",{silent:!0}),i=vildaRequireGlobalFunction("html2canvas","patient-report-visit-pages",{silent:!0});if(!t||!i)throw new Error("Brakuje bibliotek potrzebnych do wygenerowania PDF.");const a=patientReportCreateRenderHost(1240);try{const n=patientReportBuildModel();vildaAppSetTrustedHtml(a,patientReportBuildHtml(n),"app:host"),document.body.appendChild(a),await patientReportWaitForStableLayout();const r=Array.from(a.querySelectorAll(".patient-report-page"));if(!r.length)throw new Error("Brak stron raportu do renderowania.");const o=[];for(let l=0;l<r.length;l+=1){const c=r[l],s=patientReportResolveRenderScale(c),p=await i(c,{scale:s,useCORS:!0,backgroundColor:"#ffffff",logging:!1,imageTimeout:0}),d=patientReportBuildPdfPageSpecFromCanvas(p,{orientation:"portrait",strategy:"patient",preferredFormat:PATIENT_REPORT_PDF_VISIT_PREFERRED_FORMAT});d&&o.push(d)}return{pages:o,filenameBase:patientReportSanitizeFilename(n.name||"pacjent")||patientReportResolveFilenameBase()}}finally{try{a.remove()}catch(n){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",n,{line:17637})}}}function patientReportGetPalczewskaPdfHelpers(){const e=typeof window<"u"?window:globalThis,t=function(i){try{if(typeof e<"u"&&e&&typeof e[i]=="function")return e[i]}catch(a){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",a,{line:17649})}try{if(i==="getPalczewskaChartPlan"&&typeof getPalczewskaChartPlan=="function")return getPalczewskaChartPlan;if(i==="buildPalczewskaInfantPageCanvas"&&typeof buildPalczewskaInfantPageCanvas=="function")return buildPalczewskaInfantPageCanvas;if(i==="buildPalczewskaExtendedCanvases"&&typeof buildPalczewskaExtendedCanvases=="function")return buildPalczewskaExtendedCanvases;if(i==="promptPalczewskaRangeSelection"&&typeof promptPalczewskaRangeSelection=="function")return promptPalczewskaRangeSelection}catch(a){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",a,{line:17655})}return null};return{getPlan:t("getPalczewskaChartPlan"),buildInfantCanvas:t("buildPalczewskaInfantPageCanvas"),buildExtendedCanvases:t("buildPalczewskaExtendedCanvases"),promptRangeSelection:t("promptPalczewskaRangeSelection")}}async function patientReportCollectCentileChartPdfPages(){const e=patientReportGetCentileChartSelectionState();if(!e.available)throw new Error(e.message||"Siatka centylowa nie jest obecnie dost\u0119pna.");const t=document.getElementById("age"),i=document.getElementById("ageMonths"),a=document.getElementById("weight"),n=document.getElementById("height"),r=document.getElementById("sex"),o=parseFloat(t?.value)||0,l=i&&parseFloat(i.value)||0,c=o+l/12,s=parseFloat(a?.value),p=parseFloat(n?.value),d=r&&r.value==="M"?"M":"F";if(!Number.isFinite(c)||!Number.isFinite(s)||!Number.isFinite(p))throw new Error("Wprowad\u017A poprawne dane liczbowe, aby wygenerowa\u0107 siatk\u0119 centylow\u0105.");const u=Math.round(c*12);if(u<0||u>216)throw new Error("Siatka centylowa dost\u0119pna jest dla wieku od 0 do 18 lat.");const w=String(e.source||"OLAF").toUpperCase();if(w==="PALCZEWSKA"){const h=patientReportGetPalczewskaPdfHelpers();if(!h.getPlan||!h.buildInfantCanvas||!h.buildExtendedCanvases)throw new Error("Generator siatki Palczewskiej nie jest obecnie dost\u0119pny.");const y=typeof window<"u"&&window.advancedGrowthData?window.advancedGrowthData:null,x=h.getPlan(u,y);let v=x&&x.mode?x.mode:"INFANT_ONLY";if(v==="CHOICE")if(h.promptRangeSelection){const S=await h.promptRangeSelection();if(!S){const R=new Error("Anulowano wyb\xF3r zakresu siatki Palczewskiej.");throw R.code="USER_CANCELLED",R}v=S}else v="INFANT_ONLY";const T=[];if((v==="INFANT_ONLY"||v==="BOTH_REQUIRED")&&T.push(h.buildInfantCanvas({sex:d,userAgeMonths:u,userWeight:s,userHeight:p})),(v==="EXTENDED_ONLY"||v==="BOTH_REQUIRED")&&T.push(...h.buildExtendedCanvases({sex:d,userAgeMonths:u,userWeight:s,userHeight:p})),!T.length)throw new Error("Nie uda\u0142o si\u0119 przygotowa\u0107 siatki Palczewskiej dla podanych danych.");return{pages:T.map(S=>patientReportBuildPdfPageSpecFromCanvas(S,{orientation:"portrait",format:"JPEG"})).filter(Boolean),filenameBase:patientReportResolveFilenameBase(),source:"PALCZEWSKA"}}const f=vildaRequireGlobalFunction("buildCentilePageCanvas","patient-report-centile-chart");if(!f)throw new Error("Generator siatki centylowej nie jest obecnie dost\u0119pny.");const g=typeof window<"u"&&typeof window.advancedGrowthData<"u"?window.advancedGrowthData:void 0,b=vildaRequireGlobalFunction("getEffectiveCentileGrowthDataState","patient-report-centile-chart",{silent:!0}),z=b?b():null;let k=!1;try{let R=function(j){const B=f({rangeMinX:j.minX,rangeMaxX:j.maxX,sex:d,userAgeMonths:u,userWeight:s,userHeight:p,headerTitle:d==="M"?"Siatka centylowa ch\u0142opcy":"Siatka centylowa dziewczynki",headerSubtitle:j.subtitle,footerText:j.footer,chartSource:j.chartSource}),P=patientReportBuildPdfPageSpecFromCanvas(B,{orientation:"portrait",format:"JPEG"});P&&S.push(P)};var m=R;z&&typeof window<"u"&&(window.advancedGrowthData=z,k=!0);const h=typeof window<"u"&&window.advancedGrowthData?window.advancedGrowthData:null,y=vildaRequireGlobalFunction("collectAllAgesMonths","patient-report-centile-chart",{silent:!0}),x=y?y(u,h):{minAll:u,maxAll:u},v=Number.isFinite(x.minAll)?x.minAll:u,T=Number.isFinite(x.maxAll)?x.maxAll:u,S=[];if(w==="WHO"?R({minX:0,maxX:35,subtitle:"Dane: WHO, wiek 0 - 3 lata",footer:"Dane do siatek: WHO (0\u2013<3 lata)",chartSource:"WHO"}):v<36&&T>36?(R({minX:0,maxX:35,subtitle:"Zakres: 0\u2013<3 lata",footer:"Dane do siatek: Palczewska & Nied\u017Awiecka (0\u2013<3 lata)",chartSource:"PALCZEWSKA"}),R({minX:36,maxX:216,subtitle:"Badanie OLAF (3\u201318 lat)",footer:"",chartSource:"OLAF"})):T<=35?R({minX:0,maxX:35,subtitle:"Zakres: 0\u2013<3 lata",footer:"Dane do siatek: Palczewska & Nied\u017Awiecka (0\u2013<3 lata)",chartSource:"PALCZEWSKA"}):R({minX:36,maxX:216,subtitle:"Badanie OLAF (3\u201318 lat)",footer:"",chartSource:"OLAF"}),!S.length)throw new Error("Nie uda\u0142o si\u0119 przygotowa\u0107 siatki centylowej.");return{pages:S,filenameBase:patientReportResolveFilenameBase(),source:w}}finally{if(k)if(typeof g>"u")try{delete window.advancedGrowthData}catch{window.advancedGrowthData=null}else window.advancedGrowthData=g}}async function patientReportCollectAdvancedGrowthPdfPages(){if(!patientReportHasAdvancedGrowthPdfAvailable())throw new Error("Raport wzrastania nie jest obecnie dost\u0119pny.");if(typeof window<"u"&&typeof window.vildaEnsurePdfLibraries=="function")try{await window.vildaEnsurePdfLibraries()}catch{}vildaEnsureGlobalDependencyContract("patient-report-advanced-growth",{silent:!0,showUi:!0,message:"Brakuje funkcji potrzebnych do raportu zaawansowanego wzrastania."});const e=vildaRequireGlobalFunction("advGrowthBuildReportRows","patient-report-advanced-growth",{silent:!0}),t=vildaRequireGlobalFunction("advGrowthBuildHtmlReportMarkup","patient-report-advanced-growth",{silent:!0});if(!e||!t)throw new Error("Generator raportu wzrastania nie jest obecnie dost\u0119pny.");const i=vildaRequireGlobalFunction("html2canvas","patient-report-advanced-growth",{silent:!0});if(!i)throw new Error("Brakuje biblioteki potrzebnej do przygotowania raportu wzrastania.");const a=e();if(!a||!Array.isArray(a.rows)||!a.rows.length||a.historicalCount<1)throw new Error("Brak historycznych punkt\xF3w pomiarowych do raportu wzrastania.");const n=document.createElement("div");n.style.position="fixed",n.style.left="-20000px",n.style.top="0",n.style.width="1120px",n.style.maxWidth="1120px",n.style.pointerEvents="none",n.style.opacity="1",n.style.zIndex="-1",vildaAppSetTrustedHtml(n,t(a),"app:host"),document.body.appendChild(n);try{await patientReportWaitForStableLayout();const r=n.querySelector(".adv-growth-pdf-html-root")||n,o=patientReportResolveRenderScale(r),l=await i(r,{scale:o,backgroundColor:"#ffffff",useCORS:!0,logging:!1}),/* ADV-REPORT-8: granice wierszy przeliczone na piksele plotna — bez nich krajacz tnie w polowie wiersza. */gt=r.getBoundingClientRect().top,sk=r.offsetHeight>0?l.height/r.offsetHeight:1,gr=Array.from(r.querySelectorAll("tr,li")).map(w=>(w.getBoundingClientRect().bottom-gt)*sk).filter(w=>isFinite(w)&&w>0);return{pages:patientReportSliceCanvasToPageSpecs(l,{orientation:"landscape",format:"PNG",boundaries:gr}),filenameBase:patientReportResolveFilenameBase()}}finally{try{n.remove()}catch(r){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",r,{line:17909})}}}function patientReportBuildSelectedPdfFilename(e,t,i){const a=t||"pacjent",n=Array.isArray(e)?e.slice():[],r=i||{};if(n.length===1){if(n[0]==="visit")return`Raport_po_wizycie_${a}.pdf`;if(n[0]==="diet")return`Raport_zalecen_dietetycznych_${a}.pdf`;if(n[0]==="growth")return`Raport_wzrastania_${a}.pdf`;if(n[0]==="centile"){const o=advHistorySourceLabel(r.centileSource||"")||"siatka_centylowa";return`Siatka_centylowa_${patientReportSanitizeFilename(o)||"siatka_centylowa"}_${a}.pdf`}}return`Pakiet_raportow_${a}.pdf`}/* ADV-REPORT-8 (zgloszenie wlasciciela 2026-09-13): raport wzrastania zamowiony z okna wyboru PDF powstawal tu jako ZDJECIE strony — tekstu nie dalo sie zaznaczyc ani wyszukac, a strony cieto po wysokosci arkusza. Karta wzrostowa sklada ten sam raport pdfMakiem, czyli prawdziwym tekstem, z powtarzanym naglowkiem tabeli, bez lamania wierszy i z numeracja stron. Gdy raport wzrastania jest JEDYNYM zaznaczonym elementem, bierzemy stamtad gotowy dokument. W pakiecie z innymi raportami zostaje wariant rastrowy, bo pakiet jest jednym plikiem skladanym z obrazow stron — ale tnie sie juz po granicach wierszy. */async function patientReportBuildAdvancedGrowthVectorPdf(){try{const e=typeof window<"u"&&window.VildaAdvancedGrowth?window.VildaAdvancedGrowth.advGrowthBuildPdfDocumentBlob:null;if(typeof e!="function")return null;const t=await e();return t&&t.blob?t:null}catch(e){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("vilda_patient_report.js",e,{context:"adv-growth-vector-pdf"});return null}}async function patientReportBuildSelectedPdfPackage(e){/* ADV-REPORT-10 (decyzja wlasciciela 2026-09-13): raport wzrastania wychodzi ZAWSZE jako dokument tekstowy, takze gdy zaznaczono go razem z innymi raportami. Pakiet jest jednym plikiem skladanym z obrazow stron i tekstu nie da sie w niego wstawic bez sklejania dwoch PDF-ow w przegladarce — wiec zamiast degradowac raport do zdjecia, oddajemy DWA pliki: pakiet z pozostalymi raportami i osobny, wyszukiwalny raport wzrastania. Gdy pdfMake nie wstanie, raport zostaje w pakiecie w wariancie rastrowym, tak jak dotad. */const wy=patientReportGetPdfChoiceOptions().map(w=>w.value).filter(w=>Array.isArray(e)&&e.includes(w)),wv=wy.indexOf("growth")>=0?await patientReportBuildAdvancedGrowthVectorPdf():null;if(wv&&wy.length===1)return{blob:wv.blob,filename:wv.filename||patientReportBuildSelectedPdfFilename(wy,patientReportResolveFilenameBase(),{}),vector:!0};if(typeof window<"u"&&typeof window.vildaEnsurePdfLibraries=="function")try{await window.vildaEnsurePdfLibraries()}catch{}vildaEnsureGlobalDependencyContract("patient-report-selected-pdf",{silent:!0,showUi:!0,message:"Brakuje biblioteki jsPDF potrzebnej do wygenerowania wybranych stron raportu."});const t=vildaRequireGlobalFunction("jspdf.jsPDF","patient-report-selected-pdf");if(!t)throw new Error("Brakuje biblioteki jsPDF potrzebnej do wygenerowania pliku PDF.");const n=wy.filter(w=>!(wv&&w==="growth"));if(!n.length)throw new Error("Wybierz co najmniej jedn\u0105 cz\u0119\u015B\u0107 raportu PDF.");const r=[];let o=patientReportResolveFilenameBase(),l="";for(const w of n){if(w==="visit"){const f=await patientReportCollectVisitPdfPages();f&&Array.isArray(f.pages)&&r.push(...f.pages),f&&f.filenameBase&&(o=f.filenameBase);continue}if(w==="diet"){if(!(typeof window<"u"&&typeof window.dietRecommendationsCollectPdfPages=="function"))throw new Error("Generator raportu zalece\u0144 dietetycznych nie jest obecnie dost\u0119pny.");const f=await window.dietRecommendationsCollectPdfPages({mode:"classic"});f&&Array.isArray(f.pages)&&r.push(...f.pages),f&&f.filenameBase&&(o=f.filenameBase);continue}if(w==="centile"){const f=await patientReportCollectCentileChartPdfPages();f&&Array.isArray(f.pages)&&r.push(...f.pages),f&&f.filenameBase&&(o=f.filenameBase),f&&f.source&&(l=f.source);continue}if(w==="growth"){const f=await patientReportCollectAdvancedGrowthPdfPages();f&&Array.isArray(f.pages)&&r.push(...f.pages),f&&f.filenameBase&&(o=f.filenameBase)}}const c=r.filter(w=>w&&w.dataUrl);if(!c.length)throw new Error("Nie uda\u0142o si\u0119 przygotowa\u0107 wybranego raportu PDF.");const s=c[0],p=patientReportGetPdfChoiceOptionMeta(n[0]),d=n.length>1?"Pakiet raport\xF3w PDF":p&&p.title?p.title:"Raport PDF",u=new t({orientation:s.orientation,unit:"mm",format:"a4",compress:!0,putOnlyUsedFonts:!0});return u.setProperties({title:d,subject:d,author:"wagaiwzrost.pl"}),c.forEach((w,f)=>{const g=w.orientation==="landscape"?"landscape":"portrait";f>0&&u.addPage("a4",g);const b=PATIENT_REPORT_PDF_IMAGE_COMPRESSION;u.addImage(w.dataUrl,w.format,0,0,Number.isFinite(w.widthMm)?w.widthMm:g==="landscape"?297:210,Number.isFinite(w.heightMm)?w.heightMm:g==="landscape"?210:297,void 0,b)}),{blob:u.output("blob"),filename:patientReportBuildSelectedPdfFilename(n,o,{centileSource:l}),dodatkowe:wv?[{blob:wv.blob,filename:wv.filename||`Raport_wzrastania_${o}.pdf`,vector:!0}]:[]}}async function generatePatientSelectedPdfPackage(e,t){try{await patientReportRunExternalPdfTask(e,async()=>{const i=await patientReportBuildSelectedPdfPackage(t);if(!i||!(i.blob instanceof Blob))throw new Error("Nie uda\u0142o si\u0119 przygotowa\u0107 pliku PDF.");/* ADV-REPORT-10: raport wzrastania idzie osobnym, tekstowym plikiem, wiec pobran moze byc dwa; rata J: na iOS oba pliki w jednym arkuszu udostepniania. */const dod=Array.isArray(i.dodatkowe)?i.dodatkowe.filter(w=>w&&w.blob instanceof Blob):[];const w0=await patientReportDeliverFiles([{blob:i.blob,filename:i.filename}].concat(dod.map(w=>({blob:w.blob,filename:w.filename}))));patientReportShowToast(patientReportToastPoZapisie(w0,dod.length?"Wygenerowano dwa pliki: pakiet PDF oraz raport wzrastania z zaznaczalnym tekstem.":Array.isArray(t)&&t.length>1?"Pakiet PDF zosta\u0142 wygenerowany.":"Raport PDF zosta\u0142 wygenerowany."))},"Przygotowywanie PDF\u2026")}catch(i){if(i&&i.code==="USER_CANCELLED")return;console.error("B\u0142\u0105d generowania wybranego raportu PDF dla pacjenta:",i),i&&i.vildaDependencyError||patientReportShowToast(i&&i.message?i.message:"Nie uda\u0142o si\u0119 wygenerowa\u0107 raportu PDF. Spr\xF3buj ponownie.")}}function patientReportRemovePdfChoiceDialog(){try{const e=document.getElementById("patientReportPdfChoiceBackdrop");if(!e)return;document.body&&typeof e.dataset.prevBodyOverflow=="string"&&(document.body.style.overflow=e.dataset.prevBodyOverflow),document.documentElement&&typeof e.dataset.prevHtmlOverflow=="string"&&(document.documentElement.style.overflow=e.dataset.prevHtmlOverflow),e.remove()}catch(e){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",e,{line:18058})}}function patientReportRefreshPdfChoiceSelection(e){if(!e)return;const t=e.querySelectorAll(".patient-report-pdf-choice");let i=0;t.forEach(n=>{const r=n.querySelector('input[type="checkbox"]'),o=!!(r&&r.checked);o&&(i+=1),n.classList.toggle("is-selected",o),r&&r.setAttribute("aria-checked",o?"true":"false")});const a=e.querySelector("[data-patient-report-pdf-choice-confirm]");a&&(a.disabled=i===0)}function patientReportEnsurePdfChoiceDialogStyles(){if(typeof document>"u"||document.getElementById("patientReportPdfChoiceStyles"))return;const e=document.createElement("style");e.id="patientReportPdfChoiceStyles",e.textContent=`
    #patientReportPdfChoiceBackdrop.patient-report-pdf-choice-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10020;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      background: rgba(7, 26, 28, 0.45);
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }
    .patient-report-pdf-choice-dialog {
      width: min(100%, 500px);
      max-height: calc(100vh - 32px);
      max-height: min(calc(100dvh - 32px), 700px);
      display: flex;
      flex-direction: column;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 26px 72px rgba(10, 43, 47, 0.22);
      overflow: hidden;
      box-sizing: border-box;
      margin: auto;
    }
    .patient-report-pdf-choice-header-copy {
      min-width: 0;
      flex: 1 1 auto;
    }
    .patient-report-pdf-choice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding: 18px 20px 0;
    }
    .patient-report-pdf-choice-title {
      margin: 0;
      font-size: 1.08rem;
      line-height: 1.25;
      color: #123132;
    }
    .patient-report-pdf-choice-description {
      margin: .4rem 0 0;
      color: #476162;
      line-height: 1.42;
      font-size: .92rem;
    }
    .patient-report-pdf-choice-close {
      border: none;
      background: transparent;
      color: #577576;
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      width: 40px;
      height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      flex: 0 0 auto;
    }
    .patient-report-pdf-choice-close:hover,
    .patient-report-pdf-choice-close:focus-visible {
      background: #eff6f6;
      outline: none;
    }
    .patient-report-pdf-choice-body {
      min-height: 0;
      overflow-y: auto;
      padding: 12px 20px 0;
      -webkit-overflow-scrolling: touch;
    }
    .patient-report-pdf-choice-form {
      display: grid;
      gap: 0;
    }
    .patient-report-pdf-choice {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      column-gap: 12px;
      padding: 12px 2px;
      margin: 0;
      cursor: pointer;
      background: transparent;
      border: none;
      border-radius: 0;
      box-sizing: border-box;
      min-width: 0;
    }
    .patient-report-pdf-choice + .patient-report-pdf-choice {
      border-top: 1px solid #edf3f3;
    }
    .patient-report-pdf-choice:focus-within {
      outline: 2px solid rgba(15, 125, 134, 0.16);
      outline-offset: 2px;
      border-radius: 10px;
    }
    .patient-report-pdf-choice-copy {
      display: grid;
      gap: .22rem;
      min-width: 0;
    }
    .patient-report-pdf-choice-option-title {
      font-weight: 700;
      color: #123132;
      line-height: 1.3;
      font-size: .98rem;
    }
    .patient-report-pdf-choice.is-selected .patient-report-pdf-choice-option-title {
      color: #0f6b73;
    }
    .patient-report-pdf-choice-option-description {
      color: #5a7273;
      font-size: .9rem;
      line-height: 1.4;
    }
    .patient-report-pdf-choice-toggle-wrap {
      display: flex;
      align-items: flex-start;
      justify-content: flex-end;
      padding-top: 1px;
    }
    .patient-report-pdf-choice-toggle.switch-diet {
      margin: 0;
    }
    .patient-report-pdf-choice-toggle input {
      display: block !important;
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      opacity: 0 !important;
      margin: 0 !important;
      cursor: pointer;
    }
    .patient-report-pdf-choice-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      flex-wrap: wrap;
      padding: 16px 20px 18px;
      border-top: 1px solid #eef4f4;
      margin-top: 14px;
    }
    .patient-report-pdf-choice-cancel,
    .patient-report-pdf-choice-confirm {
      border-radius: 10px;
      padding: .76rem 1.05rem;
      font-weight: 700;
      cursor: pointer;
      min-height: 46px;
      box-sizing: border-box;
    }
    .patient-report-pdf-choice-cancel {
      border: 1px solid #d3dfdf;
      background: #ffffff;
      color: #2a4748;
      font-weight: 600;
    }
    .patient-report-pdf-choice-confirm {
      border: none;
      background: #00838d;
      color: #ffffff;
      box-shadow: 0 12px 24px rgba(0,131,141,0.18);
    }
    .patient-report-pdf-choice-confirm:disabled {
      cursor: not-allowed;
      background: #9bbdbe;
      box-shadow: none;
    }
    @media (max-width: 640px) {
      #patientReportPdfChoiceBackdrop.patient-report-pdf-choice-backdrop {
        align-items: flex-start;
        padding: 10px;
      }
      .patient-report-pdf-choice-dialog {
        width: 100%;
        max-width: 100%;
        max-height: calc(100vh - 20px);
        max-height: calc(100dvh - 20px);
        border-radius: 14px;
      }
      .patient-report-pdf-choice-header {
        gap: 10px;
        padding: 14px 14px 0;
      }
      .patient-report-pdf-choice-title {
        font-size: 1rem;
      }
      .patient-report-pdf-choice-description {
        font-size: .87rem;
        line-height: 1.38;
      }
      .patient-report-pdf-choice-body {
        padding: 10px 14px 0;
      }
      .patient-report-pdf-choice {
        grid-template-columns: minmax(0, 1fr) auto;
        column-gap: 10px;
        padding: 10px 0;
      }
      .patient-report-pdf-choice-option-title {
        font-size: .95rem;
      }
      .patient-report-pdf-choice-option-description {
        font-size: .84rem;
        line-height: 1.35;
      }
      .patient-report-pdf-choice-footer {
        display: grid;
        grid-template-columns: 1fr 1fr;
        padding: 14px;
        gap: 10px;
      }
      .patient-report-pdf-choice-cancel,
      .patient-report-pdf-choice-confirm {
        width: 100%;
        padding: .74rem .9rem;
      }
    }
    @media (max-width: 400px) {
      .patient-report-pdf-choice-footer {
        grid-template-columns: 1fr;
      }
    }
  `,document.head.appendChild(e)}function patientReportOpenPdfChoiceDialog(e){if(__patientReportPdfInFlight)return;const t=patientReportGetPdfChoiceOptions();if(!t.length){patientReportShowToast("Brak dost\u0119pnych raport\xF3w PDF do wygenerowania.");return}patientReportRemovePdfChoiceDialog(),patientReportEnsurePdfChoiceDialogStyles();const i=document.createElement("div");i.id="patientReportPdfChoiceBackdrop",i.className="patient-report-pdf-choice-backdrop";const a=document.createElement("div");a.className="patient-report-pdf-choice-dialog",a.setAttribute("role","dialog"),a.setAttribute("aria-modal","true"),a.setAttribute("aria-labelledby","patientReportPdfChoiceTitle"),vildaAppSetTrustedHtml(a,`
    <div class="patient-report-pdf-choice-header">
      <div class="patient-report-pdf-choice-header-copy">
        <h3 id="patientReportPdfChoiceTitle" class="patient-report-pdf-choice-title">Wybierz cz\u0119\u015Bci raportu PDF</h3>
        <p class="patient-report-pdf-choice-description">W\u0142\u0105cz jedn\u0105 lub kilka cz\u0119\u015Bci, kt\xF3re maj\u0105 znale\u017A\u0107 si\u0119 w jednym pliku PDF. Kolejno\u015B\u0107 stron pozostanie sta\u0142a: raport po wizycie, raport zalece\u0144 dietetycznych, siatka centylowa, raport wzrastania.</p>
      </div>
      <button type="button" data-patient-report-pdf-choice-close aria-label="Zamknij" class="patient-report-pdf-choice-close">\xD7</button>
    </div>
    <div class="patient-report-pdf-choice-body">
      <form id="patientReportPdfChoiceForm" class="patient-report-pdf-choice-form" role="group" aria-labelledby="patientReportPdfChoiceTitle">
        ${t.map(s=>`
          <label class="patient-report-pdf-choice${s.checkedByDefault?" is-selected":""}">
            <span class="patient-report-pdf-choice-copy">
              <span class="patient-report-pdf-choice-option-title">${patientReportEscapeHtml(s.title)}</span>
              <span class="patient-report-pdf-choice-option-description">${patientReportEscapeHtml(s.description)}</span>
            </span>
            <span class="patient-report-pdf-choice-toggle-wrap">
              <span class="switch-diet patient-report-pdf-choice-toggle">
                <input type="checkbox" name="patientReportPdfChoice" value="${patientReportEscapeHtml(s.value)}" ${s.checkedByDefault?"checked":""} />
                <span class="slider"></span>
              </span>
            </span>
          </label>
        `).join("")}
      </form>
    </div>
    <div class="patient-report-pdf-choice-footer">
      <button type="button" data-patient-report-pdf-choice-cancel class="patient-report-pdf-choice-cancel">Anuluj</button>
      <button type="button" data-patient-report-pdf-choice-confirm class="patient-report-pdf-choice-confirm">Generuj PDF</button>
    </div>
  `,"app:dialog");const n=document.body?document.body.style.overflow:"",r=document.documentElement?document.documentElement.style.overflow:"";i.dataset.prevBodyOverflow=n,i.dataset.prevHtmlOverflow=r,document.body&&(document.body.style.overflow="hidden"),document.documentElement&&(document.documentElement.style.overflow="hidden");const o=()=>{try{document.removeEventListener("keydown",l)}catch(s){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",s,{line:18381})}document.body&&(document.body.style.overflow=n),document.documentElement&&(document.documentElement.style.overflow=r),patientReportRemovePdfChoiceDialog()},l=s=>{s.key==="Escape"&&o()},c=async()=>{const s=Array.from(a.querySelectorAll('input[name="patientReportPdfChoice"]:checked')).map(d=>d.value),p=t.map(d=>d.value).filter(d=>s.includes(d));if(!p.length){patientReportShowToast("Wybierz co najmniej jedn\u0105 cz\u0119\u015B\u0107 raportu PDF."),patientReportRefreshPdfChoiceSelection(i);return}o(),await generatePatientSelectedPdfPackage(e,p)};i.addEventListener("click",s=>{s.target===i&&o()}),a.querySelector("[data-patient-report-pdf-choice-close]")?.addEventListener("click",o),a.querySelector("[data-patient-report-pdf-choice-cancel]")?.addEventListener("click",o),a.querySelector("[data-patient-report-pdf-choice-confirm]")?.addEventListener("click",()=>{c()}),a.querySelectorAll('input[name="patientReportPdfChoice"]').forEach(s=>{s.addEventListener("change",()=>patientReportRefreshPdfChoiceSelection(i))}),i.appendChild(a),document.body.appendChild(i),document.addEventListener("keydown",l),patientReportRefreshPdfChoiceSelection(i),requestAnimationFrame(()=>{try{a.querySelector('input[name="patientReportPdfChoice"]:checked')?.focus({preventScroll:!0})}catch(s){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("app.js",s,{line:18424})}})}/* ===================================================================================================
   P-RAPORT rata Q (decyzje właściciela 2026-09-22) — „Raport po wizycie”.

   1. Karta „Zapotrzebowanie energetyczne” (wariant A). Dawna karta „Normy żywieniowe” pokazywała
      TEE liczone z MASY AKTUALNEJ przy PAL z karty norm (domyślnie 1,6), a nazywała to „Normą”.
      U pacjenta z otyłością wychodziła energia, która tę otyłość utrzymuje (dziewczynka 9 lat,
      52,6 kg: 2412 kcal „normy” obok 1800 kcal planu na sąsiedniej kartce). Teraz raport cytuje
      te same liczby, które czyta plan żywieniowy: `dane.energia` z generatora zaleceń (PAL z
      formularza), a energię „dla masy prawidłowej” liczy tą samą funkcją produkcyjną
      (`energyBuildPlanReductionState`) dla masy docelowej z generatora. Wiersz „przy obecnej
      masie” pojawia się WYŁĄCZNIE przy BMI w normie. Białko: RDA g/kg z silnika norm × masa
      referencyjna; węglowodany i tłuszcze tylko jako udział energii.
   2. Odniesienia masy: dziecko — masa dla mediany BMI przy WZROŚCIE dziecka (nie mediana masy dla
      wieku, która u dziecka na 94. centylu wzrostu zaniżała „przeciętną”); dorosły — jedna granica
      normy (BMI 24,9; przy niedowadze 18,5) plus pierwszy krok z drabinki celów (VildaBmi), bez
      „idealnej” masy przy BMI 22 i bez średnich populacyjnych.
   3. Pierwszy krok w nagłówku (dziecko i dorosły z nadmiarem masy) — z tej samej drabinki, którą
      czyta plan PDF (vilda_raport_plan.js, sekcjaDroga) i zdanie A generatora.
   4. Data pomiaru na czipie: z wczytanego rekordu sejfu (`lastLoadedData.user.measuredAtISO`),
      jeśli formularza nie zmieniono po wczytaniu; inaczej dzień generowania.
   =================================================================================================== */
/* ---- P-RAPORT rata R: fakty do naglowka (vilda_raport_naglowek.js) ----
   Zbieracz czyta klasyfikatory produkcyjne (silnik BMI, VildaMasa, bpModuleApi, adultVitalsApi, interpretWHR,
   obwody, VildaTempoWzrastania, MPH), NIE tekst linii podsumowania. Dorosly od 18 lat (decyzja 4) — jak silnik BMI. */
function patientReportZbierzFaktyNaglowka(s){const b=patientReportGetCurrentBasics(),wiek=Number(b.ageYears),dorosly=isFinite(wiek)&&wiek>=18,r=patientReportGetPreferredSource(),cards=s&&Array.isArray(s.cards)?s.cards:[],WT=cards.find(c=>c&&c.key==="WT")||null,HT=cards.find(c=>c&&c.key==="HT")||null,f={dorosly,wiekLat:isFinite(wiek)?wiek:null,plec:b.sex,historia:!!(s&&Number(s.historyCount)>0)},L=v=>{const n=Number(v);return v==null||v===""||!isFinite(n)?null:n},pole=id=>L(typeof document<"u"?document.getElementById(id)?.value:null);try{if(L(b.weight)!=null){let kolor=null;const cM=dorosly?null:L(WT&&WT.percentile);if(cM!=null&&typeof window<"u"&&window.VildaMasa&&typeof window.VildaMasa.kategoria=="function"){const km=window.VildaMasa.kategoria(cM);kolor=km&&km.klucz!=="brak"?km.kolor||null:null}f.masa={kg:b.weight,centyl:cM,kolor}}}catch{}try{if(typeof b.bmi=="number"&&isFinite(b.bmi)){if(dorosly){const a=patientReportGetAdultBmiAssessment(b.bmi);f.bmi={wartosc:b.bmi,centyl:null,klucz:a.state,etykieta:a.badge,kolor:a.tone==="danger"?"alert":a.tone==="warn"?"improve":"ok"};const d=patientReportGetAdultBmiWeightDelta(b.weight,b.height);d&&(f.granice={dolKg:d.lowerWeight,goraKg:d.upperWeight})}else{const T=patientReportBmiSilnik(),o=T?T.ocen({bmi:b.bmi,plec:b.sex,wiekMies:wiek*12,zrodlo:r}):null;o&&o.kategoria&&o.kategoria.klucz!=="brak"&&(f.bmi={wartosc:b.bmi,centyl:L(o.centyl),klucz:o.kategoria.klucz,etykieta:o.kategoria.etykieta,kolor:o.kategoria.kolor||null});const cv=typeof window<"u"?window.colePercentValue:null;if(typeof cv=="number"&&isFinite(cv)&&T&&typeof T.kategoriaCole=="function"){const kc=T.kategoriaCole(cv);kc&&kc.klucz&&(f.cole={proc:cv,klucz:kc.klucz,kolor:kc.kolor||null})}}}}catch{}try{if(L(b.weight)!=null&&L(b.height)!=null){const DR=patientReportDrabinka({wzrostCm:b.height,masaKg:b.weight,plec:b.sex,wiekMies:wiek*12,zrodlo:r,dorosly}),K=patientReportPierwszyKrok(DR,b.weight);K&&(f.krok=K),DR&&DR.kierunek==="przyrost"&&DR.cel&&L(DR.cel.masa)!=null&&(f.celPrzyrost={masaKg:DR.cel.masa,roznicaKg:DR.cel.masa-b.weight})}}catch{}try{!dorosly&&HT&&L(HT.percentile)!=null&&(f.wzrost={cm:b.height,centyl:HT.percentile})}catch{}try{if(dorosly){const A=typeof window<"u"?window.adultVitalsApi:null;if(A&&typeof A.getState=="function"&&typeof A.classifyBloodPressure=="function"){const st=A.getState(),cl=A.classifyBloodPressure(st.sbp,st.dbp,st.guidelineKey);cl&&cl.key&&["elevated","stage1","stage2","hypertension","severe","low"].includes(cl.key)&&(f.cisnienie={dziecko:!1,sk:st.sbp,roz:st.dbp,klucz:cl.key,ton:cl.tone,wytyczne:st.guidelineKey||null});if(typeof A.classifyHeartRate=="function"){const hr=A.classifyHeartRate(st.hr,{athlete:st.athlete,betaBlocker:st.betaBlocker});hr&&hr.key&&["high","low","low-context-warn"].includes(hr.key)&&(f.tetno={naMin:st.hr,klucz:hr.key,ton:hr.tone,kontekst:hr.key==="low-context-warn"?st.athlete&&st.betaBlocker?"stosowaniu beta‑blokera i regularnym uprawianiu sportu":st.betaBlocker?"stosowaniu beta‑blokera":"regularnym uprawianiu sportu":null})}}}else{const sbp=pole("bpSystolic"),dbp=pole("bpDiastolic"),V=patientReportBuildVitalsCard(),items=V&&Array.isArray(V.items)?V.items.filter(x=>x&&!x.unavailable):[],iS=items.find(x=>x.kind==="sbp"),iD=items.find(x=>x.kind==="dbp"),iH=items.find(x=>x.kind==="hr");if(sbp!=null&&dbp!=null&&isFinite(wiek)&&wiek<3)f.cisnieniePonizej3Lat=!0;else if(sbp!=null&&dbp!=null&&(iS||iD)){const wys=[iS,iD].some(x=>x&&x.state==="high"&&x.tone==="danger"),pod=[iS,iD].some(x=>x&&x.state==="high"),nis=[iS,iD].some(x=>x&&x.state==="low");let c=null;try{c=typeof window<"u"&&window.bpModuleApi&&typeof window.bpModuleApi.computePediatricBp=="function"?window.bpModuleApi.computePediatricBp({ageYears:patientReportGetReferenceAgeYears(wiek),sex:b.sex,heightCm:b.height,sbp,dbp}):null}catch{c=null}const klasa=wys?"wysokie":pod?"podwyzszone":nis?"niskie":null;klasa&&(f.cisnienie={dziecko:!0,sk:sbp,roz:dbp,centylSk:c&&c.ok?L(c.percSbp):null,centylRoz:c&&c.ok?L(c.percDbp):null,klasa,ton:wys?"danger":"warn"})}iH&&(iH.state==="high"||iH.state==="low")&&pole("heartRate")!=null&&(f.tetno={naMin:pole("heartRate"),klucz:iH.state,ton:iH.tone})}}catch{}try{const waist=pole("waistCm"),hip=pole("hipCm");if(waist!=null&&hip!=null&&typeof interpretWHR=="function"){const w=interpretWHR(wiek,b.sex,waist,hip,typeof b.bmi=="number"?b.bmi:null,typeof window<"u"&&typeof window.bmiPercentileValue=="number"?window.bmiPercentileValue:null,typeof window<"u"&&typeof window.coleCatValue=="string"?window.coleCatValue:null);w&&(w.state==="bad"||w.state==="warn")&&(f.talia={cm:waist,whr:L(w.whr),stan:w.state,centyl:L(w.waistP),dorosly:wiek>=18})}}catch{}try{const hc=pole("headCircumference"),hp=typeof window<"u"?window.headCircPercentile:null;!dorosly&&hc!=null&&typeof hp=="number"&&isFinite(hp)&&(f.glowa={cm:hc,centyl:hp});const cc=pole("chestCircumference"),cp=typeof window<"u"?window.chestCircPercentile:null;!dorosly&&cc!=null&&typeof cp=="number"&&isFinite(cp)&&(f.klatka={cm:cc,centyl:cp})}catch{}try{const AG=typeof window<"u"?window.advancedGrowthData:null,TW=typeof window<"u"?window.VildaTempoWzrastania:null;if(!dorosly&&AG&&AG.tempo&&L(AG.tempo.cmPerYear)!=null&&TW&&typeof TW.formatuj=="function"){const fo=TW.formatuj(AG.tempo);fo&&fo.ocena&&(fo.ocena.cls==="bad"||fo.ocena.cls==="warn")&&(f.tempo={cmRok:AG.tempo.cmPerYear,ton:fo.ocena.cls==="bad"?"danger":"warn",norma:AG.tempo.normLabel||null})}const pro=typeof professionalMode<"u"?!!professionalMode:typeof window<"u"&&!!window.professionalMode;/* Rata T (2026-09-23): MPH w naglowku niezaleznie od trybu (liczba SDS tylko w trybie profesjonalnym); hSDS z tego samego wyniku, co karta wzrostu raportu (advHistoryResolveMetric, zrodlo raportu), mpSDS z vildaMpSdsStats na tym samym zrodle - nigdy z targetStats karty (moze byc policzone na siatce sprzed przelaczenia). Populacja DS: mpSDS nie istnieje (P-OSTATNI-2d). */if(!dorosly){let ds=!1;try{ds=typeof vildaPopulacjaDs=="function"&&!!vildaPopulacjaDs()}catch{ds=!1}ds&&(f.ds=!0);const mphCm=AG?L(AG.targetHeight):null;if(mphCm==null)f.rodziceBrak=!0;else if(!ds&&typeof vildaMpSdsStats=="function"&&typeof advHistoryResolveMetric=="function"&&L(b.height)!=null){const mp=vildaMpSdsStats(mphCm,b.sex,r||null),hr=advHistoryResolveMetric("HT",b.height,b.sex,patientReportGetReferenceAgeYears(wiek),r),hs=hr&&hr.result?L(hr.result.sd):null;mp&&L(mp.sd)!=null&&hs!=null&&(f.mph={roznicaSds:hs-mp.sd,mphCm,mphCentyl:L(mp.percentile),mpSds:mp.sd,hSds:hs,liczbaWidoczna:pro})}}}catch{}/* Rata T2 (2026-09-23): fakt o przesunieciu pozycji wzrostu w gore siatki - liczony TERAZ, na punktach karty (z ageYears) i zrodle raportu, nie z modelu karty; tylko gdy ostatni punkt serii wzrostu to dzisiejszy pomiar. */try{const TA=typeof window<"u"?window.VildaTrajectoryAnalysis:null;if(!dorosly&&TA&&typeof TA.analyze=="function"&&typeof advGrowthCollectAllPointsForReport=="function"&&L(b.height)!=null&&isFinite(wiek)){const pts=advGrowthCollectAllPointsForReport()||[],hist=pts.filter(p=>p&&p.pointType!=="current"&&L(p.ageMonths)!=null).map(p=>({ageMonths:p.ageMonths,ageYears:L(p.ageYears),height:L(p.height),weight:L(p.weight)})),wm=Math.round(wiek*12);if(hist.length){const md=TA.analyze({measurements:hist,currentAgeMonths:wm,currentAgeYears:wiek,currentHeight:b.height,currentWeight:L(b.weight),sex:b.sex,source:r||null}),uf=typeof TA.heightUpFlagOf=="function"?TA.heightUpFlagOf(md):null;uf&&uf.lastAgeMonths===wm&&(f.pozycja={dSds:uf.dSds,odWiekuMies:uf.baseAgeMonths,zCentyla:L(uf.baseC),naCentyl:L(uf.lastC),liczbaWidoczna:typeof professionalMode<"u"?!!professionalMode:typeof window<"u"&&!!window.professionalMode});/* Rata T3 (2026-09-24): fakt o obnizeniu pozycji wzrostu - flaga w dol silnika (baza >= 36 mies., ta sama siatka), tylko gdy ostatni punkt to dzisiejszy pomiar; odstep i bramki (cel rodzicow, wiek) ocenia naglowek. */const rf=typeof TA.heightRedFlagOf=="function"?TA.heightRedFlagOf(md):null;rf&&rf.lastAgeMonths===wm&&(f.spadek={dSds:rf.dSds,odWiekuMies:rf.baseAgeMonths,naWiekMies:rf.lastAgeMonths,zCentyla:L(rf.baseC),naCentyl:L(rf.lastC),hSdsBazy:L(rf.baseSd),hSdsDzis:L(rf.lastSd),liczbaWidoczna:typeof professionalMode<"u"?!!professionalMode:typeof window<"u"&&!!window.professionalMode})}}}catch{}return f}
function patientReportBuildNaglowek(s,d,p,a){const NG=typeof window<"u"?window.VildaRaportNaglowek:null;if(NG&&typeof NG.zbuduj=="function")try{const u=NG.zbuduj(patientReportZbierzFaktyNaglowka(s));if(u&&u.title)return u}catch{}const u=patientReportBuildHeadline(s.cards,s.historyCount,d,p);return a?patientReportAdaptHeadlineForAdultReference(u):u}
const PATIENT_REPORT_PAL_OPISY={"1.2":"bardzo mała aktywność","1.4":"mała aktywność","1.6":"umiarkowana aktywność","1.8":"aktywny tryb życia","2":"bardzo aktywny tryb życia"};
function patientReportPalLabel(pal){const p=Number(pal);if(!isFinite(p)||p<=0)return"";const opis=PATIENT_REPORT_PAL_OPISY[String(p)]||"";return"PAL "+patientReportFormatNumber(p,1)+(opis?" ("+opis+")":"")}
function patientReportDrabinka(opts){const B=typeof window<"u"?window.VildaBmi:null;if(!B||typeof B.drabinkaCelow!="function")return null;try{return B.drabinkaCelow(opts)}catch{return null}}
/* Ten sam wybór kroku co w planie PDF (sekcjaDroga): pierwszy szczebel drabinki, a gdy szczebli nie ma — cel końcowy. */
function patientReportPierwszyKrok(drab,masaKg){if(!drab||drab.kierunek!=="redukcja"||!drab.cel)return null;const pierwszy=drab.szczeble&&drab.szczeble.length?drab.szczeble[0]:drab.cel,m=Number(masaKg),pm=Number(pierwszy&&pierwszy.masa);if(!isFinite(m)||!isFinite(pm)||!(m-pm>0))return null;const jestSzczebel=!!(drab.szczeble&&drab.szczeble.length),reinehr=pierwszy.klucz==="reinehr"||pierwszy.klucz==="wing"/* rata Z2: -5 % masy u doroslego to ten sam prog poprawy */;return{masaKg:pm,roznicaKg:m-pm,bmi:isFinite(Number(pierwszy.bmi))?Number(pierwszy.bmi):null,klucz:pierwszy.klucz||null,opis:reinehr?"":String(pierwszy.opis||pierwszy.etykieta||""),jestSzczebel,/* korzysc zdrowotna: u dziecka tylko prog Reinehra (−0,5 BMI-SDS), u doroslego kazdy szczebel — jak zdanie A generatora (rata O) */korzysc:jestSzczebel&&(!!drab.dorosly||reinehr),/* rata Z2 (decyzja wlasciciela 2026-09-24): u doroslego, gdy pierwszy jest prog BMI, a prog -5 % masy (Wing 2011) wypada dalej, korzysc przypisana progowi -5 % */wingKg:(()=>{if(!drab.dorosly||reinehr||!jestSzczebel)return null;const w0=drab.szczeble.find(q0=>q0&&q0.klucz==="wing");return w0&&isFinite(Number(w0.masa))?Number(w0.masa):null})()}}
const PATIENT_REPORT_KORZYSC_KROKU="już ta zmiana poprawia ciśnienie i wyniki badań krwi";
function patientReportZdaniePierwszegoKroku(krok){if(!krok)return"";const masa=patientReportFormatNumber(krok.masaKg,1)+" kg",roz=patientReportFormatNumber(krok.roznicaKg,1)+" kg",nawias=krok.opis?" ("+krok.opis+")":"";return krok.jestSzczebel?`Pierwszy krok to ok. ${masa}${nawias}, czyli około ${roz} mniej`+(krok.wingKg!=null?`; już ok. 5 % masy (ok. ${patientReportFormatNumber(krok.wingKg,1)} kg) poprawia ciśnienie i wyniki badań krwi.`:krok.korzysc?`; ${PATIENT_REPORT_KORZYSC_KROKU}.`:"."):`Cel to ok. ${masa}${nawias}, czyli około ${roz} mniej.`}
function patientReportZdanieKrokuZFormularza(){try{const b=patientReportGetCurrentBasics();if(!b||!(b.weight>0)||!(b.height>0))return"";const DR=patientReportDrabinka({wzrostCm:b.height,masaKg:b.weight,plec:b.sex,wiekMies:b.ageYears*12,zrodlo:patientReportGetPreferredSource(),dorosly:b.isAdult});return patientReportZdaniePierwszegoKroku(patientReportPierwszyKrok(DR,b.weight))}catch{return""}}
/* Drugie pole odniesienia na karcie masy: przy redukcji — pierwszy krok, przy niedowadze — dolna granica normy. */
function patientReportKrokReference(drab,masaKg){if(!drab||!drab.cel)return null;const m=Number(masaKg);if(drab.kierunek==="redukcja"){const k=patientReportPierwszyKrok(drab,m);if(!k)return null;const nawias=k.opis?" ("+k.opis+")":"";return{available:!0,label:k.jestSzczebel?"Pierwszy krok":"Cel",medianText:"do "+patientReportFormatNumber(k.masaKg,1)+" kg",diffText:"czyli ok. "+patientReportFormatNumber(k.roznicaKg,1)+" kg mniej"+nawias+(k.wingKg!=null?"; już ok. 5 % masy (ok. "+patientReportFormatNumber(k.wingKg,1)+" kg) poprawia ciśnienie i wyniki badań krwi.":k.korzysc?"; "+PATIENT_REPORT_KORZYSC_KROKU+".":"."),neutral:!1}}if(drab.kierunek==="przyrost"){const cm=Number(drab.cel.masa);if(!isFinite(cm)||!isFinite(m)||!(cm-m>0))return null;return{available:!0,label:"Cel: dolna granica normy",medianText:"do "+patientReportFormatNumber(cm,1)+" kg",diffText:"czyli ok. "+patientReportFormatNumber(cm-m,1)+" kg więcej.",neutral:!1}}return null}
/* Dorosły: jedno odniesienie masy — granica normy, do której pacjent idzie (decyzja 2: bez BMI 22 i średnich populacyjnych; decyzja 3: przy niedowadze dolna granica 18,5). */
function patientReportAdultMassReference(masaKg,delta,ocena){if(!delta)return{available:!1,label:"Prawidłowa masa dla tego wzrostu",medianText:"Brak por\xF3wnania do masy prawidłowej.",diffText:"",neutral:!0};const stan=ocena&&ocena.state||delta.state,dol=stan==="underweight",cel=dol?delta.lowerWeight:delta.upperWeight,label=dol?"Prawidłowa masa dla tego wzrostu – dolna granica (BMI 18,5)":"Prawidłowa masa dla tego wzrostu – g\xF3rna granica (BMI 24,9)";return patientReportBuildMedianReference("Masa",masaKg,cel,{friendlyLabel:label,medianUnit:"kg",diffUnit:"kg",digits:1,exactText:"To dokładnie ta granica.",nearText:"To prawie dokładnie ta granica.",nearTolerance:PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.WEIGHT_KG,unavailableText:"Brak por\xF3wnania do masy prawidłowej."})}
function patientReportAdultHeightRangeReference(masaKg,delta){if(!delta)return{available:!1,label:"Zakres prawidłowej masy dla tego wzrostu",medianText:"Brak danych do wyznaczenia zakresu.",diffText:"",neutral:!0};const od=patientReportFormatNumber(delta.lowerWeight,1),doM=patientReportFormatNumber(delta.upperWeight,1),m=Number(masaKg);let diff="",neutral=!0;if(isFinite(m)){if(delta.kgAboveUpper>.049)diff="Obecna masa jest o "+patientReportFormatNumber(delta.kgAboveUpper,1)+" kg powyżej tego zakresu.",neutral=!1;else if(delta.kgToLower>.049)diff="Obecna masa jest o "+patientReportFormatNumber(delta.kgToLower,1)+" kg poniżej tego zakresu.",neutral=!1;else diff="Obecna masa mieści się w tym zakresie."}return{available:!0,label:"Zakres prawidłowej masy dla tego wzrostu (BMI 18,5–24,9)",medianText:od+"–"+doM+" kg",diffText:diff,neutral}}
function patientReportAdultBmiRangeReference(bmi,delta){const dol=ADULT_BMI.UNDER,gora=24.9,label="Zakres prawidłowy BMI dla dorosłych",zakres=patientReportFormatNumber(dol,1)+"–"+patientReportFormatNumber(gora,1);if(typeof bmi!="number"||!isFinite(bmi))return{available:!1,label,medianText:"Brak por\xF3wnania do zakresu prawidłowego.",diffText:"",neutral:!0};const stan=delta&&delta.state,nad=patientReportFormatNumber(bmi-gora,1),pod=patientReportFormatNumber(dol-bmi,1);/* P-RAPORT rata S: BMI 24,93 (stan „above-normal” od 0,05 kg) dawało „To o 0,0 pkt powyżej górnej granicy”. */return bmi>gora+.049||stan==="above-normal"?nad==="0,0"?{available:!0,label,medianText:zakres,diffText:"BMI jest na g\xF3rnej granicy zakresu.",neutral:!0}:{available:!0,label,medianText:zakres,diffText:"To o "+nad+" pkt powyżej g\xF3rnej granicy.",neutral:!1}:bmi<dol-.049||stan==="underweight"?pod==="0,0"?{available:!0,label,medianText:zakres,diffText:"BMI jest na dolnej granicy zakresu.",neutral:!0}:{available:!0,label,medianText:zakres,diffText:"To o "+pod+" pkt poniżej dolnej granicy.",neutral:!1}:{available:!0,label,medianText:zakres,diffText:"BMI mieści się w tym zakresie.",neutral:!0}}
/* ---- data pomiaru ---- */
function patientReportResolveMeasurementDate(o){const q=o||{},L=q.loaded,mod=!!q.modified,now=q.now instanceof Date?q.now:new Date;try{const iso=L&&L.user&&typeof L.user.measuredAtISO=="string"?L.user.measuredAtISO:null;if(iso&&!mod){const d=new Date(iso);if(!isNaN(d.getTime()))return{date:d,source:"loaded"}}}catch{}return{date:now,source:"now"}}
function patientReportFormatDateLabel(d,zCzasem){try{return new Intl.DateTimeFormat("pl-PL",zCzasem?{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}:{year:"numeric",month:"2-digit",day:"2-digit"}).format(d)}catch{return String(d)}}
function patientReportBuildDateChips(now){const teraz=now instanceof Date?now:new Date,pom=patientReportResolveMeasurementDate({loaded:typeof window<"u"?window.lastLoadedData:null,modified:typeof window<"u"?window.hasUserModifiedAfterLoad:!1,now:teraz}),tenSamDzien=patientReportFormatDateLabel(pom.date,!1)===patientReportFormatDateLabel(teraz,!1);return{measurementLabel:patientReportFormatDateLabel(pom.date,!1),generatedLabel:patientReportFormatDateLabel(teraz,!0),measurementSource:pom.source,sameDay:tenSamDzien}}
/* ---- karta „Zapotrzebowanie energetyczne” ---- */
function patientReportPobierzDaneZalecen(){if(typeof window>"u"||typeof window.buildDietEnergyRecommendationResult!="function")return null;try{const r=window.buildDietEnergyRecommendationResult();return r&&r.dane||null}catch{return null}}
function patientReportBuildEnergyCardContext(dane,b,drab){const out={celEnergiaKcal:null,celMasaKg:null,celWlasny:!1,bialko:null,weglProc:null,tluszczProc:null};if(!dane||!dane.energia||!b)return out;const en=dane.energia,m=dane.masa||{},kl=dane.klasyfikacja||{},mies=typeof document<"u"?parseFloat(document.getElementById("ageMonths")?.value||"0"):0,pozaNorma=!!(kl.nadmiar||kl.niedowaga),/* generator nie oddaje masy docelowej dziecka z niedowaga — wtedy cel z drabinki (ta sama granica, ktora pokazuje karta masy) */celDrab=pozaNorma&&drab&&drab.cel&&isFinite(Number(drab.cel.masa))?Number(drab.cel.masa):NaN,cel=isFinite(Number(m.docelowaKg))&&Number(m.docelowaKg)>0?Number(m.docelowaKg):celDrab;out.celWlasny=String(dane.strategia||"")==="cel-wlasny";/* P-DIETA rata V: przy planie otylosci/nadwagi dziecka zapotrzebowanie dla masy docelowej bierzemy z PLANU (to samo rownanie REE co plan, bez dodatku na wzrastanie) — dawniej karta liczyla je drugi raz i rozjezdzala sie z planem (2 937 vs 2 907 kcal) */const celPlan=!out.celWlasny&&isFinite(Number(en.celTeeKcal))&&Number(en.celTeeKcal)>0&&isFinite(Number(m.docelowaKg))&&Number(m.docelowaKg)===cel;if(celPlan)out.celEnergiaKcal=Number(en.celTeeKcal),out.celMasaKg=cel;else if(isFinite(cel)&&cel>0&&typeof window<"u"&&typeof window.energyBuildPlanReductionState=="function")try{const st=window.energyBuildPlanReductionState({ageYears:b.ageYears,ageMonthsOpt:isFinite(mies)?mies:0,sex:b.sex,weightKg:cel,heightCm:b.height,palInput:en.palUzyty,history:null,intakeKcalPerDay:null,customGoalKg:null,growthEnded:!1}),/* teeRaw: REE×PAL×wzrastanie bez korekty ryzyka (korekta ZO dotyczy planu, nie zapotrzebowania dla masy docelowej) */tee=st&&Number(isFinite(Number(st.teeRawKcal))&&Number(st.teeRawKcal)>0?st.teeRawKcal:st.teeBaselineKcal);isFinite(tee)&&tee>0&&(out.celEnergiaKcal=tee,out.celMasaKg=cel)}catch{}if(typeof window<"u"&&typeof window.nutritionNormsBuildCardModel=="function")try{const nm=window.nutritionNormsBuildCardModel({ageYears:b.ageYears,ageMonthsOpt:isFinite(mies)?mies:0,sex:b.sex,weightKg:b.weight,heightCm:b.height,mainPal:en.palUzyty},window.nutritionNormsUiState&&typeof window.nutritionNormsUiState=="object"?window.nutritionNormsUiState:{});out.weglProc=nm&&nm.carbs&&Array.isArray(nm.carbs.percentRange)?nm.carbs.percentRange:null,out.tluszczProc=nm&&nm.fat&&Array.isArray(nm.fat.percentRange)?nm.fat.percentRange:null;/* P-NORMY rata B1 (decyzja wlasciciela 2026-09-24): bialko z TEGO SAMEGO modelu, co karta „Normy zywieniowe” — RDA g/kg x masa nalezna (dziecko: mediana BMI dla wieku x wzrost^2, dorosly: BMI 22); jedna liczba w dokumencie i na ekranie. */const pr=nm&&nm.protein,mn=pr&&pr.main;if(pr&&pr.available&&mn&&isFinite(Number(mn.rdaGPerKg))&&isFinite(Number(mn.basisWeightKg))&&Number(mn.basisWeightKg)>0)out.bialko={rdaGKg:Number(mn.rdaGPerKg),masaKg:Number(mn.basisWeightKg),gDzien:Number(mn.rdaGDay),rodzaj:pr.basisKind||"obecna"}}catch{}return out}
/* P-NORMY rata B1: wiersz „Bialko” — wartosc „ok. 22 g/d”, a pod etykieta podpis z g/kg i masa, od ktorej liczono (bez wzoru w waskiej kolumnie). U doroslego masa nalezna = BMI 22 (Normy 2024), ale bez slow „BMI 22” w dokumencie (rata Q). */const PATIENT_REPORT_BIALKO_PODSTAWA={nalezna:"należnej masy ciała",bmi22:"należnej masy ciała",typowa:"masy typowej dla wieku",obecna:"obecnej masy ciała"};function patientReportBialkoWiersz(b){const g=isFinite(Number(b.gDzien))?Number(b.gDzien):Number(b.rdaGKg)*Number(b.masaKg),pod=PATIENT_REPORT_BIALKO_PODSTAWA[b.rodzaj]||PATIENT_REPORT_BIALKO_PODSTAWA.obecna;return{label:"Białko",valueText:"ok.\u00A0"+patientReportFormatNumber(Math.round(g),0)+"\u00A0g/d",detail:patientReportFormatNumber(b.rdaGKg,2)+"\u00A0g na kg "+pod+" ("+patientReportFormatNumber(b.masaKg,1)+"\u00A0kg)"}}
function patientReportBuildEnergyCardFromData(dane,ctx){const c=ctx||{},brak={kind:"energy-demand",title:"Zapotrzebowanie energetyczne",subtitle:"Energia i makroskładniki",badge:"Brak danych",value:"—",note:"Brak kompletu danych (wiek, płeć, masa ciała, wzrost) do obliczenia zapotrzebowania energetycznego.",rows:[],tableHeaders:["Pozycja","Wartość"]};if(!dane||!dane.energia)return brak;const en=dane.energia,kl=dane.klasyfikacja||{},L=v=>{const n=Number(v);return v==null||!isFinite(n)?null:n},kcal=v=>patientReportFormatNumber(Math.round(v),0)+" kcal/d",wNormie=!kl.nadmiar&&!kl.niedowaga,obecna=L(en.utrzymanieKcal)!=null?L(en.utrzymanieKcal):L(en.teeBazowyKcal),rows=[];wNormie&&obecna!=null&&rows.push({label:"Przy obecnej masie",valueText:kcal(obecna)}),c.celEnergiaKcal!=null&&rows.push({label:(c.celWlasny?"Dla masy docelowej (cel własny, ":"Dla masy prawidłowej (")+patientReportFormatNumber(c.celMasaKg,1)+" kg)",valueText:kcal(c.celEnergiaKcal)});let plan="";Array.isArray(en.podazZakresKcal)&&L(en.podazZakresKcal[0])!=null&&L(en.podazZakresKcal[1])!=null?plan=patientReportFormatNumber(Math.round(en.podazZakresKcal[0]),0)+"–"+patientReportFormatNumber(Math.round(en.podazZakresKcal[1]),0)+" kcal/d":L(en.podazZaokrKcal)!=null&&(plan=(en.gornaGranica===!0?"\u2264\u202F":"")+kcal(en.podazZaokrKcal)),plan&&rows.push({label:"Plan"+(/* P-DIETA rata G1 (F0): stabilizacja dziecka = utrzymanie masy (liczba z generatora) */dane.strategia==="stabilization"&&!dane.dorosly?": utrzymanie masy ciała":en.dietaNazwa?": dieta "+String(en.dietaNazwa).toLowerCase():": zalecana kaloryczność"),valueText:plan,highlighted:!0}),c.bialko&&rows.push(patientReportBialkoWiersz(c.bialko));const proc=z=>Array.isArray(z)&&L(z[0])!=null&&L(z[1])!=null?patientReportFormatNumber(z[0],0)+"–"+patientReportFormatNumber(z[1],0)+"\xA0% energii":"";proc(c.weglProc)&&rows.push({label:"Węglowodany",valueText:proc(c.weglProc)}),proc(c.tluszczProc)&&rows.push({label:"Tłuszcze",valueText:proc(c.tluszczProc)});if(!rows.length)return brak;/* rata R (decyzja 7): bez noty o wzorze i PAL — odznaka nazywa poziom aktywnosci slowami, podstawa bialka w wierszu */const akt=PATIENT_REPORT_PAL_OPISY[String(Number(en.palUzyty))]||"",value=plan||(c.celEnergiaKcal!=null?kcal(c.celEnergiaKcal):obecna!=null?kcal(obecna):"\u2014");/* P-PAL rata 1 (decyzja wlasciciela 2026-09-22): poziom aktywnosci slowami, a dopoki lekarz go nie zmienil — oznaczony jako przyjety domyslnie. */const notaPal=en.palDomyslny===!0&&akt?"Poziom aktywno\u015Bci przyj\u0119to domy\u015Blnie dla wieku, dop\xF3ki lekarz go nie zmieni.":"";return{kind:"energy-demand",title:"Zapotrzebowanie energetyczne",subtitle:"Energia i makrosk\u0142adniki",badge:akt||"Informacyjnie",value,note:notaPal,rows,tableHeaders:["Pozycja","Warto\u015B\u0107"]}}
function patientReportBuildEnergyCard(){const dane=patientReportPobierzDaneZalecen(),b=patientReportGetCurrentBasics(),drab=b&&b.weight>0&&b.height>0?patientReportDrabinka({wzrostCm:b.height,masaKg:b.weight,plec:b.sex,wiekMies:b.ageYears*12,zrodlo:patientReportGetPreferredSource(),dorosly:b.isAdult}):null;return patientReportBuildEnergyCardFromData(dane,patientReportBuildEnergyCardContext(dane,b,drab))}
(function(){typeof document>"u"||document.addEventListener("click",function(t){const i=t.target&&typeof t.target.closest=="function"?t.target.closest("[data-patient-report-pdf-btn]"):null;i&&(t.preventDefault(),patientReportOpenPdfChoiceDialog(i))})})(),(function(t){if(!t)return;const i="1.0.0",a={updateProfessionalSummaryCard,getFormattedProfessionalSummaryLines,attachPatientReportActionToSummaryCard,generatePatientReportPdf,patientReportBuildEnergyCardFromData,patientReportBuildEnergyCard,patientReportBuildEnergyCardContext,patientReportResolveMeasurementDate,patientReportPierwszyKrok,patientReportZdaniePierwszegoKroku,patientReportKrokReference,patientReportAdultMassReference,patientReportAdultBmiRangeReference,patientReportAdultHeightRangeReference,patientReportBuildMedianReference,patientReportTolerancjaMasyDziecka,patientReportMasaWobecBmi,generatePatientCentileChartPdf,generatePatientAdvancedGrowthPdf,generatePatientSelectedPdfPackage,patientReportOpenPdfChoiceDialog,patientReportBuildModel,patientReportBuildHtml,patientReportBuildPdfPackage,patientReportGetPdfChoiceOptions,getProfessionalSummaryLineTone};try{Object.keys(a).forEach(o=>{typeof a[o]=="function"&&(t[o]=a[o])})}catch(o){typeof t.vildaLogSwallowedCatch=="function"&&t.vildaLogSwallowedCatch("vilda_patient_report.js",o,{context:"export-functions"})}const n=o=>function(){const c=t[o];if(typeof c=="function")return c.apply(this,arguments)},r={__vildaPatientReport:!0,VERSION:i,version:i,versionInfo(){return{version:i,module:"vilda_patient_report.js",extractedFrom:"app.js",step:"8H"}},updateProfessionalSummaryCard:n("updateProfessionalSummaryCard"),getFormattedProfessionalSummaryLines:n("getFormattedProfessionalSummaryLines"),attachPatientReportActionToSummaryCard:n("attachPatientReportActionToSummaryCard"),generatePatientReportPdf:n("generatePatientReportPdf"),generatePatientCentileChartPdf:n("generatePatientCentileChartPdf"),generatePatientAdvancedGrowthPdf:n("generatePatientAdvancedGrowthPdf"),generatePatientSelectedPdfPackage:n("generatePatientSelectedPdfPackage"),patientReportOpenPdfChoiceDialog:n("patientReportOpenPdfChoiceDialog"),patientReportBuildModel:n("patientReportBuildModel"),patientReportBuildHtml:n("patientReportBuildHtml"),patientReportBuildPdfPackage:n("patientReportBuildPdfPackage"),patientReportGetPdfChoiceOptions:n("patientReportGetPdfChoiceOptions")};try{t.VildaPatientReport=r,t.vildaPatientReport=r,t.vildaPatientReportVersion=function(){return i}}catch(o){typeof t.vildaLogSwallowedCatch=="function"&&t.vildaLogSwallowedCatch("vilda_patient_report.js",o,{context:"install-api"})}})(typeof window<"u"?window:typeof globalThis<"u"?globalThis:null);
