// server.js
//
// Avvio: verifica la connessione al database, pianifica i job, poi apre la
// porta (API e socket). Allo spegnimento (deploy su Render, Ctrl+C) ferma i
// job, chiude i socket e le richieste in corso, poi il database.

const http = require('node:http');
const config = require('./src/config/env');
const logger = require('./src/config/logger');
const { sequelize } = require('./src/models');
const app = require('./app');
const { avviaSocket, chiudiSocket } = require('./src/socket');
const { avviaJob, fermaJob } = require('./src/jobs');

// Oltre questo tempo lo spegnimento viene forzato.
const ATTESA_MASSIMA_MS = 10_000;

// Contro chi apre connessioni e le tiene appese mandando i dati a goccia
// (slowloris): intestazioni entro 20 secondi, richiesta intera entro 3 minuti
// (bastano per un video di 50 MB anche con ~2,5 Mbit/s in upload).
const server = http.createServer({ headersTimeout: 20_000, requestTimeout: 180_000 }, app);
avviaSocket(server);
let inChiusura = false;

async function avvia() {
  try {
    await sequelize.authenticate();
    logger.info('Connessione al database riuscita');
    await avviaJob();
  } catch (errore) {
    logger.error('Connessione al database non riuscita', { errore: errore.message });
    process.exit(1);
  }

  server.listen(config.porta, () => {
    logger.info(`Server avviato su ${config.urlApp} (porta ${config.porta})`);
  });
}

async function chiudi(segnale) {
  if (inChiusura) {
    return;
  }
  inChiusura = true;
  logger.warn(`${segnale} ricevuto: spegnimento in corso`);

  const forzata = setTimeout(() => {
    logger.error('Spegnimento troppo lento: chiusura forzata');
    process.exit(1);
  }, ATTESA_MASSIMA_MS);
  forzata.unref();

  try {
    // io.close chiude anche il server HTTP e aspetta le richieste in corso:
    // il server.close qui sotto trova ERR_SERVER_NOT_RUNNING e lo ignora.
    await fermaJob();
    await chiudiSocket();
    await new Promise((risolvi, rifiuta) => {
      server.close((errore) =>
        errore && errore.code !== 'ERR_SERVER_NOT_RUNNING' ? rifiuta(errore) : risolvi(),
      );
    });
    await sequelize.close();
    logger.info('Spegnimento completato');
    process.exit(0);
  } catch (errore) {
    logger.error('Errore durante lo spegnimento', { errore: errore.stack });
    process.exit(1);
  }
}

process.on('SIGTERM', () => chiudi('SIGTERM'));
process.on('SIGINT', () => chiudi('SIGINT'));
process.on('unhandledRejection', (motivo) => {
  logger.error('Promise rifiutata e non gestita', { errore: motivo?.stack ?? String(motivo) });
});
process.on('uncaughtException', (errore) => {
  logger.error('Eccezione non gestita', { errore: errore.stack });
  chiudi('uncaughtException');
});

avvia();
