// src/routes/disponibilita.routes.js
//
// Ricerca delle camere libere dal sito e blocco temporaneo della camera
// mentre l'ospite completa la prenotazione. Il cliente collegato vede i
// prezzi con lo sconto fedeltà. Il calendario del sito legge le notti occupate.

const express = require('express');
const router = express.Router();
const controller = require('../controllers/disponibilita.controller');
const { accessoFacoltativo } = require('../middlewares/autenticazione.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const {
  schemaCercaDisponibilita,
  schemaBloccaCamera,
  schemaOccupazione,
  schemaSessioneParam,
} = require('../validators/prenotazioni.validator');

router.get('/', accessoFacoltativo, valida({ query: schemaCercaDisponibilita }), controller.cerca);
router.get('/occupazione', valida({ query: schemaOccupazione }), controller.occupazione);
router.post(
  '/blocchi',
  accessoFacoltativo,
  valida({ body: schemaBloccaCamera }),
  controller.blocca,
);
router.delete('/blocchi/:sessione', valida({ params: schemaSessioneParam }), controller.rilascia);

module.exports = router;
