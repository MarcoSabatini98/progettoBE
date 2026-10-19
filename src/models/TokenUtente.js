// Token monouso dell'utente: refresh (sessioni), verifica email, reset password.
// Si salva solo l'hash SHA-256 del token, mai il token in chiaro.
// famiglia: tutti i refresh nati dallo stesso login (per revocarli insieme
// se uno già usato viene riproposto).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_TOKEN } = require('../constants/ruoli.constants');

const TokenUtente = sequelize.define(
  'TokenUtente',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    utente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    tipo: {
      type: DataTypes.ENUM(...TIPI_TOKEN),
      allowNull: false,
    },
    hash_token: {
      type: DataTypes.CHAR(64),
      allowNull: false,
    },
    famiglia: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
    tentativi: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    scade_il: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    usato_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    revocato_il: {
      type: DataTypes.DATE,
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
  },
  {
    tableName: 'token_utente',
    updatedAt: false,
  },
);

module.exports = TokenUtente;
