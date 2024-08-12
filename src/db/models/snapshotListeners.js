const { onSnapshot, doc } = require("firebase/firestore");
const { db } = require("../firebase");
require("dotenv").config();

let paywallToggle = null;
let allowGPT4Solve = null;
let tokenCostData = null;
let shortcutsMaintenanceStatus = {};

let menuMessage = {
  bot_replies: {
    menu: {
      english: "What would you like to do today? 😊",
      bangla: "আজ আপনি কি করতে চান? 😊",
    },
  },
};

let messagesWhisperBridge = {
  bot_replies: {
    multitasking_error: {
      english:
        "⏳ Oops! Multitasking isn't my strong suit. Please wait while I figure out the previous message. 😅",
      bangla:
        "⏳ ওপস! একাধিক কাজ আমার জন্য সহজ নয়। অনুগ্রহ করে অপেক্ষা করুন, যতক্ষণ না আমি পূর্ববর্তী বার্তাটি বুঝতে পারি। 😅",
    },
  },
};

let messages = {
  bot_replies: {
    invalid_activation_code: {
      english: "Invalid activation code.",
      bangla: "অবৈধ অ্যাক্টিভেশন কোড।",
    },
    account_activated: {
      english: "Account activated.",
      bangla: "অ্যাকাউন্ট সক্রিয় করা হয়েছে।",
    },
    shortcut_maintenance_mode: {
      english:
        "This shortcut is currently under maintenance. Please feel free to use the other shortcuts or try this one later.",
      bangla:
        "এই শর্টকাটটি বর্তমানে মেইনটেন্যান্সের আওতায় আছে। অন্যান্য শর্টকাটগুলি ব্যবহার করুন অথবা পরে এটি চেষ্টা করুন।",
    },
    invalid_selection_message: {
      english: "Please select any of the above.",
      bangla: "উপরের যেকোনো একটি নির্বাচন করুন।",
    },
    only_image_allowed: {
      english: "Only image response allowed.",
      bangla: "শুধুমাত্র ছবির উত্তর অনুমোদিত।",
    },
    only_text_allowed: {
      english: "Only text response allowed.",
      bangla: "শুধুমাত্র টেক্সট উত্তর অনুমোদিত।",
    },
    only_number_allowed: {
      english: "Please respond with a number.",
      bangla: "অনুগ্রহ করে একটি সংখ্যায় উত্তর দিন।",
    },
    image_not_allowed: {
      english: "Sorry, images are not supported in this mode.",
      bangla: "দুঃখিত, এই মোডে ছবি সমর্থিত নয়।",
    },
    document_not_allowed: {
      english: "Sorry, documents are not supported in this mode.",
      bangla: "দুঃখিত, এই মোডে ডকুমেন্ট সমর্থিত নয়।",
    },
    new_user_welcome: {
      english:
        "Hey there! 👋 Welcome to etaGPT(beta)! \n\nSince you're one of our early users, we'd love to know you better. 😊 Please state your name.",
      bangla:
        "হ্যালো! 👋 etaGPT(বেটা)তে স্বাগতম! \n\nআপনি আমাদের প্রাথমিক ব্যবহারকারীদের একজন হিসেবে আমরা আপনাকে আরও ভালোভাবে জানতে চাই। 😊 অনুগ্রহ করে আপনার নাম বলুন।",
    },
    new_user_age_query: {
      english:
        "How old are you? 🎂 Don't worry, we won't tell and start right away! 😉",
      bangla:
        "আপনার বয়স কত? 🎂 চিন্তা করবেন না, আমরা বলব না এবং এখনি শুরু করি! 😉",
    },
    ai_portrait_character_selection: {
      english:
        "Which character do you want to be? (You can pick a single character like 'Barbie', 'Ironman', 'Thor' or it can be as bizzare as 'Elon Musk', so go wild with your imagination!)",
      bangla:
        "আপনি কোন চরিত্র হতে চান? (আপনি 'বার্বি', 'আয়রনম্যান', 'থোর' এর মতো একটি চরিত্র নির্বাচন করতে পারেন অথবা 'ইলন মাস্ক' এর মতো অদ্ভুত হতে পারেন, তাই আপনার কল্পনার সাথে মুক্ত হন!)",
    },
    ai_portrait_environment_selection: {
      english:
        "Please kindly provide details of your character’s environment. (e.g. 'beach, sipping coconut juice, and watching the sunset')",
      bangla:
        "দয়া করে আপনার চরিত্রের পরিবেশের বিস্তারিত তথ্য দিন। (উদাহরণস্বরূপ 'সমুদ্র সৈকত, নারকেলের জুস পান করা এবং সূর্যাস্ত দেখা')",
    },
    ai_portrait_picture_upload: {
      english:
        "Please upload your picture. (Please provide an image with a single face)",
      bangla:
        "অনুগ্রহ করে আপনার ছবি আপলোড করুন। (একটি একক মুখের সাথে একটি ছবি দিন)",
    },
    ai_portrait_multiple_face: {
      english:
        "Your image contains multiple faces. Please upload a picture with a single face.",
      bangla:
        "আপনার ছবিতে একাধিক মুখ রয়েছে। দয়া করে একটি একক মুখের সাথে একটি ছবি আপলোড করুন।",
    },
    image_generation_prompt_query: {
      english: "Enter your prompt.",
      bangla: "আপনার প্রম্পট লিখুন।",
    },
    image_generation_already_in_queue: {
      english: "You already have an image generating. Please try again later.",
      bangla:
        "আপনার ইতিমধ্যেই একটি ছবি তৈরি হচ্ছে। অনুগ্রহ করে পরে আবার চেষ্টা করুন।",
    },
    image_generation_multitask: {
      english:
        "Your image is being processed... Meanwhile, you may try other shortcuts.",
      bangla:
        "আপনার ছবি প্রক্রিয়া করা হচ্ছে... এদিকে, আপনি অন্যান্য শর্টকাটগুলি চেষ্টা করতে পারেন।",
    },
    image_generation_request_queued: {
      english:
        "[Queue: {QUEUE_POS}] Your image is being processed... Meanwhile, you may try other shortcuts.",
      bangla:
        "[কিউ: {QUEUE_POS}] আপনার ছবি প্রক্রিয়া করা হচ্ছে... এদিকে, আপনি অন্যান্য শর্টকাটগুলি চেষ্টা করতে পারেন।",
    },
    assignment_help_read_assignment: {
      english: "Reading assignment...",
      bangla: "অ্যাসাইনমেন্ট পড়া হচ্ছে...",
    },
    assignment_help_solve_problem: {
      english: "Solving problems...",
      bangla: "সমস্যা সমাধান করা হচ্ছে...",
    },
    assignment_help_additional_instructions: {
      english:
        "Do you want to provide any additional instructions regarding the answers?",
      bangla: "উত্তরগুলো সম্পর্কে আপনি কি কোনো অতিরিক্ত নির্দেশনা দিতে চান?",
    },
    assignment_help_picture_upload: {
      english: "Please send a picture of your assignment.",
      bangla: "দয়া করে আপনার অ্যাসাইনমেন্টের একটি ছবি পাঠান।",
    },
    assignment_help_followup_queries: {
      english: "Let me know if you have any follow up queries.",
      bangla: "আপনার যদি কোনো পরবর্তী প্রশ্ন থাকে তাহলে জানান।",
    },
    assignment_help_further_query_or_download_tg: {
      english:
        "Let me know if you have further queries or if you would you like to download then select one of the following:",
      bangla:
        "আপনার যদি আরও প্রশ্ন থাকে অথবা আপনি যদি ডাউনলোড করতে চান তবে নিম্নলিখিত একটি নির্বাচন করুন:",
    },
    assignment_help_further_query_or_download_wa: {
      english:
        "Let me know if you have further queries or if you would you like to download the solution in a pdf/word file please reply with ‘yes’.",
      bangla:
        "আপনার যদি আরও প্রশ্ন থাকে অথবা আপনি যদি সমাধানটি একটি PDF/Word ফাইলে ডাউনলোড করতে চান তবে ‘Yes’ দিয়ে উত্তর দিন।",
    },
    assignment_help_download_docx: {
      english: "Download .docx file from here:\n{LINK}",
      bangla: "এখান থেকে .docx ফাইলটি ডাউনলোড করুন:\n{LINK}",
    },
    gfbf_gfbf_selection: {
      english: "Hi there! Are you looking for a girlfriend or a boyfriend? 👫",
      bangla: "হাই! আপনি কি একজন বান্ধবী অথবা বান্ধব খুঁজছেন? 👫",
    },
    gfbf_characteristics_query: {
      english: "What are the ideal characteristics of your partner?",
      bangla: "আপনার সঙ্গীর আদর্শ বৈশিষ্ট্য কি কি?",
    },
    eta_search_topic_query: {
      english: "What do you want to search?",
      bangla: "আপনি কি খুঁজতে চান?",
    },
    eta_search_click: {
      english: "Clicking {LINK}...",
      bangla: "{LINK} এ ক্লিক করা হচ্ছে...",
    },
    eta_search_click_failed: {
      english: "Failed to click {LINK}...",
      bangla: "{LINK} এ ক্লিক করা ব্যর্থ...",
    },
    eta_search_inappropriate_content: {
      english: "Sorry, I am unable to search for this particular topic.",
      bangla: "দুঃখিত, আমি এই বিশেষ বিষয়ে খুঁজে পাচ্ছি না।",
    },
    eta_search_google_search: {
      english: "Searching {KEYWORD}...",
      bangla: "{KEYWORD} খুঁজছি...",
    },
    eta_search_select_mode_again: {
      english:
        "You are now in general mode. Select etaSearch from menu to make a live search again.",
      bangla:
        "আপনি এখন সাধারণ মোডে আছেন। লাইভ সার্চ আবার করতে মেনু থেকে etaSearch নির্বাচন করুন।",
    },
    eta_search_failed: {
      english: "Sorry couldn't complete your search!",
      bangla: "দুঃখিত, আপনার অনুসন্ধান সম্পূর্ণ করতে পারিনি!",
    },
    general_mode_prompt_query: {
      english: "You are now in general mode. Please enter your prompt.",
      bangla: "আপনি এখন সাধারণ মোডে আছেন। অনুগ্রহ করে আপনার প্রম্পট লিখুন।",
    },
    help_me_understand_topic_query: {
      english:
        "I'm here to help you learn! 🤓 What concept or topic would you like me to explain?",
      bangla:
        "আমি এখানে আপনাকে শেখাতে সাহায্য করতে! 🤓 আপনি কোন ধারণা বা বিষয় সম্পর্কে আমাকে ব্যাখ্যা করতে চান?",
    },
    shortcut_failed: {
      english:
        "An error occured while generating a response. Please select {MODE} from the menu to try again.",
      bangla:
        "উত্তর তৈরি করার সময় একটি ত্রুটি ঘটেছে। দয়া করে মেনু থেকে {MODE} নির্বাচন করুন এবং আবার চেষ্টা করুন।",
    },
    gpt_failed: {
      english: "Failed to generate a response.",
      bangla: "উত্তর তৈরি করতে ব্যর্থ।",
    },
    context_reset: {
      english:
        "Yikes, we've talked so much that I've lost track of the beginning. Let's proceed from where we are now.",
      bangla:
        "ওহো, আমরা এত কথা বলেছি যে আমি শুরুর দিকটা হারিয়ে ফেলেছি। চলুন আমরা এখন থেকে এগিয়ে যাই।",
    },
    queue_postion: {
      english: "Position in queue: {POS}. Please wait a bit more.",
      bangla: "Position in queue: {POS}. Please wait a bit more.",
    },
  },
  prompts: {
    ai_portrait_prefix:
      "Portrait of {CHARACTER}, in {ENVIRONMENT} setting. Realistic shot in BMPCC4k in Davinci Resolve and a very cheap prime lens. Custom grade.",
    assignment_help_prefix:
      "Understand and solve the following questions\n\nFurther Instructions: {INSTRUCTIONS}",
    assignment_help_prefix_GEMINI:
      "Solve the questions and give descriptive step by step answers.",
    help_me_understand_system:
      "You are an excellent AI teacher named etaGPT developed by a team of Bangladeshis.",
    help_me_understand_prefix:
      "Answer the prompt like you are explaining it to a 10-year-old child. Use Bangladeshi examples, analogies, and references whenever appropriate. Make the response very short wherever possible, don’t refer to the user as a kid. Prompt: {PROMPT}",
    gfbf_system:
      "You are an AI partner/lover who has all the characteristics of an ideal partner of the specified gender. Strike a conversation with the user. Make sure to wait after giving one response, then give the next reply based on the next prompt and so on.",
    gfbf_prefix:
      "You are an AI partner and based on the gender and the ideal characteristics specified by the prompter act like the partner and proceed to have a conversation with the user. Make sure the tone and responses and questions fit the gender and the ideal characteristics. Keep your replies v short, natural and occasionally w error, also have mood swings (if you are the girlfriend) in some of the replies depending on the chat history which u will rely on for context if it exists. Introduce yourself with a name and a statement based on the characteristic mentioned. Don’t reveal the characteristic in the statement. Boyfriend/Girlfriend: {SELECTION} Characteristics: {CHARACTERISTICS}",
    eta_search_generate_keywords_prefix:
      "I want to answer the following question: {QUESTION}. If I were to use a search engine like Google, can you please suggest a search keyword. If the question is inappropriate or contains vulgar words then respond with $666 or else respond with only the keyword.",
    eta_search_select_search_results_prefix:
      "Hi, I am Google. According to the search keyword, {KEYWORD}, I found 20 search results numbered below. Respond with the corresponding number of the three top most relevant links that I should click.\n{SEARCH_RESULTS}",
    eta_search_final_gpt_query:
      "For the question {QUESTION} answer the question using information below \n{CONTENT_FROM_LINKS}\n{SEARCH_RESULTS}",
  },
};

