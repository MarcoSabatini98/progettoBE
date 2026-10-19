// src/socket/autenticazione.js
//
// Controllo all'apertura della connessione, prima che il socket sia
// considerato collegato. Il client manda il token così:
//   io(url, { auth: { token } })
// Vale sia l'access token dell'utente sia il token chat del visitatore
// (stessa regola della rotta REST richiediChat).
//
// Se il token manca o non vale, il client riceve 'connect_error' con
// errore.data = { codice, messaggio }, come nelle risposte REST.

const jwt = require('jsonwebtoken');
const authService = require('../services/auth.service');
const { nonAutenticato } = require('../utils/errori');
const { descriviErrore } = require('./errori');

function rifiuta(errore) {
  const dati = descriviErrore(errore, 'autenticazione');
  const rifiuto = new Error(dati.messaggio);
  rifiuto.data = dati;
  return rifiuto;
}

async function autenticaSocket(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(rifiuta(nonAutenticato()));
  }

  try {
    socket.data.chi = await authService.verificaChat(token);
    // Alla scadenza del token il socket viene chiuso (vedi connessione.js):
    // il client rinnova il token e si ricollega.
    socket.data.scadenza = jwt.decode(token).exp * 1000;
    return next();
  } catch (errore) {
    return next(rifiuta(errore));
  }
}

module.exports = { autenticaSocket };
