// Prenotazioni, ospiti del soggiorno, calendari esterni e Alloggiati Web.

const STATI_PRENOTAZIONE = Object.freeze([
  'in_attesa',
  'confermata',
  'in_soggiorno',
  'conclusa',
  'cancellata',
  'no_show',
]);

// Stati che occupano la camera (stessi di fn_camera_libera).
const STATI_ATTIVI = Object.freeze(['in_attesa', 'confermata', 'in_soggiorno']);

// Stati che contano per ricavi e occupazione.
const STATI_FATTURABILI = Object.freeze(['confermata', 'in_soggiorno', 'conclusa']);

const CANALI = Object.freeze([
  'diretto',
  'telefono',
  'email',
  'walk_in',
  'booking_com',
  'airbnb',
  'expedia',
  'altro',
]);

// Canali OTA: hanno un id_esterno e un calendario iCal.
const CANALI_OTA = Object.freeze(['booking_com', 'airbnb', 'expedia', 'altro']);

const ORIGINI_BLOCCO = Object.freeze(['manuale', 'ical']);

// Tipo di alloggiato richiesto dal tracciato Alloggiati Web.
const TIPI_ALLOGGIATO = Object.freeze([
  'ospite_singolo',
  'capofamiglia',
  'capogruppo',
  'familiare',
  'membro_gruppo',
]);

// Chi ha il documento nella schedina: chi viaggia da solo o guida il gruppo.
const TIPI_CON_DOCUMENTO = Object.freeze(['ospite_singolo', 'capofamiglia', 'capogruppo']);

// Codice Alloggiati Web dell'Italia: per i nati in Italia servono anche comune e provincia.
const CODICE_ITALIA = '100000100';

const ESITI_ALLOGGIATI = Object.freeze(['inviata', 'errore', 'test']);

const SESSI = Object.freeze(['M', 'F']);

const TIPI_LUOGO = Object.freeze(['comune', 'stato']);

const TIPI_CONSENSO = Object.freeze(['privacy', 'termini', 'marketing', 'cookie']);

const STATI_RECENSIONE = Object.freeze(['in_attesa', 'pubblicata', 'rifiutata']);

module.exports = {
  STATI_PRENOTAZIONE,
  STATI_ATTIVI,
  STATI_FATTURABILI,
  CANALI,
  CANALI_OTA,
  ORIGINI_BLOCCO,
  TIPI_ALLOGGIATO,
  TIPI_CON_DOCUMENTO,
  CODICE_ITALIA,
  ESITI_ALLOGGIATI,
  SESSI,
  TIPI_LUOGO,
  TIPI_CONSENSO,
  STATI_RECENSIONE,
};
