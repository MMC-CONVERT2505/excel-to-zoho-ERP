import app from './src/app.js';
import { config } from './src/config/env.js';

app.listen(config.port, () => {
  console.log(`Backend (${config.isProd ? 'production' : 'development'}) running on port ${config.port}`);
});
