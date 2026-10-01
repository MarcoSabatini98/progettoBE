// Dati di prova per sviluppo e test manuali. Mai in produzione.
//
//   npm run db:seed          prima: dati di base e admin
//   npm run db:seed:prova    poi: questo
//
// Per ripartire da capo (rilanciano anche questo):
//   npm run db:reset:seed   svuota i dati e tiene lo schema
//   npm run db:reset        ricrea l'intero database
// Per tornare ai soli dati di base:
//   npm run db:crea -- --reset && npm run db:seed
//
// Tutto passa dai service veri (prezzi, trigger, punti fedeltà, pulizie di
// partenza, notifiche), quindi i dati sono coerenti come quelli reali. Le date
// sono relative a oggi: soggiorni conclusi, in corso e futuri.
// Tutti gli account di prova hanno la password PASSWORD_PROVA.

// Nessuna email vera ai clienti inventati, qualunque sia il .env.
process.env.SMTP_HOST = '';
// Solo avvisi ed errori: le email non inviate riempirebbero lo schermo.
process.env.LOG_LEVEL = 'warn';

const fs = require('node:fs/promises');
const path = require('node:path');

const modelli = require('../src/models');
const utentiRepo = require('../src/repositories/utenti.repository');
const prenotazioniRepo = require('../src/repositories/prenotazioni.repository');
const authService = require('../src/services/auth.service');
const utentiService = require('../src/services/utenti.service');
const impostazioniService = require('../src/services/impostazioni.service');
const camereService = require('../src/services/camere.service');
const tariffeService = require('../src/services/tariffe.service');
const contenutiService = require('../src/services/contenuti.service');
const calendariService = require('../src/services/calendari.service');
const prenotazioniService = require('../src/services/prenotazioni.service');
const pagamentiService = require('../src/services/pagamenti.service');
const ospitiService = require('../src/services/ospiti.service');
const recensioniService = require('../src/services/recensioni.service');
const fattureService = require('../src/services/fatture.service');
const pulizieService = require('../src/services/pulizie.service');
const manutenzioneService = require('../src/services/manutenzione.service');
const chatService = require('../src/services/chat.service');
const { oggi, aggiungiGiorni } = require('../src/utils/date');
const file = require('../src/utils/file');
const { uuid } = require('../src/utils/sicurezza');
const { CARTELLE_UPLOAD } = require('../src/constants/sistema.constants');

const PASSWORD_PROVA = 'Prova1234!';

// Foto CC0 da Wikimedia Commons (autori in database/dati/foto/CREDITI.md).
const CARTELLA_FOTO = path.join(__dirname, 'dati', 'foto');

// Codici ufficiali Alloggiati Web (database/dati).
const ALLOGGIATI = {
  ITALIA: '100000100',
  GERMANIA: '100000216',
  REGNO_UNITO: '100000219',
  CAGLIARI: '420092009',
  MILANO: '403015146',
  ROMA: '412058091',
};

const STAFF = [
  { email: 'reception@example.com', nome: 'Giulia', cognome: 'Bianchi', ruolo: 'receptionist' },
  { email: 'reception2@example.com', nome: 'Luca', cognome: 'Verdi', ruolo: 'receptionist' },
  {
    email: 'governante@example.com',
    nome: 'Anna',
    cognome: 'Neri',
    ruolo: 'housekeeper_senior',
  },
  { email: 'pulizie@example.com', nome: 'Sara', cognome: 'Russo', ruolo: 'housekeeper' },
  { email: 'pulizie2@example.com', nome: 'Marco', cognome: 'Gallo', ruolo: 'housekeeper' },
];

const CLIENTI = [
  { email: 'laura.conti@example.com', nome: 'Laura', cognome: 'Conti', lingua: 'it' },
  { email: 'john.smith@example.com', nome: 'John', cognome: 'Smith', lingua: 'en' },
  { email: 'chiara.ferri@example.com', nome: 'Chiara', cognome: 'Ferri', lingua: 'it' },
];

