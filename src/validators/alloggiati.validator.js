// src/validators/alloggiati.validator.js

const Joi = require('joi');
const { id } = require('./comune.validator');
const { ESITI_ALLOGGIATI } = require('../constants/prenotazioni.constants');

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

module.exports = { schemaFile, schemaRegistraInvio };
