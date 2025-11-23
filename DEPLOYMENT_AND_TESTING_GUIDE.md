# Deployment & Testing Guide - Outlook Teams AI Assistant

**Date**: November 23, 2025
**Status**: Workflow Updated & Ready for Testing
**MCP Server**: ✅ Running (stdio mode)

---

## 🎯 Quick Start

### Current State
- ✅ Workflow enhanced from 21 to 24 nodes
- ✅ New nodes added: Teams, Calendar, Attachments
- ✅ MCP server verified working
- ✅ All verification checks passed

### What You Need to Do Now
1. Activate the workflow in n8n UI
2. Configure Microsoft credentials (if not already done)
3. Test with a sample email
4. Monitor execution results

---

## 📋 Pre-Deployment Checklist

### ✅ Workflow Status
- [x] 24 nodes present (21 original + 3 new)
- [x] Zero duplicate nodes
- [x] Zero broken connections
- [x] All nodes enabled
- [x] MCP server verified working

### ⚠️ Configuration Required
- [ ] Microsoft Teams credentials configured
- [ ] Outlook calendar credentials verified
- [ ] Email attachment permissions set
- [ ] n8n environment variables in place
- [ ] GraphRAG connection active

### 🔐 Security Verification
- [ ] OAuth tokens active
- [ ] API keys not exposed in workflow
- [ ] Credentials stored in n8n secrets
- [ ] HTTPS enabled for n8n
- [ ] Audit logging configured

---

## 🚀 Activation Steps

### Step 1: Access n8n Web Interface
```bash
# n8n typically runs on:
http://localhost:5678

# Or your configured n8n URL
```

### Step 2: Open the Workflow
1. Log in with your n8n credentials
2. Click "Workflows" in the sidebar
3. Search for or find: `Teams-Outlook-Assistant` (ID: `2dTTm6g4qFmcTob1`)
4. Click to open the workflow editor

### Step 3: Verify Workflow Structure
1. You should see 24 nodes on the canvas:
   - Original 21 nodes (email processing, classification, agents, tools)
   - **NEW** Microsoft Teams node (right side)
   - **NEW** Outlook Calendar node (right side)
   - **NEW** Email Attachments node (right side)

2. All nodes should show **enabled** status (not grayed out)

3. Connections should flow:
   ```
   Business Inquiry Agent → [Teams, Calendar, Attachments]
   ```

### Step 4: Activate the Workflow
1. Click the **"Activate"** button in the top toolbar
2. Status should change from "INACTIVE" to "ACTIVE"
3. You should see a confirmation message
4. The workflow is now live and will trigger on incoming emails

### Step 5: Verify Activation
1. Check the workflow status shows "ACTIVE" with a green indicator
2. In the bottom right, you should see execution stats starting (if emails are incoming)

---

## 🧪 Testing Procedures

### Test 1: Basic Email Trigger Test
**Objective**: Verify the workflow processes incoming emails

**Steps**:
1. Send an email to the configured Outlook inbox
2. Navigate to the "Executions" tab in the workflow
3. You should see a new execution appear within 30 seconds
4. Click the execution to view the execution trace

**Expected Result**:
- Email parsed successfully
- Classification applied
- Agent routing triggered
- Execution completes without errors

### Test 2: Teams Integration Test
**Objective**: Verify Teams message delivery

**Preconditions**:
- Teams credentials configured in n8n
- Teams channel specified in Teams node configuration

**Steps**:
1. Send a test email with subject line: "TEST: Team inquiry"
2. Wait for workflow execution
3. Check the specified Teams channel for a message
4. Message should contain:
   - Email sender information
   - Email subject and summary
   - Recommended actions
   - Any relevant metadata

**Expected Result**:
- Teams message appears in configured channel
- Message format is readable and professional
- Interactive buttons present (if configured)

### Test 3: Calendar Integration Test
**Objective**: Verify calendar event creation

**Preconditions**:
- Outlook calendar credentials configured
- Calendar node set to create events for high-priority emails

**Steps**:
1. Send a test email with subject: "URGENT: Meeting needed"
2. Wait for workflow execution
3. Check Outlook calendar for new event
4. Event should contain:
   - Meeting title based on email subject
   - Attendees from email recipients
   - Time slot (automated or from email body)
   - Description from email content

