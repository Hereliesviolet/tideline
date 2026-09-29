"use client";

import * as React from "react";
import * as ReactDOM from "react-dom";
import { cn } from "@/lib/utils";
import { Z } from "@/lib/timelineTokens";

interface SimplePopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end" | "center";
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Open on hover (mouse enter) instead of click */
  hover?: boolean;
}

export function SimplePopover({
  trigger,
  children,
  align = "end",
  className,
  open: controlledOpen,
  onOpenChange,
  hover = false,
}: SimplePopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<number | null>(null);
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);

  // Compute fixed position whenever open changes
  React.useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const GAP = 6;
    let left: number;
    if (align === "start") {
      left = rect.left;
    } else if (align === "end") {
      left = rect.right - 224; // 224px default width (w-56)
    } else {
      left = rect.left + rect.width / 2 - 112;
    }
    setPosition({ top: rect.bottom + GAP, left: Math.max(8, left) });
  }, [open, align]);

  // Close on outside click or Escape
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        popoverRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  const hoverHandlers = hover
    ? {
        onMouseEnter: () => {
          if (closeTimer.current) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
          }
          setOpen(true);
        },
        onMouseLeave: () => {
          closeTimer.current = window.setTimeout(() => setOpen(false), 120);
        },
      }
    : {};

  const popoverEl =
    open && position
      ? ReactDOM.createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              backgroundColor: "var(--popover)",
              color: "var(--popover-foreground)",
              zIndex: Z.popover,
            }}
            className={cn(
              "rounded-lg border p-2.5 text-sm shadow-md ring-1 ring-foreground/10 outline-none",
              className,
            )}
            {...(hover
              ? {
                  onMouseEnter: () => {
                    if (closeTimer.current) window.clearTimeout(closeTimer.current);
                  },
                  onMouseLeave: () => {
                    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
                  },
                }
              : {})}
          >
            {children}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative inline-flex" {...hoverHandlers}>
      <span
        ref={triggerRef}
        onClick={() => {
          if (!hover) setOpen(!open);
        }}
        className="inline-flex"
      >
        {trigger}
      </span>
      {popoverEl}
    </div>
  );
}
