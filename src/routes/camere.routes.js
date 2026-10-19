// src/routes/camere.routes.js
//
// Tipologie, camere e servizi extra. Tutto lo staff legge (reception e
// pulizie lavorano sulle camere), modifica solo chi ha camere.gestisci.

const express = require('express');
const router = express.Router();
const controller = require('../controllers/camere.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso, richiediRuolo } = require('../middlewares/permessi.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaIdParam } = require('../validators/comune.validator');
const {
  schemaLingua,
  schemaSlugParam,
  schemaFiltriTipologie,
  schemaCreaTipologia,
  schemaAggiornaTipologia,
  schemaFiltriCamere,
  schemaCreaCamera,
  schemaAggiornaCamera,
  schemaPlanning,
  schemaFiltriServizi,
  schemaCreaServizio,
  schemaAggiornaServizio,
} = require('../validators/camere.validator');
const { RUOLI, RUOLI_ASSEGNABILI, PERMESSI } = require('../constants/ruoli.constants');

const idParam = valida({ params: schemaIdParam });
const staff = [richiediAccesso, richiediRuolo(RUOLI.ADMIN, ...RUOLI_ASSEGNABILI)];
const gestisci = [richiediAccesso, richiediPermesso(PERMESSI.CAMERE_GESTISCI)];

// ─────────────────────────────────────
// Sito pubblico
// ─────────────────────────────────────

router.get('/sito/tipologie', valida({ query: schemaLingua }), controller.tipologiePubbliche);
router.get(
  '/sito/tipologie/:slug',
  valida({ params: schemaSlugParam, query: schemaLingua }),
  controller.tipologiaPubblica,
);
router.get('/sito/extra', valida({ query: schemaLingua }), controller.extraPubblici);

// ─────────────────────────────────────
// Tipologie
// ─────────────────────────────────────

router.get(
  '/tipologie',
  staff,
  valida({ query: schemaFiltriTipologie }),
  controller.elencoTipologie,
);
router.post(
  '/tipologie',
  gestisci,
  valida({ body: schemaCreaTipologia }),
  controller.creaTipologia,
);
router.get('/tipologie/:id', staff, idParam, controller.dettaglioTipologia);
router.patch(
  '/tipologie/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaTipologia }),
  controller.aggiornaTipologia,
);
router.delete('/tipologie/:id', gestisci, idParam, controller.eliminaTipologia);

// ─────────────────────────────────────
// Servizi extra
// ─────────────────────────────────────

router.get('/servizi', staff, valida({ query: schemaFiltriServizi }), controller.elencoServizi);
router.post('/servizi', gestisci, valida({ body: schemaCreaServizio }), controller.creaServizio);
router.get('/servizi/:id', staff, idParam, controller.dettaglioServizio);
router.patch(
  '/servizi/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaServizio }),
  controller.aggiornaServizio,
);
router.delete('/servizi/:id', gestisci, idParam, controller.eliminaServizio);

// ─────────────────────────────────────
// Camere
// ─────────────────────────────────────

router.get(
  '/stato',
  richiediAccesso,
  richiediPermesso(PERMESSI.PULIZIE_LEGGI),
  controller.statoCamere,
);
router.get(
  '/planning',
  richiediAccesso,
  richiediPermesso(PERMESSI.PRENOTAZIONI_LEGGI),
  valida({ query: schemaPlanning }),
  controller.planning,
);

router.get('/', staff, valida({ query: schemaFiltriCamere }), controller.elencoCamere);
router.post('/', gestisci, valida({ body: schemaCreaCamera }), controller.creaCamera);
router.get('/:id', staff, idParam, controller.dettaglioCamera);
router.patch(
  '/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaCamera }),
  controller.aggiornaCamera,
);
router.delete('/:id', gestisci, idParam, controller.eliminaCamera);
// Il vecchio link iCal smette di funzionare: va ridato alle OTA.
router.post(
  '/:id/token-ical',
  richiediAccesso,
  richiediPermesso(PERMESSI.CALENDARI_GESTISCI),
  idParam,
  controller.rigeneraTokenIcal,
);

module.exports = router;
