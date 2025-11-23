# Step-by-Step Implementation Guide: Ultimate Outlook AI Assistant

**Target Audience**: n8n Workflow Developers
**Complexity Level**: Intermediate to Advanced
**Estimated Time**: 2-3 weeks for full implementation
**Date**: November 23, 2025

---

## Part 1: Foundation Setup

### Step 1.1: Backup Current Workflow
```bash
# Export your current workflow from n8n UI
# Menu → Workflows → Your Workflow → Download
# Save as: Teams-Outlook-Assistant-v1-backup.json

# This ensures you can revert if needed
```

### Step 1.2: Create Database Schema Enhancements

In your PostgreSQL/MySQL database, run these SQL scripts:

```sql
-- Conversation storage table
CREATE TABLE IF NOT EXISTS email_conversations (
  id SERIAL PRIMARY KEY,
  conversation_id VARCHAR(255) UNIQUE NOT NULL,
  sender_email VARCHAR(255) NOT NULL,
  sender_name VARCHAR(255),
  subject VARCHAR(500),
  first_email_id VARCHAR(255),
  latest_email_id VARCHAR(255),
  thread_topic VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active', -- active, resolved, archived
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  INDEX idx_sender (sender_email),
  INDEX idx_status (status),
  INDEX idx_created (created_at)
);

-- Email processing log
CREATE TABLE IF NOT EXISTS email_processing_log (
  id SERIAL PRIMARY KEY,
  email_id VARCHAR(255) UNIQUE NOT NULL,
  conversation_id VARCHAR(255),
  sender_email VARCHAR(255),
  subject VARCHAR(500),
  received_at TIMESTAMP,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  email_category VARCHAR(100),
  urgency_level VARCHAR(50),
  urgency_score INT,
  ai_response TEXT,
  ai_confidence DECIMAL(5,2),
  processing_time_ms INT,
  status VARCHAR(50),
  error_message TEXT NULL,
  FOREIGN KEY (conversation_id) REFERENCES email_conversations(conversation_id),
  INDEX idx_email_id (email_id),
  INDEX idx_conversation (conversation_id),
  INDEX idx_processed_at (processed_at)
);

-- User preferences and settings
CREATE TABLE IF NOT EXISTS user_preferences (
  id SERIAL PRIMARY KEY,
  user_email VARCHAR(255) UNIQUE NOT NULL,
  user_name VARCHAR(255),
  response_style VARCHAR(100) DEFAULT 'balanced', -- brief, balanced, detailed
  response_language VARCHAR(50) DEFAULT 'en',
  prefer_draft_over_response BOOLEAN DEFAULT false,
  min_urgency_for_immediate_response VARCHAR(50) DEFAULT 'high',
  working_hours_start TIME DEFAULT '09:00',
  working_hours_end TIME DEFAULT '17:00',
  timezone VARCHAR(100) DEFAULT 'UTC',
  department VARCHAR(100),
  manager_email VARCHAR(255) NULL,
  team_members TEXT, -- JSON list of team members
  trusted_senders TEXT, -- JSON list of trusted sender emails
  blocked_senders TEXT, -- JSON list of blocked senders
  custom_rules TEXT, -- JSON with custom processing rules
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_email (user_email)
);

-- Response feedback and quality metrics
CREATE TABLE IF NOT EXISTS response_feedback (
  id SERIAL PRIMARY KEY,
  email_id VARCHAR(255) NOT NULL,
  conversation_id VARCHAR(255),
  feedback_type VARCHAR(50), -- positive, negative, neutral
  feedback_rating INT, -- 1-5 stars
  feedback_text TEXT,
  user_email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  action_taken VARCHAR(100), -- which action user took after feedback
  FOREIGN KEY (conversation_id) REFERENCES email_conversations(conversation_id),
  INDEX idx_email_id (email_id),
  INDEX idx_feedback_type (feedback_type),
  INDEX idx_created (created_at)
);

-- AI response templates and patterns
CREATE TABLE IF NOT EXISTS response_templates (
  id SERIAL PRIMARY KEY,
  template_name VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(100),
  trigger_keywords TEXT, -- JSON list of keywords that trigger this
  template_text TEXT,
  confidence_threshold DECIMAL(5,2) DEFAULT 0.75,
  usage_count INT DEFAULT 0,
  avg_rating DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  INDEX idx_category (category),
  INDEX idx_confidence (confidence_threshold)
);

-- Error and failure tracking
CREATE TABLE IF NOT EXISTS error_log (
  id SERIAL PRIMARY KEY,
  error_type VARCHAR(100),
  error_message TEXT,
  error_context TEXT, -- JSON context where error occurred
  email_id VARCHAR(255) NULL,
  conversation_id VARCHAR(255) NULL,
  user_email VARCHAR(255) NULL,
  severity VARCHAR(50), -- critical, high, medium, low
  resolved BOOLEAN DEFAULT false,
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  INDEX idx_error_type (error_type),
  INDEX idx_severity (severity),
  INDEX idx_created (created_at)
);

-- Create indexes for performance
CREATE INDEX idx_conversations_sender_date
  ON email_conversations(sender_email, created_at DESC);

CREATE INDEX idx_processing_log_conversation_date
  ON email_processing_log(conversation_id, processed_at DESC);

CREATE INDEX idx_feedback_conversation_date
  ON response_feedback(conversation_id, created_at DESC);
```

