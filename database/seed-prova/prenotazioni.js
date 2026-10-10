// Soggiorni di oggi e futuri: ospiti in casa, arrivi e partenze del giorno,
// prenotazioni da confermare, prenotazioni online, cancellazioni e blocchi.

const prenotazioniService = require('../../src/services/prenotazioni.service');
const disponibilitaService = require('../../src/services/disponibilita.service');
const pagamentiRepo = require('../../src/repositories/pagamenti.repository');
const { uuid } = require('../../src/utils/sicurezza');
const { ALLOGGIATI, IP_PROVA, contesto, giorno, momento, retrodata } = require('./comune');
const { OSPITI, prenota, arriva, incassa, saldaTutto, alMomento } = require('./storico');

const NUOVI = {
  rossi: {
    nome: 'Giulia',
    cognome: 'Rossi',
    email: 'giulia.rossi@example.com',
    telefono: '+39 339 1212121',
    lingua: 'it',
    sesso: 'F',
    data_nascita: '1987-03-08',
    cittadinanza_codice: ALLOGGIATI.ITALIA,
    stato_nascita_codice: ALLOGGIATI.ITALIA,
    comune_nascita_codice: ALLOGGIATI.BOLOGNA,
    provincia_nascita: 'BO',
    tipo_documento: 'IDELE',
    numero_documento: 'CA55667GR',
    luogo_rilascio_codice: ALLOGGIATI.BOLOGNA,
    scadenza_documento: '2033-03-08',
    codice_fiscale: 'RSSGLI87C48A944S',
    indirizzo: 'Via Indipendenza 7',
    cap: '40121',
    citta: 'Bologna',
    provincia: 'BO',
    paese: 'IT',
  },
  rossiMarito: {
    nome: 'Stefano',
    cognome: 'Rossi',
    sesso: 'M',
    data_nascita: '1985-12-01',
    cittadinanza_codice: ALLOGGIATI.ITALIA,
    stato_nascita_codice: ALLOGGIATI.ITALIA,
    comune_nascita_codice: ALLOGGIATI.BOLOGNA,
    provincia_nascita: 'BO',
  },
  rossiFiglio: {
    nome: 'Tommaso',
    cognome: 'Rossi',
    sesso: 'M',
    data_nascita: '2021-05-14',
    cittadinanza_codice: ALLOGGIATI.ITALIA,
    stato_nascita_codice: ALLOGGIATI.ITALIA,
    comune_nascita_codice: ALLOGGIATI.BOLOGNA,
    provincia_nascita: 'BO',
  },
  martinCompagno: {
    nome: 'Julien',
    cognome: 'Moreau',
    sesso: 'M',
    data_nascita: '1990-07-19',
    cittadinanza_codice: ALLOGGIATI.FRANCIA,
    stato_nascita_codice: ALLOGGIATI.FRANCIA,
  },
  deiana: {
    nome: 'Sofia',
    cognome: 'Deiana',
    email: 'sofia.deiana@example.com',
    telefono: '+39 320 7778899',
    lingua: 'it',
  },
  marras: {
    nome: 'Elena',
    cognome: 'Marras',
    email: 'elena.marras@example.com',
    telefono: '+39 328 3344556',
    lingua: 'it',
  },
  porcu: {
    nome: 'Davide',
    cognome: 'Porcu',
    email: 'davide.porcu@example.com',
    telefono: '+39 345 6677889',
    lingua: 'it',
  },
  serra: {
    nome: 'Martina',
    cognome: 'Serra',
    email: 'martina.serra@example.com',
    telefono: '+39 331 2233445',
    lingua: 'it',
  },
  murphy: {
    nome: 'Sean',
    cognome: 'Murphy',
    email: 'sean.murphy@example.com',
    telefono: '+353 87 1234567',
    lingua: 'en',
  },
  lindqvist: {
    nome: 'Erik',
    cognome: 'Lindqvist',
    email: 'erik.lindqvist@example.com',
    lingua: 'en',
  },
  atzori: {
    nome: 'Roberto',
    cognome: 'Atzori',
    email: 'roberto.atzori@example.com',
    telefono: '+39 347 9988776',
    lingua: 'it',
  },
  marta: { nome: 'Marta', cognome: 'Deriu', email: 'marta.deriu@example.com', lingua: 'it' },
};

