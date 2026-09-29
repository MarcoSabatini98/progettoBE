// src/validators/impostazioni.validator.js

const Joi = require('joi');

// Mappa chiave → valore. Le chiavi inesistenti le rifiuta il service,
// che conosce il tipo di ciascuna e converte il valore.
const schemaAggiornaImpostazioni = Joi.object()
  .pattern(
    Joi.string()
      .pattern(/^[a-z0-9_]+$/)
      .max(100),
    Joi.alternatives().try(
      Joi.string().max(100_000).allow(''),
      Joi.number(),
      Joi.boolean(),
      Joi.array(),
      Joi.object(),
    ),
  )
  .min(1);

module.exports = { schemaAggiornaImpostazioni };
