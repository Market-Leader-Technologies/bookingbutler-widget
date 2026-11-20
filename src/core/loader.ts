import { MAX_CONTEXT_BYTES, MAX_HOST_TOOLS, TOOL_NAME_PATTERN } from "./limits";
import type {
  HostImage,
  HostTool,
  HostToolMeta,
  LoadedWidget,
  ToolCallEvent,
  WidgetConfig,
  WidgetContext,
  WidgetTheme,
} from "./types";

/** Production: where `v1/widget.js` is served. */
export const DEFAULT_BASE_URL = "https://widgets.bookingbutler.ai";

/** Known widget hosts. Each serves a chat built against its own API. */
export const WIDGET_HOSTS = {
  production: DEFAULT_BASE_URL,
  /** `apps/widget`'s dev server (`pnpm dev`), against its `VITE_API_BASE_URL`. */
  local: "http://localhost:3001",
} as const;

/** Marks the script tag this package added. */
const SCRIPT_ATTRIBUTE = "data-bookingbutler-widget";

type QueueItem = [string, ...unknown[]] | ((widget: LoadedWidget) => void);

declare global {
  interface Window {
    /**
     * Calls made before `widget.js` runs. It replays them in order on load and
     * replaces the array with an object whose `push` runs at once.
     */
    bothq?: QueueItem[] | { push(item: QueueItem): void };
    BothQWidget?: LoadedWidget;
  }
}

/** The config is missing a value the widget needs; `missing` names them. */
export class WidgetConfigError extends Error {
  readonly missing: string[];
  constructor(missing: string[], message?: string) {
    super(
      message ??
        `BookingButler widget: missing ${missing.join(", ")}. Copy them from the widget's embed snippet.`
    );
    this.name = "WidgetConfigError";
    this.missing = missing;
  }
}

/** `widget.js` could not be fetched, or did not start. */
export class WidgetLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WidgetLoadError";
  }
}

const REQUIRED: (keyof WidgetConfig)[] = [
  "botId",
  "widgetId",
  "organizationId",
  "apiKey",
  "apiKeyId",
];

const inBrowser = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

// Every tool this page registered, so a widget loaded again after
// `destroyWidget` is offered the same tools.
const tools = new Map<string, Parameters<LoadedWidget["registerTool"]>[0]>();
let lastContext: WidgetContext | undefined;
let loading: Promise<LoadedWidget> | undefined;
let defaultBaseUrl: string | undefined;
let destroyed = false;
let warnedNoImages = false;

function queue(): { push(item: QueueItem): void } {
  window.bothq = window.bothq || [];
  return window.bothq;
}

/** Runs now on a loaded widget, or waits on the queue for `widget.js`. */
function call(method: keyof LoadedWidget, ...args: unknown[]): void {
  if (!inBrowser()) return;
  const widget = window.BothQWidget;
  const fn = widget?.[method];
  if (widget && typeof fn === "function") {
    (fn as (...a: unknown[]) => unknown).apply(widget, args);
  } else {
    queue().push([method, ...args]);
  }
}

/**
 * The widget host used when a config has no `baseUrl`, for a whole app: set
 * it once from your environment (dev, staging, a local widget server).
 * `undefined` goes back to production. Takes effect on the next load.
 */
export function setDefaultBaseUrl(baseUrl: string | undefined): void {
  defaultBaseUrl = baseUrl ? normalizeBaseUrl(baseUrl) : undefined;
}

/**
 * The widget host a config loads from: its own `baseUrl`, else the default
 * set with `setDefaultBaseUrl`, else production. Without a trailing slash.
 */
export function resolveBaseUrl(
  config: Pick<WidgetConfig, "baseUrl"> = {}
): string {
  return config.baseUrl
    ? normalizeBaseUrl(config.baseUrl)
    : (defaultBaseUrl ?? DEFAULT_BASE_URL);
}

