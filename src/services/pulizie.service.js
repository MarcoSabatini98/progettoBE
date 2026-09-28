// Pulizie (attività con checklist) e segnalazioni di manutenzione.
// Lo stato di pulizia della camera lo aggiorna il DB (trigger su attivita_pulizia);
// le attività di partenza le crea il DB al check-out.
//
// Chi fa cosa:
//  - pulizie.esegui: avanza le PROPRIE attività (o prende quelle non assegnate)
//  - pulizie.gestisci: crea, assegna, verifica, riapre qualsiasi attività
//  - manutenzione.segnala / manutenzione.gestisci: apre / prende in carico e chiude

const { Op } = require('sequelize');
const {
  AttivitaPulizia,
  ChecklistModello,
  SegnalazioneManutenzione,
  Camera,
  Prenotazione,
  Utente,
  sequelize,
} = require('../models');
const { oppure404, vietato, richiestaNonValida, nonElaborabile } = require('../utils/errori');
const { pagina, risultato } = require('../utils/paginazione');
const { oggi } = require('../utils/date');
const { crud } = require('./crud');
const permessi = require('./permessi.service');
const notifiche = require('./notifiche.service');

const persona = (as) => ({ model: Utente, as, attributes: ['id', 'nome', 'cognome'] });
const cameraBreve = { model: Camera, as: 'camera', attributes: ['id', 'numero', 'nome'] };
const includeAttivita = [
  cameraBreve,
  persona('addetto'),
  persona('verificatore'),
  { model: Prenotazione, as: 'prenotazione', attributes: ['id', 'codice', 'data_partenza'] },
];

const trova = async (id) =>
  oppure404(
    await AttivitaPulizia.findByPk(id, { include: includeAttivita }),
    'PULIZIA_NON_TROVATA',
    'Attività di pulizia non trovata',
  );

const puoGestire = (contesto) => permessi.ha(contesto.ruolo, 'pulizie.gestisci');

// --- checklist -------------------------------------------------------------------

const checklistModelli = crud(ChecklistModello, {
  codice: 'VOCE_CHECKLIST_NON_TROVATA',
  messaggio: 'Voce della checklist non trovata',
  ordine: [
    ['tipo_pulizia', 'ASC'],
    ['ordine', 'ASC'],
  ],
});

/** Voci attive per un tipo di pulizia (tipo_pulizia NULL = vale per tutti). */
async function checklistPer(tipo) {
  const voci = await ChecklistModello.findAll({
    where: { attiva: true, tipo_pulizia: { [Op.or]: [tipo, null] } },
    order: [['ordine', 'ASC']],
    raw: true,
  });
  return voci.map((v) => ({ voce: v.voce, fatto: false }));
}

// --- attività ----------------------------------------------------------------------

/** Elenco del giorno (default oggi). `mie=true` → solo quelle assegnate a me. */
function elenco(query, contesto) {
  const where = { data_prevista: query.data ?? oggi() };
  if (query.stato) where.stato = query.stato;
  if (query.camera_id) where.camera_id = query.camera_id;
  if (query.assegnata_a) where.assegnata_a = query.assegnata_a;
  if (query.mie === 'true') where.assegnata_a = contesto.utenteId;
  return AttivitaPulizia.findAll({
    where,
    include: includeAttivita,
    order: [
      [sequelize.literal("FIELD(priorita, 'urgente', 'alta', 'normale', 'bassa')"), 'ASC'],
      [{ model: Camera, as: 'camera' }, 'numero', 'ASC'],
    ],
  });
}

const dettaglio = trova;

function avvisaAddetto(attivita) {
  if (!attivita.assegnata_a) return;
  notifiche.invia([attivita.assegnata_a], {
    tipo: 'pulizia',
    priorita: attivita.priorita === 'urgente' ? 'avviso' : 'info',
    titolo: `Pulizia assegnata: camera ${attivita.camera?.numero ?? attivita.camera_id}`,
    testo: `${attivita.tipo} del ${attivita.data_prevista}`,
    link: `/staff/pulizie/${attivita.id}`,
  });
}

