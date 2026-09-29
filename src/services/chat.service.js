// src/services/chat.service.js
//
// Chat reale, senza bot:
//  - assistenza: cliente o visitatore ↔ staff con il permesso chat.assistenza;
//  - staff: chat interna, diretta o di gruppo. Chi può parlare con chi lo
//    decidono le regole_chat (le controlla il trigger sui partecipanti).
//    Ogni membro dello staff è nel gruppo della propria squadra.
//
// `chi` è chi sta agendo: { utenteId, ruolo } oppure { visitatoreId }.
// Il socket ascolta `eventi` per consegnare tutto in tempo reale.

const { EventEmitter } = require('node:events');
const { sequelize } = require('../models');
const config = require('../config/env');
const logger = require('../config/logger');
const chatRepo = require('../repositories/chat.repository');
const utentiRepo = require('../repositories/utenti.repository');
const permessi = require('./permessi.service');
const impostazioni = require('./impostazioni.service');
const notifiche = require('./notifiche.service');
const email = require('./email.service');
const { documentoChat } = require('./helpers/chat-pdf');
const { creaPdf } = require('../utils/pdf');
const file = require('../utils/file');
const { RUOLI, SQUADRE, PERMESSI } = require('../constants/ruoli.constants');
const { GRUPPI_SQUADRA, STATI_PRESENZA } = require('../constants/chat.constants');
const { nonTrovato, vietato, richiestaNonValida } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { aggiungiMinuti, aggiungiOre } = require('../utils/date');

// 'messaggio'            → { conversazione, messaggio }
// 'messaggio_modificato' → { conversazione, messaggio }
// 'messaggio_eliminato'  → { conversazione, messaggioId }
// 'letto'                → { conversazione, chi, il }
// 'conversazione'        → { conversazione } (assegnata, chiusa, rinominata, membri cambiati)
// 'presenza'             → { utenteId, stato }
const eventi = new EventEmitter();

const MINUTI_TOLLERANZA_EMAIL = 5;
const MESSAGGI_PER_PAGINA = 50;

function eCliente(chi) {
  return Boolean(chi.visitatoreId) || chi.ruolo === RUOLI.CLIENTE;
}

function eGruppoSquadra(conversazione) {
  return Object.values(GRUPPI_SQUADRA).includes(conversazione.titolo);
}

// ─────────────────────────────────────
// Presenza dello staff
// ponytail: in memoria del processo; con più istanze servirebbe Redis.
// ─────────────────────────────────────

const presenze = new Map();

function impostaPresenza(utenteId, stato) {
  if (!STATI_PRESENZA.includes(stato)) {
    throw richiestaNonValida('STATO_PRESENZA_NON_VALIDO', 'Stato di presenza non valido');
  }
  if (stato === 'offline') {
    presenze.delete(utenteId);
  } else {
    presenze.set(utenteId, stato);
  }
  eventi.emit('presenza', { utenteId, stato });
}

function presenzaDi(utenteId) {
  return presenze.get(utenteId) ?? 'offline';
}

/** Tutto lo staff non offline, per chi si collega al socket. */
function presenzeStaff() {
  return [...presenze].map(([utenteId, stato]) => ({ utente_id: utenteId, stato }));
}

/** Per il widget del sito: c'è qualcuno dello staff pronto a rispondere? */
async function statoAssistenza() {
  for (const [utenteId, stato] of presenze) {
    const utente = stato === 'online' ? await utentiRepo.trovaUtentePerId(utenteId) : null;
    if (utente?.attivo && (await permessi.ha(utente.ruolo, PERMESSI.CHAT_ASSISTENZA))) {
      return { disponibile: true };
    }
  }
  return { disponibile: false };
}

// ─────────────────────────────────────
// Accesso
// ─────────────────────────────────────

async function conversazioneOppure404(uuid) {
  const conversazione = await chatRepo.trovaConversazionePerUuid(uuid);
  if (!conversazione) {
    throw nonTrovato('CONVERSAZIONE_NON_TROVATA', 'Conversazione non trovata');
  }
  return conversazione;
}

