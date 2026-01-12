const { supabase } = require("../config/supabaseClient");

async function uploadBufferToUploadsBucket({ path, buffer, contentType }) {
  const { error } = await supabase.storage
    .from("uploads")
    .upload(path, buffer, {
      contentType: contentType || "application/octet-stream",
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from("uploads").getPublicUrl(path);
  return data.publicUrl;
}

module.exports = { uploadBufferToUploadsBucket };
