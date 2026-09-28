// Tabella ufficiale Alloggiati Web di comuni e stati (codice a 9 cifre).
// Si carica una volta dai file della Polizia di Stato; qui è solo lettura.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_LUOGO } = require('../constants/prenotazioni.constants');

const AlloggiatiLuogo = sequelize.define(
  'AlloggiatiLuogo',
  {
    codice: {
      type: DataTypes.CHAR(9),
      primaryKey: true,
    },
    descrizione: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    provincia: {
      type: DataTypes.CHAR(2),
      allowNull: true,
    },
    tipo: {
      type: DataTypes.ENUM(...TIPI_LUOGO),
      allowNull: false,
    },
    soppresso_il: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  },
  {
    tableName: 'alloggiati_luoghi',
    timestamps: false,
  },
);

module.exports = AlloggiatiLuogo;
