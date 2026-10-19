// File allegato a un messaggio di chat (salvato su disco).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MessaggioAllegato = sequelize.define(
  'MessaggioAllegato',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    messaggio_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    nome_originale: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    percorso: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    tipo_mime: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    dimensione: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
  },
  {
    tableName: 'messaggi_allegati',
    updatedAt: false,
  },
);

module.exports = MessaggioAllegato;
