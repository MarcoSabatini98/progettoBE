// Pacchetto (es. "Weekend romantico"): servizi extra inclusi a prezzo fisso,
// sommato al soggiorno.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Pacchetto = sequelize.define(
  'Pacchetto',
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
    slug: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    descrizione: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    prezzo: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    tipologia_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    notti_min: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: true,
    },
    valido_dal: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    valido_al: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    attivo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    ordine: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'pacchetti',
  },
);

module.exports = Pacchetto;
