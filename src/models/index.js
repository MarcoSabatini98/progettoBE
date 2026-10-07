// models/index.js
//
// Carica tutti i modelli e dichiara le associazioni tra le tabelle.
// Uso: const { Prenotazione, Camera, transazione } = require('../models');
//
// Regole:
//   - lo schema si crea solo da database/schema.sql (mai sync()): le chiavi
//     esterne esistono già nel database, qui servono solo per gli include;
//   - un alias (as) non può avere lo stesso nome di una colonna del modello,
//     per questo ad es. la FK "ruolo" ha l'alias "dettagli_ruolo".

const { sequelize, transazione } = require('../config/db');

// ─────────────────────────────────────
// Import dei modelli
// ─────────────────────────────────────

// Accesso e permessi
const Ruolo = require('./Ruolo');
const Permesso = require('./Permesso');
const RuoloPermesso = require('./RuoloPermesso');
const RegolaChat = require('./RegolaChat');
const Utente = require('./Utente');
const TokenUtente = require('./TokenUtente');
const Visitatore = require('./Visitatore');

// Contenuti e configurazione
const Impostazione = require('./Impostazione');
const Traduzione = require('./Traduzione');
const DocumentoLegale = require('./DocumentoLegale');
const Media = require('./Media');
const Faq = require('./Faq');
const Pagina = require('./Pagina');
const Sezione = require('./Sezione');
const EventoSpeciale = require('./EventoSpeciale');

// Camere e servizi
const TipologiaCamera = require('./TipologiaCamera');
const Servizio = require('./Servizio');
const TipologiaCameraServizio = require('./TipologiaCameraServizio');
const Camera = require('./Camera');
const CameraServizio = require('./CameraServizio');

// Tariffe, sconti e fedeltà
const PianoTariffario = require('./PianoTariffario');
const PeriodoTariffario = require('./PeriodoTariffario');
const Promozione = require('./Promozione');
const CodiceSconto = require('./CodiceSconto');
const Pacchetto = require('./Pacchetto');
const PacchettoServizio = require('./PacchettoServizio');
const TassaSoggiorno = require('./TassaSoggiorno');
const LivelloFedelta = require('./LivelloFedelta');
const MovimentoPunti = require('./MovimentoPunti');

// Ospiti
const AlloggiatiLuogo = require('./AlloggiatiLuogo');
const AlloggiatiDocumento = require('./AlloggiatiDocumento');
const Ospite = require('./Ospite');
const DocumentoOspite = require('./DocumentoOspite');
const Consenso = require('./Consenso');

// Prenotazioni
const CalendarioEsterno = require('./CalendarioEsterno');
const DataBloccata = require('./DataBloccata');
const Prenotazione = require('./Prenotazione');
const PrenotazioneOspite = require('./PrenotazioneOspite');
const PrenotazioneServizio = require('./PrenotazioneServizio');
const BloccoTemporaneo = require('./BloccoTemporaneo');
const InvioAlloggiati = require('./InvioAlloggiati');
const Recensione = require('./Recensione');

// Contabilità
const ContatoreFattura = require('./ContatoreFattura');
const Fattura = require('./Fattura');
const FatturaRiga = require('./FatturaRiga');
const Pagamento = require('./Pagamento');
const EventoWebhook = require('./EventoWebhook');

// Pulizie e manutenzione
const ChecklistModello = require('./ChecklistModello');
const AttivitaPulizia = require('./AttivitaPulizia');
const SegnalazioneManutenzione = require('./SegnalazioneManutenzione');

// Chat
const Conversazione = require('./Conversazione');
const ConversazionePartecipante = require('./ConversazionePartecipante');
const Messaggio = require('./Messaggio');
const MessaggioAllegato = require('./MessaggioAllegato');
const ChatRiepilogoEmail = require('./ChatRiepilogoEmail');

// Sistema
const Notifica = require('./Notifica');
const RegistroAttivita = require('./RegistroAttivita');

