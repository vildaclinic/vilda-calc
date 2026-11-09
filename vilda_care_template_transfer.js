/* Portable, single care-template files. Pure codec: no vault, DOM, network,
 * clock or randomness. Authors and permissions are declarations; SHA-256
 * checks consistency and does not authenticate the publisher. */
(function (root) {
  'use strict';
  if (!root) return;
  const FORMAT = 'vilda-care-template/v1', MAX_BYTES = 524288;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  function byteLength(value) {
    let length = 0;
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index);
      if (code < 0x80) length++;
      else if (code < 0x800) length += 2;
      else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) { length += 4; index++; }
      else length += 3;
      if (length > MAX_BYTES) return length;
    }
    return length;
  }
  function fail(reason, issues) {
    return { ok: false, reason, issues: issues && issues.length ? issues : [{ code: reason, path: [], fieldPath: '' }] };
  }
  function model() {
    const value = root.VildaCareTemplateModel;
    return value && value.CONTENT_VERSION === 2 && typeof value.definitionDigest === 'function' && typeof value.instructionDigest === 'function' ? value : null;
  }
  function definitionResult(value) {
    const api = model();
    if (!api) return fail('CARE_TEMPLATE_UPDATE_REQUIRED');
    const result = api.canonicalDefinition(value);
    if (!result.ok) return fail('CARE_TEMPLATE_FILE_INVALID', result.issues);
    if (result.definition.contentVersion !== 2) return fail('CARE_TEMPLATE_PUBLICATION_REQUIRED');
    return result;
  }
  async function permissionIssue(definition, exporting) {
    const publication = definition.publication;
    if (!publication.origin) return null;
    if (exporting && !publication.license.allowRedistribution) return 'CARE_TEMPLATE_REDISTRIBUTION_FORBIDDEN';
    if (await model().instructionDigest(definition) === publication.origin.instructionDigest) return null;
    if (!publication.license.allowAdaptation) return 'CARE_TEMPLATE_ADAPTATION_FORBIDDEN';
    if (!publication.contributors.length || !publication.changes) return 'CARE_TEMPLATE_CHANGE_ATTRIBUTION_REQUIRED';
    return null;
  }
  function summary(definition, contentDigest) {
    return { ok: true, definition, contentDigest, stageCount: definition.stages.length, stepCount: definition.steps.length, issues: [] };
  }
  // Public, deterministic stage/step IDs prevent local identifiers from leaving
  // the account. Import creates wholly new local identities, including when a
  // recipient already has a template with the same displayed name.
  function portableDefinition(value) {
    const definition = clone(value), stages = new Map(definition.stages.map(stage => [stage.id, stage]));
    const steps = new Map(definition.steps.map(step => [step.id, step])), nextStages = [], nextSteps = [];
    definition.stageOrder.forEach((stageId, stageIndex) => {
      const stage = stages.get(stageId), nextStageId = 'stage-' + (stageIndex + 1), stepIds = [];
      stage.stepIds.forEach(stepId => {
        const nextStepId = 'step-' + (nextSteps.length + 1); stepIds.push(nextStepId);
        nextSteps.push({ ...steps.get(stepId), id: nextStepId, stageId: nextStageId });
      });
      nextStages.push({ id: nextStageId, title: stage.title, stepIds });
    });
    definition.stageOrder = nextStages.map(stage => stage.id); definition.stages = nextStages; definition.steps = nextSteps;
    return definition;
  }
  async function parse(text) {
    if (!model()) return fail('CARE_TEMPLATE_UPDATE_REQUIRED');
    if (typeof text !== 'string') return fail('CARE_TEMPLATE_FILE_INVALID');
    if (text.length > MAX_BYTES || byteLength(text) > MAX_BYTES) return fail('CARE_TEMPLATE_FILE_LIMIT');
    let envelope;
    try { envelope = JSON.parse(text); } catch { return fail('CARE_TEMPLATE_FILE_INVALID'); }
    if (!object(envelope)) return fail('CARE_TEMPLATE_FILE_INVALID');
    if (envelope.format === 'vilda-care-template-library/v1') return fail('CARE_TEMPLATE_LIBRARY_UNSUPPORTED');
    if (envelope.format !== FORMAT) return fail('CARE_TEMPLATE_FILE_VERSION_UNSUPPORTED');
    if (Object.keys(envelope).length !== 3 || !['format', 'definition', 'contentDigest'].every(key => own(envelope, key))) return fail('CARE_TEMPLATE_FILE_INVALID');
    if (typeof envelope.contentDigest !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.contentDigest)) return fail('CARE_TEMPLATE_FILE_INVALID');
    const checked = definitionResult(envelope.definition);
    if (!checked.ok) return checked;
    try {
      const contentDigest = await model().definitionDigest(checked.definition);
      if (contentDigest !== envelope.contentDigest) return fail('CARE_TEMPLATE_HASH_MISMATCH');
      const issue = await permissionIssue(checked.definition, false);
      return issue ? fail(issue) : summary(checked.definition, contentDigest);
    } catch { return fail('CARE_TEMPLATE_CRYPTO_UNAVAILABLE'); }
  }
  async function serialize(value) {
    const checked = definitionResult(value);
    if (!checked.ok) return checked;
    try {
      const issue = await permissionIssue(checked.definition, true);
      if (issue) return fail(issue);
      const definition = portableDefinition(checked.definition), contentDigest = await model().definitionDigest(definition);
      const text = JSON.stringify({ format: FORMAT, definition, contentDigest }, null, 2) + '\n';
      if (text.length > MAX_BYTES || byteLength(text) > MAX_BYTES) return fail('CARE_TEMPLATE_FILE_LIMIT');
      const slug = definition.name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'szablon';
      return { ...summary(definition, contentDigest), text, fileName: slug + '.vilda-template.json' };
    } catch { return fail('CARE_TEMPLATE_CRYPTO_UNAVAILABLE'); }
  }
  async function prepareImport(value, maps) {
    const checked = definitionResult(value);
    if (!checked.ok) return checked;
    try {
      const issue = await permissionIssue(checked.definition, false);
      if (issue) return fail(issue);
      const copied = model().duplicateDefinition(checked.definition, maps);
      if (!copied.ok) return copied;
      const source = checked.definition.publication, contentDigest = await model().definitionDigest(checked.definition);
      // Keep the first publication's identity/digests while pinning every
      // upstream credit and notice of this transfer. The bounded flat baseline
      // cannot grow into a nested chain of account histories.
      copied.definition.publication.origin = source.origin ? { ...clone(source.origin),
        contributors: source.contributors.slice(), sources: clone(source.sources), attribution: source.attribution, changes: source.changes }
        : { id: source.id, version: source.version, contentDigest, instructionDigest: await model().instructionDigest(checked.definition),
          authors: source.authors.slice(), contributors: source.contributors.slice(), sources: clone(source.sources), license: clone(source.license),
          attribution: source.attribution, changes: source.changes };
      const normalized = definitionResult(copied.definition);
      return normalized.ok ? summary(normalized.definition, contentDigest) : normalized;
    } catch { return fail('CARE_TEMPLATE_CRYPTO_UNAVAILABLE'); }
  }
  async function isModified(value) {
    const checked = definitionResult(value);
    if (!checked.ok) throw new Error(checked.reason);
    return checked.definition.publication.origin !== null
      && await model().instructionDigest(checked.definition) !== checked.definition.publication.origin.instructionDigest;
  }
  async function findDuplicates(value, definitions) {
    const checked = definitionResult(value), result = { exact: [], related: [] };
    if (!checked.ok || !Array.isArray(definitions)) return result;
    const comparable = definition => {
      const copy = portableDefinition(definition); copy.publication.origin = null;
      return canonical(copy);
    };
    const publication = checked.definition.publication, key = comparable(checked.definition);
    definitions.forEach((candidate, index) => {
      const entry = definitionResult(candidate);
      if (!entry.ok || entry.definition.publication.id !== publication.id || entry.definition.publication.version !== publication.version) return;
      result[comparable(entry.definition) === key ? 'exact' : 'related'].push(index);
    });
    return result;
  }
  root.VildaCareTemplateTransfer = Object.freeze({ FORMAT, MAX_BYTES, parse, serialize, prepareImport, isModified, findDuplicates });
})(typeof window !== 'undefined' ? window : globalThis);
