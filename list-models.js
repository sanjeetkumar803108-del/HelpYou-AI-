const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({});
async function main() {
  const response = await ai.models.list();
  for await (const model of response) {
    console.log(model.name);
  }
}
main();
