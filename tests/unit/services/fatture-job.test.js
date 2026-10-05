process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/models', () => ({}));
jest.mock('../../../src/repositories/fatture.repository', () => ({
  trovaFermeAlloSdi: jest.fn(),
}));
jest.mock('../../../src/services/notifiche.service', () => ({ aChiPuo: jest.fn() }));

const fattureRepo = require('../../../src/repositories/fatture.repository');
const notifiche = require('../../../src/services/notifiche.service');
const fatture = require('../../../src/services/fatture.service');

const fattura = (id, numero, stato) => ({
  id,
  anno: 2026,
  sezionale: '',
  numero,
  stato_sdi: stato,
});

describe('fatture.avvisaFermeAlloSdi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notifiche.aChiPuo.mockResolvedValue([{ id: 1 }]);
  });

  it('nessuna ferma: nessun avviso', async () => {
    fattureRepo.trovaFermeAlloSdi.mockResolvedValue([]);

    await expect(fatture.avvisaFermeAlloSdi()).resolves.toEqual({ avvisati: 0 });
    expect(notifiche.aChiPuo).not.toHaveBeenCalled();
  });

  it('una sola: link alla sua scheda', async () => {
    fattureRepo.trovaFermeAlloSdi.mockResolvedValue([fattura(5, 3, 'da_inviare')]);

    await expect(fatture.avvisaFermeAlloSdi()).resolves.toEqual({ avvisati: 1 });
    expect(notifiche.aChiPuo).toHaveBeenCalledWith(
      'fatture.gestisci',
      expect.objectContaining({
        codice: 'fatture_ferme_sdi',
        parametri: { da_inviare: 1, scartate: 0 },
        testo: '3/2026',
        link: '/staff/fatture/5',
      }),
    );
  });

  it('più fatture: divise per stato, link all elenco', async () => {
    fattureRepo.trovaFermeAlloSdi.mockResolvedValue([
      fattura(5, 3, 'da_inviare'),
      fattura(6, 4, 'scartata'),
      fattura(7, 5, 'da_inviare'),
    ]);

    await fatture.avvisaFermeAlloSdi();

    expect(notifiche.aChiPuo).toHaveBeenCalledWith(
      'fatture.gestisci',
      expect.objectContaining({
        parametri: { da_inviare: 2, scartate: 1 },
        testo: '3/2026, 4/2026, 5/2026',
        link: '/staff/fatture',
      }),
    );
  });
});
