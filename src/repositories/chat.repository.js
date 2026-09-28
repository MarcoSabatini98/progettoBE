// src/repositories/chat.repository.js
//
// Conversazioni, partecipanti, messaggi, allegati e riepiloghi email.
// Il trigger sui messaggi aggiorna ultimo_messaggio_il e riapre la
// conversazione; quello sui partecipanti applica le regole_chat.

const { Op } = require('sequelize');
const {
  Conversazione,
  ConversazionePartecipante,
  Messaggio,
  MessaggioAllegato,
  ChatRiepilogoEmail,
  Utente,
  Visitatore,
} = require('../models');

const persona = (as) => ({ model: Utente, as, attributes: ['id', 'nome', 'cognome', 'ruolo'] });

const includeVisitatore = {
  model: Visitatore,
  as: 'visitatore',
  attributes: ['id', 'nome', 'email'],
};

const includeMessaggio = [
  persona('mittente_utente'),
  { model: Visitatore, as: 'mittente_visitatore', attributes: ['id', 'nome'] },
  { model: MessaggioAllegato, as: 'allegati' },
];

// ─────────────────────────────────────
// Conversazioni
// ─────────────────────────────────────

const trovaConversazionePerUuid = async (uuid, transaction = null) => {
  return await Conversazione.findOne({ where: { uuid }, transaction });
};

// Scheda completa, con i partecipanti ancora presenti.
const trovaDettaglioConversazione = async (id) => {
  return await Conversazione.findByPk(id, {
    include: [
      persona('operatore'),
      persona('cliente'),
      includeVisitatore,
      {
        model: Utente,
        as: 'partecipanti',
        attributes: ['id', 'nome', 'cognome', 'ruolo'],
        through: { where: { uscito_il: null }, attributes: ['entrato_il', 'letto_fino_al'] },
        required: false,
      },
    ],
  });
};

/**
 * Pagina di conversazioni, dalla più recente.
 * filtri: { tipo, stato, cliente_id, visitatore_id, assegnata_a (id o null), membroId, soloDoveMembro }
 * Con membroId si include la riga del partecipante (serve per i non letti).
 */
const trovaConversazioni = async (filtri, { limit, offset }) => {
  const where = { tipo: filtri.tipo };
  for (const campo of ['stato', 'cliente_id', 'visitatore_id', 'assegnata_a']) {
    if (filtri[campo] !== undefined) {
      where[campo] = filtri[campo];
    }
  }

  const include = [persona('operatore'), persona('cliente'), includeVisitatore];
  if (filtri.membroId) {
    include.push({
      model: ConversazionePartecipante,
      as: 'membri',
      where: { utente_id: filtri.membroId, uscito_il: null },
      required: Boolean(filtri.soloDoveMembro),
    });
  }

  return await Conversazione.findAndCountAll({
    where,
    include,
    order: [
      ['ultimo_messaggio_il', 'DESC'],
      ['creato_il', 'DESC'],
    ],
    limit,
    offset,
    distinct: true,
  });
};

// Conversazioni di assistenza aperte che nessuno ha ancora preso.
const contaAssistenzeLibere = async () => {
  return await Conversazione.count({
    where: { tipo: 'assistenza', stato: 'aperta', assegnata_a: null },
  });
};

// L'unica conversazione di assistenza aperta di un cliente o visitatore:
// [conversazione, appenaCreata].
const trovaOCreaAssistenzaAperta = async (interlocutore, dati) => {
  return await Conversazione.findOrCreate({
    where: { tipo: 'assistenza', stato: 'aperta', ...interlocutore },
    defaults: dati,
  });
};

const trovaGruppoPerTitolo = async (titolo, transaction = null) => {
  return await Conversazione.findOne({ where: { tipo: 'staff', titolo }, transaction });
};

// Chat staff dove l'utente è presente, con i membri ancora presenti.
const trovaChatStaffDiUtente = async (utenteId) => {
  const presenze = await ConversazionePartecipante.findAll({
    where: { utente_id: utenteId, uscito_il: null },
    attributes: ['conversazione_id'],
  });
  return await Conversazione.findAll({
    where: {
      id: presenze.map((presenza) => presenza.conversazione_id),
      tipo: 'staff',
      titolo: null,
    },
    include: [{ model: ConversazionePartecipante, as: 'membri', where: { uscito_il: null } }],
  });
};

