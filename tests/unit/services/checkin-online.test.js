const { campiDaScrivere } = require('../../../src/services/helpers/dati-ospite');

test('check-in online: si scrivono solo i campi compilati', () => {
  const campi = campiDaScrivere({
    nome: 'Anna',
    cognome: 'Rossi',
    sesso: 'F',
    email: '',
    note: null,
  });
  expect(campi).toEqual({ nome: 'Anna', cognome: 'Rossi', sesso: 'F' });
});

test('anagrafica di un cliente registrato: si completano solo i campi vuoti', () => {
  const presente = { nome: 'Anna', cognome: 'Rossi', numero_documento: 'CA111', sesso: null };
  const campi = campiDaScrivere(
    { nome: 'Altro', cognome: 'Nome', numero_documento: 'XX999', sesso: 'F' },
    presente,
    true,
  );
  expect(campi).toEqual({ sesso: 'F' });
});
