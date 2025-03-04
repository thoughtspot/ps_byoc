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

const numberFormatter = (value, format = '') => {
  let formattedValue = '';

  if (value > 1000000000 || value < -1000000000) {
    formattedValue = userNumberFormatter(value / 1000000000, format) + 'B';
  } else if (value > 1000000 || value < -1000000) {
    formattedValue = userNumberFormatter(value / 1000000, format) + 'M';
  } else if (value > 1000 || value < -1000) {
    formattedValue = userNumberFormatter(value / 1000, format) + 'K';
  } else {
    formattedValue = userNumberFormatter(value, format);
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

function calculateKpiValues(chartModel, showVariance) {
  showVariance = chartModel.visualProps.Variance;
  console.log('Variance setting in KPI Calculation:', showVariance); // ✅ Logs before calculations

  const dataArr = chartModel.data?.[0]?.data ?? [];
  const measureColumns = _.filter(
      chartModel.columns,
      (col) => col.type === ColumnType.MEASURE
  );

  if (measureColumns.length === 0 || dataArr.length === 0)
      return { mainKpiValue: 0, measures: [] };

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

      const variance = mainKpiValue - value; // ✅ Compute variance correctly

      const change = showVariance 
          ? mainKpiValue - value // ✅ Show absolute variance if checked
          : mainKpiValue !== 0 ? ((mainKpiValue - value) / Math.abs(value)) * 100 : 0; // ✅ Show % change if unchecked

      const bps = (change * 100); // ✅ Compute BPS

      return { label: col.name, value, change,variance,bps };
  });

  return { mainKpiValue, measures };
}


function updateKpiContainer(measures, mainKpiValue, format, isVarianceChecked, isBpsChecked) {
  document.getElementById('mainKpiValue').innerText = numberFormatter(
    mainKpiValue,
    format
  );
  const kpiContainer = document.getElementById('kpiMeasures');
  kpiContainer.innerHTML = '';

  measures.forEach((measure) => {
    const changeValue = isVarianceChecked
      ? measure.variance  // Show absolute variance if checked
      : isBpsChecked
      ? measure.bps // ✅ Show BPS if checked
      : measure.change; // Show percentage change otherwise

    const changeClass = changeValue > 0 ? 'kpi-positive' : 'kpi-negative';
    const arrow = changeValue > 0 ? '↑' : '↓';

    // Format display text
    const displayChange = isVarianceChecked
      ? numberFormatter(changeValue, format)  // Just number if variance is checked
      : isBpsChecked
      ? numberFormatter(changeValue, format) + " bps" // ✅ Append BPS label
      : Math.abs(changeValue).toFixed(1) + '%'; // % sign if change

    const measureDiv = document.createElement('div');
    measureDiv.classList.add('kpi-measure');

    measureDiv.innerHTML = `
      <span class="${changeClass}">${arrow} ${displayChange}</span>
      <span class="comparisonKPIAbsoluteValue">(${numberFormatter(measure.value, format)})</span> 
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

  // Read number format and variance checkbox value
  const numberFormat = chartModel.visualProps.numberFormat || userNumberFormat;
  const isVarianceChecked = chartModel.visualProps.Variance || false;
  const isBpsChecked = chartModel.visualProps.bps || false;

  const kpiValues = calculateKpiValues(chartModel);
  updateKpiContainer(kpiValues.measures, kpiValues.mainKpiValue, numberFormat, isVarianceChecked, isBpsChecked);
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
          key: 'Variance',
          type: 'checkbox',
          defaultValue: false,
          label: 'Variance',
        },
        {
          key: 'bps',
          type: 'checkbox',
          defaultValue: false,
          label: 'bps',
        },
      ],
    },
    onPropChange: (propKey, propValue) => {
      if (propKey === 'numberFormat') {
        userNumberFormat = propValue || '0.0';
        console.log('Number format updated to:', userNumberFormat); // Debugging line
        renderChart(ctx); // Re-render the chart with the new format
      }  else if (propKey === 'Variance') {
        console.log('Variance checkbox state changed:', propValue);
        renderChart(ctx);
      }  else if (propKey === 'bps') {
        console.log('BPS checkbox state changed:', propValue);
        renderChart(ctx);
      } else if (propKey === 'columnOrder' || propKey.startsWith('column')) {
        renderChart(ctx);
      }
    },
  });

  renderChart(ctx);
})();