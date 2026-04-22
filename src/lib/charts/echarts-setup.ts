/**
 * Tree-shaken ECharts setup. Importing from `echarts/core` and registering
 * only the chart types and components we actually use saves substantial
 * bundle size compared to `import * as echarts from 'echarts'`. Every
 * chart we render on /w/:address is accounted for:
 *
 *   - LineChart          → equity curve
 *   - HeatmapChart       → PnL calendar
 *   - CalendarComponent  → PnL calendar date grid
 *   - TooltipComponent   → hover tooltips on both
 *   - GridComponent      → equity curve axes
 *   - VisualMapComponent → PnL calendar color scale
 *   - CanvasRenderer     → rendering backend
 *
 * If a new chart type or component is introduced, register it here.
 * Runtime errors of the form "Component [x] not exists" signal a missing
 * registration.
 */
import * as echarts from 'echarts/core';
import { LineChart, HeatmapChart } from 'echarts/charts';
import {
  CalendarComponent,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  HeatmapChart,
  CalendarComponent,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export { echarts };
