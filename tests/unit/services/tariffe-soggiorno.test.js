process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/models', () => ({}));
jest.mock('../../../src/repositories/tariffe.repository', () => ({
  trovaPiani: jest.fn(),
  trovaTassaInVigore: jest.fn(),
}));
jest.mock('../../../src/services/notifiche.service', () => ({}));

const tariffeRepo = require('../../../src/repositories/tariffe.repository');
const tariffe = require('../../../src/services/tariffe.service');
const { oggi } = require('../../../src/utils/date');

test('il sito legge solo i piani attivi e la tassa in vigore oggi', async () => {
  const flessibile = { nome: 'Flessibile', rimborsabile: true, ore_cancellazione_gratuita: 48 };
  const tassa = { nome: 'Comunale', importo_notte: '2.00' };
  tariffeRepo.trovaPiani.mockResolvedValue([flessibile]);
  tariffeRepo.trovaTassaInVigore.mockResolvedValue(tassa);

  expect(await tariffe.condizioniSoggiorno()).toEqual({ piani: [flessibile], tassa });
  expect(tariffeRepo.trovaPiani).toHaveBeenCalledWith({ attivo: true });
  expect(tariffeRepo.trovaTassaInVigore).toHaveBeenCalledWith(oggi());
});
