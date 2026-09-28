process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

const { calcola } = require('../../../src/services/tariffe.service');

const base = {
  arrivo: '2026-07-01',
  partenza: '2026-07-04',
  adulti: 2,
  prezzoBase: 100,
  tipologiaId: 1,
};
const periodo = (dati) => ({ giorni_settimana: 127, priorita: 1, tipologia_id: null, ...dati });
const luglio = { soggiorno_dal: '2026-07-01', soggiorno_al: '2026-07-31' };

test('prezzo base per notte', () => {
  const r = calcola(base);
  expect(r.numero_notti).toBe(3);
  expect(r.totale).toBe(300);
});

test('vince il periodo più prioritario, a parità quello della tipologia', () => {
  const r = calcola({
    ...base,
    periodi: [
      periodo({
        data_inizio: '2026-06-01',
        data_fine: '2026-09-30',
        tipo_variazione: 'percentuale',
        valore: 20,
      }),
      periodo({
        tipologia_id: 1,
        data_inizio: '2026-07-02',
        data_fine: '2026-07-02',
        tipo_variazione: 'prezzo_fisso',
        valore: 150,
      }),
      periodo({
        tipologia_id: 2,
        priorita: 9,
        data_inizio: '2026-07-01',
        data_fine: '2026-07-31',
        tipo_variazione: 'prezzo_fisso',
        valore: 1,
      }),
    ],
  });
  expect(r.notti.map((n) => n.prezzo)).toEqual([120, 150, 120]);
  expect(r.totale).toBe(390);
});

test('soggiorno minimo del periodo', () => {
  const periodi = [
    periodo({ data_inizio: '2026-07-01', data_fine: '2026-07-01', soggiorno_minimo: 4 }),
  ];
  expect(() => calcola({ ...base, periodi })).toThrow(
    expect.objectContaining({ codice: 'SOGGIORNO_MINIMO' }),
  );
});

test('sconti in ordine promozione, codice, fedeltà; tassa esclusa da sconti e acconto', () => {
  const r = calcola({
    ...base,
    piano: { tipo_variazione: null, valore_variazione: 0, acconto_percentuale: 30 },
    promozioni: [
      { id: 1, nome: 'Luglio', tipo_sconto: 'percentuale', valore: 10, ...luglio },
      { id: 2, nome: 'Gruppi', tipo_sconto: 'percentuale', valore: 50, ospiti_min: 6, ...luglio },
    ],
    codice: { tipo_sconto: 'importo', valore: 10 },
    percentualeFedelta: 5,
    tassa: { importo_notte: 2 },
  });
  expect(r.promozione).toMatchObject({ id: 1, sconto: 30 });
  expect(r.sconto_codice).toBe(10);
  expect(r.sconto_fedelta).toBe(13);
  expect(r.tassa_soggiorno).toBe(12);
  expect(r.totale).toBe(259);
  expect(r.acconto_richiesto).toBe(74.1);
});

test('codice sconto sotto i requisiti', () => {
  const codice = { tipo_sconto: 'importo', valore: 5, notti_min: 7 };
  expect(() => calcola({ ...base, codice })).toThrow(
    expect.objectContaining({ codice: 'CODICE_SCONTO_NON_APPLICABILE' }),
  );
});

test('date invertite', () => {
  expect(() => calcola({ ...base, partenza: '2026-07-01' })).toThrow(
    expect.objectContaining({ codice: 'DATE_NON_VALIDE' }),
  );
});