// View-model (sola lettura, mappano le VIEW SQL — vedi src/models/views/)
const SaldoPrenotazione = require('./views/SaldoPrenotazione');
const Valutazioni = require('./views/Valutazioni');
const FedeltaUtente = require('./views/FedeltaUtente');
const StatoCamera = require('./views/StatoCamera');
const IncassoMensile = require('./views/IncassoMensile');
const TassaSoggiornoMensile = require('./views/TassaSoggiornoMensile');

// ─────────────────────────────────────
// MOLTI A MOLTI
// ─────────────────────────────────────

// Ruolo ↔ Permesso tramite ruoli_permessi
Ruolo.belongsToMany(Permesso, {
  through: RuoloPermesso,
  foreignKey: 'ruolo',
  otherKey: 'permesso',
  as: 'permessi',
});
Permesso.belongsToMany(Ruolo, {
  through: RuoloPermesso,
  foreignKey: 'permesso',
  otherKey: 'ruolo',
  as: 'ruoli',
});

// TipologiaCamera ↔ Servizio tramite tipologie_camera_servizi (dotazioni)
TipologiaCamera.belongsToMany(Servizio, {
  through: TipologiaCameraServizio,
  foreignKey: 'tipologia_id',
  otherKey: 'servizio_id',
  as: 'servizi',
});
Servizio.belongsToMany(TipologiaCamera, {
  through: TipologiaCameraServizio,
  foreignKey: 'servizio_id',
  otherKey: 'tipologia_id',
  as: 'tipologie',
});

// Camera ↔ Servizio tramite camere_servizi (dotazioni in più della singola camera)
Camera.belongsToMany(Servizio, {
  through: CameraServizio,
  foreignKey: 'camera_id',
  otherKey: 'servizio_id',
  as: 'servizi',
});
Servizio.belongsToMany(Camera, {
  through: CameraServizio,
  foreignKey: 'servizio_id',
  otherKey: 'camera_id',
  as: 'camere',
});

// Pacchetto ↔ Servizio tramite pacchetti_servizi
Pacchetto.belongsToMany(Servizio, {
  through: PacchettoServizio,
  foreignKey: 'pacchetto_id',
  otherKey: 'servizio_id',
  as: 'servizi',
});
Servizio.belongsToMany(Pacchetto, {
  through: PacchettoServizio,
  foreignKey: 'servizio_id',
  otherKey: 'pacchetto_id',
  as: 'pacchetti',
});

// Prenotazione ↔ Ospite tramite prenotazioni_ospiti (tutti gli ospiti del soggiorno)
Prenotazione.belongsToMany(Ospite, {
  through: PrenotazioneOspite,
  foreignKey: 'prenotazione_id',
  otherKey: 'ospite_id',
  as: 'ospiti',
});
Ospite.belongsToMany(Prenotazione, {
  through: PrenotazioneOspite,
  foreignKey: 'ospite_id',
  otherKey: 'prenotazione_id',
  as: 'soggiorni',
});

// Prenotazione ↔ Servizio tramite prenotazioni_servizi (extra acquistati)
Prenotazione.belongsToMany(Servizio, {
  through: PrenotazioneServizio,
  foreignKey: 'prenotazione_id',
  otherKey: 'servizio_id',
  as: 'servizi',
});
Servizio.belongsToMany(Prenotazione, {
  through: PrenotazioneServizio,
  foreignKey: 'servizio_id',
  otherKey: 'prenotazione_id',
  as: 'prenotazioni',
});

// Conversazione ↔ Utente tramite conversazioni_partecipanti (chat staff)
Conversazione.belongsToMany(Utente, {
  through: ConversazionePartecipante,
  foreignKey: 'conversazione_id',
  otherKey: 'utente_id',
  as: 'partecipanti',
});
Utente.belongsToMany(Conversazione, {
  through: ConversazionePartecipante,
  foreignKey: 'utente_id',
  otherKey: 'conversazione_id',
  as: 'conversazioni_staff',
});

