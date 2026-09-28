// Conversazione di chat.
//   - 'assistenza': un cliente (o un visitatore senza account) scrive alla
//     struttura; la prende in carico un membro dello staff (assegnata_a).
//   - 'staff': chat interna, diretta o di gruppo, tra membri dello staff
//     (i partecipanti sono in conversazioni_partecipanti).
// Il trigger sui messaggi aggiorna ultimo_messaggio_il.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_CONVERSAZIONE, STATI_CONVERSAZIONE } = require('../constants/chat.constants');

const Conversazione = sequelize.define(
  'Conversazione',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    uuid: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    tipo: {
      type: DataTypes.ENUM(...TIPI_CONVERSAZIONE),
      allowNull: false,
    },
    // nome del gruppo; NULL per le chat dirette
    titolo: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    cliente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    visitatore_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    prenotazione_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    assegnata_a: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    stato: {
      type: DataTypes.ENUM(...STATI_CONVERSAZIONE),
      allowNull: false,
      defaultValue: 'aperta',
    },
    letto_cliente_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    ultimo_messaggio_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    creata_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: 'conversazioni',
  },
);

module.exports = Conversazione;
