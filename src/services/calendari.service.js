// Calendari: chiusure manuali, feed iCal in uscita per le OTA (uno per camera)
// e importazione dei calendari delle OTA (Booking, Airbnb...) come date bloccate.

const { Op } = require('sequelize');
const { Camera, CalendarioEsterno, DataBloccata, Prenotazione, sequelize } = require('../models');
const config = require('../config/env');
const logger = require('../config/logger');
const { oppure404, richiestaNonValida, nonTrovato } = require('../utils/errori');
const { oggi, aggiungiGiorni } = require('../utils/date');
const { crud } = require('./crud');
const notifiche = require('./notifiche.service');

const STATI_OCCUPANO = ['in_attesa', 'confermata', 'in_soggiorno'];
const ERRORI_PRIMA_DI_AVVISARE = 5;

// --- chiusure manuali ---------------------------------------------------------------

const cameraBreve = { model: Camera, as: 'camera', attributes: ['id', 'numero', 'nome'] };

/** Chiusure che toccano l'intervallo (camera_id assente = tutte). */
function dateBloccate({ dal, al, camera_id } = {}) {
  const where = {};
  if (dal) where.data_fine = { [Op.gt]: dal };
  if (al) where.data_inizio = { [Op.lt]: al };
  if (camera_id) where.camera_id = { [Op.or]: [camera_id, null] };
  return DataBloccata.findAll({
    where,
    include: [
      cameraBreve,
      { model: CalendarioEsterno, as: 'calendario', attributes: ['id', 'canale', 'nome'] },
    ],
    order: [['data_inizio', 'ASC']],
  });
}

function controllaIntervallo(inizio, fine) {
  if (!inizio || !fine || fine <= inizio)
    throw richiestaNonValida('INTERVALLO_DATE_NON_VALIDO', 'La fine deve essere dopo l’inizio');
}

/** Prenotazioni attive che si sovrappongono (camera NULL = tutta la struttura). */
function prenotazioniSovrapposte(cameraId, inizio, fine) {
  return Prenotazione.findAll({
    where: {
      stato: STATI_OCCUPANO,
      data_arrivo: { [Op.lt]: fine },
      data_partenza: { [Op.gt]: inizio },
      ...(cameraId ? { camera_id: cameraId } : {}),
    },
    attributes: ['id', 'codice', 'camera_id', 'data_arrivo', 'data_partenza'],
  });
}

/** Nuova chiusura manuale. Le prenotazioni già presenti restano e vengono segnalate. */
async function blocca({ camera_id, data_inizio, data_fine, motivo }, contesto) {
  controllaIntervallo(data_inizio, data_fine);
  const chiusura = await DataBloccata.create({
    camera_id: camera_id ?? null,
    data_inizio,
    data_fine,
    motivo: motivo ?? null,
    creato_da: contesto.utenteId,
  });
  return {
    chiusura: await DataBloccata.findByPk(chiusura.id, { include: [cameraBreve] }),
    prenotazioni_in_conflitto: await prenotazioniSovrapposte(camera_id, data_inizio, data_fine),
  };
}

async function manuale(id) {
  const d = oppure404(
    await DataBloccata.findByPk(id),
    'CHIUSURA_NON_TROVATA',
    'Chiusura non trovata',
  );
  if (d.origine !== 'manuale')
    throw richiestaNonValida(
      'CHIUSURA_IMPORTATA',
      'Questa data arriva da un calendario esterno: modificala sul canale',
    );
  return d;
}

async function aggiornaBlocco(id, dati) {
  const d = await manuale(id);
  const nuovi = {
    data_inizio: dati.data_inizio ?? d.data_inizio,
    data_fine: dati.data_fine ?? d.data_fine,
  };
  controllaIntervallo(nuovi.data_inizio, nuovi.data_fine);
  await d.update({ ...nuovi, motivo: dati.motivo !== undefined ? dati.motivo : d.motivo });
  return DataBloccata.findByPk(id, { include: [cameraBreve] });
}

async function sblocca(id) {
  await (await manuale(id)).destroy();
}

// --- esportazione ---------------------------------------------------------------------

const dataIcal = (iso) => iso.replace(/-/g, '');
const istanteIcal = (d) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const dominio = () => new URL(config.urlApp).hostname;

