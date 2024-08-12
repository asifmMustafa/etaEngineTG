const Midjourney = require("midjourney");
const {
  sendButtons,
  deleteMessage,
  sendPhoto,
  sendMessage,
  sendFile,
  getFileLink,
  sendMenuMessage,
  sendPaymentButton,
} = require("../botUtilities");
const { updateUser, addQueueUser } = require("../../db/models/user");
const { storeImage } = require("../../db/models/image");
const Jimp = require("jimp");
const { default: axios } = require("axios");
const { deleteField } = require("firebase/firestore");
const { updateShortcutCount } = require("../../db/models/globalData");
const { midjourneyfaceSwap } = require("./faceswap");
const { changeURL, pollTaskStatus } = require("../../utilities");
const { catchError } = require("../errorHandler");
const { getMessages } = require("../../db/models/snapshotListeners");

let BOT_REPLIES = {};

const aiPortrait = async (chat_id, user, msg, callbackData) => {
  try {
    BOT_REPLIES = getMessages().bot_replies;
    let language = user.language || "english";

    const response = await axios.post(
      `${process.env.MJ_QUEUE_URL}/checkIsQueued`,
      {
        chat_id: chat_id,
      }
    );

    if (response.data.isQueued && user.step != 4) {
      if (response.data.position !== -1)
        await sendMessage(
          chat_id,
          BOT_REPLIES.queue_postion[language].replace(
            "{POS}",
            response.data.position + 1
          )
        );
      await sendMessage(
        chat_id,
        BOT_REPLIES.image_generation_already_in_queue[language]
      );
      await sendMenuMessage(chat_id, language);
      return;
    }

    const mode = `aiPortrait`;
    // if (user[mode] >= 25 && !user.premium) {
    //   console.log(user[mode]);
    //   await sendPaymentButton(chat_id);
    //   return;
    // }
    if (msg?.photo && user.step == 3) {
      await aiPortraitPhotoHandler(chat_id, user, msg);
      return;
    } else if (user.step == 3 && !msg?.photo) {
      await sendMessage(chat_id, BOT_REPLIES.only_image_allowed[language]);
      return;
    }

    if (callbackData) {
      await aiPortraitButtonHandler(chat_id, callbackData, user);
    } else {
      await aiPortraitTextHandler(chat_id, user, msg.text);
    }
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error in AI Portrait mode");
  }
};

const aiPortraitButtonHandler = async (chat_id, callbackData, user) => {
  let language = user.language || "english";

  switch (callbackData) {
    case "aiPortrait":
      await addQueueUser(chat_id, { mode: "aiPortrait", step: 1 });
      await sendMessage(
        chat_id,
        BOT_REPLIES.ai_portrait_character_selection[language]
      );
      await updateShortcutCount(chat_id, `aiPortrait`, user.userType);
      return;

    default:
      await sendMessage(
        chat_id,
        BOT_REPLIES.invalid_selection_message[language]
      );
      return;
  }
};

const aiPortraitTextHandler = async (chat_id, user, text) => {
  let language = user.language || "english";

  if (!text) {
    await sendMessage(chat_id, BOT_REPLIES.only_text_allowed[language]);
    return;
  }
  switch (user.step) {
    case 1:
      await addQueueUser(chat_id, {
        mode: "aiPortrait",
        step: 2,
        followUpStore: text,
      });
      await sendMessage(
        chat_id,
        BOT_REPLIES.ai_portrait_environment_selection[language]
      );
      return;
    case 2:
      await addQueueUser(chat_id, {
        mode: "aiPortrait",
        step: 3,
        followUpStore2: text,
      });
      await sendMessage(
        chat_id,
        BOT_REPLIES.ai_portrait_picture_upload[language]
      );
      return;
    case 4:
      await addQueueUser(chat_id, { step: 0, mode: "menu" });
      await sendMessage(
        chat_id,
        BOT_REPLIES.image_generation_multitask[language]
      );
      await sendMenuMessage(chat_id, language);
      return;

    default:
      await sendMessage(
        chat_id,
        BOT_REPLIES.invalid_selection_message[language]
      );
  }
};

const aiPortraitPhotoHandler = async (chat_id, user, msg) => {
  let language = user.language || "english";

  try {
    const photo = msg.photo[msg.photo.length - 1].file_id;
    const img = await getFileLink(photo);
    console.log(img);
    const isSingleFace = await getFaceCount(img);
    if (!isSingleFace) {
      await sendMessage(
        chat_id,
        BOT_REPLIES.ai_portrait_multiple_face[language]
      );
      return;
    }
    const response = await axios.post(`${process.env.MJ_QUEUE_URL}/api`, {
      text: getMessages()
        .prompts.ai_portrait_prefix.replace("{CHARACTER}", user.followUpStore)
        .replace("{ENVIRONMENT}", user.followUpStore2),
      chat_id: chat_id,
      type: "imagineFace",
      img: img,
      platform: "tg",
    });
    if (response.data.queued) {
      await sendMessage(
        chat_id,
        BOT_REPLIES.image_generation_request_queued[language].replace(
          "{QUEUE_POS}",
          response.data.inLine
        )
      );
      await addQueueUser(chat_id, { step: 0, mode: "menu" });
      await sendMenuMessage(chat_id, language);
    } else {
      console.log("Response:", response.data);

      await addQueueUser(chat_id, { step: 4 });
    }
  } catch (err) {
    catchError(err);
    console.log(err);
  }
};

const getFaceCount = async (link) => {
  try {
    const postData = {
      img1_url: link,
    };

    const response = await axios({
      url: "https://face.etagpt.io/count_faces",
      method: "post",
      data: postData,
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (response.status == 200) {
      return true;
    }
  } catch (err) {
    console.log(err);
  }
};

module.exports = { aiPortrait };
