// src/validators/auth.validator.js

const Joi = require('joi');
const { token, lingua } = require('./comune.validator');

const email = Joi.string().trim().lowercase().email().max(255);

// bcrypt considera solo i primi 72 byte: oltre non avrebbe senso
const nuovaPassword = Joi.string().min(8).max(72);
const passwordAttuale = Joi.string().max(72);

// ─────────────────────────────────────
// Registrazione e accesso
// ─────────────────────────────────────

const schemaRegistra = Joi.object({
  email: email.required(),
  password: nuovaPassword.required(),
  nome: Joi.string().trim().max(100).required(),
  cognome: Joi.string().trim().max(100).required(),
  telefono: Joi.string().trim().max(30).allow(null, ''),
  lingua,
  // privacy e termini vanno accettati; marketing e cookie sono facoltativi
  consensi: Joi.object({
    privacy: Joi.boolean().valid(true).required(),
    termini: Joi.boolean().valid(true).required(),
    marketing: Joi.boolean(),
    cookie: Joi.boolean(),
  }).required(),
});

const schemaAccedi = Joi.object({
  email: email.required(),
  password: passwordAttuale.required(),
});

// ─────────────────────────────────────
// Verifica email e password
// ─────────────────────────────────────

const schemaVerificaEmail = Joi.object({
  codice: Joi.string()
    .trim()
    .pattern(/^\d{6}$/)
    .required(),
});

const schemaRichiediReset = Joi.object({
  email: email.required(),
});

const schemaReimpostaPassword = Joi.object({
  token: token.required(),
  password: nuovaPassword.required(),
});

const schemaCambiaPassword = Joi.object({
  password_attuale: passwordAttuale.required(),
  nuova_password: nuovaPassword.required(),
});

const schemaEliminaAccount = Joi.object({
  password: passwordAttuale.required(),
});

module.exports = {
  email,
  nuovaPassword,
  schemaRegistra,
  schemaAccedi,
  schemaVerificaEmail,
  schemaRichiediReset,
  schemaReimpostaPassword,
  schemaCambiaPassword,
  schemaEliminaAccount,
};
