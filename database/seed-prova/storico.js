// Soggiorni passati, dalla prenotazione alla partenza: incassi, ospiti,
// schedine Alloggiati, pulizia di partenza, punti fedeltà e cancellazioni.

const modelli = require('../../src/models');
const prenotazioniRepo = require('../../src/repositories/prenotazioni.repository');
const pagamentiRepo = require('../../src/repositories/pagamenti.repository');
const pulizieRepo = require('../../src/repositories/pulizie.repository');
const prenotazioniService = require('../../src/services/prenotazioni.service');
const pagamentiService = require('../../src/services/pagamenti.service');
const ospitiService = require('../../src/services/ospiti.service');
const pulizieService = require('../../src/services/pulizie.service');
const alloggiatiService = require('../../src/services/alloggiati.service');
const camereService = require('../../src/services/camere.service');
const { uuid } = require('../../src/utils/sicurezza');
const {
  ALLOGGIATI,
  contesto,
  giorno,
  momento,
  retrodata,
  segnaTempo,
  retrodataDa,
} = require('./comune');

// ─────────────────────────────────────
// Ospiti senza account
// ─────────────────────────────────────

const OSPITI = {
  mueller: {
    nome: 'Hans',
    cognome: 'Müller',
    email: 'hans.mueller@example.com',
    telefono: '+49 170 5551234',
    lingua: 'de',
    sesso: 'M',
    data_nascita: '1975-03-12',
    cittadinanza_codice: ALLOGGIATI.GERMANIA,
    stato_nascita_codice: ALLOGGIATI.GERMANIA,
    tipo_documento: 'PASOR',
    numero_documento: 'C01X00T47',
    luogo_rilascio_codice: ALLOGGIATI.GERMANIA,
    scadenza_documento: '2030-03-12',
    indirizzo: 'Gartenstraße 21',
    cap: '50667',
    citta: 'Köln',
    paese: 'DE',
    note: 'Prenota sempre da Booking.com, gradisce la camera lontana dalla strada.',
  },
  muellerMoglie: {
    nome: 'Petra',
    cognome: 'Müller',
    sesso: 'F',
    data_nascita: '1977-07-02',
    cittadinanza_codice: ALLOGGIATI.GERMANIA,
    stato_nascita_codice: ALLOGGIATI.GERMANIA,
  },
  weberMoglie: {
    nome: 'Ingrid',
    cognome: 'Weber',
    sesso: 'F',
    data_nascita: '1970-01-30',
    cittadinanza_codice: ALLOGGIATI.GERMANIA,
    stato_nascita_codice: ALLOGGIATI.GERMANIA,
    tipo_documento: 'PASOR',
    numero_documento: 'C4J9K2L8N',
    luogo_rilascio_codice: ALLOGGIATI.GERMANIA,
    scadenza_documento: '2029-01-30',
  },
  contiMarito: {
    nome: 'Paolo',
    cognome: 'Rinaldi',
    sesso: 'M',
    data_nascita: '1983-05-19',
    cittadinanza_codice: ALLOGGIATI.ITALIA,
    stato_nascita_codice: ALLOGGIATI.ITALIA,
    comune_nascita_codice: ALLOGGIATI.TORINO,
    provincia_nascita: 'TO',
    codice_fiscale: 'RNLPLA83E19L219K',
  },
  smithMoglie: {
    nome: 'Emily',
    cognome: 'Smith',
    sesso: 'F',
    data_nascita: '1981-10-08',
    cittadinanza_codice: ALLOGGIATI.REGNO_UNITO,
    stato_nascita_codice: ALLOGGIATI.REGNO_UNITO,
  },
  smithFiglio: {
    nome: 'Oliver',
    cognome: 'Smith',
    sesso: 'M',
    data_nascita: '2017-06-21',
    cittadinanza_codice: ALLOGGIATI.REGNO_UNITO,
    stato_nascita_codice: ALLOGGIATI.REGNO_UNITO,
  },
  smithFiglia: {
    nome: 'Amelia',
    cognome: 'Smith',
    sesso: 'F',
    data_nascita: '2020-02-11',
    cittadinanza_codice: ALLOGGIATI.REGNO_UNITO,
    stato_nascita_codice: ALLOGGIATI.REGNO_UNITO,
  },
  martinAmica: {
    nome: 'Camille',
    cognome: 'Durand',
    sesso: 'F',
    data_nascita: '1991-12-24',
    cittadinanza_codice: ALLOGGIATI.FRANCIA,
    stato_nascita_codice: ALLOGGIATI.FRANCIA,
    tipo_documento: 'IDELE',
    numero_documento: 'Y7PQRS2T1',
    luogo_rilascio_codice: ALLOGGIATI.FRANCIA,
    scadenza_documento: '2031-12-24',
  },
  pinna: {
    nome: 'Franco',
    cognome: 'Pinna',
    email: 'franco.pinna@example.com',
    telefono: '+39 340 1112223',
    lingua: 'it',
  },
  sechi: {
    nome: 'Gavino',
    cognome: 'Sechi',
    email: 'gavino.sechi@example.com',
    telefono: '+39 348 9988776',
    lingua: 'it',
  },
  melis: {
    nome: 'Giorgio',
    cognome: 'Melis',
    telefono: '+39 333 0000002',
    lingua: 'it',
  },
  fadda: {
    nome: 'Roberto',
    cognome: 'Fadda',
    telefono: '+39 349 4455667',
    lingua: 'it',
    sesso: 'M',
    data_nascita: '1988-04-17',
    cittadinanza_codice: ALLOGGIATI.ITALIA,
    stato_nascita_codice: ALLOGGIATI.ITALIA,
    comune_nascita_codice: ALLOGGIATI.SASSARI,
    provincia_nascita: 'SS',
    tipo_documento: 'PATEN',
    numero_documento: 'SS1234567X',
    luogo_rilascio_codice: ALLOGGIATI.SASSARI,
    scadenza_documento: '2033-04-17',
    codice_fiscale: 'FDDRRT88D17I452B',
    indirizzo: 'Via Roma 45',
    cap: '07100',
    citta: 'Sassari',
    provincia: 'SS',
    paese: 'IT',
  },
  garciaCompagno: {
    nome: 'Javier',
    cognome: 'Ruiz',
    sesso: 'M',
    data_nascita: '1993-08-05',
    cittadinanza_codice: ALLOGGIATI.SPAGNA,
    stato_nascita_codice: ALLOGGIATI.SPAGNA,
    tipo_documento: 'IDENT',
    numero_documento: '87654321X',
    luogo_rilascio_codice: ALLOGGIATI.SPAGNA,
    scadenza_documento: '2029-08-05',
  },
  ferriCompagno: {
    nome: 'Luca',
    cognome: 'Bianchi',
    sesso: 'M',
    data_nascita: '1989-02-27',
    cittadinanza_codice: ALLOGGIATI.ITALIA,
    stato_nascita_codice: ALLOGGIATI.ITALIA,
    comune_nascita_codice: ALLOGGIATI.FIRENZE,
    provincia_nascita: 'FI',
    tipo_documento: 'IDENT',
    numero_documento: 'CA98765LB',
    luogo_rilascio_codice: ALLOGGIATI.FIRENZE,
    scadenza_documento: '2032-02-27',
  },
  deVries: {
    nome: 'Pieter',
    cognome: 'de Vries',
    email: 'pieter.devries@example.com',
    telefono: '+31 6 12345678',
    lingua: 'en',
    sesso: 'M',
    data_nascita: '1986-09-09',
    cittadinanza_codice: ALLOGGIATI.PAESI_BASSI,
    stato_nascita_codice: ALLOGGIATI.PAESI_BASSI,
    tipo_documento: 'PASOR',
    numero_documento: 'NXK4R8P21',
    luogo_rilascio_codice: ALLOGGIATI.PAESI_BASSI,
    scadenza_documento: '2031-09-09',
    indirizzo: 'Prinsengracht 263',
    cap: '1016 GV',
    citta: 'Amsterdam',
    paese: 'NL',
  },
  deVriesCompagna: {
    nome: 'Anouk',
    cognome: 'Jansen',
    sesso: 'F',
    data_nascita: '1988-11-30',
    cittadinanza_codice: ALLOGGIATI.PAESI_BASSI,
    stato_nascita_codice: ALLOGGIATI.PAESI_BASSI,
  },
  pala: {
    nome: 'Marco',
    cognome: 'Pala',
    email: 'marco.pala@nuraghesoftware.example.com',
    telefono: '+39 070 6543210',
    lingua: 'it',
    sesso: 'M',
    data_nascita: '1980-12-03',
    cittadinanza_codice: ALLOGGIATI.ITALIA,
    stato_nascita_codice: ALLOGGIATI.ITALIA,
    comune_nascita_codice: ALLOGGIATI.CAGLIARI,
    provincia_nascita: 'CA',
    tipo_documento: 'IDELE',
    numero_documento: 'CA00112MP',
    luogo_rilascio_codice: ALLOGGIATI.CAGLIARI,
    scadenza_documento: '2032-12-03',
    codice_fiscale: 'PLAMRC80T03B354Y',
    indirizzo: 'Via Sonnino 12',
    cap: '09125',
    citta: 'Cagliari',
    provincia: 'CA',
    paese: 'IT',
  },
};

