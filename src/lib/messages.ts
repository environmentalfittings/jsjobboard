import { TEST_AND_DISPOSE_NOTIFY_RECIPIENT_NAMES } from '../constants/testLogDisposeNotifyRecipients'
import { isFeedbackEnabled } from './feedbackEnabled'
import { loadUnseenFeedbackResolutions, markFeedbackResolutionSeen } from './feedbackNotifications'
import {
  parseMessageAttachments,
  uploadMessageAttachment,
  type MessageAttachment,
} from './messageAttachments'
import { loadTechniciansForMessages } from './messageRecipients'
import { normalizeEmployeeUsername } from './employeeAuth'
import { isQualityTeamMember } from './qualityTeam'
import { normalizeQualityTeamLevel } from '../types/employees'
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
    const { data: updated, error: updateError } = await supabase
      .from('app_messages')
      .update({ attachments: uploaded })
      .eq('id', inserted.id)
      .select('attachments')
      .single()
    if (updateError) {
      if (/attachments|column.*does not exist/i.test(updateError.message)) {
        return 'Run supabase/migration-app-messages-archive-attachments.sql in Supabase SQL Editor'
      }
      return updateError.message
    }
    const saved = parseMessageAttachments(updated?.attachments)
    if (saved.length !== uploaded.length) {
      return 'Message sent but attachments could not be saved. Ask an admin to run message attachment migrations.'
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

/**
 * Auth user ids for every active Quality Team member who can receive Messages.
 * Uses employees.auth_user_id, with technicians.user_id as fallback when the roster link is missing.
 */
async function loadQualityTeamRecipientAuthIds(options?: {
  /** When set, omit this auth user from recipients (e.g. ITP review requests). */
  excludeUserId?: string | null
}): Promise<{ recipientIds: string[]; memberCount: number; error: string | null }> {
  const excludeUserId = options?.excludeUserId?.trim() || null
  const { data: employees, error: loadError } = await supabase
    .from('employees')
    .select('id,employee_no,username,is_active,quality_team_level,auth_user_id')

  if (loadError) {
    if (isMissingMessagesTable(loadError.message)) {
      return { recipientIds: [], memberCount: 0, error: null }
    }
    if (/quality_team_level/i.test(loadError.message)) {
      return {
        recipientIds: [],
        memberCount: 0,
        error: 'Run migration-employee-quality-team.sql in Supabase to enable Quality Team alerts',
      }
    }
    return { recipientIds: [], memberCount: 0, error: loadError.message }
  }

  const qualityMembers = ((employees as Record<string, unknown>[] | null) ?? []).filter((row) => {
    if (!Boolean(row.is_active)) return false
    return isQualityTeamMember(normalizeQualityTeamLevel(row.quality_team_level))
  })

  if (qualityMembers.length === 0) {
    return { recipientIds: [], memberCount: 0, error: null }
  }

  const technicians = await loadTechniciansForMessages()
  const techByEmployeeId = new Map<string, string>()
  const techByEmployeeNo = new Map<string, string>()
  const techByUsername = new Map<string, string>()
  for (const tech of technicians) {
    if (!tech.user_id) continue
    const employeeKey = tech.employee_id?.trim()
    if (employeeKey) {
      techByEmployeeId.set(employeeKey, tech.user_id)
      techByEmployeeNo.set(employeeKey, tech.user_id)
    }
    const login = tech.login_username?.trim()
    if (login) techByUsername.set(normalizeEmployeeUsername(login), tech.user_id)
  }

  const recipientIds = [
    ...new Set(
      qualityMembers
        .map((row) => {
          const direct = row.auth_user_id == null ? null : String(row.auth_user_id)
          if (direct) return direct
          const employeeId = String(row.id ?? '').trim()
          const employeeNo = String(row.employee_no ?? '').trim()
          const username = normalizeEmployeeUsername(String(row.username ?? ''))
          return (
            techByEmployeeId.get(employeeId) ??
            techByEmployeeNo.get(employeeNo) ??
            techByUsername.get(username) ??
            null
          )
        })
        .filter((id): id is string => Boolean(id && (!excludeUserId || id !== excludeUserId))),
    ),
  ]

  return { recipientIds, memberCount: qualityMembers.length, error: null }
}

function normalizeEmployeeFullName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Auth user ids for named active employees who can receive Messages.
 * Uses employees.auth_user_id, with technicians.user_id as fallback when the roster link is missing.
 */
async function loadNamedEmployeeRecipientAuthIds(fullNames: readonly string[]): Promise<{
  recipientIds: string[]
  unmatchedNames: string[]
  error: string | null
}> {
  const wanted = [...new Set(fullNames.map((name) => name.trim()).filter(Boolean))]
  if (wanted.length === 0) {
    return { recipientIds: [], unmatchedNames: [], error: null }
  }

  const wantedKeys = new Map(wanted.map((name) => [normalizeEmployeeFullName(name), name]))

  const { data: employees, error: loadError } = await supabase
    .from('employees')
    .select('id,employee_no,username,full_name,is_active,auth_user_id')

  if (loadError) {
    if (isMissingMessagesTable(loadError.message)) {
      return { recipientIds: [], unmatchedNames: wanted, error: null }
    }
    return { recipientIds: [], unmatchedNames: wanted, error: loadError.message }
  }

  const technicians = await loadTechniciansForMessages()
  const techByEmployeeId = new Map<string, string>()
  const techByEmployeeNo = new Map<string, string>()
  const techByUsername = new Map<string, string>()
  for (const tech of technicians) {
    if (!tech.user_id) continue
    const employeeKey = tech.employee_id?.trim()
    if (employeeKey) {
      techByEmployeeId.set(employeeKey, tech.user_id)
      techByEmployeeNo.set(employeeKey, tech.user_id)
    }
    const login = tech.login_username?.trim()
    if (login) techByUsername.set(normalizeEmployeeUsername(login), tech.user_id)
  }

  const recipientIds: string[] = []
  const unmatchedNames: string[] = []

  for (const [key, displayName] of wantedKeys) {
    const employee = ((employees as Record<string, unknown>[] | null) ?? []).find((row) => {
      if (!Boolean(row.is_active)) return false
      return normalizeEmployeeFullName(String(row.full_name ?? '')) === key
    })

    if (!employee) {
      unmatchedNames.push(displayName)
      continue
    }

    const direct = employee.auth_user_id == null ? null : String(employee.auth_user_id)
    const employeeId = String(employee.id ?? '').trim()
    const employeeNo = String(employee.employee_no ?? '').trim()
    const username = normalizeEmployeeUsername(String(employee.username ?? ''))
    const authUserId =
      direct ??
      techByEmployeeId.get(employeeId) ??
      techByEmployeeNo.get(employeeNo) ??
      techByUsername.get(username) ??
      null

    if (!authUserId) {
      unmatchedNames.push(displayName)
      continue
    }

    recipientIds.push(authUserId)
  }

  return {
    recipientIds: [...new Set(recipientIds)],
    unmatchedNames,
    error: null,
  }
}

async function insertAppNotifications(options: {
  recipientIds: string[]
  senderUserId: string
  senderName: string
  subject: string
  body: string
  notificationKind: string
  metadata: Record<string, unknown>
}): Promise<{ notified: number; error: string | null }> {
  if (options.recipientIds.length === 0) return { notified: 0, error: null }

  const { data: rpcCount, error: rpcError } = await supabase.rpc('send_app_notifications', {
    p_recipient_user_ids: options.recipientIds,
    p_subject: options.subject,
    p_body: options.body,
    p_notification_kind: options.notificationKind,
    p_sender_name: options.senderName.trim() || 'JS Valve',
    p_metadata: options.metadata,
  })

  if (!rpcError) {
    const notified = typeof rpcCount === 'number' ? rpcCount : Number(rpcCount) || 0
    return { notified, error: null }
  }

  const rpcMissing = /send_app_notifications|Could not find the function|schema cache|does not exist/i.test(
    rpcError.message,
  )

  const rows = options.recipientIds.map((recipientUserId) => ({
    sender_user_id: options.senderUserId,
    recipient_user_id: recipientUserId,
    sender_name: options.senderName.trim() || 'JS Valve',
    subject: options.subject,
    body: options.body,
    category: 'notification',
    notification_kind: options.notificationKind,
    related_feedback_id: null,
    metadata: options.metadata,
  }))

  const { error } = await supabase.from('app_messages').insert(rows)
  if (error) {
    if (isMissingMessagesTable(error.message)) return { notified: 0, error: null }
    if (/row-level security|rls|policy/i.test(error.message) || rpcMissing) {
      return {
        notified: 0,
        error:
          'Run the app_messages notification migrations in Supabase so Messages notifications can be sent',
      }
    }
    return {
      notified: 0,
      error: rpcMissing ? error.message : `${error.message} (RPC: ${rpcError.message})`,
    }
  }

  return { notified: options.recipientIds.length, error: null }
}

/** Notify every Quality Team member with a login that an ITP needs review. */
export async function notifyQualityTeamItpReviewRequested(options: {
  valveRowId: number
  valveId: string
  customer: string | null
  senderUserId: string
  senderName: string
}): Promise<{ notified: number; error: string | null }> {
  const { recipientIds, memberCount, error: loadError } = await loadQualityTeamRecipientAuthIds({
    excludeUserId: options.senderUserId,
  })
  if (loadError) return { notified: 0, error: loadError }

  if (recipientIds.length === 0) {
    if (memberCount === 0) {
      return {
        notified: 0,
        error: 'No Quality Team members are assigned on Employees yet',
      }
    }
    return {
      notified: 0,
      error:
        'Quality Team members need linked logins (Employees auth link or technician user_id) to receive Messages',
    }
  }

  const customer = options.customer?.trim() || '—'
  const subject = `ITP ready for QC review — ${options.valveId}`
  const body = [
    `An ITP was generated and needs Quality Team review.`,
    ``,
    `Valve: ${options.valveId}`,
    `Customer: ${customer}`,
    ``,
    `Open Quality Team: /quality-team`,
    `Open ITP: /itp/${options.valveRowId}`,
  ].join('\n')

  return insertAppNotifications({
    recipientIds,
    senderUserId: options.senderUserId,
    senderName: options.senderName,
    subject,
    body,
    notificationKind: 'itp_qc_review_requested',
    metadata: {
      valve_row_id: options.valveRowId,
      valve_id: options.valveId,
      customer,
    },
  })
}

/** Notify Quality Team that a technician flagged an ITP checklist item. */
export async function notifyQualityTeamItpItemFlagged(options: {
  valveRowId: number
  valveId: string
  customer: string | null
  itemName: string
  flagReason: string
  photoCount: number
  senderUserId: string
  senderName: string
}): Promise<{ notified: number; error: string | null }> {
  // Always include the flagger so the alert appears in their Messages inbox, even if
  // their Employees row is not linked via auth_user_id yet. Also notify other QT logins.
  const { recipientIds, memberCount, error: loadError } = await loadQualityTeamRecipientAuthIds()
  if (loadError) return { notified: 0, error: loadError }

  const recipients = [
    ...new Set(
      [...recipientIds, options.senderUserId.trim()].filter((id): id is string => Boolean(id)),
    ),
  ]

  if (recipients.length === 0) {
    if (memberCount === 0) {
      return {
        notified: 0,
        error: 'Flag saved on the QC dashboard, but no Quality Team members are assigned on Employees yet',
      }
    }
    return {
      notified: 0,
      error:
        'Flag saved on the QC dashboard, but Quality Team members need linked logins (Employees auth link or technician user_id) to receive Messages',
    }
  }

  const customer = options.customer?.trim() || '—'
  const subject = `ITP item flagged — ${options.valveId}`
  const body = [
    `A checklist item was flagged and needs Quality Team review in QA/QC.`,
    ``,
    `Valve: ${options.valveId}`,
    `Customer: ${customer}`,
    `Item: ${options.itemName}`,
    `Flagged by: ${options.senderName.trim() || 'Technician'}`,
    `Reason: ${options.flagReason.trim()}`,
    `Photos: ${options.photoCount}`,
    ``,
    `Open QA/QC flags: /quality-team`,
    `Open ITP: /itp/${options.valveRowId}`,
  ].join('\n')

  return insertAppNotifications({
    recipientIds: recipients,
    senderUserId: options.senderUserId,
    senderName: options.senderName,
    subject,
    body,
    notificationKind: 'itp_item_flagged',
    metadata: {
      valve_row_id: options.valveRowId,
      valve_id: options.valveId,
      customer,
      item_name: options.itemName,
      flag_reason: options.flagReason.trim(),
      photo_count: options.photoCount,
    },
  })
}

/** Notify the technician who flagged an item that QC issued a resolution. */
export async function notifyFlaggerItpResolution(options: {
  valveRowId: number
  valveId: string
  itemName: string
  flagReason: string
  resolution: string
  ownerName: string
  recipientUserId: string
  senderUserId: string
  senderName: string
}): Promise<string | null> {
  if (!options.recipientUserId.trim()) return null

  const subject = `Flag resolution issued — ${options.valveId}`
  const body = [
    `Quality Team issued a resolution for a flagged ITP item.`,
    ``,
    `Valve: ${options.valveId}`,
    `Item: ${options.itemName}`,
    `Your flag reason: ${options.flagReason.trim() || '—'}`,
    `Owner: ${options.ownerName.trim() || 'Quality Team'}`,
    `Resolution: ${options.resolution.trim()}`,
    ``,
    `Open ITP: /itp/${options.valveRowId}`,
  ].join('\n')

  const { notified, error } = await insertAppNotifications({
    recipientIds: [options.recipientUserId],
    senderUserId: options.senderUserId,
    senderName: options.senderName.trim() || 'Quality Team',
    subject,
    body,
    notificationKind: 'itp_flag_resolved',
    metadata: {
      valve_row_id: options.valveRowId,
      valve_id: options.valveId,
      item_name: options.itemName,
      flag_reason: options.flagReason.trim(),
      resolution: options.resolution.trim(),
    },
  })

  if (error) return error
  if (notified === 0) return 'Could not send resolution message'
  return null
}

/** Notify warehouse staff that a relief/safety valve Test and Dispose log passed and is ready to invoice. */
export async function notifyWarehouseTestAndDispose(options: {
  valveId: string
  valveType: string | null
  testedOn: string
  tester: string
  testLogId: number | null
  senderUserId: string
  senderName: string
}): Promise<{ notified: number; error: string | null }> {
  const { recipientIds, unmatchedNames, error: loadError } = await loadNamedEmployeeRecipientAuthIds(
    TEST_AND_DISPOSE_NOTIFY_RECIPIENT_NAMES,
  )
  if (loadError) return { notified: 0, error: loadError }

  if (recipientIds.length === 0) {
    if (unmatchedNames.length > 0) {
      return {
        notified: 0,
        error: `Could not find Messages logins for: ${unmatchedNames.join(', ')}`,
      }
    }
    return { notified: 0, error: 'No warehouse alert recipients are configured' }
  }

  const valveId = options.valveId.trim()
  const valveType = options.valveType?.trim() || 'Relief / Safety Valve'
  const subject = `Test and Dispose ready to invoice — ${valveId}`
  const body = [
    `A relief/safety valve Test and Dispose log passed and is ready for invoicing.`,
    ``,
    `Valve: ${valveId}`,
    `Valve type: ${valveType}`,
    `Test date: ${options.testedOn}`,
    `Tester: ${options.tester.trim() || '—'}`,
    ``,
    `The job card was moved to Painting after the passing test log was saved.`,
    `Open test log: /test-log-entry`,
  ].join('\n')

  const { notified, error } = await insertAppNotifications({
    recipientIds,
    senderUserId: options.senderUserId,
    senderName: options.senderName,
    subject,
    body,
    notificationKind: 'test_and_dispose_ready',
    metadata: {
      valve_id: valveId,
      valve_type: valveType,
      tested_on: options.testedOn,
      tester: options.tester.trim() || null,
      test_log_id: options.testLogId,
    },
  })

  if (error) return { notified, error }
  if (notified === 0) {
    return { notified: 0, error: 'Could not send warehouse alert' }
  }
  if (unmatchedNames.length > 0) {
    return {
      notified,
      error: `Alert sent, but could not find Messages logins for: ${unmatchedNames.join(', ')}`,
    }
  }
  return { notified, error: null }
}

/** Resolve an employee's Messages login (auth user id), with technician user_id fallback. */
export async function resolveEmployeeAuthUserId(employeeId: string): Promise<{
  authUserId: string | null
  fullName: string | null
  error: string | null
}> {
  const id = employeeId.trim()
  if (!id) return { authUserId: null, fullName: null, error: null }

  const { data: employee, error } = await supabase
    .from('employees')
    .select('id,full_name,employee_no,username,is_active,auth_user_id')
    .eq('id', id)
    .maybeSingle()

  if (error) return { authUserId: null, fullName: null, error: error.message }
  if (!employee) return { authUserId: null, fullName: null, error: 'Salesman employee not found' }
  if (employee.is_active === false) {
    return { authUserId: null, fullName: String(employee.full_name ?? ''), error: 'Salesman employee is inactive' }
  }

  const fullName = String(employee.full_name ?? '').trim() || null
  if (employee.auth_user_id) {
    return { authUserId: String(employee.auth_user_id), fullName, error: null }
  }

  const employeeNo = String(employee.employee_no ?? '').trim()
  const username = String(employee.username ?? '').trim().toLowerCase()
  const techQuery = supabase
    .from('technicians')
    .select('user_id,employee_id,login_username,active')
    .eq('active', true)
    .not('user_id', 'is', null)
    .limit(500)

  const { data: techs } = await techQuery
  const match = ((techs ?? []) as {
    user_id: string | null
    employee_id: string | null
    login_username: string | null
  }[]).find((row) => {
    const byNo = employeeNo && row.employee_id?.trim() === employeeNo
    const byUser = username && row.login_username?.trim().toLowerCase() === username
    return Boolean(byNo || byUser)
  })

  return {
    authUserId: match?.user_id ? String(match.user_id) : null,
    fullName,
    error: null,
  }
}

/** Send a monthly Customer Inventory report to the assigned salesman via Messages. */
export async function notifySalesRepCustomerInventoryReport(options: {
  customerName: string
  periodLabel: string
  itemCount: number
  reportBody: string
  subject: string
  recipientUserId: string
  senderUserId: string
  senderName: string
  inventoryIds?: string[]
}): Promise<{ notified: number; error: string | null }> {
  const recipientUserId = options.recipientUserId.trim()
  if (!recipientUserId) {
    return { notified: 0, error: 'Salesman does not have a linked login for Messages' }
  }
  if (!options.reportBody.trim()) {
    return { notified: 0, error: 'Report body is empty' }
  }

  return insertAppNotifications({
    recipientIds: [recipientUserId],
    senderUserId: options.senderUserId,
    senderName: options.senderName.trim() || 'Customer Inventory',
    subject: options.subject,
    body: options.reportBody,
    notificationKind: 'customer_inventory_monthly_report',
    metadata: {
      customer: options.customerName,
      period: options.periodLabel,
      item_count: options.itemCount,
      inventory_ids: options.inventoryIds ?? [],
    },
  })
}

