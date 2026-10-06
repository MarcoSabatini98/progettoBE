// src/socket/index.js
//
// Socket.IO sullo stesso server HTTP delle API. server.js chiama
// avviaSocket dopo aver creato il server e chiudiSocket allo spegnimento.
//
//   autenticazione.js → token all'apertura della connessione
//   connessione.js    → stanze, presenza, "sta scrivendo"
//   inoltro.js        → eventi dei service consegnati ai client
//   stanze.js         → chi riceve cosa

const { Server } = require('socket.io');
const config = require('../config/env');
const logger = require('../config/logger');
const { autenticaSocket } = require('./autenticazione');
const { alCollegamento } = require('./connessione');
const { collegaEventi, scollegaEventi } = require('./inoltro');

// Dal client arrivano solo eventi leggeri: messaggi e file passano dal REST.
const DIMENSIONE_MASSIMA_BYTE = 100_000;

let io = null;

function avviaSocket(server) {
  io = new Server(server, {
    cors: { origin: config.originiFrontend, credentials: true },
    maxHttpBufferSize: DIMENSIONE_MASSIMA_BYTE,
  });
  io.use(autenticaSocket);
  io.on('connection', alCollegamento);
  collegaEventi(io);
  logger.info('Socket avviato');
  return io;
}

/** Chiude i client collegati e il server HTTP sottostante. */
async function chiudiSocket() {
  if (!io) {
    return;
  }
  scollegaEventi();
  await new Promise((risolvi) => io.close(() => risolvi()));
  io = null;
}

module.exports = { avviaSocket, chiudiSocket };
