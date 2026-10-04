process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/models', () => ({
  sequelize: { transaction: (lavoro) => lavoro('transazione') },
}));
jest.mock('../../../src/repositories/calendari.repository', () => ({
  trovaCalendarioPerId: jest.fn(),
  aggiornaCalendario: jest.fn(),
  eliminaImportatiTranne: jest.fn(),
}));
jest.mock('../../../src/services/notifiche.service', () => ({ aChiPuo: jest.fn() }));

const calendariRepo = require('../../../src/repositories/calendari.repository');
const calendari = require('../../../src/services/calendari.service');

beforeEach(() => {
  jest.clearAllMocks();
  calendariRepo.trovaCalendarioPerId.mockResolvedValue({ id: 4, attivo: true });
});

test('disattivato, le sue date bloccate vanno via insieme', async () => {
  await calendari.aggiornaCalendario(4, { attivo: false });

  expect(calendariRepo.aggiornaCalendario).toHaveBeenCalledWith(
    4,
    expect.objectContaining({ attivo: false }),
    'transazione',
  );
  expect(calendariRepo.eliminaImportatiTranne).toHaveBeenCalledWith(4, [], 'transazione');
});

test('le altre modifiche lasciano le date al prossimo giro del job', async () => {
  await calendari.aggiornaCalendario(4, { nome: 'Booking doppia', attivo: true });

  expect(calendariRepo.aggiornaCalendario).toHaveBeenCalled();
  expect(calendariRepo.eliminaImportatiTranne).not.toHaveBeenCalled();
});