**Expected Result**:
- Calendar event created automatically
- Event appears in Outlook calendar
- Details are populated correctly
- No conflicts detected

### Test 4: Attachment Handling Test
**Objective**: Verify email attachments are processed

**Steps**:
1. Send an email with file attachment (PDF, Word doc, image, etc.)
2. Wait for workflow execution
3. Check the attachment processing node output
4. Verify file is:
   - Extracted from email
   - Available for further processing
   - Metadata captured (filename, size, type)

**Expected Result**:
- Attachments detected and extracted
- File information logged
- Attachment data available in workflow context
- No errors in attachment processing

### Test 5: Error Handling Test
**Objective**: Verify graceful error handling

**Steps**:
1. Temporarily misconfigure Teams node (invalid channel)
2. Send a test email
3. Wait for execution
4. Check execution logs for error handling:
   - Error detected
   - System logs the issue
   - Fallback executed (if configured)
   - Other paths continue normally

**Expected Result**:
- Workflow handles error gracefully
- No cascading failures
- Error logged for debugging
- Other outputs still process

### Test 6: Load Test (Optional)
**Objective**: Verify workflow handles multiple emails

**Steps**:
1. Send 5-10 emails in rapid succession
2. Monitor execution queue
3. Check for any failed executions
4. Verify response time per email

**Expected Result**:
- All emails processed
- No queuing delays (< 5 seconds each)
- All output channels work
- No resource exhaustion

---

## 📊 Monitoring & Verification

### View Execution History
1. In the workflow editor, click **"Executions"** tab
2. You should see a list of all executions with:
   - Timestamp
   - Status (Success/Error)
   - Duration
   - Input data
   - Output data

### Check Execution Details
1. Click any execution to see the trace
2. View step-by-step execution:
   - Email trigger data
   - Parsing results
   - Classification output
   - Agent routing decision
   - Final outputs (Teams, Calendar, Attachments)

### Performance Metrics
1. Each execution shows:
   - **Duration**: Total execution time (target: < 5 seconds)
   - **Node times**: How long each node took
   - **Errors**: Any errors encountered
   - **Data throughput**: Bytes processed

### Troubleshooting Failed Executions
1. Click failed execution
2. Look for red error indicators
3. Click on error node to see error message
4. Common issues:
   - Missing credentials
   - Invalid configuration
   - API rate limits
   - Network connectivity

---

## 🔧 Configuration Guide

### Microsoft Teams Node Configuration

**If not already configured**:

1. Click the Teams node on the canvas
2. In the right panel, find **Credentials** section
3. Click **Create New Credential** or select existing
4. Configure:
   - **Connection Type**: OAuth2
   - **Client ID**: From Azure App Registration
   - **Client Secret**: From Azure App Registration
   - **Tenant ID**: Your Azure tenant ID

5. Grant permissions:
   - `Chat.Create`
   - `ChatMessage.Send`

6. Configure node parameters:
   - **Chat ID**: The Teams channel or user ID to send to
   - **Message Text**: Template for message content

### Outlook Calendar Node Configuration

**If not already configured**:

1. Click the Calendar node on the canvas
2. Configure credentials (same as other Outlook nodes)
3. Set parameters:
   - **Resource**: "calendar"
   - **Operation**: "createEvent"
   - **Event Details**: Subject, start time, attendees

### Email Attachment Node Configuration

**Verify configuration**:

1. Click the Attachments node
2. Verify parameters:
   - **Operation**: Extract attachment metadata
   - **Include file content**: Yes/No (based on use case)
   - **Storage location**: Where to store extracted files

---

## ✅ Verification Checklist

### Before Going Live
- [ ] All 24 nodes visible on canvas
- [ ] All nodes show enabled status
- [ ] Connections properly displayed
- [ ] Teams node has credentials
- [ ] Calendar node configured
- [ ] Attachment node ready
- [ ] Email trigger working (manual test)
- [ ] MCP server running

