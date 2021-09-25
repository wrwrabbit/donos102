require('dotenv').config();
const express = require('express');
const logger = require('morgan');
const packageJson = require('./package.json');

const telegramRouter = require('./bot/telegram');

console.log(`Telegram bot ${packageJson.name} v. ${packageJson.version}`);
console.log('Server preparing to start');

// Check env.
if (!process.env.TOKEN) {
  throw new Error('TOKEN must be provided!');
}

if (!process.env.PORT) {
  throw new Error('PORT must be provided!');
}

if (!process.env.SERVER_URL) {
  throw new Error('SERVER_URL must be provided!');
}

if (!process.env.GOOGLE_MAPS_API_KEY) {
  throw new Error('GOOGLE_MAPS_API_KEY must be provided!');
}

// Setup server
const app = express();

app.use(logger(process.env.NODE_ENV !== 'production' ? 'dev' : 'tiny'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

(async () => {
  console.log(`Server is ready. Try to start telegram bot.`);
  const telegramWebhookCallback = await telegramRouter();
  app.use(telegramWebhookCallback);
  app.listen(process.env.PORT);
})();



