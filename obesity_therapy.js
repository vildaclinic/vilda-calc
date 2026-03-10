/* obesity_therapy.js
 * Moduł: Leczenie otyłości (GLP‑1 RA + Mysimba) – wersja PL
 * - Wybór substancji czynnej → preparatu (filtrowane po wieku z karty „Dane użytkownika”)
 * - Automatyczne generowanie schematu dawkowania wg ChPL / SmPC
 * - Sekcje: „Informacje o dawkowaniu”, „Źródła”, przycisk kopiowania zaleceń
 */

(function () {
  'use strict';

  /* =========================
   *  Konfiguracja danych (wg ChPL / SmPC)
   * ========================= */
  const OBESITY_THERAPIES = {
    semaglutide: {
      key: 'semaglutide',
      substanceLabel: 'Semaglutyd (agonista receptora GLP‑1)',
      minAge: 12,
      products: {
        wegovy: {
          key: 'wegovy',
          label: 'Wegovy (semaglutyd) – s.c. 1×/tydz.',
          route: 's.c.',
          frequency: '1×/tydz.',
          dosing: {
            escalation: [
              { label: 'Tyg. 1–4', dose: '0,25 mg', note: 'dawka początkowa' },
              { label: 'Tyg. 5–8', dose: '0,5 mg', note: '' },
              { label: 'Tyg. 9–12', dose: '1,0 mg', note: '' },
              { label: 'Tyg. 13–16', dose: '1,7 mg', note: '' },
              { label: 'Tyg. 17+', dose: '2,4 mg', note: 'dawka podtrzymująca (docelowa)' }
            ],
            missedDose: 'Jeśli pominięto dawkę: gdy do następnej dawki pozostało ≥2 dni (≥48 h) – podać jak najszybciej; gdy <2 dni – pominąć i wrócić do stałego dnia podawania.'
          },
          info: [
            'Podanie podskórne (brzuch/udo/ramię). Stały dzień tygodnia; można o dowolnej porze, z posiłkiem lub bez.',
            'Zwiększanie dawki co 4 tygodnie. W razie nietolerancji w trakcie eskalacji można rozważyć opóźnienie kolejnego zwiększenia o 4 tygodnie.',
            'Jeśli dawka 2,4 mg nie jest tolerowana: można zmniejszyć do 1,7 mg na maks. 4 tygodnie, a następnie ponownie spróbować 2,4 mg; jeśli nadal nietolerowana – rozważyć odstawienie.',
            'Nie stosować równocześnie z innymi agonistami receptora GLP‑1.'
          ],
          sources: [
            { label: 'Wegovy – ChPL (Novo Nordisk Polska) [PDF]', url: 'https://www.novonordisk.pl/content/dam/nncorp/pl/pl/pdfs/products/wegovy-chpl.pdf' },
            { label: 'Wegovy – EMA (EPAR)', url: 'https://www.ema.europa.eu/en/medicines/human/EPAR/wegovy' }
          ]
        }
      },
      eligibility: function (ctx) {
        const msgs = [];
        const { ageYears, weightKg, bmi } = ctx;

        if (ageYears === null) {
          msgs.push('Uzupełnij wiek w sekcji „Dane użytkownika”, aby ocenić kwalifikację wg ChPL.');
          return msgs;
        }

        if (ageYears < 12) {
          msgs.push('Semaglutyd (Wegovy) nie jest zarejestrowany do leczenia otyłości < 12 r.ż. (wg ChPL).');
          return msgs;
        }

        if (ageYears >= 12 && ageYears < 18) {
          msgs.push('Wiek 12–17 lat: wskazanie ChPL dotyczy otyłości u młodzieży z masą ciała >60 kg (dodatkowo wymagane kryteria otyłości wg norm dla wieku/płci).');
          if (Number.isFinite(weightKg) && weightKg !== null && weightKg <= 60) {
            msgs.push('Uwaga: masa ciała ≤60 kg – wg ChPL lek jest wskazany u młodzieży z masą >60 kg.');
          }
          msgs.push('Zakończyć leczenie, jeśli BMI nie zmniejszy się o ≥5% po 12 tyg. stosowania dawki 2,4 mg (lub maks. tolerowanej).');
          return msgs;
        }

        // Dorośli
        msgs.push('Dorośli: wskazanie ChPL – BMI ≥30 kg/m² lub BMI ≥27 kg/m² z co najmniej jednym schorzeniem związanym z masą ciała.');
        if (Number.isFinite(bmi)) {
          if (bmi < 27) msgs.push('Uwaga: BMI <27 kg/m² – poza wskazaniem ChPL (o ile brak szczególnych przesłanek).');
          else if (bmi < 30) msgs.push('BMI 27–29,9 kg/m²: wg ChPL wymagane współistniejące schorzenie związane z masą ciała.');
        }
        return msgs;
      }
    },

    liraglutide: {
      key: 'liraglutide',
      substanceLabel: 'Liraglutyd (agonista receptora GLP‑1)',
      minAge: 6,
      products: {
        saxenda: {
          key: 'saxenda',
          label: 'Saxenda (liraglutyd) – s.c. 1×/dobę',
          route: 's.c.',
          frequency: '1×/dobę',
          dosing: {
            escalation: [
              { label: 'Tydz. 1', dose: '0,6 mg / dobę', note: 'dawka początkowa' },
              { label: 'Tydz. 2', dose: '1,2 mg / dobę', note: '' },
              { label: 'Tydz. 3', dose: '1,8 mg / dobę', note: '' },
              { label: 'Tydz. 4', dose: '2,4 mg / dobę', note: '' },
              { label: 'Tydz. 5+', dose: '3,0 mg / dobę', note: 'dawka podtrzymująca (docelowa)' }
            ],
            missedDose: 'Jeśli pominięto dawkę: gdy przypomnienie nastąpi ≤12 h od zwykłej pory – podać; gdy >12 h – pominąć i przyjąć kolejną dawkę następnego dnia o zwykłej porze (bez dawki podwójnej).'
          },
          info: [
            'Podanie podskórne 1×/dobę (brzuch/udo/ramię), o dowolnej porze – niezależnie od posiłków.',
            'Zwiększanie dawki zwykle co tydzień (0,6 mg → 3,0 mg). W razie nietolerancji można rozważyć opóźnienie eskalacji o dodatkowy tydzień.',
            'Jeśli dawka podtrzymująca (3,0 mg/d) nie jest tolerowana – leczenie należy przerwać.',
            'Nie stosować równocześnie z innymi agonistami receptora GLP‑1.'
          ],
          sources: [
            { label: 'Saxenda – ChPL (Novo Nordisk Polska) [PDF]', url: 'https://www.novonordisk.pl/content/dam/nncorp/pl/pl/pdfs/products/saxenda-chpl.pdf' },
            { label: 'Saxenda – EMA (EPAR)', url: 'https://www.ema.europa.eu/en/medicines/human/EPAR/saxenda' }
          ]
        }
      },
      eligibility: function (ctx) {
        const msgs = [];
        const { ageYears, weightKg, bmi } = ctx;

        if (ageYears === null) {
          msgs.push('Uzupełnij wiek w sekcji „Dane użytkownika”, aby ocenić kwalifikację wg ChPL.');
          return msgs;
        }

        if (ageYears < 6) {
          msgs.push('Liraglutyd (Saxenda) nie jest zarejestrowany do leczenia otyłości < 6 r.ż. (wg ChPL).');
          return msgs;
        }

        if (ageYears >= 6 && ageYears < 12) {
          msgs.push('Dzieci 6–11 lat: wg ChPL – otyłość (wg kryteriów dla wieku/płci) oraz masa ciała ≥45 kg.');
          if (Number.isFinite(weightKg) && weightKg !== null && weightKg < 45) {
            msgs.push('Uwaga: masa ciała <45 kg – wg ChPL lek jest wskazany u dzieci z masą ≥45 kg.');
          }
          msgs.push('Zakończyć leczenie, jeśli redukcja BMI lub Z‑score BMI <4% po 12 tyg. stosowania dawki 3,0 mg/dobę (lub maks. tolerowanej).');
          return msgs;
        }

        if (ageYears >= 12 && ageYears < 18) {
          msgs.push('Młodzież 12–17 lat: wg ChPL – otyłość oraz masa ciała >60 kg (wymagane kryteria otyłości wg norm dla wieku/płci).');
          if (Number.isFinite(weightKg) && weightKg !== null && weightKg <= 60) {
            msgs.push('Uwaga: masa ciała ≤60 kg – wg ChPL lek jest wskazany u młodzieży z masą >60 kg.');
          }
          msgs.push('Zakończyć leczenie, jeśli redukcja BMI <4% po 12 tyg. stosowania dawki 3,0 mg/dobę (lub maks. tolerowanej).');
          return msgs;
        }

        // Dorośli
        msgs.push('Dorośli: wskazanie ChPL – BMI ≥30 kg/m² lub BMI ≥27 kg/m² z co najmniej jednym schorzeniem związanym z masą ciała.');
        if (Number.isFinite(bmi)) {
          if (bmi < 27) msgs.push('Uwaga: BMI <27 kg/m² – poza wskazaniem ChPL (o ile brak szczególnych przesłanek).');
          else if (bmi < 30) msgs.push('BMI 27–29,9 kg/m²: wg ChPL wymagane współistniejące schorzenie związane z masą ciała.');
        }
        msgs.push('Rozważyć przerwanie leczenia, jeśli redukcja masy ciała <5% po 12 tyg. stosowania dawki 3,0 mg/dobę (wg ChPL).');
        return msgs;
      }
    },

    naltrexone_bupropion: {
      key: 'naltrexone_bupropion',
      substanceLabel: 'Naltrekson + bupropion',
      minAge: 18,
      products: {
        mysimba: {
          key: 'mysimba',
          label: 'Mysimba (naltrekson/bupropion) – p.o.',
          route: 'p.o.',
          frequency: 'wg titracji',
          dosing: {
            escalation: [
              { label: 'Tydz. 1', dose: '1 tabl. rano', note: '' },
              { label: 'Tydz. 2', dose: '1 tabl. rano + 1 tabl. wieczorem', note: '' },
              { label: 'Tydz. 3', dose: '2 tabl. rano + 1 tabl. wieczorem', note: '' },
              { label: 'Tydz. 4+', dose: '2 tabl. rano + 2 tabl. wieczorem', note: 'maks. 4 tabl./dobę' }
            ],
            missedDose: 'Jeśli pominięto dawkę: nie należy stosować dawki podwójnej; przyjąć następną dawkę o zwykłej porze.'
          },
          info: [
            'Tabletki połykać w całości (nie kruszyć/nie dzielić/nie żuć).',
            'Leczenie należy przerwać, jeśli po 16 tygodniach pacjent nie osiągnie redukcji masy ciała ≥5% (wg ChPL).',
            'Po 1 roku leczenia: odstawić, jeśli redukcja masy ciała nie jest utrzymana na poziomie ≥5% (oraz wykonywać ocenę ryzyka/korzyści co najmniej raz w roku) – wg aktualizacji ChPL po przeglądzie bezpieczeństwa.',
            'W trakcie leczenia przyjmuj lek regularnie, zgodnie ze schematem zwiększania dawki.'
          ],
          sources: [
            { label: 'Mysimba – EMA: Product information (SmPC, Annex I) [PDF]', url: 'https://www.ema.europa.eu/en/documents/product-information/mysimba-epar-product-information_en.pdf' },
            { label: 'URPL – informacje dot. Mysimba (naltrekson/bupropion)', url: 'https://urpl.gov.pl/pl/produkty-lecznicze/mysimba-naltreksonu-hydrochlorideum-bupropionu-hydrochlorideum' }
          ]
        }
      },
      eligibility: function (ctx) {
        const msgs = [];
        const { ageYears, bmi } = ctx;

        if (ageYears === null) {
          msgs.push('Uzupełnij wiek w sekcji „Dane użytkownika”, aby ocenić kwalifikację wg ChPL.');
          return msgs;
        }

        if (ageYears < 18) {
          msgs.push('Mysimba nie jest zarejestrowana do stosowania < 18 r.ż. (wg ChPL).');
          return msgs;
        }

        msgs.push('Dorośli: wskazanie ChPL – BMI ≥30 kg/m² lub BMI ≥27 kg/m² z co najmniej jednym schorzeniem związanym z masą ciała (np. cukrzyca typu 2, dyslipidemia, kontrolowane NT).');
        if (Number.isFinite(bmi)) {
          if (bmi < 27) msgs.push('Uwaga: BMI <27 kg/m² – poza wskazaniem ChPL (o ile brak szczególnych przesłanek).');
          else if (bmi < 30) msgs.push('BMI 27–29,9 kg/m²: wg ChPL wymagane współistniejące schorzenie związane z masą ciała.');
        }
        msgs.push('Zakończyć leczenie, jeśli redukcja masy ciała <5% po 16 tygodniach (wg ChPL).');
        return msgs;
      }
    }
  };

  /* =========================
   *  Pomocnicze narzędzia
   * ========================= */
  function $(id) {
    return document.getElementById(id);
  }

  function safeNumber(val) {
    if (val === null || val === undefined) return null;
    const s = String(val).trim();
    if (s === '') return null;
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function getUserContext() {
    const ageYears = safeNumber($('age')?.value);
    const weightKg = safeNumber($('weight')?.value);
    const heightCm = safeNumber($('height')?.value);

    let bmi = null;
    if (Number.isFinite(weightKg) && Number.isFinite(heightCm) && heightCm > 0) {
      const h = heightCm / 100;
      bmi = weightKg / (h * h);
    }

    return { ageYears, weightKg, heightCm, bmi };
  }

  function formatBmi(bmi) {
    if (!Number.isFinite(bmi)) return null;
    return (Math.round(bmi * 10) / 10).toFixed(1).replace('.', ',');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setList(listEl, items) {
    if (!listEl) return;
    listEl.innerHTML = '';
    (items || []).forEach((it) => {
      const li = document.createElement('li');
      li.textContent = it;
      listEl.appendChild(li);
    });
  }

  function setSources(listEl, sources) {
    if (!listEl) return;
    listEl.innerHTML = '';
    (sources || []).forEach((s) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = s.label;
      li.appendChild(a);
      listEl.appendChild(li);
    });
  }

  /* =========================
   *  Budowanie treści zaleceń
   * ========================= */
  function getTherapiesForAge(ageYears) {
    const list = [];
    Object.keys(OBESITY_THERAPIES).forEach((k) => {
      const t = OBESITY_THERAPIES[k];
      if (ageYears === null) {
        // Gdy brak wieku – pokazujemy wszystkie opcje, ale w karcie wyświetlimy komunikat o konieczności uzupełnienia wieku
        list.push(t);
        return;
      }
      if (ageYears >= t.minAge) list.push(t);
    });
    return list;
  }

  function buildDosingTable(escalationRows) {
    const rows = escalationRows || [];
    const tr = rows.map((r) => {
      const note = r.note ? `<span style="color:#555; font-size:0.9em;">(${escapeHtml(r.note)})</span>` : '';
      return `<tr>
        <td style="padding:6px 8px; border-bottom:1px solid #ddd; white-space:nowrap;"><strong>${escapeHtml(r.label)}</strong></td>
        <td style="padding:6px 8px; border-bottom:1px solid #ddd;">${escapeHtml(r.dose)} ${note}</td>
      </tr>`;
    }).join('');

    return `<table style="width:100%; border-collapse:collapse; font-size:0.95rem;">
      <thead>
        <tr>
          <th style="text-align:left; padding:6px 8px; border-bottom:2px solid #ccc;">Okres</th>
          <th style="text-align:left; padding:6px 8px; border-bottom:2px solid #ccc;">Dawka</th>
        </tr>
      </thead>
      <tbody>${tr}</tbody>
    </table>`;
  }

  function productShortName(productLabel) {
    // np. "Wegovy (semaglutyd) – s.c. 1×/tydz." → "Wegovy (semaglutyd)"
    return String(productLabel || '').split('–')[0].trim();
  }

  function normWeekLabel(label) {
    // Ujednolicenie do formatu "tyg." / "tydz." (jak w zaleceniach dla pacjenta)
    return String(label || '')
      .replace(/^Tyg\./, 'tyg.')
      .replace(/^Tydz\./, 'tydz.')
      .replace(/^Tydz\b/, 'tydz.')
      .trim();
  }

  function escalationBullets(escalationRows) {
    return (escalationRows || []).map((r) => {
      const note = r.note ? ` (${r.note})` : '';
      const doseTxt = String(r.dose || '').replace(/\s*\/\s*dobę/gi, ' na dobę').trim();
      return `${normWeekLabel(r.label)}: ${doseTxt}${note}`;
    });
  }

  function buildPatientRecPlan(substanceKey, productKey, therapy, product, ctx) {
    const age = ctx?.ageYears;
    const isAdult = age === null ? true : age >= 18;
    const giTextAdult = 'W przypadku wystąpienia poważnych objawów ze strony układu pokarmowego, należy rozważyć opóźnienie zwiększenia dawki lub powrót do poprzedniej dawki do czasu, aż objawy ulegną złagodzeniu.';
    const giTextPed = 'W przypadku wystąpienia poważnych objawów ze strony układu pokarmowego, należy rozważyć opóźnienie zwiększenia dawki lub powrót do maksymalnej dawki tolerowanej przez pacjenta.';
    const giText = isAdult ? giTextAdult : giTextPed;

    const shortName = productShortName(product.label);
    const bullets = escalationBullets(product.dosing?.escalation);
    const firstDose = (product.dosing?.escalation || [])[0]?.dose || '';
    const lastDose = (product.dosing?.escalation || []).slice(-1)[0]?.dose || '';

    // Domyślny punkt dot. stylu życia (jak w Twoim schemacie)
    const lifestylePoint = {
      text: 'Terapię należy traktować jako uzupełnienie leczenia choroby otyłościowej obok diety z deficytem kalorycznym oraz zwiększonej aktywności fizycznej.',
      bold: true
    };

    if (productKey === 'wegovy') {
      return {
        title: `Zalecenia dla pacjenta – ${shortName}`,
        points: [
          {
            text: `${shortName} – lek należy podawać:`,
            bullets: [
              'w postaci wstrzyknięć podskórnych raz na tydzień o dowolnej porze dnia, niezależnie od posiłku.',
              'podskórnie w brzuch, udo lub ramię.',
              'wstrzyknięcie trwa około 5–10 sekund.',
              'miejsce wstrzyknięcia można zmieniać; warto wybrać stały dzień tygodnia.'
            ]
          },
          { text: `Dawka początkowa to ${firstDose} raz na tydzień.`, bold: true },
          {
            text: `Dawkę początkową należy stopniowo zwiększać w czasie 16 tygodni do osiągnięcia dawki podtrzymującej ${lastDose} raz na tydzień wg następującego schematu:`,
            bullets
          },
          { text: giText },
          { text: product.dosing?.missedDose || 'Jeśli pominięto dawkę: postępuj zgodnie z ChPL.' },
          lifestylePoint
        ]
      };
    }

    if (productKey === 'saxenda') {
      const firstDaily = String(firstDose || '').replace(/\s*\/\s*dobę/gi, '').replace(/\s*na\s*dobę/gi, '').trim();
      const lastDaily = String(lastDose || '').replace(/\s*\/\s*dobę/gi, '').replace(/\s*na\s*dobę/gi, '').trim();
      return {
        title: `Zalecenia dla pacjenta – ${shortName}`,
        points: [
          {
            text: `${shortName} – lek należy podawać:`,
            bullets: [
              'w postaci wstrzyknięć podskórnych raz na dobę o dowolnej porze dnia, niezależnie od posiłku.',
              'podskórnie w brzuch, udo lub ramię.',
              'miejsce wstrzyknięcia można zmieniać.'
            ]
          },
          { text: `Dawka początkowa to ${firstDaily} raz na dobę.`, bold: true },
          {
            text: `Dawkę początkową należy stopniowo zwiększać w czasie 4 tygodni do osiągnięcia dawki podtrzymującej ${lastDaily} raz na dobę wg następującego schematu:`,
            bullets
          },
          { text: giText },
          { text: product.dosing?.missedDose || 'Jeśli pominięto dawkę: postępuj zgodnie z ChPL.' },
          lifestylePoint
        ]
      };
    }

    if (productKey === 'mysimba') {
      return {
        title: `Zalecenia dla pacjenta – ${shortName}`,
        points: [
          {
            text: `${shortName} – lek należy przyjmować:`,
            bullets: [
              'doustnie; tabletki połykać w całości (nie kruszyć, nie dzielić, nie żuć).',
              'rano i wieczorem, zgodnie ze schematem zwiększania dawki.',
              'unikać posiłków wysokotłuszczowych w trakcie przyjmowania leku.',
              'przyjmować regularnie o podobnych porach.'
            ]
          },
          { text: 'Dawka początkowa to 1 tabletka rano przez 1 tydzień.', bold: true },
          {
            text: 'Dawkę należy stopniowo zwiększać w ciągu 4 tygodni do dawki docelowej 2 tabletki rano i 2 tabletki wieczorem (maks. 4 tabletki/dobę) wg następującego schematu:',
            bullets
          },
          { text: product.dosing?.missedDose || 'Jeśli pominięto dawkę: nie należy stosować dawki podwójnej.' },
          { text: 'Po około 16 tygodniach leczenia należy ocenić skuteczność terapii.' },
          lifestylePoint
        ]
      };
    }

    // Fallback (gdyby dodano nowe leki później)
    return {
      title: `Zalecenia dla pacjenta – ${shortName || therapy?.substanceLabel || 'Leczenie otyłości'}`,
      points: [
        { text: `Stosuj lek zgodnie z zaleceniami i schematem dawkowania.` },
        { text: product.dosing?.missedDose || '' },
        lifestylePoint
      ].filter((p) => p.text)
    };
  }

  function renderRecPlain(title, points) {
    const out = [title];
    (points || []).forEach((p, idx) => {
      out.push(`${idx + 1}. ${p.text}`);
      (p.bullets || []).forEach((b) => out.push(`•\t${b}`));
    });
    return out.join('\n');
  }

  function renderRecHtml(title, points) {
    const li = (p) => {
      const main = p.bold ? `<strong>${escapeHtml(p.text)}</strong>` : escapeHtml(p.text);
      const bullets = (p.bullets && p.bullets.length)
        ? `<ul style="margin:0.35rem 0 0 1.2rem;">
            ${p.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}
          </ul>`
        : '';
      return `<li style="margin-bottom:0.55rem;">${main}${bullets}</li>`;
    };

    return `
      <div style="font-size:1.05rem; line-height:1.45;">
        <div style="font-weight:700; margin-bottom:0.55rem;">${escapeHtml(title)}</div>
        <ol style="margin:0 0 0 1.25rem; padding:0;">
          ${(points || []).map(li).join('')}
        </ol>
      </div>
    `;
  }

  function buildPlan(substanceKey, productKey, ctx) {
    const therapy = OBESITY_THERAPIES[substanceKey];
    if (!therapy) return null;
    const product = therapy.products?.[productKey];
    if (!product) return null;

    // Zalecenia dla pacjenta (wyświetlane + do kopiowania)
    const rec = buildPatientRecPlan(substanceKey, productKey, therapy, product, ctx);
    const plain = renderRecPlain(rec.title, rec.points);
    const html = renderRecHtml(rec.title, rec.points);

    const dosingHtml = `
      <div style="font-size:0.98rem; line-height:1.45;">
        ${buildDosingTable(product.dosing?.escalation)}
        <p style="margin-top:0.8rem;"><strong>Postępowanie przy pominięciu dawki:</strong><br>${escapeHtml(product.dosing?.missedDose || '')}</p>
      </div>
    `;

    const infoList = []
      .concat(therapy.eligibility(ctx) || [])
      .concat(product.info || []);

    const sourcesList = product.sources || [];

    const plainCopy = plain.replace(/^[^\n]*\n?/, '').trimStart();

    return { plainText: plain, plainCopy, html, dosingHtml, infoList, sourcesList };
  }

  /* =========================
   *  UI: inicjalizacja i logika
   * ========================= */
  function init() {
    const obesityWrapper = $('obesityButtonWrapper');
    const obesityBtn = $('toggleObesityTherapy');
    const obesityCard = $('obesityCard');

    const selSubstance = $('obesitySubstance');
    const selBrand = $('obesityBrand');

    const eligibilityBox = $('obesityEligibilityBox');
    const resultBox = $('obesityResult');

    const copyBtn = $('obesityCopyRec');

    const dosingBtn = $('obesityShowDosing');
    const dosingSection = $('obesityDoseSection');
    const dosingContent = $('obesityDoseContent');

    const infoSection = $('obesityInfoSection');
    const infoListEl = $('obesityInfoList');

    const sourcesBtn = $('obesityShowSources');
    const sourcesSection = $('obesitySourcesSection');
    const sourcesListEl = $('obesitySourcesList');

    // Brak elementów – nie inicjalizujemy
    if (!obesityWrapper || !obesityBtn || !obesityCard || !selSubstance || !selBrand || !resultBox) {
      return;
    }

    // Tooltip – spójny z innymi tooltipami w aplikacji (.menu-tooltip w style.css)
    const tooltip = document.createElement('div');
    tooltip.className = 'menu-tooltip copy-tooltip';
    tooltip.style.position = 'fixed';
    tooltip.style.display = 'none';
    tooltip.style.opacity = '0';
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    tooltip.style.transform = 'translate(-50%, -100%) translateY(2px)';
    document.body.appendChild(tooltip);

    let tooltipTimeout = null;
    let tooltipHideTimeout = null;
    function showTooltip(anchorEl, text) {
      try {
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        if (tooltipHideTimeout) clearTimeout(tooltipHideTimeout);

        tooltip.textContent = text;

        const rect = anchorEl.getBoundingClientRect();
        const left = Math.round(rect.left + rect.width / 2);
        const top = Math.round(rect.top - 10);

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';

        // przygotuj do animacji
        tooltip.style.display = 'block';
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translate(-50%, -100%) translateY(2px)';

        requestAnimationFrame(() => {
          tooltip.style.opacity = '1';
          tooltip.style.transform = 'translate(-50%, -100%) translateY(0px)';
        });

        tooltipTimeout = setTimeout(() => {
          tooltip.style.opacity = '0';
          tooltip.style.transform = 'translate(-50%, -100%) translateY(2px)';
          tooltipHideTimeout = setTimeout(() => {
            tooltip.style.display = 'none';
          }, 220);
        }, 1600);
      } catch (e) {
        // ignore
      }
    }

    function setResultEmpty(msg) {
      resultBox.innerHTML = `<div style="font-size:0.95rem; color:#444;">${escapeHtml(msg)}</div>`;
    }

    // Domyślnie czyścimy wynik
    setResultEmpty('Wybierz substancję czynną oraz preparat, aby wygenerować zalecenia.');

    // Pokaż przycisk tylko wtedy, gdy moduł lekarski jest aktywny
    function syncVisibilityWithDoctorModule() {
      const abxWrapper = $('abxButtonWrapper');
      const doctorOn = abxWrapper && abxWrapper.style.display !== 'none';
      if (doctorOn) {
        obesityWrapper.style.display = 'flex';
      } else {
        obesityWrapper.style.display = 'none';
        obesityCard.style.display = 'none';
        obesityBtn.classList.remove('active-toggle');
      }
    }

    // uruchom i odświeżaj okresowo (analogicznie do flu_therapy.js)
    syncVisibilityWithDoctorModule();
    setInterval(syncVisibilityWithDoctorModule, 1000);

    function populateSubstances() {
      const ctx = getUserContext();
      const available = getTherapiesForAge(ctx.ageYears);

      const current = selSubstance.value;
      selSubstance.innerHTML = '<option value="">– wybierz –</option>';

      available.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.key;
        opt.textContent = t.substanceLabel;
        selSubstance.appendChild(opt);
      });

      // Przywróć wybór jeśli nadal dostępny
      if (current && available.some((t) => t.key === current)) {
        selSubstance.value = current;
      } else {
        selSubstance.value = '';
      }
    }

    function populateBrands() {
      const substanceKey = selSubstance.value;
      const ctx = getUserContext();

      const currentBrand = selBrand.value;

      selBrand.innerHTML = '<option value="">– wybierz –</option>';
      selBrand.disabled = true;

      if (!substanceKey) return;

      const therapy = OBESITY_THERAPIES[substanceKey];
      if (!therapy) return;

      // Filtrowanie wg wieku (wymóg): jeśli wiek uzupełniony i < minAge → brak opcji
      if (ctx.ageYears !== null && ctx.ageYears < therapy.minAge) {
        return;
      }

      Object.keys(therapy.products).forEach((pk) => {
        const p = therapy.products[pk];
        const opt = document.createElement('option');
        opt.value = p.key;
        opt.textContent = p.label;
        selBrand.appendChild(opt);
      });

      selBrand.disabled = false;

      // Przywróć wybór preparatu, jeśli nadal dostępny
      if (currentBrand && Object.prototype.hasOwnProperty.call(therapy.products, currentBrand)) {
        selBrand.value = currentBrand;
      } else {
        selBrand.value = '';
      }
    }

    function updateEligibilityBox() {
      const ctx = getUserContext();
      const substanceKey = selSubstance.value;

      if (!substanceKey) {
        eligibilityBox.style.display = 'none';
        eligibilityBox.innerHTML = '';
        return;
      }

      const therapy = OBESITY_THERAPIES[substanceKey];
      if (!therapy) return;

      const msgs = therapy.eligibility(ctx) || [];
      if (!msgs.length) {
        eligibilityBox.style.display = 'none';
        eligibilityBox.innerHTML = '';
        return;
      }

      eligibilityBox.style.display = 'block';
      eligibilityBox.innerHTML = `
        <div style="font-weight:600; margin-bottom:0.4rem;">Kwalifikacja / uwagi wg ChPL:</div>
        <ul style="margin:0 0 0 1.2rem; font-size:0.95rem; line-height:1.45;">
          ${msgs.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}
        </ul>
      `;
    }

    function updatePlanOutput() {
      const substanceKey = selSubstance.value;
      const brandKey = selBrand.value;
      const ctx = getUserContext();

      // Zawsze aktualizuj box kwalifikacji po zmianach
      updateEligibilityBox();

      if (!substanceKey || !brandKey) {
        infoSection.style.display = 'none';
        sourcesSection.style.display = 'none';
        dosingSection.style.display = 'none';
        setResultEmpty('Wybierz substancję czynną oraz preparat, aby wygenerować zalecenia.');
        copyBtn.dataset.copyText = '';
        return;
      }

      const plan = buildPlan(substanceKey, brandKey, ctx);
      if (!plan) {
        setResultEmpty('Nie udało się wygenerować zaleceń dla wybranej opcji.');
        copyBtn.dataset.copyText = '';
        return;
      }

      resultBox.innerHTML = plan.html;
      copyBtn.dataset.copyText = plan.plainCopy;

      // Dawkowanie
      if (dosingContent) dosingContent.innerHTML = plan.dosingHtml || '';
      // Info + źródła
      infoSection.style.display = 'block';
      setList(infoListEl, plan.infoList || []);
      setSources(sourcesListEl, plan.sourcesList || []);
    }

    // Toggle karty
    obesityBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = obesityCard.style.display === 'block';
      if (isOpen) {
        obesityCard.style.display = 'none';
        obesityBtn.classList.remove('active-toggle');
      } else {
        obesityCard.style.display = 'block';
        obesityBtn.classList.add('active-toggle');
      }
    });

    // Zmiana danych użytkownika → aktualizacja opcji i treści
    const ageEl = $('age');
    const weightEl = $('weight');
    const heightEl = $('height');

    [ageEl, weightEl, heightEl].forEach((el) => {
      if (!el) return;
      el.addEventListener('input', function () {
        populateSubstances();
        populateBrands();
        updatePlanOutput();
      });
      el.addEventListener('change', function () {
        populateSubstances();
        populateBrands();
        updatePlanOutput();
      });
    });

    // Selekcje
    selSubstance.addEventListener('change', function () {
      populateBrands();
      // Reset wyboru preparatu po zmianie substancji
      selBrand.value = '';
      updatePlanOutput();
    });

    selBrand.addEventListener('change', function () {
      updatePlanOutput();
    });

    // Przyciski sekcji
    dosingBtn.addEventListener('click', function () {
      const isVisible = dosingSection.style.display === 'block';
      dosingSection.style.display = isVisible ? 'none' : 'block';
    });

    sourcesBtn.addEventListener('click', function () {
      const isVisible = sourcesSection.style.display === 'block';
      sourcesSection.style.display = isVisible ? 'none' : 'block';
    });

    // Kopiowanie zaleceń
    copyBtn.addEventListener('click', async function () {
      const txt = copyBtn.dataset.copyText || '';
      if (!txt) {
        showTooltip(copyBtn, 'Najpierw wybierz substancję i preparat.');
        return;
      }

      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(txt);
        } else {
          // Fallback
          const ta = document.createElement('textarea');
          ta.value = txt;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        showTooltip(copyBtn, 'Skopiowano zalecenia do schowka.');
      } catch (err) {
        showTooltip(copyBtn, 'Nie udało się skopiować. Skopiuj ręcznie z pola wyników.');
      }
    });

    // Inicjalne wypełnienie
    populateSubstances();
    populateBrands();
    updatePlanOutput();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
