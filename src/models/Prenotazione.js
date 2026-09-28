// Prenotazione di una camera. Importi e politica di cancellazione sono
// copiati al momento della prenotazione, così restano validi anche se in
// seguito cambiano tariffe o piani.
//
// Cosa fa il database (trigger), non il backend:
//   - genera "codice" se vuoto → dopo create() serve reload() per leggerlo;
//   - controlla disponibilità della camera e capienza;
//   - conta gli utilizzi del codice sconto;
//   - aggiorna le date di avanzamento (arrivo/partenza effettivi, cancellata_il);
//   - a soggiorno concluso: camera sporca, attività di pulizia, punti fedeltà.
// "notti" e "totale" sono colonne calcolate: si leggono, non si scrivono.

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { STATI_PRENOTAZIONE, CANALI } = require('../constants/prenotazioni.constants');

const Prenotazione = sequelize.define(
  'Prenotazione',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    uuid: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    codice: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: '',
    },
    // ─── Chi, dove, come ─────────────────────────────────────────────
    ospite_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    utente_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    camera_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    piano_tariffario_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    promozione_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    codice_sconto_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    pacchetto_id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    // ─── Soggiorno ───────────────────────────────────────────────────
    data_arrivo: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    // esclusa: è il giorno del check-out
    data_partenza: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    notti: {
      type: DataTypes.SMALLINT,
      set() {
        throw new Error('notti è una colonna calcolata dal database: modifica le date');
      },
    },
    adulti: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 1 },
    },
    bambini: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    stato: {
      type: DataTypes.ENUM(...STATI_PRENOTAZIONE),
      allowNull: false,
      defaultValue: 'in_attesa',
    },
    canale: {
      type: DataTypes.ENUM(...CANALI),
      allowNull: false,
      defaultValue: 'diretto',
    },
    // codice della prenotazione sul portale di provenienza
    id_esterno: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    // ─── Importi (euro) ──────────────────────────────────────────────
    valuta: {
      type: DataTypes.CHAR(3),
      allowNull: false,
      defaultValue: 'EUR',
    },
    importo_soggiorno: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    sconto_promozione: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    sconto_codice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    percentuale_fedelta: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    },
    sconto_fedelta: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    importo_pacchetto: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    // somma di prenotazioni_servizi, aggiornata dal trigger
    importo_servizi: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    tassa_soggiorno: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    totale: {
      type: DataTypes.DECIMAL(10, 2),
      set() {
        throw new Error('totale è una colonna calcolata dal database: modifica gli importi');
      },
    },
    acconto_richiesto: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    // prezzo notte per notte, come calcolato da tariffe.service
    dettaglio_prezzo: {
      type: DataTypes.JSON,
      allowNull: true,
      get() {
        const valore = this.getDataValue('dettaglio_prezzo');
        return typeof valore === 'string' ? JSON.parse(valore) : valore;
      },
    },
    // ─── Politica di cancellazione (copiata dal piano) ───────────────
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
    },
    // ─── Note e arrivo ───────────────────────────────────────────────
    richieste_speciali: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    note_interne: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ora_arrivo_prevista: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    // una prenotazione in_attesa non pagata entro questa data viene annullata
    scade_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // ─── Check-in online ─────────────────────────────────────────────
    token_checkin: {
      type: DataTypes.CHAR(64),
      allowNull: true,
    },
    token_checkin_scade_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    checkin_online_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    arrivo_effettivo_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    partenza_effettiva_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // ─── Cancellazione ───────────────────────────────────────────────
    cancellata_il: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    motivo_cancellazione: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    penale_applicata: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    creato_da: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
  },
  {
    tableName: 'prenotazioni',
  },
);

module.exports = Prenotazione;
