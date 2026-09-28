// Modello in sola lettura sulla VIEW v_incassi_mensili: incassi netti
// (rimborsi sottratti) per mese ('2026-07') e metodo di pagamento.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/db');

function readOnlyGuard() {
  throw new Error('IncassoMensile è una VIEW in sola lettura: modifica i pagamenti');
}

const IncassoMensile = sequelize.define(
  'IncassoMensile',
  {
    mese: {
      type: DataTypes.CHAR(7),
      primaryKey: true,
    },
    metodo: {
      type: DataTypes.STRING(20),
      primaryKey: true,
    },
    movimenti: {
      type: DataTypes.INTEGER,
    },
    netto: {
      type: DataTypes.DECIMAL(12, 2),
    },
  },
  {
    tableName: 'v_incassi_mensili',
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

module.exports = IncassoMensile;
