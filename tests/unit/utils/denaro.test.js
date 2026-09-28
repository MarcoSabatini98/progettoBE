const { centesimi, euro, percentualeDi, scorporoIva } = require('../../../src/utils/denaro');

test('centesimi arrotonda senza errori di virgola mobile', () => {
  expect(centesimi(0.1 + 0.2)).toBe(30);
  expect(centesimi(1.005)).toBe(101);
  expect(centesimi(-12.345)).toBe(-1235);
  expect(euro(centesimi(99.99))).toBe(99.99);
});

test('centesimi rifiuta importi non numerici', () => {
  expect(() => centesimi('abc')).toThrow(TypeError);
});

test('percentuale arrotondata al centesimo, simmetrica sui negativi', () => {
  expect(percentualeDi(999, 10)).toBe(100);
  expect(percentualeDi(-999, 10)).toBe(-100);
});

test('lo scorporo IVA torna sempre al lordo', () => {
  for (const lordo of [1, 99, 100, 11000, 33333]) {
    const { imponibile, imposta } = scorporoIva(lordo, 10);
    expect(imponibile + imposta).toBe(lordo);
  }
});
