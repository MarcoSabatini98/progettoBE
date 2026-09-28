// src/repositories/registro.repository.js
//
// Registro attività (scritto dai trigger del DB): qui solo letture.

const { Op } = require('sequelize');
const { RegistroAttivita, Utente } = require('../models');

// ─────────────────────────────────────
// Letture
// ─────────────────────────────────────

/** filtri: { tabella, record_id, utente_id, azione, dal, al }; paginazione: { limit, offset } */
const trovaAttivita = async (filtri, paginazione) => {
  const where = {};
  if (filtri.tabella) {
    where.tabella = filtri.tabella;
  }
  if (filtri.record_id) {
    where.record_id = filtri.record_id;
  }
  if (filtri.utente_id) {
    where.utente_id = filtri.utente_id;
  }
  if (filtri.azione) {
    where.azione = filtri.azione;
  }
  if (filtri.dal || filtri.al) {
    where.creato_il = {};
    if (filtri.dal) {
      where.creato_il[Op.gte] = filtri.dal;
    }
    if (filtri.al) {
      where.creato_il[Op.lt] = filtri.al;
    }
  }

  return await RegistroAttivita.findAndCountAll({
    where,
    include: [
      {
        model: Utente,
        as: 'utente',
        attributes: ['id', 'nome', 'cognome', 'email', 'ruolo'],
        required: false,
        paranoid: false,
      },
    ],
    order: [['id', 'DESC']],
    limit: paginazione.limit,
    offset: paginazione.offset,
  });
};

module.exports = { trovaAttivita };
