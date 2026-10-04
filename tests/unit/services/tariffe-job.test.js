process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/models', () => ({}));
jest.mock('../../../src/repositories/tariffe.repository', () => ({
  trovaTassaInVigore: jest.fn(),
}));
jest.mock('../../../src/services/notifiche.service', () => ({ aChiPuo: jest.fn() }));

const tariffeRepo = require('../../../src/repositories/tariffe.repository');
const notifiche = require('../../../src/services/notifiche.service');
const tariffe = require('../../../src/services/tariffe.service');
const { aggiungiGiorni, oggi } = require('../../../src/utils/date');

const tassa = (giorni) => ({ nome: 'Comunale', valida_al: aggiungiGiorni(oggi(), giorni) });

// Tasse in vigore per data: la prima copre oggi, le altre i giorni dopo.
function tasseInVigore(attuale, successiva = null) {
  tariffeRepo.trovaTassaInVigore.mockImplementation((data) =>
    Promise.resolve(data === oggi() ? attuale : successiva),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  notifiche.aChiPuo.mockResolvedValue([{ id: 1 }, { id: 2 }]);
});

test('a 7 giorni dalla fine, senza una tassa dopo, avvisa chi gestisce le tariffe', async () => {
  tasseInVigore(tassa(7));

  expect(await tariffe.avvisaTassaInScadenza()).toEqual({ avvisati: 2 });
  expect(notifiche.aChiPuo).toHaveBeenCalledWith(
    'tariffe.gestisci',
    expect.objectContaining({ priorita: 'avviso', link: '/staff/tariffe' }),
  );
});

test('con la tassa successiva già pronta non avvisa', async () => {
  tasseInVigore(tassa(30), tassa(400));

  expect(await tariffe.avvisaTassaInScadenza()).toEqual({ avvisati: 0 });
  expect(notifiche.aChiPuo).not.toHaveBeenCalled();
});

test('fuori dai giorni di avviso, o senza tassa, non avvisa', async () => {
  tasseInVigore(tassa(12));
  await tariffe.avvisaTassaInScadenza();
  tasseInVigore(null);
  await tariffe.avvisaTassaInScadenza();

  expect(notifiche.aChiPuo).not.toHaveBeenCalled();
});
