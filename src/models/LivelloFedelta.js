// Livello del programma fedeltà (bronze → diamond): si raggiunge con i punti
// e dà uno sconto percentuale sulle prenotazioni.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const LivelloFedelta = sequelize.define(
  'LivelloFedelta',
  {
    id: {
      type: DataTypes.TINYINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    codice: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    nome: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    punti_minimi: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    sconto_percentuale: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 100 },
    },
    // colore esadecimale del badge, es. #D4AF37
    colore: {
      type: DataTypes.CHAR(7),
      allowNull: true,
    },
  },
  {
    tableName: 'livelli_fedelta',
    timestamps: false,
  },
);

module.exports = LivelloFedelta;
