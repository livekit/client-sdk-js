import { defineConfig } from 'vite';
import { handler } from './api.ts';

export default defineConfig({
  plugins: [
    {
      name: 'api-handler',
      configureServer(server) {
        server.middlewares.use(handler);
      },
      configurePreviewServer(server) {
        server.middlewares.use(handler);
      },
    },
  ],
});
