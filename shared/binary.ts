export function toOwnedArrayBuffer(input: ArrayBufferLike | ArrayBufferView): ArrayBuffer {
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice().buffer;
  }
  return new Uint8Array(input).slice().buffer;
}
