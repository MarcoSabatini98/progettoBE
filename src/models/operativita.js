// Pulizie (con checklist) e segnalazioni di manutenzione.

const { T, id, rif, obbligatorio, json } = require('./campi');

const TIPO_PULIZIA = T.ENUM('partenza', 'riassetto', 'profonda', 'ispezione');
const PRIORITA = T.ENUM('bassa', 'normale', 'alta', 'urgente');

module.exports = (sequelize) => {
  const ChecklistModello = sequelize.define(
    'checklist_modelli',
    {
      id: id(),
      voce: obbligatorio(T.STRING(150)),
      tipo_pulizia: TIPO_PULIZIA,
      ordine: obbligatorio(T.SMALLINT, 0),
      attiva: obbligatorio(T.BOOLEAN, true),
    },
    { timestamps: false },
  );

  // I trigger aggiornano camere.stato_pulizia e le date di avanzamento.
  const AttivitaPulizia = sequelize.define('attivita_pulizia', {
    id: id(),
    camera_id: rif(true),
    prenotazione_id: rif(),
    assegnata_a: rif(),
    data_prevista: obbligatorio(T.DATEONLY),
    tipo: obbligatorio(TIPO_PULIZIA, 'riassetto'),
    priorita: obbligatorio(PRIORITA, 'normale'),
    stato: obbligatorio(T.ENUM('da_fare', 'in_corso', 'completata', 'verificata'), 'da_fare'),
    checklist: json('checklist'),
    note: T.TEXT,
    iniziata_il: T.DATE,
    completata_il: T.DATE,
    verificata_il: T.DATE,
    verificata_da: rif(),
    creato_da: rif(),
  });

  const SegnalazioneManutenzione = sequelize.define('segnalazioni_manutenzione', {
    id: id(),
    camera_id: rif(),
    titolo: obbligatorio(T.STRING(150)),
    descrizione: T.TEXT,
    priorita: obbligatorio(PRIORITA, 'normale'),
    stato: obbligatorio(T.ENUM('aperta', 'in_corso', 'risolta', 'annullata'), 'aperta'),
    segnalata_da: rif(),
    assegnata_a: rif(),
    risolta_il: T.DATE,
    note_risoluzione: T.TEXT,
  });

  return { ChecklistModello, AttivitaPulizia, SegnalazioneManutenzione };
};
