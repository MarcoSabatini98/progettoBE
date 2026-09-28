// src/repositories/disponibilita.repository.js
//
// Camere libere e blocchi temporanei durante il checkout.
// Cosa vuol dire "libera" lo decide il database (fn_camera_libera):
// qui si chiama la procedura che la usa.

const { Op } = require('sequelize');
const { sequelize, BloccoTemporaneo } = require('../models');

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
  trovaBloccoPerSessione,
  creaBlocco,
  eliminaBloccoDiSessione,
  eliminaBlocchiScaduti,
};
