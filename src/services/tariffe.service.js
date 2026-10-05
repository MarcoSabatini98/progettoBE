// src/services/tariffe.service.js
//
// Preventivi e gestione di tutto ciò che forma il prezzo: piani tariffari,
// periodi (stagioni), promozioni, codici sconto, pacchetti e tassa di soggiorno.
// Il calcolo vero e proprio è in helpers/calcolo-prezzo.js: qui si caricano e
// si validano i dati che gli servono.

const { sequelize } = require('../models');
const tariffeRepo = require('../repositories/tariffe.repository');
const camereRepo = require('../repositories/camere.repository');
const contenuti = require('./contenuti.service');
const fedeltaService = require('./fedelta.service');
const { calcola, contaTassabili } = require('./helpers/calcolo-prezzo');
const { nonTrovato, richiestaNonValida, nonElaborabile, conflitto } = require('../utils/errori');
const { applicaTraduzioni } = require('../utils/traduzioni');
const { slugDa } = require('../utils/slug');
const notifiche = require('./notifiche.service');
const { PERMESSI } = require('../constants/ruoli.constants');
const { GIORNI_AVVISO_TASSA } = require('../constants/tariffe.constants');
const { contaNotti, oggi, aggiungiGiorni, dataItaliana } = require('../utils/date');

// ─────────────────────────────────────
// Campi scrivibili dal client
// ─────────────────────────────────────

function datiPiano(dati) {
  return {
    nome: dati.nome,
    descrizione: dati.descrizione,
    tipo_variazione: dati.tipo_variazione,
    valore_variazione: dati.valore_variazione,
    rimborsabile: dati.rimborsabile,
    ore_cancellazione_gratuita: dati.ore_cancellazione_gratuita,
    penale_percentuale: dati.penale_percentuale,
    acconto_percentuale: dati.acconto_percentuale,
    predefinito: dati.predefinito,
    attivo: dati.attivo,
    ordine: dati.ordine,
  };
}

function datiPeriodo(dati) {
  return {
    nome: dati.nome,
    tipologia_id: dati.tipologia_id,
    data_inizio: dati.data_inizio,
    data_fine: dati.data_fine,
    giorni_settimana: dati.giorni_settimana,
    tipo_variazione: dati.tipo_variazione,
    valore: dati.valore,
    soggiorno_minimo: dati.soggiorno_minimo,
    priorita: dati.priorita,
    attivo: dati.attivo,
  };
}

function datiPromozione(dati) {
  return {
    nome: dati.nome,
    descrizione: dati.descrizione,
    tipologia_id: dati.tipologia_id,
    soggiorno_dal: dati.soggiorno_dal,
    soggiorno_al: dati.soggiorno_al,
    prenotabile_dal: dati.prenotabile_dal,
    prenotabile_al: dati.prenotabile_al,
    tipo_sconto: dati.tipo_sconto,
    valore: dati.valore,
    ospiti_min: dati.ospiti_min,
    ospiti_max: dati.ospiti_max,
    notti_min: dati.notti_min,
    attiva: dati.attiva,
  };
}

// I codici si salvano e si confrontano in maiuscolo.
function normalizzaCodice(codice) {
  return codice === undefined ? undefined : String(codice).trim().toUpperCase();
}

function datiCodiceSconto(dati) {
  return {
    codice: normalizzaCodice(dati.codice),
    descrizione: dati.descrizione,
    tipo_sconto: dati.tipo_sconto,
    valore: dati.valore,
    valido_dal: dati.valido_dal,
    valido_al: dati.valido_al,
    importo_minimo: dati.importo_minimo,
    notti_min: dati.notti_min,
    utilizzi_max: dati.utilizzi_max,
    utilizzi_per_utente: dati.utilizzi_per_utente,
    attivo: dati.attivo,
  };
}

function datiPacchetto(dati) {
  return {
    nome: dati.nome,
    slug: dati.slug,
    descrizione: dati.descrizione,
    prezzo: dati.prezzo,
    tipologia_id: dati.tipologia_id,
    notti_min: dati.notti_min,
    valido_dal: dati.valido_dal,
    valido_al: dati.valido_al,
    attivo: dati.attivo,
    ordine: dati.ordine,
  };
}

