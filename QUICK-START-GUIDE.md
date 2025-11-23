# QUICK START GUIDE - Workflow Enhancement

**Goal:** Transform the current 21-node workflow into a fully-featured 29-node workflow with Teams, Calendar, and enhanced security.

**Time Required:** 13-18 hours total (can be spread over 1-2 weeks)

---

## ⚡ TL;DR - What You Need to Know

**Current Problems:**
- ❌ System prompt promises Teams integration → NOT IMPLEMENTED
- ❌ System prompt promises Calendar functions → NOT IMPLEMENTED
- ❌ Attachments detected but never downloaded → INCOMPLETE
- ❌ Webhook has no authentication → SECURITY RISK

**Solution:**
- ✅ Add 8 new verified nodes (all specs confirmed from n8n source)
- ✅ Enable 3 new AI tools (Teams, Calendar Check, Calendar Create)
- ✅ Implement attachment processing
- ✅ Secure webhook with Bearer token auth

**Result:**
- ✅ System prompt 100% accurate (currently 60%)
- ✅ Feature parity with expectations
- ✅ Production-ready security
- ✅ Team visibility via Teams notifications

---

## 📋 Pre-Flight Checklist

Before you start:

### 1. Access & Permissions
- [ ] n8n instance admin access
- [ ] Azure App Registration admin access
- [ ] Ability to add OAuth scopes
- [ ] Microsoft 365 admin consent rights (or request from admin)

### 2. Information Gathering
- [ ] Current workflow JSON backed up
- [ ] Teams Team ID identified
- [ ] Teams channel IDs identified (urgent + business)
- [ ] Webhook endpoint URL documented

### 3. Tool Preparation
- [ ] Terminal/PowerShell access
- [ ] OpenSSL installed (for token generation)
- [ ] Text editor for environment variables
- [ ] Workflow editor access in n8n

---

## 🚀 Implementation Phases

### PHASE 1: Calendar Integration (Start Here!)

**Why First:** Highest value, lowest risk, no external dependencies

**Time:** 2-3 hours

**Steps:**

1. **Update Outlook OAuth Credential**
   ```
   n8n → Credentials → microsoftOutlookOAuth2Api
   → Add Scope: Calendars.ReadWrite
   → Re-authenticate
   ```

2. **Add Calendar Availability Tool**
   - Copy from: `NEW-NODES-CONFIGURATIONS.json` → `calendar-availability-tool`
   - Position: Below Search Emails Tool
   - Connect to: Main Email Assistant (ai_tool connection)

3. **Add Calendar Create Event Tool**
   - Copy from: `NEW-NODES-CONFIGURATIONS.json` → `calendar-create-event-tool`
   - Position: Below Calendar Availability Tool
   - Connect to: Main Email Assistant (ai_tool connection)

4. **Update Main Agent Prompt**
   - Copy from: `NEW-NODES-CONFIGURATIONS.json` → `updated_agent_prompts.main-email-assistant`
   - Paste into: Main Email Assistant → System Message

5. **Test**
   ```bash
   # Via webhook
   curl -X POST https://your-n8n/webhook/email-assistant \
     -H "Content-Type: application/json" \
     -d '{"message": "What is my availability tomorrow?"}'
   ```

**Success Criteria:**
- ✅ Agent responds with calendar events or "You're free all day"
- ✅ Can create events: "Schedule meeting tomorrow at 2pm"
- ✅ No errors in execution log

---

### PHASE 2: Attachment Handling

**Why Next:** Completes email processing, no OAuth changes needed

**Time:** 3-4 hours

**Steps:**

1. **Add Check Attachments Node**
   - Copy from: `NEW-NODES-CONFIGURATIONS.json` → `check-attachments`
   - Position: After Extract Email Metadata
   - Input: Extract Email Metadata
   - Output (no_attachments): AI Email Classifier
   - Output (has_attachments): Download Attachments (next step)

2. **Add Download Attachments Node**
   - Copy from: `NEW-NODES-CONFIGURATIONS.json` → `download-attachments`
   - Position: Below Check Attachments
   - Input: Check Attachments (has_attachments)
   - Output: AI Email Classifier (merge path)

3. **Test**
   - Send email with PDF attachment to your Outlook
   - Trigger manual email processing
   - Check execution: Verify attachment node executed
   - Check output: Binary data should be present