const MINORE = { esente_tassa: true, motivo_esenzione: 'Minore di 14 anni' };

// ─────────────────────────────────────
// Soggiorni conclusi
// ─────────────────────────────────────

/**
 * giorni: [arrivo, partenza] rispetto a oggi; anticipo: giorni tra prenotazione e arrivo.
 * incassi: { tipo, metodo, importo? } (senza importo: l'acconto chiesto o quanto resta).
 * durante: extra aggiunti durante il soggiorno; alloggiati: invii al portale
 * (vuoto: schedine ancora da inviare).
 */
const SOGGIORNI = [
  {
    chiave: 'lauraPrimo',
    camera: '102',
    giorni: [-600, -596],
    anticipo: 25,
    cliente: 'laura',
    adulti: 2,
    canale: 'telefono',
    servizi: [['colazione', 1]],
    richieste_speciali: 'Camera tranquilla, se possibile.',
    compagni: [{ ospite: OSPITI.contiMarito, tipo_alloggiato: 'familiare' }],
    incassi: [
      { tipo: 'acconto', metodo: 'bonifico', riferimento: 'CRO 0300045512' },
      { tipo: 'saldo', metodo: 'pos', riferimento: 'POS 004512' },
    ],
  },
  {
    chiave: 'klausPrimo',
    camera: 'dependance',
    giorni: [-500, -496],
    anticipo: 60,
    cliente: 'klaus',
    adulti: 2,
    canale: 'email',
    ora_arrivo_prevista: '17:00',
    compagni: [{ ospite: OSPITI.weberMoglie, tipo_alloggiato: 'familiare' }],
    incassi: [{ tipo: 'saldo', metodo: 'contanti', documento_fiscale: 'DC 0042-0117' }],
  },
  {
    chiave: 'mueller',
    camera: '203',
    giorni: [-450, -446],
    anticipo: 90,
    titolare: OSPITI.mueller,
    adulti: 2,
    canale: 'booking_com',
    id_esterno: '4012345678',
    compagni: [{ ospite: OSPITI.muellerMoglie, tipo_alloggiato: 'familiare' }],
    incassi: [{ tipo: 'saldo', metodo: 'ota', riferimento: 'Booking.com payout 2025-07' }],
    alloggiati: [
      { esito: 'errore', messaggio: 'Riga 2: data di nascita mancante' },
      { esito: 'inviata', messaggio: 'Schedine acquisite dal portale' },
    ],
  },
  {
    chiave: 'lauraBenvenuto',
    camera: '201',
    giorni: [-380, -377],
    anticipo: 40,
    cliente: 'laura',
    adulti: 1,
    canale: 'email',
    codice_sconto: 'BENVENUTO10',
    incassi: [
      { tipo: 'acconto', metodo: 'stripe' },
      { tipo: 'saldo', metodo: 'stripe' },
    ],
  },
  {
    chiave: 'johnFamiglia',
    camera: '104',
    giorni: [-330, -327],
    anticipo: 50,
    cliente: 'john',
    adulti: 2,
    bambini: 1,
    eta_bambini: [8],
    canale: 'email',
    richieste_speciali: 'A cot is not needed, the child sleeps in the extra bed.',
    compagni: [
      { ospite: OSPITI.smithMoglie, tipo_alloggiato: 'familiare' },
      { ospite: OSPITI.smithFiglio, tipo_alloggiato: 'familiare', ...MINORE },
    ],
    incassi: [
      { tipo: 'acconto', metodo: 'paypal' },
      { tipo: 'saldo', metodo: 'paypal' },
    ],
  },
  {
    chiave: 'sophieMare',
    camera: '301',
    giorni: [-250, -246],
    anticipo: 35,
    cliente: 'sophie',
    adulti: 2,
    canale: 'email',
    pacchetto: 'mare',
    compagni: [{ ospite: OSPITI.martinAmica, tipo_alloggiato: 'membro_gruppo' }],
    incassi: [
      { tipo: 'acconto', metodo: 'stripe' },
      { tipo: 'saldo', metodo: 'pos', riferimento: 'POS 007781' },
    ],
  },
  {
    chiave: 'klausLungo',
    camera: '203',
    giorni: [-120, -113],
    anticipo: 120,
    cliente: 'klaus',
    adulti: 2,
    canale: 'telefono',
    servizi: [
      ['parcheggio', 1],
      ['colazione', 1],
    ],
    compagni: [{ ospite: OSPITI.weberMoglie, tipo_alloggiato: 'familiare' }],
    incassi: [
      { tipo: 'acconto', metodo: 'bonifico', riferimento: 'SEPA DE89370400440532013000' },
      { tipo: 'saldo', metodo: 'bonifico', riferimento: 'SEPA DE89370400440532013000' },
    ],
  },
  {
    chiave: 'lauraAmici',
    camera: '103',
    giorni: [-90, -87],
    anticipo: 20,
    cliente: 'laura',
    adulti: 2,
    canale: 'telefono',
    codice_sconto: 'AMICI15',
    durante: [['massaggio', 2]],
    compagni: [{ ospite: OSPITI.contiMarito, tipo_alloggiato: 'familiare' }],
    incassi: [
      { tipo: 'acconto', metodo: 'pos', riferimento: 'POS 010233' },
      {
        tipo: 'saldo',
        metodo: 'pos',
        riferimento: 'POS 010290',
        documento_fiscale: 'DC 0187-0002',
      },
    ],
  },
  {
    chiave: 'fadda',
    camera: 'dependance',
    giorni: [-80, -77],
    anticipo: 0,
    titolare: OSPITI.fadda,
    adulti: 1,
    canale: 'walk_in',
    note_interne: 'Arrivato senza prenotazione, pagato in contanti alla partenza.',
    incassi: [{ tipo: 'saldo', metodo: 'contanti', documento_fiscale: 'DC 0201-0009' }],
  },
  {
    chiave: 'lucia',
    camera: '202',
    giorni: [-45, -42],
    anticipo: 15,
    cliente: 'lucia',
    adulti: 2,
    canale: 'email',
    servizi: [['bici', 2]],
    compagni: [{ ospite: OSPITI.garciaCompagno, tipo_alloggiato: 'familiare' }],
    incassi: [
      { tipo: 'acconto', metodo: 'stripe' },
      { tipo: 'saldo', metodo: 'stripe' },
    ],
  },
  {
    chiave: 'chiara',
    camera: '105',
    giorni: [-30, -27],
    anticipo: 10,
    cliente: 'chiara',
    adulti: 2,
    canale: 'telefono',
    compagni: [
      {
        ospite: OSPITI.ferriCompagno,
        tipo_alloggiato: 'familiare',
        esente_tassa: true,
        motivo_esenzione: 'Volontario della protezione civile in servizio',
      },
    ],
    incassi: [
      { tipo: 'acconto', metodo: 'paypal' },
      { tipo: 'saldo', metodo: 'paypal' },
    ],
  },
  {
    chiave: 'deVries',
    camera: '204',
    giorni: [-20, -16],
    anticipo: 70,
    titolare: OSPITI.deVries,
    adulti: 2,
    canale: 'expedia',
    id_esterno: 'EXP-7319904426',
    ora_arrivo_prevista: '21:30',
    compagni: [{ ospite: OSPITI.deVriesCompagna, tipo_alloggiato: 'familiare' }],
    incassi: [{ tipo: 'saldo', metodo: 'ota', riferimento: 'Expedia Collect EC-88123' }],
    alloggiati: [
      { esito: 'test', messaggio: 'Prova di trasmissione dal portale' },
      { esito: 'inviata' },
    ],
  },
  {
    chiave: 'johnSuite',
    camera: '301',
    giorni: [-12, -9],
    anticipo: 45,
    cliente: 'john',
    adulti: 2,
    bambini: 2,
    eta_bambini: [9, 6],
    canale: 'email',
    durante: [['lateCheckout', 1]],
    compagni: [
      { ospite: OSPITI.smithMoglie, tipo_alloggiato: 'familiare' },
      { ospite: OSPITI.smithFiglio, tipo_alloggiato: 'familiare', ...MINORE },
      { ospite: OSPITI.smithFiglia, tipo_alloggiato: 'familiare', ...MINORE },
    ],
    incassi: [
      { tipo: 'acconto', metodo: 'stripe' },
      { tipo: 'extra', metodo: 'contanti', importo: 30, note: 'Late check-out alle 14' },
      { tipo: 'saldo', metodo: 'pos', riferimento: 'POS 015502' },
    ],
  },
  // Ospite di un'azienda: parte con il saldo aperto, paga l'azienda con bonifico.
  {
    chiave: 'pala',
    camera: '201',
    giorni: [-5, -3],
    anticipo: 7,
    titolare: OSPITI.pala,
    adulti: 1,
    canale: 'email',
    servizi: [['parcheggio', 1]],
    note_interne: 'Fattura a Nuraghe Software srl, saldo con bonifico a 30 giorni.',
    incassi: [],
    forza: true,
  },
];

