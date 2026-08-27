const https = require('https');

async function testLiveServer() {
  const postData = JSON.stringify({
    query: "Jeju Island missing case",
    gradeLevel: "Competitive Exams",
    subject: "Current Affairs"
  });

  const options = {
    hostname: 'helpyou-ai-production.up.railway.app',
    port: 443,
    path: '/api/live-study-tutor',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('STATUS:', res.statusCode);
      try {
        const json = JSON.parse(body);
        console.log('TOPIC TITLE:', json.topic_title);
        console.log('UPDATES SAMPLE:');
        if (Array.isArray(json.live_updates)) {
          json.live_updates.forEach((u, i) => console.log(`\n--- Section ${i+1} ---\n${u}`));
        } else {
          console.log(json.live_updates);
        }
      } catch (e) {
        console.log('RAW BODY:', body.substring(0, 400));
      }
    });
  });

  req.on('error', (e) => {
    console.error('Request error:', e);
  });

  req.write(postData);
  req.end();
}

testLiveServer();
