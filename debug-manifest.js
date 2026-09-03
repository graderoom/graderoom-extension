const fs = require('fs');

const site = 'https://*.graderoom.me/*';
const local = ['http://localhost/*', 'http://127.0.0.1/*'];

function addLocalhost(node) {
    if (Array.isArray(node)) {
        if (node.includes(site)) {
            node.push(...local.filter(pattern => !node.includes(pattern)));
            return;
        }
        node.forEach(addLocalhost);
    } else if (node && typeof node === 'object') {
        Object.values(node).forEach(addLocalhost);
    }
}

const path = process.argv[2];
if (!path) {
    console.error('usage: node debug-manifest.js <manifest.json>');
    process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
addLocalhost(manifest);
manifest.name = 'Graderoom (Debug)';

fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Patched ${path} for localhost`);
