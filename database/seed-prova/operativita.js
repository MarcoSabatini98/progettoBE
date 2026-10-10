// Operatività: la giornata di oggi (partenza, pulizie, guasti), le chat con
// ospiti e colleghi, i calendari dei portali e le notifiche ancora da leggere.
// Orari in UTC: in Italia è due ore avanti.

const { Op } = require('sequelize');

const modelli = require('../../src/models');
const prenotazioniService = require('../../src/services/prenotazioni.service');
const pulizieService = require('../../src/services/pulizie.service');
const manutenzioneService = require('../../src/services/manutenzione.service');
const chatService = require('../../src/services/chat.service');
const notificheService = require('../../src/services/notifiche.service');
const calendariService = require('../../src/services/calendari.service');
const alloggiatiService = require('../../src/services/alloggiati.service');
const camereService = require('../../src/services/camere.service');
const chatRepo = require('../../src/repositories/chat.repository');
const calendariRepo = require('../../src/repositories/calendari.repository');
const { creaPdf } = require('../../src/utils/pdf');
const file = require('../../src/utils/file');
const { uuid } = require('../../src/utils/sicurezza');
const { CARTELLE_UPLOAD } = require('../../src/constants/sistema.constants');
const { GRUPPI_SQUADRA } = require('../../src/constants/chat.constants');
const { PERMESSI } = require('../../src/constants/ruoli.constants');
const { contesto, giorno, momento, retrodata } = require('./comune');
const { alMomento, saldaTutto } = require('./storico');

// Quello che succede oggi resta da leggere.
const DA_LEGGERE = { letta: false };

// ─────────────────────────────────────
// Partenza di oggi
// ─────────────────────────────────────

async function partenzaKlaus(prenotazione, ctx) {
  const uscita = momento(0, '06:50');
  await alMomento(
    uscita,
    async () => {
      await saldaTutto(prenotazione, 'pos', uscita, ctx);
      await prenotazioniService.checkOut(prenotazione.id, {}, ctx);
    },
    DA_LEGGERE,
  );
  await retrodata('prenotazioni', { partenza_effettiva_il: uscita }, { id: prenotazione.id });
  await retrodata('movimenti_punti', { creato_il: uscita }, { prenotazione_id: prenotazione.id });
  await retrodata('attivita_pulizia', { creato_il: uscita }, { prenotazione_id: prenotazione.id });
}

// ─────────────────────────────────────
// Pulizie
// ─────────────────────────────────────

// Colonna che il trigger valorizza a ogni passaggio di stato.
const ISTANTE_DI = {
  in_corso: 'iniziata_il',
  completata: 'completata_il',
  verificata: 'verificata_il',
};

const tutteFatte = (attivita) => attivita.checklist.map(() => ({ fatto: true }));

async function avanzaAlle(attivita, dati, ctx, quando) {
  const aggiornata = await alMomento(
    quando,
    () => pulizieService.avanza(attivita.id, dati, ctx),
    DA_LEGGERE,
  );
  await retrodata('attivita_pulizia', { [ISTANTE_DI[dati.stato]]: quando }, { id: attivita.id });
  return aggiornata;
}

async function attivitaDiOggi(camera, tipo) {
  return await modelli.AttivitaPulizia.findOne({
    where: { camera_id: camera.id, tipo, data_prevista: giorno(0) },
  });
}

async function creaAlle(dati, ctx, quando) {
  const attivita = await alMomento(quando, () => pulizieService.crea(dati, ctx), DA_LEGGERE);
  await retrodata('attivita_pulizia', { creato_il: quando }, { id: attivita.id });
  return attivita;
}

/**
 * Turno di oggi: riassetti generati all'alba, la 203 lasciata da Klaus già
 * pronta per l'ispezione, la 301 rinviata ("non disturbare"), la 102
 * controllata prima dell'arrivo di Laura e una profonda per domani.
 */
