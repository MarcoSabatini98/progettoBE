// Chat di assistenza (clienti e visitatori ↔ staff con chat.assistenza) e chat
// interna dello staff (chi parla con chi lo decide regole_chat, controllato dal DB).
// Il socket si iscrive a `eventi` per consegnare i messaggi in tempo reale.
//
// `chi` è chi sta agendo: { utenteId, ruolo } oppure { visitatoreId }.

const { EventEmitter } = require('node:events');
const { Op } = require('sequelize');
const {
  Conversazione,
  ConversazionePartecipante,
  Messaggio,
  MessaggioAllegato,
  ChatRiepilogoEmail,
  Utente,
  Visitatore,
  sequelize,
} = require('../models');
const config = require('../config/env');
const logger = require('../config/logger');
const { oppure404, vietato, richiestaNonValida } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const file = require('../utils/file');
const permessi = require('./permessi.service');
const impostazioni = require('./impostazioni.service');
const email = require('./email.service');
const { seleziona } = require('./sql');

/** 'messaggio' → { conversazione, messaggio } · 'letto' → { conversazione, chi, il } */
const eventi = new EventEmitter();

const EPOCA = "'1970-01-01'";
const persona = (as) => ({ model: Utente, as, attributes: ['id', 'nome', 'cognome', 'ruolo'] });
const includeMessaggio = [
  persona('mittente_utente'),
  { model: Visitatore, as: 'mittente_visitatore', attributes: ['id', 'nome'] },
  { model: MessaggioAllegato, as: 'allegati' },
];

const eCliente = (chi) => Boolean(chi.visitatoreId) || chi.ruolo === 'cliente';

// --- accesso -----------------------------------------------------------------------

const trova = async (uuid, transaction) =>
  oppure404(
    await Conversazione.findOne({ where: { uuid }, transaction }),
    'CONVERSAZIONE_NON_TROVATA',
    'Conversazione non trovata',
  );

const partecipante = (conversazioneId, utenteId, transaction) =>
  ConversazionePartecipante.findOne({
    where: { conversazione_id: conversazioneId, utente_id: utenteId, uscito_il: null },
    transaction,
  });

/**
 * Verifica che `chi` possa stare nella conversazione.
 * @returns {Promise<'cliente'|'staff'>} il lato da cui partecipa
 */
async function lato(conv, chi) {
  if (conv.tipo === 'assistenza') {
    if (chi.visitatoreId && chi.visitatoreId === conv.visitatore_id) return 'cliente';
    if (chi.utenteId && chi.utenteId === conv.cliente_id) return 'cliente';
    if (chi.utenteId && (await permessi.ha(chi.ruolo, 'chat.assistenza'))) return 'staff';
  } else if (chi.utenteId && (await partecipante(conv.id, chi.utenteId))) {
    return 'staff';
  }
  throw vietato('CONVERSAZIONE_NON_ACCESSIBILE', 'Non partecipi a questa conversazione');
}

// --- elenco ----------------------------------------------------------------------------

/** Sottoquery: messaggi non letti da `chi` e anteprima dell'ultimo. */
function attributiExtra(chi) {
  const id = Number(chi.utenteId ?? chi.visitatoreId);
  const altrui = chi.visitatoreId
    ? `(m.mittente_visitatore_id IS NULL OR m.mittente_visitatore_id <> ${id})`
    : `(m.mittente_utente_id IS NULL OR m.mittente_utente_id <> ${id})`;
  const letto = eCliente(chi)
    ? 'conversazioni.letto_cliente_il'
    : `(SELECT COALESCE(p.letto_fino_al, p.entrato_il) FROM conversazioni_partecipanti p
         WHERE p.conversazione_id = conversazioni.id AND p.utente_id = ${id})`;
  return [
    [
      sequelize.literal(`(SELECT COUNT(*) FROM messaggi m
        WHERE m.conversazione_id = conversazioni.id AND m.eliminato_il IS NULL AND ${altrui}
          AND m.inviato_il > COALESCE(${letto}, ${EPOCA}))`),
      'non_letti',
    ],
    [
      sequelize.literal(`(SELECT LEFT(m.testo, 120) FROM messaggi m
        WHERE m.conversazione_id = conversazioni.id AND m.eliminato_il IS NULL
        ORDER BY m.id DESC LIMIT 1)`),
      'anteprima',
    ],
  ];
}

