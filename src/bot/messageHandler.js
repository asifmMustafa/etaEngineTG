const { resetContext } = require("../db/models/message.js");
const {
  getUserData,
  updateUser,
  addQueueUser,
} = require("../db/models/user.js");
const {
  sendMessage,
  deleteMessage,
  sendMenuMessage,
  sendPaywallButton,
  handleActivation,
} = require("./botUtilities.js");
const { createNewUser } = require("../bot/shortcuts/newUser.js");
const { generalMode } = require("../bot/shortcuts/generalMode.js");
const { image } = require("../bot/shortcuts/imageGeneration.js");
const { helpMeUnderstand } = require("./shortcuts/helpMeUnderstand.js");
const { gfbf } = require("./shortcuts/gfbf.js");
const { handleSession } = require("../db/models/session.js");
const { etaSearch } = require("./shortcuts/etaSearch.js");
const {
  updateTopShortcut,
  containsBangla,
  translateText,
} = require("../utilities.js");
const { assignmentHelp } = require("./shortcuts/assignmentHelp.js");
const { aiPortrait } = require("./shortcuts/aiPortrait.js");
const {
  isPaywallOn,
  getShortcutsMaintenanceStatus,
  getMessages,
} = require("../db/models/snapshotListeners.js");
const { catchError } = require("./errorHandler.js");
const { deleteField } = require("firebase/firestore");

const handleMessage = async (msg) => {
  try {
    const chat_id = msg.chat.id;
    const user = await getUserData(chat_id);
    let language = user.language || "english";

    //If it is a new user
    if (!user) {
      catchError(new Error("Database Error"));
      return;
    } else if (user == "NOT FOUND") {
      createNewUser(chat_id, { step: 0 }, msg.text);
      return;
    }

    await handleSession(msg.chat.id, user);

    // if (msg.text && msg.text.startsWith("/activate")) {
    //   await handleActivation(chat_id, msg.text);
    //   return;
    // }

    if (msg.text == "/premium") {
      addQueueUser(chat_id, { premium: true, mode: "menu", step: 0 });
      await sendMessage(chat_id, `You are now a premium user.`);
      await sendMenuMessage(chat_id, user.language || "english");
      return;
    }

    if (msg.text == "/trial") {
      addQueueUser(chat_id, { premium: false, mode: "menu", step: 0 });
      await sendMessage(chat_id, `You are now a trial user.`);
      await sendMenuMessage(chat_id, user.language || "english");
      return;
    }

    if (msg.text == "/reset") {
      addQueueUser(chat_id, {
        gfbf_message_count: deleteField(),
        gfbf_last_used: deleteField(),
        assignmentHelp: 0,
        assignment_help_monthly_count: deleteField(),
        mode: "menu",
        step: 0,
      });
      await sendMessage(
        chat_id,
        `Assignment help and gfbf message counts have been reset.`
      );
      await sendMenuMessage(chat_id, user.language || "english");
      return;
    }

    // if (msg.text == "/refer") {
    //   let totalReferrals = 0;
    //   if (user?.referrals) {
    //     totalReferrals = user?.referrals?.length;
    //   }
    //   await sendMessage(
    //     chat_id,
    //     `Refer ${2 - totalReferrals} ${
    //       totalReferrals > 0 ? `more` : ``
    //     } friends using the following link to get 1 month free trial.\nhttps://t.me/fatafati_bot/?start=${chat_id}`
    //   );
    //   return;
    // }

    const menuStrings = ["menu", "/menu"];

    //If user requests the menu
    if (
      user.mode != `registration` &&
      menuStrings.includes(msg?.text?.toLowerCase())
    ) {
      await sendMenuMessage(chat_id, user.language || "english");
      await addQueueUser(chat_id, {
        step: 0,
        mode: "menu",
        midjourneyRef: null,
        currentContextCost: 0,
      });
      await resetContext(chat_id);
      return;
    }

    // if (isPaywallOn() && !user.premium) {
    //   await sendPaywallButton(chat_id);
    //   return;
    // }

    const shortcutsMaintenanceStatus = getShortcutsMaintenanceStatus();
    if (shortcutsMaintenanceStatus[user.mode]) {
      await addQueueUser(chat_id, { mode: "menu", step: 0 });
      await sendMessage(
        chat_id,
        getMessages().bot_replies.shortcut_maintenance_mode[language]
      );
      await sendMenuMessage(chat_id, user.language || "english");
      return;
    }

    if (user.language == "bangla" && containsBangla(msg.text)) {
      msg.text = await translateText(msg.text, "en");
    }

    //shortcuts
    switch (user.mode) {
      case "registration":
        await createNewUser(chat_id, user, msg.text);
        break;
      case "menu":
        await sendMessage(
          chat_id,
          getMessages().bot_replies.invalid_selection_message[language]
        );
        break;
      case "general":
        await generalMode(chat_id, user, msg.text);
        break;
      case "image":
        await image(chat_id, user, msg.text);
        break;
      case "helpMeUnderstand":
        await helpMeUnderstand(chat_id, user, msg.text);
        break;
      case "gfbf":
        await gfbf(chat_id, user, msg.text);
        break;
      case "etaSearch":
        await etaSearch(chat_id, user, msg.text);
        break;
      case "assignmentHelpGemini":
        await assignmentHelp(chat_id, user, msg, null, true);
        break;
      case "assignmentHelp":
        await assignmentHelp(chat_id, user, msg);
        break;
      case "aiPortrait":
        await aiPortrait(chat_id, user, msg);
        break;
    }

    await updateTopShortcut(chat_id, user);
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error handling message");
  }
};

