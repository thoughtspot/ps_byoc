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
        custom_bar_chart: resolve(__dirname, 'custom_bar_chart/index.html'),
        main: resolve(__dirname, 'index.html'),

      },
    },
  },
  server: {
    host: '0.0.0.0', // Allows access from external devices
    port: 5173, // Ensure this matches your dev server port
    allowedHosts: [
      '2959-2406-7400-10b-a0f3-acde-eb00-81a2-d7b1.ngrok-free.app' // Add your ngrok URL here
    ],
    strictPort: true, // Ensures Vite does not pick a random port
    cors: true // Enable CORS if needed
  }
});
