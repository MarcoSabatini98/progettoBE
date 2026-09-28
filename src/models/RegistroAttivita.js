// Registro delle modifiche a prenotazioni, pagamenti e fatture.
// Lo scrivono solo i trigger del database: dal backend si legge e basta.
// Nessuna FK su utente_id: il registro sopravvive all'eliminazione degli utenti.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { AZIONI_REGISTRO } = require('../constants/sistema.constants');

const RegistroAttivita = sequelize.define(
  'RegistroAttivita',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    tabella: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    record_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    azione: {
      type: DataTypes.ENUM(...AZIONI_REGISTRO),
      allowNull: false,
    },
    // MariaDB restituisce le colonne JSON come testo: le convertiamo in lettura
    dati_prima: {
      type: DataTypes.JSON,
      allowNull: true,
      get() {
        const valore = this.getDataValue('dati_prima');
        return typeof valore === 'string' ? JSON.parse(valore) : valore;
      },
    },
    dati_dopo: {
      type: DataTypes.JSON,
      allowNull: true,
      get() {
        const valore = this.getDataValue('dati_dopo');
        return typeof valore === 'string' ? JSON.parse(valore) : valore;
      },
    },
    utente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
  },
  {
    tableName: 'registro_attivita',
    updatedAt: false,
  },
);

module.exports = RegistroAttivita;