---

## Part 2: Add Information Extraction Nodes

### Step 2.1: Email Body Extractor Node

In your n8n workflow:

1. **Add new node**: Click `+` → Search for "Code"
2. **Name it**: "Email Body Extractor"
3. **Configure Input**: Set to run on email trigger output
4. **Paste this code**:

```javascript
// Email Body Extractor
// Extracts complete email information for analysis

const email = $input.first().json;

// Handle different email formats (Outlook, Gmail, etc.)
const extractedEmail = {
  // Sender information
  sender: {
    email: email.from?.emailAddress?.address || email.from?.address || 'unknown',
    name: email.from?.emailAddress?.name || email.from?.name || 'Unknown Sender'
  },

  // Email content
  subject: email.subject || '(No Subject)',
  body: {
    text: email.bodyPreview || email.body?.content || '',
    html: email.bodyHtml || email.body?.contentType === 'html' ? email.body?.content : null,
    type: email.bodyType || 'text'
  },

  // Timing
  receivedAt: email.receivedDateTime || email.date || new Date().toISOString(),
  sentAt: email.sentDateTime || null,
  processedAt: new Date().toISOString(),

  // Email metadata
  emailId: email.id || email.messageId || null,
  conversationId: email.conversationId || email.threadId || null,
  messageId: email.internetMessageId || null,
  inReplyTo: email.inReplyTo?.internetMessageId || null,

  // Recipients
  recipients: {
    to: email.toRecipients?.map(r => ({
      email: r.emailAddress?.address,
      name: r.emailAddress?.name
    })) || [],
    cc: email.ccRecipients?.map(r => ({
      email: r.emailAddress?.address,
      name: r.emailAddress?.name
    })) || [],
    bcc: email.bccRecipients?.map(r => ({
      email: r.emailAddress?.address,
      name: r.emailAddress?.name
    })) || [],
    replyTo: email.replyTo?.map(r => ({
      email: r.emailAddress?.address,
      name: r.emailAddress?.name
    })) || []
  },

  // Flags and properties
  importance: email.importance || 'normal', // normal, low, high
  isRead: email.isRead || false,
  isFlagged: email.isFlagged || false,
  isSpam: email.isSpam || false,
  hasAttachments: email.hasAttachments || false,
  attachmentCount: email.attachmentCount || 0,

  // Categories and labels
  categories: email.categories || [],
  labels: email.labels || [],
  folderName: email.parentFolderId?.displayName || 'Inbox',

  // Links and references
  webLink: email.webLink || null,
  references: email.references || [],

  // Custom properties
  isAutoReply: email.isAutoReply || false,
  isDeliveryReceiptRequested: email.isDeliveryReceiptRequested || false,
  isReadReceiptRequested: email.isReadReceiptRequested || false,

  // Original email object (for reference)
  _original: email
};

return {
  json: extractedEmail,
  pairedItem: $input.first().pairedItem
};
```

**What it does**:
- Extracts all relevant email information
- Handles multiple email formats (Outlook, Gmail, etc.)
- Preserves metadata for later use
- Normalizes data structure for consistency

---

### Step 2.2: Add Urgency Detector Node

