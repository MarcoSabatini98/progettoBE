// Account utenti.
//  - Area cliente: il cliente vede e modifica da solo i propri dati personali,
//    carica i documenti, vede prenotazioni, fatture e punti fedeltà.
//  - Gestione (admin): account dello staff, ruoli, attivazione. I dati
//    personali di un cliente l'admin non li modifica mai.

const { Op } = require('sequelize');
const {
  Utente,
  Ospite,
  DocumentoOspite,
  Prenotazione,
  Fattura,
  Camera,
  TipologiaCamera,
  MovimentoPunti,
  Ruolo,
  sequelize,
} = require('../models');
const { oppure404, vietato, richiestaNonValida, conflitto } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const file = require('../utils/file');
const auth = require('./auth.service');

const CAMPI_UTENTE = ['nome', 'cognome', 'telefono', 'lingua', 'notifiche_email'];
const CAMPI_ANAGRAFICA = [
  'nome',
  'cognome',
  'email',
  'telefono',
  'sesso',
  'data_nascita',
  'cittadinanza_codice',
  'stato_nascita_codice',
  'comune_nascita_codice',
  'provincia_nascita',
  'tipo_documento',
  'numero_documento',
  'luogo_rilascio_codice',
  'scadenza_documento',
  'codice_fiscale',
  'indirizzo',
  'cap',
  'citta',
  'provincia',
  'paese',
  'lingua',
];
const STATI_ATTIVI = ['in_attesa', 'confermata', 'in_soggiorno'];

const scegli = (dati, campi) =>
  Object.fromEntries(campi.filter((c) => dati[c] !== undefined).map((c) => [c, dati[c]]));

const trovaUtente = async (id, opzioni) =>
  oppure404(await Utente.findByPk(id, opzioni), 'UTENTE_NON_TROVATO', 'Utente non trovato');

// --- area cliente ----------------------------------------------------------------

async function fedelta(utenteId) {
  const [riga] = await sequelize.query('SELECT * FROM v_fedelta_utenti WHERE utente_id = ?', {
    replacements: [utenteId],
    type: sequelize.QueryTypes.SELECT,
  });
  return riga ?? null;
}

/** Tutto ciò che serve alla pagina personale in una chiamata. */
async function profilo(utenteId) {
  const utente = await trovaUtente(utenteId, {
    include: [
      { model: Ospite, as: 'anagrafica', include: [{ model: DocumentoOspite, as: 'documenti' }] },
    ],
  });
  return {
    ...utente.toJSON(),
    fedelta: utente.ruolo === 'cliente' ? await fedelta(utenteId) : null,
  };
}

/**
 * Aggiorna i dati personali: account e anagrafica restano allineati (il nome
 * mostrato nel sito è quello dei dati personali).
 */
async function aggiornaDatiPersonali(utenteId, dati) {
  const utente = await trovaUtente(utenteId);
  await sequelize.transaction(async (transaction) => {
    await utente.update(scegli(dati, CAMPI_UTENTE), { transaction });
    const anagrafica = {
      ...scegli(dati, CAMPI_ANAGRAFICA),
      nome: utente.nome,
      cognome: utente.cognome,
      telefono: utente.telefono,
      email: utente.email,
    };
    if (utente.ospite_id) {
      await Ospite.update(anagrafica, { where: { id: utente.ospite_id }, transaction });
    } else {
      const nuova = await Ospite.create({ ...anagrafica, utente_id: utente.id }, { transaction });
      await utente.update({ ospite_id: nuova.id }, { transaction });
    }
  });
  return profilo(utenteId);
}

async function anagraficaId(utenteId) {
  const utente = await trovaUtente(utenteId);
  if (!utente.ospite_id) {
    throw richiestaNonValida('ANAGRAFICA_MANCANTE', 'Completa prima i tuoi dati personali');
  }
  return utente.ospite_id;
}

