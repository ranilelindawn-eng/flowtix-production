export type GuideStep = {
  title: string
  instructions: string[]
  tip?: string
}

export type GuideArticle = {
  slug: string
  title: string
  summary: string
  category: string
  moduleHref?: string
  moduleLabel?: string
  pathnamePrefixes?: string[]
  prerequisites?: string[]
  steps: GuideStep[]
  successChecks?: string[]
  troubleshooting?: string[]
  related?: string[]
}

export const guideCategories = [
  'Getting Started',
  'CRM',
  'Sales & Automation',
  'Calling & Telephony',
  'Analytics',
  'AI',
  'Organization & Team',
  'Billing & Security',
  'Troubleshooting',
] as const

export const guideArticles: GuideArticle[] = [
  {
    slug: 'getting-started', title: 'Getting started with Flowtix', category: 'Getting Started',
    summary: 'Set up your workspace, confirm access, add your first customer record, and learn the safest order for configuring Flowtix.',
    moduleHref: '/dashboard', moduleLabel: 'Open Dashboard', pathnamePrefixes: ['/dashboard'],
    steps: [
      { title: 'Confirm your workspace', instructions: ['Open Dashboard and confirm the organization name at the top-left is the workspace you intend to use.', 'Open Organization and verify the company name and tenant details before entering customer data.'] },
      { title: 'Set up your team', instructions: ['Open Team and invite the users who need access.', 'Use Roles & Permissions to make sure each person has only the permissions they need.'], tip: 'Do not give administrator-level access to every team member.' },
      { title: 'Add your first CRM data', instructions: ['Create a Company if the contact belongs to a business.', 'Create a Contact and add the phone, email, company, owner, and relevant tags.', 'Use Activities or Timeline to confirm the record is appearing in the workspace history.'] },
      { title: 'Configure optional systems', instructions: ['Configure Email & SMS, telephony, AI, and automation only after the CRM basics are working.', 'Use the Guide for each module before enabling it for your team.'] },
    ],
    successChecks: ['You are in the correct organization.', 'Your team members have appropriate roles.', 'A contact can be created and found again.', 'The contact appears in CRM activity/timeline views.'],
    related: ['organization', 'team', 'contacts', 'roles-permissions']
  },
  {
    slug: 'dashboard', title: 'Dashboard', category: 'Getting Started', summary: 'Use the main dashboard to review workspace activity and navigate to the modules that need attention.',
    moduleHref: '/dashboard', moduleLabel: 'Open Dashboard', pathnamePrefixes: ['/dashboard'],
    steps: [
      { title: 'Review the workspace context', instructions: ['Confirm the organization name and signed-in user are correct.', 'Use the global search bar to locate calls, contacts, or campaigns when available.'] },
      { title: 'Use dashboard metrics as a starting point', instructions: ['Review the visible KPI and activity cards.', 'Open the source module before making a decision from a metric—for example, open Contacts for contact details or Calls for call records.'] },
      { title: 'Navigate by workflow', instructions: ['Use CRM modules for customer records.', 'Use Campaigns/Sequences for outreach.', 'Use Analytics modules for performance review.', 'Use Settings for configuration changes.'] },
    ], successChecks: ['The dashboard loads without an error.', 'The displayed organization and user are correct.'], related: ['contacts','reports','settings']
  },
  {
    slug: 'contacts', title: 'Contacts', category: 'CRM', summary: 'Create, search, import, update, and manage customer or lead records.', moduleHref: '/dashboard/contacts', moduleLabel: 'Open Contacts', pathnamePrefixes: ['/dashboard/contacts'],
    prerequisites: ['You need Contacts access in your role.'],
    steps: [
      { title: 'Create a contact', instructions: ['Open Contacts and select New contact.', 'Enter the contact name and the most reliable email/phone information.', 'Assign the correct company, owner, lifecycle data, and tags when available.', 'Save the record.'] },
      { title: 'Find and update a contact', instructions: ['Use the search box for name, email, phone, or company.', 'Open the contact record and update only the fields that have changed.', 'Use notes, tasks, calls, and timeline items to keep the complete customer history in one place.'] },
      { title: 'Import contacts', instructions: ['Use Import for a CSV/bulk import.', 'Download or follow the sample format if offered.', 'Map fields carefully and review duplicates before finalizing the import.'], tip: 'Normalize phone numbers into international E.164 format when the number will be used by calling/SMS features.' },
    ], successChecks: ['The contact appears in search.', 'Owner/company/tag data persist after refresh.', 'Activity appears on the contact timeline when actions are taken.'], troubleshooting: ['If a contact disappears, confirm you are in the correct organization and do not have filters hiding it.', 'If an import fails, validate required columns and duplicate data.'], related: ['companies','tags','timeline','activities']
  },
  {
    slug: 'companies', title: 'Companies', category: 'CRM', summary: 'Organize contacts under business accounts and maintain company-level context.', moduleHref: '/dashboard/companies', moduleLabel: 'Open Companies', pathnamePrefixes: ['/dashboard/companies'],
    steps: [
      { title: 'Create a company', instructions: ['Open Companies and choose New company.', 'Enter the business name and available company details.', 'Save the company before assigning contacts to it.'] },
      { title: 'Associate contacts', instructions: ['Open or edit a contact.', 'Select the matching company.', 'Return to the company record and confirm related contacts are visible.'] },
      { title: 'Keep account history useful', instructions: ['Use company details for account-level information.', 'Keep person-specific notes and activities on the contact record unless they apply to the entire company.'] },
    ], successChecks: ['The company can be searched and opened.', 'Associated contacts appear under the correct company.'], related: ['contacts','pipelines','timeline']
  },
  {
    slug: 'pipelines', title: 'Pipelines', category: 'CRM', summary: 'Build revenue pipelines and track opportunities through defined sales stages.', moduleHref: '/dashboard/pipelines', moduleLabel: 'Open Pipelines', pathnamePrefixes: ['/dashboard/pipelines'],
    steps: [
      { title: 'Create a pipeline', instructions: ['Enter a pipeline name and optional description.', 'Set the currency code used for opportunity values.', 'Create the pipeline.'] },
      { title: 'Configure stages', instructions: ['Open the pipeline and review its stages.', 'Name stages so they represent real steps in your sales process.', 'Keep stage ordering consistent with the way opportunities actually progress.'] },
      { title: 'Manage opportunities', instructions: ['Create or open an opportunity in the pipeline.', 'Set the owner, value, probability, and stage.', 'Update the stage whenever the deal meaningfully progresses.'] },
    ], successChecks: ['Pipeline settings persist after refresh.', 'Opportunities appear in the expected stage.', 'Sales Analytics reflects pipeline data after activity exists.'], related: ['sales-analytics','companies','contacts']
  },
  {
    slug: 'activities', title: 'Activities', category: 'CRM', summary: 'Review CRM actions in one filtered activity view.', moduleHref: '/dashboard/activities', moduleLabel: 'Open Activities', pathnamePrefixes: ['/dashboard/activities'],
    steps: [
      { title: 'Search activity', instructions: ['Use Search activities to locate relevant records.', 'Apply available type/date filters to reduce the result set.'] },
      { title: 'Trace activity back to the source', instructions: ['Open the related contact, company, call, task, or campaign when you need full context.', 'Use Timeline when you need a chronological cross-module history.'] },
    ], successChecks: ['New CRM actions appear after they are performed.', 'Filters return the expected subset.'], related: ['timeline','contacts','tasks']
  },
  {
    slug: 'timeline', title: 'Timeline', category: 'CRM', summary: 'Use the unified timeline to reconstruct what happened across a customer relationship.', moduleHref: '/dashboard/timeline', moduleLabel: 'Open Timeline', pathnamePrefixes: ['/dashboard/timeline'],
    steps: [
      { title: 'Search the timeline', instructions: ['Enter a search term and apply the available filters.', 'Review events in chronological order.'] },
      { title: 'Use it for investigation', instructions: ['When a customer asks what happened, trace notes, tasks, calls, messages, and changes here.', 'Open the source record when you need to edit or correct the underlying item.'] },
    ], successChecks: ['Recent CRM events appear.', 'Search/filter changes the returned timeline items.'], related: ['activities','contacts','calls']
  },
  {
    slug: 'calendar', title: 'Calendar', category: 'Sales & Automation', summary: 'Schedule and review CRM events while checking for conflicts.', moduleHref: '/dashboard/calendar', moduleLabel: 'Open Calendar', pathnamePrefixes: ['/dashboard/calendar'],
    steps: [
      { title: 'Review scheduled work', instructions: ['Open Calendar and select the relevant date range.', 'Check existing events before adding new meetings or follow-ups.'] },
      { title: 'Create a calendar item', instructions: ['Add the event title, date/time, owner/attendees, and related CRM record when supported.', 'Save and confirm it appears at the correct time.'] },
      { title: 'Avoid conflicts', instructions: ['Use Flowtix conflict checks when available.', 'Confirm timezone settings in Organization/Settings if event times look incorrect.'] },
    ], successChecks: ['New events persist after refresh.', 'Event times match the organization timezone.'], related: ['tasks','settings','contacts']
  },
  {
    slug: 'email-sms', title: 'Email & SMS', category: 'Sales & Automation', summary: 'Send and review customer communications using configured providers and templates.', moduleHref: '/dashboard/communications', moduleLabel: 'Open Email & SMS', pathnamePrefixes: ['/dashboard/communications'],
    prerequisites: ['A supported communication provider/integration must be configured before live sending.'],
    steps: [
      { title: 'Confirm the recipient', instructions: ['Open the related contact and verify the email address or phone number.', 'For SMS, use a valid international-format number and confirm the recipient may legally receive messages.'] },
      { title: 'Prepare the message', instructions: ['Use a Template for repeatable messages or a Snippet for reusable text.', 'Review merge fields before sending.'] },
      { title: 'Send and verify', instructions: ['Send the message.', 'Return to Email & SMS or the related contact timeline to confirm the resulting activity/status.'] },
    ], successChecks: ['The provider accepts the send request.', 'The communication is recorded in Flowtix.', 'Failures show a meaningful status rather than silently disappearing.'], troubleshooting: ['If sending fails, check Settings → Integrations and provider credentials first.', 'Check recipient format and provider restrictions before changing Flowtix code.'], related: ['templates','snippets','contacts','settings']
  },
  {
    slug: 'templates', title: 'Templates', category: 'Sales & Automation', summary: 'Create reusable email/SMS content with merge fields.', moduleHref: '/dashboard/templates', moduleLabel: 'Open Templates', pathnamePrefixes: ['/dashboard/templates'],
    steps: [
      { title: 'Create a template', instructions: ['Choose the appropriate message type.', 'Enter a clear template name.', 'For email, add a subject.', 'Write the body and use supported merge fields such as {{first_name}} and {{company}} when appropriate.'] },
      { title: 'Test before broad use', instructions: ['Use the template in a single controlled message first.', 'Confirm merge fields render correctly before using it in a campaign or sequence.'] },
    ], successChecks: ['Template persists after refresh.', 'Merge fields render with real contact data during a test.'], related: ['email-sms','sequences','campaigns','snippets']
  },
  {
    slug: 'snippets', title: 'Snippets', category: 'Sales & Automation', summary: 'Store reusable short text and shortcuts for faster communication.', moduleHref: '/dashboard/snippets', moduleLabel: 'Open Snippets', pathnamePrefixes: ['/dashboard/snippets'],
    steps: [
      { title: 'Create a snippet', instructions: ['Enter a descriptive snippet name.', 'Choose a memorable shortcut such as /intro.', 'Add the reusable text and save.'] },
      { title: 'Use snippets consistently', instructions: ['Keep short reusable phrases in Snippets.', 'Use Templates for complete messages with subject/body structure.'] },
    ], successChecks: ['The snippet is listed after saving.', 'Its shortcut/content remain unchanged after refresh.'], related: ['templates','email-sms']
  },
  {
    slug: 'tags', title: 'Tags', category: 'CRM', summary: 'Create labels that make contacts and CRM records easier to segment.', moduleHref: '/dashboard/tags', moduleLabel: 'Open Tags', pathnamePrefixes: ['/dashboard/tags'],
    steps: [
      { title: 'Create a tag', instructions: ['Enter a tag name.', 'Optionally define a slug, description, and color.', 'Create the tag.'] },
      { title: 'Assign and maintain tags', instructions: ['Assign tags to appropriate CRM records.', 'Deactivate a tag when it should no longer be used instead of creating near-duplicate labels.'] },
    ], successChecks: ['Tag persists after refresh.', 'Assignments remain visible on the related record.'], related: ['contacts','campaigns']
  },
  {
    slug: 'files', title: 'Files & attachments', category: 'CRM', summary: 'Upload, find, and manage tenant-scoped CRM attachments.', moduleHref: '/dashboard/files', moduleLabel: 'Open Files', pathnamePrefixes: ['/dashboard/files'],
    steps: [
      { title: 'Upload a file', instructions: ['Choose the file and add a useful description when needed.', 'Upload it and wait for completion.', 'Confirm it appears in the file list.'] },
      { title: 'Find files later', instructions: ['Search by file name.', 'Apply available filters to narrow the result.', 'Open/download only files your role is permitted to access.'] },
    ], successChecks: ['Uploaded file appears in the organization file list.', 'Search can find the file.'], related: ['contacts','security-center']
  },
  {
    slug: 'campaigns', title: 'Campaigns', category: 'Sales & Automation', summary: 'Build organized outreach campaigns and manage their members.', moduleHref: '/dashboard/campaigns', moduleLabel: 'Open Campaigns', pathnamePrefixes: ['/dashboard/campaigns'],
    steps: [
      { title: 'Create the campaign', instructions: ['Open Campaigns and select New campaign.', 'Give it a clear name and description so the team understands its purpose.', 'Save the campaign.'] },
      { title: 'Add members', instructions: ['Open the campaign Members area.', 'Add the intended contacts and verify segmentation before launching any outreach.'] },
      { title: 'Monitor results', instructions: ['Use Campaign Analytics for performance.', 'Pause or correct the campaign if recipients, content, or targeting are wrong.'] },
    ], successChecks: ['Campaign persists after refresh.', 'Members are assigned correctly.', 'Campaign Analytics begins reflecting activity after execution.'], related: ['sequences','campaign-analytics','contacts','templates']
  },
  {
    slug: 'sequences', title: 'Sequences', category: 'Sales & Automation', summary: 'Automate multi-step outreach with controlled timing and enrollment.', moduleHref: '/dashboard/sequences', moduleLabel: 'Open Sequences', pathnamePrefixes: ['/dashboard/sequences'],
    prerequisites: ['Your plan/organization must have the Sequences entitlement.', 'Campaign access is required.'],
    steps: [
      { title: 'Create the sequence', instructions: ['Open Sequences and create a new sequence.', 'Add steps in the exact order contacts should receive them.', 'Configure delays so messages are not sent too close together.'] },
      { title: 'Review before enrollment', instructions: ['Check every message/template and merge field.', 'Confirm provider integrations are ready.', 'Confirm the enrollment list is correct.'] },
      { title: 'Enroll and operate', instructions: ['Enroll a small controlled test group first.', 'Monitor step execution.', 'Use Pause when you need to stop future steps temporarily and Cancel when an enrollment should end.'] },
    ], successChecks: ['Sequence steps persist.', 'Test enrollment advances according to configured timing.', 'Pause/cancel actions persist after refresh.'], troubleshooting: ['If a step does not send, inspect the related provider/integration and job status before recreating the sequence.'], related: ['campaigns','templates','background-jobs','email-sms']
  },
  {
    slug: 'calls', title: 'Calls', category: 'Calling & Telephony', summary: 'Review call records and their lifecycle data.', moduleHref: '/dashboard/calls', moduleLabel: 'Open Calls', pathnamePrefixes: ['/dashboard/calls'],
    steps: [
      { title: 'Find a call', instructions: ['Open Calls and use available search/filters.', 'Open a call record to inspect direction, participants, status, ownership, and related artifacts.'] },
      { title: 'Use related call artifacts', instructions: ['Open Recordings when a recording exists.', 'Open Transcripts when a transcript exists.', 'Use Call Analytics for aggregate performance rather than editing individual calls.'] },
    ], successChecks: ['Provider call events create/update the matching Flowtix call record.', 'Completed calls show a terminal status.'], related: ['dialer','live-calls','recordings','transcripts','call-analytics']
  },
  {
    slug: 'dialer', title: 'Dialer', category: 'Calling & Telephony', summary: 'Prepare the browser softphone, select an outbound caller ID, and make controlled calls.', moduleHref: '/dashboard/dialer', moduleLabel: 'Open Dialer', pathnamePrefixes: ['/dashboard/dialer'],
    prerequisites: ['A supported provider must be connected.', 'A voice-capable phone number/caller ID must be configured.', 'Your browser must allow microphone access.'],
    steps: [
      { title: 'Bring the softphone online', instructions: ['Open Dialer and wait for Softphone online.', 'Set your agent availability to Available if you need to receive routed inbound calls.', 'If it does not come online, use Reconnect and inspect the provider integration before dialing.'] },
      { title: 'Choose the caller ID', instructions: ['Select the intended outbound caller ID from the dropdown.', 'Confirm the number belongs to/configured for the selected provider.'] },
      { title: 'Place a controlled call', instructions: ['Enter the destination in E.164 format such as +12025550123.', 'Press the green call button once.', 'Watch the call state and use Live Calls for in-progress visibility.'] },
      { title: 'Finish the call cleanly', instructions: ['Hang up normally.', 'Complete the call outcome/notes if prompted.', 'Confirm the call appears in Calls and any expected recording/transcript workflows.'] },
    ], successChecks: ['Softphone shows online.', 'Provider logs show the attempted call.', 'Flowtix creates/updates the call lifecycle.', 'Completed call is visible in Calls.'], troubleshooting: ['Trial provider accounts may restrict destinations even when Flowtix is connected correctly.', 'If the provider receives only a browser/WebRTC leg, inspect provider PSTN permissions/routing before changing unrelated CRM code.'], related: ['phone-numbers','live-calls','telephony-monitoring','calls']
  },
  {
    slug: 'live-calls', title: 'Live Calls', category: 'Calling & Telephony', summary: 'Monitor active SignalWire calls in one provider-aware view.', moduleHref: '/dashboard/live-calls', moduleLabel: 'Open Live Calls', pathnamePrefixes: ['/dashboard/live-calls'],
    steps: [
      { title: 'Understand the counters', instructions: ['Ringing shows calls that are alerting.', 'Connected shows active conversations.', 'Queued shows callers waiting in a queue.'] },
      { title: 'Use it during live operations', instructions: ['Keep this page open while agents are calling or receiving calls.', 'If it stays empty, confirm a real provider call has reached an active lifecycle state.'] },
    ], successChecks: ['An active call appears while its lifecycle is active.', 'The call disappears/updates after a terminal provider event.'], related: ['dialer','calls','telephony-monitoring']
  },
  {
    slug: 'telephony-monitoring', title: 'Telephony Monitoring', category: 'Calling & Telephony', summary: 'Validate provider readiness, agent presence, queues, alerts, callbacks, and runtime integrity.', moduleHref: '/dashboard/telephony-monitoring', moduleLabel: 'Open Telephony Monitoring', pathnamePrefixes: ['/dashboard/telephony-monitoring'],
    steps: [
      { title: 'Start with acceptance validation', instructions: ['Review the readiness percentage.', 'Open each warning and distinguish configuration warnings from real runtime failures.', 'Do not treat a healthy provider connection as proof that every destination is callable.'] },
      { title: 'Check live operating metrics', instructions: ['Review Active calls, Queue waiting, Available agents, and Open alerts.', 'An agent must normally be Available and have a healthy inbound-capable device heartbeat to count as available.'] },
      { title: 'Investigate warnings safely', instructions: ['Check provider diagnostics first for provider-side errors.', 'Check routing diagnostics for queue/ring-group failures.', 'Use runtime integrity checks before manually deleting database state.'] },
    ], successChecks: ['Provider, credentials, phone number, default caller ID, monitoring collection, and runtime integrity show healthy results.', 'Available agents matches the agents intentionally set to Available.'], related: ['dialer','ring-groups','queues','live-calls']
  },
  {
    slug: 'ring-groups', title: 'Ring Groups', category: 'Calling & Telephony', summary: 'Route inbound calls to one or more agents using configurable ringing strategies.', moduleHref: '/dashboard/ring-groups', moduleLabel: 'Open Ring Groups', pathnamePrefixes: ['/dashboard/ring-groups'],
    steps: [
      { title: 'Create a ring group', instructions: ['Enter a clear group name such as Sales or Support.', 'Choose the ringing strategy.', 'Set ring timeout and maximum targets.', 'Select the agents who should receive calls.', 'Keep Active enabled when the group should accept traffic.'] },
      { title: 'Configure fallback behavior', instructions: ['Choose an overflow group when another ring group should receive unanswered calls.', 'Choose a failover queue when unanswered calls should wait for an agent.', 'Use a failover number only when external routing is intentionally required.'] },
      { title: 'Test persistence', instructions: ['Save the ring group.', 'Refresh and confirm strategy, timeouts, members, Active state, and fallback values remain unchanged.'] },
    ], successChecks: ['Create/update/delete actions persist.', 'Agent membership persists after refresh.', 'Selected failover queue/overflow group remains selected.'], related: ['queues','telephony-monitoring','dialer']
  },
  {
    slug: 'queues', title: 'Queues', category: 'Calling & Telephony', summary: 'Hold inbound callers and distribute them to available agents using queue rules.', moduleHref: '/dashboard/queues', moduleLabel: 'Open Queues', pathnamePrefixes: ['/dashboard/queues'],
    steps: [
      { title: 'Create a queue', instructions: ['Enter the queue name.', 'Choose FIFO or another available ordering strategy.', 'Set max wait, capacity, reservation timeout, target answer time, average handle time, and requeue attempts.', 'Select queue agents and enable Active.'] },
      { title: 'Configure caller experience', instructions: ['Enable queue position announcements when appropriate.', 'Enable estimated wait announcements when useful.', 'Set an overflow queue/number only when you have a tested fallback path.'] },
      { title: 'Validate changes', instructions: ['Save and refresh.', 'Confirm all numeric limits, agents, announcement toggles, ordering, Active state, and overflow settings persist.'] },
    ], successChecks: ['Create/update/delete persist.', 'Queue can be selected as a ring-group failover.', 'Monitoring shows queue activity when callers actually enter it.'], related: ['ring-groups','telephony-monitoring','live-calls']
  },
  {
    slug: 'recordings', title: 'Recordings', category: 'Calling & Telephony', summary: 'Review recorded call media and verify automatic call-capture behavior.', moduleHref: '/dashboard/recordings', moduleLabel: 'Open Recordings', pathnamePrefixes: ['/dashboard/recordings'],
    prerequisites: ['Recording must be legally permitted and enabled for the applicable call/workflow.'],
    steps: [
      { title: 'Find a recording', instructions: ['Use call ID or available filters to locate the recording.', 'Open the recording record and verify it belongs to the expected call.'] },
      { title: 'Review media safely', instructions: ['Play/download media only if your role allows it.', 'Use the related call record for participant and lifecycle context.'] },
    ], successChecks: ['Completed recorded calls create a recording entry.', 'Media is accessible only to authorized users.'], related: ['calls','transcripts','security-center']
  },
  {
    slug: 'transcripts', title: 'Transcripts', category: 'Calling & Telephony', summary: 'Search and review speech-to-text outputs generated from call recordings.', moduleHref: '/dashboard/transcripts', moduleLabel: 'Open Transcripts', pathnamePrefixes: ['/dashboard/transcripts'],
    prerequisites: ['AI transcription entitlement/provider and a usable recording are normally required.'],
    steps: [
      { title: 'Find transcripts', instructions: ['Search content, language, or provider.', 'Filter by exact recording ID when tracing a specific call.'] },
      { title: 'Review quality', instructions: ['Compare important transcript sections with the source recording when accuracy matters.', 'Do not treat transcription as a legally perfect verbatim record.'] },
    ], successChecks: ['Transcript references the expected recording/call.', 'Search can locate text contained in the transcript.'], related: ['recordings','ai-analytics','calls']
  },
  {
    slug: 'dashboards', title: 'Custom Dashboards', category: 'Analytics', summary: 'Use saved reporting dashboards to group metrics relevant to a team or workflow.', moduleHref: '/dashboard/dashboards', moduleLabel: 'Open Dashboards', pathnamePrefixes: ['/dashboard/dashboards'],
    steps: [
      { title: 'Open the right dashboard', instructions: ['Choose the dashboard whose scope matches the question you are answering.', 'Check the date range and organization context.'] },
      { title: 'Interpret metrics carefully', instructions: ['Open source analytics modules when a number looks unexpected.', 'Compare KPI, Sales, Call, Agent, Campaign, or AI Analytics depending on the metric.'] },
    ], successChecks: ['Saved dashboards load consistently.', 'Metrics agree with their source analytics for the same period.'], related: ['reports','kpi-engine','sales-analytics']
  },
  {
    slug: 'exports', title: 'Data Exports', category: 'Analytics', summary: 'Create secure tenant-scoped data files, review export history, and automate recurring exports.', moduleHref: '/dashboard/exports', moduleLabel: 'Open Data Exports', pathnamePrefixes: ['/dashboard/exports'],
    prerequisites: ['You must be the workspace owner and the plan must allow reports.export.', 'Choose CSV or Excel when you need full data analysis; use PDF for compact review copies.'],
    steps: [
      { title: 'Create a one-time export', instructions: ['Open Data Exports and choose the data source you need.', 'Choose CSV, Excel (.xls), or PDF.', 'Select Create export. Flowtix queues the work as a durable background job instead of blocking the page.', 'Watch Export history until the status changes to Completed, then select Download.'] },
      { title: 'Verify the output', instructions: ['Confirm the row count is reasonable for the selected organization.', 'Open the downloaded file and check a few records against the source module.', 'If an export fails, read the error shown in Export history before retrying.'] },
      { title: 'Create a recurring schedule', instructions: ['Enter a clear schedule name such as Weekly sales export.', 'Select the data source, format, cadence, and first-run date/time.', 'Confirm the organization timezone shown beside First run.', 'Create the schedule, then use Pause or Resume when the recurring export should temporarily stop or restart.'] },
      { title: 'Keep exports controlled', instructions: ['Download links are short-lived and files are stored privately under the workspace owner account.', 'Delete completed or failed exports that are no longer needed.', 'Team members cannot open, download, schedule, or delete Data Exports; Flowtix enforces owner access at the UI, application, database, and storage layers.'] },
    ], successChecks: ['The job reaches Completed and the signed download opens.', 'The exported row count and sample records match the selected workspace.', 'A scheduled export shows the intended cadence, timezone, next run, and Active status.'], troubleshooting: ['If Tasks or Activities fail, confirm the latest Data Exports migration is applied; Flowtix maps those logical names to contact_tasks and crm_activities.', 'If the job stays Queued, check Background Jobs and the reports queue worker.', 'If Download fails, confirm the export is still within its retention window and the private exports storage bucket is healthy.'], related: ['reports','background-jobs','sales-analytics','call-analytics']
  },
  {
    slug: 'reports', title: 'Reports', category: 'Analytics', summary: 'Use consolidated reporting views to understand CRM and operational performance.', moduleHref: '/dashboard/reports', moduleLabel: 'Open Reports', pathnamePrefixes: ['/dashboard/reports'],
    steps: [
      { title: 'Select a reporting question', instructions: ['Decide whether you need sales, calls, agents, campaigns, AI, or KPI reporting.', 'Use the specialized analytics page when deeper breakdowns are needed.'] },
      { title: 'Match date ranges', instructions: ['Compare metrics only when they use the same period and organization scope.', 'Export data when you need an external audit trail or deeper offline analysis.'] },
    ], successChecks: ['Metrics load for the selected workspace.', 'Specialized analytics agree with report totals for equivalent filters.'], related: ['sales-analytics','call-analytics','agent-analytics','campaign-analytics','ai-analytics']
  },
  {
    slug: 'kpi-engine', title: 'KPI Engine', category: 'Analytics', summary: 'Review standardized KPI snapshots and drill into the supporting measurements.', moduleHref: '/dashboard/kpis', moduleLabel: 'Open KPI Engine', pathnamePrefixes: ['/dashboard/kpis'],
    steps: [
      { title: 'Review the KPI snapshot', instructions: ['Read each KPI label and value.', 'Use Snapshot details to understand what the metric represents.'] },
      { title: 'Investigate changes', instructions: ['Compare against the relevant sales/call/campaign source analytics.', 'Do not adjust operational settings solely from one KPI without reviewing underlying records.'] },
    ], successChecks: ['KPI snapshot is current for the selected period.', 'Values are explainable from underlying source data.'], related: ['reports','sales-analytics','call-analytics']
  },
  {
    slug: 'sales-analytics', title: 'Sales Analytics', category: 'Analytics', summary: 'Analyze pipeline stages, owners, forecasts, and lead-source performance.', moduleHref: '/dashboard/sales-analytics', moduleLabel: 'Open Sales Analytics', pathnamePrefixes: ['/dashboard/sales-analytics'],
    steps: [
      { title: 'Review pipeline performance', instructions: ['Compare stage counts/value and conversion behavior.', 'Open Pipelines when a stage configuration appears wrong.'] },
      { title: 'Review owner and forecast performance', instructions: ['Compare owner performance using the same period.', 'Use forecast composition to understand expected revenue rather than treating it as guaranteed revenue.'] },
      { title: 'Review lead sources', instructions: ['Compare source performance.', 'Trace surprising results back to contacts/opportunities before changing campaign strategy.'] },
    ], successChecks: ['Analytics changes after pipeline/opportunity activity exists.', 'Period changes alter the expected data set.'], related: ['pipelines','reports','campaign-analytics']
  },
  {
    slug: 'call-analytics', title: 'Call Analytics', category: 'Analytics', summary: 'Analyze provider, direction, agent, queue, and routing performance for calls.', moduleHref: '/dashboard/call-analytics', moduleLabel: 'Open Call Analytics', pathnamePrefixes: ['/dashboard/call-analytics'],
    steps: [
      { title: 'Review call outcomes', instructions: ['Check total calls, answer rates, durations, and direction mix.', 'Compare provider performance when multiple providers are active.'] },
      { title: 'Diagnose operations', instructions: ['Review agent performance, queue outcomes, and routing strategies.', 'Use Telephony Monitoring for live operational problems and Call Analytics for historical patterns.'] },
    ], successChecks: ['Completed call records affect analytics.', 'Provider/queue breakdowns correspond to actual call data.'], related: ['calls','telephony-monitoring','agent-analytics']
  },
  {
    slug: 'agent-analytics', title: 'Agent Analytics', category: 'Analytics', summary: 'Compare workforce performance using call and activity metrics.', moduleHref: '/dashboard/agent-analytics', moduleLabel: 'Open Agent Analytics', pathnamePrefixes: ['/dashboard/agent-analytics'],
    steps: [
      { title: 'Review the leaderboard', instructions: ['Compare agents over the same time period.', 'Use multiple metrics rather than ranking people by a single number.'] },
      { title: 'Validate unusual results', instructions: ['Check agent availability, assigned calls, and source records when a metric looks wrong.', 'Use Time & Attendance only for attendance questions, not as a substitute for sales/call performance.'] },
    ], successChecks: ['Agent activity changes are reflected in the selected period.', 'Metrics can be traced to source calls/activities.'], related: ['call-analytics','attendance','team']
  },
  {
    slug: 'campaign-analytics', title: 'Campaign Analytics', category: 'Analytics', summary: 'Measure campaign conversion, channel performance, and per-campaign outcomes.', moduleHref: '/dashboard/campaign-analytics', moduleLabel: 'Open Campaign Analytics', pathnamePrefixes: ['/dashboard/campaign-analytics'],
    steps: [
      { title: 'Review the funnel', instructions: ['Check each conversion stage and identify where recipients are dropping off.', 'Compare channel performance using the same period.'] },
      { title: 'Drill into campaigns', instructions: ['Review campaign-level performance.', 'Open Campaigns to inspect targeting, members, and content before changing the strategy.'] },
    ], successChecks: ['Campaign activity produces analytics.', 'Totals align with the campaigns included in the selected period.'], related: ['campaigns','sequences','sales-analytics']
  },
  {
    slug: 'ai-analytics', title: 'AI Analytics', category: 'AI', summary: 'Monitor AI usage, success, tokens, latency, models, prompts, providers, and feature adoption.', moduleHref: '/dashboard/ai-analytics', moduleLabel: 'Open AI Analytics', pathnamePrefixes: ['/dashboard/ai-analytics'],
    steps: [
      { title: 'Choose the period', instructions: ['Select 7 days, 30 days, 90 days, or 1 year.', 'Use a shorter range when validating a new test request.'] },
      { title: 'Read the headline metrics', instructions: ['AI requests counts tracked executions.', 'Success rate compares completed vs failed tracked requests.', 'Total tokens combines input/output usage.', 'AI cost is only meaningful when cost attribution is configured for the provider/model.'] },
      { title: 'Drill into dimensions', instructions: ['Feature adoption shows which AI features are used.', 'Model performance compares models.', 'Prompt performance identifies prompt families.', 'Provider performance identifies the actual AI provider.'] },
    ], successChecks: ['A fresh AI Workspace request increases tracked activity.', 'Provider/model/prompt dimensions match the successful request.'], related: ['ai-workspace','ai-insights']
  },
  {
    slug: 'ai-workspace', title: 'AI Workspace', category: 'AI', summary: 'Use the tenant-isolated assistant for drafting, analysis, and CRM-related work.', moduleHref: '/dashboard/ai', moduleLabel: 'Open AI Workspace', pathnamePrefixes: ['/dashboard/ai'],
    prerequisites: ['Your organization must have AI Chat access and a configured provider.'],
    steps: [
      { title: 'Start a new chat', instructions: ['Select New chat.', 'Choose the assistant mode if multiple modes are available.', 'Write a specific request with the context the assistant needs.'] },
      { title: 'Review the response', instructions: ['Check names, dates, amounts, commitments, and customer-specific claims before using generated text externally.', 'Ask a follow-up in the same conversation when more context is needed.'] },
      { title: 'Confirm analytics', instructions: ['After a successful response, open AI Analytics.', 'Use a 7-day period and confirm the request/provider/model/token activity is recorded.'] },
    ], successChecks: ['Assistant returns a response.', 'Conversation persists in Recent Chats.', 'AI Analytics records the successful request.'], related: ['ai-analytics','ai-insights']
  },
  {
    slug: 'ai-insights', title: 'AI Insights', category: 'AI', summary: 'Review generated recommendations and provider-backed insights for the workspace.', moduleHref: '/dashboard/insights', moduleLabel: 'Open AI Insights', pathnamePrefixes: ['/dashboard/insights'],
    steps: [
      { title: 'Review recommendations', instructions: ['Search recommendations or providers.', 'Open an insight to read the full recommendation and supporting context.'] },
      { title: 'Act carefully', instructions: ['Validate the source CRM/call data before making material business changes.', 'Treat AI insights as decision support rather than automatic truth.'] },
    ], successChecks: ['Insights can be searched and opened.', 'The insight references the expected organization/provider/context.'], related: ['ai-workspace','ai-analytics','reports']
  },
  {
    slug: 'organization', title: 'Organization', category: 'Organization & Team', summary: 'Review workspace identity, tenant isolation, and organization-level information.', moduleHref: '/dashboard/organization', moduleLabel: 'Open Organization', pathnamePrefixes: ['/dashboard/organization'],
    steps: [
      { title: 'Verify workspace identity', instructions: ['Confirm the organization name and details are correct.', 'Review tenant isolation information so administrators understand data is organization-scoped.'] },
      { title: 'Use Settings for configuration changes', instructions: ['Open Settings → Organization when you need to change organization configuration.', 'After a change, refresh the dashboard and confirm the new organization information is displayed.'] },
    ], successChecks: ['Organization details match the intended tenant.', 'Changes remain tenant-scoped.'], related: ['settings','team','roles-permissions']
  },
  {
    slug: 'team', title: 'Team', category: 'Organization & Team', summary: 'Manage workspace members and their organizational access.', moduleHref: '/dashboard/team', moduleLabel: 'Open Team', pathnamePrefixes: ['/dashboard/team'],
    steps: [
      { title: 'Review members', instructions: ['Confirm each team member belongs in the workspace.', 'Check roles before enabling sensitive modules.'] },
      { title: 'Invite or manage access', instructions: ['Use the available invite/member controls.', 'Assign the least-privileged role that still lets the user do their job.', 'Remove or disable access promptly when a user should no longer enter the workspace.'] },
    ], successChecks: ['Membership changes persist.', 'User permissions match their assigned role.'], related: ['roles-permissions','attendance','security-center']
  },
  {
    slug: 'attendance', title: 'Time & Attendance', category: 'Organization & Team', summary: 'Track attendance information visible to the current user and authorized managers.', moduleHref: '/dashboard/attendance', moduleLabel: 'Open Time & Attendance', pathnamePrefixes: ['/dashboard/attendance'],
    steps: [
      { title: 'Review your records', instructions: ['Open Time & Attendance and verify dates/times against the organization timezone.', 'Use manager functionality only when your role allows it.'] },
      { title: 'Correct discrepancies', instructions: ['Confirm timezone/settings first.', 'Follow your organization process for corrections rather than altering unrelated call/activity data.'] },
    ], successChecks: ['Attendance records use the expected timezone.', 'Role restrictions prevent unauthorized access.'], related: ['team','settings','roles-permissions']
  },
  {
    slug: 'roles-permissions', title: 'Roles & Permissions', category: 'Organization & Team', summary: 'Review the permission matrix and control which modules/actions each role can use.', moduleHref: '/dashboard/roles', moduleLabel: 'Open Roles & Permissions', pathnamePrefixes: ['/dashboard/roles'],
    prerequisites: ['You need permission to update team roles.'],
    steps: [
      { title: 'Review before changing', instructions: ['Identify the user’s job responsibilities.', 'Review the permission matrix for the intended role.'] },
      { title: 'Apply least privilege', instructions: ['Grant only the access required for the user’s work.', 'Pay special attention to billing, security, exports, provider settings, and role-management permissions.'] },
      { title: 'Test the result', instructions: ['Have the affected user refresh/sign in again if required.', 'Confirm they can access required modules and cannot access restricted modules.'] },
    ], successChecks: ['Allowed modules are visible.', 'Restricted modules/actions are blocked.'], related: ['team','security-center','billing']
  },
  {
    slug: 'billing', title: 'Billing', category: 'Billing & Security', summary: 'Review the Flowtix subscription, plan changes, invoices, usage, and PayMongo billing lifecycle.', moduleHref: '/dashboard/billing', moduleLabel: 'Open Billing', pathnamePrefixes: ['/dashboard/billing'],
    steps: [
      { title: 'Review subscription status', instructions: ['Confirm the current plan and subscription status.', 'Review included features before changing plans.'] },
      { title: 'Manage the subscription carefully', instructions: ['Use the provided upgrade/downgrade/cancel/reactivate controls.', 'Wait for the billing action to complete before repeating it.', 'Use Invoices and usage billing for historical records.'] },
    ], successChecks: ['Plan/status reflect the completed PayMongo lifecycle.', 'Invoice/usage history loads for authorized users.'], troubleshooting: ['Do not use old Stripe endpoints or Stripe configuration for Flowtix billing.', 'If a payment action fails, inspect PayMongo response/webhook state before retrying repeatedly.'], related: ['settings','security-center']
  },
  {
    slug: 'security-center', title: 'Security Center', category: 'Billing & Security', summary: 'Review sessions, trusted devices, MFA, API policy, secrets, threats, and security monitoring.', moduleHref: '/dashboard/security', moduleLabel: 'Open Security Center', pathnamePrefixes: ['/dashboard/security'],
    prerequisites: ['Settings management permission and the advanced security entitlement are required.'],
    steps: [
      { title: 'Review risk and sessions', instructions: ['Check Risk score, Open threats, Active sessions, and Trusted devices.', 'Revoke sessions that should no longer be active.'] },
      { title: 'Review devices and threats', instructions: ['Trust devices only when you recognize and control them.', 'Resolve/dismiss threat events only after investigating them.'] },
      { title: 'Maintain policies and secrets', instructions: ['Review MFA and API policies.', 'Rotate/revoke secrets through Flowtix controls rather than pasting them into tickets or chat messages.'] },
    ], successChecks: ['Unauthorized sessions can be revoked.', 'Security policy changes persist.', 'Secrets remain protected and are not exposed in the UI.'], related: ['roles-permissions','team','settings']
  },
  {
    slug: 'settings', title: 'Settings', category: 'Billing & Security', summary: 'Configure profile, organization, team, billing, integrations, phone numbers, security, automation, and background jobs.', moduleHref: '/dashboard/settings', moduleLabel: 'Open Settings', pathnamePrefixes: ['/dashboard/settings'],
    steps: [
      { title: 'Choose the correct settings area', instructions: ['Use Profile for your own user settings.', 'Use Organization/Team for workspace configuration.', 'Use Integrations/Phone Numbers for external providers.', 'Use Security for security controls.', 'Use Automation/Background Jobs for workflow processing.'] },
      { title: 'Change one system at a time', instructions: ['Make a single controlled configuration change.', 'Save it and refresh.', 'Test the dependent feature before changing another integration.'], tip: 'This makes it much easier to identify the cause of a production issue.' },
    ], successChecks: ['Saved settings persist after refresh.', 'Dependent modules use the updated configuration.'], related: ['integrations','phone-numbers','background-jobs','security-center']
  },
  {
    slug: 'integrations', title: 'Integrations', category: 'Billing & Security', summary: 'Connect external services and confirm their status before relying on them in workflows.', moduleHref: '/dashboard/settings/integrations', moduleLabel: 'Open Integrations', pathnamePrefixes: ['/dashboard/settings/integrations'],
    steps: [
      { title: 'Connect a provider', instructions: ['Choose the provider you intend to use.', 'Enter only credentials issued by that provider.', 'Save/connect and use any built-in test/status action.'] },
      { title: 'Verify the dependent feature', instructions: ['For email/calendar, test the relevant communication/calendar flow.', 'For telephony, test token/softphone/provider readiness separately.', 'For AI, make one controlled AI Workspace request and verify AI Analytics.'] },
    ], successChecks: ['Integration reports connected/healthy.', 'A real dependent feature succeeds.'], troubleshooting: ['A connected credential test does not guarantee every provider feature/destination is permitted. Check provider account restrictions when necessary.'], related: ['settings','dialer','ai-workspace','email-sms']
  },
  {
    slug: 'phone-numbers', title: 'Phone Numbers', category: 'Calling & Telephony', summary: 'Assign provider-owned phone numbers, capabilities, and the default outbound caller ID.', moduleHref: '/dashboard/settings/phone-numbers', moduleLabel: 'Open Phone Numbers', pathnamePrefixes: ['/dashboard/settings/phone-numbers'],
    steps: [
      { title: 'Add a number', instructions: ['Enter a friendly label and the provider phone number in E.164 format.', 'Select the provider that actually owns/hosts the number.', 'Enable only capabilities the provider/number supports, such as Voice or SMS.'] },
      { title: 'Set the outbound default', instructions: ['Set the correct default caller ID for the workspace/provider.', 'Open Dialer and confirm the number appears in the outbound caller ID selector.'] },
    ], successChecks: ['Number persists after refresh.', 'Correct provider/capabilities are shown.', 'Dialer displays the expected default caller ID.'], related: ['dialer','integrations','telephony-monitoring']
  },
  {
    slug: 'background-jobs', title: 'Background Jobs', category: 'Sales & Automation', summary: 'Review asynchronous work that powers scheduled and durable Flowtix operations.', moduleHref: '/dashboard/settings/jobs', moduleLabel: 'Open Background Jobs', pathnamePrefixes: ['/dashboard/settings/jobs'],
    steps: [
      { title: 'Review job health', instructions: ['Look for failed, stuck, or repeatedly retried jobs.', 'Use timestamps and job names to identify the originating workflow.'] },
      { title: 'Recover safely', instructions: ['Fix the root configuration/data issue before retrying a failed job.', 'Avoid repeatedly re-running a job that performs external side effects such as billing or messaging unless idempotency is confirmed.'] },
    ], successChecks: ['Healthy jobs complete.', 'Retries do not create duplicate external side effects.'], related: ['sequences','exports','settings']
  },
  {
    slug: 'troubleshooting', title: 'Troubleshooting Flowtix', category: 'Troubleshooting', summary: 'Use a safe diagnostic sequence before changing code or production data.', pathnamePrefixes: [],
    steps: [
      { title: 'Reproduce once', instructions: ['Record the page, exact action, time, user/organization, and visible error.', 'Avoid repeating destructive or billable actions multiple times.'] },
      { title: 'Check the closest source of truth', instructions: ['UI error: inspect Vercel/server logs for the same timestamp.', 'Database issue: inspect the relevant Supabase row/function without editing it first.', 'Provider issue: inspect the provider’s logs/status and account restrictions.', 'Background workflow: inspect job state and idempotency records.'] },
      { title: 'Separate configuration from code', instructions: ['Confirm credentials, permissions, entitlements, account limits, and destination restrictions.', 'Change code only after the failure is shown to be inside Flowtix rather than an external restriction.'] },
      { title: 'Make the smallest safe fix', instructions: ['Change only the responsible layer.', 'Run lint and build.', 'Deploy and repeat the same controlled test.', 'Confirm persistence after refresh where applicable.'] },
    ], successChecks: ['The original failure no longer reproduces.', 'Unrelated modules still load.', 'Logs no longer show the original error.'], related: ['settings','security-center','background-jobs','telephony-monitoring']
  },
]

export function getGuideArticle(slug: string): GuideArticle | undefined {
  return guideArticles.find((article) => article.slug === slug)
}

export function getGuideForPathname(pathname: string): GuideArticle | undefined {
  const candidates = guideArticles
    .flatMap((article) => (article.pathnamePrefixes ?? []).map((prefix) => ({ article, prefix })))
    .filter(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)

  return candidates[0]?.article
}
