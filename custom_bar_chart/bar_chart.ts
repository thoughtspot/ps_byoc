import {
    ChartColumn,
    ChartConfig,
    ChartModel,
    ChartSdkCustomStylingConfig,
    ChartToTSEvent,
    ColumnType,
    CustomChartContext,
    DataPointsArray,
    dateFormatter,
    getCfForColumn,
    getChartContext,
    isDateColumn,
    isDateNumColumn,
    PointVal,
    Query,
    ValidationResponse,
    VisualPropEditorDefinition,
    VisualProps,
} from '@thoughtspot/ts-chart-sdk';
import { ChartConfigEditorDefinition } from '@thoughtspot/ts-chart-sdk/src';
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import _ from 'lodash';
import {
    availableColor,
    getBackgroundColor,
    getPlotLinesAndBandsFromConditionalFormatting,
    visualPropKeyMap,
} from './custom-chart.utils';
import {
    createPlotbandPlugin,
    createPlotlinePlugin,
} from './custom-chart-plugins';

Chart.register(ChartDataLabels);

let globalChartReference: Chart;

const exampleClientState = {
    id: 'chart-id',
    name: 'custom-stacked-bar-chart',
    library: 'chartJs',
};

function getDataForColumn(column: ChartColumn, dataArr: DataPointsArray) {
    const idx = _.findIndex(dataArr.columns, (colId) => column.id === colId);
    return _.map(dataArr.dataValue, (row) => {
        const colValue = row[idx];
        if (isDateColumn(column) || isDateNumColumn(column)) {
            return dateFormatter(colValue, column);
        }
        return colValue;
    });
}

function getColumnDataModel(
    configDimensions,
    dataArr: DataPointsArray,
    type,
    visualProps: VisualProps,
    customStyleConfig: ChartSdkCustomStylingConfig,
) {
    const xAxisColumns = configDimensions?.[0].columns ?? []; // Main attribute
    const yAxisColumns = configDimensions?.[1].columns ?? []; // Measure
    const colorColumns = configDimensions?.[2].columns ?? []; // Slice with color

    return {
        getLabels: () => getDataForColumn(xAxisColumns[0], dataArr),
        getDatasets: () =>
            _.flatMap(yAxisColumns, (measureCol, idx) => {
                return _.map(colorColumns, (colorCol) => {
                    const measureData = getDataForColumn(measureCol, dataArr);
                    const colorData = getDataForColumn(colorCol, dataArr);
                    const color = getBackgroundColor(customStyleConfig, visualProps, idx, dataArr, getCfForColumn(colorCol), idx, colorCol.id);

                    return {
                        label: `${measureCol.name} - ${colorCol.name}`,
                        data: measureData,
                        backgroundColor: color,
                        stack: xAxisColumns[0].name,
                        datalabels: {
                            anchor: 'end',
                        },
                    };
                });
            }),
        getScales: () => ({
            x: {
                stacked: true,
            },
            y: {
                stacked: true,
                beginAtZero: true,
            },
        }),
        getPointDetails: (xPos: number, yPos: number): PointVal[] => [
            {
                columnId: xAxisColumns[0].id,
                value: getDataForColumn(xAxisColumns[0], dataArr)[xPos],
            },
            {
                columnId: yAxisColumns[yPos].id,
                value: getDataForColumn(yAxisColumns[yPos], dataArr)[xPos],
            },
        ],
    };
}

function getDataModel(
    chartModel: ChartModel,
    customStyleConfig: ChartSdkCustomStylingConfig | undefined,
) {
    const columnChartModel = getColumnDataModel(
        chartModel.config?.chartConfig?.[0].dimensions ?? [],
        chartModel.data?.[0].data ?? [],
        'bar',
        chartModel.visualProps,
        customStyleConfig,
    );

    return columnChartModel;
}

function render(ctx: CustomChartContext) {
    const chartModel = ctx.getChartModel();
    const appConfig = ctx.getAppConfig();

    ctx.emitEvent(ChartToTSEvent.UpdateVisualProps, {
        visualProps: JSON.parse(
            JSON.stringify({
                ...chartModel.visualProps,
                clientState: exampleClientState,
            }),
        ),
    });

    const dataModel = getDataModel(chartModel, appConfig?.styleConfig);
    if (!dataModel) return;

    try {
        const canvas = document.getElementById('chart') as any;
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

        globalChartReference = new Chart(canvas as any, {
            type: 'bar',
            data: {
                labels: dataModel.getLabels(),
                datasets: dataModel.getDatasets() as any,
            },
            options: {
                animation: { duration: 0 },
                scales: dataModel.getScales(),
                plugins: {
                    datalabels: {
                        display: true,
                        color: '#000',
                    },
                },
                maintainAspectRatio: false,
            },
            plugins: [
                createPlotlinePlugin(dataModel),
                createPlotbandPlugin(dataModel),
            ],
        });
    } catch (e) {
        console.error('renderfailed', e);
        throw e;
    }
}

const renderChart = async (ctx: CustomChartContext): Promise<void> => {
    if (globalChartReference) {
        globalChartReference.destroy();
    }
    try {
        ctx.emitEvent(ChartToTSEvent.RenderStart);
        render(ctx);
    } catch (e) {
        ctx.emitEvent(ChartToTSEvent.RenderError, { hasError: true, error: e });
    } finally {
        ctx.emitEvent(ChartToTSEvent.RenderComplete);
    }
};

(async () => {
    const ctx = await getChartContext({
        getDefaultChartConfig: (chartModel: ChartModel): ChartConfig[] => {
            const cols = chartModel.columns;

            const measureColumns = _.filter(cols, (col) => col.type === ColumnType.MEASURE);
            const attributeColumns = _.filter(cols, (col) => col.type === ColumnType.ATTRIBUTE);

            return [{
                key: 'column',
                dimensions: [
                    { key: 'x', columns: [attributeColumns[0]] },
                    { key: 'y', columns: measureColumns.slice(0, 2) },
                    { key: 'color', columns: attributeColumns.slice(1, 2) },
                ],
            }];
        },
        chartConfigEditorDefinition: (
            currentChartConfig: ChartModel,
            ctx: CustomChartContext,
        ): ChartConfigEditorDefinition[] => {
            return [{
                key: 'column',
                label: 'Custom Column',
                descriptionText: 'Configure X-axis as main attribute, Y-axis as measure, and color slices.',
                columnSections: [
                    {
                        key: 'x',
                        label: 'Main Attribute (X-Axis)',
                        allowAttributeColumns: true,
                        allowMeasureColumns: false,
                        maxColumnCount: 1,
                    },
                    {
                        key: 'y',
                        label: 'Measure',
                        allowAttributeColumns: false,
                        allowMeasureColumns: true,
                    },
                    {
                        key: 'color',
                        label: 'Slice with Color',
                        allowAttributeColumns: true,
                        allowMeasureColumns: false,
                    },
                ],
            }];
        },
        renderChart: (ctx) => renderChart(ctx),
        validateConfig: (
            updatedConfig: any[],
            chartModel: any,
        ): ValidationResponse => {
            return {
                isValid: updatedConfig.length > 0,
                validationErrorMessage: updatedConfig.length > 0 ? [] : ['Invalid config. no config found'],
            };
        },
    });

    renderChart(ctx);
})();
