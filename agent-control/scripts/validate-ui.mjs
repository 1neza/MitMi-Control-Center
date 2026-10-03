import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const htmlPath=path.join(root,'agent-control','site','index.html');
const jsPath=path.join(root,'agent-control','site','app.js');
const html=fs.readFileSync(htmlPath,'utf8');
const js=fs.readFileSync(jsPath,'utf8');

const errors=[];
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));

for(const match of html.matchAll(/href="#([^"]+)"/g)){
  if(!ids.has(match[1]))errors.push('Broken internal link target: #'+match[1]);
}

if(/href="#"/.test(html))errors.push('Found placeholder href="#"');
if(/javascript:/i.test(html))errors.push('Found javascript: URL');

for(const match of js.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)){
  if(!ids.has(match[1]))errors.push('JavaScript references missing element #'+match[1]);
}

const required=[
  'refreshBtn','copySummaryBtn','mobileMenuBtn','sidebarCloseBtn',
  'agentFilters','agentGrid','commandTarget','commandText','commandLink',
  'copyCommandBtn','agentDrawer','drawerCloseBtn','drawerBackdrop'
];
for(const id of required){
  if(!ids.has(id))errors.push('Missing required interactive control #'+id);
}

const externalLinks=[...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match=>match[1]).filter(href=>!href.startsWith('#'));
for(const href of externalLinks){
  if(!/^https:\/\//.test(href))errors.push('Unexpected non-HTTPS external link: '+href);
}

if(errors.length){
  console.error('UI validation failed:');
  errors.forEach(error=>console.error(' - '+error));
  process.exit(1);
}

console.log('UI validation passed:',ids.size,'IDs,',externalLinks.length,'external links, no broken internal anchors.');
