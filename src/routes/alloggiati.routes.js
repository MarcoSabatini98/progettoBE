// src/routes/alloggiati.routes.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/alloggiati.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso } = require('../middlewares/permessi.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaPrenotazioneParam } = require('../validators/ospiti.validator');
const {
  schemaCercaLuoghi,
  schemaFile,
  schemaRegistraInvio,
} = require('../validators/alloggiati.validator');
const { PERMESSI } = require('../constants/ruoli.constants');

const invia = [richiediAccesso, richiediPermesso(PERMESSI.ALLOGGIATI_INVIA)];

router.get('/luoghi', valida({ query: schemaCercaLuoghi }), controller.luoghi);
router.get('/da-inviare', invia, controller.daInviare);
router.post('/file', invia, valida({ body: schemaFile }), controller.file);
router.get(
  '/prenotazione/:prenotazioneId',
  invia,
  valida({ params: schemaPrenotazioneParam }),
  controller.daPrenotazione,
);
router.post(
  '/prenotazione/:prenotazioneId/invio',
  invia,
  valida({ params: schemaPrenotazioneParam, body: schemaRegistraInvio }),
  controller.registraInvio,
);

module.exports = router;
