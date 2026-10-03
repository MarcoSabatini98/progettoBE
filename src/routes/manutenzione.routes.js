// src/routes/manutenzione.routes.js
//
// Chi ha solo manutenzione.segnala apre segnalazioni e vede le sue (lo
// distingue il service); le modifiche restano a manutenzione.gestisci.

const express = require('express');
const router = express.Router();
const controller = require('../controllers/manutenzione.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso } = require('../middlewares/permessi.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaIdParam } = require('../validators/comune.validator');
const {
  schemaFiltriSegnalazioni,
  schemaSegnala,
  schemaAggiornaSegnalazione,
} = require('../validators/manutenzione.validator');
const { PERMESSI } = require('../constants/ruoli.constants');

const segnala = [richiediAccesso, richiediPermesso(PERMESSI.MANUTENZIONE_SEGNALA)];
const gestisci = [richiediAccesso, richiediPermesso(PERMESSI.MANUTENZIONE_GESTISCI)];

router.get('/', segnala, valida({ query: schemaFiltriSegnalazioni }), controller.elenco);
router.post('/', segnala, valida({ body: schemaSegnala }), controller.segnala);
router.get('/incaricabili', gestisci, controller.incaricabili);
router.get('/:id', segnala, valida({ params: schemaIdParam }), controller.dettaglio);
router.patch(
  '/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaSegnalazione }),
  controller.aggiorna,
);

module.exports = router;
