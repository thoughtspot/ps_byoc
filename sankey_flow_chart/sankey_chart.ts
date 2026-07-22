/**
 * Custom Sankey / Flow chart for ThoughtSpot BYOC, built with Apache ECharts.
 *
 * Renders a status-coloured flow diagram (e.g. Leads -> Bookings -> Jobs ->
 * Invoices, with loss branches such as Lost / Cancelled / Unpaid). Nodes are
 * coloured by an optional "status" attribute (On track / Watch / Below target).
 *
 * BYOC integrations wired in this file:
 *   - Column mapping config panel (chartConfigEditorDefinition)
 *   - Visual props editor, incl. per-column settings (columnsVizPropDefinition
 *     via the function-form VisualEditorDefinitionSetter)
 *   - Native column number / conditional formatting + gradient (allowedConfigurations)
 *   - Config validation (validateConfig)
 *   - Sorting (reads chartModel.sortInfo to order nodes)
 *   - Right-click drill-down (OpenContextMenu) that always uses the CURRENT
 *     column mapping (no stale closure)
 *
 * ECharts and numeral are loaded from CDN <script> tags in index.html (matching
 * the pattern the other charts in this repo use for Highcharts), so they are
 * referenced here as the globals `echarts` and `numeral`.
 */
import {
    ChartToTSEvent,
    ColumnType,
    getChartContext,
    CustomChartContext,
    ChartModel,
    ChartConfig,
    DataPointsArray,
    Query,
    ChartColumn,
} from '@thoughtspot/ts-chart-sdk';
import _ from 'lodash';
// Bundled (NOT loaded from a CDN): ThoughtSpot serves this chart under a
// `default-src 'self'` CSP, which blocks external <script> tags. Importing here
// makes ECharts + numeral part of the same-origin bundle so they always load.
import * as echarts from 'echarts';
import numeral from 'numeral';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface SankeyVisualProps {
    orient?: string; // 'horizontal' | 'vertical'
    numberFormat?: string;
    showValuesInLabel?: boolean;
    nodeWidth?: number;
    nodeGap?: number;
    nodeAlign?: string; // 'justify' | 'left' | 'right'
    linkOpacity?: number; // 0 - 100
    linkCurveness?: number; // 0 - 1
    linkColorMode?: string; // 'gradient' | 'source' | 'target'
    colorOnTrack?: string;
    colorWatch?: string;
    colorBelowTarget?: string;
    statusColorOverrides?: string; // "Status Name:#hex, Other:#hex"
    // Per-column settings are stored keyed by column id (see getColumnNumberFormat)
    [key: string]: any;
}

interface SankeyLink {
    source: string;
    target: string;
    value: number;
    status?: string;
    tooltipData: Array<{ columnName: string; value: any }>;
}

interface DataModel {
    nodeOrder: string[];
    nodeStatus: Record<string, string | undefined>;
    links: SankeyLink[];
    columns: {
        sourceCol?: ChartColumn;
        targetCol?: ChartColumn;
        valueCol?: ChartColumn;
        statusCol?: ChartColumn;
    };
}

/* -------------------------------------------------------------------------- */
/* Constants & module state                                                   */
/* -------------------------------------------------------------------------- */

const DEFAULT_STATUS_COLORS: Record<string, string> = {
    'on track': '#63C9A0',
    watch: '#E8B84B',
    'below target': '#E5807A',
};
const FALLBACK_PALETTE = [
    '#63C9A0', '#E8B84B', '#E5807A', '#6C8EBF', '#B39DDB',
    '#4DB6AC', '#F0A868', '#9CCC65', '#7986CB', '#E57373',
];
const DEFAULT_FALLBACK_COLOR = '#8C9AA5';

let chartInstance: any = null;
// Kept up to date on every render so the (once-bound) context-menu handler
// always reads the CURRENT column mapping instead of a stale closure.
let currentModel: DataModel | null = null;
let currentCtx: CustomChartContext | null = null;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatNumber(value: number, format: string): string {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    try {
        return numeral(value)
            .format(format || '0.[0]a')
            .replace('k', 'K')
            .replace('m', 'M')
            .replace('b', 'B');
    } catch (e) {
        console.error('Error formatting number:', e);
        return String(value);
    }
}

