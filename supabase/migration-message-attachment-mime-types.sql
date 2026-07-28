-- Allow more image types for employee message attachments (same bucket as valve uploads).

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/pjpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/heic',
  'image/heif'
]
where id = 'valve-attachments';
