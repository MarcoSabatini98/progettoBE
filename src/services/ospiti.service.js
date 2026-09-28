// Anagrafiche degli ospiti (dati TULPS per Alloggiati Web) e ospiti di una
// prenotazione. Le anagrafiche collegate a un account cliente le modifica solo
// il cliente (vedi utenti.service): qui lo staff gestisce gli ospiti di passaggio.

const { Op } = require('sequelize');
const {
  Ospite,
  DocumentoOspite,
  Prenotazione,
  PrenotazioneOspite,
  Utente,
  transazione,
} = require('../models');
const { oppure404, vietato, richiestaNonValida } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { centesimi, euro } = require('../utils/denaro');
const { eta } = require('../utils/date');
const file = require('../utils/file');
const { crud } = require('./crud');
const tariffe = require('./tariffe.service');

const ospiti = crud(Ospite, {
  codice: 'OSPITE_NON_TROVATO',
  messaggio: 'Ospite non trovato',
  ordine: [
    ['cognome', 'ASC'],
    ['nome', 'ASC'],
  ],
  include: [{ model: DocumentoOspite, as: 'documenti' }],
});

// campi obbligatori per la schedina di Alloggiati Web
const CAMPI_ALLOGGIATI = [
  'nome',
  'cognome',
  'sesso',
  'data_nascita',
  'cittadinanza_codice',
  'stato_nascita_codice',
];
const CAMPI_DOCUMENTO = ['tipo_documento', 'numero_documento', 'luogo_rilascio_codice'];

/**
 * Campi mancanti per l'invio ad Alloggiati Web. Il documento serve solo al
 * capofamiglia/capogruppo/ospite singolo; per i nati in Italia serve il comune.
 */
function campiMancanti(ospite, tipoAlloggiato = 'ospite_singolo') {
  const richiesti = [...CAMPI_ALLOGGIATI];
  if (['ospite_singolo', 'capofamiglia', 'capogruppo'].includes(tipoAlloggiato))
    richiesti.push(...CAMPI_DOCUMENTO);
  if (ospite.stato_nascita_codice === '100000100')
    richiesti.push('comune_nascita_codice', 'provincia_nascita');
  return richiesti.filter((c) => !ospite[c]);
}

async function elenco(query) {
  const p = pagina(query);
  const where = {};
  if (query.cerca) {
    const testo = `%${query.cerca}%`;
    where[Op.or] = ['nome', 'cognome', 'email', 'numero_documento', 'codice_fiscale'].map((c) => ({
      [c]: { [Op.like]: testo },
    }));
  }
  return risultato(
    await Ospite.findAndCountAll({
      where,
      order: [
        ['cognome', 'ASC'],
        ['nome', 'ASC'],
      ],
      limit: p.limit,
      offset: p.offset,
    }),
    p,
  );
}

/** L'anagrafica di un cliente registrato non si tocca dallo staff. */
async function modificabile(id, transaction) {
  const ospite = await ospiti.dettaglio(id, { include: [], transaction });
  const proprietario = await Utente.findOne({
    where: { ospite_id: id },
    attributes: ['id'],
    transaction,
  });
  if (proprietario)
    throw vietato(
      'DATI_CLIENTE_PROTETTI',
      'I dati personali del cliente li modifica solo il cliente',
    );
  return ospite;
}

async function aggiorna(id, dati, contesto) {
  await modificabile(id);
  return ospiti.aggiorna(id, dati, contesto);
}

async function elimina(id) {
  const ospite = await modificabile(id);
  const soggiorni = await PrenotazioneOspite.count({ where: { ospite_id: id } });
  const titolare = await Prenotazione.count({ where: { ospite_id: id } });
  if (soggiorni || titolare) {
    throw richiestaNonValida(
      'OSPITE_CON_SOGGIORNI',
      'L’ospite ha soggiorni registrati: i dati vanno conservati',
    );
  }
  const documenti = await DocumentoOspite.findAll({ where: { ospite_id: id } });
  await ospite.destroy();
  await Promise.all(documenti.map((d) => file.elimina(d.percorso)));
}

/**
 * Riusa l'anagrafica se lo stesso documento è già registrato, altrimenti la crea.
 * Un'anagrafica di cliente registrato non viene sovrascritta.
 */
async function trovaOCrea(dati, transaction) {
  if (dati.id) return ospiti.dettaglio(dati.id, { include: [], transaction });
  const esistente =
    dati.tipo_documento && dati.numero_documento
      ? await Ospite.findOne({
          where: { tipo_documento: dati.tipo_documento, numero_documento: dati.numero_documento },
          transaction,
        })
      : null;
  if (!esistente) return ospiti.crea(dati, null, transaction);
  const protetto = await Utente.count({ where: { ospite_id: esistente.id }, transaction });
  if (!protetto)
    await esistente.update(
      Object.fromEntries(
        ospiti.campi.filter((c) => dati[c] !== undefined).map((c) => [c, dati[c]]),
      ),
      { transaction },
    );
  return esistente;
}

// --- documenti (staff) ---------------------------------------------------------------

