// Permesso applicativo (es. prenotazioni.gestisci). L'elenco è fisso e
// definito nello schema; l'admin decide solo quali ruoli li hanno.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Permesso = sequelize.define(
  'Permesso',
  {
    codice: {
      type: DataTypes.STRING(50),
      primaryKey: true,
    },
    modulo: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    descrizione: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
  },
  {
    tableName: 'permessi',
    timestamps: false,
  },
);

module.exports = Permesso;
