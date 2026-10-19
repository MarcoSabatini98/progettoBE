process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/models', () => ({ transazione: jest.fn() }));
jest.mock('../../../src/repositories/pagamenti.repository', () => ({
  registraEventoWebhook: jest.fn(),
  aggiornaEventoWebhook: jest.fn(),
  trovaPagamentoPaypal: jest.fn(),
}));
jest.mock('../../../src/utils/paypal', () => ({
  webhookAutentico: jest.fn(),
  catturaOrdine: jest.fn(),
}));

const pagamentiRepo = require('../../../src/repositories/pagamenti.repository');
const paypal = require('../../../src/utils/paypal');
const pagamenti = require('../../../src/services/pagamenti.service');

const approvato = { id: 'WH-1', event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: 'ORD-1' } };

describe('pagamenti.webhookPaypal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    paypal.webhookAutentico.mockResolvedValue(true);
    pagamentiRepo.registraEventoWebhook.mockResolvedValue(true);
  });

  it('firma non valida: rifiuta senza registrare nulla', async () => {
    paypal.webhookAutentico.mockResolvedValue(false);

    await expect(pagamenti.webhookPaypal({}, approvato)).rejects.toMatchObject({
      codice: 'FIRMA_WEBHOOK_NON_VALIDA',
    });
    expect(pagamentiRepo.registraEventoWebhook).not.toHaveBeenCalled();
  });

  it('evento già ricevuto: non fa nulla', async () => {
    pagamentiRepo.registraEventoWebhook.mockResolvedValue(false);

    await expect(pagamenti.webhookPaypal({}, approvato)).resolves.toEqual({ ricevuto: true });
    expect(pagamentiRepo.trovaPagamentoPaypal).not.toHaveBeenCalled();
  });

  it('ordine approvato ma già incassato al ritorno del cliente: non cattura di nuovo', async () => {
    pagamentiRepo.trovaPagamentoPaypal.mockResolvedValue({ id: 3, stato: 'completato' });

    await pagamenti.webhookPaypal({}, approvato);

    expect(pagamentiRepo.trovaPagamentoPaypal).toHaveBeenCalledWith('ORD-1');
    expect(paypal.catturaOrdine).not.toHaveBeenCalled();
    expect(pagamentiRepo.aggiornaEventoWebhook).toHaveBeenCalledWith(
      'paypal',
      'WH-1',
      expect.objectContaining({ elaborato_il: expect.any(Date) }),
    );
  });
});
