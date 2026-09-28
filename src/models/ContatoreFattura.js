// Ultimo numero di fattura emesso per anno e sezionale. Lo aggiorna solo il
// trigger di emissione, così la numerazione resta progressiva senza buchi.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ContatoreFattura = sequelize.define(
  'ContatoreFattura',
  {
    anno: {
      type: DataTypes.SMALLINT.UNSIGNED,
      primaryKey: true,
    },
    sezionale: {
      type: DataTypes.STRING(10),
      primaryKey: true,
      defaultValue: '',
    },
    ultimo_numero: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'contatori_fatture',
    timestamps: false,
  },
);

module.exports = ContatoreFattura;
