// Tabella ponte ruoli ↔ permessi.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const RuoloPermesso = sequelize.define(
  'RuoloPermesso',
  {
    ruolo: {
      type: DataTypes.STRING(30),
      primaryKey: true,
    },
    permesso: {
      type: DataTypes.STRING(50),
      primaryKey: true,
    },
  },
  {
    tableName: 'ruoli_permessi',
    timestamps: false,
  },
);

module.exports = RuoloPermesso;