// ─────────────────────────────────────
// Incassi
// ─────────────────────────────────────

const hex = (lunghezza) => uuid().replace(/-/g, '').slice(0, lunghezza);

/** Quanto resta da pagare (negativo se pagato in più). */
async function saldoDi(prenotazioneId) {
  const { saldo } = await prenotazioniRepo.trovaSaldo(prenotazioneId);
  return Number(saldo);
}

/** Pagamento con carta o PayPal com'è dopo il webhook del provider. */
async function pagaOnline(prenotazione, { tipo, metodo, importo }, quando) {
  const stripe = metodo === 'stripe';
  const ordine = stripe ? `cs_live_${hex(24)}` : hex(17).toUpperCase();
  const transazione = stripe ? `pi_${hex(24)}` : hex(17).toUpperCase();
  const pagamento = await pagamentiRepo.creaPagamento({
    prenotazione_id: prenotazione.id,
    tipo,
    metodo,
    stato: 'completato',
    importo,
    valuta: prenotazione.valuta,
    id_transazione: transazione,
    riferimento: ordine,
    link_pagamento: stripe
      ? `https://checkout.stripe.com/c/pay/${ordine}`
      : `https://www.paypal.com/checkoutnow?token=${ordine}`,
    pagato_il: quando,
  });

  const evento = stripe ? `evt_${hex(24)}` : `WH-${hex(8).toUpperCase()}-${hex(12).toUpperCase()}`;
  const tipoEvento = stripe ? 'checkout.session.completed' : 'PAYMENT.CAPTURE.COMPLETED';
  await pagamentiRepo.registraEventoWebhook(metodo, evento, tipoEvento, {
    id: evento,
    type: tipoEvento,
    data: { pagamento_uuid: pagamento.uuid, ordine, transazione, importo },
  });
  await pagamentiRepo.aggiornaEventoWebhook(metodo, evento, { elaborato_il: quando });
  await retrodata(
    'eventi_webhook',
    { ricevuto_il: quando },
    { provider: metodo, id_evento: evento },
  );
  return pagamento;
}