/**
 * Resolve the number format for a given column. Precedence:
 *   1. Custom per-column setting (columnsVizPropDefinition) stored in visualProps
 *   2. Native TS column number format (allowColumnNumberFormatting)
 *   3. Global numberFormat visual prop
 * The exact storage path for (1)/(2) can vary by TS version, so we probe a few
 * known locations defensively and log what we find to ease verification.
 */
function getColumnNumberFormat(
    chartModel: ChartModel,
    columnId: string | undefined,
    fallback: string,
): string {
    if (!columnId) return fallback;
    const vp: any = chartModel.visualProps ?? {};
    const perColumn =
        vp?.[columnId]?.numberFormat ??
        vp?.columnSettings?.[columnId]?.numberFormat ??
        vp?.columnsVizProps?.[columnId]?.numberFormat;
    if (perColumn) return perColumn;

    // Native column format (shape differs across versions - probe common ones)
    const col: any = chartModel.columns?.find((c) => c.id === columnId);
    const nativeFmt =
        col?.format?.pattern ??
        col?.numberFormatting?.pattern ??
        col?.columnProperties?.numberFormat?.pattern;
    if (nativeFmt) return nativeFmt;

    return fallback;
}

function buildStatusColorMap(vp: SankeyVisualProps): Record<string, string> {
    const map: Record<string, string> = { ...DEFAULT_STATUS_COLORS };
    if (vp.colorOnTrack) map['on track'] = vp.colorOnTrack;
    if (vp.colorWatch) map['watch'] = vp.colorWatch;
    if (vp.colorBelowTarget) map['below target'] = vp.colorBelowTarget;
    if (vp.statusColorOverrides) {
        vp.statusColorOverrides.split(',').forEach((pair) => {
            const [rawName, rawColor] = pair.split(':');
            if (rawName && rawColor) {
                map[rawName.trim().toLowerCase()] = rawColor.trim();
            }
        });
    }
    return map;
}

function colorForNode(
    status: string | undefined,
    statusColorMap: Record<string, string>,
    uniqueStatuses: string[],
    nodeIndex: number,
): string {
    if (status) {
        const key = String(status).toLowerCase();
        if (statusColorMap[key]) return statusColorMap[key];
        const idx = uniqueStatuses.indexOf(status);
        return FALLBACK_PALETTE[(idx >= 0 ? idx : nodeIndex) % FALLBACK_PALETTE.length];
    }
    // No status value for this node — colour by node position so the chart is
    // never flat grey (this is the default when no Status column is mapped).
    return FALLBACK_PALETTE[nodeIndex % FALLBACK_PALETTE.length];
}

/**
 * Normalise chartModel.sortInfo (untyped in the SDK) into { columnId, asc }.
 * Handles the common runtime shapes; returns null when nothing usable is found.
 */
function normaliseSortInfo(
    sortInfo: any,
): { columnId: string; asc: boolean } | null {
    if (!sortInfo) return null;
    const entry = Array.isArray(sortInfo) ? sortInfo[0] : sortInfo;
    if (!entry) return null;

    const columnId =
        entry.columnId ??
        entry.column?.id ??
        entry.sortColumnId ??
        entry.colId;
    if (!columnId) return null;

    const rawDir = entry.sortType ?? entry.order ?? entry.direction;
    let asc: boolean;
    if (typeof entry.asc === 'boolean') asc = entry.asc;
    else if (typeof rawDir === 'string') asc = /asc/i.test(rawDir);
    else asc = true;

    return { columnId, asc };
}

/**
 * Reorder nodes according to TS sort state:
 *   - sorted on the value measure  -> order nodes by total flow value
 *   - sorted on an attribute column -> order nodes alphabetically
 * Falls back to first-appearance (data) order.
 */
function applySort(model: DataModel, sortInfo: any): string[] {
    const sort = normaliseSortInfo(sortInfo);
    if (!sort) return model.nodeOrder;

    const { valueCol, sourceCol, targetCol } = model.columns;
    const totals: Record<string, number> = {};
    model.nodeOrder.forEach((n) => {
        const out = model.links
            .filter((l) => l.source === n)
            .reduce((s, l) => s + l.value, 0);
        const inc = model.links
            .filter((l) => l.target === n)
            .reduce((s, l) => s + l.value, 0);
        totals[n] = out || inc;
    });

    const sorted = [...model.nodeOrder];
    if (sort.columnId === valueCol?.id) {
        sorted.sort((a, b) => totals[a] - totals[b]);
    } else if (
        sort.columnId === sourceCol?.id ||
        sort.columnId === targetCol?.id
    ) {
        sorted.sort((a, b) => a.localeCompare(b));
    } else {
        return model.nodeOrder;
    }
    return sort.asc ? sorted : sorted.reverse();
}

