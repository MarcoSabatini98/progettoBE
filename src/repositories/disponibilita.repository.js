// src/repositories/disponibilita.repository.js
//
// Camere libere e blocchi temporanei durante il checkout.
// Cosa vuol dire "libera" lo decide il database (fn_camera_libera):
// qui si chiama la procedura che la usa.

const { Op } = require('sequelize');
const {
  sequelize,
  BloccoTemporaneo,
  Camera,
  TipologiaCamera,
  Prenotazione,
  DataBloccata,
} = require('../models');
const { STATI_ATTIVI } = require('../constants/prenotazioni.constants');

// ─────────────────────────────────────
// Camere libere
// ─────────────────────────────────────

// Righe { camera_id, numero, tipologia_id, ... } delle camere libere nel periodo
// per quel numero di ospiti. Il blocco della sessione indicata non conta come occupato.
const trovaCamereLibere = async (arrivo, partenza, ospiti, sessione = null, transaction = null) => {
  return await sequelize.query('CALL sp_disponibilita(?, ?, ?, ?)', {
    replacements: [arrivo, partenza, ospiti, sessione],
    transaction,
  });
};

// ─────────────────────────────────────
// Occupazione (calendario del sito)
// ─────────────────────────────────────

const soggiorniNel = (dal, al) => ({
  data_arrivo: { [Op.lt]: al },
  data_partenza: { [Op.gt]: dal },
});
const chiusureNel = (dal, al) => ({ data_inizio: { [Op.lt]: al }, data_fine: { [Op.gt]: dal } });

// Le camere prenotabili (una o quelle della tipologia) con ciò che le occupa in [dal, al):
// stessi criteri di sp_disponibilita e fn_camera_libera.
const trovaOccupazione = async ({ cameraId, tipologiaId }, dal, al, sessione = null) => {
  const adesso = new Date();
  return await Camera.findAll({
    attributes: ['id', 'stato'],
    where: {
      ...(cameraId ? { id: cameraId } : { tipologia_id: tipologiaId }),
      stato: { [Op.in]: ['attiva', 'manutenzione'] },
    },
    include: [
      { model: TipologiaCamera, as: 'tipologia', attributes: [], where: { attiva: true } },
      {
        model: Prenotazione,
        as: 'prenotazioni',
        attributes: ['data_arrivo', 'data_partenza'],
        where: {
          ...soggiorniNel(dal, al),
          stato: { [Op.in]: STATI_ATTIVI },
          // in_attesa scadute: posto già libero
          [Op.or]: [
            { stato: { [Op.ne]: 'in_attesa' } },
            { scade_il: null },
            { scade_il: { [Op.gt]: adesso } },
          ],
        },
        required: false,
      },
      {
        model: DataBloccata,
        as: 'date_bloccate',
        attributes: ['data_inizio', 'data_fine'],
        where: chiusureNel(dal, al),
        required: false,
      },
      {
        model: BloccoTemporaneo,
        as: 'blocchi_temporanei',
        attributes: ['data_arrivo', 'data_partenza'],
        where: {
          ...soggiorniNel(dal, al),
          scade_il: { [Op.gt]: adesso },
          sessione: { [Op.ne]: sessione ?? '' },
        },
        required: false,
      },
    ],
  });
};

// Chiusure di tutta la struttura (camera_id NULL) in [dal, al).
const trovaChiusureStruttura = async (dal, al) => {
  return await DataBloccata.findAll({
    attributes: ['data_inizio', 'data_fine'],
    where: { camera_id: null, ...chiusureNel(dal, al) },
  });
};

// ─────────────────────────────────────
// Blocchi temporanei
// ─────────────────────────────────────

const trovaBloccoPerSessione = async (sessione, transaction = null) => {
  return await BloccoTemporaneo.findOne({ where: { sessione }, transaction });
};

const creaBlocco = async (dati, transaction = null) => {
  return await BloccoTemporaneo.create(dati, { transaction });
};

const eliminaBloccoDiSessione = async (sessione, transaction = null) => {
  return await BloccoTemporaneo.destroy({ where: { sessione }, transaction });
};

const eliminaBlocchiScaduti = async () => {
  return await BloccoTemporaneo.destroy({ where: { scade_il: { [Op.lt]: new Date() } } });
};

module.exports = {
  trovaCamereLibere,
  trovaOccupazione,
  trovaChiusureStruttura,
  trovaBloccoPerSessione,
  creaBlocco,
  eliminaBloccoDiSessione,
  eliminaBlocchiScaduti,
};