// Le tabelle ponte con dati propri servono anche da sole (es. ospiti con il
// tipo alloggiato, partecipanti ancora attivi): colleghiamo anche le due metà.
Prenotazione.hasMany(PrenotazioneOspite, { foreignKey: 'prenotazione_id', as: 'righe_ospiti' });
PrenotazioneOspite.belongsTo(Prenotazione, { foreignKey: 'prenotazione_id', as: 'prenotazione' });
PrenotazioneOspite.belongsTo(Ospite, { foreignKey: 'ospite_id', as: 'ospite' });

Prenotazione.hasMany(PrenotazioneServizio, { foreignKey: 'prenotazione_id', as: 'righe_servizi' });
PrenotazioneServizio.belongsTo(Prenotazione, { foreignKey: 'prenotazione_id', as: 'prenotazione' });
PrenotazioneServizio.belongsTo(Servizio, { foreignKey: 'servizio_id', as: 'servizio' });

Conversazione.hasMany(ConversazionePartecipante, { foreignKey: 'conversazione_id', as: 'membri' });
ConversazionePartecipante.belongsTo(Conversazione, {
  foreignKey: 'conversazione_id',
  as: 'conversazione',
});
ConversazionePartecipante.belongsTo(Utente, { foreignKey: 'utente_id', as: 'utente' });

// ─────────────────────────────────────
// UNO A MOLTI — accesso
// ─────────────────────────────────────

// Ruolo → Utente (la colonna si chiama "ruolo", quindi l'alias è diverso)
Ruolo.hasMany(Utente, { foreignKey: 'ruolo', as: 'utenti' });
Utente.belongsTo(Ruolo, { foreignKey: 'ruolo', as: 'dettagli_ruolo' });

// Ruolo → RegolaChat (quali ruoli possono scriversi nella chat staff)
RegolaChat.belongsTo(Ruolo, { foreignKey: 'ruolo_a', as: 'dettagli_ruolo_a' });
RegolaChat.belongsTo(Ruolo, { foreignKey: 'ruolo_b', as: 'dettagli_ruolo_b' });

// Utente → TokenUtente
Utente.hasMany(TokenUtente, { foreignKey: 'utente_id', as: 'token' });
TokenUtente.belongsTo(Utente, { foreignKey: 'utente_id', as: 'utente' });

// Utente → Visitatore (il visitatore che poi si è registrato)
Utente.hasMany(Visitatore, { foreignKey: 'utente_id', as: 'visitatori' });
Visitatore.belongsTo(Utente, { foreignKey: 'utente_id', as: 'utente' });

// Utente → Ospite: la sua anagrafica (utenti.ospite_id) e gli ospiti che ha
// salvato per le prossime prenotazioni (ospiti.utente_id)
Utente.belongsTo(Ospite, { foreignKey: 'ospite_id', as: 'anagrafica' });
Utente.hasMany(Ospite, { foreignKey: 'utente_id', as: 'ospiti_salvati' });
Ospite.belongsTo(Utente, { foreignKey: 'utente_id', as: 'utente' });

// Utente → Notifica
Utente.hasMany(Notifica, { foreignKey: 'utente_id', as: 'notifiche' });
Notifica.belongsTo(Utente, { foreignKey: 'utente_id', as: 'utente' });

// Utente → RegistroAttivita (chi ha fatto la modifica)
Utente.hasMany(RegistroAttivita, { foreignKey: 'utente_id', as: 'attivita_registrate' });
RegistroAttivita.belongsTo(Utente, { foreignKey: 'utente_id', as: 'utente' });

// ─────────────────────────────────────
// UNO A MOLTI — contenuti
// ─────────────────────────────────────

Impostazione.belongsTo(Utente, { foreignKey: 'aggiornato_da', as: 'modificatore' });
DocumentoLegale.belongsTo(Utente, { foreignKey: 'creato_da', as: 'autore' });
Faq.belongsTo(Utente, { foreignKey: 'creato_da', as: 'autore' });
Faq.belongsTo(Utente, { foreignKey: 'aggiornato_da', as: 'modificatore' });
Pagina.hasMany(Sezione, { foreignKey: 'pagina_id', as: 'sezioni' });
Sezione.belongsTo(Pagina, { foreignKey: 'pagina_id', as: 'pagina' });

