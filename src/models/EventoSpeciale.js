// Festività o evento locale (fiera, concerto...). Serve alle analisi e ai
// suggerimenti di prezzo: impatto va da 1 (minimo) a 10 (massimo).
// data_fine inclusa.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_EVENTO_SPECIALE } = require('../constants/sistema.constants');

const EventoSpeciale = sequelize.define(
  'EventoSpeciale',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    titolo: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    tipo: {
      type: DataTypes.ENUM(...TIPI_EVENTO_SPECIALE),
      allowNull: false,
      defaultValue: 'altro',
    },
    data_inizio: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    data_fine: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    impatto: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 5,
      validate: { min: 1, max: 10 },
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'eventi_speciali',
  },
);

module.exports = EventoSpeciale;
