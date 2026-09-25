// Ruoli, permessi, regole chat, utenti, token e visitatori.

const { T, id, rif, obbligatorio, uuid } = require('./campi');

module.exports = (sequelize) => {
  const Ruolo = sequelize.define(
    'ruoli',
    {
      codice: { type: T.STRING(30), primaryKey: true },
      nome: obbligatorio(T.STRING(50)),
      descrizione: T.STRING(255),
      staff: obbligatorio(T.BOOLEAN, false),
    },
    { timestamps: false },
  );

  const Permesso = sequelize.define(
    'permessi',
    {
      codice: { type: T.STRING(50), primaryKey: true },
      modulo: obbligatorio(T.STRING(30)),
      descrizione: obbligatorio(T.STRING(255)),
    },
    { timestamps: false },
  );

  const RuoloPermesso = sequelize.define(
    'ruoli_permessi',
    {
      ruolo: { type: T.STRING(30), primaryKey: true },
      permesso: { type: T.STRING(50), primaryKey: true },
    },
    { timestamps: false },
  );

  // La coppia viene riordinata dal trigger (ruolo_a <= ruolo_b).
  const RegolaChat = sequelize.define(
    'regole_chat',
    {
      ruolo_a: { type: T.STRING(30), primaryKey: true },
      ruolo_b: { type: T.STRING(30), primaryKey: true },
    },
    { timestamps: false },
  );

  const Utente = sequelize.define(
    'utenti',
    {
      id: id(),
      uuid: uuid(),
      email: obbligatorio(T.STRING(255)),
      password_hash: obbligatorio(T.STRING(255)),
      ruolo: obbligatorio(T.STRING(30), 'cliente'),
      nome: obbligatorio(T.STRING(100)),
      cognome: obbligatorio(T.STRING(100)),
      telefono: T.STRING(30),
      lingua: obbligatorio(T.CHAR(2), 'it'),
      attivo: obbligatorio(T.BOOLEAN, true),
      email_verificata_il: T.DATE,
      notifiche_email: obbligatorio(T.BOOLEAN, true),
      punti_fedelta: obbligatorio(T.INTEGER, 0),
      ospite_id: rif(),
      ultimo_accesso_il: T.DATE,
      // Colore dell'avatar: casuale ma stabile, ricavato dall'uuid.
      colore_avatar: {
        type: T.VIRTUAL,
        get() {
          const codice = this.getDataValue('uuid');
          return codice ? `hsl(${parseInt(codice.slice(0, 8), 16) % 360} 55% 45%)` : null;
        },
      },
    },
    {
      paranoid: true,
      // l'hash della password non esce mai per sbaglio: va chiesto con scope('autenticazione')
      defaultScope: { attributes: { exclude: ['password_hash'] } },
      scopes: { autenticazione: {} },
    },
  );

  const TokenUtente = sequelize.define(
    'token_utente',
    {
      id: id(),
      utente_id: rif(true),
      tipo: obbligatorio(T.ENUM('refresh', 'verifica_email', 'reset_password')),
      hash_token: obbligatorio(T.CHAR(64)),
      famiglia: T.CHAR(36),
      tentativi: obbligatorio(T.TINYINT.UNSIGNED, 0),
      scade_il: obbligatorio(T.DATE),
      usato_il: T.DATE,
      revocato_il: T.DATE,
      ip: T.STRING(45),
      user_agent: T.STRING(255),
    },
    { updatedAt: false },
  );

  const Visitatore = sequelize.define(
    'visitatori',
    {
      id: id(),
      uuid: uuid(),
      nome: T.STRING(100),
      email: T.STRING(255),
      lingua: obbligatorio(T.CHAR(2), 'it'),
      utente_id: rif(),
      ip: T.STRING(45),
      user_agent: T.STRING(255),
      bloccato: obbligatorio(T.BOOLEAN, false),
      ultimo_accesso_il: T.DATE,
    },
    { updatedAt: false },
  );

  return { Ruolo, Permesso, RuoloPermesso, RegolaChat, Utente, TokenUtente, Visitatore };
};
