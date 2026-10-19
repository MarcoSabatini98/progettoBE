// Modello in sola lettura sulla VIEW v_tassa_soggiorno_mensile: riepilogo
// per mese di arrivo da usare nella dichiarazione dell'imposta di soggiorno.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/db');

function readOnlyGuard() {
  throw new Error('TassaSoggiornoMensile è una VIEW in sola lettura: modifica le prenotazioni');
}

const TassaSoggiornoMensile = sequelize.define(
  'TassaSoggiornoMensile',
  {
    mese: {
      type: DataTypes.CHAR(7),
      primaryKey: true,
    },
    prenotazioni: {
      type: DataTypes.INTEGER,
    },
    ospiti: {
      type: DataTypes.INTEGER,
    },
    notti: {
      type: DataTypes.INTEGER,
    },
    tassa: {
      type: DataTypes.DECIMAL(12, 2),
    },
  },
  {
    tableName: 'v_tassa_soggiorno_mensile',
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

module.exports = TassaSoggiornoMensile;
