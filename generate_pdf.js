import fs from 'fs';
import { jsPDF } from 'jspdf';
const doc = new jsPDF();
doc.text("Hello world!", 10, 10);
fs.writeFileSync('test.pdf', Buffer.from(doc.output('arraybuffer')));
