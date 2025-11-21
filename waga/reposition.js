/*
 * This script repositions the Cole index card and the Advanced Growth section
 * depending on the viewport width.  In the mobile (single‑column) layout,
 * both elements are moved into the left column so they appear directly
 * beneath the BMI card.  In the desktop (two‑column) layout, they are
 * returned to their original positions inside the right column
 * (normWrapper), between the WHR card and the "Droga do normy BMI" card.
 *
 * The logic listens for DOMContentLoaded and resize events to ensure
 * that the elements are repositioned whenever the page is loaded or
 * the window is resized.  It does not modify content or behaviour
 * otherwise; existing event listeners on the moved elements remain
 * intact.
 */
(function() {
  /**
   * Move the Cole card and Advanced Growth section between columns
   * based on viewport width.  On narrow screens (< 700 px) the
   * elements are inserted into the left column immediately above the
   * blood pressure card.  On wider screens they are restored to the
   * right column (normWrapper), preserving their original order
   * relative to the WHR and "Droga do normy BMI" cards.
   */
  function repositionColeAndAdvancedGrowth() {
    var isMobile = window.innerWidth < 700;
    var coleCard = document.getElementById('coleCard');
    var advSection = document.getElementById('advancedGrowthSection');
    var leftColumn = document.getElementById('leftColumnWrap');
    var normWrapper = document.getElementById('normWrapper');
    var bmiCard = document.getElementById('bmiCard');
    var bpCard = document.getElementById('bpCard');
    var whrCard = document.getElementById('whrCard');
    var toNormCard = document.getElementById('toNormCard');

    // If either the Cole card or Advanced Growth section is missing,
    // there is nothing to reposition.
    if (!coleCard || !advSection) return;

    if (isMobile) {
      // In mobile view, move both elements into the left column.
      if (leftColumn && bpCard) {
        // Ensure the Cole card appears before the Advanced Growth section.
        // Insert the Cole card immediately before the blood pressure card
        // if it is not already in the left column.  This places it
        // after the BMI card and any hidden canvases, but before
        // subsequent sections (e.g. blood pressure, circumference, DS).
        if (coleCard.parentElement !== leftColumn) {
          leftColumn.insertBefore(coleCard, bpCard);
        }
        // If the Cole card is already in the left column but not
        // preceding the Advanced Growth section, reposition it so
        // that it comes just before the Advanced Growth section.
        if (coleCard.parentElement === leftColumn && advSection.parentElement === leftColumn && coleCard.nextSibling !== advSection) {
          leftColumn.insertBefore(coleCard, advSection);
        }
        // Insert the Advanced Growth section immediately before the
        // blood pressure card if it is not already there.  This ensures
        // the Advanced Growth button and form follow the Cole card and
        // precede the blood pressure card in the vertical flow.
        if (advSection.parentElement !== leftColumn) {
          leftColumn.insertBefore(advSection, bpCard);
        }
        // If the Advanced Growth section is in the left column but not
        // directly before the blood pressure card, move it into place.
        if (advSection.parentElement === leftColumn && bpCard && advSection.nextSibling !== bpCard) {
          leftColumn.insertBefore(advSection, bpCard);
        }
      }
    } else {
      // In desktop view, return both elements to the right column.
      if (normWrapper) {
        // Restore the Cole card before the WHR card.  If the WHR card
        // exists, insert the Cole card directly in front of it.  If the
        // Cole card is already in the right column but in the wrong
        // position, reposition it accordingly.
        if (whrCard) {
          if (coleCard.parentElement !== normWrapper || coleCard.nextSibling !== whrCard) {
            normWrapper.insertBefore(coleCard, whrCard);
          }
        }
        // Restore the Advanced Growth section before the "Droga do normy BMI"
        // card.  If the section is already in the right column but not
        // preceding the target card, reposition it accordingly.
        if (toNormCard) {
          if (advSection.parentElement !== normWrapper || advSection.nextSibling !== toNormCard) {
            normWrapper.insertBefore(advSection, toNormCard);
          }
        }
      }
    }
  }

  // Reposition once the DOM is ready.
  document.addEventListener('DOMContentLoaded', function() {
    repositionColeAndAdvancedGrowth();
  });
  // Reposition whenever the window is resized.
  window.addEventListener('resize', function() {
    repositionColeAndAdvancedGrowth();
  });
})();