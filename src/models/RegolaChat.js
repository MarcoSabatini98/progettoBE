// Coppia di ruoli che possono scriversi nella chat interna.
// Il trigger riordina la coppia (ruolo_a <= ruolo_b): una regola vale nei due sensi.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const RegolaChat = sequelize.define(
  'RegolaChat',
  {
    ruolo_a: {
      type: DataTypes.STRING(30),
      primaryKey: true,
    },
    ruolo_b: {
      type: DataTypes.STRING(30),
      primaryKey: true,
    },
  },
  {
    tableName: 'regole_chat',
    timestamps: false,
  },
);

module.exports = RegolaChat;
