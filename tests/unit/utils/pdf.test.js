const { creaPdf } = require('../../../src/utils/pdf');

test('crea il PDF con i font standard, grassetto e corsivo compresi', async () => {
  const pdf = await creaPdf({
    content: [{ text: 'Titolo', bold: true }, { text: 'Nota', italics: true }, 'Testo'],
    defaultStyle: { font: 'Helvetica' },
  });
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
});

test('rifiuta immagini da file locali', async () => {
  await expect(
    creaPdf({ content: [{ image: 'C:/Windows/win.ini' }], defaultStyle: { font: 'Helvetica' } }),
  ).rejects.toThrow('resource access policy');
});
