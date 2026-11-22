/* Read-only presentation of the revision returned by getPatientVisits.
 * Only the explicitly labeled comparison reads the open patient's form. */
(function (w) {
  'use strict';

  const missing = '—';
  const decimal = new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 2});
  const savedDate = new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const sources = {OLAF: 'OLAF / OLA', PALCZEWSKA: 'Palczewska', WHO: 'WHO', DS: 'Zemel 2015'};

  function number(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const input = String(value).trim().replace(',', '.');
    if (!input) return null;
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function positive(value) { const n = number(value); return n > 0 ? n : null; }

  function dayISO(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const parsed = new Date(value + 'T12:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : '';
  }
  function dayLabel(iso) { return iso ? iso.split('-').reverse().join('.') : 'Nie podano daty'; }

  function ageAtVisit(user, clinicalDay) {
    const years = number(user.age), extra = number(user.ageMonths), weeks = number(user.ageWeeks);
    let months = Number.isInteger(years) && years >= 0 && (extra === null || Number.isInteger(extra) && extra >= 0 && extra < 12)
      ? years * 12 + (extra || 0) : null;
    if (years === null && Number.isInteger(extra) && extra > 0 && extra < 12) months = extra;
    const dob = w.VildaDobAge, birth = dayISO(user.dobISO);
    const measured = dayISO(user.measuredAtISO) || clinicalDay;
    const calendar = birth && measured && dob?.ageFromDobISO?.(birth, new Date(measured + 'T12:00:00'));
    if (months === null && calendar) months = calendar.totalMonths;
    const recordedWeeks = Number.isInteger(weeks) && weeks >= 0 && weeks <= dob?.WEEKS_MAX ? weeks : null;
    if (months === null && recordedWeeks !== null) months = dob.monthsFromWeeks(recordedWeeks);
    if (months === null) return {months: null, exact: null, label: 'Nie podano wieku'};
    const consistent = calendar && calendar.totalMonths === months;
    const exact = consistent ? dob.exactMonthsFromDays(calendar.days) : null;
    const infantWeeks = consistent ? calendar.weeks : recordedWeeks;
    const label = dob?.weeksApplicable?.(months) && infantWeeks !== null
      ? dob.describeWeeks(infantWeeks) : dob?.describeAge?.({years: Math.floor(months / 12), ageMonths: months % 12}) || months + ' mies.';
    return {months, exact, label};
  }

  function metric(key, label, value, unit) {
    const display = value === null ? missing : key === 'bmi' && w.VildaBmi?.fmtBmi ? w.VildaBmi.fmtBmi(value) : decimal.format(value);
    const assessment = value === null ? 'Brak pomiaru' : key === 'bmi' ? 'Obliczono z masy i wzrostu' : 'Pomiar zapisany podczas wizyty';
    return {key, label, value, display, unit, assessment, tone: 'neutral'};
  }
  function measurements(user) {
    const height = positive(user.height), weight = positive(user.weight);
    const bmi = height !== null && weight !== null && typeof w.BMI === 'function' ? positive(w.BMI(weight, height)) : null;
    return [metric('height', 'Wysokość ciała', height, 'cm'), metric('weight', 'Masa ciała', weight, 'kg'), metric('bmi', 'BMI', bmi, 'kg/m²')];
  }
  function withUnit(item) { return item.value === null ? missing : item.display + ' ' + item.unit; }

  function reference(payload) {
    if (payload.clinical?.downSyndrome === true) return 'DS';
    const source = String(payload.zscore?.dataSource || '').trim().toUpperCase();
    return Object.hasOwn(sources, source) ? source : '';
  }
  function project(row, context = {}) {
    const payload = row.payload || {}, user = payload.user || {};
    const dateISO = dayISO(row.clinicalDateISO);
    const dateCertain = !!dateISO && (row.origin === 'explicit' || row.dateSource === 'measuredAt');
    const age = ageAtVisit(user, dateCertain ? dateISO : '');
    const metrics = measurements(user), source = reference(payload);
    const saved = Date.parse(row.savedAtISO);
    return {...row, dateISO, dateCertain, dateLabel: dayLabel(dateISO), yearLabel: dateISO.slice(0, 4),
      savedLabel: Number.isFinite(saved) ? savedDate.format(saved) : missing,
      ordinal: context.ordinal || '', ageLabel: age.label, ageMonths: age.months, exactAgeMonths: age.exact,
      heightLabel: withUnit(metrics[0]), weightLabel: withUnit(metrics[1]), bmiLabel: withUnit(metrics[2]),
      referenceLabel: sources[source] || '',
      description: typeof payload.visitTitle === 'string' ? payload.visitTitle : '', metrics};
  }

  function getComparison(row) {
    const id = row.patientId, panel = w.VildaPanelPacjent;
    const ready = id && w.VildaVault?.isUnlocked() && w.sessionStorage.getItem('vildaCurrentPatientId') === id &&
      panel?.wlasciciel() === id && !panel.nieaktualny() && !w.__vildaPersistRestoring &&
      !w.VildaDataImportExport?.isMainSessionRestorePending();
    const value = key => ready ? w.document.getElementById(key)?.value : null;
    const user = {age: value('age'), ageMonths: value('ageMonths'), ageWeeks: value('ageWeeks'), height: value('height'), weight: value('weight')};
    const current = measurements(user), archived = row.metrics || measurements(row.payload?.user || {});
    const rows = archived.map((item, index) => {
      const other = current[index];
      let difference = missing;
      if (item.value !== null && other.value !== null) {
        const rounded = Number((other.value - item.value).toFixed(item.key === 'bmi' ? 1 : 2));
        difference = (rounded > 0 ? '+' : '') + decimal.format(rounded || 0);
      }
      return {key: item.key, label: item.label, historical: item.display, current: other.display, difference, unit: item.unit};
    });
    return {ageLabel: ageAtVisit(user, '').label, rows};
  }

  function getGeneral(patientHeader = {}, notes = []) {
    const patientName = patientHeader?.name || '';
    const patientId = patientHeader?.patientId;
    const general = (Array.isArray(notes) ? notes : []).filter(note => {
      if (!patientId || note?.patientId !== patientId || note.scope && note.scope !== 'general') return false;
      const source = note.source || note;
      // Native Notes can also project plan documents and unlinked lab orders.
      // Only ordinary, patient-wide observations belong in the general context.
      return (!source.patientId || source.patientId === patientId) && (!source.category || source.category === 'observation')
        && source.linkedAgeMonths == null && !source.clinicalDateISO && !source.visitContext && !source.dueDateISO
        && !source.careContext && !source.treatmentContext && !source.medication && !source.ghPointId && !source.labResult;
    });
    return {patientName, notes: general.map(note => ({title: note.title, body: note.body,
      dateLabel: dayLabel(dayISO(String(note.dateISO || note.updatedAtISO || '').slice(0, 10)))}))};
  }

  function earlierMeasurements(row, rows, ageMonths) {
    const payload = row.payload;
    const recorded = payload.advanced?.data?.measurements ?? payload.growthBasic?.data?.measurements;
    if (Array.isArray(recorded)) {
      // An explicit empty history is part of the record too. The native working
      // history stores ageMonths as total months, or ageYears for older rows.
      return recorded.flatMap(point => {
        if (!point) return [];
        const years = number(point.ageYears);
        const months = number(point.ageMonths) ?? (years === null ? null : Math.round(years * 12));
        return months !== null && months >= 0 && months <= ageMonths
          ? [{ageMonths: months, height: positive(point.height), weight: positive(point.weight)}] : [];
      });
    }
    // If an older payload did not include its own history, use only earlier
    // visits whose canonical revision already existed when this one was saved.
    const at = Date.parse(row.updatedAtISO || row.savedAtISO);
    return (rows || []).filter(previous => previous.patientId === row.patientId && row.patientId && row.dateCertain &&
      previous.dateCertain && previous.dateISO < row.dateISO && previous.visitId !== row.visitId &&
      Date.parse(previous.updatedAtISO || previous.savedAtISO) <= at && previous.payload?.user?.sex === payload.user.sex &&
      previous.ageMonths !== null && previous.ageMonths >= 0 && previous.ageMonths < ageMonths)
      .map(previous => ({ageMonths: previous.ageMonths, height: positive(previous.payload.user.height), weight: positive(previous.payload.user.weight)}));
  }

  function renderChart(container, row, rows, metricKey = 'height', expanded = false) {
    const doc = container.ownerDocument;
    function unavailable(message) {
      const p = doc.createElement('p');
      p.textContent = message;
      container.replaceChildren(p);
      return false;
    }
    const payload = row.payload || {}, user = payload.user || {};
    const selected = row.metrics ? row : project(row);
    const source = reference(payload);
    if (selected.ageMonths !== null && selected.ageMonths >= 216) return unavailable('Siatki centylowe są dostępne dla wizyt pediatrycznych.');
    if (!source) return unavailable('W tej wizycie nie zapisano źródła siatki centylowej.');
    if (selected.ageMonths === null || !['M', 'F', 'K'].includes(user.sex)) return unavailable('Do odtworzenia siatki brakuje wieku lub płci w zapisie wizyty.');
    if (!['height', 'weight'].includes(metricKey) || positive(user[metricKey]) === null) return unavailable('W tej wizycie nie zapisano wybranego pomiaru.');
    const renderer = w.VildaCentileLiveRender, svg = w.VildaCentileLivePreview;
    if (!renderer?.preview || !svg?.draw) return unavailable('Podgląd siatki jest chwilowo niedostępny.');
    try {
      const result = renderer.preview({
        source, population: source === 'DS' ? 'DS' : 'OGOLNA', sex: user.sex, ageMonths: selected.ageMonths,
        exactAgeMonths: selected.exactAgeMonths, currentHeight: positive(user.height), currentWeight: positive(user.weight),
        professionalMode: payload.zscore?.resultsMode !== false,
        measurements: earlierMeasurements(selected, rows, selected.ageMonths)
      });
      if (result.status !== 'ready' || !result[metricKey]?.points?.some(point => point.current)) {
        return unavailable('Brak siatki dla zapisanego wieku, pomiaru i źródła odniesienia.');
      }
      const measuredWidth = Math.floor(container.getBoundingClientRect().width);
      const width = Math.max(275, Math.min(expanded ? 1050 : 560, measuredWidth || (expanded ? 780 : 360)));
      const height = Math.round(width * (expanded ? 0.56 : 0.64));
      const drawing = svg.draw(doc, result[metricKey], width, height).element;
      const caption = doc.createElement('p');
      caption.textContent = sources[source] + ' · Siatka odtworzona z danych zapisanych do tej wizyty.';
      container.replaceChildren(drawing, caption);
      return true;
    } catch (_) { return unavailable('Nie udało się odtworzyć siatki z danych tej wizyty.'); }
  }

  w.VildaHomeVisitProjection = Object.freeze({project, getComparison, getGeneral, renderChart});
})(window);
