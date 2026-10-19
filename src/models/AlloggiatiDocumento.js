// Tabella ufficiale Alloggiati Web dei tipi di documento (es. IDENT, PASOR).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const AlloggiatiDocumento = sequelize.define(
  'AlloggiatiDocumento',
  {
    codice: {
      type: DataTypes.STRING(5),
      primaryKey: true,
    },
    descrizione: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  },
  {
    tableName: 'alloggiati_documenti',
    timestamps: false,
  },
);

module.exports = AlloggiatiDocumento;
