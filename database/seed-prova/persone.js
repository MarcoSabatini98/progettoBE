// Persone: staff, clienti registrati dal sito, sessioni e visitatori della chat.

const modelli = require('../../src/models');
const authService = require('../../src/services/auth.service');
const utentiService = require('../../src/services/utenti.service');
const authRepo = require('../../src/repositories/auth.repository');
const utentiRepo = require('../../src/repositories/utenti.repository');
const { creaPdf } = require('../../src/utils/pdf');
const file = require('../../src/utils/file');
const { uuid } = require('../../src/utils/sicurezza');
const { CARTELLE_UPLOAD } = require('../../src/constants/sistema.constants');
const { PASSWORD_PROVA, ALLOGGIATI, META_PROVA, momento, retrodata } = require('./comune');

// Il primo account segna che il seed è già stato fatto.
const STAFF = [
  {
    chiave: 'reception',
    email: 'reception@example.com',
    nome: 'Giulia',
    cognome: 'Bianchi',
    ruolo: 'receptionist',
    telefono: '+39 340 1112233',
  },
  {
    chiave: 'reception2',
    email: 'reception2@example.com',
    nome: 'Luca',
    cognome: 'Verdi',
    ruolo: 'receptionist',
    telefono: '+39 340 2223344',
    lingua: 'en',
  },
  {
    chiave: 'governante',
    email: 'governante@example.com',
    nome: 'Anna',
    cognome: 'Neri',
    ruolo: 'housekeeper_senior',
    telefono: '+39 340 3334455',
  },
  {
    chiave: 'pulizie',
    email: 'pulizie@example.com',
    nome: 'Sara',
    cognome: 'Russo',
    ruolo: 'housekeeper',
    telefono: '+39 340 4445566',
  },
  {
    chiave: 'pulizie2',
    email: 'pulizie2@example.com',
    nome: 'Marco',
    cognome: 'Gallo',
    ruolo: 'housekeeper',
    telefono: '+39 340 5556677',
  },
  // Stagionale: a fine contratto l'account si disattiva.
  {
    chiave: 'stagionale',
    email: 'stagionale@example.com',
    nome: 'Federica',
    cognome: 'Piras',
    ruolo: 'housekeeper',
    telefono: '+39 340 6667788',
  },
  // Non lavora più qui: account eliminato.
  {
    chiave: 'exReception',
    email: 'ex.reception@example.com',
    nome: 'Paolo',
    cognome: 'Murgia',
    ruolo: 'receptionist',
  },
];
const SENTINELLA = STAFF[0].email;

