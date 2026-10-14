import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, SankeyChart } from "echarts/charts";
import {
    DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent, VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

import { cn } from "@/lib/utils";

echarts.use([
    BarChart, LineChart, SankeyChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent,
    MarkAreaComponent, DataZoomComponent, VisualMapComponent, CanvasRenderer,
]);

/** Prism's shadcn tokens as colours a canvas understands. */
export interface ChartTheme {
    foreground: string;
    muted: string;
    border: string;
    card: string;
    primary: string;
    warning: string;
    destructive: string;
    success: string;
    /** Categorical colours, from the System Builder's kind tokens. */
    series: string[];
}

export function chartTheme(element: Element): ChartTheme {
    const style = getComputedStyle(element);
    const token = (name: string, alpha?: number) => {
        const [h, s, l] = style.getPropertyValue(`--${name}`).trim().split(/\s+/);
        if (!h) return "#888";
        return alpha === undefined ? `hsl(${h}, ${s}, ${l})` : `hsla(${h}, ${s}, ${l}, ${alpha})`;
    };
    return {
        foreground: token("foreground"),
        muted: token("muted-foreground"),
        border: token("border"),
        card: token("card"),
        primary: token("primary"),
        warning: token("warning"),
        destructive: token("destructive"),
        success: token("success"),
        series: ["kind-board", "kind-subsystem", "kind-module", "kind-harness", "kind-link"].map((name) => token(name)),
    };
}

/** Axis, tooltip and text defaults in the app's look. */
export function baseOption(theme: ChartTheme): echarts.EChartsCoreOption {
    const axis = {
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: theme.border } },
        nameTextStyle: { color: theme.muted, fontSize: 11 },
    };
    return {
        backgroundColor: "transparent",
        color: theme.series,
        textStyle: { fontFamily: "Inter Variable, Inter, sans-serif", color: theme.foreground, fontSize: 11 },
        tooltip: {
            backgroundColor: theme.card,
            borderColor: theme.border,
            textStyle: { color: theme.foreground, fontSize: 12 },
            extraCssText: "border-radius: 6px; box-shadow: none;",
        },
        xAxis: axis,
        yAxis: axis,
        animationDuration: 250,
    };
}

type Props = {
    /** Builds the option from the theme, so it follows the app's tokens. */
    option: (theme: ChartTheme) => echarts.EChartsCoreOption;
    className?: string;
    onClick?: (params: { name?: string; dataIndex?: number; data?: unknown; seriesName?: string }) => void;
};

/** One ECharts instance that resizes with its box and is themed from Prism's tokens. */
export function EChart({ option, className, onClick }: Props) {
    const host = useRef<HTMLDivElement>(null);
    const chart = useRef<echarts.ECharts | null>(null);
    const click = useRef(onClick);
    click.current = onClick;

    useEffect(() => {
        const element = host.current;
        if (!element) return;
        const instance = echarts.init(element, undefined, { renderer: "canvas" });
        chart.current = instance;
        instance.on("click", (params) => click.current?.(params as Parameters<NonNullable<Props["onClick"]>>[0]));
        const observer = new ResizeObserver(() => instance.resize());
        observer.observe(element);
        instance.setOption(option(chartTheme(element)), true);
        return () => {
            observer.disconnect();
            instance.dispose();
            chart.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; options update below
    }, []);

    useEffect(() => {
        const element = host.current;
        if (chart.current && element) chart.current.setOption(option(chartTheme(element)), true);
    }, [option]);

    return <div ref={host} className={cn("h-full w-full", className)} />;
}
