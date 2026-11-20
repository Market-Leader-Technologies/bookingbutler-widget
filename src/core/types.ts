import type { IMAGE_TYPES } from "./limits";

export type WidgetTheme = "light" | "dark" | "auto";

/** The values in the widget's embed snippet (Bots → Widget → Embed). */
export interface WidgetConfig {
  botId: string;
  widgetId: string;
  organizationId: string;
  /** The widget's public key. It identifies the widget; it is not a secret. */
  apiKey: string;
  apiKeyId: string;
  /**
   * Where `v1/widget.js` is served, to test against dev, staging or a local
   * widget server. Defaults to `setDefaultBaseUrl`'s value, else production
   * (`https://widgets.bookingbutler.ai`). The chat talks to the API its host
   * was built for, so this one URL picks the whole environment.
   */
  baseUrl?: string;
  /** light (the default), dark, or auto (follows the visitor's system). */
  theme?: WidgetTheme;
  /** A logo for the launcher before the widget's own settings arrive. */
  logoImageUrl?: string;
}

export type HostImageType = (typeof IMAGE_TYPES)[number];

/** A picture as base64, with no `data:` prefix. */
export interface HostImageData {
  mediaType: HostImageType;
  data: string;
}

/** A picture for the agent: a Blob (encoded for you) or base64 data. */
export type HostImage = Blob | HostImageData;

/** The second argument of a tool's handler. */
export interface HostToolMeta {
  /** The call's id, the same in `onToolCall` and the server's records. */
  callId: string;
  /**
   * Shows the agent a picture with this call's result, such as the canvas it
   * just changed. Call it before the handler returns (await the picture
   * first): one attached later is not sent. At most 4 per call.
   *
   * On a page whose `widget.js` predates pictures, this warns once and the
   * result is sent without the picture; `imagesSupported` says which.
   */
  attachImage(image: HostImage | Promise<HostImage>): void;
  /** Whether the loaded `widget.js` sends pictures. */
  imagesSupported: boolean;
}

/** A JSON Schema object describing a tool's arguments. */
export interface ToolParameters {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  [keyword: string]: unknown;
}

/** A tool the page performs for the agent. */
export interface HostTool<Args = Record<string, unknown>> {
  /** How the agent calls it: lowercase, digits, underscores; at most 48. */
  name: string;
  /** What the agent chooses it by: say what it does and when to use it. */
  description: string;
  /** The arguments, as JSON Schema; leave out for a tool that takes none. */
  parameters?: ToolParameters;
  /**
   * Does the work. What it returns (plain data, or a promise of it) is what
   * the agent reads; a throw is reported to the agent as the tool's error.
   */
  handler(args: Args, meta: HostToolMeta): unknown;
}

/** Where the visitor is. Facts, never instructions. */
export interface WidgetContext {
  /** Defaults to the page's own. */
  url?: string;
  /** Defaults to the page's own. */
  title?: string;
  /** Small facts: the product on screen, what is in the cart. At most 4 KB. */
  data?: Record<string, unknown>;
}

/** What `onToolCall` hears each time the agent calls one of the page's tools. */
export interface ToolCallEvent {
  tool: string;
  arguments: Record<string, unknown>;
}

/** The loader's global, `window.BothQWidget`, as far as this package uses it. */
export interface LoadedWidget {
  readonly isOpen: boolean;
  registerTool(definition: {
    name: string;
    description?: string;
    parameters?: ToolParameters;
    handler: (
      args: Record<string, unknown>,
      meta: { callId: string; attachImage?: (image: unknown) => void }
    ) => unknown;
  }): void;
  setContext(context: WidgetContext): void;
  onToolCall(listener: (call: ToolCallEvent) => void): () => void;
  setTheme(theme: WidgetTheme): void;
  show(): void;
  hide(): void;
  toggle(): void;
  destroy(): void;
}