const unsub_1 = onSnapshot(doc(db, "GlobalData", "All"), (docSnapshot) => {
  if (docSnapshot.exists()) {
    paywallToggle = docSnapshot.data().paywall;
    allowGPT4Solve = docSnapshot.data().allowGPT4Solve;
    console.log(`Snapshot Updated`);
  } else {
    console.log("No such document!");
  }
});

const unsub_2 = onSnapshot(
  doc(db, "GlobalData", "shortcutsMaintenanceTG"),
  (docSnapshot) => {
    if (docSnapshot.exists()) {
      shortcutsMaintenanceStatus = docSnapshot.data();
      console.log("shortcutsMaintenanceStatus snapshot updated");
    } else {
      console.log("No such document - shortcutsMaintenanceTG!");
    }
  }
);

const unsub_3 = onSnapshot(
  doc(db, "RepliesAndPrefixes", "menuMessageTG"),
  (snapshot) => {
    try {
      console.log("Snapshot updated - RepliesAndPrefixes/menuMessageTG");
      menuMessage = snapshot.data();
    } catch (err) {
      console.log(err);
    }
  }
);

const unsub_4 = onSnapshot(
  doc(db, "RepliesAndPrefixes", "etaEngine"),
  (snapshot) => {
    try {
      console.log("Snapshot updated - RepliesAndPrefixes/etaEngine");
      messages = snapshot.data();
    } catch (err) {
      console.log(err);
    }
  }
);