async function creaPulizie(camere, staff) {
  const [ctxGovernante, ctxSara, ctxMarco] = [staff.governante, staff.pulizie, staff.pulizie2].map(
    contesto,
  );

  const alba = momento(0, '04:00');
  await alMomento(alba, () => pulizieService.preparaGiornata(), DA_LEGGERE);
  await retrodata(
    'attivita_pulizia',
    { creato_il: alba },
    { data_prevista: giorno(0), tipo: 'riassetto' },
  );

  const riassetto104 = await attivitaDiOggi(camere['104'], 'riassetto');
  const riassetto301 = await attivitaDiOggi(camere['301'], 'riassetto');
  const partenza203 = await attivitaDiOggi(camere['203'], 'partenza');
  await pulizieService.aggiorna(riassetto104.id, { assegnata_a: staff.pulizie.id });
  await pulizieService.aggiorna(riassetto301.id, { assegnata_a: staff.pulizie2.id });
  await pulizieService.aggiorna(partenza203.id, { assegnata_a: staff.pulizie2.id });

  await alMomento(
    momento(0, '07:05'),
    () => pulizieService.rinvia(riassetto301.id, { quando: 'oggi' }, ctxMarco),
    DA_LEGGERE,
  );
  await retrodata(
    'attivita_pulizia',
    { rinviata_il: momento(0, '07:05') },
    { id: riassetto301.id },
  );

  await avanzaAlle(partenza203, { stato: 'in_corso' }, ctxMarco, momento(0, '07:10'));
  await avanzaAlle(
    partenza203,
    { stato: 'completata', checklist: tutteFatte(partenza203) },
    ctxMarco,
    momento(0, '08:20'),
  );

  const ispezione102 = await creaAlle(
    {
      camera_id: camere['102'].id,
      assegnata_a: staff.governante.id,
      tipo: 'ispezione',
      priorita: 'urgente',
      note: 'La signora Laura lascia i bagagli a mezzogiorno: camera pronta prima del suo arrivo.',
    },
    ctxGovernante,
    momento(0, '06:30'),
  );
  await avanzaAlle(ispezione102, { stato: 'in_corso' }, ctxGovernante, momento(0, '08:30'));
  await avanzaAlle(
    ispezione102,
    { stato: 'completata', checklist: tutteFatte(ispezione102) },
    ctxGovernante,
    momento(0, '08:45'),
  );
  await avanzaAlle(ispezione102, { stato: 'verificata' }, ctxGovernante, momento(0, '08:50'));

  const metaChecklist = riassetto104.checklist.map((_, indice) => ({ fatto: indice % 2 === 0 }));
  await avanzaAlle(
    riassetto104,
    { stato: 'in_corso', checklist: metaChecklist, note: 'Ospiti fuori fino a sera.' },
    ctxSara,
    momento(0, '08:55'),
  );

  await creaAlle(
    {
      camera_id: camere['201'].id,
      data_prevista: giorno(1),
      tipo: 'profonda',
      priorita: 'bassa',
      note: 'Tende in lavanderia e materassi girati prima della settimana lunga.',
    },
    ctxGovernante,
    momento(0, '09:00'),
  );
}

// ─────────────────────────────────────
// Manutenzione
// ─────────────────────────────────────

async function segnalaAlle(dati, utente, quando, opzioni) {
  const segnalazione = await alMomento(
    quando,
    () => manutenzioneService.segnala(dati, contesto(utente)),
    opzioni,
  );
  await retrodata('segnalazioni_manutenzione', { creato_il: quando }, { id: segnalazione.id });
  return segnalazione;
}

async function aggiornaAlle(segnalazione, dati, utente, quando, opzioni) {
  await alMomento(
    quando,
    () => manutenzioneService.aggiorna(segnalazione.id, dati, contesto(utente)),
    opzioni,
  );
  if (dati.stato === 'risolta') {
    await retrodata('segnalazioni_manutenzione', { risolta_il: quando }, { id: segnalazione.id });
  }
}

