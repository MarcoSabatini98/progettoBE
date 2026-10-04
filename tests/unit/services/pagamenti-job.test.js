process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/models', () => ({}));
jest.mock('../../../src/repositories/prenotazioni.repository', () => ({
  trovaDaRimborsare: jest.fn(),
}));
jest.mock('../../../src/services/notifiche.service', () => ({ aChiPuo: jest.fn() }));

const prenotazioniRepo = require('../../../src/repositories/prenotazioni.repository');
const notifiche = require('../../../src/services/notifiche.service');
const pagamenti = require('../../../src/services/pagamenti.service');

describe('pagamenti.avvisaRimborsiDovuti', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notifiche.aChiPuo.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  });

  it('nulla da rimborsare: nessun avviso', async () => {
    prenotazioniRepo.trovaDaRimborsare.mockResolvedValue([]);

    await expect(pagamenti.avvisaRimborsiDovuti()).resolves.toEqual({ avvisati: 0 });
    expect(notifiche.aChiPuo).not.toHaveBeenCalled();
  });

  it('una prenotazione: avvisa chi registra i pagamenti con il link alla scheda', async () => {
    prenotazioniRepo.trovaDaRimborsare.mockResolvedValue([{ prenotazione_id: 7, codice: 'BB-7' }]);

    await expect(pagamenti.avvisaRimborsiDovuti()).resolves.toEqual({ avvisati: 2 });
    expect(notifiche.aChiPuo).toHaveBeenCalledWith(
      'pagamenti.registra',
      expect.objectContaining({
        priorita: 'avviso',
        titolo: 'Rimborsi da fare: 1',
        testo: 'BB-7',
        link: '/staff/prenotazioni/7',
      }),
    );
  });

  it('più prenotazioni: elenca i codici e rimanda all elenco', async () => {
    prenotazioniRepo.trovaDaRimborsare.mockResolvedValue([
      { prenotazione_id: 7, codice: 'BB-7' },
      { prenotazione_id: 9, codice: 'BB-9' },
    ]);

    await pagamenti.avvisaRimborsiDovuti();

    expect(notifiche.aChiPuo).toHaveBeenCalledWith(
      'pagamenti.registra',
      expect.objectContaining({ testo: 'BB-7, BB-9', link: '/staff/prenotazioni' }),
    );
  });
});
