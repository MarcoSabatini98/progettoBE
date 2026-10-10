// Impostazioni, contenuti, notifiche, eventi speciali e registro attività.

const TIPI_IMPOSTAZIONE = Object.freeze(['testo', 'numero', 'booleano', 'json']);

// Tema del sito: sistema segue il dispositivo. Ognuno può cambiarlo sul suo.
const TEMI_SITO = Object.freeze(['sistema', 'chiaro', 'scuro']);

// Solo in sviluppo: il sito aperto da un telefono sulla stessa rete,
// es. http://192.168.1.20:4200 (indirizzi privati e localhost, qualunque porta).
const ORIGINE_RETE_LOCALE =
  /^http:\/\/(localhost|127\.0\.0\.1|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}):\d+$/;

const ORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

// Formato richiesto da alcune impostazioni di testo; le altre accettano qualunque testo.
const FORMATI_IMPOSTAZIONI = Object.freeze({
  aspetto_colore: /^#[0-9a-f]{6}$/i,
  aspetto_tema: new RegExp(`^(${TEMI_SITO.join('|')})$`),
  orario_checkin: ORARIO,
  orario_checkout: ORARIO,
});

const TIPI_DOCUMENTO_LEGALE = Object.freeze(['privacy', 'termini', 'cookie']);

const TIPI_NOTIFICA = Object.freeze([
  'prenotazione',
  'pagamento',
  'pulizia',
  'manutenzione',
  'chat',
  'recensione',
  'promozione',
  'sistema',
]);

const PRIORITA_NOTIFICA = Object.freeze(['info', 'successo', 'avviso', 'errore']);

const TIPI_EVENTO_SPECIALE = Object.freeze(['festivita', 'evento_locale', 'fiera', 'altro']);

// Il sito mostra gli eventi in zona dei prossimi giorni, non tutto il calendario.
const GIORNI_EVENTI_SITO = 90;

const AZIONI_REGISTRO = Object.freeze(['inserimento', 'modifica', 'eliminazione']);

// Tabelle scritte dai trigger di audit.
const TABELLE_REGISTRO = Object.freeze(['prenotazioni', 'pagamenti', 'fatture']);

// Sottocartelle di UPLOAD_DIR, una per tipo di file. I file sono tutti
// generati dall'app: il reset del database le svuota.
const CARTELLE_UPLOAD = Object.freeze({
  media: 'media', // immagini del sito: pubbliche
  documenti: 'documenti', // documenti d'identità degli ospiti: privati
  chat: 'chat', // allegati della chat: privati
  fatture: 'fatture', // XML e PDF generati: privati
});

// Campi traducibili per entità: solo testi. applicaTraduzioni sostituisce
// qualunque campo del record, quindi niente prezzi o id tra questi.
const CAMPI_TRADUCIBILI = Object.freeze({
  tipologia_camera: Object.freeze(['nome', 'descrizione', 'letti']),
  camera: Object.freeze(['descrizione']),
  servizio: Object.freeze(['nome', 'descrizione']),
  pacchetto: Object.freeze(['nome', 'descrizione']),
  promozione: Object.freeze(['nome', 'descrizione']),
  faq: Object.freeze(['domanda', 'risposta']),
  pagina: Object.freeze(['descrizione', 'testo']),
  sezione: Object.freeze(['titolo', 'testo']),
  evento: Object.freeze(['titolo']),
});

// Pagine del sito con contenuti propri (tabella pagine, una riga ciascuna).
// camere: copertina, sottotitolo e testo sopra le tipologie, senza sezioni.
const PAGINE_SITO = Object.freeze(['home', 'struttura', 'attivita', 'camere']);

module.exports = {
  ORIGINE_RETE_LOCALE,
  TIPI_IMPOSTAZIONE,
  FORMATI_IMPOSTAZIONI,
  TIPI_DOCUMENTO_LEGALE,
  TIPI_NOTIFICA,
  PRIORITA_NOTIFICA,
  TIPI_EVENTO_SPECIALE,
  GIORNI_EVENTI_SITO,
  AZIONI_REGISTRO,
  TABELLE_REGISTRO,
  CARTELLE_UPLOAD,
  CAMPI_TRADUCIBILI,
  PAGINE_SITO,
};
