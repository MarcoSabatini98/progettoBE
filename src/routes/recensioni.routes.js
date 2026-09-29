// src/routes/recensioni.routes.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/recensioni.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso, richiediRuolo } = require('../middlewares/permessi.middleware');
const { limiteAccesso } = require('../middlewares/limiti.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaIdParam } = require('../validators/comune.validator');
const { schemaPrenotazioneParam } = require('../validators/ospiti.validator');
const {
  schemaFiltriPubbliche,
  schemaCreaRecensione,
  schemaCreaDaCodice,
  schemaFiltriRecensioni,
  schemaModera,
  schemaRispondi,
} = require('../validators/recensioni.validator');
const { RUOLI, PERMESSI } = require('../constants/ruoli.constants');

const modera = [richiediAccesso, richiediPermesso(PERMESSI.RECENSIONI_MODERA)];

// ─────────────────────────────────────
// Sito e area personale
// ─────────────────────────────────────

router.get('/pubbliche', valida({ query: schemaFiltriPubbliche }), controller.pubbliche);
router.get('/valutazioni', controller.valutazioni);
router.post(
  '/prenotazione/:prenotazioneId',
  richiediAccesso,
  richiediRuolo(RUOLI.CLIENTE),
  valida({ params: schemaPrenotazioneParam, body: schemaCreaRecensione }),
  controller.crea,
);
router.post(
  '/per-codice',
  limiteAccesso,
  valida({ body: schemaCreaDaCodice }),
  controller.creaDaCodice,
);

// ─────────────────────────────────────
// Staff
// ─────────────────────────────────────

router.get('/', modera, valida({ query: schemaFiltriRecensioni }), controller.elenco);
router.get('/:id', modera, valida({ params: schemaIdParam }), controller.dettaglio);
router.patch(
  '/:id/moderazione',
  modera,
  valida({ params: schemaIdParam, body: schemaModera }),
  controller.modera,
);
router.put(
  '/:id/risposta',
  modera,
  valida({ params: schemaIdParam, body: schemaRispondi }),
  controller.rispondi,
);

module.exports = router;
