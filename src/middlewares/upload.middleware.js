// src/middlewares/upload.middleware.js
//
// File caricati dagli utenti, salvati da multer direttamente su disco nella
// cartella UPLOAD_DIR, in una sottocartella per tipo (CARTELLE_UPLOAD).
//
// Il nome sul disco è un UUID con l'estensione presa dal tipo MIME, mai il
// nome scelto dall'utente. I service salvano nel DB il percorso relativo
// (file.percorsoRelativo). Dopo il salvataggio i primi byte devono essere
// quelli del formato dichiarato. Se la richiesta viene rifiutata, il gestore
// degli errori elimina i file già scritti.

const fs = require('node:fs/promises');
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

// Firma di ogni formato: [posizione, byte in esadecimale]. Il tipo MIME lo
// dichiara il client, il contenuto no: un .jpg che non inizia così non passa.
const FIRME = {
  'image/jpeg': [[0, 'ffd8ff']],
  'image/png': [[0, '89504e470d0a1a0a']],
  'image/webp': [
    [0, '52494646'],
    [8, '57454250'],
  ],
  'application/pdf': [[0, '255044462d']],
};
const BYTE_INIZIALI = 16;

async function contenutoCoerente(caricato) {
  const aperto = await fs.open(caricato.path);
  try {
    const { buffer } = await aperto.read(Buffer.alloc(BYTE_INIZIALI), 0, BYTE_INIZIALI, 0);
    return FIRME[caricato.mimetype].every(
      ([inizio, firma]) => buffer.toString('hex', inizio, inizio + firma.length / 2) === firma,
    );
  } finally {
    await aperto.close();
  }
}

/** Dopo multer: rifiuta la richiesta se un file non è davvero del formato dichiarato. */
async function verificaContenuto(req, res, next) {
  const caricati = req.file ? [req.file] : (req.files ?? []);
  const esiti = await Promise.all(caricati.map(contenutoCoerente));
  if (esiti.includes(false)) {
    throw new ErroreApp(
      415,
      'FORMATO_FILE_NON_VALIDO',
      'Il contenuto del file non corrisponde al suo formato',
    );
  }
  return next();
}

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
const caricaImmagine = [
  caricatore(CARTELLE_UPLOAD.media, IMMAGINI, 'JPG, PNG o WEBP').single('file'),
  verificaContenuto,
];

/** Un documento d'identità nel campo "file". */
const caricaDocumento = [
  caricatore(CARTELLE_UPLOAD.documenti, DOCUMENTI, 'PDF, JPG, PNG o WEBP').single('file'),
  verificaContenuto,
];

/** Fino a ALLEGATI_MAX allegati nel campo "allegati" (facoltativi). */
const caricaAllegatiChat = [
  caricatore(CARTELLE_UPLOAD.chat, DOCUMENTI, 'PDF, JPG, PNG o WEBP').array(
    'allegati',
    ALLEGATI_MAX,
  ),
  verificaContenuto,
];

module.exports = { caricaImmagine, caricaDocumento, caricaAllegatiChat };