async function creaManutenzione(camere, utenti) {
  const { admin, reception, reception2, governante, pulizie, pulizie2 } = utenti;

  const doccia = await segnalaAlle(
    {
      camera_id: camere['105'].id,
      titolo: 'Perdita dal miscelatore della doccia',
      descrizione: 'Gocciola anche chiuso, il piatto doccia resta bagnato.',
      priorita: 'alta',
    },
    pulizie,
    momento(-5, '09:40'),
  );
  await aggiornaAlle(
    doccia,
    { stato: 'in_corso', assegnata_a: admin.id, stato_camera: 'manutenzione' },
    governante,
    momento(-5, '10:15'),
  );

  await segnalaAlle(
    {
      camera_id: camere['205'].id,
      titolo: 'Infiltrazione dal soffitto del bagno',
      descrizione: 'Macchia che si allarga dopo la pioggia di ieri. Chiamato il lattoniere.',
      priorita: 'urgente',
      stato_camera: 'fuori_servizio',
    },
    governante,
    momento(-2, '07:30'),
  );

  const lampione = await segnalaAlle(
    {
      titolo: 'Lampione del giardino spento',
      descrizione: 'Quello vicino al cancello pedonale.',
      priorita: 'bassa',
    },
    reception2,
    momento(-20, '19:10'),
  );
  await aggiornaAlle(
    lampione,
    {
      stato: 'risolta',
      assegnata_a: governante.id,
      note_risoluzione: 'Sostituita la lampadina LED E27.',
    },
    governante,
    momento(-18, '10:00'),
  );

  const telecomando = await segnalaAlle(
    {
      camera_id: camere['301'].id,
      titolo: 'Telecomando del climatizzatore non risponde',
      priorita: 'normale',
    },
    reception,
    momento(-9, '17:20'),
  );
  await aggiornaAlle(
    telecomando,
    { stato: 'annullata', note_risoluzione: 'Bastava cambiare le pile.' },
    governante,
    momento(-9, '18:00'),
  );

  const scarico = await segnalaAlle(
    {
      camera_id: camere['102'].id,
      titolo: 'Lavandino che scarica lento',
      priorita: 'normale',
    },
    pulizie2,
    momento(-1, '11:30'),
  );
  await aggiornaAlle(scarico, { stato: 'in_corso' }, governante, momento(-1, '14:00'));
  await aggiornaAlle(
    scarico,
    { stato: 'risolta', note_risoluzione: 'Pulito il sifone.' },
    governante,
    momento(0, '07:30'),
    DA_LEGGERE,
  );

  return await segnalaAlle(
    {
      camera_id: camere['104'].id,
      titolo: 'La TV non si accende',
      descrizione: 'Segnalato dagli ospiti al rientro dalla colazione.',
    },
    reception,
    momento(0, '06:30'),
    DA_LEGGERE,
  );
}

// ─────────────────────────────────────
// Chat
// ─────────────────────────────────────

const eOspite = (chi) => Boolean(chi.visitatoreId) || chi.ruolo === 'cliente';

/**
 * Sposta a `quando` il messaggio e quello che ha toccato: conversazione,
 * ingressi dei partecipanti e lettura di chi scrive. Va chiamata in ordine
 * cronologico.
 */
async function allinea(conversazioneId, messaggioId, chi, quando) {
  const tardi = { [Op.gt]: quando };
  await retrodata('messaggi', { inviato_il: quando }, { id: messaggioId });
  await retrodata('messaggi_allegati', { creato_il: quando }, { messaggio_id: messaggioId });
  await retrodata('conversazioni', { ultimo_messaggio_il: quando }, { id: conversazioneId });
  await retrodata(
    'conversazioni',
    { creato_il: quando },
    { id: conversazioneId, creato_il: tardi },
  );
  await retrodata(
    'conversazioni_partecipanti',
    { entrato_il: quando },
    { conversazione_id: conversazioneId, entrato_il: tardi },
  );
  if (eOspite(chi)) {
    await retrodata('conversazioni', { letto_cliente_il: quando }, { id: conversazioneId });
  } else {
    await chatRepo.segnaLettoPartecipante(conversazioneId, chi.utenteId, quando);
  }
}

