const http = require('http');
const fs = require('fs');
const API_KEY = process.env.N8N_API_KEY;

function get(id) {
  return new Promise((resolve) => {
    http.request({
      hostname: 'localhost',
      port: 5678,
      path: '/api/v1/workflows/' + id,
      headers: { 'X-N8N-API-KEY': API_KEY }
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => resolve(JSON.parse(body)));
    }).end();
  });
}

(async () => {
  const broken = await get('Baf9nylVDD1pzj9Q');
  const working = await get('A9h8Zsm6kYpsmilu');

  fs.writeFileSync('after-fix-broken.json', JSON.stringify(broken, null, 2));
  fs.writeFileSync('after-fix-working.json', JSON.stringify(working, null, 2));

  console.log('=== AFTER FIX - BROKEN WORKFLOW ===');
  console.log('First node fields:', Object.keys(broken.nodes[0]).sort());
  console.log('Has credentials:', 'credentials' in broken.nodes[0]);
  console.log('Has webhookId:', 'webhookId' in broken.nodes[0]);
  console.log('');

  console.log('=== WORKING WORKFLOW (REFERENCE) ===');
  console.log('First node fields:', Object.keys(working.nodes[0]).sort());
  console.log('Has credentials:', 'credentials' in working.nodes[0]);
  console.log('Has webhookId:', 'webhookId' in working.nodes[0]);
  console.log('');

  console.log('=== TOP-LEVEL COMPARISON ===');
  const brokenKeys = Object.keys(broken).sort();
  const workingKeys = Object.keys(working).sort();

  console.log('Broken workflow fields:', brokenKeys);
  console.log('Working workflow fields:', workingKeys);

  const onlyInBroken = brokenKeys.filter(k => !workingKeys.includes(k));
  const onlyInWorking = workingKeys.filter(k => !brokenKeys.includes(k));

  if (onlyInBroken.length) console.log('\nONLY in broken:', onlyInBroken);
  if (onlyInWorking.length) console.log('ONLY in working:', onlyInWorking);

  // Check all nodes for any remaining bad fields
  console.log('\n=== ALL NODES CHECK ===');
  broken.nodes.forEach((node, i) => {
    const hasCreds = 'credentials' in node;
    const hasWebhook = 'webhookId' in node;
    if (hasCreds || hasWebhook) {
      console.log(`Node ${i+1} "${node.name}":`);
      if (hasCreds) console.log('  ❌ STILL HAS credentials');
      if (hasWebhook) console.log('  ❌ STILL HAS webhookId');
    }
  });

  console.log('\nFiles saved: after-fix-broken.json, after-fix-working.json');
})();
