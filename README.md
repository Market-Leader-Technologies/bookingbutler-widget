# @bookingbutler/widget

Put the BookingButler chat widget on any website, and give its agent tools
that your page performs: "add this to the cart", "show me the design",
"switch to dark mode". The agent can also see pictures your page attaches,
such as the canvas it just changed.

- **`@bookingbutler/widget`**: the framework-free core. A typed loader for
  `widget.js`, host tools with pictures, page context, and image helpers.
  No runtime dependencies, and nothing touched at import time (safe for
  server rendering).
- **`@bookingbutler/widget/react`**: a component and hooks for React 18+.
  Built for Next.js app router; every file is `"use client"`.

The package is a thin, typed layer. The widget itself (`v1/widget.js` and
the chat it opens) is served by BookingButler, so fixes reach your site
without a package upgrade.

## Install

```bash
npm install @bookingbutler/widget
# or: pnpm add @bookingbutler/widget
```

You need five values from the widget's embed snippet (Bots → your bot →
Widget → Embed):

| Value            | Snippet attribute      |
| ---------------- | ---------------------- |
| `botId`          | `data-bot-id`          |
| `widgetId`       | `data-widget-id`       |
| `organizationId` | `data-organization-id` |
| `apiKey`         | `data-api-key`         |
| `apiKeyId`       | `data-api-key-id`      |

The key identifies the widget, the same as the snippet does, and is not a
secret: it is in every page that shows the chat.

Two values are optional:

- **`baseUrl`**: where `widget.js` is served. It defaults to production,
  `https://widgets.bookingbutler.ai`; set it only for dev or staging.
- **`theme`**: `light` (the default), `dark` or `auto`.

## Quick start

```ts
import { loadWidget, registerTool, setContext } from "@bookingbutler/widget";

registerTool({
  name: "add_to_cart",
  description:
    "Adds a product to the visitor's cart. Use when they ask to buy.",
  parameters: {
    type: "object",
    properties: { sku: { type: "string" }, quantity: { type: "integer" } },
    required: ["sku"],
  },
  handler: async ({ sku, quantity = 1 }) => {
    await cart.add(String(sku), Number(quantity));
    return { ok: true, itemsInCart: cart.count() };
  },
});

setContext({ data: { product: "Ceramic mug", sku: "MUG-01" } });

await loadWidget({
  botId: "…",
  widgetId: "…",
  organizationId: "…",
  apiKey: "…",
  apiKeyId: "…",
});
```

Calls made before `widget.js` has loaded wait in order and run when it
starts. Calls made afterwards run at once.

### React and Next.js

```tsx
"use client";
import {
  BookingButlerWidget,
  useHostTool,
  useWidgetContext,
} from "@bookingbutler/widget/react";

function ProductPage({ product }) {
  useWidgetContext({ data: { product: product.name, sku: product.sku } });
  useHostTool({
    name: "add_to_cart",
    description: "Adds this product to the cart.",
    handler: () => cart.add(product.sku), // always the latest props
  });
  return …;
}

export default function Layout({ children }) {
  return (
    <>
      {children}
      <BookingButlerWidget
        botId="…"
        widgetId="…"
        organizationId="…"
        apiKey="…"
        apiKeyId="…"
        onError={(e) => console.error(e)}
      />
    </>
  );
}
```

- **`<BookingButlerWidget>`** renders nothing itself; `widget.js` draws the
  launcher. Mount it once, in the root layout, so the chat survives route
  changes. `destroyOnUnmount` removes the widget when the component goes.
- **`useHostTool(tool)`** registers on mount and always calls the latest
  handler. The widget cannot withdraw a tool, so after unmount it stays
  offered, and its handler answers that it is not available on this
  screen.
- **`useWidgetContext(context)`** sends again only when the context changes
  as JSON. A new object on every render is fine.
- **`useToolCalls(listener)`** hears each tool call, for example to show
  "the assistant is changing your design".

## Host tools

A tool's handler gets `(args, meta)`:

- **`args`**: the agent's arguments, shaped by your `parameters` schema.
- **`meta.callId`**: the call's id.
- **`meta.attachImage(image)`**: shows the agent a picture with this
  result (see the next section).
- **`meta.imagesSupported`**: whether the loaded `widget.js` sends
  pictures.

What the handler returns, plain JSON or a promise of it, is what the agent
reads. A throw is reported to the agent as the tool's error, so throw an
error whose message says what went wrong and what to do about it.

The rules:

- **Register before the visitor opens the chat.** Tools are sent when the
  chat session starts, which is the first time the visitor opens it. A tool
  registered later is offered from the next page load.
- **Names:** lowercase letters, digits and underscores, starting with a
  letter, at most 48. `registerTool` throws on a name the server would
  refuse.
