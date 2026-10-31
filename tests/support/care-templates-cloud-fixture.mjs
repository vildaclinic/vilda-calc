import { createHash } from 'node:crypto';
import { fictionalCareCloud } from './care-plans-sync-fixture.mjs';

const WORKER = 'https://vilda-sync.maciej-4b9.workers.dev';
const NAMESPACE = 'care-template-library';
const PROTOCOL = 1;
const LIMITS = Object.freeze({ maxEventBytes: 1048576, maxBodyBytes: 1048576, maxBatchEvents: 200,
  maxPageEvents: 200, maxAccountBytes: 67108864, maxAccountEvents: 16384 });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-expose-headers': 'ETag' };
const digest = body => createHash('sha256').update(JSON.stringify({ iv: body.iv, data: body.data })).digest('hex');
const credentialHash = token => createHash('sha256').update(token).digest('hex');
const bytes = value => Buffer.byteLength(JSON.stringify(value));

// Contract server, not a replacement for the client model or cryptography.
// Only opaque production AES-GCM envelopes enter this protected ledger. The
// separate legacy patient cloud deliberately knows nothing about its rows.
export function fictionalTemplateCloud() {
  const cloud = fictionalCareCloud({ preserveSyncPreference: true }), policies = new Map(), legacy = new Map();
  const requests = [];
  cloud.legacyRejectedRequests = [];
  let unavailable = false, legacy401 = false, lostAck = false, bumpAfterLostAck = false, appendGate = null, readGate = null;
  let releaseAppend, releaseRead;
  const attachLegacy = cloud.attach;
  cloud.templateRequests = requests;
  cloud.templatePolicies = () => [...policies].map(([slotId, row]) => ({ slotId, epoch: row.epoch,
    headSeq: row.headSeq, floorSeq: row.floorSeq, events: structuredClone(row.events) }));
  cloud.setTemplateUnavailable = value => { unavailable = !!value; };
  cloud.setLegacyInvalidCredentials = value => { legacy401 = !!value; };
  cloud.dropNextTemplateAck = ({ bumpEpoch = false } = {}) => { lostAck = true; bumpAfterLostAck = bumpEpoch; };
  cloud.holdTemplateAppends = () => { appendGate = new Promise(resolve => { releaseAppend = resolve; }); };
  cloud.releaseTemplateAppends = () => { const done = releaseAppend; appendGate = releaseAppend = null; done?.(); };
  cloud.holdTemplateReads = () => { readGate = new Promise(resolve => { releaseRead = resolve; }); };
  cloud.releaseTemplateReads = () => { const done = releaseRead; readGate = releaseRead = null; done?.(); };
  cloud.replaceLegacyIdentity = (slotId, token = 'fictional-replaced-legacy-identity') => { legacy.set(slotId, credentialHash(token)); };
  cloud.bumpTemplateEpoch = slotId => {
    const row = slotId ? policies.get(slotId) : [...policies.values()][0];
    if (!row) throw Error('Missing fictional protected template policy');
    row.epoch += 1; row.floorSeq = row.headSeq; row.events = [];
    return row.epoch;
  };

  cloud.attach = async context => {
    await attachLegacy(context);
    await context.route(`${WORKER}/**`, async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const match = /^\/v1\/slots\/([^/]+)\/(.*)$/.exec(url.pathname);
      if (!match) return route.fallback();
      const [, slotId, endpoint] = match, bearer = /^Bearer\s+(\S+)$/i.exec(request.headers().authorization || '');
      const token = bearer ? bearer[1] : '';
      const verifier = token ? credentialHash(token) : request.headers()['x-auth-token-hash'];
      const json = (status, value) => route.fulfill({ status,
        headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(value) });
      if (!endpoint.startsWith('template-library/')) {
        // Simulate replacement of mutable legacy credentials independently of
        // the protected verifier. Never change policies in a legacy handler.
        if (endpoint === 'register-identity' && method === 'POST') {
          const supplied = request.headers()['x-auth-token-hash'];
          if (!/^[a-f0-9]{64}$/.test(supplied || '')) return json(400, { error: 'invalid_identity' });
          if (!legacy.has(slotId)) legacy.set(slotId, supplied);
          return route.fulfill({ status: 204, headers: CORS });
        }
        if (legacy401 || (legacy.has(slotId) && verifier && legacy.get(slotId) !== verifier)) {
          cloud.legacyRejectedRequests.push({ method, slotId, endpoint, status: 401 });
          return json(401, { error: 'invalid_credentials' });
        }
        if (endpoint === 'register' && method === 'POST' && /^[a-f0-9]{64}$/.test(verifier || '') && !legacy.has(slotId)) legacy.set(slotId, verifier);
        return route.fallback();
      }

      const entry = { method, slotId, endpoint, rawBody: request.postData(), status: null };
      requests.push(entry);
      const answer = (status, value) => { entry.status = status; return json(status, value); };
      const fail = (status, code) => answer(status, { namespace: NAMESPACE, protocol: PROTOCOL, slotId,
        error: { code, message: 'Fictional template contract server: ' + code }, ...(policies.has(slotId) ? { epoch: policies.get(slotId).epoch } : {}) });
      if (unavailable) return fail(503, 'library_unavailable');
      if (!token) return fail(401, 'invalid_credentials');
      let row = policies.get(slotId);
      if (row ? row.tokenHash !== verifier : !legacy.has(slotId)) return fail(row ? 401 : 409, row ? 'invalid_credentials' : 'identity_required');
      if (!row && legacy.get(slotId) !== verifier) return fail(401, 'invalid_credentials');
      const receipt = () => ({ ok: true, namespace: NAMESPACE, protocol: PROTOCOL, slotId,
        initialized: !!row, epoch: row?.epoch || 0, headSeq: row?.headSeq || 0, floorSeq: row?.floorSeq || 0,
        eventsStored: row?.events.length || 0, bytesStored: row?.events.reduce((sum, event) => sum + bytes(event.body), 0) || 0,
        limits: LIMITS });
      if (endpoint === 'template-library/state' && method === 'GET') return answer(200, receipt());

      let body;
      if (method === 'POST') {
        try { body = JSON.parse(request.postData()); } catch { return fail(400, 'invalid_request'); }
        if (bytes(body) > LIMITS.maxBodyBytes) return fail(413, 'payload_too_large');
        if (body?.namespace !== NAMESPACE || body?.protocol !== PROTOCOL) return fail(426, 'unsupported_protocol');
      }
      if (endpoint === 'template-library/initialize' && method === 'POST') {
        const created = !row;
        if (!row) { row = { tokenHash: verifier, epoch: 1, headSeq: 0, floorSeq: 0, events: [], wipes: new Map() }; policies.set(slotId, row); }
        return answer(200, { ...receipt(), created });
      }
      if (!row) return fail(409, 'library_not_initialized');
      if (endpoint === 'template-library/events' && method === 'POST') {
        if (appendGate) await appendGate;
        if (body.epoch !== row.epoch) return fail(409, 'epoch_mismatch');
        if (!Array.isArray(body.events) || !body.events.length || body.events.length > LIMITS.maxBatchEvents) return fail(400, 'invalid_event');
        const additions = new Map(), accepted = [];
        for (const event of body.events) {
          if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(event?.eid || '') || !event.body
            || typeof event.body.iv !== 'string' || typeof event.body.data !== 'string'
            || Buffer.from(event.body.iv, 'base64').length !== 12 || Buffer.from(event.body.data, 'base64').length < 16) return fail(400, 'invalid_event');
          if (bytes(event.body) > LIMITS.maxEventBytes) return fail(413, 'payload_too_large');
          const hash = digest(event.body), existing = row.events.find(item => item.eid === event.eid) || additions.get(event.eid);
          if (existing && existing.digest !== hash) return fail(409, 'event_id_collision');
          if (existing) accepted.push({ eid: existing.eid, seq: existing.seq, dup: true, digest: hash });
          else {
            const stored = { eid: event.eid, seq: row.headSeq + additions.size + 1, body: structuredClone(event.body), digest: hash };
            additions.set(event.eid, stored); accepted.push({ eid: stored.eid, seq: stored.seq, dup: false, digest: hash });
          }
        }
        const all = [...row.events, ...additions.values()];
        if (all.length > LIMITS.maxAccountEvents || all.reduce((sum, item) => sum + bytes(item.body), 0) > LIMITS.maxAccountBytes) return fail(507, 'library_full');
        row.events = all; row.headSeq += additions.size;
        if (lostAck) {
          lostAck = false; entry.status = 'lost-after-commit';
          if (bumpAfterLostAck) { bumpAfterLostAck = false; row.epoch += 1; row.floorSeq = row.headSeq; row.events = []; }
          return route.abort('failed');
        }
        return answer(200, { ...receipt(), stored: true, accepted });
      }
      if (endpoint === 'template-library/changes' && method === 'GET') {
        if (readGate) await readGate;
        const epoch = Number(url.searchParams.get('epoch')), since = Number(url.searchParams.get('since'));
        const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 64;
        if (!Number.isSafeInteger(epoch) || epoch < 1 || !Number.isSafeInteger(since) || since < 0
          || !Number.isSafeInteger(limit) || limit < 1 || limit > LIMITS.maxPageEvents) return fail(400, 'invalid_cursor');
        if (epoch !== row.epoch) return fail(409, 'epoch_mismatch');
        if (since > row.headSeq) return fail(409, 'cursor_ahead');
        const remaining = row.events.filter(event => event.seq > since), events = [];
        let size = 0;
        for (const event of remaining) {
          const nextSize = bytes(event.body);
          if (events.length >= limit || (events.length && size + nextSize > LIMITS.maxBodyBytes)) break;
          events.push(structuredClone(event)); size += nextSize;
        }
        return answer(200, { ...receipt(), events, cursor: events.at(-1)?.seq ?? Math.max(row.floorSeq, Math.min(since, row.headSeq)), hasMore: events.length < remaining.length });
      }
      if (endpoint === 'template-library/wipe' && method === 'POST') {
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(body.operationId || '')) return fail(400, 'invalid_request');
        const prior = row.wipes.get(body.operationId);
        if (prior && prior.epoch !== body.epoch) return fail(409, 'operation_id_collision');
        if (prior) return answer(200, { ...receipt(), stored: true, operationId: body.operationId, committedEpoch: prior.committedEpoch, duplicate: true });
        if (body.epoch !== row.epoch) return fail(409, 'epoch_mismatch');
        row.epoch += 1; row.floorSeq = row.headSeq; row.events = [];
        row.wipes.set(body.operationId, { epoch: body.epoch, committedEpoch: row.epoch });
        return answer(200, { ...receipt(), stored: true, operationId: body.operationId, committedEpoch: row.epoch, duplicate: false });
      }
      return fail(400, 'invalid_request');
    });
  };
  return cloud;
}
