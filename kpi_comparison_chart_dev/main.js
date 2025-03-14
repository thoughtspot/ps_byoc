import {
  ChartToTSEvent,
  ColumnType,
  getChartContext,
} from '@thoughtspot/ts-chart-sdk';
import _ from 'lodash';
import numeral from 'numeral';


const visualPropKeyMap = {
  0: 'numberFormat',
  1: 'Variance',
};

let userNumberFormat = '0.0'; // Default format if not specified by the user

const numberFormatter = (value, format = '', applySuffix = true) => {
  if (!format) return value.toString();

  let formattedValue;

  // ✅ If Change% or BPS, remove currency symbol but keep decimal formatting
  if (format.includes('$')) {
      format = format.replace(/\$/g, ''); // ✅ Strip $ from format but keep decimal places
  }

  formattedValue = numeral(value).format(format);

  // ✅ Apply suffixes (B, M, K) only if not a percentage or BPS value
  if (applySuffix) {
      if (value > 1000000000 || value < -1000000000) {
          formattedValue = numeral(value / 1000000000).format(format) + 'B';
      } else if (value > 1000000 || value < -1000000) {
          formattedValue = numeral(value / 1000000).format(format) + 'M';
      } else if (value > 1000 || value < -1000) {
          formattedValue = numeral(value / 1000).format(format) + 'K';
      }
  }

  return formattedValue;
};


const userNumberFormatter = (value, format) => {
  return numeral(value).format(format);
};

function getDataForColumn(column, dataArr) {
  const idx = _.findIndex(dataArr.columns, (colId) => column.id === colId);
  return _.map(dataArr.dataValue, (row) => row[idx]);
}

function calculateKpiValues(chartModel, displayMode) {
  const dataArr = chartModel.data?.[0]?.data ?? [];
  const measureColumns = _.filter(chartModel.columns, (col) => col.type === ColumnType.MEASURE);

  if (measureColumns.length === 0 || dataArr.length === 0) return { mainKpiValue: 0, measures: [] };

  const configDimensions = chartModel.config?.chartConfig?.[1]?.dimensions ??
                           chartModel.config?.chartConfig?.[0]?.dimensions ?? [];

  const mainKpiColumn = configDimensions.find((it) => it.key === 'x');
  const mainKpiColumnId = mainKpiColumn?.columns?.[0]?.id;
  const mainKpiValue = mainKpiColumnId ? _.sum(getDataForColumn(mainKpiColumn.columns[0], dataArr)) : 0;

  const comparisonMeasures = measureColumns.filter((col) =>
      col.id !== mainKpiColumnId &&
      configDimensions.some(dimension => dimension.columns.some(c => c.id === col.id))
  );

  const measures = comparisonMeasures.map((col) => {
      const value = _.sum(getDataForColumn(col, dataArr));
      const variance = mainKpiValue - value; 
      const change = mainKpiValue !== 0 ? ((mainKpiValue - value) / Math.abs(value)) * 100 : 0;
      const bps = change * 100;

      return {
          label: col.name,
          value,
          variance,
          change,
          bps
      };
  });

  return { mainKpiValue, measures };
}



function updateKpiContainer(measures, mainKpiValue, format, displayMode) {
  document.getElementById('mainKpiValue').innerText = numberFormatter(mainKpiValue, format);
  const kpiContainer = document.getElementById('kpiMeasures');
  kpiContainer.innerHTML = '';

  measures.forEach((measure) => {
      let measureValue;
      let displayValue;
      let formattedValue = numberFormatter(measure.value, format); // ✅ Ensure correct formatting

      // ✅ Select the correct display mode value
      if (displayMode === 'variance') {
          measureValue = measure.variance;
          displayValue = numberFormatter(measure.variance, format);
      } else if (displayMode === 'bps') {
          measureValue = measure.bps;
          displayValue = numberFormatter(measure.bps, format) + " bps";
      } else {
          measureValue = measure.change;
          displayValue = Math.abs(numberFormatter(measure.change, format)) + '%';
      }

      // ✅ Ensure correct change class based on selected display mode
      const changeClass = measureValue > 0 ? 'kpi-positive' : 'kpi-negative';
      const arrow = measureValue > 0 ? '↑' : '↓';

      const measureDiv = document.createElement('div');
      measureDiv.classList.add('kpi-measure');

      measureDiv.innerHTML = `
          <span class="${changeClass}">${arrow} ${displayValue}</span>
          <span class="comparisonKPIAbsoluteValue">(${formattedValue})</span> 
          <span class="comparisonKPIName">vs. ${measure.label}</span>
      `;

      kpiContainer.appendChild(measureDiv);
  });
}



