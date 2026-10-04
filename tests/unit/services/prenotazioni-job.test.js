process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/models', () => ({ transazione: (contesto, lavoro) => lavoro('tx') }));
jest.mock('../../../src/repositories/prenotazioni.repository', () => ({
  trovaFermePrimaDi: jest.fn(),
  trovaDaRecensire: jest.fn(),
  bloccaPrenotazione: jest.fn(),
  trovaSaldo: jest.fn(),
  aggiornaPrenotazione: jest.fn(),
  trovaDettaglio: jest.fn(),
}));
jest.mock('../../../src/services/notifiche.service', () => ({ aChiPuo: jest.fn() }));
jest.mock('../../../src/services/email.service', () => ({ invia: jest.fn() }));
jest.mock('../../../src/services/impostazioni.service', () => ({
  leggi: jest.fn(),
  leggiMolte: jest.fn().mockResolvedValue({}),
}));

const prenotazioniRepo = require('../../../src/repositories/prenotazioni.repository');
const notifiche = require('../../../src/services/notifiche.service');
const email = require('../../../src/services/email.service');
const prenotazioni = require('../../../src/services/prenotazioni.service');

const prenotazione = (id, stato, extra = {}) => ({
  id,
  codice: `BB-${id}`,
  stato,
  data_arrivo: '2026-10-01',
  data_partenza: '2026-10-03',
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  prenotazioniRepo.trovaDettaglio.mockResolvedValue({});
});

test('arrivi mancati in no-show, partenze saldate concluse, quelle col saldo alla reception', async () => {
  const perId = {
    1: prenotazione(1, 'confermata'),
    2: prenotazione(2, 'in_soggiorno'),
    3: prenotazione(3, 'in_soggiorno'),
  };
  prenotazioniRepo.trovaFermePrimaDi.mockImplementation((stato) =>
    Promise.resolve(Object.values(perId).filter((p) => p.stato === stato)),
  );
  prenotazioniRepo.bloccaPrenotazione.mockImplementation((id) => Promise.resolve(perId[id]));
  prenotazioniRepo.trovaSaldo.mockImplementation((id) =>
    Promise.resolve({ saldo: id === 3 ? 50 : 0 }),
  );

  const esito = await prenotazioni.chiudiDimenticate();

  expect(esito).toEqual({ no_show: 1, concluse: 1, saldo_aperto: 1 });
  expect(prenotazioniRepo.aggiornaPrenotazione).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ stato: 'no_show' }),
    'tx',
  );
  expect(prenotazioniRepo.aggiornaPrenotazione).toHaveBeenCalledWith(
    2,
    expect.objectContaining({ stato: 'conclusa' }),
    'tx',
  );
  expect(prenotazioniRepo.aggiornaPrenotazione).not.toHaveBeenCalledWith(
    3,
    expect.anything(),
    'tx',
  );
  expect(notifiche.aChiPuo).toHaveBeenCalledWith(
    'prenotazioni.gestisci',
    expect.objectContaining({ testo: 'BB-3' }),
  );
});

test('senza nulla da chiudere nessun avviso', async () => {
  prenotazioniRepo.trovaFermePrimaDi.mockResolvedValue([]);
  expect(await prenotazioni.chiudiDimenticate()).toEqual({
    no_show: 0,
    concluse: 0,
    saldo_aperto: 0,
  });
  expect(notifiche.aChiPuo).not.toHaveBeenCalled();
});

test('invita a recensire chi è partito ieri, col link alla prenotazione', async () => {
  prenotazioniRepo.trovaDaRecensire.mockResolvedValue([prenotazione(4, 'conclusa')]);
  prenotazioniRepo.trovaDettaglio.mockResolvedValue({
    codice: 'BB-4',
    titolare: { email: 'anna@example.com', nome: 'Anna', lingua: 'en' },
  });

  expect(await prenotazioni.invitaARecensire()).toBe(1);
  expect(email.invia).toHaveBeenCalledWith(
    expect.objectContaining({
      a: 'anna@example.com',
      modello: 'invito_recensione',
      lingua: 'en',
      dati: expect.objectContaining({ link: expect.stringMatching(/\/prenotazioni\/BB-4$/) }),
    }),
  );
});