async function puoAssistere(ruolo) {
  return await permessi.ha(ruolo, PERMESSI.CHAT_ASSISTENZA);
}

/**
 * Controlla che `chi` possa stare nella conversazione.
 * Restituisce il lato da cui partecipa: 'cliente' o 'staff'.
 */
async function lato(conversazione, chi) {
  if (conversazione.tipo === 'assistenza') {
    if (chi.visitatoreId && chi.visitatoreId === conversazione.visitatore_id) {
      return 'cliente';
    }
    if (chi.utenteId && chi.utenteId === conversazione.cliente_id) {
      return 'cliente';
    }
    if (chi.utenteId && !eCliente(chi) && (await puoAssistere(chi.ruolo))) {
      return 'staff';
    }
  } else if (chi.utenteId && (await chatRepo.trovaPartecipazione(conversazione.id, chi.utenteId))) {
    return 'staff';
  }
  throw vietato('CONVERSAZIONE_NON_ACCESSIBILE', 'Non partecipi a questa conversazione');
}

/** La conversazione, se `chi` può starci (per il socket: "sta scrivendo"). */
async function accessibile(uuid, chi) {
  const conversazione = await conversazioneOppure404(uuid);
  await lato(conversazione, chi);
  return conversazione;
}

/** Avvisa il socket che la conversazione è cambiata. */
async function annunciaConversazione(id) {
  const conversazione = await chatRepo.trovaConversazionePerId(id);
  eventi.emit('conversazione', { conversazione: conversazione.toJSON() });
}

async function soloChatStaff(uuid, chi) {
  const conversazione = await conversazioneOppure404(uuid);
  if (conversazione.tipo !== 'staff') {
    throw richiestaNonValida('SOLO_CHAT_STAFF', 'Solo nella chat interna');
  }
  await lato(conversazione, chi);
  return conversazione;
}

// ─────────────────────────────────────
// Non letti e anteprima
// ─────────────────────────────────────

// Da quando `chi` ha letto la conversazione (null = mai).
function lettoDal(conversazione, chi, partecipazione) {
  if (eCliente(chi)) {
    return conversazione.letto_cliente_il;
  }
  if (!partecipazione) {
    return null;
  }
  return partecipazione.letto_fino_al ?? partecipazione.entrato_il;
}

// ponytail: due query per conversazione; va bene per le pagine da 20-100.
async function conRiepilogo(conversazione, chi, partecipazione) {
  const dal = lettoDal(conversazione, chi, partecipazione);
  const ultimo = await chatRepo.trovaUltimoMessaggio(conversazione.id);
  const dati = conversazione.toJSON();
  delete dati.membri;
  return {
    ...dati,
    non_letti: await chatRepo.contaNonLetti(conversazione.id, chi, dal),
    anteprima: ultimo ? ultimo.testo.slice(0, 120) : null,
  };
}

// ─────────────────────────────────────
// Elenco e dettaglio
// ─────────────────────────────────────

async function filtriElenco(chi, query) {
  if (chi.visitatoreId) {
    return { tipo: 'assistenza', visitatore_id: chi.visitatoreId };
  }
  if (chi.ruolo === RUOLI.CLIENTE) {
    return { tipo: 'assistenza', cliente_id: chi.utenteId };
  }
  if (query.tipo !== 'assistenza') {
    return { tipo: 'staff', membroId: chi.utenteId, soloDoveMembro: true };
  }

  if (!(await puoAssistere(chi.ruolo))) {
    throw vietato('PERMESSO_NEGATO', 'Non gestisci la chat di assistenza');
  }
  const filtri = { tipo: 'assistenza', membroId: chi.utenteId, soloDoveMembro: false };
  if (query.assegnate === 'mie') {
    filtri.assegnata_a = chi.utenteId;
  }
  if (query.assegnate === 'libere') {
    filtri.assegnata_a = null;
  }
  return filtri;
}