// Media e Traduzione sono polimorfiche (entita + entita_id): ogni modello
// vede solo le righe della propria "entita". Nel DB non c'è una FK vera,
// per questo constraints: false.
Camera.hasMany(Media, {
  foreignKey: 'entita_id',
  scope: { entita: 'camera' },
  as: 'media',
  constraints: false,
});
TipologiaCamera.hasMany(Media, {
  foreignKey: 'entita_id',
  scope: { entita: 'tipologia_camera' },
  as: 'media',
  constraints: false,
});
Servizio.hasMany(Media, {
  foreignKey: 'entita_id',
  scope: { entita: 'servizio' },
  as: 'media',
  constraints: false,
});
Pacchetto.hasMany(Media, {
  foreignKey: 'entita_id',
  scope: { entita: 'pacchetto' },
  as: 'media',
  constraints: false,
});
Pagina.hasMany(Media, {
  foreignKey: 'entita_id',
  scope: { entita: 'pagina' },
  as: 'media',
  constraints: false,
});
Sezione.hasMany(Media, {
  foreignKey: 'entita_id',
  scope: { entita: 'sezione' },
  as: 'media',
  constraints: false,
});

TipologiaCamera.hasMany(Traduzione, {
  foreignKey: 'entita_id',
  scope: { entita: 'tipologia_camera' },
  as: 'traduzioni',
  constraints: false,
});
Servizio.hasMany(Traduzione, {
  foreignKey: 'entita_id',
  scope: { entita: 'servizio' },
  as: 'traduzioni',
  constraints: false,
});
Pacchetto.hasMany(Traduzione, {
  foreignKey: 'entita_id',
  scope: { entita: 'pacchetto' },
  as: 'traduzioni',
  constraints: false,
});
Promozione.hasMany(Traduzione, {
  foreignKey: 'entita_id',
  scope: { entita: 'promozione' },
  as: 'traduzioni',
  constraints: false,
});
Faq.hasMany(Traduzione, {
  foreignKey: 'entita_id',
  scope: { entita: 'faq' },
  as: 'traduzioni',
  constraints: false,
});
Pagina.hasMany(Traduzione, {
  foreignKey: 'entita_id',
  scope: { entita: 'pagina' },
  as: 'traduzioni',
  constraints: false,
});
Sezione.hasMany(Traduzione, {
  foreignKey: 'entita_id',
  scope: { entita: 'sezione' },
  as: 'traduzioni',
  constraints: false,
});

// ─────────────────────────────────────
// UNO A MOLTI — camere e tariffe
// ─────────────────────────────────────

// TipologiaCamera → Camera
TipologiaCamera.hasMany(Camera, { foreignKey: 'tipologia_id', as: 'camere' });
Camera.belongsTo(TipologiaCamera, { foreignKey: 'tipologia_id', as: 'tipologia' });

// TipologiaCamera → PeriodoTariffario
TipologiaCamera.hasMany(PeriodoTariffario, { foreignKey: 'tipologia_id', as: 'periodi_tariffari' });
PeriodoTariffario.belongsTo(TipologiaCamera, { foreignKey: 'tipologia_id', as: 'tipologia' });
PeriodoTariffario.belongsTo(Utente, { foreignKey: 'creato_da', as: 'autore' });
PeriodoTariffario.belongsTo(Utente, { foreignKey: 'aggiornato_da', as: 'modificatore' });

// TipologiaCamera → Promozione
TipologiaCamera.hasMany(Promozione, { foreignKey: 'tipologia_id', as: 'promozioni' });
Promozione.belongsTo(TipologiaCamera, { foreignKey: 'tipologia_id', as: 'tipologia' });
Promozione.belongsTo(Utente, { foreignKey: 'creato_da', as: 'autore' });

// TipologiaCamera → Pacchetto
TipologiaCamera.hasMany(Pacchetto, { foreignKey: 'tipologia_id', as: 'pacchetti' });
Pacchetto.belongsTo(TipologiaCamera, { foreignKey: 'tipologia_id', as: 'tipologia' });