const handleButton = async (callback) => {
  try {
    const chat_id = callback.from.id;
    const message_id = callback.message.message_id;
    const user = await getUserData(chat_id);
    let language = user.language || "english";

    if (!user) {
      catchError(new Error("Database Error"));
      return;
    } else if (user == "NOT FOUND") {
      return;
    }

    await deleteMessage(chat_id, message_id);

    if (
      (callback.data.includes("assignmentHelp_") ||
        callback.data.includes("gfbf_")) &&
      user.mode == "menu"
    ) {
      await sendMessage(
        chat_id,
        getMessages().bot_replies.invalid_selection_message[language]
      );
      return;
    }

    await handleSession(chat_id, user);

    // if (isPaywallOn() && !user.premium) {
    //   await sendPaywallButton(chat_id);
    //   return;
    // }

    const shortcutsMaintenanceStatus = getShortcutsMaintenanceStatus();
    let shortcut = callback.data;
    if (callback.data == "chatgpt") shortcut = "general";
    if (shortcutsMaintenanceStatus[shortcut]) {
      await addQueueUser(chat_id, { mode: "menu", step: 0 });
      await sendMessage(
        chat_id,
        getMessages().bot_replies.shortcut_maintenance_mode[language]
      );
      await sendMenuMessage(chat_id, user.language || "english");
      return;
    }

    if (callback.data == "chatgpt") {
      await generalMode(chat_id, user);
    } else if (callback.data.includes("image")) {
      await image(chat_id, user, null, callback.data);
    } else if (callback.data.includes("helpMeUnderstand")) {
      await helpMeUnderstand(chat_id, user, null, callback.data);
    } else if (callback.data.includes("gfbf")) {
      await gfbf(chat_id, user, null, callback.data);
    } else if (callback.data.includes("etaSearch")) {
      await etaSearch(chat_id, user, null, callback.data);
    } else if (callback.data == "assignmentHelpGemini") {
      await assignmentHelp(chat_id, user, null, callback.data, true);
    } else if (callback.data.includes("assignmentHelp")) {
      await assignmentHelp(chat_id, user, null, callback.data);
    } else if (callback.data.includes("aiPortrait")) {
      await aiPortrait(chat_id, user, null, callback.data);
    } else if (callback.data.includes("changeToBangla")) {
      await addQueueUser(chat_id, { language: "bangla" });
      await sendMessage(chat_id, `Language changed to Bangla`);
      await sendMenuMessage(chat_id, "bangla");
    } else if (callback.data.includes("changeToEnglish")) {
      await addQueueUser(chat_id, { language: "english" });
      await sendMessage(chat_id, `Language changed to English`);
      await sendMenuMessage(chat_id, "english");
    }

    // await updateTopShortcut(chat_id, user);
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error handling button");
  }
};

module.exports = { handleMessage, handleButton };
