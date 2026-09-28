const { schedina } = require('../../../src/services/helpers/schedina-alloggiati');
const { leggiIcs, scriviIcs } = require('../../../src/services/helpers/ical');

test('schedina Alloggiati: 168 caratteri, campi al posto giusto', () => {
  const riga = schedina(
    {
      cognome: 'Nicolò',
      nome: 'Àlex',
      sesso: 'F',
      data_nascita: '1990-05-17',
      stato_nascita_codice: '100000100',
      comune_nascita_codice: '401058091',
      provincia_nascita: 'rm',
      cittadinanza_codice: '100000100',
      tipo_documento: 'IDENT',
      numero_documento: 'CA12345AB',
      luogo_rilascio_codice: '401058091',
    },
    { data_arrivo: '2026-07-01', data_partenza: '2026-07-04' },
    'ospite_singolo',
  );
  expect(riga).toHaveLength(168);
  expect(riga.slice(0, 14)).toBe('1601/07/202603');
  expect(riga.slice(14, 20)).toBe('NICOLO');
  expect(riga.slice(64, 68)).toBe('ALEX');
  expect(riga.slice(94, 95)).toBe('2');
  expect(riga.slice(95, 105)).toBe('17/05/1990');
  expect(riga.slice(114, 116)).toBe('RM');
});

test('familiare nato all’estero: niente comune, provincia e documento', () => {
  const riga = schedina(
    {
      cognome: 'Smith',
      nome: 'Ann',
      sesso: 'F',
      data_nascita: '2015-01-01',
      stato_nascita_codice: '100000219',
      cittadinanza_codice: '100000219',
      provincia_nascita: 'RM',
      numero_documento: 'X1',
    },
    { data_arrivo: '2026-07-01', data_partenza: '2026-09-01' },
    'familiare',
  );
  expect(riga).toHaveLength(168);
  expect(riga.slice(0, 2)).toBe('19');
  expect(riga.slice(12, 14)).toBe('30');
  expect(riga.slice(105, 116).trim()).toBe('');
  expect(riga.slice(134).trim()).toBe('');
});

test('lettura iCal: righe spezzate, date, eventi cancellati', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:abc@booking',
    'DTSTART;VALUE=DATE:20260701',
    'DTEND;VALUE=DATE:20260704',
    'SUMMARY:CLOSED - Not',
    '  available',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:annullata',
    'DTSTART:20260710',
    'STATUS:CANCELLED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART:20260801T140000Z',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  expect(leggiIcs(ics)).toEqual([
    {
      uid: 'abc@booking',
      inizio: '2026-07-01',
      fine: '2026-07-04',
      titolo: 'CLOSED - Not available',
    },
    { uid: '2026-08-01-2026-08-02', inizio: '2026-08-01', fine: '2026-08-02', titolo: null },
  ]);
});

test('scrittura iCal: eventi "Non disponibile" con date intere', () => {
  const ics = scriviIcs('Camera 1', 'esempio.it', [
    { uid: 'prenotazione-7', inizio: '2026-07-01', fine: '2026-07-04' },
  ]);
  expect(ics).toContain('UID:prenotazione-7@esempio.it');
  expect(ics).toContain('DTSTART;VALUE=DATE:20260701');
  expect(ics).toContain('DTEND;VALUE=DATE:20260704');
  expect(leggiIcs(ics)).toEqual([
    {
      uid: 'prenotazione-7@esempio.it',
      inizio: '2026-07-01',
      fine: '2026-07-04',
      titolo: 'Non disponibile',
    },
  ]);
});
