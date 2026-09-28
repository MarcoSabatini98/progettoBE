// Versione di un documento legale (privacy, termini, cookie) in una lingua.
// È in vigore la versione pubblicata più recente; i consensi puntano alla
// versione accettata.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_DOCUMENTO_LEGALE } = require('../constants/sistema.constants');

const DocumentoLegale = sequelize.define(
  'DocumentoLegale',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    tipo: {
      type: DataTypes.ENUM(...TIPI_DOCUMENTO_LEGALE),
      allowNull: false,
    },
    versione: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    lingua: {
      type: DataTypes.CHAR(2),
      allowNull: false,
      defaultValue: 'it',
    },
    contenuto: {
      type: DataTypes.TEXT('medium'),
      allowNull: true,
    },
    percorso_pdf: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    pubblicato_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    creato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: 'documenti_legali',
    updatedAt: false,
  },
);

module.exports = DocumentoLegale;
