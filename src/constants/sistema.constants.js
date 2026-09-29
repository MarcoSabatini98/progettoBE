// Impostazioni, contenuti, notifiche, eventi speciali e registro attività.

const TIPI_IMPOSTAZIONE = Object.freeze(['testo', 'numero', 'booleano', 'json']);

const TIPI_DOCUMENTO_LEGALE = Object.freeze(['privacy', 'termini', 'cookie']);

const TIPI_NOTIFICA = Object.freeze([
  'prenotazione',
  'pagamento',
  'pulizia',
  'manutenzione',
  'chat',
  'recensione',
  'sistema',
]);

const PRIORITA_NOTIFICA = Object.freeze(['info', 'successo', 'avviso', 'errore']);

const TIPI_EVENTO_SPECIALE = Object.freeze(['festivita', 'evento_locale', 'fiera', 'altro']);

const AZIONI_REGISTRO = Object.freeze(['inserimento', 'modifica', 'eliminazione']);

// Tabelle scritte dai trigger di audit.
const TABELLE_REGISTRO = Object.freeze(['prenotazioni', 'pagamenti', 'fatture']);

// Campi traducibili per entità: solo testi. applicaTraduzioni sostituisce
// qualunque campo del record, quindi niente prezzi o id tra questi.
const CAMPI_TRADUCIBILI = Object.freeze({
  tipologia_camera: Object.freeze(['nome', 'descrizione', 'letti']),
  servizio: Object.freeze(['nome', 'descrizione']),
  pacchetto: Object.freeze(['nome', 'descrizione']),
  promozione: Object.freeze(['nome', 'descrizione']),
  faq: Object.freeze(['domanda', 'risposta']),
});

module.exports = {
  TIPI_IMPOSTAZIONE,
  TIPI_DOCUMENTO_LEGALE,
  TIPI_NOTIFICA,
  PRIORITA_NOTIFICA,
  TIPI_EVENTO_SPECIALE,
  AZIONI_REGISTRO,
  TABELLE_REGISTRO,
  CAMPI_TRADUCIBILI,
};
