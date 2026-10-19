// src/services/helpers/calcolo-prezzo.js
//
// Calcolo del prezzo di un soggiorno. Funzioni pure: non leggono il database,
// ricevono i dati già caricati da tariffe.service.
//
// Ordine di applicazione:
//   1. per ogni notte: prezzo base della tipologia
//        → variazione del periodo tariffario più prioritario che la copre
//          (a parità di priorità vince quello legato alla tipologia)
//        → variazione del piano tariffario scelto
//   2. importo_soggiorno = somma delle notti
//   3. − promozione migliore (le promozioni non si sommano)
//   4. − codice sconto
//   5. − sconto fedeltà del livello del cliente (% sul risultato del punto 4)
//   6. + pacchetto + servizi extra + tassa di soggiorno (mai scontati)
//
// Importi in ingresso e in uscita in euro; i conti interni sono in centesimi
// per non accumulare errori di arrotondamento.

const { richiestaNonValida, nonElaborabile } = require('../../utils/errori');
const { centesimi, euro, percentualeDi } = require('../../utils/denaro');
const { notti: elencoNotti, bitGiorno } = require('../../utils/date');

// ─────────────────────────────────────
// Prezzo di una notte
// ─────────────────────────────────────

function periodoCopreLaNotte(periodo, data, tipologiaId) {
  if (periodo.data_inizio > data || periodo.data_fine < data) {
    return false;
  }
  // giorni_settimana è una maschera di bit: lun = 1, mar = 2, ... dom = 64
  if (!(periodo.giorni_settimana & bitGiorno(data))) {
    return false;
  }
  if (periodo.tipologia_id != null && periodo.tipologia_id !== tipologiaId) {
    return false;
  }
  return true;
}

/** Periodo che vince per una notte: priorità più alta, poi quello della tipologia. */
function periodoDellaNotte(periodi, data, tipologiaId) {
  let migliore = null;

  for (const periodo of periodi) {
    if (!periodoCopreLaNotte(periodo, data, tipologiaId)) {
      continue;
    }
    if (!migliore || periodo.priorita > migliore.priorita) {
      migliore = periodo;
      continue;
    }
    const stessaPriorita = periodo.priorita === migliore.priorita;
    const piuSpecifico = periodo.tipologia_id != null && migliore.tipologia_id == null;
    if (stessaPriorita && piuSpecifico) {
      migliore = periodo;
    }
  }

  return migliore;
}

function applicaVariazione(prezzoCent, tipo, valore) {
  if (tipo === 'percentuale') {
    return prezzoCent + percentualeDi(prezzoCent, valore);
  }
  if (tipo === 'importo') {
    return prezzoCent + centesimi(valore);
  }
  if (tipo === 'prezzo_fisso') {
    return centesimi(valore);
  }
  return prezzoCent;
}

// ─────────────────────────────────────
// Sconti
// ─────────────────────────────────────

/** Sconto di una promozione in centesimi, 0 se non si applica al soggiorno. */
function scontoPromozione(promozione, { notti, ospiti, tipologiaId }) {
  if (promozione.tipologia_id != null && promozione.tipologia_id !== tipologiaId) {
    return 0;
  }
  if (promozione.ospiti_min != null && ospiti < promozione.ospiti_min) {
    return 0;
  }
  if (promozione.ospiti_max != null && ospiti > promozione.ospiti_max) {
    return 0;
  }
  if (promozione.notti_min != null && notti.length < promozione.notti_min) {
    return 0;
  }

  const nottiCoperte = notti.filter(
    (notte) => notte.data >= promozione.soggiorno_dal && notte.data <= promozione.soggiorno_al,
  );
  if (nottiCoperte.length === 0) {
    return 0;
  }

  // la percentuale vale solo sulle notti coperte, l'importo fisso una volta sola
  if (promozione.tipo_sconto === 'percentuale') {
    return nottiCoperte.reduce(
      (somma, notte) => somma + percentualeDi(notte.prezzo, promozione.valore),
      0,
    );
  }
  return centesimi(promozione.valore);
}