**Success Criteria:**
- ✅ Emails without attachments skip download node
- ✅ Emails with attachments download all files
- ✅ Binary data visible in execution log
- ✅ Workflow continues to classifier regardless

---

### PHASE 3: Teams Integration

**Why Next:** High business value, requires new OAuth setup

**Time:** 4-5 hours

**Steps:**

1. **Create Teams OAuth Credential**
   ```
   n8n → Credentials → Add Credential → Microsoft Teams OAuth2 API

   Required Scopes:
   - Channel.ReadBasic.All
   - ChannelMessage.Send
   - Team.ReadBasic.All
   - offline_access

   → Authenticate
   → Save
   ```

2. **Get Teams IDs**
   ```
   Teams Team ID:
   - Open Teams web app
   - Click team name
   - Click "Get link to team"
   - Extract ID from URL: https://teams.microsoft.com/l/team/TEAM_ID_HERE/...

   Channel IDs:
   - Right-click channel → Get link to channel
   - Extract ID from URL: 19:CHANNEL_ID_HERE@thread.tacv2
   ```

3. **Set Environment Variables**
   ```bash
   # In n8n settings or .env file
   TEAMS_TEAM_ID=your-team-id
   TEAMS_URGENT_CHANNEL_ID=19:urgent-channel-id@thread.tacv2
   TEAMS_BUSINESS_CHANNEL_ID=19:business-channel-id@thread.tacv2
   ```

4. **Add Teams Channel Tool**
   - Copy from: `NEW-NODES-CONFIGURATIONS.json` → `teams-channel-tool`
   - Position: With other AI tools
   - Connect to: Main Email Assistant (ai_tool connection)
   - Credential: Select Teams OAuth credential

5. **Add Teams Urgent Notification**
   - Copy from: `NEW-NODES-CONFIGURATIONS.json` → `teams-urgent-notify`
   - Position: After Update Email Categories
   - Input: Update Email Categories
   - Credential: Select Teams OAuth credential

6. **Add Teams Business Notification**
   - Copy from: `NEW-NODES-CONFIGURATIONS.json` → `teams-business-notify`
   - Position: After Business Inquiry Agent
   - Input: Business Inquiry Agent
   - Credential: Select Teams OAuth credential

7. **Update Business Agent Prompt**
   - Copy from: `NEW-NODES-CONFIGURATIONS.json` → `updated_agent_prompts.business-inquiry-agent`
   - Paste into: Business Inquiry Agent → System Message

8. **Test**
   ```bash
   # Test AI tool
   curl -X POST https://your-n8n/webhook/email-assistant \
     -H "Content-Type: application/json" \
     -d '{"message": "Post to Teams that testing is complete"}'

   # Test automatic notifications
   # Send urgent email to yourself → should appear in Teams
   ```

**Success Criteria:**
- ✅ Can post to Teams via chat: "Post to Teams that X"
- ✅ Urgent emails trigger Teams notification
- ✅ Business inquiries post to business channel
- ✅ Messages formatted correctly in Teams

---

### PHASE 4: Security Enhancement

**Why Next:** Critical before activation, simple to implement

**Time:** 1-2 hours

**Steps:**

1. **Generate Secure Token**
   ```bash
   # Generate 256-bit random token
   openssl rand -base64 32

   # Example output: XYZ123abc456DEF789ghi012JKL345mno678PQR901stu234=
   ```

2. **Set Environment Variable**
   ```bash
   # In n8n settings or .env file
   WEBHOOK_AUTH_TOKEN=XYZ123abc456DEF789ghi012JKL345mno678PQR901stu234=
   ```

3. **Add Webhook Auth Node**
   - Copy from: `NEW-NODES-CONFIGURATIONS.json` → `webhook-auth`
   - Position: Between Open WebUI Webhook and Parse Chat Input
   - Input: Open WebUI Chat Interface
   - Output: Parse Chat Input

4. **Update Client (Open WebUI)**
   ```javascript
   // In Open WebUI webhook configuration
   headers: {
     "Content-Type": "application/json",
     "Authorization": "Bearer XYZ123abc456DEF789ghi012JKL345mno678PQR901stu234="
   }
   ```