- **At most 20 tools a page.** Over that, the server refuses the whole list.
- **Describe when to use the tool**, not only what it does. The description
  is all the agent chooses by.
- **Return small results.** Return the facts the agent needs next, not a
  copy of your state: every result is read on every later turn.

## Letting the agent see: pictures

Call `attachImage` before the handler returns, and await the picture first.
A picture attached after the handler has returned is not sent, and the
console says so.

```ts
import { registerTool, toHostImage } from "@bookingbutler/widget";

registerTool({
  name: "studio_screenshot",
  description:
    "Shows you the artboard as the person sees it. Use it to check your work after changing the design.",
  handler: async (_args, { attachImage }) => {
    attachImage(await toHostImage(canvas)); // scaled to 1568 px, PNG, ≤ 3 MB
    return { artboard: 1, widthPx: canvas.width, heightPx: canvas.height };
  },
});
```

**If you render the picture yourself**, as an engine that draws to PNG
bytes does, render it at the right size with `fitWithin` and pass the
bytes. This beats capturing the screen: there is no editor UI in the
picture, no WebGL read-back setting to get right, and the picture is the
same every time.

```ts
import { fitWithin, toHostImage } from "@bookingbutler/widget";

const { width } = fitWithin(artboard.widthPx, artboard.heightPx); // ≤ 1568 on the long side
const png = engine.render_page_png(page, width, false); // Uint8Array
attachImage(await toHostImage(png));
```

| Limit                   | Value                   | In code                 |
| ----------------------- | ----------------------- | ----------------------- |
| Pictures per result     | 4                       | `MAX_IMAGES_PER_RESULT` |
| Size of each picture    | 3 MB, decoded           | `MAX_IMAGE_BYTES`       |
| Types                   | PNG, JPEG, WebP, GIF    | `IMAGE_TYPES`           |
| Longest side            | about 1568 px is enough | `RECOMMENDED_MAX_SIDE`  |
| Pictures the agent sees | its 3 most recent       | `IMAGES_THE_AGENT_SEES` |

`toHostImage` takes a canvas, an `OffscreenCanvas`, an `ImageBitmap`, an
`<img>`, a `Blob` or encoded bytes.

- **Scaling:** it scales down, never up.
- **Too large as PNG:** it encodes again as JPEG, with what was transparent
  turning white.
- **Still too large:** it throws `ImageTooLargeError`.

Attach a picture when the picture matters, not on every call. The agent is
shown only its three most recent pictures, and every picture is billed.

**Checking for support:** a `widget.js` that predates pictures still runs
your tool. `attachImage` then warns once, the result goes without the
picture, and `meta.imagesSupported` is `false`. When the picture is the
whole point, say so in the result:

```ts
if (!imagesSupported)
  return { note: "Pictures are not available on this site yet." };
```

**If the server refuses a picture**, for example because its bytes are not
what its type says, the widget sends the result again without it. The agent
then reads an `imageError` field beside your result. Your handler does not
need to do anything.

## Page context

```ts
setContext({ data: { step: "checkout", cartItems: 3 } });
```

The agent is shown this on every turn as facts about the page, never as
instructions. It replaces what was sent before; `url` and `title` default
to the page's own. Keep it to facts, at most 4 KB as JSON: over that,
`setContext` returns `false` and sends nothing.

## Everything else

| Function                                       | Does                                                         |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `loadWidget(config)`                           | Adds `widget.js` once; resolves with the widget.             |
| `registerTool(tool)`                           | Offers the agent a tool.                                     |
| `setContext(context)`                          | Says where the visitor is.                                   |
| `onToolCall(listener)`                         | Hears each tool call; returns a function to stop.            |
| `setTheme(theme)`                              | `light`, `dark` or `auto`; redraws at once.                  |
| `showWidget()` `hideWidget()` `toggleWidget()` | Opens or closes the chat.                                    |
| `destroyWidget()`                              | Removes it. A later `loadWidget` restores tools and context. |
| `getWidget()`                                  | The loaded widget, or `undefined`.                           |
| `toHostImage(source, options?)`                | A picture ready for `attachImage`.                           |
| `fitWithin(width, height, maxSide?)`           | The size that fits, for a renderer that takes a width.       |

Errors are typed:

- `WidgetConfigError`: a value is missing, listed in `.missing`.
- `WidgetLoadError`: `widget.js` would not load, or did not start.
- `ImageTooLargeError`: a picture is over 3 MB.

### Content Security Policy

A site with a CSP needs these:

- `script-src https://widgets.bookingbutler.ai` for the loader;
- `frame-src https://widgets.bookingbutler.ai` for the chat;
- `connect-src https://api.bookingbutler.ai` only if your own code calls
  the API. The chat itself talks to it from inside its own frame.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

`prepublishOnly` runs all three before `npm publish`.

## Licence

MIT
