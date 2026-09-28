// Anagrafica di chi soggiorna, con i dati richiesti dalla schedina
// Alloggiati Web (luoghi e documento con i codici ufficiali).
// utente_id collega l'ospite all'account del cliente, se ne ha uno.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { SESSI } = require('../constants/prenotazioni.constants');

const Ospite = sequelize.define(
  'Ospite',
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
    utente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    nome: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    cognome: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: { isEmail: true },
    },
    telefono: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    sesso: {
      type: DataTypes.ENUM(...SESSI),
      allowNull: true,
    },
    data_nascita: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    cittadinanza_codice: {
      type: DataTypes.CHAR(9),
      allowNull: true,
    },
    stato_nascita_codice: {
      type: DataTypes.CHAR(9),
      allowNull: true,
    },
    // valorizzato solo per i nati in Italia
    comune_nascita_codice: {
      type: DataTypes.CHAR(9),
      allowNull: true,
    },
    provincia_nascita: {
      type: DataTypes.CHAR(2),
      allowNull: true,
    },
    tipo_documento: {
      type: DataTypes.STRING(5),
      allowNull: true,
    },
    numero_documento: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    luogo_rilascio_codice: {
      type: DataTypes.CHAR(9),
      allowNull: true,
    },
    scadenza_documento: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    codice_fiscale: {
      type: DataTypes.CHAR(16),
      allowNull: true,
    },
    indirizzo: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    cap: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    citta: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    provincia: {
      type: DataTypes.CHAR(2),
      allowNull: true,
    },
    // codice ISO a 2 lettere
    paese: {
      type: DataTypes.CHAR(2),
      allowNull: true,
    },
    lingua: {
      type: DataTypes.CHAR(2),
      allowNull: false,
      defaultValue: 'it',
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'ospiti',
    paranoid: true,
  },
);

module.exports = Ospite;