async function crea(dati, contesto) {
  const tipo = dati.tipo ?? 'riassetto';
  const nuova = await AttivitaPulizia.create({
    camera_id: dati.camera_id,
    prenotazione_id: dati.prenotazione_id ?? null,
    assegnata_a: dati.assegnata_a ?? null,
    data_prevista: dati.data_prevista ?? oggi(),
    tipo,
    priorita: dati.priorita ?? 'normale',
    note: dati.note ?? null,
    checklist: await checklistPer(tipo),
    creato_da: contesto.utenteId,
  });
  const attivita = await trova(nuova.id);
  avvisaAddetto(attivita);
  return attivita;
}

/** Pianificazione (solo gestione): assegnazione, data, priorità, note. */
async function aggiorna(id, dati, _contesto) {
  const attivita = await trova(id);
  if (attivita.stato === 'verificata')
    throw richiestaNonValida('PULIZIA_CHIUSA', 'L’attività è già stata verificata');
  const riassegnata = dati.assegnata_a !== undefined && dati.assegnata_a !== attivita.assegnata_a;
  await attivita.update(
    Object.fromEntries(
      ['assegnata_a', 'data_prevista', 'priorita', 'note', 'tipo']
        .filter((c) => dati[c] !== undefined)
        .map((c) => [c, dati[c]]),
    ),
  );
  const aggiornata = await trova(id);
  if (riassegnata) avvisaAddetto(aggiornata);
  return aggiornata;
}

async function elimina(id) {
  const attivita = await trova(id);
  if (attivita.stato !== 'da_fare')
    throw richiestaNonValida(
      'PULIZIA_INIZIATA',
      'Si possono eliminare solo attività non ancora iniziate',
    );
  await attivita.destroy();
}

// transizioni: stato attuale → stati ammessi, e se servono i permessi di gestione
const TRANSIZIONI = {
  da_fare: { in_corso: false },
  in_corso: { completata: false, da_fare: false },
  completata: { verificata: true, in_corso: true },
  verificata: {},
};

/** Spunta le voci: accetta l'intera lista dal client ma ne tiene solo i `fatto`. */
const spunta = (attuale, nuova) =>
  (attuale ?? []).map((v, i) => ({ ...v, fatto: Boolean(nuova?.[i]?.fatto ?? v.fatto) }));

/**
 * Avanzamento dell'attività (e/o aggiornamento della checklist).
 * @param {{ stato?: string, checklist?: { fatto: boolean }[], note?: string }} dati
 */
async function avanza(id, dati, contesto) {
  const attivita = await trova(id);
  const gestore = await puoGestire(contesto);
  const mia = attivita.assegnata_a === contesto.utenteId;
  if (!gestore && !mia && attivita.assegnata_a)
    throw vietato('PULIZIA_ALTRUI', 'L’attività è assegnata a un altro addetto');

  const modifiche = {};
  if (dati.checklist) modifiche.checklist = spunta(attivita.checklist, dati.checklist);
  if (dati.note !== undefined) modifiche.note = dati.note;

  if (dati.stato && dati.stato !== attivita.stato) {
    const soloGestore = TRANSIZIONI[attivita.stato][dati.stato];
    if (soloGestore === undefined)
      throw richiestaNonValida(
        'TRANSIZIONE_NON_VALIDA',
        `Un’attività ${attivita.stato} non può passare a ${dati.stato}`,
      );
    if (soloGestore && !gestore)
      throw vietato('PERMESSO_NEGATO', 'Solo il responsabile delle pulizie può farlo');

    if (dati.stato === 'completata') {
      const mancanti = (modifiche.checklist ?? attivita.checklist ?? [])
        .filter((v) => !v.fatto)
        .map((v) => v.voce);
      if (mancanti.length)
        throw nonElaborabile('CHECKLIST_INCOMPLETA', 'Completa tutte le voci della checklist', {
          voci: mancanti,
        });
    }
    if (dati.stato === 'verificata') modifiche.verificata_da = contesto.utenteId;
    // prendere in carico un'attività libera la assegna a sé
    if (dati.stato === 'in_corso' && !attivita.assegnata_a)
      modifiche.assegnata_a = contesto.utenteId;
    // ispezione respinta: si rifà da capo
    if (attivita.stato === 'completata' && dati.stato === 'in_corso')
      modifiche.checklist = (attivita.checklist ?? []).map((v) => ({ ...v, fatto: false }));
    modifiche.stato = dati.stato;
  }

  await attivita.update(modifiche);
  const aggiornata = await trova(id);

  if (modifiche.stato === 'completata' && (await ispezioneRichiesta()))
    notifiche.aChiPuo(
      'pulizie.gestisci',
      {
        tipo: 'pulizia',
        titolo: `Camera ${aggiornata.camera.numero} da ispezionare`,
        link: `/staff/pulizie/${id}`,
      },
      contesto.utenteId,
    );
  return aggiornata;
}