/**
 * Conversazioni visibili a `chi`, con non letti e anteprima.
 * Staff: query.tipo = 'staff' (default) | 'assistenza';
 * per l'assistenza query.assegnate = 'mie' | 'libere'. query.stato = 'aperta' | 'chiusa'.
 */
async function elenco(chi, query = {}) {
  const p = pagina(query);
  const filtri = await filtriElenco(chi, query);
  if (query.stato) {
    filtri.stato = query.stato;
  }

  const trovate = await chatRepo.trovaConversazioni(filtri, p);
  const esito = risultato(trovate, p);
  const elementi = [];
  for (const conversazione of esito.elementi) {
    elementi.push(await conRiepilogo(conversazione, chi, conversazione.membri?.[0]));
  }
  return { ...esito, elementi };
}

async function dettaglio(uuid, chi) {
  const conversazione = await conversazioneOppure404(uuid);
  await lato(conversazione, chi);
  const completa = await chatRepo.trovaDettaglioConversazione(conversazione.id);
  const partecipazione = chi.utenteId
    ? await chatRepo.trovaPartecipazione(conversazione.id, chi.utenteId)
    : null;
  const esito = await conRiepilogo(completa, chi, partecipazione);
  for (const partecipante of esito.partecipanti ?? []) {
    partecipante.presenza = presenzaDi(partecipante.id);
  }
  return esito;
}

/** Contatori per i badge. Staff con assistenza: anche le conversazioni libere. */
async function totaleNonLetti(chi) {
  const somma = async (query) => {
    const { elementi } = await elenco(chi, { ...query, stato: 'aperta', perPagina: 100 });
    return elementi.reduce((totale, conversazione) => totale + conversazione.non_letti, 0);
  };

  if (eCliente(chi)) {
    return { assistenza: await somma({}), staff: 0, libere: 0 };
  }
  const assiste = await puoAssistere(chi.ruolo);
  return {
    staff: await somma({ tipo: 'staff' }),
    assistenza: assiste ? await somma({ tipo: 'assistenza', assegnate: 'mie' }) : 0,
    libere: assiste ? await chatRepo.contaAssistenzeLibere() : 0,
  };
}

// ─────────────────────────────────────
// Messaggi
// ─────────────────────────────────────

/** Storico a ritroso: prima_di = id del messaggio più vecchio già caricato. */
async function messaggi(uuid, chi, query = {}) {
  const conversazione = await conversazioneOppure404(uuid);
  await lato(conversazione, chi);
  const limite = Math.min(Number(query.limite) || MESSAGGI_PER_PAGINA, 100);
  return await chatRepo.trovaMessaggi(conversazione.id, query.prima_di, limite);
}

function righeAllegati(messaggioId, caricati) {
  return caricati.map((caricato) => ({
    messaggio_id: messaggioId,
    nome_originale: caricato.originalname.slice(0, 255),
    percorso: file.percorsoRelativo(caricato.path),
    tipo_mime: caricato.mimetype,
    dimensione: caricato.size,
  }));
}

/**
 * Nuovo messaggio. Lo staff che risponde all'assistenza entra tra i
 * partecipanti e, se la conversazione è libera, se la prende.
 * dati: { testo, risposta_a_id? }; caricati: file di multer.
 */
async function invia(uuid, chi, dati, caricati = []) {
  const testo = String(dati.testo ?? '').trim();
  if (!testo && caricati.length === 0) {
    throw richiestaNonValida('MESSAGGIO_VUOTO', 'Scrivi un messaggio o allega un file');
  }

  const conversazione = await conversazioneOppure404(uuid);
  const mioLato = await lato(conversazione, chi);

  const id = await sequelize.transaction(async (transaction) => {
    if (conversazione.tipo === 'assistenza' && mioLato === 'staff') {
      await chatRepo.aggiungiPartecipante(conversazione.id, chi.utenteId, transaction);
      if (!conversazione.assegnata_a) {
        await chatRepo.aggiornaConversazione(
          conversazione.id,
          { assegnata_a: chi.utenteId },
          transaction,
        );
      }
    }

    const messaggio = await chatRepo.creaMessaggio(
      {
        conversazione_id: conversazione.id,
        mittente_utente_id: chi.utenteId ?? null,
        mittente_visitatore_id: chi.visitatoreId ?? null,
        risposta_a_id: dati.risposta_a_id ?? null,
        testo: testo || '📎',
      },
      transaction,
    );
    if (caricati.length > 0) {
      await chatRepo.creaAllegati(righeAllegati(messaggio.id, caricati), transaction);
    }
    return messaggio.id;
  });

  await segnaLetto(uuid, chi);
  const messaggio = await chatRepo.trovaMessaggioPerId(id);
  const aggiornata = await conversazioneOppure404(uuid);
  eventi.emit('messaggio', { conversazione: aggiornata.toJSON(), messaggio: messaggio.toJSON() });
  return messaggio;
}