/** Un incasso alla data indicata: in struttura con il service, online come da webhook. */
async function incassa(prenotazione, incasso, quando, ctx) {
  let importo = incasso.importo;
  if (importo == null) {
    const acconto = Number(prenotazione.acconto_richiesto) || Number(prenotazione.totale) * 0.3;
    importo = incasso.tipo === 'acconto' ? acconto : await saldoDi(prenotazione.id);
  }
  importo = Math.round(importo * 100) / 100;
  if (importo <= 0) {
    return null;
  }

  const pagamento = ['stripe', 'paypal'].includes(incasso.metodo)
    ? await pagaOnline(prenotazione, { ...incasso, importo }, quando)
    : await pagamentiService.registra(prenotazione.id, { ...incasso, importo }, ctx);
  await retrodata('pagamenti', { creato_il: quando, pagato_il: quando }, { id: pagamento.id });
  return pagamento;
}

/** Paga tutto ciò che resta, se resta qualcosa. */
async function saldaTutto(prenotazione, metodo, quando, ctx) {
  return await incassa(prenotazione, { tipo: 'saldo', metodo }, quando, ctx);
}

// ─────────────────────────────────────
// Un soggiorno
// ─────────────────────────────────────

/** Esegue `azione` e sposta a `quando` notifiche e registro che ha generato. */
async function alMomento(quando, azione, opzioni) {
  const inizio = segnaTempo();
  const risultato = await azione();
  await retrodataDa(inizio, quando, opzioni);
  return risultato;
}

