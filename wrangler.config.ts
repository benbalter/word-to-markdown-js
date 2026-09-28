// Build-tool settings for the Wrangler delegate that `cf` uses. Deploy config
// (bindings, routing) lives in cloudflare.config.ts.
import { defineWranglerConfig } from 'wrangler/experimental-config';

export default defineWranglerConfig({
  types: {
    generate: false,
  },
  assetsDirectory: './dist',
});
