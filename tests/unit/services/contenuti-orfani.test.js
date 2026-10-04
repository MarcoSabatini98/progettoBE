process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/repositories/camere.repository', () => ({
  trovaCameraPerId: jest.fn(),
  contaPrenotazioniFuture: jest.fn(),
  eliminaCamera: jest.fn(),
}));
jest.mock('../../../src/repositories/tariffe.repository', () => ({
  trovaPacchettoPerId: jest.fn(),
  eliminaPacchetto: jest.fn(),
}));
jest.mock('../../../src/services/contenuti.service', () => ({ eliminaContenutiDi: jest.fn() }));

const camereRepo = require('../../../src/repositories/camere.repository');
const tariffeRepo = require('../../../src/repositories/tariffe.repository');
const contenuti = require('../../../src/services/contenuti.service');
const camere = require('../../../src/services/camere.service');
const tariffe = require('../../../src/services/tariffe.service');

beforeEach(() => jest.clearAllMocks());

test('la camera eliminata si porta via foto e traduzioni', async () => {
  camereRepo.trovaCameraPerId.mockResolvedValue({ id: 7 });
  camereRepo.contaPrenotazioniFuture.mockResolvedValue(0);

  await camere.eliminaCamera(7);

  expect(contenuti.eliminaContenutiDi).toHaveBeenCalledWith('camera', 7);
});

test('la camera con prenotazioni future resta, e così i suoi contenuti', async () => {
  camereRepo.trovaCameraPerId.mockResolvedValue({ id: 7 });
  camereRepo.contaPrenotazioniFuture.mockResolvedValue(2);

  await expect(camere.eliminaCamera(7)).rejects.toMatchObject({
    codice: 'CAMERA_CON_PRENOTAZIONI',
  });
  expect(contenuti.eliminaContenutiDi).not.toHaveBeenCalled();
});

test('il pacchetto eliminato si porta via foto e traduzioni', async () => {
  tariffeRepo.trovaPacchettoPerId.mockResolvedValue({ id: 3 });

  await tariffe.eliminaPacchetto(3);

  expect(contenuti.eliminaContenutiDi).toHaveBeenCalledWith('pacchetto', 3);
});
