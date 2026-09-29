// src/routes/registro.routes.js
//
// Registro delle modifiche: solo admin (contiene i dati di tutti).

const express = require('express');
const router = express.Router();
const controller = require('../controllers/registro.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediRuolo } = require('../middlewares/permessi.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const {
  schemaFiltriRegistro,
  schemaStoriaParam,
  schemaFiltriStoria,
} = require('../validators/registro.validator');
const { RUOLI } = require('../constants/ruoli.constants');

const admin = [richiediAccesso, richiediRuolo(RUOLI.ADMIN)];

router.get('/', admin, valida({ query: schemaFiltriRegistro }), controller.elenco);
router.get(
  '/:tabella/:id',
  admin,
  valida({ params: schemaStoriaParam, query: schemaFiltriStoria }),
  controller.storia,
);

module.exports = router;
