// Tabella ponte pacchetti ↔ servizi, con la quantità inclusa.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const PacchettoServizio = sequelize.define(
  'PacchettoServizio',
  {
    pacchetto_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    servizio_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    quantita: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 1 },
    },
  },
  {
    tableName: 'pacchetti_servizi',
    timestamps: false,
  },
);

module.exports = PacchettoServizio;
