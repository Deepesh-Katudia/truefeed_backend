const { supabase } = require("../config/supabaseClient");

const BUCKET = "Uploads"; // must match exactly

async function uploadBufferToUploadsBucket({ path, buffer, contentType }) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: contentType || "application/octet-stream",
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

module.exports = { uploadBufferToUploadsBucket };
