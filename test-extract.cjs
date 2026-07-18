const fs = require('fs');
fetch('http://localhost:3000/api/extract-file-text', {
  method: 'POST',
  body: (() => {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', Buffer.from('hello world test test'), 'test.txt');
    return form;
  })()
}).then(async r => {
  console.log(r.status);
  console.log(await r.text());
}).catch(console.error);
