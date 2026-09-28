// src/utils/pdf.js
//
// Generazione PDF con pdfmake (fatture, conferme di prenotazione, report).
// Solo font standard e nessun accesso a file o URL esterni dal documento.

const pdfmake = require('pdfmake');

pdfmake.setFonts(require('pdfmake/standard-fonts/Helvetica'));
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(() => false);

/** Documento pdfmake → Buffer del PDF. */
async function creaPdf(documento) {
  return await pdfmake.createPdf(documento).getBuffer();
}

module.exports = { creaPdf };
