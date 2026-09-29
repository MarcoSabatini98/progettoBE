// src/utils/pdf.js
//
// Generazione PDF con pdfmake (fatture, conferme di prenotazione, report).
// Solo font standard e nessun accesso a file o URL esterni dal documento.

const pdfmake = require('pdfmake');
const fontStandard = require('pdfmake/standard-fonts/Helvetica');

// I font standard arrivano alla policy per nome ("Helvetica-Bold"): sono gli
// unici "file" locali ammessi.
const NOMI_FONT = new Set(Object.values(fontStandard.Helvetica));

pdfmake.setFonts(fontStandard);
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((percorso) => NOMI_FONT.has(percorso));

/** Documento pdfmake → Buffer del PDF. */
async function creaPdf(documento) {
  return await pdfmake.createPdf(documento).getBuffer();
}

module.exports = { creaPdf };