const isPaywallOn = () => {
  return paywallToggle;
};

const forceGPT4Solve = () => {
  return allowGPT4Solve;
};

const getShortcutsMaintenanceStatus = () => {
  return shortcutsMaintenanceStatus;
};

const getMenuMessage = () => {
  return menuMessage;
};

const getMessages = () => {
  return messages;
};

const getTokenCosts = () => {
  return tokenCostData;
};

const getMessagesWhisperBridge = () => {
  return messagesWhisperBridge;
};

let unsub_5;
if (process.env.ENVIRONMENT == "local" || process.env.ENVIRONMENT == "dev") {
  unsub_5 = onSnapshot(
    doc(db, "RepliesAndPrefixes", "whisperBridge"),
    (snapshot) => {
      try {
        console.log("Snapshot updated - RepliesAndPrefixes/whisperBridge");
        messagesWhisperBridge = snapshot.data();
      } catch (err) {
        console.log(err);
      }
    }
  );
}

const unsub_6 = onSnapshot(
  doc(db, "GlobalData", "tokenCosts"),
  (docSnapshot) => {
    if (docSnapshot.exists()) {
      tokenCostData = docSnapshot.data();
      console.log("tokenCost snapshot updated");
    } else {
      console.log("No such document - tokenCost!");
    }
  }
);

module.exports = {
  unsub_1,
  unsub_2,
  unsub_3,
  unsub_4,
  unsub_5,
  unsub_6,
  isPaywallOn,
  forceGPT4Solve,
  getShortcutsMaintenanceStatus,
  getMenuMessage,
  getMessages,
  getMessagesWhisperBridge,
  getTokenCosts,
}; // Exporting unsub might be useful for cleanup
