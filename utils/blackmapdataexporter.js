require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

console.log('This script create sqlite db based on data from belarusian black map.');

const Geohash = require('../libs/geohash');
const blackmapdata = require('../blackmap/blackmapdata.json');
const blackmapgeo = require('../blackmap/blackmapgeo.json');

if (!blackmapdata || !blackmapgeo) {
  console.error('Exporter not found data for export. Nothing to do...');
  process.exit(1);
}

const CATEGORY = "4";
const DB_PATH = `../db/${process.env.SQLITEDB}`;
const JSON_PATH = '../blackmap/blackmapexport.json';

const exportData = {};

console.log('Start export data');
blackmapgeo.forEach((item) => {
  const { id, lat, lng, name, address, maps } = item;
  if (maps.indexOf(CATEGORY) >= 0) {
    const geohash = Geohash.encode(lat, lng, 6);
    exportData[id] = {
      blackmapId: id,
      lat,
      lng,
      fullname: name.trim(),
      address: address.trim(),
      geohash,
      geohashParent: geohash.slice(0, -1),
    };
  }
});

console.log('Push popups data to persons');
blackmapdata.forEach((item) => {
  const { id, popup } = item;
  if (exportData[id]) {
    const address = popup.match(/(?<=p><b>Адрес:<\/b>)(.*?)(?=<br \/>)/igm) || null;
    const phone = popup.match(/(?<=p><b>Адрес:<\/b>.*?<br \/><b>Номер телефона:<\/b>)(.*?)(?=<\/p>)/igm) || null;
    const denunciation = popup.match(/(?<=p><b>Донос:<\/b><i>)(.*?)(?=<\/i><br \/>)/igm) || null;
    const denunciationDate = popup.match(/(?<=<b>Дата доноса:<\/b>)(.*?)(?=<br \/>)/igm) || null;
    const denunciationAttendant = popup.match(/(?<=<b>Дежурный:<\/b>)(.*?)(?=<br \/>)/igm) || null;
    const denunciationLocation = popup.match(/(?<=<b>Локация инцидента:<\/b>)(.*?)(?=<\/p>)/igm) || null;
    const data = {
      address: address && address[0] ? address[0].trim() : exportData[id].address,
      phone: phone && phone[0] ? phone[0].trim() : '',
      denunciation: denunciation && denunciation[0] ? denunciation[0].trim() : '',
      denunciationDate: denunciationDate && denunciationDate[0] ? denunciationDate[0].trim() : '',
      denunciationLocation: denunciationLocation && denunciationLocation[0] ? denunciationLocation[0].trim() : '',
      denunciationAttendant: denunciationAttendant && denunciationAttendant[0] ? denunciationAttendant[0].trim() : '',
    };
    for (let key in data) {
      data[key] = data[key] && data[key].length > 0
        ? data[key].replace(/<\/?[^>]+>/gi, '')
        : data[key];
    }
    if (data.denunciation && data.denunciation.length > 0 || data.denunciationDate && data.denunciationDate.length > 0) {
      exportData[id] = {
        ...exportData[id],
        ...data,
      };
    }
  }
});

console.log('Preparing to importing data');
try {
  console.log('Remove old data');
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }
  if (fs.existsSync(`${DB_PATH}-journal`)) {
    fs.unlinkSync(`${DB_PATH}-journal`);
  }
  if (fs.existsSync(JSON_PATH)) {
    fs.unlinkSync(JSON_PATH);
  }
} catch (e) {
  console.error('Problem with delete old files');
  console.error(e.message);
  process.exit(1);
}
console.log('Old Sqlite3 DB files and json file is removed');

console.log(`Export to the file ${JSON_PATH}`);
const data = JSON.stringify(Object.values(exportData));
fs.writeFileSync(JSON_PATH, data);

console.log('Start create new DB');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error(`DB error: ${err.message}`);
  }
});
db.serialize(() => {
  console.log('Create denunciations table');
  db.run(`
    CREATE TABLE denunciations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blackmapId TEXT,
      lat TEXT,
      lng TEXT,
      geohash TEXT,
      geohashParent TEXT,
      fullname TEXT,
      address TEXT,
      phone TEXT,
      denunciation TEXT,
      denunciationDate TEXT,
      denunciationLocation TEXT,
      denunciationAttendant TEXT
    );
  `);
  console.log('Create idx_geohash_parents index for denunciations table');
  db.run(`CREATE INDEX idx_geohash_parents ON denunciations (geohashParent);`);
  console.log('Create idx_geohashes index for denunciations table');
  db.run(`CREATE INDEX idx_geohashes ON denunciations (geohash);`);
  console.log('Start import data to denunciations table');
  let importer = db.prepare(`
    INSERT INTO denunciations (
      blackmapId,
      lat,
      lng,
      geohash,
      geohashParent,
      fullname,
      address,
      phone,
      denunciation,
      denunciationDate,
      denunciationLocation,
      denunciationAttendant
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?);
  `);
  Object.values(exportData).forEach((item) => {
    const {
      blackmapId,
      lat,
      lng,
      geohash,
      geohashParent,
      fullname,
      address,
      phone,
      denunciation,
      denunciationDate,
      denunciationLocation,
      denunciationAttendant
    } = item;
    importer.run(
      blackmapId,
      lat,
      lng,
      geohash,
      geohashParent,
      fullname,
      address,
      phone,
      denunciation,
      denunciationDate,
      denunciationLocation,
      denunciationAttendant
    );
  });
  importer.finalize();
  console.log('Create geocodes table');
  db.run(`
    CREATE TABLE IF NOT EXISTS geocodes (
      normAddress TEXT,
      formattedAddress TEXT,
      lat TEXT,
      lng TEXT
    );
  `);
  console.log('Create idx_geocodes index');
  db.run(`CREATE UNIQUE INDEX idx_geocodes ON geocodes (normAddress);`);
});

// close the database connection
db.close((err) => {
  if (err) {
    console.error(`DB close error: ${err.message}`);
  }
  console.log('New Sqlite DB is ready to use!');
  process.exit();
});