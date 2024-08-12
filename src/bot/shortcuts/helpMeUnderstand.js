const { increment } = require("firebase/firestore");
const { updateShortcutCount } = require("../../db/models/globalData");
const {
  addMessageToContext,
  addResponseToContext,
  addToContext,
} = require("../../db/models/message");
const { updateUser, addQueueUser } = require("../../db/models/user");
const { generateResponse } = require("../../openai/chatgpt");
const {
  extractErrorMessageAndLineNumber,
  translateText,
} = require("../../utilities");
const {
  sendMessage,
  sendButtons,
  sendAlert,
  sendMenuMessage,
} = require("../botUtilities");
const { catchError } = require("../errorHandler");
const { getMessages } = require("../../db/models/snapshotListeners");
require("dotenv").config();

let BOT_REPLIES = {};
let PROMPTS = {};

const helpMeUnderstand = async (chat_id, user, text, callbackData) => {
  try {
    const messages = getMessages();
    BOT_REPLIES = messages.bot_replies;
    PROMPTS = messages.prompts;

    if (callbackData) {
      await helpMeUnderstandButtonHandler(chat_id, user, callbackData);
    } else {
      await helpMeUnderstandTextHandler(chat_id, user, text);
    }
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error in helpMeUnderstand mode");
  }
};

const helpMeUnderstandButtonHandler = async (chat_id, user, callbackData) => {
  let language = user.language || "english";

  switch (callbackData) {
    case "helpMeUnderstand":
      await sendMessage(
        chat_id,
        BOT_REPLIES.help_me_understand_topic_query[language]
      );
      await addQueueUser(chat_id, {
        mode: "helpMeUnderstand",
        step: 1,
        context: [
          {
            role: `system`,
            content: PROMPTS.help_me_understand_system,
          },
        ],
      });

      await updateShortcutCount(chat_id, `help_me_understand`, user.userType);
      return;
  }
};

const helpMeUnderstandTextHandler = async (chat_id, user, text) => {
  let language = user.language || "english";

  if (!text) {
    await sendMessage(chat_id, BOT_REPLIES.only_text_allowed[language]);
    return;
  }
  let context = [];
  if (user.context) {
    context = user.context;
  }

  switch (user.step) {
    case 1:
      context.push({
        role: "user",
        content: PROMPTS.help_me_understand_prefix.replace("{PROMPT}", text),
      });
      break;
  }

  let response = await generateResponse(
    context,
    process.env.GPT_MODEL_3,
    chat_id,
    user.userType
  );
  if (!response) {
    await sendMessage(chat_id, BOT_REPLIES.gpt_failed[language]);
    await sendMenuMessage(chat_id, language);
    await addQueueUser(chat_id, { mode: "menu", step: 0 });
    return;
  }

  if (user.language == "bangla") {
    const translatedText = await translateText(response.text, "bn");
    await sendMessage(chat_id, translatedText);
  } else {
    await sendMessage(chat_id, response.text);
  }

  context.push({ role: "assistant", content: response.text });
  await addToContext(chat_id, context);

  await addQueueUser(chat_id, {
    mode: "general",
    step: 1,
    currentContextCost: increment(response.cost),
  });
};

module.exports = { helpMeUnderstand };
