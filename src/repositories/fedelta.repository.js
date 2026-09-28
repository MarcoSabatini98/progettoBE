// src/repositories/fedelta.repository.js
//
// Programma fedeltà: livelli (bronze → diamond), movimenti di punti e livello
// attuale dei clienti (VIEW v_fedelta_utenti).

const { Op } = require('sequelize');
const {
  LivelloFedelta,
  MovimentoPunti,
  FedeltaUtente,
  Utente,
  Prenotazione,
} = require('../models');
const { RUOLI } = require('../constants/ruoli.constants');

// ─────────────────────────────────────
// Livelli
// ─────────────────────────────────────

const trovaLivelli = async () => {
  return await LivelloFedelta.findAll({ order: [['punti_minimi', 'ASC']] });
};

const trovaLivelloPerId = async (id) => {
  return await LivelloFedelta.findByPk(id);
};

const trovaLivelloPerCodice = async (codice) => {
  return await LivelloFedelta.findOne({ where: { codice } });
};

const creaLivello = async (dati) => {
  return await LivelloFedelta.create(dati);
};

const aggiornaLivello = async (id, dati) => {
  const livello = await LivelloFedelta.findByPk(id);
  if (!livello) {
    return null;
  }
  return await livello.update(dati);
};

const eliminaLivello = async (id) => {
  return await LivelloFedelta.destroy({ where: { id } });
};

// ─────────────────────────────────────
// Situazione del cliente (VIEW)
// ─────────────────────────────────────

const trovaFedeltaUtente = async (utenteId) => {
  return await FedeltaUtente.findByPk(utenteId, {
    include: [{ model: LivelloFedelta, as: 'dettagli_livello' }],
  });
};

// Classifica dei clienti dai più fedeli, con filtro opzionale sul livello.
const trovaClassifica = async ({ livello, limit, offset }) => {
  const whereFedelta = livello ? { livello } : undefined;
  return await Utente.findAndCountAll({
    attributes: ['id', 'nome', 'cognome', 'email', 'punti_fedelta'],
    where: { ruolo: RUOLI.CLIENTE },
    include: [
      {
        model: FedeltaUtente,
        as: 'fedelta',
        where: whereFedelta,
        required: true,
        attributes: ['livello', 'livello_nome', 'sconto_percentuale', 'punti_prossimo_livello'],
      },
    ],
    order: [
      ['punti_fedelta', 'DESC'],
      ['cognome', 'ASC'],
    ],
    limit,
    offset,
  });
};

// Quanti clienti ci sono per livello (cruscotto admin).
const contaClientiPerLivello = async () => {
  return await FedeltaUtente.count({ group: ['livello'] });
};

// ─────────────────────────────────────
// Movimenti di punti
// ─────────────────────────────────────

const trovaMovimenti = async (utenteId, { limit, offset } = {}) => {
  return await MovimentoPunti.findAndCountAll({
    where: { utente_id: utenteId },
    include: [
      { model: Prenotazione, as: 'prenotazione', attributes: ['id', 'codice'] },
      { model: Utente, as: 'autore', attributes: ['id', 'nome', 'cognome'] },
    ],
    order: [['creato_il', 'DESC']],
    limit,
    offset,
  });
};

// Punti guadagnati e spesi in un anno solare.
const sommaPuntiNelPeriodo = async (utenteId, dal, al) => {
  const where = {
    utente_id: utenteId,
    creato_il: { [Op.gte]: dal, [Op.lt]: al },
  };
  const [guadagnati, tolti] = await Promise.all([
    MovimentoPunti.sum('punti', { where: { ...where, punti: { [Op.gt]: 0 } } }),
    MovimentoPunti.sum('punti', { where: { ...where, punti: { [Op.lt]: 0 } } }),
  ]);
  return { guadagnati: guadagnati ?? 0, tolti: Math.abs(tolti ?? 0) };
};

// Il saldo su utenti.punti_fedelta lo aggiorna il trigger del database.
const creaMovimento = async (dati, transaction = null) => {
  return await MovimentoPunti.create(dati, { transaction });
};

module.exports = {
  trovaLivelli,
  trovaLivelloPerId,
  trovaLivelloPerCodice,
  creaLivello,
  aggiornaLivello,
  eliminaLivello,
  trovaFedeltaUtente,
  trovaClassifica,
  contaClientiPerLivello,
  trovaMovimenti,
  sommaPuntiNelPeriodo,
  creaMovimento,
};
