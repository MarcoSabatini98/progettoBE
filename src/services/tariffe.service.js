// Tariffe e calcolo del prezzo di un soggiorno.
//
// Ordine (lo stesso documentato in database/schema.sql):
//   1. per ogni notte: prezzo base della tipologia
//        → variazione del periodo tariffario più prioritario che la copre
//          (a parità di priorità vince quello legato alla tipologia)
//        → variazione del piano tariffario scelto
//   2. importo_soggiorno = somma delle notti
//   3. − promozione migliore (non cumulabili)
//   4. − codice sconto
//   5. − sconto fedeltà del livello cliente (% sul risultato del punto 4)
//   6. + pacchetto + servizi extra + tassa di soggiorno (non scontati)
//
// `calcola` è una funzione pura in centesimi: tutto il resto carica i dati.

const { Op } = require('sequelize');
const {
  TipologiaCamera,
  PianoTariffario,
  PeriodoTariffario,
  Promozione,
  CodiceSconto,
  Pacchetto,
  PacchettoServizio,
  Servizio,
  TassaSoggiorno,
  LivelloFedelta,
  Prenotazione,
  sequelize,
} = require('../models');
const { oppure404, richiestaNonValida, nonElaborabile } = require('../utils/errori');
const { centesimi, euro, percentualeDi } = require('../utils/denaro');
const { notti: elencoNotti, bitGiorno, oggi } = require('../utils/date');
const { crud } = require('./crud');
const contenuti = require('./contenuti.service');
const { slugDa } = require('./camere.service');

// --- calcolo puro -----------------------------------------------------------------------

/** Periodo che vince per una notte: priorità più alta, poi quello della tipologia. */
function periodoDellaNotte(periodi, data, tipologiaId) {
  let migliore = null;
  for (const p of periodi) {
    if (p.data_inizio > data || p.data_fine < data) continue;
    if (!(p.giorni_settimana & bitGiorno(data))) continue;
    if (p.tipologia_id != null && p.tipologia_id !== tipologiaId) continue;
    const specifico = p.tipologia_id != null;
    if (
      !migliore ||
      p.priorita > migliore.priorita ||
      (p.priorita === migliore.priorita && specifico && migliore.tipologia_id == null)
    ) {
      migliore = p;
    }
  }
  return migliore;
}

function applicaVariazione(cent, tipo, valore) {
  if (tipo === 'percentuale') return cent + percentualeDi(cent, valore);
  if (tipo === 'importo') return cent + centesimi(valore);
  if (tipo === 'prezzo_fisso') return centesimi(valore);
  return cent;
}

/** Sconto di una promozione (in centesimi) o 0 se non si applica. */
function scontoPromozione(promo, { notti, ospiti, tipologiaId }) {
  if (promo.tipologia_id != null && promo.tipologia_id !== tipologiaId) return 0;
  if (promo.ospiti_min != null && ospiti < promo.ospiti_min) return 0;
  if (promo.ospiti_max != null && ospiti > promo.ospiti_max) return 0;
  if (promo.notti_min != null && notti.length < promo.notti_min) return 0;
  const coperte = notti.filter(
    (n) => n.data >= promo.soggiorno_dal && n.data <= promo.soggiorno_al,
  );
  if (!coperte.length) return 0;
  if (promo.tipo_sconto === 'percentuale') {
    return coperte.reduce((s, n) => s + percentualeDi(n.prezzo, promo.valore), 0);
  }
  return centesimi(promo.valore);
}

function totaleServizio(s, notti, ospiti) {
  const unitario = centesimi(s.prezzo);
  const quantita = s.quantita ?? 1;
  const moltiplicatore = {
    a_soggiorno: 1,
    a_notte: notti,
    a_persona: ospiti,
    a_persona_notte: ospiti * notti,
  }[s.calcolo_prezzo];
  return unitario * quantita * moltiplicatore;
}

/**
 * Calcola il prezzo di un soggiorno. Importi in ingresso in euro (come dal DB),
 * in uscita in euro; i conti interni sono in centesimi.
 */