/** An http(s) URL without a trailing slash; anything else throws. */
function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new WidgetConfigError(
      ["baseUrl"],
      `BookingButler widget: baseUrl "${raw}" is not a URL. Use the widget host's origin, such as ${DEFAULT_BASE_URL}.`
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new WidgetConfigError(
      ["baseUrl"],
      `BookingButler widget: baseUrl must be http or https, not ${url.protocol}`
    );
  return url.href.replace(/[?#].*$/, "").replace(/\/+$/, "");
}

/** The loaded widget, or undefined before `widget.js` has run. */
export function getWidget(): LoadedWidget | undefined {
  return inBrowser() ? window.BothQWidget : undefined;
}

/**
 * Adds `widget.js` to the page, once, and resolves with the widget when it
 * has started. Safe to call again: a second call returns the same promise.
 * Tools and context set before (or while) it loads are applied in order.
 *
 * The chat opens its session the first time the visitor opens it, and tools
 * are sent then: register them before that. One registered later is offered
 * from the next page load.
 */
export function loadWidget(config: WidgetConfig): Promise<LoadedWidget> {
  if (!inBrowser())
    return Promise.reject(
      new WidgetLoadError("loadWidget runs in the browser, not on the server.")
    );
  const missing = REQUIRED.filter(
    (key) => typeof config[key] !== "string" || !String(config[key]).trim()
  );
  if (missing.length) return Promise.reject(new WidgetConfigError(missing));
  let base: string;
  try {
    base = resolveBaseUrl(config);
  } catch (error) {
    return Promise.reject(error);
  }
  if (window.BothQWidget) return Promise.resolve(window.BothQWidget);
  if (loading) return loading;

  if (destroyed) {
    // The old widget's queue ran calls on it; start a new one with what this
    // page had set up.
    window.bothq = [];
    for (const definition of tools.values())
      queue().push(["registerTool", definition]);
    if (lastContext) queue().push(["setContext", lastContext]);
    destroyed = false;
  }

  const script = document.createElement("script");
  script.src = `${base}/v1/widget.js`;
  script.async = true;
  script.setAttribute(SCRIPT_ATTRIBUTE, "");
  script.dataset.botId = config.botId;
  script.dataset.widgetId = config.widgetId;
  script.dataset.organizationId = config.organizationId;
  script.dataset.apiKey = config.apiKey;
  script.dataset.apiKeyId = config.apiKeyId;
  script.dataset.baseUrl = base;
  if (config.theme) script.dataset.theme = config.theme;
  if (config.logoImageUrl) script.dataset.logoImageUrl = config.logoImageUrl;

  loading = new Promise<LoadedWidget>((resolve, reject) => {
    script.addEventListener("load", () => {
      if (window.BothQWidget) {
        resolve(window.BothQWidget);
      } else {
        loading = undefined;
        reject(
          new WidgetLoadError(
            "widget.js loaded but did not start; the console says why."
          )
        );
      }
    });
    script.addEventListener("error", () => {
      loading = undefined;
      script.remove();
      reject(new WidgetLoadError(`Could not load ${script.src}`));
    });
  });
  document.body.appendChild(script);
  return loading;
}

/**
 * Offers the agent a tool this page performs. Call it before the visitor
 * opens the chat (before `loadWidget` is simplest).
 *
 * The handler always gets `attachImage`: on a `widget.js` that predates
 * pictures it warns once and the result goes without them.
 */
export function registerTool<Args = Record<string, unknown>>(
  tool: HostTool<Args>
): void {
  if (
    !tool ||
    typeof tool.name !== "string" ||
    !TOOL_NAME_PATTERN.test(tool.name)
  )
    throw new TypeError(
      `BookingButler widget: tool name "${tool?.name}" must be lowercase letters, digits and underscores, starting with a letter, at most 48.`
    );
  if (typeof tool.handler !== "function")
    throw new TypeError(
      `BookingButler widget: tool "${tool.name}" needs a handler.`
    );
  if (!tools.has(tool.name) && tools.size >= MAX_HOST_TOOLS)
    console.warn(
      `BookingButler widget: "${tool.name}" is tool ${tools.size + 1}; a page may offer at most ${MAX_HOST_TOOLS}, and the server refuses the whole list over that.`
    );

  const definition: Parameters<LoadedWidget["registerTool"]>[0] = {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    handler: (args, meta) => {
      const native =
        meta && typeof meta.attachImage === "function"
          ? meta.attachImage
          : undefined;
      const attachImage = (image: HostImage | Promise<HostImage>) => {
        if (native) return native(image);
        // Settled so a rejected picture is not an unhandled rejection.
        Promise.resolve(image).catch(() => undefined);
        if (!warnedNoImages) {
          warnedNoImages = true;
          console.warn(
            `BookingButler widget: tool "${tool.name}" attached a picture, but this widget.js does not send pictures yet; the result goes without it.`
          );
        }
      };
      const full: HostToolMeta = {
        callId: meta?.callId ?? "",
        attachImage,
        imagesSupported: !!native,
      };
      return tool.handler((args ?? {}) as Args, full);
    },
  };
  tools.set(tool.name, definition);
  call("registerTool", definition);
}

/** The size of a value as JSON, in bytes. */
const jsonBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value ?? null)).length;

