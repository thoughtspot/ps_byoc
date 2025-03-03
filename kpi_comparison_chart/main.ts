import {
  ChartToTSEvent,
  ColumnType,
  getChartContext,
  CustomChartContext,
} from '@thoughtspot/ts-chart-sdk';
import * as _ from 'lodash';
import numeral from 'numeral';

/** Type for visual properties */
interface VisualProps {
  numberFormat?: string;
}

/** Type for a single measure */
interface Measure {
  label: string;
  value: number;
  change: number;
}

/** Type for chart model */
interface ChartModel {
  data?: { dataValue: any[][]; columns: string[] }[];
  columns: { id: string; name: string; type: ColumnType }[];
  config?: { chartConfig?: { dimensions?: { key: string; columns: { id: string }[] }[] }[] };
  visualProps: VisualProps;
}

/** Default number format */
let userNumberFormat: string = '0.0';

/** Function to format numbers dynamically */
const numberFormatter = (value: number, format: string = ''): string => {
  if (value > 1_000_000_000 || value < -1_000_000_000) {
    return `${userNumberFormatter(value / 1_000_000_000, format)}B`;
  } else if (value > 1_000_000 || value < -1_000_000) {
    return `${userNumberFormatter(value / 1_000_000, format)}M`;
  } else if (value > 1_000 || value < -1_000) {
    return `${userNumberFormatter(value / 1_000, format)}K`;
  } else {
    return userNumberFormatter(value, format);
  }
};

/** Function to format numbers using numeral.js */
const userNumberFormatter = (value: number, format: string): string => numeral(value).format(format);

/** Function to get data for a specific column */
function getDataForColumn(column: { id: string }, dataArr: { columns: string[]; dataValue: any[][] }): number[] {
  const idx = _.findIndex(dataArr.columns, (colId) => column.id === colId);
  return _.map(dataArr.dataValue, (row) => row[idx]) as number[];
}

/** Function to calculate KPI values */
function calculateKpiValues(chartModel: ChartModel): { mainKpiValue: number; measures: Measure[] } {
  const dataArr = chartModel.data?.[0] ?? { dataValue: [], columns: [] };
  const measureColumns = chartModel.columns.filter((col) => col.type === ColumnType.MEASURE);

  if (measureColumns.length === 0 || dataArr.dataValue.length === 0) {
    return { mainKpiValue: 0, measures: [] };
  }

  const configDimensions = chartModel.config?.chartConfig?.[1]?.dimensions
    ?? chartModel.config?.chartConfig?.[0]?.dimensions ?? [];

  const mainKpiColumn = configDimensions.find((it) => it.key === 'x');
  const mainKpiColumnId = mainKpiColumn?.columns?.[0]?.id;

  const mainKpiValue = mainKpiColumnId
    ? _.sum(getDataForColumn(mainKpiColumn.columns[0], dataArr))
    : 0;

  const comparisonMeasures = measureColumns.filter((col) =>
    col.id !== mainKpiColumnId &&
    configDimensions.some(dimension => dimension.columns.some(c => c.id === col.id))
  );

  const measures: Measure[] = comparisonMeasures.map((col) => {
    const value = _.sum(getDataForColumn(col, dataArr));
    const change = mainKpiValue !== 0 ? ((mainKpiValue - value) / Math.abs(value)) * 100 : 0;
    return { label: col.name, value, change };
  });

  return { mainKpiValue, measures };
}

/** Function to update the KPI container dynamically */
function updateKpiContainer(measures: Measure[], mainKpiValue: number, format: string) {
  const mainValueElement = document.getElementById('mainKpiValue');
  if (mainValueElement) mainValueElement.innerText = numberFormatter(mainKpiValue, format);

  const kpiContainer = document.getElementById('kpiMeasures');
  if (kpiContainer) {
    kpiContainer.innerHTML = '';
    measures.forEach((measure) => {
      const changeClass = measure.change > 0 ? 'kpi-positive' : 'kpi-negative';
      const arrow = measure.change > 0 ? '↑' : '↓';
      const displayChange = Math.abs(measure.change).toFixed(1);

      const measureDiv = document.createElement('div');
      measureDiv.classList.add('kpi-measure');
      measureDiv.innerHTML = `
              <span class="${changeClass}">${arrow} ${displayChange}%</span>
              <span class="comparisonKPIAbsoluteValue">(${numberFormatter(measure.value, format)})</span>
              <span class="comparisonKPIName">vs. ${measure.label}</span>
          `;
      kpiContainer.appendChild(measureDiv);
    });
  }
}

/** Function to render the chart */
async function render(ctx: ChartContext) {
  const chartModel: ChartModel = await ctx.getChartModel();
  const numberFormat = chartModel.visualProps.numberFormat || userNumberFormat;
  const kpiValues = calculateKpiValues(chartModel);
  updateKpiContainer(kpiValues.measures, kpiValues.mainKpiValue, numberFormat);
}

/** Function to handle ThoughtSpot events */
const renderChart = async (ctx: ChartContext) => {
  try {
    ctx.emitEvent(ChartToTSEvent.RenderStart);
    await render(ctx);
  } catch (e) {
    ctx.emitEvent(ChartToTSEvent.RenderError, { hasError: true, error: e });
  } finally {
    ctx.emitEvent(ChartToTSEvent.RenderComplete);
  }
};

/** Initialize ThoughtSpot context */
(async () => {
  const ctx = await getChartContext({
    getDefaultChartConfig: (chartModel: ChartModel) => {
      const measureColumns = chartModel.columns.filter((col) => col.type === ColumnType.MEASURE);
      return [
        {
          key: 'column',
          dimensions: [
            { key: 'x', columns: measureColumns.length > 0 ? [measureColumns[0]] : [] },
            { key: 'y', columns: measureColumns.length > 1 ? measureColumns.slice(1) : [] },
          ],
        },
      ];
    },
    renderChart,
    visualPropEditorDefinition: {
      elements: [
        { key: 'numberFormat', type: 'text', defaultValue: '0.0', label: 'Number Format' },
      ],
    },
    onPropChange: (propKey: string, propValue: any) => {
      if (propKey === 'numberFormat') {
        userNumberFormat = propValue || '0.0';
        renderChart(ctx);
      } else if (propKey === 'columnOrder' || propKey.startsWith('column')) {
        renderChart(ctx);
      }
    },
  });

  renderChart(ctx);
})();
