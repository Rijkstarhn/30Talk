import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const source = path.join(root, 'content');
const dest = path.join(root, 'public', 'content');
fs.rmSync(dest, {recursive:true,force:true});
fs.mkdirSync(dest, {recursive:true});
const items = [];
if (fs.existsSync(source)) {
  for (const entry of fs.readdirSync(source,{withFileTypes:true})) {
    if (!entry.isDirectory() || !/^[\w-]{3,80}$/.test(entry.name)) continue;
    const dir = path.join(source,entry.name);
    const metadataFile = path.join(dir,'metadata.json');
    if (!fs.existsSync(metadataFile)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metadataFile,'utf8'));
      if (meta.platform !== 'youtube' || !/^[\w-]{11}$/.test(meta.id) || meta.id !== entry.name) continue;
      const target = path.join(dest,entry.name);
      fs.mkdirSync(target,{recursive:true});
      for (const filename of ['en.vtt','zh.vtt']) {
        if (fs.existsSync(path.join(dir,filename))) fs.copyFileSync(path.join(dir,filename),path.join(target,filename));
      }
      items.push({id:meta.id,platform:'youtube',url:`https://www.youtube.com/watch?v=${meta.id}`,title:meta.title || `访谈 ${meta.id}`,description:meta.description || '',language:meta.language || 'en',ready:fs.existsSync(path.join(target,'zh.vtt')),hasOriginal:fs.existsSync(path.join(target,'en.vtt'))});
    } catch (e) {console.warn(`Skipping ${entry.name}: ${e.message}`)}
  }
}
fs.writeFileSync(path.join(root,'public','catalog.json'),JSON.stringify(items,null,2));
console.log(`Prepared ${items.length} interviews`);
