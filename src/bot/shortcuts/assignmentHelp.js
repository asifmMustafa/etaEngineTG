const moment = require("moment-timezone");
const { updateShortcutCount } = require("../../db/models/globalData");
const {
  addToContext,
  resetContext,
  setContext,
} = require("../../db/models/message");
const { addQueueUser } = require("../../db/models/user");
const {
  generateResponse,
  generateVisionResponse,
} = require("../../openai/chatgpt");
const {
  sendMessage,
  sendDocument,
  sendButtons,
  getFileLink,
  sendMenuMessage,
} = require("../botUtilities");
const { storeDocument } = require("../../db/models/image");
const { PDFDocument } = require("pdf-lib");
const officegen = require("officegen");
const rgb = require("node-rtf/lib/rgb");
const { PassThrough } = require("stream");
const { increment } = require("firebase/firestore");
const { getMessages } = require("../../db/models/snapshotListeners");
const { catchError } = require("../errorHandler");
const fs = require("fs");
const fontkit = require("@pdf-lib/fontkit");
const { contextHasExceeded, translateText } = require("../../utilities");
const { generateGeminiVisionResponse } = require("../../gemini/gemini-vision");
require("dotenv").config();

const fontBytes = fs.readFileSync("src/font/DejaVuSans.ttf"); // custom font for creating pdfs

let BOT_REPLIES = {};

const assignmentHelp = async (chat_id, user, msg, callbackData) => {
  try {
    BOT_REPLIES = getMessages().bot_replies;
    let language = user.language || "english";

    if (!user.premium && user.assignmentHelp >= 2 && user.mode == "menu") {
      await addQueueUser(chat_id, { step: 0, mode: "menu" });
      await sendMessage(
        chat_id,
        "Purchase premium to use this shortcut again."
      );
      await sendMenuMessage(chat_id, language);
      return;
    }

    const current_month = `${moment().tz("Asia/Dhaka").month() + 1}/${moment()
      .tz("Asia/Dhaka")
      .year()}`;

    let use_gemini = false;

    if (user.premium && "assignment_help_monthly_count" in user) {
      if (
        user.assignment_help_monthly_count.month == current_month &&
        user.assignment_help_monthly_count.count > 3
      ) {
        use_gemini = true;
      }
    }

    const mode = `assignmentHelp`;
    // if (user[mode] >= 5 && !user.premium) {
    //   console.log(user[mode]);
    //   await sendPaymentButton(chat_id);
    //   return;
    // }
    if (msg?.photo) {
      if (user.step != 0) {
        await sendMessage(chat_id, BOT_REPLIES.only_text_allowed[language]);
        return;
      }
      await sendMessage(
        chat_id,
        BOT_REPLIES.assignment_help_additional_instructions[language]
      );
      await addQueueUser(chat_id, { step: 1, followUpStore: msg });

      return;
    }
    if (msg?.document) {
      if (user.step != 0) {
        await sendMessage(chat_id, BOT_REPLIES.only_text_allowed[language]);
        return;
      }
      await sendMessage(chat_id, BOT_REPLIES.only_image_allowed[language]);

      return;
    }

    if (callbackData) {
      await assignmentHelpButtonHandler(chat_id, callbackData, user);
    } else {
      await assignmentHelpTextHandler(chat_id, user, msg, use_gemini);
    }
  } catch (err) {
    catchError(err);
    console.log(err);
    console.log("Error in assignment help mode");
  }
};