/* -------------------------------------------------------------------------- */
/* Data model                                                                 */
/* -------------------------------------------------------------------------- */

function getDataModel(chartModel: ChartModel): DataModel {
    const dimensions = chartModel.config?.chartConfig?.[0]?.dimensions ?? [];
    const dimBy = (key: string) =>
        dimensions.find((d) => d.key === key)?.columns ?? [];

    const sourceCol = dimBy('source')[0];
    const targetCol = dimBy('target')[0];
    const valueCol = dimBy('value')[0];
    const statusCol = dimBy('status')[0];
    const tooltipCols = dimBy('tooltip');

    // Guard: chartModel.data can be undefined on an early render — accessing
    // .length directly (without ?.) would throw before the ?? fallback.
    const dataSets = chartModel.data ?? [];
    const dataArr: DataPointsArray =
        (dataSets.length ? dataSets[dataSets.length - 1]?.data : undefined) ?? {
            columns: [],
            dataValue: [],
        };

    const colIdx = (col?: ChartColumn) =>
        col ? dataArr.columns.indexOf(col.id) : -1;
    const sIdx = colIdx(sourceCol);
    const tIdx = colIdx(targetCol);
    const vIdx = colIdx(valueCol);
    const stIdx = colIdx(statusCol);

    const links: SankeyLink[] = [];
    const nodeOrder: string[] = [];
    const seenNode = new Set<string>();
    const nodeStatusAsTarget: Record<string, string> = {};
    const nodeStatusAsSource: Record<string, string> = {};

    const pushNode = (name: string) => {
        if (!seenNode.has(name)) {
            seenNode.add(name);
            nodeOrder.push(name);
        }
    };

    dataArr.dataValue.forEach((row) => {
        const source = sIdx >= 0 ? String(row[sIdx] ?? '') : '';
        const target = tIdx >= 0 ? String(row[tIdx] ?? '') : '';
        const value = vIdx >= 0 ? Math.abs(Number(row[vIdx]) || 0) : 0;
        const status = stIdx >= 0 ? String(row[stIdx] ?? '') : undefined;
        if (!source || !target) return;

        pushNode(source);
        pushNode(target);
        if (status) {
            nodeStatusAsTarget[target] = status;
            if (!nodeStatusAsSource[source]) nodeStatusAsSource[source] = status;
        }

        const tooltipData = tooltipCols.map((col) => {
            const idx = dataArr.columns.indexOf(col.id);
            return { columnName: col.name, value: idx >= 0 ? row[idx] : 'N/A' };
        });

        links.push({ source, target, value, status, tooltipData });
    });

    const nodeStatus: Record<string, string | undefined> = {};
    nodeOrder.forEach((name) => {
        nodeStatus[name] = nodeStatusAsTarget[name] ?? nodeStatusAsSource[name];
    });

    return {
        nodeOrder,
        nodeStatus,
        links,
        columns: { sourceCol, targetCol, valueCol, statusCol },
    };
}

/* -------------------------------------------------------------------------- */
/* Render                                                                     */
/* -------------------------------------------------------------------------- */

