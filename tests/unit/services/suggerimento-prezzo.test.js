const { suggerimentoPrezzo } = require('../../../src/services/helpers/suggerimento-prezzo');

describe('suggerimentoPrezzo', () => {
  test('occupazione alta: +15%', () => {
    const esito = suggerimentoPrezzo({ occupazione_percentuale: 92, giorni_mancanti: 20 });
    expect(esito.percentuale).toBe(15);
    expect(esito.motivi).toEqual([
      {
        codice: 'occupazione_alta',
        valore: 90,
        percentuale: 15,
        motivo: 'Occupazione oltre il 90%: domanda forte',
      },
    ]);
  });

  test('occupazione bassa a ridosso della data: -10% e -5%', () => {
    const esito = suggerimentoPrezzo({ occupazione_percentuale: 20, giorni_mancanti: 3 });
    expect(esito.percentuale).toBe(-15);
    expect(esito.motivi.map((m) => [m.codice, m.valore])).toEqual([
      ['occupazione_bassa', 30],
      ['ultimo_minuto', 7],
    ]);
  });

  test("conta solo l'evento più forte", () => {
    const esito = suggerimentoPrezzo({
      occupazione_percentuale: 50,
      giorni_mancanti: 30,
      eventi: [
        { titolo: 'Sagra', impatto: 3 },
        { titolo: 'Fiera', impatto: 7 },
      ],
    });
    expect(esito.percentuale).toBe(14);
    expect(esito.motivi[0]).toMatchObject({
      codice: 'evento',
      valore: 'Fiera',
      motivo: 'Evento: Fiera',
    });
  });

  test('non supera il +30%', () => {
    const esito = suggerimentoPrezzo({
      occupazione_percentuale: 95,
      giorni_mancanti: 60,
      eventi: [{ titolo: 'Concerto', impatto: 10 }],
    });
    expect(esito.percentuale).toBe(30);
  });
});
