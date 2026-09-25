// Notifiche in-app e registro attività (scritto solo dai trigger).

const { T, id, rif, obbligatorio, json } = require('./campi');

module.exports = (sequelize) => {
  const Notifica = sequelize.define(
    'notifiche',
    {
      id: id(T.BIGINT.UNSIGNED),
      utente_id: rif(true),
      tipo: obbligatorio(
        T.ENUM(
          'prenotazione',
          'pagamento',
          'pulizia',
          'manutenzione',
          'chat',
          'recensione',
          'sistema',
        ),
      ),
      priorita: obbligatorio(T.ENUM('info', 'successo', 'avviso', 'errore'), 'info'),
      titolo: obbligatorio(T.STRING(150)),
      testo: T.TEXT,
      link: T.STRING(255),
      letta_il: T.DATE,
    },
    { updatedAt: false, paranoid: true },
  );

  const RegistroAttivita = sequelize.define(
    'registro_attivita',
    {
      id: id(T.BIGINT.UNSIGNED),
      tabella: obbligatorio(T.STRING(50)),
      record_id: obbligatorio(T.INTEGER.UNSIGNED),
      azione: obbligatorio(T.ENUM('inserimento', 'modifica', 'eliminazione')),
      dati_prima: json('dati_prima'),
      dati_dopo: json('dati_dopo'),
      utente_id: rif(),
      ip: T.STRING(45),
    },
    { updatedAt: false },
  );

  return { Notifica, RegistroAttivita };
};
