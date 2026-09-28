// Query dirette su viste e procedure (non hanno un modello Sequelize).

const { sequelize } = require('../models');

/** SELECT su una vista o query libera → righe semplici. */
const seleziona = (sql, parametri = [], transaction) =>
  sequelize.query(sql, { replacements: parametri, type: sequelize.QueryTypes.SELECT, transaction });

/** CALL di una procedura → righe del primo result set. */
const chiama = (sql, parametri = [], transaction) =>
  sequelize.query(sql, { replacements: parametri, transaction });

module.exports = { seleziona, chiama };
