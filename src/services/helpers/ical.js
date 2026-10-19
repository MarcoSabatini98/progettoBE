// src/services/helpers/ical.js
//
// Lettura e scrittura dei file .ics scambiati con le OTA. Solo date intere
// (fine esclusa), che è quello che usano Booking, Airbnb ed Expedia.

const { aggiungiGiorni } = require('../../utils/date');

// "20260701" o "20260701T140000Z" → "2026-07-01"
function isoDa(valore) {
  const cifre = valore?.match(/(\d{4})(\d{2})(\d{2})/);
  return cifre ? `${cifre[1]}-${cifre[2]}-${cifre[3]}` : null;
}

// "2026-07-01" → "20260701"
function dataIcal(iso) {
  return iso.replace(/-/g, '');
}

// Date → "20260701T140000Z"
function istanteIcal(data) {
  return data
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

// Evento letto (proprietà → valore) → { uid, inizio, fine, titolo }, o null se da scartare.
function eventoDa(proprieta) {
  const inizio = isoDa(proprieta.DTSTART);
  if (!inizio || proprieta.STATUS === 'CANCELLED') {
    return null;
  }
  const dopoInizio = aggiungiGiorni(inizio, 1);
  const fineLetta = isoDa(proprieta.DTEND);
  const fine = fineLetta && fineLetta > inizio ? fineLetta : dopoInizio;
  return {
    uid: (proprieta.UID ?? `${inizio}-${fine}`).slice(0, 255),
    inizio,
    fine,
    titolo: proprieta.SUMMARY?.slice(0, 255) ?? null,
  };
}

/** Testo .ics → [{ uid, inizio, fine, titolo }]. Salta gli eventi cancellati. */
function leggiIcs(testo) {
  // Le righe lunghe continuano sulla riga dopo, che inizia con uno spazio.
  const righe = testo.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const eventi = [];
  let corrente = null;

  for (const riga of righe) {
    if (riga === 'BEGIN:VEVENT') {
      corrente = {};
    } else if (riga === 'END:VEVENT' && corrente) {
      const evento = eventoDa(corrente);
      if (evento) {
        eventi.push(evento);
      }
      corrente = null;
    } else if (corrente) {
      // "DTSTART;VALUE=DATE:20260701" → chiave DTSTART, valore 20260701
      const duePunti = riga.indexOf(':');
      if (duePunti > 0) {
        const chiave = riga.slice(0, duePunti).split(';')[0].toUpperCase();
        corrente[chiave] = riga.slice(duePunti + 1);
      }
    }
  }
  return eventi;
}

/**
 * Calendario .ics con eventi "Non disponibile": nessun dato personale.
 * eventi: [{ uid, inizio, fine }]; dominio: rende gli UID unici nel mondo.
 */
function scriviIcs(nome, dominio, eventi) {
  const adesso = istanteIcal(new Date());
  const vevent = (evento) =>
    [
      'BEGIN:VEVENT',
      `UID:${evento.uid}@${dominio}`,
      `DTSTAMP:${adesso}`,
      `DTSTART;VALUE=DATE:${dataIcal(evento.inizio)}`,
      `DTEND;VALUE=DATE:${dataIcal(evento.fine)}`,
      'SUMMARY:Non disponibile',
      'END:VEVENT',
    ].join('\r\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${dominio}//${nome}//IT`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...eventi.map(vevent),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

module.exports = { leggiIcs, scriviIcs };
