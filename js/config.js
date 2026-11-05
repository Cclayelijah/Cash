export const supabaseUrl = "https://yakzdqwzhczcdvopcgvq.supabase.co";
export const supabaseKey = "sb_publishable_zgYLk7-pYeWnYvqU3oy7VA_Opq2McWM";
export const authRedirectUrl = "https://damncash.com";

export function accountsEnabled() {
  return supabaseUrl.startsWith("https://") && supabaseKey.length > 20;
}
