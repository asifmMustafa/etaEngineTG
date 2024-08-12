const {
  uploadBytes,
  ref,
  getDownloadURL,
  deleteObject,
} = require("firebase/storage");
const { storage } = require("../firebase");
const { catchError } = require("../../bot/errorHandler");

const storeImage = async (chat_id, data, name) => {
  try {
    const fileRef = ref(storage, `${chat_id}/${name}.png`);
    await uploadBytes(fileRef, data);
    const url = await getDownloadURL(fileRef);
    return url;
  } catch (err) {
    catchError(err);
    console.log(err);
    console.log("Error Storing Image");
  }
};

const deleteImage = async (path) => {
  try {
    const fileRef = ref(storage, path);
    setTimeout(async () => {
      await deleteObject(fileRef);
    }, 60000);
  } catch (err) {
    console.log("Error deleting image.");
    catchError(err);
  }
};

// const storeDocx = async (chat_id, data, name) => {
//   try {
//     const fileRef = ref(storage, `${chat_id}/${name}.docx`);
//     await uploadBytes(fileRef, data);
//     const url = await getDownloadURL(fileRef);
//     return url;
//   } catch (err) {
//     console.log(err);
//     console.log("Error storing Document");
//     sendAlert(`There was an Error: ${extractErrorMessageAndLineNumber(err)}`);
//   }
// };

const storeDocument = async (chat_id, data, name, fileType) => {
  let mimeType, fileExtension;

  switch (fileType) {
    case "pdf":
      mimeType = "application/pdf";
      fileExtension = ".pdf";
      break;
    case "docx":
      mimeType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      fileExtension = ".docx";
      break;
    default:
      throw new Error("Unsupported file type");
  }

  try {
    // Set the MIME type for the file and specify the content disposition to force download
    const metadata = {
      contentType: mimeType,
      contentDisposition: `attachment; filename=${name}${fileExtension}`,
    };

    // Reference the file location in Firebase Storage
    const fileRef = ref(storage, `${chat_id}/${name}${fileExtension}`);

    // Upload the file data to Firebase Storage with the specified metadata
    await uploadBytes(fileRef, data, metadata);

    // Get the download URL
    let url = await getDownloadURL(fileRef);

    // Append the fake filename for good measure (though it might not be necessary if the content type and disposition headers solve the issue)
    url = `${url}&file=${name}${fileExtension}`;

    console.log(url);
    return url;
  } catch (err) {
    catchError(err);
    console.log(err);
    console.log("Error storing Document");
  }
};

module.exports = { storeImage, deleteImage, storeDocument };