// L'email del primo account di prova segna che il seed è già stato fatto.
const SEGNALE = STAFF[0].email;

function contesto(utente) {
  return { utenteId: utente.id, ruolo: utente.ruolo, ip: '127.0.0.1' };
}

function giorno(offset) {
  return aggiungiGiorni(oggi(), offset);
}

/** Copia le foto in uploads/media come farebbe un caricamento dal gestionale. */
async function aggiungiFoto(tipologia, foto) {
  for (const [ordine, nome] of foto.entries()) {
    const contenuto = await fs.readFile(path.join(CARTELLA_FOTO, nome));
    const relativo = await file.salva(
      `${CARTELLE_UPLOAD.media}/${uuid()}${path.extname(nome)}`,
      contenuto,
    );
    await contenutiService.aggiungiMedia(
      {
        entita: 'tipologia_camera',
        entitaId: tipologia.id,
        testoAlternativo: `Camera ${tipologia.nome.toLowerCase()}`,
        ordine,
      },
      { path: file.percorsoAssoluto(relativo), mimetype: 'image/jpeg', size: contenuto.length },
    );
  }
}

// ─────────────────────────────────────
// Struttura e persone
// ─────────────────────────────────────

async function impostaStruttura(admin) {
  await impostazioniService.aggiorna(
    {
      struttura_nome: 'Hotel Prova',
      struttura_ragione_sociale: 'Hotel Prova S.r.l.',
      struttura_partita_iva: '01234567890',
      struttura_codice_fiscale: '01234567890',
      struttura_indirizzo: 'Via Roma 1',
      struttura_cap: '09124',
      struttura_comune: 'Cagliari',
      struttura_provincia: 'CA',
      struttura_email: 'info@example.com',
      struttura_telefono: '+39 070 000000',
      struttura_iban: 'IT60X0542811101000000123456',
      struttura_intestatario_conto: 'Hotel Prova S.r.l.',
    },
    contesto(admin),
  );
}

async function creaPersone() {
  const staff = {};
  for (const persona of STAFF) {
    const utente = await utentiService.creaStaff({ ...persona, password: PASSWORD_PROVA });
    staff[persona.email.split('@')[0]] = utente;
  }

  const passwordHash = await authService.hashPassword(PASSWORD_PROVA);
  const clienti = [];
  for (const cliente of CLIENTI) {
    clienti.push(
      await utentiRepo.creaUtente({
        ...cliente,
        password_hash: passwordHash,
        ruolo: 'cliente',
        email_verificata_il: new Date(),
      }),
    );
  }
  return { staff, clienti };
}

// ─────────────────────────────────────
// Catalogo e prezzi
// ─────────────────────────────────────

