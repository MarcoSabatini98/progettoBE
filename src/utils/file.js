// File caricati sul disco locale (UPLOAD_DIR). Nel DB si salva il percorso
// relativo: spostare la cartella non rompe i riferimenti.

const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('../config/env');
const logger = require('../config/logger');

const radice = path.resolve(config.upload.cartella);

/** Percorso assoluto di un file caricato, senza uscire dalla cartella upload. */
function percorsoAssoluto(relativo) {
  const assoluto = path.resolve(radice, relativo);
  if (!assoluto.startsWith(radice + path.sep))
    throw new Error(`Percorso non consentito: ${relativo}`);
  return assoluto;
}

/** Percorso relativo alla cartella upload (da un file salvato da multer). */
const percorsoRelativo = (assoluto) => path.relative(radice, assoluto).split(path.sep).join('/');

/** Scrive un buffer (PDF, XML generati) e restituisce il percorso relativo. */
async function salva(relativo, contenuto) {
  const assoluto = percorsoAssoluto(relativo);
  await fs.mkdir(path.dirname(assoluto), { recursive: true });
  await fs.writeFile(assoluto, contenuto);
  return relativo;
}

/** Elimina senza lanciare: un file già assente non è un errore. */
async function elimina(relativo) {
  if (!relativo) return;
  try {
    await fs.unlink(percorsoAssoluto(relativo));
  } catch (err) {
    if (err.code !== 'ENOENT')
      logger.warn('Eliminazione file non riuscita', { relativo, errore: err.message });
  }
}

module.exports = { percorsoAssoluto, percorsoRelativo, salva, elimina };
