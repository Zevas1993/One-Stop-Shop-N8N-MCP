# 🤖 AI Email Agent with Teams Bot - Setup Guide

## Overview

This workflow creates an intelligent email assistant that:
- **Monitors** your Outlook inbox for new emails
- **Learns** your writing style from previous responses
- **Generates** personalized draft replies using AI
- **Notifies** you via Microsoft Teams with the draft
- **Allows** you to approve, edit, or reject responses through Teams chat

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     EMAIL MONITORING FLOW                        │
│                                                                   │
│  [Outlook Trigger] ──► [Get Email History] ──► [Style Analysis] │
│         │                                              │          │
│         └──────────────────────────────────────────────┘          │
│                              │                                    │
│                              ▼                                    │
│                    [AI Response Generator]                        │
│                              │                                    │
│                              ▼                                    │
│                    [Create Draft in Outlook]                      │
│                              │                                    │
│                              ▼                                    │
│                    [Notify via Microsoft Teams]                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    TEAMS BOT COMMAND FLOW                        │
│                                                                   │
│  [Teams Message] ──► [Parse Command] ──► [Execute Action]       │
│                                                │                  │
│                                   ┌────────────┼────────────┐    │
│                                   │            │            │    │
│                              [Approve]     [Edit]      [Reject]  │
│                                   │            │            │    │
│                              [Send Email] [Update Draft] [Skip]  │
│                                   │            │                 │
│                              [Confirm via Teams] ◄───────┘       │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### 1. **Intelligent Style Learning**
The workflow analyzes your previous email responses to learn:
- **Tone**: Professional, friendly, casual, formal
- **Length**: Average response length
- **Structure**: Greeting patterns, paragraph style, closing phrases
- **Language**: Common phrases, technical terms, industry jargon
- **Personality**: Enthusiastic, matter-of-fact, empathetic

### 2. **Context-Aware Responses**
- Retrieves 30 days of email history with each sender
- Understands conversation context
- Maintains consistent communication style
- References previous interactions when relevant

### 3. **Teams Bot Interface**
Business owners can interact with the AI agent directly through Microsoft Teams:

**Commands:**
- `approve` - Send the AI-generated draft immediately
- `edit [your changes]` - Modify the draft response
- `reject` - Discard draft and handle manually

**Notifications:**
- Email preview with sender information
- AI-generated draft response
- Easy approval workflow
- Confirmation when actions complete

### 4. **Safety Features**
- All responses saved as **drafts** first (never auto-sends)
- Human review required before sending
- Edit capability for fine-tuning
- Full conversation context provided

## Prerequisites

### Required n8n Credentials

1. **Microsoft Outlook (OAuth2)**
   - Required scopes: `Mail.Read`, `Mail.ReadWrite`, `Mail.Send`
   - Used for: Email monitoring, drafts, sending

2. **Microsoft Teams (OAuth2)**
   - Required scopes: `Chat.ReadWrite`, `ChannelMessage.Read.All`
   - Used for: Bot notifications and command processing

3. **OpenAI API**
   - Model: GPT-4o (or GPT-4o-mini for lower cost)
   - Used for: AI response generation

### Environment Variables

Add to your n8n environment:

```bash
# Microsoft Teams Chat ID (where bot sends notifications)
TEAMS_BUSINESS_OWNER_CHAT_ID=your-teams-chat-id-here
```

**To get your Teams Chat ID:**
1. Open Microsoft Teams web version
2. Navigate to the chat where you want notifications
3. Copy the chat ID from the URL: `https://teams.microsoft.com/l/chat/{CHAT_ID}/...`

## Installation Steps

### Step 1: Import Workflow

**Option A: Manual Import**
1. Go to n8n: `http://localhost:5678`
2. Click **"Workflows"** → **"Add Workflow"** → **"Import from File"**
3. Select `workflows/ai-email-agent-teams-bot.json`

**Option B: Via n8n CLI**
```bash
cd "C:\Users\Chris Boyd\Documents\MCP-Servers\One-Stop-Shop-N8N-MCP"
node scripts/create-ai-email-workflow.js
```

**Option C: Via MCP Server**
```javascript
// Using the n8n MCP v3.0.0 tools
workflow_management({
  action: "create",
  name: "AI Email Agent with Teams Bot",
  workflowJson: "<contents-of-json-file>"
})
```

### Step 2: Configure Credentials

1. **Microsoft Outlook**
   - Node: "Monitor New Emails", "Get Previous Email History", "Create Draft Reply"
   - Click credential dropdown → "Create New Credential"
   - Select "Microsoft Outlook OAuth2"
   - Follow OAuth flow to authenticate
   - Test connection