async function creaCatalogo(ctx) {
  const dotazioni = await modelli.Servizio.findAll({ where: { tipo: 'dotazione' } });
  const dotazione = (nome) => dotazioni.find((servizio) => servizio.nome === nome).id;
  const base = ['Wi-Fi gratuito', 'Aria condizionata', 'TV a schermo piatto', 'Bagno privato'];

  const extra = {};
  for (const servizio of [
    { nome: 'Colazione', prezzo: 12, calcolo_prezzo: 'a_persona_notte', icona: 'breakfast' },
    { nome: 'Parcheggio', prezzo: 10, calcolo_prezzo: 'a_notte', icona: 'parking' },
    { nome: 'Transfer aeroporto', prezzo: 35, calcolo_prezzo: 'a_soggiorno', icona: 'taxi' },
    { nome: 'Late check-out', prezzo: 20, calcolo_prezzo: 'a_soggiorno', icona: 'clock' },
    { nome: 'Noleggio bici', prezzo: 15, calcolo_prezzo: 'a_persona', icona: 'bike' },
  ]) {
    extra[servizio.nome] = await camereService.creaServizio({ ...servizio, tipo: 'extra' });
  }

  const tipologie = {};
  for (const [ordine, { foto, ...tipologia }] of [
    {
      nome: 'Singola',
      prezzo_base: 70,
      ospiti_max: 1,
      superficie_mq: 14,
      letti: '1 singolo',
      foto: ['singola-1.jpg'],
    },
    {
      nome: 'Doppia',
      prezzo_base: 95,
      ospiti_max: 2,
      superficie_mq: 18,
      letti: '1 matrimoniale',
      foto: ['doppia-1.jpg', 'doppia-2.jpg'],
    },
    {
      nome: 'Tripla',
      prezzo_base: 120,
      ospiti_max: 3,
      superficie_mq: 24,
      letti: '1 matrimoniale + 1 singolo',
      foto: ['tripla-1.jpg', 'tripla-2.jpg'],
    },
    {
      nome: 'Suite',
      prezzo_base: 180,
      ospiti_max: 4,
      superficie_mq: 40,
      letti: '1 matrimoniale + divano letto',
      servizi: [dotazione('Minibar'), dotazione('Balcone'), dotazione('Vista mare')],
      foto: ['suite-1.jpg', 'suite-2.jpg'],
    },
  ].entries()) {
    tipologie[tipologia.nome] = await camereService.creaTipologia({
      ...tipologia,
      ordine,
      descrizione: `Camera ${tipologia.nome.toLowerCase()} con arredi moderni.`,
      servizi: [...base.map(dotazione), ...(tipologia.servizi ?? [])],
    });
    await aggiungiFoto(tipologie[tipologia.nome], foto);
  }

  const camere = {};
  for (const [numero, tipologia, piano] of [
    ['101', 'Singola', 1],
    ['102', 'Doppia', 1],
    ['103', 'Doppia', 1],
    ['104', 'Tripla', 1],
    ['201', 'Doppia', 2],
    ['202', 'Tripla', 2],
    ['203', 'Suite', 2],
    ['204', 'Suite', 2],
  ]) {
    camere[numero] = await camereService.creaCamera({
      numero,
      tipologia_id: tipologie[tipologia].id,
      piano,
    });
  }

  const nonRimborsabile = await tariffeService.creaPiano({
    nome: 'Non rimborsabile',
    descrizione: 'Il 10% in meno, pagamento anticipato e nessun rimborso.',
    tipo_variazione: 'percentuale',
    valore_variazione: -10,
    rimborsabile: false,
    ore_cancellazione_gratuita: 0,
    penale_percentuale: 100,
    acconto_percentuale: 100,
    ordine: 1,
  });

  // Estate prossima: quest'anno se non è ancora luglio, altrimenti l'anno dopo.
  const adesso = new Date();
  const annoEstate =
    adesso.getUTCMonth() < 6 ? adesso.getUTCFullYear() : adesso.getUTCFullYear() + 1;
  await tariffeService.creaPeriodo(
    {
      nome: 'Alta stagione',
      data_inizio: `${annoEstate}-07-01`,
      data_fine: `${annoEstate}-08-31`,
      tipo_variazione: 'percentuale',
      valore: 30,
      soggiorno_minimo: 3,
      priorita: 10,
    },
    ctx,
  );
  await tariffeService.creaPeriodo(
    {
      nome: 'Weekend',
      data_inizio: giorno(-365),
      data_fine: giorno(365),
      giorni_settimana: 16 + 32, // venerdì e sabato
      tipo_variazione: 'percentuale',
      valore: 15,
    },
    ctx,
  );

  await tariffeService.creaPromozione(
    {
      nome: 'Last minute',
      descrizione: 'Il 10% in meno sui soggiorni delle prossime due settimane.',
      soggiorno_dal: oggi(),
      soggiorno_al: giorno(14),
      prenotabile_dal: oggi(),
      prenotabile_al: giorno(14),
      tipo_sconto: 'percentuale',
      valore: 10,
    },
    ctx,
  );

  await tariffeService.creaCodiceSconto(
    {
      codice: 'BENVENUTO10',
      descrizione: 'Il 10% in meno sul primo soggiorno',
      tipo_sconto: 'percentuale',
      valore: 10,
      valido_dal: giorno(-30),
      valido_al: giorno(365),
      utilizzi_per_utente: 1,
    },
    ctx,
  );
  await tariffeService.creaCodiceSconto(
    {
      codice: 'ESTATE20',
      descrizione: '20 euro in meno sopra i 200 euro',
      tipo_sconto: 'importo',
      valore: 20,
      importo_minimo: 200,
      utilizzi_max: 50,
    },
    ctx,
  );

  const romantico = await tariffeService.creaPacchetto({
    nome: 'Fuga romantica',
    descrizione: 'Due notti in suite con colazione e late check-out.',
    prezzo: 60,
    tipologia_id: tipologie.Suite.id,
    notti_min: 2,
    servizi: [
      { servizio_id: extra.Colazione.id, quantita: 2 },
      { servizio_id: extra['Late check-out'].id, quantita: 1 },
    ],
  });

  await tariffeService.creaTassa({
    nome: 'Imposta di soggiorno',
    valida_dal: giorno(-365),
    valida_al: giorno(730),
    importo_notte: 2,
    notti_max: 7,
    eta_esenzione: 14,
  });

  return { extra, camere, nonRimborsabile, romantico };
}

