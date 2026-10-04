// Compress only the copy sent to the model. Electron supplies the codec; the core
// remains portable and the original attachment/history is never overwritten.
export const MODEL_IMAGE_MAX_BYTES = 512 * 1024;
export interface ImageCodec {
  getSize(): { width: number; height: number };
  resize(options: { width: number; height: number; quality: "good" }): ImageCodec;
  toPNG(): Uint8Array;
  toJPEG(quality: number): Uint8Array;
}

export function prepareModelImage(
  dataUrl: string,
  maxEdge: number,
  decode: (dataUrl: string) => ImageCodec,
  maxBytes = MODEL_IMAGE_MAX_BYTES,
): string {
  const match = /^data:image\/[^;]+;base64,/.exec(dataUrl);
  if (!match) return dataUrl;
  const originalBytes = Math.ceil((dataUrl.length - match[0].length) * 3 / 4);
  const source = decode(dataUrl);
  const { width, height } = source.getSize();
  const longest = Math.max(width, height);
  if (!width || !height) return dataUrl;
  if (longest <= maxEdge && originalBytes <= maxBytes) return dataUrl;

  let edge = Math.min(longest, maxEdge);
  for (;;) {
    const scale = edge / longest;
    // Always resize from the source to avoid accumulating resampling artifacts.
    const image = edge < longest
      ? source.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: "good" })
      : source;
    const png = image.toPNG();
    if (png.byteLength <= maxBytes) return "data:image/png;base64," + Buffer.from(png).toString("base64");
    for (const quality of [85, 70, 55]) {
      const jpeg = image.toJPEG(quality);
      if (jpeg.byteLength <= maxBytes) return "data:image/jpeg;base64," + Buffer.from(jpeg).toString("base64");
    }
    if (edge <= 1) return dataUrl; // Unusual/invalid codec output: keep existing decode-error behavior.
    edge = Math.max(1, Math.floor(edge * 0.75));
  }
}
