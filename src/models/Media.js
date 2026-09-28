// Immagine caricata. Relazione polimorfica: entita + entita_id dicono a cosa
// appartiene (camera 5, tipologia_camera 2...). entita_id è NULL per le
// immagini generiche (home, logo, struttura).

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { ENTITA_MEDIA } = require('../constants/camere.constants');

const Media = sequelize.define(
  'Media',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    entita: {
      type: DataTypes.ENUM(...ENTITA_MEDIA),
      allowNull: false,
    },
    entita_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    percorso: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    tipo_mime: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    dimensione: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    larghezza: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: true,
    },
    altezza: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: true,
    },
    testo_alternativo: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: '',
    },
    ordine: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'media',
    updatedAt: false,
  },
);

module.exports = Media;