// Clienti con l'anagrafica completata dall'area personale.
const CLIENTI = [
  {
    chiave: 'laura',
    email: 'laura.conti@example.com',
    nome: 'Laura',
    cognome: 'Conti',
    telefono: '+39 347 1234567',
    lingua: 'it',
    marketing: true,
    registrata: -700,
    anagrafica: {
      sesso: 'F',
      data_nascita: '1985-08-01',
      cittadinanza_codice: ALLOGGIATI.ITALIA,
      stato_nascita_codice: ALLOGGIATI.ITALIA,
      comune_nascita_codice: ALLOGGIATI.MILANO,
      provincia_nascita: 'MI',
      tipo_documento: 'IDENT',
      numero_documento: 'CA12345LC',
      luogo_rilascio_codice: ALLOGGIATI.MILANO,
      scadenza_documento: '2031-08-01',
      codice_fiscale: 'CNTLRA85M41F205Z',
      indirizzo: 'Via Dante 3',
      cap: '20121',
      citta: 'Milano',
      provincia: 'MI',
      paese: 'IT',
    },
  },
  {
    chiave: 'john',
    email: 'john.smith@example.com',
    nome: 'John',
    cognome: 'Smith',
    telefono: '+44 7700 900123',
    lingua: 'en',
    registrata: -420,
    anagrafica: {
      sesso: 'M',
      data_nascita: '1979-02-14',
      cittadinanza_codice: ALLOGGIATI.REGNO_UNITO,
      stato_nascita_codice: ALLOGGIATI.REGNO_UNITO,
      tipo_documento: 'PASOR',
      numero_documento: '533401872',
      luogo_rilascio_codice: ALLOGGIATI.REGNO_UNITO,
      scadenza_documento: '2029-05-30',
      indirizzo: '22 Baker Street',
      cap: 'NW1 6XE',
      citta: 'London',
      paese: 'GB',
    },
  },
  {
    chiave: 'chiara',
    email: 'chiara.ferri@example.com',
    nome: 'Chiara',
    cognome: 'Ferri',
    telefono: '+39 333 7654321',
    lingua: 'it',
    marketing: true,
    registrata: -200,
    anagrafica: {
      sesso: 'F',
      data_nascita: '1990-09-15',
      cittadinanza_codice: ALLOGGIATI.ITALIA,
      stato_nascita_codice: ALLOGGIATI.ITALIA,
      comune_nascita_codice: ALLOGGIATI.ROMA,
      provincia_nascita: 'RM',
      tipo_documento: 'PATEN',
      numero_documento: 'RM5512345K',
      luogo_rilascio_codice: ALLOGGIATI.ROMA,
      scadenza_documento: '2030-09-15',
      codice_fiscale: 'FRRCHR90P55H501U',
      indirizzo: 'Via Appia Nuova 120',
      cap: '00183',
      citta: 'Roma',
      provincia: 'RM',
      paese: 'IT',
    },
  },
  {
    chiave: 'sophie',
    email: 'sophie.martin@example.com',
    nome: 'Sophie',
    cognome: 'Martin',
    telefono: '+33 6 12 34 56 78',
    lingua: 'fr',
    registrata: -300,
    anagrafica: {
      sesso: 'F',
      data_nascita: '1992-04-03',
      cittadinanza_codice: ALLOGGIATI.FRANCIA,
      stato_nascita_codice: ALLOGGIATI.FRANCIA,
      tipo_documento: 'IDELE',
      numero_documento: 'X4RTBPFW4',
      luogo_rilascio_codice: ALLOGGIATI.FRANCIA,
      scadenza_documento: '2032-04-03',
      indirizzo: '14 rue des Lilas',
      cap: '69003',
      citta: 'Lyon',
      paese: 'FR',
    },
  },
  {
    chiave: 'klaus',
    email: 'klaus.weber@example.com',
    nome: 'Klaus',
    cognome: 'Weber',
    telefono: '+49 151 23456789',
    lingua: 'de',
    marketing: true,
    registrata: -500,
    anagrafica: {
      sesso: 'M',
      data_nascita: '1968-11-21',
      cittadinanza_codice: ALLOGGIATI.GERMANIA,
      stato_nascita_codice: ALLOGGIATI.GERMANIA,
      tipo_documento: 'PASOR',
      numero_documento: 'C4J9K2L7M',
      luogo_rilascio_codice: ALLOGGIATI.GERMANIA,
      scadenza_documento: '2028-11-21',
      indirizzo: 'Lindenstraße 8',
      cap: '80331',
      citta: 'München',
      paese: 'DE',
    },
  },
  {
    chiave: 'lucia',
    email: 'lucia.garcia@example.com',
    nome: 'Lucía',
    cognome: 'García',
    telefono: '+34 612 345 678',
    lingua: 'es',
    registrata: -90,
    anagrafica: {
      sesso: 'F',
      data_nascita: '1995-06-30',
      cittadinanza_codice: ALLOGGIATI.SPAGNA,
      stato_nascita_codice: ALLOGGIATI.SPAGNA,
      tipo_documento: 'IDENT',
      numero_documento: '12345678Z',
      luogo_rilascio_codice: ALLOGGIATI.SPAGNA,
      scadenza_documento: '2030-06-30',
      indirizzo: 'Calle Mayor 10',
      cap: '28013',
      citta: 'Madrid',
      paese: 'ES',
    },
  },
  // Appena registrato: deve ancora verificare l'email.
  {
    chiave: 'nuovo',
    email: 'andrea.loi@example.com',
    nome: 'Andrea',
    cognome: 'Loi',
    lingua: 'it',
    registrata: -1,
  },
  // Ha chiesto di cancellare l'account.
  {
    chiave: 'eliminato',
    email: 'elisa.sanna@example.com',
    nome: 'Elisa',
    cognome: 'Sanna',
    lingua: 'it',
    registrata: -365,
  },
];

// ─────────────────────────────────────
// Staff
// ─────────────────────────────────────

// Il gestionale c'è da 800 giorni: i gruppi di squadra sono nati con lui.
const APERTURA = -800;

