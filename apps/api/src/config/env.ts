import dotenv from 'dotenv';

dotenv.config();

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.warn(`[env] Missing ${name} – using empty string`);
    return '';
  }
  return value;
};

export const config = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: process.env.PORT ?? '4000',
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  JWT_SECRET: requiredEnv('JWT_SECRET'), // you'll set this later
};