// src/routes/notifiche.routes.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/notifiche.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const { schemaIdParam } = require('../validators/comune.validator');
const { schemaFiltriNotifiche } = require('../validators/notifiche.validator');

const idParam = valida({ params: schemaIdParam });

router.get('/', richiediAccesso, valida({ query: schemaFiltriNotifiche }), controller.elenco);
router.get('/non-lette', richiediAccesso, controller.nonLette);
router.post('/lette', richiediAccesso, controller.segnaTutteLette);
router.post('/:id/letta', richiediAccesso, idParam, controller.segnaLetta);
router.delete('/:id', richiediAccesso, idParam, controller.elimina);

module.exports = router;
