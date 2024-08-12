const moment = require("moment-timezone");
const { increment, Timestamp } = require("firebase/firestore");
const { updateShortcutCount } = require("../../db/models/globalData");
const {
  addToContext,
  resetContext,
  setContext,
} = require("../../db/models/message");
const { addQueueUser, updateUser } = require("../../db/models/user");
const { generateResponse } = require("../../openai/chatgpt");
const {
  translateText,
  getDifferenceInMinutes,
  contextHasExceeded,
} = require("../../utilities");
const {
  sendMessage,
  sendButtons,
  sendMenuMessage,
} = require("../botUtilities");
const { catchError } = require("../errorHandler");
const { getMessages } = require("../../db/models/snapshotListeners");
require("dotenv").config();

let BOT_REPLIES = {};
let PROMPTS = {};

const gfbf = async (chat_id, user, text, callbackData) => {
  try {
    const messages = getMessages();
    BOT_REPLIES = messages.bot_replies;
    PROMPTS = messages.prompts;
    let language = user.language || "english";

    if ("gfbf_message_count" in user && "gfbf_last_used" in user) {
      if (!user.premium && user.gfbf_message_count > 4) {
        await addQueueUser(chat_id, { step: 0, mode: "menu" });
        await sendMessage(
          chat_id,
          "Purchase premium to use this shortcut again."
        );
        await sendMenuMessage(chat_id, language);
        return;
      }

      if (user.premium) {
        const now = Timestamp.fromDate(
          new Date(moment().tz("Asia/Dhaka").toISOString())
        );

        if (getDifferenceInMinutes(now, user.gfbf_last_used) < 1) {
          if (user.gfbf_message_count > 4) {
            await addQueueUser(chat_id, {
              step: 0,
              mode: "menu",
              currentContextCost: 0,
            });
            await sendMessage(
              chat_id,
              "Let’s take a break. I’m really tired now. 😴"
            );
            await sendMenuMessage(chat_id, language);
            return;
          }
        } else {
          await updateUser(chat_id, {
            gfbf_message_count: 0,
          });
        }
      }
    }

    if (callbackData) {
      await gfbfButtonHandler(chat_id, user, callbackData);
    } else {
      await gfbfTextHandler(chat_id, user, text);
    }
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error in gfbf mode");
  }
};

const gfbfButtonHandler = async (chat_id, user, callbackData) => {
  let language = user.language || "english";

  switch (callbackData) {
    case "gfbf":
      const bfgfButtonData = [
        [
          {
            text: "Girlfriend",
            callback_data: "gfbf_gf",
          },
        ],
        [
          {
            text: "Boyfriend",
            callback_data: "gfbf_bf",
          },
        ],
      ];
      await sendButtons(
        chat_id,
        BOT_REPLIES.gfbf_gfbf_selection[language],
        bfgfButtonData
      );
      await addQueueUser(chat_id, {
        mode: "gfbf",
        step: 1,
        context: [
          {
            role: "system",
            content: PROMPTS.gfbf_system,
          },
        ],
      });

      await updateShortcutCount(chat_id, "gfbf", user.userType);
      return;

    case "gfbf_gf":
    case "gfbf_bf":
      await sendMessage(
        chat_id,
        BOT_REPLIES.gfbf_characteristics_query[language]
      );
      await addQueueUser(chat_id, {
        mode: "gfbf",
        followUpStore: callbackData == "gfbf_gf" ? "Girlfriend" : "Boyfriend",
        step: 2,
      });
      return;
  }
};

const gfbfTextHandler = async (chat_id, user, text) => {
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
      await sendMessage(
        chat_id,
        BOT_REPLIES.invalid_selection_message[language]
      );
      return;

    case 2:
      context.push({
        role: "user",
        content: PROMPTS.gfbf_prefix
          .replace("{SELECTION}", user.followUpStore)
          .replace("{CHARACTERISTICS}", text),
      });
      break;

    case 3:
      context.push({
        role: "user",
        content: text,
      });
      break;
  }

  let response = await generateResponse(
    context,
    process.env.GPT_MODEL_4,
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

  await addQueueUser(chat_id, {
    step: 3,
    gfbf_message_count:
      typeof user.gfbf_message_count == "number"
        ? user.step == 3
          ? increment(1)
          : 0
        : 0,
    gfbf_last_used: new Date(moment().tz("Asia/Dhaka")),
    currentContextCost: increment(response.cost),
  });

  if (contextHasExceeded(user, response)) {
    let res = await setContext(chat_id, context.slice(0, 2), 0);
    await sendMessage(chat_id, BOT_REPLIES.context_reset[language]);
    if (res === "ERROR") {
      await resetContext(chat_id);
      await addQueueUser(chat_id, { mode: "menu", step: 0 });
      await sendMenuMessage(chat_id, language);
      return;
    }
  } else {
    context.push({ role: "assistant", content: response.text });
    await addToContext(chat_id, context);
  }
};

module.exports = { gfbf };