### After Activation
- [ ] Workflow status shows "ACTIVE"
- [ ] No errors in node validation
- [ ] First test email executes successfully
- [ ] Teams message appears (if Teams configured)
- [ ] Calendar event created (if Calendar configured)
- [ ] Attachments extracted (if attachment test sent)

### Production Ready
- [ ] Execution history shows successful runs
- [ ] No recurring error patterns
- [ ] Performance metrics acceptable
- [ ] All output channels working
- [ ] Team trained on new features
- [ ] Monitoring/alerting configured

---

## 🚨 Troubleshooting Guide

### Issue: Workflow Won't Activate
**Symptoms**: "Activate" button doesn't work or grayed out

**Solutions**:
1. Check node validation - click each node to see errors
2. Verify all required fields are filled
3. Check that credentials are valid
4. Try refreshing the page
5. Check n8n server logs: `npm start`

### Issue: Workflow Activated but No Executions
**Symptoms**: Emails received but workflow not triggering

**Solutions**:
1. Verify email trigger is configured correctly
2. Check which Outlook folder is monitored
3. Verify n8n has access to Outlook account
4. Check Outlook authentication
5. Look at n8n server logs for trigger errors

### Issue: Teams Message Not Sent
**Symptoms**: Workflow executes but Teams gets no message

**Solutions**:
1. Verify Teams credentials are valid
2. Check Teams node configuration (channel ID, message format)
3. Test Teams connection manually
4. Check Teams permissions for the bot
5. Review execution logs for Teams node errors

### Issue: Calendar Event Not Created
**Symptoms**: Workflow executes but no event in calendar

**Solutions**:
1. Verify Outlook calendar credentials
2. Check calendar node operation settings
3. Verify attendee email addresses are valid
4. Check calendar permissions
5. Review execution logs for calendar errors

### Issue: High Error Rate
**Symptoms**: Many executions fail or timeout

**Solutions**:
1. Check API rate limits
2. Verify network connectivity
3. Check credential expiration
4. Review GraphRAG connection status
5. Monitor server resource usage

---

## 📈 Performance Targets

### Expected Performance
| Metric | Target | Notes |
|--------|--------|-------|
| Email trigger latency | 1-5 seconds | Time from email arrival to workflow start |
| Execution duration | < 10 seconds | Total time for full workflow |
| Teams delivery | < 5 seconds | From workflow completion to Teams |
| Calendar sync | < 3 seconds | From workflow completion to calendar |
| Success rate | > 95% | Percentage of successful executions |
| Error recovery | Automatic | Graceful handling of transient errors |

### Monitoring Commands

**View recent executions**:
```bash
# Via n8n UI: Workflows → Select workflow → Executions
# Via API (if available):
curl http://localhost:5678/api/v1/executions?workflowId=2dTTm6g4qFmcTob1
```

**Check workflow status**:
```bash
# Via n8n UI: Look for green "ACTIVE" indicator
# Via API:
curl http://localhost:5678/api/v1/workflows/2dTTm6g4qFmcTob1
```

---

## 📞 Support & Next Steps

### If All Tests Pass ✅
Congratulations! The workflow is ready for production use:
1. Team can start using Teams integration
2. Calendar events auto-created for important inquiries
3. Email attachments automatically processed
4. Full AI-powered email assistance active

### If Issues Arise ⚠️
1. Check troubleshooting guide above
2. Review execution logs in n8n UI
3. Consult the detailed analysis: `TEAMS-OUTLOOK-WORKFLOW-ANALYSIS.md`
4. Check MCP server logs: `npm start`

### Advanced Customization

Want to enhance further? See:
- `OUTLOOK_TEAMS_AI_ASSISTANT_PLAN.md` - Strategic enhancements
- `IMPLEMENTATION_GUIDE_OUTLOOK_TEAMS.md` - Technical deep dive
- `OUTLOOK_TEAMS_QUICK_REFERENCE.md` - Quick reference guide

---

## 📊 Summary

**Current Status**: ✅ Workflow deployed and ready for testing
**MCP Server**: ✅ Verified working
**Next Action**: Activate workflow in n8n UI and run tests

**Estimated time to production**: 1-2 hours (after testing)

---

**Created**: November 23, 2025
**Last Updated**: November 23, 2025
**Status**: Ready for Deployment

