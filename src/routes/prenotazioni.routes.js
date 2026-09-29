// src/routes/prenotazioni.routes.js
//
// Il service tratta da staff ogni ruolo diverso da cliente (niente controllo
// sul proprietario, stati in più): per questo le azioni del cliente stanno
// sotto /mie con richiediRuolo(CLIENTE) e quelle dello staff sotto /:id
// con il permesso.

const express = require('express');
const router = express.Router();
const controller = require('../controllers/prenotazioni.controller');
const { richiediAccesso, accessoFacoltativo } = require('../middlewares/autenticazione.middleware');
const {
  richiediPermesso,
  richiediRuolo,
  richiediPermessoSeStaff,
} = require('../middlewares/permessi.middleware');
const { limiteAccesso } = require('../middlewares/limiti.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaIdParam } = require('../validators/comune.validator');
const { schemaCheckinOnline } = require('../validators/ospiti.validator');
const {
  schemaServizioParam,
  schemaTokenParam,
  schemaFiltriPrenotazioni,
  schemaFiltriMie,
  schemaGiornata,
  schemaCreaPrenotazione,
  schemaModificaPrenotazione,
  schemaCancella,
  schemaCheckOut,
  schemaAggiungiServizio,
  schemaPerCodice,
} = require('../validators/prenotazioni.validator');
const { RUOLI, PERMESSI } = require('../constants/ruoli.constants');

const idParam = valida({ params: schemaIdParam });
const cliente = [richiediAccesso, richiediRuolo(RUOLI.CLIENTE)];
const leggi = [richiediAccesso, richiediPermesso(PERMESSI.PRENOTAZIONI_LEGGI)];
const gestisci = [richiediAccesso, richiediPermesso(PERMESSI.PRENOTAZIONI_GESTISCI)];
const checkin = [richiediAccesso, richiediPermesso(PERMESSI.CHECKIN_GESTISCI)];

// ─────────────────────────────────────
// Sito: nuova prenotazione e ospite senza account
// ─────────────────────────────────────

// Anche lo staff prenota da qui (telefono, walk-in), se ha il permesso.
router.post(
  '/',
  accessoFacoltativo,
  richiediPermessoSeStaff(PERMESSI.PRENOTAZIONI_GESTISCI),
  valida({ body: schemaCreaPrenotazione }),
  controller.crea,
);
router.post('/per-codice', limiteAccesso, valida({ body: schemaPerCodice }), controller.perCodice);

// Check-in online dal link con token inviato all'ospite.
router.get(
  '/checkin-online/:token',
  limiteAccesso,
  valida({ params: schemaTokenParam }),
  controller.datiCheckinOnline,
);
router.put(
  '/checkin-online/:token',
  limiteAccesso,
  valida({ params: schemaTokenParam, body: schemaCheckinOnline }),
  controller.checkinOnline,
);

// ─────────────────────────────────────
// Area personale del cliente
// ─────────────────────────────────────

router.get('/mie', cliente, valida({ query: schemaFiltriMie }), controller.mie);
router.get('/mie/:id', cliente, idParam, controller.mia);
router.get('/mie/:id/cancellazione', cliente, idParam, controller.anteprimaCancellazione);
router.post(
  '/mie/:id/cancellazione',
  cliente,
  valida({ params: schemaIdParam, body: schemaCancella }),
  controller.cancella,
);
router.post(
  '/mie/:id/servizi',
  cliente,
  valida({ params: schemaIdParam, body: schemaAggiungiServizio }),
  controller.aggiungiServizio,
);
router.delete(
  '/mie/:id/servizi/:servizioId',
  cliente,
  valida({ params: schemaServizioParam }),
  controller.rimuoviServizio,
);

// ─────────────────────────────────────
// Staff
// ─────────────────────────────────────

router.get('/', leggi, valida({ query: schemaFiltriPrenotazioni }), controller.elenco);
router.get('/giornata', leggi, valida({ query: schemaGiornata }), controller.giornata);
router.get('/:id', leggi, idParam, controller.dettaglio);
router.patch(
  '/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaModificaPrenotazione }),
  controller.modifica,
);
router.post('/:id/conferma', gestisci, idParam, controller.conferma);
router.post('/:id/no-show', gestisci, idParam, controller.noShow);
router.get('/:id/cancellazione', gestisci, idParam, controller.anteprimaCancellazione);
router.post(
  '/:id/cancellazione',
  gestisci,
  valida({ params: schemaIdParam, body: schemaCancella }),
  controller.cancella,
);
router.post(
  '/:id/servizi',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiungiServizio }),
  controller.aggiungiServizio,
);
router.delete(
  '/:id/servizi/:servizioId',
  gestisci,
  valida({ params: schemaServizioParam }),
  controller.rimuoviServizio,
);

router.post('/:id/check-in', checkin, idParam, controller.checkIn);
router.post(
  '/:id/check-out',
  checkin,
  valida({ params: schemaIdParam, body: schemaCheckOut }),
  controller.checkOut,
);
router.post('/:id/link-checkin', checkin, idParam, controller.linkCheckin);

module.exports = router;