function datiPrenotazione(soggiorno, catalogo, clienti) {
  const { camere, extra, pacchetti, piani } = catalogo;
  const [arrivo, partenza] = soggiorno.giorni;
  return {
    camera_id: camere[soggiorno.camera].id,
    arrivo: giorno(arrivo),
    partenza: giorno(partenza),
    adulti: soggiorno.adulti,
    bambini: soggiorno.bambini,
    eta_bambini: soggiorno.eta_bambini,
    utente_id: soggiorno.cliente ? clienti[soggiorno.cliente].id : undefined,
    titolare: soggiorno.titolare,
    canale: soggiorno.canale,
    id_esterno: soggiorno.id_esterno,
    codice_sconto: soggiorno.codice_sconto,
    pacchetto_id: soggiorno.pacchetto ? pacchetti[soggiorno.pacchetto].id : undefined,
    piano_id: soggiorno.piano ? piani[soggiorno.piano].id : undefined,
    servizi: (soggiorno.servizi ?? []).map(([servizio, quantita]) => ({
      servizio_id: extra[servizio].id,
      quantita,
    })),
    richieste_speciali: soggiorno.richieste_speciali,
    note_interne: soggiorno.note_interne,
    ora_arrivo_prevista: soggiorno.ora_arrivo_prevista,
    stato: soggiorno.stato ?? 'confermata',
  };
}

