process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/repositories/contenuti.repository', () => ({
  trovaEventiPubblici: jest.fn(),
  trovaEventoPerId: jest.fn(),
  eliminaEvento: jest.fn(),
  eliminaTraduzioniDi: jest.fn(),
}));
jest.mock('../../../src/models', () => ({
  sequelize: { transaction: (lavoro) => lavoro('transazione') },
}));

const contenutiRepo = require('../../../src/repositories/contenuti.repository');
const contenuti = require('../../../src/services/contenuti.service');
const { GIORNI_EVENTI_SITO } = require('../../../src/constants/sistema.constants');
const { oggi, aggiungiGiorni } = require('../../../src/utils/date');

beforeEach(() => jest.clearAllMocks());

test('il sito vede gli eventi dei prossimi giorni, tradotti', async () => {
  contenutiRepo.trovaEventiPubblici.mockResolvedValue([
    {
      id: 1,
      titolo: 'Sagra del pesce',
      tipo: 'evento_locale',
      traduzioni: [{ campo: 'titolo', testo: 'Fish festival' }],
    },
  ]);

  const eventi = await contenuti.eventiPubblici('en');

  expect(contenutiRepo.trovaEventiPubblici).toHaveBeenCalledWith(
    oggi(),
    aggiungiGiorni(oggi(), GIORNI_EVENTI_SITO),
    'en',
  );
  expect(eventi).toEqual([{ id: 1, titolo: 'Fish festival', tipo: 'evento_locale' }]);
});

test("l'evento eliminato si porta via le traduzioni", async () => {
  contenutiRepo.trovaEventoPerId.mockResolvedValue({ id: 5 });

  await contenuti.eliminaEvento(5);

  expect(contenutiRepo.eliminaTraduzioniDi).toHaveBeenCalledWith('evento', 5, 'transazione');
  expect(contenutiRepo.eliminaEvento).toHaveBeenCalledWith(5, 'transazione');
});
