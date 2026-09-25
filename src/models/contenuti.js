// Impostazioni, traduzioni, documenti legali, media, FAQ ed eventi speciali.

const { T, id, rif, obbligatorio } = require('./campi');

module.exports = (sequelize) => {
  const Impostazione = sequelize.define(
    'impostazioni',
    {
      chiave: { type: T.STRING(60), primaryKey: true },
      valore: obbligatorio(T.TEXT),
      tipo: obbligatorio(T.ENUM('testo', 'numero', 'booleano', 'json'), 'testo'),
      gruppo: obbligatorio(T.STRING(30), 'generale'),
      descrizione: T.STRING(255),
      pubblica: obbligatorio(T.BOOLEAN, false),
      aggiornato_da: rif(),
    },
    { createdAt: false },
  );

  const Traduzione = sequelize.define(
    'traduzioni',
    {
      id: id(),
      entita: obbligatorio(T.STRING(30)),
      entita_id: obbligatorio(T.INTEGER.UNSIGNED),
      campo: obbligatorio(T.STRING(30)),
      lingua: obbligatorio(T.CHAR(2)),
      testo: obbligatorio(T.TEXT),
    },
    { createdAt: false },
  );

  const DocumentoLegale = sequelize.define(
    'documenti_legali',
    {
      id: id(),
      tipo: obbligatorio(T.ENUM('privacy', 'termini', 'cookie')),
      versione: obbligatorio(T.STRING(20)),
      lingua: obbligatorio(T.CHAR(2), 'it'),
      contenuto: T.TEXT('medium'),
      percorso_pdf: T.STRING(255),
      pubblicato_il: T.DATE,
      creato_da: rif(),
    },
    { updatedAt: false },
  );

  // Relazione polimorfica: entita + entita_id (vedi associazioni in index.js).
  const Media = sequelize.define(
    'media',
    {
      id: id(),
      entita: obbligatorio(
        T.ENUM(
          'camera',
          'tipologia_camera',
          'servizio',
          'pacchetto',
          'struttura',
          'home',
          'logo',
          'varie',
        ),
      ),
      entita_id: rif(),
      percorso: obbligatorio(T.STRING(255)),
      tipo_mime: obbligatorio(T.STRING(50)),
      dimensione: obbligatorio(T.INTEGER.UNSIGNED),
      larghezza: T.SMALLINT.UNSIGNED,
      altezza: T.SMALLINT.UNSIGNED,
      testo_alternativo: obbligatorio(T.STRING(255), ''),
      ordine: obbligatorio(T.SMALLINT, 0),
    },
    { updatedAt: false },
  );

  const Faq = sequelize.define('faq', {
    id: id(),
    domanda: obbligatorio(T.STRING(255)),
    risposta: obbligatorio(T.TEXT),
    categoria: T.STRING(50),
    ordine: obbligatorio(T.SMALLINT, 0),
    pubblicata: obbligatorio(T.BOOLEAN, true),
    creato_da: rif(),
    aggiornato_da: rif(),
  });

  const EventoSpeciale = sequelize.define('eventi_speciali', {
    id: id(),
    titolo: obbligatorio(T.STRING(150)),
    tipo: obbligatorio(T.ENUM('festivita', 'evento_locale', 'fiera', 'altro'), 'altro'),
    data_inizio: obbligatorio(T.DATEONLY),
    data_fine: obbligatorio(T.DATEONLY),
    impatto: obbligatorio(T.TINYINT.UNSIGNED, 5),
    note: T.TEXT,
  });

  return { Impostazione, Traduzione, DocumentoLegale, Media, Faq, EventoSpeciale };
};
