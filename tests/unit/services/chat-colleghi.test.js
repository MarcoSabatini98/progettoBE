process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/repositories/utenti.repository', () => ({ trovaStaffAttivo: jest.fn() }));
jest.mock('../../../src/services/permessi.service', () => ({ regoleChat: jest.fn() }));

const utentiRepo = require('../../../src/repositories/utenti.repository');
const permessi = require('../../../src/services/permessi.service');
const chat = require('../../../src/services/chat.service');

const utente = (id, ruolo) => ({ id, ruolo, get: () => ({ id, ruolo }) });

test('colleghi: i ruoli ammessi dalle regole, senza se stessi, con la presenza', async () => {
  permessi.regoleChat.mockResolvedValue([
    { ruolo_a: 'housekeeper', ruolo_b: 'housekeeper_senior' },
    { ruolo_a: 'housekeeper', ruolo_b: 'housekeeper' },
    { ruolo_a: 'admin', ruolo_b: 'receptionist' },
  ]);
  utentiRepo.trovaStaffAttivo.mockResolvedValue([
    utente(1, 'housekeeper'),
    utente(2, 'housekeeper_senior'),
  ]);
  chat.impostaPresenza(2, 'occupato');

  const elenco = await chat.colleghi({ utenteId: 1, ruolo: 'housekeeper' });

  expect(utentiRepo.trovaStaffAttivo).toHaveBeenCalledWith(['housekeeper_senior', 'housekeeper']);
  expect(elenco).toEqual([{ id: 2, ruolo: 'housekeeper_senior', presenza: 'occupato' }]);
});

test('colleghi: i clienti non vedono lo staff', async () => {
  await expect(chat.colleghi({ utenteId: 9, ruolo: 'cliente' })).rejects.toMatchObject({
    codice: 'PERMESSO_NEGATO',
  });
});