5. **Test**
   ```bash
   # Should succeed
   curl -X POST https://your-n8n/webhook/email-assistant \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN_HERE" \
     -d '{"message": "Hello"}'

   # Should fail with 401
   curl -X POST https://your-n8n/webhook/email-assistant \
     -H "Content-Type: application/json" \
     -d '{"message": "Hello"}'
   ```

**Success Criteria:**
- ✅ Requests with valid token succeed
- ✅ Requests without token fail with clear error
- ✅ Requests with wrong token fail with clear error
- ✅ Token stored securely in environment variables

---

### PHASE 5: Testing & Activation

**Why Last:** Comprehensive validation before production

**Time:** 3-4 hours

**Steps:**

1. **Unit Tests - Each New Node**
   - [ ] Calendar Availability: Returns events
   - [ ] Calendar Create: Creates event
   - [ ] Teams Channel Tool: Posts message
   - [ ] Teams Urgent: Notifies on urgent email
   - [ ] Teams Business: Notifies on business email
   - [ ] Check Attachments: Routes correctly
   - [ ] Download Attachments: Downloads files
   - [ ] Webhook Auth: Blocks unauthorized

2. **Integration Tests - End to End**
   - [ ] Chat → Calendar Check → Response
   - [ ] Chat → Create Meeting → Calendar Event
   - [ ] Chat → Post Teams → Message Appears
   - [ ] Email (urgent) → Teams Notification
   - [ ] Email (business) → Agent + Teams
   - [ ] Email (with attachment) → Download

3. **Performance Tests**
   - [ ] Process 15 emails in one batch
   - [ ] Verify execution time < 3 minutes
   - [ ] Check memory usage acceptable
   - [ ] No timeout errors

4. **Security Audit**
   - [ ] Webhook requires token
   - [ ] OAuth tokens refreshing
   - [ ] No credentials in logs
   - [ ] Error messages safe

5. **Activate Workflow**
   ```
   n8n → Workflows → Ultimate Outlook AI Assistant
   → Toggle "Active" to ON
   → Monitor executions tab
   ```

6. **Monitor First 10 Executions**
   - Watch for errors
   - Verify Teams notifications
   - Check calendar operations
   - Validate attachment processing

**Success Criteria:**
- ✅ All 29 nodes show green in execution
- ✅ Zero errors in first 5 executions
- ✅ All features working as documented
- ✅ Performance acceptable (<5s chat, <3min batch)

---

## 🔧 Troubleshooting

### Common Issues

#### "Invalid OAuth token"
- **Solution:** Re-authenticate credentials in n8n
- **Check:** Azure app permissions granted admin consent

#### "Channel not found" in Teams
- **Solution:** Verify channel ID format: `19:xxxxx@thread.tacv2`
- **Check:** Bot has access to channel (add manually if needed)

#### "Webhook auth fails even with correct token"
- **Solution:** Check environment variable is set and n8n restarted
- **Check:** Token has no extra spaces or quotes

#### "Calendar events not creating"
- **Solution:** Verify `Calendars.ReadWrite` scope granted
- **Check:** Date/time format is ISO 8601

#### "Attachments not downloading"
- **Solution:** Verify message ID is correct
- **Check:** Email actually has attachments (hasAttachments = true)

### Getting Help

1. **Check Execution Logs**
   - n8n → Executions → Click failed execution
   - Review error message
   - Check node input/output data

2. **Verify Configuration**
   - Compare with `NEW-NODES-CONFIGURATIONS.json`
   - Check all environment variables set
   - Verify OAuth credentials authenticated

3. **Review Documentation**
   - `ENHANCED-WORKFLOW-PLAN.md` - Detailed specs
   - `ENHANCED-WORKFLOW-DIAGRAM.md` - Visual reference
   - `WORKFLOW-ENHANCEMENT-SUMMARY.md` - Executive overview

---

## 📊 Progress Tracking

Use this checklist to track implementation:

### Phase 1: Calendar ☐
- [ ] Outlook OAuth scope updated
- [ ] Calendar Availability Tool added
- [ ] Calendar Create Event Tool added
- [ ] Main Agent prompt updated
- [ ] Tested and working

### Phase 2: Attachments ☐
- [ ] Check Attachments node added
- [ ] Download Attachments node added
- [ ] Connections configured
- [ ] Tested with real attachments
- [ ] Verified binary data

