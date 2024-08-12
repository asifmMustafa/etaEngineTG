// node --version # Should be >= 18
// npm install @google/generative-ai

const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const https = require("https");
require("dotenv").config();

const MODEL_NAME = "gemini-1.0-pro-vision-latest";
const API_KEY = process.env.GEMINI_API_KEY;

const fetchImageAsBase64 = (url) => {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const dataChunks = [];
        res.on("data", (chunk) => {
          dataChunks.push(chunk);
        });
        res.on("end", () => {
          const buffer = Buffer.concat(dataChunks);
          const base64Image = buffer.toString("base64");
          resolve(base64Image);
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
};

const generateGeminiVisionResponse = async (prompt, image_url) => {
  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const generationConfig = {
      temperature: 0.4,
      topK: 32,
      topP: 1,
      maxOutputTokens: 4096,
    };

    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ];

    const base64Image = await fetchImageAsBase64(image_url);

    const parts = [
      {
        inlineData: {
          mimeType: "image/png",
          data: base64Image,
        },
      },
      {
        text: prompt,
      },
    ];

    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig,
      safetySettings,
    });

    const response = result.response;

    return {
      text: response.text(),
      cost: 0,
    };
  } catch (err) {
    console.log(err);
    return;
  }
};

module.exports = { generateGeminiVisionResponse };
