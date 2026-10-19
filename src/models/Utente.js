// Account: clienti registrati e personale.
// punti_fedelta è aggiornato dal trigger su movimenti_punti: non si scrive a mano.
// L'hash della password è escluso da ogni query: per il login serve
// Utente.scope('autenticazione').

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { RUOLI } = require('../constants/ruoli.constants');

const Utente = sequelize.define(
  'Utente',
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
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: { isEmail: true },
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    ruolo: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: RUOLI.CLIENTE,
    },
    nome: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    cognome: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    telefono: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    lingua: {
      type: DataTypes.CHAR(2),
      allowNull: false,
      defaultValue: 'it',
    },
    attivo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    email_verificata_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    notifiche_email: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    // Stato attuale del consenso alle offerte; ogni cambio resta in consensi.
    email_marketing: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    punti_fedelta: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // anagrafica del cliente, usata per precompilare le prenotazioni
    ospite_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    ultimo_accesso_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // colore dell'avatar: casuale ma sempre uguale per lo stesso utente
    colore_avatar: {
      type: DataTypes.VIRTUAL,
      get() {
        const uuid = this.getDataValue('uuid');
        if (!uuid) return null;
        const tonalita = parseInt(uuid.slice(0, 8), 16) % 360;
        return `hsl(${tonalita} 55% 45%)`;
      },
    },
  },
  {
    tableName: 'utenti',
    paranoid: true,
    defaultScope: {
      attributes: { exclude: ['password_hash'] },
    },
    scopes: {
      autenticazione: {},
    },
  },
);

module.exports = Utente;
