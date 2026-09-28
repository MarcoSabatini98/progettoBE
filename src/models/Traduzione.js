// Traduzione di un campo di testo di qualsiasi entità (es. tipologia_camera 3,
// campo "descrizione", lingua "en"). L'italiano resta nella tabella originale.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Traduzione = sequelize.define(
  'Traduzione',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    entita: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    entita_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    campo: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    lingua: {
      type: DataTypes.CHAR(2),
      allowNull: false,
    },
    testo: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: 'traduzioni',
    createdAt: false,
  },
);

module.exports = Traduzione;
