// Prenotazioni e tutto ciò che ne dipende: ospiti del soggiorno, servizi
// extra, blocchi di checkout, calendari OTA, chiusure, invii Alloggiati,
// recensioni.

const { T, EURO, PERCENTUALE, id, rif, obbligatorio, uuid, json, generata } = require('./campi');
const { CALCOLO_PREZZO } = require('./camere');

const STATI_PRENOTAZIONE = [
  'in_attesa',
  'confermata',
  'in_soggiorno',
  'conclusa',
  'cancellata',
  'no_show',
];
const CANALI = [
  'diretto',
  'telefono',
  'email',
  'walk_in',
  'booking_com',
  'airbnb',
  'expedia',
  'altro',
];
const VOTO = T.TINYINT.UNSIGNED;

module.exports = (sequelize) => {
  const CalendarioEsterno = sequelize.define('calendari_esterni', {
    id: id(),
    camera_id: rif(true),
    canale: obbligatorio(T.ENUM('booking_com', 'airbnb', 'expedia', 'altro')),
    nome: T.STRING(100),
    url: obbligatorio(T.STRING(1000)),
    attivo: obbligatorio(T.BOOLEAN, true),
    ultima_sincronizzazione_il: T.DATE,
    ultimo_esito: T.STRING(255),
    errori_consecutivi: obbligatorio(T.SMALLINT.UNSIGNED, 0),
  });

  // camera_id NULL = intera struttura chiusa; data_fine esclusa.
  const DataBloccata = sequelize.define('date_bloccate', {
    id: id(),
    camera_id: rif(),
    data_inizio: obbligatorio(T.DATEONLY),
    data_fine: obbligatorio(T.DATEONLY),
    motivo: T.STRING(255),
    origine: obbligatorio(T.ENUM('manuale', 'ical'), 'manuale'),
    calendario_id: rif(),
    uid_esterno: T.STRING(255),
    creato_da: rif(),
  });

  // codice: generato dal trigger se vuoto → dopo il create() serve reload().
  const Prenotazione = sequelize.define('prenotazioni', {
    id: id(),
    uuid: uuid(),
    codice: obbligatorio(T.STRING(20), ''),
    ospite_id: rif(true),
    utente_id: rif(),
    camera_id: rif(true),
    piano_tariffario_id: rif(),
    promozione_id: rif(),
    codice_sconto_id: rif(),
    pacchetto_id: rif(),
    data_arrivo: obbligatorio(T.DATEONLY),
    data_partenza: obbligatorio(T.DATEONLY),
    notti: generata(T.SMALLINT, 'notti'),
    adulti: obbligatorio(T.TINYINT.UNSIGNED, 1),
    bambini: obbligatorio(T.TINYINT.UNSIGNED, 0),
    stato: obbligatorio(T.ENUM(...STATI_PRENOTAZIONE), 'in_attesa'),
    canale: obbligatorio(T.ENUM(...CANALI), 'diretto'),
    id_esterno: T.STRING(100),
    valuta: obbligatorio(T.CHAR(3), 'EUR'),
    importo_soggiorno: obbligatorio(EURO, 0),
    sconto_promozione: obbligatorio(EURO, 0),
    sconto_codice: obbligatorio(EURO, 0),
    percentuale_fedelta: obbligatorio(PERCENTUALE, 0),
    sconto_fedelta: obbligatorio(EURO, 0),
    importo_pacchetto: obbligatorio(EURO, 0),
    importo_servizi: obbligatorio(EURO, 0),
    tassa_soggiorno: obbligatorio(EURO, 0),
    totale: generata(EURO, 'totale'),
    acconto_richiesto: obbligatorio(EURO, 0),
    dettaglio_prezzo: json('dettaglio_prezzo'),
    rimborsabile: obbligatorio(T.BOOLEAN, true),
    ore_cancellazione_gratuita: obbligatorio(T.SMALLINT.UNSIGNED, 48),
    penale_percentuale: obbligatorio(PERCENTUALE, 0),
    richieste_speciali: T.TEXT,
    note_interne: T.TEXT,
    ora_arrivo_prevista: T.TIME,
    scade_il: T.DATE,
    token_checkin: T.CHAR(64),
    token_checkin_scade_il: T.DATE,
    checkin_online_il: T.DATE,
    arrivo_effettivo_il: T.DATE,
    partenza_effettiva_il: T.DATE,
    cancellata_il: T.DATE,
    motivo_cancellazione: T.STRING(255),
    penale_applicata: obbligatorio(EURO, 0),
    creato_da: rif(),
  });

  const PrenotazioneOspite = sequelize.define(
    'prenotazioni_ospiti',
    {
      prenotazione_id: { type: T.INTEGER.UNSIGNED, primaryKey: true },
      ospite_id: { type: T.INTEGER.UNSIGNED, primaryKey: true },
      tipo_alloggiato: obbligatorio(
        T.ENUM('ospite_singolo', 'capofamiglia', 'capogruppo', 'familiare', 'membro_gruppo'),
        'ospite_singolo',
      ),
      esente_tassa: obbligatorio(T.BOOLEAN, false),
      motivo_esenzione: T.STRING(100),
    },
    { timestamps: false },
  );

  const PrenotazioneServizio = sequelize.define(
    'prenotazioni_servizi',
    {
      prenotazione_id: { type: T.INTEGER.UNSIGNED, primaryKey: true },
      servizio_id: { type: T.INTEGER.UNSIGNED, primaryKey: true },
      quantita: obbligatorio(T.SMALLINT.UNSIGNED, 1),
      prezzo_unitario: obbligatorio(EURO),
      calcolo_prezzo: obbligatorio(CALCOLO_PREZZO),
      totale: obbligatorio(EURO),
    },
    { timestamps: false },
  );

  const BloccoTemporaneo = sequelize.define(
    'blocchi_temporanei',
    {
      id: id(),
      camera_id: rif(true),
      data_arrivo: obbligatorio(T.DATEONLY),
      data_partenza: obbligatorio(T.DATEONLY),
      sessione: obbligatorio(T.CHAR(36)),
      utente_id: rif(),
      visitatore_id: rif(),
      scade_il: obbligatorio(T.DATE),
    },
    { updatedAt: false },
  );

  const InvioAlloggiati = sequelize.define(
    'invii_alloggiati',
    {
      id: id(),
      prenotazione_id: rif(true),
      ospite_id: rif(true),
      schedina: obbligatorio(T.STRING(200)),
      esito: obbligatorio(T.ENUM('inviata', 'errore', 'test')),
      messaggio: T.TEXT,
      inviato_da: rif(),
    },
    { createdAt: 'inviato_il', updatedAt: false },
  );

  // ospite_id: copiato dalla prenotazione dal trigger.
  const Recensione = sequelize.define('recensioni', {
    id: id(),
    prenotazione_id: rif(true),
    ospite_id: obbligatorio(T.INTEGER.UNSIGNED, 0),
    utente_id: rif(),
    voto: obbligatorio(VOTO),
    voto_pulizia: VOTO,
    voto_personale: VOTO,
    voto_posizione: VOTO,
    voto_comfort: VOTO,
    voto_qualita_prezzo: VOTO,
    titolo: T.STRING(150),
    commento: T.TEXT,
    lingua: obbligatorio(T.CHAR(2), 'it'),
    anonima: obbligatorio(T.BOOLEAN, false),
    stato: obbligatorio(T.ENUM('in_attesa', 'pubblicata', 'rifiutata'), 'in_attesa'),
    moderata_da: rif(),
    moderata_il: T.DATE,
    risposta: T.TEXT,
    risposta_da: rif(),
    risposta_il: T.DATE,
  });

  return {
    CalendarioEsterno,
    DataBloccata,
    Prenotazione,
    PrenotazioneOspite,
    PrenotazioneServizio,
    BloccoTemporaneo,
    InvioAlloggiati,
    Recensione,
  };
};

module.exports.STATI_PRENOTAZIONE = STATI_PRENOTAZIONE;
module.exports.CANALI = CANALI;