// Dal link di check-in online Laura conferma i suoi dati e aggiunge la sorella.
const CHECKIN_LAURA = [
  { ospite: {}, tipo_alloggiato: 'capofamiglia' },
  {
    ospite: {
      nome: 'Elisa',
      cognome: 'Conti',
      sesso: 'F',
      data_nascita: '1992-09-30',
      cittadinanza_codice: ALLOGGIATI.ITALIA,
      stato_nascita_codice: ALLOGGIATI.ITALIA,
      comune_nascita_codice: ALLOGGIATI.MILANO,
      provincia_nascita: 'MI',
    },
    tipo_alloggiato: 'familiare',
  },
];

/**
 * fase: in_soggiorno (già arrivati) o lo stato della prenotazione.
 * Le chiavi dei soggiorni sono le stesse dello storico (prenota/arriva).
 */
const SOGGIORNI = [
  {
    chiave: 'rossi',
    camera: '104',
    giorni: [-2, 2],
    anticipo: 12,
    titolare: NUOVI.rossi,
    adulti: 2,
    bambini: 1,
    eta_bambini: [5],
    canale: 'telefono',
    servizi: [['parcheggio', 1]],
    durante: [['colazione', 1]],
    richieste_speciali: 'Lettino da campeggio per il bambino.',
    compagni: [
      { ospite: NUOVI.rossiMarito, tipo_alloggiato: 'familiare' },
      {
        ospite: NUOVI.rossiFiglio,
        tipo_alloggiato: 'familiare',
        esente_tassa: true,
        motivo_esenzione: 'Minore di 14 anni',
      },
    ],
    incassi: [{ tipo: 'acconto', metodo: 'contanti', documento_fiscale: 'DC 0233-0004' }],
    fase: 'in_soggiorno',
  },
  {
    chiave: 'sophie',
    camera: '301',
    giorni: [-1, 3],
    anticipo: 30,
    cliente: 'sophie',
    adulti: 2,
    canale: 'email',
    pacchetto: 'romantico',
    compagni: [{ ospite: NUOVI.martinCompagno, tipo_alloggiato: 'familiare' }],
    incassi: [{ tipo: 'acconto', metodo: 'stripe' }],
    saldo: 'stripe',
    // Schedine non ancora inviate: compaiono tra quelle da inviare ad Alloggiati Web.
    alloggiati: [],
    fase: 'in_soggiorno',
  },
  // Parte oggi: conto e partenza li registra la reception stamattina (operativita.js).
  {
    chiave: 'klaus',
    camera: '203',
    giorni: [-3, 0],
    anticipo: 60,
    cliente: 'klaus',
    adulti: 2,
    canale: 'email',
    servizi: [['colazione', 1]],
    compagni: [{ ospite: OSPITI.weberMoglie, tipo_alloggiato: 'familiare' }],
    incassi: [{ tipo: 'acconto', metodo: 'bonifico', riferimento: 'SEPA DE89370400440532013000' }],
    fase: 'in_soggiorno',
  },
  // Arriva oggi, ha già fatto il check-in online.
  {
    chiave: 'laura',
    camera: '102',
    giorni: [0, 3],
    anticipo: 18,
    cliente: 'laura',
    adulti: 2,
    canale: 'telefono',
    ora_arrivo_prevista: '16:00',
    incassi: [{ tipo: 'acconto', metodo: 'pos', riferimento: 'POS 016001' }],
    checkin: CHECKIN_LAURA,
  },
  // Arriva oggi, link di check-in mandato ma non ancora usato.
  {
    chiave: 'deiana',
    camera: '101',
    giorni: [0, 1],
    anticipo: 3,
    titolare: NUOVI.deiana,
    adulti: 1,
    canale: 'email',
    ora_arrivo_prevista: '18:00',
    incassi: [{ tipo: 'acconto', metodo: 'bonifico', riferimento: 'CRO 0300120044' }],
    link: true,
  },
  {
    chiave: 'john',
    camera: '103',
    giorni: [5, 8],
    anticipo: 40,
    cliente: 'john',
    adulti: 2,
    canale: 'email',
    codice_sconto: 'ESTATE20',
    servizi: [['transfer', 1]],
    incassi: [{ tipo: 'acconto', metodo: 'paypal' }],
  },
  {
    chiave: 'marras',
    camera: '102',
    giorni: [6, 8],
    anticipo: 8,
    titolare: NUOVI.marras,
    adulti: 2,
    canale: 'telefono',
    incassi: [{ tipo: 'acconto', metodo: 'bonifico', riferimento: 'CRO 0300120101' }],
  },
  {
    chiave: 'porcu',
    camera: '202',
    giorni: [10, 14],
    anticipo: 11,
    titolare: NUOVI.porcu,
    adulti: 2,
    canale: 'telefono',
    servizi: [['colazione', 1]],
    note_interne: "Richiamare per l'acconto: ha chiesto l'IBAN via email.",
    stato: 'in_attesa',
  },
  {
    chiave: 'airbnb',
    camera: '301',
    giorni: [15, 18],
    anticipo: 25,
    titolare: NUOVI.murphy,
    adulti: 2,
    canale: 'airbnb',
    id_esterno: 'HMXQ7P2KZR',
  },
  {
    chiave: 'chiaraRelax',
    camera: '203',
    giorni: [20, 23],
    anticipo: 35,
    cliente: 'chiara',
    adulti: 2,
    canale: 'telefono',
    pacchetto: 'relax',
    incassi: [{ tipo: 'acconto', metodo: 'pos', riferimento: 'POS 015870' }],
  },
  {
    chiave: 'klausAmici',
    camera: '104',
    giorni: [25, 28],
    anticipo: 31,
    cliente: 'klaus',
    adulti: 2,
    canale: 'email',
    codice_sconto: 'AMICI15',
    incassi: [{ tipo: 'acconto', metodo: 'bonifico', riferimento: 'SEPA DE89370400440532013000' }],
  },
  // Non rimborsabile di sette notti: vale anche la promozione "Settimana lunga".
  {
    chiave: 'serra',
    camera: '201',
    giorni: [30, 37],
    anticipo: 50,
    titolare: NUOVI.serra,
    adulti: 2,
    canale: 'email',
    piano: 'nonRimborsabile',
    incassi: [{ tipo: 'acconto', metodo: 'bonifico', riferimento: 'CRO 0300119876' }],
    saldo: 'bonifico',
  },
  {
    chiave: 'booking',
    camera: '203',
    giorni: [35, 38],
    anticipo: 50,
    titolare: NUOVI.lindqvist,
    adulti: 1,
    canale: 'booking_com',
    id_esterno: '4098765432',
  },
];

