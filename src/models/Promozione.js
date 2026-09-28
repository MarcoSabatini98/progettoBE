// Promozione automatica: si applica da sola se il soggiorno rientra nelle
// date e rispetta i requisiti (ospiti, notti). Se ne applica una sola,
// la più conveniente.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_SCONTO } = require('../constants/tariffe.constants');

const Promozione = sequelize.define(
  'Promozione',
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
    descrizione: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tipologia_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    soggiorno_dal: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    soggiorno_al: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    prenotabile_dal: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    prenotabile_al: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    tipo_sconto: {
      type: DataTypes.ENUM(...TIPI_SCONTO),
      allowNull: false,
    },
    valore: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    ospiti_min: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: true,
    },
    ospiti_max: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: true,
    },
    notti_min: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: true,
    },
    attiva: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    creato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: 'promozioni',
  },
);

module.exports = Promozione;