/** Promozione più conveniente per il cliente. */
function promozioneMigliore(promozioni, soggiorno, importoSoggiorno) {
  let migliore = null;
  let sconto = 0;

  for (const promozione of promozioni) {
    const scontoPromo = Math.min(scontoPromozione(promozione, soggiorno), importoSoggiorno);
    if (scontoPromo > sconto) {
      sconto = scontoPromo;
      migliore = { id: promozione.id, nome: promozione.nome };
    }
  }

  return { promozione: migliore, sconto };
}

/** Sconto del codice in centesimi; errore se il soggiorno non ha i requisiti. */
function scontoCodice(codice, numeroNotti, importoCent) {
  if (codice.notti_min != null && numeroNotti < codice.notti_min) {
    throw nonElaborabile(
      'CODICE_SCONTO_NON_APPLICABILE',
      `Il codice vale per soggiorni di almeno ${codice.notti_min} notti`,
    );
  }
  if (codice.importo_minimo != null && importoCent < centesimi(codice.importo_minimo)) {
    throw nonElaborabile(
      'CODICE_SCONTO_NON_APPLICABILE',
      `Il codice vale per soggiorni da almeno ${euro(centesimi(codice.importo_minimo))} €`,
    );
  }

  const sconto =
    codice.tipo_sconto === 'percentuale'
      ? percentualeDi(importoCent, codice.valore)
      : centesimi(codice.valore);
  return Math.min(sconto, importoCent);
}

// ─────────────────────────────────────
// Voci non scontate
// ─────────────────────────────────────

/** Totale in centesimi di un servizio extra in base a come si paga. */
function totaleServizio(servizio, numeroNotti, ospiti) {
  const moltiplicatori = {
    a_soggiorno: 1,
    a_notte: numeroNotti,
    a_persona: ospiti,
    a_persona_notte: ospiti * numeroNotti,
  };
  const quantita = servizio.quantita ?? 1;
  return centesimi(servizio.prezzo) * quantita * moltiplicatori[servizio.calcolo_prezzo];
}

function tassaDiSoggiorno(tassa, numeroNotti, ospitiTassabili) {
  if (!tassa) {
    return 0;
  }
  const nottiTassabili = tassa.notti_max ? Math.min(numeroNotti, tassa.notti_max) : numeroNotti;
  return centesimi(tassa.importo_notte) * nottiTassabili * ospitiTassabili;
}

/**
 * Ospiti soggetti alla tassa. Se la tassa esenta i bambini sotto una certa età
 * e le età non sono note, i bambini si considerano esenti: al check-in il
 * conteggio si rifà con le date di nascita vere.
 */
function contaTassabili(tassa, adulti, bambini, etaBambini) {
  if (!tassa?.eta_esenzione) {
    return adulti + bambini;
  }
  if (!etaBambini?.length) {
    return adulti;
  }
  const bambiniTassabili = etaBambini.filter((eta) => eta >= tassa.eta_esenzione).length;
  return adulti + bambiniTassabili;
}

// ─────────────────────────────────────
// Calcolo completo
// ─────────────────────────────────────

/**
 * @param {object} d
 * @param {string} d.arrivo            YYYY-MM-DD
 * @param {string} d.partenza          YYYY-MM-DD
 * @param {number} d.adulti
 * @param {number} [d.bambini]
 * @param {number} d.prezzoBase        prezzo per notte della tipologia
 * @param {number} d.tipologiaId
 * @param {object[]} [d.periodi]       periodi tariffari che toccano il soggiorno
 * @param {object} [d.piano]           piano tariffario scelto
 * @param {object[]} [d.promozioni]    promozioni candidate
 * @param {object} [d.codice]          codice sconto già validato
 * @param {number} [d.percentualeFedelta]
 * @param {object} [d.pacchetto]
 * @param {object[]} [d.servizi]       extra con prezzo, calcolo_prezzo e quantita
 * @param {object} [d.tassa]           tariffa della tassa di soggiorno in vigore
 * @param {number} [d.ospitiTassabili]
 */