2. **Microsoft Teams**
   - Nodes: "Notify via Teams", "Teams Bot - Owner Commands", etc.
   - Click credential dropdown → "Create New Credential"
   - Select "Microsoft Teams OAuth2"
   - Follow OAuth flow to authenticate
   - Test connection

3. **OpenAI**
   - Node: "OpenAI GPT-4o Model"
   - Click credential dropdown → "Create New Credential"
   - Enter your OpenAI API key
   - Test connection

### Step 3: Configure Teams Chat ID

1. Open the workflow in n8n editor
2. Find all **Microsoft Teams nodes**
3. Update the `chatId` parameter:
   - Change from: `={{ $env.TEAMS_BUSINESS_OWNER_CHAT_ID }}`
   - To your actual Teams Chat ID (or set the environment variable)

### Step 4: Customize AI Behavior

**In the "AI Response Generator" node:**

```javascript
// System Message (adjust to your preferences)
{
  "systemMessage": "You are an AI email assistant that learns from previous email responses to match the business owner's writing style perfectly. You analyze:\n\n1. **Tone & Voice**: Professional, friendly, casual, or formal\n2. **Length**: Concise vs detailed responses\n3. **Structure**: Greetings, closings, paragraph style\n4. **Language**: Technical terms, industry jargon, common phrases\n5. **Personality**: Enthusiastic, matter-of-fact, empathetic\n\nYour goal is to generate responses that are indistinguishable from the business owner's actual replies..."
}
```

**Customize:**
- Tone preferences (more/less formal)
- Response length targets
- Specific phrases to include/avoid
- Industry-specific terminology
- Signature format

### Step 5: Test the Workflow

1. **Test Email Monitoring:**
   - Click "Test Workflow" button
   - Send a test email to your Outlook
   - Verify the trigger activates

2. **Test Style Analysis:**
   - Check that previous emails are retrieved
   - Verify style profile is generated correctly
   - Review in the execution logs

3. **Test AI Generation:**
   - Verify OpenAI generates appropriate response
   - Check draft is created in Outlook
   - Confirm Teams notification is sent

4. **Test Teams Bot:**
   - Reply "approve" in Teams
   - Verify email is sent
   - Check confirmation message

5. **Test Edit Command:**
   - Reply "edit Here's my modification"
   - Verify draft is updated
   - Check Teams confirmation

### Step 6: Activate the Workflow

1. Click the **"Active"** toggle in the top-right
2. Workflow will now run automatically every minute
3. Monitor executions in the "Executions" tab

## Usage Guide

### For Business Owners

1. **Receive Notification:**
   When a new email arrives, you'll get a Teams message with:
   - Sender name and email
   - Subject line
   - Message preview (first 200 characters)
   - Full AI-generated draft response

2. **Review the Draft:**
   - Read the AI-generated response
   - Check if it matches your style
   - Verify it addresses all points

3. **Take Action:**

   **To Send Immediately:**
   ```
   approve
   ```

   **To Edit First:**
   ```
   edit Here's my updated response text...
   ```

   **To Handle Manually:**
   ```
   reject
   ```
   (Draft will remain in your Outlook Drafts folder)

4. **Get Confirmation:**
   - Teams bot confirms your action
   - Email status updated (sent/edited/skipped)

### Tips for Best Results

1. **Build Style Profile:**
   - The more previous emails, the better the AI learns
   - Send 10-20 emails manually first to establish patterns
   - Diverse examples help (different scenarios, recipients)

2. **Review Initially:**
   - Always review first 10-20 AI responses carefully
   - Edit as needed to refine the style
   - The AI learns from corrections over time

3. **Use Edit Feature:**
   - Don't be afraid to modify responses
   - Small edits help fine-tune the AI's understanding
   - Your edits become part of the style profile

4. **Check Drafts Folder:**
   - All responses saved as drafts first
   - You can always review in Outlook
   - Manual review option available

## Workflow Node Details

### Email Monitoring Component

**1. Monitor New Emails (Trigger)**
- Type: Microsoft Outlook Trigger
- Frequency: Every minute
- Output: Raw email data
- Filters: None (monitors all incoming)

**2. Get Previous Email History**
- Type: Microsoft Outlook
- Operation: Get All Messages
- Filters: From same sender, last 30 days
- Limit: 50 emails
- Purpose: Build conversation context

**3. Analyze Email Style (Code Node)**
- Input: Current email + previous emails
- Processing:
  - Filters for your previous replies
  - Extracts style characteristics
  - Calculates average length
  - Determines tone (professional/enthusiastic)
  - Creates style profile
