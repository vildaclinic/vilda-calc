// This script contains custom fixes for the Waga i wzrost application.
//
// 1. In single‑column (mobile) view the metabolic summary is split into
//    two cards (“currentSummaryCardLeft” and “currentSummaryCardRight”).  On
//    narrow screens we merge the content of the right card into the left
//    card and remove the right card entirely.  This ensures that the
//    summary appears as a single card with combined content.  Merging
//    happens once per render and is re‑attempted whenever the DOM
//    changes or the window is resized.
//
// 2. The application automatically scrolls certain elements into view
//    when switching between standard and professional result modes.  On
//    mobile devices this behaviour can be jarring.  We disable
//    scrollIntoView calls globally while the viewport is narrower than
//    700 px by overriding Element.prototype.scrollIntoView.  The
//    original implementation is restored when the viewport widens again.

(function() {
  'use strict';

  /**
   * Merge the right summary card into the left one on small screens.
   * If the cards are not present or the viewport is wide, the
   * function does nothing.  Once merged the left card is marked
   * via a data attribute to avoid repeated work.
   */
  function mergeSummaryCards() {
    // Only merge in single‑column layout
    if (window.innerWidth >= 700) return;
    const leftCard  = document.getElementById('currentSummaryCardLeft');
    const rightCard = document.getElementById('currentSummaryCardRight');
    if (!leftCard || !rightCard) return;
    // Skip if already merged
    if (leftCard.dataset.merged === 'true') return;
    const leftContent  = leftCard.querySelector('.summary-content');
    const rightContent = rightCard.querySelector('.summary-content');
    if (leftContent && rightContent) {
      // Move all child nodes from rightContent into leftContent
      while (rightContent.firstChild) {
        leftContent.appendChild(rightContent.firstChild);
      }
    }
    // Remove the right card from the DOM
    rightCard.remove();
    // Mark as merged to avoid repeating
    leftCard.dataset.merged = 'true';
  }

  /**
   * Disable or restore scrollIntoView based on viewport width.
   * On narrow screens (<700 px) scrollIntoView is overridden with a
   * no‑op to prevent automatic scrolling when toggling result modes.
   * On wider screens the original method is restored.
   */
  function toggleAutoScrollDisable() {
    if (window.innerWidth < 700) {
      if (!Element.prototype._originalScrollIntoView) {
        Element.prototype._originalScrollIntoView = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function() {
          // Intentionally do nothing on small screens
        };
      }
    } else {
      if (Element.prototype._originalScrollIntoView) {
        Element.prototype.scrollIntoView = Element.prototype._originalScrollIntoView;
        delete Element.prototype._originalScrollIntoView;
      }
    }
  }

  // Observe the DOM for summary card insertion and attempt merging
  const observer = new MutationObserver(mergeSummaryCards);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Merge on resize and after DOM is ready
  window.addEventListener('resize', mergeSummaryCards);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    mergeSummaryCards();
  } else {
    document.addEventListener('DOMContentLoaded', mergeSummaryCards);
  }

  // Disable scrollIntoView on mobile and restore on wider screens
  toggleAutoScrollDisable();
  window.addEventListener('resize', toggleAutoScrollDisable);

  /**
   * Distribute test cards between two column containers so that the overall
   * heights of the columns remain equal.  The function collects all
   * descendant elements with the `.gh-test-card` class from both
   * containers, then splits them into two groups.  If there is an odd
   * number of cards, the left column receives the smaller half (⌊n/2⌋)
   * while the right column receives the remainder.  Each card's flex
   * settings are recalculated so that the total flex-grow values of
   * both columns match.  For example, with five cards the left column
   * will contain two cards each with flex-grow 3, and the right column
   * three cards each with flex-grow 2 (2 × 3 = 3 × 2 = 6).  On narrower
   * screens (<700 px) the distribution is skipped entirely and the
   * original order of cards remains unchanged.
   *
   * @param {string} leftId  The ID of the left column container.
   * @param {string} rightId The ID of the right column container.
   */
  function distributeTestCards(leftId, rightId) {
    // Only apply the distribution logic on larger screens (two‑column layout).
    if (window.innerWidth < 700) {
      return;
    }
    const leftContainer  = document.getElementById(leftId);
    const rightContainer = document.getElementById(rightId);
    if (!leftContainer || !rightContainer) return;

    // Gather all test cards from both containers in their current order.
    const leftCards  = Array.from(leftContainer.querySelectorAll('.gh-test-card'));
    const rightCards = Array.from(rightContainer.querySelectorAll('.gh-test-card'));
    const allCards   = leftCards.concat(rightCards);
    const total      = allCards.length;
    if (!total) return;

    // Determine how many cards should go into each column.  We put the
    // smaller half into the left column to keep the difference in card
    // counts at most one.  The remainder goes to the right column.
    const leftCount  = Math.floor(total / 2);
    const rightCount = total - leftCount;

    // Clear existing children so that we can re‑append cards in the new order.
    leftContainer.innerHTML  = '';
    rightContainer.innerHTML = '';

    // Reset any inline flex styles from previous runs.  Without this the
    // flex values or paddings could accumulate when the user resizes the window.
    allCards.forEach(card => {
      card.style.flex      = '';
      card.style.flexGrow  = '';
      card.style.flexShrink = '';
      card.style.flexBasis = '';
    });

    // Append cards to the left and right containers based on the computed
    // distribution.  Preserve the original ordering of cards.
    allCards.forEach((card, index) => {
      if (index < leftCount) {
        leftContainer.appendChild(card);
      } else {
        rightContainer.appendChild(card);
      }
      // Override flex settings so each card keeps its natural height.  This
      // prevents CSS rules (which assign flex-grow to cards) from stretching
      // them.  Using 0 0 auto stops growth and shrinkage and lets content
      // determine the height of the card.
      card.style.flex = '0 0 auto';
    });

    // Do not assign flex-grow to cards.  Keep their natural height.
    // Instead, equalise column heights by adding padding to the shorter column.
    // First reset any padding applied previously.
    leftContainer.style.paddingBottom  = '0';
    rightContainer.style.paddingBottom = '0';

    // Override any height:100% declarations coming from CSS.  Using
    // auto allows the container to shrink-wrap its content and rely on
    // padding-bottom (added below) to equalise column heights without
    // introducing empty space inside cards.
    leftContainer.style.height  = 'auto';
    rightContainer.style.height = 'auto';

    // Use requestAnimationFrame to ensure DOM has reflowed before measuring.
    requestAnimationFrame(() => {
      const leftHeight  = leftContainer.getBoundingClientRect().height;
      const rightHeight = rightContainer.getBoundingClientRect().height;
      if (leftHeight < rightHeight) {
        leftContainer.style.paddingBottom  = `${rightHeight - leftHeight}px`;
        rightContainer.style.paddingBottom = '0';
      } else if (rightHeight < leftHeight) {
        rightContainer.style.paddingBottom = `${leftHeight - rightHeight}px`;
        leftContainer.style.paddingBottom  = '0';
      }
    });
  }

  /**
   * Adjust the layout of all available test groups.  This helper simply
   * calls distributeTestCards on each pair of column containers.  It can
   * be invoked after the DOM is ready, after a test list is toggled, or
   * whenever the window is resized.
   */
  function adjustAllTestCards() {
    distributeTestCards('ghTestsLeft',   'ghTestsRight');
    distributeTestCards('ogttTestsLeft', 'ogttTestsRight');
    distributeTestCards('acthTestsLeft', 'acthTestsRight');
  }

  // Run the distribution once the DOM has loaded.  Using DOMContentLoaded
  // ensures that the test containers exist before we attempt to modify
  // them.  We also run it on resize events to handle dynamic changes
  // between mobile and desktop layouts.
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    adjustAllTestCards();
  } else {
    document.addEventListener('DOMContentLoaded', adjustAllTestCards);
  }
  window.addEventListener('resize', adjustAllTestCards);

  // Hook into test toggle buttons so that whenever a list of tests is
  // shown or hidden, the cards are redistributed.  Because the DOM
  // updates (showing/hiding of containers) occur within the same tick of
  // the event loop, we schedule the redistribution via setTimeout with
  // a zero delay.  This ensures that our logic runs after the active
  // classes are applied and new elements have been inserted.
  ['toggleGhTests', 'toggleOgttTests', 'toggleActhTests'].forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', function() {
        setTimeout(adjustAllTestCards, 0);
      });
    }
  });
})();