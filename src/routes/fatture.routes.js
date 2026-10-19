// src/routes/fatture.routes.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/fatture.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso, richiediRuolo } = require('../middlewares/permessi.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaIdParam } = require('../validators/comune.validator');
const { schemaPrenotazioneParam } = require('../validators/ospiti.validator');
const {
  schemaFiltriFatture,
  schemaTipoFile,
  schemaBozza,
  schemaAggiornaBozza,
  schemaNotaDiCredito,
  schemaAggiornaSdi,
} = require('../validators/fatture.validator');
const { RUOLI, PERMESSI } = require('../constants/ruoli.constants');

const idParam = valida({ params: schemaIdParam });
const cliente = [richiediAccesso, richiediRuolo(RUOLI.CLIENTE)];
const gestisci = [richiediAccesso, richiediPermesso(PERMESSI.FATTURE_GESTISCI)];

// ─────────────────────────────────────
// Area personale
// ─────────────────────────────────────

router.get('/mie', cliente, controller.mie);
router.get(
  '/mie/:id/file',
  cliente,
  valida({ params: schemaIdParam, query: schemaTipoFile }),
  controller.scaricaMia,
);

// ─────────────────────────────────────
// Staff
// ─────────────────────────────────────

router.get('/', gestisci, valida({ query: schemaFiltriFatture }), controller.elenco);
router.post(
  '/prenotazione/:prenotazioneId',
  gestisci,
  valida({ params: schemaPrenotazioneParam, body: schemaBozza }),
  controller.bozzaDaPrenotazione,
);
router.get('/:id', gestisci, idParam, controller.dettaglio);
router.get(
  '/:id/file',
  gestisci,
  valida({ params: schemaIdParam, query: schemaTipoFile }),
  controller.scarica,
);
router.patch(
  '/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaBozza }),
  controller.aggiornaBozza,
);
router.delete('/:id', gestisci, idParam, controller.eliminaBozza);
router.post('/:id/emissione', gestisci, idParam, controller.emetti);
router.post(
  '/:id/nota-di-credito',
  gestisci,
  valida({ params: schemaIdParam, body: schemaNotaDiCredito }),
  controller.notaDiCredito,
);
router.patch(
  '/:id/sdi',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaSdi }),
  controller.aggiornaSdi,
);
router.post('/:id/file', gestisci, idParam, controller.rigeneraFile);

module.exports = router;