// ─────────────────────────────────────
// Soggiorni gestiti dalla reception
// ─────────────────────────────────────

/** Link di check-in mandato; con `righe` l'ospite l'ha anche compilato. */
async function checkinOnline(prenotazione, righe) {
  const link = await prenotazioniService.linkCheckin(prenotazione.id);
  const token = new URL(link).searchParams.get('token');
  if (righe) {
    await prenotazioniService.checkinOnline(token, righe, IP_PROVA);
  }
}

async function creaSoggiorno(soggiorno, catalogo, clienti, ctx) {
  const prenotazione = await prenota(soggiorno, catalogo, clienti, ctx);
  if (soggiorno.fase === 'in_soggiorno') {
    await arriva(prenotazione, soggiorno, catalogo, ctx);
  }
  if (soggiorno.saldo) {
    const quando = momento(Math.min(soggiorno.giorni[0], 0) - 1, '12:00');
    await alMomento(quando, () => saldaTutto(prenotazione, soggiorno.saldo, quando, ctx));
  }
  if (soggiorno.checkin || soggiorno.link) {
    await checkinOnline(prenotazione, soggiorno.checkin);
  }
  return prenotazione;
}

// ─────────────────────────────────────
// Prenotazioni dal sito
// ─────────────────────────────────────

/** Camera tenuta da parte durante il pagamento, poi la prenotazione. */
async function prenotaOnline({ camera, giorni, adulti, titolare }, utente, visitatore) {
  const sessione = uuid();
  const arrivo = giorno(giorni[0]);
  const partenza = giorno(giorni[1]);
  await disponibilitaService.blocca({
    sessione,
    cameraId: camera.id,
    arrivo,
    partenza,
    ospiti: adulti,
    utenteId: utente?.id,
    visitatoreId: visitatore?.id,
  });
  const ctx = utente ? contesto(utente) : { utenteId: null, ip: IP_PROVA };
  return await prenotazioniService.crea({ sessione, arrivo, partenza, adulti, titolare }, ctx);
}

