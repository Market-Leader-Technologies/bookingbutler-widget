import { MAX_IMAGE_BYTES, RECOMMENDED_MAX_SIDE } from "./limits";

/** A picture was still over 3 MB after encoding. */
export class ImageTooLargeError extends Error {
  readonly bytes: number;
  constructor(bytes: number) {
    super(
      `BookingButler widget: the picture is ${(bytes / 1024 / 1024).toFixed(1)} MB once encoded; the limit is 3 MB. Send it smaller.`
    );
    this.name = "ImageTooLargeError";
    this.bytes = bytes;
  }
}

/**
 * The size that fits `width` x `height` inside `maxSide` on its longest
 * side, keeping its shape. Never larger than it was. For a renderer that
 * takes a width, such as an engine's `render_png(width)`.
 */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number = RECOMMENDED_MAX_SIDE
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * The pixel width at which a shape of any unit (inches, millimetres,
 * points) comes out `maxSide` pixels on its longest side. For a renderer
 * that takes a width in pixels, such as `render_png(widthPx)`, when the
 * document is measured in something else.
 */
export function renderWidth(
  width: number,
  height: number,
  maxSide: number = RECOMMENDED_MAX_SIDE
): number {
  if (!(width > 0) || !(height > 0)) return 0;
  return Math.max(1, Math.round((maxSide * width) / Math.max(width, height)));
}

/** What `toHostImage` takes. Bytes are an encoded picture (a PNG by default). */
export type ImageSource =
  | HTMLCanvasElement
  | OffscreenCanvas
  | ImageBitmap
  | HTMLImageElement
  | Blob
  | Uint8Array
  | ArrayBuffer;

export interface ToHostImageOptions {
  /** The longest side, in pixels. Defaults to 1568. */
  maxSide?: number;
  /** The type to encode a canvas as. Defaults to PNG. */
  type?: "image/png" | "image/jpeg" | "image/webp";
  /** For JPEG and WebP, 0 to 1. Defaults to 0.85. */
  quality?: number;
  /** The type of encoded bytes passed in. Defaults to PNG. */
  bytesType?: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
}

type Drawable = Exclude<ImageSource, Blob | Uint8Array | ArrayBuffer>;

const sizeOf = (source: Drawable) =>
  "naturalWidth" in source
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height };

function makeCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas !== "undefined")
    return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function encode(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number
): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("The canvas could not be encoded.")),
      type,
      quality
    )
  );
}

/** Draws the source scaled to fit, and encodes it. */
async function drawAndEncode(
  source: Drawable,
  maxSide: number,
  type: string,
  quality: number
): Promise<Blob> {
  const { width, height } = sizeOf(source);
  const fit = fitWithin(width, height, maxSide);
  if (!fit.width) throw new Error("The picture has no size.");
  const canvas = makeCanvas(fit.width, fit.height);
  const ctx = canvas.getContext("2d") as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("No 2D canvas to draw the picture on.");
  if (type === "image/jpeg") {
    // JPEG has no transparency: what was clear comes out white, not black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, fit.width, fit.height);
  }
  ctx.drawImage(source as CanvasImageSource, 0, 0, fit.width, fit.height);
  return encode(canvas, type, quality);
}

/**
 * A picture ready for `attachImage`: scaled to fit `maxSide` (1568 by
 * default, never enlarged) and encoded, at most 3 MB. A PNG over the limit
 * is encoded again as JPEG; still over, it throws `ImageTooLargeError`.
 *
 * Encoded bytes or a Blob already within `maxSide` are passed on as they
 * are; a larger one is decoded and scaled (where `createImageBitmap` exists).
 */
export async function toHostImage(
  source: ImageSource,
  options: ToHostImageOptions = {}
): Promise<Blob> {
  const maxSide = options.maxSide ?? RECOMMENDED_MAX_SIDE;
  const type = options.type ?? "image/png";
  const quality = options.quality ?? 0.85;

  let blob: Blob;
  let drawable: Drawable | undefined;
  if (source instanceof Uint8Array || source instanceof ArrayBuffer) {
    blob = new Blob([source as BlobPart], {
      type: options.bytesType ?? "image/png",
    });
  } else if (typeof Blob !== "undefined" && source instanceof Blob) {
    blob = source;
  } else {
    drawable = source as Drawable;
    blob = await drawAndEncode(drawable, maxSide, type, quality);
  }

  if (!drawable && typeof createImageBitmap === "function") {
    // Scale an encoded picture only when it is larger than asked.
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      bitmap = undefined; // Not decodable here; sent as it is.
    }
    if (bitmap && Math.max(bitmap.width, bitmap.height) > maxSide) {
      drawable = bitmap;
      blob = await drawAndEncode(bitmap, maxSide, type, quality);
    }
  }

  if (blob.size > MAX_IMAGE_BYTES && drawable && blob.type === "image/png")
    blob = await drawAndEncode(drawable, maxSide, "image/jpeg", quality);
  if (blob.size > MAX_IMAGE_BYTES) throw new ImageTooLargeError(blob.size);
  return blob;
}
