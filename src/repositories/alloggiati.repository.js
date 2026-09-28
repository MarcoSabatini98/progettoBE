// src/repositories/alloggiati.repository.js
//
// Invii delle schedine ad Alloggiati Web.

const { Op } = require('sequelize');
const { Prenotazione, InvioAlloggiati, Utente } = require('../models');

// Prenotazione con gli invii già fatti, dal più recente.
const trovaPrenotazioneConInvii = async (prenotazioneId) => {
  return await Prenotazione.findByPk(prenotazioneId, {
    attributes: ['id', 'codice', 'stato', 'data_arrivo', 'data_partenza'],
    include: [
      {
        model: InvioAlloggiati,
        as: 'invii_alloggiati',
        include: [{ model: Utente, as: 'mittente', attributes: ['id', 'nome', 'cognome'] }],
      },
    ],
    order: [[{ model: InvioAlloggiati, as: 'invii_alloggiati' }, 'inviato_il', 'DESC']],
  });
};

const creaInvii = async (righe) => {
  return await InvioAlloggiati.bulkCreate(righe);
};

/** Soggiorni iniziati dal giorno indicato, con gli eventuali invii riusciti. */
const trovaSoggiorniIniziatiDal = async (dal) => {
  return await Prenotazione.findAll({
    where: {
      stato: { [Op.in]: ['in_soggiorno', 'conclusa'] },
      data_arrivo: { [Op.gte]: dal },
    },
    attributes: ['id', 'codice', 'data_arrivo', 'camera_id'],
    include: [
      {
        model: InvioAlloggiati,
        as: 'invii_alloggiati',
        where: { esito: 'inviata' },
        required: false,
        attributes: ['id'],
      },
    ],
    order: [['data_arrivo', 'ASC']],
  });
};

module.exports = {
  trovaPrenotazioneConInvii,
  creaInvii,
  trovaSoggiorniIniziatiDal,
};
