// src/middlewares/limiti.middleware.js
//
// Limiti di richieste per indirizzo IP, contro abusi e tentativi a forza
// bruta. Disattivati nei test. Oltre il limite: 429 TROPPE_RICHIESTE.

const { rateLimit } = require('express-rate-limit');
const config = require('../config/env');
const { ErroreApp } = require('../utils/errori');

function limite({ minuti, richieste, messaggio, salta }) {
  return rateLimit({
    windowMs: minuti * 60 * 1000,
    limit: richieste,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => config.test || Boolean(salta?.(req)),
    handler: (req, res, next) => next(new ErroreApp(429, 'TROPPE_RICHIESTE', messaggio)),
  });
}

/**
 * Tutte le API. Largo perché lo staff di una struttura esce spesso con lo
 * stesso IP (wifi della reception). I webhook sono esclusi: Stripe e PayPal
 * ritentano da soli e non vanno mai bloccati.
 */
const limiteGenerale = limite({
  minuti: 1,
  richieste: 300,
  messaggio: 'Troppe richieste: riprova tra un minuto',
  salta: (req) => req.path.includes('/webhook/'),
});

/** Accesso, registrazione, reset password, verifica email, prenotazione per codice. */
const limiteAccesso = limite({
  minuti: 15,
  richieste: 20,
  messaggio: 'Troppi tentativi: riprova tra qualche minuto',
});

/** Nuovi visitatori della chat e messaggi dal sito: contro lo spam. */
const limiteChatPubblica = limite({
  minuti: 10,
  richieste: 30,
  messaggio: 'Troppi messaggi in poco tempo: riprova tra qualche minuto',
});

module.exports = { limiteGenerale, limiteAccesso, limiteChatPubblica };
