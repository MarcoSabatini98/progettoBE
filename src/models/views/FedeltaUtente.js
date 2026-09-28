// Modello in sola lettura sulla VIEW v_fedelta_utenti: livello fedeltà
// attuale di ogni cliente, sconto che ne deriva e punti del livello successivo
// (NULL se è già al massimo).
//
// Esposto con Utente.hasOne(FedeltaUtente, { as: 'fedelta' }).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/db');

function readOnlyGuard() {
  throw new Error('FedeltaUtente è una VIEW in sola lettura: registra un movimento punti');
}

const FedeltaUtente = sequelize.define(
  'FedeltaUtente',
  {
    utente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    punti_fedelta: {
      type: DataTypes.INTEGER.UNSIGNED,
    },
    livello_id: {
      type: DataTypes.TINYINT.UNSIGNED,
    },
    livello: {
      type: DataTypes.STRING(20),
    },
    livello_nome: {
      type: DataTypes.STRING(50),
    },
    sconto_percentuale: {
      type: DataTypes.DECIMAL(5, 2),
    },
    punti_prossimo_livello: {
      type: DataTypes.INTEGER.UNSIGNED,
    },
  },
  {
    tableName: 'v_fedelta_utenti',
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

module.exports = FedeltaUtente;
