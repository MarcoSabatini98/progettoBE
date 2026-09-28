// Membro dello staff in una conversazione. Chi esce resta registrato con
// uscito_il (per lo storico); letto_fino_al serve per i messaggi non letti.
// Il trigger controlla le regole_chat (chi può scrivere a chi).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ConversazionePartecipante = sequelize.define(
  'ConversazionePartecipante',
  {
    conversazione_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    utente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    uscito_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    letto_fino_al: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'conversazioni_partecipanti',
    createdAt: 'entrato_il',
    updatedAt: false,
  },
);

module.exports = ConversazionePartecipante;
