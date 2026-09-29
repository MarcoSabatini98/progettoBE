// src/routes/fedelta.routes.js
//
// Lato staff è gestione dei clienti: stesso permesso degli account utente.

const express = require('express');
const router = express.Router();
const controller = require('../controllers/fedelta.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso, richiediRuolo } = require('../middlewares/permessi.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaIdParam } = require('../validators/comune.validator');
const {
  schemaCreaLivello,
  schemaAggiornaLivello,
  schemaUtenteParam,
  schemaFiltriMovimenti,
  schemaAnno,
  schemaFiltriClassifica,
  schemaAssegnaPunti,
  schemaImpostaLivello,
} = require('../validators/fedelta.validator');
const { RUOLI, PERMESSI } = require('../constants/ruoli.constants');

const idParam = valida({ params: schemaIdParam });
const utenteParam = valida({ params: schemaUtenteParam });
const cliente = [richiediAccesso, richiediRuolo(RUOLI.CLIENTE)];
const gestisci = [richiediAccesso, richiediPermesso(PERMESSI.UTENTI_GESTISCI)];

// ─────────────────────────────────────
// Livelli (l'elenco serve anche al sito)
// ─────────────────────────────────────

router.get('/livelli', controller.elencoLivelli);
router.post('/livelli', gestisci, valida({ body: schemaCreaLivello }), controller.creaLivello);
router.get('/livelli/:id', gestisci, idParam, controller.dettaglioLivello);
router.patch(
  '/livelli/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaLivello }),
  controller.aggiornaLivello,
);
router.delete('/livelli/:id', gestisci, idParam, controller.eliminaLivello);

// ─────────────────────────────────────
// Area personale
// ─────────────────────────────────────

router.get('/mia', cliente, controller.miaSituazione);
router.get(
  '/mia/movimenti',
  cliente,
  valida({ query: schemaFiltriMovimenti }),
  controller.mieiMovimenti,
);
router.get('/mia/statistiche', cliente, valida({ query: schemaAnno }), controller.mieStatistiche);

// ─────────────────────────────────────
// Staff
// ─────────────────────────────────────

router.get('/clienti', gestisci, valida({ query: schemaFiltriClassifica }), controller.classifica);
router.get('/clienti/per-livello', gestisci, controller.clientiPerLivello);
router.get('/clienti/:utenteId', gestisci, utenteParam, controller.situazioneCliente);
router.get(
  '/clienti/:utenteId/movimenti',
  gestisci,
  valida({ params: schemaUtenteParam, query: schemaFiltriMovimenti }),
  controller.movimentiCliente,
);
router.post(
  '/clienti/:utenteId/punti',
  gestisci,
  valida({ params: schemaUtenteParam, body: schemaAssegnaPunti }),
  controller.assegnaPunti,
);
router.put(
  '/clienti/:utenteId/livello',
  gestisci,
  valida({ params: schemaUtenteParam, body: schemaImpostaLivello }),
  controller.impostaLivello,
);

module.exports = router;
