// src/routes/ospiti.routes.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/ospiti.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso } = require('../middlewares/permessi.middleware');
const { caricaDocumento } = require('../middlewares/upload.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaIdParam } = require('../validators/comune.validator');
const {
  schemaDocumentoParam,
  schemaPrenotazioneParam,
  schemaFiltriOspiti,
  schemaCreaOspite,
  schemaAggiornaOspite,
  schemaOspitiPrenotazione,
} = require('../validators/ospiti.validator');
const { PERMESSI } = require('../constants/ruoli.constants');

const idParam = valida({ params: schemaIdParam });
const gestisci = [richiediAccesso, richiediPermesso(PERMESSI.OSPITI_GESTISCI)];

// ─────────────────────────────────────
// Ospiti di una prenotazione
// ─────────────────────────────────────

router.get(
  '/prenotazione/:prenotazioneId',
  gestisci,
  valida({ params: schemaPrenotazioneParam }),
  controller.diPrenotazione,
);
router.put(
  '/prenotazione/:prenotazioneId',
  gestisci,
  valida({ params: schemaPrenotazioneParam, body: schemaOspitiPrenotazione }),
  controller.impostaDiPrenotazione,
);

// ─────────────────────────────────────
// Documenti d'identità
// ─────────────────────────────────────

router.get(
  '/documenti/:documentoId',
  gestisci,
  valida({ params: schemaDocumentoParam }),
  controller.scaricaDocumento,
);
router.delete(
  '/documenti/:documentoId',
  gestisci,
  valida({ params: schemaDocumentoParam }),
  controller.eliminaDocumento,
);

// ─────────────────────────────────────
// Anagrafiche
// ─────────────────────────────────────

router.get('/', gestisci, valida({ query: schemaFiltriOspiti }), controller.elenco);
router.post('/', gestisci, valida({ body: schemaCreaOspite }), controller.crea);
router.get('/:id', gestisci, idParam, controller.dettaglio);
router.patch(
  '/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaOspite }),
  controller.aggiorna,
);
router.delete('/:id', gestisci, idParam, controller.elimina);
router.post('/:id/documenti', gestisci, idParam, caricaDocumento, controller.aggiungiDocumento);

module.exports = router;
