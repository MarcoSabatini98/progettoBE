// src/middlewares/errori.middleware.js
//
// Ultimi middleware dell'app. Ogni errore diventa la risposta unica:
//
//   { successo: false, errore: { codice, messaggio, dettagli } }
//
// Gli ErroreApp dei service passano così come sono; gli errori del database
// (trigger, UNIQUE, CHECK, FK) li traduce traduciErroreDb; quelli di Express
// e multer sono mappati qui. Tutto il resto è un 500 senza dettagli interni,
// registrato nel log con lo stack.

const multer = require('multer');
const logger = require('../config/logger');
const file = require('../utils/file');
const { ErroreApp, nonTrovato } = require('../utils/errori');
const { traduciErroreDb } = require('../utils/errori-db');

const ERRORI_MULTER = {
  LIMIT_FILE_SIZE: [413, 'FILE_TROPPO_GRANDE', 'Il file supera la dimensione massima consentita'],
  LIMIT_FILE_COUNT: [400, 'TROPPI_FILE', 'Hai allegato troppi file'],
  LIMIT_UNEXPECTED_FILE: [400, 'CAMPO_FILE_NON_VALIDO', 'File inviato in un campo non previsto'],
};

/** Porta qualsiasi errore a un ErroreApp, se è un errore "previsto". */
function comeErroreApp(err) {
  if (err instanceof multer.MulterError) {
    const [status, codice, messaggio] = ERRORI_MULTER[err.code] ?? [
      400,
      'CARICAMENTO_NON_VALIDO',
      'Caricamento del file non valido',
    ];
    return new ErroreApp(status, codice, messaggio);
  }
  if (err.type === 'entity.parse.failed') {
    return new ErroreApp(400, 'JSON_NON_VALIDO', 'Il corpo della richiesta non è un JSON valido');
  }
  if (err.type === 'entity.too.large') {
    return new ErroreApp(413, 'RICHIESTA_TROPPO_GRANDE', 'La richiesta è troppo grande');
  }
  // res.download di un file sparito dal disco
  if (err.code === 'ENOENT' && err.status === 404) {
    return nonTrovato('FILE_NON_TROVATO', 'Il file richiesto non è più disponibile');
  }
  // altri errori HTTP di Express pensati per il client (es. codifica non supportata)
  if (err.expose && err.status < 500) {
    return new ErroreApp(err.status, 'RICHIESTA_NON_VALIDA', 'Richiesta non valida');
  }
  return traduciErroreDb(err);
}

/** File scritti da multer per una richiesta che è stata rifiutata. */
async function eliminaCaricati(req) {
  const caricati = req.file ? [req.file] : (req.files ?? []);
  await Promise.all(caricati.map((caricato) => file.elimina(file.percorsoRelativo(caricato.path))));
}

function rottaNonTrovata(req, res, next) {
  return next(nonTrovato('RISORSA_NON_TROVATA', 'Indirizzo non trovato'));
}

/** Express lo riconosce come gestore degli errori perché ha 4 parametri. */
async function gestoreErrori(err, req, res, next) {
  // Errore a risposta già partita (es. durante un download): chiude Express.
  if (res.headersSent) {
    return next(err);
  }

  const errore = comeErroreApp(err);

  if (errore instanceof ErroreApp && errore.status < 500) {
    // Rifiutata prima di salvare: nessun record punta ai file caricati.
    await eliminaCaricati(req);
    return res.status(errore.status).json({
      successo: false,
      errore: { codice: errore.codice, messaggio: errore.message, dettagli: errore.dettagli },
    });
  }

  // ponytail: su un 500 i file caricati restano (il record potrebbe esistere già).
  logger.error(`${req.method} ${req.originalUrl}`, {
    utenteId: req.contesto?.utenteId,
    errore: err?.stack ?? String(err),
  });
  const status = errore instanceof ErroreApp ? errore.status : 500;
  return res.status(status).json({
    successo: false,
    errore: {
      codice: errore instanceof ErroreApp ? errore.codice : 'ERRORE_INTERNO',
      messaggio:
        errore instanceof ErroreApp ? errore.message : 'Errore imprevisto: riprova più tardi',
    },
  });
}

module.exports = { rottaNonTrovata, gestoreErrori };