async function scrivi(conversazione, chi, testo, quando, { rispostaA, caricati } = {}) {
  const messaggio = await chatService.invia(
    conversazione.uuid,
    chi,
    { testo, risposta_a_id: rispostaA?.id },
    caricati,
  );
  await allinea(conversazione.id, messaggio.id, chi, quando);
  return messaggio;
}

async function apri(chi, dati, quando, opzioni) {
  const conversazione = await alMomento(
    quando,
    () => chatService.apriAssistenza(chi, dati),
    opzioni,
  );
  const messaggio = await chatRepo.trovaUltimoMessaggio(conversazione.id);
  await allinea(conversazione.id, messaggio.id, chi, quando);
  return conversazione;
}

async function chiudi(conversazione, chi) {
  await chatService.impostaStato(conversazione.uuid, chi, 'chiusa');
}

async function aggiungiAlle(conversazione, chi, utente, quando) {
  await chatService.aggiungiPartecipante(conversazione.uuid, chi, utente.id);
  await retrodata(
    'conversazioni_partecipanti',
    { entrato_il: quando },
    { conversazione_id: conversazione.id, utente_id: utente.id },
  );
}

/** Le indicazioni per arrivare, in PDF, come le allegherebbe la reception. */
async function indicazioniPdf() {
  const contenuto = await creaPdf({
    defaultStyle: { font: 'Helvetica', fontSize: 11 },
    content: [
      { text: 'Come raggiungerci', fontSize: 16, bold: true, margin: [0, 0, 0, 12] },
      'In auto: SS131 Carlo Felice, uscita Macomer, poi seguire le indicazioni per il centro.',
      'Parcheggio: gratuito, sul retro della struttura.',
      'In treno: la stazione di Macomer è a 10 minuti a piedi.',
    ],
  });
  const relativo = await file.salva(`${CARTELLE_UPLOAD.chat}/${uuid()}.pdf`, contenuto);
  return [
    {
      originalname: 'Come raggiungerci.pdf',
      path: file.percorsoAssoluto(relativo),
      mimetype: 'application/pdf',
      size: contenuto.length,
    },
  ];
}

async function assistenzaLaura(laura, prenotazione, reception) {
  const chiLaura = contesto(laura);
  const chiReception = contesto(reception);

  const conversazione = await apri(
    chiLaura,
    {
      titolo: 'Parcheggio',
      prenotazione_id: prenotazione.id,
      testo: 'Buonasera, arriviamo in auto: c’è posto per parcheggiare?',
    },
    momento(-1, '16:10'),
  );
  await scrivi(
    conversazione,
    chiReception,
    'Buonasera Laura, sì: il parcheggio è sul retro ed è incluso. Le allego le indicazioni.',
    momento(-1, '16:25'),
    { caricati: await indicazioniPdf() },
  );
  const grazie = await scrivi(conversazione, chiLaura, 'Grazie!', momento(-1, '16:40'));
  await chatService.modificaMessaggio(grazie.id, chiLaura, 'Grazie mille, a domani!');
  await retrodata('messaggi', { modificato_il: momento(-1, '16:41') }, { id: grazie.id });
  await scrivi(
    conversazione,
    chiLaura,
    'Buongiorno, possiamo lasciare i bagagli verso mezzogiorno anche se la camera non è pronta?',
    momento(0, '06:05'),
  );

  // Messaggio non letto dalla reception: il riepilogo email è già partito.
  await chatRepo.salvaRiepilogo(conversazione.id, reception.id);
  await retrodata(
    'chat_riepiloghi_email',
    { inviato_il: momento(0, '07:05') },
    { conversazione_id: conversazione.id },
  );
}

