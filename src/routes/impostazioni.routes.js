// src/routes/impostazioni.routes.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/impostazioni.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { richiediPermesso } = require('../middlewares/permessi.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaAggiornaImpostazioni } = require('../validators/impostazioni.validator');
const { PERMESSI } = require('../constants/ruoli.constants');

const gestisci = [richiediAccesso, richiediPermesso(PERMESSI.IMPOSTAZIONI_GESTISCI)];

router.get('/pubbliche', controller.pubbliche);
router.get('/', gestisci, controller.elenco);
router.patch('/', gestisci, valida({ body: schemaAggiornaImpostazioni }), controller.aggiorna);

module.exports = router;
