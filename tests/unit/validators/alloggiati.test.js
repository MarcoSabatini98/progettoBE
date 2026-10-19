const { schemaCercaLuoghi } = require('../../../src/validators/alloggiati.validator');

test('ricerca dei luoghi: nomi con accenti e apostrofi, tipo facoltativo', () => {
  expect(schemaCercaLuoghi.validate({ cerca: "Sant'Antìoco" }).error).toBeUndefined();
  expect(schemaCercaLuoghi.validate({ cerca: 'Roma', tipo: 'comune' }).error).toBeUndefined();
});

test('ricerca dei luoghi: niente caratteri jolly né testi troppo corti', () => {
  expect(schemaCercaLuoghi.validate({ cerca: 'R%' }).error).toBeDefined();
  expect(schemaCercaLuoghi.validate({ cerca: 'a_b' }).error).toBeDefined();
  expect(schemaCercaLuoghi.validate({ cerca: 'R' }).error).toBeDefined();
  expect(schemaCercaLuoghi.validate({ cerca: 'Roma', tipo: 'regione' }).error).toBeDefined();
});

test('ricerca dei luoghi: data di validità facoltativa, solo AAAA-MM-GG', () => {
  const { value, error } = schemaCercaLuoghi.validate({
    cerca: 'Roma',
    in_vigore_il: '1980-05-02',
  });
  expect(error).toBeUndefined();
  expect(value.in_vigore_il).toBe('1980-05-02');
  expect(
    schemaCercaLuoghi.validate({ cerca: 'Roma', in_vigore_il: '02/05/1980' }).error,
  ).toBeDefined();
});