1. **Add new node**: Code node
2. **Name it**: "Urgency Detector"
3. **Set input from**: Email Body Extractor
4. **Paste this code**:

```javascript
// Urgency Detector
// Analyzes email to determine priority level

const email = $input.first().json;
let urgencyScore = 0;
const signals = [];

// Check importance flag
if (email.importance === 'high') {
  urgencyScore += 35;
  signals.push('high_importance_flag');
}

// Check for urgent keywords in subject
const urgentKeywords = ['urgent', 'asap', 'critical', 'emergency', 'immediate', 'time-sensitive'];
const subjectLower = email.subject.toLowerCase();
urgentKeywords.forEach(keyword => {
  if (subjectLower.includes(keyword)) {
    urgencyScore += 25;
    signals.push(`urgent_keyword_${keyword}`);
  }
});

// Check for all caps or excessive punctuation (typically urgent)
if (/[A-Z]{5,}/.test(email.subject)) {
  urgencyScore += 15;
  signals.push('all_caps_subject');
}

if (/[!]{2,}/.test(email.subject) || /\?\?/.test(email.subject)) {
  urgencyScore += 10;
  signals.push('excessive_punctuation');
}

// Check body for urgent language
const bodyText = (email.body.text || '').toLowerCase();
if (bodyText.includes('urgent') || bodyText.includes('asap') || bodyText.includes('critical')) {
  urgencyScore += 15;
  signals.push('urgent_language_in_body');
}

// Check for action-oriented language
const actionKeywords = ['need', 'must', 'require', 'immediately', 'today', 'by end of day'];
const actionCount = actionKeywords.filter(kw => bodyText.includes(kw)).length;
if (actionCount > 2) {
  urgencyScore += actionCount * 5;
  signals.push(`action_count_${actionCount}`);
}

// Check if replying to existing conversation
if (email.inReplyTo) {
  urgencyScore += 10;
  signals.push('is_reply');
}

// Check for deliveryReceipt or readReceipt request (often indicates urgency)
if (email.isDeliveryReceiptRequested || email.isReadReceiptRequested) {
  urgencyScore += 15;
  signals.push('receipt_requested');
}

// Determine urgency level based on score
let urgencyLevel = 'low';
if (urgencyScore >= 60) {
  urgencyLevel = 'critical';
} else if (urgencyScore >= 40) {
  urgencyLevel = 'high';
} else if (urgencyScore >= 20) {
  urgencyLevel = 'medium';
}

return {
  json: {
    ...email,
    urgency: {
      score: Math.min(100, urgencyScore), // Cap at 100
      level: urgencyLevel, // critical, high, medium, low
      signals: signals,
      detectedAt: new Date().toISOString()
    }
  },
  pairedItem: $input.first().pairedItem
};
```

**What it does**:
- Analyzes multiple urgency signals
- Calculates urgency score (0-100)
- Categorizes as: critical, high, medium, or low
- Returns signals for debugging/learning

---

### Step 2.3: Add Sentiment & Emotion Analyzer

1. **Add new node**: Code node
2. **Name it**: "Sentiment Analyzer"
3. **Set input from**: Urgency Detector
4. **Paste this code**:

