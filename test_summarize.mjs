import fs from 'fs';

async function test() {
  const formData = new FormData();
  const file = new Blob([fs.readFileSync('package.json')], { type: 'application/json' });
  formData.append('pdf', file, 'package.json');
  formData.append('action', 'flashcards');
  
  const res = await fetch('http://localhost:3000/api/summarize', {
    method: 'POST',
    body: formData
  });
  
  const json = await res.json();
  console.log("Response:", json.text.substring(0, 100));
}
test();