/**
 * Conversazioni visibili a `chi`.
 * Staff: query.tipo = 'staff' (default) | 'assistenza'; per l'assistenza
 * query.assegnate = 'mie' | 'libere'; query.stato = 'aperta' | 'chiusa'.
 */
async function elenco(chi, query = {}) {
  const p = pagina(query);
  const where = {};
  const include = [persona('operatore'), persona('cliente')];

  if (chi.visitatoreId)
    Object.assign(where, { tipo: 'assistenza', visitatore_id: chi.visitatoreId });
  else if (chi.ruolo === 'cliente')
    Object.assign(where, { tipo: 'assistenza', cliente_id: chi.utenteId });
  else if (query.tipo === 'assistenza') {
    if (!(await permessi.ha(chi.ruolo, 'chat.assistenza')))
      throw vietato('PERMESSO_NEGATO', 'Non gestisci la chat di assistenza');
    where.tipo = 'assistenza';
    if (query.assegnate === 'mie') where.assegnata_a = chi.utenteId;
    if (query.assegnate === 'libere') where.assegnata_a = null;
    include.push({ model: Visitatore, as: 'visitatore', attributes: ['id', 'nome', 'email'] });
  } else {
    where.tipo = 'staff';
    include.push({
      model: Utente,
      as: 'partecipanti',
      where: { id: chi.utenteId },
      through: { where: { uscito_il: null }, attributes: [] },
      attributes: [],
    });
  }
  if (query.stato) where.stato = query.stato;

  const righe = await Conversazione.findAndCountAll({
    where,
    include,
    attributes: { include: attributiExtra(chi) },
    order: [[sequelize.literal('COALESCE(ultimo_messaggio_il, conversazioni.creato_il)'), 'DESC']],
    limit: p.limit,
    offset: p.offset,
    distinct: true,
  });
  return risultato(righe, p);
}

async function dettaglio(uuid, chi) {
  const conv = await trova(uuid);
  await lato(conv, chi);
  return Conversazione.findByPk(conv.id, {
    include: [
      persona('operatore'),
      persona('cliente'),
      { model: Visitatore, as: 'visitatore', attributes: ['id', 'nome', 'email'] },
      {
        model: Utente,
        as: 'partecipanti',
        attributes: ['id', 'nome', 'cognome', 'ruolo'],
        through: { attributes: ['entrato_il', 'uscito_il', 'letto_fino_al'] },
      },
    ],
    attributes: { include: attributiExtra(chi) },
  });
}

/**
 * Contatori per i badge. Assistenza: non letti delle mie + conversazioni libere.
 * ponytail: somma sulle prime 100 conversazioni aperte, basta per una struttura.
 */
async function totaleNonLetti(chi) {
  const somma = async (query) =>
    (await elenco(chi, { ...query, stato: 'aperta', perPagina: 100 })).elementi.reduce(
      (s, c) => s + Number(c.get('non_letti')),
      0,
    );
  if (eCliente(chi)) return { assistenza: await somma({}), staff: 0, libere: 0 };
  const assistenza = await permessi.ha(chi.ruolo, 'chat.assistenza');
  return {
    staff: await somma({ tipo: 'staff' }),
    assistenza: assistenza ? await somma({ tipo: 'assistenza', assegnate: 'mie' }) : 0,
    libere: assistenza
      ? await Conversazione.count({
          where: { tipo: 'assistenza', stato: 'aperta', assegnata_a: null },
        })
      : 0,
  };
}

// --- messaggi ---------------------------------------------------------------------------

/** Storico a ritroso: `prima_di` = id dell'ultimo messaggio già caricato. */
async function messaggi(uuid, chi, { prima_di, limite = 50 } = {}) {
  const conv = await trova(uuid);
  await lato(conv, chi);
  const where = { conversazione_id: conv.id };
  if (prima_di) where.id = { [Op.lt]: prima_di };
  const righe = await Messaggio.findAll({
    where,
    include: includeMessaggio,
    order: [['id', 'DESC']],
    limit: Math.min(Number(limite) || 50, 100),
  });
  return righe.reverse();
}

/**
 * Nuovo messaggio. Lo staff che risponde all'assistenza entra tra i
 * partecipanti e, se la conversazione è libera, se la prende.
 * @param {{ testo: string, risposta_a_id?: number }} dati
 * @param {{ path: string, originalname: string, mimetype: string, size: number }[]} [caricati] file di multer
 */
