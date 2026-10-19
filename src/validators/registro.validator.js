// src/validators/registro.validator.js

const Joi = require('joi');
const { id, data, paginazione } = require('./comune.validator');
const { TABELLE_REGISTRO, AZIONI_REGISTRO } = require('../constants/sistema.constants');

// Solo le tabelle che hanno i trigger di audit.
const tabella = Joi.string().valid(...TABELLE_REGISTRO);

const schemaFiltriRegistro = Joi.object({
  tabella,
  record_id: id,
  utente_id: id,
  azione: Joi.string().valid(...AZIONI_REGISTRO),
  dal: data,
  al: data,
  ...paginazione,
});

// Storia di un record: /registro/prenotazioni/42
const schemaStoriaParam = Joi.object({
  tabella: tabella.required(),
  id: id.required(),
});

const schemaFiltriStoria = Joi.object({ ...paginazione });

module.exports = { schemaFiltriRegistro, schemaStoriaParam, schemaFiltriStoria };
