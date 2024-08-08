import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                kpi_comparison_chart: resolve(__dirname, 'kpi_comparison_chart/index.html'),
            }
        }
    }
});