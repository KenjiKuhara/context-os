"use client";

/**
 * データ更新状態をファビコンで可視化する。
 * pendingCount > 0 の間はスピナー、0 になった直後に失敗なら一瞬だけ赤×、その後元の favicon に戻す。
 */

import { useEffect, useRef } from "react";
import { useSyncExternalStore } from "react";
import { subscribe, getSnapshot, clearFailure } from "@/lib/mutationFaviconStore";

const SIZE = 32;
const ERROR_DURATION_MS = 600;

function getLinkElement(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) return link;
  const newLink = document.createElement("link");
  newLink.rel = "icon";
  document.head.appendChild(newLink);
  return newLink;
}

function drawSpinner(ctx: CanvasRenderingContext2D, t: number): void {
  const r = SIZE / 2;
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(r, r, r - 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineCap = "round";
  const start = (t / 1000) * Math.PI * 2;
  ctx.beginPath();
  ctx.arc(r, r, r - 4, start, start + Math.PI * 1.2);
  ctx.stroke();
}

function drawError(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = "#c62828";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  const pad = 6;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(SIZE - pad, SIZE - pad);
  ctx.moveTo(SIZE - pad, pad);
  ctx.lineTo(pad, SIZE - pad);
  ctx.stroke();
}

export function FaviconUpdater() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [pendingCount, lastFailure] = snapshot;
  const originalHrefRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const link = getLinkElement();
    if (!link) return;

    if (originalHrefRef.current === null) {
      originalHrefRef.current = link.getAttribute("href") || "/favicon.ico";
    }
    const originalHref = originalHrefRef.current;

    const setFavicon = (href: string) => {
      link.setAttribute("href", href);
    };

    const restore = () => {
      setFavicon(originalHref);
    };

    if (pendingCount > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const tick = () => {
        drawSpinner(ctx, Date.now());
        setFavicon(canvas.toDataURL("image/png"));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      return () => {
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        restore();
      };
    }

    if (pendingCount === 0 && lastFailure) {
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        drawError(ctx);
        setFavicon(canvas.toDataURL("image/png"));
      }
      errorTimeoutRef.current = setTimeout(() => {
        restore();
        clearFailure();
        errorTimeoutRef.current = null;
      }, ERROR_DURATION_MS);

      return () => {
        if (errorTimeoutRef.current != null) {
          clearTimeout(errorTimeoutRef.current);
          errorTimeoutRef.current = null;
        }
        restore();
      };
    }

    restore();
    return () => {};
  }, [pendingCount, lastFailure]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (errorTimeoutRef.current != null) {
        clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = null;
      }
      const link = getLinkElement();
      if (link && originalHrefRef.current !== null) {
        link.setAttribute("href", originalHrefRef.current);
      }
    };
  }, []);

  return null;
}
