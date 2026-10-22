// File caricati sul disco locale (UPLOAD_DIR). Nel DB si salva il percorso
// relativo: spostare la cartella non rompe i riferimenti.
//
// Con CLOUDINARY_URL impostato (deploy su un host con disco temporaneo) ogni
// file finisce anche su Cloudinary, che resta l'archivio vero: il disco fa da
// cache. Le immagini del sito si servono direttamente da Cloudinary,
// documenti, allegati e fatture restano privati e si riscaricano quando servono.

const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('../config/env');
const logger = require('../config/logger');
const { CARTELLE_UPLOAD } = require('../constants/sistema.constants');

const radice = path.resolve(config.upload.cartella);
// L'SDK legge CLOUDINARY_URL da solo: caricato solo se serve.
const cloudinary = config.upload.cloudinary ? require('cloudinary').v2 : null;
const VIDEO = new Set(['.mp4', '.webm']);

/** Percorso assoluto di un file caricato, senza uscire dalla cartella upload. */
function percorsoAssoluto(relativo) {
  const assoluto = path.resolve(radice, relativo);
  if (!assoluto.startsWith(radice + path.sep))
    throw new Error(`Percorso non consentito: ${relativo}`);
  return assoluto;
}

/** Percorso relativo alla cartella upload (da un file salvato da multer). */
const percorsoRelativo = (assoluto) => path.relative(radice, assoluto).split(path.sep).join('/');

/**
 * Dove sta il file su Cloudinary. Immagini e video del sito: pubblici, con il
 * tipo giusto (i video hanno limiti più alti). Il resto: "raw" ad accesso firmato.
 */
function posizioneCloud(relativo) {
  const estensione = path.extname(relativo).toLowerCase();
  if (relativo.startsWith(`${CARTELLE_UPLOAD.media}/`) && estensione) {
    return {
      public_id: relativo.slice(0, -estensione.length),
      resource_type: VIDEO.has(estensione) ? 'video' : 'image',
      type: 'upload',
    };
  }
  return { public_id: relativo, resource_type: 'raw', type: 'authenticated' };
}

/** Copia su Cloudinary un file già sul disco. Senza Cloudinary non fa nulla. */
async function carica(relativo) {
  if (!cloudinary) return;
  await cloudinary.uploader.upload(percorsoAssoluto(relativo), {
    ...posizioneCloud(relativo),
    overwrite: true,
  });
}

/** Scrive un buffer (PDF, XML generati) e restituisce il percorso relativo. */
async function salva(relativo, contenuto) {
  const assoluto = percorsoAssoluto(relativo);
  await fs.mkdir(path.dirname(assoluto), { recursive: true });
  await fs.writeFile(assoluto, contenuto);
  await carica(relativo);
  return relativo;
}

/**
 * Percorso assoluto di un file da leggere: se sul disco non c'è (riavvio
 * dell'host) lo riscarica da Cloudinary. Se manca anche lì, res.download
 * risponderà "file non più disponibile".
 */
async function locale(relativo) {
  const assoluto = percorsoAssoluto(relativo);
  if (!cloudinary) return assoluto;
  try {
    await fs.access(assoluto);
    return assoluto;
  } catch {
    // non in cache: si scarica
  }
  // Download firmato via API: la consegna diretta dei PDF è bloccata sugli account free.
  // ponytail: l'API ha un limite orario di richieste; basta per una demo, non per un hotel vero.
  const { public_id, ...posizione } = posizioneCloud(relativo);
  const risposta = await fetch(cloudinary.utils.private_download_url(public_id, '', posizione));
  if (!risposta.ok) {
    logger.warn('File non trovato su Cloudinary', { relativo, stato: risposta.status });
    return assoluto;
  }
  await fs.mkdir(path.dirname(assoluto), { recursive: true });
  await fs.writeFile(assoluto, Buffer.from(await risposta.arrayBuffer()));
  return assoluto;
}

/** Indirizzo pubblico di un'immagine o video del sito (solo con Cloudinary). */
function urlPubblico(relativo) {
  percorsoAssoluto(relativo); // niente percorsi che escono dalla cartella
  const { public_id, ...posizione } = posizioneCloud(relativo);
  const format = path.extname(relativo).slice(1).toLowerCase();
  return cloudinary.url(public_id, { ...posizione, format, secure: true });
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
  if (!cloudinary) return;
  try {
    const { public_id, ...posizione } = posizioneCloud(relativo);
    await cloudinary.uploader.destroy(public_id, { ...posizione, invalidate: true });
  } catch (err) {
    logger.warn('Eliminazione da Cloudinary non riuscita', { relativo, errore: err.message });
  }
}

module.exports = {
  percorsoAssoluto,
  percorsoRelativo,
  posizioneCloud,
  carica,
  salva,
  locale,
  urlPubblico,
  elimina,
};
