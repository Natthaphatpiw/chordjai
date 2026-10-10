const required=['DATABASE_URL','APP_JWT_SECRET','OPENAI_API_KEY','LINE_CHANNEL_ID','LINE_CHANNEL_SECRET','LINE_LOGIN_CHANNEL_ID','BLOB_READ_WRITE_TOKEN','CRON_SECRET'];
const optional=['LINE_CHANNEL_ACCESS_TOKEN','LINE_LOGIN_CHANNEL_ACCESS_TOKEN','NOTIFICATION_INTERNAL_URL'];
for(const name of required)console.log(`${name}: ${process.env[name]&&!process.env[name].includes('YOUR_')?'present':'missing'}`);
for(const name of optional)console.log(`${name}: ${process.env[name]?'present':'optional / automatic'}`);
// Never print secrets, connection strings, or token-bearing URLs.
