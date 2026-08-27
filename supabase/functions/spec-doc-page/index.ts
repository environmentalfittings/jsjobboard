import { createClient } from 'npm:@supabase/supabase-js@2'

const SPEC_DOCUMENTS_BUCKET = 'spec-documents'
const SIGNED_URL_TTL_SEC = 3600

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function parseDocPagePath(url: URL): { docId: string | null; page: number | null } {
  // /functions/v1/spec-doc-page/doc/{uuid}/page/{n}
  const parts = url.pathname.split('/').filter(Boolean)
  const docIdx = parts.indexOf('doc')
  const pageIdx = parts.indexOf('page')
  if (docIdx >= 0 && pageIdx === docIdx + 2 && parts[docIdx + 1] && parts[pageIdx + 1]) {
    const docId = parts[docIdx + 1]
    const page = Number.parseInt(parts[pageIdx + 1], 10)
    if (docId && Number.isFinite(page) && page >= 1) return { docId, page }
  }

  const docId = url.searchParams.get('doc') ?? url.searchParams.get('id')
  const pageRaw = url.searchParams.get('page') ?? url.searchParams.get('n')
  const page = pageRaw ? Number.parseInt(pageRaw, 10) : NaN
  if (docId && Number.isFinite(page) && page >= 1) return { docId, page }

  return { docId: null, page: null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return new Response('Server misconfigured', { status: 500, headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: callerData, error: callerError } = await callerClient.auth.getUser()
  const caller = callerData.user
  if (callerError || !caller) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  }

  const { docId, page } = parseDocPagePath(new URL(req.url))
  if (!docId || !page) {
    return new Response('Bad request — use /doc/{specDocumentId}/page/{n}', {
      status: 400,
      headers: corsHeaders,
    })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: specDoc, error: specError } = await adminClient
    .from('spec_documents')
    .select('id, title, resource_document_id, status')
    .eq('id', docId)
    .maybeSingle()

  if (specError || !specDoc) {
    return new Response('Spec document not found', { status: 404, headers: corsHeaders })
  }
  if (specDoc.status !== 'active') {
    return new Response('Spec document is not active', { status: 410, headers: corsHeaders })
  }
  if (!specDoc.resource_document_id) {
    return new Response('Spec document has no linked resource file', { status: 404, headers: corsHeaders })
  }

  const { data: resourceDoc, error: resourceError } = await adminClient
    .from('resource_documents')
    .select('storage_path, mime_type')
    .eq('id', specDoc.resource_document_id)
    .maybeSingle()

  if (resourceError || !resourceDoc?.storage_path) {
    return new Response('Resource file not found', { status: 404, headers: corsHeaders })
  }

  await adminClient.from('spec_document_page_views').insert({
    spec_document_id: docId,
    user_id: caller.id,
    source_page: page,
  })

  const { data: signed, error: signError } = await adminClient.storage
    .from(SPEC_DOCUMENTS_BUCKET)
    .createSignedUrl(resourceDoc.storage_path, SIGNED_URL_TTL_SEC)

  if (signError || !signed?.signedUrl) {
    return new Response('Could not mint signed URL', { status: 500, headers: corsHeaders })
  }

  const target = new URL(signed.signedUrl)
  target.hash = `page=${page}`

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: target.toString(),
      'Cache-Control': 'no-store',
    },
  })
})
