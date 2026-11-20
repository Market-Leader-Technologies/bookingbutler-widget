import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useState } from "react";
import {
  BookingButlerWidget,
  useHostTool,
  useWidgetContext,
} from "@bookingbutler/widget/react";
import { config, fakeWidget } from "../helpers";

function Cart({ items }: { items: string[] }) {
  useWidgetContext({ data: { items } });
  useHostTool({
    name: "cart_items",
    description: "What is in the cart.",
    handler: () => ({ items }),
  });
  return null;
}

describe("React kit", () => {
  it("registers tools before the widget loads and calls the latest handler", async () => {
    const fake = fakeWidget();
    const onReady = vi.fn();
    const { rerender } = render(
      <>
        <Cart items={["mug"]} />
        <BookingButlerWidget {...config} onReady={onReady} />
      </>
    );
    expect(
      document.querySelectorAll("script[data-bookingbutler-widget]")
    ).toHaveLength(1);
    fake.start();
    await waitFor(() => expect(onReady).toHaveBeenCalledWith(fake.widget));
    expect([...fake.tools.keys()]).toEqual(["cart_items"]);

    rerender(
      <>
        <Cart items={["mug", "tee"]} />
        <BookingButlerWidget {...config} onReady={onReady} />
      </>
    );
    expect((await fake.callTool("cart_items")).result).toEqual({
      items: ["mug", "tee"],
    });
    expect(fake.contexts.at(-1)).toEqual({ data: { items: ["mug", "tee"] } });
  });

  it("sends the context again only when it changes", () => {
    const fake = fakeWidget();
    fake.start();
    function Page() {
      const [n, setN] = useState(0);
      useWidgetContext({ data: { page: "home" } });
      return <button onClick={() => setN(n + 1)}>{n}</button>;
    }
    const { getByRole } = render(<Page />);
    getByRole("button").click();
    getByRole("button").click();
    expect(fake.contexts).toEqual([{ data: { page: "home" } }]);
  });

  it("a tool whose screen has gone answers that it is not here", async () => {
    const fake = fakeWidget();
    fake.start();
    const { unmount } = render(<Cart items={[]} />);
    unmount();
    await expect(fake.callTool("cart_items")).rejects.toThrow(
      /not available on this screen/
    );
  });

  it("reports a bad config to onError", async () => {
    const onError = vi.fn();
    render(<BookingButlerWidget {...config} apiKey="" onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0]![0].message).toMatch(/apiKey/);
  });
});