function calcola(d) {
  const ospiti = d.adulti + (d.bambini ?? 0);
  let soggiornoMinimo = 0;

  const notti = elencoNotti(d.arrivo, d.partenza).map((data) => {
    const base = centesimi(d.prezzoBase);
    const periodo = periodoDellaNotte(d.periodi ?? [], data, d.tipologiaId);
    let prezzo = periodo ? applicaVariazione(base, periodo.tipo_variazione, periodo.valore) : base;
    if (d.piano)
      prezzo = applicaVariazione(prezzo, d.piano.tipo_variazione, d.piano.valore_variazione);
    prezzo = Math.max(prezzo, 0);
    if (periodo?.soggiorno_minimo)
      soggiornoMinimo = Math.max(soggiornoMinimo, periodo.soggiorno_minimo);
    return { data, prezzo, periodo: periodo?.nome ?? null };
  });
  if (!notti.length)
    throw richiestaNonValida('DATE_NON_VALIDE', 'La partenza deve essere dopo l’arrivo');
  if (notti.length < soggiornoMinimo) {
    throw nonElaborabile(
      'SOGGIORNO_MINIMO',
      `Per queste date il soggiorno minimo è di ${soggiornoMinimo} notti`,
      { soggiornoMinimo },
    );
  }

  const importoSoggiorno = notti.reduce((s, n) => s + n.prezzo, 0);

  // promozione migliore
  let promozione = null;
  let scontoPromo = 0;
  for (const p of d.promozioni ?? []) {
    const sconto = Math.min(
      scontoPromozione(p, { notti, ospiti, tipologiaId: d.tipologiaId }),
      importoSoggiorno,
    );
    if (sconto > scontoPromo) {
      scontoPromo = sconto;
      promozione = { id: p.id, nome: p.nome };
    }
  }

  // codice sconto
  let scontoCodice = 0;
  const dopoPromo = importoSoggiorno - scontoPromo;
  if (d.codice) {
    const c = d.codice;
    if (c.notti_min != null && notti.length < c.notti_min) {
      throw nonElaborabile(
        'CODICE_SCONTO_NON_APPLICABILE',
        `Il codice vale per soggiorni di almeno ${c.notti_min} notti`,
      );
    }
    if (c.importo_minimo != null && dopoPromo < centesimi(c.importo_minimo)) {
      throw nonElaborabile(
        'CODICE_SCONTO_NON_APPLICABILE',
        `Il codice vale per soggiorni da almeno ${euro(centesimi(c.importo_minimo))} €`,
      );
    }
    scontoCodice = Math.min(
      c.tipo_sconto === 'percentuale' ? percentualeDi(dopoPromo, c.valore) : centesimi(c.valore),
      dopoPromo,
    );
  }

  // fedeltà
  const percentualeFedelta = Number(d.percentualeFedelta ?? 0);
  const scontoFedelta = percentualeDi(dopoPromo - scontoCodice, percentualeFedelta);

  // non scontati
  const importoPacchetto = d.pacchetto ? centesimi(d.pacchetto.prezzo) : 0;
  const servizi = (d.servizi ?? []).map((s) => ({
    servizio_id: s.servizio_id ?? s.id,
    nome: s.nome,
    quantita: s.quantita ?? 1,
    prezzo_unitario: euro(centesimi(s.prezzo)),
    calcolo_prezzo: s.calcolo_prezzo,
    totale: totaleServizio(s, notti.length, ospiti),
  }));
  const importoServizi = servizi.reduce((s, x) => s + x.totale, 0);

  let tassa = 0;
  if (d.tassa) {
    const nottiTassabili = d.tassa.notti_max
      ? Math.min(notti.length, d.tassa.notti_max)
      : notti.length;
    tassa = centesimi(d.tassa.importo_notte) * nottiTassabili * (d.ospitiTassabili ?? ospiti);
  }

  const totale =
    importoSoggiorno -
    scontoPromo -
    scontoCodice -
    scontoFedelta +
    importoPacchetto +
    importoServizi +
    tassa;
  // l'acconto si calcola sul dovuto alla struttura: la tassa si versa al comune
  const acconto = percentualeDi(totale - tassa, d.piano?.acconto_percentuale ?? 0);

  return {
    notti: notti.map((n) => ({ ...n, prezzo: euro(n.prezzo) })),
    numero_notti: notti.length,
    importo_soggiorno: euro(importoSoggiorno),
    promozione: promozione && { ...promozione, sconto: euro(scontoPromo) },
    sconto_promozione: euro(scontoPromo),
    sconto_codice: euro(scontoCodice),
    percentuale_fedelta: percentualeFedelta,
    sconto_fedelta: euro(scontoFedelta),
    importo_pacchetto: euro(importoPacchetto),
    servizi: servizi.map((s) => ({ ...s, totale: euro(s.totale) })),
    importo_servizi: euro(importoServizi),
    tassa_soggiorno: euro(tassa),
    totale: euro(totale),
    acconto_richiesto: euro(acconto),
  };
}

