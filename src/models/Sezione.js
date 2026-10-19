// Sezione immagine-testo di una pagina del sito: sul sito si alternano i lati.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Sezione = sequelize.define(
  'Sezione',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    pagina_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    titolo: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    testo: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    ordine: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
    pubblicata: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'sezioni',
  },
);

module.exports = Sezione;
