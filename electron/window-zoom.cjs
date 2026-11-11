'use strict';
// The window scales the whole Ledger with its size (owner, 2026-11-11): text, spacing and layout grow together, like the browser's own
// zoom, so nothing is cut off or overlaps. Up to 1300 x 800 it is the design size; above that the factor follows the tighter of width
// and height, so the layout never gets narrower than 1300 or shorter than 800 CSS pixels, and stops at 1.75 on very large screens.

const DESIGN = { width: 1300, height: 800 };
const MAX = 1.75;

/** The zoom factor for a window content size in device-independent pixels, in hundredths. */
function zoomFor(width, height) {
  if (!(width > 0) || !(height > 0)) return 1;
  const factor = Math.max(1, Math.min(width / DESIGN.width, height / DESIGN.height, MAX));
  return Math.round(factor * 100) / 100;
}

module.exports = { zoomFor, DESIGN, MAX };
