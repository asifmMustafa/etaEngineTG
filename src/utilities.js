const { default: axios } = require("axios");
const { addQueueUser } = require("./db/models/user");
const { catchError } = require("./bot/errorHandler");
require("dotenv").config();
const translate = require("@iamtraction/google-translate");

const CONTEXT_LIMIT = 2000; // for testing
const SHORTCUTS = [
  "chatgpt",
  "dreamstudio",
  "drunkgpt",
  "essay_article",
  "etaSearch",
  "gfbf",
  "help_me_understand",
  "midjourney",
  "paraphrase",
  "rewrite",
  "storygame",
  "summarize",
  "faceswap",
  "assignmentHelp",
];

const updateTopShortcut = async (chat_id, user) => {
  const filteredEntries = Object.entries(user).filter(([key]) =>
    SHORTCUTS.includes(key)
  );

  const [maxKey] = filteredEntries.reduce(
    (max, curr) => (curr[1] > max[1] ? curr : max),
    [, -Infinity]
  );

  if ((user.topShortcut != maxKey || !user.topShortcut) && maxKey) {
    addQueueUser(chat_id, { topShortcut: maxKey });
  }
};

const containsBangla = (str) => {
  // Unicode range for Bengali characters: 0980–09FF
  const banglaRegex = /[\u0980-\u09FF]/;

  return banglaRegex.test(str);
};

const translateText = async (input, targetLang) => {
  try {
    const sourceLang = targetLang === "en" ? "bn" : "en";
    const result = await translate(input, { from: sourceLang, to: targetLang });
    return result.text;
  } catch (err) {
    catchError(err);
    console.log(`Error translating to ${targetLang}`);
  }
};

const getDifferenceInMinutes = (timestamp1, timestamp2) => {
  const time1 = timestamp1.toMillis();
  const time2 = timestamp2.toMillis();

  const differenceMillis = Math.abs(time1 - time2);

  return Math.floor(differenceMillis / 1000 / 60);
};

const changeURL = (url) => {
  if (url.includes("https://cdn.discordapp.com")) {
    const newUrl = url.replace(
      "https://cdn.discordapp.com",
      "https://media.discordapp.net"
    );
    return `${newUrl}?width=676&height=676`;
  } else {
    return `${url}?width=676&height=676`;
  }
};

const getImageBuffer = async (url) => {
  const response = await axios.get(url, {
    responseType: "arraybuffer", // This ensures the response data is returned as a Buffer
  });

  return Buffer.from(response.data);
};

const contextHasExceeded = (user, response) => {
  return (
    user.currentContextCost &&
    parseInt(user.currentContextCost) + parseInt(response.cost) > CONTEXT_LIMIT
  );
};

const pollTaskStatus = async (chat_id, startTime) => {
  try {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for 5 seconds

    const response = await axios.post(
      `${process.env.MJ_QUEUE_URL}/checkStatus`,
      {
        chat_id: chat_id,
      }
    );
    if (response.data.status === "completed") {
      console.log("Task completed!");
      return response.data;
    } else if (response.data.status === "failed") {
      console.log("Task failed!");
      return "Failed";
    } else if (response.data.status === "not found") {
      console.log("Task not found!");
      return "Failed";
    } else {
      console.log("Task still processing...");

      let timeout = 240000; // 240000 ms = 4 mins
      if (response.data.progress) timeout = 480000;

      console.log(response.data.progress, timeout);

      const now = Date.now();
      const timeDiff = now - startTime;

      if (timeDiff > timeout) return "Failed";

      return await pollTaskStatus(chat_id, startTime); // Poll again
    }
  } catch (error) {
    catchError(error);
    console.error("Error polling task status:", error);
  }
};

const generateRandomId = (length = 8) => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const escapeMarkdownSpecialChars = (text) => {
  const escapeChars = /[_*[\]()~`>#\+=\-={}\\.!]/g; // Characters to escape
  const escapeInCode = /[`\\]/g; // Characters to escape inside code blocks
  const escapeInLinks = /[)\\]/g; // Characters to escape inside links

  // Escape special characters
  let escapedText = text.replace(escapeChars, "\\$&");

  // Additional escaping for code blocks
  escapedText = escapedText.replace(/(```[\s\S]+?```|`[^`]+`)/g, (match) => {
    return match.replace(escapeInCode, "\\$&");
  });

  // Additional escaping for links
  escapedText = escapedText.replace(/\([^\)]+\)/g, (match) => {
    return match.replace(escapeInLinks, "\\$&");
  });

  return escapedText;
};

module.exports = {
  updateTopShortcut,
  pollTaskStatus,
  containsBangla,
  translateText,
  getDifferenceInMinutes,
  escapeMarkdownSpecialChars,
  changeURL,
  getImageBuffer,
  contextHasExceeded,
  generateRandomId,
};
