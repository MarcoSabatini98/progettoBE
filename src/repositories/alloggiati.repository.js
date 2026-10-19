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
 * Comuni e stati il cui nome inizia con il testo cercato, in vigore oggi o alla
 * data indicata: chi è nato in un comune poi soppresso (fusioni, cambi di
 * provincia) va registrato con il codice di allora.
 * ponytail: la tabella non ha la data di inizio validità, quindi alla data di
 * nascita compaiono anche i comuni nati dopo; la provincia li distingue.
 */
const cercaLuoghi = async ({ cerca, tipo, in_vigore_il: inVigoreIl }) => {
  return await AlloggiatiLuogo.findAll({
    where: {
      descrizione: { [Op.like]: `${cerca}%` },
      soppresso_il: inVigoreIl ? { [Op.or]: [null, { [Op.gt]: inVigoreIl }] } : null,
      ...(tipo && { tipo }),
    },
    attributes: ['codice', 'descrizione', 'provincia', 'tipo', 'soppresso_il'],
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
