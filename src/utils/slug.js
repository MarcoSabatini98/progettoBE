// Slug per gli URL del sito: "Camera Matrimoniale Vista Mare" → "camera-matrimoniale-vista-mare".

function slugDa(testo) {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // toglie gli accenti
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

module.exports = { slugDa };
