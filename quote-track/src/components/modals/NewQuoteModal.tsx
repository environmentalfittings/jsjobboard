import { useState } from 'react'
import type { Priority } from '../../types'
import { makeAttachment } from '../../utils/files'
import { createEmptyQuote } from '../../utils/quoteFactory'
import type { Quote } from '../../types'

interface NewQuoteModalProps {
  open: boolean
  onClose: () => void
  onSave: (q: Quote) => void
}

export function NewQuoteModal({ open, onClose, onSave }: NewQuoteModalProps) {
  const [customerName, setCustomerName] = useState('')
  const [description, setDescription] = useState('')
  const [quoteNumber, setQuoteNumber] = useState('')
  const [priority, setPriority] = useState<Priority>('standard')
  const [error, setError] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!customerName.trim() || !quoteNumber.trim()) {
      setError('Customer name and quote # are required.')
      return
    }
    const q = createEmptyQuote({
      quoteNumber,
      customerName,
      description,
      priority,
    })
    const atts = []
    for (const f of pendingFiles) {
      try {
        atts.push(
          await makeAttachment({
            parentId: q.id,
            parentType: 'quote',
            file: f,
            tag: 'other',
          }),
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
        return
      }
    }
    onSave({ ...q, attachments: atts })
    setCustomerName('')
    setDescription('')
    setQuoteNumber('')
    setPriority('standard')
    setPendingFiles([])
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-qt-border bg-qt-panel p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-qt-text">New quote</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block text-sm text-qt-muted">
            Customer name *
            <input
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm text-qt-muted">
            Quote # *
            <input
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 font-mono text-qt-text"
              value={quoteNumber}
              onChange={(e) => setQuoteNumber(e.target.value)}
              placeholder="Q#1047"
              required
            />
          </label>
          <label className="block text-sm text-qt-muted">
            Description
            <textarea
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="block text-sm text-qt-muted">
            Priority
            <select
              className="mt-1 w-full rounded border border-qt-border bg-qt-bg px-3 py-2 text-qt-text"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              <option value="rush">Rush (12h)</option>
              <option value="standard">Standard (24h)</option>
              <option value="low">Low (48h)</option>
            </select>
          </label>
          <label className="block cursor-pointer text-sm text-qt-muted">
            Attachments
            <input
              type="file"
              multiple
              className="mt-1 block w-full text-sm"
              onChange={(e) => setPendingFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="rounded-lg border border-qt-border px-4 py-2 text-sm"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-qt-accent px-4 py-2 text-sm font-semibold text-white"
            >
              Create quote
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
