// Pagina del sito con contenuti propri (home, struttura, attività):
// descrizione della copertina e sezioni immagine-testo.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { PAGINE_SITO } = require('../constants/sistema.constants');

const Pagina = sequelize.define(
  'Pagina',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    chiave: {
      type: DataTypes.ENUM(...PAGINE_SITO),
      allowNull: false,
      unique: true,
    },
    descrizione: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'pagine',
    createdAt: false,
  },
);

module.exports = Pagina;