CodiceSconto.belongsTo(Utente, { foreignKey: 'creato_da', as: 'autore' });

// Utente → MovimentoPunti
Utente.hasMany(MovimentoPunti, { foreignKey: 'utente_id', as: 'movimenti_punti' });
MovimentoPunti.belongsTo(Utente, { foreignKey: 'utente_id', as: 'utente' });
MovimentoPunti.belongsTo(Utente, { foreignKey: 'creato_da', as: 'autore' });

// ─────────────────────────────────────
// UNO A MOLTI — ospiti
// ─────────────────────────────────────

// Ospite → DocumentoOspite
Ospite.hasMany(DocumentoOspite, { foreignKey: 'ospite_id', as: 'documenti' });
DocumentoOspite.belongsTo(Ospite, { foreignKey: 'ospite_id', as: 'ospite' });

// Luoghi e tipo di documento dell'ospite (codici ufficiali Alloggiati Web)
Ospite.belongsTo(AlloggiatiLuogo, { foreignKey: 'cittadinanza_codice', as: 'cittadinanza' });
Ospite.belongsTo(AlloggiatiLuogo, { foreignKey: 'stato_nascita_codice', as: 'stato_nascita' });
Ospite.belongsTo(AlloggiatiLuogo, { foreignKey: 'comune_nascita_codice', as: 'comune_nascita' });
Ospite.belongsTo(AlloggiatiLuogo, { foreignKey: 'luogo_rilascio_codice', as: 'luogo_rilascio' });
Ospite.belongsTo(AlloggiatiDocumento, { foreignKey: 'tipo_documento', as: 'documento_tipo' });

// Consenso → Utente / Visitatore / Ospite / DocumentoLegale
Utente.hasMany(Consenso, { foreignKey: 'utente_id', as: 'consensi' });
Consenso.belongsTo(Utente, { foreignKey: 'utente_id', as: 'utente' });
Visitatore.hasMany(Consenso, { foreignKey: 'visitatore_id', as: 'consensi' });
Consenso.belongsTo(Visitatore, { foreignKey: 'visitatore_id', as: 'visitatore' });
Ospite.hasMany(Consenso, { foreignKey: 'ospite_id', as: 'consensi' });
Consenso.belongsTo(Ospite, { foreignKey: 'ospite_id', as: 'ospite' });
Consenso.belongsTo(DocumentoLegale, { foreignKey: 'documento_id', as: 'documento' });

// ─────────────────────────────────────
// UNO A MOLTI — prenotazioni
// ─────────────────────────────────────

// Camera → CalendarioEsterno
Camera.hasMany(CalendarioEsterno, { foreignKey: 'camera_id', as: 'calendari_esterni' });
CalendarioEsterno.belongsTo(Camera, { foreignKey: 'camera_id', as: 'camera' });

// Camera / CalendarioEsterno → DataBloccata
Camera.hasMany(DataBloccata, { foreignKey: 'camera_id', as: 'date_bloccate' });
DataBloccata.belongsTo(Camera, { foreignKey: 'camera_id', as: 'camera' });
CalendarioEsterno.hasMany(DataBloccata, { foreignKey: 'calendario_id', as: 'date_bloccate' });
DataBloccata.belongsTo(CalendarioEsterno, { foreignKey: 'calendario_id', as: 'calendario' });
DataBloccata.belongsTo(Utente, { foreignKey: 'creato_da', as: 'autore' });

// Ospite → Prenotazione (il titolare)
Ospite.hasMany(Prenotazione, { foreignKey: 'ospite_id', as: 'prenotazioni_titolare' });
Prenotazione.belongsTo(Ospite, { foreignKey: 'ospite_id', as: 'titolare' });

// Utente → Prenotazione (l'account che l'ha fatta, e lo staff che l'ha inserita)
Utente.hasMany(Prenotazione, { foreignKey: 'utente_id', as: 'prenotazioni' });
Prenotazione.belongsTo(Utente, { foreignKey: 'utente_id', as: 'utente' });
Prenotazione.belongsTo(Utente, { foreignKey: 'creato_da', as: 'autore' });

