// Tabella ponte tipologie_camera ↔ servizi: dotazioni comuni a tutta la tipologia.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TipologiaCameraServizio = sequelize.define(
  'TipologiaCameraServizio',
  {
    tipologia_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    servizio_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
  },
  {
    tableName: 'tipologie_camera_servizi',
    timestamps: false,
  },
);

module.exports = TipologiaCameraServizio;
