import { useEffect, useRef, type CSSProperties } from 'react';
import { echarts } from '@lib/charts/echarts-setup';
import type { EChartsType } from 'echarts/core';
import type { EChartsOption } from 'echarts';

type Props = {
  option: EChartsOption;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  onEvents?: Record<string, (params: unknown) => void> | undefined;
};

/**
 * Thin React wrapper around a raw `echarts` instance. Owns lifecycle:
 * init on mount, setOption on option-change, resize via ResizeObserver,
 * dispose on unmount. Does NOT build option objects — consumers pass a
 * complete EChartsOption. Per ADR-0007.
 *
 * Consumers should useMemo their option object so prop-identity changes
 * only when content changes; otherwise setOption fires on every render.
 */
export function EChartsBase({ option, className, style, onEvents }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<EChartsType | null>(null);

  // Init + dispose
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const instance = echarts.init(el);
    instanceRef.current = instance;

    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(el);

    return () => {
      observer.disconnect();
      instance.dispose();
      instanceRef.current = null;
    };
  }, []);

  // Apply option on every change
  useEffect(() => {
    instanceRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  // Attach event handlers. Reattached whenever onEvents identity changes
  // because handlers typically close over state that can change per render.
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !onEvents) return undefined;
    for (const [name, handler] of Object.entries(onEvents)) {
      instance.on(name, handler);
    }
    return () => {
      // Symmetric with .on(name, handler) — pass the handler so we remove
      // only our listener, not any future listener on the same event.
      for (const [name, handler] of Object.entries(onEvents)) {
        instance.off(name, handler);
      }
    };
  }, [onEvents]);

  return (
    <div
      ref={hostRef}
      data-testid="echarts-base"
      // Canvas-rendered chart content is opaque to screen readers. Mark
      // as decorative; the surrounding <section aria-labelledby> and
      // the parent MetricCard grid carry the semantic information.
      aria-hidden
      className={className}
      style={style}
    />
  );
}
