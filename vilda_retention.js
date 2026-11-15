/* Technical revisions may be thinned; the latest readable state of every visit
 * survives independently of age and cap. Legacy days remain inferred visits. */
(function (root) {
  'use strict';
  var DAY = 864e5, HOUR = 36e5;
  function saved(row) { return row && (row.savedAtISO || row.payload && row.payload.timestampISO || row.timestampISO) || ''; }
  function pinned(row) { return !!(row && (row.pinned === true || row.payload && row.payload._pinned === true)); }
  function clinicalDay(row) {
    var date = row && row.payload && row.payload.user && row.payload.user.measuredAtISO;
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    var time = new Date(saved(row));
    if (!Number.isFinite(time.getTime())) return null;
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time);
    function part(type) { return parts.find(function (item) { return item.type === type; }).value; }
    return part('year') + '-' + part('month') + '-' + part('day');
  }
  function computeRetention(input, nowISO, options) {
    options = options || {};
    var cap = typeof options.cap === 'number' && options.cap > 0 ? Math.floor(options.cap) : 40;
    var recent = (typeof options.recentHours === 'number' ? options.recentHours : 24) * HOUR;
    var daily = (typeof options.dailyDays === 'number' ? options.dailyDays : 30) * DAY;
    var now = Date.parse(nowISO); if (!Number.isFinite(now)) now = Date.now();
    var rows = (Array.isArray(input) ? input : []).map(function (row) {
      var at = saved(row), time = Date.parse(at), visit = row && row.payload && row.payload.visit;
      return { id: row && (row.snapshotId || row.id), savedAtISO: at, time: Number.isFinite(time) ? time : null,
        changed: row && (row.updatedAtISO || row.savedAtISO) || at, pinned: pinned(row),
        visit: visit && typeof visit.visitId === 'string' ? 'visit:' + visit.visitId :
          'legacy:' + (clinicalDay(row) || 'unknown:' + (row && (row.snapshotId || row.id))),
        rev: row && row.rev || 0, seq: row && typeof row.seq === 'number' && Number.isFinite(row.seq) ? row.seq : null };
    }).filter(function (row) { return row.id != null; });
    function order(a, b) {
      if (a.savedAtISO !== b.savedAtISO) return a.savedAtISO > b.savedAtISO ? -1 : 1;
      if (a.changed !== b.changed) return a.changed > b.changed ? -1 : 1;
      if (a.rev !== b.rev) return b.rev - a.rev;
      if (a.seq !== null && b.seq !== null && a.seq !== b.seq) return b.seq - a.seq;
      return a.id === b.id ? 0 : a.id > b.id ? -1 : 1;
    }
    rows.sort(order);
    var keep = Object.create(null), reasons = Object.create(null), canonical = Object.create(null), protectedIds = new Set();
    function retain(id, reason) { if (!keep[id]) { keep[id] = true; reasons[id] = reason; } }
    rows.forEach(function (row) {
      var old = canonical[row.visit];
      if (!old || order(row, old) < 0) canonical[row.visit] = row;
    });
    if (rows.length) { retain(rows[0].id, 'latest'); protectedIds.add(rows[0].id); }
    var approvedHeads = Array.isArray(options.protectedVisitSnapshotIds) ? new Set(options.protectedVisitSnapshotIds) : null;
    Object.keys(canonical).forEach(function (key) {
      var id = canonical[key].id;
      if (!approvedHeads || approvedHeads.has(id)) { retain(id, 'visit'); protectedIds.add(id); }
    });
    rows.forEach(function (row) { if (row.pinned) { retain(row.id, 'pinned'); protectedIds.add(row.id); } });
    var days = Object.create(null), months = Object.create(null);
    rows.forEach(function (row) {
      var age = now - (row.time === null ? now : row.time), day = String(row.savedAtISO).slice(0, 10), month = day.slice(0, 7);
      if (keep[row.id]) { if (age > recent) { if (age <= daily) days[day] = true; else months[month] = true; } return; }
      if (age <= recent) retain(row.id, 'recent');
      else if (age <= daily) { if (!days[day]) { days[day] = true; retain(row.id, 'daily'); } }
      else if (!months[month]) { months[month] = true; retain(row.id, 'monthly'); }
    });
    var count = rows.filter(function (row) { return keep[row.id]; }).length;
    for (var index = rows.length - 1; count > cap && index >= 0; index -= 1) {
      var row = rows[index];
      if (keep[row.id] && !protectedIds.has(row.id)) { delete keep[row.id]; reasons[row.id] = 'cap'; count -= 1; }
    }
    var kept = [], pruned = [];
    rows.forEach(function (row) { (keep[row.id] ? kept : pruned).push(row.id); });
    return { total: rows.length, keep: kept, prune: pruned, keptCount: kept.length, prunedCount: pruned.length, reasons: reasons };
  }
  var api = { computeRetention: computeRetention };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.VildaRetention = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
