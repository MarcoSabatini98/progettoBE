// Tabella ponte camere ↔ servizi: dotazioni in più rispetto alla tipologia.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CameraServizio = sequelize.define(
  'CameraServizio',
  {
    camera_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    servizio_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
  },
  {
    tableName: 'camere_servizi',
    timestamps: false,
  },
);

module.exports = CameraServizio;
