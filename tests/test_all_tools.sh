#\!/bin/bash
AUTH_TOKEN="test-browser-automation-token"
BASE_URL="http://localhost:3000/mcp"
PASSED=0
FAILED=0

test_tool() {
    local name=$1
    local args=$2
    local description=$3
    
    echo -n "Testing $name... "
    
    response=$(curl -s -H "Authorization: Bearer $AUTH_TOKEN" "$BASE_URL" \
        -X POST -H "Content-Type: application/json" \
        -d "{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/call\", \"params\": {\"name\": \"$name\", \"arguments\": $args}}")
    
    if echo "$response"  < /dev/null |  grep -q '"error"'; then
        echo "❌ FAIL - $(echo "$response" | grep -o '"message":"[^"]*"' | sed 's/"message":"//; s/"//')"
        ((FAILED++))
        return 1
    else
        echo "✅ PASS"
        ((PASSED++))
        return 0
    fi
}

# Documentation Tools
test_tool "get_workflow_guide" '{"scenario": "webhook_to_api"}' "Get workflow guidance"
test_tool "get_node_info" '{"nodeType": "nodes-base.webhook", "detail": "essentials"}' "Get node information"
test_tool "find_nodes" '{"query": "slack", "limit": 5}' "Find nodes by search"
test_tool "get_node_summary" '{"nodeType": "nodes-base.httpRequest"}' "Get node summary"
test_tool "check_compatibility" '{"sourceNode": "nodes-base.webhook", "targetNode": "nodes-base.slack"}' "Check node compatibility"
test_tool "validate_before_adding" '{"nodeType": "nodes-base.webhook", "workflowContext": {"existingNodes": [], "targetPosition": "start"}}' "Validate before adding"
test_tool "get_database_statistics" '{}' "Get database stats"
test_tool "get_node_config" '{"mode": "list_tasks"}' "Get node config help"
test_tool "validate_node" '{"nodeType": "nodes-base.webhook", "config": {"path": "test"}}' "Validate node config"
test_tool "find_templates" '{"mode": "keywords", "query": "slack", "limit": 3}' "Find workflow templates"
test_tool "get_template" '{"templateId": 1}' "Get specific template"
test_tool "validate_workflow" '{"workflow": {"nodes": [{"id": "webhook", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [100, 100], "parameters": {"path": "test"}}], "connections": {}}, "mode": "quick"}' "Validate workflow"
test_tool "list_nodes" '{"category": "trigger", "limit": 5}' "List all nodes"
test_tool "search_nodes" '{"query": "http", "limit": 5}' "Search node docs"
test_tool "get_node_essentials" '{"nodeType": "nodes-base.httpRequest"}' "Get node essentials"
test_tool "search_node_properties" '{"nodeType": "nodes-base.httpRequest", "query": "auth"}' "Search node properties"
test_tool "get_node_as_tool_info" '{"nodeType": "nodes-base.httpRequest"}' "Get AI tool info"
test_tool "get_node_for_task" '{"task": "post_json_request"}' "Get node for task"
test_tool "list_tasks" '{}' "List available tasks"
test_tool "validate_node_operation" '{"nodeType": "nodes-base.httpRequest", "config": {"url": "https://api.example.com"}}' "Validate node operation"
test_tool "validate_node_minimal" '{"nodeType": "nodes-base.httpRequest", "config": {"url": "https://api.example.com"}}' "Validate node minimal"
test_tool "validate_workflow_connections" '{"workflow": {"nodes": [{"id": "1", "name": "Test"}], "connections": {}}}' "Validate workflow connections"
test_tool "validate_workflow_expressions" '{"workflow": {"nodes": [{"id": "1", "parameters": {"value": "{{$json.test}}"}}], "connections": {}}}' "Validate workflow expressions"
test_tool "get_property_dependencies" '{"nodeType": "nodes-base.httpRequest"}' "Get property dependencies"
test_tool "list_ai_tools" '{"limit": 5}' "List AI tools"
test_tool "get_node_documentation" '{"nodeType": "nodes-base.httpRequest"}' "Get node documentation"
test_tool "list_node_templates" '{"nodeTypes": ["n8n-nodes-base.slack"], "limit": 3}' "List node templates"
test_tool "search_templates" '{"query": "automation", "limit": 3}' "Search templates"
test_tool "get_templates_for_task" '{"task": "slack_integration", "limit": 3}' "Get templates for task"

# n8n Management Tools (these may fail if n8n is not running)
echo -e "\n=== Testing n8n Management Tools (may fail if n8n not running) ==="
test_tool "n8n_system" '{"operation": "health"}' "n8n system health"
test_tool "n8n_list_workflows" '{"limit": 5}' "List n8n workflows"

# These require existing workflows/executions, so we expect them to potentially fail gracefully
echo -e "\n=== Testing tools requiring existing data (graceful failures expected) ==="
test_tool "n8n_get_workflow" '{"id": "nonexistent"}' "Get workflow by ID"
test_tool "n8n_get_execution" '{"id": "nonexistent"}' "Get execution by ID"
test_tool "n8n_list_executions" '{"limit": 5}' "List executions"
test_tool "n8n_validate_workflow" '{"id": "nonexistent"}' "Validate workflow from n8n"

# Skip destructive operations for safety
echo -e "\n=== Skipping destructive operations for safety ==="
echo "Skipped: n8n_create_workflow (would create real workflow)"
echo "Skipped: n8n_update_full_workflow (would modify real workflow)"  
echo "Skipped: n8n_update_partial_workflow (would modify real workflow)"
echo "Skipped: n8n_delete_workflow (would delete real workflow)"
echo "Skipped: n8n_delete_execution (would delete real execution)"
echo "Skipped: n8n_trigger_webhook_workflow (would trigger real workflow)"

echo -e "\n=== SUMMARY ==="
echo "✅ Passed: $PASSED"
echo "❌ Failed: $FAILED"
echo "⏭️  Skipped (destructive): 6"
echo "Total tested: $((PASSED + FAILED))"
echo "Total tools: 41"
