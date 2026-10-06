// Camere, tipologie, servizi e media.

const STATI_CAMERA = Object.freeze(['attiva', 'manutenzione', 'fuori_servizio']);

const STATI_PULIZIA_CAMERA = Object.freeze(['pulita', 'sporca', 'in_pulizia', 'da_ispezionare']);

// dotazione = inclusa nella camera; extra = acquistabile con la prenotazione
const TIPI_SERVIZIO = Object.freeze(['dotazione', 'extra']);

const CALCOLO_PREZZO = Object.freeze(['a_soggiorno', 'a_notte', 'a_persona', 'a_persona_notte']);

// A cosa appartiene un'immagine (media.entita).
const ENTITA_MEDIA = Object.freeze([
  'camera',
  'tipologia_camera',
  'servizio',
  'pacchetto',
  'struttura',
  'home', // sfondo della home col tema chiaro
  'home_scuro', // e col tema scuro
  'logo',
  'varie',
]);

// Le sole entità che accettano anche un video: gli sfondi della home.
const ENTITA_CON_VIDEO = Object.freeze(['home', 'home_scuro']);

module.exports = {
  STATI_CAMERA,
  STATI_PULIZIA_CAMERA,
  TIPI_SERVIZIO,
  CALCOLO_PREZZO,
  ENTITA_MEDIA,
  ENTITA_CON_VIDEO,
};
