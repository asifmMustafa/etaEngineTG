const {
  updateDoc,
  doc,
  increment,
  addDoc,
  collection,
} = require("firebase/firestore");
const { openai } = require("./openai.js");
const moment = require("moment-timezone");
const { db } = require("../db/firebase.js");
const { catchError } = require("../bot/errorHandler.js");
const { getTokenCosts } = require("../db/models/snapshotListeners.js");
require("dotenv").config();

const generateResponse = async (chat, model, chat_id, userType) => {
  try {
    const completion = await openai.chat.completions.create({
      messages: chat,
      model: model,
    });

    handleGPTCost(completion, model, chat_id, userType);

    if (!completion?.usage?.total_tokens) {
      console.log(chat);
    }

    return {
      text: completion.choices[0].message.content,
      cost: completion.usage.total_tokens,
    };
  } catch (err) {
    catchError(err);
    console.log(err);
  }
};

const generateVisionResponse = async (text, image, chat_id, userType) => {
  try {
    // const completion = await openai.chat.completions.create({
    //   messages: chat,
    //   model: model,
    // });

    const completion = await openai.chat.completions.create({
      model: "gpt-4-vision-preview",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: text },
            {
              type: "image_url",
              image_url: {
                url: image,
                detail: "low",
              },
            },
          ],
        },
      ],
    });

    handleGPTCost(completion, `gpt-4-vision-preview`, chat_id, userType);

    if (!completion?.usage?.total_tokens) {
      console.log(chat);
    }

    return {
      text: completion.choices[0].message.content,
      cost: completion.usage.total_tokens,
    };
  } catch (err) {
    if (err.status === 400) {
      console.log(
        "generateVisionResponse - BadRequestError: 400 Invalid image."
      );
      return;
    }

    catchError(err);
    console.log(err);
  }
};

const handleGPTCost = async (completion, model, chat_id, userType) => {
  let base_name;
  const now = new Date(moment().tz("Asia/Dhaka"));

  if (model.startsWith("gpt-3.5")) {
    base_name = "gpt-3.5";
  } else if (model.startsWith("gpt-4") && !model.startsWith("gpt-4-vision")) {
    base_name = "gpt-4";
  } else if (model.startsWith("gpt-4-vision")) {
    base_name = "gpt-4-vision";
  }

  await addDoc(collection(db, "OpenaiTransactions"), {
    model: model,
    input_token: completion?.usage?.prompt_tokens || 0,
    output_token: completion?.usage?.completion_tokens || 0,
    chat_id: chat_id,
    base_name: base_name,
    time: now,
    platform: "tg",
    user_type: userType,
  });

  const date = moment().tz("Asia/Dhaka").format("YYYY-MM-DD");

  let gptData = {};
  let tokenCosts = getTokenCosts();

  gptData[`${model.replace(".", "-")}_tg_input_${userType}`] = increment(
    completion.usage.prompt_tokens
  );
  gptData[`${model.replace(".", "-")}_tg_output_${userType}`] = increment(
    completion.usage.completion_tokens
  );

  if (tokenCosts[`${model}_input`] && tokenCosts[`${model}_input`]) {
    gptData[`${model.replace(".", "-")}_tg_cost_${userType}`] = increment(
      completion.usage.prompt_tokens * (tokenCosts[`${model}_input`] / 1000) +
        completion.usage.completion_tokens *
          (tokenCosts[`${model}_output`] / 1000)
    );
  }

  await updateDoc(doc(db, "OpenaiDailyData", date), gptData);
};

module.exports = { generateResponse, generateVisionResponse };
