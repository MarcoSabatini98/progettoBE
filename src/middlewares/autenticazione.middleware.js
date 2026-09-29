// src/middlewares/autenticazione.middleware.js
//
// Legge il token dall'header "Authorization: Bearer <token>" e completa
// req.contesto. Vanno dopo preparaContesto.
//
//   richiediAccesso     → serve un utente collegato (area personale, staff)
//   accessoFacoltativo  → pagine pubbliche che cambiano se l'utente è
//                         collegato (es. preventivo con sconto fedeltà)
//   richiediChat        → utente collegato oppure visitatore del sito con
//                         il token della chat di assistenza
//
// Il ruolo arriva dal token: un cambio di ruolo vale dal rinnovo successivo
// della sessione (al massimo JWT_ACCESS_DURATA, 15 minuti).

const authService = require('../services/auth.service');
const { nonAutenticato } = require('../utils/errori');

/** Il token dell'header, oppure null se manca o non è nel formato Bearer. */
function tokenDallaRichiesta(req) {
  const [schema, token] = (req.get('authorization') ?? '').split(' ');
  if (schema !== 'Bearer' || !token) {
    return null;
  }
  return token;
}

function impostaUtente(req, token) {
  const payload = authService.verificaAccess(token);
  req.contesto.utenteId = payload.id;
  req.contesto.ruolo = payload.ruolo;
}

function richiediAccesso(req, res, next) {
  const token = tokenDallaRichiesta(req);
  if (!token) {
    throw nonAutenticato();
  }
  impostaUtente(req, token);
  return next();
}

/** Senza token la richiesta prosegue come anonima; un token sbagliato invece è un errore. */
function accessoFacoltativo(req, res, next) {
  const token = tokenDallaRichiesta(req);
  if (token) {
    impostaUtente(req, token);
  }
  return next();
}

/** Stesso controllo del socket: vedi authService.verificaChat. */
async function richiediChat(req, res, next) {
  const token = tokenDallaRichiesta(req);
  if (!token) {
    throw nonAutenticato();
  }
  Object.assign(req.contesto, await authService.verificaChat(token));
  return next();
}

module.exports = { richiediAccesso, accessoFacoltativo, richiediChat };
