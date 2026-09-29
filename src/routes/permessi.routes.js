// src/routes/permessi.routes.js
//
// Solo admin e non un permesso: chi potesse cambiare i permessi potrebbe
// darsene di nuovi da solo.

const express = require('express');
const router = express.Router();
const controller = require('../controllers/permessi.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediRuolo } = require('../middlewares/permessi.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const {
  schemaRuoloParam,
  schemaPermessi,
  schemaRegoleChat,
} = require('../validators/utenti.validator');
const { RUOLI } = require('../constants/ruoli.constants');

const admin = [richiediAccesso, richiediRuolo(RUOLI.ADMIN)];

router.get('/', admin, controller.matrice);
router.get('/chat', admin, controller.regoleChat);
router.put('/chat', admin, valida({ body: schemaRegoleChat }), controller.impostaRegoleChat);
router.put(
  '/:ruolo',
  admin,
  valida({ params: schemaRuoloParam, body: schemaPermessi }),
  controller.impostaPermessi,
);

module.exports = router;
