// src/middlewares/limiti.middleware.js
//
// Limiti di richieste per indirizzo IP, contro abusi e tentativi a forza
// bruta. Disattivati nei test. Oltre il limite: 429 TROPPE_RICHIESTE.

const { rateLimit } = require('express-rate-limit');
const config = require('../config/env');
const { ErroreApp } = require('../utils/errori');

/** chiave: di chi contare le richieste; senza, l'indirizzo IP. */
function limite({ minuti, richieste, messaggio, salta, chiave }) {
  return rateLimit({
    ...(chiave && { keyGenerator: chiave }),
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

/**
 * Tentativi sullo stesso account (accesso, reset password), da qualunque IP:
 * ferma chi prova le password da tanti indirizzi diversi. Dopo l'IP, così chi
 * supera quello non consuma i tentativi del vero titolare.
 */
const limiteAccount = limite({
  minuti: 15,
  richieste: 10,
  messaggio: 'Troppi tentativi su questo account: riprova tra qualche minuto',
  chiave: (req) =>
    `account:${String(req.body?.email ?? '')
      .trim()
      .toLowerCase()}`,
});

module.exports = { limiteGenerale, limiteAccesso, limiteAccount, limiteChatPubblica };
