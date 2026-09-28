// src/repositories/manutenzione.repository.js
//
// Segnalazioni di guasti (camere o aree comuni).

const { Op } = require('sequelize');
const { SegnalazioneManutenzione, Camera, Utente } = require('../models');
const { STATI_SEGNALAZIONE_APERTA } = require('../constants/pulizie.constants');

const persona = (as) => ({ model: Utente, as, attributes: ['id', 'nome', 'cognome'] });

const includeSegnalazione = [
  { model: Camera, as: 'camera', attributes: ['id', 'numero', 'nome', 'stato'] },
  persona('segnalatore'),
  persona('incaricato'),
];

// ─────────────────────────────────────
// Lettura
// ─────────────────────────────────────

const trovaSegnalazionePerId = async (id) => {
  return await SegnalazioneManutenzione.findByPk(id, { include: includeSegnalazione });
};

// filtri.utenteId: solo quelle fatte o assegnate a quell'utente.
const trovaSegnalazioni = async (filtri, { limit, offset }) => {
  const where = {};
  if (filtri.stato) {
    where.stato = filtri.stato;
  } else if (filtri.aperte) {
    where.stato = { [Op.in]: STATI_SEGNALAZIONE_APERTA };
  }
  if (filtri.priorita) {
    where.priorita = filtri.priorita;
  }
  if (filtri.camera_id) {
    where.camera_id = filtri.camera_id;
  }
  if (filtri.utenteId) {
    where[Op.or] = [{ segnalata_da: filtri.utenteId }, { assegnata_a: filtri.utenteId }];
  }

  return await SegnalazioneManutenzione.findAndCountAll({
    where,
    include: includeSegnalazione,
    order: [
      ['priorita', 'DESC'],
      ['creato_il', 'DESC'],
    ],
    limit,
    offset,
    distinct: true,
  });
};

// ─────────────────────────────────────
// Scrittura
// ─────────────────────────────────────

const creaSegnalazione = async (dati, transaction = null) => {
  return await SegnalazioneManutenzione.create(dati, { transaction });
};

const aggiornaSegnalazione = async (id, dati, transaction = null) => {
  return await SegnalazioneManutenzione.update(dati, { where: { id }, transaction });
};

module.exports = {
  trovaSegnalazionePerId,
  trovaSegnalazioni,
  creaSegnalazione,
  aggiornaSegnalazione,
};
