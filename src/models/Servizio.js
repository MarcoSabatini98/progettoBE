// Servizio: dotazione della camera (wifi, TV...) o extra acquistabile
// (colazione, transfer...). Per gli extra calcolo_prezzo dice come si moltiplica
// il prezzo (a soggiorno, a notte, a persona, a persona per notte).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_SERVIZIO, CALCOLO_PREZZO } = require('../constants/camere.constants');

const Servizio = sequelize.define(
  'Servizio',
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
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    icona: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    tipo: {
      type: DataTypes.ENUM(...TIPI_SERVIZIO),
      allowNull: false,
      defaultValue: 'dotazione',
    },
    prezzo: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
    calcolo_prezzo: {
      type: DataTypes.ENUM(...CALCOLO_PREZZO),
      allowNull: false,
      defaultValue: 'a_soggiorno',
    },
    // NULL = aliquota predefinita dei servizi (impostazione iva_servizi)
    aliquota_iva: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    ordine: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
    attivo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'servizi',
    paranoid: true,
  },
);

module.exports = Servizio;
