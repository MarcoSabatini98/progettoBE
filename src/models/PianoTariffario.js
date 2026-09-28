// Piano tariffario (es. "Non rimborsabile -10%", "Flessibile"): variazione di
// prezzo + politica di cancellazione + acconto. Alla prenotazione la politica
// viene copiata, così cambiare il piano non tocca le prenotazioni già fatte.
// predefinito_unico è una colonna generata che garantisce un solo piano
// predefinito: si legge, non si scrive.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_VARIAZIONE_PIANO } = require('../constants/tariffe.constants');

const PianoTariffario = sequelize.define(
  'PianoTariffario',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    nome: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    descrizione: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    tipo_variazione: {
      type: DataTypes.ENUM(...TIPI_VARIAZIONE_PIANO),
      allowNull: false,
      defaultValue: 'percentuale',
    },
    // negativo = sconto, positivo = maggiorazione
    valore_variazione: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    rimborsabile: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    ore_cancellazione_gratuita: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: false,
      defaultValue: 48,
    },
    penale_percentuale: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 100 },
    },
    acconto_percentuale: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 30,
      validate: { min: 0, max: 100 },
    },
    predefinito: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    predefinito_unico: {
      type: DataTypes.TINYINT,
      set() {
        throw new Error(
          'predefinito_unico è una colonna calcolata dal database: imposta "predefinito"',
        );
      },
    },
    attivo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    ordine: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'piani_tariffari',
  },
);

module.exports = PianoTariffario;
