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
import Highcharts from 'highcharts';
import numeral from 'numeral';
import _ from 'lodash';
import { AxisMenuActions } from '../types/chart-to-ts-event.types.ts';


// Interface for visualProps
interface VisualProps {
    xAxisTitle?: string;
    yAxisTitle?: string;
    numberFormat?: string;
}

// Initialize global chart reference
let globalChartReference: Highcharts.Chart;

// Helper function for dynamic color generation
const seriesColorMap: Record<string, string> = {};
function generateRandomColor(): string {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `rgba(${r}, ${g}, ${b}, 0.5)`;
}
function getBackgroundColorForSeries(seriesName: string): string {
    if (seriesColorMap[seriesName]) {
        return seriesColorMap[seriesName];
    }
    const color = generateRandomColor();
    seriesColorMap[seriesName] = color;
    console.log(`Generated color for series '${seriesName}':`, color);
    return color;
}

// Function to format numbers with K, M, B notation
function formatNumberWithAbbreviation(value: number): string {
    return numeral(value).format('0.[0]a').toUpperCase();
}

// Function to extract data model from chart model
function getDataModel(chartModel: ChartModel) {
    console.log("Extracting data model from chartModel:", chartModel);
    debugger;

    const configDimensions = chartModel.config?.chartConfig?.[0]?.dimensions ?? [];
    console.log("Configuration Dimensions:", configDimensions);

    const dataArr: DataPointsArray = chartModel.data?.[0]?.data ?? { columns: [], dataValue: [] };
    console.log("Data Array:", dataArr);

    const xAxisColumn = configDimensions?.[0]?.columns?.[0]; // Main x-axis attribute
    const seriesColumn = configDimensions?.[1]?.columns?.[0]; // Series (stack) attribute
    const measureColumn = configDimensions?.[2]?.columns?.[0]; // Measure for stacking

    console.log("X-Axis Column:", xAxisColumn);
    console.log("Series Column:", seriesColumn);
    console.log("Measure Column:", measureColumn);

    const xAxisLabels = _.uniq(dataArr.dataValue.map(row => row[dataArr.columns.indexOf(xAxisColumn.id)]));
    console.log("X-Axis Labels:", xAxisLabels);

    const seriesData = _.groupBy(dataArr.dataValue, row => row[dataArr.columns.indexOf(seriesColumn.id)]);
    console.log("Grouped Series Data:", seriesData);

    const series = Object.keys(seriesData).map(seriesName => {
        const data = xAxisLabels.map(label => {
            const row = seriesData[seriesName].find(item => item[dataArr.columns.indexOf(xAxisColumn.id)] === label);
            return row ? parseFloat(row[dataArr.columns.indexOf(measureColumn.id)]) : 0;
        });
        console.log(`Data for series '${seriesName}':`, data);

        return {
            name: seriesName,
            data,
            color: getBackgroundColorForSeries(seriesName),
            stack: 'stack1',
        };
    });

    return {
        xAxisLabels,
        series,
    };
}

function getAxisTitles(chartModel: ChartModel): { xAxisTitle: string, yAxisTitle: string } {
    const configDimensions = chartModel.config?.chartConfig?.[0]?.dimensions ?? [];
    const xAxisColumn = configDimensions?.[0]?.columns?.[0]; // X-axis attribute
    const yAxisColumn = configDimensions?.[2]?.columns?.[0]; // Y-axis measure

    const xAxisTitle = xAxisColumn?.name || 'X-Axis';  // Use the name from the data or default to "X-Axis"
    const yAxisTitle = yAxisColumn?.name || 'Y-Axis';  // Use the name from the data or default to "Y-Axis"

    return {
        xAxisTitle,
        yAxisTitle,
    };
}

