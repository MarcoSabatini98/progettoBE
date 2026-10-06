// src/routes/auth.routes.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/auth.controller');
const { richiediAccesso } = require('../middlewares/autenticazione.middleware');
const { limiteAccesso, limiteAccount } = require('../middlewares/limiti.middleware');
const { valida } = require('../middlewares/validazione.middleware');
const {
  schemaRegistra,
  schemaAccedi,
  schemaVerificaEmail,
  schemaRichiediReset,
  schemaReimpostaPassword,
  schemaCambiaPassword,
  schemaEliminaAccount,
  schemaDisiscrizione,
} = require('../validators/auth.validator');

// ─────────────────────────────────────
// Accesso e sessione
// ─────────────────────────────────────

router.post('/registrazione', limiteAccesso, valida({ body: schemaRegistra }), controller.registra);
router.post(
  '/accesso',
  limiteAccesso,
  limiteAccount,
  valida({ body: schemaAccedi }),
  controller.accedi,
);

// Il refresh token viaggia nel cookie httpOnly, non nell'header.
router.post('/rinnovo', controller.rinnova);
router.post('/uscita', controller.esci);
router.post('/uscita-ovunque', richiediAccesso, controller.esciOvunque);

// ─────────────────────────────────────
// Verifica email e password
// ─────────────────────────────────────

router.post(
  '/verifica-email/codice',
  richiediAccesso,
  limiteAccesso,
  controller.reinviaCodiceVerifica,
);
router.post(
  '/verifica-email',
  richiediAccesso,
  limiteAccesso,
  valida({ body: schemaVerificaEmail }),
  controller.verificaEmail,
);

router.post(
  '/password/reset',
  limiteAccesso,
  limiteAccount,
  valida({ body: schemaRichiediReset }),
  controller.richiediResetPassword,
);
router.post(
  '/password/nuova',
  limiteAccesso,
  valida({ body: schemaReimpostaPassword }),
  controller.reimpostaPassword,
);
router.put(
  '/password',
  richiediAccesso,
  limiteAccesso,
  valida({ body: schemaCambiaPassword }),
  controller.cambiaPassword,
);

// ─────────────────────────────────────
// Account
// ─────────────────────────────────────

router.delete(
  '/account',
  richiediAccesso,
  limiteAccesso,
  valida({ body: schemaEliminaAccount }),
  controller.eliminaAccount,
);

// Link "non voglio più offerte" delle email: vale senza accesso.
router.post(
  '/disiscrizione',
  limiteAccesso,
  valida({ body: schemaDisiscrizione }),
  controller.disiscrivi,
);

module.exports = router;
