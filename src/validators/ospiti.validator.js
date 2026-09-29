// src/validators/ospiti.validator.js

const Joi = require('joi');
const { id, data, lingua, paginazione } = require('./comune.validator');
const { email } = require('./auth.validator');
const { SESSI, TIPI_ALLOGGIATO } = require('../constants/prenotazioni.constants');

// Codici di stati e comuni della Polizia di Stato (Alloggiati Web): 9 cifre.
const codiceLuogo = Joi.string()
  .trim()
  .pattern(/^\d{9}$/)
  .allow(null, '');

const siglaProvincia = Joi.string().trim().uppercase().length(2).allow(null, '');

/**
 * Dati anagrafici e del documento, gli stessi per gli ospiti e per l'area
 * personale del cliente. Tutti facoltativi: gli obbligatori per la schedina
 * dipendono dal tipo di alloggiato e li controlla il service.
 */
const campiAnagrafica = {
  sesso: Joi.string()
    .valid(...SESSI)
    .allow(null),
  data_nascita: data.allow(null),
  cittadinanza_codice: codiceLuogo,
  stato_nascita_codice: codiceLuogo,
  comune_nascita_codice: codiceLuogo,
  provincia_nascita: siglaProvincia,
  tipo_documento: Joi.string().trim().uppercase().max(5).allow(null, ''),
  numero_documento: Joi.string().trim().max(30).allow(null, ''),
  luogo_rilascio_codice: codiceLuogo,
  scadenza_documento: data.allow(null),
  codice_fiscale: Joi.string().trim().uppercase().alphanum().length(16).allow(null, ''),
  indirizzo: Joi.string().trim().max(255).allow(null, ''),
  cap: Joi.string().trim().max(10).allow(null, ''),
  citta: Joi.string().trim().max(100).allow(null, ''),
  provincia: siglaProvincia,
  paese: Joi.string().trim().uppercase().length(2).allow(null, ''),
};

const campiOspite = {
  email: email.allow(null, ''),
  telefono: Joi.string().trim().max(30).allow(null, ''),
  lingua,
  note: Joi.string().max(5000).allow(null, ''),
  ...campiAnagrafica,
};

// ─────────────────────────────────────
// Parametri e filtri
// ─────────────────────────────────────

const schemaDocumentoParam = Joi.object({ documentoId: id.required() });

const schemaPrenotazioneParam = Joi.object({ prenotazioneId: id.required() });

const schemaFiltriOspiti = Joi.object({
  cerca: Joi.string().trim().max(100),
  ...paginazione,
});

// ─────────────────────────────────────
// Anagrafiche
// ─────────────────────────────────────

const schemaCreaOspite = Joi.object({
  nome: Joi.string().trim().max(100).required(),
  cognome: Joi.string().trim().max(100).required(),
  ...campiOspite,
});

const schemaAggiornaOspite = Joi.object({
  nome: Joi.string().trim().max(100),
  cognome: Joi.string().trim().max(100),
  ...campiOspite,
}).min(1);

// ─────────────────────────────────────
// Ospiti di una prenotazione
// ─────────────────────────────────────

function rigaOspite(ospite) {
  return Joi.object({
    ospite: ospite.required(),
    tipo_alloggiato: Joi.string().valid(...TIPI_ALLOGGIATO),
    esente_tassa: Joi.boolean(),
    motivo_esenzione: Joi.string().trim().max(100).allow(null, ''),
  });
}

// Staff: un'anagrafica già registrata (solo id) oppure i dati di una nuova.
const ospiteStaff = Joi.alternatives().try(Joi.object({ id: id.required() }), schemaCreaOspite);

const schemaOspitiPrenotazione = Joi.object({
  ospiti: Joi.array().items(rigaOspite(ospiteStaff)).min(1).max(50).required(),
});

// ponytail: nel check-in online niente id: chi ha il link potrebbe agganciare
// (e poi leggere) l'anagrafica di un altro ospite. Solo dati inseriti a mano.
const schemaCheckinOnline = Joi.object({
  ospiti: Joi.array().items(rigaOspite(schemaCreaOspite)).min(1).max(50).required(),
});

module.exports = {
  campiAnagrafica,
  schemaDocumentoParam,
  schemaPrenotazioneParam,
  schemaFiltriOspiti,
  schemaCreaOspite,
  schemaAggiornaOspite,
  schemaOspitiPrenotazione,
  schemaCheckinOnline,
};
