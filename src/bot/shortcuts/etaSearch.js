const { updateUser, addQueueUser } = require("../../db/models/user");
const { generateResponse } = require("../../openai/chatgpt");
const {
  sendMessage,
  sendPaymentButton,
  sendAlert,
  sendMenuMessage,
} = require("../botUtilities");
const moment = require("moment-timezone");
const googleIt = require("google-it");
const { default: axios } = require("axios");
const cheerio = require("cheerio");
const {
  addMessageToContext,
  addResponseToContext,
  addToContext,
} = require("../../db/models/message");
const { updateShortcutCount } = require("../../db/models/globalData");
const {
  extractErrorMessageAndLineNumber,
  translateText,
} = require("../../utilities");
const { catchError } = require("../errorHandler");
const { getMessages } = require("../../db/models/snapshotListeners");
require("dotenv").config();

const date = new Date(moment().tz("Asia/Dhaka"));
const characterLimit = 3000;

let BOT_REPLIES = {};
let PROMPTS = {};

function containsBangla(str) {
  // Unicode range for Bengali characters: 0980–09FF
  const banglaRegex = /[\u0980-\u09FF]/;

  return banglaRegex.test(str);
}

const doGoogleSearch = async (queryKeyWord) => {
  let res;
  try {
    res = await googleIt({ query: `${queryKeyWord} news` });
    console.log(res);
    // const response = await axios.get(
    //   `https://www.googleapis.com/customsearch/v1?key=${googleSearchAPI}&cx=${searchEngineID}&q=${encodeURIComponent(
    //     queryKeyWord
    //   )}&gl=bd`
    // );
    // return response.data.items;
    console.log("done");
    return res;
  } catch (err) {
    catchError(err);
    console.log("Google search failed");
    return null;
  }
};

const formatSearchResults = (results) => {
  let searchResults = "";
  results.map((result, index) => {
    searchResults += `${index + 1}. ${result.title}\n${
      result.snippet
    }\n Source: ${result.link}\n\n`;
  });
  return searchResults;
};

const generateKeywords = async (question, chat_id, user) => {
  const message = PROMPTS.eta_search_generate_keywords_prefix.replace(
    "{QUESTION}",
    question
  );

  let response = await generateResponse(
    [
      { role: "system", content: `The Date is ${date}.` },
      { role: "user", content: message },
    ],
    process.env.GPT_MODEL_4,
    chat_id,
    user.userType
  );

  if (!response) {
    return null;
  }

  if (response.text.toString() === "$666") return "$666";

  return response.text.toString().replace(/[^A-Za-z\s]/g, "");
};

const generateSearchResultAsText = async (searchResult) => {
  return formatSearchResults(searchResult);
};

const selectSearchResults = async (keyword, searchResults, chat_id, user) => {
  const message = PROMPTS.eta_search_select_search_results_prefix
    .replace("{KEYWORD}", keyword)
    .replace("{SEARCH_RESULTS}", searchResults);
  const response = await generateResponse(
    [
      { role: "system", content: `The Date is ${date}.` },
      { role: "user", content: message },
    ],
    process.env.GPT_MODEL_3,
    chat_id,
    user.userType
  );

  if (!response) {
    return null;
  }

  return response;
};

const generateInformationOnQuery = async (
  searchResult,
  selectedSearchNumber,
  chatId,
  language
) => {
  let links = getLinksToClick(searchResult, selectedSearchNumber);
  let information = "";
  let isError = true;
  for (let i = 0; i < links.length; i++) {
    let link = links[i];
    try {
      await sendMessage(
        chatId,
        BOT_REPLIES.eta_search_click[language].replace("{LINK}", link)
      );
      information += trimStringToWordLimit(
        await extractParagraphFromLink(link, isError),
        characterLimit
      );
      isError = false;
    } catch (error) {
      catchError(error);
      await sendMessage(
        chatId,
        BOT_REPLIES.eta_search_click_failed[language].replace("{LINK}", link)
      );
      console.log(error);
      console.log("error clicking on " + link);
    }
  }
  if (isError) {
    console.log("All links failed");
  }
  return information;
};

const extractParagraphFromLink = async (link) => {
  let response;
  try {
    response = await axios.get(link, { timeout: 5000 });
  } catch (error) {
    catchError(error);
    if (error.code === "ECONNABORTED") {
      return ""; // Timeout occurred
    }
    throw error; // Other errors
  }

  const html = response.data;
  const $ = cheerio.load(html);
  const paragraphTexts = $("p")
    .map((i, el) => $(el).text())
    .get();

  if (containsBangla(paragraphTexts)) {
    return "";
  }
  return paragraphTexts.join(" ");
};

