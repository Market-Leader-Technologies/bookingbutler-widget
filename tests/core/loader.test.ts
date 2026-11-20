import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BASE_URL,
  WidgetConfigError,
  destroyWidget,
  loadWidget,
  onToolCall,
  registerTool,
  setContext,
  showWidget,
} from "../../src";
import { config, fakeWidget } from "../helpers";

const scripts = () =>
  [
    ...document.querySelectorAll("script[data-bookingbutler-widget]"),
  ] as HTMLScriptElement[];

describe("loadWidget", () => {
  it("adds widget.js once, with the snippet's values", async () => {
    const fake = fakeWidget();
    const first = loadWidget({ ...config, theme: "dark" });
    const second = loadWidget(config);
    expect(scripts()).toHaveLength(1);
    const [script] = scripts();
    expect(script!.src).toBe(`${DEFAULT_BASE_URL}/v1/widget.js`);
    expect({ ...script!.dataset }).toMatchObject({
      botId: "bot-1",
      widgetId: "w-1",
      organizationId: "org-1",
      apiKey: "pk_1",
      apiKeyId: "k-1",
      baseUrl: DEFAULT_BASE_URL,
      theme: "dark",
    });
    fake.start();
    await expect(first).resolves.toBe(fake.widget);
    await expect(second).resolves.toBe(fake.widget);
  });

  it("takes a dev base URL, without a trailing slash", () => {
    void loadWidget({ ...config, baseUrl: "http://localhost:3001/" });
    expect(scripts()[0]!.src).toBe("http://localhost:3001/v1/widget.js");
  });

  it("names what the config is missing", async () => {
    const error = await loadWidget({
      ...config,
      apiKey: "",
      widgetId: " ",
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WidgetConfigError);
    expect((error as WidgetConfigError).missing).toEqual([
      "widgetId",
      "apiKey",
    ]);
    expect(scripts()).toHaveLength(0);
  });

  it("rejects, and can try again, when widget.js does not load", async () => {
    const loading = loadWidget(config);
    scripts()[0]!.dispatchEvent(new Event("error"));
    await expect(loading).rejects.toThrow("Could not load");
    expect(scripts()).toHaveLength(0);
    void loadWidget(config);
    expect(scripts()).toHaveLength(1);
  });
});

describe("before and after widget.js runs", () => {
  it("queues calls made before it loads, and runs them in order", async () => {
    const fake = fakeWidget();
    registerTool({ name: "show_product", description: "d", handler: () => 1 });
    setContext({ data: { product: "mug" } });
    showWidget();
    expect(Array.isArray(window.bothq)).toBe(true);
    void loadWidget(config);
    fake.start();
    expect([...fake.tools.keys()]).toEqual(["show_product"]);
    expect(fake.contexts).toEqual([{ data: { product: "mug" } }]);
    expect(fake.widget.show).toHaveBeenCalled();
  });

  it("calls the widget at once once it is loaded", () => {
    const fake = fakeWidget();
    fake.start();
    setContext({ title: "Cart" });
    expect(fake.contexts).toEqual([{ title: "Cart" }]);
  });

  it("hears tool calls registered for before the load, and stops", async () => {
    const fake = fakeWidget();
    registerTool({ name: "ping", description: "d", handler: () => "pong" });
    const heard: string[] = [];
    const stop = onToolCall((c) => heard.push(c.tool));
    fake.start();
    await fake.callTool("ping");
    stop();
    await fake.callTool("ping");
    expect(heard).toEqual(["ping"]);
  });

  it("offers the same tools again after destroy and a new load", () => {
    const first = fakeWidget();
    registerTool({ name: "a_tool", description: "d", handler: () => 1 });
    setContext({ data: { step: 2 } });
    void loadWidget(config);
    first.start();
    destroyWidget();
    expect(first.widget.destroy).toHaveBeenCalled();
    expect(scripts()).toHaveLength(0);

    const second = fakeWidget();
    void loadWidget(config);
    second.start();
    expect([...second.tools.keys()]).toEqual(["a_tool"]);
    expect(second.contexts).toEqual([{ data: { step: 2 } }]);
  });
});

describe("registerTool", () => {
  it("refuses a name the server would refuse", () => {
    expect(() =>
      registerTool({ name: "Bad-Name", description: "d", handler: () => 1 })
    ).toThrow(/lowercase/);
    expect(() =>
      registerTool({ name: "ok", description: "d" } as never)
    ).toThrow(/handler/);
  });

  it("passes attachImage through when widget.js sends pictures", async () => {
    const fake = fakeWidget({ images: true });
    fake.start();
    let supported: boolean | undefined;
    registerTool({
      name: "shot",
      description: "d",
      handler: (_args, { attachImage, imagesSupported, callId }) => {
        supported = imagesSupported;
        attachImage({ mediaType: "image/png", data: "AA" });
        return { ok: true, callId };
      },
    });
    const { result, attached } = await fake.callTool("shot");
    expect(supported).toBe(true);
    expect(attached).toEqual([{ mediaType: "image/png", data: "AA" }]);
    expect(result).toEqual({ ok: true, callId: "call-1" });
  });

  it("warns once, and still answers, on a widget.js without pictures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = fakeWidget({ images: false });
    fake.start();
    let supported: boolean | undefined;
    registerTool({
      name: "shot",
      description: "d",
      handler: (_args, { attachImage, imagesSupported }) => {
        supported = imagesSupported;
        attachImage(Promise.reject(new Error("tainted canvas")));
        attachImage({ mediaType: "image/png", data: "AA" });
        return { ok: true };
      },
    });
    const { result } = await fake.callTool("shot");
    await fake.callTool("shot");
    expect(supported).toBe(false);
    expect(result).toEqual({ ok: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/does not send pictures/);
  });

  it("warns past twenty tools", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 21; i++)
      registerTool({ name: `tool_${i}`, description: "d", handler: () => i });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/at most 20/);
  });
});

describe("setContext", () => {
  it("sends nothing over 4 KB, and says so", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = fakeWidget();
    fake.start();
    expect(setContext({ data: { blob: "x".repeat(5000) } })).toBe(false);
    expect(fake.contexts).toEqual([]);
    expect(warn).toHaveBeenCalled();
    expect(setContext({ data: { ok: 1 } })).toBe(true);
  });
});
