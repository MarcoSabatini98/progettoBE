// src/repositories/alloggiati.repository.js
//
// Invii delle schedine ad Alloggiati Web e ricerca nella tabella dei luoghi.

const { Op } = require('sequelize');
const { Prenotazione, InvioAlloggiati, Utente, AlloggiatiLuogo } = require('../models');

const LUOGHI_PER_RICERCA = 20;

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

/**
 * Comuni e stati il cui nome inizia con il testo cercato.
 * ponytail: esclusi i soppressi; chi è nato in un comune soppresso lo corregge
 * la reception.
 */
const cercaLuoghi = async ({ cerca, tipo }) => {
  return await AlloggiatiLuogo.findAll({
    where: {
      descrizione: { [Op.like]: `${cerca}%` },
      soppresso_il: null,
      ...(tipo && { tipo }),
    },
    attributes: ['codice', 'descrizione', 'provincia', 'tipo'],
    order: [['descrizione', 'ASC']],
    limit: LUOGHI_PER_RICERCA,
  });
};

module.exports = {
  cercaLuoghi,
  trovaPrenotazioneConInvii,
  creaInvii,
  trovaSoggiorniIniziatiDal,
};
