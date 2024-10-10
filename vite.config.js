import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        kpi_comparison_chart: resolve(
          __dirname,
          'kpi_comparison_chart/index.html'
        ),
        heatmap_chart: resolve(__dirname, 'heatmap_chart/index.html'),
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
});
