import type { PDFDocument, PDFImage } from 'pdf-lib';

type ImageSheetItem = { ordinal: number; media_key: string };

export const embedImageSheetItems = async (
  pdfDoc: PDFDocument,
  roundNumber: number,
  items: ImageSheetItem[],
  fetchJpegBytes: (key: string) => Promise<ArrayBuffer | null>,
  cache: Map<string, PDFImage>
) => {
  const embeddedItems: Array<{ ordinal: number; image: PDFImage }> = [];
  for (const item of items) {
    try {
      let image = cache.get(item.media_key);
      if (!image) {
        const bytes = await fetchJpegBytes(item.media_key);
        if (!bytes || bytes.byteLength === 0) throw new Error('Image is missing or empty.');
        // The loader rasterizes every source to JPEG, regardless of its original key/extension.
        image = await pdfDoc.embedJpg(bytes);
        cache.set(item.media_key, image);
      }
      embeddedItems.push({ ordinal: item.ordinal, image });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Image could not be loaded.';
      throw new Error(`Round ${roundNumber}, image ${item.ordinal}: ${reason} Image sheet was not saved.`);
    }
  }
  return embeddedItems;
};
