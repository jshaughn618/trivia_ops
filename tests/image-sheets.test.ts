import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PDFDocument, PDFName } from 'pdf-lib';
import { embedImageSheetItems } from '../src/lib/imageSheetImages';

// A valid 2x2 JPEG, like the browser's rasterized image output.
const jpegBase64 = '/9j/4AAQSkZJRgABAQAASABIAAD/4QCARXhpZgAATU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAABIAAAAAQAAAEgAAAABAAOgAQADAAAAAQABAACgAgAEAAAAAQAAAAKgAwAEAAAAAQAAAAIAAAAA/+0AOFBob3Rvc2hvcCAzLjAAOEJJTQQEAAAAAAAAOEJJTQQlAAAAAAAQ1B2M2Y8AsgTpgAmY7PhCfv/AABEIAAIAAgMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2wBDAAICAgICAgMCAgMFAwMDBQYFBQUFBggGBgYGBggKCAgICAgICgoKCgoKCgoMDAwMDAwODg4ODg8PDw8PDw8PDw//2wBDAQICAgQEBAcEBAcQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/3QAEAAH/2gAMAwEAAhEDEQA/AP018MX98/hrSXe4kZmtICSXJJJjWtz7bef895P++jXMeFf+RY0f/rzt/wD0Wtb1AH//2Q==';
const jpegBytes = () => Uint8Array.from(Buffer.from(jpegBase64, 'base64')).buffer;

test('includes all ten converted images even when eight original keys end in .png', async () => {
  const pdf = await PDFDocument.create();
  const items = Array.from({ length: 10 }, (_, index) => ({
    ordinal: index + 1,
    media_key: `user/image-${index + 1}.${index < 8 ? 'png' : 'jpg'}`
  }));
  const embedded = await embedImageSheetItems(pdf, 5, items, async () => jpegBytes(), new Map());
  assert.deepEqual(embedded.map(item => item.ordinal), items.map(item => item.ordinal));
  const page = pdf.addPage();
  embedded.forEach(({ image }, index) => page.drawImage(image, { x: index * 10, y: 0, width: 10, height: 10 }));
  const saved = await PDFDocument.load(await pdf.save());
  const imageResources = saved.getPage(0).node.Resources()!.lookup(PDFName.of('XObject'));
  assert.equal((imageResources as any).keys().length, 10);
});

test('reuses image bytes without losing repeated question ordinals', async () => {
  const pdf = await PDFDocument.create();
  const cache = new Map();
  let loads = 0;
  const load = async () => { loads += 1; return jpegBytes(); };
  const first = await embedImageSheetItems(pdf, 1, [{ ordinal: 3, media_key: 'user/shared.png' }], load, cache);
  const next = await embedImageSheetItems(pdf, 2, [{ ordinal: 7, media_key: 'user/shared.png' }], load, cache);
  assert.equal(loads, 1);
  assert.equal(first[0].image, next[0].image);
  assert.equal(next[0].ordinal, 7);
});

for (const [name, load] of [
  ['missing image', async () => null],
  ['empty image', async () => new ArrayBuffer(0)],
  ['invalid JPEG', async () => new Uint8Array([1, 2, 3]).buffer],
  ['failed download', async () => { throw new Error('Image download failed (HTTP 404).'); }],
  ['failed conversion', async () => { throw new Error('The source image could not be decoded.'); }]
] as const) {
  test(`rejects ${name} instead of returning a partial image sheet`, async () => {
    const pdf = await PDFDocument.create();
    const items = [
      { ordinal: 1, media_key: 'user/good.jpg' },
      { ordinal: 8, media_key: 'user/broken.png' }
    ];
    await assert.rejects(
      embedImageSheetItems(pdf, 5, items, key => key.endsWith('good.jpg') ? Promise.resolve(jpegBytes()) : load(), new Map()),
      /Round 5, image 8: .*Image sheet was not saved\./
    );
  });
}
