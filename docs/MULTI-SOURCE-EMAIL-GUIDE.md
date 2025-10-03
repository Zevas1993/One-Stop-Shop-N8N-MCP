# 🌐 Multi-Source Email Scanning Guide

## Overview

The enhanced system now supports **scanning emails from multiple sources**, not just Outlook. This allows the AI assistant to have a complete view of your business communications across:

- **Gmail** (HTTP/API)
- **Outlook/Microsoft 365** (HTTP/API)
- **IMAP** (any email provider: Yahoo, ProtonMail, FastMail, etc.)
- **POP3** (legacy email accounts)
- **Custom HTTP APIs** (proprietary email systems)

---

## 📧 Supported Email Sources

### **1. Gmail (Google Workspace)**

**Protocol:** HTTP/REST API (Gmail API)

**Setup:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create project: "n8n Business Assistant"
3. Enable Gmail API
4. Create OAuth 2.0 credentials
5. Add to n8n:
   - Credentials → New → Gmail OAuth2
   - Enter Client ID and Client Secret
   - Authorize

**Capabilities:**
- ✅ Full email history access
- ✅ Labels and categories
- ✅ Attachments download
- ✅ Thread conversation tracking
- ✅ Search and filters
- ✅ Sent and received emails

**Rate Limits:**
- 250 quota units per second
- ~1 billion quota units per day
- Effectively unlimited for personal use

---

### **2. Microsoft Outlook / Office 365**

**Protocol:** HTTP/REST API (Microsoft Graph API)

