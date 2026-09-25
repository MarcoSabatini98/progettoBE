// Carica tutti i modelli e definisce le associazioni.
// Uso: const { Prenotazione, Camera, transazione } = require('../models');
//
// Gli alias (as) sono in snake_case come le colonne e non coincidono mai con
// il nome di una colonna (Sequelize lo vieta): es. assegnata_a → "addetto".
// Le FK esistono già nel database: constraints:false evita che Sequelize
// provi a gestirle (lo schema si crea solo da database/schema.sql).

const { sequelize, transazione } = require('../config/db');

const modelli = Object.assign(
  {},
  ...[
    'accesso',
    'contenuti',
    'camere',
    'tariffe',
    'ospiti',
    'prenotazioni',
    'contabilita',
    'operativita',
    'chat',
    'sistema',
  ].map((file) => require(`./${file}`)(sequelize)),
);

const {
  Ruolo,
  Permesso,
  RuoloPermesso,
  Utente,
  TokenUtente,
  Visitatore,
  Impostazione,
  DocumentoLegale,
  Media,
  Faq,
  TipologiaCamera,
  Servizio,
  TipologiaCameraServizio,
  Camera,
  CameraServizio,
  PianoTariffario,
  PeriodoTariffario,
  Promozione,
  CodiceSconto,
  Pacchetto,
  PacchettoServizio,
  MovimentoPunti,
  Ospite,
  DocumentoOspite,
  Consenso,
  CalendarioEsterno,
  DataBloccata,
  Prenotazione,
  PrenotazioneOspite,
  PrenotazioneServizio,
  BloccoTemporaneo,
  InvioAlloggiati,
  Recensione,
  Fattura,
  FatturaRiga,
  Pagamento,
  AttivitaPulizia,
  SegnalazioneManutenzione,
  Conversazione,
  ConversazionePartecipante,
  Messaggio,
  MessaggioAllegato,
  ChatRiepilogoEmail,
  Notifica,
} = modelli;

/** figlio.foreignKey → padre. Con "inverso" aggiunge anche padre.hasMany(figlio). */
function appartiene(figlio, padre, foreignKey, as, inverso) {
  figlio.belongsTo(padre, { foreignKey, as, constraints: false });
  if (inverso) padre.hasMany(figlio, { foreignKey, as: inverso, constraints: false });
}

/** Molti-a-molti tramite tabella ponte, nei due sensi. */
function moltiAMolti(a, b, through, [chiaveA, chiaveB], [asDaA, asDaB]) {
  a.belongsToMany(b, {
    through,
    foreignKey: chiaveA,
    otherKey: chiaveB,
    as: asDaA,
    constraints: false,
  });
  b.belongsToMany(a, {
    through,
    foreignKey: chiaveB,
    otherKey: chiaveA,
    as: asDaB,
    constraints: false,
  });
}

// --- accesso -----------------------------------------------------------------
moltiAMolti(Ruolo, Permesso, RuoloPermesso, ['ruolo', 'permesso'], ['permessi', 'ruoli']);
appartiene(Utente, Ruolo, 'ruolo', 'dati_ruolo', 'utenti');
appartiene(TokenUtente, Utente, 'utente_id', 'utente', 'token');
appartiene(Visitatore, Utente, 'utente_id', 'utente');

// area cliente: la propria anagrafica (con i documenti) e gli ospiti salvati
appartiene(Utente, Ospite, 'ospite_id', 'anagrafica');
appartiene(Ospite, Utente, 'utente_id', 'utente', 'ospiti_salvati');

// --- contenuti ---------------------------------------------------------------
appartiene(Impostazione, Utente, 'aggiornato_da', 'modificatore');
appartiene(DocumentoLegale, Utente, 'creato_da', 'autore');
appartiene(Faq, Utente, 'creato_da', 'autore');
appartiene(Faq, Utente, 'aggiornato_da', 'modificatore');

// media polimorfici: ogni entità vede solo le proprie immagini
for (const [modello, entita] of [
  [Camera, 'camera'],
  [TipologiaCamera, 'tipologia_camera'],
  [Servizio, 'servizio'],
  [Pacchetto, 'pacchetto'],
]) {
  modello.hasMany(Media, {
    foreignKey: 'entita_id',
    scope: { entita },
    as: 'media',
    constraints: false,
  });
}