async function invia(uuid, chi, dati, caricati = []) {
  const testo = String(dati.testo ?? '').trim();
  if (!testo && !caricati.length)
    throw richiestaNonValida('MESSAGGIO_VUOTO', 'Scrivi un messaggio o allega un file');

  const conv = await trova(uuid);
  const mioLato = await lato(conv, chi);

  const id = await sequelize.transaction(async (transaction) => {
    if (conv.tipo === 'assistenza' && mioLato === 'staff') {
      await ConversazionePartecipante.findOrCreate({
        where: { conversazione_id: conv.id, utente_id: chi.utenteId },
        transaction,
      });
      if (!conv.assegnata_a) await conv.update({ assegnata_a: chi.utenteId }, { transaction });
    }
    const m = await Messaggio.create(
      {
        conversazione_id: conv.id,
        mittente_utente_id: chi.utenteId ?? null,
        mittente_visitatore_id: chi.visitatoreId ?? null,
        risposta_a_id: dati.risposta_a_id ?? null,
        testo: testo || '📎',
      },
      { transaction },
    );
    if (caricati.length)
      await MessaggioAllegato.bulkCreate(
        caricati.map((f) => ({
          messaggio_id: m.id,
          nome_originale: f.originalname.slice(0, 255),
          percorso: file.percorsoRelativo(f.path),
          tipo_mime: f.mimetype,
          dimensione: f.size,
        })),
        { transaction },
      );
    return m.id;
  });

  await segnaLetto(uuid, chi);
  const messaggio = await Messaggio.findByPk(id, { include: includeMessaggio });
  eventi.emit('messaggio', { conversazione: await trova(uuid), messaggio: messaggio.toJSON() });
  return messaggio;
}

async function proprio(id, chi) {
  const m = oppure404(
    await Messaggio.findByPk(id),
    'MESSAGGIO_NON_TROVATO',
    'Messaggio non trovato',
  );
  const mio = chi.visitatoreId
    ? m.mittente_visitatore_id === chi.visitatoreId
    : m.mittente_utente_id === chi.utenteId;
  if (!mio) throw vietato('MESSAGGIO_ALTRUI', 'Puoi modificare solo i tuoi messaggi');
  return m;
}

async function modificaMessaggio(id, chi, testo) {
  const m = await proprio(id, chi);
  if (!String(testo ?? '').trim())
    throw richiestaNonValida('MESSAGGIO_VUOTO', 'Il messaggio è vuoto');
  await m.update({ testo: testo.trim(), modificato_il: new Date() });
  return Messaggio.findByPk(id, { include: includeMessaggio });
}

async function eliminaMessaggio(id, chi) {
  await (await proprio(id, chi)).destroy();
}

/** File allegato, dopo il controllo di accesso alla conversazione. */
async function allegato(id, chi) {
  const a = oppure404(
    await MessaggioAllegato.findByPk(id, {
      include: [
        {
          model: Messaggio,
          as: 'messaggio',
          include: [{ model: Conversazione, as: 'conversazione' }],
        },
      ],
    }),
    'ALLEGATO_NON_TROVATO',
    'Allegato non trovato',
  );
  await lato(a.messaggio.conversazione, chi);
  return { percorso: file.percorsoAssoluto(a.percorso), nome: a.nome_originale, tipo: a.tipo_mime };
}

async function segnaLetto(uuid, chi) {
  const conv = await trova(uuid);
  const mioLato = await lato(conv, chi);
  const il = new Date();
  if (mioLato === 'cliente') await conv.update({ letto_cliente_il: il });
  else
    await ConversazionePartecipante.update(
      { letto_fino_al: il },
      { where: { conversazione_id: conv.id, utente_id: chi.utenteId } },
    );
  eventi.emit('letto', { conversazione: conv.toJSON(), chi, il });
}

// --- apertura e gestione ----------------------------------------------------------------

/**
 * Cliente o visitatore chiede assistenza. Una sola conversazione aperta per
 * interlocutore: se c'è già, il messaggio va lì.
 */
async function apriAssistenza(chi, { testo, titolo, prenotazione_id }) {
  if (!eCliente(chi))
    throw richiestaNonValida('SOLO_CLIENTI', 'L’assistenza è per clienti e visitatori');
  const interlocutore = chi.visitatoreId
    ? { visitatore_id: chi.visitatoreId }
    : { cliente_id: chi.utenteId };
  const [conv] = await Conversazione.findOrCreate({
    where: { tipo: 'assistenza', stato: 'aperta', ...interlocutore },
    defaults: {
      titolo: titolo ?? null,
      prenotazione_id: prenotazione_id ?? null,
      creata_da: chi.utenteId ?? null,
    },
  });
  await invia(conv.uuid, chi, { testo });
  return dettaglio(conv.uuid, chi);
}