function datiTassa(dati) {
  return {
    nome: dati.nome,
    valida_dal: dati.valida_dal,
    valida_al: dati.valida_al,
    importo_notte: dati.importo_notte,
    notti_max: dati.notti_max,
    eta_esenzione: dati.eta_esenzione,
    attiva: dati.attiva,
  };
}

// ─────────────────────────────────────
// Validazione dei dati del preventivo
// ─────────────────────────────────────

/** Piano scelto dal cliente, o il predefinito se non ne ha scelto uno. */
async function pianoScelto(pianoId) {
  if (!pianoId) {
    return await tariffeRepo.trovaPianoPredefinito();
  }
  const piano = await tariffeRepo.trovaPianoAttivo(pianoId);
  if (!piano) {
    throw richiestaNonValida('PIANO_NON_VALIDO', 'Piano tariffario non disponibile');
  }
  return piano;
}

/** Codice sconto utilizzabile oggi da questo utente, altrimenti errore spiegato. */
async function codiceValido(testo, utenteId) {
  if (!testo) {
    return null;
  }

  const codice = await tariffeRepo.trovaCodiceScontoAttivo(normalizzaCodice(testo));
  if (!codice) {
    throw nonElaborabile('CODICE_SCONTO_NON_VALIDO', 'Codice sconto inesistente o non più attivo');
  }

  const giorno = oggi();
  if (codice.valido_dal && giorno < codice.valido_dal) {
    throw nonElaborabile('CODICE_SCONTO_NON_VALIDO', `Il codice è valido dal ${codice.valido_dal}`);
  }
  if (codice.valido_al && giorno > codice.valido_al) {
    throw nonElaborabile('CODICE_SCONTO_NON_VALIDO', 'Il codice sconto è scaduto');
  }
  if (codice.utilizzi_max != null && codice.utilizzi >= codice.utilizzi_max) {
    throw nonElaborabile('CODICE_SCONTO_NON_VALIDO', 'Il codice sconto è esaurito');
  }

  if (codice.utilizzi_per_utente != null && utenteId) {
    const usati = await tariffeRepo.contaUtilizziUtente(codice.id, utenteId);
    if (usati >= codice.utilizzi_per_utente) {
      throw nonElaborabile('CODICE_SCONTO_NON_VALIDO', 'Hai già usato questo codice');
    }
  }

  return codice;
}

async function pacchettoValido(pacchettoId, tipologiaId, arrivo, numeroNotti) {
  if (!pacchettoId) {
    return null;
  }

  const pacchetto = await tariffeRepo.trovaPacchettoAttivo(pacchettoId);
  if (!pacchetto) {
    throw nonTrovato('PACCHETTO_NON_TROVATO', 'Pacchetto non disponibile');
  }

  if (pacchetto.tipologia_id && pacchetto.tipologia_id !== tipologiaId) {
    throw nonElaborabile(
      'PACCHETTO_NON_APPLICABILE',
      'Il pacchetto non è disponibile per questa camera',
    );
  }
  if (pacchetto.valido_dal && arrivo < pacchetto.valido_dal) {
    throw nonElaborabile(
      'PACCHETTO_NON_APPLICABILE',
      `Il pacchetto è valido dal ${pacchetto.valido_dal}`,
    );
  }
  if (pacchetto.valido_al && arrivo > pacchetto.valido_al) {
    throw nonElaborabile(
      'PACCHETTO_NON_APPLICABILE',
      `Il pacchetto è valido fino al ${pacchetto.valido_al}`,
    );
  }
  if (pacchetto.notti_min && numeroNotti < pacchetto.notti_min) {
    throw nonElaborabile(
      'PACCHETTO_NON_APPLICABILE',
      `Il pacchetto richiede almeno ${pacchetto.notti_min} notti`,
    );
  }

  return pacchetto;
}

/** Extra richiesti [{ servizio_id, quantita }] → servizi con prezzo e quantità. */
async function serviziRichiesti(richiesti) {
  if (!richiesti?.length) {
    return [];
  }

  const ids = [...new Set(richiesti.map((richiesto) => richiesto.servizio_id))];
  const trovati = await camereRepo.trovaExtraPerIds(ids);
  if (trovati.length !== ids.length) {
    throw richiestaNonValida(
      'SERVIZIO_NON_DISPONIBILE',
      'Uno dei servizi scelti non è disponibile',
    );
  }

  return richiesti.map((richiesto) => {
    const servizio = trovati.find((trovato) => trovato.id === richiesto.servizio_id);
    return { ...servizio.get({ plain: true }), quantita: richiesto.quantita ?? 1 };
  });
}

