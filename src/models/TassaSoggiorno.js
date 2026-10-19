// Imposta di soggiorno comunale in vigore in un periodo: importo per ospite
// per notte, fino a notti_max notti, esenti i minori di eta_esenzione anni.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TassaSoggiorno = sequelize.define(
  'TassaSoggiorno',
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
    valida_dal: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    valida_al: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    importo_notte: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    notti_max: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: true,
    },
    eta_esenzione: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: true,
    },
    attiva: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'tassa_soggiorno',
  },
);

module.exports = TassaSoggiorno;
