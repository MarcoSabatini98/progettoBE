// src/services/camere.service.js
//
// Tipologie (ciò che il cliente prenota), camere fisiche e servizi
// (dotazioni incluse ed extra acquistabili).

const { sequelize } = require('../models');
const camereRepo = require('../repositories/camere.repository');
const contenuti = require('./contenuti.service');
const { nonTrovato, conflitto, richiestaNonValida } = require('../utils/errori');
const { applicaTraduzioni } = require('../utils/traduzioni');
const { tokenCasuale } = require('../utils/sicurezza');
const { slugDa } = require('../utils/slug');
const { contaNotti } = require('../utils/date');

// Campi che il client può scrivere.
function datiTipologia(dati) {
  return {
    nome: dati.nome,
    slug: dati.slug,
    descrizione: dati.descrizione,
    prezzo_base: dati.prezzo_base,
    ospiti_max: dati.ospiti_max,
    superficie_mq: dati.superficie_mq,
    letti: dati.letti,
    ordine: dati.ordine,
    attiva: dati.attiva,
  };
}

function datiCamera(dati) {
  return {
    numero: dati.numero,
    nome: dati.nome,
    tipologia_id: dati.tipologia_id,
    piano: dati.piano,
    ospiti_max: dati.ospiti_max,
    stato: dati.stato,
    descrizione: dati.descrizione,
    note: dati.note,
  };
}

function datiServizio(dati) {
  return {
    nome: dati.nome,
    descrizione: dati.descrizione,
    icona: dati.icona,
    tipo: dati.tipo,
    prezzo: dati.prezzo,
    calcolo_prezzo: dati.calcolo_prezzo,
    aliquota_iva: dati.aliquota_iva,
    ordine: dati.ordine,
    attivo: dati.attivo,
  };
}

// Tipologia per il sito: testi e dotazioni nella lingua del visitatore.
function tipologiaTradotta(tipologia) {
  const tradotta = applicaTraduzioni(tipologia);
  tradotta.servizi = tradotta.servizi.map(applicaTraduzioni);
  return tradotta;
}

// ─────────────────────────────────────
// Tipologie
// ─────────────────────────────────────

// Lo slug è l'indirizzo pubblico della tipologia (/tipologie/:slug): deve essere unico.
async function controllaSlugLibero(slug, id = null) {
  const esistente = await camereRepo.trovaTipologiaPerSlug(slug);
  if (esistente && esistente.id !== Number(id)) {
    throw conflitto('SLUG_GIA_USATO', `L'indirizzo "${slug}" è già usato da un'altra tipologia`);
  }
}

async function elencoTipologie(filtri) {
  return await camereRepo.trovaTipologie(filtri);
}

async function dettaglioTipologia(id) {
  const tipologia = await camereRepo.trovaTipologiaPerId(id);
  if (!tipologia) {
    throw nonTrovato('TIPOLOGIA_NON_TROVATA', 'Tipologia non trovata');
  }
  return tipologia;
}

async function tipologiePubbliche(lingua = 'it') {
  const tipologie = await camereRepo.trovaTipologiePubbliche(lingua);
  return tipologie.map(tipologiaTradotta);
}

/** Con le sue camere: ognuna con le sue foto. Le dotazioni sono quelle della tipologia. */
async function tipologiaPubblica(slug, lingua = 'it') {
  const [tipologia] = await camereRepo.trovaTipologiePubbliche(lingua, { slug });
  if (!tipologia) {
    throw nonTrovato('TIPOLOGIA_NON_TROVATA', 'Tipologia non trovata');
  }
  const camere = await camereRepo.trovaCamerePubbliche(tipologia.id, lingua);
  return {
    ...tipologiaTradotta(tipologia),
    camere: camere.map(applicaTraduzioni),
  };
}

/** dati.servizi = id delle dotazioni incluse. */
async function creaTipologia(dati) {
  const slug = dati.slug || slugDa(dati.nome);
  await controllaSlugLibero(slug);

  const id = await sequelize.transaction(async (transaction) => {
    const tipologia = await camereRepo.creaTipologia({ ...datiTipologia(dati), slug }, transaction);
    if (dati.servizi) {
      await camereRepo.impostaServiziTipologia(tipologia.id, dati.servizi, transaction);
    }
    return tipologia.id;
  });
  return dettaglioTipologia(id);
}

async function aggiornaTipologia(id, dati) {
  if (dati.slug) {
    await controllaSlugLibero(dati.slug, id);
  }

  await sequelize.transaction(async (transaction) => {
    const tipologia = await camereRepo.aggiornaTipologia(id, datiTipologia(dati), transaction);
    if (!tipologia) {
      throw nonTrovato('TIPOLOGIA_NON_TROVATA', 'Tipologia non trovata');
    }
    if (dati.servizi) {
      await camereRepo.impostaServiziTipologia(id, dati.servizi, transaction);
    }
  });
  return dettaglioTipologia(id);
}

async function eliminaTipologia(id) {
  await dettaglioTipologia(id);

  const camere = await camereRepo.contaCamereDiTipologia(id);
  if (camere > 0) {
    throw conflitto(
      'TIPOLOGIA_IN_USO',
      `Ci sono ${camere} camere di questa tipologia: spostale prima`,
    );
  }
  await camereRepo.eliminaTipologia(id);
  await contenuti.eliminaContenutiDi('tipologia_camera', id);
}

// ─────────────────────────────────────
// Camere
// ─────────────────────────────────────