/** Prenotazione nata `anticipo` giorni prima dell'arrivo, con l'acconto se previsto. */
async function prenota(soggiorno, catalogo, clienti, ctx) {
  const [arrivo] = soggiorno.giorni;
  const quando = momento(arrivo - (soggiorno.anticipo ?? 30), '09:30');
  const prenotazione = await alMomento(quando, () =>
    prenotazioniService.crea(datiPrenotazione(soggiorno, catalogo, clienti), ctx),
  );
  // Il codice porta l'anno in cui è nata la prenotazione (P25-…).
  prenotazione.codice = prenotazione.codice.replace(
    /^P\d\d/,
    `P${String(quando.getUTCFullYear()).slice(2)}`,
  );
  await retrodata(
    'prenotazioni',
    { creato_il: quando, codice: prenotazione.codice },
    { id: prenotazione.id },
  );

  const acconto = soggiorno.incassi?.find((incasso) => incasso.tipo === 'acconto');
  if (acconto) {
    const pagato = momento(arrivo - (soggiorno.anticipo ?? 30), '11:00');
    await alMomento(pagato, () => incassa(prenotazione, acconto, pagato, ctx));
  }
  return prenotazione;
}

/** Ospiti registrati all'arrivo e schedine inviate alla Questura. */
async function registraOspiti(prenotazione, soggiorno, ctx) {
  await ospitiService.impostaDiPrenotazione(
    prenotazione.id,
    [
      {
        ospite: { id: prenotazione.ospite_id },
        tipo_alloggiato: soggiorno.compagni?.length ? 'capofamiglia' : 'ospite_singolo',
      },
      ...(soggiorno.compagni ?? []),
    ],
    ctx,
  );
  for (const invio of soggiorno.alloggiati ?? [{ esito: 'inviata' }]) {
    await alloggiatiService.registraInvio(prenotazione.id, invio, ctx);
  }
  const [arrivo] = soggiorno.giorni;
  await retrodata(
    'invii_alloggiati',
    { inviato_il: momento(arrivo, '18:00') },
    { prenotazione_id: prenotazione.id },
  );
}

