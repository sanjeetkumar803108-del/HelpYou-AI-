const fs = require('fs');
let content = fs.readFileSync('src/components/NoteMaker.tsx', 'utf8');

content = content.replace(
  '} catch {\\n               else {\\n                setResult(`Error: Server returned status ${xhr.status}`);\\n              }\\n              }\\n            }',
  '} catch {\\n              setResult(`Error: Server returned status ${xhr.status}`);\\n            }'
);

content = content.replace(
  '} catch {\\n               else {\\n                setResult(`Error: Server returned status ${xhr.status}`);\\n              }\\\\n              }\\n            }',
  '} catch {\\n              setResult(`Error: Server returned status ${xhr.status}`);\\n            }'
);

fs.writeFileSync('src/components/NoteMaker.tsx', content);
