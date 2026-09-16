import fs from 'node:fs';

const desktop=fs.readFileSync('modules/desktop-performance-v10_10_9.js','utf8');
const globalPerf=fs.readFileSync('modules/global-performance-v10_10_9.js','utf8');

const forbidden=[
  /\.collection\s*\(/,
  /cloudWrite\s*\(/,
  /\.set\s*\(/,
  /\.update\s*\(/,
  /\.delete\s*\(/,
  /setInterval\s*\(/
];

for(const pattern of forbidden){
  if(pattern.test(desktop)||pattern.test(globalPerf)){
    console.error('FAIL: runtime hygiene introduziu acesso a dados, write ou polling:',pattern);
    process.exit(1);
  }
}

console.log('OK runtime hygiene smoke');