/** La pulizia di partenza creata dal DB, fatta e controllata il giorno stesso. */
async function puliziaFatta(prenotazione, partenza, staff) {
  const attivita = await modelli.AttivitaPulizia.findOne({
    where: { prenotazione_id: prenotazione.id, tipo: 'partenza' },
  });
  const voci = await pulizieService.checklistPer('partenza');
  await pulizieRepo.aggiornaAttivita(attivita.id, {
    data_prevista: giorno(partenza),
    assegnata_a: (partenza % 2 === 0 ? staff.pulizie : staff.pulizie2).id,
    stato: 'verificata',
    checklist: voci.map((voce) => ({ ...voce, fatto: true })),
    iniziata_il: momento(partenza, '11:00'),
    completata_il: momento(partenza, '11:50'),
    verificata_il: momento(partenza, '12:20'),
    verificata_da: staff.governante.id,
  });
  await retrodata(
    'attivita_pulizia',
    { creato_il: momento(partenza, '10:30') },
    { id: attivita.id },
  );
}

/** Check-in, ospiti registrati ed extra chiesti durante il soggiorno. */
async function arriva(prenotazione, soggiorno, catalogo, ctx) {
  const [arrivo] = soggiorno.giorni;
  const ingresso = momento(arrivo, '15:30');
  await alMomento(ingresso, async () => {
    await prenotazioniService.checkIn(prenotazione.id, ctx);
    await registraOspiti(prenotazione, soggiorno, ctx);
  });
  await retrodata('prenotazioni', { arrivo_effettivo_il: ingresso }, { id: prenotazione.id });

  const durante = arrivo < 0 ? momento(arrivo + 1, '19:00') : ingresso;
  await alMomento(durante, async () => {
    for (const [servizio, quantita] of soggiorno.durante ?? []) {
      await prenotazioniService.aggiungiServizio(
        prenotazione.id,
        { servizio_id: catalogo.extra[servizio].id, quantita },
        ctx,
      );
    }
  });
}

async function soggiornoConcluso(soggiorno, catalogo, { clienti, staff }, ctx) {
  const [, partenza] = soggiorno.giorni;
  const prenotazione = await prenota(soggiorno, catalogo, clienti, ctx);
  await arriva(prenotazione, soggiorno, catalogo, ctx);

  const uscita = momento(partenza, '10:30');
  await alMomento(uscita, async () => {
    for (const incasso of soggiorno.incassi.filter((voce) => voce.tipo !== 'acconto')) {
      await incassa(prenotazione, incasso, uscita, ctx);
    }
    await prenotazioniService.checkOut(prenotazione.id, { forza: soggiorno.forza }, ctx);
    await puliziaFatta(prenotazione, partenza, staff);
  });

  await retrodata('prenotazioni', { partenza_effettiva_il: uscita }, { id: prenotazione.id });
  await retrodata('movimenti_punti', { creato_il: uscita }, { prenotazione_id: prenotazione.id });
  return prenotazione;
}

// ─────────────────────────────────────
// Cancellazioni e mancati arrivi
// ─────────────────────────────────────

/** Non rimborsabile pagata per intero: si trattiene il soggiorno, si rende la tassa. */
async function cancellataNonRimborsabile(catalogo, clienti, ctx) {
  const soggiorno = {
    camera: '102',
    giorni: [-220, -218],
    anticipo: 40,
    titolare: OSPITI.pinna,
    adulti: 2,
    piano: 'nonRimborsabile',
    incassi: [{ tipo: 'acconto', metodo: 'bonifico', riferimento: 'CRO 0300099871' }],
  };
  const prenotazione = await prenota(soggiorno, catalogo, clienti, ctx);
  // Con un secondo bonifico l'ospite ha versato anche l'imposta di soggiorno.
  const pagata = momento(-258, '10:00');
  const tassaVersata = await alMomento(pagata, () =>
    saldaTutto(prenotazione, 'bonifico', pagata, ctx),
  );
  const quando = momento(-225, '16:00');

  await alMomento(quando, async () => {
    const tassa = Number(prenotazione.tassa_soggiorno);
    await prenotazioniService.cancella(
      prenotazione.id,
      { motivo: 'Lutto in famiglia', penale: Number(prenotazione.totale) - tassa },
      ctx,
    );
    if (tassaVersata) {
      const rimborso = await pagamentiService.rimborsa(
        tassaVersata.id,
        { importo: tassa, motivo: 'Imposta di soggiorno non dovuta' },
        ctx,
      );
      await retrodata('pagamenti', { creato_il: quando, pagato_il: quando }, { id: rimborso.id });
    }
  });
  await retrodata('prenotazioni', { cancellata_il: quando }, { id: prenotazione.id });
  return prenotazione;
}