async function mioMessaggio(id, chi) {
  const messaggio = await chatRepo.trovaMessaggioPerId(id);
  if (!messaggio) {
    throw nonTrovato('MESSAGGIO_NON_TROVATO', 'Messaggio non trovato');
  }
  const mio = chi.visitatoreId
    ? messaggio.mittente_visitatore_id === chi.visitatoreId
    : messaggio.mittente_utente_id === chi.utenteId;
  if (!mio) {
    throw vietato('MESSAGGIO_ALTRUI', 'Puoi modificare solo i tuoi messaggi');
  }
  return messaggio;
}

async function modificaMessaggio(id, chi, testo) {
  await mioMessaggio(id, chi);
  const pulito = String(testo ?? '').trim();
  if (!pulito) {
    throw richiestaNonValida('MESSAGGIO_VUOTO', 'Il messaggio è vuoto');
  }
  await chatRepo.aggiornaMessaggio(id, { testo: pulito, modificato_il: new Date() });
  const messaggio = await chatRepo.trovaMessaggioPerId(id);
  const conversazione = await chatRepo.trovaConversazionePerId(messaggio.conversazione_id);
  eventi.emit('messaggio_modificato', {
    conversazione: conversazione.toJSON(),
    messaggio: messaggio.toJSON(),
  });
  return messaggio;
}

async function eliminaMessaggio(id, chi) {
  const messaggio = await mioMessaggio(id, chi);
  await chatRepo.eliminaMessaggio(id);
  const conversazione = await chatRepo.trovaConversazionePerId(messaggio.conversazione_id);
  eventi.emit('messaggio_eliminato', {
    conversazione: conversazione.toJSON(),
    messaggioId: messaggio.id,
  });
}

/** File allegato, dopo il controllo di accesso alla conversazione. */
async function allegato(id, chi) {
  const trovato = await chatRepo.trovaAllegatoPerId(id);
  if (!trovato) {
    throw nonTrovato('ALLEGATO_NON_TROVATO', 'Allegato non trovato');
  }
  await lato(trovato.messaggio.conversazione, chi);
  return {
    percorso: file.percorsoAssoluto(trovato.percorso),
    nome: trovato.nome_originale,
    tipo: trovato.tipo_mime,
  };
}

async function segnaLetto(uuid, chi) {
  const conversazione = await conversazioneOppure404(uuid);
  const mioLato = await lato(conversazione, chi);
  const il = new Date();
  if (mioLato === 'cliente') {
    await chatRepo.aggiornaConversazione(conversazione.id, { letto_cliente_il: il });
  } else {
    await chatRepo.segnaLettoPartecipante(conversazione.id, chi.utenteId, il);
  }
  eventi.emit('letto', { conversazione: conversazione.toJSON(), chi, il });
}

// ─────────────────────────────────────
// Assistenza
// ─────────────────────────────────────

/**
 * Cliente o visitatore chiede assistenza. Una sola conversazione aperta per
 * interlocutore: se c'è già, il messaggio va lì.
 */