**Setup:**
1. Go to [Azure Portal](https://portal.azure.com)
2. App Registrations → New Registration
3. Add API permissions:
   - `Mail.Read`
   - `Mail.ReadWrite`
   - `Mail.Send`
4. Create client secret
5. Add to n8n:
   - Credentials → Microsoft Outlook OAuth2
   - Enter credentials and authorize

**Capabilities:**
- ✅ Full mailbox access
- ✅ Categories and folders
- ✅ Attachments
- ✅ Conversation tracking
- ✅ Advanced filters
- ✅ Sent and received emails

**Rate Limits:**
- 10,000 requests per 10 minutes
- More than sufficient for email scanning

---

### **3. IMAP (Universal Email Access)**

**Protocol:** IMAP (Internet Message Access Protocol)

**Supported Providers:**
- Gmail (via IMAP)
- Yahoo Mail
- ProtonMail
- FastMail
- Zoho Mail
- iCloud Mail
- Any email provider with IMAP support

**Setup:**

#### **Gmail IMAP:**
1. Enable IMAP in Gmail settings:
   - Settings → Forwarding and POP/IMAP
   - Enable IMAP
2. Enable "Less secure app access" OR use App Password:
   - Google Account → Security
   - 2-Step Verification → App passwords
   - Generate password for "Mail"
3. Add to n8n:
   - Credentials → IMAP
   - Host: `imap.gmail.com`
   - Port: `993`
   - Secure: `SSL/TLS`
   - User: your-email@gmail.com
   - Password: app password

#### **Yahoo Mail IMAP:**
1. Generate app password:
   - Account Security → Generate app password
2. Add to n8n:
   - Host: `imap.mail.yahoo.com`
   - Port: `993`
   - User: your-email@yahoo.com
   - Password: app password

#### **ProtonMail Bridge:**
1. Install ProtonMail Bridge (desktop app)
2. Configure in n8n:
   - Host: `127.0.0.1`
   - Port: `1143`
   - User: your-email@proton.me
   - Password: bridge password

#### **Generic IMAP:**
For any provider, you need:
- IMAP host (e.g., `mail.yourprovider.com`)
- IMAP port (usually `993` for SSL)
- Username (usually your email address)
- Password (or app-specific password)

**Capabilities:**
- ✅ Access all folders (Inbox, Sent, Archive, etc.)
- ✅ Download emails
- ✅ Attachments
- ✅ Search by criteria
- ✅ Works with any IMAP provider

**Limitations:**
- ⚠️ Slower than API-based access
- ⚠️ Some providers have rate limits
- ⚠️ Sent emails may be in separate folder

---

### **4. Custom HTTP APIs**

**Protocol:** Custom REST/HTTP endpoints

**Use Cases:**
- Proprietary email systems
- Company-specific email platforms
- Third-party email services with APIs
- Webhook-based email forwarding

**Setup:**
1. Configure your custom API endpoint
2. Add to n8n:
   - HTTP Request node
   - URL: Your API endpoint
   - Authentication: Bearer token, Basic Auth, API Key, etc.
   - Method: GET/POST based on your API

**Example Configuration:**

```json
{
  "url": "https://api.yourcompany.com/emails",
  "method": "GET",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "headers": {
    "Authorization": "Bearer YOUR_API_TOKEN"
  },
  "qs": {
    "limit": 1000,
    "include": "sent,inbox"
  }
}
```

**Expected Response Format:**

Your API should return emails in this structure (adapt the normalization code if different):

```json
{
  "emails": [
    {
      "id": "unique-email-id",
      "subject": "Email subject",
      "sender": "sender@email.com",
      "senderName": "John Doe",
      "recipient": "you@company.com",
      "timestamp": "2025-10-02T10:30:00Z",
      "message": "Email body text...",
      "html": "<p>Email body HTML...</p>",
      "attachments": [],
      "labels": ["work", "important"],
      "threadId": "conversation-id"
    }
  ]
}
```

The normalization code will adapt it to the unified format.

---

## 🔄 How Email Normalization Works

The workflow **automatically detects the email source** and normalizes all formats into a unified structure:

### **Unified Email Schema:**

```javascript
{
  // Core identifiers
  id: "unique-email-id",
  threadId: "conversation-id",
  source: "gmail" | "outlook" | "imap" | "http-api",

  // Email metadata
  subject: "Email subject",
  timestamp: "2025-10-02T10:30:00Z",
  isFromOwner: true/false,
  direction: "sent" | "received",

  // Participants
  from: {
    address: "sender@email.com",
    name: "Sender Name"
  },
  to: [{ address: "...", name: "..." }],
  cc: [{ address: "...", name: "..." }],

  // Content
  body: "Clean text body...",
  bodyPreview: "First 500 characters...",

  // Metadata
  hasAttachments: true/false,
  labels: ["tag1", "tag2"],
  importance: "high" | "normal" | "low",

  // Analysis
  wordCount: 250,
  tone: "professional" | "enthusiastic" | "apologetic"...,
  hasQuestions: true/false,
  hasUrgency: true/false,

  // Business context
  businessContext: {
    topics: ["financial", "technical"],
    projects: ["Project Alpha"],
    actions: ["meeting", "review"]
  },

  // Processing
  embeddingText: "Subject + Body for AI",
  processedAt: "2025-10-02T10:35:00Z"
}
```

This **unified format** ensures the AI assistant works identically regardless of email source.

---

## 🚀 Setup Instructions

### **Step 1: Choose Your Email Sources**

Decide which email accounts you want to scan:

- [ ] Gmail personal account
- [ ] Gmail work account (Google Workspace)
- [ ] Outlook personal
- [ ] Outlook work (Microsoft 365)
- [ ] IMAP accounts (Yahoo, ProtonMail, etc.)
- [ ] Custom HTTP API

### **Step 2: Configure Credentials**

For each source, add credentials in n8n:

**Gmail:**
```
Credentials → New → Gmail OAuth2
→ Enter Client ID/Secret
→ Authorize with Google
```

**Outlook:**
```
Credentials → New → Microsoft Outlook OAuth2
→ Enter Client ID/Secret
→ Authorize with Microsoft
```

**IMAP:**
```
Credentials → New → IMAP
→ Host, Port, User, Password
→ Test connection
```

**HTTP API:**
```
Credentials → New → HTTP Header Auth
→ Header Name: "Authorization"
→ Header Value: "Bearer YOUR_TOKEN"
```

### **Step 3: Import Multi-Source Workflow**

1. Import `workflows/1b-multi-source-email-ingestion.json`
2. Configure each email source node with appropriate credentials
3. **Disable sources you don't use** (right-click → Disable)

### **Step 4: Set Environment Variables**

```bash
# Your primary email (to identify sent emails)
BUSINESS_OWNER_EMAIL=your-email@company.com

# Optional: Custom HTTP API URL
CUSTOM_EMAIL_API_URL=https://api.yourcompany.com/emails
```

### **Step 5: Run Initial Scan**

1. Open the multi-source workflow
2. Click **"Execute Workflow"**
3. Wait for completion (10-60 minutes depending on email volume)
4. Review summary statistics

**Expected Output:**
```json
{
  "totalEmails": 15420,
  "sourceBreakdown": {
    "gmail": 8500,
    "outlook": 5200,
    "imap": 1500,
    "http-api": 220
  },
  "sentByOwner": 6800,
  "received": 8620
}
```

---

## 🔍 Query Examples

### **Search Across All Email Sources:**

```sql
-- Find emails about a topic from ANY source
SELECT
  source,
  from_name,
  subject,
  timestamp
FROM email_unified_fts
WHERE email_unified_fts MATCH 'budget proposal'
ORDER BY timestamp DESC;
```

### **Source-Specific Queries:**

```sql
-- Emails from Gmail only
SELECT COUNT(*)
FROM email_history_unified
WHERE source = 'gmail';

-- Compare response patterns by source
SELECT
  source,
  AVG(word_count) as avg_length,
  COUNT(*) as total_emails
FROM email_history_unified
WHERE direction = 'sent'
GROUP BY source;
```

### **Multi-Account Deduplication:**

```sql
-- Find duplicate emails across sources (same subject, same day)
SELECT
  subject,
  DATE(timestamp) as date,
  GROUP_CONCAT(source) as sources,
  COUNT(*) as duplicate_count
FROM email_history_unified
GROUP BY subject, DATE(timestamp)
HAVING COUNT(*) > 1;
```

---

## ⚡ Performance Considerations

### **Scanning Time Estimates:**

| Email Count | Gmail API | Outlook API | IMAP | Total Time |
|-------------|-----------|-------------|------|------------|
| 1,000 | 2 min | 2 min | 10 min | ~5-10 min |
| 10,000 | 20 min | 20 min | 100 min | ~50-60 min |
| 100,000 | 3 hours | 3 hours | 16 hours | ~8-10 hours |

**Recommendations:**
- Use API-based sources (Gmail, Outlook) when possible - **10x faster**
- IMAP is slower but works with any provider
- Run initial scan overnight for large mailboxes
- Subsequent incremental scans are much faster

### **Rate Limit Handling:**

The workflow includes automatic rate limit handling:
- Retry with exponential backoff
- Batch processing to stay under limits
- Progress tracking and resumption

### **Storage Requirements:**

| Email Count | Database Size | With Attachments |
|-------------|---------------|------------------|
| 1,000 | ~15 MB | ~50-100 MB |
| 10,000 | ~150 MB | ~500 MB - 1 GB |
| 100,000 | ~1.5 GB | ~5-10 GB |

---

## 🔐 Security & Privacy

### **Data Storage:**
- All emails stored **locally** in SQLite database
- No cloud storage of email content
- Only metadata sent to OpenAI (for AI generation)

### **Credentials Security:**
- OAuth tokens encrypted by n8n
- IMAP passwords stored securely
- API keys never logged

### **Access Control:**
- Database file permissions: owner-only
- n8n requires authentication
- Environment variables for secrets

### **Compliance:**
- **GDPR**: Email processing with consent
- **Data retention**: Configure auto-delete for old emails
- **Right to erasure**: Simple database deletion

---

## 🛠️ Troubleshooting

### **Gmail: "Authentication Failed"**
- **Cause:** OAuth token expired or "Less secure apps" disabled
- **Solution:**
  1. Re-authorize in n8n credentials
  2. Or use App Password instead
  3. Enable IMAP if using IMAP method

### **Outlook: "Insufficient Permissions"**
- **Cause:** Missing API permissions
- **Solution:**
  1. Go to Azure App Registration
  2. API Permissions → Add `Mail.Read`, `Mail.ReadWrite`
  3. Click "Grant admin consent"
  4. Re-authorize in n8n

### **IMAP: "Connection Timeout"**
- **Cause:** Incorrect host/port or firewall
- **Solution:**
  1. Verify IMAP settings with your provider
  2. Check firewall allows outbound on port 993
  3. Test with email client first (Thunderbird, etc.)

### **HTTP API: "No emails returned"**
- **Cause:** Incorrect API endpoint or authentication
- **Solution:**
  1. Test API endpoint with curl/Postman first
  2. Verify authentication header format
  3. Check API response structure matches expected format
  4. Update normalization code if needed

### **Duplicates Across Sources**
- **Cause:** Same email in Gmail and IMAP
- **Solution:**
  1. Disable one source to avoid duplicates
  2. Or use deduplication query (see above)
  3. Add UNIQUE constraint on (subject, timestamp, from_email)

---

## 📊 Multi-Source Analytics

### **Communication Patterns by Source:**

```sql
-- Which email account do you use most?
SELECT
  source,
  COUNT(*) as total_emails,
  SUM(CASE WHEN direction='sent' THEN 1 ELSE 0 END) as sent,
  SUM(CASE WHEN direction='received' THEN 1 ELSE 0 END) as received,
  ROUND(AVG(word_count)) as avg_words
FROM email_history_unified
GROUP BY source
ORDER BY total_emails DESC;
```

### **Cross-Account Conversations:**

```sql
-- Conversations that span multiple email accounts
SELECT
  thread_id,
  GROUP_CONCAT(DISTINCT source) as sources_used,
  COUNT(*) as email_count,
  MAX(timestamp) as latest
FROM email_history_unified
GROUP BY thread_id
HAVING COUNT(DISTINCT source) > 1
ORDER BY latest DESC
LIMIT 20;
```

### **Source-Specific Metrics:**

```sql
-- Response time by email source
SELECT
  e1.source,
  AVG(
    (julianday(e2.timestamp) - julianday(e1.timestamp)) * 24
  ) as avg_response_hours
FROM email_history_unified e1
JOIN email_history_unified e2
  ON e1.thread_id = e2.thread_id
WHERE e1.direction = 'received'
  AND e2.direction = 'sent'
  AND e2.timestamp > e1.timestamp
GROUP BY e1.source;
```

---

## 🔄 Continuous Multi-Source Monitoring

For **real-time monitoring** of all email sources, update Workflow 3:

### **Modified Email Monitor (All Sources):**

Instead of just Outlook trigger, create multiple triggers:

1. **Gmail Trigger** (polls every minute)
2. **Outlook Trigger** (polls every minute)
3. **IMAP Trigger** (polls every 5 minutes)
4. **HTTP Webhook** (for custom APIs with push notifications)

All triggers feed into the same AI assistant pipeline, so responses work identically regardless of which email account received the message.

---

## 🌟 Advanced Multi-Source Features

### **1. Smart Account Selection**

When responding to emails, the AI can automatically select the correct sending account:

```javascript
// In AI response generation
const replyFrom = determineReplyAccount(email);

function determineReplyAccount(email) {
  // If received on Gmail, reply from Gmail
  if (email.source === 'gmail') return 'gmail_account';

  // If received on work Outlook, reply from work
  if (email.source === 'outlook' && email.to[0].includes('@company.com')) {
    return 'work_outlook';
  }

  // Default to personal
  return 'personal_outlook';
}
```

### **2. Cross-Account Thread Detection**

Link conversations across different email accounts:

```javascript
// Find related emails across accounts by participants
const relatedEmails = findRelatedAcrossAccounts(sender, subject);

// Use in context building for comprehensive conversation history
```

### **3. Source-Specific Styling**

Adjust response style based on email account:

```javascript
const styleProfile = {
  gmail_personal: { tone: 'casual', length: 'brief' },
  outlook_work: { tone: 'professional', length: 'detailed' },
  imap_sales: { tone: 'friendly', length: 'medium' }
};
```

---

## 📚 Complete Setup Example

### **Scenario: Business Owner with 3 Email Accounts**

**Accounts:**
1. Gmail personal: john.doe@gmail.com
2. Work Outlook: john@company.com
3. Sales IMAP: sales@company.net

**Setup Process:**

```bash
# 1. Configure credentials in n8n
Gmail OAuth2 → john.doe@gmail.com
Outlook OAuth2 → john@company.com
IMAP → sales@company.net (host: mail.company.net, port: 993)

# 2. Set environment variables
BUSINESS_OWNER_EMAIL=john@company.com

# 3. Import and configure workflow
Import: 1b-multi-source-email-ingestion.json
Enable nodes: Gmail, Outlook, IMAP
Disable: HTTP API (not using)

# 4. Run initial scan
Execute workflow → Wait 30-60 minutes

# 5. Verify results
Total emails: 25,340
- Gmail: 12,500 emails
- Outlook: 10,200 emails
- IMAP: 2,640 emails

# 6. Activate monitoring workflows
Workflow 3 (modified): Monitor all 3 sources
Workflow 4: Teams bot (works across all accounts)
```

**Result:** AI assistant now has **complete view** of all business communications across 3 email accounts, responds with appropriate account based on which received the email.

---

## 🎉 Benefits of Multi-Source Email Scanning

✅ **Complete Communication History**
- No blind spots - see all emails across all accounts
- Unified search across Gmail, Outlook, IMAP
- Comprehensive business context

✅ **Account-Aware Responses**
- AI knows which account to reply from
- Maintains appropriate style per account
- Professional for work, casual for personal

✅ **Better Business Intelligence**
- Cross-account project tracking
- Complete client communication history
- No missed context from separate accounts

✅ **Flexible Setup**
- Use what you have (Gmail, Outlook, IMAP, etc.)
- Add/remove accounts anytime
- Works with any email provider

✅ **Future-Proof**
- Not locked to one provider
- Easy to migrate between providers
- API and IMAP support ensures compatibility

---

## 📞 Support

**Issues with specific providers:**
- Gmail: Check [Gmail API docs](https://developers.google.com/gmail/api)
- Outlook: Check [Microsoft Graph docs](https://docs.microsoft.com/graph/api/resources/mail-api-overview)
- IMAP: Contact your email provider for IMAP settings

**n8n Community:**
- [Forum](https://community.n8n.io)
- [Discord](https://discord.gg/n8n)

---

**🌐 Your AI assistant now has a complete view of ALL your business emails, regardless of which account they're in!**