/**
 * Feed .ics di una camera (link segreto con token_ical). Solo "occupato":
 * nessun dato personale finisce alle OTA.
 */
async function feed(token) {
  const camera = token && (await Camera.findOne({ where: { token_ical: token } }));
  if (!camera) throw nonTrovato('CALENDARIO_NON_TROVATO', 'Calendario non trovato');

  const dal = aggiungiGiorni(oggi(), -30);
  const [prenotazioni, chiusure] = await Promise.all([
    Prenotazione.findAll({
      where: { camera_id: camera.id, stato: STATI_OCCUPANO, data_partenza: { [Op.gt]: dal } },
      attributes: ['id', 'data_arrivo', 'data_partenza'],
    }),
    DataBloccata.findAll({
      where: {
        camera_id: { [Op.or]: [camera.id, null] },
        data_fine: { [Op.gt]: dal },
      },
      attributes: ['id', 'data_inizio', 'data_fine'],
    }),
  ]);

  const adesso = istanteIcal(new Date());
  const evento = (uid, inizio, fine) =>
    [
      'BEGIN:VEVENT',
      `UID:${uid}@${dominio()}`,
      `DTSTAMP:${adesso}`,
      `DTSTART;VALUE=DATE:${dataIcal(inizio)}`,
      `DTEND;VALUE=DATE:${dataIcal(fine)}`,
      'SUMMARY:Non disponibile',
      'END:VEVENT',
    ].join('\r\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${dominio()}//Calendario camera ${camera.numero}//IT`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...prenotazioni.map((p) => evento(`prenotazione-${p.id}`, p.data_arrivo, p.data_partenza)),
    ...chiusure.map((c) => evento(`chiusura-${c.id}`, c.data_inizio, c.data_fine)),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

// --- importazione ---------------------------------------------------------------------

const calendari = crud(CalendarioEsterno, {
  codice: 'CALENDARIO_NON_TROVATO',
  messaggio: 'Calendario esterno non trovato',
  ordine: [
    ['camera_id', 'ASC'],
    ['canale', 'ASC'],
  ],
  include: [cameraBreve],
  campi: ['camera_id', 'canale', 'nome', 'url', 'attivo'],
});

const isoDa = (valore) => {
  const cifre = valore?.match(/(\d{4})(\d{2})(\d{2})/);
  return cifre ? `${cifre[1]}-${cifre[2]}-${cifre[3]}` : null;
};

/**
 * VEVENT di un file .ics → [{ uid, inizio, fine, titolo }] (date, fine esclusa).
 * Basta per i feed delle OTA, che usano solo date intere.
 */
function leggiIcs(testo) {
  const righe = testo.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const eventi = [];
  let corrente = null;
  for (const riga of righe) {
    if (riga === 'BEGIN:VEVENT') corrente = {};
    else if (riga === 'END:VEVENT' && corrente) {
      const inizio = isoDa(corrente.DTSTART);
      if (inizio && corrente.STATUS !== 'CANCELLED') {
        const fine = isoDa(corrente.DTEND) ?? aggiungiGiorni(inizio, 1);
        eventi.push({
          uid: (corrente.UID ?? `${inizio}-${fine}`).slice(0, 255),
          inizio,
          fine: fine > inizio ? fine : aggiungiGiorni(inizio, 1),
          titolo: corrente.SUMMARY?.slice(0, 255) ?? null,
        });
      }
      corrente = null;
    } else if (corrente) {
      const due = riga.indexOf(':');
      if (due > 0) corrente[riga.slice(0, due).split(';')[0].toUpperCase()] = riga.slice(due + 1);
    }
  }
  return eventi;
}

async function scarica(url) {
  if (!['https:', 'http:'].includes(new URL(url).protocol))
    throw new Error('Il link del calendario deve iniziare con https://');
  const risposta = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'text/calendar' },
  });
  if (!risposta.ok) throw new Error(`Il canale ha risposto ${risposta.status}`);
  const testo = await risposta.text();
  if (!testo.includes('BEGIN:VCALENDAR')) throw new Error('Il link non restituisce un calendario');
  return testo;
}

/**
 * Sincronizza un calendario: gli eventi del canale diventano date bloccate
 * (aggiornate per UID, rimosse se il canale le ha cancellate). Se un evento
 * nuovo si sovrappone a una prenotazione avvisa lo staff: è un overbooking.
 */
