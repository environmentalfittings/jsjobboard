export type TestLogReportSource = 'upload' | 'generated'

export type TestLogReport = {
  id: number
  test_log_id: number
  storage_path: string
  file_name: string
  mime_type: string | null
  source: TestLogReportSource
  created_at: string
}
