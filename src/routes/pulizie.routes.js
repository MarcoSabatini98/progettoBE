// src/routes/pulizie.routes.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/pulizie.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso } = require('../middlewares/permessi.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaIdParam } = require('../validators/comune.validator');
const {
  schemaFiltriPulizie,
  schemaCreaAttivita,
  schemaAggiornaAttivita,
  schemaAvanza,
  schemaGiorno,
  schemaCreaVoce,
  schemaAggiornaVoce,
} = require('../validators/pulizie.validator');
const { PERMESSI } = require('../constants/ruoli.constants');

const idParam = valida({ params: schemaIdParam });
const leggi = [richiediAccesso, richiediPermesso(PERMESSI.PULIZIE_LEGGI)];
const esegui = [richiediAccesso, richiediPermesso(PERMESSI.PULIZIE_ESEGUI)];
const gestisci = [richiediAccesso, richiediPermesso(PERMESSI.PULIZIE_GESTISCI)];

// ─────────────────────────────────────
// Voci della checklist
// ─────────────────────────────────────

router.get('/checklist', leggi, controller.vociChecklist);
router.post('/checklist', gestisci, valida({ body: schemaCreaVoce }), controller.aggiungiVoce);
router.patch(
  '/checklist/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaVoce }),
  controller.aggiornaVoce,
);
router.delete('/checklist/:id', gestisci, idParam, controller.eliminaVoce);

// ─────────────────────────────────────
// Pianificazione del giorno
// ─────────────────────────────────────

router.post('/giornata', gestisci, valida({ body: schemaGiorno }), controller.generaGiornata);
router.post(
  '/giornata/assegnazione',
  gestisci,
  valida({ body: schemaGiorno }),
  controller.autoassegna,
);

// ─────────────────────────────────────
// Attività
// ─────────────────────────────────────

router.get('/', leggi, valida({ query: schemaFiltriPulizie }), controller.elenco);
router.post('/', gestisci, valida({ body: schemaCreaAttivita }), controller.crea);
router.get('/:id', leggi, idParam, controller.dettaglio);
router.patch(
  '/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaAttivita }),
  controller.aggiorna,
);
router.delete('/:id', gestisci, idParam, controller.elimina);
// L'addetto avanza solo le sue attività: lo controlla il service.
router.post(
  '/:id/avanzamento',
  esegui,
  valida({ params: schemaIdParam, body: schemaAvanza }),
  controller.avanza,
);

module.exports = router;
