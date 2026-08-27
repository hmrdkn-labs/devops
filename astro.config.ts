import cloudflare from '@astrojs/cloudflare';
import solid from '@astrojs/solid-js';
import { sites } from '@openai/sites-vite-plugin';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://devops.hamardikan.com',
  output: 'server',
  session: false,
  adapter: cloudflare({ imageService: 'compile' }),
  integrations: [solid()],
  vite: {
    plugins: [sites()],
  },
});
