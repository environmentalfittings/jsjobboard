import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useToast } from '../components/ToastNotification'
import { useAuth } from '../contexts/AuthContext'
import { useEmployees } from '../hooks/useEmployees'
import { useInbox } from '../hooks/useInbox'
import {
  archiveInboxItem,
  deleteInboxItem,
  markInboxItemRead,
  sendDirectMessage,
  unarchiveInboxItem,
  type InboxItem,
} from '../lib/messages'
import {
  isMessageAttachmentFile,
  MAX_MESSAGE_ATTACHMENTS,
  resolveMessageAttachmentUrls,
  type MessageAttachment,
} from '../lib/messageAttachments'
import { canWriteShop, permissionDeniedReason } from '../lib/roles'
import {
  buildMessageRecipients,
  loadTechniciansForMessages,
  messageRecipientName,
} from '../lib/messageRecipients'

interface MessagesPageProps {
  userId: string
  username: string
  homePath: string
}

type InboxFilter = 'inbox' | 'notifications' | 'sent' | 'archived'

type AttachmentDraft = {
  id: string
  file: File
  previewUrl: string | null
}

function formatWhen(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function formatListWhen(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function itemTitle(item: InboxItem) {
  if (item.subject?.trim()) return item.subject.trim()
  if (item.category === 'notification') return 'Notification'
  return 'Message'
}

function itemPreview(body: string) {
  const compact = body.replace(/\s+/g, ' ').trim()
  if (compact.length <= 110) return compact
  return `${compact.slice(0, 107).trimEnd()}…`
}

function renderMessageBody(body: string) {
  const lines = body.split('\n')
  return lines.map((line, index) => {
    const qualityMatch = line.match(/^Open QA\/QC flags:\s*(\/quality-team\S*)?\s*$/i)
    if (qualityMatch) {
      return (
        <span key={`line-${index}`}>
          {index > 0 ? '\n' : ''}
          <Link to={qualityMatch[1] || '/quality-team'}>Open QA/QC flags</Link>
        </span>
      )
    }
    const itpMatch = line.match(/^Open ITP:\s*(\/itp\/\d+\S*)\s*$/i)
    if (itpMatch) {
      return (
        <span key={`line-${index}`}>
          {index > 0 ? '\n' : ''}
          <Link to={itpMatch[1]}>Open ITP</Link>
        </span>
      )
    }
    return (
      <span key={`line-${index}`}>
        {index > 0 ? '\n' : ''}
        {line}
      </span>
    )
  })
}

function isImageAttachment(attachment: MessageAttachment) {
  return (
    attachment.content_type.startsWith('image/') ||
    /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(attachment.file_name)
  )
}

export function MessagesPage({ userId, username, homePath }: MessagesPageProps) {
  const { showToast } = useToast()
  const { role } = useAuth()
  const canWrite = canWriteShop(role)
  const { employees, loading: employeesLoading } = useEmployees()
  const { items, loading, error, refresh } = useInbox(userId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState<InboxFilter>('inbox')
  const [selectedKey, setSelectedKey] = useState<string | null>(searchParams.get('item'))
  const [composeOpen, setComposeOpen] = useState(searchParams.get('compose') === '1')
  const [recipientUserId, setRecipientUserId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachmentDrafts, setAttachmentDrafts] = useState<AttachmentDraft[]>([])
  const [sending, setSending] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [resolvedAttachments, setResolvedAttachments] = useState<MessageAttachment[]>([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [technicians, setTechnicians] = useState<Awaited<ReturnType<typeof loadTechniciansForMessages>>>([])

  useEffect(() => {
    void loadTechniciansForMessages().then(setTechnicians)
  }, [])

  const recipients = useMemo(
    () => buildMessageRecipients(employees, technicians, userId),
    [employees, technicians, userId],
  )

  const filteredItems = useMemo(() => {
    if (filter === 'archived') {
      return items.filter((item) => item.archived)
    }
    if (filter === 'sent') {
      return items.filter((item) => item.source === 'message' && item.senderUserId === userId && !item.archived)
    }
    if (filter === 'notifications') {
      return items.filter(
        (item) => item.category === 'notification' && item.recipientUserId === userId && !item.archived,
      )
    }
    return items.filter((item) => item.recipientUserId === userId && !item.archived)
  }, [filter, items, userId])

  const selectedItem = useMemo(
    () => filteredItems.find((item) => item.key === selectedKey) ?? filteredItems[0] ?? null,
    [filteredItems, selectedKey],
  )

  useEffect(() => {
    return () => {
      for (const draft of attachmentDrafts) {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl)
      }
    }
  }, [attachmentDrafts])

  useEffect(() => {
    if (searchParams.get('compose') === '1') {
      setComposeOpen(true)
    }
    const itemKey = searchParams.get('item')
    if (itemKey) {
      setSelectedKey(itemKey)
      setComposeOpen(false)
    }
  }, [searchParams])

  useEffect(() => {
    if (!selectedItem || selectedItem.read || selectedItem.recipientUserId !== userId) return
    void (async () => {
      const error = await markInboxItemRead(selectedItem)
      if (error) {
        showToast(error)
        return
      }
      void refresh()
    })()
  }, [selectedItem, userId, refresh, showToast])

  useEffect(() => {
    const attachments = selectedItem?.attachments ?? []
    if (!attachments.length) {
      setResolvedAttachments([])
      setAttachmentsLoading(false)
      return
    }

    let cancelled = false
    setAttachmentsLoading(true)
    void resolveMessageAttachmentUrls(attachments).then((rows) => {
      if (!cancelled) {
        setResolvedAttachments(rows)
        setAttachmentsLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [selectedItem?.key, selectedItem?.attachments])

  const clearSearchParams = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('compose')
    next.delete('item')
    setSearchParams(next, { replace: true })
  }

  const resetCompose = () => {
    setRecipientUserId('')
    setSubject('')
    setBody('')
    setAttachmentDrafts((drafts) => {
      for (const draft of drafts) {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl)
      }
      return []
    })
  }

  const addAttachmentDrafts = (fileList: FileList | null) => {
    if (!fileList?.length) return
    const remaining = MAX_MESSAGE_ATTACHMENTS - attachmentDrafts.length
    if (remaining <= 0) {
      showToast(`You can attach up to ${MAX_MESSAGE_ATTACHMENTS} files`)
      return
    }

    const nextDrafts = [...attachmentDrafts]
    for (const file of Array.from(fileList).slice(0, remaining)) {
      if (!isMessageAttachmentFile(file)) {
        showToast(`${file.name} is not a supported image or PDF`)
        continue
      }
      nextDrafts.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      })
    }

    if (nextDrafts.length === attachmentDrafts.length) return
    setAttachmentDrafts(nextDrafts)
  }

  const removeAttachmentDraft = (draftId: string) => {
    setAttachmentDrafts((drafts) => {
      const draft = drafts.find((row) => row.id === draftId)
      if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl)
      return drafts.filter((row) => row.id !== draftId)
    })
  }

  const sendMessage = async () => {
    if (!canWrite) {
      showToast(permissionDeniedReason('shopWrite'))
      return
    }
    if (!recipientUserId) {
      showToast('Choose who to send this to')
      return
    }
    setSending(true)
    const error = await sendDirectMessage({
      recipientUserId,
      senderUserId: userId,
      senderName: username,
      subject,
      body,
      attachmentFiles: attachmentDrafts.map((draft) => draft.file),
    })
    setSending(false)
    if (error) {
      showToast(error)
      return
    }
    resetCompose()
    setComposeOpen(false)
    setFilter('sent')
    clearSearchParams()
    showToast('Message sent')
    void refresh()
  }

  const runItemAction = async (action: 'archive' | 'unarchive' | 'delete') => {
    if (!selectedItem) return
    if (action === 'delete' && !window.confirm('Delete this message from your view?')) return

    setActionBusy(true)
    const error =
      action === 'archive'
        ? await archiveInboxItem(selectedItem)
        : action === 'unarchive'
          ? await unarchiveInboxItem(selectedItem)
          : await deleteInboxItem(selectedItem)
    setActionBusy(false)

    if (error) {
      showToast(error)
      return
    }

    setSelectedKey(null)
    clearSearchParams()
    showToast(action === 'delete' ? 'Message deleted' : action === 'archive' ? 'Message archived' : 'Message restored')
    void refresh()
  }

  const canAddAttachments = attachmentDrafts.length < MAX_MESSAGE_ATTACHMENTS

  return (
    <section className="dashboard-page messages-page">
      <div className="dashboard-title-row">
        <h2 className="dashboard-title">Messages</h2>
        <div className="technicians-page-actions">
          <button type="button" className="button-secondary" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </button>
          {canWrite ? (
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                setComposeOpen(true)
                setSelectedKey(null)
                clearSearchParams()
              }}
            >
              New message
            </button>
          ) : null}
          <Link to={homePath} className="button-secondary">
            Back
          </Link>
        </div>
      </div>

      <p className="placeholder-copy">
        Notifications and direct messages for shop staff. Feedback updates and employee messages appear here.
      </p>
      {error ? <p className="messages-error">{error}</p> : null}

      <div className="messages-layout">
        <aside className="messages-sidebar">
          <div className="messages-filter-row">
            {(['inbox', 'notifications', 'sent', 'archived'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`button-secondary messages-filter-btn${filter === value ? ' messages-filter-btn--active' : ''}`}
                onClick={() => setFilter(value)}
              >
                {value === 'inbox'
                  ? 'Inbox'
                  : value === 'notifications'
                    ? 'Notifications'
                    : value === 'sent'
                      ? 'Sent'
                      : 'Archived'}
              </button>
            ))}
          </div>
          {loading ? (
            <p className="placeholder-copy">Loading…</p>
          ) : filteredItems.length === 0 ? (
            <p className="placeholder-copy">No messages in this view.</p>
          ) : (
            <div className="messages-list">
              {filteredItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`messages-list-item${selectedItem?.key === item.key ? ' messages-list-item--active' : ''}${
                    !item.read && item.recipientUserId === userId ? ' messages-list-item--unread' : ''
                  }`}
                  onClick={() => {
                    setSelectedKey(item.key)
                    setComposeOpen(false)
                    clearSearchParams()
                  }}
                >
                  <div className="messages-list-item-top">
                    <span className="messages-list-item-title">
                      {!item.read && item.recipientUserId === userId ? (
                        <span className="messages-list-item-new">New</span>
                      ) : null}
                      {itemTitle(item)}
                    </span>
                    <time dateTime={item.createdAt}>{formatListWhen(item.createdAt)}</time>
                  </div>
                  <div className="messages-list-item-meta">
                    {filter === 'sent'
                      ? `To ${messageRecipientName(recipients, item.recipientUserId) ?? 'employee'}`
                      : item.senderName ?? 'System'}
                    {item.attachments.length > 0 ? ` · ${item.attachments.length} attachment${item.attachments.length === 1 ? '' : 's'}` : ''}
                  </div>
                  <div className="messages-list-item-preview">{itemPreview(item.body)}</div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="messages-main">
          {composeOpen ? (
            <div className="messages-compose-card">
              <h3 className="messages-detail-title">New message</h3>
              <label className="messages-field">
                <span>To</span>
                <select
                  value={recipientUserId}
                  onChange={(e) => setRecipientUserId(e.target.value)}
                  disabled={sending || employeesLoading}
                >
                  <option value="">Select employee…</option>
                  {recipients.map((recipient) => (
                    <option key={recipient.key} value={recipient.authUserId}>
                      {recipient.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="messages-field">
                <span>Subject (optional)</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  disabled={sending}
                />
              </label>
              <label className="messages-field">
                <span>Message</span>
                <textarea
                  rows={8}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your message…"
                  disabled={sending}
                />
              </label>
              <div className="messages-attachments-field">
                <div className="messages-attachments-label-row">
                  <span className="messages-attachments-label">Photos or PDF (optional)</span>
                  <span className="messages-attachments-count">
                    {attachmentDrafts.length}/{MAX_MESSAGE_ATTACHMENTS}
                  </span>
                </div>
                {attachmentDrafts.length > 0 ? (
                  <div className="messages-attachments-grid">
                    {attachmentDrafts.map((draft) => (
                      <div key={draft.id} className="messages-attachment-draft">
                        {draft.previewUrl ? (
                          <img src={draft.previewUrl} alt={draft.file.name} />
                        ) : (
                          <div className="messages-attachment-pdf">
                            <span>PDF</span>
                            <span className="messages-attachment-pdf-name">{draft.file.name}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          className="messages-attachment-remove"
                          onClick={() => removeAttachmentDraft(draft.id)}
                          disabled={sending}
                          aria-label={`Remove ${draft.file.name}`}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <label className={`button-secondary messages-attachments-add${canAddAttachments ? '' : ' disabled'}`}>
                  <span>{canAddAttachments ? 'Add photos or PDF' : 'Attachment limit reached'}</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="messages-attachments-input"
                    disabled={!canAddAttachments || sending}
                    onChange={(e) => {
                      addAttachmentDrafts(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
              <div className="messages-compose-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    setComposeOpen(false)
                    resetCompose()
                  }}
                  disabled={sending}
                >
                  Cancel
                </button>
                <button type="button" className="button-primary" onClick={() => void sendMessage()} disabled={sending}>
                  {sending ? 'Sending…' : 'Send message'}
                </button>
              </div>
            </div>
          ) : selectedItem ? (
            <article className="messages-detail-card">
              <header className="messages-detail-head">
                <div>
                  <h3 className="messages-detail-title">{itemTitle(selectedItem)}</h3>
                  <div className="messages-detail-meta">
                    <span>{selectedItem.senderName ?? 'System'}</span>
                    <span>·</span>
                    <time dateTime={selectedItem.createdAt}>{formatWhen(selectedItem.createdAt)}</time>
                  </div>
                </div>
                <div className="messages-detail-actions">
                  {selectedItem.senderUserId && selectedItem.senderUserId !== userId ? (
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => {
                        setComposeOpen(true)
                        setRecipientUserId(selectedItem.senderUserId ?? '')
                        setSubject(selectedItem.subject ? `Re: ${selectedItem.subject}` : 'Re: Message')
                        setBody('')
                        setAttachmentDrafts([])
                      }}
                    >
                      Reply
                    </button>
                  ) : null}
                  {selectedItem.archived ? (
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void runItemAction('unarchive')}
                      disabled={actionBusy}
                    >
                      Unarchive
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void runItemAction('archive')}
                      disabled={actionBusy}
                    >
                      Archive
                    </button>
                  )}
                  <button
                    type="button"
                    className="button-secondary messages-delete-btn"
                    onClick={() => void runItemAction('delete')}
                    disabled={actionBusy}
                  >
                    Delete
                  </button>
                </div>
              </header>
              <pre className="messages-detail-body">{renderMessageBody(selectedItem.body)}</pre>
              {selectedItem.attachments.length > 0 ? (
                <div className="messages-attachments-view">
                  <h4 className="messages-attachments-view-title">Attachments</h4>
                  {attachmentsLoading ? (
                    <p className="placeholder-copy">Loading attachments…</p>
                  ) : (
                    <div className="messages-attachments-grid">
                      {resolvedAttachments.map((attachment) => (
                        <a
                          key={attachment.storage_path}
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="messages-attachment-link"
                        >
                          {isImageAttachment(attachment) ? (
                            <img src={attachment.url} alt={attachment.file_name} loading="lazy" />
                          ) : (
                            <div className="messages-attachment-pdf">
                              <span>PDF</span>
                              <span className="messages-attachment-pdf-name">{attachment.file_name}</span>
                            </div>
                          )}
                          <span className="messages-attachment-link-name">{attachment.file_name}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </article>
          ) : (
            <div className="messages-empty-state">
              <p>Select a message or start a new one.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
