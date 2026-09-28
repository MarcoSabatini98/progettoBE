// Codice sconto inserito dal cliente. "utilizzi" lo aggiornano i trigger
// (+1 alla prenotazione, -1 alla cancellazione) e il DB rifiuta la
// prenotazione se il codice è esaurito o già usato dallo stesso utente.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_SCONTO } = require('../constants/tariffe.constants');

const CodiceSconto = sequelize.define(
  'CodiceSconto',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    codice: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    descrizione: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    tipo_sconto: {
      type: DataTypes.ENUM(...TIPI_SCONTO),
      allowNull: false,
    },
    valore: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    valido_dal: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    valido_al: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    importo_minimo: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    notti_min: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: true,
    },
    utilizzi_max: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    utilizzi_per_utente: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: true,
    },
    utilizzi: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    attivo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    creato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: 'codici_sconto',
  },
);

module.exports = CodiceSconto;
