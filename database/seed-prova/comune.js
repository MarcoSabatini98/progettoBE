// Strumenti condivisi dai moduli del seed di prova: date, contesti, foto e traduzioni.

const fs = require('node:fs/promises');
const path = require('node:path');
const { Op } = require('sequelize');

const modelli = require('../../src/models');
const contenutiService = require('../../src/services/contenuti.service');
const contenutiRepo = require('../../src/repositories/contenuti.repository');
const { oggi, aggiungiGiorni } = require('../../src/utils/date');
const file = require('../../src/utils/file');
const { uuid } = require('../../src/utils/sicurezza');
const { CARTELLE_UPLOAD } = require('../../src/constants/sistema.constants');

const PASSWORD_PROVA = 'Prova1234!';

// Foto CC0 da Wikimedia Commons (autori in database/dati/foto/CREDITI.md).
const CARTELLA_FOTO = path.join(__dirname, '..', 'dati', 'foto');
// Logo, video e immagini scelti dal cliente: cartella locale, fuori da git.
const CARTELLA_MEDIA = path.join(__dirname, '..', 'dati', 'media');

const TIPI_MIME = { '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4' };

// Ordine dei testi nelle tuple tradotte: [it, en, fr, de, es].
const LINGUE = ['it', 'en', 'fr', 'de', 'es'];

// Codici ufficiali Alloggiati Web (database/dati).
const ALLOGGIATI = {
  ITALIA: '100000100',
  GERMANIA: '100000216',
  REGNO_UNITO: '100000219',
  FRANCIA: '100000215',
  SPAGNA: '100000239',
  STATI_UNITI: '100000536',
  PAESI_BASSI: '100000232',
  SVIZZERA: '100000241',
  AUSTRIA: '100000203',
  CAGLIARI: '420092009',
  MILANO: '403015146',
  ROMA: '412058091',
  TORINO: '401001272',
  NAPOLI: '415063049',
  FIRENZE: '409048017',
  BOLOGNA: '408037006',
  SASSARI: '420090064',
};

const IP_PROVA = '127.0.0.1';
const BROWSER_PROVA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0';
const META_PROVA = { ip: IP_PROVA, userAgent: BROWSER_PROVA };

function contesto(utente) {
  return { utenteId: utente.id, ruolo: utente.ruolo, ip: IP_PROVA };
}

function giorno(offset) {
  return aggiungiGiorni(oggi(), offset);
}

/** Istante di un giorno relativo a oggi, all'ora indicata (UTC). */
function momento(offset, ora = '10:00') {
  return new Date(`${giorno(offset)}T${ora}:00Z`);
}

// ─────────────────────────────────────
// Traduzioni
// ─────────────────────────────────────

/** { nome: [it, en, fr, de, es] } → { nome: testo } nella lingua scelta. */
function inLingua(campi, lingua) {
  const indice = LINGUE.indexOf(lingua);
  return Object.fromEntries(Object.entries(campi).map(([campo, testi]) => [campo, testi[indice]]));
}

const italiano = (campi) => inLingua(campi, 'it');

async function traduci(entita, entitaId, campi) {
  const perLingua = Object.fromEntries(
    LINGUE.slice(1).map((lingua) => [lingua, inLingua(campi, lingua)]),
  );
  await contenutiService.salvaTraduzioni(entita, entitaId, perLingua);
}

// ─────────────────────────────────────
// Foto e video
// ─────────────────────────────────────

/** Larghezza e altezza di un PNG o di un JPEG; per i video nessuna. */
function dimensioni(contenuto) {
  if (contenuto.readUInt32BE(0) === 0x89504e47) {
    return { larghezza: contenuto.readUInt32BE(16), altezza: contenuto.readUInt32BE(20) };
  }
  if (contenuto.readUInt16BE(0) !== 0xffd8) {
    return null; // ponytail: niente misure dei video, servirebbe leggere il box tkhd
  }
  // JPEG: si scorrono i segmenti fino al primo SOF (C0-CF, tranne C4, C8 e CC).
  let posizione = 2;
  while (posizione < contenuto.length) {
    const marcatore = contenuto[posizione + 1];
    if (marcatore >= 0xc0 && marcatore <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcatore)) {
      return {
        altezza: contenuto.readUInt16BE(posizione + 5),
        larghezza: contenuto.readUInt16BE(posizione + 7),
      };
    }
    posizione += 2 + contenuto.readUInt16BE(posizione + 2);
  }
  return null;
}

/**
 * Una foto CC0 ('nome.jpg') o un file del cliente ({ cliente, riserva }): se la
 * cartella del cliente manca (clone pulito) si usa la foto di riserva, se c'è.
 */
async function leggiFile(voce) {
  if (typeof voce === 'string') {
    return { nome: voce, contenuto: await fs.readFile(path.join(CARTELLA_FOTO, voce)) };
  }
  try {
    return {
      nome: voce.cliente,
      contenuto: await fs.readFile(path.join(CARTELLA_MEDIA, voce.cliente)),
    };
  } catch (errore) {
    if (errore.code !== 'ENOENT') {
      throw errore;
    }
    return voce.riserva ? leggiFile(voce.riserva) : null;
  }
}

/**
 * Copia i file in uploads/media come farebbe un caricamento dal gestionale.
 * @param {{ entita: string, entitaId?: number, testoAlternativo: string }} destinazione
 */
async function aggiungiFoto(destinazione, voci) {
  for (const [ordine, voce] of voci.entries()) {
    const letto = await leggiFile(voce);
    if (!letto) {
      continue;
    }
    const { nome, contenuto } = letto;
    const estensione = path.extname(nome);
    const relativo = await file.salva(`${CARTELLE_UPLOAD.media}/${uuid()}${estensione}`, contenuto);
    const media = await contenutiService.aggiungiMedia(
      { ...destinazione, ordine },
      {
        path: file.percorsoAssoluto(relativo),
        mimetype: TIPI_MIME[estensione],
        size: contenuto.length,
      },
    );
    const misure = dimensioni(contenuto);
    if (misure) {
      await contenutiRepo.aggiornaMedia(media.id, misure);
    }
  }
}

// ─────────────────────────────────────
// Storico
// ─────────────────────────────────────

/**
 * Riporta indietro date che i service e i trigger scrivono con l'ora attuale
 * (creato_il, pagato_il, arrivo effettivo...), per uno storico verosimile.
 */
async function retrodata(tabella, valori, where) {
  await modelli.sequelize.getQueryInterface().bulkUpdate(tabella, valori, where);
}

/** Adesso, al secondo: le colonne DATETIME non tengono i millisecondi. */
function segnaTempo() {
  return new Date(Math.floor(Date.now() / 1000) * 1000);
}

/**
 * Notifiche, registro attività e anagrafiche nati dopo `inizio` (per effetto
 * di service e trigger) si spostano a `quando`; le notifiche risultano lette,
 * salvo `letta: false` (quelle di oggi ancora da guardare).
 */
async function retrodataDa(inizio, quando, { letta = true } = {}) {
  const recenti = { creato_il: { [Op.gte]: inizio } };
  await retrodata('notifiche', { creato_il: quando, letta_il: letta ? quando : null }, recenti);
  await retrodata('registro_attivita', { creato_il: quando }, recenti);
  await retrodata('ospiti', { creato_il: quando }, recenti);
}

module.exports = {
  PASSWORD_PROVA,
  ALLOGGIATI,
  IP_PROVA,
  META_PROVA,
  contesto,
  giorno,
  momento,
  italiano,
  traduci,
  aggiungiFoto,
  retrodata,
  segnaTempo,
  retrodataDa,
};
