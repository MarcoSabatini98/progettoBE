// Tipologie, camere e servizi (dotazioni incluse ed extra acquistabili).

const { T, EURO, PERCENTUALE, id, rif, obbligatorio } = require('./campi');

const CALCOLO_PREZZO = T.ENUM('a_soggiorno', 'a_notte', 'a_persona', 'a_persona_notte');

module.exports = (sequelize) => {
  const TipologiaCamera = sequelize.define(
    'tipologie_camera',
    {
      id: id(),
      nome: obbligatorio(T.STRING(100)),
      slug: obbligatorio(T.STRING(120)),
      descrizione: T.TEXT,
      prezzo_base: obbligatorio(EURO),
      ospiti_max: obbligatorio(T.TINYINT.UNSIGNED, 2),
      superficie_mq: T.SMALLINT.UNSIGNED,
      letti: T.STRING(100),
      ordine: obbligatorio(T.SMALLINT, 0),
      attiva: obbligatorio(T.BOOLEAN, true),
    },
    { paranoid: true },
  );

  const Servizio = sequelize.define(
    'servizi',
    {
      id: id(),
      nome: obbligatorio(T.STRING(100)),
      descrizione: T.STRING(255),
      icona: T.STRING(50),
      tipo: obbligatorio(T.ENUM('dotazione', 'extra'), 'dotazione'),
      prezzo: obbligatorio(EURO, 0),
      calcolo_prezzo: obbligatorio(CALCOLO_PREZZO, 'a_soggiorno'),
      aliquota_iva: PERCENTUALE,
      ordine: obbligatorio(T.SMALLINT, 0),
      attivo: obbligatorio(T.BOOLEAN, true),
    },
    { paranoid: true },
  );

  const TipologiaCameraServizio = sequelize.define(
    'tipologie_camera_servizi',
    {
      tipologia_id: { type: T.INTEGER.UNSIGNED, primaryKey: true },
      servizio_id: { type: T.INTEGER.UNSIGNED, primaryKey: true },
    },
    { timestamps: false },
  );

  const Camera = sequelize.define(
    'camere',
    {
      id: id(),
      numero: obbligatorio(T.STRING(10)),
      nome: T.STRING(100),
      tipologia_id: rif(true),
      piano: obbligatorio(T.TINYINT, 0),
      ospiti_max: T.TINYINT.UNSIGNED,
      stato: obbligatorio(T.ENUM('attiva', 'manutenzione', 'fuori_servizio'), 'attiva'),
      stato_pulizia: obbligatorio(
        T.ENUM('pulita', 'sporca', 'in_pulizia', 'da_ispezionare'),
        'pulita',
      ),
      token_ical: T.CHAR(64),
      note: T.TEXT,
    },
    { paranoid: true },
  );

  const CameraServizio = sequelize.define(
    'camere_servizi',
    {
      camera_id: { type: T.INTEGER.UNSIGNED, primaryKey: true },
      servizio_id: { type: T.INTEGER.UNSIGNED, primaryKey: true },
    },
    { timestamps: false },
  );

  return { TipologiaCamera, Servizio, TipologiaCameraServizio, Camera, CameraServizio };
};

module.exports.CALCOLO_PREZZO = CALCOLO_PREZZO;
