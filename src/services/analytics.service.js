// src/services/analytics.service.js
//
// Statistiche e report per l'admin (permesso analytics.leggi).
//   ADR    = ricavo camere / notti vendute
//   RevPAR = ricavo camere / notti disponibili
// I ricavi per camera e tipologia contano i soggiorni con ARRIVO nel periodo:
// ogni prenotazione cade in un solo periodo, così i report non si sovrappongono.

const analyticsRepo = require('../repositories/analytics.repository');
const camereRepo = require('../repositories/camere.repository');
const contenutiRepo = require('../repositories/contenuti.repository');
const impostazioni = require('./impostazioni.service');
const { suggerimentoPrezzo } = require('./helpers/suggerimento-prezzo');
const { documentoReport } = require('./helpers/report-pdf');
const { creaPdf } = require('../utils/pdf');
const { centesimi, euro, percentualeDi } = require('../utils/denaro');
const { oggi, aggiungiGiorni, contaNotti } = require('../utils/date');
const { richiestaNonValida, nonTrovato } = require('../utils/errori');

const GIORNI_MAX = 731;
const GIORNI_SUGGERIMENTO_MAX = 180;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Intervallo [dal, al): di default gli ultimi 30 giorni. */
function periodo(query = {}, giorniMax = GIORNI_MAX) {
  const al = query.al ?? aggiungiGiorni(oggi(), 1);
  const dal = query.dal ?? aggiungiGiorni(al, -30);
  if (!ISO.test(dal) || !ISO.test(al) || al <= dal) {
    throw richiestaNonValida('INTERVALLO_DATE_NON_VALIDO', 'Intervallo di date non valido');
  }
  if (contaNotti(dal, al) > giorniMax) {
    throw richiestaNonValida('INTERVALLO_TROPPO_LUNGO', `Al massimo ${giorniMax} giorni per volta`);
  }
  return { dal, al };
}

function annoDa(query = {}) {
  return Number(query.anno) || Number(oggi().slice(0, 4));
}

function percentuale(parte, totale) {
  return totale > 0 ? Math.round((parte * 10000) / totale) / 100 : 0;
}

function media(valori) {
  if (valori.length === 0) {
    return 0;
  }
  const somma = valori.reduce((totale, valore) => totale + valore, 0);
  return Math.round((somma * 10) / valori.length) / 10;
}

// ─────────────────────────────────────
// Occupazione
// ─────────────────────────────────────

/** Giorno per giorno + riepilogo del periodo (dalla procedura del DB). */
async function occupazione(query) {
  const { dal, al } = periodo(query);
  const giorni = await analyticsRepo.trovaOccupazioneGiornaliera(dal, al);

  let disponibili = 0;
  let vendute = 0;
  let ricavo = 0;
  for (const giorno of giorni) {
    disponibili += Number(giorno.camere_disponibili);
    vendute += Number(giorno.camere_occupate);
    ricavo += centesimi(giorno.ricavo_camere);
  }

  return {
    dal,
    al,
    riepilogo: {
      notti_disponibili: disponibili,
      notti_vendute: vendute,
      occupazione_percentuale: percentuale(vendute, disponibili),
      ricavo_camere: euro(ricavo),
      adr: vendute > 0 ? euro(Math.round(ricavo / vendute)) : 0,
      revpar: disponibili > 0 ? euro(Math.round(ricavo / disponibili)) : 0,
    },
    giorni,
  };
}

// ─────────────────────────────────────
// Ricavi
// ─────────────────────────────────────

// Aggiunge una prenotazione al gruppo con quella chiave.
function accumula(gruppi, chiave, intestazione, prenotazione) {
  const gruppo = gruppi.get(chiave) ?? { ...intestazione, prenotazioni: 0, notti: 0, valore: 0 };
  gruppo.prenotazioni += 1;
  gruppo.notti += prenotazione.notti;
  gruppo.valore += centesimi(prenotazione.totale);
  gruppi.set(chiave, gruppo);
}

function inEuroDalPiuAlto(gruppi) {
  return [...gruppi.values()]
    .map((gruppo) => ({ ...gruppo, valore: euro(gruppo.valore) }))
    .sort((a, b) => b.valore - a.valore);
}

/** Totale, per camera e per tipologia dei soggiorni arrivati nel periodo. */
async function ricavi(query) {
  const { dal, al } = periodo(query);
  const soggiorni = await analyticsRepo.trovaSoggiorniArrivati(dal, al);

  const perCamera = new Map();
  const perTipologia = new Map();
  let totale = 0;
  for (const prenotazione of soggiorni) {
    const camera = prenotazione.camera;
    totale += centesimi(prenotazione.totale);
    accumula(perCamera, camera.id, { camera_id: camera.id, numero: camera.numero }, prenotazione);
    accumula(
      perTipologia,
      camera.tipologia.id,
      { tipologia_id: camera.tipologia.id, nome: camera.tipologia.nome },
      prenotazione,
    );
  }

  return {
    dal,
    al,
    totale: euro(totale),
    per_camera: inEuroDalPiuAlto(perCamera),
    per_tipologia: inEuroDalPiuAlto(perTipologia),
  };
}

/** Incassi netti per mese e metodo (cassa, rimborsi sottratti). */
async function incassi(query) {
  return await analyticsRepo.trovaIncassiMensili(annoDa(query));
}

/** Riepilogo mensile per la dichiarazione dell'imposta di soggiorno. */
async function tassaSoggiorno(query) {
  return await analyticsRepo.trovaTassaSoggiornoMensile(annoDa(query));
}

