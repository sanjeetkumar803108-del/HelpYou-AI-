const fs = require('fs');
const pdf = require('pdf-parse');

async function test() {
  const dataBuffer = fs.readFileSync('test.pdf');
  try {
    const data = await pdf(dataBuffer);
    console.log("Extracted:", data.text);
  } catch (e) {
    console.error("Error:", e);
  }
}
test();