async function tassaInVigore(data) {
  return await tariffeRepo.trovaTassaInVigore(data);
}

// ─────────────────────────────────────
// Preventivo
// ─────────────────────────────────────

// Riprezzamento di una prenotazione già fatta: piano, codice, pacchetto e
// sconto fedeltà sono stati accettati allora e non si ricontrollano.
async function condizioniEsistenti(r) {
  const [piano, codice, pacchetto] = await Promise.all([
    r.pianoId ? tariffeRepo.trovaPianoPerId(r.pianoId) : null,
    r.esistente.codiceScontoId
      ? tariffeRepo.trovaCodiceScontoPerId(r.esistente.codiceScontoId)
      : null,
    r.pacchettoId ? tariffeRepo.trovaPacchettoPerId(r.pacchettoId) : null,
  ]);
  return { piano, codice, pacchetto, percentualeFedelta: r.esistente.percentualeFedelta ?? 0 };
}

async function condizioniNuove(r, tipologiaId, numeroNotti) {
  const [piano, codice, pacchetto, percentualeFedelta] = await Promise.all([
    pianoScelto(r.pianoId),
    codiceValido(r.codiceSconto, r.utenteId),
    pacchettoValido(r.pacchettoId, tipologiaId, r.arrivo, numeroNotti),
    fedeltaService.percentualeSconto(r.utenteId),
  ]);
  return { piano, codice, pacchetto, percentualeFedelta };
}

/**
 * Preventivo completo di una tipologia per un soggiorno.
 *
 * @param {object} r
 * @param {number} r.tipologiaId
 * @param {string} r.arrivo
 * @param {string} r.partenza
 * @param {number} r.adulti
 * @param {number} [r.bambini]
 * @param {number[]} [r.etaBambini]
 * @param {number} [r.pianoId]
 * @param {string} [r.codiceSconto]
 * @param {number} [r.pacchettoId]
 * @param {{ servizio_id: number, quantita?: number }[]} [r.servizi]
 * @param {number} [r.utenteId]
 * @param {{ codiceScontoId?: number, percentualeFedelta?: number }} [r.esistente]
 *        presente quando si riprezza una prenotazione esistente
 */
async function preventivo(r) {
  const tipologia = await camereRepo.trovaTipologiaSemplice(r.tipologiaId, !r.esistente);
  if (!tipologia) {
    throw nonTrovato('TIPOLOGIA_NON_TROVATA', 'Tipologia non disponibile');
  }

  const bambini = r.bambini ?? 0;
  const numeroNotti = contaNotti(r.arrivo, r.partenza);

  const [condizioni, periodi, promozioni, servizi, tassa] = await Promise.all([
    r.esistente ? condizioniEsistenti(r) : condizioniNuove(r, tipologia.id, numeroNotti),
    tariffeRepo.trovaPeriodiDelSoggiorno(tipologia.id, r.arrivo, r.partenza),
    tariffeRepo.trovaPromozioniDelSoggiorno(r.arrivo, r.partenza, oggi()),
    serviziRichiesti(r.servizi),
    tassaInVigore(r.arrivo),
  ]);
  const { piano, codice, pacchetto, percentualeFedelta } = condizioni;

  const calcolo = calcola({
    arrivo: r.arrivo,
    partenza: r.partenza,
    adulti: r.adulti,
    bambini,
    tipologiaId: tipologia.id,
    prezzoBase: tipologia.prezzo_base,
    periodi,
    piano,
    promozioni,
    codice,
    percentualeFedelta,
    pacchetto,
    servizi,
    tassa,
    ospitiTassabili: contaTassabili(tassa, r.adulti, bambini, r.etaBambini),
  });

  return {
    ...calcolo,
    tipologia: { id: tipologia.id, nome: tipologia.nome },
    piano: piano && {
      id: piano.id,
      nome: piano.nome,
      rimborsabile: piano.rimborsabile,
      ore_cancellazione_gratuita: piano.ore_cancellazione_gratuita,
      penale_percentuale: piano.penale_percentuale,
      acconto_percentuale: piano.acconto_percentuale,
    },
    codice_sconto: codice && { id: codice.id, codice: codice.codice },
    pacchetto: pacchetto && { id: pacchetto.id, nome: pacchetto.nome },
  };
}

