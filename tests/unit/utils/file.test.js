jest.mock('../../../src/config/env', () => ({ upload: { cartella: 'uploads' } }));

const { posizioneCloud } = require('../../../src/utils/file');

test('immagini e video del sito: pubblici, public_id senza estensione', () => {
  expect(posizioneCloud('media/a.jpg')).toEqual({
    public_id: 'media/a',
    resource_type: 'image',
    type: 'upload',
  });
  expect(posizioneCloud('media/b.MP4').resource_type).toBe('video');
});

test('documenti, allegati e fatture: raw ad accesso firmato, estensione nel public_id', () => {
  for (const relativo of ['documenti/c.pdf', 'chat/d.png', 'fatture/2026/e.xml']) {
    expect(posizioneCloud(relativo)).toEqual({
      public_id: relativo,
      resource_type: 'raw',
      type: 'authenticated',
    });
  }
});
