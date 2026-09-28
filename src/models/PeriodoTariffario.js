// Periodo tariffario (stagione, weekend, evento): cambia il prezzo per notte
// nelle date indicate (data_fine inclusa). Se più periodi coprono la stessa
// notte vince la priorità più alta, a parità quello della tipologia.
// tipologia_id NULL = vale per tutte le tipologie.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_VARIAZIONE_PERIODO } = require('../constants/tariffe.constants');

const PeriodoTariffario = sequelize.define(
  'PeriodoTariffario',
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
    tipologia_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    data_inizio: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    data_fine: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    // giorni in cui vale, come somma di bit: 1=lun 2=mar 4=mer 8=gio 16=ven 32=sab 64=dom
    giorni_settimana: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 127,
      validate: { min: 1, max: 127 },
    },
    tipo_variazione: {
      type: DataTypes.ENUM(...TIPI_VARIAZIONE_PERIODO),
      allowNull: false,
    },
    valore: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    soggiorno_minimo: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: true,
    },
    priorita: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
    attivo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    creato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    aggiornato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: 'periodi_tariffari',
  },
);

module.exports = PeriodoTariffario;
