import { TEST_MEDIA_OTHER } from '../../lib/testLogMedia'
import type { TestMediaFields } from '../../lib/testLogMedia'

type TestMediaSelectProps = {
  id: string
  options: string[]
  value: TestMediaFields
  onChange: (next: TestMediaFields) => void
}

export function TestMediaSelect({ id, options, value, onChange }: TestMediaSelectProps) {
  return (
    <div className="test-media-select">
      <label htmlFor={`${id}-media`}>
        Test Media
        <select
          id={`${id}-media`}
          value={value.testMedia}
          onChange={(e) => {
            const testMedia = e.target.value
            onChange({
              testMedia,
              testMediaOther: testMedia === TEST_MEDIA_OTHER ? value.testMediaOther : '',
            })
          }}
        >
          <option value="">Select…</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={TEST_MEDIA_OTHER}>Other…</option>
        </select>
      </label>
      {value.testMedia === TEST_MEDIA_OTHER ? (
        <label htmlFor={`${id}-media-other`}>
          Other test media
          <input
            id={`${id}-media-other`}
            type="text"
            value={value.testMediaOther}
            onChange={(e) => onChange({ ...value, testMediaOther: e.target.value })}
            placeholder="Describe test media"
          />
        </label>
      ) : null}
    </div>
  )
}
