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
        kpi_comparison_chart_dev: resolve(__dirname, 'kpi_comparison_chart_dev/index.html'),
        main: resolve(__dirname, 'index.html'),

      },
    },
  },
  server: {
    host: '0.0.0.0', // Allows external access
    port: 5173, // Ensure this matches your dev server port
    strictPort: true, // Ensures Vite does not pick a random port
    cors: true, // Enable CORS for external access
    allowedHosts: "1b61-2406-7400-10b-c22b-4dfe-a3ba-26ed-4b6f.ngrok-free.app",
    hmr: {
      clientPort: 443, // Use default HTTPS port (important for Ngrok)
    },
    origin: 'https://1b61-2406-7400-10b-c22b-4dfe-a3ba-26ed-4b6f.ngrok-free.app', // Set Ngrok as origin
  },
});
