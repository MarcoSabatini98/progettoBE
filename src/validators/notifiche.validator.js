// src/validators/notifiche.validator.js

const Joi = require('joi');
const { paginazione } = require('./comune.validator');

const schemaFiltriNotifiche = Joi.object({
  non_lette: Joi.boolean(),
  ...paginazione,
});

module.exports = { schemaFiltriNotifiche };