// ─────────────────────────────────────
// Canali
// ─────────────────────────────────────

const NON_VENDUTE = ['cancellata', 'no_show'];

/** Prenotazioni create nel periodo per canale: volume, valore, cancellazioni, anticipo. */
async function canali(query) {
  const { dal, al } = periodo(query);
  const prenotazioni = await analyticsRepo.trovaPrenotazioniCreate(dal, al);

  const perCanale = new Map();
  for (const prenotazione of prenotazioni) {
    const canale = perCanale.get(prenotazione.canale) ?? [];
    canale.push(prenotazione);
    perCanale.set(prenotazione.canale, canale);
  }

  return [...perCanale.entries()]
    .map(([canale, righe]) => {
      const vendute = righe.filter((riga) => !NON_VENDUTE.includes(riga.stato));
      const creataIl = (riga) => riga.creato_il.toISOString().slice(0, 10);
      return {
        canale,
        prenotazioni: righe.length,
        cancellate: righe.filter((riga) => riga.stato === 'cancellata').length,
        no_show: righe.filter((riga) => riga.stato === 'no_show').length,
        notti: vendute.reduce((totale, riga) => totale + riga.notti, 0),
        valore: euro(vendute.reduce((totale, riga) => totale + centesimi(riga.totale), 0)),
        durata_media: media(righe.map((riga) => riga.notti)),
        anticipo_medio_giorni: media(
          righe.map((riga) => contaNotti(creataIl(riga), riga.data_arrivo)),
        ),
      };
    })
    .sort((a, b) => b.valore - a.valore);
}

// ─────────────────────────────────────
// Cruscotto
// ─────────────────────────────────────

/** Numeri di oggi per la home dell'admin. */
async function cruscotto() {
  const giorno = oggi();
  const inizioMese = `${giorno.slice(0, 7)}-01`;

  const inCasa = await analyticsRepo.contaPrenotazioni({ stato: 'in_soggiorno' });
  const camere = await analyticsRepo.contaCamereVendibili();
  return {
    arrivi_oggi: await analyticsRepo.contaPrenotazioni({
      stato: 'confermata',
      data_arrivo: giorno,
    }),
    partenze_oggi: await analyticsRepo.contaPrenotazioni({
      stato: 'in_soggiorno',
      data_partenza: giorno,
    }),
    in_casa: inCasa,
    camere,
    occupazione_oggi: percentuale(inCasa, camere),
    da_confermare: await analyticsRepo.contaPrenotazioni({ stato: 'in_attesa' }),
    manutenzioni_aperte: await analyticsRepo.contaManutenzioniAperte(),
    recensioni_da_moderare: await analyticsRepo.contaRecensioniDaModerare(),
    incassato_mese: await analyticsRepo.sommaIncassatoDal(inizioMese),
    prenotato_da_inizio_mese: await analyticsRepo.sommaPrenotatoDal(inizioMese),
  };
}

// ─────────────────────────────────────
// Suggerimenti di prezzo
// ─────────────────────────────────────

function eventiDelGiorno(eventi, giorno) {
  return eventi.filter((evento) => evento.data_inizio <= giorno && evento.data_fine >= giorno);
}

/**
 * Per ogni giorno futuro: occupazione già venduta, eventi in zona e
 * percentuale suggerita con i motivi. Con tipologia_id anche il prezzo
 * suggerito partendo dal prezzo base.
 * query: { dal, al, tipologia_id? }
 */
async function suggerimentiPrezzo(query = {}) {
  const dal = query.dal ?? oggi();
  const al = query.al ?? aggiungiGiorni(dal, 30);
  periodo({ dal, al }, GIORNI_SUGGERIMENTO_MAX);

  let prezzoBase = null;
  if (query.tipologia_id) {
    const tipologia = await camereRepo.trovaTipologiaSemplice(query.tipologia_id);
    if (!tipologia) {
      throw nonTrovato('TIPOLOGIA_NON_TROVATA', 'Tipologia non trovata');
    }
    prezzoBase = centesimi(tipologia.prezzo_base);
  }

  const giorni = await analyticsRepo.trovaOccupazioneGiornaliera(dal, al);
  const eventi = await contenutiRepo.trovaEventi({ dal, al });

  return giorni.map((riga) => {
    const giorno = String(riga.giorno).slice(0, 10);
    const suggerimento = suggerimentoPrezzo({
      occupazione_percentuale: riga.occupazione_percentuale,
      giorni_mancanti: contaNotti(oggi(), giorno),
      eventi: eventiDelGiorno(eventi, giorno),
    });
    return {
      giorno,
      occupazione_percentuale: Number(riga.occupazione_percentuale),
      ...suggerimento,
      prezzo_suggerito:
        prezzoBase === null
          ? null
          : euro(prezzoBase + percentualeDi(prezzoBase, suggerimento.percentuale)),
    };
  });
}

// ─────────────────────────────────────
// Report PDF
// ─────────────────────────────────────

async function reportPdf(query) {
  const datiOccupazione = await occupazione(query);
  const datiRicavi = await ricavi(query);
  const nomeStruttura = await impostazioni.leggi('struttura_nome');
  return await creaPdf(documentoReport(datiOccupazione, datiRicavi, nomeStruttura));
}

module.exports = {
  occupazione,
  ricavi,
  incassi,
  tassaSoggiorno,
  canali,
  cruscotto,
  suggerimentiPrezzo,
  reportPdf,
};
