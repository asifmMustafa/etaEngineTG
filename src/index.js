const { app, catchError } = require("./bot/errorHandler.js");
const { handleMessage, handleButton } = require("./bot/messageHandler.js");
const { updateQueueUser } = require("./db/models/user.js");
const { answerCallbackQuery } = require("./bot/botUtilities.js");
require("dotenv").config();

app.post("/process_message", async (req, res) => {
  try {
    console.log(`${req.body.chat.id}: ${req.body.text}`);
    if (req.body.chat.type == "group") {
      res.json({ status: "ok", message: "Processed." });
      return;
    }

    //Response Logic here
    await handleMessage(req.body);

    await updateQueueUser(req.body.chat.id);

    res.json({ status: "ok", message: "Processed." });
  } catch (err) {
    // catchError(err);
    Sentry.captureException(err);
    console.log(err.stack);

    res.json({ status: "ok", message: "Processed." });
  }
});

// When a user presses a button
app.post("/process_callback_query", async (req, res) => {
  // const transaction = beginTransaction();
  try {
    console.log(`${req.body.from.id}: ${req.body.data}`);
    await answerCallbackQuery(req.body.id);

    //Response Logic here
    await handleButton(req.body);

    await updateQueueUser(req.body.from.id);

    res.json({ status: "ok", message: "Processed." });
  } catch (err) {
    catchError(err);
    console.log(err.message);

    res.json({ status: "ok", message: "Processed." });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`EtaEngineTG is running on port ${process.env.PORT}.`);
});
