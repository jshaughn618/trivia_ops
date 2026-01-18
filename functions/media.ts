export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

type SniffResult = {
  kind: 'image' | 'audio';
  contentType: string;
  extension: string;
};

export function sniffMedia(bytes: Uint8Array): SniffResult | null {
  if (bytes.length < 12) return null;

  const header = bytes.subarray(0, 12);

  const isPng =
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a;

  if (isPng) {
    return { kind: 'image', contentType: 'image/png', extension: 'png' };
  }

  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (isJpeg) {
    return { kind: 'image', contentType: 'image/jpeg', extension: 'jpg' };
  }

  const riff = String.fromCharCode(...header.subarray(0, 4));
  const webp = String.fromCharCode(...header.subarray(8, 12));
  if (riff === 'RIFF' && webp === 'WEBP') {
    return { kind: 'image', contentType: 'image/webp', extension: 'webp' };
  }

  const ogg = String.fromCharCode(...header.subarray(0, 4));
  if (ogg === 'OggS') {
    return { kind: 'audio', contentType: 'audio/ogg', extension: 'ogg' };
  }

  const wave = String.fromCharCode(...header.subarray(8, 12));
  if (riff === 'RIFF' && wave === 'WAVE') {
    return { kind: 'audio', contentType: 'audio/wav', extension: 'wav' };
  }

  const id3 = String.fromCharCode(...header.subarray(0, 3));
  const isMp3Frame = header[0] === 0xff && (header[1] & 0xe0) === 0xe0;
  if (id3 === 'ID3' || isMp3Frame) {
    return { kind: 'audio', contentType: 'audio/mpeg', extension: 'mp3' };
  }

  return null;
}
