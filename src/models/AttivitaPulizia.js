// Attività di pulizia di una camera, assegnata a un housekeeper.
// Avanza da_fare → in_corso → completata → verificata (l'ispezione del
// senior è facoltativa, vedi impostazione pulizie_richiedi_ispezione).
// I trigger impostano le date di avanzamento e lo stato_pulizia della camera.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const {
  TIPI_PULIZIA,
  PRIORITA,
  STATI_ATTIVITA_PULIZIA,
} = require('../constants/pulizie.constants');

const AttivitaPulizia = sequelize.define(
  'AttivitaPulizia',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    camera_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    prenotazione_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    assegnata_a: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    data_prevista: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    tipo: {
      type: DataTypes.ENUM(...TIPI_PULIZIA),
      allowNull: false,
      defaultValue: 'riassetto',
    },
    priorita: {
      type: DataTypes.ENUM(...PRIORITA),
      allowNull: false,
      defaultValue: 'normale',
    },
    stato: {
      type: DataTypes.ENUM(...STATI_ATTIVITA_PULIZIA),
      allowNull: false,
      defaultValue: 'da_fare',
    },
    // [{ voce: 'Cambio asciugamani', fatto: false }, ...]
    checklist: {
      type: DataTypes.JSON,
      allowNull: true,
      get() {
        const valore = this.getDataValue('checklist');
        return typeof valore === 'string' ? JSON.parse(valore) : valore;
      },
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    iniziata_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completata_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // "Non disturbare": l'attività torna in fondo alla coda del giorno.
    rinviata_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    verificata_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    verificata_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    creato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: 'attivita_pulizia',
  },
);

module.exports = AttivitaPulizia;
