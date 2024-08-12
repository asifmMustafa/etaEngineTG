const Midjourney = require("midjourney");
const {
  sendButtons,
  sendMessage,
  sendMenuMessage,
  sendPaymentButton,
  sendPictureFile,
  deleteMessage,
} = require("../botUtilities");
const { updateUser, addQueueUser } = require("../../db/models/user");
const { storeImage, deleteImage } = require("../../db/models/image");
const Jimp = require("jimp");
const { default: axios } = require("axios");
const { deleteField } = require("firebase/firestore");
const { updateShortcutCount } = require("../../db/models/globalData");
const { catchError } = require("../errorHandler");
const { pollTaskStatus } = require("../../utilities");
const { getMessages } = require("../../db/models/snapshotListeners");

const GENERATE_ANOTHER_BUTTON_DATA = [
  [{ text: "Yes", callback_data: "image_another_yes" }],
  [
    {
      text: "No",
      callback_data: "image_another_no",
    },
  ],
];

let BOT_REPLIES = {};

const image = async (chat_id, user, text, callbackData) => {
  try {
    BOT_REPLIES = getMessages().bot_replies;
    let language = user.language || "english";

    const response = await axios.post(
      `${process.env.MJ_QUEUE_URL}/checkIsQueued`,
      {
        chat_id: chat_id,
      }
    );

    if (response.data.isQueued && user.step != 2) {
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

    const mode = `midjourney`;
    // if (user[mode] >= 25 && !user.premium) {
    //   console.log(user[mode]);
    //   await sendPaymentButton(chat_id);
    //   return;
    // }
    if (callbackData) {
      await imageButtonHandler(chat_id, callbackData, user);
    } else {
      await imageTextHandler(chat_id, user, text);
    }
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error in image mode");
  }
};

const imageButtonHandler = async (chat_id, callbackData, user) => {
  let language = user.language || "english";

  const upscale_buttons = [
    [{ text: "Yes", callback_data: "image_upscale_yes" }],
    [
      {
        text: "No",
        callback_data: "image_upscale_no",
      },
    ],
  ];

  switch (callbackData) {
    case "image":
      await addQueueUser(chat_id, { mode: "image", step: 1 });
      await sendMessage(
        chat_id,
        BOT_REPLIES.image_generation_prompt_query[language]
      );
      await updateShortcutCount(chat_id, `midjourney`, user.userType);
      return;

    default:
      await sendMessage(
        chat_id,
        BOT_REPLIES.invalid_selection_message[language]
      );
      return;
  }
};

const imageTextHandler = async (chat_id, user, text) => {
  let language = user.language || "english";

  if (!text) {
    await sendMessage(chat_id, BOT_REPLIES.only_text_allowed[language]);
    return;
  }
  switch (user.step) {
    case 1:
      let img;
      const response = await axios.post(`${process.env.MJ_QUEUE_URL}/api`, {
        text: text,
        chat_id: chat_id,
        type: "imagine",
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

        await addQueueUser(chat_id, { midjourneyRef: img, step: 2 });
      }

      return;
    case 2:
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

const upscaleImage = async (chat_id, user, index) => {
  if (!user.midjourneyRef) {
    return;
  }

  const msg_id = await sendMessage(chat_id, "Upscaling...");

  let response = await axios.post(`${process.env.MJ_QUEUE_URL}/api`, {
    midjourneyRef: user.midjourneyRef,
    chat_id: chat_id,
    index: index,
    type: "upscale",
  });
  console.log(response.data.uri);

  if (response.data.queued) {
    await sendMessage(
      chat_id,
      `[Queue: ${response.data.inLine}]Your image is being processed... Meanwhile, you may try other shortcuts`
    );
  } else {
    const startTime = Date.now();
    response = await pollTaskStatus(chat_id, startTime);

    if (response === "Failed" || !response) {
      await sendMessage(chat_id, "Sorry! We cannot process this request.");
    } else {
      await deleteMessage(chat_id, msg_id);
      await sendPictureFile(chat_id, response.data.uri);
      if (response.data.path) deleteImage(response.data.path);
    }
  }
  await addQueueUser(chat_id, { step: 5 });
  await sendButtons(
    chat_id,
    "Do you want to generate another image?",
    GENERATE_ANOTHER_BUTTON_DATA
  );
};

module.exports = { image };