/**
 * Chat interna. Con un solo destinatario riapre la conversazione a due già
 * esistente. Il DB rifiuta i ruoli che non possono parlarsi (CHAT_NON_CONSENTITA).
 */
async function apriStaff(chi, { partecipanti, titolo, testo }) {
  const altri = [...new Set(partecipanti.map(Number))].filter((id) => id !== chi.utenteId);
  if (!altri.length) throw richiestaNonValida('PARTECIPANTI_MANCANTI', 'Scegli con chi parlare');

  if (altri.length === 1) {
    const [esistente] = await seleziona(
      `SELECT c.uuid FROM conversazioni c
         JOIN conversazioni_partecipanti a ON a.conversazione_id = c.id AND a.utente_id = ? AND a.uscito_il IS NULL
         JOIN conversazioni_partecipanti b ON b.conversazione_id = c.id AND b.utente_id = ? AND b.uscito_il IS NULL
        WHERE c.tipo = 'staff'
          AND (SELECT COUNT(*) FROM conversazioni_partecipanti x
                WHERE x.conversazione_id = c.id AND x.uscito_il IS NULL) = 2
        LIMIT 1`,
      [chi.utenteId, altri[0]],
    );
    if (esistente) {
      if (testo) await invia(esistente.uuid, chi, { testo });
      return dettaglio(esistente.uuid, chi);
    }
  }

  const conv = await sequelize.transaction(async (transaction) => {
    const c = await Conversazione.create(
      { tipo: 'staff', titolo: titolo ?? null, creata_da: chi.utenteId },
      { transaction },
    );
    // uno alla volta: il trigger confronta ogni nuovo ingresso con chi è già dentro
    for (const utente_id of [chi.utenteId, ...altri])
      await ConversazionePartecipante.create(
        { conversazione_id: c.id, utente_id },
        { transaction },
      );
    return c;
  });
  if (testo) await invia(conv.uuid, chi, { testo });
  return dettaglio(conv.uuid, chi);
}

async function aggiungiPartecipante(uuid, chi, utenteId) {
  const conv = await trova(uuid);
  if (conv.tipo !== 'staff') throw richiestaNonValida('SOLO_CHAT_STAFF', 'Solo nella chat interna');
  await lato(conv, chi);
  const [p, nuovo] = await ConversazionePartecipante.findOrCreate({
    where: { conversazione_id: conv.id, utente_id: utenteId },
  });
  if (!nuovo && p.uscito_il) {
    // rientro: il trigger vale solo sull'insert, quindi si ricrea la riga
    await p.destroy();
    await ConversazionePartecipante.create({ conversazione_id: conv.id, utente_id: utenteId });
  }
  return dettaglio(uuid, chi);
}

async function esci(uuid, chi) {
  const conv = await trova(uuid);
  if (conv.tipo !== 'staff') throw richiestaNonValida('SOLO_CHAT_STAFF', 'Solo nella chat interna');
  await ConversazionePartecipante.update(
    { uscito_il: new Date() },
    { where: { conversazione_id: conv.id, utente_id: chi.utenteId } },
  );
}

/** Assistenza: presa in carico / passaggio a un collega. */
async function assegna(uuid, chi, utenteId) {
  const conv = await trova(uuid);
  if (conv.tipo !== 'assistenza' || (await lato(conv, chi)) !== 'staff')
    throw vietato('PERMESSO_NEGATO', 'Non gestisci questa conversazione');
  if (utenteId && !(await permessi.ha((await Utente.findByPk(utenteId))?.ruolo, 'chat.assistenza')))
    throw richiestaNonValida('OPERATORE_NON_VALIDO', 'Il collega non gestisce l’assistenza');
  await conv.update({ assegnata_a: utenteId ?? null });
  return dettaglio(uuid, chi);
}

/** Chiude (o riapre) la conversazione. Un nuovo messaggio la riapre comunque. */
async function impostaStato(uuid, chi, stato) {
  const conv = await trova(uuid);
  await lato(conv, chi);
  await conv.update({ stato });
  return dettaglio(uuid, chi);
}

// --- job ------------------------------------------------------------------------------

