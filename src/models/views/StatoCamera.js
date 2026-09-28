// Modello in sola lettura sulla VIEW v_stato_camere: situazione di oggi di
// ogni camera (cruscotto di reception e pulizie): stato, pulizia, ospite in
// casa, arrivo o partenza in giornata.
//
// Esposto con Camera.hasOne(StatoCamera, { as: 'situazione' }).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/db');

function readOnlyGuard() {
  throw new Error('StatoCamera è una VIEW in sola lettura: modifica camere o prenotazioni');
}

const StatoCamera = sequelize.define(
  'StatoCamera',
  {
    camera_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    numero: {
      type: DataTypes.STRING(10),
    },
    nome: {
      type: DataTypes.STRING(100),
    },
    tipologia_id: {
      type: DataTypes.INTEGER.UNSIGNED,
    },
    stato: {
      type: DataTypes.STRING(20),
    },
    stato_pulizia: {
      type: DataTypes.STRING(20),
    },
    prenotazione_in_corso_id: {
      type: DataTypes.INTEGER.UNSIGNED,
    },
    arrivo_oggi: {
      type: DataTypes.BOOLEAN,
    },
    partenza_oggi: {
      type: DataTypes.BOOLEAN,
    },
  },
  {
    tableName: 'v_stato_camere',
    timestamps: false,
    hooks: {
      beforeCreate: readOnlyGuard,
      beforeUpdate: readOnlyGuard,
      beforeDestroy: readOnlyGuard,
      beforeBulkCreate: readOnlyGuard,
      beforeBulkUpdate: readOnlyGuard,
      beforeBulkDestroy: readOnlyGuard,
    },
  },
);

module.exports = StatoCamera;
