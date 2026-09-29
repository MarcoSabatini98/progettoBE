// src/services/alloggiati.service.js
//
// Alloggiati Web (Polizia di Stato): le schedine degli ospiti vanno inviate
// entro 24 ore dall'arrivo. Qui si prepara il file a tracciato fisso da
// caricare sul portale e si registrano gli invii.
// ponytail: il web service diretto arriverà con i connettori; intanto il file
// si carica a mano dal portale ("Invio da file").

const alloggiatiRepo = require('../repositories/alloggiati.repository');
const ospitiRepo = require('../repositories/ospiti.repository');
const { campiMancanti } = require('./ospiti.service');
const notifiche = require('./notifiche.service');
const { schedina } = require('./helpers/schedina-alloggiati');
const { TIPI_CON_DOCUMENTO } = require('../constants/prenotazioni.constants');
const { PERMESSI } = require('../constants/ruoli.constants');
const { oggi, aggiungiGiorni } = require('../utils/date');
const { nonTrovato, nonElaborabile } = require('../utils/errori');

const GIORNI_PROMEMORIA = 2;

// Il capofamiglia o capogruppo va prima dei suoi familiari o membri.
function ordine(tipo) {
  return TIPI_CON_DOCUMENTO.includes(tipo) ? 0 : 1;
}

function schedaOspite(riga, prenotazione) {
  const ospite = riga.ospite;
  const tipo = riga.tipo_alloggiato;
  const mancanti = campiMancanti(ospite, tipo);
  const ultimoInvio = prenotazione.invii_alloggiati.find((invio) => invio.ospite_id === ospite.id);
  return {
    ospite_id: ospite.id,
    nome: ospite.nome,
    cognome: ospite.cognome,
    tipo_alloggiato: tipo,
    campi_mancanti: mancanti,
    schedina: mancanti.length === 0 ? schedina(ospite, prenotazione, tipo) : null,
    ultimo_invio: ultimoInvio ?? null,
  };
}

/** Ospiti della prenotazione con schedina pronta, campi mancanti e ultimo invio. */
async function daPrenotazione(prenotazioneId) {
  const prenotazione = await alloggiatiRepo.trovaPrenotazioneConInvii(prenotazioneId);
  if (!prenotazione) {
    throw nonTrovato('PRENOTAZIONE_NON_TROVATA', 'Prenotazione non trovata');
  }

  const righe = await ospitiRepo.trovaOspitiDiPrenotazione(prenotazioneId);
  const ospiti = righe
    .map((riga) => schedaOspite(riga, prenotazione))
    .sort((a, b) => ordine(a.tipo_alloggiato) - ordine(b.tipo_alloggiato));

  return {
    prenotazione: {
      id: prenotazione.id,
      codice: prenotazione.codice,
      stato: prenotazione.stato,
      data_arrivo: prenotazione.data_arrivo,
    },
    completa: ospiti.length > 0 && ospiti.every((ospite) => ospite.schedina),
    ospiti,
  };
}

/**
 * File da caricare sul portale per le prenotazioni indicate (righe CRLF).
 * Se qualche ospite ha dati mancanti rifiuta, indicando chi e cosa.
 */
async function file(prenotazioniIds) {
  const schede = [];
  for (const id of prenotazioniIds) {
    schede.push(await daPrenotazione(id));
  }

  const incomplete = schede
    .filter((scheda) => !scheda.completa)
    .map((scheda) => ({
      codice: scheda.prenotazione.codice,
      ospiti: scheda.ospiti
        .filter((ospite) => !ospite.schedina)
        .map((ospite) => ({
          nome: `${ospite.nome} ${ospite.cognome}`,
          campi_mancanti: ospite.campi_mancanti,
        })),
    }));
  if (incomplete.length > 0) {
    throw nonElaborabile(
      'DATI_ALLOGGIATI_INCOMPLETI',
      "Completa i dati degli ospiti prima dell'invio",
      { prenotazioni: incomplete },
    );
  }

  const righe = schede.flatMap((scheda) => scheda.ospiti.map((ospite) => ospite.schedina));
  return {
    nome: `alloggiati_${oggi()}.txt`,
    contenuto: `${righe.join('\r\n')}\r\n`,
  };
}

/** Registra l'invio fatto sul portale (o l'errore che ha restituito). */
async function registraInvio(prenotazioneId, dati, contesto) {
  const { ospiti } = await daPrenotazione(prenotazioneId);
  await alloggiatiRepo.creaInvii(
    ospiti.map((ospite) => ({
      prenotazione_id: prenotazioneId,
      ospite_id: ospite.ospite_id,
      schedina: ospite.schedina ?? '',
      esito: dati.esito ?? 'inviata',
      messaggio: dati.messaggio ?? null,
      inviato_da: contesto.utenteId,
    })),
  );
  return await daPrenotazione(prenotazioneId);
}

/** Promemoria per la reception: soggiorni degli ultimi 2 giorni senza invio riuscito. */
async function daInviare() {
  const soggiorni = await alloggiatiRepo.trovaSoggiorniIniziatiDal(
    aggiungiGiorni(oggi(), -GIORNI_PROMEMORIA),
  );
  return soggiorni
    .filter((prenotazione) => prenotazione.invii_alloggiati.length === 0)
    .map((prenotazione) => ({
      id: prenotazione.id,
      codice: prenotazione.codice,
      data_arrivo: prenotazione.data_arrivo,
      camera_id: prenotazione.camera_id,
    }));
}

/** Job: avvisa chi invia le schedine se ci sono soggiorni ancora da inviare. */
async function avvisaDaInviare() {
  const soggiorni = await daInviare();
  if (soggiorni.length > 0) {
    await notifiche.aChiPuo(PERMESSI.ALLOGGIATI_INVIA, {
      tipo: 'sistema',
      priorita: 'avviso',
      titolo: `Alloggiati Web: ${soggiorni.length} soggiorni da inviare`,
      testo: "Le schedine vanno inviate entro 24 ore dall'arrivo",
      link: '/staff/alloggiati',
    });
  }
  return { da_inviare: soggiorni.length };
}

module.exports = { daPrenotazione, file, registraInvio, daInviare, avvisaDaInviare };
