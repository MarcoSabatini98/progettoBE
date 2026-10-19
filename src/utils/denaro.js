// Denaro in centesimi interi: 0.1 + 0.2 non deve mai finire in fattura.
// Il DB salva DECIMAL(10,2) e restituisce numeri (decimalNumbers): si converte
// in centesimi all'ingresso del calcolo e in euro solo all'uscita.

/** 12.345 → 1235 (arrotondamento commerciale, anche sui negativi). */
function centesimi(euro) {
  const n = Number(euro ?? 0);
  if (!Number.isFinite(n)) throw new TypeError(`Importo non valido: ${euro}`);
  return Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-9);
}

/** 1235 → 12.35 */
const euro = (cent) => cent / 100;

/** Percentuale di un importo in centesimi, arrotondata al centesimo. */
const percentualeDi = (cent, percentuale) =>
  Math.sign(cent) * Math.round((Math.abs(cent) * Number(percentuale)) / 100);

/**
 * Scorporo IVA da un importo lordo (i prezzi al pubblico includono l'IVA).
 * @returns {{ imponibile: number, imposta: number }} in centesimi
 */
function scorporoIva(lordoCent, aliquota) {
  const imponibile = Math.round((lordoCent * 100) / (100 + Number(aliquota)));
  return { imponibile, imposta: lordoCent - imponibile };
}

/** Formato italiano per email e PDF: 1234.5 → "1.234,50 €" */
const formatoEuro = (valoreEuro) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(valoreEuro);

module.exports = { centesimi, euro, percentualeDi, scorporoIva, formatoEuro };
