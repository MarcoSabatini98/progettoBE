// src/validators/fedelta.validator.js

const Joi = require('joi');
const { id, percentuale, paginazione } = require('./comune.validator');
const { MOTIVI_PUNTI } = require('../constants/tariffe.constants');

const codiceLivello = Joi.string()
  .trim()
  .lowercase()
  .max(20)
  .pattern(/^[a-z0-9_-]+$/);

// ─────────────────────────────────────
// Livelli
// ─────────────────────────────────────

const campiLivello = {
  punti_minimi: Joi.number().integer().min(0).max(4_294_967_295),
  sconto_percentuale: percentuale,
  // colore del badge: #rrggbb
  colore: Joi.string()
    .trim()
    .pattern(/^#[0-9a-fA-F]{6}$/)
    .allow(null),
};

const schemaCreaLivello = Joi.object({
  codice: codiceLivello.required(),
  nome: Joi.string().trim().max(50).required(),
  ...campiLivello,
  punti_minimi: campiLivello.punti_minimi.required(),
});

const schemaAggiornaLivello = Joi.object({
  codice: codiceLivello,
  nome: Joi.string().trim().max(50),
  ...campiLivello,
}).min(1);

// ─────────────────────────────────────
// Punti e classifica
// ─────────────────────────────────────

const schemaUtenteParam = Joi.object({ utenteId: id.required() });

const schemaFiltriMovimenti = Joi.object({ ...paginazione });

const schemaAnno = Joi.object({
  anno: Joi.number().integer().min(2000).max(2100),
});

const schemaFiltriClassifica = Joi.object({
  livello: codiceLivello,
  ...paginazione,
});

// Punti negativi = storno.
const schemaAssegnaPunti = Joi.object({
  punti: Joi.number().integer().min(-1_000_000).max(1_000_000).invalid(0).required(),
  motivo: Joi.string()
    .valid(...MOTIVI_PUNTI)
    .default('bonus'),
  note: Joi.string().trim().max(255).allow(null, ''),
});

const schemaImpostaLivello = Joi.object({
  livello: codiceLivello.required(),
});

module.exports = {
  schemaCreaLivello,
  schemaAggiornaLivello,
  schemaUtenteParam,
  schemaFiltriMovimenti,
  schemaAnno,
  schemaFiltriClassifica,
  schemaAssegnaPunti,
  schemaImpostaLivello,
};
