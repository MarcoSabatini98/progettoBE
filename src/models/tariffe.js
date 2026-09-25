// Piani e periodi tariffari, promozioni, codici sconto, pacchetti,
// tassa di soggiorno e programma fedeltà.

const { T, EURO, PERCENTUALE, id, rif, obbligatorio, generata } = require('./campi');

module.exports = (sequelize) => {
  const PianoTariffario = sequelize.define('piani_tariffari', {
    id: id(),
    nome: obbligatorio(T.STRING(100)),
    descrizione: T.TEXT,
    tipo_variazione: obbligatorio(T.ENUM('percentuale', 'importo'), 'percentuale'),
    valore_variazione: obbligatorio(EURO, 0),
    rimborsabile: obbligatorio(T.BOOLEAN, true),
    ore_cancellazione_gratuita: obbligatorio(T.SMALLINT.UNSIGNED, 48),
    penale_percentuale: obbligatorio(PERCENTUALE, 0),
    acconto_percentuale: obbligatorio(PERCENTUALE, 30),
    predefinito: obbligatorio(T.BOOLEAN, false),
    predefinito_unico: generata(T.TINYINT, 'predefinito_unico'),
    attivo: obbligatorio(T.BOOLEAN, true),
    ordine: obbligatorio(T.SMALLINT, 0),
  });

  const PeriodoTariffario = sequelize.define('periodi_tariffari', {
    id: id(),
    nome: obbligatorio(T.STRING(100)),
    tipologia_id: rif(),
    data_inizio: obbligatorio(T.DATEONLY),
    data_fine: obbligatorio(T.DATEONLY),
    // bit: 1=lun 2=mar 4=mer 8=gio 16=ven 32=sab 64=dom
    giorni_settimana: obbligatorio(T.TINYINT.UNSIGNED, 127),
    tipo_variazione: obbligatorio(T.ENUM('percentuale', 'importo', 'prezzo_fisso')),
    valore: obbligatorio(EURO),
    soggiorno_minimo: T.TINYINT.UNSIGNED,
    priorita: obbligatorio(T.SMALLINT, 0),
    attivo: obbligatorio(T.BOOLEAN, true),
    creato_da: rif(),
    aggiornato_da: rif(),
  });

  const Promozione = sequelize.define('promozioni', {
    id: id(),
    nome: obbligatorio(T.STRING(100)),
    descrizione: T.TEXT,
    tipologia_id: rif(),
    soggiorno_dal: obbligatorio(T.DATEONLY),
    soggiorno_al: obbligatorio(T.DATEONLY),
    prenotabile_dal: T.DATEONLY,
    prenotabile_al: T.DATEONLY,
    tipo_sconto: obbligatorio(T.ENUM('percentuale', 'importo')),
    valore: obbligatorio(EURO),
    ospiti_min: T.TINYINT.UNSIGNED,
    ospiti_max: T.TINYINT.UNSIGNED,
    notti_min: T.TINYINT.UNSIGNED,
    attiva: obbligatorio(T.BOOLEAN, true),
    creato_da: rif(),
  });

  const CodiceSconto = sequelize.define('codici_sconto', {
    id: id(),
    codice: obbligatorio(T.STRING(30)),
    descrizione: T.STRING(255),
    tipo_sconto: obbligatorio(T.ENUM('percentuale', 'importo')),
    valore: obbligatorio(EURO),
    valido_dal: T.DATEONLY,
    valido_al: T.DATEONLY,
    importo_minimo: EURO,
    notti_min: T.TINYINT.UNSIGNED,
    utilizzi_max: T.INTEGER.UNSIGNED,
    utilizzi_per_utente: T.SMALLINT.UNSIGNED,
    utilizzi: obbligatorio(T.INTEGER.UNSIGNED, 0),
    attivo: obbligatorio(T.BOOLEAN, true),
    creato_da: rif(),
  });

  const Pacchetto = sequelize.define('pacchetti', {
    id: id(),
    nome: obbligatorio(T.STRING(100)),
    slug: obbligatorio(T.STRING(120)),
    descrizione: T.TEXT,
    prezzo: obbligatorio(EURO),
    tipologia_id: rif(),
    notti_min: T.TINYINT.UNSIGNED,
    valido_dal: T.DATEONLY,
    valido_al: T.DATEONLY,
    attivo: obbligatorio(T.BOOLEAN, true),
    ordine: obbligatorio(T.SMALLINT, 0),
  });

  const PacchettoServizio = sequelize.define(
    'pacchetti_servizi',
    {
      pacchetto_id: { type: T.INTEGER.UNSIGNED, primaryKey: true },
      servizio_id: { type: T.INTEGER.UNSIGNED, primaryKey: true },
      quantita: obbligatorio(T.SMALLINT.UNSIGNED, 1),
    },
    { timestamps: false },
  );

  const TassaSoggiorno = sequelize.define('tassa_soggiorno', {
    id: id(),
    nome: obbligatorio(T.STRING(100)),
    valida_dal: obbligatorio(T.DATEONLY),
    valida_al: obbligatorio(T.DATEONLY),
    importo_notte: obbligatorio(T.DECIMAL(6, 2)),
    notti_max: T.TINYINT.UNSIGNED,
    eta_esenzione: T.TINYINT.UNSIGNED,
    attiva: obbligatorio(T.BOOLEAN, true),
  });

  const LivelloFedelta = sequelize.define(
    'livelli_fedelta',
    {
      id: id(T.TINYINT.UNSIGNED),
      codice: obbligatorio(T.STRING(20)),
      nome: obbligatorio(T.STRING(50)),
      punti_minimi: obbligatorio(T.INTEGER.UNSIGNED),
      sconto_percentuale: obbligatorio(PERCENTUALE, 0),
      colore: T.CHAR(7),
    },
    { timestamps: false },
  );

  // Il saldo in utenti.punti_fedelta è aggiornato dal trigger.
  const MovimentoPunti = sequelize.define(
    'movimenti_punti',
    {
      id: id(),
      utente_id: rif(true),
      prenotazione_id: rif(),
      punti: obbligatorio(T.INTEGER),
      motivo: obbligatorio(T.ENUM('soggiorno', 'bonus', 'rettifica', 'annullamento')),
      note: T.STRING(255),
      creato_da: rif(),
    },
    { updatedAt: false },
  );

  return {
    PianoTariffario,
    PeriodoTariffario,
    Promozione,
    CodiceSconto,
    Pacchetto,
    PacchettoServizio,
    TassaSoggiorno,
    LivelloFedelta,
    MovimentoPunti,
  };
};