// ─────────────────────────────────────
// Piani tariffari
// ─────────────────────────────────────

async function elencoPiani(filtri) {
  return await tariffeRepo.trovaPiani(filtri);
}

async function dettaglioPiano(id) {
  const piano = await tariffeRepo.trovaPianoPerId(id);
  if (!piano) {
    throw nonTrovato('PIANO_NON_TROVATO', 'Piano tariffario non trovato');
  }
  return piano;
}

// Il predefinito è uno solo: impostarne uno toglie il flag agli altri.
async function creaPiano(dati) {
  return await sequelize.transaction(async (transaction) => {
    if (dati.predefinito) {
      await tariffeRepo.togliPredefinito(transaction);
    }
    return await tariffeRepo.creaPiano(datiPiano(dati), transaction);
  });
}

async function aggiornaPiano(id, dati) {
  return await sequelize.transaction(async (transaction) => {
    if (dati.predefinito) {
      await tariffeRepo.togliPredefinito(transaction);
    }
    const piano = await tariffeRepo.aggiornaPiano(id, datiPiano(dati), transaction);
    if (!piano) {
      throw nonTrovato('PIANO_NON_TROVATO', 'Piano tariffario non trovato');
    }
    return piano;
  });
}

/** Un piano già usato da prenotazioni si disattiva, non si elimina. */
async function eliminaPiano(id) {
  await dettaglioPiano(id);
  const usato = await tariffeRepo.contaPrenotazioniConPiano(id);
  if (usato > 0) {
    throw conflitto('PIANO_IN_USO', 'Il piano è usato da alcune prenotazioni: disattivalo');
  }
  await tariffeRepo.eliminaPiano(id);
}

// ─────────────────────────────────────
// Periodi tariffari
// ─────────────────────────────────────

function controllaDatePeriodo(dal, al) {
  if (dal && al && al < dal) {
    throw richiestaNonValida('DATE_NON_VALIDE', 'La data di fine precede quella di inizio');
  }
}

async function elencoPeriodi(filtri) {
  return await tariffeRepo.trovaPeriodi(filtri);
}

async function dettaglioPeriodo(id) {
  const periodo = await tariffeRepo.trovaPeriodoPerId(id);
  if (!periodo) {
    throw nonTrovato('PERIODO_NON_TROVATO', 'Periodo tariffario non trovato');
  }
  return periodo;
}

async function creaPeriodo(dati, contesto) {
  controllaDatePeriodo(dati.data_inizio, dati.data_fine);
  const periodo = await tariffeRepo.creaPeriodo({
    ...datiPeriodo(dati),
    creato_da: contesto.utenteId,
  });
  return await dettaglioPeriodo(periodo.id);
}

async function aggiornaPeriodo(id, dati, contesto) {
  controllaDatePeriodo(dati.data_inizio, dati.data_fine);
  const periodo = await tariffeRepo.aggiornaPeriodo(id, {
    ...datiPeriodo(dati),
    aggiornato_da: contesto.utenteId,
  });
  if (!periodo) {
    throw nonTrovato('PERIODO_NON_TROVATO', 'Periodo tariffario non trovato');
  }
  return await dettaglioPeriodo(id);
}

async function eliminaPeriodo(id) {
  await dettaglioPeriodo(id);
  await tariffeRepo.eliminaPeriodo(id);
}

// ─────────────────────────────────────
// Promozioni
// ─────────────────────────────────────

async function elencoPromozioni(filtri) {
  return await tariffeRepo.trovaPromozioni(filtri);
}

async function dettaglioPromozione(id) {
  const promozione = await tariffeRepo.trovaPromozionePerId(id);
  if (!promozione) {
    throw nonTrovato('PROMOZIONE_NON_TROVATA', 'Promozione non trovata');
  }
  return promozione;
}

