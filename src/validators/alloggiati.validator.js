// src/validators/alloggiati.validator.js

const Joi = require('joi');
const { id, data } = require('./comune.validator');
const { ESITI_ALLOGGIATI, TIPI_LUOGO } = require('../constants/prenotazioni.constants');

// Solo lettere, spazi, apostrofi, punti e trattini: niente caratteri jolly di LIKE.
const schemaCercaLuoghi = Joi.object({
  cerca: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .pattern(/^[\p{L}\s'.-]+$/u)
    .required(),
  tipo: Joi.string().valid(...TIPI_LUOGO),
  // Per il luogo di nascita: anche i comuni soppressi dopo quella data.
  in_vigore_il: data,
});

// Un file con le schedine di più prenotazioni.
const schemaFile = Joi.object({
  prenotazioni: Joi.array().items(id).min(1).max(100).unique().required(),
});

const schemaRegistraInvio = Joi.object({
  esito: Joi.string()
    .valid(...ESITI_ALLOGGIATI)
    .required(),
  messaggio: Joi.string().max(5000).allow(null, ''),
});

module.exports = { schemaCercaLuoghi, schemaFile, schemaRegistraInvio };