async function apriAssistenza(chi, dati) {
  if (!eCliente(chi)) {
    throw richiestaNonValida('SOLO_CLIENTI', "L'assistenza è per clienti e visitatori");
  }
  const interlocutore = chi.visitatoreId
    ? { visitatore_id: chi.visitatoreId }
    : { cliente_id: chi.utenteId };

  const [conversazione, nuova] = await chatRepo.trovaOCreaAssistenzaAperta(interlocutore, {
    titolo: dati.titolo ?? null,
    prenotazione_id: dati.prenotazione_id ?? null,
    creata_da: chi.utenteId ?? null,
  });
  await invia(conversazione.uuid, chi, { testo: dati.testo });

  if (nuova) {
    await notifiche.aChiPuo(PERMESSI.CHAT_ASSISTENZA, {
      tipo: 'chat',
      titolo: 'Nuova richiesta di assistenza',
      testo: String(dati.testo ?? '').slice(0, 120),
      link: `/staff/chat/${conversazione.uuid}`,
    });
  }
  return await dettaglio(conversazione.uuid, chi);
}

/** Presa in carico, passaggio a un collega (utenteId) o rilascio (null). */
async function assegna(uuid, chi, utenteId) {
  const conversazione = await conversazioneOppure404(uuid);
  if (conversazione.tipo !== 'assistenza' || (await lato(conversazione, chi)) !== 'staff') {
    throw vietato('PERMESSO_NEGATO', 'Non gestisci questa conversazione');
  }
  if (utenteId) {
    const collega = await utentiRepo.trovaUtentePerId(utenteId);
    if (!collega?.attivo || !(await puoAssistere(collega.ruolo))) {
      throw richiestaNonValida('OPERATORE_NON_VALIDO', "Il collega non gestisce l'assistenza");
    }
  }

  await chatRepo.aggiornaConversazione(conversazione.id, { assegnata_a: utenteId ?? null });
  if (utenteId && utenteId !== chi.utenteId) {
    await notifiche.invia([utenteId], {
      tipo: 'chat',
      titolo: 'Ti è stata passata una conversazione di assistenza',
      link: `/staff/chat/${uuid}`,
    });
  }
  await annunciaConversazione(conversazione.id);
  return await dettaglio(uuid, chi);
}

/** Chiude o riapre. Un nuovo messaggio la riapre comunque (trigger). */
async function impostaStato(uuid, chi, stato) {
  const conversazione = await conversazioneOppure404(uuid);
  await lato(conversazione, chi);
  await chatRepo.aggiornaConversazione(conversazione.id, { stato });
  await annunciaConversazione(conversazione.id);
  return await dettaglio(uuid, chi);
}

// ─────────────────────────────────────
// Chat interna
// ─────────────────────────────────────

// Chat diretta già esistente tra due persone (senza titolo, esattamente due membri).
async function trovaDiretta(utenteId, altroId) {
  const chat = await chatRepo.trovaChatStaffDiUtente(utenteId);
  return chat.find(
    (conversazione) =>
      conversazione.membri.length === 2 &&
      conversazione.membri.some((membro) => membro.utente_id === altroId),
  );
}

/**
 * Nuova chat interna. Con un solo destinatario riapre la diretta già
 * esistente; con più destinatari crea un gruppo. Il DB rifiuta i ruoli che
 * non possono parlarsi (CHAT_NON_CONSENTITA).
 * dati: { partecipanti: id[], titolo?, testo? }
 */
async function apriStaff(chi, dati) {
  const altri = [...new Set(dati.partecipanti.map(Number))].filter((id) => id !== chi.utenteId);
  if (altri.length === 0) {
    throw richiestaNonValida('PARTECIPANTI_MANCANTI', 'Scegli con chi parlare');
  }
  if (Object.values(GRUPPI_SQUADRA).includes(dati.titolo)) {
    throw richiestaNonValida('TITOLO_RISERVATO', 'Questo nome è riservato ai gruppi di squadra');
  }

  const diretta = altri.length === 1 ? await trovaDiretta(chi.utenteId, altri[0]) : null;
  let uuid = diretta?.uuid;

  if (!uuid) {
    const nuova = await sequelize.transaction(async (transaction) => {
      const conversazione = await chatRepo.creaConversazione(
        {
          tipo: 'staff',
          titolo: altri.length > 1 ? (dati.titolo ?? null) : null,
          creata_da: chi.utenteId,
        },
        transaction,
      );
      // Uno alla volta: il trigger confronta ogni ingresso con chi è già dentro.
      for (const utenteId of [chi.utenteId, ...altri]) {
        await chatRepo.aggiungiPartecipante(conversazione.id, utenteId, transaction);
      }
      return conversazione;
    });
    uuid = nuova.uuid;
    await annunciaConversazione(nuova.id);
  }

  if (dati.testo) {
    await invia(uuid, chi, { testo: dati.testo });
  }
  return await dettaglio(uuid, chi);
}

