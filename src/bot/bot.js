require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const telegram_token = process.env.TELEGRAM_TOKEN;

// Create a bot that uses 'webhook' to fetch new updates
const bot = new TelegramBot(telegram_token, {
  webHook: { port: process.env.PORT },
});

// This informs the Telegram servers of the new webhook.
bot.setWebHook(`${process.env.APP_URL}/bot${telegram_token}`);

module.exports = bot;
