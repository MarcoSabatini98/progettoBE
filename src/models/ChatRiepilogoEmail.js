// Ultima email di riepilogo dei messaggi non letti inviata a un utente per
// una conversazione: evita di mandarne una a ogni messaggio.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ChatRiepilogoEmail = sequelize.define(
  'ChatRiepilogoEmail',
  {
    conversazione_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    utente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    inviato_il: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: 'chat_riepiloghi_email',
    timestamps: false,
  },
);

module.exports = ChatRiepilogoEmail;
