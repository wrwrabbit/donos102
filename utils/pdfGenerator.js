require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const pdf = require('html-pdf');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

console.log('This script generate pdf by sqlite db information.');

const SUFFIX = process.argv[2] ? process.argv[2] : null;
console.log(SUFFIX ? `Working with suffix ${SUFFIX}` : 'Working without suffix');
const DB_PATH = `../db/${process.env.SQLITEDB}`;
const HTML_TEMPLATE = fs.readFileSync('../template/donos.html', 'utf8');
const PDF_OPTIONS = {
  format: 'A4',
  orientation: 'portrait',
};

console.log('Try to open DB');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error(`DB error: ${err.message}`);
  }
});

let data = [];

db.all('SELECT blackmapId, fullname, address, phone, denunciation, denunciationDate, denunciationLocation' +
  ' FROM denunciations', [], (err, data) => {
  if (!data) {
    console.error('DB is empty');
    process.exit(1);
  }
  // noinspection JSIgnoredPromiseFromCall
  generator(data);
});

db.close();

const generator = async (data = []) => {
  let count = 0;
  for (let {
    blackmapId = '0',
    fullname = '',
    address = '',
    phone = '',
    denunciation,
    denunciationDate,
    denunciationLocation = ''
  } of data) {
    if (SUFFIX !== null && SUFFIX !== blackmapId.substr(blackmapId.length - 1)) {
      continue;
    }
    if (!denunciation || !denunciationDate) {
      continue;
    }
    let pdfExits = false;
    try {
      pdfExits = fs.existsSync(pdfPath);
    } catch (e) {}
    if (pdfExits) {
      continue;
    }
    await new Promise(resolve => {
      let templateHtml = HTML_TEMPLATE;
      templateHtml = templateHtml.replace('{{fullname}}', fullname ? fullname : '');
      templateHtml = templateHtml.replace('{{address}}', address ? address : '');
      templateHtml = templateHtml.replace('{{phone}}', phone ? phone : '');
      templateHtml = templateHtml.replace('{{denunciation}}', denunciation);
      templateHtml = templateHtml.replace('{{denunciationDate}}', denunciationDate);
      templateHtml = templateHtml.replace(
        '{{denunciationLocation}}',
        denunciationLocation ? `по адресу: ${denunciationLocation} ` : ''
      );
      pdf.create(templateHtml, PDF_OPTIONS).toFile(`../pdf/${blackmapId}.pdf`, function(err, res) {
        count++;
        if (err) {
          console.error(`File #${count} generation error: ${err.toString()}`);
          return;
        }
        // console.log(`File #${count} generated by path ${res.filename}`);
        resolve();
      });
    });
  }
  console.log(`Finish work`);
};