async function creaStaff(ctxAdmin) {
  const staff = {};
  for (const [indice, { chiave, ...persona }] of STAFF.entries()) {
    staff[chiave] = await utentiService.creaStaff({ ...persona, password: PASSWORD_PROVA });
    const assunto = momento(APERTURA + indice * 60);
    await retrodata('utenti', { creato_il: assunto }, { id: staff[chiave].id });
    await retrodata(
      'conversazioni_partecipanti',
      { entrato_il: assunto },
      { utente_id: staff[chiave].id },
    );
  }

  await retrodata('utenti', { creato_il: momento(APERTURA, '09:00') }, { id: ctxAdmin.utenteId });
  await retrodata('conversazioni', { creato_il: momento(APERTURA) }, { tipo: 'staff' });
  await retrodata(
    'conversazioni_partecipanti',
    { entrato_il: momento(APERTURA) },
    { utente_id: ctxAdmin.utenteId },
  );

  // A fine stagione l'account si spegne e lascia il gruppo; l'ex collega è andato via in primavera.
  await utentiService.aggiornaAccount(staff.stagionale.id, { attivo: false }, ctxAdmin);
  await utentiService.elimina(staff.exReception.id, ctxAdmin);
  await retrodata('utenti', { eliminato_il: momento(-180) }, { id: staff.exReception.id });
  for (const [ex, giorni] of [
    [staff.stagionale, -25],
    [staff.exReception, -180],
  ]) {
    await retrodata(
      'conversazioni_partecipanti',
      { uscito_il: momento(giorni) },
      { utente_id: ex.id },
    );
  }
  return staff;
}

// ─────────────────────────────────────
// Sessioni
// ─────────────────────────────────────

/**
 * Accessi come dal sito: ultimo accesso, token di sessione ruotati, una
 * sessione chiusa con "esci" e una richiesta di nuova password.
 */
async function creaSessioni(staff, clienti) {
  const accessi = [
    ...['reception', 'reception2', 'governante', 'pulizie', 'pulizie2'].map(
      (chiave) => staff[chiave],
    ),
    ...['laura', 'john', 'chiara', 'sophie', 'klaus', 'lucia', 'nuovo'].map(
      (chiave) => clienti[chiave],
    ),
  ];
  for (const utente of accessi) {
    const { refreshToken } = await authService.accedi(utente.email, PASSWORD_PROVA, META_PROVA);
    await authService.rinnova(refreshToken, META_PROVA);
  }

  const uscita = await authService.accedi(clienti.john.email, PASSWORD_PROVA, META_PROVA);
  await authService.esci(uscita.refreshToken);
  await authService.richiediResetPassword(clienti.sophie.email);
}

// ─────────────────────────────────────
// Clienti
// ─────────────────────────────────────

/** Verifica come se il cliente avesse inserito il codice giusto (il codice è solo nell'email). */
async function verificaEmail(utenteId) {
  const token = await authRepo.trovaTokenValido({ utente_id: utenteId, tipo: 'verifica_email' });
  await authRepo.segnaTokenUsato(token.id);
  await utentiRepo.aggiornaUtente(utenteId, { email_verificata_il: new Date() });
}

/** Scansione del documento caricata dall'area personale (un PDF generato). */
async function caricaDocumento(cliente) {
  const pdf = await creaPdf({
    defaultStyle: { font: 'Helvetica', fontSize: 12 },
    content: [
      { text: 'Documento di identità', fontSize: 16, bold: true, margin: [0, 0, 0, 12] },
      `${cliente.nome} ${cliente.cognome}`,
      `N. ${cliente.anagrafica.numero_documento}`,
      `Scadenza ${cliente.anagrafica.scadenza_documento}`,
    ],
  });
  const relativo = await file.salva(`${CARTELLE_UPLOAD.documenti}/${uuid()}.pdf`, pdf);
  await utentiService.aggiungiDocumento(cliente.utente.id, {
    originalname: `documento-${cliente.cognome.toLowerCase()}.pdf`,
    path: file.percorsoAssoluto(relativo),
    mimetype: 'application/pdf',
    size: pdf.length,
  });
}

async function registraCliente({ email, nome, cognome, telefono, lingua, marketing }) {
  const { utente } = await authService.registra(
    {
      email,
      password: PASSWORD_PROVA,
      nome,
      cognome,
      telefono,
      lingua,
      consensi: { privacy: true, termini: true, marketing: Boolean(marketing) },
    },
    META_PROVA,
  );
  return utente;
}

