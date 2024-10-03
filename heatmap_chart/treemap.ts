import Highcharts from 'highcharts';
import Exporting from 'highcharts/modules/exporting'; // Import the exporting module
import OfflineExporting from 'highcharts/modules/offline-exporting'; // Import the offline-exporting module
import Treemap from 'highcharts/modules/treemap';
import Heatmap from 'highcharts/modules/heatmap'; // Import the heatmap module
import numeral from 'numeral';
import _ from 'lodash';
import {
    ChartColumn,
    ChartConfig,
    ChartModel,
    ChartToTSEvent,
    ColumnType,
    CustomChartContext,
    DataPointsArray,
    getChartContext,
    Query,
} from '@thoughtspot/ts-chart-sdk';

// Initialize Highcharts Treemap, Heatmap, Exporting, and Offline Exporting modules
Exporting(Highcharts);
OfflineExporting(Highcharts); // Initialize offline exporting
Treemap(Highcharts);
Heatmap(Highcharts);

// Extend Highcharts to include tooltipData
declare module 'highcharts' {
    interface PointOptionsObject {
        tooltipData?: Array<{ columnName: string, value: number }>;
    }
}

let userNumberFormat = '0.0'; // Default number format
let numberOfLabels = 1; // Default to showing labels for the top 1 point

// Default gradient colors
let gradientColor0 = '#F0F0F0'; // Light gray for 0%
let gradientColor50 = '#A8D5BA'; // Soft green for 50%
let gradientColor100 = '#4F6D7A'; // Muted teal for 100%

// Interface for visualProps
interface VisualProps {
    numberFormat: string;
    numOfLabels: number;
    gradientColor0: string;
    gradientColor50: string;
    gradientColor100: string;
}

// Custom Number Formatter for formatting values in the chart and tooltip
const numberFormatter = (value: number, format = '0.0') => {
    try {
        const abbreviationFormat = format + 'a'; // Example: '0.0a' for one decimal place with abbreviation
        let formattedValue = numeral(value).format(abbreviationFormat);
        formattedValue = formattedValue.replace('k', 'K').replace('m', 'M').replace('b', 'B');
        return formattedValue;
    } catch (error) {
        console.error("Error in numberFormatter: ", error);
        return value;
    }
};

// Function to get dynamic tick positions based on data range
function getTickPositions(minValue: number, maxValue: number, numTicks: number = 5) {
    console.log("Calculating tick positions...");
    try {
        const tickInterval = (maxValue - minValue) / (numTicks - 1);
        const tickPositions: number[] = [];
        for (let i = 0; i < numTicks; i++) {
            tickPositions.push(minValue + i * tickInterval);
        }
        return tickPositions;
    } catch (error) {
        console.error("Error in getTickPositions: ", error);
        return [];
    }
}