/**
 * Email di riepilogo a chi ha messaggi non letti da più di 5 minuti, al massimo
 * una ogni `chat_riepilogo_email_minuti` per conversazione. Visitatori esclusi
 * (non hanno account). ponytail: 5 minuti di tolleranza fissi per chi sta chattando.
 */
async function inviaRiepiloghi() {
  const minuti = Number(await impostazioni.leggi('chat_riepilogo_email_minuti', 60));
  const righe = await seleziona(
    `SELECT c.id AS conversazione_id, c.uuid, c.tipo, COALESCE(c.titolo, 'Assistenza') AS titolo,
            u.id AS utente_id, u.email, u.nome, u.lingua, u.ruolo, COUNT(m.id) AS numero
       FROM (SELECT id AS conv, cliente_id AS utente, letto_cliente_il AS letto
               FROM conversazioni WHERE tipo = 'assistenza' AND cliente_id IS NOT NULL
             UNION ALL
             SELECT conversazione_id, utente_id, COALESCE(letto_fino_al, entrato_il)
               FROM conversazioni_partecipanti WHERE uscito_il IS NULL) d
       JOIN conversazioni c ON c.id = d.conv
       JOIN utenti u ON u.id = d.utente AND u.attivo AND u.notifiche_email AND u.eliminato_il IS NULL
       LEFT JOIN chat_riepiloghi_email r ON r.conversazione_id = d.conv AND r.utente_id = d.utente
       JOIN messaggi m ON m.conversazione_id = d.conv AND m.eliminato_il IS NULL AND NOT m.di_sistema
            AND (m.mittente_utente_id IS NULL OR m.mittente_utente_id <> d.utente)
            AND m.inviato_il > COALESCE(d.letto, ${EPOCA})
            AND m.inviato_il > COALESCE(r.inviato_il, ${EPOCA})
      WHERE COALESCE(r.inviato_il, ${EPOCA}) < UTC_TIMESTAMP() - INTERVAL ? MINUTE
      GROUP BY c.id, c.uuid, c.tipo, c.titolo, u.id, u.email, u.nome, u.lingua, u.ruolo
     HAVING MIN(m.inviato_il) < UTC_TIMESTAMP() - INTERVAL 5 MINUTE`,
    [minuti],
  );

  for (const r of righe) {
    const area = r.ruolo === 'cliente' ? 'area-personale/chat' : 'staff/chat';
    await email.invia({
      a: r.email,
      modello: 'chat_non_letti',
      lingua: r.lingua,
      dati: {
        nome: r.nome,
        numero: r.numero,
        titolo: r.titolo,
        link: `${config.urlFrontend}/${area}/${r.uuid}`,
      },
    });
    await ChatRiepilogoEmail.upsert({
      conversazione_id: r.conversazione_id,
      utente_id: r.utente_id,
      inviato_il: new Date(),
    });
  }
  return { inviati: righe.length };
}

/** Elimina le conversazioni chiuse ferme da più di `chat_conservazione_giorni` (con i file). */
async function eliminaVecchie() {
  const giorni = Number(await impostazioni.leggi('chat_conservazione_giorni', 365));
  const vecchie = await seleziona(
    `SELECT id FROM conversazioni
      WHERE stato = 'chiusa'
        AND COALESCE(ultimo_messaggio_il, creato_il) < UTC_TIMESTAMP() - INTERVAL ? DAY`,
    [giorni],
  );
  if (!vecchie.length) return { eliminate: 0 };
  const ids = vecchie.map((c) => c.id);
  const allegati = await MessaggioAllegato.findAll({
    include: [
      { model: Messaggio, as: 'messaggio', where: { conversazione_id: ids }, paranoid: false },
    ],
    attributes: ['percorso'],
  });
  // messaggi, partecipanti e riepiloghi vanno via in cascata
  await Conversazione.destroy({ where: { id: ids } });
  for (const a of allegati) await file.elimina(a.percorso);
  logger.info('Conversazioni eliminate per conservazione', { numero: ids.length });
  return { eliminate: ids.length };
}

module.exports = {
  eventi,
  lato,
  elenco,
  dettaglio,
  totaleNonLetti,
  messaggi,
  invia,
  modificaMessaggio,
  eliminaMessaggio,
  allegato,
  segnaLetto,
  apriAssistenza,
  apriStaff,
  aggiungiPartecipante,
  esci,
  assegna,
  impostaStato,
  inviaRiepiloghi,
  eliminaVecchie,
};
