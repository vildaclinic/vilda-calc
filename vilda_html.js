/*
 * vilda_html.js
 *
 * Wspólne, małe helpery do bezpiecznego renderowania tekstu w HTML.
 * Nie jest to sanitizer dowolnego HTML. Funkcje służą do escapowania tekstu
 * użytkownika/importu/storage przed wstawieniem go do kontrolowanego markup.
 */
(function (global) {
  'use strict';
  if (!global) return;
  if (global.VildaHtml && global.VildaHtml.version) return;

  const VERSION = '1.4.0';

  function getLogger() {
    try { return global.VildaLogger || global.vildaLogger || null; } catch (_) { return null; }
  }

  function logWarn(context, message, meta) {
    try {
      const logger = getLogger();
      if (logger && typeof logger.warn === 'function') {
        logger.warn(context || 'vilda-html', message || 'Ostrzeżenie renderowania HTML.', meta || {});
      }
    } catch (loggingError) {
      if (global.__VILDA_DEBUG === true && global.console && typeof global.console.warn === 'function') {
        global.console.warn('[vilda-html] Nie udało się zapisać ostrzeżenia diagnostycznego.', loggingError);
      }
    }
  }

  function toString(value) {
    return value == null ? '' : String(value);
  }

  function escapeHtml(value) {
    return toString(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function textToHtml(value) {
    return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>');
  }

  function linesToHtml(lines) {
    if (Array.isArray(lines)) {
      return lines.map(function (line) { return escapeHtml(line); }).join('<br>');
    }
    return textToHtml(lines);
  }

  function setText(element, value) {
    if (!element) return false;
    try {
      element.textContent = toString(value);
      return true;
    } catch (error) {
      logWarn('vilda-html:set-text', 'Nie udało się ustawić textContent.', { error: error && error.message ? error.message : String(error || '') });
      return false;
    }
  }

  function setEscapedHtml(element, value, options) {
    if (!element) return false;
    const opts = options || {};
    try {
      element.innerHTML = opts.preserveLineBreaks === false ? escapeHtml(value) : textToHtml(value);
      return true;
    } catch (error) {
      logWarn('vilda-html:set-escaped-html', 'Nie udało się ustawić escapowanego HTML.', { error: error && error.message ? error.message : String(error || '') });
      return false;
    }
  }

  function setTrustedHtml(element, markup, options) {
    if (!element) return false;
    const opts = options || {};
    try {
      if (!opts.context && global.__VILDA_DEBUG === true) {
        logWarn('vilda-html:set-trusted-html', 'Użycie kontrolowanego HTML bez jawnego kontekstu.', { elementId: element.id || '', className: element.className || '' });
      }
      element.innerHTML = toString(markup);
      return true;
    } catch (error) {
      logWarn('vilda-html:set-trusted-html', 'Nie udało się ustawić kontrolowanego HTML.', {
        context: opts.context || '',
        error: error && error.message ? error.message : String(error || '')
      });
      return false;
    }
  }

  function clearHtml(element) {
    if (!element) return false;
    try {
      element.textContent = '';
      return true;
    } catch (error) {
      logWarn('vilda-html:clear-html', 'Nie udało się wyczyścić elementu.', { error: error && error.message ? error.message : String(error || '') });
      return false;
    }
  }

  function hasHtmlContent(element) {
    if (!element) return false;
    try {
      const text = element.textContent != null ? String(element.textContent) : '';
      if (text.trim()) return true;
      const aria = element.getAttribute && element.getAttribute('aria-label');
      return !!(aria && String(aria).trim());
    } catch (error) {
      logWarn('vilda-html:has-html-content', 'Nie udało się sprawdzić zawartości elementu.', { error: error && error.message ? error.message : String(error || '') });
      return false;
    }
  }

  function cloneChildrenInto(target, source, options) {
    if (!target || !source) return false;
    const opts = options || {};
    try {
      clearHtml(target);
      const nodes = source.childNodes ? Array.prototype.slice.call(source.childNodes) : [];
      nodes.forEach(function (node) {
        target.appendChild(node.cloneNode(true));
      });
      return true;
    } catch (error) {
      logWarn('vilda-html:clone-children-into', 'Nie udało się skopiować węzłów DOM.', {
        context: opts.context || '',
        error: error && error.message ? error.message : String(error || '')
      });
      return false;
    }
  }

  function restoreClonedChildren(target, snapshots, options) {
    if (!target || !Array.isArray(snapshots)) return false;
    const opts = options || {};
    try {
      clearHtml(target);
      snapshots.forEach(function (node) {
        if (node && typeof node.cloneNode === 'function') {
          target.appendChild(node.cloneNode(true));
        }
      });
      return true;
    } catch (error) {
      logWarn('vilda-html:restore-cloned-children', 'Nie udało się odtworzyć sklonowanych węzłów DOM.', {
        context: opts.context || '',
        error: error && error.message ? error.message : String(error || '')
      });
      return false;
    }
  }

  function replaceFirstText(root, needle, replacementNode, options) {
    if (!root || needle == null || !replacementNode) return false;
    const search = String(needle);
    if (!search) return false;
    const opts = options || {};
    try {
      const doc = root.ownerDocument || global.document;
      if (!doc) return false;
      const showText = (global.NodeFilter && global.NodeFilter.SHOW_TEXT) || 4;
      const walker = doc.createTreeWalker(root, showText);
      let node;
      while ((node = walker.nextNode())) {
        const value = node.nodeValue || '';
        const index = value.indexOf(search);
        if (index === -1) continue;
        const parent = node.parentNode;
        if (!parent) return false;
        if (index > 0) parent.insertBefore(doc.createTextNode(value.slice(0, index)), node);
        parent.insertBefore(replacementNode.cloneNode(true), node);
        const tail = value.slice(index + search.length);
        if (tail) parent.insertBefore(doc.createTextNode(tail), node);
        parent.removeChild(node);
        return true;
      }
      return false;
    } catch (error) {
      logWarn('vilda-html:replace-first-text', 'Nie udało się zastąpić fragmentu tekstu w DOM.', {
        context: opts.context || '',
        error: error && error.message ? error.message : String(error || '')
      });
      return false;
    }
  }

  function appendTextLine(element, value, options) {
    if (!element) return false;
    const opts = options || {};
    try {
      const doc = element.ownerDocument || (global && global.document);
      if (!doc) return false;
      if (opts.beforeLineBreak !== false && element.childNodes && element.childNodes.length) {
        element.appendChild(doc.createElement('br'));
      }
      element.appendChild(doc.createTextNode(toString(value)));
      return true;
    } catch (error) {
      logWarn('vilda-html:append-text-line', 'Nie udało się dopisać tekstu do elementu.', { error: error && error.message ? error.message : String(error || '') });
      return false;
    }
  }

  function safeUrl(value, options) {
    const opts = options || {};
    const fallback = opts.fallback == null ? '#' : String(opts.fallback);
    const raw = toString(value).trim();
    if (!raw) return fallback;
    try {
      const lower = raw.toLowerCase();
      if (/^(https?:|mailto:|tel:)/.test(lower) || raw.charAt(0) === '#') {
        return raw;
      }
      return fallback;
    } catch (_) {
      return fallback;
    }
  }

  function linkHtml(href, label, options) {
    const opts = options || {};
    const safeHref = escapeAttr(safeUrl(href, { fallback: opts.fallback || '#' }));
    const safeLabel = escapeHtml(label == null || label === '' ? href : label);
    const target = opts.target ? ` target="${escapeAttr(opts.target)}"` : '';
    const rel = opts.rel ? ` rel="${escapeAttr(opts.rel)}"` : '';
    return `<a href="${safeHref}"${target}${rel}>${safeLabel}</a>`;
  }

  const api = {
    version: VERSION,
    escapeHtml,
    escapeHTML: escapeHtml,
    escapeAttr,
    escapeAttribute: escapeAttr,
    textToHtml,
    linesToHtml,
    setText,
    setEscapedHtml,
    setTrustedHtml,
    setTrustedMarkup: setTrustedHtml,
    clearHtml,
    clear: clearHtml,
    hasHtmlContent,
    hasContent: hasHtmlContent,
    cloneChildrenInto,
    restoreClonedChildren,
    replaceFirstText,
    appendTextLine,
    safeUrl,
    linkHtml
  };

  global.VildaHtml = api;
  global.vildaHtml = api;
  global.vildaEscapeHtml = escapeHtml;
  global.vildaEscapeAttr = escapeAttr;
  global.vildaTextToHtml = textToHtml;
  global.vildaSetEscapedHtml = setEscapedHtml;
  global.vildaSetTrustedHtml = setTrustedHtml;
  global.vildaSetTrustedMarkup = setTrustedHtml;
  global.vildaClearHtml = clearHtml;
  global.vildaClearElement = clearHtml;
  global.vildaCloneChildrenInto = cloneChildrenInto;
  global.vildaRestoreClonedChildren = restoreClonedChildren;
  global.vildaReplaceFirstText = replaceFirstText;
  global.vildaHasHtmlContent = hasHtmlContent;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