/** Lucía prenota dal sito e ha aperto il pagamento con carta, non ancora concluso. */
async function prenotazioneDaPagare(camere, clienti) {
  const prenotazione = await prenotaOnline(
    { camera: camere['201'], giorni: [12, 15], adulti: 2 },
    clienti.lucia,
  );
  const sessione = `cs_live_${uuid().replace(/-/g, '')}`;
  await pagamentiRepo.creaPagamento({
    prenotazione_id: prenotazione.id,
    tipo: 'acconto',
    metodo: 'stripe',
    stato: 'in_attesa',
    importo: prenotazione.acconto_richiesto,
    valuta: prenotazione.valuta,
    riferimento: sessione,
    link_pagamento: `https://checkout.stripe.com/c/pay/${sessione}`,
  });
  // Un primo tentativo con PayPal era stato abbandonato.
  const abbandonato = await pagamentiRepo.creaPagamento({
    prenotazione_id: prenotazione.id,
    tipo: 'acconto',
    metodo: 'paypal',
    stato: 'fallito',
    importo: prenotazione.acconto_richiesto,
    valuta: prenotazione.valuta,
    note: 'Pagamento rifiutato da PayPal: carta scaduta',
  });
  await retrodata('pagamenti', { creato_il: momento(0, '08:40') }, { id: abbandonato.id });
  const evento = `WH-${uuid().slice(0, 8).toUpperCase()}-${uuid().slice(24).toUpperCase()}`;
  await pagamentiRepo.registraEventoWebhook('paypal', evento, 'PAYMENT.CAPTURE.DENIED', {
    id: evento,
    event_type: 'PAYMENT.CAPTURE.DENIED',
    resource: { status: 'DECLINED', amount: { value: prenotazione.acconto_richiesto } },
  });
  await pagamentiRepo.aggiornaEventoWebhook('paypal', evento, {
    errore: 'PayPal non ha completato il pagamento',
  });
  await retrodata(
    'eventi_webhook',
    { ricevuto_il: momento(0, '08:41') },
    { provider: 'paypal', id_evento: evento },
  );
  return prenotazione;
}

