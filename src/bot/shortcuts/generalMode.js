const { increment } = require("firebase/firestore");
const { updateShortcutCount } = require("../../db/models/globalData");
const {
  addMessageToContext,
  addResponseToContext,
  resetContext,
  addToContext,
} = require("../../db/models/message");
const { updateUser, addQueueUser } = require("../../db/models/user");
const { generateResponse } = require("../../openai/chatgpt");
const {
  containsBangla,
  translateText,
  extractErrorMessageAndLineNumber,
  contextHasExceeded,
} = require("../../utilities");
const {
  sendMessage,
  sendPaymentButton,
  sendAlert,
  sendMenuMessage,
} = require("../botUtilities");
const { catchError } = require("../errorHandler");
const { getMessages } = require("../../db/models/snapshotListeners");
require("dotenv").config();
// const { image } = require("./imageGenerationOld");

let BOT_REPLIES = {};

const generalMode = async (chat_id, user, text) => {
  try {
    BOT_REPLIES = getMessages().bot_replies;
    let language = user.language || "english";

    const mode = `general`;
    // if (user[mode] > 5 && !user.premium) {
    //   await sendPaymentButton(chat_id);
    //   return;
    // }

    switch (user.step) {
      case 0:
        await sendMessage(
          chat_id,
          BOT_REPLIES.general_mode_prompt_query[language]
        );
        await addQueueUser(chat_id, { step: 1, mode: "general" });
        await updateShortcutCount(chat_id, `general`, user.userType);
        return;
      case 1:
        if (!text) {
          await sendMessage(chat_id, BOT_REPLIES.only_text_allowed[language]);
          return;
        }
        let promptText = text;
        if (containsBangla(text)) {
          console.log(text);
          promptText = await translateText(text, "en");
        }
        let context = [];
        if (user.context) {
          context = user.context;
        }
        // await addMessageToContext(chat_id, text);
        context.push({ role: "user", content: promptText });
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

        console.log(response);
        await addQueueUser(chat_id, {
          step: 1,
          currentContextCost: increment(response.cost),
        });
        let finalResponse = response.text;
        if (
          typeof response == "object" &&
          response.text.name == "generate_midjourney"
        ) {
          console.log("yes");
          const imgPrompt = JSON.parse(response.text.arguments).prompt;
          await image(chat_id, { step: 2, mode: "image" }, imgPrompt, null);
          return;
        }

        if (containsBangla(text) || user.language == "bangla") {
          finalResponse = await translateText(response.text, "bn");
        }

        await sendMessage(chat_id, finalResponse);

        if (contextHasExceeded(user, response)) {
          await sendMessage(chat_id, BOT_REPLIES.context_reset[language]);
          await resetContext(chat_id);
        } else {
          context.push({ role: "assistant", content: response.text });
          await addToContext(chat_id, context);
        }

        return;
    }
  } catch (err) {
    await resetContext(chat_id);
    catchError(err);
    console.log(err);
    console.log("Error in general mode");

    await sendMessage(
      chat_id,
      BOT_REPLIES.shortcut_failed[language].replace("{MODE}", "ChatGPT")
    );
    await sendMenuMessage(chat_id, language);
    addQueueUser(chat_id, { mode: "menu", step: 0 });
  }
};

module.exports = { generalMode };