// --- camere ------------------------------------------------------------------
appartiene(Camera, TipologiaCamera, 'tipologia_id', 'tipologia', 'camere');
moltiAMolti(
  TipologiaCamera,
  Servizio,
  TipologiaCameraServizio,
  ['tipologia_id', 'servizio_id'],
  ['servizi', 'tipologie'],
);
moltiAMolti(Camera, Servizio, CameraServizio, ['camera_id', 'servizio_id'], ['servizi', 'camere']);

// --- tariffe -----------------------------------------------------------------
appartiene(PeriodoTariffario, TipologiaCamera, 'tipologia_id', 'tipologia', 'periodi_tariffari');
appartiene(PeriodoTariffario, Utente, 'creato_da', 'autore');
appartiene(PeriodoTariffario, Utente, 'aggiornato_da', 'modificatore');
appartiene(Promozione, TipologiaCamera, 'tipologia_id', 'tipologia', 'promozioni');
appartiene(Promozione, Utente, 'creato_da', 'autore');
appartiene(CodiceSconto, Utente, 'creato_da', 'autore');
appartiene(Pacchetto, TipologiaCamera, 'tipologia_id', 'tipologia', 'pacchetti');
moltiAMolti(
  Pacchetto,
  Servizio,
  PacchettoServizio,
  ['pacchetto_id', 'servizio_id'],
  ['servizi', 'pacchetti'],
);
appartiene(MovimentoPunti, Utente, 'utente_id', 'utente', 'movimenti_punti');
appartiene(MovimentoPunti, Prenotazione, 'prenotazione_id', 'prenotazione', 'movimenti_punti');
appartiene(MovimentoPunti, Utente, 'creato_da', 'autore');

// --- ospiti ------------------------------------------------------------------
appartiene(DocumentoOspite, Ospite, 'ospite_id', 'ospite', 'documenti');
appartiene(Consenso, Utente, 'utente_id', 'utente', 'consensi');
appartiene(Consenso, Visitatore, 'visitatore_id', 'visitatore', 'consensi');
appartiene(Consenso, Ospite, 'ospite_id', 'ospite', 'consensi');
appartiene(Consenso, DocumentoLegale, 'documento_id', 'documento');

// --- prenotazioni ------------------------------------------------------------
appartiene(CalendarioEsterno, Camera, 'camera_id', 'camera', 'calendari_esterni');
appartiene(DataBloccata, Camera, 'camera_id', 'camera', 'date_bloccate');
appartiene(DataBloccata, CalendarioEsterno, 'calendario_id', 'calendario', 'date_bloccate');
appartiene(DataBloccata, Utente, 'creato_da', 'autore');

appartiene(Prenotazione, Ospite, 'ospite_id', 'titolare', 'prenotazioni_titolare');
appartiene(Prenotazione, Utente, 'utente_id', 'utente', 'prenotazioni');
appartiene(Prenotazione, Camera, 'camera_id', 'camera', 'prenotazioni');
appartiene(
  Prenotazione,
  PianoTariffario,
  'piano_tariffario_id',
  'piano_tariffario',
  'prenotazioni',
);
appartiene(Prenotazione, Promozione, 'promozione_id', 'promozione', 'prenotazioni');
appartiene(Prenotazione, CodiceSconto, 'codice_sconto_id', 'codice_sconto', 'prenotazioni');
appartiene(Prenotazione, Pacchetto, 'pacchetto_id', 'pacchetto', 'prenotazioni');
appartiene(Prenotazione, Utente, 'creato_da', 'autore');
moltiAMolti(
  Prenotazione,
  Ospite,
  PrenotazioneOspite,
  ['prenotazione_id', 'ospite_id'],
  ['ospiti', 'soggiorni'],
);
moltiAMolti(
  Prenotazione,
  Servizio,
  PrenotazioneServizio,
  ['prenotazione_id', 'servizio_id'],
  ['servizi', 'prenotazioni'],
);

