// const { sendMessage } = require("../../bot/botUtilities.js");
const { catchError } = require("../../bot/errorHandler.js");
const { db } = require("../firebase.js");
const {
  updateDoc,
  doc,
  arrayUnion,
  getDoc,
  deleteField,
  setDoc,
  serverTimestamp,
} = require("firebase/firestore");
const moment = require("moment-timezone");

let queueUserStore = {};

const addNewUser = async (chat_id) => {
  try {
    await setDoc(doc(db, "usersTG", `${chat_id}`), {
      joinedOn: serverTimestamp(),
      step: 1,
      mode: `registration`,
    });
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error adding new user");
  }
};

const updateUser = async (chat_id, data) => {
  try {
    await updateDoc(
      doc(db, "usersTG", `${chat_id}`),
      Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
          key,
          value === undefined ? null : value,
        ])
      )
    );
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error updating user");
  }
};

const addQueueUser = async (chat_id, data) => {
  try {
    let oldData;
    let newData;
    if (queueUserStore && queueUserStore[chat_id]) {
      oldData = queueUserStore[chat_id];
    }
    newData = { ...oldData, ...data };
    queueUserStore[chat_id] = newData;
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error adding User Data to Queue");
  }
};

const updateQueueUser = async (chat_id) => {
  try {
    if (queueUserStore[chat_id]) {
      await updateUser(chat_id, queueUserStore[chat_id]);
      queueUserStore[chat_id] = {};
    }
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error Updating Queue");
  }
};

const getUserData = async (chat_id) => {
  try {
    const docRef = await getDoc(doc(db, "usersTG", `${chat_id}`));
    if (docRef.exists()) {
      return docRef.data();
    } else {
      return "NOT FOUND";
    }
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error getting user data");
  }
};

const applyReferral = async (refferer_id, chat_id) => {
  if (chat_id == refferer_id) {
    return;
  }
  const docRef = await getDoc(doc(db, "usersTG", refferer_id));
  const referralsData = docRef.data().referrals;
  console.log(referralsData?.length);
  if (referralsData?.length == 1) {
    // await sendMessage(
    //   refferer_id,
    //   `Congratulations! You won 1 month free for reffering to 2 people`
    // );
    await updateDoc(doc(db, "usersTG", `${refferer_id}`), {
      referrals: arrayUnion({
        chat_id: chat_id,
        activatedOn: new Date(moment().tz("Asia/Dhaka")),
        referredPremium: true,
      }),
    });
    return;
  }
  await updateDoc(doc(db, "usersTG", `${refferer_id}`), {
    referrals: arrayUnion({
      chat_id: chat_id,
      activatedOn: new Date(moment().tz("Asia/Dhaka")),
    }),
  });
};

module.exports = {
  getUserData,
  addNewUser,
  updateUser,
  addQueueUser,
  updateQueueUser,
  applyReferral,
};
