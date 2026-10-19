// src/routes/tariffe.routes.js
//
// Tutto lo staff legge piani, periodi, promozioni, pacchetti e tasse (servono
// alla reception per prenotare); i codici sconto e le modifiche restano a
// chi ha tariffe.gestisci.

const express = require('express');
const router = express.Router();
const controller = require('../controllers/tariffe.controller');
const { richiediAccesso, accessoFacoltativo } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso, richiediRuolo } = require('../middlewares/permessi.middleware');
const { limiteAccesso } = require('../middlewares/limiti.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaIdParam } = require('../validators/comune.validator');
const { schemaLingua } = require('../validators/camere.validator');
const {
  schemaPreventivo,
  schemaVerificaCodice,
  schemaFiltriAttivo,
  schemaCreaPiano,
  schemaAggiornaPiano,
  schemaFiltriPeriodi,
  schemaCreaPeriodo,
  schemaAggiornaPeriodo,
  schemaFiltriPromozioni,
  schemaCreaPromozione,
  schemaAggiornaPromozione,
  schemaFiltriCodiciSconto,
  schemaCreaCodiceSconto,
  schemaAggiornaCodiceSconto,
  schemaCreaPacchetto,
  schemaAggiornaPacchetto,
  schemaCreaTassa,
  schemaAggiornaTassa,
} = require('../validators/tariffe.validator');
const { RUOLI, RUOLI_ASSEGNABILI, PERMESSI } = require('../constants/ruoli.constants');

const idParam = valida({ params: schemaIdParam });
const staff = [richiediAccesso, richiediRuolo(RUOLI.ADMIN, ...RUOLI_ASSEGNABILI)];
const gestisci = [richiediAccesso, richiediPermesso(PERMESSI.TARIFFE_GESTISCI)];

// ─────────────────────────────────────
// Sito pubblico (l'utente collegato ha lo sconto fedeltà)
// ─────────────────────────────────────

router.post(
  '/preventivo',
  accessoFacoltativo,
  valida({ body: schemaPreventivo }),
  controller.preventivo,
);
// Limitata: altrimenti i codici si indovinano per tentativi.
router.post(
  '/codici-sconto/verifica',
  limiteAccesso,
  accessoFacoltativo,
  valida({ body: schemaVerificaCodice }),
  controller.verificaCodiceSconto,
);
router.get(
  '/promozioni/pubbliche',
  valida({ query: schemaLingua }),
  controller.promozioniPubbliche,
);
router.get('/pacchetti/pubblici', valida({ query: schemaLingua }), controller.pacchettiPubblici);
router.get('/soggiorno', controller.condizioniSoggiorno);

// ─────────────────────────────────────
// Piani tariffari
// ─────────────────────────────────────

router.get('/piani', staff, valida({ query: schemaFiltriAttivo }), controller.elencoPiani);
router.post('/piani', gestisci, valida({ body: schemaCreaPiano }), controller.creaPiano);
router.get('/piani/:id', staff, idParam, controller.dettaglioPiano);
router.patch(
  '/piani/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaPiano }),
  controller.aggiornaPiano,
);
router.delete('/piani/:id', gestisci, idParam, controller.eliminaPiano);

// ─────────────────────────────────────
// Periodi (stagioni)
// ─────────────────────────────────────

router.get('/periodi', staff, valida({ query: schemaFiltriPeriodi }), controller.elencoPeriodi);
router.post('/periodi', gestisci, valida({ body: schemaCreaPeriodo }), controller.creaPeriodo);
router.get('/periodi/:id', staff, idParam, controller.dettaglioPeriodo);
router.patch(
  '/periodi/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaPeriodo }),
  controller.aggiornaPeriodo,
);
router.delete('/periodi/:id', gestisci, idParam, controller.eliminaPeriodo);

// ─────────────────────────────────────
// Promozioni
// ─────────────────────────────────────

router.get(
  '/promozioni',
  staff,
  valida({ query: schemaFiltriPromozioni }),
  controller.elencoPromozioni,
);
router.post(
  '/promozioni',
  gestisci,
  valida({ body: schemaCreaPromozione }),
  controller.creaPromozione,
);
router.get('/promozioni/:id', staff, idParam, controller.dettaglioPromozione);
router.patch(
  '/promozioni/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaPromozione }),
  controller.aggiornaPromozione,
);
router.delete('/promozioni/:id', gestisci, idParam, controller.eliminaPromozione);

// ─────────────────────────────────────
// Codici sconto
// ─────────────────────────────────────

router.get(
  '/codici-sconto',
  gestisci,
  valida({ query: schemaFiltriCodiciSconto }),
  controller.elencoCodiciSconto,
);
router.post(
  '/codici-sconto',
  gestisci,
  valida({ body: schemaCreaCodiceSconto }),
  controller.creaCodiceSconto,
);
router.get('/codici-sconto/:id', gestisci, idParam, controller.dettaglioCodiceSconto);
router.patch(
  '/codici-sconto/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaCodiceSconto }),
  controller.aggiornaCodiceSconto,
);
router.delete('/codici-sconto/:id', gestisci, idParam, controller.eliminaCodiceSconto);

// ─────────────────────────────────────
// Pacchetti
// ─────────────────────────────────────

router.get('/pacchetti', staff, valida({ query: schemaFiltriAttivo }), controller.elencoPacchetti);
router.post(
  '/pacchetti',
  gestisci,
  valida({ body: schemaCreaPacchetto }),
  controller.creaPacchetto,
);
router.get('/pacchetti/:id', staff, idParam, controller.dettaglioPacchetto);
router.patch(
  '/pacchetti/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaPacchetto }),
  controller.aggiornaPacchetto,
);
router.delete('/pacchetti/:id', gestisci, idParam, controller.eliminaPacchetto);

// ─────────────────────────────────────
// Tassa di soggiorno
// ─────────────────────────────────────

router.get('/tasse', staff, controller.elencoTasse);
router.post('/tasse', gestisci, valida({ body: schemaCreaTassa }), controller.creaTassa);
router.get('/tasse/:id', staff, idParam, controller.dettaglioTassa);
router.patch(
  '/tasse/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaTassa }),
  controller.aggiornaTassa,
);
router.delete('/tasse/:id', gestisci, idParam, controller.eliminaTassa);

module.exports = router;
