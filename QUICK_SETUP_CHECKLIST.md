# Quick Setup Checklist
## Get Your Outlook AI Assistant Running in Minutes

### Step 1: Environment Setup (5 minutes)

```bash
# Create .env file in your project root
cat > .env << 'EOF'
N8N_API_URL=http://localhost:5678/api/v1
N8N_API_KEY=your_api_key_here
DEBUG=false
EOF
```

**Get your API key**:
1. Open n8n: http://localhost:5678
2. Go to: Settings → API → API Keys
3. Click: "Create"
4. Set permissions: `workflow:read`, `workflow:write`, `workflow:execute`, `execution:read`
5. Copy the key to `.env`

### Step 2: Microsoft Outlook Authentication (10 minutes)

**In Azure Portal**:
1. Register new app → Azure AD → App registrations
2. Create credentials:
   - Client ID: [copy this]
   - Client Secret: [copy this]
3. Add permissions: Mail.Read, Mail.Send, Mail.ReadWrite
4. Save credentials

**In n8n UI**:
1. Open workflow: http://localhost:5678/workflow/Zp2BYxCXj9FeCZfi
2. For each Outlook node:
   - Click: "Authenticate"
   - Paste: Client ID and Client Secret
   - Save

### Step 3: OpenAI Configuration (5 minutes)

1. Get API key from: https://platform.openai.com/api-keys
2. In n8n UI, for OpenAI nodes:
   - Click: "Authenticate"
   - Paste: API key
   - Save

### Step 4: Test Execution (5 minutes)

**Via n8n UI**:
1. Open workflow: http://localhost:5678/workflow/Zp2BYxCXj9FeCZfi
2. Click: "Execute Workflow"
3. Input test data:
   ```json
   {
     "message": "Check my inbox",
     "sessionId": "test-session",
     "userId": "test-user"
   }
   ```
4. Click: "Execute"
5. View results in execution panel

**Via API**:
```bash
curl -X POST http://localhost:5678/api/v1/executions \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "Zp2BYxCXj9FeCZfi",
    "data": {"message": "Check inbox"}
  }'
```

---

## Configuration Reference

### Critical Configuration Points

| Component | Setting | Value |
|-----------|---------|-------|
| n8n Instance | API URL | `http://localhost:5678/api/v1` |
| n8n Auth | API Key | From Settings → API |
| Outlook | Client ID | From Azure AD |
| Outlook | Client Secret | From Azure AD |
| OpenAI | API Key | From platform.openai.com |
| LangChain | Model | `gpt-4` or `gpt-3.5-turbo` |

### Workflow Node Overview

```
┌─────────────────────┐
│ Webhook Trigger     │ ← Receives chat messages
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Parse Input         │ ← Extracts message data
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Get Emails          │ ← Fetches from Outlook
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ Process Each Email  │ ← Batch processing
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ AI Classifier       │ ← Categorizes content
└──────────┬──────────┘
           │
       ┌───┴───┐
       │       │
    ┌──▼──┐ ┌─▼──┐
    │Agent│ │Tool│ ← AI agents & tools
    └──┬──┘ └─┬──┘
       │      │
       └──┬───┘
          │
   ┌──────▼──────┐
   │Send Response│ ← Returns to webhook
   └─────────────┘
```

---

## Execution Testing

### Test 1: Basic Email Retrieval
```javascript
{
  "message": "Show me my unread emails",
  "sessionId": "test-1",
  "userId": "tester"
}
```
**Expected**: List of unread emails with subjects and senders

### Test 2: AI Classification
```javascript
{
  "message": "Categorize my latest emails",
  "sessionId": "test-2",
  "userId": "tester"
}
```
**Expected**: Emails categorized as Business/Personal/Spam/Action

### Test 3: Email Management
```javascript
{
  "message": "Move spam emails to junk",
  "sessionId": "test-3",
  "userId": "tester"
}
```
**Expected**: Confirmation of moved emails

---

## Troubleshooting Quick Links

| Problem | Check | Solution |
|---------|-------|----------|
| "Workflow not found" | Workflow ID | Use: `Zp2BYxCXj9FeCZfi` |
| "Auth failed" | API Key | Regenerate in Settings → API |
| "Outlook error" | Client credentials | Update in Azure AD |
| "OpenAI error" | API Key/Credits | Verify at platform.openai.com |
| "Timeout" | Network | Check connectivity to localhost:5678 |

---

## Production Deployment

### Before Going Live

- [ ] Test all three test cases above
- [ ] Verify email operations work
- [ ] Check AI responses are coherent
- [ ] Monitor execution times (should be <30s)
- [ ] Review error logs
- [ ] Set up monitoring/alerts

### Production Settings

```env
N8N_API_URL=https://n8n.your-domain.com/api/v1
N8N_API_KEY=prod_key_with_limited_scope
DEBUG=false
MEM_GUARD_THRESHOLD_MB=1024
```

### Performance Tuning

- Increase batch size for large volumes
- Use gpt-3.5-turbo for faster responses
- Enable caching for repetitive queries
- Monitor PostgreSQL vector store

---

## Support & Documentation

- **Full Integration Guide**: `INTEGRATION_CONFIGURATION_GUIDE.md`
- **Workflow Restoration Report**: `WORKFLOW_RESTORATION_REPORT.md`
- **n8n API Docs**: https://docs.n8n.io/api/
- **OpenAI API Docs**: https://platform.openai.com/docs/
- **LangChain JS**: https://js.langchain.com/

---

**Estimated Total Setup Time**: 25 minutes
**Workflow ID**: `Zp2BYxCXj9FeCZfi`
**Status**: Ready for Configuration
