/*
 * Rak tarczycy u dzieci — moduł edukacyjny (rekomendacje polskich towarzystw naukowych, aktualizacja 2024)
 *
 * Zakres modułu:
 * 1) Diagnostyka guzków tarczycy u dzieci (różnice vs dorośli, wskazania do BACC/FNAB, postępowanie wg Bethesda)
 * 2) Postępowanie w zróżnicowanym raku tarczycy (DTC):
 *    - planowanie zabiegu na podstawie Bethesda V/VI i cT/N (schemat zaleceń 2024)
 *    - postępowanie pooperacyjne na podstawie pTNM + cech ryzyka (ATA 2015) + zasady ¹³¹I/LT4
 */
(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function isVisible(el) {
    if (!el) return false;
    const cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function escapeHtml(str) {
    if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.escapeHtml === 'function') {
      return window.VildaHtml.escapeHtml(arguments[0]);
    }
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('thyroid_cancer_kids.js', _, { line: 38 });
    }
  }

    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

    function buildBulletsHtml(items) {
    if (!items || !items.length) return '';
    const li = items
      .map((it) => {
        if (!it) return '';
        const main = it.html ? it.html : escapeHtml(it.text || '');
        const subs =
          Array.isArray(it.subs) && it.subs.length
            ? `<ul class="thy-subbullets">${it.subs
                .map((s) => {
                  if (typeof s === 'string') return `<li>${escapeHtml(s)}</li>`;
                  if (s && typeof s === 'object') {
                    const subMain = s.html ? s.html : escapeHtml(s.text || '');
                    return `<li>${subMain}</li>`;
                  }
                  return '';
                })
                .join('')}</ul>`
            : '';
        return `<li>${main}${subs}</li>`;
      })
      .join('');
    return `<ul class="thy-bullets">${li}</ul>`;
  }

  function bulletsToPlain(items) {
    const lines = [];
    (items || []).forEach((it) => {
      if (!it) return;
      const mainText = it.text || '';
      if (mainText) lines.push(`• ${mainText}`);
      (it.subs || []).forEach((s) => {
        if (typeof s === 'string') {
          lines.push(`  - ${s}`);
        } else if (s && typeof s === 'object') {
          if (s.text) lines.push(`  - ${s.text}`);
        }
      });
    });
    return lines.join('\n');
  }

  function thyroidCancerSetTrustedHtml(element, markup, context) {
    if (!element) return false;
    const html = markup == null ? '' : String(markup);
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.setTrustedHtml === 'function') {
        return window.VildaHtml.setTrustedHtml(element, html, { context: context || 'thyroidCancer' });
      }
      element.textContent = html;
      return true;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('thyroid_cancer_kids.js', _, { helper: 'thyroidCancerSetTrustedHtml', context: context || '' });
      }
      return false;
    }
  }

  function thyroidCancerClearHtml(element) {
    if (!element) return false;
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.clearHtml === 'function') return window.VildaHtml.clearHtml(element);
      element.textContent = '';
      return true;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('thyroid_cancer_kids.js', _, { helper: 'thyroidCancerClearHtml' });
      }
      return false;
    }
  }

  function thyroidCancerCloneChildrenInto(target, source, context) {
    if (!target || !source) return false;
    try {
      if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.cloneChildrenInto === 'function') {
        return window.VildaHtml.cloneChildrenInto(target, source, { context: context || 'thyroidCancer:cloneChildrenInto' });
      }
      thyroidCancerClearHtml(target);
      Array.prototype.slice.call(source.childNodes || []).forEach(function (node) {
        target.appendChild(node.cloneNode(true));
      });
      return true;
    } catch (_) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('thyroid_cancer_kids.js', _, { helper: 'thyroidCancerCloneChildrenInto', context: context || '' });
      }
      return false;
    }
  }


  function buildSectionsHtml(sections) {
    return (sections || [])
      .map((sec) => {
        const title = sec.title ? `<h3 class="thy-section-title">${escapeHtml(sec.title)}</h3>` : '';
        const bullets = buildBulletsHtml(sec.items || []);
        const note = sec.note ? `<div class="thy-note">${escapeHtml(sec.note)}</div>` : '';
        return `${title}${bullets}${note}`;
      })
      .join('');
  }

  function buildSectionsPlain(sections) {
    const out = [];
    (sections || []).forEach((sec) => {
      if (sec.title) out.push(sec.title);
      const b = bulletsToPlain(sec.items || []);
      if (b) out.push(b);
      if (sec.note) out.push(sec.note);
      out.push('');
    });
    return out.join('\n').trim();
  }