/** Visitatrice senza account: non paga e la prenotazione scade da sola. */
async function prenotazioneScaduta(catalogo, visitatori, ctx) {
  const { camere } = catalogo;
  const prenotazione = await prenotaOnline(
    { camera: camere['202'], giorni: [50, 52], adulti: 2, titolare: NUOVI.marta },
    null,
    visitatori.marta,
  );
  const quando = momento(-2, '09:00');
  await retrodata(
    'prenotazioni',
    { creato_il: momento(-3, '09:00'), scade_il: quando },
    { id: prenotazione.id },
  );
  await alMomento(quando, () => prenotazioniService.scadiInAttesa());
  await retrodata('prenotazioni', { cancellata_il: quando }, { id: prenotazione.id });

  // Il giorno dopo chiama e la reception la recupera su un'altra camera.
  const recuperata = await prenota(
    {
      camera: '204',
      giorni: [52, 54],
      anticipo: 53,
      titolare: NUOVI.marta,
      adulti: 2,
      canale: 'telefono',
      note_interne: 'Era scaduta la prenotazione online: rifatta al telefono.',
      incassi: [{ tipo: 'acconto', metodo: 'pos', riferimento: 'POS 016120' }],
    },
    catalogo,
    {},
    ctx,
  );
  return { scaduta: prenotazione, recuperata };
}

/** Ricerche in corso sul sito: camere tenute da parte per qualche minuto. */
async function carrelliAperti(camere, clienti, visitatori) {
  await disponibilitaService.blocca({
    sessione: uuid(),
    cameraId: camere['301'].id,
    arrivo: giorno(70),
    partenza: giorno(73),
    ospiti: 2,
    visitatoreId: visitatori.pierre.id,
  });
  await disponibilitaService.blocca({
    sessione: uuid(),
    cameraId: camere['103'].id,
    arrivo: giorno(60),
    partenza: giorno(62),
    ospiti: 2,
    utenteId: clienti.nuovo.id,
  });
}

/** Cancellazioni gratuite: una della reception, una dell'ospite dall'area personale. */
async function cancellazioniGratuite(catalogo, clienti, ctx) {
  const reception = await prenota(
    {
      camera: '103',
      giorni: [40, 42],
      anticipo: 50,
      titolare: NUOVI.atzori,
      adulti: 2,
      canale: 'telefono',
    },
    catalogo,
    clienti,
    ctx,
  );
  await alMomento(momento(-4, '17:20'), () =>
    prenotazioniService.cancella(
      reception.id,
      { motivo: 'Ha spostato le ferie a dicembre', penale: 0 },
      ctx,
    ),
  );
  await retrodata('prenotazioni', { cancellata_il: momento(-4, '17:20') }, { id: reception.id });

  const ospite = await prenota(
    {
      camera: '104',
      giorni: [60, 63],
      anticipo: 70,
      cliente: 'chiara',
      adulti: 2,
      canale: 'email',
    },
    catalogo,
    clienti,
    ctx,
  );
  await prenotazioniService.cancella(
    ospite.id,
    { motivo: 'Impegno di lavoro imprevisto' },
    contesto(clienti.chiara),
  );
  return { cancellataReception: reception, cancellataOspite: ospite };
}

// ─────────────────────────────────────
// Avvio
// ─────────────────────────────────────

async function creaPrenotazioni(catalogo, { staff, clienti, visitatori }) {
  const ctx = contesto(staff.reception);
  const correnti = {};
  for (const soggiorno of SOGGIORNI) {
    correnti[soggiorno.chiave] = await creaSoggiorno(soggiorno, catalogo, clienti, ctx);
  }
  // Un extra pagato a parte da chi è in casa.
  await incassa(
    correnti.rossi,
    {
      tipo: 'extra',
      metodo: 'pos',
      importo: 12,
      riferimento: 'POS 016044',
      note: 'Bevande dal frigobar',
    },
    momento(-1, '21:00'),
    ctx,
  );

  correnti.daPagare = await prenotazioneDaPagare(catalogo.camere, clienti);
  Object.assign(correnti, await prenotazioneScaduta(catalogo, visitatori, ctx));
  Object.assign(correnti, await cancellazioniGratuite(catalogo, clienti, ctx));
  await carrelliAperti(catalogo.camere, clienti, visitatori);
  return correnti;
}

module.exports = { creaPrenotazioni };
