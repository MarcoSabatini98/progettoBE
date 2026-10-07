process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/models', () => ({
  sequelize: { transaction: (lavoro) => lavoro('transazione') },
}));
jest.mock('../../../src/repositories/disponibilita.repository', () => ({
  trovaCamereLibere: jest.fn(),
  eliminaBloccoDiSessione: jest.fn(),
  creaBlocco: jest.fn(),
}));
jest.mock('../../../src/repositories/camere.repository', () => ({ bloccaCamera: jest.fn() }));
jest.mock('../../../src/services/impostazioni.service', () => ({ leggi: jest.fn() }));
jest.mock('../../../src/services/tariffe.service', () => ({}));
jest.mock('../../../src/services/camere.service', () => ({}));

const disponibilitaRepo = require('../../../src/repositories/disponibilita.repository');
const impostazioni = require('../../../src/services/impostazioni.service');
const disponibilita = require('../../../src/services/disponibilita.service');

const soggiorno = { sessione: 's1', arrivo: '2099-07-01', partenza: '2099-07-04', ospiti: 2 };

beforeEach(() => {
  jest.clearAllMocks();
  impostazioni.leggi.mockResolvedValue(15);
  disponibilitaRepo.creaBlocco.mockResolvedValue({ scade_il: new Date() });
  disponibilitaRepo.trovaCamereLibere.mockResolvedValue([
    { camera_id: 2, tipologia_id: 1 },
    { camera_id: 3, tipologia_id: 1 },
  ]);
});

test('la camera scelta dal sito, se libera, è quella bloccata', async () => {
  const blocco = await disponibilita.blocca({ ...soggiorno, cameraId: 3 });

  expect(blocco.camera_id).toBe(3);
});

test('una camera scelta ma già occupata non si blocca', async () => {
  await expect(disponibilita.blocca({ ...soggiorno, cameraId: 5 })).rejects.toMatchObject({
    codice: 'CAMERA_NON_DISPONIBILE',
  });
  expect(disponibilitaRepo.creaBlocco).not.toHaveBeenCalled();
});

test('senza camera: la prima libera della tipologia', async () => {
  const blocco = await disponibilita.blocca({ ...soggiorno, tipologiaId: 1 });

  expect(blocco.camera_id).toBe(2);
});
