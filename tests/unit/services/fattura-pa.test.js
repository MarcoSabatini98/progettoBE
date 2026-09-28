const { totali, righeDaLordi } = require('../../../src/services/fattura-pa');

test('fattura da prezzi IVA inclusa: il totale è esattamente il lordo incassato', () => {
  const { righe, imposta } = righeDaLordi([
    { descrizione: 'Soggiorno', lordo: 110, aliquota_iva: 10 },
    { descrizione: 'Transfer', lordo: 33.33, aliquota_iva: 22 },
    { descrizione: 'Imposta di soggiorno', lordo: 3, aliquota_iva: 0, natura: 'N1' },
    { descrizione: 'Omaggio', lordo: 0, aliquota_iva: 10 },
  ]);
  expect(righe).toHaveLength(3);
  const t = totali(righe, imposta);
  expect(t.totale).toBe(146.33);
  expect(t.importo_esente).toBe(3);
  expect(t.riepilogo.find((g) => g.aliquota_iva === 10)).toMatchObject({
    imponibile: 100,
    imposta: 10,
  });
});

test('lo scarto di arrotondamento per aliquota finisce nel riepilogo', () => {
  // 7 righe da 1 euro al 10%: imponibile 0,91 ciascuna = 6,37; l'IVA sul totale sarebbe 0,64
  const voci = Array.from({ length: 7 }, (_, i) => ({
    descrizione: `Voce ${i}`,
    lordo: 1,
    aliquota_iva: 10,
  }));
  const { righe, imposta } = righeDaLordi(voci);
  const t = totali(righe, imposta);
  expect(t.imposta).toBe(0.63);
  expect(t.totale).toBe(7);
});

test("senza imposta esatta l'IVA si calcola sul totale per aliquota", () => {
  const t = totali([{ quantita: 2, prezzo_unitario: 50, aliquota_iva: 22 }]);
  expect(t).toMatchObject({ imponibile: 100, imposta: 22, totale: 122 });
});
