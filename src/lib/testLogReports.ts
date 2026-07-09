import { supabase } from './supabase'
import type { TestLogReport, TestLogReportSource } from '../types/testLogReport'
import { VALVE_ATTACHMENTS_BUCKET } from './valveAttachments'

const MAX_BYTES = 20 * 1024 * 1024
const REPORT_SELECT = 'id,test_log_id,storage_path,file_name,mime_type,source,created_at'

function extFromName(name: string) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export function testLogReportPublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

export async function loadTestLogReports(testLogId: number): Promise<TestLogReport[]> {
  const { data, error } = await supabase
    .from('test_log_reports')
    .select(REPORT_SELECT)
    .eq('test_log_id', testLogId)
    .order('created_at', { ascending: false })

  if (error) return []
  return (data as TestLogReport[]) ?? []
}

export async function uploadTestLogReport(
  testLogId: number,
  file: File,
  source: TestLogReportSource = 'upload',
): Promise<{ report: TestLogReport | null; error: string | null }> {
  if (file.size > MAX_BYTES) return { report: null, error: 'File is too large (max 20 MB).' }

  const allowed =
    file.type === 'application/pdf' ||
    file.type.startsWith('image/') ||
    /\.(pdf|png|jpe?g|webp|gif)$/i.test(file.name)
  if (!allowed) return { report: null, error: 'Upload a PDF or image file.' }

  const storagePath = `test-log-reports/${testLogId}/${crypto.randomUUID()}${extFromName(file.name)}`
  const { error: uploadError } = await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (uploadError) return { report: null, error: uploadError.message || 'Upload failed.' }

  const { data, error } = await supabase
    .from('test_log_reports')
    .insert({
      test_log_id: testLogId,
      storage_path: storagePath,
      file_name: file.name.slice(0, 500),
      mime_type: file.type || null,
      source,
    })
    .select(REPORT_SELECT)
    .single()

  if (error) {
    await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove([storagePath])
    return { report: null, error: error.message }
  }

  return { report: data as TestLogReport, error: null }
}

export async function deleteTestLogReport(report: TestLogReport): Promise<{ error: string | null }> {
  const { error: storageError } = await supabase.storage.from(VALVE_ATTACHMENTS_BUCKET).remove([report.storage_path])
  if (storageError) return { error: storageError.message || 'Could not remove file.' }

  const { error } = await supabase.from('test_log_reports').delete().eq('id', report.id)
  if (error) return { error: error.message }
  return { error: null }
}