```javascript
// Sentiment & Emotion Analyzer
// Detects emotional tone and sentiment in email

const email = $input.first().json;
const body = (email.body.text || email.body.html || '').toLowerCase();
const subject = email.subject.toLowerCase();
const fullText = `${subject} ${body}`;

// Define sentiment indicators
const sentiments = {
  positive: {
    words: ['thank', 'appreciate', 'great', 'excellent', 'perfect', 'wonderful', 'love', 'happy', 'pleased', 'fantastic'],
    score: 0
  },
  negative: {
    words: ['angry', 'upset', 'hate', 'terrible', 'awful', 'horrible', 'disappointed', 'frustrated', 'concerned', 'worried'],
    score: 0
  },
  neutral: {
    score: 0
  },
  urgent: {
    words: ['urgent', 'asap', 'critical', 'emergency', 'immediate', 'quickly', 'now', 'today'],
    score: 0
  }
};

// Count sentiment word occurrences
Object.keys(sentiments).forEach(sentiment => {
  if (sentiments[sentiment].words) {
    sentiments[sentiment].words.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'g');
      const matches = fullText.match(regex) || [];
      sentiments[sentiment].score += matches.length;
    });
  }
});

// Determine primary sentiment
let primarySentiment = 'neutral';
let sentimentScore = 0;

if (sentiments.positive.score > sentiments.negative.score && sentiments.positive.score > 0) {
  primarySentiment = 'positive';
  sentimentScore = Math.min(100, (sentiments.positive.score / fullText.split(' ').length) * 100);
} else if (sentiments.negative.score > sentiments.positive.score && sentiments.negative.score > 0) {
  primarySentiment = 'negative';
  sentimentScore = Math.min(100, (sentiments.negative.score / fullText.split(' ').length) * 100);
}

// Check for escalation indicators
const escalationKeywords = ['escalate', 'manager', 'supervisor', 'complaint', 'legal', 'lawyer'];
const hasEscalationKeywords = escalationKeywords.some(kw => fullText.includes(kw));

return {
  json: {
    ...email,
    sentiment: {
      primary: primarySentiment, // positive, negative, neutral
      score: Math.round(sentimentScore), // 0-100 confidence
      indicators: {
        positive: sentiments.positive.score,
        negative: sentiments.negative.score,
        urgent: sentiments.urgent.score
      },
      requiresEscalation: hasEscalationKeywords,
      detectedAt: new Date().toISOString()
    }
  },
  pairedItem: $input.first().pairedItem
};
```

**What it does**:
- Analyzes emotional tone of email
- Detects positive, negative, or neutral sentiment
- Identifies escalation triggers
- Provides confidence scores

---

## Part 3: Context & Memory Nodes

### Step 3.1: Add Conversation History Loader

1. **Add new node**: PostgreSQL/MySQL node
2. **Name it**: "Load Conversation History"
3. **Configure**:
   - **Connection**: Your database
   - **Query Mode**: Raw query
   - **SQL**:

```sql
SELECT
  ep.email_id,
  ep.subject,
  ep.email_category,
  ep.urgency_level,
  ep.ai_response,
  ep.ai_confidence,
  ep.processed_at,
  rf.feedback_type,
  rf.feedback_rating
FROM email_processing_log ep
LEFT JOIN response_feedback rf ON ep.email_id = rf.email_id
WHERE ep.conversation_id = (
  SELECT conversation_id FROM email_conversations
  WHERE conversation_id = {{ $json.conversationId }}
  LIMIT 1
) OR ep.sender_email = {{ $json.sender.email }}
ORDER BY ep.processed_at DESC
LIMIT 15;
```

**What it does**:
- Fetches previous emails from same sender
- Retrieves conversation history
- Gets feedback on previous responses
- Provides context for AI model

---

### Step 3.2: Add User Preferences Loader

1. **Add new node**: PostgreSQL/MySQL node
2. **Name it**: "Load User Preferences"
3. **SQL**:

```sql
SELECT
  user_email,
  response_style,
  prefer_draft_over_response,
  timezone,
  working_hours_start,
  working_hours_end,
  department,
  trusted_senders,
  custom_rules
FROM user_preferences
WHERE user_email = {{ $json.recipients.to[0]?.email || $json.sender.email }}
LIMIT 1;
```

**What it does**:
- Loads user's response preferences
- Gets working hours and timezone
- Retrieves trusted senders list
- Provides custom rules for processing

---

### Step 3.3: Add Context Window Builder

1. **Add new node**: Code node
2. **Name it**: "Build Context Window"
3. **Multiple inputs**: Email Body Extractor, Load Conversation History, Load User Preferences
4. **Paste this code**:

```javascript
// Context Window Builder
// Prepares comprehensive context for AI model

const email = $input.first().json;
const history = $('Load Conversation History').first()?.json?.data || [];
const preferences = $('Load User Preferences').first()?.json?.data?.[0] || {};

// Build system prompt with role, instructions, and context
const systemPrompt = `You are an intelligent email assistant for an Outlook user.

ROLE & RESPONSIBILITIES:
- Analyze incoming emails intelligently
- Categorize emails by type (inquiry, action item, FYI, complaint, compliment, etc.)
- Assess urgency and priority
- Generate contextual, professional responses
- Be honest about confidence levels
- Suggest escalation when appropriate
- Learn from feedback

