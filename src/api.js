import { createClient } from "@supabase/supabase-js";
const expected = "https://leczxapskgixlzykdovz.supabase.co";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configError =
  url && url !== expected
    ? "Supabase接続先が今回専用のプロジェクトと一致しません。設定を確認してください。"
    : "";
export const supabase =
  !configError && url && key
    ? createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;
export async function loadData() {
  const { data, error } = await supabase.rpc("get_workspace");
  if (error) throw error;
  return data;
}
export async function replaceData(data) {
  const { error } = await supabase.rpc("replace_dataset", { payload: data });
  if (error) throw error;
}
export async function saveClient(id, note) {
  const { error } = await supabase
    .from("clients")
    .upsert({ facility_id: id, note }, { onConflict: "owner_id,facility_id" });
  if (error) throw error;
}
export async function removeClient(id) {
  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("facility_id", id);
  if (error) throw error;
}
