/* Saved SGA assessment presentation. Never recomputes historical results or mutates birth. */
(function (root) {
  'use strict';
  const FIELDS = [
    { key: 'weight', label: 'Masa urodzeniowa', unit: 'g', decimals: 0 },
    { key: 'length', label: 'Długość urodzeniowa', unit: 'cm', decimals: 1 },
    { key: 'head', label: 'Obwód głowy', unit: 'cm', decimals: 1 }
  ];
  const REFERENCES = {
    niklasson: 'https://doi.org/10.1186/1471-2431-8-8',
    intergrowth: 'https://doi.org/10.1016/S0140-6736(14)60932-6'
  };

  function number(value) {
    if (value == null || String(value).trim() === '') return null;
    const parsed = Number(String(value).trim().replace(/\s+/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function format(value, decimals) {
    return value.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function sdsLabel(value) {
    return typeof value === 'number' && Number.isFinite(value)
      ? format(value, 2).replace(/^-/, '−') : '—';
  }

  // The birth calculator owns the categories (including its strict -2 SDS boundary).
  // The head circumference is additional information, never a criterion of SGA here.
  function sourceVerdict(source) {
    const statuses = [source.summary.weightStatus, source.summary.lengthStatus];
    if (statuses.includes('TAK')) return 'yes';
    if (statuses.every(status => status === 'NIE')) return 'no';
    return 'partial';
  }

  function positiveSubtitle(sources) {
    if (sources.length !== 1) return 'Wynik według ' + sources.length + ' źródeł';
    const summary = sources[0].summary;
    if (summary.weightStatus === 'TAK' && summary.lengthStatus === 'TAK') return 'Masa i długość poniżej −2 SDS';
    return summary.weightStatus === 'TAK' ? 'Masa poniżej −2 SDS' : 'Długość poniżej −2 SDS';
  }

  function build(birth) {
    if (!birth || typeof birth !== 'object' || Array.isArray(birth)) return null;
    const hasBirthData = ['weeks', 'weight', 'length', 'head'].some(key => birth[key] != null && String(birth[key]).trim() !== '');
    if (!hasBirthData) return null;
    const weeks = number(birth.weeks);
    const days = number(birth.days);
    const sex = String(birth.sex || '').toLowerCase();
    const model = {
      tone: 'improve', value: 'Do oceny', subtitle: 'Zapisane pomiary urodzeniowe',
      sexLabel: ['male', 'm'].includes(sex) ? 'Chłopiec' : ['female', 'f', 'k'].includes(sex) ? 'Dziewczynka' : 'Brak danych',
      gestationLabel: weeks != null ? format(weeks, 0) + ' tyg.' + (days != null ? ' + ' + format(days, 0) + ' dni' : '') : 'Brak danych',
      measurements: FIELDS.map(field => {
        const value = number(birth[field.key]);
        return { key: field.key, label: field.label, valueLabel: value == null ? 'Brak pomiaru' : format(value, field.decimals) + ' ' + field.unit };
      }),
      sources: [], notes: [], computedAtISO: null, hasAssessment: false
    };
    const saved = root.VildaBirthAssessment && root.VildaBirthAssessment.read(birth);
    if (!saved) return model;
    model.hasAssessment = true;
    model.computedAtISO = saved.computedAtISO;
    model.notes = saved.notes || [];
    model.sources = saved.sources.map(source => ({
      sourceKey: source.sourceKey, title: source.title, sourceLabel: source.sourceLabel,
      referenceURL: REFERENCES[source.sourceKey] || null,
      weightStatus: source.summary.weightStatus,
      lengthStatus: source.summary.lengthStatus,
      notes: (source.notes || []).concat(source.metaLines || []),
      metrics: FIELDS.map(field => {
        const metric = source.metrics[field.key];
        const measured = model.measurements.find(item => item.key === field.key);
        return {
          key: field.key, label: field.label, valueLabel: measured.valueLabel,
          sdsLabel: metric ? sdsLabel(metric.sds) : '—',
          tone: !metric || metric.unavailable || metric.sds == null ? 'improve'
            : metric.interpretation === 'poniżej -2 SDS' ? 'alert'
              : ['w zakresie referencyjnym', 'powyżej +2 SDS'].includes(metric.interpretation) ? 'ok' : 'improve',
          interpretation: metric ? metric.interpretation : 'Brak pomiaru'
        };
      })
    }));
    const verdicts = saved.sources.map(sourceVerdict);
    if (verdicts.every(verdict => verdict === 'yes')) {
      model.tone = 'alert'; model.value = 'Tak'; model.subtitle = positiveSubtitle(saved.sources);
    } else if (verdicts.every(verdict => verdict === 'no')) {
      model.tone = 'ok'; model.value = 'Nie'; model.subtitle = 'Masa i długość bez cech SGA';
    } else if (verdicts.includes('yes') && verdicts.includes('no')) {
      model.value = 'Różne oceny'; model.subtitle = 'Sprawdź wyniki dla wybranych norm';
    } else if (new Set(verdicts).size > 1) {
      model.subtitle = 'Niepełna ocena dla części norm';
    } else {
      model.subtitle = 'Niepełne dane do oceny SGA';
    }
    return model;
  }

  function summaryText(birth) {
    const model = build(birth);
    if (!model) return '';
    const lines = ['SGA: ' + model.value + ' — ' + model.subtitle + '.'];
    lines.push('Wiek ciążowy: ' + model.gestationLabel + '.');
    if (!model.hasAssessment) {
      model.measurements.filter(metric => metric.valueLabel !== 'Brak pomiaru').forEach(metric => lines.push(metric.label + ': ' + metric.valueLabel + '.'));
      lines.push('Brak zapisanej oceny SDS.');
    } else {
      model.sources.forEach(source => {
        lines.push(source.title + ':');
        source.metrics.filter(metric => metric.valueLabel !== 'Brak pomiaru').forEach(metric => {
          lines.push(metric.label + ': ' + metric.valueLabel + (metric.sdsLabel === '—' ? ' — ' + metric.interpretation : ', SDS ' + metric.sdsLabel) + '.');
        });
        lines.push('SGA po masie: ' + source.weightStatus + '; po długości: ' + source.lengthStatus + '.');
      });
    }
    return lines.join('\n');
  }

  root.VildaPatientSgaModel = Object.freeze({ build, summaryText });
})(typeof window !== 'undefined' ? window : globalThis);
