import { useEffect, useRef } from "react";
import {
  destroyWidget,
  loadWidget,
  setTheme,
  type LoadedWidget,
  type WidgetConfig,
} from "@bookingbutler/widget";

export interface BookingButlerWidgetProps extends WidgetConfig {
  /** When `widget.js` has started. */
  onReady?: (widget: LoadedWidget) => void;
  /** A missing config value, or `widget.js` that would not load. */
  onError?: (error: Error) => void;
  /**
   * Remove the widget when this unmounts. Off by default: the chat usually
   * belongs to the whole site, so keep it across route changes.
   */
  destroyOnUnmount?: boolean;
}

/**
 * Adds the chat widget to the page. Renders nothing itself: the launcher is
 * drawn by `widget.js`. Mount it once, high in the tree, after the
 * components that register tools (`useHostTool`), or anywhere if tools are
 * registered before the visitor opens the chat.
 *
 * The ids are read once; `theme` follows the prop.
 */
export function BookingButlerWidget({
  onReady,
  onError,
  destroyOnUnmount = false,
  ...config
}: BookingButlerWidgetProps) {
  const first = useRef(config);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };

  useEffect(() => {
    let live = true;
    loadWidget(first.current).then(
      (widget) => live && callbacks.current.onReady?.(widget),
      (error: Error) => {
        if (!live) return;
        if (callbacks.current.onError) callbacks.current.onError(error);
        else console.error(error);
      }
    );
    return () => {
      live = false;
      if (destroyOnUnmount) destroyWidget();
    };
  }, [destroyOnUnmount]);

  const mounted = useRef(false);
  useEffect(() => {
    // The first theme went in the snippet; later ones redraw the chat.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (config.theme) setTheme(config.theme);
  }, [config.theme]);

  return null;
}
