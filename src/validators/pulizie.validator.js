// src/validators/pulizie.validator.js

const Joi = require('joi');
const { id, data } = require('./comune.validator');
const {
  TIPI_PULIZIA,
  PRIORITA,
  STATI_ATTIVITA_PULIZIA,
} = require('../constants/pulizie.constants');

const note = Joi.string().max(5000).allow(null, '');

// ─────────────────────────────────────
// Attività
// ─────────────────────────────────────

const schemaFiltriPulizie = Joi.object({
  // vuota = oggi
  data,
  stato: Joi.string().valid(...STATI_ATTIVITA_PULIZIA),
  camera_id: id,
  assegnata_a: id,
  // solo le attività assegnate a me
  mie: Joi.boolean(),
});

const schemaCreaAttivita = Joi.object({
  camera_id: id.required(),
  prenotazione_id: id.allow(null),
  assegnata_a: id.allow(null),
  data_prevista: data.required(),
  tipo: Joi.string()
    .valid(...TIPI_PULIZIA)
    .required(),
  priorita: Joi.string().valid(...PRIORITA),
  note,
});

const schemaAggiornaAttivita = Joi.object({
  assegnata_a: id.allow(null),
  data_prevista: data,
  priorita: Joi.string().valid(...PRIORITA),
  tipo: Joi.string().valid(...TIPI_PULIZIA),
  note,
}).min(1);

// Il service controlla che il passaggio di stato sia ammesso.
const schemaAvanza = Joi.object({
  stato: Joi.string().valid(...STATI_ATTIVITA_PULIZIA),
  checklist: Joi.array().items(
    Joi.object({
      voce: Joi.string().trim().max(150).required(),
      fatto: Joi.boolean().required(),
    }),
  ),
  note,
}).min(1);

// Vuoto = oggi.
const schemaGiorno = Joi.object({ giorno: data });

// "Non disturbare": più tardi in giornata o domani.
const schemaRinvio = Joi.object({ quando: Joi.string().valid('oggi', 'domani').required() });

// ─────────────────────────────────────
// Voci della checklist
// ─────────────────────────────────────

const campiVoce = {
  ordine: Joi.number().integer().min(0).max(65_535),
  attiva: Joi.boolean(),
};

const schemaCreaVoce = Joi.object({
  voce: Joi.string().trim().max(150).required(),
  tipo_pulizia: Joi.string()
    .valid(...TIPI_PULIZIA)
    .required(),
  ...campiVoce,
});

const schemaAggiornaVoce = Joi.object({
  voce: Joi.string().trim().max(150),
  tipo_pulizia: Joi.string().valid(...TIPI_PULIZIA),
  ...campiVoce,
}).min(1);

module.exports = {
  schemaFiltriPulizie,
  schemaCreaAttivita,
  schemaAggiornaAttivita,
  schemaAvanza,
  schemaGiorno,
  schemaRinvio,
  schemaCreaVoce,
  schemaAggiornaVoce,
};
