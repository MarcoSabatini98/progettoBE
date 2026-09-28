// Storico degli invii ad Alloggiati Web: una riga per schedina inviata,
// con l'esito restituito dal servizio della Polizia di Stato.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { ESITI_ALLOGGIATI } = require('../constants/prenotazioni.constants');

const InvioAlloggiati = sequelize.define(
  'InvioAlloggiati',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    prenotazione_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    ospite_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    // riga a larghezza fissa nel formato ufficiale
    schedina: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    esito: {
      type: DataTypes.ENUM(...ESITI_ALLOGGIATI),
      allowNull: false,
    },
    messaggio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    inviato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: 'invii_alloggiati',
    createdAt: 'inviato_il',
    updatedAt: false,
  },
);

module.exports = InvioAlloggiati;
