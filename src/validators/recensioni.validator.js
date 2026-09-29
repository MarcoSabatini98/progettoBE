// src/validators/recensioni.validator.js

const Joi = require('joi');
const { lingua, paginazione } = require('./comune.validator');
const { schemaPerCodice } = require('./prenotazioni.validator');
const { STATI_RECENSIONE } = require('../constants/prenotazioni.constants');

const voto = Joi.number().integer().min(1).max(5);

// ─────────────────────────────────────
// Sito e area personale
// ─────────────────────────────────────

const schemaFiltriPubbliche = Joi.object({ lingua, ...paginazione });

const campiRecensione = {
  voto: voto.required(),
  // voti di dettaglio facoltativi
  voto_pulizia: voto.allow(null),
  voto_personale: voto.allow(null),
  voto_posizione: voto.allow(null),
  voto_comfort: voto.allow(null),
  voto_qualita_prezzo: voto.allow(null),
  titolo: Joi.string().trim().max(150).allow(null, ''),
  commento: Joi.string().max(5000).allow(null, ''),
  lingua,
  anonima: Joi.boolean(),
};

const schemaCreaRecensione = Joi.object(campiRecensione);

// Senza account: codice della prenotazione ed email di chi ha prenotato.
const schemaCreaDaCodice = schemaPerCodice.keys(campiRecensione);

// ─────────────────────────────────────
// Moderazione
// ─────────────────────────────────────

const schemaFiltriRecensioni = Joi.object({
  stato: Joi.string().valid(...STATI_RECENSIONE),
  // per trovare in fretta le recensioni negative
  voto_max: voto,
  ...paginazione,
});

const schemaModera = Joi.object({
  stato: Joi.string()
    .valid(...STATI_RECENSIONE)
    .required(),
});

// Risposta vuota = la tolgo.
const schemaRispondi = Joi.object({
  risposta: Joi.string().max(5000).allow(null, '').required(),
});

module.exports = {
  schemaFiltriPubbliche,
  schemaCreaRecensione,
  schemaCreaDaCodice,
  schemaFiltriRecensioni,
  schemaModera,
  schemaRispondi,
};
