// src/repositories/pulizie.repository.js
//
// Attività di pulizia e voci della checklist.
// La priorità è un ENUM ordinato da 'bassa' a 'urgente': ordinare DESC mette
// in cima le urgenti.

const { Op } = require('sequelize');
const { AttivitaPulizia, ChecklistModello, Camera, Prenotazione, Utente } = require('../models');

const persona = (as) => ({ model: Utente, as, attributes: ['id', 'nome', 'cognome'] });

const includeAttivita = [
  { model: Camera, as: 'camera', attributes: ['id', 'numero', 'nome', 'piano', 'stato_pulizia'] },
  { model: Prenotazione, as: 'prenotazione', attributes: ['id', 'codice', 'data_partenza'] },
  persona('addetto'),
  persona('verificatore'),
];

// ─────────────────────────────────────
// Attività
// ─────────────────────────────────────

const trovaAttivitaPerId = async (id) => {
  return await AttivitaPulizia.findByPk(id, { include: includeAttivita });
};

// Attività di un giorno, con filtri facoltativi.
const trovaAttivitaDelGiorno = async (giorno, filtri = {}) => {
  const where = { data_prevista: giorno };
  if (filtri.stato) {
    where.stato = filtri.stato;
  }
  if (filtri.camera_id) {
    where.camera_id = filtri.camera_id;
  }
  if (filtri.assegnata_a) {
    where.assegnata_a = filtri.assegnata_a;
  }
  return await AttivitaPulizia.findAll({
    where,
    include: includeAttivita,
    order: [
      ['priorita', 'DESC'],
      [{ model: Camera, as: 'camera' }, 'numero', 'ASC'],
    ],
  });
};

// Da assegnare nel giorno (autoassegnazione).
const trovaNonAssegnate = async (giorno) => {
  return await AttivitaPulizia.findAll({
    where: { data_prevista: giorno, stato: 'da_fare', assegnata_a: null },
    include: [{ model: Camera, as: 'camera', attributes: ['id', 'numero'] }],
    order: [
      ['priorita', 'DESC'],
      ['id', 'ASC'],
    ],
  });
};

// ─── Pulizie a turno ───

const cameraConPiano = { model: Camera, as: 'camera', attributes: ['id', 'numero', 'piano'] };

// Coda del giorno: da fare e senza addetto. L'ordine lo sceglie il service.
const trovaCoda = async (giorno) => {
  return await AttivitaPulizia.findAll({
    where: { data_prevista: giorno, stato: 'da_fare', assegnata_a: null },
    include: [cameraConPiano],
  });
};

// Da fare o in corso con un addetto: chi è impegnato e su quale piano.
const trovaAperteAssegnate = async (giorno) => {
  return await AttivitaPulizia.findAll({
    where: {
      data_prevista: giorno,
      stato: ['da_fare', 'in_corso'],
      assegnata_a: { [Op.ne]: null },
    },
    include: [cameraConPiano],
  });
};

// Ultima camera finita dall'addetto nel giorno: da lì riparte il turno.
const trovaUltimaFinita = async (utenteId, giorno) => {
  return await AttivitaPulizia.findOne({
    where: { data_prevista: giorno, assegnata_a: utenteId, stato: ['completata', 'verificata'] },
    include: [cameraConPiano],
    order: [['completata_il', 'DESC']],
  });
};

// La assegna solo se è ancora libera: due addetti che finiscono insieme non
// prendono la stessa camera. Restituisce [righe aggiornate].
const prendiSeLibera = async (id, utenteId) => {
  return await AttivitaPulizia.update(
    { assegnata_a: utenteId },
    { where: { id, stato: 'da_fare', assegnata_a: null } },
  );
};

// Quante attività ha già ciascun addetto nel giorno: [{ assegnata_a, count }].
const contaAttivitaPerAddetto = async (giorno) => {
  return await AttivitaPulizia.count({
    where: { data_prevista: giorno, assegnata_a: { [Op.ne]: null } },
    group: ['assegnata_a'],
  });
};

// Da fare o in corso: ricevono le modifiche alla checklist.
const trovaAttivitaAperte = async () => {
  return await AttivitaPulizia.findAll({ where: { stato: ['da_fare', 'in_corso'] } });
};

// Attività create dai trigger (partenze) che non hanno ancora la checklist.
const trovaSenzaChecklist = async (finoAl) => {
  return await AttivitaPulizia.findAll({
    where: { data_prevista: { [Op.lte]: finoAl }, stato: 'da_fare', checklist: null },
  });
};

const creaAttivita = async (dati) => {
  return await AttivitaPulizia.create(dati);
};

// Una riga per camera/giorno/tipo: i doppioni si ignorano.
const creaAttivitaInBlocco = async (righe) => {
  return await AttivitaPulizia.bulkCreate(righe, { ignoreDuplicates: true });
};

const aggiornaAttivita = async (id, dati) => {
  return await AttivitaPulizia.update(dati, { where: { id } });
};

const eliminaAttivita = async (id) => {
  return await AttivitaPulizia.destroy({ where: { id } });
};

// ─────────────────────────────────────
// Checklist
// ─────────────────────────────────────

const trovaVociChecklist = async () => {
  return await ChecklistModello.findAll({
    order: [
      ['tipo_pulizia', 'ASC'],
      ['ordine', 'ASC'],
    ],
  });
};

// Voci attive di un tipo di pulizia (tipo_pulizia NULL = valgono per tutti).
const trovaVociAttive = async (tipo) => {
  return await ChecklistModello.findAll({
    where: { attiva: true, tipo_pulizia: { [Op.or]: [tipo, null] } },
    order: [['ordine', 'ASC']],
  });
};

const trovaVocePerId = async (id) => {
  return await ChecklistModello.findByPk(id);
};

const ultimoOrdineChecklist = async () => {
  return (await ChecklistModello.max('ordine')) ?? 0;
};

const creaVoce = async (dati) => {
  return await ChecklistModello.create(dati);
};

const aggiornaVoce = async (id, dati) => {
  return await ChecklistModello.update(dati, { where: { id } });
};

const eliminaVoce = async (id) => {
  return await ChecklistModello.destroy({ where: { id } });
};

module.exports = {
  trovaAttivitaPerId,
  trovaAttivitaDelGiorno,
  trovaNonAssegnate,
  contaAttivitaPerAddetto,
  trovaCoda,
  trovaAperteAssegnate,
  trovaUltimaFinita,
  prendiSeLibera,
  trovaAttivitaAperte,
  trovaSenzaChecklist,
  creaAttivita,
  creaAttivitaInBlocco,
  aggiornaAttivita,
  eliminaAttivita,
  trovaVociChecklist,
  trovaVociAttive,
  trovaVocePerId,
  ultimoOrdineChecklist,
  creaVoce,
  aggiornaVoce,
  eliminaVoce,
};
