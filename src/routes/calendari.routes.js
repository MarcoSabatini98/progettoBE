// src/routes/calendari.routes.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/calendari.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso } = require('../middlewares/permessi.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaIdParam } = require('../validators/comune.validator');
const {
  schemaFiltriChiusure,
  schemaBlocca,
  schemaAggiornaBlocco,
  schemaFeedParam,
  schemaCreaCalendario,
  schemaAggiornaCalendario,
} = require('../validators/calendari.validator');
const { PERMESSI } = require('../constants/ruoli.constants');

const idParam = valida({ params: schemaIdParam });
const leggi = [richiediAccesso, richiediPermesso(PERMESSI.PRENOTAZIONI_LEGGI)];
const gestisci = [richiediAccesso, richiediPermesso(PERMESSI.CALENDARI_GESTISCI)];

// ─────────────────────────────────────
// Feed iCal letto dalle OTA (il token nel link fa da password)
// ─────────────────────────────────────

router.get('/feed/:token.ics', valida({ params: schemaFeedParam }), controller.feed);

// ─────────────────────────────────────
// Chiusure (la reception le vede nel planning)
// ─────────────────────────────────────

router.get('/chiusure', leggi, valida({ query: schemaFiltriChiusure }), controller.chiusure);
router.post('/chiusure', gestisci, valida({ body: schemaBlocca }), controller.blocca);
router.patch(
  '/chiusure/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaBlocco }),
  controller.aggiornaBlocco,
);
router.delete('/chiusure/:id', gestisci, idParam, controller.sblocca);

// ─────────────────────────────────────
// Link da dare alle OTA e calendari esterni da importare
// ─────────────────────────────────────

router.get('/esportazione', gestisci, controller.linkEsportazione);

router.get('/esterni', gestisci, controller.elencoCalendari);
router.post(
  '/esterni',
  gestisci,
  valida({ body: schemaCreaCalendario }),
  controller.creaCalendario,
);
router.get('/esterni/:id', gestisci, idParam, controller.dettaglioCalendario);
router.patch(
  '/esterni/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaCalendario }),
  controller.aggiornaCalendario,
);
router.delete('/esterni/:id', gestisci, idParam, controller.eliminaCalendario);
router.post('/esterni/:id/sincronizzazione', gestisci, idParam, controller.sincronizza);

module.exports = router;
