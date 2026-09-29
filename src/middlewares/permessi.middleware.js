// src/middlewares/permessi.middleware.js
//
// Autorizzazione. Vanno dopo richiediAccesso (che imposta il ruolo).
//
//   richiediPermesso(PERMESSI.FATTURE_GESTISCI)   → funzioni dello staff:
//       i permessi di ogni ruolo li decide l'admin (tabella ruoli_permessi)
//   richiediRuolo(RUOLI.CLIENTE)                  → aree legate a un ruolo
//       preciso, che non ha senso rendere configurabili
//   richiediPermessoSeStaff(PERMESSI.X)           → rotte pubbliche che lo
//       staff usa con poteri in più (prenotazione al telefono): anonimi e
//       clienti passano, lo staff deve avere il permesso. Va dopo
//       accessoFacoltativo.

const permessiService = require('../services/permessi.service');
const { RUOLI } = require('../constants/ruoli.constants');
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

// I service trattano da staff qualunque ruolo diverso da cliente: senza
// questo controllo un housekeeper potrebbe prenotare come la reception.
function richiediPermessoSeStaff(codice) {
  return async (req, res, next) => {
    const { ruolo } = req.contesto;
    const staff = ruolo && ruolo !== RUOLI.CLIENTE;
    if (staff && !(await permessiService.ha(ruolo, codice))) {
      throw vietato();
    }
    return next();
  };
}

module.exports = { richiediPermesso, richiediRuolo, richiediPermessoSeStaff };
