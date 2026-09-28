// src/services/utenti.service.js
//
// Account utenti.
//  - Area cliente: il cliente vede e modifica da solo i propri dati personali,
//    carica i documenti, vede fatture e preferenze email.
//    Prenotazioni e punti fedeltà sono in prenotazioni.service e fedelta.service.
//  - Gestione (admin): account dello staff, ruoli, attivazione. I dati
//    personali di un cliente l'admin non li modifica mai.

const bcrypt = require('bcrypt');
const { sequelize } = require('../models');
const utentiRepo = require('../repositories/utenti.repository');
const ospitiRepo = require('../repositories/ospiti.repository');
const prenotazioniRepo = require('../repositories/prenotazioni.repository');
const fattureRepo = require('../repositories/fatture.repository');
const notificheRepo = require('../repositories/notifiche.repository');
const auth = require('./auth.service');
const chat = require('./chat.service');
const { RUOLI, RUOLI_ASSEGNABILI } = require('../constants/ruoli.constants');
const {
  nonTrovato,
  vietato,
  richiestaNonValida,
  conflitto,
  nonAutenticato,
} = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const file = require('../utils/file');

// Dati dell'account che il cliente modifica da solo.
function datiAccount(dati) {
  return {
    nome: dati.nome,
    cognome: dati.cognome,
    telefono: dati.telefono,
    lingua: dati.lingua,
    notifiche_email: dati.notifiche_email,
  };
}

// Dati dell'anagrafica (per prenotazioni e Alloggiati Web).
function datiAnagrafica(dati) {
  return {
    sesso: dati.sesso,
    data_nascita: dati.data_nascita,
    cittadinanza_codice: dati.cittadinanza_codice,
    stato_nascita_codice: dati.stato_nascita_codice,
    comune_nascita_codice: dati.comune_nascita_codice,
    provincia_nascita: dati.provincia_nascita,
    tipo_documento: dati.tipo_documento,
    numero_documento: dati.numero_documento,
    luogo_rilascio_codice: dati.luogo_rilascio_codice,
    scadenza_documento: dati.scadenza_documento,
    codice_fiscale: dati.codice_fiscale,
    indirizzo: dati.indirizzo,
    cap: dati.cap,
    citta: dati.citta,
    provincia: dati.provincia,
    paese: dati.paese,
  };
}

async function utenteOppure404(id, transaction = null) {
  const utente = await utentiRepo.trovaUtentePerId(id, transaction);
  if (!utente) {
    throw nonTrovato('UTENTE_NON_TROVATO', 'Utente non trovato');
  }
  return utente;
}

// ─────────────────────────────────────
// Area cliente
// ─────────────────────────────────────

/** Tutto ciò che serve alla pagina personale in una chiamata. */
async function profilo(utenteId) {
  const utente = await utentiRepo.trovaProfilo(utenteId);
  if (!utente) {
    throw nonTrovato('UTENTE_NON_TROVATO', 'Utente non trovato');
  }
  return utente;
}

/**
 * Aggiorna i dati personali. Account e anagrafica restano allineati: nome,
 * cognome, email e telefono dell'anagrafica sono quelli dell'account.
 */
async function aggiornaDatiPersonali(utenteId, dati) {
  await sequelize.transaction(async (transaction) => {
    const utente = await utenteOppure404(utenteId, transaction);
    await utente.update(datiAccount(dati), { transaction });

    const anagrafica = {
      ...datiAnagrafica(dati),
      nome: utente.nome,
      cognome: utente.cognome,
      email: utente.email,
      telefono: utente.telefono,
      lingua: utente.lingua,
    };
    if (utente.ospite_id) {
      await ospitiRepo.aggiornaOspite(utente.ospite_id, anagrafica, transaction);
    } else {
      const nuova = await ospitiRepo.creaOspite(
        { ...anagrafica, utente_id: utente.id },
        transaction,
      );
      await utente.update({ ospite_id: nuova.id }, { transaction });
    }
  });
  return await profilo(utenteId);
}

/**
 * Email non indispensabili (promemoria, riepiloghi chat). Quelle di servizio
 * (conferme, reset password) partono sempre.
 */
async function aggiornaPreferenzeEmail(utenteId, { notifiche_email: notificheEmail }) {
  await utenteOppure404(utenteId);
  await utentiRepo.aggiornaUtente(utenteId, { notifiche_email: Boolean(notificheEmail) });
  return { notifiche_email: Boolean(notificheEmail) };
}

