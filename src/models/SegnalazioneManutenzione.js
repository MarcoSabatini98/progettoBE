// Guasto o problema segnalato dallo staff (rubinetto che perde, lampadina...).
// camera_id NULL = zona comune.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { PRIORITA, STATI_SEGNALAZIONE } = require('../constants/pulizie.constants');

const SegnalazioneManutenzione = sequelize.define(
  'SegnalazioneManutenzione',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    camera_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    titolo: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    descrizione: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    priorita: {
      type: DataTypes.ENUM(...PRIORITA),
      allowNull: false,
      defaultValue: 'normale',
    },
    stato: {
      type: DataTypes.ENUM(...STATI_SEGNALAZIONE),
      allowNull: false,
      defaultValue: 'aperta',
    },
    segnalata_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    assegnata_a: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    risolta_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    note_risoluzione: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'segnalazioni_manutenzione',
  },
);

module.exports = SegnalazioneManutenzione;