async function creaContenuti(ctx, camere) {
  for (const [ordine, faq] of [
    ['Il check-in è dalle 15:00, il check-out entro le 11:00.', 'A che ora è il check-in?'],
    ['Sì, a 10 euro a notte: va richiesto in fase di prenotazione.', "C'è un parcheggio?"],
    ['Sì, gli animali di piccola taglia sono i benvenuti.', 'Posso portare il mio cane?'],
    ["Sì, dall'area personale o rispondendo all'email di conferma.", 'Posso modificare le date?'],
  ].entries()) {
    const [risposta, domanda] = faq;
    await contenutiService.creaFaq({ domanda, risposta, categoria: 'generale', ordine }, ctx);
  }

  await contenutiService.creaEvento({
    titolo: 'Festa di Sant’Efisio',
    tipo: 'evento_locale',
    data_inizio: giorno(20),
    data_fine: giorno(23),
    impatto: 8,
  });
  await contenutiService.creaEvento({
    titolo: 'Fiera del turismo',
    tipo: 'fiera',
    data_inizio: giorno(45),
    data_fine: giorno(47),
    impatto: 6,
  });

  for (const tipo of ['privacy', 'termini']) {
    const documento = await contenutiService.creaDocumentoLegale(
      { tipo, versione: '1.0', lingua: 'it', contenuto: `Testo di prova: ${tipo}.` },
      ctx,
    );
    await contenutiService.pubblicaDocumentoLegale(documento.id);
  }

  await calendariService.blocca(
    {
      camera_id: camere['204'].id,
      data_inizio: giorno(40),
      data_fine: giorno(45),
      motivo: 'Ristrutturazione del bagno',
    },
    ctx,
  );
}

// ─────────────────────────────────────
// Prenotazioni
// ─────────────────────────────────────