// Chiuse e ferme da prima della data indicata.
const trovaChiusePrimaDel = async (data) => {
  return await Conversazione.findAll({
    where: {
      stato: 'chiusa',
      [Op.or]: [
        { ultimo_messaggio_il: { [Op.lt]: data } },
        { ultimo_messaggio_il: null, creato_il: { [Op.lt]: data } },
      ],
    },
    attributes: ['id'],
  });
};

// Con messaggi recenti: candidate al riepilogo email.
const trovaConMessaggiDal = async (data) => {
  return await Conversazione.findAll({
    where: { ultimo_messaggio_il: { [Op.gte]: data } },
    include: [
      {
        model: Utente,
        as: 'cliente',
        attributes: ['id', 'nome', 'email', 'lingua', 'ruolo', 'attivo', 'notifiche_email'],
      },
      {
        model: ConversazionePartecipante,
        as: 'membri',
        where: { uscito_il: null },
        required: false,
        include: [
          {
            model: Utente,
            as: 'utente',
            attributes: ['id', 'nome', 'email', 'lingua', 'ruolo', 'attivo', 'notifiche_email'],
          },
        ],
      },
    ],
  });
};

const creaConversazione = async (dati, transaction = null) => {
  return await Conversazione.create(dati, { transaction });
};

const aggiornaConversazione = async (id, dati, transaction = null) => {
  return await Conversazione.update(dati, { where: { id }, transaction });
};

// Messaggi, partecipanti e riepiloghi vanno via in cascata.
const eliminaConversazioni = async (ids) => {
  return await Conversazione.destroy({ where: { id: ids } });
};

// ─────────────────────────────────────
// Partecipanti
// ─────────────────────────────────────

const trovaPartecipazione = async (conversazioneId, utenteId, transaction = null) => {
  return await ConversazionePartecipante.findOne({
    where: { conversazione_id: conversazioneId, utente_id: utenteId, uscito_il: null },
    transaction,
  });
};

// Il trigger delle regole_chat scatta solo sull'INSERT: chi rientra dopo
// essere uscito viene reinserito, così il controllo vale anche per lui.
const aggiungiPartecipante = async (conversazioneId, utenteId, transaction = null) => {
  const chiave = { conversazione_id: conversazioneId, utente_id: utenteId };
  const esistente = await ConversazionePartecipante.findOne({ where: chiave, transaction });
  if (esistente && !esistente.uscito_il) {
    return esistente;
  }
  if (esistente) {
    await ConversazionePartecipante.destroy({ where: chiave, transaction });
  }
  return await ConversazionePartecipante.create(chiave, { transaction });
};

const segnaUscita = async (conversazioneId, utenteId, transaction = null) => {
  return await ConversazionePartecipante.update(
    { uscito_il: new Date() },
    {
      where: { conversazione_id: conversazioneId, utente_id: utenteId, uscito_il: null },
      transaction,
    },
  );
};

const segnaLettoPartecipante = async (conversazioneId, utenteId, il) => {
  return await ConversazionePartecipante.update(
    { letto_fino_al: il },
    { where: { conversazione_id: conversazioneId, utente_id: utenteId } },
  );
};

// ─────────────────────────────────────
// Messaggi
// ─────────────────────────────────────

const trovaMessaggioPerId = async (id) => {
  return await Messaggio.findByPk(id, { include: includeMessaggio });
};

// Storico a ritroso: primaDi = id del più vecchio già caricato.
const trovaMessaggi = async (conversazioneId, primaDi, limite) => {
  const where = { conversazione_id: conversazioneId };
  if (primaDi) {
    where.id = { [Op.lt]: primaDi };
  }
  const messaggi = await Messaggio.findAll({
    where,
    include: includeMessaggio,
    order: [['id', 'DESC']],
    limit: limite,
  });
  return messaggi.reverse();
};

