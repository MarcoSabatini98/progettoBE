// Ruolo di un utente (admin, receptionist, housekeeper_senior, housekeeper, cliente).
// I permessi di ogni ruolo sono configurabili dall'admin (ruoli_permessi).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Ruolo = sequelize.define(
  'Ruolo',
  {
    codice: {
      type: DataTypes.STRING(30),
      primaryKey: true,
    },
    nome: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    descrizione: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    staff: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: 'ruoli',
    timestamps: false,
  },
);

module.exports = Ruolo;
