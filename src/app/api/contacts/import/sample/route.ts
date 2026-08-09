import { getCurrentOrganization } from '@/lib/team'

const SAMPLE_HEADERS = [
  'First Name',
  'Last Name',
  'Preferred Name',
  'Email',
  'Phone Country Code',
  'Phone',
  'Mobile Country Code',
  'Mobile',
  'Company',
  'Job Title',
  'Status',
  'Lifecycle Stage',
  'Source',
  'Lead Score',
  'Timezone',
  'Locale',
  'Do Not Email',
  'Do Not SMS',
  'Do Not Call',
  'Next Follow Up At',
  'Tags',
  'Notes',
  'Assigned Team Member Email',
]

function isOwnerOrAdmin(
  role: string,
): boolean {
  return role === 'owner' || role === 'admin'
}

export async function GET() {
  const organization =
    await getCurrentOrganization()

  if (
    !organization ||
    !isOwnerOrAdmin(organization.role)
  ) {
    return new Response(
      'Only organization owners and admins can download the contact import template.',
      {
        status: 403,
        headers: {
          'Content-Type':
            'text/plain; charset=utf-8',
          'Cache-Control':
            'no-store',
        },
      },
    )
  }

  const exampleRow = [
    'Sample',
    'Contact',
    '',
    'sample.contact@example.com',
    '+63',
    '9171234567',
    '+63',
    '9171234567',
    'Example Company',
    'Sales Representative',
    'active',
    'lead',
    'csv',
    '0',
    'Asia/Manila',
    'en-PH',
    'false',
    'false',
    'false',
    '',
    'sample',
    'Replace this sample row with a real contact.',
    'team.member@example.com',
  ]

  const escapeCsvCell = (value: string) => {
    if (
      value.includes(',') ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r')
    ) {
      return `"${value.replace(/"/g, '""')}"`
    }

    return value
  }

  const csv = [
    SAMPLE_HEADERS.map(escapeCsvCell).join(','),
    exampleRow.map(escapeCsvCell).join(','),
  ].join('\r\n') + '\r\n'

  return new Response(
    `\uFEFF${csv}`,
    {
      status: 200,
      headers: {
        'Content-Type':
          'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="flowtix-contact-import-template.csv"',
        'Cache-Control':
          'private, no-store, max-age=0',
      },
    },
  )
}