const assignmentHelpButtonHandler = async (chat_id, callbackData, user) => {
  let language = user.language || "english";

  switch (callbackData) {
    case "assignmentHelpGemini":
    case "assignmentHelp":
      if (user.premium) {
        const current_month = `${
          moment().tz("Asia/Dhaka").month() + 1
        }/${moment().tz("Asia/Dhaka").year()}`;

        if ("assignment_help_monthly_count" in user) {
          if (user.assignment_help_monthly_count.month !== current_month) {
            await addQueueUser(chat_id, {
              assignment_help_monthly_count: {
                month: current_month,
                count: 1,
              },
            });
          } else {
            await addQueueUser(chat_id, {
              assignment_help_monthly_count: {
                month: current_month,
                count: user.assignment_help_monthly_count.count + 1,
              },
            });
          }
        } else {
          await addQueueUser(chat_id, {
            assignment_help_monthly_count: {
              month: current_month,
              count: 1,
            },
          });
        }
      }

      await addQueueUser(chat_id, {
        mode: callbackData,
        step: 0,
      });
      await sendMessage(
        chat_id,
        BOT_REPLIES.assignment_help_picture_upload[language]
      );
      await updateShortcutCount(chat_id, `assignmentHelp`, user.userType);
      return;

    case "assignmentHelp_pdf":
      const pdf = await createPdf(
        user?.context[user?.context?.length - 1]?.content,
        user.followUpStore.split(".")[0]
      );
      const pdfResponseBuffer = Buffer.from(pdf);

      await sendDocument(chat_id, pdfResponseBuffer, {
        filename: `${user.followUpStore}.pdf`,
        contentType: "application/pdf",
      });

      // await addQueueUser(chat_id, { mode: `general`, step: 1 });
      await sendMessage(
        chat_id,
        BOT_REPLIES.assignment_help_followup_queries[language]
      );
      return;

    case "assignmentHelp_docx":
      const doc = await createDoc(
        user?.context[user?.context?.length - 1]?.content,
        user.followUpStore.split(".")[0]
      );

      const docResponseBuffer = Buffer.from(doc);

      let docLink = await storeDocument(
        chat_id,
        docResponseBuffer,
        user.followUpStore.split(".")[0],
        `pdf`
      );
      //   docLink = await shortenUrlAsync(docLink);
      await sendMessage(
        chat_id,
        BOT_REPLIES.assignment_help_download_docx[language].replace(
          "{LINK}",
          docLink
        )
      );

      await sendMessage(
        chat_id,
        BOT_REPLIES.assignment_help_followup_queries[language]
      );
      // await addQueueUser(chat_id, { mode: `general`, step: 1 });
      return;

    case "assignmentHelp_both":
      const pdf2 = await createPdf(
        user?.context[user?.context?.length - 1]?.content,
        `${chat_id}_assignment`
      );
      const pdfResponseBuffer2 = Buffer.from(pdf2);
      await sendDocument(chat_id, pdfResponseBuffer2, {
        filename: `${chat_id}_assignment.pdf`,
        contentType: "application/pdf",
      });

      const doc2 = await createDoc(
        user?.context[user?.context?.length - 1]?.content,
        `${chat_id}_assignment`
      );
      const docResponseBuffer2 = Buffer.from(doc2);
      let docLink2 = await storeDocument(
        chat_id,
        docResponseBuffer2,
        `${chat_id}_assignment`,
        `docx`
      );
      //   docLink = await shortenUrlAsync(docLink);
      await sendMessage(
        chat_id,
        BOT_REPLIES.assignment_help_download_docx[language].replace(
          "{LINK}",
          docLink2
        )
      );

      // await addQueueUser(chat_id, { mode: `general`, step: 1 });
      await sendMessage(
        chat_id,
        BOT_REPLIES.assignment_help_followup_queries[language]
      );
      return;
  }
};

