// Ospiti (dati TULPS / Alloggiati Web), loro documenti e consensi GDPR.

const { T, id, rif, obbligatorio, uuid } = require('./campi');

module.exports = (sequelize) => {
  const AlloggiatiLuogo = sequelize.define(
    'alloggiati_luoghi',
    {
      codice: { type: T.CHAR(9), primaryKey: true },
      descrizione: obbligatorio(T.STRING(100)),
      provincia: T.CHAR(2),
      tipo: obbligatorio(T.ENUM('comune', 'stato')),
      soppresso_il: T.DATEONLY,
    },
    { timestamps: false },
  );

  const AlloggiatiDocumento = sequelize.define(
    'alloggiati_documenti',
    {
      codice: { type: T.STRING(5), primaryKey: true },
      descrizione: obbligatorio(T.STRING(100)),
    },
    { timestamps: false },
  );

  const Ospite = sequelize.define(
    'ospiti',
    {
      id: id(),
      uuid: uuid(),
      utente_id: rif(),
      nome: obbligatorio(T.STRING(100)),
      cognome: obbligatorio(T.STRING(100)),
      email: T.STRING(255),
      telefono: T.STRING(30),
      sesso: T.ENUM('M', 'F'),
      data_nascita: T.DATEONLY,
      cittadinanza_codice: T.CHAR(9),
      stato_nascita_codice: T.CHAR(9),
      comune_nascita_codice: T.CHAR(9),
      tipo_documento: T.STRING(5),
      numero_documento: T.STRING(30),
      luogo_rilascio_codice: T.CHAR(9),
      scadenza_documento: T.DATEONLY,
      codice_fiscale: T.CHAR(16),
      indirizzo: T.STRING(255),
      cap: T.STRING(10),
      citta: T.STRING(100),
      provincia: T.CHAR(2),
      paese: T.CHAR(2),
      lingua: obbligatorio(T.CHAR(2), 'it'),
      note: T.TEXT,
    },
    { paranoid: true },
  );

  const DocumentoOspite = sequelize.define(
    'documenti_ospite',
    {
      id: id(),
      ospite_id: rif(true),
      nome_originale: obbligatorio(T.STRING(255)),
      percorso: obbligatorio(T.STRING(255)),
      tipo_mime: obbligatorio(T.STRING(50)),
      dimensione: obbligatorio(T.INTEGER.UNSIGNED),
    },
    { createdAt: 'caricato_il', updatedAt: false },
  );

  const Consenso = sequelize.define(
    'consensi',
    {
      id: id(),
      utente_id: rif(),
      visitatore_id: rif(),
      ospite_id: rif(),
      documento_id: rif(),
      tipo: obbligatorio(T.ENUM('privacy', 'termini', 'marketing', 'cookie')),
      accettato: obbligatorio(T.BOOLEAN),
      ip: T.STRING(45),
      user_agent: T.STRING(255),
    },
    { updatedAt: false },
  );

  return { AlloggiatiLuogo, AlloggiatiDocumento, Ospite, DocumentoOspite, Consenso };
};
