const fs = require('fs');
const pdf = require('pdf-parse');

async function test() {
  try {
    const dataBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\n"); // dummy pdf
    const data = await pdf(dataBuffer);
    console.log("Success:", data.text);
  } catch (e) {
    console.log("Error:", e.message);
  }
}
test();