async function ispezioneRichiesta() {
  const [riga] = await sequelize.query(
    "SELECT fn_impostazione_numero('pulizie_richiedi_ispezione', 1) AS valore",
    { type: sequelize.QueryTypes.SELECT },
  );
  return Number(riga.valore) === 1;
}

/**
 * Job giornaliero: riassetto delle camere occupate (arrivate prima di oggi e
 * che non partono oggi: la partenza la crea già il DB) e checklist alle
 * attività create dal DB che non l'hanno.
 */
async function generaGiornata(giorno = oggi()) {
  const occupate = await Prenotazione.findAll({
    where: {
      stato: 'in_soggiorno',
      data_arrivo: { [Op.lt]: giorno },
      data_partenza: { [Op.gt]: giorno },
    },
    attributes: ['id', 'camera_id'],
    raw: true,
  });
  const checklist = await checklistPer('riassetto');
  await AttivitaPulizia.bulkCreate(
    occupate.map((p) => ({
      camera_id: p.camera_id,
      prenotazione_id: p.id,
      data_prevista: giorno,
      tipo: 'riassetto',
      checklist,
    })),
    { ignoreDuplicates: true },
  );

  const senzaChecklist = await AttivitaPulizia.findAll({
    where: { data_prevista: { [Op.lte]: giorno }, stato: 'da_fare', checklist: null },
  });
  for (const a of senzaChecklist) await a.update({ checklist: await checklistPer(a.tipo) });
  return { riassetti: occupate.length, checklist_aggiunte: senzaChecklist.length };
}

// --- manutenzione ---------------------------------------------------------------------

const includeSegnalazione = [cameraBreve, persona('segnalatore'), persona('incaricato')];

const trovaSegnalazione = async (id) =>
  oppure404(
    await SegnalazioneManutenzione.findByPk(id, { include: includeSegnalazione }),
    'SEGNALAZIONE_NON_TROVATA',
    'Segnalazione non trovata',
  );

/** Chi ha solo manutenzione.segnala vede le proprie (fatte o assegnate a sé). */
async function elencoSegnalazioni(query, contesto) {
  const p = pagina(query);
  const where = {};
  if (query.stato) where.stato = query.stato;
  else if (query.aperte === 'true') where.stato = ['aperta', 'in_corso'];
  if (query.priorita) where.priorita = query.priorita;
  if (query.camera_id) where.camera_id = query.camera_id;
  if (query.mie === 'true' || !(await permessi.ha(contesto.ruolo, 'manutenzione.gestisci')))
    where[Op.or] = [{ segnalata_da: contesto.utenteId }, { assegnata_a: contesto.utenteId }];

  const righe = await SegnalazioneManutenzione.findAndCountAll({
    where,
    include: includeSegnalazione,
    order: [
      [sequelize.literal("FIELD(priorita, 'urgente', 'alta', 'normale', 'bassa')"), 'ASC'],
      ['creato_il', 'DESC'],
    ],
    limit: p.limit,
    offset: p.offset,
  });
  return risultato(righe, p);
}

