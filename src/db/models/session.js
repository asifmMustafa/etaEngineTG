const {
  addDoc,
  collection,
  updateDoc,
  doc,
  Timestamp,
  increment,
} = require("firebase/firestore");
const moment = require("moment-timezone");
const { db } = require("../firebase");
const { addQueueUser } = require("./user");
const { getDifferenceInMinutes } = require("../../utilities");
const { catchError } = require("../../bot/errorHandler");

const sessionDuration = 60;

const handleSession = async (chat_id, user) => {
  try {
    handleHourHostpotCount(chat_id, user);
    const now = new Date(moment().tz("Asia/Dhaka"));
    const timestamp = Timestamp.fromDate(
      new Date(moment().tz("Asia/Dhaka").toISOString())
    );

    //If it is a new user
    let currentSession;
    if (!user.currentSession) {
      currentSession = "N/A";
    } else {
      currentSession = user.currentSession;
    }

    //If it is an existing user
    if (user.lastActive && user.currentSession) {
      //If there is inactivity of 60 Minutes
      if (
        getDifferenceInMinutes(timestamp, user.lastActive) > sessionDuration
      ) {
        const currentSessionData = await addDoc(collection(db, "sessionsTG"), {
          lastActive: now,
          sessionCreated: now,
          age: user.age ? user.age : null,
          chat_id: chat_id,
          premium: user.premium ? user.premium : false,
        });
        currentSession = currentSessionData.id;
      } else {
        if (user.currentSession) {
          await updateDoc(doc(db, "sessionsTG", user.currentSession), {
            lastActive: now,
            age: user.age ? user.age : null,
            premium: user.premium ? user.premium : false,
          });
        }
      }
    } else {
      const currentSessionData = await addDoc(collection(db, "sessionsTG"), {
        lastActive: now,
        sessionCreated: now,
        age: user.age ? user.age : null,
        chat_id: chat_id,
        premium: user.premium ? user.premium : false,
      });
      currentSession = currentSessionData.id;
    }

    await addQueueUser(chat_id, {
      currentSession: currentSession,
      lastActive: now,
    });
  } catch (err) {
    catchError(err);
    console.log(err);
  }
};

const handleHourHostpotCount = async (chat_id, user) => {
  try {
    const now = moment().tz("Asia/Dhaka");
    const hour = parseInt(now.format("HH"));
    const formattedDate = now.format("YYYY-MM-DD");

    let slot = "";
    if (hour >= 0 && hour < 4) {
      slot = "00:00-04:00";
    } else if (hour >= 4 && hour < 8) {
      slot = "04:00-08:00";
    } else if (hour >= 8 && hour < 12) {
      slot = "08:00-12:00";
    } else if (hour >= 12 && hour < 16) {
      slot = "12:00-16:00";
    } else if (hour >= 16 && hour < 20) {
      slot = "16:00-20:00";
    } else if (hour >= 20 && hour < 24) {
      slot = "20:00-24:00";
    }

    let obj = {};
    if (
      !user.lastHotspotUpdated ||
      user.lastHotspotUpdated?.slot != slot ||
      user.lastHotspotUpdated?.date != formattedDate
    ) {
      obj[`${slot}_tg`] = increment(1);
    }
    await updateDoc(doc(db, "ActivityData", formattedDate), obj);
    await addQueueUser(chat_id, {
      lastHotspotUpdated: {
        date: formattedDate,
        slot: slot,
      },
    });
  } catch (err) {
    catchError(err);
    console.log(err);
  }
};

module.exports = { handleSession };