- Output: Structured style data

### AI Response Generation

**4. OpenAI GPT-4o Model**
- Model: `gpt-4o` (or `gpt-4o-mini`)
- Temperature: 0.7 (balanced creativity/consistency)
- Max Tokens: 500 (adjustable)
- Purpose: Powers the AI agent

**5. AI Response Generator (Agent)**
- Type: LangChain Agent
- Input: Email context + style profile
- System Message: Detailed style-matching instructions
- Output: Generated email response

**6. Create Draft Reply**
- Type: Microsoft Outlook
- Operation: Create Draft
- Fields:
  - To: Original sender
  - Subject: "RE: [original subject]"
  - Body: AI-generated response
  - In-Reply-To: Original message ID

### Teams Bot Interface

**7. Notify via Teams**
- Type: Microsoft Teams
- Operation: Send Message
- Target: Business owner chat
- Content: Email summary + draft + commands

**8. Teams Bot - Owner Commands (Trigger)**
- Type: Microsoft Teams Trigger
- Event: Channel Message
- Filters: Messages from business owner
- Purpose: Listen for commands

**9. Check Command Type (IF Node)**
- Condition: Message contains "approve"
- True: Route to approval flow
- False: Route to edit/reject flow

**10. Get Latest Draft**
- Type: Microsoft Outlook
- Operation: Get All Messages
- Folder: Drafts
- Sort: Most recent first
- Limit: 1

**11. Send Approved Email**
- Type: Microsoft Outlook
- Operation: Send Message
- Input: Draft message ID
- Action: Sends the email

**12. Handle Edit/Reject (Code Node)**
- Input: Teams message
- Processing:
  - Parse command type
  - Extract edited content (if edit command)
  - Prepare update data
- Output: Action + content

**13. Update Draft with Edits**
- Type: Microsoft Outlook
- Operation: Update Message
- Fields: Body content
- Input: Edited text from Teams

**14. Confirm to Teams**
- Type: Microsoft Teams
- Operation: Send Message
- Content: Confirmation of action taken

## Customization Options

### Adjust Response Style

**In "AI Response Generator" node:**

```javascript
// Prompt adjustments
{
  "text": "=Generate a professional email reply...\n\n**Style Guidelines:**\n- Keep responses under 200 words\n- Always include a call-to-action\n- Use bullet points for clarity\n- End with specific next steps\n..."
}
```

### Change Monitoring Frequency

**In "Monitor New Emails" node:**

```javascript
// Change from every minute to every 5 minutes
{
  "pollTimes": {
    "item": [
      {
        "mode": "custom",
        "cronExpression": "*/5 * * * *"
      }
    ]
  }
}
```

### Filter by Sender/Subject

**In "Monitor New Emails" node:**

```javascript
// Only monitor specific senders
{
  "filters": {
    "sender": "important-client@company.com,vip@partner.com"
  }
}
```

### Adjust Email History Depth

**In "Get Previous Email History" node:**

```javascript
// Change from 30 days to 90 days
{
  "filtersUI": {
    "values": {
      "search": "from:{{ ... }} AND received>=90 days ago"
    }
  }
}
```

## Troubleshooting

### Common Issues

**1. Workflow not triggering:**
- Check workflow is active (toggle on)
- Verify Outlook credentials are valid
- Check n8n has internet access
- Review execution logs for errors

**2. Teams notifications not sent:**
- Verify Teams credentials
- Check TEAMS_BUSINESS_OWNER_CHAT_ID is correct
- Ensure bot has chat permissions
- Test with manual execution first

**3. AI responses generic/off-style:**
- Increase email history limit (more examples)
- Review system message instructions
- Adjust temperature (lower = more consistent)
- Manually send more diverse emails first

**4. "Approve" command not working:**
- Check Teams trigger is active
- Verify command spelling (case-insensitive)
- Review IF node conditions
- Check execution logs for trigger events

**5. Drafts not created:**
- Verify Outlook "Mail.ReadWrite" permission
- Check draft folder exists
- Review Outlook node configuration
- Test with manual workflow execution

### Debug Mode

Enable detailed logging:

1. Go to **Settings** → **Log Streaming**
2. Set level to **debug**
3. Run workflow
4. Review detailed logs

### Test Individual Nodes

1. Click on any node
2. Click "Execute Node" button
3. Review output in the panel
4. Verify data structure matches expectations

## Security Considerations