function controllaGruppoModificabile(conversazione) {
  if (eGruppoSquadra(conversazione)) {
    throw richiestaNonValida(
      'GRUPPO_DI_SQUADRA',
      'I gruppi di squadra si aggiornano da soli in base ai ruoli',
    );
  }
  if (!conversazione.titolo) {
    throw richiestaNonValida('SOLO_GRUPPI', 'Nelle chat dirette non si aggiungono persone');
  }
}

async function aggiungiPartecipante(uuid, chi, utenteId) {
  const conversazione = await soloChatStaff(uuid, chi);
  controllaGruppoModificabile(conversazione);
  await chatRepo.aggiungiPartecipante(conversazione.id, utenteId);
  await annunciaConversazione(conversazione.id);
  return await dettaglio(uuid, chi);
}

async function rinominaGruppo(uuid, chi, titolo) {
  const conversazione = await soloChatStaff(uuid, chi);
  controllaGruppoModificabile(conversazione);
  if (Object.values(GRUPPI_SQUADRA).includes(titolo)) {
    throw richiestaNonValida('TITOLO_RISERVATO', 'Questo nome è riservato ai gruppi di squadra');
  }
  await chatRepo.aggiornaConversazione(conversazione.id, { titolo });
  await annunciaConversazione(conversazione.id);
  return await dettaglio(uuid, chi);
}

async function esci(uuid, chi) {
  const conversazione = await soloChatStaff(uuid, chi);
  if (eGruppoSquadra(conversazione)) {
    throw richiestaNonValida('GRUPPO_DI_SQUADRA', 'Non puoi uscire dal gruppo della tua squadra');
  }
  await chatRepo.segnaUscita(conversazione.id, chi.utenteId);
  await annunciaConversazione(conversazione.id);
}

/**
 * Allinea i gruppi di squadra al ruolo dell'utente: entra nel gruppo della
 * sua squadra ed esce dagli altri. L'admin è in tutti. Chiamata quando si
 * crea un account staff o ne cambia il ruolo/stato.
 */
async function sincronizzaSquadre(utenteId, ruolo, attivo, transaction = null) {
  for (const [squadra, titolo] of Object.entries(GRUPPI_SQUADRA)) {
    let gruppo = await chatRepo.trovaGruppoPerTitolo(titolo, transaction);
    if (!gruppo) {
      gruppo = await chatRepo.creaConversazione({ tipo: 'staff', titolo }, transaction);
    }

    const membro = ruolo === RUOLI.ADMIN || SQUADRE[squadra].includes(ruolo);
    if (membro && attivo) {
      await chatRepo.aggiungiPartecipante(gruppo.id, utenteId, transaction);
    } else {
      await chatRepo.segnaUscita(gruppo.id, utenteId, transaction);
    }
  }
}

// ─────────────────────────────────────
// Esportazione PDF (solo staff)
// ─────────────────────────────────────

async function esportaPdf(uuid, chi) {
  const conversazione = await conversazioneOppure404(uuid);
  if ((await lato(conversazione, chi)) !== 'staff') {
    throw vietato('PERMESSO_NEGATO', 'Solo lo staff può esportare la conversazione');
  }
  const tutti = await chatRepo.trovaTuttiIMessaggi(conversazione.id);
  const nomeStruttura = await impostazioni.leggi('struttura_nome');
  return await creaPdf(documentoChat(conversazione, tutti, nomeStruttura));
}

