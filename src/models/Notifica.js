// Notifica in-app per un utente. Eliminazione logica (eliminato_il).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_NOTIFICA, PRIORITA_NOTIFICA } = require('../constants/sistema.constants');

const Notifica = sequelize.define(
  'Notifica',
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    utente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    tipo: {
      type: DataTypes.ENUM(...TIPI_NOTIFICA),
      allowNull: false,
    },
    priorita: {
      type: DataTypes.ENUM(...PRIORITA_NOTIFICA),
      allowNull: false,
      defaultValue: 'info',
    },
    // Il gestionale traduce il titolo da codice e parametri; titolo resta in italiano.
    codice: {
      type: DataTypes.STRING(60),
      allowNull: false,
    },
    parametri: {
      type: DataTypes.JSON,
      allowNull: true,
      get() {
        const valore = this.getDataValue('parametri');
        return typeof valore === 'string' ? JSON.parse(valore) : valore;
      },
    },
    titolo: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    testo: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // percorso del frontend da aprire al clic
    link: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    letta_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'notifiche',
    updatedAt: false,
    paranoid: true,
  },
);

module.exports = Notifica;
