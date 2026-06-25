// Redis is currently disabled to keep the free-tier deployment lean.
// When you want to re-enable Redis (e.g. Upstash free tier), restore the
// code below and provide REDIS_* env vars on Render.

const dotenv = require('dotenv');
dotenv.config({ path: './config.env' });

// In-memory stub so any `require('./db/redis')` callers don't crash.
// All Redis methods are no-ops; do NOT use this in production traffic.
const noop = () => {};
const client = {
  connect: noop,
  get: async () => null,
  set: async () => 'OK',
  del: async () => 1,
  exists: async () => 0,
  expire: async () => 1,
  flushAll: noop,
  quit: noop,
  on: noop,
  disconnect: noop,
};

module.exports = client;

/*
if (process.env.NODE_ENV === 'production') {
  const { createClient } = require('redis');
  const redis = require('ioredis');

  const client = createClient({
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    socket: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
    },
  });

  client.on('error', (err) => console.log('❌ Redis Client Error:', err));

  const connectRedis = async () => {
    try {
      await client.connect();
      console.log('✅ Redis Connected Successfully!');
    } catch (err) {
      console.error('❌ Redis Connection Failed:', err);
    }
  };
  connectRedis();
  module.exports = client;
} else {
  const redis = require('ioredis');
  const client = new redis();
  module.exports = client;
}
*/