// --- caricamento dati ---------------------------------------------------------------------

async function pianoScelto(pianoId) {
  const where = pianoId ? { id: pianoId, attivo: true } : { predefinito: true, attivo: true };
  const piano = await PianoTariffario.findOne({ where });
  if (pianoId && !piano)
    throw richiestaNonValida('PIANO_NON_VALIDO', 'Piano tariffario non disponibile');
  return piano;
}

/** Codice sconto valido oggi per questo utente, o errore spiegato. */
async function codiceValido(testo, utenteId) {
  if (!testo) return null;
  const c = await CodiceSconto.findOne({
    where: { codice: String(testo).trim().toUpperCase(), attivo: true },
  });
  const giorno = oggi();
  const errore = (m) => nonElaborabile('CODICE_SCONTO_NON_VALIDO', m);
  if (!c) throw errore('Codice sconto inesistente o non più attivo');
  if (c.valido_dal && giorno < c.valido_dal) throw errore(`Il codice è valido dal ${c.valido_dal}`);
  if (c.valido_al && giorno > c.valido_al) throw errore('Il codice sconto è scaduto');
  if (c.utilizzi_max != null && c.utilizzi >= c.utilizzi_max)
    throw errore('Il codice sconto è esaurito');
  if (c.utilizzi_per_utente != null && utenteId) {
    const usati = await Prenotazione.count({
      where: { codice_sconto_id: c.id, utente_id: utenteId, stato: { [Op.ne]: 'cancellata' } },
    });
    if (usati >= c.utilizzi_per_utente) throw errore('Hai già usato questo codice');
  }
  return c;
}

async function percentualeFedeltaDi(utenteId) {
  if (!utenteId) return 0;
  const [riga] = await sequelize.query(
    'SELECT sconto_percentuale FROM v_fedelta_utenti WHERE utente_id = ?',
    {
      replacements: [utenteId],
      type: sequelize.QueryTypes.SELECT,
    },
  );
  return Number(riga?.sconto_percentuale ?? 0);
}

async function pacchettoValido(pacchettoId, tipologiaId, arrivo, numeroNotti) {
  if (!pacchettoId) return null;
  const p = oppure404(
    await Pacchetto.findOne({ where: { id: pacchettoId, attivo: true } }),
    'PACCHETTO_NON_TROVATO',
    'Pacchetto non disponibile',
  );
  const errore = (m) => nonElaborabile('PACCHETTO_NON_APPLICABILE', m);
  if (p.tipologia_id && p.tipologia_id !== tipologiaId)
    throw errore('Il pacchetto non è disponibile per questa camera');
  if (p.valido_dal && arrivo < p.valido_dal)
    throw errore(`Il pacchetto è valido dal ${p.valido_dal}`);
  if (p.valido_al && arrivo > p.valido_al)
    throw errore(`Il pacchetto è valido fino al ${p.valido_al}`);
  if (p.notti_min && numeroNotti < p.notti_min)
    throw errore(`Il pacchetto richiede almeno ${p.notti_min} notti`);
  return p;
}

/** Servizi extra richiesti: [{ servizio_id, quantita }] → righe con prezzo. */
async function serviziRichiesti(richiesti) {
  if (!richiesti?.length) return [];
  const ids = richiesti.map((s) => s.servizio_id);
  const trovati = await Servizio.findAll({
    where: { id: ids, tipo: 'extra', attivo: true },
    raw: true,
  });
  if (trovati.length !== new Set(ids).size) {
    throw richiestaNonValida(
      'SERVIZIO_NON_DISPONIBILE',
      'Uno dei servizi scelti non è disponibile',
    );
  }
  return richiesti.map((r) => ({
    ...trovati.find((s) => s.id === r.servizio_id),
    quantita: r.quantita ?? 1,
  }));
}

function tassaApplicabile(arrivo) {
  return TassaSoggiorno.findOne({
    where: { attiva: true, valida_dal: { [Op.lte]: arrivo }, valida_al: { [Op.gte]: arrivo } },
    order: [['valida_dal', 'DESC']],
  });
}

/**
 * Ospiti soggetti alla tassa. Se la tassa prevede un'esenzione per età e non
 * si conoscono le età dei bambini, i bambini si considerano esenti; al
 * check-in il conteggio si rifà con le date di nascita vere.
 */
