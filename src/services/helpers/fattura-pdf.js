// src/services/helpers/fattura-pdf.js
//
// Copia di cortesia in PDF di una fattura o nota di credito (documento pdfmake).
// L'originale fiscale è l'XML FatturaPA; il PDF serve al cliente.

const { totali, numeroCompleto } = require('./fattura-pa');
const { formatoEuro } = require('../../utils/denaro');
const { dataItaliana } = require('../../utils/date');

const DESTRA = { alignment: 'right' };

function cella(testo, stile = {}) {
  return { text: String(testo), ...stile };
}

function indirizzoCompleto(indirizzo, cap, comune, provincia) {
  const conProvincia = provincia ? ` (${provincia})` : '';
  return `${indirizzo}, ${cap} ${comune}${conProvincia}`;
}

function intestazioneStruttura(cedente) {
  const codiceFiscale = cedente.codice_fiscale ? ` · C.F. ${cedente.codice_fiscale}` : '';
  return [
    { text: cedente.ragione_sociale, bold: true, fontSize: 12 },
    indirizzoCompleto(cedente.indirizzo, cedente.cap, cedente.comune, cedente.provincia),
    `P.IVA ${cedente.partita_iva}${codiceFiscale}`,
    [cedente.email, cedente.telefono].filter(Boolean).join(' · '),
  ];
}

function intestazioneDocumento(fattura, origine) {
  const titolo = fattura.tipo_documento === 'TD04' ? 'Nota di credito' : 'Fattura';
  const colonna = [
    { text: `${titolo} n. ${numeroCompleto(fattura)}`, bold: true, fontSize: 14, ...DESTRA },
    { text: `del ${dataItaliana(fattura.data_emissione)}`, ...DESTRA },
  ];
  if (origine) {
    colonna.push({
      text: `rif. fattura n. ${numeroCompleto(origine)} del ${dataItaliana(origine.data_emissione)}`,
      ...DESTRA,
    });
  }
  return colonna;
}

function intestatario(fattura) {
  const nome =
    fattura.cliente_denominazione || `${fattura.cliente_nome} ${fattura.cliente_cognome}`;
  const identificativi = [
    fattura.cliente_partita_iva && `P.IVA ${fattura.cliente_partita_iva}`,
    fattura.cliente_codice_fiscale && `C.F. ${fattura.cliente_codice_fiscale}`,
  ].filter(Boolean);

  return [
    { text: 'Intestata a', margin: [0, 20, 0, 2], color: '#666' },
    { text: nome, bold: true },
    `${indirizzoCompleto(
      fattura.cliente_indirizzo,
      fattura.cliente_cap,
      fattura.cliente_comune,
      fattura.cliente_provincia,
    )} ${fattura.cliente_nazione}`,
    identificativi.join(' · '),
  ];
}

function tabellaRighe(righe) {
  const intestazione = ['Descrizione', 'Q.tà', 'Prezzo', 'IVA', 'Importo'].map((testo) =>
    cella(testo, { bold: true }),
  );
  const corpo = righe.map((riga) => [
    cella(riga.descrizione),
    cella(Number(riga.quantita), DESTRA),
    cella(formatoEuro(riga.prezzo_unitario), DESTRA),
    cella(riga.natura ?? `${Number(riga.aliquota_iva)}%`, DESTRA),
    cella(formatoEuro(riga.totale ?? riga.quantita * riga.prezzo_unitario), DESTRA),
  ]);

  return {
    margin: [0, 20, 0, 10],
    table: { headerRows: 1, widths: ['*', 40, 60, 40, 60], body: [intestazione, ...corpo] },
    layout: 'lightHorizontalLines',
  };
}

function tabellaAliquote(fattura) {
  const { riepilogo } = totali(fattura.righe, fattura.imposta);
  const intestazione = ['Aliquota', 'Imponibile', 'Imposta'].map((testo) =>
    cella(testo, { bold: true }),
  );
  const corpo = riepilogo.map((gruppo) => {
    let aliquota = `${gruppo.aliquota_iva}%`;
    if (gruppo.natura) {
      aliquota = gruppo.natura === 'N1' ? 'N1 (art. 15)' : gruppo.natura;
    }
    return [
      cella(aliquota),
      cella(formatoEuro(gruppo.imponibile), DESTRA),
      cella(formatoEuro(gruppo.imposta), DESTRA),
    ];
  });

  return { width: '*', table: { body: [intestazione, ...corpo] }, layout: 'noBorders' };
}

function tabellaTotali(fattura) {
  return {
    width: 180,
    table: {
      widths: ['*', 80],
      body: [
        ['Imponibile', cella(formatoEuro(fattura.imponibile), DESTRA)],
        ['IVA', cella(formatoEuro(fattura.imposta), DESTRA)],
        ['Non imponibile / escluso', cella(formatoEuro(fattura.importo_esente), DESTRA)],
        [
          cella('Totale', { bold: true }),
          cella(formatoEuro(fattura.totale), { ...DESTRA, bold: true }),
        ],
      ],
    },
    layout: 'noBorders',
  };
}

/**
 * @param fattura  con le righe
 * @param cedente  dati fiscali della struttura
 * @param origine  fattura stornata (solo per le note di credito)
 */
function documentoFattura(fattura, cedente, origine = null) {
  const contenuto = [
    { columns: [intestazioneStruttura(cedente), intestazioneDocumento(fattura, origine)] },
    ...intestatario(fattura),
    tabellaRighe(fattura.righe),
    { columns: [tabellaAliquote(fattura), tabellaTotali(fattura)] },
  ];

  if (cedente.regime_fiscale === 'RF19') {
    contenuto.push({
      text: "Operazione in franchigia da IVA ai sensi dell'art. 1, commi 54-89, L. 190/2014.",
      margin: [0, 10, 0, 0],
      fontSize: 8,
    });
  }
  if (fattura.note) {
    contenuto.push({ text: fattura.note, margin: [0, 10, 0, 0], color: '#444' });
  }

  return {
    defaultStyle: { font: 'Helvetica', fontSize: 9 },
    pageMargins: [40, 40, 40, 60],
    footer: {
      text: "Copia di cortesia. L'originale è la fattura elettronica trasmessa al Sistema di Interscambio.",
      alignment: 'center',
      fontSize: 7,
      color: '#666',
    },
    content: contenuto,
  };
}

module.exports = { documentoFattura };
