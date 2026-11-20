import { vi } from "vitest";
import type { LoadedWidget, ToolCallEvent } from "../src";

/**
 * A stand-in for `widget.js`: what it records, and the global it installs.
 * `start()` plays the loader starting: it sets `window.BothQWidget`,
 * replays `window.bothq` and fires the script's load event.
 */
export function fakeWidget(options: { images?: boolean } = {}) {
  const tools = new Map<string, Parameters<LoadedWidget["registerTool"]>[0]>();
  const contexts: unknown[] = [];
  const listeners: ((call: ToolCallEvent) => void)[] = [];
  const widget: LoadedWidget = {
    isOpen: false,
    registerTool: (d) => void tools.set(d.name, d),
    setContext: (c) => void contexts.push(c),
    onToolCall: (l) => {
      listeners.push(l);
      return () => listeners.splice(listeners.indexOf(l), 1);
    },
    setTheme: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    toggle: vi.fn(),
    destroy: vi.fn(() => {
      delete window.BothQWidget;
    }),
  };

  const start = () => {
    window.BothQWidget = widget;
    const queued = Array.isArray(window.bothq) ? window.bothq : [];
    const run = (item: unknown) => {
      if (typeof item === "function") item(widget);
      else if (Array.isArray(item))
        (widget as unknown as Record<string, (...a: unknown[]) => void>)[
          item[0]
        ]?.(...item.slice(1));
    };
    window.bothq = { push: run };
    queued.forEach(run);
    document
      .querySelector("script[data-bookingbutler-widget]")
      ?.dispatchEvent(new Event("load"));
  };

  /** Plays the agent calling a tool, as the loader does. */
  const callTool = async (name: string, args: Record<string, unknown> = {}) => {
    listeners.forEach((l) => l({ tool: name, arguments: args }));
    const attached: unknown[] = [];
    const result = await tools.get(name)!.handler(args, {
      callId: "call-1",
      ...(options.images
        ? { attachImage: (i: unknown) => attached.push(i) }
        : {}),
    });
    return { result, attached };
  };

  return { widget, tools, contexts, start, callTool };
}

export const config = {
  botId: "bot-1",
  widgetId: "w-1",
  organizationId: "org-1",
  apiKey: "pk_1",
  apiKeyId: "k-1",
};
