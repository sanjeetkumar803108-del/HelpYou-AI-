const fs = require('fs');
let content = fs.readFileSync('src/components/PocketTeacher.tsx', 'utf8');

content = content.replace(/      \) : \(\n      <div className="mb-6">/, `      ) : (\n      <>\n      <div className="mb-6">`);
content = content.replace(/      <\/div>\n      \)\}\n    <\/div>/, `      </div>\n      </>\n      )}\n    </div>`);

fs.writeFileSync('src/components/PocketTeacher.tsx', content);