/** Promozioni visibili sul sito, nella lingua del visitatore. */
async function promozioniPubbliche(lingua = 'it') {
  const promozioni = await tariffeRepo.trovaPromozioniPubbliche(oggi(), lingua);
  return promozioni.map(applicaTraduzioni);
}

async function creaPromozione(dati, contesto) {
  controllaDatePeriodo(dati.soggiorno_dal, dati.soggiorno_al);
  const promozione = await tariffeRepo.creaPromozione({
    ...datiPromozione(dati),
    creato_da: contesto.utenteId,
  });
  const creata = await dettaglioPromozione(promozione.id);
  if (creata.attiva) {
    await notifiche.promozioneAiClienti(creata);
  }
  return creata;
}

/** Quando una promozione diventa attiva i clienti registrati la trovano nella campanella. */
async function aggiornaPromozione(id, dati) {
  controllaDatePeriodo(dati.soggiorno_dal, dati.soggiorno_al);
  const prima = await dettaglioPromozione(id);
  await tariffeRepo.aggiornaPromozione(id, datiPromozione(dati));
  const dopo = await dettaglioPromozione(id);
  if (dopo.attiva && !prima.attiva) {
    await notifiche.promozioneAiClienti(dopo);
  }
  return dopo;
}

async function eliminaPromozione(id) {
  await dettaglioPromozione(id);
  await tariffeRepo.eliminaPromozione(id);
  await contenuti.eliminaContenutiDi('promozione', id);
}

// ─────────────────────────────────────
// Codici sconto
// ─────────────────────────────────────

async function elencoCodiciSconto(filtri) {
  return await tariffeRepo.trovaCodiciSconto(filtri);
}

async function dettaglioCodiceSconto(id) {
  const codice = await tariffeRepo.trovaCodiceScontoPerId(id);
  if (!codice) {
    throw nonTrovato('CODICE_SCONTO_NON_TROVATO', 'Codice sconto non trovato');
  }
  return codice;
}

async function creaCodiceSconto(dati, contesto) {
  const codice = await tariffeRepo.creaCodiceSconto({
    ...datiCodiceSconto(dati),
    creato_da: contesto.utenteId,
  });
  return await dettaglioCodiceSconto(codice.id);
}

async function aggiornaCodiceSconto(id, dati) {
  const codice = await tariffeRepo.aggiornaCodiceSconto(id, datiCodiceSconto(dati));
  if (!codice) {
    throw nonTrovato('CODICE_SCONTO_NON_TROVATO', 'Codice sconto non trovato');
  }
  return await dettaglioCodiceSconto(id);
}

async function eliminaCodiceSconto(id) {
  await dettaglioCodiceSconto(id);
  await tariffeRepo.eliminaCodiceSconto(id);
}

// ─────────────────────────────────────
// Pacchetti
// ─────────────────────────────────────

async function elencoPacchetti(filtri) {
  return await tariffeRepo.trovaPacchetti(filtri);
}

async function dettaglioPacchetto(id) {
  const pacchetto = await tariffeRepo.trovaPacchettoPerId(id);
  if (!pacchetto) {
    throw nonTrovato('PACCHETTO_NON_TROVATO', 'Pacchetto non trovato');
  }
  return pacchetto;
}

/** Pacchetti visibili sul sito, con servizi inclusi e testi tradotti. */
async function pacchettiPubblici(lingua = 'it') {
  const pacchetti = await tariffeRepo.trovaPacchettiPubblici(oggi(), lingua);
  return pacchetti.map((pacchetto) => {
    const tradotto = applicaTraduzioni(pacchetto);
    tradotto.servizi = tradotto.servizi.map(applicaTraduzioni);
    return tradotto;
  });
}

/** dati.servizi = servizi inclusi [{ servizio_id, quantita }]. */
async function creaPacchetto(dati) {
  const id = await sequelize.transaction(async (transaction) => {
    const pacchetto = await tariffeRepo.creaPacchetto(
      { ...datiPacchetto(dati), slug: dati.slug || slugDa(dati.nome) },
      transaction,
    );
    if (dati.servizi) {
      await tariffeRepo.impostaServiziPacchetto(pacchetto.id, dati.servizi, transaction);
    }
    return pacchetto.id;
  });
  return await dettaglioPacchetto(id);
}

