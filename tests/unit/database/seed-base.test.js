process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

const { luoghiDaCsv, documentiDaCsv } = require('../../../database/seed-base');

test('comuni: provincia e data di soppressione dal formato ufficiale', () => {
  const csv =
    'Codice,Descrizione,Provincia,DataFineVal\r\n' +
    '405028001,ABANO TERME,PD,\r\n' +
    "401001001,AGLIE',TO,31/12/1983 00:00:00\r\n";
  expect(luoghiDaCsv(csv, 'comune')).toEqual([
    {
      codice: '405028001',
      descrizione: 'ABANO TERME',
      provincia: 'PD',
      tipo: 'comune',
      soppresso_il: null,
    },
    {
      codice: '401001001',
      descrizione: "AGLIE'",
      provincia: 'TO',
      tipo: 'comune',
      soppresso_il: '1983-12-31',
    },
  ]);
});

test('stati: la provincia "ES" diventa null', () => {
  const [stato] = luoghiDaCsv(
    'Codice,Descrizione,Provincia,DataFineVal\n100000216,GERMANIA,ES,\n',
    'stato',
  );
  expect(stato).toMatchObject({ codice: '100000216', provincia: null, tipo: 'stato' });
});

test('documenti: codice e descrizione, righe vuote ignorate', () => {
  expect(documentiDaCsv("Codice,Descrizione\r\nIDENT,CARTA DI IDENTITA'\r\n\r\n")).toEqual([
    { codice: 'IDENT', descrizione: "CARTA DI IDENTITA'" },
  ]);
});