USER CONTEXT:
- Working Hours: ${preferences.working_hours_start || '09:00'} - ${preferences.working_hours_end || '17:00'} ${preferences.timezone || 'UTC'}
- Response Style: ${preferences.response_style || 'balanced'} (brief, balanced, or detailed)
- Department: ${preferences.department || 'Not specified'}
- Current Status: Email received at ${new Date(email.receivedAt).toLocaleString()}

CONVERSATION HISTORY:
${history.length > 0 ? history.map((h, i) =>
  `\nPrevious Email ${i + 1} (${new Date(h.processed_at).toLocaleDateString()}):
   Subject: ${h.subject}
   Category: ${h.email_category}
   Your Response Confidence: ${h.ai_confidence}%
   User Feedback: ${h.feedback_type || 'none'}`)
  .join('\n') : 'No previous conversation'}

INSTRUCTIONS:
1. Analyze the email thoroughly
2. Consider conversation history and user preferences
3. Generate a professional, contextual response
4. Indicate your confidence level (0-100%)
5. If not confident (< 70%), suggest alternatives or escalation
6. Keep responses concise unless detailed style is preferred
7. Include specific references to previous interactions when relevant

FORMAT YOUR RESPONSE AS JSON:
{
  "analysis": {
    "category": "string (inquiry, action-item, fyiwait, complaint, etc.)",
    "sentiment": "string (positive, neutral, negative)",
    "urgency": "string (critical, high, medium, low)",
    "requires_escalation": boolean,
    "requires_action": boolean
  },
  "response": {
    "text": "string (your proposed response)",
    "confidence": number (0-100),
    "tone": "string (professional, friendly, formal, casual)",
    "suggests_draft": boolean,
    "alternative_approaches": ["string"]
  },
  "reasoning": "string (brief explanation of your analysis)"
}`;

// Format conversation history for context
const conversationContext = history.length > 0
  ? history.map((h, i) =>
      `Email ${i + 1}: "${h.subject}" (${h.email_category}) - Confidence: ${h.ai_confidence}%`)
      .join('\n')
  : 'No previous conversations';

// Build the full context object
const contextWindow = {
  email: email,
  history: {
    count: history.length,
    items: history.slice(0, 10), // Last 10 interactions
    summary: conversationContext
  },
  preferences: preferences,
  systemPrompt: systemPrompt,
  metadata: {
    buildTime: new Date().toISOString(),
    contextSize: `${systemPrompt.length} chars`,
    historyItems: history.length
  }
};

return {
  json: contextWindow,
  pairedItem: $input.first().pairedItem
};
```

**What it does**:
- Combines email, history, and preferences
- Creates comprehensive system prompt for AI
- Prepares context window for Claude
- Structures data for AI consumption

---

## Part 4: AI Enhancement Nodes

### Step 4.1: Add GraphRAG Query Node

1. **Add new node**: HTTP Request
2. **Name it**: "Query GraphRAG Knowledge"
3. **Configuration**:
   - **Method**: POST
   - **URL**: `http://localhost:3000/graphrag-query` (or your GraphRAG service)
   - **Authentication**: Bearer token (if needed)
   - **Body** (raw JSON):

```json
{
  "query": "{{ $json.email.subject + ' ' + $json.email.body.text.substring(0, 500) }}",
  "similarityThreshold": 0.7,
  "maxResults": 5,
  "categories": ["email_templates", "procedures", "policies", "faq"],
  "context": {
    "senderDomain": "{{ $json.email.sender.email.split('@')[1] }}",
    "emailCategory": "{{ $json.email.category }}",
    "department": "{{ $json.preferences.department }}"
  }
}
```

**What it does**:
- Queries knowledge graph for relevant information
- Retrieves similar past interactions
- Gets applicable policies/procedures
- Provides citations for AI responses

---

### Step 4.2: Add Enhanced AI Model Node

1. **Add new node**: OpenAI or Claude API node
2. **Name it**: "Generate Smart Response"
3. **Configuration**:
   - **Model**: gpt-4 or claude-3-opus
   - **System Message**: Use context from "Build Context Window"
   - **User Message**:

