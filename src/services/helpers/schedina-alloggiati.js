// src/services/helpers/schedina-alloggiati.js
//
// Riga del tracciato fisso di Alloggiati Web (168 caratteri), da caricare sul
// portale della Polizia di Stato con "Invio da file".

const { contaNotti, dataItaliana } = require('../../utils/date');
const { TIPI_CON_DOCUMENTO, CODICE_ITALIA } = require('../../constants/prenotazioni.constants');

const CODICI_TIPO = {
  ospite_singolo: '16',
  capofamiglia: '17',
  capogruppo: '18',
  familiare: '19',
  membro_gruppo: '20',
};
const LUNGHEZZA_RIGA = 168;
// ponytail: il portale accetta al massimo 30 notti, i soggiorni più lunghi si rinnovano.
const NOTTI_MAX = 30;

/** Maiuscolo senza accenti, tagliato e allineato a sinistra con spazi. */
function campo(valore, lunghezza) {
  return String(valore ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .slice(0, lunghezza)
    .padEnd(lunghezza, ' ');
}

/**
 * ospite: anagrafica; soggiorno: { data_arrivo, data_partenza }; tipo: tipo_alloggiato.
 * Nati all'estero: niente comune e provincia. Familiari e membri: niente documento.
 */
function schedina(ospite, soggiorno, tipo) {
  const natoInItalia = ospite.stato_nascita_codice === CODICE_ITALIA;
  const conDocumento = TIPI_CON_DOCUMENTO.includes(tipo);
  const notti = Math.min(contaNotti(soggiorno.data_arrivo, soggiorno.data_partenza), NOTTI_MAX);

  const riga = [
    campo(CODICI_TIPO[tipo], 2),
    campo(dataItaliana(soggiorno.data_arrivo), 10),
    campo(String(notti).padStart(2, '0'), 2),
    campo(ospite.cognome, 50),
    campo(ospite.nome, 30),
    campo(ospite.sesso === 'F' ? '2' : '1', 1),
    campo(dataItaliana(ospite.data_nascita), 10),
    campo(natoInItalia ? ospite.comune_nascita_codice : '', 9),
    campo(natoInItalia ? ospite.provincia_nascita : '', 2),
    campo(ospite.stato_nascita_codice, 9),
    campo(ospite.cittadinanza_codice, 9),
    campo(conDocumento ? ospite.tipo_documento : '', 5),
    campo(conDocumento ? ospite.numero_documento : '', 20),
    campo(conDocumento ? ospite.luogo_rilascio_codice : '', 9),
  ].join('');

  if (riga.length !== LUNGHEZZA_RIGA) {
    throw new Error(`Schedina di ${riga.length} caratteri invece di ${LUNGHEZZA_RIGA}`);
  }
  return riga;
}

module.exports = { schedina };
