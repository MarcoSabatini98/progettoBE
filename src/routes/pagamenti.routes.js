// src/routes/pagamenti.routes.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/pagamenti.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso, richiediRuolo } = require('../middlewares/permessi.middleware');
const { limiteAccesso } = require('../middlewares/limiti.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaIdParam } = require('../validators/comune.validator');
const { schemaPrenotazioneParam } = require('../validators/ospiti.validator');
const { schemaPerCodice } = require('../validators/prenotazioni.validator');
const {
  schemaPagaMia,
  schemaPagaPerCodice,
  schemaCatturaPaypal,
  schemaFiltriPagamenti,
  schemaRegistra,
  schemaAvviaOnline,
  schemaRimborsa,
  schemaAnnulla,
} = require('../validators/pagamenti.validator');
const { RUOLI, PERMESSI } = require('../constants/ruoli.constants');

const idParam = valida({ params: schemaIdParam });
const prenotazioneParam = valida({ params: schemaPrenotazioneParam });
const cliente = [richiediAccesso, richiediRuolo(RUOLI.CLIENTE)];
const leggi = [richiediAccesso, richiediPermesso(PERMESSI.PAGAMENTI_LEGGI)];
const registra = [richiediAccesso, richiediPermesso(PERMESSI.PAGAMENTI_REGISTRA)];

// ─────────────────────────────────────
// Webhook (firmati da Stripe e PayPal, niente token)
// ─────────────────────────────────────

// app.js passa a questa rotta il corpo grezzo (express.raw) per la firma.
router.post('/webhook/stripe', controller.webhookStripe);
router.post('/webhook/paypal', controller.webhookPaypal);

// ─────────────────────────────────────
// Cliente e ospite senza account
// ─────────────────────────────────────

// :id è la prenotazione del cliente.
router.get('/mie/:id', cliente, idParam, controller.riepilogoMio);
router.post(
  '/mie/:id',
  cliente,
  valida({ params: schemaIdParam, body: schemaPagaMia }),
  controller.pagaMia,
);

router.post(
  '/per-codice',
  limiteAccesso,
  valida({ body: schemaPerCodice }),
  controller.riepilogoPerCodice,
);
router.post(
  '/per-codice/paga',
  limiteAccesso,
  valida({ body: schemaPagaPerCodice }),
  controller.pagaPerCodice,
);

router.post('/paypal/cattura', valida({ body: schemaCatturaPaypal }), controller.catturaPaypal);

// ─────────────────────────────────────
// Staff
// ─────────────────────────────────────

router.get('/', leggi, valida({ query: schemaFiltriPagamenti }), controller.elenco);
router.get('/prenotazione/:prenotazioneId', leggi, prenotazioneParam, controller.diPrenotazione);
router.get(
  '/prenotazione/:prenotazioneId/riepilogo',
  leggi,
  prenotazioneParam,
  controller.riepilogo,
);
router.post(
  '/prenotazione/:prenotazioneId',
  registra,
  valida({ params: schemaPrenotazioneParam, body: schemaRegistra }),
  controller.registra,
);
router.post(
  '/prenotazione/:prenotazioneId/online',
  registra,
  valida({ params: schemaPrenotazioneParam, body: schemaAvviaOnline }),
  controller.avviaOnline,
);
router.post(
  '/:id/annullamento',
  registra,
  valida({ params: schemaIdParam, body: schemaAnnulla }),
  controller.annulla,
);
router.post(
  '/:id/rimborso',
  registra,
  valida({ params: schemaIdParam, body: schemaRimborsa }),
  controller.rimborsa,
);

module.exports = router;