async function anagraficaDelCliente(utenteId) {
  const utente = await utenteOppure404(utenteId);
  if (!utente.ospite_id) {
    throw richiestaNonValida('ANAGRAFICA_MANCANTE', 'Completa prima i tuoi dati personali');
  }
  return utente.ospite_id;
}

/** caricato = file ricevuto da multer. */
async function aggiungiDocumento(utenteId, caricato) {
  const percorso = file.percorsoRelativo(caricato.path);

  let ospiteId;
  try {
    ospiteId = await anagraficaDelCliente(utenteId);
  } catch (errore) {
    await file.elimina(percorso);
    throw errore;
  }

  return await ospitiRepo.creaDocumento({
    ospite_id: ospiteId,
    nome_originale: caricato.originalname.slice(0, 255),
    percorso,
    tipo_mime: caricato.mimetype,
    dimensione: caricato.size,
  });
}

/** Documento del cliente, verificando che sia davvero suo. */
async function mioDocumento(utenteId, documentoId) {
  const ospiteId = await anagraficaDelCliente(utenteId);
  const documento = await utentiRepo.trovaDocumentoDiOspite(ospiteId, documentoId);
  if (!documento) {
    throw nonTrovato('DOCUMENTO_NON_TROVATO', 'Documento non trovato');
  }
  return documento;
}

async function eliminaDocumento(utenteId, documentoId) {
  const documento = await mioDocumento(utenteId, documentoId);
  await ospitiRepo.eliminaDocumento(documento.id);
  await file.elimina(documento.percorso);
}

/** Fatture emesse per le prenotazioni del cliente (le bozze non si vedono). */
async function mieFatture(utenteId) {
  return await fattureRepo.trovaFattureCliente(utenteId);
}

/**
 * Cancellazione dell'account chiesta dal cliente (GDPR). Serve la password.
 * L'account si disattiva e si elimina (soft delete); l'anagrafica resta per
 * gli obblighi di legge sui soggiorni già fatti.
 */
async function eliminaAccount(utenteId, password) {
  const utente = await utentiRepo.trovaUtentePerAutenticazione({ id: utenteId });
  const passwordGiusta = utente
    ? await bcrypt.compare(password ?? '', utente.password_hash)
    : false;
  if (!passwordGiusta) {
    throw nonAutenticato('PASSWORD_ERRATA', 'Password non corretta');
  }

  const attive = await prenotazioniRepo.contaAttiveCliente(utenteId);
  if (attive > 0) {
    throw conflitto(
      'PRENOTAZIONI_ATTIVE',
      "Non puoi eliminare l'account con prenotazioni in corso o future",
    );
  }

  await sequelize.transaction(async (transaction) => {
    await auth.esciOvunque(utenteId, transaction);
    await notificheRepo.eliminaNotificheUtente(utenteId, transaction);
    await utentiRepo.aggiornaUtente(utenteId, { attivo: false }, transaction);
    await utentiRepo.eliminaUtente(utenteId, transaction);
  });
}

// ─────────────────────────────────────
// Gestione (admin)
// ─────────────────────────────────────

async function elenco(query) {
  const p = pagina(query);
  const trovati = await utentiRepo.trovaUtenti(query, p);
  return risultato(trovati, p);
}

async function dettaglio(id) {
  const utente = await utentiRepo.trovaDettaglioUtente(id);
  if (!utente) {
    throw nonTrovato('UTENTE_NON_TROVATO', 'Utente non trovato');
  }
  return utente;
}

async function elencoRuoli() {
  return await utentiRepo.trovaRuoli();
}

// L'admin non si assegna da API: solo i ruoli dello staff operativo.
function controllaRuoloAssegnabile(ruolo) {
  if (!RUOLI_ASSEGNABILI.includes(ruolo)) {
    throw richiestaNonValida(
      'RUOLO_NON_ASSEGNABILE',
      `Ruoli ammessi: ${RUOLI_ASSEGNABILI.join(', ')}`,
    );
  }
}

/**
 * L'admin crea gli account dello staff (i clienti si registrano da soli).
 * Il nuovo membro entra subito nel gruppo chat della sua squadra.
 */
