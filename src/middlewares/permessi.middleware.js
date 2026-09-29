// src/middlewares/permessi.middleware.js
//
// Autorizzazione. Vanno dopo richiediAccesso (che imposta il ruolo).
//
//   richiediPermesso(PERMESSI.FATTURE_GESTISCI)   → funzioni dello staff:
//       i permessi di ogni ruolo li decide l'admin (tabella ruoli_permessi)
//   richiediRuolo(RUOLI.CLIENTE)                  → aree legate a un ruolo
//       preciso, che non ha senso rendere configurabili

const permessiService = require('../services/permessi.service');
const { nonAutenticato, vietato } = require('../utils/errori');

function richiediPermesso(codice) {
  return async (req, res, next) => {
    const { ruolo } = req.contesto;
    if (!ruolo) {
      throw nonAutenticato();
    }
    if (!(await permessiService.ha(ruolo, codice))) {
      throw vietato();
    }
    return next();
  };
}

function richiediRuolo(...ruoli) {
  return (req, res, next) => {
    const { ruolo } = req.contesto;
    if (!ruolo) {
      throw nonAutenticato();
    }
    if (!ruoli.includes(ruolo)) {
      throw vietato();
    }
    return next();
  };
}

module.exports = { richiediPermesso, richiediRuolo };