### Phase 3: Teams ☐
- [ ] Teams OAuth credential created
- [ ] Teams/Channel IDs obtained
- [ ] Environment variables set
- [ ] Teams Channel Tool added
- [ ] Teams Urgent Notification added
- [ ] Teams Business Notification added
- [ ] Business Agent prompt updated
- [ ] Tested all notification paths

### Phase 4: Security ☐
- [ ] Auth token generated
- [ ] Environment variable set
- [ ] Webhook Auth node added
- [ ] Client updated with token
- [ ] Tested auth success/failure

### Phase 5: Testing ☐
- [ ] Unit tests completed
- [ ] Integration tests completed
- [ ] Performance tests completed
- [ ] Security audit completed
- [ ] Workflow activated
- [ ] First 10 executions monitored

---

## 🎯 Success Metrics

After implementation, you should be able to:

### Via Chat Interface
✅ "What's my availability tomorrow?" → Shows calendar
✅ "Schedule meeting with john@example.com at 2pm" → Creates event
✅ "Post to Teams that deployment is complete" → Message appears
✅ "Show emails from Sarah" → Returns search results
✅ "Create draft response to latest email" → Draft created

### Via Email Processing
✅ Urgent email → Teams notification within 1 minute
✅ Business inquiry → AI analysis + Teams post
✅ Email with PDF → Attachment downloaded
✅ Spam email → Moved to junk folder
✅ All emails → Categorized correctly

### Security & Performance
✅ Unauthorized webhooks → Blocked (401 error)
✅ Chat response time → <5 seconds average
✅ Batch processing → <3 minutes for 15 emails
✅ Zero security vulnerabilities
✅ No data leakage in logs

---

## 📝 Post-Implementation

### Document Your Setup
- [ ] Record all environment variables used
- [ ] Save OAuth credential configurations
- [ ] Document Teams team/channel structure
- [ ] Note any customizations made

### User Training
- [ ] Share new capabilities with users
- [ ] Provide example commands
- [ ] Explain Teams notifications
- [ ] Demo calendar integration

### Ongoing Maintenance
- [ ] Monitor daily for first week
- [ ] Review execution logs weekly
- [ ] Update prompts based on usage
- [ ] Optimize as needed

---

## 🚨 Emergency Rollback

If something goes wrong:

1. **Deactivate Workflow Immediately**
   ```
   n8n → Workflows → Toggle "Active" to OFF
   ```

2. **Restore Backup**
   ```
   n8n → Workflows → Import
   → Select backup JSON from before enhancement
   → Import
   ```

3. **Identify Issue**
   - Check last execution log
   - Review error messages
   - Note which phase failed

4. **Fix or Revert**
   - Fix identified issue
   - Re-test in manual mode
   - Re-activate when stable

**Backup Location:** `teams-outlook-workflow.json` (original)

---

## ✅ Final Checklist

Before declaring "DONE":

- [ ] All 29 nodes present and connected
- [ ] All 8 new nodes tested individually
- [ ] Calendar integration working
- [ ] Teams integration working
- [ ] Attachment processing working
- [ ] Webhook security enabled
- [ ] Agent prompts updated
- [ ] Environment variables set
- [ ] OAuth credentials configured
- [ ] Workflow activated
- [ ] Documentation updated
- [ ] Users notified
- [ ] Monitoring in place

**Congratulations! Your workflow is now fully enhanced and production-ready! 🎉**

---

## 📚 Reference Documents

All files located at: `c:\Users\Chris Boyd\Documents\MCP-Servers\One-Stop-Shop-N8N-MCP\`

1. **ENHANCED-WORKFLOW-PLAN.md** - Complete technical specification (detailed)
2. **ENHANCED-WORKFLOW-DIAGRAM.md** - Visual architecture diagrams (visual)
3. **WORKFLOW-ENHANCEMENT-SUMMARY.md** - Executive summary (overview)
4. **NEW-NODES-CONFIGURATIONS.json** - Ready-to-import node configs (practical)
5. **QUICK-START-GUIDE.md** - This document (step-by-step)

---

**Questions?** Review the detailed plan in `ENHANCED-WORKFLOW-PLAN.md` or check the visual diagrams in `ENHANCED-WORKFLOW-DIAGRAM.md`.

**Ready to start?** Begin with Phase 1 (Calendar Integration) - it's the quickest win!