function buildDisclosureHtml(options) {
  if (!options || !options.contentHtml) return '';
  const id = String(options.id || '').trim();
  if (!id) return options.contentHtml;
  const showLabel = String(options.buttonLabel || 'Pokaż szczegóły');
  const hideLabel = String(options.hideLabel || 'Ukryj szczegóły');
  const extraButtonClass = String(options.buttonClass || '').trim();
  const buttonClassAttr = ['igf-btn', 'thy-disclosure-btn', extraButtonClass].filter(Boolean).join(' ');
  return `
    <div class="thy-disclosure-wrap">
      <div class="thy-disclosure-btnwrap">
        <button
          type="button"
          class="${escapeHtml(buttonClassAttr)}"
          data-thy-toggle="${escapeHtml(id)}"
          data-thy-show-label="${escapeHtml(showLabel)}"
          data-thy-hide-label="${escapeHtml(hideLabel)}"
          aria-expanded="false"
        >${escapeHtml(showLabel)}</button>
      </div>
      <div id="${escapeHtml(id)}" class="thy-disclosure-panel" hidden>
        ${options.contentHtml}
      </div>
    </div>
  `;
}


  // --------------------------------------
  // UI: wyróżnienie najważniejszych zaleceń (fioletowa ramka jak w module nadciśnienia)
  // --------------------------------------
  
  function buildPriorityCardHtml(card) {
    if (!card || !card.main) return '';
    const titleHtml = card.title
      ? `<div class="thy-rec-top">${escapeHtml(card.title)}</div>`
      : '';
    const bullets = Array.isArray(card.bullets) ? card.bullets.filter(Boolean) : [];
    const bulletsHtml = bullets.length
      ? `<ul class="thy-rec-bullets">${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
      : '';
    const groups = Array.isArray(card.groups) ? card.groups.filter(Boolean) : [];
    const groupsHtml = groups.length
      ? groups
          .map((group) => {
            const items = Array.isArray(group.items) ? group.items.filter(Boolean) : [];
            if (!items.length) return '';
            const title = group.title ? `<div class="thy-rec-group-title">${escapeHtml(group.title)}</div>` : '';
            return `<div class="thy-rec-group">${title}<ul class="thy-rec-group-bullets">${items
              .map((item) => `<li>${escapeHtml(item)}</li>`)
              .join('')}</ul></div>`;
          })
          .join('')
      : '';
    const modifiersHtml = card.includeNoduleSwitches
      ? `
        <div class="thy-rec-modifiers">
          <div class="thy-rec-subtitle">Modyfikatory postępowania</div>
          <div id="thyNoduleSwitchesHost"></div>
        </div>
      `
      : '';

    return `
      <div class="thy-rec-wrap">
        ${titleHtml}
        <section class="thy-rec-card">
          <div class="thy-rec-head">
            <div class="thy-rec-index">1</div>
            <div class="thy-rec-title">
              <div class="thy-rec-title-row">
                <div class="thy-rec-title-text">${escapeHtml(card.main)}</div>
              </div>
            </div>
          </div>
          ${bulletsHtml}
          ${modifiersHtml}
          ${groupsHtml}
        </section>
      </div>
    `;
  }

  function buildPriorityCardPlain(card) {
    if (!card || !card.main) return '';
    const out = [];
    if (card.title) out.push(card.title);
    out.push(card.main);
    const bullets = Array.isArray(card.bullets) ? card.bullets.filter(Boolean) : [];
    bullets.forEach((b) => out.push(`- ${b}`));
    const groups = Array.isArray(card.groups) ? card.groups.filter(Boolean) : [];
    groups.forEach((group) => {
      const items = Array.isArray(group.items) ? group.items.filter(Boolean) : [];
      if (!items.length) return;
      if (group.title) out.push(`${group.title}:`);
      items.forEach((item) => out.push(`- ${item}`));
    });
    return out.join('\n').trim();
  }

  // --------------------------
  // Diagnostyka guzków (część I)
  // --------------------------
  
  function getNodulePlan(state) {
    const tirads = state.tirads;
    const hot = !!state.hot;
    const nodes = !!state.nodes;
    const beth = state.bethesda; // '', 'I'..'VI'

    const sections = [];

    const tirads45Pediatric = 'W rekomendacjach pediatrycznych 2024 kategorie EU‑TIRADS‑PL 4–5 stanowią bezpośrednie pediatryczne kryterium kwalifikacji zmiany w tarczycy do BACC/FNAB.';
    const tirads13Pediatric = 'Dla kategorii EU‑TIRADS‑PL 1–3 rekomendacje pediatryczne nie podają odrębnego algorytmu per kategoria.';
    const tirads13Observation = 'Przy braku cech zwiększonego ryzyka w USG oraz w ocenie klinicznej zwykle obserwacja i kontrolne USG.';
    const tiradsAdultTable = 'Pełna tabela EU‑TIRADS‑PL 1–5 w module pochodzi z wytycznych dla dorosłych (PTN‑NSO 2022).';
    const hotPediatric = 'Guzek nadczynny („hot”) u dziecka nie wyklucza DTC — nie rezygnuj rutynowo z BACC/FNAB.';
    const hotPediatricAfterBethesda = 'Guzek nadczynny („hot”) u dziecka nie obniża czujności onkologicznej — nie rezygnuj rutynowo z BACC/FNAB.';
    const nodesFnab = 'Podejrzane węzły chłonne w USG → rozważ BACC/FNAB węzła (± Tg w popłuczynach).';

    const diffItems = [
      {
        text: 'U dzieci ryzyko złośliwości guzków jest wyższe niż u dorosłych (wśród dzieci operowanych z powodu wola guzkowego w ok. 26–33% rozpoznaje się raka); wyższe jest też ryzyko złośliwości w Bethesda III–V (ROM ok.: III 29,6%, IV 42,3%, V 90,8%).',
      },
      {
        text: 'USG tarczycy i węzłów chłonnych szyi jest wymagane u każdego dziecka z podejrzeniem zmiany ogniskowej tarczycy/zmiany w obrębie szyi.',
      },
      {
        text: 'USG tarczycy nie jest badaniem przesiewowym dla całej populacji dzieci, ale jest wskazane w grupach wysokiego ryzyka (np. po ekspozycji na promieniowanie jonizujące, w wybranych zespołach genetycznych, w dyshormonogenezach).',
        subs: [
          'Pacjentów ze zwiększonym ryzykiem DTC w przebiegu zespołów genetycznych należy kierować do ośrodka referencyjnego (monitorowanie, poradnictwo genetyczne).',
        ],
      },
      {
        text: 'W guzkach nadczynnych u dzieci nie należy rezygnować z biopsji ze względu na wyższe ryzyko zróżnicowanego raka tarczycy niż u dorosłych w tej grupie pacjentów.',
      },
      {
        text: 'Rozmiar guzka nie powinien być głównym kryterium kwalifikacji zmiany w tarczycy do BACC/FNAB — ważniejszy jest charakter zmiany w badaniu USG oraz obraz kliniczny pacjenta.',
        subs: [
          tirads45Pediatric,
          `${tirads13Pediatric} ${tiradsAdultTable}`,
        ],
      },
      {
        text: 'W ośrodkach dysponujących sprzętem i doświadczeniem elastografia może być pomocna przy ocenie ryzyka złośliwości w zmianie ogniskowej.',
      },
      {
        text: 'W Bethesda III/IV u dzieci częściej stwierdza się raka po operacji — w tej grupie należy rozważyć leczenie chirurgiczne zamiast powtórnej BACC/FNAB.',
        subs: [
          'Decyzję o leczeniu operacyjnym zmian Bethesda III–VI zaleca się podejmować w oparciu o dwie niezależne opinie doświadczonych patomorfologów.',
        ],
      },
      {
        text: 'PTC może manifestować się jako limfadenopatia szyjna z palpacyjnym guzkiem w tarczycy lub bez niego; bywa też wykrywany przypadkowo w badaniach obrazowych szyi.',
        subs: [
          'Postać PTC z rozlanym naciekiem może powodować powiększenie zajętego płata lub całego gruczołu, charakteryzuje się zwykle licznymi mikrozwapnieniami oraz palpacyjnymi węzłami chłonnymi.',
        ],
      },
      {
        text: 'Badania molekularne w diagnostyce guzków tarczycy u dzieci mogą być pomocne w wybranych przypadkach, ale dowody na to są ograniczone (m.in. brak prospektywnych badań wieloośrodkowych); nie powinny zastępować oceny klinicznej i USG.',
      },
    ];
    const diffSection = { title: 'Różnice w chorobie guzkowej tarczycy u dzieci vs u osób dorosłych', items: diffItems };

    function buildDiffDisclosure(suffix) {
      return buildDisclosureHtml({
        id: `thyDiffDisclosure-${suffix}`,
        buttonLabel: 'Pokaż różnice w chorobie guzkowej tarczycy u dzieci vs u osób dorosłych',
        hideLabel: 'Ukryj różnice w chorobie guzkowej tarczycy u dzieci vs u osób dorosłych',
        buttonClass: 'thy-disclosure-btn-static',
        contentHtml: buildSectionsHtml([diffSection]),
      });
    }

    function createPriorityCardBase() {
      return {
        title: 'Najważniejsze zalecenie',
        main: '',
        bullets: [],
        includeNoduleSwitches: true,
        groups: [],
      };
    }

    function addModifierGroup(card, title, items) {
      const cleanItems = Array.isArray(items) ? items.filter(Boolean) : [];
      if (!cleanItems.length) return;
      card.groups = card.groups || [];
      card.groups.push({ title, items: cleanItems });
    }

    // Bethesda V/VI: zwięzły komunikat, przycisk przejścia do leczenia i ukryta sekcja „Różnice…”.
    if (beth === 'V' || beth === 'VI') {
      const b = beth;
      const priorityCard = createPriorityCardBase();
      priorityCard.main = `Wynik BACC/FNAB: Bethesda ${b}`;
      priorityCard.bullets = [
        b === 'V'
          ? 'Wynik oznacza wysokie podejrzenie nowotworu złośliwego tarczycy.'
          : 'Wynik oznacza rozpoznanie nowotworu złośliwego tarczycy.',
        'Dalsze postępowanie należy prowadzić w ścieżce leczenia raka tarczycy u dzieci.',
      ];

      const modifierItems = [];
      if (nodes) {
        modifierItems.push('Podejrzane węzły chłonne w USG → wykonaj przedoperacyjnie BACC/FNAB węzła (± Tg w popłuczynach), jeśli nie wykonano wcześniej.');
        modifierItems.push('Potwierdzenie przerzutu wpływa na zakres leczenia węzłowego.');
      }
      if (hot) modifierItems.push(hotPediatricAfterBethesda);
      addModifierGroup(priorityCard, 'Wpływ zaznaczonych modyfikatorów na postępowanie', modifierItems);

      const jumpHtml = `<div style="text-align:center; margin:0.85rem 0 0.2rem;">
  <button type="button" class="igf-btn thy-jump-cancer-preop" data-thy-beth="${b}" aria-label="Przejdź do ścieżki: Nowotwór — leczenie">
    Przejdź do ścieżki „Nowotwór — leczenie”
  </button>
</div>`;

      const priorityHtml = buildPriorityCardHtml(priorityCard);
      const priorityPlain = buildPriorityCardPlain(priorityCard);
      const diffHtml = buildDiffDisclosure(`beth${b}`);
      return {
        sections: [],
        html: `${priorityHtml}${jumpHtml}${diffHtml}`,
        plain: [priorityPlain, 'Przejdź do ścieżki „Nowotwór — leczenie”.'].filter(Boolean).join('\n\n').trim(),
      };
    }

    // Etap przedcytologiczny (brak wyniku Bethesda)
    if (!beth) {
      const priorityCard = tirads ? createPriorityCardBase() : null;

      if (priorityCard) {
        if (nodes) {
          priorityCard.main = 'Podejrzane węzły chłonne w USG → rozważ BACC/FNAB węzła (± Tg w popłuczynach).';
          priorityCard.bullets = tirads === '4' || tirads === '5'
            ? [`EU‑TIRADS‑PL ${tirads} → równolegle kwalifikuj zmianę w tarczycy do BACC/FNAB pod kontrolą USG.`]
            : [
                `EU‑TIRADS‑PL ${tirads} → sama kategoria ${tirads} nie ma w rekomendacjach pediatrycznych odrębnego algorytmu postępowania.`,
                'Dalszą decyzję oprzyj łącznie na obrazie klinicznym, pełnym USG tarczycy i węzłów chłonnych oraz czynnikach ryzyka.',
              ];
        } else if (tirads === '4' || tirads === '5') {
          priorityCard.main = `EU‑TIRADS‑PL ${tirads} → kategoria ${tirads} stanowi bezpośrednie pediatryczne kryterium kwalifikacji zmiany w tarczycy do BACC/FNAB.`;
          priorityCard.bullets = [
            'Zleć BACC/FNAB zmiany pod kontrolą USG.',
            'Rozmiar guzka ma znaczenie drugorzędne wobec obrazu USG i oceny klinicznej.',
          ];
        } else if (hot) {
          priorityCard.main = hotPediatric;
          priorityCard.bullets = [
            `EU‑TIRADS‑PL ${tirads} → ${tirads13Pediatric}`,
            tirads13Observation,
            tiradsAdultTable,
          ];
        } else {
          priorityCard.main = `EU‑TIRADS‑PL ${tirads} → sama kategoria ${tirads} nie ma w rekomendacjach pediatrycznych odrębnego algorytmu postępowania.`;
          priorityCard.bullets = [
            tirads13Observation,
            tiradsAdultTable,
            'W razie pojawienia się nowych cech podejrzanych w badaniu przedmiotowym lub USG tarczycy rozważ BACC/FNAB niezależnie od samego rozmiaru guzka.',
          ];
        }

        const preModifierItems = [];
        if (hot && !(tirads && tirads !== '4' && tirads !== '5' && !nodes)) {
          preModifierItems.push(hotPediatric);
        }
        addModifierGroup(priorityCard, 'Wpływ zaznaczonych modyfikatorów na postępowanie', preModifierItems);
      }

      const nowItems = [];

      nowItems.push({
        text: 'Przeprowadź wywiad i badanie przedmiotowe (w tym badanie palpacyjne tarczycy i węzłów chłonnych szyjnych). Oceń czynniki ryzyka rozwoju DTC u dzieci/młodzieży:',
        subs: [
          'ekspozycja na promieniowanie jonizujące (zewnętrzne lub wewnętrzne)',
          'zespoły genetyczne (m.in. FAP, kompleks Carneya, zespół DICER1, zespół PTEN hamartoma tumor syndrome (PHTS), zespół Wernera, zespół Beckwitha‑Wiedemanna, zespół Li‑Fraumeni, zespół McCune‑Albrighta, zespół Peutz‑Jeghersa, rodzinne występowanie przyzwojaków)',
          'dyshormonogeneza',
        ],
      });

      nowItems.push({
        text: 'Wykonaj USG tarczycy i węzłów chłonnych szyjnych.',
      });

      if (tirads === '4' || tirads === '5') {
        nowItems.push({
          text: `EU‑TIRADS‑PL ${tirads}: kategoria ${tirads} stanowi bezpośrednie pediatryczne kryterium kwalifikacji zmiany w tarczycy do BACC/FNAB.`,
          subs: [
            'Zleć BACC/FNAB zmiany pod kontrolą USG.',
            'Rozmiar guzka ma znaczenie drugorzędne wobec obrazu USG i oceny klinicznej.',
          ],
        });
      } else if (tirads) {
        nowItems.push({
          text: `EU‑TIRADS‑PL ${tirads}: ${tirads13Pediatric} ${tirads13Observation}`,
          subs: [
            tiradsAdultTable,
            'W razie pojawienia się nowych cech podejrzanych w badaniu przedmiotowym lub USG tarczycy rozważ BACC/FNAB niezależnie od samego rozmiaru guzka.',
          ],
        });
      }

      nowItems.push({
        text: 'Oznacz TSH i fT4 w celu oceny czynności tarczycy.',
        subs: [
          'Przy obniżonym TSH należy rozważyć dalszą diagnostykę w kierunku guzka nadczynnego/nadczynności tarczycy (np. scyntygrafię — zależnie od sytuacji klinicznej).',
        ],
      });

      sections.push({
        title: 'Diagnostyka wstępna i kwalifikacja do BACC/FNAB',
        items: nowItems,
      });
      sections.push(diffSection);

      const priorityHtml = priorityCard ? buildPriorityCardHtml(priorityCard) : '';
      const priorityPlain = priorityCard ? buildPriorityCardPlain(priorityCard) : '';
      return {
        sections,
        html: `${priorityHtml}${buildSectionsHtml(sections)}`,
        plain: [priorityPlain, buildSectionsPlain(sections)].filter(Boolean).join('\n\n').trim(),
      };
    }

    // Postępowanie wg Bethesda I–IV
    const bItems = [];
    let diffDisclosureHtml = '';

    switch (beth) {
      case 'I':
        bItems.push({
          text: 'Bethesda I (niediagnostyczna): powtórz BACC/FNAB pod kontrolą USG.',
          subs: ['Rozważ korektę techniki/pobrania (doświadczony operator, obecność cytotechnika).'],
        });
        sections.push(diffSection);
        break;
      case 'II':
        bItems.push({
          text: 'Bethesda II (łagodna): obserwacja i kontrolne USG.',
          subs: ['W razie wzrostu zmiany, pojawienia się nowych cech podejrzanych lub objawów uciskowych → ponowna ocena (± powtórna BACC/FNAB / kwalifikacja do zabiegu).'],
        });
        sections.push(diffSection);
        break;
      case 'III':
      case 'IV':
        bItems.push({
          text: `Bethesda ${beth} (wynik nieokreślony/pośredni): u dzieci należy rozważyć leczenie chirurgiczne zamiast powtórnej BACC/FNAB.`,
          subs: [
            'Proponowany zakres: lobektomia z cieśnią (wycięcie zajętego płata z cieśnią).',
            'Decyzja o leczeniu operacyjnym powinna opierać się na 2 niezależnych opiniach patomorfologów doświadczonych w ocenie biopsji tarczycy.',
          ],
        });
        bItems.push({
          text: 'Możliwy zakres leczenia operacyjnego — decyzja chirurga po uwzględnieniu klinicznych cech ryzyka złośliwości guza oraz preferencji pacjenta i opiekunów prawnych:',
          subs: [
            'lobektomia z cieśnią — po omówieniu, że pooperacyjne rozpoznanie raka może stanowić wskazanie do wtórnej operacji (wycięcia drugiego płata tarczycy).',
            'tyreoidektomia całkowita — po omówieniu, że pooperacyjne badanie histopatologiczne może nie potwierdzić raka; należy rozważyć szczególnie przy zmianach ogniskowych w obu płatach tarczycy.',
          ],
        });
        bItems.push({
          text: 'Badania molekularne zmiany (jeśli dostępne) mogą wspierać decyzję w wybranych przypadkach, ale u dzieci dowody są ograniczone i nie zastępują oceny klinicznej oraz cytologicznej.',
        });
        sections.push({
          title: 'Dalsze postępowanie po wyniku Bethesda III/IV',
          items: bItems,
        });
        diffDisclosureHtml = buildDiffDisclosure(`beth${beth}`);
        break;
      default:
        sections.push({
          title: 'Postępowanie w zależności od wyniku BACC/FNAB (Bethesda)',
          items: [{ text: 'Nie rozpoznano kategorii Bethesda — wybierz kategorię I–VI.' }],
        });
        break;
    }

    const priorityCard = createPriorityCardBase();
    switch (beth) {
      case 'I':
        if (nodes) {
          priorityCard.main = 'Podejrzane węzły chłonne w USG → uzupełnij ocenę węzłów i rozważ pilnie BACC/FNAB węzła (± Tg w popłuczynach).';
          priorityCard.bullets = [
            'Bethesda I → powtórz BACC/FNAB pod kontrolą USG.',
            'W przypadku potwierdzenia przerzutu → postępowanie jak w raku tarczycy.',
          ];
        } else {
          priorityCard.main = 'Bethesda I → powtórz BACC/FNAB pod kontrolą USG.';
          priorityCard.bullets = ['Rozważ korektę techniki/pobrania (doświadczony operator, obecność cytotechnika).'];
        }
        if (hot) addModifierGroup(priorityCard, 'Wpływ zaznaczonych modyfikatorów na postępowanie', [hotPediatricAfterBethesda]);
        break;
      case 'II':
        if (nodes) {
          priorityCard.main = 'Podejrzane węzły chłonne w USG → wykonaj BACC/FNAB węzła (± Tg w popłuczynach).';
          priorityCard.bullets = [
            'Bethesda II w guzku nie wyklucza przerzutów.',
            'Przy niezgodności obrazu USG/kliniki z cytologią rozważ weryfikację cytologii i/lub powtórną BACC/FNAB guzka.',
          ];
        } else {
          priorityCard.main = 'Bethesda II → obserwacja i kontrolne USG.';
          priorityCard.bullets = ['W razie wzrostu zmiany, nowych cech podejrzanych lub objawów uciskowych → ponowna ocena (± powtórna BACC/FNAB / kwalifikacja do zabiegu).'];
        }
        if (hot) addModifierGroup(priorityCard, 'Wpływ zaznaczonych modyfikatorów na postępowanie', [hotPediatricAfterBethesda]);
        break;
      case 'III':
      case 'IV': {
        priorityCard.main = `Wynik BACC/FNAB: Bethesda ${beth}`;
        priorityCard.bullets = [
          'Wynik oznacza kategorię pośrednią / niejednoznaczną wymagającą dalszej decyzji terapeutycznej.',
          'U dzieci należy rozważyć leczenie chirurgiczne zamiast powtórnej BACC/FNAB.',
          'Proponowany zakres: lobektomia z cieśnią.',
          'Decyzja powinna opierać się na 2 niezależnych opiniach doświadczonych patomorfologów.',
        ];
        const modifierItems = [];
        if (nodes) {
          modifierItems.push('Podejrzane węzły chłonne w USG → wykonaj przedoperacyjnie BACC/FNAB węzła (± Tg w popłuczynach).');
          modifierItems.push('Potwierdzenie przerzutu może zmienić zakres operacji i limfadenektomii.');
        }
        if (hot) modifierItems.push(hotPediatricAfterBethesda);
        addModifierGroup(priorityCard, 'Wpływ zaznaczonych modyfikatorów na postępowanie', modifierItems);
        break;
      }
      default:
        priorityCard.main = 'Postępowanie zależy od wyniku cytologii (Bethesda) oraz obrazu klinicznego/USG.';
        break;
    }

    const priorityHtml = buildPriorityCardHtml(priorityCard);
    const priorityPlain = buildPriorityCardPlain(priorityCard);

    return {
      sections,
      html: `${priorityHtml}${buildSectionsHtml(sections)}${diffDisclosureHtml}`,
      plain: [priorityPlain, buildSectionsPlain(sections)].filter(Boolean).join('\n\n').trim(),
    };
  }

  // --------------------------------------
  // Rak tarczycy (część II/III) — algorytmy
  // --------------------------------------
  function getPreopCancerPlan(state) {
    const beth = state.bethesda; // 'V' or 'VI'
    const cT = state.cT; // 'cT1a' | 'cT1b3' | 'cT4' | ''
    const cN = state.cN; // 'N0' | 'N1a' | 'N1b' | 'Nx'
    const older = !!state.older;
    const dtcSubtype = state.dtcSubtype || 'unknown'; // 'unknown' | 'ptc' | 'ftc'

    const sections = [];
    const items = [];

    // Najważniejsze zalecenie (wyróżnione na fioletowo) — rekomendowany zakres operacji
    const priorityCard = {
      title: 'Najważniejsze zalecenie',
      main: '',
      bullets: [],
      groups: [],
    };

    function setPriorityRec(label, bullets) {
      priorityCard.main = label;
      priorityCard.bullets = Array.isArray(bullets) ? bullets.filter(Boolean) : [];
    }

    if (!cT) {
      items.push({ text: 'Wybierz cT (kliniczna ocena guza) aby uzyskać rekomendowany zakres operacji.' });
      sections.push({ title: 'Leczenie operacyjne', items });
      return { sections, html: buildSectionsHtml(sections), plain: buildSectionsPlain(sections) };
    }

    // Ogólne zasady
    if (dtcSubtype === 'ftc') {
      items.push({
        text: 'Wybrano podtyp DTC: FTC (rak pęcherzykowy). Preferowanym zabiegiem przy przedoperacyjnym rozpoznaniu raka jest całkowita tyreoidektomia; w wysokozróżnicowanym FTC profilaktyczna centralna limfadenektomia nie jest bezwzględnie konieczna — zakres operacji węzłowej zależy od oceny USG/cN i sytuacji śródoperacyjnej.',
        subs: [
          'Uwaga praktyczna: FTC częściej rozpoznaje się ostatecznie dopiero w badaniu histopatologicznym po lobektomii diagnostycznej (np. po rozpoznaniu Bethesda III/IV).',
        ],
      });
    } else if (dtcSubtype === 'ptc') {
      items.push({
        text: 'Wybrano podtyp DTC: PTC (rak brodawkowaty). Preferowanym zabiegiem jest całkowita tyreoidektomia; u dzieci brakuje jednoznacznych dowodów, że lobektomia w cT1a zawsze jest wystarczająca.',
        subs: [
          'U wybranych starszych nastolatków (ok. >14 rż./Tanner 5) lobektomia z cieśnią może być rozważana (indywidualizacja).',
        ],
      });
    }

    // Plan leczenia operacyjnego wg zaleceń (wypisujemy też kluczowy zakres operacji jako „priority card”)
    if (cT === 'cT4') {
      setPriorityRec(
        `Bethesda ${beth || 'V/VI'} + cT4: zakres operacji ustal indywidualnie (planowanie w ośrodku referencyjnym).`,
        [
          'Rozważ TK z kontrastem lub MR do optymalnego planowania zabiegu.',
          'Jeśli możliwa resekcja R0 przy nacieku sąsiednich narządów — rozważ operację wielonarządową w zespole wielodyscyplinarnym.',
        ]
      );
    } else if (cT === 'cT1a' && cN === 'N0') {
      const subs =
        dtcSubtype === 'ftc'
          ? [
              'Całkowita tyreoidektomia',
              'Centralna limfadenektomia profilaktyczna: do rozważenia (w wysokozróżnicowanym FTC nie jest bezwzględnie konieczna przy N0).',
              'Węzły boczne: postępowanie terapeutyczne po potwierdzeniu przerzutu (BACC/biopsja chirurgiczna podejrzanych węzłów).',
            ]
          : [
              'Całkowita tyreoidektomia',
              'Limfadenektomia centralna: po stronie guza lub obustronna',
              'Biopsja chirurgiczna węzłów bocznych po stronie guza',
            ];
      setPriorityRec(
        `Bethesda ${beth || 'V/VI'} + cT1aN0: rekomendowany zakres operacji`,
        subs
      );

      // Dodatkowa uwaga dot. indywidualizacji (jeśli kiedyś wróci selektor wieku/pokwitaniowy)
      if (older && dtcSubtype === 'ptc') {
        items.push({
          text: 'U wybranych starszych nastolatków (ok. >14 rż./Tanner 5) lobektomia z cieśnią może być rozważana (indywidualizacja).',
        });
      }
    
    } else if (cT === 'cT1a' && (cN === 'N1a' || cN === 'Nx')) {
      setPriorityRec(
        `Bethesda ${beth || 'V/VI'} + cT1a oraz N1a/Nx: rekomendowany zakres operacji`,
        [
          'Całkowita tyreoidektomia',
          'Limfadenektomia centralna obustronna (terapeutyczna w przypadku N1a)',
          'Biopsja chirurgiczna węzłów bocznych po stronie guza',
        ]
      );
      if (cN === 'Nx') {
        items.push({
          text: 'Jeśli ocena węzłów niepewna (Nx): uzupełnij przedoperacyjnie USG węzłów i rozważ BACC podejrzanych węzłów.',
        });
      }
    } else if (cT === 'cT1a' && cN === 'N1b') {
      setPriorityRec(
        `Bethesda ${beth || 'V/VI'} + cT1aN1b: rekomendowany zakres operacji`,
        [
          'Całkowita tyreoidektomia',
          'Limfadenektomia centralna obustronna',
          'Limfadenektomia boczna (terapeutyczna) po stronie zajętej',
          'Biopsja chirurgiczna węzłów bocznych po stronie przeciwnej',
        ]
      );
    } else if (cT === 'cT1b3' && (cN === 'N0' || cN === 'N1a' || cN === 'Nx')) {
      const recSubs =
        dtcSubtype === 'ftc' && cN === 'N0'
          ? [
              'Całkowita tyreoidektomia',
              'Centralna limfadenektomia profilaktyczna: do rozważenia (w wysokozróżnicowanym FTC nie jest bezwzględnie konieczna przy N0).',
              'Węzły boczne: postępowanie terapeutyczne po potwierdzeniu przerzutu.',
            ]
          : [
              'Całkowita tyreoidektomia',
              'Limfadenektomia centralna obustronna',
              'Biopsja chirurgiczna węzłów bocznych po stronie guza',
            ];
      const nLabel = cN === 'Nx' ? 'N0–N1a lub Nx' : 'N0–N1a';
      setPriorityRec(
        `Bethesda ${beth || 'V/VI'} + cT1b–3 oraz ${nLabel}: rekomendowany zakres operacji`,
        recSubs
      );
      if (cN === 'Nx') {
        items.push({
          text: 'Jeśli ocena węzłów niepewna (Nx): uzupełnij przedoperacyjnie USG węzłów i rozważ BACC podejrzanych węzłów.',
        });
      }
    } else if (cT === 'cT1b3' && cN === 'N1b') {
      setPriorityRec(
        `Bethesda ${beth || 'V/VI'} + cT1b–3N1b: rekomendowany zakres operacji`,
        [
          'Całkowita tyreoidektomia',
          'Limfadenektomia centralna obustronna',
          'Limfadenektomia boczna (terapeutyczna) po stronie zajętej',
          'Biopsja chirurgiczna węzłów bocznych po stronie przeciwnej',
        ]
      );
    } else {
      items.push({
        text: 'Dla tego zestawu cT/N brak jednoznacznej ścieżki w schemacie zaleceń — rozważ konsylium i doprecyzowanie oceny węzłów/zaawansowania.',
      });
    }

    items.push({
      text: 'Uwagi do operacji węzłowej:',
      subs: [
        'Preferowana jest limfadenektomia przedziałowa (blokowa) — nie zaleca się techniki „berry picking”.',
        dtcSubtype === 'ftc'
          ? 'W wysokozróżnicowanym raku pęcherzykowym (FTC) centralna limfadenektomia nie jest bezwzględnie konieczna przy braku cech zajęcia węzłów (N0); przy N1 ma charakter terapeutyczny.'
          : 'Centralna limfadenektomia jest zalecana u większości dzieci; w jednoogniskowym cT1aN0M0 można ograniczyć zakres do strony guza (ipsilateralnie).',
        'Limfadenektomię boczną rozważa się m.in. gdy w HP stwierdza się mikroprzerzuty w >1 węźle chłonnym lub przerzut w 1 węźle chłonnym >2 mm.',
      ],
    });

    if (beth === 'V') {
      items.push({
        text: 'W kategorii Bethesda V można rozważyć wykonanie śródoperacyjnego badania doraźnego preparatu z płata tarczycy zawierającego guz; wynik tego badania może stanowić podstawę do modyfikacji planowanego zakresu operacji.',
      });
    }

    sections.push({
      title: 'Leczenie operacyjne',
      items,
    });

    const priorityHtml = priorityCard.main ? buildPriorityCardHtml(priorityCard) : '';
    const priorityPlain = priorityCard.main ? buildPriorityCardPlain(priorityCard) : '';
    const sectionsHtml = buildSectionsHtml(sections);
    const sectionsPlain = buildSectionsPlain(sections);

    return {
      sections,
      html: `${priorityHtml}${sectionsHtml}`,
      plain: [priorityPlain, sectionsPlain].filter(Boolean).join('\n\n').trim(),
    };
  }

  // --------------------------------------
  // Rak rdzeniasty (MTC) — skrót przedoperacyjny
  // (na podstawie części V zaleceń: rozpoznanie i leczenie MTC u dzieci)
  // --------------------------------------
  function getPreopMtcPlan(state) {
    const beth = state.bethesda || '';
    const cN = state.cN || 'Nx';
    const calc = state.calcitonin || 'unknown';

    const sections = [];
    const items = [];

    // Najważniejsze zalecenie (wyróżnione na fioletowo) — rekomendowany zakres operacji
    const priorityCard = {
      title: 'Najważniejsze zalecenie',
      main: '',
      bullets: [],
      groups: [],
    };

    function setPriorityRec(label, bullets) {
      priorityCard.main = label;
      priorityCard.bullets = Array.isArray(bullets) ? bullets.filter(Boolean) : [];
    }

    const bethPrefix = beth ? `Bethesda ${beth} + ` : '';

    if (cN === 'N1b') {
      setPriorityRec(
        `${bethPrefix}MTC + cN1b: rekomendowany zakres operacji`,
        [
          'Całkowita tyreoidektomia z limfadenektomią centralną.',
          'Limfadenektomia boczna terapeutyczna po stronie zajętej.',
        ]
      );
    } else if (cN === 'Nx') {
      const priorityBullets = [
        'Co najmniej całkowita tyreoidektomia z limfadenektomią centralną.',
        'O potrzebie limfadenektomii bocznej zdecyduj po uzupełnieniu oceny węzłów w USG szyi oraz po analizie przedoperacyjnego stężenia kalcytoniny.',
      ];
      if (calc === 'ge400') {
        priorityBullets.push('Przy kalcytoninie ≥ 400 ng/l przed planowaniem pełnego leczenia wykonaj ocenę w kierunku przerzutów odległych.');
      }
      setPriorityRec(
        `${bethPrefix}MTC + cNx: zakres operacji wymaga doprecyzowania oceny węzłów`,
        priorityBullets
      );
    } else if (calc === 'lt150' || calc === '150-199') {
      const nLabel = cN === 'N1a' ? 'cN1a' : 'cN0';
      setPriorityRec(
        `${bethPrefix}MTC + ${nLabel} i kalcytonina < 200 ng/l: rekomendowany zakres operacji`,
        [
          'Całkowita tyreoidektomia z limfadenektomią centralną.',
          'Przy braku podejrzanych węzłów bocznych w USG brak jednoznacznych wskazań do elektywnej limfadenektomii bocznej.',
        ]
      );
    } else if (calc === '200-399') {
      const nLabel = cN === 'N1a' ? 'cN1a' : 'cN0';
      setPriorityRec(
        `${bethPrefix}MTC + ${nLabel} i kalcytonina ≥ 200 ng/l: rekomendowany zakres operacji`,
        [
          'Całkowita tyreoidektomia z limfadenektomią centralną.',
          'Zakres limfadenektomii bocznej należy rozważyć indywidualnie w powiązaniu z obrazem USG/cN.',
        ]
      );
    } else if (calc === 'ge400') {
      const nLabel = cN === 'N1a' ? 'cN1a' : 'cN0';
      setPriorityRec(
        `${bethPrefix}MTC + ${nLabel} i kalcytonina ≥ 400 ng/l: rekomendowany zakres operacji`,
        [
          'Całkowita tyreoidektomia z limfadenektomią centralną.',
          'Zakres limfadenektomii bocznej ustal indywidualnie w powiązaniu z obrazem USG/cN.',
          'Przed planowaniem pełnego zakresu leczenia wykonaj ocenę w kierunku przerzutów odległych.',
        ]
      );
    } else {
      const nLabel = cN === 'N1a' ? 'cN1a' : 'cN0';
      setPriorityRec(
        `${bethPrefix}MTC + ${nLabel}: rekomendowany zakres operacji`,
        [
          'Całkowita tyreoidektomia z limfadenektomią centralną.',
          'Zakres limfadenektomii bocznej ustal na podstawie obrazu węzłów w USG/cN oraz przedoperacyjnego stężenia kalcytoniny.',
        ]
      );
    }

    items.push({
      text: 'Wybrano podejrzenie/rozpoznanie: rak rdzeniasty tarczycy (MTC). Wymaga to innego podejścia niż DTC (PTC/FTC).',
    });

    items.push({
      text: 'Potwierdzenie rozpoznania i przygotowanie do operacji:',
      subs: [
        'Rozpoznanie MTC w BACC bywa trudne — pomocne jest barwienie immunocytochemiczne z przeciwciałami przeciw kalcytoninie oraz oznaczenie kalcytoniny w surowicy (± w popłuczynach z igły).',
        'Kalcytonina > 100 ng/l czyni rozpoznanie MTC bardzo prawdopodobnym; w przypadkach wątpliwych można wykonać test stymulacji wydzielania kalcytoniny (np. próbę wapniową).',
        'U każdego chorego z rozpoznaniem MTC zaleca się badanie DNA (mutacje RET), nawet bez dodatniego wywiadu rodzinnego.',
        'Jeżeli stwierdzono mutację RET lub istnieje podejrzenie zespołu MEN2: przed planową tyreoidektomią wykonaj diagnostykę w kierunku guza chromochłonnego (badania biochemiczne ± USG jamy brzusznej) oraz oznacz wapń (± PTH) w kierunku pierwotnej nadczynności przytarczyc.',
        'W przypadku podejrzenia/potwierdzenia guza chromochłonnego leczenie nadnerczy powinno poprzedzać operację tarczycy (redukcja ryzyka przełomu nadciśnieniowego).',
      ],
    });

    const surgSubs = [
      'Całkowita tyreoidektomia + limfadenektomia centralna (zalecane zawsze w MTC jawnym klinicznie, niezależnie od tła dziedzicznego/sporadycznego).',
      'U chorego z mutacją RET / podejrzeniem MEN2: przed planową tyreoidektomią wyklucz guz chromochłonny; w razie potwierdzenia leczenie nadnerczy powinno poprzedzać operację tarczycy.',
    ];

    const calcitoninLateralDissectionThresholdNote = cN === 'N1b'
      ? 'Próg 150 ng/l z zaleceń ATA nie stanowi samodzielnego wskazania do limfadenektomii bocznej. W sytuacji podejrzenia lub potwierdzenia zajęcia węzłów bocznych wskazaniem do operacji jest sama obecność choroby węzłowej; stężenie kalcytoniny pomaga natomiast ocenić prawdopodobny zasięg choroby. Jeżeli zmiany boczne są obecne po jednej stronie, a po stronie przeciwnej nie stwierdza się ich w obrazowaniu, przy kalcytoninie > 200 ng/l zalecenia ATA wskazują na potrzebę rozważenia także limfadenektomii po stronie przeciwnej.'
      : 'Próg 150 ng/l z zaleceń ATA nie stanowi samodzielnego wskazania do elektywnej limfadenektomii bocznej. Jeżeli w USG/cN nie ma cech zajęcia węzłów bocznych, a kalcytonina jest < 200 ng/l, nie ma jednoznacznych wskazań do rutynowej limfadenektomii bocznej; decyzja pozostaje indywidualna. Zalecenia ATA dopuszczają rozważenie limfadenektomii bocznej na podstawie stężenia kalcytoniny i obrazu klinicznego, natomiast wyraźny próg operacyjny dotyczy sytuacji, gdy po jednej stronie są obecne przerzutowe węzły boczne — wtedy przy kalcytoninie > 200 ng/l należy rozważyć także limfadenektomię po stronie przeciwnej.';

    // Boczne węzły: zależnie od przerzutów i/lub kalcytoniny
    if (cN === 'N1b') {
      surgSubs.push('Limfadenektomia boczna: terapeutyczna po stronie zajętej (przy podejrzeniu/przerzutach węzłowych bocznych).');
    } else {
      surgSubs.push('Limfadenektomia boczna: decyzja zależy od oceny węzłów w USG/cN oraz stężenia kalcytoniny.');
    }

    // Kalcytonina — wskazówki praktyczne z zaleceń
    if (calc === 'unknown') {
      surgSubs.push('Jeżeli to możliwe, oznacz kalcytoninę przedoperacyjnie — pomaga w planowaniu zakresu limfadenektomii (zwłaszcza bocznej).');
      surgSubs.push(calcitoninLateralDissectionThresholdNote);
    } else if (calc === 'lt150' || calc === '150-199') {
      surgSubs.push(calcitoninLateralDissectionThresholdNote);
    } else if (calc === '200-399') {
      surgSubs.push('Kalcytonina ≥ 200 ng/l zwiększa prawdopodobieństwo przerzutów węzłowych — zakres limfadenektomii bocznej należy rozważyć indywidualnie (w powiązaniu z obrazem USG/cN).');
    } else if (calc === 'ge400') {
      surgSubs.push('Kalcytonina ≥ 400 ng/l: zalecana jest przedoperacyjna ocena w kierunku przerzutów odległych (np. TK jamy brzusznej) przed ustaleniem pełnego zakresu leczenia.');
      surgSubs.push('Zakres limfadenektomii bocznej rozważ szczególnie uważnie (w powiązaniu z USG/cN).');
    }

    if (cN === 'Nx') {
      surgSubs.push('Jeśli ocena węzłów niepewna (Nx): uzupełnij USG węzłów szyi przed operacją.');
    }

    items.push({
      text: 'Leczenie operacyjne (MTC — przed operacją):',
      subs: surgSubs,
    });

    if (beth) {
      items.push({
        text: 'Uwaga: kategoria Bethesda w BACC może być pomocna jako informacja o podejrzeniu złośliwości, ale w MTC kluczowe jest potwierdzenie rozpoznania (kalcytonina / immunocytochemia) i właściwe przygotowanie do operacji.',
      });
    }

    sections.push({ title: 'Postępowanie przedoperacyjne (MTC)', items });

    const priorityHtml = priorityCard.main ? buildPriorityCardHtml(priorityCard) : '';
    const priorityPlain = priorityCard.main ? buildPriorityCardPlain(priorityCard) : '';

    return {
      sections,
      html: `${priorityHtml}${buildSectionsHtml(sections)}`,
      plain: [priorityPlain, buildSectionsPlain(sections)].filter(Boolean).join('\n\n').trim(),
    };
  }

  // --------------------------------------
  // Inny/niepewny histotyp — komunikat bezpieczeństwa
  // --------------------------------------
  function getPreopOtherPlan(state) {
    const sections = [];
    const items = [];

    items.push({
      text: 'Wybrano: inny / niepewny typ nowotworu. Rekomendacje w module koncentrują się głównie na DTC (PTC/FTC) oraz MTC.',
      subs: [
        'Jeśli podejrzenie dotyczy MTC (np. kalcytonina / cechy cytologiczne) — wybierz „MTC”, aby zobaczyć właściwe zalecenia.',
        'Rak anaplastyczny u dzieci jest skrajnie rzadki; w takich sytuacjach postępowanie wymaga indywidualizacji i leczenia w ośrodku referencyjnym (konsylium wielodyscyplinarne).',
      ],
    });

    sections.push({ title: 'Postępowanie przedoperacyjne (inne / niepewne)', items });
    return { sections, html: buildSectionsHtml(sections), plain: buildSectionsPlain(sections) };
  }

  function classifyAtaRisk(post) {
    // post: {m, pN, ete, resection, aggressive, vascular, nodeBurden, uptakeOutside, highTg}
    // Returns 'low'|'intermediate'|'high'|'unknown' (ATA 2015 pediatric risk groups)
    const m = post.m;
    const pN = post.pN; // optional (N0/N1a/N1b/Nx)
    const ete = post.ete;
    const resection = post.resection;
    const incomplete = resection === 'incomplete';
    const aggressive = !!post.aggressive;
    const vascular = !!post.vascular;
    const nodeBurden = post.nodeBurden; // n0|micro|moderate|large|unknown
    const uptakeOutside = post.uptakeOutside; // yes|no|unknown
    const highTg = !!post.highTg;

    const hasN1 = pN === 'N1a' || pN === 'N1b';
    const mUnknown = !m || m === 'Mx';
    const eteUnknown = ete === 'unknown';
    const rUnknown = resection === 'unknown';
    const nUnknown = nodeBurden === 'unknown';

    // High risk (ATA 2015)
    if (m === 'M1') return 'high';
    if (ete === 'extensive') return 'high';
    if (incomplete) return 'high';
    if (nodeBurden === 'large') return 'high';
    if (highTg) return 'high';

    // Intermediate risk features (ATA 2015)
    const intermediateFlags = [];
    if (ete === 'micro') intermediateFlags.push(true);
    if (aggressive) intermediateFlags.push(true);
    if (vascular) intermediateFlags.push(true);
    if (nodeBurden === 'moderate') intermediateFlags.push(true);
    if (uptakeOutside === 'yes') intermediateFlags.push(true);

    // If pN suggests nodal disease but node burden is set to "no metastases" — treat at least as intermediate (data inconsistency)
    if (hasN1 && nodeBurden === 'n0') intermediateFlags.push(true);

    if (intermediateFlags.length) return 'intermediate';

    // No high/intermediate features present.
    // To classify as *low* risk, we must be reasonably sure that key "must-be-absent" criteria are satisfied:
    // - no distant metastases (M0)
    // - no ETE
    // - complete resection (R0)
    // - nodal status either N0 or ≤5 micrometastases <0.2 cm
    if (mUnknown || eteUnknown || rUnknown) return 'unknown';

    // If nodal status is uncertain, we cannot reliably separate low (≤5 micromets) from intermediate (clinically N1 / >5 nodes 0.2–3 cm).
    if (nUnknown) {
      if (pN === 'N0') {
        // OK: treat as no nodal metastases
      } else if (hasN1) {
        return 'unknown';
      } else if (!pN || pN === 'Nx') {
        return 'unknown';
      }
    }

    // Another common inconsistency: pN marked as N0 but "micro" nodal disease selected.
    if (pN === 'N0' && nodeBurden === 'micro') return 'unknown';

    return 'low';
  }

  function getRiskLabel(risk) {
    if (risk === 'low') return 'Rak niskiego ryzyka (ATA 2015)';
    if (risk === 'intermediate') return 'Rak pośredniego ryzyka (ATA 2015)';
    if (risk === 'high') return 'Rak wysokiego ryzyka (ATA 2015)';
    return 'Nieokreślone ryzyko';
  }

  // --------------------------
  // Dynamiczna stratyfikacja ryzyka nawrotu zróżnicowanego raka tarczycy
  // --------------------------
  const DYN_RESPONSE_LABELS = {
    unknown: 'Nie wybrano',
    excellent: 'Doskonała odpowiedź',
    bio_incomplete: 'Niepełna odpowiedź biochemiczna',
    struct_incomplete: 'Niepełna odpowiedź strukturalna',
    indeterminate: 'Nieokreślona odpowiedź',
  };

  function getDynResponseLabel(code) {
    return DYN_RESPONSE_LABELS[code] || DYN_RESPONSE_LABELS.unknown;
  }

  function inferDynTxType(surgery, i131) {
    if (surgery === 'lobectomy') return 'lobectomy';
    if (surgery === 'total') {
      if (i131 === 'yes') return 'total_i131';
      if (i131 === 'no') return 'total_no_i131';
      return 'total_unknown';
    }
    return 'unknown';
  }

  function getDynTxLabel(txType) {
    if (txType === 'total_i131') return 'Tyreoidektomia całkowita + pooperacyjne leczenie ¹³¹I';
    if (txType === 'total_no_i131') return 'Tyreoidektomia całkowita bez pooperacyjnego leczenia ¹³¹I';
    if (txType === 'lobectomy') return 'Lobektomia';
    if (txType === 'total_unknown') return 'Tyreoidektomia całkowita (nie wiadomo, czy zastosowano pooperacyjne leczenie ¹³¹I)';
    return 'Nieokreślone pierwotne leczenie';
  }

  const DYN_CRITERIA = {
    total_i131: {
      excellent: [
        'Prawidłowe wyniki badań obrazowych',
        'Tg niestymulowana ≤ 1 ng/ml lub Tg stymulowana ≤ 2 ng/ml',
        'Nieoznaczalne TgAb',
      ],
      bio_incomplete: [
        'Prawidłowe wyniki badań obrazowych',
        'Tg niestymulowana > 1 ng/ml lub Tg stymulowana > 10 ng/ml lub narastające stężenie TgAb',
      ],
      struct_incomplete: [
        'Obecność przetrwałej choroby w badaniach obrazowych niezależnie od stężenia Tg i TgAb',
      ],
      indeterminate: [
        'Niejednoznaczne wyniki badań obrazowych lub niewielki wychwyt ¹³¹I w loży tarczycy',
        'Tg stymulowana wykrywalna, ale < 10 ng/ml, lub TgAb stabilne/zanikające przy braku cech przetrwałej choroby w badaniach obrazowych',
      ],
    },
    total_no_i131: {
      excellent: [
        'Prawidłowe wyniki badań obrazowych',
        'Tg niestymulowana ≤ 1 ng/ml lub Tg stymulowana ≤ 2 ng/ml',
        'Nieoznaczalne TgAb',
      ],
      bio_incomplete: [
        'Prawidłowe wyniki badań obrazowych',
        'Tg niestymulowana > 5 ng/ml lub Tg stymulowana > 10 ng/ml',
        'Narastające stężenie Tg w czasie (przy porównywalnych stężeniach TSH) lub rosnące TgAb',
      ],
      struct_incomplete: [
        'Obecność przetrwałej choroby w badaniach obrazowych niezależnie od stężenia Tg i TgAb',
      ],
      indeterminate: [
        'Niejednoznaczne wyniki badań obrazowych lub niewielki wychwyt ¹³¹I w loży tarczycy',
        'Tg niestymulowana 0,2–5 ng/ml lub Tg stymulowana 2–10 ng/ml',
        'TgAb stabilne/zanikające przy braku cech przetrwałej choroby w badaniach obrazowych',
      ],
    },
    lobectomy: {
      excellent: [
        'Prawidłowe wyniki badań obrazowych',
        'Stabilna Tg niestymulowana < 30 ng/ml',
        'Nieoznaczalne TgAb',
      ],
      bio_incomplete: [
        'Prawidłowe wyniki badań obrazowych',
        'Tg niestymulowana > 30 ng/ml lub narastające stężenie Tg w czasie (przy porównywalnych stężeniach TSH) lub rosnące TgAb',
      ],
      struct_incomplete: [
        'Obecność przetrwałej choroby w badaniach obrazowych niezależnie od stężenia Tg i TgAb',
      ],
      indeterminate: [
        'Niejednoznaczne wyniki badań obrazowych lub TgAb stabilne/zanikające przy braku cech przetrwałej choroby w badaniach obrazowych',
      ],
    },
  };

  function getDynCriteria(txType, response) {
    const col = DYN_CRITERIA[txType];
    if (!col) return [];
    return col[response] || [];
  }

  function getPostopCancerPlan(state) {
    const histology = state.histology || ''; // ''|dtc|ump|mtc|other|unknown

    if (!histology || histology === 'unknown') {
      const sections = [];
      const items = [
        {
          text: 'Wybierz typ histopatologiczny, aby wyświetlić zalecenia pooperacyjne.',
        },
      ];

      sections.push({ title: 'Postępowanie pooperacyjne', items });
      return { sections, html: buildSectionsHtml(sections), plain: buildSectionsPlain(sections) };
    }

    // --- Rak rdzeniasty (MTC) ---
    // W MTC nie stosuje się pooperacyjnej klasyfikacji ATA (2015) ani monitorowania opartego o Tg.
    if (histology === 'mtc') {
      const sections = [];
      const items = [];

      items.push({ text: 'Wybrano typ histopatologiczny: rak rdzeniasty tarczycy (MTC).' });

      items.push({
        text: 'Ocena pooperacyjna i monitorowanie (MTC)',
        subs: [
          'Ocena radykalności operacji: pooperacyjne stężenie kalcytoniny – normalizacja/niewykrywalne stężenie jest najlepszym dowodem radykalności i korzystnym czynnikiem rokowniczym.',
          'Jeżeli podstawowe stężenie kalcytoniny jest prawidłowe, można rozważyć próbę stymulacji wapniem (praktyka europejska) – ujemny wynik jest dobrym czynnikiem rokowniczym.',
          'Warto wyznaczyć czas podwojenia stężenia kalcytoniny (doubling time) – ma znaczenie rokownicze i predykcyjne.',
          'Dalsze monitorowanie: kalcytonina + USG szyi + CEA. Badania obrazowe (TK/MR/PET) zwykle tylko przy istotnym wzroście kalcytoniny (np. >150 ng/L, częściej >400 ng/L).',
        ],
      });

      items.push({
        text: 'Bezobjawowy wzrost kalcytoniny',
        subs: [
          'Przy kalcytoninie ≤150 ng/L zwykle nie ma uzasadnienia dla TK/MR/PET (mała wykrywalność ognisk).',
          'Przy wyższych stężeniach (np. >400–1000 ng/L) rośnie szansa lokalizacji ogniska, ale możliwe są wyniki fałszywie ujemne.',
          'Można rozważyć limfadenektomię centralną (jeśli wcześniej nie wykonano) i/lub elektywną limfadenektomię boczną; częstą przyczyną wzrostu kalcytoniny mogą być mikroprzerzuty do wątroby.',
        ],
      });

      items.push({
        text: 'Nawrót / choroba zaawansowana (MTC)',
        subs: [
          'Nawrót miejscowy i lokoregionalny: podstawą leczenia jest leczenie operacyjne.',
          'W chorobie nieresekcyjnej/uogólnionej leczenie systemowe (np. wandetanib, kabozantynib) i terapie celowane (np. selperkatynib u dzieci ≥12 rż. z mutacją RET) rozważa się indywidualnie w zespole wielodyscyplinarnym i prowadzi w ośrodku wyspecjalizowanym.',
        ],
      });

      sections.push({ title: 'Rak rdzeniasty tarczycy (MTC) — postępowanie pooperacyjne', items });
      return { sections, html: buildSectionsHtml(sections), plain: buildSectionsPlain(sections) };
    }

    // --- Inny / rzadki histotyp ---
    if (histology === 'other') {
      const sections = [];
      const items = [];

      items.push({ text: 'Wybrano typ histopatologiczny: inny / rzadki histotyp nowotworu tarczycy.' });

      items.push({
        text: 'Jak interpretować wynik w tej aplikacji',
        subs: [
          'Wytyczne opisują szczegółowo algorytmy dla DTC (rak z komórek pęcherzykowych) oraz MTC. Dla rzadkich histotypów (np. PDTC/ATC, raki typu śliniankowego, guzy o niepewnej histogenezie, guzy grasicy wewnątrztarczycowe, thyroblastoma) nie ma jednego, uniwersalnego schematu.',
          'Zalecane jest postępowanie w ośrodku referencyjnym w ramach zespołu wielodyscyplinarnego (chirurg dziecięcy / endokrynolog / onkolog / medycyna nuklearna / patomorfolog).',
          'Ustal marker i plan monitorowania zależnie od histologii (Tg nie zawsze jest właściwym markerem).',
        ],
      });

      sections.push({ title: 'Inny / rzadki nowotwór tarczycy — uwagi pooperacyjne', items });
      return { sections, html: buildSectionsHtml(sections), plain: buildSectionsPlain(sections) };
    }

    

    // --- Guzy o nieustalonym potencjale złośliwości (UMP / NIFTP) ---
    // Zalecone w części 8 rekomendacji (monitorowanie guzów o nieustalonym potencjale złośliwości)
    if (histology === 'ump') {
      const sections = [];
      const items = [];

      const surgery = state.surgery || 'unknown';

      items.push({
        text: 'Wybrano typ histopatologiczny: guz o nieustalonym potencjale złośliwości (np. NIFTP, FT-UMP — guz pęcherzykowy o nieustalonym potencjale złośliwości, WDT-UMP — wysoko zróżnicowany guz o nieustalonym potencjale złośliwości).',
      });

      const subs = [
        'Brakuje danych pediatrycznych wysokiej jakości; poniższe zalecenia mają charakter ekspercki.',
        'Utrzymuj TSH w dolnym zakresie normy (ok. 0,5–2,0 mU/l).',
        'USG tarczycy i węzłów chłonnych szyi wykonuj ok. 1 × w roku, niezależnie od zakresu operacji.',
      ];

      if (surgery === 'total') {
        subs.push('Po tyreoidektomii całkowitej oznaczenia Tg i TgAb mogą być pomocne (interpretuj jak w DTC); w razie obecności TgAb opieraj monitoring przede wszystkim na USG.');
      } else if (surgery === 'lobectomy') {
        subs.push('Po lobektomii Tg jest fizjologicznie wykrywalna (pozostawiony płat) — większe znaczenie ma trend w czasie (w porównywalnych warunkach TSH, tą samą metodą) oraz USG.');
      } else {
        subs.push('Interpretacja Tg zależy od zakresu operacji (tyreoidektomia całkowita vs lobektomia).');
      }

      subs.push('Pooperacyjne leczenie ¹³¹I i dynamiczna stratyfikacja ryzyka (ATA 2015) nie są rutynowo stosowane w tej grupie.');

      items.push({
        text: 'Monitorowanie:',
        subs,
      });

      sections.push({ title: 'Guzy o nieustalonym potencjale złośliwości', items });
      return { sections, html: buildSectionsHtml(sections), plain: buildSectionsPlain(sections) };
    }

const pT = state.pT;
    const pN = state.pN;
    const pM = state.pM;

    const surgery = state.surgery; // total|lobectomy|unknown
    const ete = state.ete; // none|micro|extensive|unknown
    const resection = state.resection; // R0|incomplete|unknown
    const aggressive = !!state.aggressive;
    const vascular = !!state.vascular;
    const nodeBurden = state.nodeBurden; // n0|micro|moderate|large|unknown
    const uptakeOutside = state.uptakeOutside; // yes|no|unknown
    const highTg = !!state.highTg;
    const stimTg = state.stimTg; // number or null
    const dxNoUptake = !!state.dxNoUptake;

    const i131 = state.i131; // yes|no|unknown
    const dynResponse = state.dynResponse; // excellent|bio_incomplete|struct_incomplete|indeterminate|unknown

    const sections = [];
    const itemsSummary = [];

    const priorityCard = {
      title: 'Najważniejsze zalecenia pooperacyjne',
      main: '',
      bullets: [],
      groups: [],
    };

    const NED_GEN = 'braku cech przetrwałej choroby (NED, no evidence of disease)';

    function addPriorityGroup(title, items) {
      const cleanItems = Array.isArray(items) ? items.filter(Boolean) : [];
      if (!cleanItems.length) return;
      priorityCard.groups.push({ title, items: cleanItems });
    }

    function getPriorityTshSummary() {
      if (dynResponse === 'struct_incomplete') {
        return 'przetrwała lub nawrotowa choroba: zwykle < 0,1 mU/l.';
      }
      if (dynResponse === 'bio_incomplete') {
        return `utrzymuj supresję 0,1–0,5 mU/l do czasu uzyskania ${NED_GEN}.`;
      }
      if (dynResponse === 'indeterminate') {
        return 'utrzymuj supresję adekwatną do wyjściowej grupy ryzyka do czasu ponownej oceny.';
      }
      if (dynResponse === 'excellent') {
        if (risk === 'low') {
          return `aktualny cel TSH: 0,1–0,5 mU/l. W raku niskiego ryzyka supresję zwykle utrzymuje się przez 12 miesięcy od okresu pooperacyjnego; dopiero po tym czasie, jeśli utrzymuje się doskonała odpowiedź i ${NED_GEN}, można przejść do leczenia substytucyjnego z TSH < 2,0 mU/l.`;
        }
        if (risk === 'intermediate') {
          return `aktualny cel TSH: 0,1–0,5 mU/l. W raku pośredniego ryzyka supresję zwykle utrzymuje się przez 5 lat; dopiero po tym czasie, jeśli utrzymuje się doskonała odpowiedź i ${NED_GEN}, można stopniowo przejść do TSH < 2,0 mU/l.`;
        }
        if (risk === 'high') {
          return `aktualny cel TSH: 0,1–0,5 mU/l. W raku wysokiego ryzyka supresję zwykle utrzymuje się przez co najmniej 10 lat; skrócenie tego okresu można rozważać wyłącznie ostrożnie i indywidualnie zgodnie z dynamiczną oceną odpowiedzi. Po potwierdzeniu trwałego ${NED_GEN} docelowo TSH < 2,0 mU/l.`;
        }
        return 'przy doskonałej odpowiedzi deeskalację rozważ dopiero po powiązaniu wyniku dynamicznej oceny z wyjściową grupą ryzyka i po potwierdzeniu trwałej remisji.';
      }
      if (risk === 'low') {
        return '0,1–0,5 mU/l przez 12 miesięcy; następnie, przy braku cech choroby, leczenie substytucyjne z TSH < 2,0 mU/l.';
      }
      if (risk === 'intermediate') {
        return '0,1–0,5 mU/l przez 5 lat; następnie, przy braku cech choroby, TSH < 2,0 mU/l.';
      }
      if (risk === 'high') {
        return `0,1–0,5 mU/l przez co najmniej 10 lat; przy przetrwałej/wznowionej chorobie rozważ < 0,1 mU/l, a po uzyskaniu ${NED_GEN} docelowo TSH < 2,0 mU/l.`;
      }
      return '0,1–0,5 mU/l w okresie pooperacyjnym; dalszy cel zależy od ostatecznej klasyfikacji ryzyka i odpowiedzi na leczenie.';
    }

    function getPriorityI131Label() {
      return i131 === 'yes' ? 'Pooperacyjne leczenie ¹³¹I' : 'Leczenie uzupełniające ¹³¹I';
    }

    function getPriorityI131Summary() {
      if (surgery === 'lobectomy') {
        if (risk === 'low') {
          return 'po samej lobektomii zwykle nie dotyczy; po całkowitym wycięciu tarczycy w raku niskiego ryzyka można odstąpić od leczenia uzupełniającego ¹³¹I, jeśli DxWBS nie wykazuje gromadzenia poza lożą tarczycy, a Tg stymulowana < 10 ng/ml.';
        }
        if (risk === 'intermediate' || risk === 'high') {
          return 'po samej lobektomii leczenie uzupełniające ¹³¹I zwykle nie dotyczy; jeżeli planowane jest całkowite wycięcie tarczycy, pacjent powinien zostać zakwalifikowany do oceny pod kątem leczenia uzupełniającego ¹³¹I, ponieważ w pośrednim/wysokim ryzyku nie przewidziano kryteriów rutynowego odstąpienia od radiojodu analogicznych do raka niskiego ryzyka.';
        }
        return 'decyzja dotyczy zwykle chorych po całkowitym wycięciu tarczycy i powinna zależeć od ostatecznej klasyfikacji ryzyka.';
      }

      if (i131 === 'yes') {
        if (surgery !== 'total') {
          return 'zaznaczono, że zastosowano pooperacyjne leczenie ¹³¹I; uzupełnij zakres zabiegu i oprzyj dalsze decyzje na wyniku scyntygrafii poterapeutycznej, Tg/TgAb oraz dynamicznej ocenie odpowiedzi.';
        }
        return 'zaznaczono, że zastosowano pooperacyjne leczenie ¹³¹I; po terapii wykonaj scyntygrafię poterapeutyczną całego ciała 3–7 dni po leczeniu, a dalsze decyzje opieraj na wyniku leczenia, Tg/TgAb, badaniach obrazowych i dynamicznej ocenie odpowiedzi.';
      }

      if (risk === 'low') {
        if (dxNoUptake && typeof stimTg === 'number' && stimTg < 10) {
          return 'można odstąpić od leczenia uzupełniającego ¹³¹I (DxWBS bez gromadzenia poza lożą tarczycy + Tg stymulowana < 10 ng/ml).';
        }
        if (dxNoUptake && typeof stimTg === 'number' && stimTg >= 10) {
          return 'w niskim ryzyku Tg stymulowana ≥ 10 ng/ml wymaga interpretacji z uwzględnieniem wielkości pozostawionych kikutów tarczycy; decyzję o leczeniu uzupełniającym ¹³¹I podejmij indywidualnie.';
        }
        return 'w niskim ryzyku można odstąpić od leczenia uzupełniającego ¹³¹I, jeśli DxWBS nie wykazuje gromadzenia poza lożą tarczycy, a Tg stymulowana < 10 ng/ml.';
      }

      if (risk === 'intermediate' || risk === 'high') {
        return 'po całkowitym wycięciu tarczycy pacjent powinien zostać zakwalifikowany do oceny pod kątem leczenia uzupełniającego ¹³¹I; w pośrednim/wysokim ryzyku nie przewidziano kryteriów rutynowego odstąpienia od radiojodu analogicznych do raka niskiego ryzyka. Szczególnie w raku wysokiego ryzyka leczenie uzupełniające ¹³¹I często stanowi istotny element postępowania.';
      }

      return 'decyzję podejmij po uzupełnieniu klasyfikacji ryzyka: w niskim ryzyku możliwe jest odstąpienie przy spełnieniu kryteriów, natomiast w pośrednim/wysokim ryzyku pacjent powinien zostać oceniony pod kątem leczenia uzupełniającego ¹³¹I, szczególnie jeśli ostatecznie zostanie zakwalifikowany do grupy wysokiego ryzyka.';
    }

    function getPriorityDynamicSummary() {
      if (!dynResponse || dynResponse === 'unknown') return '';

      const txType = inferDynTxType(surgery, i131);
      const dynLabel = getDynResponseLabel(dynResponse);

      if (txType === 'unknown' || txType === 'total_unknown') {
        return `${dynLabel}: uzupełnij zakres zabiegu oraz informację, czy zastosowano pooperacyjne leczenie ¹³¹I, aby dobrać właściwe kryteria i zmodyfikować dalsze postępowanie.`;
      }

      const txLabel = getDynTxLabel(txType);

      if (dynResponse === 'excellent') {
        if (risk === 'high') {
          return `${dynLabel} (${txLabel}) — doskonała odpowiedź modyfikuje dalsze postępowanie, ale u chorego wyjściowo wysokiego ryzyka nie znosi wyjściowego celu TSH 0,1–0,5 mU/l i nie uzasadnia automatycznej szybkiej deeskalacji; postępuj ostrożnie i indywidualnie.`;
        }
        if (risk === 'low' || risk === 'intermediate') {
          return `${dynLabel} (${txLabel}) — doskonała odpowiedź pozwala planować późniejszą deeskalację, ale nie znosi wyjściowego celu TSH 0,1–0,5 mU/l utrzymywanego przez okres zależny od grupy ryzyka.`;
        }
        return `${dynLabel} (${txLabel}) — doskonała odpowiedź może modyfikować dalsze postępowanie, ale zakres deeskalacji musi wynikać także z wyjściowej grupy ryzyka.`;
      }
      if (dynResponse === 'bio_incomplete') {
        return `${dynLabel} (${txLabel}) — utrzymuj supresję TSH 0,1–0,5 mU/l i częstsze kontrole Tg/TgAb oraz USG szyi.`;
      }
      if (dynResponse === 'struct_incomplete') {
        return `${dynLabel} (${txLabel}) — traktuj jak przetrwałą lub nawrotową chorobę; zwykle TSH < 0,1 mU/l i dalsze leczenie w ośrodku referencyjnym.`;
      }
      if (dynResponse === 'indeterminate') {
        return `${dynLabel} (${txLabel}) — powtórz ocenę w kolejnych kontrolach i utrzymuj czujniejszy nadzór do czasu reklasyfikacji.`;
      }

      return `${dynLabel} (${txLabel}).`;
    }

    function getPriorityMonitoringSummary() {
      if (dynResponse === 'excellent') {
        return 'Tg i TgAb zwykle co 12 miesięcy przez pierwsze 5 lat; USG szyi w podobnym rytmie; po 5 latach odstępy można wydłużać indywidualnie.';
      }
      if (dynResponse === 'bio_incomplete') {
        return 'Tg i TgAb co 6 miesięcy; USG szyi co 6 miesięcy.';
      }
      if (dynResponse === 'struct_incomplete') {
        return 'brak jednego sztywnego harmonogramu w wytycznych; monitorowanie Tg/TgAb i badań obrazowych dostosuj do lokalizacji choroby oraz dynamiki markerów.';
      }
      if (dynResponse === 'indeterminate') {
        if (risk === 'low') {
          return 'jako punkt wyjścia: Tg i TgAb co 6 miesięcy przez 2 lata, następnie co 12 miesięcy; USG szyi zwykle raz w roku.';
        }
        if (risk === 'intermediate' || risk === 'high') {
          return 'jako punkt wyjścia: Tg i TgAb co 3–6 miesięcy; USG szyi co 6–12 miesięcy.';
        }
        return 'do czasu doprecyzowania ryzyka utrzymuj czujniejszy nadzór i reklasyfikuj odpowiedź w kolejnych kontrolach.';
      }

      if (risk === 'low') {
        return 'USG szyi raz w roku; Tg i TgAb co 6 miesięcy przez pierwsze 2 lata, następnie co 12 miesięcy; po 5 latach odstępy indywidualizuj.';
      }
      if (risk === 'intermediate' || risk === 'high') {
        return `USG szyi co 6–12 miesięcy; Tg i TgAb co 3–6 miesięcy w okresie supresji LT4; po uzyskaniu ${NED_GEN} odstępy można wydłużyć do 12 miesięcy.`;
      }
      return 'po ustaleniu ryzyka: niskie — USG co 12 miesięcy, Tg/TgAb co 6 miesięcy przez 2 lata; pośrednie/wysokie — USG co 6–12 miesięcy, Tg/TgAb co 3–6 miesięcy.';
    }

    function getPriorityScintigraphySummary() {
      return 'Diagnostyczna scyntygrafia całego ciała nie jest rutynowym badaniem okresowym; rozważ ją przy podejrzeniu choroby resztkowej, wzroście Tg lub kwalifikacji do leczenia ¹³¹I. Jeżeli DxWBS nie wykazała patologicznego gromadzenia poza lożą tarczycy, a stymulowana Tg ≤ 2 ng/ml, seryjne dalsze badania zwykle nie przynoszą korzyści. Po każdym leczeniu ¹³¹I wykonaj scyntygrafię poterapeutyczną całego ciała 3–7 dni po terapii.';
    }

    if (!pT && !pN && !pM) {
      itemsSummary.push({ text: 'Uzupełnij pTNM (np. pT1a pN0 pM0) aby wygenerować postępowanie pooperacyjne.' });
      sections.push({ title: 'Postępowanie pooperacyjne', items: itemsSummary });
      return { sections, html: buildSectionsHtml(sections), plain: buildSectionsPlain(sections) };
    }

    const tn = `${pT ? `p${pT}` : 'pT?'} ${pN ? `p${pN}` : 'pN?'} ${pM ? `p${pM}` : 'pM?'}`.trim();
    const stage = pM === 'M1' ? 'Stopień II (M1)' : pM === 'M0' ? 'Stopień I (M0)' : 'Stopień kliniczny zależny od M (M0→I, M1→II)';

    const stageText = `Stopień kliniczny u dzieci (AJCC/UICC): ${stage}.`;
    const stageHtml = `Stopień kliniczny u dzieci (AJCC/UICC): ${escapeHtml(stage)}.<sup><button type="button" class="thy-info-btn thy-footnote-btn" data-thy-info="stageKids" aria-label="Wyjaśnienie: stopień kliniczny u dzieci (AJCC/UICC)" title="Wyjaśnij stopnie kliniczne (AJCC/UICC) u dzieci">I</button></sup>`;

    itemsSummary.push({
      text: `Podsumowanie: ${tn}`,
      subs: [
        { text: stageText, html: stageHtml },
      ],
    });

    // Map node burden key
    const nodeKey =
      nodeBurden === 'n0'
        ? 'n0'
        : nodeBurden === 'micro'
        ? 'micro'
        : nodeBurden === 'moderate'
        ? 'moderate'
        : nodeBurden === 'large'
        ? 'large'
        : nodeBurden === 'unknown'
        ? 'unknown'
        : 'unknown';

    const risk = classifyAtaRisk({
      m: pM,
      pN,
      ete,
      resection,
      aggressive,
      vascular,
      nodeBurden: nodeKey === 'n0' ? 'n0' : nodeKey === 'micro' ? 'micro' : nodeKey === 'moderate' ? 'moderate' : nodeKey === 'large' ? 'large' : 'unknown',
      uptakeOutside,
      highTg,
    });

    itemsSummary.push({
      text: `Pooperacyjna klasyfikacja ryzyka: ${getRiskLabel(risk)}.`,
    });

    // Gentle warning when key inputs are left as unknown
    const missing = [];
    if (ete === 'unknown') missing.push('naciekanie pozatarczycowe (ETE)');
    if (resection === 'unknown') missing.push('radykalność zabiegu (R0 vs R1/R2)');
    if (nodeKey === 'unknown') missing.push('obciążenie węzłowe (liczba/wielkość węzłów)');
    if (i131 === 'yes' && uptakeOutside === 'unknown') missing.push('wynik scyntygrafii poterapeutycznej po leczeniu ¹³¹I');
    if (!pM || pM === 'Mx') missing.push('M (M0/M1)');
    if (missing.length) {
      itemsSummary.push({
        text: 'Uwaga: część danych pozostaje „nieznana” — klasyfikacja ryzyka jest orientacyjna. Uzupełnij, jeśli dostępne:',
        subs: missing,
      });
    }

    priorityCard.main = `Podsumowanie: ${tn}`;
    addPriorityGroup('Klasyfikacja', [
      `Pooperacyjna klasyfikacja ryzyka: ${getRiskLabel(risk)}.`,
    ]);
    addPriorityGroup('Leczenie', [
      `TSH: ${getPriorityTshSummary()}`,
      `${getPriorityI131Label()}: ${getPriorityI131Summary()}`,
    ]);
    const priorityDynamicSummary = getPriorityDynamicSummary();
    if (priorityDynamicSummary) {
      addPriorityGroup('Dynamiczna stratyfikacja', [priorityDynamicSummary]);
    }
    addPriorityGroup('Monitorowanie', [
      `USG szyi / Tg / TgAb: ${getPriorityMonitoringSummary()}`,
      `Scyntygrafia: ${getPriorityScintigraphySummary()}`,
    ]);

    sections.push({ title: 'Klasyfikacja', items: itemsSummary });

    // Leczenie/monitorowanie
    const plan = [];

    // Jeśli na podstawie podanych danych nie da się jednoznacznie przypisać do grupy ryzyka ATA 2015
    // (np. brak M/ETE/R0 lub brak danych o obciążeniu węzłowym) — pokaż komunikat i podaj zasady ogólne.
    if (risk === 'unknown') {
      plan.push({
        text: 'Nie można jednoznacznie określić pooperacyjnej grupy ryzyka (ATA 2015) na podstawie podanych danych.',
        subs: [
          'Uzupełnij (jeśli dostępne): M (M0/M1), naciek pozatarczycowy (ETE), radykalność (R0 vs R1/R2) oraz obciążenie węzłowe (liczba i wielkość przerzutowych węzłów).',
          'Do czasu uzupełnienia danych decyzje o wtórnym całkowitym wycięciu tarczycy, leczeniu uzupełniającym ¹³¹I i celach supresji TSH podejmuj konsyliarnie.',
        ],
      });
    }

    // Completion thyroidectomy
    if (surgery === 'lobectomy') {
      if (risk === 'low') {
        plan.push({
          text: 'Po lobektomii: u dziecka z rakiem niskiego ryzyka można odstąpić od wtórnego całkowitego wycięcia tarczycy, po omówieniu „za i przeciw” z opiekunami i pacjentem.',
          subs: [
            'Jeśli planowane byłoby leczenie uzupełniające ¹³¹I lub ocena radykalności jest niejednoznaczna — decyzję podejmuj konsyliarnie.',
          ],
        });
      } else {
        plan.push({
          text: 'Po lobektomii: rozważ wtórne całkowite wycięcie tarczycy konsyliarnie na podstawie HP, stopnia zaawansowania, ryzyka nawrotu oraz wskazań do leczenia uzupełniającego ¹³¹I.',
        });
      }
    }

    plan.push({
      text: 'Ocena radykalności i „punkt wyjścia” do dalszego leczenia:',
      subs: [
        'Badania kontrolne (USG szyi, Tg i TgAb, ± scyntygrafia szyi) wykonuj nie wcześniej niż 1–2 miesiące po operacji.',
        'Do oceny scyntygraficznej oraz stężenia Tg konieczna jest stymulacja TSH (egzo- lub endogenna).',
      ],
    });

    const isTotal = surgery === 'total';
    const isLob = surgery === 'lobectomy';
    const i131Val = i131 || 'unknown';

    // ¹³¹I recommendations (uwzględnij zakres operacji i etap leczenia)
    // Uwaga: leczenie uzupełniające ¹³¹I w praktyce dotyczy pacjentów po całkowitym wycięciu tarczycy.
    if (risk === 'low') {
      if (!isTotal) {
        const subs = [
          'Leczenie uzupełniające ¹³¹I rozważa się po całkowitym wycięciu tarczycy.',
        ];
        if (isLob) {
          subs.push('Po lobektomii leczenie uzupełniające ¹³¹I zwykle nie dotyczy.');
          subs.push('Jeśli wykonano lub planuje się całkowite wycięcie tarczycy — decyzję o leczeniu uzupełniającym ¹³¹I podejmuj jak w raku niskiego ryzyka po total (kryteria: DxWBS + Tg stym.).');
        } else {
          subs.push('Uzupełnij zakres operacji (tyreoidektomia całkowita vs lobektomia), aby dopasować rekomendacje dotyczące leczenia uzupełniającego ¹³¹I.');
          subs.push('Jeśli wykonano całkowite wycięcie tarczycy — decyzję o leczeniu uzupełniającym ¹³¹I podejmuj jak w raku niskiego ryzyka po total (kryteria: DxWBS + Tg stym.).');
        }
        plan.push({
          text: 'Leczenie uzupełniające ¹³¹I — rak niskiego ryzyka:',
          subs,
        });
      } else if (i131Val === 'yes') {
        plan.push({
          text: 'Pooperacyjne leczenie ¹³¹I — rak niskiego ryzyka:',
          subs: [
            'Zaznaczono, że zastosowano pooperacyjne leczenie ¹³¹I.',
            'Dalsze postępowanie opieraj na ocenie odpowiedzi na leczenie (dynamicznej), Tg/TgAb, USG szyi oraz wyniku scyntygrafii poterapeutycznej.',
            'Możliwość odstąpienia od leczenia uzupełniającego ¹³¹I w raku niskiego ryzyka dotyczy decyzji podejmowanej przed terapią, gdy DxWBS nie wykazuje gromadzenia poza lożą tarczycy, a Tg stymulowana < 10 ng/ml.',
          ],
        });
      } else {
        const subs = [
          'Od leczenia uzupełniającego ¹³¹I można odstąpić, jeśli w DxWBS (diagnostycznej scyntygrafii całego ciała z użyciem ¹³¹I) nie ma gromadzenia poza lożą tarczycy, a stężenie stymulowanej Tg < 10 ng/ml.',
          'Jeśli Tg stymulowana > 10 ng/ml — interpretuj wynik z uwzględnieniem wielkości pozostawionych kikutów tarczycy.',
        ];
        if (dxNoUptake && typeof stimTg === 'number') {
          if (stimTg < 10) {
            subs.unshift('Na podstawie podanych danych (DxWBS bez gromadzenia poza lożą + Tg stym. <10 ng/ml) można odstąpić od leczenia uzupełniającego ¹³¹I.');
          } else {
            subs.unshift('Na podstawie podanych danych (Tg stym. ≥10 ng/ml) rozważ leczenie uzupełniające ¹³¹I po ocenie klinicznej.');
          }
        }
        plan.push({
          text: 'Leczenie uzupełniające ¹³¹I — rak niskiego ryzyka:',
          subs,
        });
      }
    } else if (risk === 'unknown') {
      if (isTotal && i131Val === 'yes') {
        plan.push({
          text: 'Pooperacyjne leczenie ¹³¹I — ryzyko nieokreślone:',
          subs: [
            'Zaznaczono, że zastosowano pooperacyjne leczenie ¹³¹I.',
            'Uzupełnij klasyfikację ryzyka (M, ETE, R, obciążenie węzłowe), a dalsze decyzje opieraj na wyniku scyntygrafii poterapeutycznej, Tg/TgAb, badaniach obrazowych i dynamicznej ocenie odpowiedzi.',
          ],
        });
      } else {
        const subs = [
          'Jeśli po uzupełnieniu danych ryzyko okaże się niskie — można odstąpić od leczenia uzupełniającego ¹³¹I po spełnieniu kryteriów (DxWBS bez gromadzenia poza lożą + Tg stym. <10 ng/ml).',
          'Jeśli ryzyko okaże się pośrednie lub wysokie — po całkowitym wycięciu tarczycy pacjent powinien zostać zakwalifikowany do oceny pod kątem leczenia uzupełniającego ¹³¹I; nie przewidziano tu kryteriów rutynowego odstąpienia od radiojodu analogicznych do raka niskiego ryzyka.',
        ];
        if (!isTotal) {
          subs.unshift('Zakres zabiegu nie jest określony jako tyreoidektomia całkowita — decyzję o leczeniu uzupełniającym ¹³¹I rozważ po całkowitym wycięciu tarczycy.');
        }
        plan.push({
          text: 'Leczenie uzupełniające ¹³¹I — gdy ryzyko jest nieokreślone' + (isTotal ? ':' : ' (po całkowitym wycięciu tarczycy):'),
          subs,
        });
      }
    } else if (isTotal && i131Val === 'yes') {
      plan.push({
        text: 'Pooperacyjne leczenie ¹³¹I — rak pośredniego/wysokiego ryzyka:',
        subs: [
          'Zaznaczono, że zastosowano pooperacyjne leczenie ¹³¹I; w tej grupie ryzyka jest to częsty i ważny element postępowania, szczególnie w raku wysokiego ryzyka.',
          'Po każdej terapii wykonaj scyntygrafię poterapeutyczną całego ciała 3–7 dni po leczeniu.',
          'Dalsze decyzje opieraj na wyniku leczenia, Tg/TgAb, badaniach obrazowych oraz dynamicznej ocenie odpowiedzi na leczenie.',
          'W przypadku podejrzenia przerzutów odległych rozważ TK lub MR; pamiętaj, że u dzieci mikroprzerzuty mogą być widoczne dopiero w scyntygrafii całego ciała po leczeniu ¹³¹I.',
          'PET‑TK z ¹⁸F‑FDG nie jest rutynowo zalecane w diagnostyce przerzutów DTC u dzieci (brak danych pozwalających ocenić korzyść).',
        ],
      });
    } else {
      plan.push({
        text:
          'Leczenie uzupełniające ¹³¹I — rak pośredniego/wysokiego ryzyka' +
          (isTotal ? ':' : ' (po całkowitym wycięciu tarczycy):'),
        subs: [
          'Po całkowitym wycięciu tarczycy u chorego z rakiem pośredniego lub wysokiego ryzyka należy każdorazowo ocenić wskazania do leczenia uzupełniającego ¹³¹I; nie przewidziano tu kryteriów rutynowego odstąpienia od radiojodu analogicznych do raka niskiego ryzyka.',
          'W raku wysokiego ryzyka leczenie uzupełniające ¹³¹I szczególnie często stanowi ważny element postępowania; celem leczenia jest ablacja resztek tarczycy oraz sterylizacja mikroprzerzutów i innych ognisk jodochwytnych.',
          'Każdą decyzję o leczeniu izotopowym poprzedź analizą korzyści i ryzyka wspólnie z rodzicami/opiekunami oraz — adekwatnie do wieku — z pacjentem.',
          'Optymalny czas leczenia uzupełniającego ¹³¹I: 4–12 tygodni po operacji (gdy rana zagojona, ustąpił obrzęk pooperacyjny, obniżyło się Tg).',
          'W przypadku podejrzenia przerzutów odległych rozważ TK lub MR; pamiętaj, że u dzieci mikroprzerzuty mogą być widoczne dopiero w scyntygrafii całego ciała po leczeniu ¹³¹I.',
          'PET‑TK z ¹⁸F‑FDG nie jest rutynowo zalecane w diagnostyce przerzutów DTC u dzieci (brak danych pozwalających ocenić korzyść).',
          'Jeśli wykonano TK z kontrastem jodowym — zachowaj co najmniej 6 tygodni (optymalnie 12 tygodni) odstępu przed leczeniem ¹³¹I.',
        ],
      });
    }

    // Przygotowanie do leczenia ¹³¹I — pokaż tylko gdy realnie rozważamy/zastosowaliśmy ¹³¹I
    const showRaiPrep =
      risk === 'unknown' ||
      risk === 'intermediate' ||
      risk === 'high' ||
      (risk === 'low' && isTotal && i131Val === 'yes');

    if (showRaiPrep) {
      plan.push({
        text: i131Val === 'yes'
          ? 'Leczenie ¹³¹I — zasady kwalifikacji i przygotowania (informacyjnie):'
          : isTotal
          ? 'Przygotowanie do leczenia ¹³¹I (gdy planowane):'
          : 'Przygotowanie do leczenia ¹³¹I (jeśli planowane po całkowitym wycięciu tarczycy):',
        subs: [
          'TSH powinno wynosić > 30 mU/l.',
          'Można uzyskać przez odstawienie LT4 na ok. 4 tygodnie; u wybranych pacjentów rozważ rhTSH (np. brak wzrostu endogennego TSH / nietolerancja ciężkiej hipotyreozy).',
          'Schemat rhTSH (jak u dorosłych): 0,9 mg domięśniowo przez 2 kolejne dni; 3. dnia podanie ¹³¹I.',
          'Analogiczne przygotowanie dotyczy także scyntygrafii diagnostycznej całego ciała (DxWBS).',
          'Leczenie ¹³¹I prowadź w ośrodku z doświadczeniem w leczeniu DTC u dzieci.',
          'U miesiączkujących dziewcząt: przed leczeniem ¹³¹I wykonaj test ciążowy; omów konieczność antykoncepcji przez minimum 6 miesięcy po leczeniu izotopowym.',
        ],
      });
    }

    // LT4 suppression
    const lt4Subs = [];

    // Jeżeli w dynamicznej ocenie (ATA 2015) stwierdzono przetrwałą/nawrotową chorobę,
    // stopień supresji TSH powinien być większy.
    if (dynResponse === 'struct_incomplete') {
      lt4Subs.push('Niepełna odpowiedź strukturalna (przetrwała/wznowa choroba) → rozważ silniejszą supresję: TSH < 0,1 mU/l.');
    }

    if (risk === 'low') {
      lt4Subs.push(`TSH docelowo 0,1–0,5 mU/l (supresja) przez 12 miesięcy; potem, po uzyskaniu ${NED_GEN}, leczenie substytucyjne z TSH < 2,0 mU/l.`);
    } else if (risk === 'intermediate') {
      lt4Subs.push(`TSH docelowo 0,1–0,5 mU/l przez 5 lat; potem, po uzyskaniu ${NED_GEN}, substytucja z TSH < 2,0 mU/l.`);
    } else if (risk === 'high') {
      lt4Subs.push(`TSH docelowo 0,1–0,5 mU/l przez ≥10 lat (czas trwania supresji może zostać skrócony w zależności od dynamicznej oceny odpowiedzi na leczenie); potem, po uzyskaniu ${NED_GEN}, substytucja z TSH < 2,0 mU/l.`);
    } else {
      lt4Subs.push('TSH docelowo 0,1–0,5 mU/l w okresie pooperacyjnym; czas trwania supresji zależy od ostatecznej klasyfikacji ryzyka (ATA 2015) i dynamicznej stratyfikacji.');
    }

    if (dynResponse !== 'struct_incomplete') {
      lt4Subs.push('W przypadku przetrwałej choroby lub nawrotu: rozważ silniejszą supresję (TSH < 0,1 mU/l).');
    }

    if (dynResponse === 'excellent') {
      if (risk === 'low') {
        lt4Subs.push(`Doskonała odpowiedź nie znosi wyjściowego celu TSH; w raku niskiego ryzyka supresję 0,1–0,5 mU/l zwykle utrzymuje się przez 12 miesięcy, a dopiero potem — przy utrzymaniu ${NED_GEN} — można przejść do TSH < 2,0 mU/l.`);
      } else if (risk === 'intermediate') {
        lt4Subs.push(`Doskonała odpowiedź nie znosi wyjściowego celu TSH; w raku pośredniego ryzyka supresję 0,1–0,5 mU/l zwykle utrzymuje się przez 5 lat, a dopiero potem — przy utrzymaniu ${NED_GEN} — można przejść do TSH < 2,0 mU/l.`);
      } else if (risk === 'high') {
        lt4Subs.push(`Doskonała odpowiedź nie znosi wyjściowego celu TSH; w raku wysokiego ryzyka supresję 0,1–0,5 mU/l zwykle utrzymuje się przez co najmniej 10 lat, a ewentualne skrócenie tego okresu wymaga ostrożnej, indywidualnej decyzji zgodnej z dynamiczną oceną odpowiedzi.`);
      } else {
        lt4Subs.push('Doskonała odpowiedź sama w sobie nie określa jeszcze momentu deeskalacji supresji; połącz ją z wyjściową grupą ryzyka i czasem obserwacji.');
      }
    } else if (dynResponse === 'bio_incomplete') {
      lt4Subs.push(`Niepełna odpowiedź biochemiczna → zwykle utrzymuj supresję (TSH 0,1–0,5 mU/l) i intensywniejszy nadzór do czasu uzyskania ${NED_GEN}.`);
    } else if (dynResponse === 'indeterminate') {
      lt4Subs.push('Nieokreślona odpowiedź → utrzymuj supresję adekwatną do wyjściowej grupy ryzyka do czasu ponownej oceny i reklasyfikacji odpowiedzi.');
    }

    lt4Subs.push('„Dawka supresyjna” oznacza najniższą dawkę LT4 utrzymującą TSH w zakresie 0,1–0,5 mU/l; w dawce substytucyjnej unikaj TSH > 2,0 mU/l.');
    lt4Subs.push('Jeśli leczenie supresyjne trwa > 12 miesięcy: wykonuj co 12–24 miesiące badanie echokardiograficzne (ocena funkcji skurczowo‑rozkurczowej lewej komory) oraz densytometrię w celu oceny gęstości mineralnej kośćca.');
    lt4Subs.push('W razie wykrycia zaburzeń kurczliwości mięśnia sercowego → konsultacja kardiologiczna i bezpieczna modyfikacja dawki LT4.');
    lt4Subs.push('W razie obniżonej gęstości mineralnej kośćca → wdroż odpowiednie postępowanie i rozważ, czy możliwe jest obniżenie dawki LT4.');
    lt4Subs.push('Kontrole TSH i fT4 wykonuj co 3–6 miesięcy (± fT3 w razie wskazań).');
    plan.push({
      text: 'Leczenie L‑tyroksyną (LT4):',
      subs: lt4Subs,
    });

    // Monitorowanie (dynamiczne wg odpowiedzi)
    const monitorSubs = [];

    if (dynResponse === 'excellent') {
      monitorSubs.push('Doskonała odpowiedź: co najmniej jedno badanie potwierdzające wykonaj w okresie 3–5 lat po pierwszym potwierdzeniu remisji.');
      if (risk === 'high') {
        monitorSubs.push('U chorego z wyjściowo wysokim ryzykiem brak jednoznacznych dowodów bezpieczeństwa pełnej deeskalacji monitorowania — utrzymuj czujniejszy nadzór, a decyzje o częstości kontroli podejmuj indywidualnie.');
      }
      monitorSubs.push('Scyntygrafia całego ciała nie jest rutynowo wykonywana do monitorowania u pacjentów z doskonałą odpowiedzią.');
      monitorSubs.push('U pacjenta niskiego ryzyka z doskonałą odpowiedzią kontrola Tg nie wymaga stymulacji TSH (Tg niestymulowana).');
      monitorSubs.push('W pierwszych 5 latach: oznaczenia Tg i TgAb zwykle co 12 miesięcy; później odstępy mogą być dłuższe.');
      monitorSubs.push('Po 5 latach monitorowanie indywidualizuj; pamiętaj, że ryzyko wznowy DTC może utrzymywać się przez kilkadziesiąt lat.');
      monitorSubs.push('USG szyi wykonuj co najmniej w podobnym rytmie jak oznaczenia Tg/TgAb oraz w razie podejrzenia wznowy.');
      monitorSubs.push('Zawsze interpretuj Tg łącznie z TgAb; liczy się trend w czasie.');
    } else if (dynResponse === 'bio_incomplete') {
      monitorSubs.push('Niepełna odpowiedź biochemiczna: oceniaj dynamikę Tg w odstępach 6‑miesięcznych.');
      monitorSubs.push('USG szyi wykonuj co 6 miesięcy.');
      monitorSubs.push('W razie wzrostu Tg wykonaj badania obrazowe: w pierwszej kolejności TK klatki piersiowej (ocena płuc) oraz USG szyi; w wybranych przypadkach rozważ scyntygrafię ¹³¹I.');
      monitorSubs.push('Jeśli Tg narasta, a USG szyi i scyntygrafia ¹³¹I są prawidłowe, wyklucz nadmiar jodu (np. kontrast jodowy, preparaty jodu, dieta), który może powodować fałszywie ujemny wynik scyntygrafii.');
      monitorSubs.push('Zawsze interpretuj Tg łącznie z TgAb; liczy się trend w czasie.');
    } else if (dynResponse === 'struct_incomplete') {
      monitorSubs.push('Niepełna odpowiedź strukturalna: obecność przetrwałej/nawrotowej choroby w badaniach obrazowych → dalsza diagnostyka lokalizująca i leczenie zgodnie z aktualnymi rekomendacjami oraz decyzją konsylium.');
      monitorSubs.push('W chorobie zlokalizowanej na szyi/śródpiersiu preferuje się leczenie operacyjne (jeśli możliwe); jodochwytne ogniska mogą być leczone ¹³¹I, gdy ryzyko powikłań reoperacji jest duże — decyzje indywidualizuj konsyliarnie.');
      monitorSubs.push('Monitoruj Tg/TgAb i wykonuj badania obrazowe adekwatnie do lokalizacji choroby oraz dynamiki markerów.');
    } else if (dynResponse === 'indeterminate') {
      monitorSubs.push('Nieokreślona odpowiedź: wymaga ponownej oceny w kolejnych kontrolach i ewentualnej reklasyfikacji odpowiedzi.');
      if (risk === 'low') {
        monitorSubs.push('Punkt wyjścia (niskie ryzyko): Tg i TgAb co 6 miesięcy przez 2 lata, potem co 12 miesięcy; USG szyi zwykle 1 × w roku (częściej przy podejrzeniu wznowy).');
      } else if (risk === 'intermediate' || risk === 'high') {
        monitorSubs.push('Punkt wyjścia (pośrednie/wysokie ryzyko): Tg i TgAb co 3–6 miesięcy w okresie supresji; USG szyi co 6–12 miesięcy (częściej przy podejrzeniu wznowy).');
      } else {
        monitorSubs.push('Jeżeli ryzyko jest nieokreślone — utrzymuj częstszy monitoring do czasu uzupełnienia danych i ponownej oceny.');
      }
      monitorSubs.push('W razie wzrostu Tg poszerz diagnostykę obrazową (USG szyi, TK klatki piersiowej, ewentualnie scyntygrafia ¹³¹I).');
      monitorSubs.push('Jeśli Tg narasta, a USG szyi i scyntygrafia ¹³¹I są prawidłowe, wyklucz nadmiar jodu (np. kontrast jodowy, preparaty jodu, dieta), który może powodować fałszywie ujemny wynik scyntygrafii.');
    } else {
      monitorSubs.push('Tg jest czułym markerem w ocenie efektów leczenia; zawsze oznaczaj równolegle TgAb.');
      monitorSubs.push('Trend w kolejnych oznaczeniach Tg/TgAb jest bardziej informatywny niż pojedynczy wynik.');

      if (surgery === 'lobectomy') {
        monitorSubs.push('Po lobektomii Tg jest zwykle wykrywalna, bo produkuje ją pozostawiony płat; dlatego pojedyncza wartość ma ograniczoną swoistość.');
        monitorSubs.push('W praktyce ocenia się stabilność Tg (najlepiej przy porównywalnym TSH, tą samą metodą) oraz TgAb; w dynamicznej ocenie ryzyka: stabilna Tg niestymulowana < 30 ng/ml + brak TgAb + prawidłowe obrazowanie przemawia za doskonałą odpowiedzią, natomiast Tg > 30 ng/ml lub trend wzrostowy (przy podobnym TSH) / rosnące TgAb wymagają czujności diagnostycznej.');
        monitorSubs.push('Podstawą monitorowania pozostaje co najmniej USG szyi — Tg nie może być jedynym narzędziem kontroli.');
      } else if (surgery === 'total') {
        if (i131 === 'yes') {
          monitorSubs.push('Po tyreoidektomii całkowitej po pooperacyjnym leczeniu ¹³¹I Tg w trakcie leczenia supresyjnego zwykle jest bardzo niska (często < 1 ng/ml); utrwalone narastanie w kolejnych oznaczeniach jest bardziej niepokojące niż pojedyncza wartość.');
        } else if (i131 === 'no') {
          monitorSubs.push('Po tyreoidektomii całkowitej bez pooperacyjnego leczenia ¹³¹I Tg bywa wyższa (resztkowa tkanka); pojedyncza wartość ma mniejszą swoistość — zwracaj uwagę na trend wzrostowy (przy porównywalnym TSH) oraz TgAb i zawsze koreluj z USG.');
        } else {
          monitorSubs.push('Po tyreoidektomii całkowitej interpretacja Tg zależy od tego, czy zastosowano pooperacyjne leczenie ¹³¹I: zwykle oczekuje się niskiej i stabilnej Tg w supresji, a utrwalony wzrost (przy porównywalnym TSH) jest sygnałem alarmowym.');
        }
      } else {
        monitorSubs.push('Interpretacja Tg zależy od zakresu leczenia (tyreoidektomia całkowita vs lobektomia) oraz od zastosowania pooperacyjnego leczenia ¹³¹I. Uzupełnij „Wykonany zabieg” i „Pooperacyjne leczenie ¹³¹I”, aby otrzymać jednoznaczne progi/interpretację.');
      }

      monitorSubs.push('Jeśli znasz kategorię odpowiedzi na leczenie (dynamiczną) — wybierz ją w selektorze, aby dopasować intensywność monitorowania.');
}

    monitorSubs.push('Dla porównywalności staraj się wykonywać oznaczenia Tg oraz TgAb w tym samym laboratorium i tą samą metodą (jeśli to możliwe) oraz interpretuj je w kontekście TSH (supresja vs substytucja) — najbardziej informatywna jest zmiana w czasie.');
    monitorSubs.push('W miarę dostępności rozważ ultraczułe metody oznaczania Tg (czułość funkcjonalna ok. 0,1 ng/ml).');

    plan.push({
      text: 'Monitorowanie (Tg/TgAb i USG):',
      subs: monitorSubs,
    });

    sections.push({
      title: 'Rekomendowane postępowanie',
      items: plan,
    });

    // Dynamiczna stratyfikacja (ATA 2015) — mini‑blok
    const dynItems = [];
    const txType = inferDynTxType(surgery, i131);
    const txLabel = getDynTxLabel(txType);

    if (dynResponse && dynResponse !== 'unknown') {
      if (txType === 'unknown' || txType === 'total_unknown') {
        dynItems.push({
          text: `Odpowiedź na leczenie (dynamiczna): ${getDynResponseLabel(dynResponse)}.`,
          subs: [
            'Aby wyświetlić precyzyjne kryteria oceny odpowiedzi uzupełnij: zakres zabiegu (tyreoidektomia całkowita vs lobektomia) oraz informację, czy zastosowano pooperacyjne leczenie ¹³¹I.',
          ],
        });
      } else {
        const crit = getDynCriteria(txType, dynResponse);
        dynItems.push({
          text: `Odpowiedź na leczenie (dynamiczna): ${getDynResponseLabel(dynResponse)}.`,
          subs: [
            `Kryteria (${txLabel}):`,
            ...crit,
          ],
        });
      }

      const eff = [];
      if (dynResponse === 'excellent') {
        if (risk === 'low') {
          eff.push('Doskonała odpowiedź pozwala planować deeskalację, ale wyjściowy cel TSH 0,1–0,5 mU/l zwykle utrzymuje się przez 12 miesięcy; dopiero potem, przy utrzymaniu remisji, można przejść do TSH < 2,0 mU/l.');
        } else if (risk === 'intermediate') {
          eff.push('Doskonała odpowiedź pozwala planować deeskalację, ale wyjściowy cel TSH 0,1–0,5 mU/l zwykle utrzymuje się przez 5 lat; dopiero potem, przy utrzymaniu remisji, można przejść do TSH < 2,0 mU/l.');
        } else if (risk === 'high') {
          eff.push('Doskonała odpowiedź nie znosi automatycznie wyjściowego celu TSH 0,1–0,5 mU/l; u chorego wysokiego ryzyka późniejszą deeskalację rozważaj wyłącznie ostrożnie i indywidualnie.');
        } else {
          eff.push('Doskonała odpowiedź może modyfikować dalsze postępowanie, ale zakres deeskalacji musi wynikać także z wyjściowej grupy ryzyka i czasu obserwacji.');
        }
      } else if (dynResponse === 'bio_incomplete') {
        eff.push('Utrzymuj supresję TSH (0,1–0,5 mU/l) i prowadź częstsze kontrole Tg/USG; w razie wzrostu Tg poszerz diagnostykę.');
      } else if (dynResponse === 'struct_incomplete') {
        eff.push('Traktuj jako przetrwałą/nawrotową chorobę: TSH zwykle < 0,1 mU/l oraz leczenie ukierunkowane (chirurgia/¹³¹I/inne) w ośrodku referencyjnym.');
      } else if (dynResponse === 'indeterminate') {
        eff.push('Powtórz ocenę w kolejnych kontrolach i reklasyfikuj odpowiedź; do czasu wyjaśnienia utrzymuj czujniejszy nadzór.');
      }
      if (eff.length) {
        dynItems.push({ text: 'Znaczenie praktyczne:', subs: eff });
      }
    } else {
      dynItems.push({
        text: 'Nie wybrano odpowiedzi na leczenie (dynamicznej).',
        subs: [
          `Zakres pierwotnego leczenia do oceny: ${txLabel}.`,
          'Jeżeli jesteś na etapie kontroli po zakończeniu leczenia (USG + Tg/TgAb ± badania izotopowe) — wybierz kategorię odpowiedzi powyżej, aby dopasować supresję TSH i intensywność monitorowania.',
        ],
      });
    }

    sections.push({
      title: 'Dynamiczna stratyfikacja ryzyka nawrotu zróżnicowanego raka tarczycy',
      items: dynItems,
    });

    const priorityHtml = priorityCard.main ? buildPriorityCardHtml(priorityCard) : '';
    const priorityPlain = priorityCard.main ? buildPriorityCardPlain(priorityCard) : '';

    return {
      sections,
      html: `${priorityHtml}${buildSectionsHtml(sections)}`,
      plain: [priorityPlain, buildSectionsPlain(sections)].filter(Boolean).join('\n\n').trim(),
    };
  }


  function parseTnm(text) {
    const t = String(text || '').toUpperCase();
    // Accept variants: pT1a pN0 pM0, T1a N0 M0, p1a, 1a
    const res = { pT: '', pN: '', pM: '' };

    // T
    let m = t.match(/\bP?T\s*([1234])\s*([AB])?\b/);
    if (!m) {
      // p1a or 1a
      m = t.match(/\bP\s*([1234])\s*([AB])\b/);
    }
    if (!m) {
      m = t.match(/\b([1234])\s*([AB])\b/);
    }
    if (m) {
      const num = m[1];
      const suf = (m[2] || '').toLowerCase();
      res.pT = `T${num}${suf}`;
      if (res.pT === 'T1') res.pT = 'T1';
    }

    // N
    m = t.match(/\bP?N\s*(0|1A|1B|X)\b/);
    if (m) {
      const v = m[1];
      res.pN = v === '0' ? 'N0' : v === 'X' ? 'Nx' : `N${v.toLowerCase()}`;
    }

    // M
    m = t.match(/\bP?M\s*(0|1|X)\b/);
    if (m) {
      const v = m[1];
      res.pM = v === '0' ? 'M0' : v === '1' ? 'M1' : 'Mx';
    }

    return res;
  }

  // ----------------
  // UI glue
  // ----------------
  function setup() {
    const wrapper = $('thyroidCancerKidsButtonWrapper');
    const btn = $('toggleThyroidCancerKids');
    const card = $('thyroidCancerKidsCard');
    if (!wrapper || !btn || !card) return;

    const abxWrapper = $('abxButtonWrapper');

    // Elementy potrzebne do „zrzucenia” bisfosfonianów pod kartę raka tarczycy (układ desktop)
    const bisphosWrapper = $('bisphosButtonWrapper');
    const bisphosCard = $('bisphosCard');
    const zscoreWrapper = $('zscoreButtonWrapper');

    function setOrder(el, val) {
      if (!el) return;
      el.style.order = val === null ? '' : String(val);
    }

    // Gdy otwieramy kartę „Rak tarczycy u dzieci”, chcemy przenieść (wizualnie)
    // przycisk „Leczenie bisfosfonianami” (oraz jego kartę, jeśli jest otwarta)
    // poniżej tej karty — poprawia to czytelność i odpowiada oczekiwanemu zachowaniu.
    function setBisphosDrop(active) {
      if (active) {
        setOrder(bisphosWrapper, 6);
        setOrder(bisphosCard, 7);
        setOrder(zscoreWrapper, 8);
      } else {
        setOrder(bisphosWrapper, null);
        setOrder(bisphosCard, null);
        setOrder(zscoreWrapper, null);
      }
    }


    function syncVisibility() {
      const doctorOn = isVisible(abxWrapper);
      wrapper.style.display = doctorOn ? 'flex' : 'none';
      if (!doctorOn) {
        card.style.display = 'none';
        btn.classList.remove('active-toggle');
        setBisphosDrop(false);
      }
    }

    // Toggle card
    btn.addEventListener('click', function () {
      const open = card.style.display !== 'none';
      card.style.display = open ? 'none' : 'block';
      btn.classList.toggle('active-toggle', !open);
      setBisphosDrop(!open);
      if (!open) {
        // When opening, default to first tab
        activateTab('nodules');
        updateNodules();
        updateCancer();
      }
    });

    // Observe doctor module state changes
    const obs = new MutationObserver(syncVisibility);
    if (abxWrapper) obs.observe(abxWrapper, { attributes: true, attributeFilter: ['style', 'class'] });
    const prof = $('professionalModule');
    if (prof) obs.observe(prof, { attributes: true, attributeFilter: ['style', 'class'] });

    // Tabs
    const tabN = $('thyTabNodules');
    const tabC = $('thyTabCancer');
    const panelN = $('thyPanelNodules');
    const panelC = $('thyPanelCancer');

    function activateTab(which) {
      const isN = which === 'nodules';
      if (panelN) panelN.style.display = isN ? 'block' : 'none';
      if (panelC) panelC.style.display = isN ? 'none' : 'block';
      if (tabN) tabN.classList.toggle('active-toggle', isN);
      if (tabC) tabC.classList.toggle('active-toggle', !isN);
    }

    if (tabN) tabN.addEventListener('click', function () {
      activateTab('nodules');
    });
    if (tabC) tabC.addEventListener('click', function () {
      activateTab('cancer');
    });

    // Informacje dodatkowe (Bethesda / EU‑TIRADS‑PL)
    const infoBtn = $('thyShowInfo');
    const infoSection = $('thyInfoSection');
    if (infoBtn && infoSection) {
      infoBtn.addEventListener('click', function () {
        const isOpen = infoSection.style.display !== 'none';
        infoSection.style.display = isOpen ? 'none' : 'block';
      });
    }

    // Źródła – sekcja rozwijana na dole modułu
    const sourcesBtn = $('thyShowSources');
    const sourcesSection = $('thySourcesSection');
    const sourcesList = $('thySourcesList');

    const sources = [
      'Handkiewicz‑Junak D. i wsp. „Diagnostics and treatment of differentiated thyroid carcinoma in children — Guidelines of the Polish National Scientific Societies, 2024 Update” / „Diagnostyka i leczenie raka tarczycy u dzieci — rekomendacje…, aktualizacja 2024”. Endokrynologia Polska 2024; 75(6): 565–591. DOI: 10.5603/ep.103845.',
      'Cibas ES, Ali SZ. „The 2017 Bethesda System for Reporting Thyroid Cytopathology”. Thyroid. 2017;27(11):1341–1346. DOI: 10.1089/thy.2017.0500. (kategorie BACC/FNAB, ROM i zalecane postępowanie).',
      '„Diagnostyka i leczenie raka tarczycy u chorych dorosłych — rekomendacje polskich towarzystw naukowych” (aktualizacja 2022, Endokrynologia Polska) – m.in. pełna klasyfikacja EU‑TIRADS‑PL 1–5 i progi BACC dla dorosłych (wykorzystane jako źródło tabeli w module).',
      'Francis GL, Waguespack SG, Bauer AJ, et al. „Management Guidelines for Children with Thyroid Nodules and Differentiated Thyroid Cancer” (American Thyroid Association). Thyroid. 2015;25(7):716–759. DOI: 10.1089/thy.2014.0460. (ATA 2015: stratyfikacja ryzyka i odpowiedź dynamiczna).',
      'AJCC/UICC TNM – 8. edycja (klasyfikacja pTNM dla raka tarczycy: pT/pN/pM).',
      'WHO Classification of Thyroid Tumours (WHO 2022) – nazewnictwo i podział histopatologiczny (m.in. NIFTP, WDT‑UMP/FT‑UMP, rzadkie histotypy).',
      'Terminologia i standardy „neck dissection” / poziomy węzłowe szyi: Robbins i wsp. 2002 (PMID: 12117328), Robbins i wsp. 2008 (PMID: 18490577) oraz definicja central neck dissection w raku tarczycy: Carty i wsp. 2009 (PMID: 19860578) – użyte w części dot. operacji węzłowych i schematu poziomów szyi.',
    ];

    function renderSourcesList() {
      if (!sourcesList) return;
      thyroidCancerSetTrustedHtml(sourcesList, sources.map((s) => `<li>${escapeHtml(s)}</li>`).join(''), 'thyroid-cancer-kids:sourcesList');
    }
    renderSourcesList();

    if (sourcesBtn && sourcesSection) {
      sourcesBtn.addEventListener('click', () => {
        const isHidden = (sourcesSection.style.display === 'none' || sourcesSection.style.display === '');
        sourcesSection.style.display = isHidden ? 'block' : 'none';
        sourcesBtn.classList.toggle('active-toggle', isHidden);
      });
    }

    // Pojęcia (TNM/R/DxWBS) — szybkie „Info” w modalnym oknie
    // Definicje trzymamy w HTML w sekcji #thyGlossary (w „Informacjach dodatkowych”),
    // a modal wyświetla ten sam tekst, dzięki czemu nie dublujemy treści.
    const termModal = $('thyTermModal');
    const termModalTitle = $('thyTermModalTitle');
    const termModalBody = $('thyTermModalBody');
    const termModalClose = $('thyTermModalClose');
    const termModalClose2 = $('thyTermModalClose2');
    const termModalMore = $('thyTermModalMore');

    // Uwaga: w motywach z backdrop-filter (np. Liquid iOS26) elementy position:fixed
    // mogą być liczone względem „containing block” (np. karty modułu), a nie względem viewportu.
    // Dlatego modal zawsze przenosimy bezpośrednio do <body>.
    if (termModal && termModal.parentElement !== document.body) {
      document.body.appendChild(termModal);
    }

    let currentTermKey = null;
    let lastFocusedEl = null;

    let modalOpenScrollPos = { x: 0, y: 0 };

    function getScrollPos() {
      const x = window.pageXOffset || document.documentElement.scrollLeft || 0;
      const y = window.pageYOffset || document.documentElement.scrollTop || 0;
      return { x, y };
    }

    function restoreScrollPos(pos) {
      if (!pos) return;
      const x = typeof pos.x === 'number' ? pos.x : 0;
      const y = typeof pos.y === 'number' ? pos.y : 0;
      try {
        window.scrollTo(x, y);
      } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('thyroid_cancer_kids.js', e, { line: 2010 });
    }
  }
    }

    function focusNoScroll(el, posToPreserve) {
      if (!el || typeof el.focus !== 'function') return;
      const pos = posToPreserve || getScrollPos();

      // Most modern browsers support preventScroll; fallback to manual restore.
      try {
        el.focus({ preventScroll: true });
      } catch (e) {
        try {
          el.focus();
        } catch (e2) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('thyroid_cancer_kids.js', e2, { line: 2025 });
    }
  }
      }

      // Safety net: some browsers still scroll after focus (especially if the modal
      // lives far down in DOM but is position:fixed).
      restoreScrollPos(pos);
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => restoreScrollPos(pos));
      }
      setTimeout(() => restoreScrollPos(pos), 0);
    }


    const prefersReducedMotion = () => {
      try {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (e) {
        return false;
      }
    };

    function getGlossaryEntry(termKey) {
      if (!termKey) return null;
      return document.querySelector(`#thyGlossary [data-thy-term="${termKey}"]`);
    }

    function openTermModal(termKey) {
      if (!termModal || !termModalTitle || !termModalBody) return;
      currentTermKey = termKey || null;
      lastFocusedEl = document.activeElement;
      modalOpenScrollPos = getScrollPos();

      const entry = getGlossaryEntry(termKey);
      if (entry) {
        const summary = entry.querySelector('summary');
        const body = entry.querySelector('.thy-glossary-body');
        const titleText = summary ? summary.textContent.trim() : String(termKey || 'Informacja');
        termModalTitle.textContent = titleText;
        if (body) {
          thyroidCancerCloneChildrenInto(termModalBody, body, 'thyroid-cancer-kids:termModalBody');
        } else {
          thyroidCancerSetTrustedHtml(termModalBody, '<p>Brak opisu dla tego pojęcia.</p>', 'thyroid-cancer-kids:termModalBody');
        }
        if (termModalMore) termModalMore.style.display = '';
      } else {
        termModalTitle.textContent = 'Informacja';
        thyroidCancerSetTrustedHtml(termModalBody, '<p>Brak definicji dla tego pojęcia w module.</p>', 'thyroid-cancer-kids:termModalBody');
        if (termModalMore) termModalMore.style.display = 'none';
      }

      termModal.classList.add('is-open');
      termModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('thy-modal-open');
      restoreScrollPos(modalOpenScrollPos);

      const focusTarget = termModalClose || termModalClose2 || termModal;
      if (focusTarget && typeof focusTarget.focus === 'function') {
        setTimeout(() => focusNoScroll(focusTarget, modalOpenScrollPos), 0);
      }
    }

    function closeTermModal(restoreFocus = true) {
      if (!termModal) return;
      const scrollPos = restoreFocus ? getScrollPos() : null;
      termModal.classList.remove('is-open');
      termModal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('thy-modal-open');
      if (scrollPos) restoreScrollPos(scrollPos);

      const restore = restoreFocus ? lastFocusedEl : null;
      currentTermKey = null;
      lastFocusedEl = null;
      if (restore && typeof restore.focus === 'function') {
        setTimeout(() => focusNoScroll(restore, scrollPos || modalOpenScrollPos), 0);
      }
      if (!restore && scrollPos) restoreScrollPos(scrollPos);
    }

    function openInfoAndScroll(termKey) {
      if (!infoSection) return;
      infoSection.style.display = 'block';
      const behavior = prefersReducedMotion() ? 'auto' : 'smooth';

      // EU‑TIRADS‑PL jest pokazany w module jako osobna tabela poniżej słownika.
      // Hasło słownikowe dla modala jest ukryte (żeby nie dublować sekcji), więc
      // przy „Informacje dodatkowe” przewiń do widocznego nagłówka tabeli.
      if (termKey === 'eutirads') {
        const eutiradsHeading = document.getElementById('thyEutiradsHeading');
        const target = eutiradsHeading || infoSection;
        try {
          target.scrollIntoView({ behavior, block: 'start' });
        } catch (e) {
          target.scrollIntoView();
        }
        return;
      }

      const entry = getGlossaryEntry(termKey);
      const scrollTarget = entry || infoSection;

      if (entry && entry.tagName && entry.tagName.toLowerCase() === 'details') {
        entry.open = true;
      }
      try {
        scrollTarget.scrollIntoView({ behavior, block: 'start' });
      } catch (e) {
        scrollTarget.scrollIntoView();
      }
    }

    // Delegacja kliknięć (ikonki „i” + przycisk przejścia do ścieżki „Nowotwór — leczenie”)
    if (card) {
      card.addEventListener('click', function (e) {
        const jumpBtn = e.target && e.target.closest ? e.target.closest('.thy-jump-cancer-preop') : null;
        if (jumpBtn) {
          e.preventDefault();
          e.stopPropagation();

          const bethVal = jumpBtn.getAttribute('data-thy-beth') || 'V';

          // Przejdź do zakładki „Nowotwór — leczenie”
          activateTab('cancer');

          // Ustaw tryb „Przed operacją”
          const preopRadio = modeRadios && modeRadios.find ? modeRadios.find((r) => r && r.value === 'preop') : null;
          if (preopRadio) preopRadio.checked = true;

          // Wyczyść/ustaw kontrolki aby uniknąć „starych” ustawień z poprzedniego przypadku
          if (preCancerType) preCancerType.value = 'dtc';
          if (preBeth) preBeth.value = bethVal === 'VI' ? 'VI' : 'V';
          if (preDtcSubtype) preDtcSubtype.value = 'unknown';
          if (preCalcitonin) preCalcitonin.value = 'unknown';
          if (preCT) preCT.value = '';
          if (preCN) preCN.value = 'Nx';
          if (preOlder) preOlder.checked = false;

          updateCancer();

          // Przewiń do początku panelu „Nowotwór — leczenie” (żeby użytkownik od razu widział kontrolki)
          const tgt = $('thyPanelCancer');
          if (tgt && typeof tgt.scrollIntoView === 'function') {
            try {
              tgt.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (err) {
              tgt.scrollIntoView();
            }
          }

          return;
        }

        const disclosureBtn = e.target && e.target.closest ? e.target.closest('.thy-disclosure-btn') : null;
        if (disclosureBtn) {
          e.preventDefault();
          e.stopPropagation();
          const targetId = disclosureBtn.getAttribute('data-thy-toggle') || '';
          const panel = targetId ? document.getElementById(targetId) : null;
          if (!panel) return;
          const expanded = disclosureBtn.getAttribute('aria-expanded') === 'true';
          const showLabel = disclosureBtn.getAttribute('data-thy-show-label') || 'Pokaż szczegóły';
          const hideLabel = disclosureBtn.getAttribute('data-thy-hide-label') || 'Ukryj szczegóły';
          panel.hidden = expanded;
          disclosureBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
          disclosureBtn.textContent = expanded ? showLabel : hideLabel;
          return;
        }

        const btn = e.target && e.target.closest ? e.target.closest('.thy-info-btn') : null;
        if (!btn) return;
        const termKey = btn.getAttribute('data-thy-info') || '';
        if (!termKey) return;
        e.preventDefault();
        e.stopPropagation();
        openTermModal(termKey);
      });
    }

    // Zamknięcie modala
    [termModalClose, termModalClose2].forEach((b) => {
      if (b) b.addEventListener('click', function (e) {
        e.preventDefault();
        closeTermModal();
      });
    });

    if (termModal) {
      termModal.addEventListener('click', function (e) {
        // Klik w tło (poza oknem) zamyka modal
        if (e.target === termModal) closeTermModal();
      });
    }

    if (termModalMore) {
      termModalMore.addEventListener('click', function (e) {
        e.preventDefault();
        const key = currentTermKey;
        // Zamykamy modal bez przywracania focusu (żeby przeglądarka nie „odskoczyła” do przycisku Info)
        closeTermModal(false);
        if (key) openInfoAndScroll(key);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && termModal && termModal.classList.contains('is-open')) {
        closeTermModal();
      }
    });

    // Nodules controls
    const nTirads = $('thyNodTirads');
    const nHot = $('thyNodHot');
    const nNodes = $('thyNodNodes');
    const nBeth = $('thyNodBethesda');
    const nResult = $('thyNoduleResult');
    const nTiradsBanner = $('thyEutiradsBanner');
    const nSwitches = $('thyNoduleSwitches');
    const nSwitchesDock = $('thyNoduleSwitchesDock');
    const nCopyWrap = $('thyCopyNoduleWrap');
    const nCopyBtn = $('thyCopyNodule');

    function setNoduleSwitchDisabled(inputEl, disabled) {
      if (!inputEl) return;
      inputEl.disabled = !!disabled;
      if (disabled) inputEl.checked = false;
      const row = inputEl.closest('.abx-option-row');
      if (row) row.classList.toggle('is-disabled', !!disabled);
    }

    // Przełączniki oparte o USG mają sens dopiero, gdy użytkownik ma już dane z USG (EU‑TIRADS) i/lub cytologii (Bethesda).
    function syncNoduleSwitches() {
      const hasUsInfo = (nTirads && nTirads.value) || (nBeth && nBeth.value);
      const disable = !hasUsInfo;
      setNoduleSwitchDisabled(nHot, disable);
      setNoduleSwitchDisabled(nNodes, disable);
    }

    function updateNodules() {
      if (nTiradsBanner) nTiradsBanner.hidden = !(nTirads && nTirads.value);
      if (!nResult) return;
      syncNoduleSwitches();
      const plan = getNodulePlan({
        tirads: nTirads ? nTirads.value : '',
        hot: nHot ? (nHot.checked && !nHot.disabled) : false,
        nodes: nNodes ? (nNodes.checked && !nNodes.disabled) : false,
        bethesda: nBeth ? nBeth.value : '',
      });
      thyroidCancerSetTrustedHtml(nResult, plan.html, 'thyroid-cancer-kids:nResult');
      const switchesHost = $('thyNoduleSwitchesHost');
      if (nSwitches && switchesHost) {
        switchesHost.appendChild(nSwitches);
      } else if (nSwitches && nSwitchesDock && !nSwitchesDock.contains(nSwitches)) {
        nSwitchesDock.appendChild(nSwitches);
      }
      nResult.style.display = 'block';
      if (nCopyBtn) nCopyBtn.dataset.copyText = plan.plain || '';
      if (nCopyWrap) nCopyWrap.style.display = plan.plain ? 'block' : 'none';
    }

    [nTirads, nHot, nNodes, nBeth].forEach((el) => {
      if (el) el.addEventListener('change', updateNodules);
    });

    if (nCopyBtn) {
      nCopyBtn.addEventListener('click', async function () {
        const txt = (nCopyBtn.dataset.copyText || '').trim();
        if (!txt) return;
        await copyTextToClipboard(txt);
      });
    }

    // Cancer mode controls
    const modeRadios = Array.from(document.querySelectorAll('input[name="thyCancerMode"]'));
    const preWrap = $('thyPreopControls');
    const postWrap = $('thyPostopControls');
    const cResult = $('thyCancerResult');
    const cCopyWrap = $('thyCopyCancerWrap');
    const cCopyBtn = $('thyCopyCancer');

    const preBeth = $('thyPreBeth');
    const preCancerType = $('thyPreCancerType');
    const preDtcSubtype = $('thyPreDtcSubtype');
    const preCalcitonin = $('thyPreCalcitonin');
    const preCT = $('thyPreCT');
    const preCN = $('thyPreCN');
    const preOlder = $('thyPreOlder');
    const preDtcSubtypeWrap = $('thyPreDtcSubtypeWrap');
    const preCalcitoninWrap = $('thyPreCalcitoninWrap');
    const preSwitchesWrap = $('thyPreopSwitches');

    const tnInput = $('thyTnmInput');
    const postHistology = $('thyPostHistology');
    const postPT = $('thyPostPT');
    const postPN = $('thyPostPN');
    const postPM = $('thyPostPM');
    const postSurg = $('thyPostSurgery');
    const postETE = $('thyPostETE');
    const postRes = $('thyPostResection');
    const postAgg = $('thyPostAggressive');
    const postVasc = $('thyPostVascular');
    const postNodeBurden = $('thyPostNodeBurden');
    const postUptake = $('thyPostUptake');
    const postHighTg = $('thyPostHighTg');
    const postStimTg = $('thyPostStimTg');
    const postDxNoUptake = $('thyPostDxNoUptake');
    const postI131 = $('thyPostI131');
    const dynResp = $('thyDynResponse');

    // ------------------------
    // Spójność UI / blokady
    // ------------------------
    // (Celem jest uniknięcie sprzecznych kombinacji selektorów, które mogłyby sugerować niezalecane postępowanie.)
    let syncing = false;

    function setDisplay(el, show) {
      if (!el) return;
      el.style.display = show ? '' : 'none';
    }

    function enableAllOptions(selectEl) {
      if (!selectEl) return;
      Array.from(selectEl.options).forEach((o) => (o.disabled = false));
    }

    function setOptionDisabled(selectEl, value, disabled) {
      if (!selectEl) return;
      const opt = Array.from(selectEl.options).find((o) => o.value === value);
      if (opt) opt.disabled = !!disabled;
    }

    function syncPreopUi() {
      const typeVal = preCancerType ? preCancerType.value : 'dtc';
      const isDtc = typeVal === 'dtc';
      const isMtc = typeVal === 'mtc';

      // Pokazuj/ukrywaj pola zależnie od podejrzewanego typu raka
      setDisplay(preDtcSubtypeWrap, isDtc);
      setDisplay(preCalcitoninWrap, isMtc);
      setDisplay(preSwitchesWrap, isDtc);

      // Resetuj nieadekwatne kontrolki, aby nie wpływały na rekomendacje
      if (!isDtc && preDtcSubtype) preDtcSubtype.value = 'unknown';
      if (!isMtc && preCalcitonin) preCalcitonin.value = 'unknown';

      // Włączenie „>14 rż./Tanner 5” tylko dla PTC cT1a N0
      if (!preOlder) return;
      const subtype = preDtcSubtype ? preDtcSubtype.value : 'unknown';
      const applicable = isDtc && subtype === 'ptc' && (preCT && preCT.value === 'cT1a') && (preCN && preCN.value === 'N0');
      preOlder.disabled = !applicable;
      const row = preOlder.closest('.abx-option-row');
      if (row) row.style.opacity = applicable ? '' : '0.55';
      if (!applicable && preOlder.checked) preOlder.checked = false;
    }

    function computePostopRiskSnapshot() {
      const m = postPM ? postPM.value : '';
      const pNVal = postPN ? postPN.value : '';
      const eteVal = postETE ? postETE.value : 'unknown';
      const resectionVal = postRes ? postRes.value : 'unknown';
      const nodeBurdenVal = postNodeBurden ? postNodeBurden.value : 'unknown';
      const uptakeVal = postUptake ? postUptake.value : 'unknown';
      const highTgVal = postHighTg ? postHighTg.checked : false;
      const aggVal = postAgg ? postAgg.checked : false;
      const vascVal = postVasc ? postVasc.checked : false;

      return classifyAtaRisk({
        m: m || 'Mx',
        pN: pNVal || '',
        ete: eteVal || 'unknown',
        resection: resectionVal || 'unknown',
        aggressive: aggVal,
        vascular: vascVal,
        nodeBurden: nodeBurdenVal || 'unknown',
        uptakeOutside: uptakeVal || 'unknown',
        highTg: highTgVal,
      });
    }

    function syncPostopUi() {
  const histVal = postHistology ? postHistology.value : '';
  const isHistologyMissing = !histVal || histVal === 'unknown';
  const isDtcLike = histVal === 'dtc';

  const surgeryVal = postSurg ? postSurg.value : 'unknown';

  const riskHeading = $('thyPostRiskHeading');
  const riskSwitches = $('thyPostRiskSwitches');
  const dynHeading = $('thyDynHeading');
  const dynControls = $('thyDynControls');
  const dynNote = $('thyDynNote');

  const lowHeading = $('thyLowRiskI131Heading');
  const lowSwitches = $('thyLowRiskI131Switches');
  const lowStimWrap = $('thyLowRiskStimTgWrap');

  // Bez wybranego typu histopatologicznego nie pokazujemy zaleceń pooperacyjnych.
  if (isHistologyMissing) {
    setDisplay(riskHeading, false);
    setDisplay(riskSwitches, false);
    setDisplay(dynHeading, false);
    setDisplay(dynControls, false);
    setDisplay(dynNote, false);

    setDisplay(lowHeading, false);
    setDisplay(lowSwitches, false);
    setDisplay(lowStimWrap, false);

    [postETE, postRes, postAgg, postVasc, postNodeBurden, postUptake, postHighTg, postStimTg, postDxNoUptake, postI131, dynResp].forEach((el) => {
      if (!el) return;
      el.disabled = true;
      const label = el.closest('label');
      if (label) label.style.opacity = '0.6';
    });

    return { risk: null, surgery: surgeryVal, i131: 'unknown' };
  }

  // DTC-only bloki (ATA/Tg/¹³¹I/dynamiczna odpowiedź) ukrywamy dla MTC i innych rzadkich histotypów.
  if (!isDtcLike) {
    setDisplay(riskHeading, false);
    setDisplay(riskSwitches, false);
    setDisplay(dynHeading, false);
    setDisplay(dynControls, false);
    setDisplay(dynNote, false);

    setDisplay(lowHeading, false);
    setDisplay(lowSwitches, false);
    setDisplay(lowStimWrap, false);

    const dtcOnly = [postETE, postRes, postAgg, postVasc, postNodeBurden, postUptake, postHighTg, postStimTg, postDxNoUptake, postI131, dynResp];
    dtcOnly.forEach((el) => {
      if (!el) return;
      const label = el.closest('label');
      if (el.tagName === 'SELECT') el.value = 'unknown';
      if (el.type === 'checkbox') el.checked = false;
      if (el.type === 'number') el.value = '';
      el.disabled = true;
      if (label) label.style.opacity = '0.6';
    });

    return { risk: null, surgery: surgeryVal, i131: 'unknown' };
  }

  // DTC-like: pokaż bloki i włącz kontrolki (dalsze reguły mogą je chwilowo blokować).
  setDisplay(riskHeading, true);
  setDisplay(riskSwitches, true);
  setDisplay(dynHeading, true);
  setDisplay(dynControls, true);
  setDisplay(dynNote, true);

  [postETE, postRes, postAgg, postVasc, postNodeBurden, postUptake, postHighTg, postStimTg, postDxNoUptake, postI131, dynResp].forEach((el) => {
    if (!el) return;
    el.disabled = false;
    const label = el.closest('label');
    if (label) label.style.opacity = '';
  });

  // 1) pT4 => ETE rozległy (pT4 implikuje makroskopowy naciek pozatarczycowy)
  if (postPT && postETE) {
    const isPT4 = postPT.value === 'T4a' || postPT.value === 'T4b';
    const eteLabel = postETE.closest('label');
    if (isPT4) {
      postETE.value = 'extensive';
      postETE.disabled = true;
      if (eteLabel) eteLabel.style.opacity = '0.6';
    } else {
      postETE.disabled = false;
      if (eteLabel) eteLabel.style.opacity = '';
    }
  }

  // 2) Spójność: pN vs obciążenie węzłowe
  if (postPN && postNodeBurden) {
    const pNVal = postPN.value;
    enableAllOptions(postNodeBurden);

    if (pNVal === 'N0') {
      setOptionDisabled(postNodeBurden, 'micro', true);
      setOptionDisabled(postNodeBurden, 'moderate', true);
      setOptionDisabled(postNodeBurden, 'large', true);
      if (['micro', 'moderate', 'large'].includes(postNodeBurden.value)) {
        postNodeBurden.value = 'n0';
      }
    } else if (pNVal === 'N1a' || pNVal === 'N1b') {
      setOptionDisabled(postNodeBurden, 'n0', true);
      if (postNodeBurden.value === 'n0') {
        postNodeBurden.value = 'unknown';
      }
    }
  }

  // 3) ¹³¹I w bloku dynamicznej stratyfikacji: po lobektomii zwykle „nie dotyczy”
  const isLob = surgeryVal === 'lobectomy';
  const isTotal = surgeryVal === 'total';

  const i131Label = postI131 ? postI131.closest('label') : null;
  if (postI131) {
    if (isLob) {
      postI131.value = 'unknown';
      postI131.disabled = true;
      setDisplay(i131Label, false);
    } else {
      postI131.disabled = false;
      setDisplay(i131Label, true);
    }
  } else {
    setDisplay(i131Label, false);
  }

  const i131Val = postI131 ? postI131.value : 'unknown';

  // 4) Scyntygrafia poterapeutyczna (ATA 2015: „uptake outside bed”) ma sens tylko po zastosowaniu ¹³¹I
  const uptakeLabel = postUptake ? postUptake.closest('label') : null;
  if (postUptake) {
    const showUptake = isTotal && i131Val === 'yes';
    if (!showUptake) {
      postUptake.value = 'unknown';
      postUptake.disabled = true;
      setDisplay(uptakeLabel, false);
    } else {
      postUptake.disabled = false;
      setDisplay(uptakeLabel, true);
    }
  }

  // 5) Kryteria odstąpienia od ¹³¹I (low risk) — tylko gdy total + ryzyko low + ¹³¹I nie zastosowano
  const riskNow = computePostopRiskSnapshot();
  const showLow = isTotal && riskNow === 'low' && i131Val !== 'yes';

  setDisplay(lowHeading, showLow);
  setDisplay(lowSwitches, showLow);
  setDisplay(lowStimWrap, showLow);

  if (postDxNoUptake) postDxNoUptake.disabled = !showLow;
  if (postStimTg) postStimTg.disabled = !showLow;

  if (!showLow) {
    if (postDxNoUptake) postDxNoUptake.checked = false;
    if (postStimTg) postStimTg.value = '';
  }

  return { risk: riskNow, surgery: surgeryVal, i131: i131Val };
}

function getMode() {
      const checked = modeRadios.find((r) => r.checked);
      return checked ? checked.value : 'preop';
    }

    function updateCancer() {
      if (!cResult) return;
      if (syncing) return;

      syncing = true;
      try {
        const mode = getMode();
        if (preWrap) preWrap.style.display = mode === 'preop' ? 'block' : 'none';
        if (postWrap) postWrap.style.display = mode === 'postop' ? 'block' : 'none';

        let plan;
        if (mode === 'preop') {
          // Blokada: opcja „>14 rż./Tanner 5 (rozważ lobektomię...)” ma sens tylko w cT1aN0
          syncPreopUi();

          const preType = preCancerType ? preCancerType.value : 'dtc';
          if (preType === 'mtc') {
            plan = getPreopMtcPlan({
              bethesda: preBeth ? preBeth.value : '',
              cN: preCN ? preCN.value : 'Nx',
              calcitonin: preCalcitonin ? preCalcitonin.value : 'unknown',
            });
          } else if (preType === 'other') {
            plan = getPreopOtherPlan({
              bethesda: preBeth ? preBeth.value : '',
            });
          } else {
            plan = getPreopCancerPlan({
              bethesda: preBeth ? preBeth.value : '',
              dtcSubtype: preDtcSubtype ? preDtcSubtype.value : 'unknown',
              cT: preCT ? preCT.value : '',
              cN: preCN ? preCN.value : '',
              older: preOlder ? preOlder.checked : false,
            });
          }
        } else {
          // Blokady/ukrycia aby unikać konfliktów (lobektomia vs ¹³¹I, pN vs obciążenie węzłowe, pT4 vs ETE, itd.)
          syncPostopUi();

          const stimTgVal = postStimTg && postStimTg.value !== '' ? Number(postStimTg.value) : null;
          plan = getPostopCancerPlan({
            histology: postHistology ? postHistology.value : '',
            pT: postPT ? postPT.value : '',
            pN: postPN ? postPN.value : '',
            pM: postPM ? postPM.value : '',
            surgery: postSurg ? postSurg.value : 'unknown',
            ete: postETE ? postETE.value : 'unknown',
            resection: postRes ? postRes.value : 'unknown',
            aggressive: postAgg ? postAgg.checked : false,
            vascular: postVasc ? postVasc.checked : false,
            nodeBurden: postNodeBurden ? postNodeBurden.value : 'unknown',
            uptakeOutside: postUptake ? postUptake.value : 'unknown',
            highTg: postHighTg ? postHighTg.checked : false,
            stimTg: Number.isFinite(stimTgVal) ? stimTgVal : null,
            dxNoUptake: postDxNoUptake ? postDxNoUptake.checked : false,
            i131: postI131 ? postI131.value : 'unknown',
            dynResponse: dynResp ? dynResp.value : 'unknown',
          });
        }

        thyroidCancerSetTrustedHtml(cResult, plan.html, 'thyroid-cancer-kids:cResult');
        cResult.style.display = 'block';
        if (cCopyBtn) cCopyBtn.dataset.copyText = plan.plain || '';
        if (cCopyWrap) cCopyWrap.style.display = plan.plain ? 'block' : 'none';
      } finally {
        syncing = false;
      }
    }


    modeRadios.forEach((r) => r.addEventListener('change', updateCancer));
    [preBeth, preCancerType, preDtcSubtype, preCalcitonin, preCT, preCN, preOlder].forEach((el) => {
      if (el) el.addEventListener('change', updateCancer);
    });

    [postHistology, postPT, postPN, postPM, postSurg, postETE, postRes, postAgg, postVasc, postNodeBurden, postUptake, postHighTg, postStimTg, postDxNoUptake, postI131, dynResp].forEach((el) => {
      if (el) el.addEventListener('change', updateCancer);
      if (el && el.tagName === 'INPUT') el.addEventListener('input', updateCancer);
    });

    if (tnInput) {
      tnInput.addEventListener('input', function () {
        const parsed = parseTnm(tnInput.value);
        // map parsed.pT 'T1a' -> select option 'T1a'
        if (parsed.pT && postPT) {
          const val = parsed.pT.startsWith('T') ? parsed.pT : 'T' + parsed.pT;
          if (Array.from(postPT.options).some((o) => o.value === val)) postPT.value = val;
        }
        if (parsed.pN && postPN) {
          const val = parsed.pN;
          if (Array.from(postPN.options).some((o) => o.value.toUpperCase() === val.toUpperCase())) postPN.value = val;
        }
        if (parsed.pM && postPM) {
          const val = parsed.pM;
          if (Array.from(postPM.options).some((o) => o.value === val)) postPM.value = val;
        }
        updateCancer();
      });
    }

    if (cCopyBtn) {
      cCopyBtn.addEventListener('click', async function () {
        const txt = (cCopyBtn.dataset.copyText || '').trim();
        if (!txt) return;
        await copyTextToClipboard(txt);
      });
    }

    // Initial
    syncVisibility();
    // If card is visible on load (e.g. in dev), update
    if (card.style.display !== 'none') {
      setBisphosDrop(true);
      activateTab('nodules');
      updateNodules();
      updateCancer();
    }
  }

  if (typeof window !== 'undefined' && typeof window.vildaOnReady === 'function') {
    window.vildaOnReady('thyroid-cancer-kids:init', setup);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
})();