function render(ctx: CustomChartContext) {
    const chartModel = ctx.getChartModel();
    const vp = (chartModel.visualProps as SankeyVisualProps) ?? {};
    const globalFormat = vp.numberFormat || '0.[0]a';

    const model = getDataModel(chartModel);
    currentModel = model; // keep the drill-down handler current
    currentCtx = ctx;

    // Sorting: order nodes per TS sort state.
    const nodeOrder = applySort(model, chartModel.sortInfo);

    // Per-column number format for the value measure (falls back to global).
    const valueFormat = getColumnNumberFormat(
        chartModel,
        model.columns.valueCol?.id,
        globalFormat,
    );

    const statusColorMap = buildStatusColorMap(vp);
    const uniqueStatuses = _.uniq(
        Object.values(model.nodeStatus).filter(Boolean) as string[],
    );

    const nodes = nodeOrder.map((name, i) => {
        const status = model.nodeStatus[name];
        return {
            name,
            itemStyle: {
                color: colorForNode(status, statusColorMap, uniqueStatuses, i),
                borderWidth: 0,
                borderRadius: 4,
            },
            _status: status,
        };
    });

    const linkOpacity = (vp.linkOpacity ?? 40) / 100;
    const colorMode = vp.linkColorMode || 'gradient';
    const links = model.links.map((l) => ({
        source: l.source,
        target: l.target,
        value: l.value,
        _status: l.status,
        _tooltipData: l.tooltipData,
        lineStyle: {
            color: colorMode,
            opacity: linkOpacity,
            curveness: vp.linkCurveness ?? 0.5,
        },
    }));

    const showValues = vp.showValuesInLabel ?? true;

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'item',
            triggerOn: 'mousemove',
            confine: true,
            backgroundColor: '#3A3F48',
            borderColor: '#3A3F48',
            textStyle: { color: '#FFFFFF', fontSize: 12 },
            formatter: (params: any) => {
                if (params.dataType === 'edge') {
                    const d = params.data;
                    let html = `<b>${d.source} &rarr; ${d.target}</b><br/>`;
                    html += `${model.columns.valueCol?.name ?? 'Value'}: <b>${formatNumber(
                        d.value,
                        valueFormat,
                    )}</b>`;
                    if (d._status) html += `<br/>Status: ${d._status}`;
                    (d._tooltipData ?? []).forEach(
                        (t: { columnName: string; value: any }) => {
                            html += `<br/>${t.columnName}: ${t.value}`;
                        },
                    );
                    return html;
                }
                const status = params.data?._status;
                return `<b>${params.name}</b>` + (status ? `<br/>Status: ${status}` : '');
            },
        },
        series: [
            {
                type: 'sankey',
                left: '3%',
                right: '9%',
                top: '5%',
                bottom: '10%',
                orient: vp.orient || 'horizontal',
                nodeWidth: vp.nodeWidth ?? 22,
                nodeGap: vp.nodeGap ?? 14,
                nodeAlign: vp.nodeAlign || 'justify',
                // Keep our sorted input order (don't let ECharts re-sort layers).
                layoutIterations: 0,
                draggable: false,
                emphasis: { focus: 'adjacency' },
                label: {
                    show: true,
                    color: '#2B2F36',
                    fontSize: 12,
                    fontWeight: 500,
                    formatter: (params: any) => {
                        if (!showValues) return params.name;
                        const out = model.links
                            .filter((l) => l.source === params.name)
                            .reduce((s, l) => s + l.value, 0);
                        const inc = model.links
                            .filter((l) => l.target === params.name)
                            .reduce((s, l) => s + l.value, 0);
                        const total = out || inc;
                        return `{name|${params.name}}\n{val|${formatNumber(
                            total,
                            valueFormat,
                        )}}`;
                    },
                    rich: {
                        name: { fontSize: 12, fontWeight: 600, color: '#2B2F36' },
                        val: { fontSize: 11, color: '#6B7280', padding: [2, 0, 0, 0] },
                    },
                },
                lineStyle: { color: 'gradient', curveness: vp.linkCurveness ?? 0.5 },
                data: nodes,
                links,
            },
        ],
    };

    if (!chartInstance) {
        chartInstance = echarts.init(document.getElementById('chart'));

        // Suppress the browser menu so TS's own menu can show.
        chartInstance.getZr().on('contextmenu', (e: any) => {
            e.event?.preventDefault?.();
        });

        // Bind ONCE; read module-level currentModel/currentCtx so drill-down
        // always uses the latest column mapping (fixes the stale-closure bug).
        chartInstance.on('contextmenu', (params: any) => {
            const nativeEvent = params.event?.event;
            if (nativeEvent) nativeEvent.preventDefault();
            if (!currentModel || !currentCtx) return;
            const { sourceCol, targetCol, valueCol } = currentModel.columns;

            const tuple: Array<{ columnId: string; value: any }> = [];
            if (params.dataType === 'edge') {
                if (sourceCol)
                    tuple.push({ columnId: sourceCol.id, value: params.data.source });
                if (targetCol)
                    tuple.push({ columnId: targetCol.id, value: params.data.target });
                if (valueCol)
                    tuple.push({ columnId: valueCol.id, value: params.data.value });
            } else {
                const col = sourceCol ?? targetCol;
                if (col) tuple.push({ columnId: col.id, value: params.name });
            }
            if (!tuple.length) return;

            currentCtx.emitEvent(ChartToTSEvent.OpenContextMenu, {
                event: {
                    clientX: nativeEvent?.clientX ?? 0,
                    clientY: nativeEvent?.clientY ?? 0,
                },
                clickedPoint: { tuple },
            });
        });
    }

    chartInstance.setOption(option, true);
    chartInstance.resize();
}

