// src/repositories/notifiche.repository.js
//
// Notifiche in app (campanella) e destinatari per permesso.

const { Op } = require('sequelize');
const { Notifica, Utente, RuoloPermesso } = require('../models');
const { RUOLI } = require('../constants/ruoli.constants');

// ─────────────────────────────────────
// Lettura
// ─────────────────────────────────────

const trovaNotificheUtente = async (utenteId, soloNonLette, { limit, offset }) => {
  const where = { utente_id: utenteId };
  if (soloNonLette) {
    where.letta_il = null;
  }
  return await Notifica.findAndCountAll({
    where,
    order: [['creato_il', 'DESC']],
    limit,
    offset,
  });
};

const contaNonLette = async (utenteId) => {
  return await Notifica.count({ where: { utente_id: utenteId, letta_il: null } });
};

// Notifica solo se appartiene all'utente.
const trovaNotificaDiUtente = async (id, utenteId) => {
  return await Notifica.findOne({ where: { id, utente_id: utenteId } });
};

// Utenti attivi il cui ruolo ha il permesso (l'admin li ha tutti).
const trovaIdUtentiConPermesso = async (permesso) => {
  const assegnazioni = await RuoloPermesso.findAll({ where: { permesso }, attributes: ['ruolo'] });
  const ruoli = assegnazioni.map((assegnazione) => assegnazione.ruolo);
  const utenti = await Utente.findAll({
    where: { ruolo: [...ruoli, RUOLI.ADMIN], attivo: true },
    attributes: ['id'],
  });
  return utenti.map((utente) => utente.id);
};

// ─────────────────────────────────────
// Scrittura
// ─────────────────────────────────────

const creaNotifiche = async (righe) => {
  return await Notifica.bulkCreate(righe);
};

const segnaLetta = async (id) => {
  return await Notifica.update({ letta_il: new Date() }, { where: { id, letta_il: null } });
};

const segnaTutteLette = async (utenteId) => {
  const [aggiornate] = await Notifica.update(
    { letta_il: new Date() },
    { where: { utente_id: utenteId, letta_il: null } },
  );
  return aggiornate;
};

const eliminaNotifica = async (id) => {
  return await Notifica.destroy({ where: { id } });
};

// Cancellazione account: via tutte le notifiche dell'utente.
const eliminaNotificheUtente = async (utenteId, transaction = null) => {
  return await Notifica.destroy({ where: { utente_id: utenteId }, force: true, transaction });
};

// Notifiche lette prima della data indicata.
const eliminaLettePrimaDel = async (data) => {
  return await Notifica.destroy({ where: { letta_il: { [Op.lt]: data } }, force: true });
};

module.exports = {
  trovaNotificheUtente,
  contaNonLette,
  trovaNotificaDiUtente,
  trovaIdUtentiConPermesso,
  creaNotifiche,
  segnaLetta,
  segnaTutteLette,
  eliminaNotifica,
  eliminaNotificheUtente,
  eliminaLettePrimaDel,
};
