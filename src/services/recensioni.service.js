// Recensioni verificate: solo chi ha concluso un soggiorno (lo impone il DB),
// una per prenotazione. Escono sul sito dopo la moderazione.

const { Op } = require('sequelize');
const { Recensione, Prenotazione, Ospite, Utente } = require('../models');
const { oppure404, richiestaNonValida, conflitto } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { seleziona } = require('./sql');
const prenotazioni = require('./prenotazioni.service');
const notifiche = require('./notifiche.service');

const VOTI = [
  'voto',
  'voto_pulizia',
  'voto_personale',
  'voto_posizione',
  'voto_comfort',
  'voto_qualita_prezzo',
];
const CAMPI = [...VOTI, 'titolo', 'commento', 'lingua', 'anonima'];

const trova = async (id) =>
  oppure404(
    await Recensione.findByPk(id, {
      include: [
        { model: Ospite, as: 'ospite', attributes: ['id', 'nome', 'cognome', 'paese'] },
        {
          model: Prenotazione,
          as: 'prenotazione',
          attributes: ['id', 'codice', 'data_arrivo', 'data_partenza'],
        },
        { model: Utente, as: 'moderatore', attributes: ['id', 'nome', 'cognome'] },
      ],
    }),
    'RECENSIONE_NON_TROVATA',
    'Recensione non trovata',
  );

// --- pubblico ----------------------------------------------------------------------

/** "Mario R." oppure "Ospite" se anonima. */
const firma = (r) =>
  r.anonima || !r.ospite ? null : `${r.ospite.nome} ${r.ospite.cognome.charAt(0)}.`;

async function pubbliche(query = {}) {
  const p = pagina(query);
  const where = { stato: 'pubblicata' };
  if (query.lingua) where.lingua = query.lingua;
  const righe = await Recensione.findAndCountAll({
    where,
    include: [{ model: Ospite, as: 'ospite', attributes: ['nome', 'cognome', 'paese'] }],
    order: [['creato_il', 'DESC']],
    limit: p.limit,
    offset: p.offset,
  });
  const esito = risultato(righe, p);
  esito.elementi = esito.elementi.map((r) => ({
    id: r.id,
    ...Object.fromEntries(VOTI.map((v) => [v, r[v]])),
    titolo: r.titolo,
    commento: r.commento,
    lingua: r.lingua,
    autore: firma(r),
    paese: r.anonima ? null : (r.ospite?.paese ?? null),
    risposta: r.risposta,
    risposta_il: r.risposta_il,
    creato_il: r.creato_il,
  }));
  return esito;
}

async function valutazioni() {
  const [riga] = await seleziona('SELECT * FROM v_valutazioni');
  return riga;
}

// --- cliente ----------------------------------------------------------------------------

async function scrivi(prenotazioneId, utenteId, dati) {
  if (await Recensione.findOne({ where: { prenotazione_id: prenotazioneId } }))
    throw conflitto('RECENSIONE_GIA_PRESENTE', 'Hai già recensito questo soggiorno');
  const campi = Object.fromEntries(
    CAMPI.filter((c) => dati[c] !== undefined).map((c) => [c, dati[c]]),
  );
  // ospite_id lo imposta il trigger dalla prenotazione
  const r = await Recensione.create({
    ...campi,
    prenotazione_id: prenotazioneId,
    utente_id: utenteId,
  });
  notifiche.aChiPuo('recensioni.modera', {
    tipo: 'recensione',
    priorita: r.voto <= 2 ? 'avviso' : 'info',
    titolo: `Nuova recensione: ${r.voto}/5`,
    testo: r.titolo,
    link: `/staff/recensioni/${r.id}`,
  });
  return trova(r.id);
}

/** Cliente registrato, dalla sua area personale. */
async function crea(prenotazioneId, dati, contesto) {
  const p = await prenotazioni.mia(contesto.utenteId, prenotazioneId);
  if (p.stato !== 'conclusa')
    throw richiestaNonValida(
      'RECENSIONE_NON_CONSENTITA',
      'Puoi recensire solo un soggiorno concluso',
    );
  return scrivi(p.id, contesto.utenteId, dati);
}

/** Ospite senza account: codice prenotazione + email del titolare (link nell'email). */
async function creaDaCodice(codice, email, dati) {
  const p = await prenotazioni.perCodice(codice, email);
  if (p.stato !== 'conclusa')
    throw richiestaNonValida(
      'RECENSIONE_NON_CONSENTITA',
      'Puoi recensire solo un soggiorno concluso',
    );
  return scrivi(p.id, p.utente_id ?? null, dati);
}

// --- staff ------------------------------------------------------------------------------

async function elenco(query = {}) {
  const p = pagina(query);
  const where = {};
  if (query.stato) where.stato = query.stato;
  if (query.voto_max) where.voto = { [Op.lte]: Number(query.voto_max) };
  const righe = await Recensione.findAndCountAll({
    where,
    include: [
      { model: Ospite, as: 'ospite', attributes: ['id', 'nome', 'cognome'] },
      { model: Prenotazione, as: 'prenotazione', attributes: ['id', 'codice'] },
    ],
    order: [['creato_il', 'DESC']],
    limit: p.limit,
    offset: p.offset,
    distinct: true,
  });
  return risultato(righe, p);
}

const dettaglio = trova;

async function modera(id, stato, contesto) {
  if (!['pubblicata', 'rifiutata'].includes(stato))
    throw richiestaNonValida('STATO_NON_VALIDO', 'Stato ammesso: pubblicata o rifiutata');
  const r = await trova(id);
  await r.update({ stato, moderata_da: contesto.utenteId });
  return trova(id);
}

/** Risposta pubblica della struttura (stringa vuota = la toglie). */
async function rispondi(id, risposta, contesto) {
  const r = await trova(id);
  await r.update({ risposta: risposta || null, risposta_da: risposta ? contesto.utenteId : null });
  return trova(id);
}

module.exports = {
  pubbliche,
  valutazioni,
  crea,
  creaDaCodice,
  elenco,
  dettaglio,
  modera,
  rispondi,
};
