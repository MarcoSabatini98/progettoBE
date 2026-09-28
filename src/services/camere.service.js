// Tipologie, camere e servizi (dotazioni ed extra acquistabili).

const { Op } = require('sequelize');
const {
  TipologiaCamera,
  Camera,
  Servizio,
  Media,
  TipologiaCameraServizio,
  CameraServizio,
  sequelize,
} = require('../models');
const { conflitto, oppure404 } = require('../utils/errori');
const { tokenCasuale } = require('../utils/sicurezza');
const { crud } = require('./crud');
const contenuti = require('./contenuti.service');

const ordineMedia = [[{ model: Media, as: 'media' }, 'ordine', 'ASC']];

const tipologie = crud(TipologiaCamera, {
  codice: 'TIPOLOGIA_NON_TROVATA',
  messaggio: 'Tipologia non trovata',
  ordine: [
    ['ordine', 'ASC'],
    ['nome', 'ASC'],
  ],
  include: [
    { model: Servizio, as: 'servizi', through: { attributes: [] } },
    { model: Media, as: 'media' },
  ],
});

const camere = crud(Camera, {
  codice: 'CAMERA_NON_TROVATA',
  messaggio: 'Camera non trovata',
  ordine: [['numero', 'ASC']],
  include: [
    {
      model: TipologiaCamera,
      as: 'tipologia',
      attributes: ['id', 'nome', 'slug', 'ospiti_max', 'prezzo_base'],
    },
    { model: Servizio, as: 'servizi', through: { attributes: [] } },
  ],
  campi: ['numero', 'nome', 'tipologia_id', 'piano', 'ospiti_max', 'stato', 'note'],
});

const servizi = crud(Servizio, {
  codice: 'SERVIZIO_NON_TROVATO',
  messaggio: 'Servizio non trovato',
  ordine: [
    ['tipo', 'ASC'],
    ['ordine', 'ASC'],
    ['nome', 'ASC'],
  ],
});

const slugDa = (testo) =>
  testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Sostituisce le righe della tabella ponte (dotazioni di tipologia o camera). */
async function impostaServizi(Ponte, chiave, id, servizioIds, transaction) {
  await Ponte.destroy({ where: { [chiave]: id }, transaction });
  if (servizioIds?.length) {
    await Ponte.bulkCreate(
      [...new Set(servizioIds)].map((servizio_id) => ({ [chiave]: id, servizio_id })),
      {
        transaction,
      },
    );
  }
}

// --- tipologie ----------------------------------------------------------------------

async function creaTipologia(dati, contesto) {
  const id = await sequelize.transaction(async (t) => {
    const nuova = await tipologie.crea(
      { ...dati, slug: dati.slug || slugDa(dati.nome) },
      contesto,
      t,
    );
    await impostaServizi(TipologiaCameraServizio, 'tipologia_id', nuova.id, dati.servizi, t);
    return nuova.id;
  });
  return tipologie.dettaglio(id);
}

async function aggiornaTipologia(id, dati, contesto) {
  await sequelize.transaction(async (t) => {
    await tipologie.aggiorna(id, dati, contesto, t);
    if (dati.servizi)
      await impostaServizi(TipologiaCameraServizio, 'tipologia_id', id, dati.servizi, t);
  });
  return tipologie.dettaglio(id);
}

async function eliminaTipologia(id) {
  const inUso = await Camera.count({ where: { tipologia_id: id } });
  if (inUso)
    throw conflitto(
      'TIPOLOGIA_IN_USO',
      `Ci sono ${inUso} camere di questa tipologia: spostale prima`,
    );
  await tipologie.elimina(id);
}

/** Tipologie per il sito: attive, tradotte, con dotazioni e immagini. */
async function tipologiePubbliche(lingua) {
  const righe = await TipologiaCamera.findAll({
    where: { attiva: true },
    include: [
      {
        model: Servizio,
        as: 'servizi',
        where: { attivo: true },
        required: false,
        through: { attributes: [] },
      },
      { model: Media, as: 'media' },
    ],
    order: [['ordine', 'ASC'], ...ordineMedia],
  });
  const tradotte = await contenuti.traduci('tipologia_camera', righe, lingua);
  for (const t of tradotte) t.servizi = await contenuti.traduci('servizio', t.servizi, lingua);
  return tradotte;
}

async function tipologiaPerSlug(slug, lingua) {
  const tipologia = (await tipologiePubbliche(lingua)).find((t) => t.slug === slug);
  return oppure404(tipologia, 'TIPOLOGIA_NON_TROVATA', 'Tipologia non trovata');
}

// --- camere ------------------------------------------------------------------------------

async function creaCamera(dati, contesto) {
  const id = await sequelize.transaction(async (t) => {
    const nuova = await camere.crea({ ...dati }, contesto, t);
    await nuova.update({ token_ical: tokenCasuale(48) }, { transaction: t });
    await impostaServizi(CameraServizio, 'camera_id', nuova.id, dati.servizi, t);
    return nuova.id;
  });
  return camere.dettaglio(id);
}

async function aggiornaCamera(id, dati, contesto) {
  await sequelize.transaction(async (t) => {
    await camere.aggiorna(id, dati, contesto, t);
    if (dati.servizi) await impostaServizi(CameraServizio, 'camera_id', id, dati.servizi, t);
  });
  return camere.dettaglio(id);
}

/** Una camera con prenotazioni future non si elimina: va messa fuori servizio. */
async function eliminaCamera(id) {
  const [{ future }] = await sequelize.query(
    `SELECT COUNT(*) AS future FROM prenotazioni
      WHERE camera_id = ? AND stato IN ('in_attesa','confermata','in_soggiorno') AND data_partenza > UTC_DATE()`,
    { replacements: [id], type: sequelize.QueryTypes.SELECT },
  );
  if (Number(future)) {
    throw conflitto(
      'CAMERA_CON_PRENOTAZIONI',
      `La camera ha ${future} prenotazioni future: spostale o cancellale prima`,
    );
  }
  await camere.elimina(id);
}

/** Nuovo token del feed iCal (se il link è finito in mani sbagliate). */
async function rigeneraTokenIcal(id) {
  const camera = await camere.dettaglio(id, { include: [] });
  return camera.update({ token_ical: tokenCasuale(48) });
}

/** Situazione di oggi (reception e pulizie). */
function statoCamere() {
  return sequelize.query('SELECT * FROM v_stato_camere ORDER BY numero', {
    type: sequelize.QueryTypes.SELECT,
  });
}

// --- servizi --------------------------------------------------------------------------------

/** Extra acquistabili durante la prenotazione. */
async function extraPubblici(lingua) {
  const righe = await Servizio.findAll({
    where: { tipo: 'extra', attivo: true, prezzo: { [Op.gte]: 0 } },
    include: [{ model: Media, as: 'media' }],
    order: [['ordine', 'ASC'], ...ordineMedia],
  });
  return contenuti.traduci('servizio', righe, lingua);
}

module.exports = {
  tipologie,
  camere,
  servizi,
  creaTipologia,
  aggiornaTipologia,
  eliminaTipologia,
  tipologiePubbliche,
  tipologiaPerSlug,
  creaCamera,
  aggiornaCamera,
  eliminaCamera,
  rigeneraTokenIcal,
  statoCamere,
  extraPubblici,
  slugDa,
};
