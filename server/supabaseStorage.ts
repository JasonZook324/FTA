import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || process.env.AVATAR_BUCKET || "avatars";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  // Intentionally do not throw at import time to avoid crashing server startup
  // Functions will throw helpful errors when used without configuration.
}

export function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase storage not configured: set SUPABASE_URL and SUPABASE_SERVICE_KEY");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export async function ensureBucketExists() {
  const supabase = getSupabaseAdmin();
  // Requires service role; attempt to get bucket, create if missing
  const { data: bucketInfo, error: getErr } = await supabase.storage.getBucket(SUPABASE_BUCKET);
  if (getErr && getErr.message.includes("Invalid storage bucket id")) {
    const { error: createErr } = await supabase.storage.createBucket(SUPABASE_BUCKET, { public: false });
    if (createErr) {
      throw new Error(`Supabase bucket error: ${createErr.message}`);
    }
  } else if (getErr) {
    // Other errors
    throw new Error(`Supabase bucket error: ${getErr.message}`);
  }
}

export async function createSignedUpload(userId: string, ext: string) {
  const supabase = getSupabaseAdmin();
  const path = `avatars/${userId}/${Date.now()}.${ext}`;
  await ensureBucketExists();
  const { data, error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(error?.message || "Failed to create signed upload URL");
  }
  return { path, signedUrl: data.signedUrl }; // signedUrl is a one-time POST URL
}

export async function getSignedUrl(path: string, expiresInSeconds = 60 * 60) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(error?.message || "Failed to create signed access URL");
  }
  return data.signedUrl;
}

export function getPublicBaseUrl() {
  // For private buckets we do not use public base URLs; access via signed URLs
  // Return a pseudo-base to allow validation of keys, not external URLs.
  return `supabase://${SUPABASE_BUCKET}`;
}

export function buildStorageKeyFromSignedUrl(signedUrl: string): string | null {
  // Supabase signed upload URL responds with a URL that contains the path as query params
  // Since client will send us back nothing (we will store path at finalize), we keep path known.
  return null;
}