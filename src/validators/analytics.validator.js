// src/validators/analytics.validator.js

const Joi = require('joi');
const { id, data } = require('./comune.validator');

// Vuoti = ultimi 30 giorni. Ordine e lunghezza massima li controlla il service.
const schemaPeriodo = Joi.object({ dal: data, al: data });

// Vuoto = anno in corso.
const schemaAnno = Joi.object({
  anno: Joi.number().integer().min(2000).max(2100),
});

const schemaSuggerimenti = Joi.object({
  dal: data,
  al: data,
  tipologia_id: id,
});

module.exports = { schemaPeriodo, schemaAnno, schemaSuggerimenti };
