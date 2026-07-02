import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, WheelEvent } from "react";
import { resolveWebSocketUrl } from "../lib/api";

interface Frame {
  image: string;
  width: number;
  height: number;
}

interface ProfileEmbeddedViewerProps {
  profileId: string;
  className?: string;
  lazy?: boolean;
}

const KEY_ALIASES: Record<string, string> = {
  " ": "Space",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Backspace: "Backspace",
  Delete: "Delete",
  Enter: "Enter",
  Escape: "Escape",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Tab: "Tab",
};

function buttonName(button: number) {
  if (button === 1) return "middle";
  if (button === 2) return "right";
  return "left";
}

function keyCombo(e: KeyboardEvent<HTMLDivElement>) {
  const key = KEY_ALIASES[e.key] ?? e.key;
  const modifiers = [
    e.ctrlKey ? "Control" : null,
    e.metaKey ? "Meta" : null,
    e.altKey ? "Alt" : null,
    e.shiftKey && e.key.length > 1 ? "Shift" : null,
  ].filter(Boolean);
  return [...modifiers, key].join("+");
}

export function ProfileEmbeddedViewer({
  profileId,
  className = "",
  lazy = true,
}: ProfileEmbeddedViewerProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [connected, setConnected] = useState(false);
  const [isVisible, setIsVisible] = useState(!lazy);

  useEffect(() => {
    if (!lazy) {
      setIsVisible(true);
      return;
    }

    const element = rootRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: "240px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [lazy]);

  useEffect(() => {
    if (!isVisible) {
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
      return;
    }

    setFrame(null);
    setConnected(false);

    const ws = new WebSocket(resolveWebSocketUrl(`/api/profiles/${profileId}/screencast`));
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "frame") {
          setFrame({ image: data.image, width: data.width, height: data.height });
        }
      } catch (err) {
        console.warn("[embedded-viewer] bad frame:", err);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [isVisible, profileId]);

  const send = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  }, []);

  const pointForEvent = useCallback((event: PointerEvent<HTMLDivElement> | WheelEvent<HTMLDivElement>) => {
    if (!frame || !rootRef.current) return null;
    const rect = rootRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.min(
        frame.width,
        Math.max(0, Math.round(((event.clientX - rect.left) / rect.width) * frame.width)),
      ),
      y: Math.min(
        frame.height,
        Math.max(0, Math.round(((event.clientY - rect.top) / rect.height) * frame.height)),
      ),
    };
  }, [frame]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointForEvent(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    send({ type: "mouse", action: "down", ...point, button: buttonName(event.button) });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointForEvent(event);
    if (!point) return;
    send({ type: "mouse", action: "move", ...point, button: buttonName(event.button) });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointForEvent(event);
    if (!point) return;
    event.preventDefault();
    send({ type: "mouse", action: "up", ...point, button: buttonName(event.button) });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    send({ type: "wheel", delta_x: event.deltaX, delta_y: event.deltaY });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!connected) return;
    event.preventDefault();

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
      navigator.clipboard?.readText().then((text) => {
        if (text) send({ type: "text", text });
      }).catch((err) => console.warn("[embedded-viewer] paste failed:", err));
      return;
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      send({ type: "text", text: event.key });
      return;
    }

    send({ type: "press", key: keyCombo(event) });
  };

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      className={`relative overflow-hidden bg-black outline-none focus:ring-2 focus:ring-accent/70 ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {frame ? (
        <img
          src={frame.image}
          alt=""
          draggable={false}
          className="h-full w-full select-none object-fill"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
          {!isVisible ? "滚动到这里后显示画面" : connected ? "加载画面..." : "连接中..."}
        </div>
      )}
      {!connected && frame && (
        <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-xs text-amber-300">
          画面连接中断
        </div>
      )}
    </div>
  );
}
