#\!/bin/bash
AUTH_TOKEN="test-browser-automation-token"
BASE_URL="http://localhost:3000/mcp"
PASSED=0
FAILED=0

test_tool() {
    local name=$1
    local args=$2
    
    echo -n "Testing $name... "
    
    response=$(curl -s -H "Authorization: Bearer $AUTH_TOKEN" "$BASE_URL" \
        -X POST -H "Content-Type: application/json" \
        -d "{\"jsonrpc\": \"2.0\", \"id\": 1, \"method\": \"tools/call\", \"params\": {\"name\": \"$name\", \"arguments\": $args}}")
    
    if echo "$response"  < /dev/null |  grep -q '"error"'; then
        echo "❌ FAIL"
        ((FAILED++))
    else
        echo "✅ PASS"
        ((PASSED++))
    fi
}

# Test all working tools
test_tool "get_workflow_guide" '{"scenario": "webhook_to_api"}'
test_tool "get_node_info" '{"nodeType": "nodes-base.webhook", "detail": "essentials"}'
test_tool "find_nodes" '{"query": "slack", "limit": 5}'
test_tool "get_node_summary" '{"nodeType": "nodes-base.httpRequest"}'
test_tool "check_compatibility" '{"sourceNode": "nodes-base.webhook", "targetNode": "nodes-base.slack"}'
test_tool "validate_before_adding" '{"nodeType": "nodes-base.webhook", "workflowContext": {"existingNodes": [], "targetPosition": "start"}}'
test_tool "get_database_statistics" '{}'
test_tool "get_node_config" '{"mode": "list_tasks"}'
test_tool "validate_node" '{"nodeType": "nodes-base.webhook", "config": {"path": "test"}}'
test_tool "get_template" '{"templateId": 1}'
test_tool "validate_workflow" '{"workflow": {"nodes": [{"id": "webhook", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [100, 100], "parameters": {"path": "test"}}], "connections": {}}, "mode": "quick"}'
test_tool "list_nodes" '{"category": "trigger", "limit": 5}'
test_tool "search_nodes" '{"query": "http", "limit": 5}'
test_tool "get_node_essentials" '{"nodeType": "nodes-base.httpRequest"}'
test_tool "search_node_properties" '{"nodeType": "nodes-base.httpRequest", "query": "auth"}'
test_tool "get_node_as_tool_info" '{"nodeType": "nodes-base.httpRequest"}'
test_tool "get_node_for_task" '{"task": "post_json_request"}'
test_tool "list_tasks" '{}'
test_tool "validate_node_operation" '{"nodeType": "nodes-base.httpRequest", "config": {"url": "https://api.example.com"}}'
test_tool "validate_node_minimal" '{"nodeType": "nodes-base.httpRequest", "config": {"url": "https://api.example.com"}}'
test_tool "validate_workflow_connections" '{"workflow": {"nodes": [{"id": "1", "name": "Test"}], "connections": {}}}'
test_tool "validate_workflow_expressions" '{"workflow": {"nodes": [{"id": "1", "parameters": {"value": "{{$json.test}}"}}], "connections": {}}}'
test_tool "get_property_dependencies" '{"nodeType": "nodes-base.httpRequest"}'
test_tool "list_ai_tools" '{"limit": 5}'
test_tool "get_node_documentation" '{"nodeType": "nodes-base.httpRequest"}'
test_tool "list_node_templates" '{"nodeTypes": ["n8n-nodes-base.slack"], "limit": 3}'
test_tool "get_templates_for_task" '{"task": "slack_integration", "limit": 3}'
test_tool "n8n_system" '{"operation": "health"}'
test_tool "n8n_list_workflows" '{"limit": 5}'
test_tool "n8n_get_workflow" '{"id": "nonexistent"}'
test_tool "n8n_get_execution" '{"id": "nonexistent"}'
test_tool "n8n_list_executions" '{"limit": 5}'
test_tool "n8n_validate_workflow" '{"workflowId": "nonexistent"}'

echo -e "\n=== FINAL SUMMARY ==="
echo "✅ Passed: $PASSED"
echo "❌ Failed: $FAILED"
echo "Success Rate: $(( PASSED * 100 / (PASSED + FAILED) ))%"
