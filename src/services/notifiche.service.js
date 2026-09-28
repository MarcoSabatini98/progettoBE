// Notifiche in app (campanella). Il socket si iscrive a `eventi` e le
// spinge in tempo reale; chi è offline le trova al prossimo accesso.

const { EventEmitter } = require('node:events');
const { Op } = require('sequelize');
const { Notifica, Utente, RuoloPermesso } = require('../models');
const { oppure404 } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { aggiungiGiorni, oggi } = require('../utils/date');
const logger = require('../config/logger');

/** 'nuova' → (notifica) per ogni notifica creata. */
const eventi = new EventEmitter();

/**
 * Crea la stessa notifica per più utenti. Non lancia: una notifica persa non
 * deve far fallire l'operazione che l'ha generata.
 * @param {number[]} utentiIds
 * @param {{ tipo: string, titolo: string, testo?: string, link?: string, priorita?: string }} dati
 */
async function invia(utentiIds, { tipo, titolo, testo = null, link = null, priorita = 'info' }) {
  const ids = [...new Set(utentiIds.filter(Boolean))];
  if (!ids.length) return [];
  try {
    const create = await Notifica.bulkCreate(
      ids.map((utente_id) => ({ utente_id, tipo, priorita, titolo, testo, link })),
    );
    for (const n of create) eventi.emit('nuova', n.toJSON());
    return create;
  } catch (err) {
    logger.error('Creazione notifica fallita', { tipo, titolo, errore: err.message });
    return [];
  }
}

/** Utenti attivi il cui ruolo ha il permesso (l'admin li ha tutti). */
async function utentiConPermesso(permesso) {
  const ruoli = (await RuoloPermesso.findAll({ where: { permesso }, raw: true })).map(
    (r) => r.ruolo,
  );
  const utenti = await Utente.findAll({
    where: { ruolo: [...ruoli, 'admin'], attivo: true },
    attributes: ['id'],
    raw: true,
  });
  return utenti.map((u) => u.id);
}

/** Notifica a tutto lo staff che ha il permesso, escluso chi ha generato l'evento. */
async function aChiPuo(permesso, dati, esclusoId) {
  const ids = (await utentiConPermesso(permesso)).filter((id) => id !== esclusoId);
  return invia(ids, dati);
}

async function elenco(utenteId, query = {}) {
  const p = pagina(query);
  const where = { utente_id: utenteId };
  if (query.non_lette === 'true' || query.non_lette === true) where.letta_il = null;
  const righe = await Notifica.findAndCountAll({
    where,
    order: [['creato_il', 'DESC']],
    limit: p.limit,
    offset: p.offset,
  });
  return { ...risultato(righe, p), non_lette: await nonLette(utenteId) };
}

function nonLette(utenteId) {
  return Notifica.count({ where: { utente_id: utenteId, letta_il: null } });
}

const mia = async (id, utenteId) =>
  oppure404(
    await Notifica.findOne({ where: { id, utente_id: utenteId } }),
    'NOTIFICA_NON_TROVATA',
    'Notifica non trovata',
  );

async function segnaLetta(id, utenteId) {
  const n = await mia(id, utenteId);
  return n.letta_il ? n : n.update({ letta_il: new Date() });
}

async function segnaTutteLette(utenteId) {
  const [aggiornate] = await Notifica.update(
    { letta_il: new Date() },
    { where: { utente_id: utenteId, letta_il: null } },
  );
  return { aggiornate };
}

async function elimina(id, utenteId) {
  await (await mia(id, utenteId)).destroy();
}

/** Job: via le notifiche lette più vecchie di `giorni`. */
function eliminaVecchie(giorni = 90) {
  return Notifica.destroy({
    where: { letta_il: { [Op.lt]: aggiungiGiorni(oggi(), -giorni) } },
    force: true,
  });
}

module.exports = {
  eventi,
  invia,
  aChiPuo,
  utentiConPermesso,
  elenco,
  nonLette,
  segnaLetta,
  segnaTutteLette,
  elimina,
  eliminaVecchie,
};
