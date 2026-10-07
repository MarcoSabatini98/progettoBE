// src/validators/prenotazioni.validator.js

const Joi = require('joi');
const {
  id,
  data,
  ora,
  token,
  lingua,
  importo,
  paginazione,
  elencoDi,
} = require('./comune.validator');
const { email } = require('./auth.validator');
const { schemaCreaOspite } = require('./ospiti.validator');
const { campiOspiti, serviziScelti, codiceSconto } = require('./tariffe.validator');
const { STATI_PRENOTAZIONE, CANALI } = require('../constants/prenotazioni.constants');

// Sessione di prenotazione online: uuid generato alla ricerca delle camere.
const sessione = Joi.string().guid();

const richiesteSpeciali = Joi.string().max(5000).allow(null, '');
const noteInterne = Joi.string().max(5000).allow(null, '');

// ─────────────────────────────────────
// Disponibilità (sito)
// ─────────────────────────────────────

const schemaCercaDisponibilita = Joi.object({
  arrivo: data.required(),
  partenza: data.required(),
  ...campiOspiti,
  sessione,
  piano_id: id,
  lingua,
});

const schemaBloccaCamera = Joi.object({
  sessione,
  camera_id: id,
  tipologia_id: id,
  arrivo: data.required(),
  partenza: data.required(),
  ospiti: Joi.number().integer().min(1).max(100).required(),
}).or('camera_id', 'tipologia_id');

// Calendario del sito: notti occupate di una camera o di una tipologia in [dal, al).
const schemaOccupazione = Joi.object({
  camera_id: id,
  tipologia_id: id,
  dal: data.required(),
  al: data.required(),
  sessione,
}).xor('camera_id', 'tipologia_id');

const schemaSessioneParam = Joi.object({ sessione: sessione.required() });

// ─────────────────────────────────────
// Parametri e filtri
// ─────────────────────────────────────

const schemaServizioParam = Joi.object({
  id: id.required(),
  servizioId: id.required(),
});

const schemaTokenParam = Joi.object({ token: token.required() });

const schemaFiltriPrenotazioni = Joi.object({
  stato: elencoDi(STATI_PRENOTAZIONE),
  canale: Joi.string().valid(...CANALI),
  camera_id: id,
  dal: data,
  al: data,
  cerca: Joi.string().trim().max(100),
  ordine: Joi.string().valid('asc', 'desc'),
  ...paginazione,
});

const schemaFiltriMie = Joi.object({ ...paginazione });

const schemaGiornata = Joi.object({ giorno: data });

// ─────────────────────────────────────
// Creazione
// ─────────────────────────────────────

/**
 * Online serve `sessione` (la camera bloccata dalla ricerca), lo staff indica
 * `camera_id`. I campi dello staff li ignora il service per clienti e visitatori.
 */
const schemaCreaPrenotazione = Joi.object({
  sessione,
  camera_id: id,
  arrivo: data.required(),
  partenza: data.required(),
  ...campiOspiti,
  piano_id: id,
  codice_sconto: codiceSconto,
  pacchetto_id: id,
  servizi: serviziScelti,
  // chi prenota senza account: nome e cognome obbligatori
  titolare: schemaCreaOspite,
  richieste_speciali: richiesteSpeciali,
  ora_arrivo_prevista: ora.allow(null),
  // solo staff
  utente_id: id,
  canale: Joi.string().valid(...CANALI),
  id_esterno: Joi.string().trim().max(100).allow(null, ''),
  stato: Joi.string().valid('in_attesa', 'confermata'),
  note_interne: noteInterne,
}).or('sessione', 'camera_id');

// ─────────────────────────────────────
// Gestione
// ─────────────────────────────────────

const schemaModificaPrenotazione = Joi.object({
  camera_id: id,
  data_arrivo: data,
  data_partenza: data,
  adulti: campiOspiti.adulti.optional(),
  bambini: Joi.number().integer().min(0).max(50),
  note_interne: noteInterne,
  richieste_speciali: richiesteSpeciali,
  ora_arrivo_prevista: ora.allow(null),
}).min(1);

// La penale la può indicare solo lo staff: il service la ignora per il cliente.
const schemaCancella = Joi.object({
  motivo: Joi.string().trim().max(255).allow(null, ''),
  penale: importo.allow(null),
});

const schemaCheckOut = Joi.object({
  // chiude anche con saldo aperto
  forza: Joi.boolean(),
});

const schemaAggiungiServizio = Joi.object({
  servizio_id: id.required(),
  quantita: Joi.number().integer().min(1).max(255).default(1),
});

const schemaPerCodice = Joi.object({
  codice: Joi.string().trim().uppercase().max(20).required(),
  email: email.required(),
});

module.exports = {
  schemaCercaDisponibilita,
  schemaBloccaCamera,
  schemaOccupazione,
  schemaSessioneParam,
  schemaServizioParam,
  schemaTokenParam,
  schemaFiltriPrenotazioni,
  schemaFiltriMie,
  schemaGiornata,
  schemaCreaPrenotazione,
  schemaModificaPrenotazione,
  schemaCancella,
  schemaCheckOut,
  schemaAggiungiServizio,
  schemaPerCodice,
};
