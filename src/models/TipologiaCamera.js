// Tipologia di camera (es. Matrimoniale Deluxe): è ciò che il cliente vede
// e prenota. Il prezzo base per notte si modifica con periodi e piani tariffari.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TipologiaCamera = sequelize.define(
  'TipologiaCamera',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    nome: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    descrizione: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    prezzo_base: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    ospiti_max: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 2,
      validate: { min: 1 },
    },
    superficie_mq: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: true,
    },
    letti: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    ordine: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
    attiva: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'tipologie_camera',
    paranoid: true,
  },
);

module.exports = TipologiaCamera;
