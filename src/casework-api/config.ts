import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3002', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5174',
  database: {
    url: process.env.DATABASE_URL || 'postgresql://casework:casework_dev_2026@localhost:5436/benefits_casework',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6381',
  },
  isDev: (process.env.NODE_ENV || 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
} as const;