async function creaStaff(dati) {
  controllaRuoloAssegnabile(dati.ruolo);
  const indirizzo = auth.normalizzaEmail(dati.email);
  if (await utentiRepo.esisteEmail(indirizzo)) {
    throw conflitto('EMAIL_GIA_REGISTRATA', 'Esiste già un account con questa email');
  }

  const passwordHash = await auth.hashPassword(dati.password);
  const utente = await sequelize.transaction(async (transaction) => {
    const nuovo = await utentiRepo.creaUtente(
      {
        email: indirizzo,
        password_hash: passwordHash,
        ruolo: dati.ruolo,
        nome: dati.nome,
        cognome: dati.cognome,
        telefono: dati.telefono ?? null,
        lingua: dati.lingua ?? 'it',
        email_verificata_il: new Date(),
      },
      transaction,
    );
    await chat.sincronizzaSquadre(nuovo.id, nuovo.ruolo, true, transaction);
    return nuovo;
  });
  return await dettaglio(utente.id);
}

async function controllaNonUltimoAdmin() {
  if ((await utentiRepo.contaAdminAttivi()) <= 1) {
    throw conflitto('ULTIMO_ADMIN', 'Deve restare almeno un amministratore attivo');
  }
}

/**
 * Modifica di un account da parte dell'admin: ruolo e stato sempre; nome e
 * contatti solo per lo staff. Mai i dati personali di un cliente.
 * Cambio di ruolo o disattivazione chiudono tutte le sessioni e
 * riallineano i gruppi chat di squadra.
 */
async function aggiornaAccount(id, dati, contesto) {
  const utente = await utenteOppure404(id);
  const personali = {
    nome: dati.nome,
    cognome: dati.cognome,
    telefono: dati.telefono,
    lingua: dati.lingua,
  };
  const cambiaPersonali = Object.values(personali).some((valore) => valore !== undefined);

  if (cambiaPersonali && utente.ruolo === RUOLI.CLIENTE) {
    throw vietato(
      'DATI_CLIENTE_PROTETTI',
      'I dati personali del cliente li modifica solo il cliente',
    );
  }
  if (dati.ruolo !== undefined && dati.ruolo !== utente.ruolo) {
    if (utente.ruolo === RUOLI.CLIENTE) {
      throw richiestaNonValida('RUOLO_CLIENTE', 'Un account cliente resta cliente');
    }
    controllaRuoloAssegnabile(dati.ruolo);
  }

  const perdeAdmin =
    utente.ruolo === RUOLI.ADMIN &&
    ((dati.ruolo !== undefined && dati.ruolo !== RUOLI.ADMIN) || dati.attivo === false);
  if (perdeAdmin && Number(id) === Number(contesto?.utenteId)) {
    throw richiestaNonValida(
      'AUTO_DECLASSAMENTO',
      'Non puoi togliere a te stesso il ruolo di amministratore',
    );
  }
  if (perdeAdmin) {
    await controllaNonUltimoAdmin();
  }

  const chiudiSessioni =
    dati.attivo === false || (dati.ruolo !== undefined && dati.ruolo !== utente.ruolo);

  await sequelize.transaction(async (transaction) => {
    await utente.update({ ...personali, ruolo: dati.ruolo, attivo: dati.attivo }, { transaction });
    if (chiudiSessioni) {
      await auth.esciOvunque(utente.id, transaction);
    }
    if (utente.ruolo !== RUOLI.CLIENTE) {
      await chat.sincronizzaSquadre(utente.id, utente.ruolo, utente.attivo, transaction);
    }
  });
  return await dettaglio(id);
}

async function elimina(id, contesto) {
  const utente = await utenteOppure404(id);
  if (Number(id) === Number(contesto?.utenteId)) {
    throw richiestaNonValida('AUTO_ELIMINAZIONE', 'Non puoi eliminare il tuo account da qui');
  }
  if (utente.ruolo === RUOLI.ADMIN) {
    await controllaNonUltimoAdmin();
  }

  await sequelize.transaction(async (transaction) => {
    await auth.esciOvunque(utente.id, transaction);
    if (utente.ruolo !== RUOLI.CLIENTE) {
      await chat.sincronizzaSquadre(utente.id, utente.ruolo, false, transaction);
    }
    await utentiRepo.eliminaUtente(utente.id, transaction);
  });
}

module.exports = {
  profilo,
  aggiornaDatiPersonali,
  aggiornaPreferenzeEmail,
  aggiungiDocumento,
  mioDocumento,
  eliminaDocumento,
  mieFatture,
  eliminaAccount,
  elenco,
  dettaglio,
  elencoRuoli,
  creaStaff,
  aggiornaAccount,
  elimina,
};
