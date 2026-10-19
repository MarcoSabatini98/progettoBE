// Fattura elettronica (TD01) o nota di credito (TD04) da inviare allo SDI.
// Nasce in 'bozza' senza numero: anno e numero li assegna il trigger quando
// passa a 'da_inviare'. Da quel momento il DB ne rifiuta modifiche ed
// eliminazione (tranne i campi dello stato SDI).
// I dati del cliente sono copiati, non collegati: la fattura non deve
// cambiare se in seguito cambia l'anagrafica.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { TIPI_DOCUMENTO_FATTURA, STATI_SDI } = require('../constants/pagamenti.constants');

const Fattura = sequelize.define(
  'Fattura',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    prenotazione_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    // per le note di credito: la fattura che stornano
    fattura_origine_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    tipo_documento: {
      type: DataTypes.ENUM(...TIPI_DOCUMENTO_FATTURA),
      allowNull: false,
      defaultValue: 'TD01',
    },
    // ─── Numerazione (assegnata dal trigger) ─────────────────────────
    anno: {
      type: DataTypes.SMALLINT.UNSIGNED,
      allowNull: true,
    },
    sezionale: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: '',
    },
    numero: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    data_emissione: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    // ─── Cliente ─────────────────────────────────────────────────────
    // azienda: denominazione + partita IVA; privato: nome + cognome + CF
    cliente_denominazione: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    cliente_nome: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    cliente_cognome: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    cliente_codice_fiscale: {
      type: DataTypes.STRING(16),
      allowNull: true,
    },
    cliente_partita_iva: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    cliente_indirizzo: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    cliente_cap: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    cliente_comune: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    cliente_provincia: {
      type: DataTypes.CHAR(2),
      allowNull: true,
    },
    cliente_nazione: {
      type: DataTypes.CHAR(2),
      allowNull: false,
      defaultValue: 'IT',
    },
    // '0000000' = il cliente la riceve nel cassetto fiscale o via PEC
    codice_destinatario: {
      type: DataTypes.CHAR(7),
      allowNull: false,
      defaultValue: '0000000',
    },
    pec: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    // ─── Totali ──────────────────────────────────────────────────────
    imponibile: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    imposta: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    // righe fuori campo IVA (es. tassa di soggiorno, natura N1)
    importo_esente: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    totale: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    // ─── SDI ─────────────────────────────────────────────────────────
    stato_sdi: {
      type: DataTypes.ENUM(...STATI_SDI),
      allowNull: false,
      defaultValue: 'bozza',
    },
    id_sdi: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    nome_file_xml: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    percorso_xml: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    percorso_pdf: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    esito_sdi: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    creato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: 'fatture',
  },
);

module.exports = Fattura;
