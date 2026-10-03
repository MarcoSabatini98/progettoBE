// src/middlewares/upload.middleware.js
//
// File caricati dagli utenti, salvati da multer direttamente su disco nella
// cartella UPLOAD_DIR, in una sottocartella per tipo (CARTELLE_UPLOAD).
//
// Il nome sul disco è un UUID con l'estensione presa dal tipo MIME, mai il
// nome scelto dall'utente. I service salvano nel DB il percorso relativo
// (file.percorsoRelativo). Se la richiesta viene rifiutata, il gestore degli
// errori elimina i file già scritti.

const path = require('node:path');
const multer = require('multer');
const config = require('../config/env');
const { ALLEGATI_MAX } = require('../constants/chat.constants');
const { CARTELLE_UPLOAD } = require('../constants/sistema.constants');
const { uuid } = require('../utils/sicurezza');
const { ErroreApp } = require('../utils/errori');

const IMMAGINI = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const DOCUMENTI = {
  ...IMMAGINI,
  'application/pdf': '.pdf',
};

/**
 * @param {string} cartella         sottocartella di UPLOAD_DIR
 * @param {Object<string, string>} estensioni  tipi MIME ammessi → estensione
 * @param {string} formati          elenco leggibile per il messaggio d'errore
 */
function caricatore(cartella, estensioni, formati) {
  return multer({
    // con una stringa multer crea la cartella se manca
    storage: multer.diskStorage({
      destination: path.resolve(config.upload.cartella, cartella),
      filename: (req, file, callback) => callback(null, `${uuid()}${estensioni[file.mimetype]}`),
    }),
    // ponytail: il tipo lo dichiara il client; helmet (nosniff) impedisce al
    // browser di interpretarlo diversamente. Controllo dei magic byte se servirà.
    fileFilter: (req, file, callback) => {
      if (estensioni[file.mimetype]) {
        return callback(null, true);
      }
      return callback(
        new ErroreApp(415, 'FORMATO_FILE_NON_VALIDO', `Formato non supportato: usa ${formati}`),
      );
    },
    limits: { fileSize: config.upload.maxByte, files: ALLEGATI_MAX },
  });
}

/** Un'immagine nel campo "file" (galleria del sito). */
const caricaImmagine = caricatore(CARTELLE_UPLOAD.media, IMMAGINI, 'JPG, PNG o WEBP').single(
  'file',
);

/** Un documento d'identità nel campo "file". */
const caricaDocumento = caricatore(
  CARTELLE_UPLOAD.documenti,
  DOCUMENTI,
  'PDF, JPG, PNG o WEBP',
).single('file');

/** Fino a ALLEGATI_MAX allegati nel campo "allegati" (facoltativi). */
const caricaAllegatiChat = caricatore(
  CARTELLE_UPLOAD.chat,
  DOCUMENTI,
  'PDF, JPG, PNG o WEBP',
).array('allegati', ALLEGATI_MAX);

module.exports = { caricaImmagine, caricaDocumento, caricaAllegatiChat };