function insertCustomFont(customFontFaces) {
  customFontFaces.forEach((it) => {
    const font = new FontFace(it.family, `url(${it.url})`);
    document.fonts.add(font);
  });
}

async function render(ctx) {
  const chartModel = await ctx.getChartModel();
  const appConfig = ctx.getAppConfig();

  if (appConfig?.styleConfig?.customFontFaces?.length) {
      insertCustomFont(appConfig.styleConfig.customFontFaces);
  }

  const numberFormat = chartModel.visualProps.numberFormat || userNumberFormat;
  const displayMode = chartModel.visualProps.valueDisplayMode || 'change'; // ✅ Read selected radio button value

  const kpiValues = calculateKpiValues(chartModel, displayMode);
  updateKpiContainer(kpiValues.measures, kpiValues.mainKpiValue, numberFormat, displayMode);
}



const renderChart = async (ctx) => {
  try {
    ctx.emitEvent(ChartToTSEvent.RenderStart);
    await render(ctx);
  } catch (e) {
    ctx.emitEvent(ChartToTSEvent.RenderError, { hasError: true, error: e });
  } finally {
    ctx.emitEvent(ChartToTSEvent.RenderComplete);
  }
};

(async () => {
  const ctx = await getChartContext({
    getDefaultChartConfig: (chartModel) => {
      const cols = chartModel.columns;
      const measureColumns = _.filter(
        cols,
        (col) => col.type === ColumnType.MEASURE
      );
      const axisConfig = {
        key: 'column',
        dimensions: [
          {
            key: 'x',
            columns: measureColumns.length > 0 ? [measureColumns[0]] : [],
          },
          {
            key: 'y',
            columns: measureColumns.length > 1 ? measureColumns.slice(1) : [],
          },
        ],
      };
      return [axisConfig];
    },
    getQueriesFromChartConfig: (chartConfig) => {
      return chartConfig.map((config) =>
        _.reduce(
          config.dimensions,
          (acc, dimension) => ({
            queryColumns: [...acc.queryColumns, ...dimension.columns],
          }),
          { queryColumns: [] }
        )
      );
    },
    renderChart,
    chartConfigEditorDefinition: [
      {
        key: 'column',
        label: 'Custom Column',
        descriptionText:
          'This chart accepts only measures. At least 2 measures are required. Measure in the Main KPI will show the value displayed as big number.' +
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
          defaultValue: '0.0',
          label: 'Number Format',
        },
        {
          key: 'valueDisplayMode',
          type: 'radio',
          defaultValue: 'change', // ✅ Change% is selected by default
          label: 'Display Mode',
          options: [
              { label: 'Change%', value: 'change' },
              { label: 'Variance', value: 'variance' },
              { label: 'BPS', value: 'bps' }
          ]
        }
      ],
    },
    onPropChange: (propKey, propValue) => {
      if (propKey === 'numberFormat') {
        userNumberFormat = propValue || '0.0';
        console.log('Number format updated to:', userNumberFormat); // Debugging line
        renderChart(ctx); // Re-render the chart with the new format
      } else if (propKey === 'valueDisplayMode') {  // ✅ Handle radio button changes
        console.log(`Display Mode changed to: ${propValue}`);
        renderChart(ctx);
      } else if (propKey === 'columnOrder' || propKey.startsWith('column')) {
        renderChart(ctx);
      }
    },
  });

  renderChart(ctx);
})();