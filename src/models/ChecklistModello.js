// Voce della checklist di pulizia (es. "Cambio asciugamani"). Quando nasce
// un'attività di pulizia, le voci attive del suo tipo vengono copiate nella
// checklist dell'attività. tipo_pulizia NULL = vale per tutti i tipi.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_PULIZIA } = require('../constants/pulizie.constants');

const ChecklistModello = sequelize.define(
  'ChecklistModello',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    voce: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    tipo_pulizia: {
      type: DataTypes.ENUM(...TIPI_PULIZIA),
      allowNull: true,
    },
    ordine: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
    attiva: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'checklist_modelli',
    timestamps: false,
  },
);

module.exports = ChecklistModello;
