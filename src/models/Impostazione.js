// Impostazione della struttura (chiave → valore). Il valore è sempre testo:
// "tipo" dice come convertirlo. Le pubbliche sono visibili dal sito.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_IMPOSTAZIONE } = require('../constants/sistema.constants');

const Impostazione = sequelize.define(
  'Impostazione',
  {
    chiave: {
      type: DataTypes.STRING(60),
      primaryKey: true,
    },
    valore: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    tipo: {
      type: DataTypes.ENUM(...TIPI_IMPOSTAZIONE),
      allowNull: false,
      defaultValue: 'testo',
    },
    gruppo: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'generale',
    },
    descrizione: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    pubblica: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    aggiornato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: 'impostazioni',
    createdAt: false,
  },
);

module.exports = Impostazione;
