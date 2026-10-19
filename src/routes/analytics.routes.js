// src/routes/analytics.routes.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/analytics.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso } = require('../middlewares/permessi.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const {
  schemaPeriodo,
  schemaAnno,
  schemaSuggerimenti,
} = require('../validators/analytics.validator');
const { PERMESSI } = require('../constants/ruoli.constants');

const leggi = [richiediAccesso, richiediPermesso(PERMESSI.ANALYTICS_LEGGI)];

router.get('/cruscotto', leggi, controller.cruscotto);
router.get('/occupazione', leggi, valida({ query: schemaPeriodo }), controller.occupazione);
router.get('/ricavi', leggi, valida({ query: schemaPeriodo }), controller.ricavi);
router.get('/canali', leggi, valida({ query: schemaPeriodo }), controller.canali);
router.get('/incassi', leggi, valida({ query: schemaAnno }), controller.incassi);
router.get('/tassa-soggiorno', leggi, valida({ query: schemaAnno }), controller.tassaSoggiorno);
router.get(
  '/suggerimenti-prezzo',
  leggi,
  valida({ query: schemaSuggerimenti }),
  controller.suggerimentiPrezzo,
);
router.get('/report', leggi, valida({ query: schemaPeriodo }), controller.reportPdf);

module.exports = router;