// Camera → Prenotazione
Camera.hasMany(Prenotazione, { foreignKey: 'camera_id', as: 'prenotazioni' });
Prenotazione.belongsTo(Camera, { foreignKey: 'camera_id', as: 'camera' });

// Tariffe applicate alla prenotazione
PianoTariffario.hasMany(Prenotazione, { foreignKey: 'piano_tariffario_id', as: 'prenotazioni' });
Prenotazione.belongsTo(PianoTariffario, {
  foreignKey: 'piano_tariffario_id',
  as: 'piano_tariffario',
});

Promozione.hasMany(Prenotazione, { foreignKey: 'promozione_id', as: 'prenotazioni' });
Prenotazione.belongsTo(Promozione, { foreignKey: 'promozione_id', as: 'promozione' });

CodiceSconto.hasMany(Prenotazione, { foreignKey: 'codice_sconto_id', as: 'prenotazioni' });
Prenotazione.belongsTo(CodiceSconto, { foreignKey: 'codice_sconto_id', as: 'codice_sconto' });

Pacchetto.hasMany(Prenotazione, { foreignKey: 'pacchetto_id', as: 'prenotazioni' });
Prenotazione.belongsTo(Pacchetto, { foreignKey: 'pacchetto_id', as: 'pacchetto' });

// Prenotazione → MovimentoPunti (punti guadagnati con il soggiorno)
Prenotazione.hasMany(MovimentoPunti, { foreignKey: 'prenotazione_id', as: 'movimenti_punti' });
MovimentoPunti.belongsTo(Prenotazione, { foreignKey: 'prenotazione_id', as: 'prenotazione' });

// Camera → BloccoTemporaneo
Camera.hasMany(BloccoTemporaneo, { foreignKey: 'camera_id', as: 'blocchi_temporanei' });
BloccoTemporaneo.belongsTo(Camera, { foreignKey: 'camera_id', as: 'camera' });
BloccoTemporaneo.belongsTo(Utente, { foreignKey: 'utente_id', as: 'utente' });
BloccoTemporaneo.belongsTo(Visitatore, { foreignKey: 'visitatore_id', as: 'visitatore' });

// Prenotazione → InvioAlloggiati
Prenotazione.hasMany(InvioAlloggiati, { foreignKey: 'prenotazione_id', as: 'invii_alloggiati' });
InvioAlloggiati.belongsTo(Prenotazione, { foreignKey: 'prenotazione_id', as: 'prenotazione' });
InvioAlloggiati.belongsTo(Ospite, { foreignKey: 'ospite_id', as: 'ospite' });
InvioAlloggiati.belongsTo(Utente, { foreignKey: 'inviato_da', as: 'mittente' });

// Prenotazione → Recensione (al massimo una per soggiorno)
Prenotazione.hasOne(Recensione, { foreignKey: 'prenotazione_id', as: 'recensione' });
Recensione.belongsTo(Prenotazione, { foreignKey: 'prenotazione_id', as: 'prenotazione' });
Recensione.belongsTo(Ospite, { foreignKey: 'ospite_id', as: 'ospite' });
Recensione.belongsTo(Utente, { foreignKey: 'utente_id', as: 'utente' });
Recensione.belongsTo(Utente, { foreignKey: 'moderata_da', as: 'moderatore' });
Recensione.belongsTo(Utente, { foreignKey: 'risposta_da', as: 'autore_risposta' });

// ─────────────────────────────────────
// UNO A MOLTI — contabilità
// ─────────────────────────────────────

// Prenotazione → Pagamento
Prenotazione.hasMany(Pagamento, { foreignKey: 'prenotazione_id', as: 'pagamenti' });
Pagamento.belongsTo(Prenotazione, { foreignKey: 'prenotazione_id', as: 'prenotazione' });
Pagamento.belongsTo(Utente, { foreignKey: 'registrato_da', as: 'operatore' });

