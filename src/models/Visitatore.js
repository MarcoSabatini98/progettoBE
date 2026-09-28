// Visitatore anonimo del sito che usa la chat di assistenza senza account.
// Se poi si registra, utente_id collega le sue conversazioni all'account.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Visitatore = sequelize.define(
  'Visitatore',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    uuid: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    nome: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: { isEmail: true },
    },
    lingua: {
      type: DataTypes.CHAR(2),
      allowNull: false,
      defaultValue: 'it',
    },
    utente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    user_agent: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    bloccato: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    ultimo_accesso_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'visitatori',
    updatedAt: false,
  },
);

module.exports = Visitatore;
