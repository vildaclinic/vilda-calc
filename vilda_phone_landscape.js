/* Phone landscape is a presentation state owned by the outer Vilda document.
   Load synchronously in <head>, before the shared chrome is mounted. */
(function (win) {
  "use strict";

  if (!win || !win.document) return;
  if (win.VildaPhoneLandscape && win.VildaPhoneLandscape.__vildaPhoneLandscape) {
    win.VildaPhoneLandscape.refresh();
    return;
  }

  var doc = win.document;
  var className = "vilda-phone-landscape";
  var frameSelector = "#appPanes > iframe.app-pane";
  var active = false;
  var owner = findOwner();
  var coarsePointer = null;

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
  }

  function physicalLandscape() {
    var type = win.screen && win.screen.orientation && win.screen.orientation.type;
    if (type === "landscape-primary" || type === "landscape-secondary") return true;
    if (type === "portrait-primary" || type === "portrait-secondary") return false;

    // Legacy iOS reports physical rotation here. Without a physical orientation
    // API, keep the ordinary layout: viewport/media orientation can be a keyboard.
    var angle = win.orientation;
    return typeof angle === "number" && (angle === 90 || angle === -90 || angle === 270);
  }

  function qualifies() {
    var screen = win.screen;
    var touch = win.navigator && win.navigator.maxTouchPoints > 0 || "ontouchstart" in win;
    return !!(touch && coarsePointer && coarsePointer.matches && screen &&
      Number.isFinite(screen.width) && screen.width > 0 &&
      Number.isFinite(screen.height) && screen.height > 0 &&
      Math.min(screen.width, screen.height) <= 540 && physicalLandscape());
  }

  function apply(document, value) {
    if (document && document.documentElement) {
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
        apply(frame.contentDocument, active);
      }
    } catch (error) {
      // The shell can temporarily navigate a frame across an origin boundary.
    }
  }

  function syncFrames() {
    var frames = doc.querySelectorAll(frameSelector);
    for (var index = 0; index < frames.length; index += 1) syncFrame(frames[index]);
  }

  function refresh() {
    active = owner ? owner.isActive() === true : qualifies();
    apply(doc, active);
    // Hidden/preloaded panes participate too. Do not retain old frame documents
    // or subscribe to their patient/authentication lifecycle.
    syncFrames();
    return active;
  }

  win.VildaPhoneLandscape = {
    __vildaPhoneLandscape: true,
    isActive: function () { return active; },
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
  }
})(typeof window === "undefined" ? null : window);
