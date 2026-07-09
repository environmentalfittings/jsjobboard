export const TEST_MEDIA_OTHER = '__other__'

export type TestMediaFields = {
  testMedia: string
  testMediaOther: string
}

export function emptyTestMediaFields(): TestMediaFields {
  return { testMedia: '', testMediaOther: '' }
}

export function resolveTestMedia(fields: TestMediaFields): string {
  if (fields.testMedia === TEST_MEDIA_OTHER) return fields.testMediaOther.trim()
  return fields.testMedia.trim()
}

/** Map a job-board or legacy value onto dropdown + optional Other text. */
export function applyTestMediaPrefill(value: string | null | undefined, options: string[]): TestMediaFields {
  const v = (value ?? '').trim()
  if (!v) return emptyTestMediaFields()

  const match = options.find((o) => o.toLowerCase() === v.toLowerCase())
  if (match) return { testMedia: match, testMediaOther: '' }

  return { testMedia: TEST_MEDIA_OTHER, testMediaOther: v }
}

export function parseTestMediaFields(raw: Record<string, unknown> | undefined): TestMediaFields {
  if (!raw) return emptyTestMediaFields()
  return {
    testMedia: typeof raw.testMedia === 'string' ? raw.testMedia : '',
    testMediaOther: typeof raw.testMediaOther === 'string' ? raw.testMediaOther : '',
  }
}
