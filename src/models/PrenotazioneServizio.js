// Servizio extra aggiunto a una prenotazione. Prezzo e modalità di calcolo
// sono copiati dal servizio; il trigger somma i totali in
// prenotazioni.importo_servizi.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { CALCOLO_PREZZO } = require('../constants/camere.constants');

const PrenotazioneServizio = sequelize.define(
  'PrenotazioneServizio',
  {
    prenotazione_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    servizio_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
    },
    quantita: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 1 },
    },
    prezzo_unitario: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    calcolo_prezzo: {
      type: DataTypes.ENUM(...CALCOLO_PREZZO),
      allowNull: false,
    },
    totale: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
  },
  {
    tableName: 'prenotazioni_servizi',
    timestamps: false,
  },
);

module.exports = PrenotazioneServizio;
