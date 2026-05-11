interface AcceptanceCriteriaProps {
  text: string
}

export function AcceptanceCriteria({ text }: AcceptanceCriteriaProps) {
  const lines = text.split("\n")
  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trimStart()
        const indent = line.length - trimmed.length
        const pad = indent > 0 ? `${indent * 2}px` : undefined

        if (trimmed === "") {
          return (
            <div
              key={i}
              className="acceptance-line acceptance-line--blank"
            />
          )
        }

        if (/^\s*-?\s*\[x\]/i.test(line)) {
          const label = trimmed.replace(/^-?\s*\[[xX]\]\s*/, "")
          return (
            <div
              key={i}
              className="acceptance-line acceptance-line--checked"
              style={{ paddingLeft: pad }}
            >
              <span className="check-mark">☑</span>
              <span>{label}</span>
            </div>
          )
        }

        if (/^\s*-?\s*\[ \]/.test(line)) {
          const label = trimmed.replace(/^-?\s*\[ \]\s*/, "")
          return (
            <div
              key={i}
              className="acceptance-line acceptance-line--unchecked"
              style={{ paddingLeft: pad }}
            >
              <span className="check-mark">☐</span>
              <span>{label}</span>
            </div>
          )
        }

        if (/^#{1,3}\s/.test(trimmed) || /^[A-Z][A-Z\s]+:$/.test(trimmed)) {
          return (
            <div
              key={i}
              className="acceptance-line acceptance-line--heading"
              style={{ paddingLeft: pad }}
            >
              {trimmed.replace(/^#+\s/, "")}
            </div>
          )
        }

        return (
          <div
            key={i}
            className="acceptance-line"
            style={{ paddingLeft: pad }}
          >
            <span>{trimmed}</span>
          </div>
        )
      })}
    </>
  )
}
