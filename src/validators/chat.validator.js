// src/validators/chat.validator.js

const Joi = require('joi');
const { id, lingua, paginazione } = require('./comune.validator');
const { email } = require('./auth.validator');
const { STATI_CONVERSAZIONE, TESTO_MAX } = require('../constants/chat.constants');

// I messaggi sono BIGINT: niente tetto a 4 miliardi come per gli altri id.
const idMessaggio = Joi.number().integer().positive();
const titolo = Joi.string().trim().max(150);
const testo = Joi.string().trim().max(TESTO_MAX);

// ─────────────────────────────────────
// Parametri e filtri
// ─────────────────────────────────────

const schemaUuidParam = Joi.object({ uuid: Joi.string().guid().required() });

const schemaMessaggioParam = Joi.object({ id: idMessaggio.required() });

const schemaFiltriConversazioni = Joi.object({
  tipo: Joi.string().valid('staff', 'assistenza'),
  // solo assistenza: assegnate a me o ancora da prendere
  assegnate: Joi.string().valid('mie', 'libere'),
  stato: Joi.string().valid(...STATI_CONVERSAZIONE),
  ...paginazione,
});

// Storico a ritroso: prima_di = id del messaggio più vecchio già caricato.
const schemaFiltriMessaggi = Joi.object({
  prima_di: idMessaggio,
  limite: Joi.number().integer().min(1).max(100),
});

// ─────────────────────────────────────
// Visitatori e conversazioni
// ─────────────────────────────────────

const schemaCreaVisitatore = Joi.object({
  nome: Joi.string().trim().max(100).allow(null, ''),
  email: email.allow(null, ''),
  lingua,
});

const schemaApriAssistenza = Joi.object({
  titolo: titolo.allow(null, ''),
  prenotazione_id: id.allow(null),
  testo: testo.required(),
});

const schemaApriStaff = Joi.object({
  partecipanti: Joi.array().items(id).min(1).max(50).required(),
  // obbligatorio solo per i gruppi: lo controlla il service
  titolo: titolo.allow(null, ''),
  testo: testo.required(),
});

const schemaAssegna = Joi.object({
  // null = la rimetto tra le libere
  utente_id: id.allow(null).required(),
});

const schemaStato = Joi.object({
  stato: Joi.string()
    .valid(...STATI_CONVERSAZIONE)
    .required(),
});

const schemaPartecipante = Joi.object({ utente_id: id.required() });

const schemaRinomina = Joi.object({ titolo: titolo.required() });

// ─────────────────────────────────────
// Messaggi
// ─────────────────────────────────────

// Il testo può mancare se ci sono allegati: lo controlla il service.
const schemaInvia = Joi.object({
  testo: testo.allow(''),
  risposta_a_id: idMessaggio.allow(null),
});

const schemaModificaMessaggio = Joi.object({ testo: testo.required() });

module.exports = {
  schemaUuidParam,
  schemaMessaggioParam,
  schemaFiltriConversazioni,
  schemaFiltriMessaggi,
  schemaCreaVisitatore,
  schemaApriAssistenza,
  schemaApriStaff,
  schemaAssegna,
  schemaStato,
  schemaPartecipante,
  schemaRinomina,
  schemaInvia,
  schemaModificaMessaggio,
};
