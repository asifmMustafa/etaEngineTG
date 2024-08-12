const fs = require("fs");
const axios = require("axios");
const {
  getMessages,
  getMenuMessage,
} = require("../db/models/snapshotListeners.js");
const { changeURL } = require("../utilities.js");
const { catchError } = require("./errorHandler.js");
const { resolve } = require("path");
const FormData = require("form-data");
const {
  getDocs,
  doc,
  collection,
  getDoc,
  updateDoc,
} = require("firebase/firestore");
const { db } = require("../db/firebase.js");
require("dotenv").config();

const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

const MENU_BUTTON_DATA = [
  [{ text: "🤖 ChatGPT", callback_data: "chatgpt" }],
  [{ text: "🖼️ Generate Image", callback_data: "image" }],
  // [{ text: "AI Portrait", callback_data: "aiPortrait" }],
  [{ text: "Assignment Help", callback_data: "assignmentHelp" }],
  // [
  //   {
  //     text: "🔎 etaSearch - live internet search",
  //     callback_data: "etaSearch",
  //   },
  // ],
  [{ text: "📚 Help Me Understand", callback_data: "helpMeUnderstand" }],
  [{ text: "🎩 Be my GF/BF", callback_data: "gfbf" }],
];

const telegram_token = process.env.TELEGRAM_TOKEN;

const sendMessage = async (chat_id, message) => {
  try {
    // Split the message into multiple parts if it's too long for a single Telegram message
    let messageParts = [];
    while (message.length > 0) {
      const part = message.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH);
      messageParts.push(part);
      message = message.slice(MAX_TELEGRAM_MESSAGE_LENGTH);
    }

    let lastMessageId;
    for (const part of messageParts) {
      const response = await axios.post(
        `https://api.telegram.org/bot${telegram_token}/sendMessage`,
        {
          chat_id,
          text: part,
        }
      );

      console.log(`Response to ${chat_id}: ${part}`);
      lastMessageId = response.data.result.message_id;
    }

    return lastMessageId;
  } catch (err) {
    catchError(err);
    console.log(err);
    console.log("Error sending message");
  }
};

const sendPhoto = async (chat_id, data) => {
  try {
    let response;
    if (Buffer.isBuffer(data)) {
      const form = new FormData();
      form.append("chat_id", chat_id);
      form.append("photo", data, `${chat_id}.jpg`);

      response = await axios.post(
        `https://api.telegram.org/bot${telegram_token}/sendPhoto`,
        form,
        { headers: form.getHeaders() }
      );
    } else {
      response = await axios.post(
        `https://api.telegram.org/bot${telegram_token}/sendPhoto`,
        {
          chat_id,
          photo: changeURL(data),
        }
      );
    }

    return response.data.result.message_id;
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error sending photo");
  }
};

const sendFile = async (chat_id, link) => {
  try {
    const formData = new FormData();
    formData.append("chat_id", chat_id);
    formData.append("document", fs.createReadStream(link));

    const response = await axios.post(
      `https://api.telegram.org/bot${telegram_token}/sendDocument`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
      }
    );

    return response.data.result.message_id;
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error sending file");
  }
};

const sendPictureFile = async (chat_id, link) => {
  try {
    const formData = new FormData();
    formData.append("chat_id", chat_id);
    const buffer = Buffer.from(link, "binary");
    formData.append("photo", buffer);

    const response = await axios.post(
      `https://api.telegram.org/bot${telegram_token}/sendDocument`,
      {
        chat_id: chat_id,
        document: link,
      }
    );

    return response.data.result.message_id;
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error sending file");
  }
};

const sendDocument = async (chat_id, buffer, options) => {
  try {
    const formData = new FormData();
    formData.append("chat_id", chat_id);
    formData.append("document", buffer, options.filename);

    const response = await axios.post(
      `https://api.telegram.org/bot${telegram_token}/sendDocument`,
      formData,
      {
        headers: formData.getHeaders(),
      }
    );

    return response.data;
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error sending document");
  }
};

const getFileLink = async (file_id) => {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${telegram_token}/getFile`,
      {
        file_id: file_id,
      }
    );

    const file_link = `https://api.telegram.org/file/bot${telegram_token}/${response.data.result.file_path}`;

    return file_link;
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error getting file link.");
  }
};

