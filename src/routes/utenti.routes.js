// src/routes/utenti.routes.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/utenti.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso, richiediRuolo } = require('../middlewares/permessi.middleware');
const { caricaDocumento } = require('../middlewares/upload.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaIdParam } = require('../validators/comune.validator');
const {
  schemaDatiPersonali,
  schemaPreferenzeEmail,
  schemaFiltriUtenti,
  schemaCreaStaff,
  schemaAggiornaAccount,
} = require('../validators/utenti.validator');
const { RUOLI, PERMESSI } = require('../constants/ruoli.constants');

const idParam = valida({ params: schemaIdParam });
const cliente = [richiediAccesso, richiediRuolo(RUOLI.CLIENTE)];
const gestisci = [richiediAccesso, richiediPermesso(PERMESSI.UTENTI_GESTISCI)];

// ─────────────────────────────────────
// Profilo (qualunque utente collegato)
// ─────────────────────────────────────

router.get('/profilo', richiediAccesso, controller.profilo);
router.patch(
  '/profilo',
  richiediAccesso,
  valida({ body: schemaDatiPersonali }),
  controller.aggiornaDatiPersonali,
);
router.patch(
  '/profilo/preferenze-email',
  richiediAccesso,
  valida({ body: schemaPreferenzeEmail }),
  controller.aggiornaPreferenzeEmail,
);

// Documenti d'identità del cliente, riusati al check-in.
router.post('/profilo/documenti', cliente, caricaDocumento, controller.aggiungiDocumento);
router.get('/profilo/documenti/:id', cliente, idParam, controller.scaricaDocumento);
router.delete('/profilo/documenti/:id', cliente, idParam, controller.eliminaDocumento);

// ─────────────────────────────────────
// Gestione account
// ─────────────────────────────────────

router.get('/', gestisci, valida({ query: schemaFiltriUtenti }), controller.elenco);
router.get('/ruoli', gestisci, controller.elencoRuoli);
router.post('/', gestisci, valida({ body: schemaCreaStaff }), controller.creaStaff);
router.get('/:id', gestisci, idParam, controller.dettaglio);
router.patch(
  '/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaAccount }),
  controller.aggiornaAccount,
);
router.delete('/:id', gestisci, idParam, controller.elimina);

module.exports = router;