appartiene(BloccoTemporaneo, Camera, 'camera_id', 'camera', 'blocchi_temporanei');
appartiene(BloccoTemporaneo, Utente, 'utente_id', 'utente');
appartiene(BloccoTemporaneo, Visitatore, 'visitatore_id', 'visitatore');
appartiene(InvioAlloggiati, Prenotazione, 'prenotazione_id', 'prenotazione', 'invii_alloggiati');
appartiene(InvioAlloggiati, Ospite, 'ospite_id', 'ospite', 'invii_alloggiati');
appartiene(InvioAlloggiati, Utente, 'inviato_da', 'mittente');

Prenotazione.hasOne(Recensione, {
  foreignKey: 'prenotazione_id',
  as: 'recensione',
  constraints: false,
});
Recensione.belongsTo(Prenotazione, {
  foreignKey: 'prenotazione_id',
  as: 'prenotazione',
  constraints: false,
});
appartiene(Recensione, Ospite, 'ospite_id', 'ospite', 'recensioni');
appartiene(Recensione, Utente, 'utente_id', 'utente', 'recensioni');
appartiene(Recensione, Utente, 'moderata_da', 'moderatore');
appartiene(Recensione, Utente, 'risposta_da', 'autore_risposta');

// --- contabilità -------------------------------------------------------------
appartiene(Fattura, Prenotazione, 'prenotazione_id', 'prenotazione', 'fatture');
appartiene(Fattura, Fattura, 'fattura_origine_id', 'fattura_origine', 'note_credito');
appartiene(Fattura, Utente, 'creato_da', 'autore');
appartiene(FatturaRiga, Fattura, 'fattura_id', 'fattura', 'righe');
appartiene(Pagamento, Prenotazione, 'prenotazione_id', 'prenotazione', 'pagamenti');
appartiene(Pagamento, Utente, 'registrato_da', 'operatore');

// --- operatività -------------------------------------------------------------
appartiene(AttivitaPulizia, Camera, 'camera_id', 'camera', 'attivita_pulizia');
appartiene(AttivitaPulizia, Prenotazione, 'prenotazione_id', 'prenotazione', 'attivita_pulizia');
appartiene(AttivitaPulizia, Utente, 'assegnata_a', 'addetto', 'pulizie_assegnate');
appartiene(AttivitaPulizia, Utente, 'verificata_da', 'verificatore');
appartiene(AttivitaPulizia, Utente, 'creato_da', 'autore');
appartiene(SegnalazioneManutenzione, Camera, 'camera_id', 'camera', 'segnalazioni');
appartiene(SegnalazioneManutenzione, Utente, 'segnalata_da', 'segnalatore');
appartiene(SegnalazioneManutenzione, Utente, 'assegnata_a', 'incaricato', 'manutenzioni_assegnate');

// --- chat --------------------------------------------------------------------
appartiene(Conversazione, Utente, 'cliente_id', 'cliente', 'conversazioni_cliente');
appartiene(Conversazione, Visitatore, 'visitatore_id', 'visitatore', 'conversazioni');
appartiene(Conversazione, Prenotazione, 'prenotazione_id', 'prenotazione', 'conversazioni');
appartiene(Conversazione, Utente, 'assegnata_a', 'operatore');
appartiene(Conversazione, Utente, 'creata_da', 'autore');
moltiAMolti(
  Conversazione,
  Utente,
  ConversazionePartecipante,
  ['conversazione_id', 'utente_id'],
  ['partecipanti', 'conversazioni_staff'],
);
appartiene(Messaggio, Conversazione, 'conversazione_id', 'conversazione', 'messaggi');
appartiene(Messaggio, Utente, 'mittente_utente_id', 'mittente_utente');
appartiene(Messaggio, Visitatore, 'mittente_visitatore_id', 'mittente_visitatore');
appartiene(Messaggio, Messaggio, 'risposta_a_id', 'risposta_a');
appartiene(MessaggioAllegato, Messaggio, 'messaggio_id', 'messaggio', 'allegati');
appartiene(ChatRiepilogoEmail, Conversazione, 'conversazione_id', 'conversazione');
appartiene(ChatRiepilogoEmail, Utente, 'utente_id', 'utente');

// --- sistema -----------------------------------------------------------------
appartiene(Notifica, Utente, 'utente_id', 'utente', 'notifiche');

module.exports = { sequelize, transazione, ...modelli };
