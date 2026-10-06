// src/routes/contenuti.routes.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/contenuti.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso } = require('../middlewares/permessi.middleware');
const { caricaMedia } = require('../middlewares/upload.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaIdParam } = require('../validators/comune.validator');
const { schemaLingua } = require('../validators/camere.validator');
const {
  schemaTipoDocumentoParam,
  schemaTraduzioniParam,
  schemaTraduzioni,
  schemaFiltriMedia,
  schemaAggiungiMedia,
  schemaAggiornaMedia,
  schemaRiordinaMedia,
  schemaFiltriFaq,
  schemaCreaFaq,
  schemaAggiornaFaq,
  schemaFiltriDocumentiLegali,
  schemaCreaDocumentoLegale,
  schemaAggiornaDocumentoLegale,
  schemaFiltriEventi,
  schemaCreaEvento,
  schemaAggiornaEvento,
} = require('../validators/contenuti.validator');
const { PERMESSI } = require('../constants/ruoli.constants');

const idParam = valida({ params: schemaIdParam });
const gestisci = [richiediAccesso, richiediPermesso(PERMESSI.CONTENUTI_GESTISCI)];
const faq = [richiediAccesso, richiediPermesso(PERMESSI.FAQ_GESTISCI)];

// ─────────────────────────────────────
// Sito pubblico
// ─────────────────────────────────────

router.get('/faq/pubbliche', valida({ query: schemaLingua }), controller.faqPubbliche);
router.get(
  '/documenti-legali/vigente/:tipo',
  valida({ params: schemaTipoDocumentoParam, query: schemaLingua }),
  controller.documentoLegaleVigente,
);
// Le immagini sono già pubbliche sotto /media: l'elenco serve alle gallerie del sito.
router.get('/media', valida({ query: schemaFiltriMedia }), controller.elencoMedia);

// ─────────────────────────────────────
// Traduzioni
// ─────────────────────────────────────

router.get(
  '/traduzioni/:entita/:entitaId',
  gestisci,
  valida({ params: schemaTraduzioniParam }),
  controller.traduzioniDi,
);
router.put(
  '/traduzioni/:entita/:entitaId',
  gestisci,
  valida({ params: schemaTraduzioniParam, body: schemaTraduzioni }),
  controller.salvaTraduzioni,
);

// ─────────────────────────────────────
// Immagini
// ─────────────────────────────────────

// multer prima di valida: è lui che riempie req.body dal multipart.
router.post(
  '/media',
  gestisci,
  caricaMedia,
  valida({ body: schemaAggiungiMedia }),
  controller.aggiungiMedia,
);
router.put(
  '/media/ordine',
  gestisci,
  valida({ body: schemaRiordinaMedia }),
  controller.riordinaMedia,
);
router.patch(
  '/media/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaMedia }),
  controller.aggiornaMedia,
);
router.delete('/media/:id', gestisci, idParam, controller.eliminaMedia);

// ─────────────────────────────────────
// FAQ
// ─────────────────────────────────────

router.get('/faq', faq, valida({ query: schemaFiltriFaq }), controller.elencoFaq);
router.post('/faq', faq, valida({ body: schemaCreaFaq }), controller.creaFaq);
router.get('/faq/:id', faq, idParam, controller.dettaglioFaq);
router.patch(
  '/faq/:id',
  faq,
  valida({ params: schemaIdParam, body: schemaAggiornaFaq }),
  controller.aggiornaFaq,
);
router.delete('/faq/:id', faq, idParam, controller.eliminaFaq);

// ─────────────────────────────────────
// Documenti legali
// ─────────────────────────────────────

router.get(
  '/documenti-legali',
  gestisci,
  valida({ query: schemaFiltriDocumentiLegali }),
  controller.elencoDocumentiLegali,
);
router.post(
  '/documenti-legali',
  gestisci,
  valida({ body: schemaCreaDocumentoLegale }),
  controller.creaDocumentoLegale,
);
router.get('/documenti-legali/:id', gestisci, idParam, controller.dettaglioDocumentoLegale);
router.patch(
  '/documenti-legali/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaDocumentoLegale }),
  controller.aggiornaDocumentoLegale,
);
router.post(
  '/documenti-legali/:id/pubblicazione',
  gestisci,
  idParam,
  controller.pubblicaDocumentoLegale,
);
router.delete('/documenti-legali/:id', gestisci, idParam, controller.eliminaDocumentoLegale);

// ─────────────────────────────────────
// Eventi in zona
// ─────────────────────────────────────

router.get('/eventi', gestisci, valida({ query: schemaFiltriEventi }), controller.elencoEventi);
router.post('/eventi', gestisci, valida({ body: schemaCreaEvento }), controller.creaEvento);
router.get('/eventi/:id', gestisci, idParam, controller.dettaglioEvento);
router.patch(
  '/eventi/:id',
  gestisci,
  valida({ params: schemaIdParam, body: schemaAggiornaEvento }),
  controller.aggiornaEvento,
);
router.delete('/eventi/:id', gestisci, idParam, controller.eliminaEvento);

module.exports = router;
