// supabase-config.js
const supabaseUrl = 'https://bfhzkzgpuxpuftqkmono.supabase.co';
const supabaseKey = 'sb_publishable_9dIrPjh4Nm-Rk2avgOpByQ_WW0qCYDp';

// On attache le client à l'objet 'window' pour pouvoir l'utiliser dans vos autres fichiers JS
window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);