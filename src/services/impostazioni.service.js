// src/services/impostazioni.service.js
//
// Impostazioni della struttura (chiave → valore tipizzato).
// Si leggono spesso (prezzi, fatture, email) e cambiano di rado: restano in
// memoria e la cache si svuota a ogni modifica.
// ponytail: cache nel processo; con più istanze servirebbe un TTL o Redis.

const { sequelize } = require('../models');
const impostazioniRepo = require('../repositories/impostazioni.repository');
const contenutiRepo = require('../repositories/contenuti.repository');
const { FORMATI_IMPOSTAZIONI } = require('../constants/sistema.constants');
const { richiestaNonValida } = require('../utils/errori');

let cache = null;

// Il DB salva tutto come testo: qui torna numero, booleano o JSON.
function converti(valore, tipo) {
  if (tipo === 'numero') {
    return valore === '' ? null : Number(valore);
  }
  if (tipo === 'booleano') {
    return valore === '1' || valore === 'true';
  }
  if (tipo === 'json') {
    return valore === '' ? null : JSON.parse(valore);
  }
  return valore;
}

// Il contrario di converti(): dal valore del client al testo da salvare.
function serializza(chiave, valore, tipo) {
  const errore = richiestaNonValida(
    'IMPOSTAZIONE_NON_VALIDA',
    `Valore non valido per "${chiave}" (${tipo})`,
  );

  if (valore === null || valore === '') {
    return '';
  }
  if (tipo === 'numero') {
    if (!Number.isFinite(Number(valore))) {
      throw errore;
    }
    return String(Number(valore));
  }
  if (tipo === 'booleano') {
    if (![true, false, '0', '1', 'true', 'false'].includes(valore)) {
      throw errore;
    }
    return valore === true || valore === '1' || valore === 'true' ? '1' : '0';
  }
  if (tipo === 'json') {
    return typeof valore === 'string' ? valore : JSON.stringify(valore);
  }
  const testo = String(valore);
  if (FORMATI_IMPOSTAZIONI[chiave] && !FORMATI_IMPOSTAZIONI[chiave].test(testo)) {
    throw errore;
  }
  return testo;
}

async function carica() {
  if (!cache) {
    const righe = await impostazioniRepo.trovaTutte();
    cache = new Map();
    for (const riga of righe) {
      cache.set(riga.chiave, { ...riga, valore: converti(riga.valore, riga.tipo) });
    }
  }
  return cache;
}

function svuotaCache() {
  cache = null;
}

/** Valore tipizzato di una chiave, o il predefinito se manca o è vuota. */
async function leggi(chiave, predefinito = null) {
  const riga = (await carica()).get(chiave);
  if (!riga || riga.valore === null || riga.valore === '') {
    return predefinito;
  }
  return riga.valore;
}

/** Più chiavi insieme: { chiave: valore }. */
async function leggiMolte(chiavi) {
  const risultato = {};
  for (const chiave of chiavi) {
    risultato[chiave] = await leggi(chiave);
  }
  return risultato;
}

/** Area admin: tutte le righe con tipo e descrizione. */
async function elenco() {
  return [...(await carica()).values()];
}

/**
 * Sito pubblico: solo le impostazioni marcate come pubbliche, { chiave: valore },
 * più aspetto_logo: il percorso della prima immagine del logo, o null.
 */
async function pubbliche() {
  const [logo] = await contenutiRepo.trovaMedia('logo');
  const risultato = { aspetto_logo: logo?.percorso ?? null };
  for (const riga of await elenco()) {
    if (riga.pubblica) {
      risultato[riga.chiave] = riga.valore;
    }
  }
  return risultato;
}

/**
 * Aggiorna più impostazioni: { chiave: valore }.
 * Le chiavi sconosciute sono un errore: il client non può inventarne.
 */
async function aggiorna(valori, contesto) {
  const impostazioni = await carica();

  const sconosciute = Object.keys(valori).filter((chiave) => !impostazioni.has(chiave));
  if (sconosciute.length > 0) {
    throw richiestaNonValida(
      'IMPOSTAZIONE_SCONOSCIUTA',
      `Impostazioni inesistenti: ${sconosciute.join(', ')}`,
    );
  }

  await sequelize.transaction(async (transaction) => {
    for (const [chiave, valore] of Object.entries(valori)) {
      const { tipo } = impostazioni.get(chiave);
      const testo = serializza(chiave, valore, tipo);
      await impostazioniRepo.aggiornaValore(chiave, testo, contesto?.utenteId, transaction);
    }
  });

  svuotaCache();
  return elenco();
}

module.exports = {
  leggi,
  leggiMolte,
  elenco,
  pubbliche,
  aggiorna,
  svuotaCache,
};