const OSPITI = {
  mueller: {
    nome: 'Hans',
    cognome: 'Müller',
    email: 'hans.mueller@example.com',
    sesso: 'M',
    data_nascita: '1978-03-12',
    cittadinanza_codice: ALLOGGIATI.GERMANIA,
    stato_nascita_codice: ALLOGGIATI.GERMANIA,
    tipo_documento: 'PASOR',
    numero_documento: 'C01X00T47',
    luogo_rilascio_codice: ALLOGGIATI.GERMANIA,
    indirizzo: 'Hauptstraße 5',
    cap: '10115',
    citta: 'Berlin',
    paese: 'DE',
    lingua: 'en',
  },
  rossi: {
    nome: 'Mario',
    cognome: 'Rossi',
    email: 'mario.rossi@example.com',
    telefono: '+39 333 0000001',
    sesso: 'M',
    data_nascita: '1980-01-01',
    cittadinanza_codice: ALLOGGIATI.ITALIA,
    stato_nascita_codice: ALLOGGIATI.ITALIA,
    comune_nascita_codice: ALLOGGIATI.CAGLIARI,
    provincia_nascita: 'CA',
    tipo_documento: 'IDENT',
    numero_documento: 'CA00000AA',
    luogo_rilascio_codice: ALLOGGIATI.CAGLIARI,
    codice_fiscale: 'RSSMRA80A01B354T',
    indirizzo: 'Via Garibaldi 10',
    cap: '09124',
    citta: 'Cagliari',
    provincia: 'CA',
    paese: 'IT',
  },
  rossiMoglie: {
    nome: 'Elena',
    cognome: 'Rossi',
    sesso: 'F',
    data_nascita: '1982-05-20',
    cittadinanza_codice: ALLOGGIATI.ITALIA,
    stato_nascita_codice: ALLOGGIATI.ITALIA,
    comune_nascita_codice: ALLOGGIATI.MILANO,
    provincia_nascita: 'MI',
  },
  ferri: {
    nome: 'Chiara',
    cognome: 'Ferri',
    sesso: 'F',
    data_nascita: '1990-09-15',
    cittadinanza_codice: ALLOGGIATI.ITALIA,
    stato_nascita_codice: ALLOGGIATI.ITALIA,
    comune_nascita_codice: ALLOGGIATI.ROMA,
    provincia_nascita: 'RM',
    tipo_documento: 'PATEN',
    numero_documento: 'RM0000000A',
    luogo_rilascio_codice: ALLOGGIATI.ROMA,
  },
  ferriCompagno: {
    nome: 'Paolo',
    cognome: 'Galli',
    sesso: 'M',
    data_nascita: '1988-11-02',
    cittadinanza_codice: ALLOGGIATI.ITALIA,
    stato_nascita_codice: ALLOGGIATI.ITALIA,
    comune_nascita_codice: ALLOGGIATI.ROMA,
    provincia_nascita: 'RM',
  },
};

/** Paga tutto ciò che resta da pagare. */
async function saldaTutto(prenotazioneId, metodo, ctx) {
  const { saldo } = await prenotazioniRepo.trovaSaldo(prenotazioneId);
  if (saldo > 0) {
    await pagamentiService.registra(prenotazioneId, { tipo: 'saldo', metodo, importo: saldo }, ctx);
  }
}

/** Soggiorno già concluso: confermata → pagata → arrivata → partita. */
async function soggiornoConcluso(dati, ctx) {
  const prenotazione = await prenotazioniService.crea({ ...dati, stato: 'confermata' }, ctx);
  await saldaTutto(prenotazione.id, 'pos', ctx);
  await prenotazioniService.checkIn(prenotazione.id, ctx);
  await prenotazioniService.checkOut(prenotazione.id, {}, ctx);
  return prenotazione;
}

