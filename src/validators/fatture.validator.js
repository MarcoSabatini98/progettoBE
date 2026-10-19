// src/validators/fatture.validator.js

const Joi = require('joi');
const { id, percentuale, paginazione, elencoDi } = require('./comune.validator');
const { STATI_SDI } = require('../constants/pagamenti.constants');

const testo = (lunghezza) => Joi.string().trim().max(lunghezza).allow(null, '');

// ─────────────────────────────────────
// Filtri e download
// ─────────────────────────────────────

const schemaFiltriFatture = Joi.object({
  stato_sdi: elencoDi(STATI_SDI),
  anno: Joi.number().integer().min(2000).max(2100),
  prenotazione_id: id,
  cerca: Joi.string().trim().max(100),
  ...paginazione,
});

const schemaTipoFile = Joi.object({
  tipo: Joi.string().valid('pdf', 'xml').default('pdf'),
});

// ─────────────────────────────────────
// Bozze
// ─────────────────────────────────────

// Intestatario: privato (nome, cognome, codice fiscale) o azienda (denominazione, partita IVA).
const cliente = Joi.object({
  denominazione: testo(255),
  nome: testo(100),
  cognome: testo(100),
  codice_fiscale: Joi.string().trim().uppercase().alphanum().max(16).allow(null, ''),
  partita_iva: Joi.string().trim().uppercase().alphanum().max(20).allow(null, ''),
  indirizzo: testo(255),
  cap: testo(10),
  comune: testo(100),
  provincia: Joi.string().trim().uppercase().length(2).allow(null, ''),
  nazione: Joi.string().trim().uppercase().length(2),
  // '0000000' = cassetto fiscale o PEC
  codice_destinatario: Joi.string().trim().uppercase().alphanum().length(7),
  pec: Joi.string().trim().lowercase().email().max(255).allow(null, ''),
});

// Prezzo negativo ammesso: righe di sconto.
const righe = Joi.array()
  .items(
    Joi.object({
      descrizione: Joi.string().trim().max(255).required(),
      quantita: Joi.number().precision(2).greater(0).max(99_999_999.99).default(1),
      prezzo_unitario: Joi.number().precision(2).min(-99_999_999.99).max(99_999_999.99).required(),
      aliquota_iva: percentuale.required(),
      // natura IVA (es. N1, N2.2): serve solo con aliquota 0
      natura: Joi.string().trim().uppercase().max(5).allow(null, ''),
    }),
  )
  .min(1);

const schemaBozza = Joi.object({ cliente });

const schemaAggiornaBozza = Joi.object({
  cliente,
  note: Joi.string().max(5000).allow(null, ''),
  righe,
}).min(1);

// ─────────────────────────────────────
// Note di credito e SDI
// ─────────────────────────────────────

// Senza righe la nota storna tutta la fattura.
const schemaNotaDiCredito = Joi.object({
  motivo: Joi.string().trim().max(255).allow(null, ''),
  righe,
});

const schemaAggiornaSdi = Joi.object({
  stato_sdi: Joi.string()
    .valid(...STATI_SDI)
    .required(),
  id_sdi: Joi.string().trim().max(50).allow(null, ''),
  esito_sdi: Joi.string().max(10_000).allow(null, ''),
});

module.exports = {
  schemaFiltriFatture,
  schemaTipoFile,
  schemaBozza,
  schemaAggiornaBozza,
  schemaNotaDiCredito,
  schemaAggiornaSdi,
};
