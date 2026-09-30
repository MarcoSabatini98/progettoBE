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