async function assistenzaJohn(john, prenotazione, { reception, reception2 }) {
  const chiJohn = contesto(john);
  const conversazione = await apri(
    chiJohn,
    {
      titolo: 'Airport transfer',
      prenotazione_id: prenotazione.id,
      testo: 'Hi! Can you arrange a transfer from Olbia airport? We land at 2:40 pm.',
    },
    momento(-12, '09:00'),
  );
  await scrivi(
    conversazione,
    contesto(reception2),
    'Hello John, of course. I’m passing you to my colleague Giulia, who handles transfers.',
    momento(-12, '09:20'),
  );
  await alMomento(momento(-12, '09:21'), () =>
    chatService.assegna(conversazione.uuid, contesto(reception2), reception.id),
  );
  await scrivi(
    conversazione,
    contesto(reception),
    'Hi John, the driver will wait for you at arrivals with a sign. It’s €90, added to your bill.',
    momento(-12, '10:05'),
  );
  await scrivi(conversazione, chiJohn, 'Perfect, thank you so much!', momento(-12, '10:30'));
  await chiudi(conversazione, contesto(reception));
}

async function assistenzaVisitatori(visitatori, prenotazioni, { reception, reception2 }) {
  const chiReception = contesto(reception);

  const marta = await apri(
    { visitatoreId: visitatori.marta.id },
    {
      prenotazione_id: prenotazioni.scaduta.id,
      testo: 'Il link per pagare la caparra è scaduto, posso ancora prenotare?',
    },
    momento(-2, '17:45'),
  );
  await scrivi(
    marta,
    chiReception,
    'Buonasera Marta, la camera è ancora libera: la richiamo domattina per completare insieme.',
    momento(-2, '18:00'),
  );
  await chiudi(marta, chiReception);

  const andrea = await apri(
    { visitatoreId: visitatori.andrea.id },
    { testo: 'Ciao, accettate cani di piccola taglia?' },
    momento(-30, '12:15'),
  );
  await scrivi(
    andrea,
    contesto(reception2),
    'Ciao Andrea, sì: fino a 10 kg, con un supplemento di 15 € a notte.',
    momento(-30, '12:40'),
  );
  await chiudi(andrea, contesto(reception2));

  const pubblicita = await apri(
    { visitatoreId: visitatori.spam.id },
    { testo: 'Boost your hotel ranking on Google! 1st page guaranteed. Reply now!' },
    momento(-40, '03:12'),
  );
  await chiudi(pubblicita, chiReception);

  // Domanda di stamattina: nessuno l'ha ancora presa.
  await apri(
    { visitatoreId: visitatori.pierre.id },
    {
      titolo: 'Petit-déjeuner',
      testo:
        'Bonjour, pour la suite du 19 au 22 décembre, le petit-déjeuner peut-il être servi en chambre ?',
    },
    momento(0, '08:50'),
    DA_LEGGERE,
  );
}

async function chatSquadre({ reception, reception2, governante, pulizie, pulizie2 }) {
  const ricevimento = await chatRepo.trovaGruppoPerTitolo(GRUPPI_SQUADRA.receptionist);
  const consegne = await scrivi(
    ricevimento,
    contesto(reception2),
    'Notte tranquilla. Klaus Weber parte domattina e deve ancora saldare; la 205 resta chiusa.',
    momento(-1, '20:00'),
  );
  await scrivi(
    ricevimento,
    contesto(reception),
    'Ricevuto, ci penso io al conto di Weber.',
    momento(0, '05:10'),
    { rispostaA: consegne },
  );

  const piani = await chatRepo.trovaGruppoPerTitolo(GRUPPI_SQUADRA.housekeeping);
  await scrivi(
    piani,
    contesto(governante),
    'Oggi: partenza 203, riassetti 104 e 301, alle 10:30 ispeziono la 102 per l’arrivo delle 16.',
    momento(0, '05:30'),
  );
  await scrivi(piani, contesto(pulizie), 'Io parto dalla 104.', momento(0, '05:40'));
  await scrivi(piani, contesto(pulizie2), 'Ok, io 301 e poi 203.', momento(0, '05:42'));
}