async function creaPrenotazioni(ctx, { camere, extra, nonRimborsabile, romantico }, clienti) {
  const [laura, john, chiara] = clienti;
  const creata = {};

  // Passato
  creata.lauraPassata = await soggiornoConcluso(
    {
      camera_id: camere['102'].id,
      arrivo: giorno(-40),
      partenza: giorno(-37),
      adulti: 2,
      utente_id: laura.id,
      canale: 'telefono',
      servizi: [{ servizio_id: extra.Colazione.id, quantita: 1 }],
    },
    ctx,
  );
  creata.mueller = await soggiornoConcluso(
    {
      camera_id: camere['203'].id,
      arrivo: giorno(-30),
      partenza: giorno(-26),
      adulti: 2,
      titolare: OSPITI.mueller,
      canale: 'booking_com',
      id_esterno: '4012345678',
    },
    ctx,
  );
  creata.john = await soggiornoConcluso(
    {
      camera_id: camere['104'].id,
      arrivo: giorno(-20),
      partenza: giorno(-18),
      adulti: 2,
      bambini: 1,
      eta_bambini: [8],
      utente_id: john.id,
      canale: 'email',
    },
    ctx,
  );

  creata.cancellata = await prenotazioniService.crea(
    {
      camera_id: camere['101'].id,
      arrivo: giorno(-15),
      partenza: giorno(-13),
      adulti: 1,
      titolare: { nome: 'Franco', cognome: 'Pinna', email: 'franco.pinna@example.com' },
      stato: 'confermata',
    },
    ctx,
  );
  await prenotazioniService.cancella(
    creata.cancellata.id,
    { motivo: 'Cambio di programma', penale: 0 },
    ctx,
  );

  creata.noShow = await prenotazioniService.crea(
    {
      camera_id: camere['201'].id,
      arrivo: giorno(-3),
      partenza: giorno(-1),
      adulti: 2,
      titolare: { nome: 'Giorgio', cognome: 'Melis', telefono: '+39 333 0000002' },
      canale: 'airbnb',
      id_esterno: 'HMABC12345',
      stato: 'confermata',
    },
    ctx,
  );
  await prenotazioniService.noShow(creata.noShow.id, ctx);

  // In corso. Chiara ha completato i suoi dati dall'area personale.
  await utentiService.aggiornaDatiPersonali(chiara.id, OSPITI.ferri);
  creata.chiara = await prenotazioniService.crea(
    {
      camera_id: camere['102'].id,
      arrivo: giorno(-2),
      partenza: giorno(2),
      adulti: 2,
      utente_id: chiara.id,
      stato: 'confermata',
      servizi: [{ servizio_id: extra.Parcheggio.id, quantita: 1 }],
    },
    ctx,
  );
  await pagamentiService.registra(
    creata.chiara.id,
    { tipo: 'acconto', metodo: 'bonifico', importo: 100, riferimento: 'CRO 0000001' },
    ctx,
  );
  await prenotazioniService.checkIn(creata.chiara.id, ctx);
  await ospitiService.impostaDiPrenotazione(
    creata.chiara.id,
    [
      { ospite: { id: creata.chiara.ospite_id }, tipo_alloggiato: 'capofamiglia' },
      { ospite: OSPITI.ferriCompagno, tipo_alloggiato: 'familiare' },
    ],
    ctx,
  );

  creata.rossi = await prenotazioniService.crea(
    {
      camera_id: camere['203'].id,
      arrivo: giorno(-1),
      partenza: giorno(3),
      adulti: 2,
      bambini: 1,
      eta_bambini: [5],
      titolare: OSPITI.rossi,
      canale: 'walk_in',
      stato: 'confermata',
      richieste_speciali: 'Lettino per il bambino',
    },
    ctx,
  );
  await saldaTutto(creata.rossi.id, 'contanti', ctx);
  await prenotazioniService.checkIn(creata.rossi.id, ctx);
  await ospitiService.impostaDiPrenotazione(
    creata.rossi.id,
    [
      { ospite: { id: creata.rossi.ospite_id }, tipo_alloggiato: 'capofamiglia' },
      { ospite: OSPITI.rossiMoglie, tipo_alloggiato: 'familiare' },
    ],
    ctx,
  );

  // Arrivo oggi, non ancora registrato
  creata.arrivoOggi = await prenotazioniService.crea(
    {
      camera_id: camere['101'].id,
      arrivo: oggi(),
      partenza: giorno(1),
      adulti: 1,
      titolare: { nome: 'Sofia', cognome: 'Deiana', email: 'sofia.deiana@example.com' },
      stato: 'confermata',
      ora_arrivo_prevista: '18:00',
    },
    ctx,
  );

  // Futuro
  creata.lauraFutura = await prenotazioniService.crea(
    {
      camera_id: camere['103'].id,
      arrivo: giorno(5),
      partenza: giorno(8),
      adulti: 2,
      utente_id: laura.id,
      codice_sconto: 'BENVENUTO10',
      stato: 'confermata',
    },
    ctx,
  );
  await pagamentiService.registra(
    creata.lauraFutura.id,
    { tipo: 'acconto', metodo: 'pos', importo: 50 },
    ctx,
  );

  creata.inAttesa = await prenotazioniService.crea(
    {
      camera_id: camere['202'].id,
      arrivo: giorno(10),
      partenza: giorno(14),
      adulti: 3,
      titolare: { nome: 'Davide', cognome: 'Porcu', email: 'davide.porcu@example.com' },
      servizi: [{ servizio_id: extra.Colazione.id, quantita: 1 }],
      stato: 'in_attesa',
      note_interne: 'Richiamare per l’acconto',
    },
    ctx,
  );

  creata.romantica = await prenotazioniService.crea(
    {
      camera_id: camere['204'].id,
      arrivo: giorno(20),
      partenza: giorno(22),
      adulti: 2,
      utente_id: john.id,
      pacchetto_id: romantico.id,
      stato: 'confermata',
    },
    ctx,
  );

  creata.nonRimborsabile = await prenotazioniService.crea(
    {
      camera_id: camere['201'].id,
      arrivo: giorno(30),
      partenza: giorno(37),
      adulti: 2,
      titolare: { nome: 'Martina', cognome: 'Serra', email: 'martina.serra@example.com' },
      piano_id: nonRimborsabile.id,
      stato: 'confermata',
    },
    ctx,
  );
  await saldaTutto(creata.nonRimborsabile.id, 'bonifico', ctx);

  return creata;
}