async function aggiornaPacchetto(id, dati) {
  await sequelize.transaction(async (transaction) => {
    const pacchetto = await tariffeRepo.aggiornaPacchetto(id, datiPacchetto(dati), transaction);
    if (!pacchetto) {
      throw nonTrovato('PACCHETTO_NON_TROVATO', 'Pacchetto non trovato');
    }
    if (dati.servizi) {
      await tariffeRepo.impostaServiziPacchetto(id, dati.servizi, transaction);
    }
  });
  return await dettaglioPacchetto(id);
}

async function eliminaPacchetto(id) {
  await dettaglioPacchetto(id);
  await tariffeRepo.eliminaPacchetto(id);
  await contenuti.eliminaContenutiDi('pacchetto', id);
}

// ─────────────────────────────────────
// Tassa di soggiorno
// ─────────────────────────────────────

async function elencoTasse() {
  return await tariffeRepo.trovaTasse();
}

async function dettaglioTassa(id) {
  const tassa = await tariffeRepo.trovaTassaPerId(id);
  if (!tassa) {
    throw nonTrovato('TASSA_NON_TROVATA', 'Tariffa della tassa di soggiorno non trovata');
  }
  return tassa;
}

async function creaTassa(dati) {
  controllaDatePeriodo(dati.valida_dal, dati.valida_al);
  return await tariffeRepo.creaTassa(datiTassa(dati));
}

async function aggiornaTassa(id, dati) {
  controllaDatePeriodo(dati.valida_dal, dati.valida_al);
  const tassa = await tariffeRepo.aggiornaTassa(id, datiTassa(dati));
  if (!tassa) {
    throw nonTrovato('TASSA_NON_TROVATA', 'Tariffa della tassa di soggiorno non trovata');
  }
  return tassa;
}

async function eliminaTassa(id) {
  await dettaglioTassa(id);
  await tariffeRepo.eliminaTassa(id);
}

/**
 * Job: la tassa in vigore finisce tra 30, 7 o 1 giorni e il giorno dopo non ne
 * comincia un'altra. Senza tariffa i preventivi la calcolano a zero, quindi chi
 * gestisce le tariffe va avvisato per tempo. Senza alcuna tassa non si avvisa.
 */
async function avvisaTassaInScadenza() {
  const tassa = await tassaInVigore(oggi());
  const giorni = tassa ? contaNotti(oggi(), tassa.valida_al) : null;
  if (!GIORNI_AVVISO_TASSA.includes(giorni)) {
    return { avvisati: 0 };
  }
  if (await tassaInVigore(aggiungiGiorni(tassa.valida_al, 1))) {
    return { avvisati: 0 };
  }
  const avvisati = await notifiche.aChiPuo(PERMESSI.TARIFFE_GESTISCI, {
    tipo: 'sistema',
    priorita: 'avviso',
    codice: 'tassa_in_scadenza',
    parametri: { nome: tassa.nome, data: tassa.valida_al },
    titolo: `Tassa di soggiorno: "${tassa.nome}" finisce il ${dataItaliana(tassa.valida_al)} e non ce n'è un'altra`,
    link: '/staff/tariffe',
  });
  return { avvisati: avvisati.length };
}

module.exports = {
  preventivo,
  codiceValido,
  tassaInVigore,
  elencoPiani,
  dettaglioPiano,
  creaPiano,
  aggiornaPiano,
  eliminaPiano,
  elencoPeriodi,
  dettaglioPeriodo,
  creaPeriodo,
  aggiornaPeriodo,
  eliminaPeriodo,
  elencoPromozioni,
  dettaglioPromozione,
  promozioniPubbliche,
  creaPromozione,
  aggiornaPromozione,
  eliminaPromozione,
  elencoCodiciSconto,
  dettaglioCodiceSconto,
  creaCodiceSconto,
  aggiornaCodiceSconto,
  eliminaCodiceSconto,
  elencoPacchetti,
  dettaglioPacchetto,
  pacchettiPubblici,
  creaPacchetto,
  aggiornaPacchetto,
  eliminaPacchetto,
  elencoTasse,
  dettaglioTassa,
  creaTassa,
  aggiornaTassa,
  eliminaTassa,
  avvisaTassaInScadenza,
};
