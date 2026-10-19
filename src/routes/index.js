// src/routes/index.js
//
// Tutte le rotte sotto /api (montate in app.js).

const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const utentiRoutes = require('./utenti.routes');
const permessiRoutes = require('./permessi.routes');
const ospitiRoutes = require('./ospiti.routes');
const camereRoutes = require('./camere.routes');
const tariffeRoutes = require('./tariffe.routes');
const disponibilitaRoutes = require('./disponibilita.routes');
const prenotazioniRoutes = require('./prenotazioni.routes');
const pagamentiRoutes = require('./pagamenti.routes');
const fattureRoutes = require('./fatture.routes');
const chatRoutes = require('./chat.routes');
const pulizieRoutes = require('./pulizie.routes');
const manutenzioneRoutes = require('./manutenzione.routes');
const notificheRoutes = require('./notifiche.routes');
const recensioniRoutes = require('./recensioni.routes');
const fedeltaRoutes = require('./fedelta.routes');
const impostazioniRoutes = require('./impostazioni.routes');
const contenutiRoutes = require('./contenuti.routes');
const calendariRoutes = require('./calendari.routes');
const alloggiatiRoutes = require('./alloggiati.routes');
const analyticsRoutes = require('./analytics.routes');
const registroRoutes = require('./registro.routes');

router.use('/auth', authRoutes);
router.use('/utenti', utentiRoutes);
router.use('/permessi', permessiRoutes);
router.use('/ospiti', ospitiRoutes);
router.use('/camere', camereRoutes);
router.use('/tariffe', tariffeRoutes);
router.use('/disponibilita', disponibilitaRoutes);
router.use('/prenotazioni', prenotazioniRoutes);
router.use('/pagamenti', pagamentiRoutes);
router.use('/fatture', fattureRoutes);
router.use('/chat', chatRoutes);
router.use('/pulizie', pulizieRoutes);
router.use('/manutenzione', manutenzioneRoutes);
router.use('/notifiche', notificheRoutes);
router.use('/recensioni', recensioniRoutes);
router.use('/fedelta', fedeltaRoutes);
router.use('/impostazioni', impostazioniRoutes);
router.use('/contenuti', contenutiRoutes);
router.use('/calendari', calendariRoutes);
router.use('/alloggiati', alloggiatiRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/registro', registroRoutes);

module.exports = router;
