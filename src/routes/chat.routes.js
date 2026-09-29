// src/routes/chat.routes.js
//
// richiediChat accetta sia gli utenti collegati sia i visitatori del sito
// con il token della chat: chi può fare cosa in una conversazione lo decide
// il service (partecipanti, permesso chat.assistenza, regole tra ruoli).

const express = require('express');
const router = express.Router();
const controller = require('../controllers/chat.controller');
const { richiediChat } = require('../middlewares/autenticazione.middleware');
const { limiteChatPubblica } = require('../middlewares/limiti.middleware');
const { caricaAllegatiChat } = require('../middlewares/upload.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const {
  schemaUuidParam,
  schemaMessaggioParam,
  schemaFiltriConversazioni,
  schemaFiltriMessaggi,
  schemaCreaVisitatore,
  schemaApriAssistenza,
  schemaApriStaff,
  schemaAssegna,
  schemaStato,
  schemaPartecipante,
  schemaRinomina,
  schemaInvia,
  schemaModificaMessaggio,
} = require('../validators/chat.validator');

const uuidParam = valida({ params: schemaUuidParam });
const messaggioParam = valida({ params: schemaMessaggioParam });

// ─────────────────────────────────────
// Visitatori del sito
// ─────────────────────────────────────

router.post(
  '/visitatori',
  limiteChatPubblica,
  valida({ body: schemaCreaVisitatore }),
  controller.creaVisitatore,
);
router.get('/assistenza/stato', controller.statoAssistenza);

// ─────────────────────────────────────
// Conversazioni
// ─────────────────────────────────────

router.get(
  '/conversazioni',
  richiediChat,
  valida({ query: schemaFiltriConversazioni }),
  controller.elenco,
);
router.get('/conversazioni/non-letti', richiediChat, controller.totaleNonLetti);
// ponytail: limite solo all'apertura, non a ogni messaggio (colpirebbe anche lo staff)
router.post(
  '/conversazioni/assistenza',
  richiediChat,
  limiteChatPubblica,
  valida({ body: schemaApriAssistenza }),
  controller.apriAssistenza,
);
router.post(
  '/conversazioni/staff',
  richiediChat,
  valida({ body: schemaApriStaff }),
  controller.apriStaff,
);

router.get('/conversazioni/:uuid', richiediChat, uuidParam, controller.dettaglio);
router.post('/conversazioni/:uuid/letto', richiediChat, uuidParam, controller.segnaLetto);
router.put(
  '/conversazioni/:uuid/assegnatario',
  richiediChat,
  valida({ params: schemaUuidParam, body: schemaAssegna }),
  controller.assegna,
);
router.patch(
  '/conversazioni/:uuid/stato',
  richiediChat,
  valida({ params: schemaUuidParam, body: schemaStato }),
  controller.impostaStato,
);
router.post(
  '/conversazioni/:uuid/partecipanti',
  richiediChat,
  valida({ params: schemaUuidParam, body: schemaPartecipante }),
  controller.aggiungiPartecipante,
);
router.patch(
  '/conversazioni/:uuid/titolo',
  richiediChat,
  valida({ params: schemaUuidParam, body: schemaRinomina }),
  controller.rinominaGruppo,
);
router.post('/conversazioni/:uuid/uscita', richiediChat, uuidParam, controller.esci);
router.get('/conversazioni/:uuid/pdf', richiediChat, uuidParam, controller.esportaPdf);

// ─────────────────────────────────────
// Messaggi
// ─────────────────────────────────────

router.get(
  '/conversazioni/:uuid/messaggi',
  richiediChat,
  valida({ params: schemaUuidParam, query: schemaFiltriMessaggi }),
  controller.messaggi,
);
router.post(
  '/conversazioni/:uuid/messaggi',
  richiediChat,
  caricaAllegatiChat,
  valida({ params: schemaUuidParam, body: schemaInvia }),
  controller.invia,
);
router.patch(
  '/messaggi/:id',
  richiediChat,
  valida({ params: schemaMessaggioParam, body: schemaModificaMessaggio }),
  controller.modificaMessaggio,
);
router.delete('/messaggi/:id', richiediChat, messaggioParam, controller.eliminaMessaggio);
router.get('/messaggi/:id/allegato', richiediChat, messaggioParam, controller.scaricaAllegato);

module.exports = router;
