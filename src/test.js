const bot = require("./bot/bot.js");
const { catchError, Bugsnag } = require("./bot/errorHandler.js");
const { handleMessage, handleButton } = require("./bot/messageHandler.js");
const {
  getMessagesWhisperBridge,
} = require("./db/models/snapshotListeners.js");
const { updateQueueUser, getUserData } = require("./db/models/user.js");

//Array to store chat_id of user that has ongoing process
let generating = [];

//When a user sends a message
bot.on("message", async (msg) => {
  try {
    console.log(`${msg.chat.id}: ${msg.text}`);
    if (msg.chat.type == "group") {
      return;
    }
    if (generating.includes(msg.chat.id)) {
      const user = await getUserData(msg.chat.id);
      let language = user.language || "english";

      await bot.sendMessage(
        msg.chat.id,
        getMessagesWhisperBridge().bot_replies.multitasking_error[language]
      );
      return;
    }
    generating.push(msg.chat.id);

    //Response Logic here
    await handleMessage(msg);

    //Write everything to the User Document
    await updateQueueUser(msg.chat.id);

    generating = generating.filter((item) => item !== msg.chat.id);
  } catch (err) {
    generating = generating.filter((item) => item !== msg.chat.id);
    catchError(err);
    console.log(err.stack);
  }
});

//When a user presses a button
bot.on("callback_query", async (callbackQuery) => {
  try {
    console.log(`${callbackQuery.from.id}: ${callbackQuery.data}`);
    await bot.answerCallbackQuery(callbackQuery.id, { text: `` });
    if (generating.includes(callbackQuery.from.id)) {
      const user = await getUserData(callbackQuery.from.id);
      let language = user.language || "english";

      bot.sendMessage(
        callbackQuery.from.id,
        getMessagesWhisperBridge().bot_replies.multitasking_error[language]
      );
      return;
    }
    generating.push(callbackQuery.from.id);

    //Response Logic here
    await handleButton(callbackQuery);

    //Write everything to the User Document
    await updateQueueUser(callbackQuery.from.id);

    generating = generating.filter((item) => item !== callbackQuery.from.id);
  } catch (err) {
    catchError(err);
    generating = generating.filter((item) => item !== callbackQuery.from.id);
    console.log(err.stack);
  }
});
