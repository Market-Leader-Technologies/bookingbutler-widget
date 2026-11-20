import { describe, expect, it } from "vitest";
import {
  ImageTooLargeError,
  MAX_IMAGE_BYTES,
  fitWithin,
  toHostImage,
} from "../../src";

describe("fitWithin", () => {
  it("scales the longest side to 1568 and keeps the shape", () => {
    expect(fitWithin(3000, 1500)).toEqual({ width: 1568, height: 784 });
    expect(fitWithin(1000, 4000)).toEqual({ width: 392, height: 1568 });
  });

  it("never enlarges", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("takes another limit, and nothing for no size", () => {
    expect(fitWithin(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
    expect(fitWithin(0, 10)).toEqual({ width: 0, height: 0 });
  });
});

describe("toHostImage", () => {
  it("wraps PNG bytes (an engine's render) as a Blob", async () => {
    const blob = await toHostImage(new Uint8Array([137, 80, 78, 71]));
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(4);
  });

  it("keeps the type of other bytes", async () => {
    const blob = await toHostImage(new Uint8Array([1, 2]).buffer, {
      bytesType: "image/jpeg",
    });
    expect(blob.type).toBe("image/jpeg");
  });

  it("refuses a picture over 3 MB it cannot re-encode", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    await expect(toHostImage(big)).rejects.toBeInstanceOf(ImageTooLargeError);
  });
});
