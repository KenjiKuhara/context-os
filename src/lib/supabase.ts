import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing')
if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing')
if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing')

// ブラウザでも使える（公開キー）
export const supabase = createClient(supabaseUrl, anonKey)

// サーバー専用（secretキー）※API Route でのみ使う
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
})
