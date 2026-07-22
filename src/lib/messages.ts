import { isFeedbackEnabled } from './feedbackEnabled'
import { loadUnseenFeedbackResolutions, markFeedbackResolutionSeen } from './feedbackNotifications'
import {
  parseMessageAttachments,
  uploadMessageAttachment,
  type MessageAttachment,
} from './messageAttachments'
import { supabase } from './supabase'

export type { MessageAttachment }

export type InboxItem = {
  key: string
  source: 'message' | 'feedback'
  sourceId: number
  category: 'message' | 'notification'
  subject: string | null
  body: string
  senderName: string | null
  senderUserId: string | null
  recipientUserId: string | null
  read: boolean
  archived: boolean
  createdAt: string
  notificationKind: string | null
  relatedFeedbackId: number | null
  attachments: MessageAttachment[]
}

type AppMessageRow = {
  id: number
  sender_user_id: string | null
  recipient_user_id: string
  sender_name: string | null
  subject: string | null
  body: string
  category: 'message' | 'notification'
  notification_kind: string | null
  related_feedback_id: number | null
  read_at: string | null
  recipient_archived_at: string | null
  recipient_deleted_at: string | null
  sender_archived_at: string | null
  sender_deleted_at: string | null
  attachments: unknown
  created_at: string
}

const MESSAGE_SELECT_FULL =
  'id,sender_user_id,recipient_user_id,sender_name,subject,body,category,notification_kind,related_feedback_id,read_at,recipient_archived_at,recipient_deleted_at,sender_archived_at,sender_deleted_at,attachments,created_at'

const MESSAGE_SELECT_BASE =
  'id,sender_user_id,recipient_user_id,sender_name,subject,body,category,notification_kind,related_feedback_id,read_at,created_at'

const ARCHIVE_MIGRATION_HINT =
  'Run supabase/migration-app-messages-archive-attachments.sql in Supabase SQL Editor to enable message archive'

function isMissingMessagesTable(message: string) {
  return /Could not find the table|relation ["']?public\.app_messages["']? does not exist|relation ["']?app_messages["']? does not exist/i.test(
    message,
  )
}

function isMissingArchiveColumns(message: string) {
  return /(recipient_archived_at|sender_archived_at|recipient_deleted_at|sender_deleted_at|attachments)/i.test(
    message,
  ) && /column|schema cache|does not exist/i.test(message)
}

function isMissingMessagesRpc(message: string) {
  return /mark_app_message_read|archive_app_message|unarchive_app_message|delete_app_message|function.*does not exist|Could not find the function/i.test(
    message,
  )
}

function rowToInboxItem(row: AppMessageRow, userId: string): InboxItem | null {
  const isRecipient = row.recipient_user_id === userId
  const isSender = row.sender_user_id === userId
  if (!isRecipient && !isSender) return null

  const deleted = isRecipient ? Boolean(row.recipient_deleted_at) : Boolean(row.sender_deleted_at)
  if (deleted) return null

  const archived = isRecipient ? Boolean(row.recipient_archived_at) : Boolean(row.sender_archived_at)

  return {
    key: `message-${row.id}`,
    source: 'message',
    sourceId: row.id,
    category: row.category,
    subject: row.subject,
    body: row.body,
    senderName: row.sender_name,
    senderUserId: row.sender_user_id,
    recipientUserId: row.recipient_user_id,
    read: Boolean(row.read_at),
    archived,
    createdAt: row.created_at,
    notificationKind: row.notification_kind,
    relatedFeedbackId: row.related_feedback_id,
    attachments: parseMessageAttachments(row.attachments),
  }
}

function mergeInboxItems(target: InboxItem[], incoming: InboxItem[]) {
  const seen = new Set(target.map((item) => item.key))
  for (const item of incoming) {
    if (seen.has(item.key)) continue
    target.push(item)
    seen.add(item.key)
  }
}

