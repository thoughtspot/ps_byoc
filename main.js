import {
    ColumnType,
    getChartContext,
    ChartToTSEvent,
} from '@thoughtspot/ts-chart-sdk';
import _ from 'lodash';

const numberFormatter = (value, format = '') => {
    let formattedValue = '';

    if (value > 1000000000 || value < -1000000000) {
        // formattedValue = (value / 1000000000).toFixed(2) + 'B';
        formattedValue = userNumberFormatter((value / 1000000000),format) + 'B';
    } else if (value > 1000000 || value < -1000000) {
        formattedValue = userNumberFormatter((value / 1000000),format) + 'M';
    } else if (value > 1000 || value < -1000) {
        formattedValue = userNumberFormatter((value / 1000),format) + 'K';
    } else {
        formattedValue = value.toFixed(2);
    }

    return  formattedValue; // Apply user-defined number format
};


let userNumberFormat = '0,0.00'; // Default format if not specified by the user

const userNumberFormatter = (value, format) => {
    console.log("Inside numberFormatter function. Number Format: " + format);
    return numeral(value).format(format); // Use numeral.js for formatting
};

function getDataForColumn(column, dataArr) {
    const idx = _.findIndex(dataArr.columns, colId => column.id === colId);
    const data = _.map(dataArr.dataValue, row => row[idx]);
    return data;
}

function calculateKpiValues(chartModel) {
    const dataArr = chartModel.data?.[0]?.data ?? [];
    const measureColumns = _.filter(chartModel.columns, col => col.type === ColumnType.MEASURE);

    if (measureColumns.length === 0 || dataArr.length === 0) return { mainKpiValue: 0, measures: [] };

    const mainKpiValue = _.sum(getDataForColumn(measureColumns[0], dataArr));

    const measures = measureColumns.slice(1).map(col => {
        const value = _.sum(getDataForColumn(col, dataArr));
        const change = value !== 0 ? ((mainKpiValue - value) / Math.abs(mainKpiValue)) * 100 : 0;
        return {
            label: col.name,
            value,
            change
        };
    });

    return { mainKpiValue, measures };
}

function updateKpiContainer(measures, mainKpiValue, format) {
    console.log("Inside updateKpiContainer function. Number Format: " + format);
    document.getElementById('mainKpiValue').innerText = numberFormatter(mainKpiValue, format);
    const kpiContainer = document.getElementById('kpiMeasures');
    kpiContainer.innerHTML = '';
    measures.forEach(measure => {
        const changeClass = measure.change > 0 ? 'kpi-positive' : 'kpi-negative';
        const arrow = measure.change > 0 ? '↑' : '↓';
        const measureDiv = document.createElement('div');
        measureDiv.classList.add('kpi-measure');
        measureDiv.innerHTML = `
            <span class="${changeClass}">${arrow} ${measure.change.toFixed(1)}%</span>
            <span class="comparisonKPIAbsoluteValue">(${numberFormatter(measure.value, format)})</span> <span class="comparisonKPIName">vs. ${measure.label}</span>
        `;
        kpiContainer.appendChild(measureDiv);
    });
}

async function render(ctx) {
    console.log("Inside render function.");
    const chartModel = await ctx.getChartModel();
    const kpiValues = calculateKpiValues(chartModel);
    updateKpiContainer(kpiValues.measures, kpiValues.mainKpiValue, chartModel.visualProps.numberFormat);
}

const renderChart = async (ctx) => {
    try {

        console.log("Inside renderChart");
        ctx.emitEvent(ChartToTSEvent.RenderStart);
        await render(ctx);
    } catch (e) {
        ctx.emitEvent(ChartToTSEvent.RenderError, {
            hasError: true,
            error: e,
        });
    } finally {
        ctx.emitEvent(ChartToTSEvent.RenderComplete);
    }
};

(async () => {
    const ctx = await getChartContext({
        
        getDefaultChartConfig: (chartModel) => {
            const cols = chartModel.columns;
            const measureColumns = _.filter(cols, col => col.type === ColumnType.MEASURE);
            const axisConfig = {
                key: 'column',
                dimensions: [
                    {
                        key: 'x',
                        columns: measureColumns.length > 0 ? [measureColumns[0]] : [],
                    },
                    {
                        key: 'y',
                        columns: measureColumns,
                    },
                ],
            };
            return [axisConfig];
        },
        getQueriesFromChartConfig: (chartConfig) => {
            const queries = chartConfig.map(config =>
                _.reduce(config.dimensions, (acc, dimension) => ({
                    queryColumns: [...acc.queryColumns, ...dimension.columns],
                }), { queryColumns: [] })
            );
            return queries;
        },
        renderChart: (ctx) => renderChart(ctx),
        chartConfigEditorDefinition: [
            {
                key: 'column',
                label: 'Custom Column',
                descriptionText: 'This chart accepts only measures. At least 2 measures are required. Measure in the Main KPI will show the value displayed as big number.' + 
                'The measures under Comparison measures will appear under the main KPI along with variance(s).',
                columnSections: [
                    {
                        key: 'x',
                        label: 'Main KPI measure',
                        allowAttributeColumns: false,
                        allowMeasureColumns: true,
                        allowTimeSeriesColumns: true,
                        maxColumnCount: 1,
                    },
                    {
                        key: 'y',
                        label: 'Comparison measures',
                        allowAttributeColumns: false,
                        allowMeasureColumns: true,
                        allowTimeSeriesColumns: false,
                    },
                ],
            },
        ],
        visualPropEditorDefinition: {
            elements: [
                {
                    key: 'numberFormat',
                    type: 'text',
                    defaultValue: '0,0.00', // Default number format
                    label: 'Number Format',
                }
            ],
        },
        onPropChange: (propKey, propValue) => {
            // console.log("Inside onPropChange. Number Format: " + userNumberFormat);
            if (propKey === 'numberFormat') {
                userNumberFormat = propValue || '0,0.00'; // Use the default format if none provided
                
                renderChart(ctx ); // Re-render the chart with the new format
            }
        },
    });
    console.log("At end of the file just before renderChart call.");
    renderChart(ctx);
})();
