// src/validators/manutenzione.validator.js

const Joi = require('joi');
const { id, paginazione } = require('./comune.validator');
const { PRIORITA, STATI_SEGNALAZIONE } = require('../constants/pulizie.constants');
const { STATI_CAMERA } = require('../constants/camere.constants');

const titolo = Joi.string().trim().max(150);
const descrizione = Joi.string().max(10_000).allow(null, '');

// Cambia anche lo stato della camera (es. fuori_servizio): solo chi gestisce.
const statoCamera = Joi.string().valid(...STATI_CAMERA);

const schemaFiltriSegnalazioni = Joi.object({
  stato: Joi.string().valid(...STATI_SEGNALAZIONE),
  // aperte = aperta o in_corso
  aperte: Joi.boolean(),
  priorita: Joi.string().valid(...PRIORITA),
  camera_id: id,
  mie: Joi.boolean(),
  ...paginazione,
});

const schemaSegnala = Joi.object({
  camera_id: id.allow(null),
  titolo: titolo.required(),
  descrizione,
  priorita: Joi.string().valid(...PRIORITA),
  stato_camera: statoCamera,
});

const schemaAggiornaSegnalazione = Joi.object({
  stato: Joi.string().valid(...STATI_SEGNALAZIONE),
  assegnata_a: id.allow(null),
  priorita: Joi.string().valid(...PRIORITA),
  titolo,
  descrizione,
  note_risoluzione: Joi.string().max(10_000).allow(null, ''),
  stato_camera: statoCamera,
}).min(1);

module.exports = {
  schemaFiltriSegnalazioni,
  schemaSegnala,
  schemaAggiornaSegnalazione,
};
