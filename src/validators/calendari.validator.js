// src/validators/calendari.validator.js

const Joi = require('joi');
const { id, data, token } = require('./comune.validator');
const { CANALI_OTA } = require('../constants/prenotazioni.constants');

const motivo = Joi.string().trim().max(255).allow(null, '');

// ─────────────────────────────────────
// Chiusure (date bloccate)
// ─────────────────────────────────────

const schemaFiltriChiusure = Joi.object({
  dal: data,
  al: data,
  camera_id: id,
});

const schemaBlocca = Joi.object({
  // vuota = chiude tutta la struttura
  camera_id: id.allow(null),
  data_inizio: data.required(),
  data_fine: data.required(),
  motivo,
});

const schemaAggiornaBlocco = Joi.object({
  data_inizio: data,
  data_fine: data,
  motivo,
}).min(1);

// ─────────────────────────────────────
// Feed iCal e calendari esterni (OTA)
// ─────────────────────────────────────

const schemaFeedParam = Joi.object({ token: token.required() });

const url = Joi.string()
  .trim()
  .uri({ scheme: ['http', 'https'] })
  .max(1000);

const schemaCreaCalendario = Joi.object({
  camera_id: id.required(),
  canale: Joi.string()
    .valid(...CANALI_OTA)
    .required(),
  nome: Joi.string().trim().max(100).required(),
  url: url.required(),
  attivo: Joi.boolean(),
});

const schemaAggiornaCalendario = Joi.object({
  canale: Joi.string().valid(...CANALI_OTA),
  nome: Joi.string().trim().max(100),
  url,
  attivo: Joi.boolean(),
}).min(1);

module.exports = {
  schemaFiltriChiusure,
  schemaBlocca,
  schemaAggiornaBlocco,
  schemaFeedParam,
  schemaCreaCalendario,
  schemaAggiornaCalendario,
};
