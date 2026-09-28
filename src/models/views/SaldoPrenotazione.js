// Modello in sola lettura sulla VIEW v_saldo_prenotazioni: per ogni
// prenotazione quanto è dovuto, quanto è stato incassato e rimborsato e il
// saldo (negativo = da rimborsare). Per le cancellate il dovuto è la penale.
//
// Esposto con Prenotazione.hasOne(SaldoPrenotazione, { as: 'saldo' }).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/db');

function readOnlyGuard() {
  throw new Error(
    'SaldoPrenotazione è una VIEW in sola lettura: modifica prenotazioni o pagamenti',
  );
}

const SaldoPrenotazione = sequelize.define(
  'SaldoPrenotazione',
  {
    prenotazione_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    codice: {
      type: DataTypes.STRING(20),
    },
    stato: {
      type: DataTypes.STRING(20),
    },
    dovuto: {
      type: DataTypes.DECIMAL(10, 2),
    },
    incassato: {
      type: DataTypes.DECIMAL(10, 2),
    },
    rimborsato: {
      type: DataTypes.DECIMAL(10, 2),
    },
    saldo: {
      type: DataTypes.DECIMAL(10, 2),
    },
  },
  {
    tableName: 'v_saldo_prenotazioni',
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

module.exports = SaldoPrenotazione;