// Function to get the data model from the chart model
function getDataModel(chartModel: ChartModel) {
    console.log("Extracting data model from chartModel: ", chartModel);
    debugger;
    try {
        const configDimensions = chartModel.config?.chartConfig?.[1]?.dimensions ?? chartModel.config?.chartConfig?.[0]?.dimensions ?? [];


        console.log("Config dimensions: ", configDimensions);
        const dataArr = chartModel.data?.[0]?.data ?? undefined;

        if (!dataArr) {
            console.error('No data found in chartModel');
            return { values: [] };
        }

        const categoryColumn = configDimensions?.[0]?.columns?.[0]; // First attribute (x-axis)
        const measureColumns = _.filter(chartModel.columns, col => col.type === ColumnType.MEASURE);
        
        // Get additional configuration for size, color, labels, and tooltip columns
        const sizeMeasureCol = configDimensions[1]?.columns?.[0];
        const colorMeasureCol = configDimensions[2]?.columns?.[0];
        const labelMeasureArr = configDimensions[3]?.columns || [];
        const tooltipArr = configDimensions[4]?.columns || [];
        debugger;
        const tooltipArrFinal = _.concat(sizeMeasureCol,colorMeasureCol,labelMeasureArr,tooltipArr);
        const labelMeasureArrFinal = _.concat(sizeMeasureCol,colorMeasureCol,labelMeasureArr);

        const categoryColumnIndex = chartModel.columns.findIndex(col => col.id === categoryColumn?.id);
        const sizeColumnIndex = chartModel.columns.findIndex(col => col.id === sizeMeasureCol?.id);
        const colorColumnIndex = chartModel.columns.findIndex(col => col.id === colorMeasureCol?.id);

        
        if (!categoryColumn || measureColumns.length === 0) {
            console.error('The chart requires a category and at least one measure.');
            return { values: [] };
        }

        console.log("Category column: ", categoryColumn);
        console.log("Measure columns: ", measureColumns);

        const dataModel = dataArr.dataValue.map((row) => {
            const categoryName = row[categoryColumnIndex]; // First attribute (category) column
            const sizeMeasureValue=parseFloat(row[sizeColumnIndex]);
            const colorMeasureValue= parseFloat(row[colorColumnIndex]);

            const tooltipData = measureColumns.map((col, colIndex) => {
                const measureValue = row[colIndex + 1]; // Adjusted index for measure columns
                return { columnName: col.name, value: measureValue };
            });

        // return new values called labels and tooltip data, way to declare and separate the tooltip columns, as currently all the columns are considered to be tooltips        

            return {
                name: categoryName !== undefined ? categoryName.toString() : 'Unnamed',
                value: sizeMeasureValue, 
                colorValue: colorMeasureValue, 
                tooltipData: tooltipData,
                labelData:{}
            };
        });

        dataModel.sort((a, b) => b.value - a.value);
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

// Function to download the chart as a PNG using Highcharts offline exporting module
function downloadChartAsPNG(chartInstance: any) {
    console.log("Downloading chart as PNG...");
    chartInstance.exportChartLocal({
        type: 'image/png',
        filename: 'treemap-chart',
    });
}

// Function to get parsed event details
function getParsedEvent(evt: any) {
    console.log("Extracting clientX and clientY from event: ", evt);
    
    // Ensure the correct properties are extracted from the event
    return {
        clientX: evt.clientX || evt.point.pageX,  // Fall back to evt.point.pageX if clientX is unavailable
        clientY: evt.clientY || evt.point.pageY   // Fall back to evt.point.pageY if clientY is unavailable
    };
}

// Function to render the treemap chart
function render(ctx: CustomChartContext) {
    console.log("Rendering the chart...");
    try {
        const chartModel = ctx.getChartModel();
        console.log("Chart model: ", chartModel);

        if (!chartModel) {
            console.error("chartModel is undefined");
            return;
        }
        const configDimensions = chartModel.config?.chartConfig?.[0]?.dimensions ?? [];

        const dataModel = getDataModel(chartModel);
        console.log("Data model: ", dataModel);

        if (dataModel.values.length === 0) {
            console.error('No valid data to render.');
            return;
        }

        const visualProps = chartModel.visualProps as VisualProps;
        console.log("Visual props: ", visualProps);
        userNumberFormat = visualProps.numberFormat || userNumberFormat;
        numberOfLabels = visualProps.numOfLabels || numberOfLabels;
        gradientColor0 = visualProps.gradientColor0 || gradientColor0;
        gradientColor50 = visualProps.gradientColor50 || gradientColor50;
        gradientColor100 = visualProps.gradientColor100 || gradientColor100;

        const minColorValue = Math.min(...dataModel.values.map(d => d.colorValue));
        const maxColorValue = Math.max(...dataModel.values.map(d => d.colorValue));

        const chartInstance = Highcharts.chart({
            chart: {
                renderTo: 'chart',
                spacingBottom: 0,
                events: {
                    load: function () {
                        console.log("Chart loaded successfully");
                    }
                }
            },
            series: [{
                type: 'treemap',
                layoutAlgorithm: 'squarified',
                data: dataModel.values.map(dataPoint => ({
                    ...dataPoint,
                    colorValue: dataPoint.colorValue // Color by the second measure column
                })),
                dataLabels: {
                    enabled: true,
                    align: 'center', // Align horizontally to the center
                    verticalAlign: 'middle', // Align vertically to the middle
                    useHTML: true,
                    formatter: function () {
                        const point = this.point;
                        let labelHtml = `<span style="display: inline-block; width: 100%; text-align: center;">${point.name}</span><br>`;  // Inline-block with width 100% for centering

                        if (this.point.index < numberOfLabels) {
                            point.options.tooltipData?.forEach(tooltipCol => {
                                if (dataModel.measureColumns && dataModel.measureColumns.includes(tooltipCol.columnName)) {
                                    labelHtml += `<span style="display: inline-block; width: 100%; text-align: center;">${tooltipCol.columnName}: ${numberFormatter(tooltipCol.value, userNumberFormat)}</span><br>`;
                                } else {
                                    labelHtml += `<span style="display: inline-block; width: 100%; text-align: center;">${tooltipCol.columnName}: ${tooltipCol.value}</span><br>`;
                                }
                            });
                        }
                        return labelHtml;
                    },
                    style: {
                        fontSize: '13px',
                        fontWeight: 'normal',
                    },
                },
                point: {
                    events: {
                        click: function (e) {
                            console.log("Point click event triggered");
                            const clickedPointDetails = this;
                            const categoryValue = clickedPointDetails.name;
                            const measureValue = clickedPointDetails.value;
                            const colorValue = clickedPointDetails.options.colorValue; // Assuming `colorValue` is available in `clickedPointDetails`


                            console.log('Clicked Point Details: ', clickedPointDetails);

                            ctx.emitEvent(ChartToTSEvent.OpenContextMenu, {
                                event: getParsedEvent(e),
                                clickedPoint: {
                                    tuple: [
                                        { columnId: configDimensions?.[0]?.columns?.[0]?.id, value: categoryValue }, // Safely accessing category column
                                        { columnId: configDimensions?.[1]?.columns?.[0]?.id, value: measureValue }, // Safely accessing size measure column
                                        { columnId: configDimensions?.[2]?.columns?.[0]?.id, value: colorValue}
                                    ],
                                },
                                customActions: [
                                    {
                                        id: 'custom-action-1',
                                        label: 'Custom user action 1',
                                        icon: '',
                                        onClick: (...args) => {
                                            console.log('Custom action 1 triggered', args);
                                        },
                                    },
                                    {
                                        id: 'download-chart',
                                        label: 'Download chart',
                                        icon: '',
                                        onClick: () => downloadChartAsPNG(chartInstance), // Pass the chart instance here
                                    },
                                ],
                            });
                        }
                    }
                }
            }],
            title: {
                text: '',
            },
            colorAxis: {
                minColor: gradientColor0,
                width: '40%',
                maxColor: gradientColor100,
                stops: [
                    [0, gradientColor0],
                    [0.5, gradientColor50],
                    [1, gradientColor100]
                ],
                labels: {
                    formatter: function () {
                        const value = typeof this.value === 'string' ? parseFloat(this.value) : this.value;
                        return numberFormatter(value, userNumberFormat);
                    },
                    step: 1,
                },
            },
            legend: {
                title: {
                    text: dataModel.measureColumns?.[1] || '', // Safely accessing the second measure column for the color axis
                    style: {
                        fontFamily: 'Helvetica',
                        fontSize: '11px'
                    }
                },
                layout: 'horizontal',
                align: 'center',
                verticalAlign: 'bottom'
            },
            credits: {
                enabled: false 
            },
            exporting: {
                enabled: false
            },
            tooltip: {
                useHTML: true,
                pointFormatter: function () {
                    const point = this;
                    const options = point.options;

                    let tooltipHtml = `<span class="labelName"><b>${dataModel.categoryName}</b></span>: <span class="labelValue">${point.name}</span><br>`;

                    // Check if tooltipData exists before iterating
                    if (options.tooltipData && Array.isArray(options.tooltipData)) {
                        options.tooltipData.forEach((tooltipCol) => {
                            if (dataModel.measureColumns && dataModel.measureColumns.includes(tooltipCol.columnName)) {
                                tooltipHtml += `<span class="labelName"><b>${tooltipCol.columnName}</b></span>: <span class="labelValue">${numberFormatter(tooltipCol.value, userNumberFormat)}</span><br>`;
                            } else {
                                tooltipHtml += `<span class="labelName"><b>${tooltipCol.columnName}</b></span>: <span class="labelValue">${tooltipCol.value}</span><br>`;
                            }
                        });
                    } else {
                        console.warn("tooltipData is undefined or not an array");
                    }

                    return tooltipHtml;
                }
            }
        });
    } catch (error) {
        console.error('Render failed: ', error);
    }
}

// Function to render the chart
const renderChart = async (ctx: CustomChartContext): Promise<void> => {
    console.log("Starting chart rendering process...");
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

// Initialization function with dynamic assignment of columns
const init = async () => {
    console.log("Initializing chart...");
    try {
        const ctx = await getChartContext({
            getDefaultChartConfig: (chartModel: ChartModel): ChartConfig[] => {
                console.log("Generating default chart configuration...");

                // Fetch columns from chart model
                const cols = chartModel.columns ?? [];

                // Filter columns for attributes and measures
                const attributeColumns = _.filter(cols, (col) => col.type === ColumnType.ATTRIBUTE);
                const measureColumns = _.filter(cols, (col) => col.type === ColumnType.MEASURE);

                console.log("getChartContext Attribute columns:", attributeColumns.length);
                console.log("getChartContext Measure columns:", measureColumns.length);

                // Ensure the required columns are present, throw more descriptive error
                if (attributeColumns.length === 0 || measureColumns.length === 0) {
                    throw new Error("Chart configuration error: Missing required attribute or measure columns. Please ensure at least one attribute and one measure are selected.");
                }

                // Auto-assign the columns based on available columns
                const axisConfig: ChartConfig = {
                    key: 'column',
                    dimensions: [
                        {
                            key: 'category', // x-axis (category)
                            columns: attributeColumns.length > 0 ? [attributeColumns[0]] : [],
                        },
                        {
                            key: 'measure', // y-axis (measure)
                            columns: measureColumns.length > 0 ? [measureColumns[0]] : [],
                        },
                        {
                            key: 'coloraxis', // Color axis
                            columns: measureColumns.length > 1 ? [measureColumns[1]] : [],
                        },
                        {
                            key: 'Labels', // Optional labels
                            columns: measureColumns.length > 2 ? measureColumns.slice(2, 4) : [],
                        },
                        {
                            key: 'tooltips', // Tooltip columns
                            columns: measureColumns.length > 4 ? measureColumns.slice(4) : [],
                        },
                    ],
                };

                console.log("Chart Config:", axisConfig);
                return [axisConfig];
            },

            getQueriesFromChartConfig: (chartConfig: ChartConfig[]): Array<Query> => {
                return chartConfig.map((config: ChartConfig): Query =>
                    _.reduce(
                        config.dimensions,
                        (acc: Query, dimension) => ({
                            queryColumns: [...acc.queryColumns, ...dimension.columns],
                        }),
                        {
                            queryColumns: [],
                        } as Query,
                    ),
                );
            },

            renderChart: (ctx) => renderChart(ctx),

            // Chart Configuration UI Definitions
            chartConfigEditorDefinition: [
                {
                    key: 'column',
                    label: 'Treemap Configuration',
                    descriptionText: 'Select category, measure, color axis, and tooltip columns.',
                    columnSections: [
                        {
                            key: 'category',
                            label: 'Category (x-axis)',
                            allowAttributeColumns: true,
                            allowMeasureColumns: false,
                            allowTimeSeriesColumns: false,
                            maxColumnCount: 1,
                        },
                        {
                            key: 'measure',
                            label: 'Measure (y-axis)',
                            allowAttributeColumns: false,
                            allowMeasureColumns: true,
                            allowTimeSeriesColumns: false,
                        },
                        {
                            key: 'coloraxis',
                            label: 'Color Axis',
                            allowAttributeColumns: false,
                            allowMeasureColumns: true,
                            allowTimeSeriesColumns: false,
                        },
                        {
                            key: 'Labels',
                            label: 'Labels',
                            allowAttributeColumns: false,
                            allowMeasureColumns: true,
                            allowTimeSeriesColumns: false,
                            maxColumnCount: 2,
                        },
                        {
                            key: 'tooltips',
                            label: 'Tooltip Columns',
                            allowAttributeColumns: false,
                            allowMeasureColumns: true,
                            allowTimeSeriesColumns: false,
                            maxColumnCount: 5,
                        },
                    ],
                },
            ],

            // Chart Visual Properties Editor Definitions
            visualPropEditorDefinition: {
                elements: [
                    {
                        key: 'numberFormat',
                        type: 'text',
                        defaultValue: '0.0',
                        label: 'Number Format',
                    },
                    {
                        key: 'numOfLabels',
                        type: 'number',
                        defaultValue: 1,
                        label: 'No. of Points to be Labeled',
                    },
                    {
                        key: 'gradientColor0',
                        type: 'colorpicker',
                        defaultValue: '#FFFFFF',
                        label: 'Color for 0%'
                    },
                    {
                        key: 'gradientColor50',
                        type: 'colorpicker',
                        defaultValue: '#FFCC00',
                        label: 'Color for 50%'
                    },
                    {
                        key: 'gradientColor100',
                        type: 'colorpicker',
                        defaultValue: '#FF0000',
                        label: 'Color for 100%'
                    }
                ],
            },
        });

        // Render the chart after initializing context
        renderChart(ctx);
    } catch (error) {
        console.error('Error during init: ', error);
    }
};

// Invoke the initialization function
await init();