/** Flessibile cancellata a ridosso dell'arrivo: penale e resto dell'acconto restituito. */
async function cancellataInRitardo(catalogo, clienti, ctx) {
  const soggiorno = {
    camera: '101',
    giorni: [-180, -177],
    anticipo: 20,
    titolare: OSPITI.sechi,
    adulti: 1,
    canale: 'altro',
    piano: 'flessibile',
    note_interne: "Prenotata tramite l'agenzia Viaggi Sardi.",
    incassi: [{ tipo: 'acconto', metodo: 'pos', riferimento: 'POS 008820' }],
  };
  const prenotazione = await prenota(soggiorno, catalogo, clienti, ctx);
  const [acconto] = await pagamentiRepo.trovaPagamentiDiPrenotazione(prenotazione.id);
  const quando = momento(-181, '20:15');
  const penale = Math.round(Number(acconto.importo) * 50) / 100;

  await alMomento(quando, async () => {
    await prenotazioniService.cancella(prenotazione.id, { motivo: 'Volo cancellato', penale }, ctx);
    const rimborso = await pagamentiService.rimborsa(
      acconto.id,
      {
        importo: Number(acconto.importo) - penale,
        motivo: "Restituzione dell'acconto oltre la penale",
      },
      ctx,
    );
    await retrodata('pagamenti', { creato_il: quando, pagato_il: quando }, { id: rimborso.id });
  });
  await retrodata('prenotazioni', { cancellata_il: quando }, { id: prenotazione.id });
  return prenotazione;
}

/** Mai arrivato: Airbnb versa comunque l'intero importo come penale. */
async function mancatoArrivo(catalogo, clienti, ctx) {
  const soggiorno = {
    camera: '201',
    giorni: [-150, -148],
    anticipo: 30,
    titolare: OSPITI.melis,
    adulti: 2,
    canale: 'airbnb',
    id_esterno: 'HMABC12345',
  };
  const prenotazione = await prenota(soggiorno, catalogo, clienti, ctx);
  const quando = momento(-149, '09:00');
  await alMomento(quando, async () => {
    await prenotazioniService.noShow(prenotazione.id, ctx);
    await incassa(
      prenotazione,
      {
        tipo: 'penale',
        metodo: 'ota',
        importo: await saldoDi(prenotazione.id),
        riferimento: 'Airbnb payout HMABC12345',
        note: 'Mancato arrivo, nessun avviso',
      },
      quando,
      ctx,
    );
  });
  return prenotazione;
}

// ─────────────────────────────────────
// Avvio
// ─────────────────────────────────────

async function creaStorico(catalogo, persone) {
  const ctx = contesto(persone.staff.reception);
  const storico = {};
  for (const soggiorno of SOGGIORNI) {
    storico[soggiorno.chiave] = await soggiornoConcluso(soggiorno, catalogo, persone, ctx);
  }
  storico.cancellata = await cancellataNonRimborsabile(catalogo, persone.clienti, ctx);
  storico.cancellataTardi = await cancellataInRitardo(catalogo, persone.clienti, ctx);
  storico.noShow = await mancatoArrivo(catalogo, persone.clienti, ctx);

  // La dependance ha chiuso: resta solo nello storico delle prenotazioni.
  await camereService.eliminaCamera(catalogo.camere.dependance.id);
  return storico;
}

module.exports = {
  OSPITI,
  creaStorico,
  prenota,
  arriva,
  incassa,
  saldaTutto,
  pagaOnline,
  alMomento,
  saldoDi,
};