/**
 * Tells the agent where the visitor is, on every turn it answers: call on
 * load and whenever what is on screen changes. Replaces what was set before.
 * Returns false, and sends nothing, when `data` is over 4 KB as JSON.
 */
export function setContext(context: WidgetContext): boolean {
  if (
    context.data !== undefined &&
    jsonBytes(context.data) > MAX_CONTEXT_BYTES
  ) {
    console.warn(
      `BookingButler widget: context data is ${jsonBytes(context.data)} bytes as JSON, over the ${MAX_CONTEXT_BYTES}-byte limit; not sent. Send the facts, not the document.`
    );
    return false;
  }
  lastContext = context;
  call("setContext", context);
  return true;
}

/**
 * Hears each call the agent makes to one of the page's tools, before its
 * handler runs. Returns a function that stops listening.
 */
export function onToolCall(
  listener: (call: ToolCallEvent) => void
): () => void {
  if (!inBrowser()) return () => undefined;
  const widget = window.BothQWidget;
  if (widget) return widget.onToolCall(listener);
  let stop: (() => void) | undefined;
  let cancelled = false;
  queue().push((loaded) => {
    if (!cancelled) stop = loaded.onToolCall(listener);
  });
  return () => {
    cancelled = true;
    stop?.();
  };
}

/** Light, dark or auto; the chat redraws at once, open or not. */
export const setTheme = (theme: WidgetTheme) => call("setTheme", theme);
/** Opens the chat. */
export const showWidget = () => call("show");
/** Closes the chat. */
export const hideWidget = () => call("hide");
/** Opens or closes the chat. */
export const toggleWidget = () => call("toggle");

/**
 * Removes the widget from the page. A later `loadWidget` adds it again with
 * the tools and context registered so far.
 */
export function destroyWidget(): void {
  if (!inBrowser()) return;
  window.BothQWidget?.destroy();
  delete window.BothQWidget;
  document
    .querySelectorAll(`script[${SCRIPT_ATTRIBUTE}]`)
    .forEach((s) => s.remove());
  loading = undefined;
  destroyed = true;
}

/** @internal Test isolation. */
export function resetForTests(): void {
  tools.clear();
  lastContext = undefined;
  loading = undefined;
  defaultBaseUrl = undefined;
  destroyed = false;
  warnedNoImages = false;
  if (inBrowser()) {
    delete window.BothQWidget;
    delete window.bothq;
    document
      .querySelectorAll(`script[${SCRIPT_ATTRIBUTE}]`)
      .forEach((s) => s.remove());
  }
}
