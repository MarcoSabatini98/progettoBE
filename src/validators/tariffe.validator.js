// src/validators/tariffe.validator.js

const Joi = require('joi');
const { id, data, importo, percentuale } = require('./comune.validator');
const { slug } = require('./camere.validator');
const {
  TIPI_VARIAZIONE_PIANO,
  TIPI_VARIAZIONE_PERIODO,
  TIPI_SCONTO,
} = require('../constants/tariffe.constants');

const nome = Joi.string().trim().max(100);
const descrizione = Joi.string().max(10_000).allow(null, '');
const piccoloIntero = Joi.number().integer().min(1).max(255);

// Variazioni e sconti: percentuali o importi, anche negativi per le variazioni.
const variazione = Joi.number().precision(2).min(-99_999_999.99).max(99_999_999.99);

// Uno sconto in percentuale non supera il 100%.
const valoreSconto = Joi.number()
  .precision(2)
  .positive()
  .max(99_999_999.99)
  .when('tipo_sconto', { is: 'percentuale', then: Joi.number().max(100) });

// Extra scelti: [{ servizio_id, quantita }]
const serviziScelti = Joi.array().items(
  Joi.object({
    servizio_id: id.required(),
    quantita: Joi.number().integer().min(1).max(255).default(1),
  }),
);

const codiceSconto = Joi.string()
  .trim()
  .uppercase()
  .max(30)
  .pattern(/^[A-Z0-9_-]+$/);

// ─────────────────────────────────────
// Preventivo (sito)
// ─────────────────────────────────────

/** Adulti, bambini ed età dei bambini (serve per l'esenzione dalla tassa di soggiorno). */
const campiOspiti = {
  adulti: Joi.number().integer().min(1).max(50).required(),
  bambini: Joi.number().integer().min(0).max(50).default(0),
  eta_bambini: Joi.array().items(Joi.number().integer().min(0).max(17)).max(50).single(),
};

const schemaPreventivo = Joi.object({
  tipologia_id: id.required(),
  arrivo: data.required(),
  partenza: data.required(),
  ...campiOspiti,
  piano_id: id,
  codice_sconto: codiceSconto,
  pacchetto_id: id,
  servizi: serviziScelti,
});

const schemaVerificaCodice = Joi.object({
  codice: codiceSconto.required(),
});

// ─────────────────────────────────────
// Piani tariffari
// ─────────────────────────────────────

const campiPiano = {
  descrizione,
  tipo_variazione: Joi.string().valid(...TIPI_VARIAZIONE_PIANO),
  valore_variazione: variazione,
  rimborsabile: Joi.boolean(),
  ore_cancellazione_gratuita: Joi.number().integer().min(0).max(65_535),
  penale_percentuale: percentuale,
  acconto_percentuale: percentuale,
  predefinito: Joi.boolean(),
  attivo: Joi.boolean(),
  ordine: Joi.number().integer().min(0).max(65_535),
};

const schemaFiltriAttivo = Joi.object({ attivo: Joi.boolean() });

const schemaCreaPiano = Joi.object({ nome: nome.required(), ...campiPiano });

const schemaAggiornaPiano = Joi.object({ nome, ...campiPiano }).min(1);

// ─────────────────────────────────────
// Periodi tariffari (stagioni)
// ─────────────────────────────────────

const campiPeriodo = {
  // vuota = tutte le tipologie
  tipologia_id: id.allow(null),
  // giorni della settimana come bit: lun=1, mar=2, mer=4 ... dom=64 (127 = tutti)
  giorni_settimana: Joi.number().integer().min(1).max(127),
  soggiorno_minimo: piccoloIntero.allow(null),
  priorita: Joi.number().integer().min(0).max(255),
  attivo: Joi.boolean(),
};

const schemaFiltriPeriodi = Joi.object({
  tipologia_id: id,
  attivo: Joi.boolean(),
  dal: data,
  al: data,
});

const schemaCreaPeriodo = Joi.object({
  nome: nome.required(),
  data_inizio: data.required(),
  data_fine: data.required(),
  tipo_variazione: Joi.string()
    .valid(...TIPI_VARIAZIONE_PERIODO)
    .required(),
  valore: variazione.required(),
  ...campiPeriodo,
});

const schemaAggiornaPeriodo = Joi.object({
  nome,
  data_inizio: data,
  data_fine: data,
  tipo_variazione: Joi.string().valid(...TIPI_VARIAZIONE_PERIODO),
  valore: variazione,
  ...campiPeriodo,
}).min(1);

// ─────────────────────────────────────
// Promozioni
// ─────────────────────────────────────

