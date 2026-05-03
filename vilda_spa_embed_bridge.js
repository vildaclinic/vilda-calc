(function(global){
  'use strict';

  function isEmbedMode(){
    try {
      const qs = new URLSearchParams(global.location && global.location.search ? global.location.search : '');
      return qs.get('spa_embed') === '1';
    } catch (_) { return false; }
  }

  function detectView(){
    const path = (global.location && global.location.pathname) || '';
    if (path.includes('docpro')) return 'docpro';
    if (path.includes('kalkulator-klirens')) return 'klirens';
    return 'home';
  }

  function postHeight(){
    if (!global.parent || global.parent === global) return;
    const doc = global.document;
    if (!doc || !doc.body || !doc.documentElement) return;
    const h = Math.max(doc.body.scrollHeight || 0, doc.documentElement.scrollHeight || 0);
    try { global.parent.postMessage({ type: 'vilda:spa:height', view: detectView(), height: h }, '*'); } catch (_) {}
  }

  function initEmbedBridge(){
    if (!isEmbedMode()) return { ok: false, reason: 'not-embed-mode' };
    const onResize = function(){ postHeight(); };
    global.addEventListener('load', onResize);
    global.addEventListener('resize', onResize);
    try {
      const mo = new MutationObserver(function(){ postHeight(); });
      mo.observe(global.document && global.document.body ? global.document.body : global.document.documentElement, { childList: true, subtree: true, attributes: true });
    } catch (_) {}
    setTimeout(postHeight, 50);
    setTimeout(postHeight, 300);
    return { ok: true };
  }

  global.VildaSpaEmbedBridge = { initEmbedBridge: initEmbedBridge };
  try { initEmbedBridge(); } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);