async function sincronizza(id) {
  const cal = await calendari.dettaglio(id);
  try {
    const eventi = leggiIcs(await scarica(cal.url)).filter((e) => e.fine > oggi());
    const esistenti = new Set(
      (
        await DataBloccata.findAll({
          where: { calendario_id: cal.id },
          attributes: ['uid_esterno'],
          raw: true,
        })
      ).map((d) => d.uid_esterno),
    );

    await sequelize.transaction(async (transaction) => {
      await DataBloccata.destroy({
        where: {
          calendario_id: cal.id,
          ...(eventi.length ? { uid_esterno: { [Op.notIn]: eventi.map((e) => e.uid) } } : {}),
        },
        transaction,
      });
      await DataBloccata.bulkCreate(
        eventi.map((e) => ({
          camera_id: cal.camera_id,
          data_inizio: e.inizio,
          data_fine: e.fine,
          motivo: e.titolo ?? `Occupato su ${cal.nome ?? cal.canale}`,
          origine: 'ical',
          calendario_id: cal.id,
          uid_esterno: e.uid,
        })),
        { updateOnDuplicate: ['data_inizio', 'data_fine', 'motivo', 'camera_id'], transaction },
      );
    });

    for (const e of eventi.filter((ev) => !esistenti.has(ev.uid))) {
      const conflitti = await prenotazioniSovrapposte(cal.camera_id, e.inizio, e.fine);
      if (conflitti.length)
        notifiche.aChiPuo('prenotazioni.gestisci', {
          tipo: 'prenotazione',
          priorita: 'errore',
          titolo: `Overbooking camera ${cal.camera?.numero}: ${cal.nome ?? cal.canale}`,
          testo: `Dal ${e.inizio} al ${e.fine} si sovrappone a ${conflitti.map((p) => p.codice).join(', ')}`,
          link: `/staff/prenotazioni/${conflitti[0].id}`,
        });
    }

    await cal.update({
      ultima_sincronizzazione_il: new Date(),
      ultimo_esito: `OK: ${eventi.length} eventi`,
      errori_consecutivi: 0,
    });
    return { eventi: eventi.length };
  } catch (err) {
    const errori = cal.errori_consecutivi + 1;
    await cal.update({
      ultima_sincronizzazione_il: new Date(),
      ultimo_esito: err.message.slice(0, 255),
      errori_consecutivi: errori,
    });
    logger.warn('Sincronizzazione iCal fallita', { calendario: cal.id, errore: err.message });
    if (errori === ERRORI_PRIMA_DI_AVVISARE)
      notifiche.aChiPuo('calendari.gestisci', {
        tipo: 'sistema',
        priorita: 'errore',
        titolo: `Calendario ${cal.nome ?? cal.canale} non si sincronizza`,
        testo: err.message,
        link: `/staff/calendari/${cal.id}`,
      });
    throw richiestaNonValida(
      'SINCRONIZZAZIONE_FALLITA',
      `Sincronizzazione non riuscita: ${err.message}`,
    );
  }
}

/** Job: tutti i calendari attivi, uno alla volta. */
async function sincronizzaTutti() {
  const attivi = await CalendarioEsterno.findAll({ where: { attivo: true }, attributes: ['id'] });
  let riusciti = 0;
  for (const { id } of attivi) {
    try {
      await sincronizza(id);
      riusciti += 1;
    } catch {
      // già registrato sul calendario
    }
  }
  return { calendari: attivi.length, riusciti };
}

/** Link da incollare nelle OTA, per ogni camera. */
async function linkEsportazione() {
  const camere = await Camera.findAll({
    attributes: ['id', 'numero', 'nome', 'token_ical'],
    order: [['numero', 'ASC']],
  });
  return camere.map((c) => ({
    camera_id: c.id,
    numero: c.numero,
    nome: c.nome,
    url: c.token_ical ? `${config.urlApp}/api/ical/${c.token_ical}.ics` : null,
  }));
}

module.exports = {
  dateBloccate,
  blocca,
  aggiornaBlocco,
  sblocca,
  feed,
  calendari,
  leggiIcs,
  sincronizza,
  sincronizzaTutti,
  linkEsportazione,
};