async function chatDirette({ admin, reception, governante, pulizie, pulizie2 }) {
  const [chiAdmin, chiReception, chiGovernante] = [admin, reception, governante].map(contesto);

  const fattura = await chatService.apriStaff(chiAdmin, { partecipanti: [reception.id] });
  await scrivi(
    fattura,
    chiAdmin,
    'Giulia, lo SDI ha scartato la fattura di de Vries: hai il codice fiscale corretto?',
    momento(-3, '09:00'),
  );
  const risposta = await scrivi(
    fattura,
    chiReception,
    'Sì, era sbagliata la partita IVA. La rimando oggi.',
    momento(-3, '09:30'),
  );
  await chatService.modificaMessaggio(
    risposta.id,
    chiReception,
    'Sì, era sbagliata la partita IVA olandese. La correggo e la rimando oggi.',
  );
  await retrodata('messaggi', { modificato_il: momento(-3, '09:32') }, { id: risposta.id });
  const ritirato = await scrivi(fattura, chiAdmin, 'Ok, grazie', momento(-3, '09:40'));
  await chatService.eliminaMessaggio(ritirato.id, chiAdmin);
  await retrodata('messaggi', { eliminato_il: momento(-3, '09:41') }, { id: ritirato.id });

  const suite = await chatService.apriStaff(chiAdmin, {
    partecipanti: [governante.id, pulizie.id],
    titolo: 'Pulizia profonda suite',
  });
  await scrivi(
    suite,
    chiAdmin,
    'Prima della settimana lunga la 201 va rimessa a nuovo: tende, materassi e vetri.',
    momento(-6, '08:00'),
  );
  await chatService.rinominaGruppo(suite.uuid, chiAdmin, 'Suite 201: rimessa a nuovo');
  await aggiungiAlle(suite, chiAdmin, pulizie2, momento(-6, '08:10'));
  await scrivi(suite, contesto(pulizie2), 'Per i vetri ci sono io.', momento(-6, '08:30'));
  await scrivi(
    suite,
    chiGovernante,
    'Grazie Marco, ti tolgo dal gruppo: la facciamo io e Sara domani.',
    momento(-5, '08:00'),
  );
  await chatService.esci(suite.uuid, contesto(pulizie2));
  await retrodata(
    'conversazioni_partecipanti',
    { uscito_il: momento(-5, '08:05') },
    { conversazione_id: suite.id, utente_id: pulizie2.id },
  );

  const ispezione = await chatService.apriStaff(chiGovernante, { partecipanti: [pulizie2.id] });
  await scrivi(
    ispezione,
    contesto(pulizie2),
    'La 203 è pronta, manca solo il tuo controllo.',
    momento(0, '08:21'),
  );
}

async function creaChat(prenotazioni, { staff, clienti, visitatori }, admin) {
  const utenti = { admin, ...staff };
  await assistenzaLaura(clienti.laura, prenotazioni.laura, staff.reception);
  await assistenzaJohn(clienti.john, prenotazioni.john, staff);
  await assistenzaVisitatori(visitatori, prenotazioni, staff);
  await chatSquadre(staff);
  await chatDirette(utenti);
}

// ─────────────────────────────────────
// Calendari dei portali
// ─────────────────────────────────────

/**
 * fonte: camera di cui leggere il feed iCal del nostro backend, al posto del portale
 * (così "Sincronizza ora" funziona davvero). Scelta senza soggiorni sopra quelli
 * della camera, per non segnalare overbooking. errori: sincronizzazioni fallite di fila.
 */
const CALENDARI = [
  { camera: '301', canale: 'airbnb', nome: 'Airbnb – Suite vista mare', fonte: '204' },
  { camera: '203', canale: 'booking_com', nome: 'Booking.com', fonte: '202' },
  {
    camera: '201',
    canale: 'expedia',
    nome: 'Expedia',
    url: 'https://www.expedia.it/ical/hotel/48213377/room/201.ics',
    errori: 6,
    esito: 'Il canale ha risposto 403',
  },
  {
    camera: '104',
    canale: 'altro',
    nome: 'Vrbo',
    url: 'https://www.vrbo.com/icalendar/5b8e2f1c9a7d4e3b.ics',
    attivo: false,
  },
];