// ─────────────────────────────────────
// Job
// ─────────────────────────────────────

// Chi riceve le email della conversazione, con da quando ha letto.
function destinatariEmail(conversazione) {
  const destinatari = [];
  if (conversazione.cliente) {
    destinatari.push({ utente: conversazione.cliente, letto: conversazione.letto_cliente_il });
  }
  for (const membro of conversazione.membri) {
    destinatari.push({ utente: membro.utente, letto: membro.letto_fino_al ?? membro.entrato_il });
  }
  return destinatari.filter(({ utente }) => utente?.attivo && utente.notifiche_email);
}

function maggiore(a, b) {
  if (!a) {
    return b;
  }
  if (!b) {
    return a;
  }
  return new Date(a) > new Date(b) ? a : b;
}

/**
 * Email di riepilogo a chi ha messaggi non letti da più di 5 minuti, al
 * massimo una ogni `chat_riepilogo_email_minuti` per conversazione.
 * I visitatori non hanno account e restano esclusi.
 * ponytail: guarda solo le conversazioni con messaggi nelle ultime 24 ore.
 */
async function inviaRiepiloghi() {
  const intervallo = await impostazioni.leggi('chat_riepilogo_email_minuti', 60);
  const conversazioni = await chatRepo.trovaConMessaggiDal(aggiungiOre(new Date(), -24));
  let inviati = 0;

  for (const conversazione of conversazioni) {
    for (const { utente, letto } of destinatariEmail(conversazione)) {
      const ultimo = await chatRepo.trovaUltimoRiepilogo(conversazione.id, utente.id);
      if (ultimo && ultimo.inviato_il > aggiungiMinuti(new Date(), -intervallo)) {
        continue;
      }
      const dal = maggiore(letto, ultimo?.inviato_il);
      const numero = await chatRepo.contaNonLetti(
        conversazione.id,
        { utenteId: utente.id },
        dal,
        aggiungiMinuti(new Date(), -MINUTI_TOLLERANZA_EMAIL),
      );
      if (numero === 0) {
        continue;
      }

      const area = utente.ruolo === RUOLI.CLIENTE ? 'area-personale/chat' : 'staff/chat';
      await email.invia({
        a: utente.email,
        modello: 'chat_non_letti',
        lingua: utente.lingua,
        dati: {
          nome: utente.nome,
          numero,
          titolo: conversazione.titolo ?? 'Assistenza',
          link: `${config.urlFrontend}/${area}/${conversazione.uuid}`,
        },
      });
      await chatRepo.salvaRiepilogo(conversazione.id, utente.id);
      inviati += 1;
    }
  }
  return { inviati };
}

/** Elimina le conversazioni chiuse ferme da più di `chat_conservazione_giorni`, con i file. */
async function eliminaVecchie() {
  const giorni = await impostazioni.leggi('chat_conservazione_giorni', 365);
  const vecchie = await chatRepo.trovaChiusePrimaDel(aggiungiOre(new Date(), -giorni * 24));
  if (vecchie.length === 0) {
    return { eliminate: 0 };
  }

  const ids = vecchie.map((conversazione) => conversazione.id);
  const percorsi = await chatRepo.trovaPercorsiAllegati(ids);
  await chatRepo.eliminaConversazioni(ids);
  for (const percorso of percorsi) {
    await file.elimina(percorso);
  }
  logger.info('Conversazioni eliminate per conservazione', { numero: ids.length });
  return { eliminate: ids.length };
}

module.exports = {
  eventi,
  impostaPresenza,
  presenzaDi,
  presenzeStaff,
  statoAssistenza,
  lato,
  accessibile,
  elenco,
  dettaglio,
  totaleNonLetti,
  messaggi,
  invia,
  modificaMessaggio,
  eliminaMessaggio,
  allegato,
  segnaLetto,
  apriAssistenza,
  assegna,
  impostaStato,
  apriStaff,
  aggiungiPartecipante,
  rinominaGruppo,
  esci,
  sincronizzaSquadre,
  esportaPdf,
  inviaRiepiloghi,
  eliminaVecchie,
};