const getLinksToClick = (searchResult, selectedNumbers) => {
  if (!selectedNumbers) {
    selectedNumbers = [1, 2, 3];
  }
  console.log(selectedNumbers);
  let links = [];
  selectedNumbers.map((number, index) => {
    if (!searchResult[number - 1] || index > 3) {
      return null;
    }
    links.push(`${searchResult[number - 1].link}\n`);
  });
  return links;
};

function trimStringToWordLimit(text, characterLimit) {
  // Remove leading and trailing whitespaces
  text = text.trim();

  // Replace consecutive whitespaces with a single space
  text = text.replace(/\s+/g, " ");

  // Check if text length is already within the limit
  if (text.length <= characterLimit) {
    return text;
  }

  // Trim the text to the character limit
  const trimmedText = text.slice(0, characterLimit);

  // Find the last space within the trimmed text
  const lastSpaceIndex = trimmedText.lastIndexOf(" ");

  // Remove any partial word at the end
  const finalText = trimmedText.slice(0, lastSpaceIndex).trim();

  // Add an ellipsis if the original text exceeds the character limit
  return finalText + "...";
}

const etaSearch = async (chat_id, user, text, callback) => {
  const messages = getMessages();
  BOT_REPLIES = messages.bot_replies;
  PROMPTS = messages.prompts;
  let language = user.language || "english";

  if (!text && !callback) {
    await sendMessage(chat_id, BOT_REPLIES.only_text_allowed[language]);
    return;
  }
  try {
    const mode = `etaSearch`;
    // if (user[mode] > 5 && !user.premium) {
    //   console.log(user[mode]);
    //   await sendPaymentButton(chat_id);
    //   return;
    // }
    if (callback) {
      await addQueueUser(chat_id, { mode: `etaSearch` });
      await sendMessage(chat_id, BOT_REPLIES.eta_search_topic_query[language]);

      await updateShortcutCount(chat_id, `etaSearch`, user.userType);
      return;
    }
    const context = [];

    const question = text;
    context.push({ role: "user", content: text });
    let keyword = await generateKeywords(question, chat_id, user);

    if (!keyword) {
      await sendMessage(chat_id, BOT_REPLIES.gpt_failed[language]);
      await sendMenuMessage(chat_id, language);
      await addQueueUser(chat_id, { mode: "menu", step: 0 });
      return;
    }

    if (keyword === "$666") {
      await sendMessage(
        chat_id,
        BOT_REPLIES.eta_search_inappropriate_content[language]
      );
      await sendMenuMessage(chat_id, language);
      await addQueueUser(chat_id, { mode: "menu", step: 0 });
      return;
    }
    await sendMessage(
      chat_id,
      BOT_REPLIES.eta_search_google_search[language].replace(
        "{KEYWORD}",
        keyword
      )
    );
    let searchResult = await doGoogleSearch(keyword);
    if (!searchResult) {
      await sendMessage(chat_id, BOT_REPLIES.eta_search_failed[language]);
      await sendMenuMessage(chat_id, language);
      await addQueueUser(chat_id, { mode: "menu", step: 0 });
      return;
    }
    let searchResultAsText = await generateSearchResultAsText(searchResult);
    let selectedSearchResultNumbers = await selectSearchResults(
      keyword,
      searchResultAsText,
      chat_id,
      user
    );
    let information = await generateInformationOnQuery(
      searchResult,
      selectedSearchResultNumbers.toString().match(/\d+/g),
      chat_id,
      language
    );
    let response = await generateResponse(
      [
        { role: "system", content: `The Date is ${date}.` },
        {
          role: "user",
          content: PROMPTS.eta_search_final_gpt_query
            .replace("{QUESTION}", question)
            .replace("{CONTENT_FROM_LINKS}", information)
            .replace("{SEARCH_RESULTS}", searchResultAsText),
        },
      ],
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

    await addQueueUser(chat_id, { currentContextCost: response.cost });

    // await addMessageToContext(chat_id, text);
    // await addResponseToContext(chat_id, response);
    context.push({ role: "assistant", content: response.text });
    await addToContext(chat_id, context);
    await sendMessage(
      chat_id,
      BOT_REPLIES.eta_search_select_mode_again[language]
    );
    await addQueueUser(chat_id, { mode: "general", step: 1 });
  } catch (error) {
    console.log(error);
    catchError(error);
    await sendMessage(chat_id, BOT_REPLIES.eta_search_failed[language]);
  }
};

module.exports = { etaSearch };
