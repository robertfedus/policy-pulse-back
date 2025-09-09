/**
 * Polyfills for pdfjs-dist in Node.
 * Provides DOMMatrix (required by pdf.js) without native canvas bindings.
 * Works for text/diff use-cases; rendering features will be no-ops.
 */

// Import default + namespace, then pick the available symbol.
import DOMMatrixDefault, * as MatrixMod from '@thednp/dommatrix';

// Choose whichever the package exposes (some versions export default only)
const DOMMatrixPoly = MatrixMod.DOMMatrix || DOMMatrixDefault;

if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = DOMMatrixPoly;
}

// Quiet optional warnings — only needed for rendering, not for text extraction.
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class {};
}
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class {};
}