1. **API Key Security:**
   - Store OpenAI key in n8n credentials (encrypted)
   - Never commit API keys to version control
   - Rotate keys periodically

2. **OAuth Token Security:**
   - n8n handles token refresh automatically
   - Tokens encrypted in database
   - Review scopes regularly

3. **Email Content:**
   - Drafts stored in your Outlook (your tenant)
   - AI-generated content reviewed before sending
   - No data sent to third parties except OpenAI

4. **Teams Messages:**
   - Bot only accesses specified chat
   - Messages deleted per Teams retention policy
   - No message history stored in n8n

## Performance Optimization

### Reduce API Costs

**Use GPT-4o-mini instead of GPT-4o:**
- 10x cheaper per token
- Still excellent for email responses
- Change in "OpenAI GPT-4o Model" node

**Reduce Temperature:**
```javascript
{
  "options": {
    "temperature": 0.5  // More consistent, less creative
  }
}
```

**Limit Email History:**
```javascript
{
  "limit": 20  // Reduce from 50 to 20
}
```

### Improve Response Time

**Parallel Processing:**
- Email history retrieval happens in background
- Style analysis cached where possible

**Reduce Polling Frequency:**
- Change from every 1 minute to every 5 minutes
- Reduces n8n execution count
- Still responsive for most use cases

## Advanced Scenarios

### Multiple Business Owners

Create separate workflows for each owner:

1. Duplicate workflow
2. Update Teams chat ID
3. Update Outlook account credentials
4. Adjust style analysis for each owner

### Priority Email Handling

Add filtering logic:

```javascript
// In "Check Command Type" node
{
  "conditions": {
    "combinator": "or",
    "conditions": [
      {
        "leftValue": "={{ $json.subject.toLowerCase() }}",
        "rightValue": "urgent",
        "operator": "contains"
      },
      {
        "leftValue": "={{ $json.from.emailAddress.address }}",
        "rightValue": "vip@company.com",
        "operator": "equals"
      }
    ]
  }
}
```

### Escalation Logic

Add conditional routing:

```javascript
// After style analysis, add IF node
if (emailRequiresSpecialHandling) {
  // Route to manual review
} else {
  // Route to AI generation
}
```

### Multi-Language Support

Update AI prompt:

```javascript
{
  "systemMessage": "...Detect the language of incoming emails and respond in the same language..."
}
```

## Maintenance

### Regular Tasks

**Weekly:**
- Review AI-generated responses quality
- Check execution error rate
- Monitor OpenAI API usage/costs

**Monthly:**
- Review and update style examples
- Adjust system prompts if needed
- Check Teams bot permissions
- Verify Outlook credentials valid

**Quarterly:**
- Analyze response accuracy metrics
- Update AI model version if available
- Review security scopes and permissions
- Optimize workflow performance

## Support & Resources

### Documentation
- [n8n Documentation](https://docs.n8n.io)
- [OpenAI API Reference](https://platform.openai.com/docs)
- [Microsoft Graph API](https://docs.microsoft.com/en-us/graph/)

### Community
- [n8n Community Forum](https://community.n8n.io)
- [n8n Discord](https://discord.gg/n8n)

### Commercial Support
- [n8n Cloud](https://n8n.io/cloud)
- Professional services available

## License

This workflow is provided as-is under MIT License. Feel free to modify and adapt to your needs.

---

## Quick Start Checklist

- [ ] Import workflow into n8n
- [ ] Configure Microsoft Outlook credentials
- [ ] Configure Microsoft Teams credentials
- [ ] Configure OpenAI API credentials
- [ ] Set TEAMS_BUSINESS_OWNER_CHAT_ID environment variable
- [ ] Test email monitoring trigger
- [ ] Test AI response generation
- [ ] Test Teams bot commands
- [ ] Customize AI system message
- [ ] Activate workflow
- [ ] Monitor first 10 executions
- [ ] Adjust settings based on results

## Success Metrics

Track these metrics to measure effectiveness:

1. **Response Quality:**
   - % of drafts approved without edits
   - Average edit count per draft
   - Business owner satisfaction rating

2. **Time Savings:**
   - Average time from email receipt to response
   - Number of emails handled per day
   - Time saved vs manual responses

3. **Accuracy:**
   - % of responses requiring major edits
   - Style consistency score
   - Tone match accuracy

4. **Efficiency:**
   - API costs per email
   - Workflow execution time
   - Resource utilization

---

**Created by:** AI Assistant
**Version:** 1.0.0
**Last Updated:** October 2, 2025
**Compatible with:** n8n v1.113.3+, GPT-4o, Microsoft Graph API v1.0