function contaTassabili(tassa, adulti, bambini, etaBambini) {
  if (!tassa?.eta_esenzione) return adulti + bambini;
  if (!etaBambini?.length) return adulti;
  return adulti + etaBambini.filter((e) => e >= tassa.eta_esenzione).length;
}

/**
 * Preventivo completo di una tipologia per un soggiorno.
 * @param {{ tipologiaId: number, arrivo: string, partenza: string, adulti: number, bambini?: number,
 *   etaBambini?: number[], pianoId?: number, codiceSconto?: string, pacchettoId?: number,
 *   servizi?: {servizio_id: number, quantita?: number}[], utenteId?: number,
 *   esistente?: { codiceScontoId?: number, percentualeFedelta?: number } }} r  esistente = riprezzamento di una prenotazione:
 *   piano, codice e pacchetto già accettati non si ricontrollano
 */
async function preventivo(r) {
  const tipologia = oppure404(
    await TipologiaCamera.findOne({
      where: r.esistente ? { id: r.tipologiaId } : { id: r.tipologiaId, attiva: true },
    }),
    'TIPOLOGIA_NON_TROVATA',
    'Tipologia non disponibile',
  );
  const numeroNotti = elencoNotti(r.arrivo, r.partenza).length;
  const giorno = oggi();

  const [piano, periodi, promozioni, codice, percentualeFedelta, pacchetto, servizi, tassa] =
    await Promise.all([
      r.esistente && r.pianoId ? PianoTariffario.findByPk(r.pianoId) : pianoScelto(r.pianoId),
      PeriodoTariffario.findAll({
        where: {
          attivo: true,
          data_inizio: { [Op.lt]: r.partenza },
          data_fine: { [Op.gte]: r.arrivo },
          [Op.or]: [{ tipologia_id: null }, { tipologia_id: tipologia.id }],
        },
        raw: true,
      }),
      Promozione.findAll({
        where: {
          attiva: true,
          soggiorno_dal: { [Op.lt]: r.partenza },
          soggiorno_al: { [Op.gte]: r.arrivo },
          [Op.and]: [
            { [Op.or]: [{ prenotabile_dal: null }, { prenotabile_dal: { [Op.lte]: giorno } }] },
            { [Op.or]: [{ prenotabile_al: null }, { prenotabile_al: { [Op.gte]: giorno } }] },
          ],
        },
        raw: true,
      }),
      r.esistente
        ? r.esistente.codiceScontoId && CodiceSconto.findByPk(r.esistente.codiceScontoId)
        : codiceValido(r.codiceSconto, r.utenteId),
      r.esistente ? (r.esistente.percentualeFedelta ?? 0) : percentualeFedeltaDi(r.utenteId),
      r.esistente && r.pacchettoId
        ? Pacchetto.findByPk(r.pacchettoId)
        : pacchettoValido(r.pacchettoId, tipologia.id, r.arrivo, numeroNotti),
      serviziRichiesti(r.servizi),
      tassaApplicabile(r.arrivo),
    ]);

  const calcolo = calcola({
    arrivo: r.arrivo,
    partenza: r.partenza,
    adulti: r.adulti,
    bambini: r.bambini ?? 0,
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
    ospitiTassabili: contaTassabili(tassa, r.adulti, r.bambini ?? 0, r.etaBambini),
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

// --- gestione (admin) ----------------------------------------------------------------------

const piani = crud(PianoTariffario, {
  codice: 'PIANO_NON_TROVATO',
  messaggio: 'Piano tariffario non trovato',
  ordine: [
    ['ordine', 'ASC'],
    ['nome', 'ASC'],
  ],
});
const periodi = crud(PeriodoTariffario, {
  codice: 'PERIODO_NON_TROVATO',
  messaggio: 'Periodo tariffario non trovato',
  ordine: [
    ['data_inizio', 'ASC'],
    ['priorita', 'DESC'],
  ],
});
const promozioni = crud(Promozione, {
  codice: 'PROMOZIONE_NON_TROVATA',
  messaggio: 'Promozione non trovata',
  ordine: [['soggiorno_dal', 'DESC']],
});
const codiciSconto = crud(CodiceSconto, {
  codice: 'CODICE_SCONTO_NON_TROVATO',
  messaggio: 'Codice sconto non trovato',
  ordine: [['creato_il', 'DESC']],
  campi: [
    'codice',
    'descrizione',
    'tipo_sconto',
    'valore',
    'valido_dal',
    'valido_al',
    'importo_minimo',
    'notti_min',
    'utilizzi_max',
    'utilizzi_per_utente',
    'attivo',
  ],
});
const pacchetti = crud(Pacchetto, {
  codice: 'PACCHETTO_NON_TROVATO',
  messaggio: 'Pacchetto non trovato',
  ordine: [
    ['ordine', 'ASC'],
    ['nome', 'ASC'],
  ],
  include: [{ model: Servizio, as: 'servizi', through: { attributes: ['quantita'] } }],
});
const tasse = crud(TassaSoggiorno, {
  codice: 'TASSA_NON_TROVATA',
  messaggio: 'Tariffa della tassa di soggiorno non trovata',
  ordine: [['valida_dal', 'DESC']],
});
const livelliFedelta = crud(LivelloFedelta, {
  codice: 'LIVELLO_NON_TROVATO',
  messaggio: 'Livello fedeltà non trovato',
  ordine: [['punti_minimi', 'ASC']],
});

/** Il predefinito è uno solo: impostarne uno toglie il flag agli altri. */
function salvaPiano(id, dati, contesto) {
  return sequelize.transaction(async (t) => {
    if (dati.predefinito) {
      await PianoTariffario.update(
        { predefinito: false },
        { where: { predefinito: true }, transaction: t },
      );
    }
    const piano = id
      ? await piani.aggiorna(id, dati, contesto, t)
      : await piani.crea(dati, contesto, t);
    return piano;
  });
}

// i codici si confrontano in maiuscolo (vedi codiceValido)
const normalizzaCodice = (dati) =>
  dati.codice ? { ...dati, codice: String(dati.codice).trim().toUpperCase() } : dati;
const creaCodiceSconto = (dati, contesto) => codiciSconto.crea(normalizzaCodice(dati), contesto);
const aggiornaCodiceSconto = (id, dati, contesto) =>
  codiciSconto.aggiorna(id, normalizzaCodice(dati), contesto);

/** Pacchetto con i servizi inclusi: servizi = [{ servizio_id, quantita }]. */
async function salvaPacchetto(id, dati, contesto) {
  const pacchettoId = await sequelize.transaction(async (t) => {
    const valori = !id && !dati.slug ? { ...dati, slug: slugDa(dati.nome) } : dati;
    const p = id
      ? await pacchetti.aggiorna(id, valori, contesto, t)
      : await pacchetti.crea(valori, contesto, t);
    if (dati.servizi) {
      await PacchettoServizio.destroy({ where: { pacchetto_id: p.id }, transaction: t });
      await PacchettoServizio.bulkCreate(
        dati.servizi.map((s) => ({
          pacchetto_id: p.id,
          servizio_id: s.servizio_id,
          quantita: s.quantita ?? 1,
        })),
        { transaction: t },
      );
    }
    return p.id;
  });
  return pacchetti.dettaglio(pacchettoId);
}

/** Promozioni visibili sul sito (prenotabili oggi, non ancora finite). */
async function promozioniPubbliche(lingua) {
  const giorno = oggi();
  const righe = await Promozione.findAll({
    where: {
      attiva: true,
      soggiorno_al: { [Op.gte]: giorno },
      [Op.and]: [
        { [Op.or]: [{ prenotabile_dal: null }, { prenotabile_dal: { [Op.lte]: giorno } }] },
        { [Op.or]: [{ prenotabile_al: null }, { prenotabile_al: { [Op.gte]: giorno } }] },
      ],
    },
    order: [['soggiorno_dal', 'ASC']],
  });
  return contenuti.traduci('promozione', righe, lingua);
}

async function pacchettiPubblici(lingua) {
  const giorno = oggi();
  const righe = await Pacchetto.findAll({
    where: { attivo: true, [Op.or]: [{ valido_al: null }, { valido_al: { [Op.gte]: giorno } }] },
    include: [{ model: Servizio, as: 'servizi', through: { attributes: ['quantita'] } }],
    order: [['ordine', 'ASC']],
  });
  return contenuti.traduci('pacchetto', righe, lingua);
}

module.exports = {
  calcola,
  totaleServizio,
  preventivo,
  codiceValido,
  contaTassabili,
  tassaApplicabile,
  percentualeFedeltaDi,
  piani,
  salvaPiano,
  periodi,
  promozioni,
  codiciSconto,
  creaCodiceSconto,
  aggiornaCodiceSconto,
  pacchetti,
  salvaPacchetto,
  tasse,
  livelliFedelta,
  promozioniPubbliche,
  pacchettiPubblici,
};
