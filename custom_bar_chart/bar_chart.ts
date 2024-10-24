import Highcharts from 'highcharts';
import Exporting from 'highcharts/modules/exporting'; // Import the exporting module
import OfflineExporting from 'highcharts/modules/offline-exporting'; // Import the offline-exporting module
import numeral from 'numeral';
import _ from 'lodash';
import { 
    ChartConfig, 
    ChartModel, 
    ChartToTSEvent, 
    ColumnType, 
    CustomChartContext, 
    getChartContext, 
    Query 
} from '@thoughtspot/ts-chart-sdk';

// Initialize Highcharts exporting modules
Exporting(Highcharts);
OfflineExporting(Highcharts);

let userNumberFormat = '0.0'; // Default number format

// Interface for visualProps
interface VisualProps {
    numberFormat: string;
}

// Custom Number Formatter for formatting values in the chart and tooltip
const numberFormatter = (value: number, format = '0.0') => {
    try {
        return numeral(value).format(format);
    } catch (error) {
        console.error("Error in numberFormatter: ", error);
        return value.toString();
    }
};

// Function to get the data model from the chart model
function getDataModel(chartModel: ChartModel) {
    console.log("Extracting data model from chartModel: ", chartModel);
    try {
        const configDimensions = chartModel.config?.chartConfig?.[0]?.dimensions ?? [];

        const dataArr = chartModel.data?.[0]?.data ?? undefined;

        if (!dataArr) {
            console.error('No data found in chartModel');
            return { values: [] };
        }

        const categoryColumn = configDimensions?.[0]?.columns?.[0]; // x-axis
        const measureColumns = _.filter(chartModel.columns, col => col.type === ColumnType.MEASURE);

        const categoryColumnIndex = dataArr.columns.findIndex(col => col === categoryColumn?.id);
        const measureColumnIndexes = measureColumns.map(col => dataArr.columns.findIndex(c => c === col.id));

        if (!categoryColumn || measureColumns.length === 0) {
            console.error('The chart requires a category and at least one measure.');
            return { values: [] };
        }

        const dataModel = dataArr.dataValue.map((row) => {
            const categoryName = row[categoryColumnIndex];
            const measureValues = measureColumnIndexes.map((index) => parseFloat(row[index]));

            const chartDataPoint = {
                name: categoryName !== undefined ? categoryName.toString() : 'Unnamed',
                data: measureValues
            };
            return chartDataPoint;
        });

        return {
            values: dataModel,
            categoryName: categoryColumn?.name,
            measureColumns: measureColumns.map(col => col.name),
        };
    } catch (error) {
        console.error("Error in getDataModel: ", error);
        return { values: [] };
    }
}

// Function to render the stacked bar chart
function render(ctx: CustomChartContext) {
    console.log("Rendering the chart...");
    try {
        const chartModel = ctx.getChartModel();
        if (!chartModel) {
            console.error("chartModel is undefined");
            return;
        }
        const configDimensions = chartModel.config?.chartConfig?.[0]?.dimensions ?? [];

        const dataModel = getDataModel(chartModel);

        if (dataModel.values.length === 0) {
            console.error('No valid data to render.');
            return;
        }

        const visualProps = chartModel.visualProps as VisualProps;
        userNumberFormat = visualProps.numberFormat || userNumberFormat;

        const categories = dataModel.values.map(d => d.name);
        const series = dataModel.measureColumns.map((measureColumn, i) => ({
            name: measureColumn,
            data: dataModel.values.map(d => d.data[i])
        }));

        const chartInstance = Highcharts.chart('chart-container', {
            chart: {
                type: 'bar'
            },
            title: {
                text: 'Stacked Bar Chart Example'
            },
            xAxis: {
                categories: categories,
                title: {
                    text: dataModel.categoryName
                }
            },
            yAxis: {
                min: 0,
                title: {
                    text: 'Total value'
                }
            },
            legend: {
                reversed: true
            },
            plotOptions: {
                series: {
                    stacking: 'normal' // Enable stacking
                }
            },
            series: series as any, // Casting to 'any' to bypass typing errors
            tooltip: {
                formatter: function () {
                    return `<b>${this.x}</b><br/>${this.series.name}: ${numberFormatter(this.y, userNumberFormat)}<br/>Total: ${numberFormatter(this.point.stackTotal, userNumberFormat)}`;
                }
            },
            credits: {
                enabled: false
            },
            exporting: {
                enabled: true
            }
        });
    } catch (error) {
        console.error('Render failed: ', error);
    }
}

// Function to render the chart
const renderChart = async (ctx: CustomChartContext): Promise<void> => {
    try {
        ctx.emitEvent(ChartToTSEvent.RenderStart);
        render(ctx);
    } catch (error) {
        console.error('Error during renderChart: ', error);
        ctx.emitEvent(ChartToTSEvent.RenderError, {
            hasError: true,
            error: error,
        });
    } finally {
        ctx.emitEvent(ChartToTSEvent.RenderComplete);
    }
};

// Immediately Invoked Async Function (IIFE) to initialize and render the chart
(async () => {
    console.log("IIFE Started");
    try {
        const ctx = await getChartContext({
            getDefaultChartConfig: (chartModel: ChartModel): ChartConfig[] => {
                console.log("Generating default chart configuration...");

                const cols = chartModel.columns ?? [];
                const attributeColumns = _.filter(cols, (col) => col.type === ColumnType.ATTRIBUTE);
                const measureColumns = _.filter(cols, (col) => col.type === ColumnType.MEASURE);

                if (attributeColumns.length === 0 || measureColumns.length === 0) {
                    throw new Error("Missing required attribute or measure columns.");
                }

                return [{
                    key: 'column',
                    dimensions: [
                        {
                            key: 'category', // x-axis (category)
                            columns: attributeColumns.length > 0 ? [attributeColumns[0]] : [],
                        },
                        {
                            key: 'measure', // y-axis (measure)
                            columns: measureColumns.length > 0 ? measureColumns : [],
                        },
                    ],
                }];
            },
            getQueriesFromChartConfig: (chartConfig: ChartConfig[]): Array<Query> => {
                return chartConfig.map((config: ChartConfig): Query =>
                    _.reduce(
                        config.dimensions,
                        (acc: Query, dimension) => ({
                            queryColumns: [...acc.queryColumns, ...dimension.columns],
                        }),
                        { queryColumns: [] } as Query,
                    ),
                );
            },
            renderChart: (ctx) => renderChart(ctx),
            visualPropEditorDefinition: {
                elements: [
                    {
                        key: 'numberFormat',
                        type: 'text',
                        defaultValue: '0.0',
                        label: 'Number Format',
                    },
                ],
            },
        });

        renderChart(ctx);
    } catch (error) {
        console.error('Error during initialization: ', error);
    }
})();