// ─────────────────────────────────────
// Dopo il soggiorno: recensioni e fatture
// ─────────────────────────────────────

async function creaRecensioni(ctx, prenotazioni, clienti) {
  const [laura, john] = clienti;

  const ottima = await recensioniService.crea(
    prenotazioni.lauraPassata.id,
    {
      voto: 5,
      voto_pulizia: 5,
      voto_personale: 5,
      voto_posizione: 4,
      voto_comfort: 5,
      voto_qualita_prezzo: 4,
      titolo: 'Soggiorno perfetto',
      commento: 'Camera pulitissima e personale gentile. Torneremo!',
      lingua: 'it',
    },
    contesto(laura),
  );
  await recensioniService.modera(ottima.id, 'pubblicata', ctx);
  await recensioniService.rispondi(ottima.id, 'Grazie Laura, ti aspettiamo presto!', ctx);

  const inglese = await recensioniService.crea(
    prenotazioni.john.id,
    {
      voto: 4,
      titolo: 'Great family stay',
      commento: 'Spacious room, the kids loved it. Breakfast could be better.',
      lingua: 'en',
    },
    contesto(john),
  );
  await recensioniService.modera(inglese.id, 'pubblicata', ctx);

  // Resta da moderare.
  await recensioniService.creaDaCodice(prenotazioni.mueller.codice, OSPITI.mueller.email, {
    voto: 2,
    titolo: 'Rumoroso',
    commento: 'La camera dava sulla strada, difficile dormire.',
    lingua: 'it',
  });
}

async function creaFatture(ctx, prenotazioni) {
  const emessa = await fattureService.bozzaDaPrenotazione(
    prenotazioni.lauraPassata.id,
    {
      nome: 'Laura',
      cognome: 'Conti',
      codice_fiscale: 'CNTLRA85M41F205Z',
      indirizzo: 'Via Dante 3',
      cap: '20121',
      comune: 'Milano',
      provincia: 'MI',
      nazione: 'IT',
    },
    ctx,
  );
  await fattureService.emetti(emessa.id, ctx);

  // Resta in bozza: intestata a un'azienda estera.
  await fattureService.bozzaDaPrenotazione(
    prenotazioni.john.id,
    {
      denominazione: 'Smith Consulting Ltd',
      partita_iva: 'GB123456789',
      indirizzo: '10 Downing Street',
      cap: 'SW1A 2AA',
      comune: 'London',
      nazione: 'GB',
    },
    ctx,
  );
}

// ─────────────────────────────────────
// Operatività: pulizie, manutenzione, chat
// ─────────────────────────────────────

