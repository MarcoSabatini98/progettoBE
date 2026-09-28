// Calendario iCal di un portale (Booking, Airbnb...) collegato a una camera.
// Il job lo scarica periodicamente e trasforma gli eventi in date bloccate.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { CANALI_OTA } = require('../constants/prenotazioni.constants');

const CalendarioEsterno = sequelize.define(
  'CalendarioEsterno',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    camera_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    canale: {
      type: DataTypes.ENUM(...CANALI_OTA),
      allowNull: false,
    },
    nome: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    url: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      validate: { isUrl: true },
    },
    attivo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    ultima_sincronizzazione_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    ultimo_esito: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    errori_consecutivi: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'calendari_esterni',
  },
);

module.exports = CalendarioEsterno;
