(function (w, d) {
  'use strict';
  var tools = w.VildaHomeTools;
  if (!tools) return;

  function element(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function labelled(doc, text, control) {
    var label = element(doc, 'label', '', text);
    label.appendChild(control);
    return label;
  }

  function message(doc, text) {
    return element(doc, 'p', 'vhome-tool-note', text);
  }

  function nativeFoodList() {
    return d.getElementById('foodList');
  }

  function nativeFoodRows(list) {
    return Array.from(list.querySelectorAll(':scope > .food-row'));
  }

  function foodRowControls(node) {
    return { product: node.querySelector('select'), quantity: node.querySelector('input[type="number"]') };
  }

  function readFoodRow(node) {
    var nativeId = node.dataset.id;
    if (node.dataset.foodKind === 'custom') {
      var item = w.VildaMacroPractice.readCustomFoodRow(node);
      return item ? Object.assign({ kind: 'custom', nativeId: nativeId }, item) : null;
    }
    var controls = foodRowControls(node);
    return { nativeId: nativeId, key: controls.product.value, qty: controls.quantity.value };
  }

  function readFood() {
    var list = nativeFoodList(), practice = w.VildaMacroPractice, summary = w.VildaFoodSummary;
    var norms = w.VildaNutritionNorms;
    if (!list || !practice?.createCustomFoodRow || !summary?.buildCustomFoodItem || !norms?.buildCardModelReadOnly || !w.VildaActivityBurn || !w.VildaHtml) return null;
    if (typeof w.vildaPersistScheduleSave !== 'function' || !w.VildaDataImportExport?.scheduleMainSessionSave) return null;
    var rows = nativeFoodRows(list).map(readFoodRow);
    if (rows.includes(null)) return null;
    return {
      rows: rows,
      burnAge: summary.readAge(),
      burnWeight: summary.readWeight(),
      inputs: {
        ageYears: typeof w.getAgeDecimal === 'function' ? w.getAgeDecimal() : parseFloat(d.getElementById('age')?.value),
        ageMonthsOpt: parseFloat(d.getElementById('ageMonths')?.value || '0'),
        sex: d.getElementById('sex')?.value || 'M',
        weightKg: parseFloat(d.getElementById('weight')?.value),
        heightCm: parseFloat(d.getElementById('height')?.value),
        mainPal: parseFloat(d.getElementById('palFactor')?.value)
      },
      preferences: norms.readUiState()
    };
  }

  function productSelect(doc, key) {
    var select = doc.createElement('select'), practice = w.VildaMacroPractice;
    w.VildaHtml.setTrustedHtml(select, practice.macroPracticeBuildFoodOptionsMarkup(key || ''), { context: 'home-tools-food-options' });
    if (key && !Array.from(select.options).some(function (option) { return option.value === key; })) {
      var saved = element(doc, 'option', '', practice.foods[key]?.name || 'Zapisany produkt');
      saved.value = key;
      select.append(saved);
    }
    if (key !== null) select.value = key;
    return select;
  }

  function quantityControl(doc, value) {
    var control = doc.createElement('input');
    control.type = 'number';
    control.min = '0';
    control.step = 'any';
    control.inputMode = 'decimal';
    control.value = value;
    return control;
  }

  function positiveQuantity(value) {
    return Number.isFinite(Number(value)) && Number(value) > 0;
  }

  function foodMeasure(key) {
    var food = w.VildaMacroPractice.foods[key];
    if (positiveQuantity(food?.macroBasePortionMassG)) return { size: food.macroBasePortionMassG, unit: 'g' };
    // Native catalogue labels give the size only for products with an explicit unit.
    var measured = String(food?.name || '').match(/(\d+(?:[,.]\d+)?)\s*(g|ml)$/i);
    if (measured) return { size: Number(measured[1].replace(',', '.')), unit: measured[2].toLowerCase() };
    var counted = String(food?.name || '').match(/(?:\(|\s)(\d+(?:[,.]\d+)?)\s+(szt\.|sztuk|kawałków|kromek|łyżek)(?:\)|$)/i);
    if (counted) {
      var unit = { 'sztuk': 'szt.', 'kawałków': 'kawałki', 'kromek': 'kromki', 'łyżek': 'łyżki' }[counted[2]] || counted[2];
      return { size: Number(counted[1].replace(',', '.')), unit: unit };
    }
    return { size: 1, unit: '' };
  }

  function foodPortion(doc, key, initial) {
    var control = quantityControl(doc, ''), measure;
    var caption = element(doc, 'span');
    var label = element(doc, 'label');
    label.append(caption, control);
    function show(product, quantity) {
      measure = foodMeasure(product);
      caption.textContent = measure.unit ? 'Porcja · ' + measure.unit : 'Liczba porcji';
      control.value = quantity === '' ? '' : String(Number((Number(quantity) * measure.size).toPrecision(12)));
    }
    show(key, initial);
    return { control: control, label: label, show: show, quantity: function () {
      return control.value === '' ? '' : String(Number(control.value) / measure.size);
    } };
  }

  function newCustomFoodId() {
    if (w.crypto?.randomUUID) return 'food-' + w.crypto.randomUUID();
    return 'food-' + Array.from(w.crypto.getRandomValues(new Uint8Array(16)), function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function customFoodFields(doc, original, onEdit) {
    var fields = element(doc, 'div', 'vhome-tool-food-custom-fields');
    var name = doc.createElement('input');
    name.type = 'text';
    name.value = original.name;
    var grams = quantityControl(doc, original.grams);
    var density = quantityControl(doc, original.kcalPer100g);
    var energy = element(doc, 'p', 'vhome-tool-note vhome-tool-food-custom-energy');
    var format = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });
    fields.append(labelled(doc, 'Produkt', name), labelled(doc, 'Porcja · g', grams),
      labelled(doc, 'Energia · kcal/100 g', density), energy);

    function read() {
      return Object.assign({}, original, { name: name.value, grams: grams.valueAsNumber, kcalPer100g: density.valueAsNumber });
    }
    function refresh(notify) {
      var value = read();
      var item = w.VildaFoodSummary.buildCustomFoodItem(value);
      energy.textContent = item ? 'Energia porcji: ' + format.format(item.kcal) + ' kcal' : '';
      if (notify) onEdit(item ? Object.assign(value, w.VildaFoodSummary.normalizeCustomFood(value)) : value, item);
      return item;
    }
    fields.addEventListener('input', function () { refresh(true); });
    refresh(false);
    return { fields: fields, name: name, read: read, clear: function () {
      name.value = grams.value = density.value = '';
      refresh(true);
    } };
  }

  function mountFood(view, draft, edit) {
    var doc = view.document;
    var rows = draft.rows.slice();
    var picker = element(doc, 'div', 'vhome-tool-food-picker');
    var search = doc.createElement('input');
    search.type = 'search';
    var product = productSelect(doc, null);
    var quantity = foodPortion(doc, product.value, '1');
    var portion = message(doc, '');
    var add = element(doc, 'button', 'vhome-tool-food-add', 'Dodaj do posiłku');
    add.type = 'button';
    picker.append(labelled(doc, 'Szukaj produktu w bazie', search), labelled(doc, 'Produkt', product), quantity.label, portion, add);
    var manual = element(doc, 'details', 'vhome-tool-food-manual');
    var addCustom = element(doc, 'button', 'vhome-tool-food-add', 'Dodaj własny produkt do posiłku');
    addCustom.type = 'button';
    addCustom.disabled = true;
    var custom = customFoodFields(doc, { kind: 'custom', nativeId: null, id: 'draft', name: '', grams: '', kcalPer100g: '' }, function (_, item) {
      addCustom.disabled = !item;
    });
    custom.fields.append(addCustom);
    manual.append(element(doc, 'summary', '', 'Dodaj własny produkt'), custom.fields);
    var list = element(doc, 'div', 'vhome-tool-food-rows');
    view.input.append(picker, manual, list);

    function updatePicker() {
      add.disabled = !product.value || !positiveQuantity(quantity.quantity());
      portion.textContent = !product.value ? 'Brak produktów pasujących do wyszukiwania.'
        : add.disabled ? 'Podaj wielkość porcji.'
          : w.VildaMacroPractice.macroPracticeBuildSelectedFoodLabel(product.value, Number(quantity.quantity()));
    }

    function drawRows(focusIndex) {
      list.replaceChildren();
      if (rows.length === 0) list.append(message(doc, 'Posiłek nie zawiera produktów.'));
      rows.forEach(function (row, index) {
        var item = element(doc, 'div', 'vhome-tool-food-row');
        var remove = element(doc, 'button', 'vhome-tool-food-remove', 'Usuń');
        remove.type = 'button';
        function updateRow(value) {
          rows = rows.map(function (previous, i) { return i === index ? value : previous; });
          edit('rows', rows);
        }
        remove.addEventListener('click', function () {
          rows = rows.filter(function (_, i) { return i !== index; });
          edit('rows', rows);
          drawRows(Math.min(index, rows.length - 1));
          if (rows.length === 0) product.focus();
        });
        var focus;
        if (row.kind === 'custom') {
          var editor = customFoodFields(doc, row, updateRow);
          item.classList.add('vhome-tool-food-row--custom');
          item.append(editor.fields, remove);
          focus = editor.name;
        } else {
          var key = productSelect(doc, row.key), qty = foodPortion(doc, row.key, row.qty);
          function updateCatalogueRow() { updateRow({ nativeId: row.nativeId, key: key.value, qty: qty.quantity() }); }
          key.addEventListener('change', function () { qty.show(key.value, rows[index].qty); updateCatalogueRow(); });
          qty.control.addEventListener('input', updateCatalogueRow);
          item.append(labelled(doc, 'Produkt', key), qty.label, remove);
          focus = key;
        }
        list.append(item);
        if (focusIndex === index) focus.focus();
      });
    }

    function fold(value) {
      return value.toLocaleLowerCase('pl').normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').trim();
    }
    search.addEventListener('input', function () {
      var selection = product.value, query = fold(search.value);
      var complete = productSelect(doc, null);
      Array.from(complete.querySelectorAll('option')).forEach(function (option) {
        if (!fold(option.textContent).includes(query)) option.remove();
      });
      Array.from(complete.querySelectorAll('optgroup')).forEach(function (group) {
        if (!group.childElementCount) group.remove();
      });
      product.replaceChildren(...complete.children);
      if (Array.from(product.options).some(function (option) { return option.value === selection; })) product.value = selection;
      if (product.value !== selection) quantity.show(product.value, '1');
      updatePicker();
    });
    product.addEventListener('change', function () { quantity.show(product.value, '1'); updatePicker(); });
    quantity.control.addEventListener('input', updatePicker);
    add.addEventListener('click', function () {
      if (add.disabled) return;
      rows = rows.concat([{ nativeId: null, key: product.value, qty: quantity.quantity() }]);
      edit('rows', rows);
      drawRows(rows.length - 1);
    });
    addCustom.addEventListener('click', function () {
      var item = w.VildaFoodSummary.normalizeCustomFood(custom.read());
      if (!item) return;
      rows = rows.concat([Object.assign(item, { id: newCustomFoodId(), kind: 'custom', nativeId: null })]);
      edit('rows', rows);
      custom.clear();
      drawRows(rows.length - 1);
    });
    updatePicker();
    drawRows();
  }

  function foodGoals(draft) {
    var input = Object.assign({}, draft.inputs);
    // JSON copies replace non-finite native readings with null.
    ['ageYears', 'ageMonthsOpt', 'weightKg', 'heightCm', 'mainPal'].forEach(function (key) {
      if (input[key] === null) input[key] = NaN;
    });
    try { return w.VildaNutritionNorms.buildCardModelReadOnly(input, draft.preferences); }
    catch { return null; }
  }

  function renderFood(draft, view) {
    var doc = view.document, summary = w.VildaFoodSummary, practice = w.VildaMacroPractice;
    if (draft.rows.some(function (row) {
      return row.kind === 'custom' ? !summary.normalizeCustomFood(row) : row.key && !positiveQuantity(row.qty);
    })) {
      return message(doc, 'Uzupełnij porcje i dane własnych produktów, aby obliczyć wynik posiłku.');
    }
    var goals = foodGoals(draft);
    var items = draft.rows.map(function (row) {
      if (row.kind === 'custom') return summary.buildCustomFoodItem(row);
      var food = practice.foods[row.key], qty = Number(row.qty);
      if (!food || !positiveQuantity(qty)) return null;
      return {
        key: row.key, qty: qty, name: practice.macroPracticeBuildSelectedFoodLabel(row.key, qty) || food.name,
        foodGroup: food.foodGroup || practice.macroPracticeResolveFoodGroup(food), kcal: (Number(food.kcal) || 0) * qty,
        analysis: practice.macroPracticeAnalyzeFoodSelection(row.key, qty, goals)
      };
    }).filter(Boolean);
    if (!items.length) return message(doc, 'Wynik pojawi się po dodaniu produktu i porcji.');
    var state = summary.buildState({ foods: practice.foods, kcal: items.reduce(function (sum, item) {
      return sum + item.kcal;
    }, 0),
      items: items, nutritionGoalsForFoods: goals });
    var result = doc.createElement('div');
    var totals = element(doc, 'section', 'vhome-tool-food-totals');
    var primary = element(doc, 'div', 'vhome-tool-food-total');
    var table = element(doc, 'div', 'vhome-tool-food-table');
    totals.append(primary, table);
    var met = element(doc, 'details', 'vhome-tool-food-met');
    met.open = !!view.result.querySelector('.vhome-tool-food-met[open]');
    var times = element(doc, 'div', 'vhome-tool-food-table');
    met.append(element(doc, 'summary', '', 'Orientacyjny czas aktywności · MET'), times,
      message(doc, 'Obliczenia oparte na wartościach MET. Wyniki orientacyjne.'));
    result.append(totals, met);
    var elements = { foodTotalSection: totals, totalKcalEl: primary, totalListEl: table, timesDiv: times, foodTimesSection: met };
    summary.renderTotalSummary(state, elements);
    summary.renderBurnSummary(state, elements, { weight: draft.burnWeight, age: draft.burnAge });
    var toggle = primary.querySelector('[data-food-total-info-toggle]');
    var information = primary.querySelector('#foodTotalInfoPanel');
    if (toggle && information) {
      function showDetails(open) {
        information.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'Informacje ▴' : 'Informacje ▾';
      }
      showDetails(!!view.result.querySelector('[data-food-total-info-toggle][aria-expanded="true"]'));
      toggle.addEventListener('click', function () { showDetails(information.hidden); });
    }
    return result;
  }

  function validFood(draft) {
    var nativeById = new Map(nativeFoodRows(nativeFoodList()).map(function (node) {
      return [node.dataset.id, readFoodRow(node)];
    }));
    return draft.rows.every(function (row) {
      if (row.kind === 'custom') return !!w.VildaFoodSummary.normalizeCustomFood(row);
      var saved = nativeById.get(row.nativeId);
      if (saved && saved.kind !== 'custom' && row.key === saved.key && row.qty === saved.qty) return true;
      return Object.hasOwn(w.VildaMacroPractice.foods, row.key) && positiveQuantity(row.qty);
    });
  }

  function applyFood(draft, isCurrent) {
    var list = nativeFoodList(), practice = w.VildaMacroPractice;
    if (!isCurrent() || !list || !validFood(draft)) return false;
    var original = nativeFoodRows(list);
    var originalById = new Map(original.map(function (node) { return [node.dataset.id, node]; }));
    var usedNativeIds = new Set(), customIds = new Set(), updates = [], next = [];

    // Prepare native rows and check for disappearing products before touching the live visit.
    for (var row of draft.rows) {
      var fresh = row.nativeId === null;
      var existing = originalById.get(row.nativeId);
      if (!fresh && (!existing || usedNativeIds.has(row.nativeId))) return false;
      if (!fresh) usedNativeIds.add(row.nativeId);
      if (row.kind === 'custom') {
        var custom = w.VildaFoodSummary.normalizeCustomFood(row);
        var previous = existing && practice.readCustomFoodRow(existing);
        if (!custom || (!fresh && previous?.id !== custom.id) || customIds.has(custom.id)) return false;
        var unchanged = previous && custom.name === previous.name && custom.grams === previous.grams && custom.kcalPer100g === previous.kcalPer100g;
        var customNode = unchanged ? existing : practice.createCustomFoodRow(custom);
        if (!customNode) return false;
        customIds.add(custom.id);
        next.push(customNode);
        continue;
      }
      if (existing?.dataset.foodKind === 'custom') return false;
      var node = existing || practice.createFoodRow(row.key);
      if (!node) return false;
      var controls = foodRowControls(node);
      if (row.key !== controls.product.value && !Array.from(controls.product.options).some(function (option) {
        return option.value === row.key;
      })) return false;
      if (fresh) {
        controls.product.value = row.key;
        controls.quantity.value = row.qty;
        if (controls.quantity.value !== row.qty) return false;
      } else {
        updates.push({ controls: controls, key: row.key, qty: row.qty });
      }
      next.push(node);
    }
    if (!isCurrent()) return false;
    updates.forEach(function (update) {
      if (update.controls.product.value !== update.key) update.controls.product.value = update.key;
      if (update.controls.quantity.value !== update.qty) update.controls.quantity.value = update.qty;
    });
    list.replaceChildren(...next);
    w.VildaFoodSummary.refreshCardOnly({ preserveViewport: true });
    if (!isCurrent()) return false;
    w.vildaPersistScheduleSave();
    w.VildaDataImportExport.scheduleMainSessionSave();
    return true;
  }

  function hasFood(values) {
    return values?.rows.some(function (row) {
      return row.kind === 'custom' ? !!w.VildaFoodSummary.normalizeCustomFood(row) : !!row.key && positiveQuantity(row.qty);
    }) === true;
  }

  tools.register('food', { read: readFood, mount: mountFood, render: renderFood, validate: validFood, apply: applyFood,
    hasData: hasFood, status: function (values) { return hasFood(values) ? 'Zapisano dane modułu' : 'Bez zapisanych produktów'; } });

  var nutritionViews = new WeakMap();

  function readNutrition() {
    var norms = w.VildaNutritionNorms, micros = w.VildaNutritionMicros;
    if (!norms?.readCardInput || !micros?.buildCardModelReadOnly || !w.VildaHtml) return null;
    if ((!d.getElementById('age')?.value && !d.getElementById('ageMonths')?.value) || !d.getElementById('sex')?.value) return null;
    return { inputs: norms.readCardInput(), preferences: norms.readUiState(), profile: micros.readProfileFromDom() };
  }

  function macroModel(draft) {
    var input = Object.assign({}, draft.inputs);
    ['weightKg', 'heightCm', 'mainPal'].forEach(function (key) {
      if (input[key] === null) input[key] = NaN;
    });
    return w.VildaNutritionNorms.buildCardModelReadOnly(input, draft.preferences);
  }

  function microModel(draft) {
    var profile = Object.assign({}, draft.profile);
    ['ageYears', 'ageMonths', 'weightKg', 'heightCm'].forEach(function (key) {
      if (profile[key] === null) profile[key] = NaN;
    });
    return w.VildaNutritionMicros.buildCardModelReadOnly(profile);
  }

  function nutritionCard(doc, panel, model) {
    var api = panel === 'macros' ? w.VildaNutritionNorms : w.VildaNutritionMicros;
    var content = element(doc, 'div', 'vhome-tool-nutrition-result');
    w.VildaHtml.setTrustedHtml(content, api.renderCardMarkup(model), { context: 'home-tools:nutrition-' + panel });
    return content;
  }

  function visitContext(doc, draft) {
    var context = element(doc, 'div', 'vhome-tool-nutrition-context');
    var format = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });
    function measured(value, unit) { return Number.isFinite(value) ? format.format(value) + (unit ? ' ' + unit : '') : 'Nie podano'; }
    var years = Number.isFinite(draft.profile.ageYears) ? draft.profile.ageYears : 0;
    var months = Number.isFinite(draft.profile.ageMonths) ? draft.profile.ageMonths : 0;
    var yearUnit = { one: 'rok', few: 'lata' }[new Intl.PluralRules('pl-PL').select(years)] || 'lat';
    var age = [years || !months ? measured(years, yearUnit) : '', months ? measured(months, 'mies.') : ''].filter(Boolean).join(' ');
    [
      ['Wiek', age],
      ['Płeć', draft.inputs.sex === 'F' ? 'Żeńska' : 'Męska'],
      ['Masa ciała', measured(draft.inputs.weightKg, 'kg')],
      ['Wysokość / długość', measured(draft.inputs.heightCm, 'cm')],
      ['PAL z zaleceń dietetycznych', measured(draft.inputs.mainPal, '')]
    ].forEach(function (entry) {
      var row = element(doc, 'div', 'vhome-tool-nutrition-measure');
      row.append(element(doc, 'span', '', entry[0]), element(doc, 'strong', '', entry[1]));
      context.append(row);
    });
    return context;
  }

  function mountNutrition(view, draft, edit) {
    var doc = view.document;
    var tabs = element(doc, 'div', 'vhome-tool-nutrition-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Normy żywieniowe');
    var controls = element(doc, 'div', 'vhome-tool-nutrition-controls');
    var state = { panel: 'macros', controls: controls, controlsPanel: '', loadedMicro: false, group: 0 };
    nutritionViews.set(view, state);
    view.context.after(tabs);
    view.input.previousElementSibling.textContent = view.calculation ? 'Dane z zapisanej wizyty' : 'Dane z bieżącej wizyty';
    view.input.append(visitContext(doc, draft), controls);
    view.result.id = 'vhomeNutritionPanel';
    view.result.setAttribute('role', 'tabpanel');

    function select(panel) {
      state.panel = panel;
      tabs.querySelectorAll('[role="tab"]').forEach(function (tab) {
        var selected = tab.dataset.nutritionTab === panel;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected) view.result.setAttribute('aria-labelledby', tab.id);
      });
      view.refresh?.();
    }

    [['macros', 'Makroskładniki'], ['micros', 'Witaminy i minerały']].forEach(function (entry) {
      var tab = element(doc, 'button', '', entry[1]);
      tab.type = 'button';
      tab.id = 'vhomeNutrition-' + entry[0];
      tab.dataset.nutritionTab = entry[0];
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', view.result.id);
      tab.setAttribute('aria-selected', String(entry[0] === state.panel));
      tab.tabIndex = entry[0] === state.panel ? 0 : -1;
      tab.addEventListener('click', function () { select(entry[0]); });
      tab.addEventListener('keydown', function (event) {
        var next = { Home: tabs.firstElementChild, End: tabs.lastElementChild,
          ArrowLeft: tab.previousElementSibling || tabs.lastElementChild,
          ArrowRight: tab.nextElementSibling || tabs.firstElementChild }[event.key];
        if (!next) return;
        event.preventDefault();
        next.focus();
        select(next.dataset.nutritionTab);
      });
      tabs.append(tab);
    });
    view.result.setAttribute('aria-labelledby', tabs.firstElementChild.id);

    controls.addEventListener('change', function (event) {
      var input = event.target;
      if (input.id === 'microsIronVariant') {
        var variants = Object.assign({}, draft.profile.variantPreference);
        if (input.value) variants.iron = input.value;
        else delete variants.iron;
        edit('profile', Object.assign({}, draft.profile, { variantPreference: variants }));
        return;
      }
      if (input.dataset.nutritionGroup) {
        state.group = Number(input.value);
        view.refresh?.();
        return;
      }
      var changes = Object.assign({}, draft.preferences);
      if (input.id === 'nutritionNormsPalSelect') changes.palSelector = input.value;
      else if (input.name === 'nutritionNormsBodyMode') changes.bodyMode = input.value;
      else if (input.id === 'nutritionNormsSummaryToggle') {
        changes.includeInSummary = input.checked;
        controls.querySelector('.nutrition-norms-toolbar-state').textContent = input.checked ? 'Włączone' : 'Wyłączone';
      } else return;
      edit('preferences', changes);
    });
  }

  function nutritionExamples(view, card, model, macro) {
    var doc = view.document;
    card.querySelectorAll('[data-micros-tooltip]').forEach(function (tip) { tip.title = tip.dataset.microsTooltip; });
    var examples = element(doc, 'section', 'vhome-tool-nutrition-examples');
    examples.hidden = true;
    card.prepend(examples);
    card.addEventListener('click', function (event) {
      var button = event.target.closest('[data-practice-sheet], [data-micros-examples], .nutrition-micros-vitd-toggle');
      if (!button) return;
      if (button.matches('.nutrition-micros-vitd-toggle')) {
        var panel = doc.getElementById(button.getAttribute('aria-controls'));
        var expanded = button.getAttribute('aria-expanded') === 'true';
        if (panel) panel.hidden = expanded;
        button.setAttribute('aria-expanded', String(!expanded));
        return;
      }
      var content = macro ? w.VildaNutritionNorms.buildPracticeExamples(model, button.dataset.practiceSheet)
        : w.VildaNutritionMicros.buildExamples(model, button.dataset.microsExamples);
      if (!content) return;
      var close = element(doc, 'button', '', 'Wróć do norm');
      close.type = 'button';
      var body = element(doc, 'div', '');
      var footer = element(doc, 'div', 'vhome-tool-note', content.footer);
      w.VildaHtml.setTrustedHtml(body, content.bodyHtml, { context: 'home-tools:nutrition-examples' });
      if (content.footerHtml) w.VildaHtml.setTrustedHtml(footer, content.footerHtml, { context: 'home-tools:nutrition-examples-footer' });
      examples.replaceChildren(element(doc, 'h4', '', content.title), message(doc, content.subtitle), body, footer, close);
      Array.from(card.children).forEach(function (child) { child.hidden = child !== examples; });
      close.addEventListener('click', function () {
        Array.from(card.children).forEach(function (child) { child.hidden = child === examples; });
        button.focus();
      });
      close.focus();
    });
  }

  function renderNutrition(draft, view) {
    var state = nutritionViews.get(view), doc = view.document, macro = state.panel === 'macros';
    var model = macro ? macroModel(draft) : microModel(draft);
    if (state.controlsPanel !== state.panel || !model) {
      state.controls.replaceChildren();
      state.controlsPanel = model ? state.panel : '';
    }
    if (!model) {
      if (!macro && !state.loadedMicro) {
        state.loadedMicro = true;
        w.VildaNutritionMicros.ensureData().then(function () {
          if (doc.defaultView?.frameElement?.isConnected && state.panel === 'micros') view.refresh?.();
        }).catch(function () { /* The unavailable message remains visible. */ });
      }
      return message(doc, 'Normy nie są dostępne dla tych danych.');
    }
    var card = nutritionCard(doc, state.panel, model);
    var nativeControls = card.querySelector(macro ? '.nutrition-norms-toolbar' : '.nutrition-micros-control-box');
    if (view.calculation) nativeControls?.querySelector('.nutrition-norms-toolbar-row--summary')?.remove();
    if (state.controls.childElementCount === 0) {
      if (nativeControls) state.controls.append(nativeControls);
      if (!macro && card.querySelector('.nutrition-micros-details')) {
        var groups = element(doc, 'select');
        groups.dataset.nutritionGroup = 'true';
        var labels = ['Najważniejsze składniki'];
        Array.from(card.querySelectorAll('.nutrition-micros-details > summary')).forEach(function (summary) { labels.push(summary.textContent); });
        labels.forEach(function (label, index) {
          var option = element(doc, 'option', '', label);
          option.value = String(index);
          groups.append(option);
        });
        groups.value = String(state.group);
        state.controls.append(labelled(doc, 'Zakres wyników', groups));
      }
    } else nativeControls?.remove();
    card.querySelectorAll('.nutrition-micros-details').forEach(function (detail, index) {
      detail.open = index + 1 === state.group;
    });
    nutritionExamples(view, card, model, macro);
    return card;
  }

  function applyNutrition(draft, isCurrent) {
    if (!isCurrent()) return false;
    var saved = readNutrition();
    if (!saved) return false;
    var iron = draft.profile.variantPreference.iron || '';
    if (iron !== (saved.profile.variantPreference.iron || '')) {
      if (!w.VildaNutritionMicros.applyIronVariant(iron)) return false;
    }
    if (!isCurrent()) return false;
    var changes = {};
    Object.keys(saved.preferences).forEach(function (key) {
      if (draft.preferences[key] !== saved.preferences[key]) changes[key] = draft.preferences[key];
    });
    if (Object.keys(changes).length > 0) return !!w.VildaNutritionNorms.commitUiState(changes);
    return true;
  }

  tools.register('nutrition', { read: readNutrition, mount: mountNutrition, render: renderNutrition, apply: applyNutrition,
    status: function (values) { return values ? 'Kontekst z Karty pacjenta' : 'Uzupełnij wiek i płeć'; } });
})(window, document);