```
Email from: {{ $json.email.sender.name }} <{{ $json.email.sender.email }}>
Subject: {{ $json.email.subject }}
Received: {{ $json.email.receivedAt }}

Email Content:
{{ $json.email.body.text }}

Urgency Level: {{ $json.email.urgency.level }} ({{ $json.email.urgency.score }}/100)
Sentiment: {{ $json.email.sentiment.primary }}

Relevant Knowledge from Database:
{{ $json.graphragResults || 'No additional context available' }}

Please analyze this email and provide a response in the JSON format specified in your system prompt.
```

**What it does**:
- Processes comprehensive context
- Generates intelligent response
- Provides reasoning and confidence
- Suggests alternatives if uncertain

---

## Part 5: Teams Integration Enhancement

### Step 5.1: Add Teams Card Formatter

1. **Add new node**: Code node
2. **Name it**: "Format Teams Card"
3. **Input from**: Generate Smart Response
4. **Paste this code**:

```javascript
// Teams Card Formatter
// Creates rich, interactive Teams cards

const email = $input.first().json;
const aiResponse = email.aiResponse || {};

// Determine card color based on urgency
let themeColor = '0078d4'; // Default Microsoft blue
if (email.urgency?.level === 'critical') themeColor = 'ff0000'; // Red
if (email.urgency?.level === 'high') themeColor = 'ff6d00'; // Orange
if (email.urgency?.level === 'medium') themeColor = 'ffd700'; // Yellow

// Create adaptive card format (Teams compatible)
const adaptiveCard = {
  $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
  type: 'AdaptiveCard',
  version: '1.4',
  body: [
    {
      type: 'Container',
      style: 'accent',
      body: [
        {
          type: 'ColumnSet',
          columns: [
            {
              width: 'stretch',
              items: [
                {
                  type: 'TextBlock',
                  text: 'Email Response',
                  weight: 'bolder',
                  size: 'medium',
                  color: 'light'
                }
              ]
            },
            {
              width: 'auto',
              items: [
                {
                  type: 'TextBlock',
                  text: email.urgency?.level?.toUpperCase() || 'NORMAL',
                  weight: 'bolder',
                  size: 'small',
                  color: 'light'
                }
              ]
            }
          ]
        }
      ]
    },
    {
      type: 'Container',
      body: [
        {
          type: 'ColumnSet',
          columns: [
            {
              width: 'auto',
              items: [
                {
                  type: 'TextBlock',
                  text: 'From:',
                  weight: 'bolder',
                  size: 'small'
                }
              ]
            },
            {
              width: 'stretch',
              items: [
                {
                  type: 'TextBlock',
                  text: `${email.sender.name} <${email.sender.email}>`,
                  size: 'small',
                  wrap: true
                }
              ]
            }
          ]
        },
        {
          type: 'ColumnSet',
          columns: [
            {
              width: 'auto',
              items: [
                {
                  type: 'TextBlock',
                  text: 'Subject:',
                  weight: 'bolder',
                  size: 'small'
                }
              ]
            },
            {
              width: 'stretch',
              items: [
                {
                  type: 'TextBlock',
                  text: email.subject,
                  size: 'small',
                  wrap: true
                }
              ]
            }
          ]
        }
      ]
    },
    {
      type: 'Container',
      body: [
        {
          type: 'TextBlock',
          text: 'AI Analysis',
          weight: 'bolder',
          size: 'medium'
        },
        {
          type: 'TextBlock',
          text: `Category: **${aiResponse.analysis?.category || 'Unknown'}** | Sentiment: **${aiResponse.analysis?.sentiment || 'Unknown'}**`,
          wrap: true,
          size: 'small'
        }
      ]
    },
    {
      type: 'Container',
      body: [
        {
          type: 'TextBlock',
          text: 'Suggested Response',
          weight: 'bolder',
          size: 'medium'
        },
        {
          type: 'TextBlock',
          text: aiResponse.response?.text || 'No response generated',
          wrap: true,
          size: 'medium'
        }
      ]
    },
    {
      type: 'Container',
      body: [
        {
          type: 'ColumnSet',
          columns: [
            {
              width: 'auto',
              items: [
                {
                  type: 'TextBlock',
                  text: `Confidence: ${aiResponse.response?.confidence || 0}%`,
                  size: 'small',
                  weight: 'bolder'
                }
              ]
            },
            {
              width: 'auto',
              items: [
                {
                  type: 'TextBlock',
                  text: `Urgency: ${email.urgency?.level || 'normal'}`,
                  size: 'small',
                  weight: 'bolder'
                }
              ]
            }
          ]
        }
      ]
    },
    {
      type: 'Container',
      body: [
        {
          type: 'TextBlock',
          text: 'Reasoning',
          weight: 'bolder',
          size: 'small'
        },
        {
          type: 'TextBlock',
          text: aiResponse.reasoning || 'No reasoning provided',
          wrap: true,
          size: 'small',
          color: 'default',
          isSubtle: true
        }
      ]
    }
  ],
  actions: [
    {
      type: 'Action.OpenUrl',
      title: '📧 View Full Email',
      url: email.webLink || 'https://outlook.office.com'
    },
    {
      type: 'Action.Submit',
      title: '✅ This was helpful',
      data: {
        feedback: 'positive',
        emailId: email.emailId,
        conversationId: email.conversationId
      }
    },
    {
      type: 'Action.Submit',
      title: '❌ Needs improvement',
      data: {
        feedback: 'negative',
        emailId: email.emailId,
        conversationId: email.conversationId
      }
    },
    {
      type: 'Action.Submit',
      title: '🚀 Accept & Send',
      data: {
        action: 'accept_response',
        emailId: email.emailId,
        response: aiResponse.response?.text
      }
    },
    {
      type: 'Action.Submit',
      title: '📋 Create Draft',
      data: {
        action: 'create_draft',
        emailId: email.emailId,
        response: aiResponse.response?.text
      }
    },
    {
      type: 'Action.Submit',
      title: '⬆️ Escalate',
      data: {
        action: 'escalate',
        emailId: email.emailId,
        reason: 'User requested escalation'
      }
    }
  ]
};

// Also create legacy MessageCard format for compatibility
const legacyCard = {
  '@type': 'MessageCard',
  '@context': 'https://schema.org/extensions',
  summary: `Email from ${email.sender.name}`,
  themeColor: themeColor,
  sections: [
    {
      activityTitle: `Email from ${email.sender.name}`,
      activitySubtitle: email.subject,
      activityImage: null,
      text: aiResponse.response?.text || 'Processing...',
      facts: [
        {
          name: 'From:',
          value: email.sender.email
        },
        {
          name: 'Category:',
          value: aiResponse.analysis?.category || 'Unknown'
        },
        {
          name: 'Urgency:',
          value: email.urgency?.level || 'Normal'
        },
        {
          name: 'Confidence:',
          value: `${aiResponse.response?.confidence || 0}%`
        },
        {
          name: 'Sentiment:',
          value: aiResponse.analysis?.sentiment || 'Neutral'
        }
      ]
    }
  ],
  potentialAction: [
    {
      '@type': 'OpenUri',
      name: 'View Email',
      targets: [
        {
          os: 'default',
          uri: email.webLink || 'https://outlook.office.com'
        }
      ]
    },
    {
      '@type': 'Action.Submit',
      name: 'Helpful ✅',
      data: {
        feedback: 'positive'
      }
    },
    {
      '@type': 'Action.Submit',
      name: 'Needs Work ❌',
      data: {
        feedback: 'negative'
      }
    }
  ]
};

return {
  json: {
    ...email,
    teamsCard: adaptiveCard,
    legacyCard: legacyCard,
    cardFormatted: true
  },
  pairedItem: $input.first().pairedItem
};
```