// Prenotazione → Fattura
Prenotazione.hasMany(Fattura, { foreignKey: 'prenotazione_id', as: 'fatture' });
Fattura.belongsTo(Prenotazione, { foreignKey: 'prenotazione_id', as: 'prenotazione' });
Fattura.belongsTo(Utente, { foreignKey: 'creato_da', as: 'autore' });

// Fattura → FatturaRiga
Fattura.hasMany(FatturaRiga, { foreignKey: 'fattura_id', as: 'righe' });
FatturaRiga.belongsTo(Fattura, { foreignKey: 'fattura_id', as: 'fattura' });

// Fattura → note di credito che la stornano
Fattura.hasMany(Fattura, { foreignKey: 'fattura_origine_id', as: 'note_credito' });
Fattura.belongsTo(Fattura, { foreignKey: 'fattura_origine_id', as: 'fattura_origine' });

// ─────────────────────────────────────
// UNO A MOLTI — pulizie e manutenzione
// ─────────────────────────────────────

// Camera / Prenotazione → AttivitaPulizia
Camera.hasMany(AttivitaPulizia, { foreignKey: 'camera_id', as: 'attivita_pulizia' });
AttivitaPulizia.belongsTo(Camera, { foreignKey: 'camera_id', as: 'camera' });
Prenotazione.hasMany(AttivitaPulizia, { foreignKey: 'prenotazione_id', as: 'attivita_pulizia' });
AttivitaPulizia.belongsTo(Prenotazione, { foreignKey: 'prenotazione_id', as: 'prenotazione' });

// Utente → AttivitaPulizia (addetto, chi la verifica, chi la crea)
Utente.hasMany(AttivitaPulizia, { foreignKey: 'assegnata_a', as: 'pulizie_assegnate' });
AttivitaPulizia.belongsTo(Utente, { foreignKey: 'assegnata_a', as: 'addetto' });
AttivitaPulizia.belongsTo(Utente, { foreignKey: 'verificata_da', as: 'verificatore' });
AttivitaPulizia.belongsTo(Utente, { foreignKey: 'creato_da', as: 'autore' });

// Camera → SegnalazioneManutenzione
Camera.hasMany(SegnalazioneManutenzione, { foreignKey: 'camera_id', as: 'segnalazioni' });
SegnalazioneManutenzione.belongsTo(Camera, { foreignKey: 'camera_id', as: 'camera' });

// Utente → SegnalazioneManutenzione (chi la apre, chi la risolve)
SegnalazioneManutenzione.belongsTo(Utente, { foreignKey: 'segnalata_da', as: 'segnalatore' });
Utente.hasMany(SegnalazioneManutenzione, {
  foreignKey: 'assegnata_a',
  as: 'manutenzioni_assegnate',
});
SegnalazioneManutenzione.belongsTo(Utente, { foreignKey: 'assegnata_a', as: 'incaricato' });

// ─────────────────────────────────────
// CHAT
// ─────────────────────────────────────

// Conversazione di assistenza → cliente o visitatore, prenotazione, operatore
Utente.hasMany(Conversazione, { foreignKey: 'cliente_id', as: 'conversazioni_cliente' });
Conversazione.belongsTo(Utente, { foreignKey: 'cliente_id', as: 'cliente' });
Visitatore.hasMany(Conversazione, { foreignKey: 'visitatore_id', as: 'conversazioni' });
Conversazione.belongsTo(Visitatore, { foreignKey: 'visitatore_id', as: 'visitatore' });
Prenotazione.hasMany(Conversazione, { foreignKey: 'prenotazione_id', as: 'conversazioni' });
Conversazione.belongsTo(Prenotazione, { foreignKey: 'prenotazione_id', as: 'prenotazione' });
Conversazione.belongsTo(Utente, { foreignKey: 'assegnata_a', as: 'operatore' });
Conversazione.belongsTo(Utente, { foreignKey: 'creata_da', as: 'autore' });

