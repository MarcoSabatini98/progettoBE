process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/repositories/analytics.repository', () => ({
  trovaOccupazioneGiornaliera: jest.fn(),
}));
jest.mock('../../../src/repositories/contenuti.repository', () => ({
  trovaEventi: jest.fn().mockResolvedValue([]),
}));

const analyticsRepo = require('../../../src/repositories/analytics.repository');
const analytics = require('../../../src/services/analytics.service');

// Come le restituisce la procedura: giorno Date, DECIMAL come testo.
const righe = [
  {
    giorno: new Date('2099-07-01T00:00:00Z'),
    camere_disponibili: 4,
    camere_occupate: 3,
    occupazione_percentuale: '75.00',
    ricavo_camere: '300.00',
    prezzo_medio: '100.00',
  },
  {
    giorno: new Date('2099-07-02T00:00:00Z'),
    camere_disponibili: 4,
    camere_occupate: 1,
    occupazione_percentuale: '25.00',
    ricavo_camere: '120.00',
    prezzo_medio: '120.00',
  },
];

beforeEach(() => {
  analyticsRepo.trovaOccupazioneGiornaliera.mockResolvedValue(righe);
});

test("l'occupazione restituisce giorni AAAA-MM-GG e numeri, con ADR e RevPAR", async () => {
  const report = await analytics.occupazione({ dal: '2099-07-01', al: '2099-07-03' });

  expect(report.giorni[0]).toEqual({
    giorno: '2099-07-01',
    camere_disponibili: 4,
    camere_occupate: 3,
    occupazione_percentuale: 75,
    ricavo_camere: 300,
    prezzo_medio: 100,
  });
  expect(report.riepilogo).toEqual({
    notti_disponibili: 8,
    notti_vendute: 4,
    occupazione_percentuale: 50,
    ricavo_camere: 420,
    adr: 105,
    revpar: 52.5,
  });
});

test('i suggerimenti di prezzo hanno il giorno AAAA-MM-GG', async () => {
  const suggerimenti = await analytics.suggerimentiPrezzo({ dal: '2099-07-01', al: '2099-07-03' });

  expect(suggerimenti.map((riga) => riga.giorno)).toEqual(['2099-07-01', '2099-07-02']);
  expect(suggerimenti[0].occupazione_percentuale).toBe(75);
});
