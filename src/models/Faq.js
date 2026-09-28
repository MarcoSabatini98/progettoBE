// Domanda frequente: mostrata sul sito e proposta nella chat di assistenza.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Faq = sequelize.define(
  'Faq',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    domanda: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    risposta: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    categoria: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    ordine: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
    pubblicata: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    creato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    aggiornato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: 'faq',
  },
);

module.exports = Faq;
