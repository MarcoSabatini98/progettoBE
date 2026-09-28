// src/services/helpers/report-pdf.js
//
// Report di occupazione e ricavi del periodo (documento pdfmake).

const { dataItaliana } = require('../../utils/date');
const { formatoEuro } = require('../../utils/denaro');

function tabella(intestazioni, righe) {
  return {
    table: {
      headerRows: 1,
      widths: intestazioni.map((_, indice) => (indice === 0 ? '*' : 'auto')),
      body: [intestazioni.map((testo) => ({ text: testo, bold: true })), ...righe],
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 16],
  };
}

function titoletto(testo) {
  return { text: testo, bold: true, fontSize: 12, margin: [0, 8, 0, 6] };
}

/** occupazione: risultato di analytics.occupazione; ricavi: di analytics.ricavi. */
function documentoReport(occupazione, ricavi, nomeStruttura) {
  const riepilogo = occupazione.riepilogo;
  const periodo = `dal ${dataItaliana(occupazione.dal)} al ${dataItaliana(occupazione.al)} (escluso)`;

  return {
    info: { title: `Report ${occupazione.dal} - ${occupazione.al}` },
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { font: 'Helvetica', fontSize: 9 },
    content: [
      { text: nomeStruttura ?? '', color: '#666' },
      { text: 'Report occupazione e ricavi', bold: true, fontSize: 16, margin: [0, 4, 0, 2] },
      { text: periodo, margin: [0, 0, 0, 12] },

      titoletto('Riepilogo'),
      tabella(
        ['Indicatore', 'Valore'],
        [
          ['Notti disponibili', riepilogo.notti_disponibili],
          ['Notti vendute', riepilogo.notti_vendute],
          ['Occupazione', `${riepilogo.occupazione_percentuale}%`],
          ['Ricavo camere', formatoEuro(riepilogo.ricavo_camere)],
          ['ADR (ricavo per notte venduta)', formatoEuro(riepilogo.adr)],
          ['RevPAR (ricavo per notte disponibile)', formatoEuro(riepilogo.revpar)],
        ],
      ),

      titoletto('Ricavi per tipologia (soggiorni arrivati nel periodo)'),
      tabella(
        ['Tipologia', 'Prenotazioni', 'Notti', 'Valore'],
        ricavi.per_tipologia.map((riga) => [
          riga.nome,
          riga.prenotazioni,
          riga.notti,
          formatoEuro(riga.valore),
        ]),
      ),

      titoletto('Giorno per giorno'),
      tabella(
        ['Giorno', 'Occupate', 'Occupazione', 'Ricavo'],
        occupazione.giorni.map((giorno) => [
          dataItaliana(giorno.giorno),
          `${giorno.camere_occupate}/${giorno.camere_disponibili}`,
          `${giorno.occupazione_percentuale}%`,
          formatoEuro(giorno.ricavo_camere),
        ]),
      ),
    ],
  };
}

module.exports = { documentoReport };