async function creaOperativita(staff, camere, prenotazioni, clienti) {
  const { reception, reception2, governante, pulizie, pulizie2 } = staff;

  // Riassetti delle camere occupate e checklist alle pulizie di partenza.
  await pulizieService.preparaGiornata();

  const riassetto = await pulizieService.crea(
    { camera_id: camere['103'].id, tipo: 'riassetto', assegnata_a: pulizie2.id },
    contesto(governante),
  );
  await pulizieService.avanza(riassetto.id, { stato: 'in_corso' }, contesto(pulizie2));
  await pulizieService.avanza(
    riassetto.id,
    { stato: 'completata', checklist: riassetto.checklist.map(() => ({ fatto: true })) },
    contesto(pulizie2),
  );

  await pulizieService.crea(
    {
      camera_id: camere['104'].id,
      tipo: 'profonda',
      assegnata_a: pulizie.id,
      data_prevista: giorno(1),
      priorita: 'alta',
      note: 'Pulizia di fine stagione',
    },
    contesto(governante),
  );

  await manutenzioneService.segnala(
    {
      camera_id: camere['202'].id,
      titolo: 'Perdita dal lavandino',
      descrizione: 'Gocciola il sifone sotto il lavandino del bagno.',
      priorita: 'alta',
    },
    contesto(pulizie),
  );
  await manutenzioneService.segnala(
    { titolo: 'Lampadina fulminata nel corridoio del secondo piano', priorita: 'bassa' },
    contesto(reception),
  );

  const [laura] = clienti;
  const lauraChat = { utenteId: laura.id, ruolo: laura.ruolo };
  const receptionChat = { utenteId: reception.id, ruolo: reception.ruolo };
  const assistenza = await chatService.apriAssistenza(lauraChat, {
    testo: 'Buongiorno, è possibile avere un letto aggiuntivo per il prossimo soggiorno?',
    prenotazione_id: prenotazioni.lauraFutura.id,
  });
  await chatService.assegna(assistenza.uuid, receptionChat, reception.id);
  await chatService.invia(assistenza.uuid, receptionChat, {
    testo: 'Buongiorno Laura, certo: lo aggiungiamo senza costi.',
  });

  await chatService.apriStaff(receptionChat, {
    partecipanti: [reception2.id],
    testo: 'Domani arriva un gruppo alle 8: puoi coprire tu il turno del mattino?',
  });
}

// ─────────────────────────────────────
// Avvio
// ─────────────────────────────────────

async function seedProva() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Il seed di prova non si usa in produzione');
  }
  if (await utentiRepo.esisteEmail(SEGNALE)) {
    return null;
  }

  const admin = await modelli.Utente.findOne({ where: { ruolo: 'admin' } });
  if (!admin) {
    throw new Error("Nessun amministratore: lancia prima npm run db:seed con l'admin nel .env");
  }

  await impostaStruttura(admin);
  const { staff, clienti } = await creaPersone();
  const ctx = contesto(staff.reception);
  const catalogo = await creaCatalogo(ctx);
  await creaContenuti(ctx, catalogo.camere);
  const prenotazioni = await creaPrenotazioni(ctx, catalogo, clienti);
  await creaRecensioni(ctx, prenotazioni, clienti);
  await creaFatture(contesto(admin), prenotazioni);
  await creaOperativita(staff, catalogo.camere, prenotazioni, clienti);

  return {
    staff: Object.keys(staff).length,
    clienti: clienti.length,
    camere: Object.keys(catalogo.camere).length,
    prenotazioni: Object.keys(prenotazioni).length,
  };
}

if (require.main === module) {
  seedProva()
    .then((esito) => {
      if (!esito) {
        console.log('Dati di prova già presenti: per ricominciare usa db:crea -- --reset');
        return;
      }
      console.log(
        `Dati di prova creati: ${esito.staff} staff, ${esito.clienti} clienti, ` +
          `${esito.camere} camere, ${esito.prenotazioni} prenotazioni.`,
      );
      console.log(`Password di tutti gli account di prova: ${PASSWORD_PROVA}`);
    })
    .catch((err) => {
      console.error(`Errore: ${err.message}`);
      if (err.dettagli) {
        console.error(JSON.stringify(err.dettagli, null, 2));
      }
      process.exitCode = 1;
    })
    .finally(() => modelli.sequelize.close());
}

module.exports = { seedProva };