async function creaClienti() {
  const clienti = {};
  for (const cliente of CLIENTI) {
    const utente = await registraCliente(cliente);
    clienti[cliente.chiave] = utente;
    if (cliente.chiave === 'nuovo') {
      continue;
    }

    // Laura sbaglia il codice una volta prima di quello giusto.
    if (cliente.chiave === 'laura') {
      await authService.verificaEmail(utente.id, '000000').catch(() => {});
    }
    await verificaEmail(utente.id);
    if (cliente.anagrafica) {
      await utentiService.aggiornaDatiPersonali(utente.id, {
        nome: cliente.nome,
        cognome: cliente.cognome,
        telefono: cliente.telefono,
        lingua: cliente.lingua,
        ...cliente.anagrafica,
      });
      await caricaDocumento({ ...cliente, utente });
    }
    await retrodata(
      'utenti',
      { creato_il: momento(cliente.registrata), email_verificata_il: momento(cliente.registrata) },
      { id: utente.id },
    );
  }

  // Preferenze: John non vuole promemoria, Chiara toglie le offerte, John le accetta.
  await utentiService.aggiornaPreferenzeEmail(
    clienti.john.id,
    { notifiche_email: false },
    META_PROVA,
  );
  await utentiService.aggiornaPreferenzeEmail(
    clienti.chiara.id,
    { email_marketing: false },
    META_PROVA,
  );
  await utentiService.aggiornaPreferenzeEmail(
    clienti.john.id,
    { email_marketing: true },
    META_PROVA,
  );
  await utentiService.eliminaAccount(clienti.eliminato.id, PASSWORD_PROVA);

  // Gli account completi, con l'anagrafica collegata.
  for (const [chiave, { id }] of Object.entries(clienti)) {
    clienti[chiave] = await modelli.Utente.findByPk(id, { paranoid: false });
  }
  return clienti;
}

// ─────────────────────────────────────
// Visitatori della chat
// ─────────────────────────────────────

const VISITATORI = [
  { chiave: 'marta', nome: 'Marta', email: 'marta.deriu@example.com', lingua: 'it' },
  { chiave: 'pierre', nome: 'Pierre', email: null, lingua: 'fr' },
  // Poi si è registrato: è Andrea.
  { chiave: 'andrea', nome: 'Andrea', email: 'andrea.loi@example.com', lingua: 'it' },
  // Pubblicità ripetuta in chat: bloccato.
  { chiave: 'spam', nome: 'Offerte SEO', email: 'promo@example.com', lingua: 'en' },
];

async function creaVisitatori(clienti) {
  const visitatori = {};
  for (const { chiave, ...dati } of VISITATORI) {
    const { visitatore } = await authService.creaVisitatore(dati, META_PROVA);
    visitatori[chiave] = await modelli.Visitatore.findOne({ where: { uuid: visitatore.uuid } });
  }

  const cookie = await authRepo.trovaDocumentoLegalePubblicato('cookie');
  await authRepo.creaConsensi([
    ...Object.values(visitatori).map((visitatore) => ({
      visitatore_id: visitatore.id,
      documento_id: cookie.id,
      tipo: 'cookie',
      accettato: visitatore.nome !== 'Pierre',
      ip: META_PROVA.ip,
      user_agent: META_PROVA.userAgent,
    })),
    {
      utente_id: clienti.laura.id,
      ospite_id: clienti.laura.ospite_id,
      documento_id: cookie.id,
      tipo: 'cookie',
      accettato: true,
      ip: META_PROVA.ip,
      user_agent: META_PROVA.userAgent,
    },
  ]);

  await modelli.Visitatore.update(
    { utente_id: clienti.nuovo.id },
    { where: { id: visitatori.andrea.id } },
  );
  await modelli.Visitatore.update({ bloccato: true }, { where: { id: visitatori.spam.id } });
  return visitatori;
}

async function creaPersone(ctxAdmin) {
  const staff = await creaStaff(ctxAdmin);
  const clienti = await creaClienti();
  await creaSessioni(staff, clienti);
  const visitatori = await creaVisitatori(clienti);
  return { staff, clienti, visitatori };
}

module.exports = { SENTINELLA, creaPersone };
