// Tabella ponte prenotazioni ↔ ospiti: tutti gli ospiti del soggiorno,
// con il ruolo per la schedina Alloggiati e l'eventuale esenzione dalla tassa.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_ALLOGGIATO } = require('../constants/prenotazioni.constants');

const PrenotazioneOspite = sequelize.define(
  'PrenotazioneOspite',
  {
    prenotazione_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    ospite_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    tipo_alloggiato: {
      type: DataTypes.ENUM(...TIPI_ALLOGGIATO),
      allowNull: false,
      defaultValue: 'ospite_singolo',
    },
    esente_tassa: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    motivo_esenzione: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  },
  {
    tableName: 'prenotazioni_ospiti',
    timestamps: false,
  },
);

module.exports = PrenotazioneOspite;
