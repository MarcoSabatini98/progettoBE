// Messaggio di chat. Il mittente è un utente, un visitatore o il sistema
// (di_sistema = true, es. "Mario è entrato nel gruppo").
// Eliminazione logica: il messaggio resta per lo storico.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TESTO_MAX } = require('../constants/chat.constants');

const Messaggio = sequelize.define(
  'Messaggio',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    conversazione_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    mittente_utente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    mittente_visitatore_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    di_sistema: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    risposta_a_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    testo: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: { len: [1, TESTO_MAX] },
    },
    modificato_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'messaggi',
    createdAt: 'inviato_il',
    updatedAt: false,
    paranoid: true,
  },
);

module.exports = Messaggio;
