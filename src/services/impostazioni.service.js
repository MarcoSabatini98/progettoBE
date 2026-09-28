// Impostazioni della struttura (chiave → valore tipizzato).
// Lette spesso (prezzi, fatture, email) e cambiate di rado: stanno in memoria
// e la cache si svuota a ogni modifica. Single-tenant, un solo processo.
// ponytail: cache nel processo; con più istanze su Render servirebbe un TTL o Redis.

const { Impostazione, sequelize } = require('../models');
const { richiestaNonValida } = require('../utils/errori');

let cache = null;

function converti({ valore, tipo }) {
  if (tipo === 'numero') return valore === '' ? null : Number(valore);
  if (tipo === 'booleano') return valore === '1' || valore === 'true';
  if (tipo === 'json') return valore === '' ? null : JSON.parse(valore);
  return valore;
}

async function carica() {
  if (!cache) {
    const righe = await Impostazione.findAll({ raw: true });
    cache = new Map(righe.map((r) => [r.chiave, { ...r, valore: converti(r) }]));
  }
  return cache;
}

/** Valore tipizzato di una chiave, o il predefinito se manca/è vuota. */
async function leggi(chiave, predefinito = null) {
  const riga = (await carica()).get(chiave);
  return riga && riga.valore !== null && riga.valore !== '' ? riga.valore : predefinito;
}

/** Più chiavi in un colpo solo: { chiave: valore }. */
async function leggiMolte(chiavi) {
  const mappa = await carica();
  return Object.fromEntries(chiavi.map((c) => [c, mappa.get(c)?.valore ?? null]));
}

/** Tutte le impostazioni (area admin) o solo quelle pubbliche (sito). */
async function elenco({ soloPubbliche = false } = {}) {
  const righe = [...(await carica()).values()];
  if (soloPubbliche) {
    return Object.fromEntries(righe.filter((r) => r.pubblica).map((r) => [r.chiave, r.valore]));
  }
  return righe;
}

function serializza(valore, tipo, chiave) {
  const errore = () =>
    richiestaNonValida('IMPOSTAZIONE_NON_VALIDA', `Valore non valido per "${chiave}" (${tipo})`);
  if (valore === null || valore === '') return '';
  if (tipo === 'numero') {
    if (!Number.isFinite(Number(valore))) throw errore();
    return String(Number(valore));
  }
  if (tipo === 'booleano') {
    if (typeof valore !== 'boolean' && !['0', '1', 'true', 'false'].includes(String(valore)))
      throw errore();
    return valore === true || valore === '1' || valore === 'true' ? '1' : '0';
  }
  if (tipo === 'json') return typeof valore === 'string' ? valore : JSON.stringify(valore);
  return String(valore);
}

/**
 * Aggiorna più impostazioni esistenti: { chiave: valore }.
 * Le chiavi sconosciute sono un errore (niente impostazioni inventate dal client).
 */
async function aggiorna(valori, contesto) {
  const mappa = await carica();
  const sconosciute = Object.keys(valori).filter((k) => !mappa.has(k));
  if (sconosciute.length) {
    throw richiestaNonValida(
      'IMPOSTAZIONE_SCONOSCIUTA',
      `Impostazioni inesistenti: ${sconosciute.join(', ')}`,
    );
  }
  await sequelize.transaction(async (transaction) => {
    for (const [chiave, valore] of Object.entries(valori)) {
      const { tipo } = mappa.get(chiave);
      await Impostazione.update(
        { valore: serializza(valore, tipo, chiave), aggiornato_da: contesto?.utenteId ?? null },
        { where: { chiave }, transaction },
      );
    }
  });
  svuotaCache();
  return elenco();
}

function svuotaCache() {
  cache = null;
}

module.exports = { leggi, leggiMolte, elenco, aggiorna, svuotaCache };