async function elencoCamere(filtri) {
  return await camereRepo.trovaCamere(filtri);
}

async function dettaglioCamera(id) {
  const camera = await camereRepo.trovaCameraPerId(id);
  if (!camera) {
    throw nonTrovato('CAMERA_NON_TROVATA', 'Camera non trovata');
  }
  return camera;
}

/** Le dotazioni non si scelgono qui: la camera ha quelle della sua tipologia. */
async function creaCamera(dati) {
  const camera = await camereRepo.creaCamera({
    ...datiCamera(dati),
    token_ical: tokenCasuale(48),
  });
  return dettaglioCamera(camera.id);
}

/**
 * Le prenotazioni puntano alla camera, non alla tipologia: cambiarle tipologia
 * con soggiorni futuri cambierebbe ciò che i clienti hanno prenotato e pagato.
 */
async function controllaCambioTipologia(id, tipologiaId) {
  const camera = await camereRepo.trovaCameraConTipologia(id);
  if (!camera) {
    throw nonTrovato('CAMERA_NON_TROVATA', 'Camera non trovata');
  }
  if (camera.tipologia_id === Number(tipologiaId)) {
    return;
  }
  const future = await camereRepo.contaPrenotazioniFuture(id);
  if (future > 0) {
    throw conflitto(
      'CAMBIO_TIPOLOGIA_CON_PRENOTAZIONI',
      `La camera ${camera.numero} (${camera.tipologia.nome}) ha ${future} prenotazioni future: spostale prima di cambiarne la tipologia`,
    );
  }
}

async function aggiornaCamera(id, dati) {
  if (dati.tipologia_id !== undefined) {
    await controllaCambioTipologia(id, dati.tipologia_id);
  }

  const camera = await camereRepo.aggiornaCamera(id, datiCamera(dati));
  if (!camera) {
    throw nonTrovato('CAMERA_NON_TROVATA', 'Camera non trovata');
  }
  return dettaglioCamera(id);
}

/** Una camera con prenotazioni future non si elimina: va messa fuori servizio. */
async function eliminaCamera(id) {
  await dettaglioCamera(id);

  const future = await camereRepo.contaPrenotazioniFuture(id);
  if (future > 0) {
    throw conflitto(
      'CAMERA_CON_PRENOTAZIONI',
      `La camera ha ${future} prenotazioni future: spostale o cancellale prima`,
    );
  }
  await camereRepo.eliminaCamera(id);
  // La camera resta solo per lo storico delle prenotazioni e non si ripristina: foto e traduzioni non servono più.
  await contenuti.eliminaContenutiDi('camera', id);
}

/** Nuovo token del feed iCal, se il vecchio link è finito in mani sbagliate. */
async function rigeneraTokenIcal(id) {
  const camera = await camereRepo.aggiornaCamera(id, { token_ical: tokenCasuale(48) });
  if (!camera) {
    throw nonTrovato('CAMERA_NON_TROVATA', 'Camera non trovata');
  }
  return camera;
}

/** Situazione di oggi di ogni camera (cruscotto di reception e pulizie). */
async function statoCamere() {
  return await camereRepo.trovaStatoCamere();
}

/** Planning: camere con prenotazioni e chiusure tra dal (incluso) e al (escluso). */
async function planning(dal, al) {
  if (!dal || !al || al <= dal) {
    throw richiestaNonValida('DATE_NON_VALIDE', 'Indica un periodo valido');
  }
  if (contaNotti(dal, al) > 92) {
    throw richiestaNonValida('PERIODO_TROPPO_LUNGO', 'Il planning copre al massimo 3 mesi');
  }
  return await camereRepo.trovaPlanning(dal, al);
}

// ─────────────────────────────────────
// Servizi
// ─────────────────────────────────────

async function elencoServizi(filtri) {
  return await camereRepo.trovaServizi(filtri);
}

async function dettaglioServizio(id) {
  const servizio = await camereRepo.trovaServizioPerId(id);
  if (!servizio) {
    throw nonTrovato('SERVIZIO_NON_TROVATO', 'Servizio non trovato');
  }
  return servizio;
}

/** Extra acquistabili durante la prenotazione, per il sito. */
async function extraPubblici(lingua = 'it') {
  const servizi = await camereRepo.trovaExtraPubblici(lingua);
  return servizi.map(applicaTraduzioni);
}

async function creaServizio(dati) {
  const servizio = await camereRepo.creaServizio(datiServizio(dati));
  return dettaglioServizio(servizio.id);
}

async function aggiornaServizio(id, dati) {
  const servizio = await camereRepo.aggiornaServizio(id, datiServizio(dati));
  if (!servizio) {
    throw nonTrovato('SERVIZIO_NON_TROVATO', 'Servizio non trovato');
  }
  return dettaglioServizio(id);
}

async function eliminaServizio(id) {
  await dettaglioServizio(id);
  await camereRepo.eliminaServizio(id);
  await contenuti.eliminaContenutiDi('servizio', id);
}

module.exports = {
  elencoTipologie,
  dettaglioTipologia,
  tipologiePubbliche,
  tipologiaPubblica,
  creaTipologia,
  aggiornaTipologia,
  eliminaTipologia,
  elencoCamere,
  dettaglioCamera,
  creaCamera,
  aggiornaCamera,
  eliminaCamera,
  rigeneraTokenIcal,
  statoCamere,
  planning,
  elencoServizi,
  dettaglioServizio,
  extraPubblici,
  creaServizio,
  aggiornaServizio,
  eliminaServizio,
};
