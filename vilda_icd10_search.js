/* Pure local lookup of the supplied Polish ICD-10 catalogue. Names and code
 * markers remain source data; normalization is used only for matching. */
(function (root) {
  "use strict";

  function fold(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[łŁ]/g, "l").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function codeKey(value) {
    return typeof value === "string" ? value.replace(/[.\s†*+]/g, "").toUpperCase() : "";
  }

  function metadataCopy(value, seen) {
    if (!value || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    const copy = Array.isArray(value) ? [] : {};
    seen.set(value, copy);
    for (const key of Object.keys(value)) {
      Object.defineProperty(copy, key, { value: metadataCopy(value[key], seen), enumerable: true });
    }
    return Object.freeze(copy);
  }

  function wordPrefix(text, term) {
    let offset = text.indexOf(term);
    while (offset !== -1) {
      if (offset === 0 || !/[\p{L}\p{N}]/u.test(text.charAt(offset - 1))) return true;
      offset = text.indexOf(term, offset + 1);
    }
    return false;
  }

  function resultLimit(options) {
    const requested = options && options.limit;
    if (typeof requested !== "number" || Number.isNaN(requested)) return 12;
    return Math.max(1, Math.min(50, Math.floor(requested)));
  }

  function rank(record, query, queryCode, terms) {
    if (record.key === queryCode || terms.some(term => term.code === record.key)) return 0;
    if ((queryCode && record.key.startsWith(queryCode))
      || terms.some(term => term.code && record.key.startsWith(term.code))) return 1;
    if (record.name.startsWith(query)) return 2;
    if (terms.every(term => record.name.includes(term.text))) {
      return terms.every(term => wordPrefix(record.name, term.text)) ? 3 : 4;
    }
    if (terms.every(term => record.name.includes(term.text) || (term.code && record.key.includes(term.code)))) return 4;
    return 5;
  }

  function create(catalogue) {
    const rows = catalogue && Array.isArray(catalogue.entries) ? catalogue.entries : [];
    const byCode = new Map();
    for (const row of rows) {
      if (!Array.isArray(row) || typeof row[0] !== "string" || typeof row[1] !== "string"
        || !row[0].trim() || !row[1].trim()) continue;
      const key = codeKey(row[0]);
      if (!key || byCode.has(key)) continue;
      byCode.set(key, { key, code: row[0], name: row[1], parentCode: typeof row[2] === "string" && row[2].trim() ? row[2] : null });
    }
    const records = Array.from(byCode.values()).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
      .map(row => {
        const parent = row.parentCode && byCode.get(codeKey(row.parentCode));
        const entry = Object.freeze({ code: row.code, name: row.name, parentCode: row.parentCode, parentName: parent ? parent.name : "" });
        return { key: row.key, name: fold(entry.name), parentName: fold(entry.parentName), entry };
      });
    const entriesByCode = new Map(records.map(record => [record.key, record.entry]));
    const metadata = metadataCopy(catalogue && catalogue.metadata && typeof catalogue.metadata === "object" ? catalogue.metadata : {}, new WeakMap());

    function lookup(code) {
      return entriesByCode.get(codeKey(code)) || null;
    }

    function search(query, options) {
      if (typeof query !== "string") return { items: [], total: 0 };
      const normalized = fold(query);
      const terms = normalized.split(" ").filter(term => /[\p{L}\p{N}]/u.test(term))
        .map(term => ({ text: term, code: codeKey(term) }));
      if (!terms.length) return { items: [], total: 0 };
      const queryCode = codeKey(normalized);
      const limit = resultLimit(options);
      const buckets = [[], [], [], [], [], []];
      let total = 0;
      for (const record of records) {
        if (!terms.every(term => record.name.includes(term.text) || record.parentName.includes(term.text)
          || (term.code && record.key.includes(term.code)))) continue;
        total += 1;
        const bucket = buckets[rank(record, normalized, queryCode, terms)];
        if (bucket.length < limit) bucket.push(record.entry);
      }
      return { items: buckets.flat().slice(0, limit), total };
    }

    return Object.freeze({ metadata, search, lookup });
  }

  root.VildaICD10Search = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
