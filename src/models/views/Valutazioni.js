// Modello in sola lettura sulla VIEW v_valutazioni: una sola riga con il
// numero di recensioni pubblicate e le medie dei voti (per il sito).
// La view non ha chiave: si legge con findOne().

const { DataTypes } = require('sequelize');
const { sequelize } = require('../../config/db');

function readOnlyGuard() {
  throw new Error('Valutazioni è una VIEW in sola lettura: modifica le recensioni');
}

const Valutazioni = sequelize.define(
  'Valutazioni',
  {
    numero_recensioni: {
      type: DataTypes.INTEGER,
    },
    media: {
      type: DataTypes.DECIMAL(4, 2),
    },
    media_pulizia: {
      type: DataTypes.DECIMAL(4, 2),
    },
    media_personale: {
      type: DataTypes.DECIMAL(4, 2),
    },
    media_posizione: {
      type: DataTypes.DECIMAL(4, 2),
    },
    media_comfort: {
      type: DataTypes.DECIMAL(4, 2),
    },
    media_qualita_prezzo: {
      type: DataTypes.DECIMAL(4, 2),
    },
  },
  {
    tableName: 'v_valutazioni',
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

// Sequelize aggiunge "id" se nessun campo è chiave: la view non ce l'ha.
Valutazioni.removeAttribute('id');

module.exports = Valutazioni;
