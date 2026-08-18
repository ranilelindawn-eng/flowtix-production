type JsonLdValue = Record<string, unknown> | Array<Record<string, unknown>>

function serializeJsonLd(data: JsonLdValue) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export default function JsonLd({ data }: { data: JsonLdValue }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
