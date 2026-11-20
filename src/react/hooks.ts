import { useEffect, useRef } from "react";
import {
  onToolCall,
  registerTool,
  setContext,
  type HostTool,
  type ToolCallEvent,
  type WidgetContext,
} from "@bookingbutler/widget";

/**
 * Offers the agent a tool while this component is mounted, calling the
 * latest `handler` each time (no stale closures).
 *
 * Tools are sent when the visitor opens the chat. Mount the component
 * before then; a tool registered later is offered from the next page load.
 * The widget has no way to withdraw a tool, so it stays offered after
 * unmount; its handler then answers that it is not available here.
 */
export function useHostTool<Args = Record<string, unknown>>(
  tool: HostTool<Args>
): void {
  const handler = useRef(tool.handler);
  handler.current = tool.handler;
  const mounted = useRef(false);
  const shape = JSON.stringify([tool.name, tool.description, tool.parameters]);

  useEffect(() => {
    mounted.current = true;
    registerTool<Args>({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      handler: (args, meta) => {
        if (!mounted.current)
          throw new Error(`${tool.name} is not available on this screen.`);
        return handler.current(args, meta);
      },
    });
    return () => {
      mounted.current = false;
    };
    // Registered again only when what the agent is told changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape]);
}

/**
 * Keeps the agent told where the visitor is. Sent again when `context`
 * changes as JSON, so pass the facts themselves (a new object each render
 * is fine). At most 4 KB of `data`.
 */
export function useWidgetContext(context: WidgetContext | undefined): void {
  const json = context === undefined ? "" : JSON.stringify(context);
  useEffect(() => {
    if (json) setContext(JSON.parse(json) as WidgetContext);
  }, [json]);
}

/** Hears each call the agent makes to one of the page's tools. */
export function useToolCalls(listener: (call: ToolCallEvent) => void): void {
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => onToolCall((call) => latest.current(call)), []);
}
