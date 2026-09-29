// src/validators/camere.validator.js

const Joi = require('joi');
const { id, data, lingua, importo, percentuale } = require('./comune.validator');
const {
  STATI_CAMERA,
  STATI_PULIZIA_CAMERA,
  TIPI_SERVIZIO,
  CALCOLO_PREZZO,
} = require('../constants/camere.constants');

// Indirizzo pubblico: minuscole, numeri e trattini (es. "camera-doppia-vista-mare").
const slug = Joi.string()
  .trim()
  .max(120)
  .pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/);

// Dotazioni incluse: elenco di id dei servizi, sostituisce quello attuale.
const idServizi = Joi.array().items(id).unique();

// ─────────────────────────────────────
// Sito pubblico
// ─────────────────────────────────────

const schemaLingua = Joi.object({ lingua });

const schemaSlugParam = Joi.object({ slug: slug.required() });

// ─────────────────────────────────────
// Tipologie
// ─────────────────────────────────────

const campiTipologia = {
  slug,
  descrizione: Joi.string().max(10_000).allow(null, ''),
  superficie_mq: Joi.number().integer().min(1).max(65_535).allow(null),
  letti: Joi.string().trim().max(100).allow(null, ''),
  ordine: Joi.number().integer().min(0).max(65_535),
  attiva: Joi.boolean(),
  servizi: idServizi,
};

const schemaFiltriTipologie = Joi.object({
  attiva: Joi.boolean(),
});

const schemaCreaTipologia = Joi.object({
  nome: Joi.string().trim().max(100).required(),
  prezzo_base: importo.required(),
  ospiti_max: Joi.number().integer().min(1).max(127).required(),
  ...campiTipologia,
});

const schemaAggiornaTipologia = Joi.object({
  nome: Joi.string().trim().max(100),
  prezzo_base: importo,
  ospiti_max: Joi.number().integer().min(1).max(127),
  ...campiTipologia,
}).min(1);

// ─────────────────────────────────────
// Camere
// ─────────────────────────────────────

const campiCamera = {
  nome: Joi.string().trim().max(100).allow(null, ''),
  piano: Joi.number().integer().min(-128).max(127),
  // se vuoto vale quello della tipologia
  ospiti_max: Joi.number().integer().min(1).max(127).allow(null),
  stato: Joi.string().valid(...STATI_CAMERA),
  note: Joi.string().max(5000).allow(null, ''),
  servizi: idServizi,
};

const schemaFiltriCamere = Joi.object({
  tipologia_id: id,
  stato: Joi.string().valid(...STATI_CAMERA),
  stato_pulizia: Joi.string().valid(...STATI_PULIZIA_CAMERA),
  piano: Joi.number().integer().min(-128).max(127),
});

const schemaCreaCamera = Joi.object({
  numero: Joi.string().trim().max(10).required(),
  tipologia_id: id.required(),
  ...campiCamera,
});

const schemaAggiornaCamera = Joi.object({
  numero: Joi.string().trim().max(10),
  tipologia_id: id,
  ...campiCamera,
}).min(1);

const schemaPlanning = Joi.object({
  dal: data.required(),
  al: data.required(),
});

// ─────────────────────────────────────
// Servizi
// ─────────────────────────────────────

const campiServizio = {
  descrizione: Joi.string().trim().max(255).allow(null, ''),
  icona: Joi.string().trim().max(50).allow(null, ''),
  calcolo_prezzo: Joi.string().valid(...CALCOLO_PREZZO),
  // vuota = aliquota predefinita delle impostazioni
  aliquota_iva: percentuale.allow(null),
  ordine: Joi.number().integer().min(0).max(65_535),
  attivo: Joi.boolean(),
};

const schemaFiltriServizi = Joi.object({
  tipo: Joi.string().valid(...TIPI_SERVIZIO),
  attivo: Joi.boolean(),
});

const schemaCreaServizio = Joi.object({
  nome: Joi.string().trim().max(100).required(),
  tipo: Joi.string()
    .valid(...TIPI_SERVIZIO)
    .required(),
  prezzo: importo.default(0),
  ...campiServizio,
});

const schemaAggiornaServizio = Joi.object({
  nome: Joi.string().trim().max(100),
  tipo: Joi.string().valid(...TIPI_SERVIZIO),
  prezzo: importo,
  ...campiServizio,
}).min(1);

module.exports = {
  slug,
  schemaLingua,
  schemaSlugParam,
  schemaFiltriTipologie,
  schemaCreaTipologia,
  schemaAggiornaTipologia,
  schemaFiltriCamere,
  schemaCreaCamera,
  schemaAggiornaCamera,
  schemaPlanning,
  schemaFiltriServizi,
  schemaCreaServizio,
  schemaAggiornaServizio,
};