// Main render function
function render(ctx: CustomChartContext) {
    console.log("Rendering chart...");
    debugger;

    const chartModel = ctx.getChartModel();
    console.log("Chart Model:", chartModel);

    const dataModel = getDataModel(chartModel);
    console.log("Data Model:", dataModel);

    const { xAxisTitle, yAxisTitle } = getAxisTitles(chartModel); // Dynamically set axis titles
    console.log("Dynamic Axis Titles:", xAxisTitle, yAxisTitle);

    const visualProps = chartModel.visualProps as VisualProps;
    console.log("Visual Properties:", visualProps);

    // Destroy previous chart instance if it exists
    if (globalChartReference) {
        globalChartReference.destroy();
    }

    // Create the Highcharts Stacked Bar Chart
    globalChartReference = Highcharts.chart('chart', {
        chart: {
            type: 'bar',
            events: {
                load: function() {
                    // Add a context menu manually on load
                    this.container.addEventListener('contextmenu', function(event) {
                        event.preventDefault();
                        ctx.emitEvent(ChartToTSEvent.OpenAxisMenu, {
                            event: { clientX: event.clientX, clientY: event.clientY },
                            columnIds: [xAxisTitle],
                            selectedActions: [
                                AxisMenuActions.AGGREGATE,
                                AxisMenuActions.FILTER,
                                AxisMenuActions.SORT,
                                AxisMenuActions.TIME_BUCKET,
                            ],
                            customActions: [
                                {
                                    id: 'custom-action-1',
                                    label: 'Custom Action',
                                    onClick: () => handleAxisMenuAction('Custom Action', xAxisTitle),
                                }
                            ],
                        });
                    });
                }
            }
        },
        title: {
            text: ''
        },
        xAxis: {
            categories: dataModel.xAxisLabels,
            title: {
                text: xAxisTitle,
            },
            gridLineWidth: 0
        },
        yAxis: {
            min: 0,
            title: {
                text: yAxisTitle,
            },
            gridLineWidth: 0,
            labels: {
                formatter: function () {
                    return formatNumberWithAbbreviation(this.value as number);
                }
            },
            stackLabels: {
                enabled: true,
                formatter: function () {
                    return formatNumberWithAbbreviation(this.total as number);
                },
                style: {
                    color: '#000'
                }
            }
        },
        legend: {
            reversed: true
        },
        plotOptions: {
            series: {
                stacking: 'normal',
                pointPadding: 0.1,
                groupPadding: 0.05,
                borderWidth: 0,
                dataLabels: {
                    enabled: true,
                    formatter: function () {
                        const pointValue = this.y as number;
                        const stackTotal = this.total as number;
                        const percentageOfTotal = ((pointValue / stackTotal) * 100).toFixed(1);

                        return formatNumberWithAbbreviation(pointValue) +' | ' + percentageOfTotal + '% of Ttl.';
                    },
                    style: {
                        fontFamily: 'optimo-plain, "Helvetica Neue", Helvetica, Arial, sans-serif',
                        fontWeight: '500',
                        color: '#5e5e5e',
                        fontSize: '12px',
                        textOutline: '1.6px white',
                        textShadow: 'rgba(255, 255, 255, 0.6) 0px 0px 2px'
                    }
                }
            }
        },
        series: dataModel.series as Highcharts.SeriesOptionsType[]
    });
    console.log("Chart rendered successfully");
}

function handleAxisMenuAction(action: string, columnId: string) {
    console.log(`Axis menu action "${action}" triggered for column "${columnId}"`);
}

// Chart rendering initialization
const renderChart = async (ctx: CustomChartContext) => {
    try {
        ctx.emitEvent(ChartToTSEvent.RenderStart);
        console.log("Render start event emitted");
        debugger;
        render(ctx);
    } catch (error) {
        console.error("Error during render:", error);
    } finally {
        ctx.emitEvent(ChartToTSEvent.RenderComplete);
        console.log("Render complete event emitted");
    }
};

// IIFE to initialize the chart
(async () => {
    console.log("Initializing chart context...");
    try {
        const ctx = await getChartContext({
            getDefaultChartConfig: (chartModel) => {
                console.log("Generating default chart configuration...");
                debugger;

                const cols = chartModel.columns;

                const attributeColumns = cols.filter((col) => col.type === ColumnType.ATTRIBUTE);
                const measureColumns = cols.filter((col) => col.type === ColumnType.MEASURE);

                return [
                    {
                        key: 'column',
                        dimensions: [
                            { key: 'x', columns: [attributeColumns[0]] },
                            { key: 'stack', columns: [attributeColumns[1]] },
                            { key: 'y', columns: measureColumns.slice(0, 1) },
                        ],
                    },
                ];
            },

            getQueriesFromChartConfig: (chartConfig: ChartConfig[]): Array<Query> => {
                console.log("Generating queries from chart configuration:", chartConfig);
                return chartConfig.map((config) =>
                    _.reduce(
                        config.dimensions,
                        (acc: Query, dimension) => ({
                            queryColumns: [...acc.queryColumns, ...dimension.columns],
                        }),
                        { queryColumns: [] } as Query,
                    )
                );
            },

            renderChart,
            chartConfigEditorDefinition: [
                {
                    key: 'column',
                    label: 'Stacked Bar Chart Configuration',
                    descriptionText: 'Select attributes for x-axis, stack, and a measure for the y-axis.',
                    columnSections: [
                        {
                            key: 'x',
                            label: 'X-Axis Attribute',
                            allowAttributeColumns: true,
                            allowMeasureColumns: false,
                            maxColumnCount: 1,
                        },
                        {
                            key: 'stack',
                            label: 'Stack Attribute',
                            allowAttributeColumns: true,
                            allowMeasureColumns: false,
                            maxColumnCount: 1,
                        },
                        {
                            key: 'y',
                            label: 'Y-Axis Measure',
                            allowAttributeColumns: false,
                            allowMeasureColumns: true,
                            maxColumnCount: 1,
                        },
                    ],
                },
            ],
            visualPropEditorDefinition: {
                elements: [
                    {
                        key: 'xAxisTitle',
                        type: 'text',
                        defaultValue: 'X Axis',
                        label: 'X-Axis Title',
                    },
                    {
                        key: 'yAxisTitle',
                        type: 'text',
                        defaultValue: 'Y Axis',
                        label: 'Y-Axis Title',
                    },
                    {
                        key: 'numberFormat',
                        type: 'text',
                        defaultValue: '0,0',
                        label: 'Number Format',
                    },
                ],
            },
        });

        console.log("Context initialized successfully:", ctx);
        renderChart(ctx);
    } catch (error) {
        console.error("Error during chart context initialization:", error);
    }
})();