async function aggiungiDocumento(ospiteId, caricato) {
  await ospiti.dettaglio(ospiteId, { include: [] }).catch(async (err) => {
    await file.elimina(file.percorsoRelativo(caricato.path));
    throw err;
  });
  return DocumentoOspite.create({
    ospite_id: ospiteId,
    nome_originale: caricato.originalname.slice(0, 255),
    percorso: file.percorsoRelativo(caricato.path),
    tipo_mime: caricato.mimetype,
    dimensione: caricato.size,
  });
}

async function documento(id) {
  return oppure404(
    await DocumentoOspite.findByPk(id),
    'DOCUMENTO_NON_TROVATO',
    'Documento non trovato',
  );
}

async function eliminaDocumento(id) {
  const doc = await documento(id);
  await doc.destroy();
  await file.elimina(doc.percorso);
}

// --- ospiti di una prenotazione ---------------------------------------------------------

async function diPrenotazione(prenotazioneId) {
  const p = oppure404(
    await Prenotazione.findByPk(prenotazioneId, {
      attributes: ['id', 'ospite_id', 'adulti', 'bambini'],
      include: [
        {
          model: Ospite,
          as: 'ospiti',
          through: { attributes: ['tipo_alloggiato', 'esente_tassa', 'motivo_esenzione'] },
        },
      ],
    }),
    'PRENOTAZIONE_NON_TROVATA',
    'Prenotazione non trovata',
  );
  return p.ospiti.map((o) => ({
    ...o.toJSON(),
    campi_mancanti: campiMancanti(o, o.prenotazioni_ospiti?.tipo_alloggiato),
  }));
}

/**
 * Tassa di soggiorno con gli ospiti reali: esenti per età o per motivo indicato.
 * @returns {number} importo in euro
 */
async function tassaEffettiva(prenotazione, righe, anagrafiche) {
  const tassa = await tariffe.tassaApplicabile(prenotazione.data_arrivo);
  if (!tassa) return 0;
  const tassabili = righe.filter((r, i) => {
    if (r.esente_tassa) return false;
    const nascita = anagrafiche[i].data_nascita;
    return !(
      tassa.eta_esenzione &&
      nascita &&
      eta(nascita, prenotazione.data_arrivo) < tassa.eta_esenzione
    );
  }).length;
  const notti = tassa.notti_max
    ? Math.min(prenotazione.notti, tassa.notti_max)
    : prenotazione.notti;
  return euro(centesimi(tassa.importo_notte) * notti * tassabili);
}

/**
 * Sostituisce gli ospiti del soggiorno.
 * @param {{ ospite: object, tipo_alloggiato?: string, esente_tassa?: boolean, motivo_esenzione?: string }[]} righe
 *   ospite = { id } per un'anagrafica esistente oppure i dati completi
 * Quando gli ospiti sono tutti registrati ricalcola la tassa di soggiorno.
 */
async function impostaDiPrenotazione(prenotazioneId, righe, contesto) {
  await transazione(contesto, async (t) => {
    const p = oppure404(
      await Prenotazione.findByPk(prenotazioneId, { transaction: t, lock: t.LOCK.UPDATE }),
      'PRENOTAZIONE_NON_TROVATA',
      'Prenotazione non trovata',
    );
    if (['cancellata', 'no_show'].includes(p.stato)) {
      throw richiestaNonValida('PRENOTAZIONE_CHIUSA', 'La prenotazione è cancellata');
    }
    if (righe.length > p.adulti + p.bambini) {
      throw richiestaNonValida(
        'TROPPI_OSPITI',
        `La prenotazione è per ${p.adulti + p.bambini} ospiti`,
      );
    }

    const anagrafiche = [];
    for (const r of righe) anagrafiche.push(await trovaOCrea(r.ospite, t));
    const ids = anagrafiche.map((o) => o.id);
    if (new Set(ids).size !== ids.length)
      throw richiestaNonValida('OSPITE_DUPLICATO', 'Lo stesso ospite è indicato due volte');

    await PrenotazioneOspite.destroy({ where: { prenotazione_id: p.id }, transaction: t });
    await PrenotazioneOspite.bulkCreate(
      righe.map((r, i) => ({
        prenotazione_id: p.id,
        ospite_id: ids[i],
        tipo_alloggiato:
          r.tipo_alloggiato ??
          (righe.length === 1 ? 'ospite_singolo' : i === 0 ? 'capofamiglia' : 'familiare'),
        esente_tassa: Boolean(r.esente_tassa),
        motivo_esenzione: r.motivo_esenzione ?? null,
      })),
      { transaction: t },
    );

    if (righe.length === p.adulti + p.bambini) {
      await p.update(
        { tassa_soggiorno: await tassaEffettiva(p, righe, anagrafiche) },
        { transaction: t },
      );
    }
  });
  return diPrenotazione(prenotazioneId);
}

module.exports = {
  ospiti,
  elenco,
  aggiorna,
  elimina,
  trovaOCrea,
  campiMancanti,
  aggiungiDocumento,
  documento,
  eliminaDocumento,
  diPrenotazione,
  impostaDiPrenotazione,
};
