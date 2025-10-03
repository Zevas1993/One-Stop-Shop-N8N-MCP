#!/usr/bin/env node

/**
 * Generate a new n8n API key using login credentials
 */

const https = require('http');

const N8N_URL = process.env.N8N_API_URL || 'http://localhost:5678';
const USERNAME = process.env.N8N_USERNAME;
const PASSWORD = process.env.N8N_PASSWORD;

async function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function login() {
  console.log('🔐 Logging in to n8n...');

  const options = {
    hostname: 'localhost',
    port: 5678,
    path: '/rest/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  };

  const response = await makeRequest(options, {
    emailOrLdapLoginId: USERNAME,
    password: PASSWORD
  });

  if (response.status !== 200) {
    throw new Error(`Login failed: ${JSON.stringify(response.body)}`);
  }

  const cookies = response.headers['set-cookie'];
  console.log('✅ Login successful');

  return cookies;
}

async function createApiKey(cookies) {
  console.log('🔑 Creating API key...');

  const cookieHeader = cookies.join('; ');

  const options = {
    hostname: 'localhost',
    port: 5678,
    path: '/rest/api-keys',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieHeader
    }
  };

  // API key that never expires (null) or expires in 1 year
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  const response = await makeRequest(options, {
    label: 'MCP Server v3.0.0 - ' + new Date().toISOString(),
    scopes: ['workflow:read'],  // n8n only supports workflow:read scope
    expiresAt: oneYearFromNow.getTime()
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`API key creation failed: ${JSON.stringify(response.body)}`);
  }

  console.log('✅ API key created successfully');

  const apiKey = response.body.data?.rawApiKey;
  if (apiKey) {
    console.log('\n📋 API Key:', apiKey);
    console.log('\nℹ️  Scopes:', response.body.data.scopes.join(', '));
    console.log('ℹ️  Expires:', new Date(response.body.data.expiresAt).toLocaleString());
    console.log('\n✨ Add this to your .env file:');
    console.log(`N8N_API_KEY=${apiKey}`);
  } else {
    console.error('❌ Could not extract API key from response:', JSON.stringify(response.body, null, 2));
  }

  return apiKey;
}

async function main() {
  try {
    if (!USERNAME || !PASSWORD) {
      console.error('❌ Missing credentials. Set N8N_USERNAME and N8N_PASSWORD environment variables.');
      process.exit(1);
    }

    const cookies = await login();
    await createApiKey(cookies);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
