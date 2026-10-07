process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/models', () => ({}));
jest.mock('../../../src/repositories/disponibilita.repository', () => ({
  trovaOccupazione: jest.fn(),
  trovaChiusureStruttura: jest.fn(),
}));
jest.mock('../../../src/repositories/camere.repository', () => ({}));
jest.mock('../../../src/services/impostazioni.service', () => ({}));
jest.mock('../../../src/services/tariffe.service', () => ({}));

const disponibilitaRepo = require('../../../src/repositories/disponibilita.repository');
const disponibilita = require('../../../src/services/disponibilita.service');
const { oggi, aggiungiGiorni } = require('../../../src/utils/date');

const periodo = { dal: '2099-10-01', al: '2099-10-16', cameraId: 104 };

const camera = (occupazioni = {}) => ({
  stato: 'attiva',
  prenotazioni: [],
  blocchi_temporanei: [],
  date_bloccate: [],
  ...occupazioni,
});

beforeEach(() => {
  jest.clearAllMocks();
  disponibilitaRepo.trovaChiusureStruttura.mockResolvedValue([]);
});

test('prenotazione 9→13: occupate le notti 9-12, il 13 è libero', async () => {
  disponibilitaRepo.trovaOccupazione.mockResolvedValue([
    camera({ prenotazioni: [{ data_arrivo: '2099-10-09', data_partenza: '2099-10-13' }] }),
  ]);

  const { occupate } = await disponibilita.occupazione(periodo);

  expect(occupate).toEqual(['2099-10-09', '2099-10-10', '2099-10-11', '2099-10-12']);
});

test('blocchi, chiusure della camera e della struttura, tagliati al periodo', async () => {
  disponibilitaRepo.trovaOccupazione.mockResolvedValue([
    camera({
      blocchi_temporanei: [{ data_arrivo: '2099-10-02', data_partenza: '2099-10-03' }],
      date_bloccate: [{ data_inizio: '2099-09-01', data_fine: '2099-10-02' }],
    }),
  ]);
  disponibilitaRepo.trovaChiusureStruttura.mockResolvedValue([
    { data_inizio: '2099-10-15', data_fine: '2100-03-01' },
  ]);

  const { occupate } = await disponibilita.occupazione(periodo);

  expect(occupate).toEqual(['2099-10-01', '2099-10-02', '2099-10-15']);
});

test('tipologia: occupata solo la notte in cui tutte le camere sono prese', async () => {
  disponibilitaRepo.trovaOccupazione.mockResolvedValue([
    camera({ prenotazioni: [{ data_arrivo: '2099-10-05', data_partenza: '2099-10-08' }] }),
    camera({ prenotazioni: [{ data_arrivo: '2099-10-07', data_partenza: '2099-10-09' }] }),
  ]);

  const { occupate } = await disponibilita.occupazione({
    ...periodo,
    cameraId: undefined,
    tipologiaId: 2,
  });

  expect(occupate).toEqual(['2099-10-07']);
});

test('nessuna camera prenotabile: tutto occupato', async () => {
  disponibilitaRepo.trovaOccupazione.mockResolvedValue([]);

  const { occupate } = await disponibilita.occupazione(periodo);

  expect(occupate).toHaveLength(15);
});

test('camera in manutenzione: oggi non si arriva', async () => {
  disponibilitaRepo.trovaOccupazione.mockResolvedValue([camera({ stato: 'manutenzione' })]);

  const { occupate } = await disponibilita.occupazione({
    dal: oggi(),
    al: aggiungiGiorni(oggi(), 3),
    cameraId: 104,
  });

  expect(occupate).toEqual([oggi()]);
});

test('periodo oltre i 3 mesi rifiutato', async () => {
  await expect(disponibilita.occupazione({ ...periodo, al: '2100-03-01' })).rejects.toMatchObject({
    codice: 'PERIODO_TROPPO_LUNGO',
  });
  expect(disponibilitaRepo.trovaOccupazione).not.toHaveBeenCalled();
});
