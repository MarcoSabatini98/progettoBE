// Periodo in cui una camera non è prenotabile (manutenzione, prenotazione
// arrivata da un portale via iCal...). camera_id NULL = struttura chiusa.
// data_fine esclusa, come per le prenotazioni.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { ORIGINI_BLOCCO } = require('../constants/prenotazioni.constants');

const DataBloccata = sequelize.define(
  'DataBloccata',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    camera_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    data_inizio: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    data_fine: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    motivo: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    origine: {
      type: DataTypes.ENUM(...ORIGINI_BLOCCO),
      allowNull: false,
      defaultValue: 'manuale',
    },
    // valorizzati solo per i blocchi importati da iCal
    calendario_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    uid_esterno: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    creato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: 'date_bloccate',
  },
);

module.exports = DataBloccata;