function calcola(d) {
  const bambini = d.bambini ?? 0;
  const ospiti = d.adulti + bambini;
  const prezzoBase = centesimi(d.prezzoBase);

  // 1. prezzo di ogni notte
  let soggiornoMinimo = 0;
  const notti = elencoNotti(d.arrivo, d.partenza).map((data) => {
    const periodo = periodoDellaNotte(d.periodi ?? [], data, d.tipologiaId);

    let prezzo = prezzoBase;
    if (periodo) {
      prezzo = applicaVariazione(prezzo, periodo.tipo_variazione, periodo.valore);
      soggiornoMinimo = Math.max(soggiornoMinimo, periodo.soggiorno_minimo ?? 0);
    }
    if (d.piano) {
      prezzo = applicaVariazione(prezzo, d.piano.tipo_variazione, d.piano.valore_variazione);
    }

    return { data, prezzo: Math.max(prezzo, 0), periodo: periodo?.nome ?? null };
  });

  if (notti.length === 0) {
    throw richiestaNonValida('DATE_NON_VALIDE', "La partenza deve essere dopo l'arrivo");
  }
  if (notti.length < soggiornoMinimo) {
    throw nonElaborabile(
      'SOGGIORNO_MINIMO',
      `Per queste date il soggiorno minimo è di ${soggiornoMinimo} notti`,
      { soggiornoMinimo },
    );
  }

  // 2. soggiorno
  const importoSoggiorno = notti.reduce((somma, notte) => somma + notte.prezzo, 0);

  // 3. promozione
  const { promozione, sconto: scontoPromo } = promozioneMigliore(
    d.promozioni ?? [],
    { notti, ospiti, tipologiaId: d.tipologiaId },
    importoSoggiorno,
  );
  const dopoPromozione = importoSoggiorno - scontoPromo;

  // 4. codice sconto
  const scontoDelCodice = d.codice ? scontoCodice(d.codice, notti.length, dopoPromozione) : 0;

  // 5. fedeltà
  const percentualeFedelta = Number(d.percentualeFedelta ?? 0);
  const scontoFedelta = percentualeDi(dopoPromozione - scontoDelCodice, percentualeFedelta);

  // 6. voci non scontate
  const importoPacchetto = d.pacchetto ? centesimi(d.pacchetto.prezzo) : 0;
  const servizi = (d.servizi ?? []).map((servizio) => ({
    servizio_id: servizio.servizio_id ?? servizio.id,
    nome: servizio.nome,
    quantita: servizio.quantita ?? 1,
    prezzo_unitario: euro(centesimi(servizio.prezzo)),
    calcolo_prezzo: servizio.calcolo_prezzo,
    totale: totaleServizio(servizio, notti.length, ospiti),
  }));
  const importoServizi = servizi.reduce((somma, servizio) => somma + servizio.totale, 0);
  const tassa = tassaDiSoggiorno(d.tassa, notti.length, d.ospitiTassabili ?? ospiti);

  const totale =
    importoSoggiorno -
    scontoPromo -
    scontoDelCodice -
    scontoFedelta +
    importoPacchetto +
    importoServizi +
    tassa;

  // l'acconto si calcola su quanto spetta alla struttura: la tassa va al comune
  const acconto = percentualeDi(totale - tassa, d.piano?.acconto_percentuale ?? 0);

  return {
    notti: notti.map((notte) => ({ ...notte, prezzo: euro(notte.prezzo) })),
    numero_notti: notti.length,
    importo_soggiorno: euro(importoSoggiorno),
    promozione: promozione && { ...promozione, sconto: euro(scontoPromo) },
    sconto_promozione: euro(scontoPromo),
    sconto_codice: euro(scontoDelCodice),
    percentuale_fedelta: percentualeFedelta,
    sconto_fedelta: euro(scontoFedelta),
    importo_pacchetto: euro(importoPacchetto),
    servizi: servizi.map((servizio) => ({ ...servizio, totale: euro(servizio.totale) })),
    importo_servizi: euro(importoServizi),
    tassa_soggiorno: euro(tassa),
    totale: euro(totale),
    acconto_richiesto: euro(acconto),
  };
}

module.exports = {
  calcola,
  totaleServizio,
  contaTassabili,
};