// Tutta la conversazione in ordine (esportazione PDF).
const trovaTuttiIMessaggi = async (conversazioneId) => {
  return await Messaggio.findAll({
    where: { conversazione_id: conversazioneId },
    include: includeMessaggio,
    order: [['id', 'ASC']],
  });
};

const trovaUltimoMessaggio = async (conversazioneId) => {
  return await Messaggio.findOne({
    where: { conversazione_id: conversazioneId },
    attributes: ['id', 'testo', 'inviato_il'],
    order: [['id', 'DESC']],
  });
};

/**
 * Messaggi arrivati dopo `dal` e scritti da altri.
 * lettore: { utenteId } oppure { visitatoreId }; prima = limite superiore facoltativo.
 */
const contaNonLetti = async (conversazioneId, lettore, dal, prima = null) => {
  const colonna = lettore.visitatoreId ? 'mittente_visitatore_id' : 'mittente_utente_id';
  const io = lettore.visitatoreId ?? lettore.utenteId;
  const inviato = { [Op.gt]: dal ?? new Date(0) };
  if (prima) {
    inviato[Op.lt] = prima;
  }
  return await Messaggio.count({
    where: {
      conversazione_id: conversazioneId,
      inviato_il: inviato,
      [Op.or]: [{ [colonna]: null }, { [colonna]: { [Op.ne]: io } }],
    },
  });
};

const creaMessaggio = async (dati, transaction = null) => {
  return await Messaggio.create(dati, { transaction });
};

const creaAllegati = async (righe, transaction = null) => {
  return await MessaggioAllegato.bulkCreate(righe, { transaction });
};

const aggiornaMessaggio = async (id, dati) => {
  return await Messaggio.update(dati, { where: { id } });
};

// Soft delete (paranoid).
const eliminaMessaggio = async (id) => {
  return await Messaggio.destroy({ where: { id } });
};

// Allegato con messaggio e conversazione (per il controllo di accesso).
const trovaAllegatoPerId = async (id) => {
  return await MessaggioAllegato.findByPk(id, {
    include: [
      {
        model: Messaggio,
        as: 'messaggio',
        include: [{ model: Conversazione, as: 'conversazione' }],
      },
    ],
  });
};

// Percorsi dei file delle conversazioni (anche dei messaggi eliminati).
const trovaPercorsiAllegati = async (conversazioneIds) => {
  const allegati = await MessaggioAllegato.findAll({
    attributes: ['percorso'],
    include: [
      {
        model: Messaggio,
        as: 'messaggio',
        where: { conversazione_id: conversazioneIds },
        attributes: [],
        paranoid: false,
      },
    ],
  });
  return allegati.map((allegato) => allegato.percorso);
};

// ─────────────────────────────────────
// Riepiloghi email
// ─────────────────────────────────────

const trovaUltimoRiepilogo = async (conversazioneId, utenteId) => {
  return await ChatRiepilogoEmail.findOne({
    where: { conversazione_id: conversazioneId, utente_id: utenteId },
  });
};

const salvaRiepilogo = async (conversazioneId, utenteId) => {
  return await ChatRiepilogoEmail.upsert({
    conversazione_id: conversazioneId,
    utente_id: utenteId,
    inviato_il: new Date(),
  });
};

module.exports = {
  trovaConversazionePerUuid,
  trovaDettaglioConversazione,
  trovaConversazioni,
  contaAssistenzeLibere,
  trovaOCreaAssistenzaAperta,
  trovaGruppoPerTitolo,
  trovaChatStaffDiUtente,
  trovaChiusePrimaDel,
  trovaConMessaggiDal,
  creaConversazione,
  aggiornaConversazione,
  eliminaConversazioni,
  trovaPartecipazione,
  aggiungiPartecipante,
  segnaUscita,
  segnaLettoPartecipante,
  trovaMessaggioPerId,
  trovaMessaggi,
  trovaTuttiIMessaggi,
  trovaUltimoMessaggio,
  contaNonLetti,
  creaMessaggio,
  creaAllegati,
  aggiornaMessaggio,
  eliminaMessaggio,
  trovaAllegatoPerId,
  trovaPercorsiAllegati,
  trovaUltimoRiepilogo,
  salvaRiepilogo,
};
