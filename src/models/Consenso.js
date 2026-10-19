// Registro GDPR dei consensi: ogni accettazione o revoca è una nuova riga
// (mai modificata), legata alla versione del documento legale mostrato.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_CONSENSO } = require('../constants/prenotazioni.constants');

const Consenso = sequelize.define(
  'Consenso',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    utente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    visitatore_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    ospite_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    documento_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    tipo: {
      type: DataTypes.ENUM(...TIPI_CONSENSO),
      allowNull: false,
    },
    accettato: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    ip: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    user_agent: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: 'consensi',
    updatedAt: false,
  },
);

module.exports = Consenso;
