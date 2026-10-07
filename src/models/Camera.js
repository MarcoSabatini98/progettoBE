// Camera fisica. stato_pulizia lo aggiornano i trigger (partenza → sporca,
// attività di pulizia → in_pulizia / da_ispezionare / pulita).
// ospiti_max NULL = quello della tipologia.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { STATI_CAMERA, STATI_PULIZIA_CAMERA } = require('../constants/camere.constants');

const Camera = sequelize.define(
  'Camera',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    numero: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    nome: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    tipologia_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    piano: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0,
    },
    ospiti_max: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: true,
    },
    stato: {
      type: DataTypes.ENUM(...STATI_CAMERA),
      allowNull: false,
      defaultValue: 'attiva',
    },
    stato_pulizia: {
      type: DataTypes.ENUM(...STATI_PULIZIA_CAMERA),
      allowNull: false,
      defaultValue: 'pulita',
    },
    // token segreto dell'URL del calendario iCal esportato verso le OTA
    token_ical: {
      type: DataTypes.CHAR(64),
      allowNull: true,
    },
    // Per il sito; vuota = si vede quella della tipologia.
    descrizione: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'camere',
    paranoid: true,
  },
);

module.exports = Camera;