const renderChart = async (ctx: CustomChartContext) => {
    try {
        await ctx.emitEvent(ChartToTSEvent.RenderStart);
        render(ctx);
    } catch (error) {
        console.error('Error during Sankey render:', error);
        await ctx.emitEvent(ChartToTSEvent.RenderError, { hasError: true, error });
    } finally {
        await ctx.emitEvent(ChartToTSEvent.RenderComplete);
    }
};

/* -------------------------------------------------------------------------- */
/* Visual prop editor (function-form: enables per-column settings)            */
/* -------------------------------------------------------------------------- */

const BASE_PROP_ELEMENTS = [
    {
        key: 'general',
        type: 'section' as const,
        label: 'General',
        layoutType: 'accordion' as const,
        isAccordianExpanded: true,
        children: [
            {
                key: 'orient',
                type: 'dropdown' as const,
                label: 'Orientation',
                defaultValue: 'horizontal',
                values: ['horizontal', 'vertical'],
            },
            {
                key: 'numberFormat',
                type: 'text' as const,
                label: 'Number Format (global default)',
                defaultValue: '0.[0]a',
            },
            {
                key: 'showValuesInLabel',
                type: 'checkbox' as const,
                label: 'Show values under node labels',
                defaultValue: true,
            },
        ],
    },
    {
        key: 'nodesLinks',
        type: 'section' as const,
        label: 'Nodes & Links',
        layoutType: 'accordion' as const,
        children: [
            { key: 'nodeWidth', type: 'number' as const, label: 'Node width', defaultValue: 22 },
            { key: 'nodeGap', type: 'number' as const, label: 'Gap between nodes', defaultValue: 14 },
            {
                key: 'nodeAlign',
                type: 'dropdown' as const,
                label: 'Node alignment',
                defaultValue: 'justify',
                values: ['justify', 'left', 'right'],
            },
            {
                key: 'linkColorMode',
                type: 'dropdown' as const,
                label: 'Link colour',
                defaultValue: 'gradient',
                values: ['gradient', 'source', 'target'],
            },
            { key: 'linkOpacity', type: 'number' as const, label: 'Link opacity (0-100)', defaultValue: 40 },
            { key: 'linkCurveness', type: 'number' as const, label: 'Link curveness (0-1)', defaultValue: 0.5 },
        ],
    },
    {
        key: 'statusColors',
        type: 'section' as const,
        label: 'Status Colours',
        layoutType: 'accordion' as const,
        children: [
            { key: 'colorOnTrack', type: 'colorpicker' as const, label: 'On track', defaultValue: '#63C9A0' },
            { key: 'colorWatch', type: 'colorpicker' as const, label: 'Watch', defaultValue: '#E8B84B' },
            { key: 'colorBelowTarget', type: 'colorpicker' as const, label: 'Below target', defaultValue: '#E5807A' },
            {
                key: 'statusColorOverrides',
                type: 'text' as const,
                label: 'Extra status colours ("Name:#hex, Name:#hex")',
                placeholder: 'At risk:#F0A868, Won:#4DB6AC',
            },
        ],
    },
];

/**
 * Build per-column settings for every MEASURE column in the current config
 * (the value measure + any tooltip measures). Each gets its own number-format
 * text box, stored in visualProps keyed by column id.
 */
function buildMeasureColumnSettings(chartModel: ChartModel) {
    const dims = chartModel.config?.chartConfig?.[0]?.dimensions ?? [];
    const measureCols: ChartColumn[] = [];
    dims.forEach((d) => {
        (d.columns ?? []).forEach((c) => {
            if (c.type === ColumnType.MEASURE) measureCols.push(c);
        });
    });

    const columnSettingsDefinition: Record<string, { elements: any[] }> = {};
    measureCols.forEach((c) => {
        columnSettingsDefinition[c.id] = {
            elements: [
                {
                    key: 'numberFormat',
                    type: 'text',
                    label: `Number format — ${c.name}`,
                    defaultValue: '0.[0]a',
                },
            ],
        };
    });
    return columnSettingsDefinition;
}