// Conversazione → Messaggio
Conversazione.hasMany(Messaggio, { foreignKey: 'conversazione_id', as: 'messaggi' });
Messaggio.belongsTo(Conversazione, { foreignKey: 'conversazione_id', as: 'conversazione' });
Messaggio.belongsTo(Utente, { foreignKey: 'mittente_utente_id', as: 'mittente_utente' });
Messaggio.belongsTo(Visitatore, {
  foreignKey: 'mittente_visitatore_id',
  as: 'mittente_visitatore',
});
Messaggio.belongsTo(Messaggio, { foreignKey: 'risposta_a_id', as: 'risposta_a' });

// Messaggio → MessaggioAllegato
Messaggio.hasMany(MessaggioAllegato, { foreignKey: 'messaggio_id', as: 'allegati' });
MessaggioAllegato.belongsTo(Messaggio, { foreignKey: 'messaggio_id', as: 'messaggio' });

// Riepiloghi email dei messaggi non letti
ChatRiepilogoEmail.belongsTo(Conversazione, {
  foreignKey: 'conversazione_id',
  as: 'conversazione',
});
ChatRiepilogoEmail.belongsTo(Utente, { foreignKey: 'utente_id', as: 'utente' });

// ─────────────────────────────────────
// VIEW (sola lettura)
// ─────────────────────────────────────

// Prenotazione → SaldoPrenotazione (dovuto, incassato, saldo)
Prenotazione.hasOne(SaldoPrenotazione, {
  foreignKey: 'prenotazione_id',
  as: 'saldo',
  constraints: false,
});

// Utente → FedeltaUtente (livello e sconto) → LivelloFedelta
Utente.hasOne(FedeltaUtente, { foreignKey: 'utente_id', as: 'fedelta', constraints: false });
FedeltaUtente.belongsTo(LivelloFedelta, {
  foreignKey: 'livello_id',
  as: 'dettagli_livello',
  constraints: false,
});

// Camera → StatoCamera (situazione di oggi) → prenotazione in corso
Camera.hasOne(StatoCamera, { foreignKey: 'camera_id', as: 'situazione', constraints: false });
StatoCamera.belongsTo(Camera, { foreignKey: 'camera_id', as: 'camera', constraints: false });
StatoCamera.belongsTo(Prenotazione, {
  foreignKey: 'prenotazione_in_corso_id',
  as: 'prenotazione_in_corso',
  constraints: false,
});

module.exports = {
  sequelize,
  transazione,

  // accesso
  Ruolo,
  Permesso,
  RuoloPermesso,
  RegolaChat,
  Utente,
  TokenUtente,
  Visitatore,

  // contenuti
  Impostazione,
  Traduzione,
  DocumentoLegale,
  Media,
  Faq,
  Pagina,
  Sezione,
  EventoSpeciale,

  // camere
  TipologiaCamera,
  Servizio,
  TipologiaCameraServizio,
  Camera,
  CameraServizio,

  // tariffe e fedeltà
  PianoTariffario,
  PeriodoTariffario,
  Promozione,
  CodiceSconto,
  Pacchetto,
  PacchettoServizio,
  TassaSoggiorno,
  LivelloFedelta,
  MovimentoPunti,

  // ospiti
  AlloggiatiLuogo,
  AlloggiatiDocumento,
  Ospite,
  DocumentoOspite,
  Consenso,

  // prenotazioni
  CalendarioEsterno,
  DataBloccata,
  Prenotazione,
  PrenotazioneOspite,
  PrenotazioneServizio,
  BloccoTemporaneo,
  InvioAlloggiati,
  Recensione,

  // contabilità
  ContatoreFattura,
  Fattura,
  FatturaRiga,
  Pagamento,
  EventoWebhook,

  // pulizie e manutenzione
  ChecklistModello,
  AttivitaPulizia,
  SegnalazioneManutenzione,

  // chat
  Conversazione,
  ConversazionePartecipante,
  Messaggio,
  MessaggioAllegato,
  ChatRiepilogoEmail,

  // sistema
  Notifica,
  RegistroAttivita,

  // view
  SaldoPrenotazione,
  Valutazioni,
  FedeltaUtente,
  StatoCamera,
  IncassoMensile,
  TassaSoggiornoMensile,
};
