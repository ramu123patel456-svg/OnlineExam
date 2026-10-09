"use strict";
document.addEventListener("DOMContentLoaded", function () {
  // Shared lightweight page helper. The old project referenced app.js but the file was missing,
  // causing Express to return index.html and Chrome to report "Unexpected token <".
  window.OES = window.OES || {};
  window.OES.version = "1.1.0";
});
