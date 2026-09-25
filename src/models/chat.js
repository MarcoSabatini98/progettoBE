// Chat di assistenza (clienti e visitatori) e chat interna dello staff.

const { T, id, rif, obbligatorio, uuid } = require('./campi');

const ID_MESSAGGIO = T.BIGINT.UNSIGNED;

module.exports = (sequelize) => {
  const Conversazione = sequelize.define('conversazioni', {
    id: id(),
    uuid: uuid(),
    tipo: obbligatorio(T.ENUM('assistenza', 'staff')),
    titolo: T.STRING(150),
    cliente_id: rif(),
    visitatore_id: rif(),
    prenotazione_id: rif(),
    assegnata_a: rif(),
    stato: obbligatorio(T.ENUM('aperta', 'chiusa'), 'aperta'),
    letto_cliente_il: T.DATE,
    ultimo_messaggio_il: T.DATE,
    creata_da: rif(),
  });

  const ConversazionePartecipante = sequelize.define(
    'conversazioni_partecipanti',
    {
      conversazione_id: { type: T.INTEGER.UNSIGNED, primaryKey: true },
      utente_id: { type: T.INTEGER.UNSIGNED, primaryKey: true },
      uscito_il: T.DATE,
      letto_fino_al: T.DATE,
    },
    { createdAt: 'entrato_il', updatedAt: false },
  );

  const Messaggio = sequelize.define(
    'messaggi',
    {
      id: id(ID_MESSAGGIO),
      conversazione_id: rif(true),
      mittente_utente_id: rif(),
      mittente_visitatore_id: rif(),
      di_sistema: obbligatorio(T.BOOLEAN, false),
      risposta_a_id: rif(false, ID_MESSAGGIO),
      testo: obbligatorio(T.TEXT),
      modificato_il: T.DATE,
    },
    { createdAt: 'inviato_il', updatedAt: false, paranoid: true },
  );

  const MessaggioAllegato = sequelize.define(
    'messaggi_allegati',
    {
      id: id(),
      messaggio_id: rif(true, ID_MESSAGGIO),
      nome_originale: obbligatorio(T.STRING(255)),
      percorso: obbligatorio(T.STRING(255)),
      tipo_mime: obbligatorio(T.STRING(100)),
      dimensione: obbligatorio(T.INTEGER.UNSIGNED),
    },
    { updatedAt: false },
  );

  const ChatRiepilogoEmail = sequelize.define(
    'chat_riepiloghi_email',
    {
      conversazione_id: { type: T.INTEGER.UNSIGNED, primaryKey: true },
      utente_id: { type: T.INTEGER.UNSIGNED, primaryKey: true },
      inviato_il: obbligatorio(T.DATE),
    },
    { timestamps: false },
  );

  return {
    Conversazione,
    ConversazionePartecipante,
    Messaggio,
    MessaggioAllegato,
    ChatRiepilogoEmail,
  };
};
