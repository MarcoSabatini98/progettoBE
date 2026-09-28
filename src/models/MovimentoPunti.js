// Movimento di punti fedeltà. Il trigger somma i punti in utenti.punti_fedelta.
// I punti del soggiorno li assegna il trigger al check-out; bonus e rettifiche
// li registra l'admin (punti negativi = sottrazione).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { MOTIVI_PUNTI } = require('../constants/tariffe.constants');

const MovimentoPunti = sequelize.define(
  'MovimentoPunti',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    utente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    prenotazione_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    punti: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { not: /^0$/ },
    },
    motivo: {
      type: DataTypes.ENUM(...MOTIVI_PUNTI),
      allowNull: false,
    },
    note: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    creato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: 'movimenti_punti',
    updatedAt: false,
  },
);

module.exports = MovimentoPunti;