/* -------------------------------------------------------------------------- */
/* SDK wiring                                                                 */
/* -------------------------------------------------------------------------- */

(async () => {
    const ctx = await getChartContext({
        getDefaultChartConfig: (chartModel: ChartModel): ChartConfig[] => {
            const cols = chartModel.columns;
            const attributeColumns = cols.filter((c) => c.type === ColumnType.ATTRIBUTE);
            const measureColumns = cols.filter((c) => c.type === ColumnType.MEASURE);
            if (attributeColumns.length < 2 || measureColumns.length < 1) return [];

            return [
                {
                    key: 'sankey',
                    dimensions: [
                        { key: 'source', columns: [attributeColumns[0]] },
                        { key: 'target', columns: [attributeColumns[1]] },
                        { key: 'value', columns: [measureColumns[0]] },
                        { key: 'status', columns: attributeColumns[2] ? [attributeColumns[2]] : [] },
                        { key: 'tooltip', columns: measureColumns.slice(1) },
                    ],
                },
            ];
        },
        getQueriesFromChartConfig: (chartConfig: ChartConfig[]): Array<Query> =>
            chartConfig.map((config) =>
                config.dimensions.reduce(
                    (acc: Query, dimension) => ({
                        queryColumns: [...acc.queryColumns, ...dimension.columns],
                    }),
                    { queryColumns: [] } as Query,
                ),
            ),
        renderChart,
        // Reject unusable / nonsensical configs with a helpful message.
        validateConfig: (updatedConfig: ChartConfig[], _chartModel: ChartModel) => {
            const dims = updatedConfig?.[0]?.dimensions ?? [];
            const get = (k: string) => dims.find((d) => d.key === k)?.columns ?? [];
            const errors: string[] = [];
            if (!get('source').length) errors.push('Add a Source (from) column.');
            if (!get('target').length) errors.push('Add a Target (to) column.');
            if (!get('value').length) errors.push('Add a Flow value measure.');
            const s = get('source')[0]?.id;
            const t = get('target')[0]?.id;
            if (s && t && s === t) {
                errors.push('Source and Target must be different columns.');
            }
            return errors.length
                ? { isValid: false, validationErrorMessage: errors }
                : { isValid: true };
        },
        // Native TS column-level formatting / conditional formatting / gradient.
        allowedConfigurations: {
            allowColumnNumberFormatting: true,
            allowColumnConditionalFormatting: true,
            allowGradientColoring: true,
            allowMeasureNamesAndValues: false,
        },
        chartConfigEditorDefinition: [
            {
                key: 'sankey',
                label: 'Sankey Flow Configuration',
                descriptionText:
                    'Source and Target define the flow between nodes; Value sizes each flow. Add an optional Status attribute to colour nodes (e.g. On track / Watch / Below target).',
                columnSections: [
                    {
                        key: 'source',
                        label: 'Source (from) node',
                        allowAttributeColumns: true,
                        allowMeasureColumns: false,
                        allowTimeSeriesColumns: true,
                        maxColumnCount: 1,
                    },
                    {
                        key: 'target',
                        label: 'Target (to) node',
                        allowAttributeColumns: true,
                        allowMeasureColumns: false,
                        allowTimeSeriesColumns: true,
                        maxColumnCount: 1,
                    },
                    {
                        key: 'value',
                        label: 'Flow value (measure)',
                        allowAttributeColumns: false,
                        allowMeasureColumns: true,
                        maxColumnCount: 1,
                    },
                    {
                        key: 'status',
                        label: 'Status (colour) — optional',
                        allowAttributeColumns: true,
                        allowMeasureColumns: false,
                        maxColumnCount: 1,
                    },
                    {
                        key: 'tooltip',
                        label: 'Tooltip measures — optional',
                        allowAttributeColumns: false,
                        allowMeasureColumns: true,
                    },
                ],
            },
        ],
        // Function form: lets us attach per-column (measure) settings against the
        // live column ids in addition to the base visual props.
        visualPropEditorDefinition: (currentState: ChartModel) => ({
            elements: BASE_PROP_ELEMENTS,
            columnsVizPropDefinition: [
                {
                    type: ColumnType.MEASURE,
                    columnSettingsDefinition: buildMeasureColumnSettings(currentState),
                },
            ],
        }),
    });

    window.addEventListener('resize', () => {
        if (chartInstance) chartInstance.resize();
    });

    renderChart(ctx);
})();