/** @param {{ originalname: string, path: string, mimetype: string, size: number }} caricato file di multer */
async function aggiungiDocumento(utenteId, caricato) {
  const ospiteId = await anagraficaId(utenteId).catch(async (err) => {
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

/** Documento del cliente, verificando che sia davvero suo. */
async function mioDocumento(utenteId, documentoId) {
  const ospiteId = await anagraficaId(utenteId);
  return oppure404(
    await DocumentoOspite.findOne({ where: { id: documentoId, ospite_id: ospiteId } }),
    'DOCUMENTO_NON_TROVATO',
    'Documento non trovato',
  );
}

async function eliminaDocumento(utenteId, documentoId) {
  const documento = await mioDocumento(utenteId, documentoId);
  await documento.destroy();
  await file.elimina(documento.percorso);
}

const includePrenotazione = [
  {
    model: Camera,
    as: 'camera',
    attributes: ['id', 'numero', 'nome'],
    include: [{ model: TipologiaCamera, as: 'tipologia', attributes: ['id', 'nome', 'slug'] }],
  },
];

/** Prenotazione attiva (o prossima) e storico. */
async function miePrenotazioni(utenteId) {
  const tutte = await Prenotazione.findAll({
    where: { utente_id: utenteId },
    attributes: { exclude: ['note_interne', 'token_checkin'] },
    include: includePrenotazione,
    order: [['data_arrivo', 'DESC']],
  });
  const attive = tutte.filter((p) => STATI_ATTIVI.includes(p.stato)).reverse();
  return { attive, passate: tutte.filter((p) => !STATI_ATTIVI.includes(p.stato)) };
}

/** Fatture emesse per le prenotazioni del cliente (le bozze non si vedono). */
function mieFatture(utenteId) {
  return Fattura.findAll({
    where: { stato_sdi: { [Op.ne]: 'bozza' } },
    attributes: [
      'id',
      'tipo_documento',
      'anno',
      'numero',
      'sezionale',
      'data_emissione',
      'totale',
      'percorso_pdf',
      'prenotazione_id',
    ],
    include: [
      {
        model: Prenotazione,
        as: 'prenotazione',
        where: { utente_id: utenteId },
        attributes: ['codice', 'data_arrivo', 'data_partenza'],
      },
    ],
    order: [
      ['data_emissione', 'DESC'],
      ['numero', 'DESC'],
    ],
  });
}

function movimentiPunti(utenteId) {
  return MovimentoPunti.findAll({
    where: { utente_id: utenteId },
    include: [{ model: Prenotazione, as: 'prenotazione', attributes: ['codice'] }],
    order: [['creato_il', 'DESC']],
  });
}

/**
 * Bonus o rettifica manuale dei punti (admin). Il saldo lo aggiorna il trigger
 * su movimenti_punti; il DB non accetta saldi negativi.
 */
async function assegnaPunti(utenteId, { punti, motivo = 'bonus', note }, contesto) {
  if (!['bonus', 'rettifica'].includes(motivo))
    throw richiestaNonValida('MOTIVO_NON_VALIDO', 'Motivo ammesso: bonus o rettifica');
  const utente = await trovaUtente(utenteId);
  if (utente.ruolo !== 'cliente')
    throw richiestaNonValida('NON_CLIENTE', 'I punti fedeltà sono solo per i clienti');
  if (utente.punti_fedelta + punti < 0)
    throw richiestaNonValida(
      'PUNTI_INSUFFICIENTI',
      `Il cliente ha solo ${utente.punti_fedelta} punti`,
    );
  await MovimentoPunti.create({
    utente_id: utenteId,
    punti,
    motivo,
    note: note ?? null,
    creato_da: contesto.utenteId,
  });
  return fedelta(utenteId);
}

/** Clienti con livello e punti, dai più fedeli (admin). */
async function classificaFedelta(query) {
  const p = pagina(query);
  const filtro = query.livello ? 'WHERE f.livello = ?' : '';
  const parametri = query.livello ? [query.livello] : [];
  const [righe, [{ totale }]] = await Promise.all([
    sequelize.query(
      `SELECT f.*, u.nome, u.cognome, u.email FROM v_fedelta_utenti f
         JOIN utenti u ON u.id = f.utente_id ${filtro}
        ORDER BY f.punti_fedelta DESC, u.cognome LIMIT ? OFFSET ?`,
      { replacements: [...parametri, p.limit, p.offset], type: sequelize.QueryTypes.SELECT },
    ),
    sequelize.query(`SELECT COUNT(*) AS totale FROM v_fedelta_utenti f ${filtro}`, {
      replacements: parametri,
      type: sequelize.QueryTypes.SELECT,
    }),
  ]);
  return risultato({ rows: righe, count: Number(totale) }, p);
}

/** Cancellazione dell'account richiesta dal cliente (GDPR). */
async function eliminaAccount(utenteId) {
  const attive = await Prenotazione.count({
    where: { utente_id: utenteId, stato: { [Op.in]: STATI_ATTIVI } },
  });
  if (attive) {
    throw conflitto(
      'PRENOTAZIONI_ATTIVE',
      'Non puoi eliminare l’account con prenotazioni in corso',
    );
  }
  await sequelize.transaction(async (transaction) => {
    await auth.esciOvunque(utenteId, transaction);
    await Utente.update({ attivo: false }, { where: { id: utenteId }, transaction });
    await Utente.destroy({ where: { id: utenteId }, transaction });
  });
}

// --- gestione (admin) --------------------------------------------------------------

async function elenco(query) {
  const p = pagina(query);
  const where = {};
  if (query.ruolo) where.ruolo = query.ruolo;
  if (query.attivo !== undefined) where.attivo = query.attivo === true || query.attivo === 'true';
  if (query.cerca) {
    const testo = `%${query.cerca}%`;
    where[Op.or] = [
      { nome: { [Op.like]: testo } },
      { cognome: { [Op.like]: testo } },
      { email: { [Op.like]: testo } },
    ];
  }
  const righe = await Utente.findAndCountAll({
    where,
    order: [
      ['cognome', 'ASC'],
      ['nome', 'ASC'],
    ],
    limit: p.limit,
    offset: p.offset,
  });
  return risultato(righe, p);
}

const dettaglio = (id) =>
  trovaUtente(id, {
    include: [
      { model: Ospite, as: 'anagrafica' },
      { model: Ruolo, as: 'dati_ruolo' },
    ],
  });

async function ruoloStaff(codice) {
  const ruolo = await Ruolo.findByPk(codice);
  if (!ruolo) throw richiestaNonValida('RUOLO_NON_TROVATO', 'Ruolo inesistente');
  return ruolo;
}

/** L'admin crea gli account dello staff (i clienti si registrano da soli). */
async function creaStaff(dati) {
  const ruolo = await ruoloStaff(dati.ruolo);
  if (!ruolo.staff)
    throw richiestaNonValida(
      'RUOLO_NON_STAFF',
      'Gli account cliente si creano con la registrazione',
    );
  const utente = await Utente.create({
    email: auth.normalizzaEmail(dati.email),
    password_hash: await auth.hashPassword(dati.password),
    ruolo: ruolo.codice,
    nome: dati.nome,
    cognome: dati.cognome,
    telefono: dati.telefono ?? null,
    lingua: dati.lingua ?? 'it',
    email_verificata_il: new Date(),
  });
  return dettaglio(utente.id);
}

function contaAdminAttivi() {
  return Utente.count({ where: { ruolo: 'admin', attivo: true } });
}

/**
 * Modifica di un account da parte dell'admin: ruolo e stato sempre; nome e
 * contatti solo per lo staff. Mai i dati personali di un cliente.
 */
async function aggiornaAccount(id, dati, contesto) {
  const utente = await trovaUtente(id);
  const modifiche = scegli(dati, ['ruolo', 'attivo']);
  const personali = scegli(dati, ['nome', 'cognome', 'telefono', 'lingua']);

  if (Object.keys(personali).length) {
    if (utente.ruolo === 'cliente') {
      throw vietato(
        'DATI_CLIENTE_PROTETTI',
        'I dati personali del cliente li modifica solo il cliente',
      );
    }
    Object.assign(modifiche, personali);
  }
  if (modifiche.ruolo) await ruoloStaff(modifiche.ruolo);

  const perdeAdmin =
    utente.ruolo === 'admin' &&
    ((modifiche.ruolo && modifiche.ruolo !== 'admin') || modifiche.attivo === false);
  if (perdeAdmin && Number(id) === Number(contesto?.utenteId)) {
    throw richiestaNonValida(
      'AUTO_DECLASSAMENTO',
      'Non puoi togliere a te stesso il ruolo di amministratore',
    );
  }
  if (perdeAdmin && (await contaAdminAttivi()) <= 1) {
    throw conflitto('ULTIMO_ADMIN', 'Deve restare almeno un amministratore attivo');
  }

  await sequelize.transaction(async (transaction) => {
    await utente.update(modifiche, { transaction });
    if (modifiche.attivo === false || modifiche.ruolo)
      await auth.esciOvunque(utente.id, transaction);
  });
  return dettaglio(id);
}

async function elimina(id, contesto) {
  const utente = await trovaUtente(id);
  if (Number(id) === Number(contesto?.utenteId)) {
    throw richiestaNonValida('AUTO_ELIMINAZIONE', 'Non puoi eliminare il tuo account da qui');
  }
  if (utente.ruolo === 'admin' && (await contaAdminAttivi()) <= 1) {
    throw conflitto('ULTIMO_ADMIN', 'Deve restare almeno un amministratore attivo');
  }
  await sequelize.transaction(async (transaction) => {
    await auth.esciOvunque(utente.id, transaction);
    await utente.destroy({ transaction });
  });
}

module.exports = {
  profilo,
  aggiornaDatiPersonali,
  aggiungiDocumento,
  mioDocumento,
  eliminaDocumento,
  miePrenotazioni,
  mieFatture,
  movimentiPunti,
  fedelta,
  assegnaPunti,
  classificaFedelta,
  eliminaAccount,
  elenco,
  dettaglio,
  creaStaff,
  aggiornaAccount,
  elimina,
};
