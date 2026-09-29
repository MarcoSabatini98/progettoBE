// src/validators/contenuti.validator.js

const Joi = require('joi');
const { id, data, lingua } = require('./comune.validator');
const { ENTITA_MEDIA } = require('../constants/camere.constants');
const {
  TIPI_DOCUMENTO_LEGALE,
  TIPI_EVENTO_SPECIALE,
  CAMPI_TRADUCIBILI,
} = require('../constants/sistema.constants');

const ordine = Joi.number().integer().min(-32_768).max(32_767);

// ─────────────────────────────────────
// Sito pubblico
// ─────────────────────────────────────

const schemaTipoDocumentoParam = Joi.object({
  tipo: Joi.string()
    .valid(...TIPI_DOCUMENTO_LEGALE)
    .required(),
});

// ─────────────────────────────────────
// Traduzioni
// ─────────────────────────────────────

const schemaTraduzioniParam = Joi.object({
  entita: Joi.string()
    .valid(...Object.keys(CAMPI_TRADUCIBILI))
    .required(),
  entitaId: id.required(),
});

// { en: { nome: '...', descrizione: '...' } }: testo vuoto = elimina la traduzione.
// I campi ammessi per ciascuna entità li controlla il service.
const schemaTraduzioni = Joi.object()
  .pattern(
    lingua,
    Joi.object().pattern(
      Joi.string()
        .pattern(/^[a-z_]+$/)
        .max(30),
      Joi.string().max(100_000).allow(null, ''),
    ),
  )
  .min(1);

// ─────────────────────────────────────
// Media
// ─────────────────────────────────────

const schemaFiltriMedia = Joi.object({
  entita: Joi.string()
    .valid(...ENTITA_MEDIA)
    .required(),
  // vuoto = media generici dell'entità (es. galleria della struttura)
  entita_id: id,
});

const schemaAggiungiMedia = Joi.object({
  entita: Joi.string()
    .valid(...ENTITA_MEDIA)
    .required(),
  entita_id: id.allow(null),
  testo_alternativo: Joi.string().trim().max(255).allow(null, ''),
  ordine,
});

const schemaAggiornaMedia = Joi.object({
  testo_alternativo: Joi.string().trim().max(255).allow(null, ''),
  ordine,
}).min(1);

// Nuovo ordine: gli id nella sequenza voluta.
const schemaRiordinaMedia = Joi.object({
  ids: Joi.array().items(id).min(1).unique().required(),
});

// ─────────────────────────────────────
// FAQ
// ─────────────────────────────────────

const schemaFiltriFaq = Joi.object({
  categoria: Joi.string().trim().max(50),
  pubblicata: Joi.boolean(),
});

const campiFaq = {
  categoria: Joi.string().trim().max(50).allow(null, ''),
  ordine,
  pubblicata: Joi.boolean(),
};

const schemaCreaFaq = Joi.object({
  domanda: Joi.string().trim().max(255).required(),
  risposta: Joi.string().max(10_000).required(),
  ...campiFaq,
});

const schemaAggiornaFaq = Joi.object({
  domanda: Joi.string().trim().max(255),
  risposta: Joi.string().max(10_000),
  ...campiFaq,
}).min(1);

// ─────────────────────────────────────
// Documenti legali
// ─────────────────────────────────────

const versione = Joi.string().trim().max(20);
// ponytail: tetto a 1 MB; la colonna (MEDIUMTEXT) ne regge 16
const contenuto = Joi.string().max(1_000_000);

const schemaFiltriDocumentiLegali = Joi.object({
  tipo: Joi.string().valid(...TIPI_DOCUMENTO_LEGALE),
  lingua,
});

const schemaCreaDocumentoLegale = Joi.object({
  tipo: Joi.string()
    .valid(...TIPI_DOCUMENTO_LEGALE)
    .required(),
  versione: versione.required(),
  lingua,
  contenuto: contenuto.required(),
});

const schemaAggiornaDocumentoLegale = Joi.object({ versione, contenuto }).min(1);

// ─────────────────────────────────────
// Eventi speciali
// ─────────────────────────────────────

const campiEvento = {
  // 1 = poco rilevante, 10 = città piena
  impatto: Joi.number().integer().min(1).max(10),
  note: Joi.string().max(5000).allow(null, ''),
};

const schemaFiltriEventi = Joi.object({
  tipo: Joi.string().valid(...TIPI_EVENTO_SPECIALE),
  dal: data,
  al: data,
});

const schemaCreaEvento = Joi.object({
  titolo: Joi.string().trim().max(150).required(),
  tipo: Joi.string().valid(...TIPI_EVENTO_SPECIALE),
  data_inizio: data.required(),
  data_fine: data.required(),
  ...campiEvento,
});

const schemaAggiornaEvento = Joi.object({
  titolo: Joi.string().trim().max(150),
  tipo: Joi.string().valid(...TIPI_EVENTO_SPECIALE),
  data_inizio: data,
  data_fine: data,
  ...campiEvento,
}).min(1);

module.exports = {
  schemaTipoDocumentoParam,
  schemaTraduzioniParam,
  schemaTraduzioni,
  schemaFiltriMedia,
  schemaAggiungiMedia,
  schemaAggiornaMedia,
  schemaRiordinaMedia,
  schemaFiltriFaq,
  schemaCreaFaq,
  schemaAggiornaFaq,
  schemaFiltriDocumentiLegali,
  schemaCreaDocumentoLegale,
  schemaAggiornaDocumentoLegale,
  schemaFiltriEventi,
  schemaCreaEvento,
  schemaAggiornaEvento,
};
