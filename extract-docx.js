const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const files = [
    'Politique RGPD.docx',
    'Mentions légales.docx',
    'Politique de confidentialité.docx',
    'Conditions Générales de Vente.docx',
    'Politique en matière de cookies.docx'
];

async function extractDocx(filename) {
    try {
        const result = await mammoth.extractRawText({ path: filename });
        const outputFile = filename.replace('.docx', '.txt');
        fs.writeFileSync(outputFile, result.value);
        console.log(`✓ ${filename} → ${outputFile}`);
    } catch (error) {
        console.error(`✗ ${filename}: ${error.message}`);
    }
}

async function main() {
    console.log('Extraction des fichiers .docx...\n');
    for (const file of files) {
        await extractDocx(file);
    }
    console.log('\nTerminé !');
}

main();
