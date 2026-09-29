// src/socket/errori.js
//
// Stesso formato di errore delle risposte REST: { codice, messaggio }.
// Gli errori imprevisti non mostrano dettagli al client e finiscono nel log.

const logger = require('../config/logger');
const { ErroreApp } = require('../utils/errori');

function descriviErrore(errore, evento) {
  if (errore instanceof ErroreApp) {
    return { codice: errore.codice, messaggio: errore.message };
  }
  logger.error(`Socket: ${evento}`, { errore: errore?.stack ?? String(errore) });
  return { codice: 'ERRORE_INTERNO', messaggio: 'Errore imprevisto: riprova più tardi' };
}

module.exports = { descriviErrore };
