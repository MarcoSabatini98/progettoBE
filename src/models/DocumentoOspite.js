// Scansione del documento d'identità caricata dall'ospite (check-in online)
// o dalla reception. Il file sta su disco, qui c'è solo il percorso.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const DocumentoOspite = sequelize.define(
  'DocumentoOspite',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    ospite_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    nome_originale: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    percorso: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    tipo_mime: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    dimensione: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
  },
  {
    tableName: 'documenti_ospite',
    createdAt: 'caricato_il',
    updatedAt: false,
  },
);

module.exports = DocumentoOspite;