**What it does**:
- Creates rich Teams adaptive cards
- Includes interactive buttons
- Shows AI confidence and analysis
- Provides action options

---

### Step 5.2: Add Send to Teams

1. **Add new node**: Microsoft Teams node
2. **Name it**: "Send Response to Teams"
3. **Configuration**:
   - **Operation**: Send Message
   - **Channel**: {{ $json.teamsChannelId }}
   - **Message Type**: Adaptive Card
   - **Card**: Use content from "Format Teams Card"

---

## Part 6: Database Storage Nodes

### Step 6.1: Add Conversation Logger

1. **Add new node**: PostgreSQL/MySQL
2. **Name it**: "Log to Conversations"
3. **Insert/Update Mode**: Insert
4. **SQL**:

```sql
INSERT INTO email_conversations (
  conversation_id,
  sender_email,
  sender_name,
  subject,
  first_email_id,
  latest_email_id,
  thread_topic,
  status
) VALUES (
  {{ $json.conversationId }},
  {{ $json.sender.email }},
  {{ $json.sender.name }},
  {{ $json.subject }},
  {{ $json.emailId }},
  {{ $json.emailId }},
  {{ $json.subject }},
  'active'
) ON CONFLICT (conversation_id) DO UPDATE SET
  latest_email_id = {{ $json.emailId }},
  updated_at = CURRENT_TIMESTAMP;
```

