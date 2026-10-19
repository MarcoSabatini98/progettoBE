// Recensione lasciata dopo un soggiorno concluso (il trigger rifiuta le
// altre). ospite_id è copiato dal trigger dalla prenotazione.
// Pubblica solo dopo la moderazione dello staff.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { STATI_RECENSIONE } = require('../constants/prenotazioni.constants');

const votoDaUnoACinque = (obbligatorio) => ({
  type: DataTypes.TINYINT.UNSIGNED,
  allowNull: !obbligatorio,
  validate: { min: 1, max: 5 },
});

const Recensione = sequelize.define(
  'Recensione',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    prenotazione_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    ospite_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    utente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    voto: votoDaUnoACinque(true),
    voto_pulizia: votoDaUnoACinque(false),
    voto_personale: votoDaUnoACinque(false),
    voto_posizione: votoDaUnoACinque(false),
    voto_comfort: votoDaUnoACinque(false),
    voto_qualita_prezzo: votoDaUnoACinque(false),
    titolo: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    commento: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lingua: {
      type: DataTypes.CHAR(2),
      allowNull: false,
      defaultValue: 'it',
    },
    // se vera, sul sito si mostra solo il nome puntato
    anonima: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    stato: {
      type: DataTypes.ENUM(...STATI_RECENSIONE),
      allowNull: false,
      defaultValue: 'in_attesa',
    },
    moderata_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    moderata_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    risposta: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    risposta_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    risposta_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'recensioni',
  },
);

module.exports = Recensione;
