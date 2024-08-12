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
  sendAlert,
} = require("../botUtilities");
const { updateUser, addQueueUser } = require("../../db/models/user");
const { storeImage, deleteImage } = require("../../db/models/image");
const Jimp = require("jimp");
const { default: axios } = require("axios");
const { deleteField } = require("firebase/firestore");
const { updateShortcutCount } = require("../../db/models/globalData");
const {
  extractErrorMessageAndLineNumber,
  generateRandomId,
} = require("../../utilities");
const { catchError } = require("../errorHandler");

const faceswap = async (chat_id, user, msg, callbackData) => {
  try {
    const response = await axios.post(
      `${process.env.MJ_QUEUE_URL}/checkIsQueued`,
      {
        chat_id: chat_id,
      }
    );

    if (response.data.isQueued && user.step != 2) {
      await sendMessage(
        chat_id,
        "You already have an image generating. Please try again later."
      );
      await sendMenuMessage(chat_id);
      return;
    }

    if (user.step == 2) {
      await addQueueUser(chat_id, { step: 0, mode: "menu" });
      await sendMessage(
        chat_id,
        `Your image is being processed... Meanwhile, you may try other shortcuts`
      );
      await sendMenuMessage(chat_id);
      return;
    }

    const mode = `faceswap`;
    // if (user[mode] >= 10 && !user.premium) {
    //   console.log(user[mode]);
    //   await sendPaymentButton(chat_id);
    //   return;
    // }
    if (msg?.photo) {
      if (user.step == 1) {
        const photo = msg.photo[msg.photo.length - 1].file_id;
        const img = await getFileLink(photo);
        const isSingleFace = await getFaceCount(img);
        if (!isSingleFace) {
          await sendMessage(
            chat_id,
            `Your image contains multiple or no faces. Please upload a picture with single face`
          );
          return;
        }
        console.log(img);
        await addQueueUser(chat_id, { step: 0, followUpStore: img });
        await sendMessage(chat_id, "Please Upload your picture");
        return;
      }
      await faceswapPhotoHandler(chat_id, user, msg);
      return;
    }

    if (callbackData) {
      await faceswapButtonHandler(chat_id, callbackData, user);
    } else {
      // await faceswapTextHandler(chat_id, user, text);
      await sendMessage(chat_id, `Please respond with a picture.`);
    }
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error in faceswap mode");
  }
};

const faceswapButtonHandler = async (chat_id, callbackData, user) => {
  switch (callbackData) {
    case "faceswap":
      // for (let x = 0; x < 20; x++) {
      //   axios.post("https://etagpt-faceswap.de.r.appspot.com/", {
      //     chat_id: chat_id,
      //     type: "imagine",
      //     text: `Zuckerburg ${x}`,
      //   });
      // }

      await sendMessage(chat_id, "Please Upload target picture");
      await addQueueUser(chat_id, {
        mode: `faceswap`,
        step: 1,
        followUpStore: ``,
      });
      await updateShortcutCount(chat_id, `faceswap`, user.userType);
      return;
  }
};

const faceswapPhotoHandler = async (chat_id, user, msg) => {
  const photo = msg.photo[msg.photo.length - 1].file_id;
  const img = await getFileLink(photo);
  const isSingleFace = await getFaceCount(img);
  if (!isSingleFace) {
    await sendMessage(
      chat_id,
      `Your image contains multiple or no faces. Please upload a picture with single face`
    );
    return;
  }

  const response = await axios.post(`${process.env.MJ_QUEUE_URL}/api`, {
    chat_id: chat_id,
    type: "faceswap",
    source: img,
    target: user.followUpStore,
    platform: "tg",
  });

  console.log("Response:", response.data);
  await addQueueUser(chat_id, { step: 2 });
  return;
};

const midjourneyfaceSwap = async (target, source, chat_id) => {
  try {
    const postData = {
      img1_url: source,
      img2_url: target,
    };

    await sendMessage(chat_id, "Swapping faces...");

    const faceswap_response = await axios({
      url: "https://face.etagpt.io/swap_faces",
      method: "post",
      data: postData,
      headers: {
        "Content-Type": "application/json",
      },
      responseType: "arraybuffer", // to handle the response as a Buffer
    });

    await sendMessage(chat_id, "Faces swapped!");

    const faceswappedImageBuffer = Buffer.from(
      faceswap_response.data,
      "binary"
    );

    const faceswappedImageName = generateRandomId(10);
    const faceswappedImageUrl = await storeImage(
      chat_id,
      faceswappedImageBuffer,
      faceswappedImageName
    );

    await sendMessage(chat_id, "Enhancing image...");

    const upscale_response = await axios.post(
      "https://upscaler-b6ldsgio3a-uc.a.run.app/enhance",
      { image_url: faceswappedImageUrl },
      { responseType: "arraybuffer" }
    );

    if (upscale_response.status === 200) {
      await sendMessage(chat_id, "Image enhanced!");

      const upscaledImageBuffer = Buffer.from(upscale_response.data, "binary");

      const upscaledImageName = generateRandomId(10);
      const upscaledImageUrl = await storeImage(
        chat_id,
        upscaledImageBuffer,
        upscaledImageName
      );

      await sendPhoto(chat_id, upscaledImageUrl);
      deleteImage(`${chat_id}/${upscaledImageName}.png`);
    } else {
      await sendMessage(chat_id, "Failed to enchance image.");
      await sendPhoto(chat_id, faceswappedImageUrl);
    }

    deleteImage(`${chat_id}/${faceswappedImageName}.png`);
  } catch (err) {
    catchError(err);
    console.log(err);
    await sendMessage(`An error occured... Please try again.`);
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

module.exports = { faceswap, midjourneyfaceSwap };
