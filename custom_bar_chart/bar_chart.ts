import {
    ChartToTSEvent,
    ColumnType,
    getChartContext,
    CustomChartContext,
    ChartModel,
    ChartConfig,
    ChartSdkCustomStylingConfig,
    DataPointsArray,
    ChartColumn,
} from '@thoughtspot/ts-chart-sdk';
import Highcharts from 'highcharts';
import numeral from 'numeral';
import _ from 'lodash';

let globalChartReference: Highcharts.Chart;

// Define the interface for visual properties
interface VisualProps {
    xAxisTitle?: string;
    yAxisTitle?: string;
}

// Map to store colors for each series name
const seriesColorMap: Record<string, string> = {};

// Function to generate a random color in rgba format
function generateRandomColor(): string {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `rgba(${r}, ${g}, ${b}, 0.5)`;
}

// Function to get or assign a background color for a series dynamically
function getBackgroundColorForSeries(seriesName: string): string {
    if (seriesColorMap[seriesName]) {
        return seriesColorMap[seriesName];
    }
    const color = generateRandomColor();
    seriesColorMap[seriesName] = color;
    return color;
}

// Helper to format numbers based on user preferences
const userNumberFormatter = (value: number, format: string) => {
    return numeral(value).format(format);
};

function getDataForColumn(column: ChartColumn, dataArr: DataPointsArray) {
    const idx = _.findIndex(dataArr.columns, (colId) => column.id === colId);
    return _.map(dataArr.dataValue, (row) => row[idx]);
}

function getColumnDataModel(
    configDimensions,
    dataArr: DataPointsArray,
    visualProps,
    customStyleConfig: ChartSdkCustomStylingConfig
) {
    const xAxisColumn = configDimensions?.[0]?.columns[0]; // Main x-axis attribute
    const seriesColumn = configDimensions?.[1]?.columns[0]; // Series (stack) attribute
    const measureColumn = configDimensions?.[2]?.columns[0]; // Measure for stacking

    const xAxisLabels = getDataForColumn(xAxisColumn, dataArr);
    const seriesData = _.groupBy(dataArr.dataValue, (row) => row[seriesColumn.id]);

    const series = Object.keys(seriesData).map((seriesName) => {
        const data = xAxisLabels.map((label) => {
            const row = seriesData[seriesName].find(
                (item) => item[xAxisColumn.id] === label
            );
            return row ? row[measureColumn.id] : 0;
        });

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

function getDataModel(chartModel: ChartModel, customStyleConfig) {
    const configDimensions = chartModel.config?.chartConfig?.[0]?.dimensions ?? [];
    const dataArr: DataPointsArray = chartModel.data?.[0]?.data ?? { columns: [], dataValue: [] };

    return getColumnDataModel(
        configDimensions,
        dataArr,
        chartModel.visualProps,
        customStyleConfig
    );
}

function render(ctx: CustomChartContext) {
    const chartModel = ctx.getChartModel();
    const dataModel = getDataModel(chartModel, ctx.getAppConfig()?.styleConfig);

    // Cast visualProps to VisualProps interface
    const visualProps = chartModel.visualProps as VisualProps;

    // Destroy previous chart instance if it exists
    if (globalChartReference) {
        globalChartReference.destroy();
    }

    // Create a new Highcharts chart
    globalChartReference = Highcharts.chart('chart', {
        chart: {
            type: 'bar'
        },
        title: {
            text: 'Custom Stacked Bar Chart'
        },
        xAxis: {
            categories: dataModel.xAxisLabels,
            title: {
                text: visualProps?.xAxisTitle || ''
            }
        },
        yAxis: {
            min: 0,
            title: {
                text: visualProps?.yAxisTitle || ''
            },
            stackLabels: {
                enabled: true,
                formatter: function () {
                    return userNumberFormatter(this.total as number, '0,0');
                }
            }
        },
        legend: {
            reversed: true
        },
        plotOptions: {
            series: {
                stacking: 'normal',
                dataLabels: {
                    enabled: true,
                    formatter: function () {
                        return userNumberFormatter(this.y as number, '0,0');
                    }
                }
            }
        },
        series: dataModel.series as Highcharts.SeriesOptionsType[]
    });
}

const renderChart = async (ctx: CustomChartContext) => {
    try {
        ctx.emitEvent(ChartToTSEvent.RenderStart);
        render(ctx);
    } catch (error) {
        console.error(error);
    } finally {
        ctx.emitEvent(ChartToTSEvent.RenderComplete);
    }
};

(async () => {
    const ctx = await getChartContext({
        getDefaultChartConfig: (chartModel) => {
            const cols = chartModel.columns;

            const attributeColumns = cols.filter(
                (col) => col.type === ColumnType.ATTRIBUTE
            );
            const measureColumns = cols.filter(
                (col) => col.type === ColumnType.MEASURE
            );

            return [
                {
                    key: 'column',
                    dimensions: [
                        { key: 'x', columns: [attributeColumns[0]] }, // X-axis attribute
                        { key: 'stack', columns: [attributeColumns[1]] }, // Stack attribute
                        { key: 'y', columns: measureColumns.slice(0, 1) }, // Y-axis measure
                    ],
                },
            ];
        },

        getQueriesFromChartConfig: (chartConfig) => {
            return chartConfig.map((config) => {
                const queryColumns = config.dimensions.flatMap((dimension) =>
                    dimension.columns.map((col) => col)
                );
                return { queryColumns };
            });
        },

        renderChart,
        chartConfigEditorDefinition: [
            {
                key: 'column',
                label: 'Custom Column',
                descriptionText:
                    'Select attributes for x-axis (category) and stack (series) and a measure for the y-axis.',
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
    });

    renderChart(ctx);
})();
