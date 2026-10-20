import {cp,mkdir,rm,writeFile} from 'node:fs/promises';
// Explicit allowlist: SQL, backup JSON, docs, and secrets never enter Pages output.
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const file of ['index.html','config.js','assets'])await cp(file,`dist/${file}`,{recursive:true});
await writeFile('dist/.nojekyll','');
console.log('Static site prepared in dist/');
