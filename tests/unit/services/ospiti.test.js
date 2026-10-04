process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/config/db', () => ({
  ...jest.requireActual('../../../src/config/db'),
  transazione: jest.fn((contesto, fn) => fn('t')),
}));
jest.mock('../../../src/repositories/ospiti.repository', () => ({
  trovaOspitePerId: jest.fn(),
  trovaAccountDiOspite: jest.fn(),
  aggiornaOspite: jest.fn(),
  trovaSchedaOspite: jest.fn(),
  eliminaOspite: jest.fn(),
}));
jest.mock('../../../src/repositories/utenti.repository', () => ({ aggiornaUtente: jest.fn() }));

const ospitiRepo = require('../../../src/repositories/ospiti.repository');
const utentiRepo = require('../../../src/repositories/utenti.repository');
const ospiti = require('../../../src/services/ospiti.service');

const laura = { id: 7, nome: 'Laura', email: 'laura@esempio.it' };

beforeEach(() => {
  jest.clearAllMocks();
  ospitiRepo.trovaOspitePerId.mockResolvedValue(laura);
  ospitiRepo.trovaSchedaOspite.mockResolvedValue({ ...laura, toJSON: () => laura });
});

test("lo staff corregge l'anagrafica di un cliente e l'account resta allineato", async () => {
  ospitiRepo.trovaAccountDiOspite.mockResolvedValue({ id: 3 });

  const scheda = await ospiti.aggiorna(
    7,
    { cognome: 'Conti Rossi', numero_documento: 'CA12345', email: laura.email },
    { utenteId: 1 },
  );

  expect(ospitiRepo.aggiornaOspite).toHaveBeenCalledWith(
    7,
    expect.objectContaining({ cognome: 'Conti Rossi', numero_documento: 'CA12345' }),
    't',
  );
  expect(utentiRepo.aggiornaUtente).toHaveBeenCalledWith(
    3,
    { nome: undefined, cognome: 'Conti Rossi', telefono: undefined, lingua: undefined },
    't',
  );
  expect(scheda.cliente_registrato).toBe(true);
});

test("l'email di accesso del cliente non la cambia lo staff", async () => {
  ospitiRepo.trovaAccountDiOspite.mockResolvedValue({ id: 3 });

  await expect(ospiti.aggiorna(7, { email: 'altra@esempio.it' })).rejects.toMatchObject({
    codice: 'EMAIL_ACCESSO_CLIENTE',
  });
  expect(ospitiRepo.aggiornaOspite).not.toHaveBeenCalled();
});

test("un ospite di passaggio cambia anche l'email e nessun account viene toccato", async () => {
  ospitiRepo.trovaAccountDiOspite.mockResolvedValue(null);

  await ospiti.aggiorna(7, { email: 'nuova@esempio.it' });

  expect(ospitiRepo.aggiornaOspite).toHaveBeenCalled();
  expect(utentiRepo.aggiornaUtente).not.toHaveBeenCalled();
});

test("l'anagrafica di un cliente registrato non si elimina dalla scheda ospite", async () => {
  ospitiRepo.trovaAccountDiOspite.mockResolvedValue({ id: 3 });

  await expect(ospiti.elimina(7)).rejects.toMatchObject({ codice: 'OSPITE_CLIENTE' });
  expect(ospitiRepo.eliminaOspite).not.toHaveBeenCalled();
});
