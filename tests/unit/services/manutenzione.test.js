process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/repositories/utenti.repository', () => ({ trovaStaffAttivo: jest.fn() }));
jest.mock('../../../src/repositories/permessi.repository', () => ({
  trovaAssegnazioni: jest.fn(),
  trovaPermessi: jest.fn(),
}));

const utentiRepo = require('../../../src/repositories/utenti.repository');
const permessiRepo = require('../../../src/repositories/permessi.repository');
const manutenzione = require('../../../src/services/manutenzione.service');

test('incaricabili: lo staff attivo dei ruoli che gestiscono la manutenzione, admin compreso', async () => {
  permessiRepo.trovaAssegnazioni.mockResolvedValue([
    { ruolo: 'receptionist', permesso: 'manutenzione.gestisci' },
    { ruolo: 'housekeeper', permesso: 'manutenzione.segnala' },
  ]);
  permessiRepo.trovaPermessi.mockResolvedValue([
    { codice: 'manutenzione.gestisci' },
    { codice: 'manutenzione.segnala' },
  ]);
  utentiRepo.trovaStaffAttivo.mockResolvedValue([{ id: 3 }]);

  expect(await manutenzione.incaricabili()).toEqual([{ id: 3 }]);
  expect(utentiRepo.trovaStaffAttivo).toHaveBeenCalledWith(['receptionist', 'admin']);
});