export async function loadInboxItems(userId: string): Promise<{ items: InboxItem[]; error: string | null }> {
  const items: InboxItem[] = []
  let warning: string | null = null

  const primary = await supabase
    .from('app_messages')
    .select(MESSAGE_SELECT_FULL)
    .or(`recipient_user_id.eq.${userId},sender_user_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(300)

  let rows: AppMessageRow[] = []
  let error = primary.error

  if (error && isMissingArchiveColumns(error.message)) {
    warning = ARCHIVE_MIGRATION_HINT
    const fallback = await supabase
      .from('app_messages')
      .select(MESSAGE_SELECT_BASE)
      .or(`recipient_user_id.eq.${userId},sender_user_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(300)
    error = fallback.error
    if (!fallback.error) {
      rows = ((fallback.data as Array<Partial<AppMessageRow>> | null) ?? []).map((row) => ({
        id: Number(row.id),
        sender_user_id: row.sender_user_id ?? null,
        recipient_user_id: String(row.recipient_user_id ?? ''),
        sender_name: row.sender_name ?? null,
        subject: row.subject ?? null,
        body: String(row.body ?? ''),
        category: (row.category as AppMessageRow['category']) ?? 'message',
        notification_kind: row.notification_kind ?? null,
        related_feedback_id: row.related_feedback_id ?? null,
        read_at: row.read_at ?? null,
        recipient_archived_at: null,
        recipient_deleted_at: null,
        sender_archived_at: null,
        sender_deleted_at: null,
        attachments: [],
        created_at: String(row.created_at ?? ''),
      }))
    }
  } else if (!error) {
    rows = (primary.data as AppMessageRow[] | null) ?? []
  }

  if (error) {
    if (isMissingMessagesTable(error.message)) {
      return { items: [], error: 'Run supabase/migration-app-messages.sql in Supabase SQL Editor' }
    }
    return { items: [], error: error.message }
  }

  for (const row of rows) {
    const item = rowToInboxItem(row, userId)
    if (item) items.push(item)
  }

  // Pull archived messages explicitly so they are not pushed out of the recent-message limit.
  if (!warning) {
    const archivedQueries = await Promise.all([
      supabase
        .from('app_messages')
        .select(MESSAGE_SELECT_FULL)
        .eq('recipient_user_id', userId)
        .not('recipient_archived_at', 'is', null)
        .is('recipient_deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('app_messages')
        .select(MESSAGE_SELECT_FULL)
        .eq('sender_user_id', userId)
        .not('sender_archived_at', 'is', null)
        .is('sender_deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(300),
    ])

    for (const result of archivedQueries) {
      if (result.error) {
        if (isMissingArchiveColumns(result.error.message)) {
          warning = ARCHIVE_MIGRATION_HINT
          break
        }
        continue
      }
      const archivedItems: InboxItem[] = []
      for (const row of (result.data ?? []) as AppMessageRow[]) {
        const item = rowToInboxItem(row, userId)
        if (item) archivedItems.push(item)
      }
      mergeInboxItems(items, archivedItems)
    }
  }

  if (isFeedbackEnabled()) {
    const { notices } = await loadUnseenFeedbackResolutions(userId)
    const knownFeedbackIds = new Set(
      items
        .filter((item) => item.relatedFeedbackId != null)
        .map((item) => item.relatedFeedbackId as number),
    )

    for (const notice of notices) {
      if (knownFeedbackIds.has(notice.id)) continue
      items.push({
        key: `feedback-${notice.id}`,
        source: 'feedback',
        sourceId: notice.id,
        category: 'notification',
        subject: 'Your feedback was addressed',
        body: `Your feedback:\n${notice.message}\n\nFix applied:\n${notice.resolution_notes}`,
        senderName: 'JS Valve Admin',
        senderUserId: null,
        recipientUserId: userId,
        read: false,
        archived: false,
        createdAt: notice.resolved_at ?? new Date().toISOString(),
        notificationKind: 'feedback_resolved',
        relatedFeedbackId: notice.id,
        attachments: [],
      })
    }
  }

  items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return { items, error: warning }
}

export function inboxUnreadCount(items: InboxItem[], userId: string) {
  return items.filter((item) => !item.read && !item.archived && item.recipientUserId === userId).length
}

export async function markInboxItemRead(item: InboxItem): Promise<string | null> {
  if (item.source === 'message') {
    const { error } = await supabase.rpc('mark_app_message_read', { p_message_id: item.sourceId })
    if (error) {
      if (isMissingMessagesRpc(error.message)) {
        return 'Run supabase/migration-app-messages.sql in Supabase SQL Editor'
      }
      return error.message
    }
    if (item.relatedFeedbackId != null) {
      const feedbackError = await markFeedbackResolutionSeen(item.relatedFeedbackId)
      if (feedbackError) return feedbackError
    }
    return null
  }

  if (item.source === 'feedback') {
    return markFeedbackResolutionSeen(item.sourceId)
  }

  return null
}

export async function archiveInboxItem(item: InboxItem): Promise<string | null> {
  if (item.source !== 'message') {
    return markInboxItemRead(item)
  }
  const { error } = await supabase.rpc('archive_app_message', { p_message_id: item.sourceId })
  if (error) {
    if (isMissingMessagesRpc(error.message)) {
      return ARCHIVE_MIGRATION_HINT
    }
    return error.message
  }
  return null
}

export async function unarchiveInboxItem(item: InboxItem): Promise<string | null> {
  if (item.source !== 'message') return 'Only saved messages can be unarchived'
  const { error } = await supabase.rpc('unarchive_app_message', { p_message_id: item.sourceId })
  if (error) {
    if (isMissingMessagesRpc(error.message)) {
      return ARCHIVE_MIGRATION_HINT
    }
    return error.message
  }
  return null
}

export async function deleteInboxItem(item: InboxItem): Promise<string | null> {
  if (item.source === 'feedback') {
    return markFeedbackResolutionSeen(item.sourceId)
  }
  const { error } = await supabase.rpc('delete_app_message', { p_message_id: item.sourceId })
  if (error) {
    if (isMissingMessagesRpc(error.message)) {
      return ARCHIVE_MIGRATION_HINT
    }
    return error.message
  }
  return null
}

export async function sendDirectMessage(options: {
  recipientUserId: string
  senderUserId: string
  senderName: string
  subject?: string
  body: string
  attachmentFiles?: File[]
}): Promise<string | null> {
  const text = options.body.trim()
  const files = options.attachmentFiles ?? []
  if (!text && files.length === 0) return 'Message cannot be empty'

  const { data: inserted, error } = await supabase
    .from('app_messages')
    .insert({
      sender_user_id: options.senderUserId,
      recipient_user_id: options.recipientUserId,
      sender_name: options.senderName.trim() || null,
      subject: options.subject?.trim() || null,
      body: text || 'See attached file(s).',
      category: 'message',
    })
    .select('id')
    .single()

  if (error || !inserted) {
    if (isMissingMessagesTable(error?.message ?? '')) {
      return 'Run supabase/migration-app-messages.sql in Supabase SQL Editor'
    }
    return error?.message ?? 'Could not send message'
  }

  const uploaded: MessageAttachment[] = []
  for (const file of files) {
    const { attachment, error: uploadError } = await uploadMessageAttachment(inserted.id, file)
    if (uploadError || !attachment) {
      return uploadError ?? 'Could not upload attachment'
    }
    uploaded.push(attachment)
  }

  if (uploaded.length > 0) {
    const { error: updateError } = await supabase
      .from('app_messages')
      .update({ attachments: uploaded })
      .eq('id', inserted.id)
    if (updateError) {
      if (/attachments|column.*does not exist/i.test(updateError.message)) {
        return 'Run supabase/migration-app-messages-archive-attachments.sql in Supabase SQL Editor'
      }
      return updateError.message
    }
  }

  return null
}

export async function createFeedbackResolvedNotification(options: {
  feedbackId: number
  recipientUserId: string
  senderUserId: string
  senderName: string
  feedbackMessage: string
  resolutionNotes: string
}): Promise<string | null> {
  const body = `Your feedback:\n${options.feedbackMessage.trim()}\n\nFix applied:\n${options.resolutionNotes.trim()}`
  const { error } = await supabase.from('app_messages').insert({
    sender_user_id: options.senderUserId,
    recipient_user_id: options.recipientUserId,
    sender_name: options.senderName.trim() || 'JS Valve Admin',
    subject: 'Your feedback was addressed',
    body,
    category: 'notification',
    notification_kind: 'feedback_resolved',
    related_feedback_id: options.feedbackId,
    metadata: {
      feedback_message: options.feedbackMessage.trim(),
      resolution_notes: options.resolutionNotes.trim(),
    },
  })

  if (error) {
    if (isMissingMessagesTable(error.message)) {
      return null
    }
    return error.message
  }

  return null
}
