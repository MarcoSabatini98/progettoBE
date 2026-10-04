// src/validators/pagamenti.validator.js

const Joi = require('joi');
const { data, importo, paginazione, elencoDi } = require('./comune.validator');
const { schemaPerCodice } = require('./prenotazioni.validator');
const {
  TIPI_PAGAMENTO,
  METODI_PAGAMENTO,
  METODI_ONLINE,
  METODI_STRUTTURA,
  STATI_PAGAMENTO,
} = require('../constants/pagamenti.constants');

// Un pagamento vale almeno un centesimo.
const importoPagato = importo.greater(0);
const motivo = Joi.string().trim().max(255);

// ─────────────────────────────────────
// Sito e area personale
// ─────────────────────────────────────

// Vuoto = il service propone l'importo dovuto (acconto o saldo).
const campiPagaOnline = {
  metodo: Joi.string()
    .valid(...METODI_ONLINE)
    .required(),
  importo: importoPagato,
};

const schemaPagaMia = Joi.object(campiPagaOnline);

const schemaPagaPerCodice = schemaPerCodice.keys(campiPagaOnline);

const schemaCatturaPaypal = Joi.object({
  // id dell'ordine PayPal restituito dopo l'approvazione
  token: Joi.string().trim().max(100).required(),
});

// ─────────────────────────────────────
// Staff
// ─────────────────────────────────────

const schemaFiltriPagamenti = Joi.object({
  stato: elencoDi(STATI_PAGAMENTO),
  metodo: elencoDi(METODI_PAGAMENTO),
  tipo: elencoDi(TIPI_PAGAMENTO),
  dal: data,
  al: data,
  ...paginazione,
});

const schemaRegistra = Joi.object({
  tipo: Joi.string()
    .valid(...TIPI_PAGAMENTO)
    .required(),
  metodo: Joi.string()
    .valid(...METODI_STRUTTURA)
    .required(),
  importo: importoPagato.required(),
  riferimento: Joi.string().trim().max(100).allow(null, ''),
  documento_fiscale: Joi.string().trim().max(50).allow(null, ''),
  note: Joi.string().max(5000).allow(null, ''),
});

const schemaAvviaOnline = Joi.object({
  ...campiPagaOnline,
  // manda il link di pagamento all'ospite
  invia_email: Joi.boolean(),
});

const schemaRimborsa = Joi.object({
  // vuoto = rimborso totale
  importo: importoPagato,
  motivo: motivo.required(),
  // anche oltre quanto incassato in più del dovuto (es. gesto commerciale)
  forza: Joi.boolean(),
});

const schemaAnnulla = Joi.object({
  motivo: motivo.required(),
});

module.exports = {
  schemaPagaMia,
  schemaPagaPerCodice,
  schemaCatturaPaypal,
  schemaFiltriPagamenti,
  schemaRegistra,
  schemaAvviaOnline,
  schemaRimborsa,
  schemaAnnulla,
};
