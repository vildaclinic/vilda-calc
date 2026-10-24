/* Phone geometry is owned by the outer Vilda document. Device qualification
   survives rotation; layout width, not a delayed orientation event, selects the
   presentation. Load synchronously in <head>, before chrome is mounted. */
(function (win) {
  "use strict";

  if (!win || !win.document) return;
  if (win.VildaPhoneLandscape && win.VildaPhoneLandscape.__vildaPhoneLandscape) {
    win.VildaPhoneLandscape.refresh();
    return;
  }

  var doc = win.document;
  var className = "vilda-phone-landscape";
  var phoneClassName = "vilda-phone";
  var frameSelector = "#appPanes > iframe.app-pane";
  var active = false;
  var phone = false;
  var initialized = false;
  var owner = findOwner();
  var coarsePointer = null;
  var reducedMotion = null;
  var rotationAnimations = [];

  // A child never qualifies itself from its viewport or its own input signals.
  // Prefer the outermost accessible Vilda owner, including nested app frames.
  function findOwner() {
    var current = win;
    var found = null;
    try {
      while (current.parent && current.parent !== current) {
        current = current.parent;
        var candidate = current.VildaPhoneLandscape;
        if (candidate && candidate.__vildaPhoneLandscape && typeof candidate.isActive === "function") {
          found = candidate;
        }
      }
    } catch (error) {
      // A cross-origin ancestor is outside this same-origin layout contract.
    }
    return found;
  }

  if (!owner && typeof win.matchMedia === "function") {
    coarsePointer = win.matchMedia("(pointer: coarse), (any-pointer: coarse)");
    reducedMotion = win.matchMedia("(prefers-reduced-motion: reduce)");
  }

  function physicalLandscape() {
    var type = win.screen && win.screen.orientation && win.screen.orientation.type;
    if (type === "landscape-primary" || type === "landscape-secondary") return true;
    if (type === "portrait-primary" || type === "portrait-secondary") return false;

    // Only a fallback before the layout viewport has a measurable width.
    var angle = win.orientation;
    return typeof angle === "number" && (angle === 90 || angle === -90 || angle === 270);
  }

  function qualifiesPhone() {
    var screen = win.screen;
    var touch = win.navigator && win.navigator.maxTouchPoints > 0 || "ontouchstart" in win;
    return !!(touch && coarsePointer && coarsePointer.matches && screen &&
      Number.isFinite(screen.width) && screen.width > 0 &&
      Number.isFinite(screen.height) && screen.height > 0 &&
      Math.min(screen.width, screen.height) <= 540);
  }

  function layoutLandscape() {
    var root = doc.documentElement;
    var width = root && root.clientWidth || win.innerWidth;
    if (!Number.isFinite(width) || width <= 0) return physicalLandscape();
    // The keyboard and browser bars change height, not this outer layout width.
    // A midpoint also tolerates rounding/display zoom around the portrait width.
    // screen.width/height may swap before or after resize; their sum is stable.
    return width > (win.screen.width + win.screen.height) / 2;
  }

  function apply(document, value, isPhone) {
    if (document && document.documentElement) {
      document.documentElement.classList.toggle(phoneClassName, isPhone);
      document.documentElement.classList.toggle(className, value);
    }
  }

  function syncFrame(frame) {
    try {
      var child = frame.contentWindow;
      var runtime = child && child.VildaPhoneLandscape;
      if (runtime && runtime.__vildaPhoneLandscape && typeof runtime.refresh === "function") {
        runtime.refresh();
      } else {
        // Also cover the initial about:blank document and an app load/navigation
        // before its head script runs. Cross-origin documents are left alone.
        apply(frame.contentDocument, active, phone);
      }
    } catch (error) {
      // The shell can temporarily navigate a frame across an origin boundary.
    }
  }

  function syncFrames() {
    var frames = doc.querySelectorAll(frameSelector);
    for (var index = 0; index < frames.length; index += 1) syncFrame(frames[index]);
  }

  function cancelMotion() {
    var pending = rotationAnimations;
    rotationAnimations = [];
    for (var index = 0; index < pending.length; index += 1) pending[index].cancel();
  }

  function canAppear(element) {
    if (typeof element.animate !== "function" || element.hidden || !element.getClientRects().length) return false;
    // A hiding Dock still owns a layout box and may be midway through its CSS
    // transition. An opacity animation must never override its visibility state.
    if (element.classList && (element.classList.contains("is-hidden") || element.classList.contains("is-keyboard-hidden"))) return false;
    if (typeof win.getComputedStyle === "function") {
      var style = win.getComputedStyle(element);
      if (style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) return false;
    }
    return true;
  }

  function appear() {
    cancelMotion();
    if (doc.hidden || !doc.body || reducedMotion && reducedMotion.matches) return;
    var drawer = doc.querySelector('.chrome-drawer:not([hidden])[aria-hidden="false"] .chrome-drawer-panel');
    // A host animates its containing panel once. Embedded documents do not
    // animate independently, including a hidden/preloaded pane becoming visible.
    // Dock opacity belongs to its keyboard runtime, including changes that can
    // begin after this appearance starts, so the Dock is never a motion target.
    // Keep the header outside this compositing change during viewport rotation.
    var surfaces = drawer ? [drawer] : doc.querySelectorAll(
      '.app-shell-main, html:not(.vilda-shell-host) .main-content'
    );
    for (var index = 0; index < surfaces.length; index += 1) {
      var element = surfaces[index];
      if (!canAppear(element)) continue;
      var animation = element.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 120, easing: "ease-out" });
      animation.id = "vilda-phone-rotation";
      rotationAnimations.push(animation);
      animation.onfinish = function () {
        var finished = this;
        rotationAnimations = rotationAnimations.filter(function (item) { return item !== finished; });
      };
    }
  }

  function refresh() {
    var wasActive = active;
    var wasPhone = phone;
    phone = owner ? (typeof owner.isPhone === "function" ? owner.isPhone() === true : owner.isActive() === true) : qualifiesPhone();
    active = owner ? owner.isActive() === true : phone && layoutLandscape();
    apply(doc, active, phone);
    // Hidden/preloaded panes participate too. Do not retain old frame documents
    // or subscribe to their patient/authentication lifecycle.
    syncFrames();
    if (!owner && initialized && (wasActive !== active || wasPhone !== phone)) {
      // Portrait restores the taller header and top safe-area. Keep its content
      // fully opaque and cancel any unfinished landscape appearance immediately,
      // avoiding an extra compositing change at the end of the native rotation.
      if (wasPhone && phone && !wasActive && active) appear();
      else cancelMotion();
      if (typeof win.CustomEvent === "function") {
        doc.dispatchEvent(new win.CustomEvent("vilda:phone-layout-changed", { detail: { phone: phone, landscape: active } }));
      }
    }
    initialized = true;
    return active;
  }

  win.VildaPhoneLandscape = {
    __vildaPhoneLandscape: true,
    isActive: function () { return active; },
    isPhone: function () { return phone; },
    refresh: refresh
  };

  // Synchronous first application prevents a different first painted layout.
  refresh();

  doc.addEventListener("DOMContentLoaded", refresh, { once: true });
  doc.addEventListener("load", function (event) {
    var frame = event.target;
    if (frame && typeof frame.matches === "function" && frame.matches(frameSelector)) syncFrame(frame);
  }, true);
  win.addEventListener("pageshow", refresh);

  if (!owner) {
    win.addEventListener("pagehide", cancelMotion);
    win.addEventListener("resize", refresh);
    win.addEventListener("orientationchange", refresh);
    doc.addEventListener("visibilitychange", function () {
      if (!doc.hidden) refresh();
    });
    if (win.screen && win.screen.orientation && typeof win.screen.orientation.addEventListener === "function") {
      win.screen.orientation.addEventListener("change", refresh);
    }
    if (coarsePointer && typeof coarsePointer.addEventListener === "function") {
      coarsePointer.addEventListener("change", refresh);
    } else if (coarsePointer && typeof coarsePointer.addListener === "function") {
      coarsePointer.addListener(refresh);
    }
    if (reducedMotion && typeof reducedMotion.addEventListener === "function") {
      reducedMotion.addEventListener("change", function () {
        if (reducedMotion.matches) cancelMotion();
      });
    }
  }
})(typeof window === "undefined" ? null : window);