/** Il link del feed iCal che la camera dà ai portali. */
async function linkFeed(camera) {
  const link = await calendariService.linkEsportazione();
  return link.find((voce) => voce.camera_id === camera.id).url;
}

/** Sincronizzazione delle 2 di notte: il feed letto da noi senza passare dalla rete. */
async function sincronizzato(calendario, voce, camere) {
  if (!voce.errori) {
    const testo = await calendariService.feed(camere[voce.fonte].token_ical);
    await calendariService.importa(
      await calendariService.dettaglioCalendario(calendario.id),
      testo,
    );
    await calendariRepo.aggiornaCalendario(calendario.id, {
      ultima_sincronizzazione_il: momento(0, '02:00'),
    });
    return;
  }
  await calendariRepo.aggiornaCalendario(calendario.id, {
    ultima_sincronizzazione_il: momento(-1, '02:00'),
    ultimo_esito: voce.esito,
    errori_consecutivi: voce.errori,
  });
  // Il job avvisa una volta sola, alla terza sincronizzazione fallita.
  await alMomento(
    momento(-2, '02:00'),
    () =>
      notificheService.aChiPuo(PERMESSI.CALENDARI_GESTISCI, {
        tipo: 'sistema',
        priorita: 'errore',
        codice: 'calendario_non_sincronizzato',
        parametri: { canale: voce.nome },
        titolo: `Il calendario ${voce.nome} non si sincronizza`,
        testo: voce.esito,
        link: `/staff/calendari/${calendario.id}`,
      }),
    DA_LEGGERE,
  );
}

async function creaCalendari(camere) {
  for (const [indice, voce] of CALENDARI.entries()) {
    const calendario = await calendariService.creaCalendario({
      camera_id: camere[voce.camera].id,
      canale: voce.canale,
      nome: voce.nome,
      url: voce.fonte ? await linkFeed(camere[voce.fonte]) : voce.url,
    });
    await retrodata(
      'calendari_esterni',
      { creato_il: momento(-200 + indice * 30, '10:00') },
      { id: calendario.id },
    );
    if (voce.attivo === false) {
      await calendariService.aggiornaCalendario(calendario.id, { attivo: false });
      continue;
    }
    await sincronizzato(calendario, voce, camere);
  }
  // Link di esportazione girato per errore a un ex collaboratore: rigenerato.
  await camereService.rigeneraTokenIcal(camere['301'].id);
}

// ─────────────────────────────────────
// Notifiche
// ─────────────────────────────────────

/** Una vecchia notifica tolta dall'admin e la segnalazione della TV già vista. */
async function sistemaNotifiche(admin, tv) {
  const vecchia = await modelli.Notifica.findOne({
    where: { utente_id: admin.id },
    order: [['creato_il', 'ASC']],
  });
  await notificheService.elimina(vecchia.id, admin.id);
  await retrodata(
    'notifiche',
    { eliminato_il: new Date(vecchia.creato_il.getTime() + 2 * 24 * 3600 * 1000) },
    { id: vecchia.id },
  );

  const vista = await modelli.Notifica.findOne({
    where: { utente_id: admin.id, link: `/staff/manutenzione/${tv.id}` },
  });
  await notificheService.segnaLetta(vista.id, admin.id);
  await retrodata('notifiche', { letta_il: momento(0, '06:40') }, { id: vista.id });
}

async function creaOperativita(prenotazioni, persone, catalogo, admin) {
  const { staff } = persone;
  const utenti = { admin, ...staff };
  await partenzaKlaus(prenotazioni.klaus, contesto(staff.reception));
  await creaPulizie(catalogo.camere, staff);
  const tv = await creaManutenzione(catalogo.camere, utenti);
  await creaChat(prenotazioni, persone, admin);
  await creaCalendari(catalogo.camere);
  // Promemoria delle 9: le schedine di Sophie sono ancora da inviare.
  await alMomento(momento(0, '07:00'), () => alloggiatiService.avvisaDaInviare(), DA_LEGGERE);
  await sistemaNotifiche(admin, tv);
}

module.exports = { creaOperativita };
