const fs = require('fs');

let content = fs.readFileSync('src/components/AITutor.tsx', 'utf8');

const regex = /3\. AVOID MARKDOWN TABLES \(CRITICAL\)[\s\S]*?Visual: A giant happy smiley face balloon floating up\./;

const replacement = `3. STRUCTURAL DATA (TABLES): When presenting structured data (like the periodic table, comparisons, or database schema), use HTML standard <table> tags (<table>, <tr>, <th>, <td>). 
   - The frontend renderer natively supports HTML tables with clean borders and paddings.
   - You may also use standard Markdown tables (e.g., | Header |). Both will render correctly as real database tables.`;

content = content.replace(regex, replacement);

fs.writeFileSync('src/components/AITutor.tsx', content, 'utf8');
