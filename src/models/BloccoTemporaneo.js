// Camera tenuta da parte per qualche minuto mentre il cliente completa il
// checkout, così nessun altro la prenota nel frattempo. Il trigger rifiuta
// blocchi sovrapposti; quelli scaduti li cancella il job.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const BloccoTemporaneo = sequelize.define(
  'BloccoTemporaneo',
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
    data_arrivo: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    data_partenza: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    // identifica il checkout in corso: il proprio blocco non conta come occupato
    sessione: {
      type: DataTypes.CHAR(36),
      allowNull: false,
    },
    utente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    visitatore_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    scade_il: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: 'blocchi_temporanei',
    updatedAt: false,
  },
);

module.exports = BloccoTemporaneo;