const assignmentHelpTextHandler = async (chat_id, user, msg, use_gemini) => {
  let language = user.language || "english";

  switch (user.step) {
    case 0:
      await sendMessage(chat_id, BOT_REPLIES.only_image_allowed[language]);
      return;
    case 1:
      if (!msg.text) {
        await sendMessage(chat_id, BOT_REPLIES.only_text_allowed[language]);
        return;
      }
      await assignmentPhotoHandler(
        chat_id,
        user,
        user.followUpStore,
        msg.text,
        use_gemini
      );
      return;

    case 2:
      if (!msg.text) {
        await sendMessage(chat_id, BOT_REPLIES.only_text_allowed[language]);
        return;
      }

      let context = [];
      if (user.context) {
        context = user.context;
      }
      context.push({ role: "user", content: msg.text });

      let response = await generateResponse(
        context,
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

      await addQueueUser(chat_id, {
        currentContextCost: increment(response.cost),
      });

      if (contextHasExceeded(user, response)) {
        await sendMessage(chat_id, BOT_REPLIES.context_reset[language]);
        let res = await setContext(
          chat_id,
          [{ role: "assistant", content: response.text }],
          response.cost
        );

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

      const get_files = [
        [{ text: "PDF", callback_data: "assignmentHelp_pdf" }],
        [
          {
            text: "DOCX",
            callback_data: "assignmentHelp_docx",
          },
        ],
        [
          {
            text: "Both PDF & DOCX",
            callback_data: "assignmentHelp_both",
          },
        ],
      ];

      await sendButtons(
        chat_id,
        BOT_REPLIES.assignment_help_further_query_or_download_tg[language],
        get_files
      );
      return;
  }
};

const assignmentPhotoHandler = async (chat_id, user, msg, text, use_gemini) => {
  let language = user.language || "english";

  await sendMessage(
    chat_id,
    BOT_REPLIES.assignment_help_read_assignment[language]
  );
  const photo = msg.photo[msg.photo.length - 1].file_id;

  const img = await getFileLink(photo);
  console.log(img);

  let context = [];
  if (user.context) {
    context = user.context;
  }

  // context.push({
  //   role: "system",
  //   content: `You are a helpful AI-teacher who solves questions/problem for students and keep the solutions short. If you see any maths related problem, reply with “I’m still learning maths” and then respond.`,
  // });

  const vision_prompt = use_gemini
    ? getMessages().prompts.assignment_help_prefix_GEMINI
    : getMessages().prompts.assignment_help_prefix.replace(
        "{INSTRUCTIONS}",
        text
      );

  context.push({
    role: "user",
    content: vision_prompt,
  });
  await sendMessage(
    chat_id,
    BOT_REPLIES.assignment_help_solve_problem[language]
  );

  const response = use_gemini
    ? await generateGeminiVisionResponse(vision_prompt, img)
    : await generateVisionResponse(vision_prompt, img, chat_id, user.userType);
  if (!response) {
    await sendMessage(chat_id, BOT_REPLIES.gpt_failed[language]);
    await sendMenuMessage(chat_id, language);
    await addQueueUser(chat_id, { mode: "menu", step: 0 });
    return;
  }

  await sendMessage(chat_id, response.text);
  if (use_gemini) await sendMessage(chat_id, "Gemini was used.");
  context.push({ role: "assistant", content: response.text });
  await addToContext(chat_id, context);
  await addQueueUser(chat_id, {
    step: 2,
    followUpStore: `${chat_id}_assignment`,
    currentContextCost: increment(response.cost),
  });

  const get_files = [
    [{ text: "PDF", callback_data: "assignmentHelp_pdf" }],
    [
      {
        text: "DOCX",
        callback_data: "assignmentHelp_docx",
      },
    ],
    [
      {
        text: "Both PDF & DOCX",
        callback_data: "assignmentHelp_both",
      },
    ],
    // [
    //   {
    //     text: "Continue Chatting",
    //     callback_data: "assignmentHelp_continue",
    //   },
    // ],
  ];

  await sendButtons(
    chat_id,
    BOT_REPLIES.assignment_help_further_query_or_download_tg[language],
    get_files
  );
};

const createPdf = async (data, name) => {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create({ options: { name: name } });
  pdfDoc.registerFontkit(fontkit);
  const customFont = await pdfDoc.embedFont(fontBytes);

  // Set up fonts and styles
  const fontSize = 13;
  const textColor = rgb(0, 0, 0);
  const pageWidth = 600;
  const pageHeight = 800;
  const margin = 50;
  const maxLineWidth = pageWidth - 2 * margin; // Maximum width for text line
  const avgCharWidth = fontSize * 0.5; // Approximate average character width based on the font size

  let yPosition = pageHeight - 4 * fontSize;

  // Add a blank page to the document
  let page = pdfDoc.addPage([pageWidth, pageHeight]);

  const textLines = data.split("\n");
  console.log(textLines);

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i];

    let words = line.split(" ");
    let lineBuffer = "";

    for (let word of words) {
      let testLine = `${lineBuffer}${word} `;
      let testLineWidth = avgCharWidth * testLine.length; // Approximate text width (not exact but better)

      if (testLineWidth > maxLineWidth) {
        // Draw the line and prepare for a new one
        if (yPosition < margin) {
          // Add new page and reset yPosition
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          yPosition = pageHeight - 4 * fontSize;
        }
        page.drawText(lineBuffer, {
          x: margin,
          y: yPosition,
          size: fontSize,
          color: textColor,
          font: customFont,
        });

        // Update the y-position for the next line
        yPosition -= fontSize + 5; // 5 is line spacing

        lineBuffer = `${word} `;
      } else {
        lineBuffer = testLine;
      }
    }

    // Draw any remaining text in buffer
    if (yPosition < margin) {
      // Add new page and reset yPosition
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      yPosition = pageHeight - 4 * fontSize;
    }
    page.drawText(lineBuffer, {
      x: margin,
      y: yPosition,
      size: fontSize,
      color: textColor,
      font: customFont,
    });

    // Update the y-position for the next line
    yPosition -= fontSize + 5; // 5 is line spacing
  }

  // Serialize the PDF to bytes (a Uint8Array)
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
};

const createDoc = (data, name) => {
  return new Promise((resolve, reject) => {
    const docx = officegen("docx");

    // Add some text to the document.
    const title = docx.createP();
    title.options.align = "center";
    title.addText(`${name}\n\n`, {
      bold: true,
      font_face: "Arial",
      font_size: 24,
    });

    const paragraph = docx.createP();
    paragraph.addText(data);

    // Create a PassThrough stream to collect the buffer.
    const pass = new PassThrough();
    const chunks = [];

    pass.on("data", function (chunk) {
      chunks.push(chunk);
    });

    pass.on("end", function () {
      const buffer = Buffer.concat(chunks);
      console.log("Buffer size:", buffer.length);
      resolve(buffer); // Resolve the Promise with the buffer.
    });

    pass.on("error", function (err) {
      reject(err); // Reject the Promise if an error occurs.
    });

    // Pipe the officegen stream to the PassThrough stream.
    docx.generate(pass);
  });
};

module.exports = { assignmentHelp };
