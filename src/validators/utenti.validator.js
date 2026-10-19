// src/validators/utenti.validator.js

const Joi = require('joi');
const { lingua, paginazione } = require('./comune.validator');
const { email, nuovaPassword } = require('./auth.validator');
const { campiAnagrafica } = require('./ospiti.validator');
const { RUOLI, RUOLI_ASSEGNABILI, PERMESSI } = require('../constants/ruoli.constants');

const nome = Joi.string().trim().max(100);
const telefono = Joi.string().trim().max(30).allow(null, '');

// ─────────────────────────────────────
// Area personale
// ─────────────────────────────────────

const schemaDatiPersonali = Joi.object({
  nome,
  cognome: nome,
  telefono,
  lingua,
  notifiche_email: Joi.boolean(),
  ...campiAnagrafica,
}).min(1);

const schemaPreferenzeEmail = Joi.object({
  notifiche_email: Joi.boolean(),
  email_marketing: Joi.boolean(),
}).min(1);

// ─────────────────────────────────────
// Gestione account (admin)
// ─────────────────────────────────────

const schemaFiltriUtenti = Joi.object({
  ruolo: Joi.string().valid(...Object.values(RUOLI)),
  attivo: Joi.boolean(),
  cerca: Joi.string().trim().max(100),
  ...paginazione,
});

// L'admin non si crea da qui e i clienti si registrano da soli.
const schemaCreaStaff = Joi.object({
  email: email.required(),
  password: nuovaPassword.required(),
  ruolo: Joi.string()
    .valid(...RUOLI_ASSEGNABILI)
    .required(),
  nome: nome.required(),
  cognome: nome.required(),
  telefono,
  lingua,
});

const schemaAggiornaAccount = Joi.object({
  nome,
  cognome: nome,
  telefono,
  lingua,
  ruolo: Joi.string().valid(...RUOLI_ASSEGNABILI),
  attivo: Joi.boolean(),
}).min(1);

// ─────────────────────────────────────
// Permessi dei ruoli (admin)
// ─────────────────────────────────────

const schemaRuoloParam = Joi.object({
  ruolo: Joi.string()
    .valid(...RUOLI_ASSEGNABILI)
    .required(),
});

const schemaPermessi = Joi.object({
  permessi: Joi.array()
    .items(Joi.string().valid(...Object.values(PERMESSI)))
    .required(),
});

// Coppie di ruoli che possono scriversi in chat: [["receptionist", "housekeeper"], ...]
const schemaRegoleChat = Joi.object({
  coppie: Joi.array()
    .items(
      Joi.array()
        .items(Joi.string().valid(...Object.values(RUOLI)))
        .length(2),
    )
    .required(),
});

module.exports = {
  schemaDatiPersonali,
  schemaPreferenzeEmail,
  schemaFiltriUtenti,
  schemaCreaStaff,
  schemaAggiornaAccount,
  schemaRuoloParam,
  schemaPermessi,
  schemaRegoleChat,
};
