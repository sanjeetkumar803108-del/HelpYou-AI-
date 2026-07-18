import fs from 'fs';

async function test() {
  const formData = new FormData();
  formData.append('action', 'debug');
  const file = new Blob([fs.readFileSync('package.json')], { type: 'application/json' });
  formData.append('pdf', file, 'package.json');
  
  const res = await fetch('http://localhost:3000/api/summarize', {
    method: 'POST',
    body: formData
  });
  
  const json = await res.json();
  console.log("Response:", JSON.stringify(json));
}
test();