---

### Step 6.2: Add Processing Log

1. **Add new node**: PostgreSQL/MySQL
2. **Name it**: "Log Processing Details"
3. **SQL**:

```sql
INSERT INTO email_processing_log (
  email_id,
  conversation_id,
  sender_email,
  subject,
  received_at,
  processed_at,
  email_category,
  urgency_level,
  urgency_score,
  ai_response,
  ai_confidence,
  processing_time_ms,
  status
) VALUES (
  {{ $json.emailId }},
  {{ $json.conversationId }},
  {{ $json.sender.email }},
  {{ $json.subject }},
  {{ $json.receivedAt }},
  NOW(),
  {{ $json.aiResponse.analysis.category }},
  {{ $json.urgency.level }},
  {{ $json.urgency.score }},
  {{ $json.aiResponse.response.text }},
  {{ $json.aiResponse.response.confidence }},
  {{ $json.processingTime }},
  'completed'
);
```

---

## Part 7: Error Handling

### Step 7.1: Add Error Handler

1. **Add new node**: n8n-nodes-base.errorHandler
2. **Name it**: "Handle Processing Errors"
3. **Configure to**:
   - Log errors to database
   - Notify user of failure
   - Retry failed operations
   - Escalate critical errors

```javascript
// Error Handler Code
const error = $error;
const context = $json;

const errorRecord = {
  error_type: error.constructor.name,
  error_message: error.message,
  error_context: JSON.stringify({
    emailId: context.emailId,
    sender: context.sender?.email,
    step: error.node?.name || 'unknown'
  }),
  email_id: context.emailId,
  conversation_id: context.conversationId,
  user_email: context.sender?.email,
  severity: error.message.includes('critical') ? 'critical' : 'high',
  created_at: new Date().toISOString()
};

// Log error
// [Log to error table]

// Decide recovery action
if (error.message.includes('API')) {
  // Retry with exponential backoff
  return { retry: true, backoffMs: 5000 };
} else if (error.message.includes('database')) {
  // Use fallback
  return { fallback: true };
} else {
  // Escalate
  return { escalate: true, errorRecord };
}
```

---

## Part 8: Integration Testing

### Step 8.1: Test Email Flow

1. Send a test email from external address
2. Monitor workflow execution
3. Verify:
   - Email is received
   - Enrichment works
   - AI generates response
   - Card sent to Teams
   - Data logged to database

### Step 8.2: Test Teams Interaction

1. Click "Helpful" button in Teams card
2. Verify feedback is logged
3. Test "Accept & Send" action
4. Verify email is sent

### Step 8.3: Test Error Handling

1. Disable database temporarily
2. Verify error is handled gracefully
3. Check user notification
4. Enable database
5. Retry workflow

---

## Part 9: Deployment Checklist

- [ ] All nodes added and configured
- [ ] Database tables created
- [ ] API connections tested
- [ ] Error handlers in place
- [ ] Logging working
- [ ] Teams messages sending
- [ ] Feedback collection working
- [ ] Performance acceptable (< 5s per email)
- [ ] Security: API keys stored securely
- [ ] Documentation updated
- [ ] Team trained on new features
- [ ] Monitoring setup

---

## Summary

This implementation guide provides a production-ready enhancement to your Outlook-Teams assistant while **preserving all existing functionality**. The system now features:

✅ Intelligent email analysis with urgency detection
✅ Conversation context and memory
✅ GraphRAG knowledge integration
✅ Rich Teams messaging with interactive cards
✅ Comprehensive error handling
✅ Quality feedback loop for continuous improvement
✅ Complete audit trail and logging

Follow these steps sequentially, test each phase, and you'll have an enterprise-grade AI assistant.