const sendButtons = async (chat_id, message, buttonData) => {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${telegram_token}/sendMessage`,
      {
        chat_id,
        text: message,
        reply_markup: JSON.stringify({
          inline_keyboard: buttonData,
        }),
      }
    );

    return response.data.result;
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error sending button");
  }
};

const sendMenuMessage = async (chat_id, language = "english") => {
  try {
    let buttonsData = MENU_BUTTON_DATA;
    if (language == "english") {
      buttonsData = [
        ...MENU_BUTTON_DATA,
        [{ text: "Change to বাংলা", callback_data: "changeToBangla" }],
      ];
    } else {
      buttonsData = [
        ...MENU_BUTTON_DATA,
        [{ text: "Change to English", callback_data: "changeToEnglish" }],
      ];
    }
    await sendButtons(
      chat_id,
      getMenuMessage().bot_replies.menu[language],
      buttonsData
    );
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error sending Menu Message");
  }
};

const deleteMessage = async (chat_id, message_id, retryCount = 0) => {
  try {
    await axios.post(
      `https://api.telegram.org/bot${telegram_token}/deleteMessage`,
      {
        chat_id,
        message_id,
      }
    );
  } catch (err) {
    catchError(err);
    console.log(err.message);
    // If the error is a 400 and we have not retried 5 times yet, then retry
    if (err.response && err.response.statusCode === 400 && retryCount < 5) {
      console.log("Retrying message deletion");
      await new Promise((r) => setTimeout(r, 2000)); // delay for 2 seconds before retrying
      await deleteMessage(chat_id, message_id, retryCount + 1);
    } else {
      console.log("Error deleting message");
    }
  }
};

const sendPaywallButton = async (chat_id) => {
  try {
    await axios.post(
      `https://api.telegram.org/bot${telegram_token}/sendMessage`,
      {
        chat_id,
        text: "Please purchase a subscription to use our features.",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Make payment",
                url: `https://beta.etagpt.io`,
              },
            ],
          ],
        },
      }
    );
  } catch (err) {
    catchError(err);
    console.log(err);
  }
};

const handleActivation = async (chat_id, text) => {
  if (text.length != 42) {
    await sendMessage(
      chat_id,
      getMessages().bot_replies.invalid_activation_code.english
    );
    return;
  }
  const details = extractDetails(text);
  if (details) {
    const docRef = await getDoc(doc(db, "Accounts", details.number));
    if (!docRef.exists()) {
      await sendMessage(
        chat_id,
        getMessages().bot_replies.invalid_activation_code.english
      );
      return;
    }
    if (details.hashKey != docRef.data().serial) {
      await sendMessage(
        chat_id,
        getMessages().bot_replies.invalid_activation_code.english
      );
      return;
    }

    await updateDoc(doc(db, "Accounts", details.number), {
      platform: `Telegram`,
      chat_id: chat_id,
    });
    await sendMessage(
      chat_id,
      getMessages().bot_replies.account_activated.english
    );
    await updateDoc(doc(db, "usersTG", `${chat_id}`), {
      premium: true,
      expiryDate: docRef.data().expiry,
    });
  }
};

function extractDetails(str) {
  const regex = /\/activate (\d+) ([a-f0-9]+)/;
  const match = str.match(regex);

  if (match) {
    return {
      number: match[1],
      hashKey: match[2],
    };
  } else {
    return null;
  }
}

const sendPaymentButton = async (chat_id) => {
  try {
    await axios.post(
      `https://api.telegram.org/bot${telegram_token}/sendMessage`,
      {
        chat_id,
        text: "You have exceeded the limit to use this mode. Please purchase the subscription to use it.",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Make payment",
                url: `https://reliable-palmier-f69b2c.netlify.app/user/tg/${chat_id}`,
              },
            ],
          ],
        },
      }
    );
  } catch (err) {
    catchError(err);
    console.log(err);
  }
};

const answerCallbackQuery = async (callbackQueryId) => {
  try {
    await axios.post(
      `https://api.telegram.org/bot${telegram_token}/answerCallbackQuery`,
      {
        callback_query_id: callbackQueryId,
        text: "",
      }
    );
  } catch (err) {
    catchError(err);
    console.error(err);
    console.error("Error answering callback query");
  }
};

module.exports = {
  sendMessage,
  sendButtons,
  sendDocument,
  deleteMessage,
  sendMenuMessage,
  sendPhoto,
  sendFile,
  getFileLink,
  sendPaymentButton,
  sendPaywallButton,
  handleActivation,
  answerCallbackQuery,
  sendPictureFile,
};
