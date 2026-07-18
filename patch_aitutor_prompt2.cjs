const fs = require('fs');

let content = fs.readFileSync('src/components/AITutor.tsx', 'utf8');

const regex = /3\. STRUCTURAL DATA \(TABLES\)[\s\S]*?Both will render correctly as real database tables\./;

const replacement = `3. STRUCTURAL DATA (TABLES): Whenever you need to present comparison data, structural guides, or tabular lists (like the periodic table mnemonic), you MUST output it using standard HTML table tags. Do NOT use markdown pipes (|).
   - Format the table with clean inline styles. Use a light background for headers, clear text alignment, and thin borders.
   - Example Structure:
     <table style="width:100%; border-collapse: collapse;">
       <tr style="background-color: #f2f2f2;">
         <th style="border: 1px solid #dddddd; padding: 8px;">Element</th>
         <th style="border: 1px solid #dddddd; padding: 8px;">Symbol</th>
       </tr>
       <tr>
         <td style="border: 1px solid #dddddd; padding: 8px;">1. Hydrogen</td>
         <td style="border: 1px solid #dddddd; padding: 8px;">H</td>
       </tr>
     </table>`;

content = content.replace(regex, replacement);

fs.writeFileSync('src/components/AITutor.tsx', content, 'utf8');