/** Cambia lo stato della camera insieme alla segnalazione (es. fuori uso per un guasto). */
async function statoCamera(cameraId, stato, transaction) {
  if (!stato || !cameraId) return;
  await Camera.update({ stato }, { where: { id: cameraId }, transaction });
}

async function segnala(dati, contesto) {
  if (dati.stato_camera && !(await permessi.ha(contesto.ruolo, 'manutenzione.gestisci')))
    throw vietato('PERMESSO_NEGATO', 'Solo la manutenzione può mettere fuori uso una camera');

  const id = await sequelize.transaction(async (transaction) => {
    const s = await SegnalazioneManutenzione.create(
      {
        camera_id: dati.camera_id ?? null,
        titolo: dati.titolo,
        descrizione: dati.descrizione ?? null,
        priorita: dati.priorita ?? 'normale',
        segnalata_da: contesto.utenteId,
      },
      { transaction },
    );
    await statoCamera(dati.camera_id, dati.stato_camera, transaction);
    return s.id;
  });

  const s = await trovaSegnalazione(id);
  notifiche.aChiPuo(
    'manutenzione.gestisci',
    {
      tipo: 'manutenzione',
      priorita: ['alta', 'urgente'].includes(s.priorita) ? 'avviso' : 'info',
      titolo: s.camera ? `Guasto camera ${s.camera.numero}: ${s.titolo}` : s.titolo,
      testo: s.descrizione,
      link: `/staff/manutenzione/${id}`,
    },
    contesto.utenteId,
  );
  return s;
}

/**
 * Presa in carico e chiusura.
 * @param {{ stato?, assegnata_a?, priorita?, note_risoluzione?, stato_camera? }} dati
 */
async function aggiornaSegnalazione(id, dati, contesto) {
  const s = await trovaSegnalazione(id);
  if (['risolta', 'annullata'].includes(s.stato) && dati.stato === undefined)
    throw richiestaNonValida('SEGNALAZIONE_CHIUSA', 'La segnalazione è già chiusa');

  const modifiche = Object.fromEntries(
    ['stato', 'assegnata_a', 'priorita', 'note_risoluzione', 'titolo', 'descrizione']
      .filter((c) => dati[c] !== undefined)
      .map((c) => [c, dati[c]]),
  );
  if (dati.stato === 'risolta' && s.stato !== 'risolta') modifiche.risolta_il = new Date();
  if (dati.stato && ['aperta', 'in_corso'].includes(dati.stato)) modifiche.risolta_il = null;
  if (dati.stato === 'in_corso' && !s.assegnata_a && dati.assegnata_a === undefined)
    modifiche.assegnata_a = contesto.utenteId;

  await sequelize.transaction(async (transaction) => {
    await s.update(modifiche, { transaction });
    await statoCamera(s.camera_id, dati.stato_camera, transaction);
  });

  const aggiornata = await trovaSegnalazione(id);
  if (modifiche.assegnata_a && modifiche.assegnata_a !== contesto.utenteId)
    notifiche.invia([modifiche.assegnata_a], {
      tipo: 'manutenzione',
      titolo: `Ti è stata assegnata: ${aggiornata.titolo}`,
      link: `/staff/manutenzione/${id}`,
    });
  if (modifiche.stato === 'risolta' && s.segnalata_da !== contesto.utenteId)
    notifiche.invia([s.segnalata_da], {
      tipo: 'manutenzione',
      priorita: 'successo',
      titolo: `Risolta: ${aggiornata.titolo}`,
      link: `/staff/manutenzione/${id}`,
    });
  return aggiornata;
}

module.exports = {
  checklistModelli,
  checklistPer,
  elenco,
  dettaglio,
  crea,
  aggiorna,
  elimina,
  avanza,
  generaGiornata,
  elencoSegnalazioni,
  dettaglioSegnalazione: trovaSegnalazione,
  segnala,
  aggiornaSegnalazione,
};