const campiPromozione = {
  descrizione,
  tipologia_id: id.allow(null),
  prenotabile_dal: data.allow(null),
  prenotabile_al: data.allow(null),
  ospiti_min: piccoloIntero.allow(null),
  ospiti_max: piccoloIntero.allow(null),
  notti_min: piccoloIntero.allow(null),
  attiva: Joi.boolean(),
};

const schemaFiltriPromozioni = Joi.object({
  attiva: Joi.boolean(),
  tipologia_id: id,
});

const schemaCreaPromozione = Joi.object({
  nome: nome.required(),
  soggiorno_dal: data.required(),
  soggiorno_al: data.required(),
  tipo_sconto: Joi.string()
    .valid(...TIPI_SCONTO)
    .required(),
  valore: valoreSconto.required(),
  ...campiPromozione,
});

const schemaAggiornaPromozione = Joi.object({
  nome,
  soggiorno_dal: data,
  soggiorno_al: data,
  tipo_sconto: Joi.string().valid(...TIPI_SCONTO),
  valore: valoreSconto,
  ...campiPromozione,
}).min(1);

// ─────────────────────────────────────
// Codici sconto
// ─────────────────────────────────────

const campiCodiceSconto = {
  descrizione: Joi.string().trim().max(255).allow(null, ''),
  valido_dal: data.allow(null),
  valido_al: data.allow(null),
  importo_minimo: importo.allow(null),
  notti_min: piccoloIntero.allow(null),
  utilizzi_max: Joi.number().integer().min(1).max(4_294_967_295).allow(null),
  utilizzi_per_utente: Joi.number().integer().min(1).max(65_535).allow(null),
  attivo: Joi.boolean(),
};

const schemaFiltriCodiciSconto = Joi.object({
  attivo: Joi.boolean(),
  cerca: Joi.string().trim().max(30),
});

const schemaCreaCodiceSconto = Joi.object({
  codice: codiceSconto.required(),
  tipo_sconto: Joi.string()
    .valid(...TIPI_SCONTO)
    .required(),
  valore: valoreSconto.required(),
  ...campiCodiceSconto,
});

const schemaAggiornaCodiceSconto = Joi.object({
  codice: codiceSconto,
  tipo_sconto: Joi.string().valid(...TIPI_SCONTO),
  valore: valoreSconto,
  ...campiCodiceSconto,
}).min(1);

// ─────────────────────────────────────
// Pacchetti
// ─────────────────────────────────────

const campiPacchetto = {
  slug,
  descrizione,
  tipologia_id: id.allow(null),
  notti_min: piccoloIntero.allow(null),
  valido_dal: data.allow(null),
  valido_al: data.allow(null),
  attivo: Joi.boolean(),
  ordine: Joi.number().integer().min(0).max(65_535),
  // servizi inclusi: sostituiscono quelli attuali
  servizi: serviziScelti,
};

const schemaCreaPacchetto = Joi.object({
  nome: nome.required(),
  prezzo: importo.required(),
  ...campiPacchetto,
});

const schemaAggiornaPacchetto = Joi.object({ nome, prezzo: importo, ...campiPacchetto }).min(1);

// ─────────────────────────────────────
// Tassa di soggiorno
// ─────────────────────────────────────

const campiTassa = {
  // vuoti = nessun limite
  notti_max: piccoloIntero.allow(null),
  eta_esenzione: Joi.number().integer().min(0).max(120).allow(null),
  attiva: Joi.boolean(),
};

const schemaCreaTassa = Joi.object({
  nome: nome.required(),
  valida_dal: data.required(),
  valida_al: data.required(),
  importo_notte: Joi.number().precision(2).min(0).max(9999.99).required(),
  ...campiTassa,
});

const schemaAggiornaTassa = Joi.object({
  nome,
  valida_dal: data,
  valida_al: data,
  importo_notte: Joi.number().precision(2).min(0).max(9999.99),
  ...campiTassa,
}).min(1);

module.exports = {
  campiOspiti,
  serviziScelti,
  codiceSconto,
  schemaPreventivo,
  schemaVerificaCodice,
  schemaFiltriAttivo,
  schemaCreaPiano,
  schemaAggiornaPiano,
  schemaFiltriPeriodi,
  schemaCreaPeriodo,
  schemaAggiornaPeriodo,
  schemaFiltriPromozioni,
  schemaCreaPromozione,
  schemaAggiornaPromozione,
  schemaFiltriCodiciSconto,
  schemaCreaCodiceSconto,
  schemaAggiornaCodiceSconto,
  schemaCreaPacchetto,
  schemaAggiornaPacchetto,
  schemaCreaTassa,
  schemaAggiornaTassa,
};
