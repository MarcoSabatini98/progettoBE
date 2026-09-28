// Riga di una fattura. Si può aggiungere o modificare solo finché la fattura
// è in bozza (lo impedisce il trigger). "totale" (quantità × prezzo) è
// calcolato dal database.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const FatturaRiga = sequelize.define(
  'FatturaRiga',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    fattura_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    descrizione: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    quantita: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 1,
    },
    // imponibile unitario, IVA esclusa
    prezzo_unitario: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    aliquota_iva: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },
    // obbligatoria quando aliquota_iva = 0 (es. N1 = escluse art. 15)
    natura: {
      type: DataTypes.STRING(5),
      allowNull: true,
    },
    totale: {
      type: DataTypes.DECIMAL(10, 2),
      set() {
        throw new Error('totale è una colonna calcolata dal database: modifica quantità o prezzo');
      },
    },
    ordine: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'fatture_righe',
    timestamps: false,
  },
);

module.exports = FatturaRiga;
